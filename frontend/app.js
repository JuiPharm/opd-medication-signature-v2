class App {
    constructor() {
        this.deviceId = this.getDeviceId();
        this.signaturePad = null;
        this.duplicateData = null;
        this.currentHn = null;
        this.config = {
            REQUIRE_PIN: true,
            STATEMENT_TEXT: "ข้าพเจ้าขอยืนยันว่าได้รับยาครบถ้วนตามรายการที่ปรากฏ และได้รับคำแนะนำการใช้ยาจากเภสัชกรเรียบร้อยแล้ว",
            HN_REGEX: "^07-[0-9]{2}-[0-9]{6}$"
        };
        
        this.initElements();
        this.bindEvents();
        this.checkSession();
    }

    getDeviceId() {
        let id = localStorage.getItem('deviceId');
        if (!id) {
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            localStorage.setItem('deviceId', id);
        }
        return id;
    }

    initElements() {
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loginScreen = document.getElementById('login-screen');
        this.hnScreen = document.getElementById('hn-screen');
        this.patientScreen = document.getElementById('patient-screen');
        this.successScreen = document.getElementById('success-screen');
        this.duplicateOverlay = document.getElementById('duplicate-overlay');

        this.loginForm = document.getElementById('login-form');
        this.hnForm = document.getElementById('hn-form');
        this.signatureForm = document.getElementById('signature-form');

        this.staffIdInput = document.getElementById('staff-id');
        this.staffPinInput = document.getElementById('staff-pin');
        this.pinContainer = document.getElementById('pin-container');
        this.hnInput = document.getElementById('hn-input');
        
        this.staffNameDisplay = document.getElementById('staff-name-display');
        this.staffIdDisplay = document.getElementById('staff-id-display');
        this.patientHnDisplay = document.getElementById('patient-hn-display');
        this.statementText = document.getElementById('statement-text');
        
        this.loginError = document.getElementById('login-error');
        this.hnError = document.getElementById('hn-error');
        this.submitError = document.getElementById('submit-error');

        this.btnLogout = document.getElementById('btn-logout');
        this.btnClearSig = document.getElementById('btn-clear-sig');
        this.btnCancelPatient = document.getElementById('btn-cancel-patient');
        this.btnConfirmDuplicate = document.getElementById('btn-confirm-duplicate');
        this.btnCancelDuplicate = document.getElementById('btn-cancel-duplicate');
        this.btnSuccessOk = document.getElementById('btn-success-ok');
    }

    bindEvents() {
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.hnForm.addEventListener('submit', (e) => this.handleHnSubmit(e));
        this.signatureForm.addEventListener('submit', (e) => this.handleSignatureSubmit(e));
        
        this.btnLogout.addEventListener('click', () => this.handleLogout());
        this.btnCancelPatient.addEventListener('click', () => this.showScreen('hn'));
        
        this.btnConfirmDuplicate.addEventListener('click', () => {
            this.duplicateOverlay.classList.add('hidden');
            this.showPatientMode(this.currentHn, true);
        });
        
        this.btnCancelDuplicate.addEventListener('click', () => {
            this.duplicateOverlay.classList.add('hidden');
            this.hnInput.value = '';
            this.hnInput.focus();
        });

        this.btnSuccessOk.addEventListener('click', () => this.resetToHnScreen());

        if (this.btnClearSig) {
            this.btnClearSig.addEventListener('click', () => {
                if (this.signaturePad) this.signaturePad.clear();
            });
        }
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.remove('hidden');
        } else {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    showScreen(screenName) {
        this.loginScreen.classList.add('hidden');
        this.hnScreen.classList.add('hidden');
        this.patientScreen.classList.add('hidden');
        this.successScreen.classList.add('hidden');

        if (screenName === 'login') this.loginScreen.classList.remove('hidden');
        if (screenName === 'hn') {
            this.hnScreen.classList.remove('hidden');
            this.hnInput.focus();
        }
        if (screenName === 'patient') {
            this.patientScreen.classList.remove('hidden');
            if (!this.signaturePad) {
                this.signaturePad = new SignaturePad('signature-pad');
            } else {
                this.signaturePad.resizeCanvas();
            }
        }
        if (screenName === 'success') this.successScreen.classList.remove('hidden');
    }

    checkSession() {
        this.showLoading(true);
        
        if (this.config.REQUIRE_PIN) {
            this.pinContainer.classList.remove('hidden');
        }
        if (this.config.STATEMENT_TEXT) {
            this.statementText.textContent = this.config.STATEMENT_TEXT;
        }

        const token = sessionStorage.getItem('sessionToken');
        const staffId = sessionStorage.getItem('staffId');
        const staffName = sessionStorage.getItem('staffName');

        if (!token || !staffId) {
            this.showLoading(false);
            this.showScreen('login');
            return;
        }

        this.setupStaffSession(staffId, staffName);
        this.showScreen('hn');
        this.showLoading(false);
    }

    setupStaffSession(staffId, staffName) {
        this.staffIdDisplay.textContent = staffId;
        this.staffNameDisplay.textContent = staffName;
    }

    async handleLogin(e) {
        e.preventDefault();
        this.loginError.classList.add('hidden');
        
        const staffId = this.staffIdInput.value.trim();
        const pin = this.staffPinInput.value.trim();
        
        if (!staffId) return;

        this.showLoading(true);
        try {
            const res = await API.login(staffId, pin);
            
            sessionStorage.setItem('sessionToken', res.data.sessionToken);
            sessionStorage.setItem('staffId', res.data.staffId);
            sessionStorage.setItem('staffName', res.data.staffName);

            this.setupStaffSession(res.data.staffId, res.data.staffName);
            
            this.staffIdInput.value = '';
            this.staffPinInput.value = '';
            
            this.showScreen('hn');
        } catch (error) {
            this.loginError.textContent = error.message;
            this.loginError.classList.remove('hidden');
        } finally {
            this.showLoading(false);
        }
    }

    handleLogout() {
        sessionStorage.clear();
        this.staffNameDisplay.textContent = '';
        this.staffIdDisplay.textContent = '';
        this.showScreen('login');
    }

    async handleHnSubmit(e) {
        e.preventDefault();
        this.hnError.classList.add('hidden');
        
        const hn = this.hnInput.value.trim();
        if (!hn) return;
        
        const regex = new RegExp(this.config.HN_REGEX);
        if (!regex.test(hn)) {
            this.hnError.textContent = "รูปแบบ HN ไม่ถูกต้อง (ต้องเป็น 07-XX-XXXXXX)";
            this.hnError.classList.remove('hidden');
            return;
        }

        this.currentHn = hn;
        this.showLoading(true);
        
        try {
            const res = await API.checkDuplicate(hn);
            
            if (res.code === "DUPLICATE_FOUND") {
                this.duplicateData = res.data;
                this.showDuplicateWarning(res.data);
            } else {
                this.showPatientMode(hn, false);
            }
        } catch (error) {
            this.hnError.textContent = error.message;
            this.hnError.classList.remove('hidden');
        } finally {
            this.showLoading(false);
        }
    }

    showDuplicateWarning(data) {
        document.getElementById('duplicate-time').textContent = new Date(data.submittedAt).toLocaleString('th-TH');
        document.getElementById('duplicate-staff').textContent = data.staffName;
        document.getElementById('duplicate-record').textContent = data.recordId;
        this.duplicateOverlay.classList.remove('hidden');
    }

    showPatientMode(hn, isDuplicateConfirmed) {
        this.patientHnDisplay.textContent = this.maskHN(hn);
        this.isDuplicateConfirmed = isDuplicateConfirmed;
        
        this.signatureForm.reset();
        if (this.signaturePad) this.signaturePad.clear();
        this.submitError.classList.add('hidden');
        
        this.showScreen('patient');
    }

    maskHN(hn) {
        if (!hn || hn.length < 4) return "****";
        return hn.slice(0, hn.length - 4).replace(/./g, '*') + hn.slice(-4);
    }

    async handleSignatureSubmit(e) {
        e.preventDefault();
        this.submitError.classList.add('hidden');
        
        if (!this.signaturePad || this.signaturePad.isEmpty) {
            this.submitError.textContent = "กรุณาลงนามรับยา";
            this.submitError.classList.remove('hidden');
            return;
        }

        const chkAccept = document.getElementById('chk-accept');
        if (!chkAccept.checked) {
            this.submitError.textContent = "กรุณายืนยันว่าได้อ่านและเข้าใจข้อความแล้ว";
            this.submitError.classList.remove('hidden');
            return;
        }

        const receiverType = document.querySelector('input[name="receiverType"]:checked');
        if (!receiverType) {
            this.submitError.textContent = "กรุณาเลือกผู้รับยา";
            this.submitError.classList.remove('hidden');
            return;
        }

        const base64 = this.signaturePad.toBase64();
        if (!base64) return;

        const submitBtn = document.getElementById('btn-submit-sig');
        submitBtn.disabled = true;
        this.showLoading(true);

        try {
            const sessionData = {
                sessionToken: sessionStorage.getItem('sessionToken'),
                staffId: sessionStorage.getItem('staffId'),
                staffName: sessionStorage.getItem('staffName')
            };

            const res = await API.submitSignature({
                hn: this.currentHn,
                signatureBase64: base64,
                receiverType: receiverType.value,
                deviceId: this.deviceId,
                isDuplicateConfirmed: this.isDuplicateConfirmed || false
            }, sessionData);
            
            if (!res.ok) throw new Error(res.message);

            this.signaturePad.clear();
            this.currentHn = null;
            
            this.showSuccess(res.data);
        } catch (error) {
            this.submitError.textContent = error.message;
            this.submitError.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            this.showLoading(false);
        }
    }

    showSuccess(data) {
        document.getElementById('success-time').textContent = new Date(data.serverTime).toLocaleString('th-TH');
        document.getElementById('success-record-id').textContent = data.recordId;
        
        this.showScreen('success');
        
        let count = 5;
        const countdownEl = document.getElementById('countdown');
        countdownEl.textContent = count;
        
        if (this.successInterval) clearInterval(this.successInterval);
        
        this.successInterval = setInterval(() => {
            count--;
            countdownEl.textContent = count;
            if (count <= 0) {
                clearInterval(this.successInterval);
                this.resetToHnScreen();
            }
        }, 1000);
    }

    resetToHnScreen() {
        if (this.successInterval) clearInterval(this.successInterval);
        this.hnInput.value = '';
        this.showScreen('hn');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
