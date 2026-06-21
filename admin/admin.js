function assertSupabaseConfig() {
    if (!window.CONFIG || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) throw new Error("ยังไม่ได้ตั้งค่า Supabase ในไฟล์ ../frontend/config.js");
}
assertSupabaseConfig();
const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
function normalizeText(value) { return String(value || '').trim(); }
function normalizePin(value) { return String(value || '').trim(); }
function getRpcErrorMessage(error) {
    if (!error) return '';
    const message = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    if (/Could not find the function|schema cache|PGRST202/i.test(message)) return "ยังไม่ได้ติดตั้ง Supabase RPC ล่าสุด กรุณารัน database_setup.sql ใน Supabase SQL Editor";
    if (/row-level security|permission denied|permission/i.test(message)) return "สิทธิ์ Supabase ไม่ถูกต้อง กรุณาตรวจ RLS/Policy/Grant ตาม database_setup.sql";
    return error.message || "Unknown Supabase error";
}
function textCell(value) { const td = document.createElement('td'); td.textContent = value ?? ''; return td; }

class AdminApp {
    constructor() { this.session = null; this.initElements(); this.bindEvents(); this.checkSession(); }
    initElements() {
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loginScreen = document.getElementById('login-screen');
        this.dashboardScreen = document.getElementById('dashboard-screen');
        this.loginForm = document.getElementById('login-form');
        this.loginError = document.getElementById('login-error');
        this.accountBadge = document.getElementById('account-badge');
        this.navTransactions = document.getElementById('nav-transactions');
        this.navCreateRequest = document.getElementById('nav-create-request');
        this.navStaff = document.getElementById('nav-staff');
        this.btnLogout = document.getElementById('btn-logout');
        this.viewTransactions = document.getElementById('view-transactions');
        this.viewCreateRequest = document.getElementById('view-create-request');
        this.viewStaff = document.getElementById('view-staff');
        this.btnSearch = document.getElementById('btn-search');
        this.btnClearSearch = document.getElementById('btn-clear-search');
        this.searchHn = document.getElementById('search-hn');
        this.searchDate = document.getElementById('search-date');
        this.transactionsTbody = document.getElementById('transactions-tbody');
        this.staffTbody = document.getElementById('staff-tbody');
        this.btnAddStaff = document.getElementById('btn-add-staff');
        this.requestForm = document.getElementById('request-form');
        this.requestStatus = document.getElementById('request-status');
        this.requestError = document.getElementById('request-error');
        this.imageModal = document.getElementById('image-modal');
        this.signaturePreview = document.getElementById('signature-preview');
        this.btnCloseModal = document.getElementById('btn-close-modal');
    }
    bindEvents() {
        this.loginForm.addEventListener('submit', e => this.handleLogin(e));
        this.btnLogout.addEventListener('click', () => this.handleLogout());
        this.navTransactions.addEventListener('click', () => this.switchView('transactions'));
        this.navCreateRequest.addEventListener('click', () => this.switchView('create-request'));
        this.navStaff.addEventListener('click', () => this.switchView('staff'));
        this.btnSearch.addEventListener('click', () => this.loadTransactions());
        this.btnClearSearch.addEventListener('click', () => { this.searchHn.value = ''; this.searchDate.value = ''; this.loadTransactions(); });
        this.btnCloseModal.addEventListener('click', () => { this.imageModal.classList.add('hidden'); this.signaturePreview.src = ''; });
        this.btnAddStaff.addEventListener('click', () => this.handleAddStaff());
        this.requestForm.addEventListener('submit', e => this.handleCreateRequest(e));
    }
    showLoading(show) { this.loadingOverlay.classList.toggle('hidden', !show); }
    checkSession() {
        const sessionToken = sessionStorage.getItem('adminSessionToken');
        const staffId = sessionStorage.getItem('adminStaffId');
        const staffName = sessionStorage.getItem('adminStaffName');
        const role = sessionStorage.getItem('adminRole');
        const accountCode = sessionStorage.getItem('adminAccountCode') || 'default';
        const accountName = sessionStorage.getItem('adminAccountName') || 'Default Account';
        if (sessionToken && staffId && role) { this.session = { sessionToken, staffId, staffName, role, accountCode, accountName }; this.showDashboard(); }
        else { this.loginScreen.classList.remove('hidden'); this.dashboardScreen.classList.add('hidden'); }
    }
    async handleLogin(e) {
        e.preventDefault(); this.loginError.classList.add('hidden'); this.showLoading(true);
        const staffId = normalizeText(document.getElementById('login-staff-id').value);
        const pin = normalizePin(document.getElementById('login-pin').value);
        const accountCode = normalizeText(document.getElementById('login-account-code').value);
        try {
            const params = { p_staff_id: staffId, p_pin: pin };
            if (accountCode) params.p_account_code = accountCode;
            const { data, error } = await supabaseClient.rpc('login_staff', params);
            if (error) throw new Error(getRpcErrorMessage(error));
            if (!data || !data.ok) throw new Error(data?.message || 'รหัสพนักงานหรือ PIN ไม่ถูกต้อง');
            if (data.data.role === 'SIGNING_DEVICE') throw new Error('บัญชีเครื่องเซ็นไม่สามารถเข้า Admin dashboard ได้');
            sessionStorage.setItem('adminSessionToken', data.data.sessionToken);
            sessionStorage.setItem('adminStaffId', data.data.staffId);
            sessionStorage.setItem('adminStaffName', data.data.staffName);
            sessionStorage.setItem('adminRole', data.data.role);
            sessionStorage.setItem('adminAccountCode', data.data.accountCode || 'default');
            sessionStorage.setItem('adminAccountName', data.data.accountName || 'Default Account');
            this.session = { sessionToken: data.data.sessionToken, staffId: data.data.staffId, staffName: data.data.staffName, role: data.data.role, accountCode: data.data.accountCode || 'default', accountName: data.data.accountName || 'Default Account' };
            this.showDashboard();
        } catch (err) { this.loginError.textContent = err.message; this.loginError.classList.remove('hidden'); }
        finally { this.showLoading(false); }
    }
    handleLogout() { ['adminSessionToken','adminStaffId','adminStaffName','adminRole','adminAccountCode','adminAccountName'].forEach(k => sessionStorage.removeItem(k)); this.session = null; this.loginScreen.classList.remove('hidden'); this.dashboardScreen.classList.add('hidden'); }
    showDashboard() {
        this.loginScreen.classList.add('hidden'); this.dashboardScreen.classList.remove('hidden');
        this.accountBadge.textContent = `${this.session.accountName} (${this.session.accountCode})`;
        this.navStaff.classList.toggle('hidden', this.session.role !== 'ADMIN');
        this.switchView('transactions');
    }
    switchView(viewName) {
        [this.navTransactions, this.navCreateRequest, this.navStaff].forEach(n => n.classList.remove('active'));
        [this.viewTransactions, this.viewCreateRequest, this.viewStaff].forEach(v => v.classList.add('hidden'));
        if (viewName === 'transactions') { this.navTransactions.classList.add('active'); this.viewTransactions.classList.remove('hidden'); this.loadTransactions(); }
        if (viewName === 'create-request') { this.navCreateRequest.classList.add('active'); this.viewCreateRequest.classList.remove('hidden'); }
        if (viewName === 'staff') { this.navStaff.classList.add('active'); this.viewStaff.classList.remove('hidden'); this.loadStaff(); }
    }
    async loadTransactions() {
        this.showLoading(true); this.transactionsTbody.textContent = '';
        const { data, error } = await supabaseClient.rpc('list_transactions', { p_session_token: this.session.sessionToken, p_hn: this.searchHn.value.trim() || null, p_service_date: this.searchDate.value || null });
        this.showLoading(false);
        if (error) { alert('โหลดข้อมูลผิดพลาด: ' + getRpcErrorMessage(error)); return; }
        if (!data || data.length === 0) { const tr = document.createElement('tr'); const td = textCell('ไม่พบข้อมูล'); td.colSpan = 5; td.className = 'text-center'; tr.appendChild(td); this.transactionsTbody.appendChild(tr); return; }
        data.forEach(tx => {
            const tr = document.createElement('tr');
            const patientName = [tx.patient_first_name, tx.patient_last_name].filter(Boolean).join(' ');
            tr.appendChild(textCell(new Date(tx.created_at).toLocaleString('th-TH')));
            tr.appendChild(textCell(tx.vn ? `${tx.hn} / ${tx.vn}` : tx.hn));
            tr.appendChild(textCell(patientName || '-'));
            tr.appendChild(textCell(`${tx.staff_name || ''} (${tx.staff_id || ''})`));
            tr.appendChild(textCell(tx.receiver_type === 'PATIENT' ? 'ผู้ป่วย' : 'ญาติ'));
            const actionCell = document.createElement('td'); const button = document.createElement('button'); button.className = 'btn-primary btn-small'; button.textContent = 'ดูรูป'; button.addEventListener('click', () => this.showImage(tx.drive_archive_url || tx.signature_url)); actionCell.appendChild(button); tr.appendChild(actionCell);
            this.transactionsTbody.appendChild(tr);
        });
    }
    showImage(url) { if (!url) { alert("ไม่พบ URL ของรูปภาพ"); return; } if (url.includes('drive.google.com')) window.open(url, '_blank', 'noopener'); else { this.signaturePreview.src = url; this.imageModal.classList.remove('hidden'); } }
    async handleCreateRequest(e) {
        e.preventDefault(); this.requestStatus.classList.add('hidden'); this.requestError.classList.add('hidden'); this.showLoading(true);
        try {
            const { data, error } = await supabaseClient.rpc('create_signature_request', {
                p_session_token: this.session.sessionToken,
                p_hn: normalizeText(document.getElementById('request-hn').value),
                p_vn: normalizeText(document.getElementById('request-vn').value) || null,
                p_patient_first_name: normalizeText(document.getElementById('request-first-name').value) || null,
                p_patient_last_name: normalizeText(document.getElementById('request-last-name').value) || null,
                p_receiver_type: document.getElementById('request-receiver-type').value
            });
            if (error) throw new Error(getRpcErrorMessage(error));
            if (!data || !data.ok) throw new Error(data?.message || 'สร้างรายการรอเซ็นไม่สำเร็จ');
            this.requestForm.reset();
            this.requestStatus.textContent = `ส่งไปยังเครื่องเซ็นแล้ว | Request ID: ${data.data.id}`;
            this.requestStatus.classList.remove('hidden');
        } catch (err) { this.requestError.textContent = err.message; this.requestError.classList.remove('hidden'); }
        finally { this.showLoading(false); }
    }
    async loadStaff() {
        if (this.session.role !== 'ADMIN') return; this.showLoading(true); this.staffTbody.textContent = '';
        const { data, error } = await supabaseClient.rpc('list_staff', { p_session_token: this.session.sessionToken });
        this.showLoading(false);
        if (error) { alert('โหลดข้อมูลพนักงานผิดพลาด: ' + getRpcErrorMessage(error)); return; }
        data.forEach(staff => { const tr = document.createElement('tr'); tr.appendChild(textCell(staff.staff_id)); tr.appendChild(textCell(staff.name)); tr.appendChild(textCell(staff.role)); const actionCell = document.createElement('td'); const button = document.createElement('button'); button.className = 'btn-warning btn-small delete-staff-btn'; button.textContent = 'ลบ'; button.addEventListener('click', async () => { if (confirm(`ต้องการลบพนักงาน ${staff.name} ใช่หรือไม่?`)) await this.deleteStaff(staff.id); }); actionCell.appendChild(button); tr.appendChild(actionCell); this.staffTbody.appendChild(tr); });
    }
    async deleteStaff(staffUserId) { this.showLoading(true); const { error } = await supabaseClient.rpc('delete_staff', { p_session_token: this.session.sessionToken, p_staff_user_id: staffUserId }); this.showLoading(false); if (error) { alert('ลบพนักงานไม่สำเร็จ: ' + getRpcErrorMessage(error)); return; } this.loadStaff(); }
    async handleAddStaff() {
        const staffId = normalizeText(prompt("ใส่รหัสพนักงาน (Staff ID):")); if (!staffId) return;
        const name = normalizeText(prompt("ใส่ชื่อ-นามสกุล:")); if (!name) return;
        const pin = normalizePin(prompt("ตั้งรหัส PIN (ตัวเลข 4-6 หลัก):")); if (!pin) return;
        const roleInput = normalizeText(prompt("Role: ADMIN, STAFF, SIGNING_DEVICE", "STAFF")).toUpperCase();
        const role = ['ADMIN','STAFF','SIGNING_DEVICE'].includes(roleInput) ? roleInput : 'STAFF';
        this.showLoading(true);
        const { data, error } = await supabaseClient.rpc('add_staff', { p_session_token: this.session.sessionToken, p_staff_id: staffId, p_name: name, p_pin: pin, p_role: role });
        this.showLoading(false);
        if (error) { alert('เพิ่มพนักงานไม่สำเร็จ: ' + getRpcErrorMessage(error)); return; }
        if (data && !data.ok) { alert('เพิ่มพนักงานไม่สำเร็จ: ' + data.message); return; }
        this.loadStaff();
    }
}
window.addEventListener('DOMContentLoaded', () => { window.adminApp = new AdminApp(); });
