function assertSupabaseConfig() {
    if (!window.CONFIG || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
        throw new Error("ยังไม่ได้ตั้งค่า Supabase ในไฟล์ ../frontend/config.js");
    }

    if (CONFIG.SUPABASE_URL.includes("YOUR_") || CONFIG.SUPABASE_ANON_KEY.includes("YOUR_")) {
        throw new Error("กรุณาใส่ SUPABASE_URL และ SUPABASE_ANON_KEY จริงในไฟล์ ../frontend/config.js");
    }
}

assertSupabaseConfig();
const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseKey = CONFIG.SUPABASE_ANON_KEY;
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

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

function textCell(value) {
    const td = document.createElement('td');
    td.textContent = value ?? '';
    return td;
}

class AdminApp {
    constructor() {
        this.session = null;
        this.initElements();
        this.bindEvents();
        this.checkSession();
    }

    initElements() {
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loginScreen = document.getElementById('login-screen');
        this.dashboardScreen = document.getElementById('dashboard-screen');
        this.loginForm = document.getElementById('login-form');
        this.loginError = document.getElementById('login-error');
        this.navTransactions = document.getElementById('nav-transactions');
        this.navStaff = document.getElementById('nav-staff');
        this.btnLogout = document.getElementById('btn-logout');
        this.viewTransactions = document.getElementById('view-transactions');
        this.viewStaff = document.getElementById('view-staff');
        this.btnSearch = document.getElementById('btn-search');
        this.btnClearSearch = document.getElementById('btn-clear-search');
        this.searchHn = document.getElementById('search-hn');
        this.searchDate = document.getElementById('search-date');
        this.transactionsTbody = document.getElementById('transactions-tbody');
        this.staffTbody = document.getElementById('staff-tbody');
        this.btnAddStaff = document.getElementById('btn-add-staff');
        this.imageModal = document.getElementById('image-modal');
        this.signaturePreview = document.getElementById('signature-preview');
        this.btnCloseModal = document.getElementById('btn-close-modal');
    }

    bindEvents() {
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.btnLogout.addEventListener('click', () => this.handleLogout());
        this.navTransactions.addEventListener('click', () => this.switchView('transactions'));
        this.navStaff.addEventListener('click', () => this.switchView('staff'));
        this.btnSearch.addEventListener('click', () => this.loadTransactions());
        this.btnClearSearch.addEventListener('click', () => {
            this.searchHn.value = '';
            this.searchDate.value = '';
            this.loadTransactions();
        });
        this.btnCloseModal.addEventListener('click', () => {
            this.imageModal.classList.add('hidden');
            this.signaturePreview.src = '';
        });
        this.btnAddStaff.addEventListener('click', () => this.handleAddStaff());
    }

    showLoading(show) {
        if (show) this.loadingOverlay.classList.remove('hidden');
        else this.loadingOverlay.classList.add('hidden');
    }

    checkSession() {
        const sessionToken = sessionStorage.getItem('adminSessionToken');
        const staffId = sessionStorage.getItem('adminStaffId');
        const staffName = sessionStorage.getItem('adminStaffName');
        const role = sessionStorage.getItem('adminRole');

        if (sessionToken && staffId && role) {
            this.session = { sessionToken, staffId, staffName, role };
            this.showDashboard();
        } else {
            this.loginScreen.classList.remove('hidden');
            this.dashboardScreen.classList.add('hidden');
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        this.loginError.classList.add('hidden');
        this.showLoading(true);

        const staffId = normalizeStaffId(document.getElementById('login-staff-id').value);
        const pin = normalizePin(document.getElementById('login-pin').value);

        try {
            const { data, error } = await supabase.rpc('login_staff', {
                p_staff_id: staffId,
                p_pin: pin
            });

            if (error) throw new Error(getRpcErrorMessage(error));
            if (!data || !data.ok) throw new Error(data?.message || 'รหัสพนักงานหรือ PIN ไม่ถูกต้อง');

            sessionStorage.setItem('adminSessionToken', data.data.sessionToken);
            sessionStorage.setItem('adminStaffId', data.data.staffId);
            sessionStorage.setItem('adminStaffName', data.data.staffName);
            sessionStorage.setItem('adminRole', data.data.role);
            this.session = {
                sessionToken: data.data.sessionToken,
                staffId: data.data.staffId,
                staffName: data.data.staffName,
                role: data.data.role
            };

            this.showDashboard();
        } catch (err) {
            this.loginError.textContent = err.message;
            this.loginError.classList.remove('hidden');
        } finally {
            this.showLoading(false);
        }
    }

    handleLogout() {
        sessionStorage.removeItem('adminSessionToken');
        sessionStorage.removeItem('adminStaffId');
        sessionStorage.removeItem('adminStaffName');
        sessionStorage.removeItem('adminRole');
        this.session = null;
        this.loginScreen.classList.remove('hidden');
        this.dashboardScreen.classList.add('hidden');
    }

    showDashboard() {
        this.loginScreen.classList.add('hidden');
        this.dashboardScreen.classList.remove('hidden');

        if (this.session.role === 'ADMIN') {
            this.navStaff.classList.remove('hidden');
        } else {
            this.navStaff.classList.add('hidden');
        }

        this.switchView('transactions');
    }

    switchView(viewName) {
        this.navTransactions.classList.remove('active');
        this.navStaff.classList.remove('active');
        this.viewTransactions.classList.add('hidden');
        this.viewStaff.classList.add('hidden');

        if (viewName === 'transactions') {
            this.navTransactions.classList.add('active');
            this.viewTransactions.classList.remove('hidden');
            this.loadTransactions();
        } else if (viewName === 'staff') {
            this.navStaff.classList.add('active');
            this.viewStaff.classList.remove('hidden');
            this.loadStaff();
        }
    }

    async loadTransactions() {
        this.showLoading(true);
        this.transactionsTbody.textContent = '';

        const { data, error } = await supabase.rpc('list_transactions', {
            p_session_token: this.session.sessionToken,
            p_hn: this.searchHn.value.trim() || null,
            p_service_date: this.searchDate.value || null
        });
        this.showLoading(false);

        if (error) {
            alert('โหลดข้อมูลผิดพลาด: ' + getRpcErrorMessage(error));
            return;
        }

        if (!data || data.length === 0) {
            const tr = document.createElement('tr');
            const td = textCell('ไม่พบข้อมูล');
            td.colSpan = 5;
            td.className = 'text-center';
            tr.appendChild(td);
            this.transactionsTbody.appendChild(tr);
            return;
        }

        data.forEach(tx => {
            const tr = document.createElement('tr');
            const timeStr = new Date(tx.created_at).toLocaleString('th-TH');
            const signatureLink = tx.drive_archive_url || tx.signature_url;

            tr.appendChild(textCell(timeStr));
            tr.appendChild(textCell(tx.hn));
            tr.appendChild(textCell(`${tx.staff_name || ''} (${tx.staff_id || ''})`));
            tr.appendChild(textCell(tx.receiver_type === 'PATIENT' ? 'ผู้ป่วย' : 'ญาติ'));

            const actionCell = document.createElement('td');
            const button = document.createElement('button');
            button.className = 'btn-primary btn-small view-sig-btn';
            button.textContent = 'ดูรูป';
            button.addEventListener('click', () => this.showImage(signatureLink));
            actionCell.appendChild(button);
            tr.appendChild(actionCell);

            this.transactionsTbody.appendChild(tr);
        });
    }

    showImage(url) {
        if (!url) {
            alert("ไม่พบ URL ของรูปภาพ");
            return;
        }
        if (url.includes('drive.google.com')) {
            window.open(url, '_blank', 'noopener');
        } else {
            this.signaturePreview.src = url;
            this.imageModal.classList.remove('hidden');
        }
    }

    async loadStaff() {
        if (this.session.role !== 'ADMIN') return;
        this.showLoading(true);
        this.staffTbody.textContent = '';

        const { data, error } = await supabase.rpc('list_staff', {
            p_session_token: this.session.sessionToken
        });

        this.showLoading(false);

        if (error) {
            alert('โหลดข้อมูลพนักงานผิดพลาด: ' + getRpcErrorMessage(error));
            return;
        }

        data.forEach(staff => {
            const tr = document.createElement('tr');
            tr.appendChild(textCell(staff.staff_id));
            tr.appendChild(textCell(staff.name));
            tr.appendChild(textCell(staff.role));

            const actionCell = document.createElement('td');
            const button = document.createElement('button');
            button.className = 'btn-warning btn-small delete-staff-btn';
            button.textContent = 'ลบ';
            button.addEventListener('click', async () => {
                if (confirm(`ต้องการลบพนักงาน ${staff.name} ใช่หรือไม่?`)) {
                    await this.deleteStaff(staff.id);
                }
            });
            actionCell.appendChild(button);
            tr.appendChild(actionCell);

            this.staffTbody.appendChild(tr);
        });
    }

    async deleteStaff(staffUserId) {
        this.showLoading(true);
        const { error } = await supabase.rpc('delete_staff', {
            p_session_token: this.session.sessionToken,
            p_staff_user_id: staffUserId
        });
        this.showLoading(false);

        if (error) {
            alert('ลบพนักงานไม่สำเร็จ: ' + getRpcErrorMessage(error));
            return;
        }
        this.loadStaff();
    }

    async handleAddStaff() {
        const staffId = normalizeStaffId(prompt("ใส่รหัสพนักงาน (Staff ID):"));
        if (!staffId) return;
        const name = String(prompt("ใส่ชื่อ-นามสกุล:") || '').trim();
        if (!name) return;
        const pin = normalizePin(prompt("ตั้งรหัส PIN (ตัวเลข 4-6 หลัก):"));
        if (!pin) return;
        const role = confirm("ต้องการให้เป็น ADMIN หรือไม่? (OK=ADMIN, Cancel=STAFF)") ? 'ADMIN' : 'STAFF';

        this.showLoading(true);
        const { data, error } = await supabase.rpc('add_staff', {
            p_session_token: this.session.sessionToken,
            p_staff_id: staffId,
            p_name: name,
            p_pin: pin,
            p_role: role
        });
        this.showLoading(false);

        if (error) {
            alert('เพิ่มพนักงานไม่สำเร็จ: ' + getRpcErrorMessage(error));
            return;
        }
        if (data && !data.ok) {
            alert('เพิ่มพนักงานไม่สำเร็จ: ' + data.message);
            return;
        }
        this.loadStaff();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();
});
