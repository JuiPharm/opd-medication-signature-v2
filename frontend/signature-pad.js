class SignaturePad {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.isEmpty = true;
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.setupEvents();
        this.clear();
    }

    resizeCanvas() {
        // Save current content if any
        let dataUrl = null;
        if (!this.isEmpty) {
            dataUrl = this.canvas.toDataURL();
        }

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const parentWidth = this.canvas.parentElement.clientWidth;
        
        this.canvas.width = parentWidth * ratio;
        this.canvas.height = 300 * ratio; // Fixed height in css is 300
        this.canvas.style.width = parentWidth + "px";
        this.canvas.style.height = "300px";
        this.ctx.scale(ratio, ratio);

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = '#000000';

        if (dataUrl) {
            const img = new Image();
            img.onload = () => {
                this.ctx.drawImage(img, 0, 0, parentWidth, 300);
            };
            img.src = dataUrl;
        } else {
            this.clear(); // Fill white background
        }
    }

    setupEvents() {
        const getPointerPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            let clientX, clientY;

            if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const start = (e) => {
            e.preventDefault();
            this.isDrawing = true;
            const pos = getPointerPos(e);
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
        };

        const move = (e) => {
            e.preventDefault();
            if (!this.isDrawing) return;
            const pos = getPointerPos(e);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();
            this.isEmpty = false;
        };

        const stop = (e) => {
            e.preventDefault();
            if (this.isDrawing) {
                this.ctx.closePath();
                this.isDrawing = false;
            }
        };

        this.canvas.addEventListener('mousedown', start);
        this.canvas.addEventListener('mousemove', move);
        this.canvas.addEventListener('mouseup', stop);
        this.canvas.addEventListener('mouseout', stop);

        this.canvas.addEventListener('touchstart', start, { passive: false });
        this.canvas.addEventListener('touchmove', move, { passive: false });
        this.canvas.addEventListener('touchend', stop);
        this.canvas.addEventListener('touchcancel', stop);
    }

    clear() {
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.isEmpty = true;
    }

    toBase64() {
        if (this.isEmpty) return null;
        return this.canvas.toDataURL("image/png");
    }
}
