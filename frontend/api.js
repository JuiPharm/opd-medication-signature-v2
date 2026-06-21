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
const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

function normalizeText(value) { return String(value || '').trim(); }
function normalizePin(value) { return String(value || '').trim(); }
function getRpcErrorMessage(error) {
    if (!error) return '';
    const message = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    if (/Could not find the function|schema cache|PGRST202/i.test(message)) {
        return "ยังไม่ได้ติดตั้ง Supabase RPC ล่าสุด กรุณารัน database_setup.sql ใน Supabase SQL Editor";
    }
    if (/row-level security|permission denied|permission/i.test(message)) {
        return "สิทธิ์ Supabase ไม่ถูกต้อง กรุณาตรวจ RLS/Policy/Grant ตาม database_setup.sql";
    }
    return error.message || "Unknown Supabase error";
}
function requireSessionToken() {
    const token = sessionStorage.getItem('sessionToken');
    if (!token) throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
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
async function uploadSignature(signatureBase64) {
    const base64Data = signatureBase64.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' });
    const fileName = createSignatureFileName();
    const { error: uploadError } = await supabaseClient.storage
        .from('signatures')
        .upload(fileName, blob, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
    if (uploadError) throw new Error("อัปโหลดรูปลายเซ็นไม่สำเร็จ: " + uploadError.message);
    const { data: publicUrlData } = supabaseClient.storage.from('signatures').getPublicUrl(fileName);
    return publicUrlData.publicUrl;
}
async function rpcJson(name, params) {
    const { data, error } = await supabaseClient.rpc(name, params);
    if (error) throw new Error(getRpcErrorMessage(error));
    return data;
}

window.API = {
    async login(staffId, pin, accountCode) {
        const cleanStaffId = normalizeText(staffId);
        const cleanPin = normalizePin(pin);
        const cleanAccount = normalizeText(accountCode);
        if (!cleanStaffId || !cleanPin) throw new Error("กรุณากรอกรหัสเจ้าหน้าที่และ PIN");
        const params = { p_staff_id: cleanStaffId, p_pin: cleanPin };
        if (cleanAccount) params.p_account_code = cleanAccount;
        const data = await rpcJson('login_staff', params);
        if (!data || !data.ok) throw new Error(data?.message || "รหัสเจ้าหน้าที่หรือ PIN ไม่ถูกต้อง");
        return data;
    },
    async checkDuplicate(hn) {
        const data = await rpcJson('check_duplicate', { p_session_token: requireSessionToken(), p_hn: hn });
        return data || { ok: true, code: "SUCCESS" };
    },
    async submitSignature(payload, session) {
        try {
            if (!session?.sessionToken) throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
            const signatureUrl = await uploadSignature(payload.signatureBase64);
            const data = await rpcJson('submit_transaction', {
                p_session_token: session.sessionToken,
                p_hn: payload.hn,
                p_receiver_type: payload.receiverType,
                p_signature_url: signatureUrl,
                p_device_id: payload.deviceId || 'v2-web',
                p_is_duplicate_confirmed: Boolean(payload.isDuplicateConfirmed)
            });
            if (!data || !data.ok) throw new Error(data?.message || "บันทึกข้อมูลไม่สำเร็จ");
            return { ok: true, message: "บันทึกข้อมูลเรียบร้อยแล้ว", data: { recordId: data.data.recordId, serverTime: data.data.serverTime } };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    },
    async getPendingSignatureRequest() {
        return await rpcJson('get_pending_signature_request', { p_session_token: requireSessionToken() });
    },
    async claimSignatureRequest(requestId) {
        return await rpcJson('claim_signature_request', { p_session_token: requireSessionToken(), p_request_id: requestId });
    },
    async completeSignatureRequest(payload, session) {
        try {
            if (!session?.sessionToken) throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
            const signatureUrl = await uploadSignature(payload.signatureBase64);
            const data = await rpcJson('complete_signature_request', {
                p_session_token: session.sessionToken,
                p_request_id: payload.requestId,
                p_signature_url: signatureUrl,
                p_device_id: payload.deviceId || 'v2-web'
            });
            if (!data || !data.ok) throw new Error(data?.message || "บันทึกข้อมูลไม่สำเร็จ");
            return { ok: true, message: "บันทึกข้อมูลเรียบร้อยแล้ว", data: { recordId: data.data.recordId, serverTime: data.data.serverTime } };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }
};
