// Initialize Supabase Client
function assertSupabaseConfig() {
    if (!window.CONFIG || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
        throw new Error("ยังไม่ได้ตั้งค่า Supabase ในไฟล์ config.js");
    }

    if (CONFIG.SUPABASE_URL.includes("YOUR_") || CONFIG.SUPABASE_ANON_KEY.includes("YOUR_")) {
        throw new Error("กรุณาใส่ SUPABASE_URL และ SUPABASE_ANON_KEY จริงในไฟล์ config.js");
    }
}

assertSupabaseConfig();
const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseKey = CONFIG.SUPABASE_ANON_KEY;
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

function normalizeStaffId(value) {
    return String(value || '').trim();
}

function normalizePin(value) {
    return String(value || '').trim();
}

function getRpcErrorMessage(error) {
    if (!error) return '';
    const message = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    if (/Could not find the function|schema cache|PGRST202/i.test(message)) {
        return "ยังไม่ได้ติดตั้ง Supabase RPC production schema กรุณารัน database_setup.sql ใน Supabase SQL Editor";
    }
    if (/row-level security|permission denied|permission/i.test(message)) {
        return "สิทธิ์ Supabase ไม่ถูกต้อง กรุณาตรวจ RLS/Policy/Grant ตาม database_setup.sql";
    }
    return error.message || "Unknown Supabase error";
}

function requireSessionToken() {
    const token = sessionStorage.getItem('sessionToken');
    if (!token) {
        throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }
    return token;
}

function createSignatureFileName() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    return `${yyyy}/${mm}/${dd}/${randomId}.png`;
}

window.API = {
    // 1. Authenticate Staff via Supabase RPC. Tables are not exposed to the browser.
    async login(staffId, pin) {
        const cleanStaffId = normalizeStaffId(staffId);
        const cleanPin = normalizePin(pin);

        if (!cleanStaffId || !cleanPin) {
            throw new Error("กรุณากรอกรหัสเจ้าหน้าที่และ PIN");
        }

        const { data, error } = await supabaseClient.rpc('login_staff', {
            p_staff_id: cleanStaffId,
            p_pin: cleanPin
        });

        if (error) {
            throw new Error(getRpcErrorMessage(error));
        }

        if (!data || !data.ok) {
            throw new Error(data?.message || "รหัสเจ้าหน้าที่หรือ PIN ไม่ถูกต้อง");
        }

        return data;
    },

    // 2. Check for duplicates (same HN within 24 hours)
    async checkDuplicate(hn) {
        const hnRegex = /^07-[0-9]{2}-[0-9]{6}$/;
        if (!hnRegex.test(hn)) {
            throw new Error("รูปแบบ HN ไม่ถูกต้อง (ต้องเป็น 07-XX-XXXXXX)");
        }

        const { data, error } = await supabaseClient.rpc('check_duplicate', {
            p_session_token: requireSessionToken(),
            p_hn: hn
        });

        if (error) {
            throw new Error(getRpcErrorMessage(error));
        }

        return data || { ok: true, code: "SUCCESS" };
    },

    // 3. Submit Signature (Upload to Storage, Insert through RPC, Notify GAS)
    async submitSignature(payload, session) {
        try {
            if (!session?.sessionToken) {
                throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
            }

            const base64Data = payload.signatureBase64.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            const fileName = createSignatureFileName();
            const { error: uploadError } = await supabaseClient.storage
                .from('signatures')
                .upload(fileName, blob, {
                    contentType: 'image/png',
                    cacheControl: '31536000',
                    upsert: false
                });

            if (uploadError) {
                throw new Error("อัปโหลดรูปลายเซ็นไม่สำเร็จ: " + uploadError.message);
            }

            const { data: publicUrlData } = supabaseClient.storage
                .from('signatures')
                .getPublicUrl(fileName);
            const signatureUrl = publicUrlData.publicUrl;

            const { data, error } = await supabaseClient.rpc('submit_transaction', {
                p_session_token: session.sessionToken,
                p_hn: payload.hn,
                p_receiver_type: payload.receiverType,
                p_signature_url: signatureUrl,
                p_device_id: payload.deviceId || 'v2-web',
                p_is_duplicate_confirmed: Boolean(payload.isDuplicateConfirmed)
            });

            if (error) {
                throw new Error(getRpcErrorMessage(error));
            }
            if (!data || !data.ok) {
                throw new Error(data?.message || "บันทึกข้อมูลไม่สำเร็จ");
            }

            const result = data.data;

            if (CONFIG.GAS_WEB_APP_URL && CONFIG.GAS_WEB_APP_URL !== "YOUR_V2_GAS_WEB_APP_URL_HERE") {
                fetch(CONFIG.GAS_WEB_APP_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'syncToSheets',
                        payload: {
                            recordId: result.recordId,
                            hn: payload.hn,
                            staffId: result.staffId,
                            staffName: result.staffName,
                            receiverType: payload.receiverType,
                            signatureUrl: signatureUrl,
                            serviceDate: result.serviceDate
                        }
                    })
                }).catch(e => console.error("GAS Sync Error:", e));
            }

            return {
                ok: true,
                message: "บันทึกข้อมูลเรียบร้อยแล้ว",
                data: {
                    recordId: result.recordId,
                    serverTime: result.serverTime
                }
            };

        } catch (err) {
            return { ok: false, message: err.message };
        }
    }
};
