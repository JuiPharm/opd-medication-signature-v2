// Initialize Supabase Client
const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseKey = CONFIG.SUPABASE_ANON_KEY;
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const API = {
    // 1. Authenticate Staff
    async login(staffId, pin) {
        const { data, error } = await supabase
            .from('staff_users')
            .select('*')
            .eq('staff_id', staffId)
            .eq('pin', pin)
            .single();
            
        if (error || !data) {
            throw new Error("รหัสเจ้าหน้าที่หรือ PIN ไม่ถูกต้อง");
        }
        
        return {
            ok: true,
            data: {
                staffId: data.staff_id,
                staffName: data.name,
                role: data.role,
                sessionToken: "local-session-" + data.id // Simplified session for v2
            }
        };
    },

    // 2. Check for Duplicates (same HN within 24 hours)
    async checkDuplicate(hn) {
        const hnRegex = /^07-[0-9]{2}-[0-9]{6}$/;
        if (!hnRegex.test(hn)) {
            throw new Error("รูปแบบ HN ไม่ถูกต้อง (ต้องเป็น 07-XX-XXXXXX)");
        }

        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        const { data, error } = await supabase
            .from('transactions')
            .select('id, created_at, staff_name')
            .eq('hn', hn)
            .gte('created_at', yesterday.toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error("เกิดข้อผิดพลาดในการตรวจสอบข้อมูลซ้ำ");
        }

        if (data && data.length > 0) {
            return {
                ok: true,
                code: "DUPLICATE_FOUND",
                message: "พบรายการรับยาซ้ำ",
                data: {
                    recordId: data[0].id,
                    submittedAt: data[0].created_at,
                    staffName: data[0].staff_name
                }
            };
        }

        return { ok: true, code: "SUCCESS" };
    },

    // 3. Submit Signature (Upload to Storage, Insert to DB, Notify GAS)
    async submitSignature(payload, session) {
        try {
            // 1. Convert Base64 to Blob
            const base64Data = payload.signatureBase64.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            // 2. Upload to Supabase Storage
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const fileName = `${yyyy}/${mm}/${dd}/${payload.hn}_${Date.now()}.png`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('signatures')
                .upload(fileName, blob, { contentType: 'image/png' });

            if (uploadError) throw new Error("อัปโหลดรูปลายเซ็นไม่สำเร็จ: " + uploadError.message);

            // Get Public URL
            const { data: publicUrlData } = supabase.storage
                .from('signatures')
                .getPublicUrl(fileName);
            const signatureUrl = publicUrlData.publicUrl;

            // 3. Insert Transaction into Supabase Database
            const serviceDate = `${yyyy}-${mm}-${dd}`;
            const { data: insertData, error: insertError } = await supabase
                .from('transactions')
                .insert([
                    {
                        hn: payload.hn,
                        staff_id: session.staffId,
                        staff_name: session.staffName,
                        receiver_type: payload.receiverType,
                        signature_url: signatureUrl,
                        service_date: serviceDate,
                        device_id: payload.deviceId || 'v2-web'
                    }
                ])
                .select();

            if (insertError) throw new Error("บันทึกข้อมูลไม่สำเร็จ: " + insertError.message);

            const recordId = insertData[0].id;

            // 4. (Async) Call GAS Webhook to sync to Google Sheets
            // We don't await this because we want to show success to the user immediately
            if (CONFIG.GAS_WEB_APP_URL && CONFIG.GAS_WEB_APP_URL !== "YOUR_V2_GAS_WEB_APP_URL_HERE") {
                fetch(CONFIG.GAS_WEB_APP_URL, {
                    method: 'POST',
                    mode: 'no-cors', // Used so we don't block on CORS issues, just fire and forget
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'syncToSheets',
                        payload: {
                            recordId: recordId,
                            hn: payload.hn,
                            staffId: session.staffId,
                            staffName: session.staffName,
                            receiverType: payload.receiverType,
                            signatureUrl: signatureUrl,
                            serviceDate: serviceDate
                        }
                    })
                }).catch(e => console.error("GAS Sync Error:", e));
            }

            return {
                ok: true,
                message: "บันทึกข้อมูลเรียบร้อยแล้ว",
                data: {
                    recordId: recordId,
                    serverTime: new Date().toISOString()
                }
            };

        } catch (err) {
            return { ok: false, message: err.message };
        }
    }
};
