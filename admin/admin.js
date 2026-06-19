const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseKey = CONFIG.SUPABASE_ANON_KEY;
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

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
        if(show) this.loadingOverlay.classList.remove('hidden');
        else this.loadingOverlay.classList.add('hidden');
    }

    checkSession() {
        const staffId = sessionStorage.getItem('adminStaffId');
        const role = sessionStorage.getItem('adminRole');
        
        if (staffId && role) {
            this.session = { staffId, role };
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

        const staffId = document.getElementById('login-staff-id').value.trim();
        const pin = document.getElementById('login-pin').value.trim();

        try {
            const { data, error } = await supabase
                .from('staff_users')
                .select('*')
                .eq('staff_id', staffId)
                .eq('pin', pin)
                .single();

            if (error || !data) {
                throw new Error('รหัสพนักงานหรือ PIN ไม่ถูกต้อง');
            }

            // Allow both ADMIN and STAFF to login to this portal, but limit views
            sessionStorage.setItem('adminStaffId', data.staff_id);
            sessionStorage.setItem('adminRole', data.role);
            this.session = { staffId: data.staff_id, role: data.role };
            
            this.showDashboard();
        } catch (err) {
            this.loginError.textContent = err.message;
            this.loginError.classList.remove('hidden');
        } finally {
            this.showLoading(false);
        }
    }

    handleLogout() {
        sessionStorage.removeItem('adminStaffId');
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
        this.transactionsTbody.innerHTML = '';
        
        let query = supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
            
        const hn = this.searchHn.value.trim();
        const date = this.searchDate.value;
        
        if (hn) query = query.eq('hn', hn);
        if (date) query = query.eq('service_date', date);
        
        const { data, error } = await query;
        this.showLoading(false);
        
        if (error) {
            alert('โหลดข้อมูลผิดพลาด: ' + error.message);
            return;
        }
        
        if (data.length === 0) {
            this.transactionsTbody.innerHTML = '<tr><td colspan="5" class="text-center">ไม่พบข้อมูล</td></tr>';
            return;
        }
        
        data.forEach(tx => {
            const tr = document.createElement('tr');
            
            const timeStr = new Date(tx.created_at).toLocaleString('th-TH');
            const signatureLink = tx.drive_archive_url || tx.signature_url;
            
            tr.innerHTML = `
                <td>${timeStr}</td>
                <td>${tx.hn}</td>
                <td>${tx.staff_name} (${tx.staff_id})</td>
                <td>${tx.receiver_type === 'PATIENT' ? 'ผู้ป่วย' : 'ญาติ'}</td>
                <td>
                    <button class="btn-primary btn-small view-sig-btn" data-url="${signatureLink}">ดูรูป</button>
                </td>
            `;
            
            tr.querySelector('.view-sig-btn').addEventListener('click', (e) => {
                const url = e.target.getAttribute('data-url');
                this.showImage(url);
            });
            
            this.transactionsTbody.appendChild(tr);
        });
    }

    showImage(url) {
        if (!url) {
            alert("ไม่พบ URL ของรูปภาพ");
            return;
        }
        // If it's a Drive URL, just open it in a new tab because embedding Drive can be tricky with permissions
        if (url.includes('drive.google.com')) {
            window.open(url, '_blank');
        } else {
            this.signaturePreview.src = url;
            this.imageModal.classList.remove('hidden');
        }
    }

    async loadStaff() {
        if (this.session.role !== 'ADMIN') return;
        this.showLoading(true);
        this.staffTbody.innerHTML = '';
        
        const { data, error } = await supabase
            .from('staff_users')
            .select('*')
            .order('created_at', { ascending: true });
            
        this.showLoading(false);
        
        if (error) {
            alert('โหลดข้อมูลพนักงานผิดพลาด: ' + error.message);
            return;
        }
        
        data.forEach(staff => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${staff.staff_id}</td>
                <td>${staff.name}</td>
                <td>${staff.role}</td>
                <td>
                    <button class="btn-warning btn-small delete-staff-btn" data-id="${staff.id}">ลบ</button>
                </td>
            `;
            
            tr.querySelector('.delete-staff-btn').addEventListener('click', async (e) => {
                if(confirm(`ต้องการลบพนักงาน ${staff.name} ใช่หรือไม่?`)) {
                    await supabase.from('staff_users').delete().eq('id', staff.id);
                    this.loadStaff();
                }
            });
            
            this.staffTbody.appendChild(tr);
        });
    }

    async handleAddStaff() {
        const staffId = prompt("ใส่รหัสพนักงาน (Staff ID):");
        if (!staffId) return;
        const name = prompt("ใส่ชื่อ-นามสกุล:");
        if (!name) return;
        const pin = prompt("ตั้งรหัส PIN (ตัวเลข 4-6 หลัก):");
        if (!pin) return;
        const role = confirm("ต้องการให้เป็น ADMIN หรือไม่? (OK=ADMIN, Cancel=STAFF)") ? 'ADMIN' : 'STAFF';
        
        this.showLoading(true);
        const { error } = await supabase
            .from('staff_users')
            .insert([{ staff_id: staffId, name: name, pin: pin, role: role }]);
            
        this.showLoading(false);
        if (error) {
            alert('เพิ่มพนักงานไม่สำเร็จ: ' + error.message);
        } else {
            this.loadStaff();
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();
});
