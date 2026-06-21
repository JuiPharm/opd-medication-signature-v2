class App {
    constructor() {
        this.deviceId = this.getDeviceId();
        this.signaturePad = null;
        this.duplicateData = null;
        this.currentHn = null;
        this.currentRequest = null;
        this.pollInterval = null;
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
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
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
        this.waitingScreen = document.getElementById('waiting-screen');
        this.patientScreen = document.getElementById('patient-screen');
        this.successScreen = document.getElementById('success-screen');
        this.duplicateOverlay = document.getElementById('duplicate-overlay');
        this.loginForm = document.getElementById('login-form');
        this.hnForm = document.getElementById('hn-form');
        this.signatureForm = document.getElementById('signature-form');
        this.accountCodeInput = document.getElementById('account-code');
        this.staffIdInput = document.getElementById('staff-id');
        this.staffPinInput = document.getElementById('staff-pin');
        this.pinContainer = document.getElementById('pin-container');
        this.hnInput = document.getElementById('hn-input');
        this.staffNameDisplay = document.getElementById('staff-name-display');
        this.staffIdDisplay = document.getElementById('staff-id-display');
        this.waitingStaffDisplay = document.getElementById('waiting-staff-display');
        this.waitingStatus = document.getElementById('waiting-status');
        this.queueStatus = document.getElementById('queue-status');
        this.waitingError = document.getElementById('waiting-error');
        this.patientHnDisplay = document.getElementById('patient-hn-display');
        this.patientDetailBox = document.getElementById('patient-detail-box');
        this.statementText = document.getElementById('statement-text');
        this.loginError = document.getElementById('login-error');
        this.hnError = document.getElementById('hn-error');
        this.submitError = document.getElementById('submit-error');
        this.btnLogout = document.getElementById('btn-logout');
        this.btnWaitingLogout = document.getElementById('btn-waiting-logout');
        this.btnClearSig = document.getElementById('btn-clear-sig');
        this.btnCancelPatient = document.getElementById('btn-cancel-patient');
        this.btnConfirmDuplicate = document.getElementById('btn-confirm-duplicate');
        this.btnCancelDuplicate = document.getElementById('btn-cancel-duplicate');
        this.btnSuccessOk = document.getElementById('btn-success-ok');
    }
    bindEvents() {
        this.loginForm.addEventListener('submit', e => this.handleLogin(e));
        this.hnForm.addEventListener('submit', e => this.handleHnSubmit(e));
        this.signatureForm.addEventListener('submit', e => this.handleSignatureSubmit(e));
        this.btnLogout.addEventListener('click', () => this.handleLogout());
        if (this.btnWaitingLogout) this.btnWaitingLogout.addEventListener('click', () => this.handleLogout());
        this.btnCancelPatient.addEventListener('click', () => this.currentRequest ? this.resetAfterQueuedRequest() : this.startStaffMode());
        this.btnConfirmDuplicate.addEventListener('click', () => { this.duplicateOverlay.classList.add('hidden'); this.showPatientMode(this.currentHn, true); });
        this.btnCancelDuplicate.addEventListener('click', () => { this.duplicateOverlay.classList.add('hidden'); this.hnInput.value = ''; this.hnInput.focus(); });
        this.btnSuccessOk.addEventListener('click', () => this.resetAfterQueuedRequest());
        if (this.btnClearSig) this.btnClearSig.addEventListener('click', () => { if (this.signaturePad) this.signaturePad.clear(); });
    }
    showLoading(show) { this.loadingOverlay.classList.toggle('hidden', !show); }
    showScreen(screenName) {
        this.loginScreen.classList.add('hidden');
        this.hnScreen.classList.add('hidden');
        if (this.waitingScreen) this.waitingScreen.classList.add('hidden');
        this.patientScreen.classList.add('hidden');
        this.successScreen.classList.add('hidden');
        if (screenName === 'login') this.loginScreen.classList.remove('hidden');
        if (screenName === 'hn') { this.hnScreen.classList.remove('hidden'); this.hnInput.focus(); }
        if (screenName === 'waiting') this.waitingScreen.classList.remove('hidden');
        if (screenName === 'patient') {
            this.patientScreen.classList.remove('hidden');
            if (!this.signaturePad) this.signaturePad = new SignaturePad('signature-pad');
            else this.signaturePad.resizeCanvas();
        }
        if (screenName === 'success') this.successScreen.classList.remove('hidden');
    }
    checkSession() {
        this.showLoading(true);
        if (this.config.REQUIRE_PIN) this.pinContainer.classList.remove('hidden');
        if (this.config.STATEMENT_TEXT) this.statementText.textContent = this.config.STATEMENT_TEXT;
        const token = sessionStorage.getItem('sessionToken');
        const staffId = sessionStorage.getItem('staffId');
        const staffName = sessionStorage.getItem('staffName');
        const role = sessionStorage.getItem('staffRole');
        if (!token || !staffId) { this.showLoading(false); this.showScreen('login'); return; }
        this.setupStaffSession(staffId, staffName, role, sessionStorage.getItem('accountName'), sessionStorage.getItem('accountCode'));
        if (role === 'SIGNING_DEVICE') this.startWaitingMode();
        else this.startStaffMode();
        this.showLoading(false);
    }
    setupStaffSession(staffId, staffName, role, accountName, accountCode) {
        const accountText = accountName ? ` | Account: ${accountName} (${accountCode || 'default'})` : '';
        const roleText = role ? ` | ${role}` : '';
        this.staffIdDisplay.textContent = staffId;
        this.staffNameDisplay.textContent = `${staffName || staffId}${roleText}${accountText}`;
        if (this.waitingStaffDisplay) this.waitingStaffDisplay.textContent = `${staffName || staffId} (${staffId})${roleText}${accountText}`;
    }
    async handleLogin(e) {
        e.preventDefault();
        this.loginError.classList.add('hidden');
        const accountCode = this.accountCodeInput.value.trim();
        const staffId = this.staffIdInput.value.trim();
        const pin = this.staffPinInput.value.trim();
        if (!staffId) return;
        this.showLoading(true);
        try {
            const res = await API.login(staffId, pin, accountCode);
            sessionStorage.setItem('sessionToken', res.data.sessionToken);
            sessionStorage.setItem('staffId', res.data.staffId);
            sessionStorage.setItem('staffName', res.data.staffName);
            sessionStorage.setItem('staffRole', res.data.role);
            sessionStorage.setItem('accountCode', res.data.accountCode || 'default');
            sessionStorage.setItem('accountName', res.data.accountName || 'Default Account');
            this.setupStaffSession(res.data.staffId, res.data.staffName, res.data.role, res.data.accountName, res.data.accountCode);
            this.staffIdInput.value = '';
            this.staffPinInput.value = '';
            if (res.data.role === 'SIGNING_DEVICE') this.startWaitingMode();
            else this.startStaffMode();
        } catch (error) {
            this.loginError.textContent = error.message;
            this.loginError.classList.remove('hidden');
        } finally {
            this.showLoading(false);
        }
    }
    handleLogout() {
        this.stopPolling();
        sessionStorage.clear();
        this.currentRequest = null;
        this.currentHn = null;
        this.showScreen('login');
    }
    startStaffMode() {
        this.showScreen('hn');
        this.startRequestPolling();
    }
    startWaitingMode() {
        this.showScreen('waiting');
        this.startRequestPolling();
    }
    startRequestPolling() {
        this.stopPolling();
        this.pollPendingRequest();
        this.pollInterval = setInterval(() => this.pollPendingRequest(), 2000);
    }
    stopPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = null;
    }
    async pollPendingRequest() {
        const waitingVisible = this.waitingScreen && !this.waitingScreen.classList.contains('hidden');
        const hnVisible = this.hnScreen && !this.hnScreen.classList.contains('hidden');
        if (!waitingVisible && !hnVisible) return;
        this.waitingError.classList.add('hidden');
        if (this.queueStatus) this.queueStatus.classList.add('hidden');
        try {
            const res = await API.getPendingSignatureRequest();
            if (res.code === 'PENDING_FOUND' && res.data) {
                const claimed = await API.claimSignatureRequest(res.data.id);
                if (claimed.ok) {
                    this.stopPolling();
                    this.currentRequest = claimed.data;
                    this.currentHn = claimed.data.hn;
                    this.showPatientMode(claimed.data.hn, false, claimed.data);
                }
            } else {
                if (waitingVisible) this.waitingStatus.textContent = 'รอข้อมูลจากเจ้าหน้าที่...';
                if (hnVisible && this.queueStatus) {
                    this.queueStatus.textContent = 'ยังไม่มีคิวจากหลังบ้านใน account นี้ สามารถกรอก HN เอง หรือรอให้หลังบ้านส่งคิวมา';
                    this.queueStatus.classList.remove('hidden');
                }
            }
        } catch (error) {
            if (waitingVisible) {
                this.waitingError.textContent = error.message;
                this.waitingError.classList.remove('hidden');
            } else if (this.queueStatus) {
                this.queueStatus.textContent = error.message;
                this.queueStatus.classList.remove('hidden');
            }
        }
    }
    async handleHnSubmit(e) {
        e.preventDefault();
        this.hnError.classList.add('hidden');
        const hn = this.hnInput.value.trim();
        if (!hn) return;
        const regex = new RegExp(this.config.HN_REGEX);
        if (!regex.test(hn)) { this.hnError.textContent = "รูปแบบ HN ไม่ถูกต้อง (ต้องเป็น 07-XX-XXXXXX)"; this.hnError.classList.remove('hidden'); return; }
        this.currentHn = hn;
        this.currentRequest = null;
        this.showLoading(true);
        try {
            const res = await API.checkDuplicate(hn);
            if (res.code === "DUPLICATE_FOUND") { this.duplicateData = res.data; this.showDuplicateWarning(res.data); }
            else this.showPatientMode(hn, false);
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
    showPatientMode(hn, isDuplicateConfirmed, request = null) {
        this.patientHnDisplay.textContent = request ? hn : this.maskHN(hn);
        this.isDuplicateConfirmed = isDuplicateConfirmed;
        this.signatureForm.reset();
        if (this.signaturePad) this.signaturePad.clear();
        this.submitError.classList.add('hidden');
        if (request && this.patientDetailBox) {
            const fullName = [request.patient_first_name, request.patient_last_name].filter(Boolean).join(' ');
            const receiverLabel = request.receiver_type === 'RELATIVE'
                ? 'ญาติหรือผู้ดูแลรับยาแทน'
                : 'ผู้ป่วยรับยาด้วยตนเอง';
            this.patientDetailBox.textContent = [
                request.hn ? `HN: ${request.hn}` : '',
                request.vn ? `VN: ${request.vn}` : '',
                fullName ? `ชื่อ-นามสกุล: ${fullName}` : '',
                `ผู้รับยา: ${receiverLabel}`,
                `Request ID: ${request.id}`,
            ].filter(Boolean).join(' | ');
            this.patientDetailBox.classList.remove('hidden');
            const receiver = document.querySelector(`input[name="receiverType"][value="${request.receiver_type || 'PATIENT'}"]`);
            if (receiver) receiver.checked = true;
        } else if (this.patientDetailBox) {
            this.patientDetailBox.classList.add('hidden');
            this.patientDetailBox.textContent = '';
        }
        this.showScreen('patient');
    }
    maskHN(hn) { if (!hn || hn.length < 4) return "****"; return hn.slice(0, hn.length - 4).replace(/./g, '*') + hn.slice(-4); }
    async handleSignatureSubmit(e) {
        e.preventDefault();
        this.submitError.classList.add('hidden');
        if (!this.signaturePad || this.signaturePad.isEmpty) { this.submitError.textContent = "กรุณาลงนามรับยา"; this.submitError.classList.remove('hidden'); return; }
        const chkAccept = document.getElementById('chk-accept');
        if (!chkAccept.checked) { this.submitError.textContent = "กรุณายืนยันว่าได้อ่านและเข้าใจข้อความแล้ว"; this.submitError.classList.remove('hidden'); return; }
        const receiverType = document.querySelector('input[name="receiverType"]:checked');
        if (!receiverType) { this.submitError.textContent = "กรุณาเลือกผู้รับยา"; this.submitError.classList.remove('hidden'); return; }
        const base64 = this.signaturePad.toBase64();
        if (!base64) return;
        const submitBtn = document.getElementById('btn-submit-sig');
        submitBtn.disabled = true;
        this.showLoading(true);
        try {
            const sessionData = { sessionToken: sessionStorage.getItem('sessionToken'), staffId: sessionStorage.getItem('staffId'), staffName: sessionStorage.getItem('staffName') };
            const res = this.currentRequest
                ? await API.completeSignatureRequest({ requestId: this.currentRequest.id, signatureBase64: base64, deviceId: this.deviceId }, sessionData)
                : await API.submitSignature({ hn: this.currentHn, signatureBase64: base64, receiverType: receiverType.value, deviceId: this.deviceId, isDuplicateConfirmed: this.isDuplicateConfirmed || false }, sessionData);
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
                this.resetAfterQueuedRequest();
            }
        }, 1000);
    }
    resetAfterQueuedRequest() {
        if (sessionStorage.getItem('staffRole') === 'SIGNING_DEVICE') this.resetToWaitingScreen();
        else this.resetToHnScreen();
    }
    resetToWaitingScreen() {
        if (this.successInterval) clearInterval(this.successInterval);
        this.currentRequest = null;
        this.currentHn = null;
        this.startWaitingMode();
    }
    resetToHnScreen() {
        if (this.successInterval) clearInterval(this.successInterval);
        this.hnInput.value = '';
        this.startStaffMode();
    }
}
window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
