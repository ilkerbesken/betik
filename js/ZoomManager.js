class ZoomManager {
    constructor(app) {
        this.app = app;
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        this.isPanning = false;
        this.isEditingZoom = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.minZoom = 0.1;
        this.maxZoom = 10; // Increased max zoom
        this.zoomSpeed = 0.1;

        // Touch gesture state
        this.activePointers = new Map();
        this.lastPinchDistance = 0;
        this.lastPinchCenter = null;
        this.isPinching = false;

        // Palm Rejection / Stylus Tracking
        this.lastStylusTime = 0;
        this.STYLUS_GRACE_PERIOD = 500; // ms
        this.MIN_PINCH_DISTANCE = 60; // pixels
        this.ZOOM_THRESHOLD = 0.02; // 2% minimum change to trigger zoom

        this.init();
    }

    init() {
        this.createUI();
        this.setupEventListeners();
    }

    createUI() {
        // UI is created in index.html, we just attach listeners here
        // But if we want to be fully modular, we could checking if elements exist
        // For now, we assume elements will be in index.html as per plan
    }

    setupEventListeners() {
        // Wheel Zoom (Ctrl + Wheel) & Pan (Wheel)
        this.app.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // UI Buttons
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomResetBtn = document.getElementById('zoomResetBtn');
        const zoomFitBtn = document.getElementById('zoomFitBtn');

        if (zoomFitBtn) zoomFitBtn.addEventListener('click', () => this.fitToWidth(10));
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.zoomOut());
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', () => this.enableZoomInput());
            zoomResetBtn.title = "Değer girmek için tıklayın";
        }
    }

    getLogicalDims() {
        return {
            width: this.app.canvas.clientWidth,
            height: this.app.canvas.clientHeight
        };
    }

    handleWheel(e) {
        e.preventDefault();

        // New system: 1 CSS pixel = 1 Unit (before zoom/pan)
        const scale = 1;

        if (e.ctrlKey || e.metaKey) {
            // Zoom
            const delta = -e.deltaY;
            const factor = delta > 0 ? 1.1 : 0.9;

            const logicX = e.offsetX * scale;
            const logicY = e.offsetY * scale;

            this.zoomAtPoint(logicX, logicY, factor);
        } else {
            // Pan
            this.pan.x -= e.deltaX * scale;
            this.pan.y -= e.deltaY * scale;
            this.updateUI();
            this.clampPan();
            this.syncActivePageByScroll();
        }
    }

    clampPan() {
        if (!this.app.pageManager) return;

        // Sınırsız Pan Deneyimi: 
        // Kullanıcının her yöne belli bir miktar boşluğa (margin) çıkmasına izin veriyoruz
        const { width: viewW, height: viewH } = this.getLogicalDims();
        const pageWidth = this.app.pageManager.getPageWidth();
        const totalHeight = this.app.pageManager.getTotalHeight();

        const scaledW = pageWidth * this.zoom;
        const scaledH = totalHeight * this.zoom;

        // Sayfaların etrafında 500px boşluk payı bırakalım
        const margin = 500 * this.zoom;

        const minX = viewW - scaledW - margin;
        const maxX = margin;
        if (this.pan.x < minX) this.pan.x = minX;
        if (this.pan.x > maxX) this.pan.x = maxX;

        const minY = viewH - scaledH - margin;
        const maxY = margin;
        if (this.pan.y < minY) this.pan.y = minY;
        if (this.pan.y > maxY) this.pan.y = maxY;

        this.app.needsRedrawOffscreen = true;
        this.app.needsRender = true;

        if (this.app.pdfManager && this.app.pdfManager.textSelector) {
            this.app.pdfManager.textSelector.updateTransform(this.zoom, this.pan.x, this.pan.y);
        }
    }

    syncActivePageByScroll() {
        if (!this.app.pageManager) return;

        const { height: viewH } = this.getLogicalDims();
        const viewportCenterY = (-this.pan.y / this.zoom) + (viewH / (2 * this.zoom));
        const activeIndex = this.app.pageManager.getPageIndexAt(viewportCenterY);

        if (activeIndex !== this.app.pageManager.currentPageIndex) {
            this.app.pageManager.switchPage(activeIndex, false);
        }
    }

    zoomAtPoint(x, y, factor) {
        const oldZoom = this.zoom;
        let newZoom = oldZoom * factor;
        newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

        const worldX = (x - this.pan.x) / oldZoom;
        const worldY = (y - this.pan.y) / oldZoom;

        this.pan.x = x - worldX * newZoom;
        this.pan.y = y - worldY * newZoom;
        this.zoom = newZoom;

        this.updateUI();
        this.clampPan();
    }

    zoomIn() {
        const { width: logicalW, height: logicalH } = this.getLogicalDims();
        const center = { x: logicalW / 2, y: logicalH / 2 };
        this.zoomAtPoint(center.x, center.y, 1.25);
    }

    zoomOut() {
        const { width: logicalW, height: logicalH } = this.getLogicalDims();
        const center = { x: logicalW / 2, y: logicalH / 2 };
        this.zoomAtPoint(center.x, center.y, 0.8);
    }

    fitToWidth(marginPX = 20) {
        const { width: viewW } = this.getLogicalDims();
        const pageWidth = this.app.pageManager.getPageWidth();

        // Target: %90 genişliğe sığdır (Kenar boşlukları için)
        const safeFactor = 0.9;
        let targetZoom = (viewW * safeFactor) / pageWidth;

        targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));
        this.zoom = targetZoom;

        // Yatayda ortala
        const scaledWidth = pageWidth * this.zoom;
        this.pan.x = (viewW - scaledWidth) / 2;

        // Tepeden başlat
        this.pan.y = 40;

        this.updateUI();
        this.clampPan();
    }

    resetZoom() {
        this.zoom = 1;
        this.pan = { x: 20, y: 20 };
        this.updateUI();
        this.clampPan();
    }

    getPointerWorldPos(e) {
        // CSS Pixels -> Screen Space -> World Space
        const screenX = e.offsetX;
        const screenY = e.offsetY;

        const worldX = (screenX - this.pan.x) / this.zoom;
        const worldY = (screenY - this.pan.y) / this.zoom;

        return {
            x: worldX,
            y: worldY,
            pressure: e.pressure !== undefined ? e.pressure : 0.5
        };
    }

    getViewportBounds() {
        const { width: viewW, height: viewH } = this.getLogicalDims();
        return {
            x: -this.pan.x / this.zoom,
            y: -this.pan.y / this.zoom,
            width: viewW / this.zoom,
            height: viewH / this.zoom
        };
    }

    updateUI() {
        if (this.isEditingZoom) return;
        const display = document.getElementById('zoomLevelDisplay');
        if (display) {
            display.textContent = `${Math.round(this.zoom * 100)}%`;
        }
    }

    enableZoomInput() {
        if (this.isEditingZoom) return;
        this.isEditingZoom = true;

        const display = document.getElementById('zoomLevelDisplay');
        const btn = document.getElementById('zoomResetBtn');
        if (!display || !btn) {
            this.isEditingZoom = false;
            return;
        }

        const currentVal = Math.round(this.zoom * 100);
        display.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentVal;
        input.className = 'zoom-input';

        btn.appendChild(input);
        input.focus();
        input.select();

        // Stop propagation so clicking input doesn't trigger button click loop or other things
        input.addEventListener('click', (e) => e.stopPropagation());

        const save = () => {
            let val = parseInt(input.value);
            if (!isNaN(val)) {
                val = Math.max(10, Math.min(500, val));
                const { width: logicalW, height: logicalH } = this.getLogicalDims();
                const center = { x: logicalW / 2, y: logicalH / 2 };
                const targetZoom = val / 100;
                const factor = targetZoom / this.zoom;
                this.zoomAtPoint(center.x, center.y, factor);
            }
            this.finishEditingZoom();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                save();
            } else if (e.key === 'Escape') {
                this.isEditingZoom = false;
                this.finishEditingZoom();
            }
        });

        input.addEventListener('blur', () => {
            if (this.isEditingZoom) save();
        });
    }

    finishEditingZoom() {
        this.isEditingZoom = false;
        const display = document.getElementById('zoomLevelDisplay');
        const btn = document.getElementById('zoomResetBtn');

        if (btn) {
            const input = btn.querySelector('input');
            if (input) btn.removeChild(input);
        }

        if (display) {
            display.style.display = 'inline';
        }

        this.updateUI();
    }

    handleTouchDown(e) {
        // 1. Stylus Priority: If a stylus was used very recently, ignore new touches
        if (Date.now() - this.lastStylusTime < this.STYLUS_GRACE_PERIOD) {
            return;
        }

        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 1) {
            const isPhone = this.app.deviceType === 'phone';
            const isDrawingMode = this.app.state.currentTool !== 'hand';

            if (isPhone && isDrawingMode) {
                this.isPanning = false;
            } else {
                this.startPan(e);
            }
        } else if (this.activePointers.size === 2) {
            const distance = this.getGestureDistance();

            // 2. Minimum Distance: Ignore if "fingers" are too close (likely palm+pen error)
            if (distance < this.MIN_PINCH_DISTANCE) {
                return;
            }

            this.isPinching = true;
            this.isPanning = false; // Stop one-finger pan when second finger arrives
            this.lastPinchDistance = distance;
            this.lastPinchCenter = this.getGestureCenter();
        }
    }

    handleTouchMove(e) {
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.isPinching && this.activePointers.size === 2) {
            this.handlePinch(e);
        } else if (this.isPanning && this.activePointers.size === 1) {
            // Re-using the logic from updatePan but ensuring we use the correct pointer
            const { width: logicalW } = this.getLogicalDims();
            const cssW = this.app.canvas.clientWidth;
            const scale = (cssW > 0) ? (logicalW / cssW) : 1;

            const deltaX = (e.clientX - this.lastMousePos.x) * scale;
            const deltaY = (e.clientY - this.lastMousePos.y) * scale;

            this.pan.x += deltaX;
            this.pan.y += deltaY;

            this.lastMousePos = { x: e.clientX, y: e.clientY };

            this.updateUI();
            this.clampPan();
            this.syncActivePageByScroll();
        }
    }

    handleTouchUp(e) {
        this.activePointers.delete(e.pointerId);

        if (this.activePointers.size < 2) {
            this.isPinching = false;
            this.lastPinchDistance = 0;
            this.lastPinchCenter = null;
        }

        if (this.activePointers.size === 0) {
            this.endPan();
        } else if (this.activePointers.size === 1) {
            // If one finger remains, resume panning from its current position
            // ONLY if we are in panning mode (not drawing mode on phone)
            const isPhone = this.app.deviceType === 'phone';
            const isDrawingMode = this.app.state.currentTool !== 'hand';

            if (!isPhone || !isDrawingMode) {
                const remainingPointer = this.activePointers.values().next().value;
                this.lastMousePos = { x: remainingPointer.x, y: remainingPointer.y };
                this.isPanning = true;
            }
        }
    }

    getGestureDistance() {
        const pts = Array.from(this.activePointers.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getGestureCenter() {
        const pts = Array.from(this.activePointers.values());
        if (pts.length < 2) return null;
        return {
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2
        };
    }

    handlePinch(e) {
        const currentDistance = this.getGestureDistance();
        const currentCenter = this.getGestureCenter();

        // 3. Minimum Distance Check during move
        if (currentDistance < this.MIN_PINCH_DISTANCE) return;

        if (this.lastPinchCenter && this.lastPinchDistance > 0 && currentDistance > 0) {
            // Calculate Pan Delta
            const dx = currentCenter.x - this.lastPinchCenter.x;
            const dy = currentCenter.y - this.lastPinchCenter.y;

            // Apply Pan Translation
            // clientX/Y'dan delta aldiğimiz için doğrudan CSS pikselleriyle pan yapabiliriz
            this.pan.x += dx;
            this.pan.y += dy;

            const factor = currentDistance / this.lastPinchDistance;

            // 4. Zoom Sensitivity Threshold: Ignore micro-jitters
            if (Math.abs(factor - 1) >= this.ZOOM_THRESHOLD) {
                // Zoom center point (current center of two touches)
                const rect = this.app.canvas.getBoundingClientRect();
                const localX = currentCenter.x - rect.left;
                const localY = currentCenter.y - rect.top;

                this.zoomAtPoint(localX, localY, factor);
                this.lastPinchDistance = currentDistance;
            }

            this.updateUI();
            this.clampPan();
            this.syncActivePageByScroll();
        }

        this.lastPinchCenter = currentCenter;
    }

    startPan(e) {
        this.isPanning = true;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        this.app.canvas.style.cursor = 'grabbing';
    }

    updatePan(e) {
        if (!this.isPanning) return;

        const { width: logicalW } = this.getLogicalDims();
        const cssW = this.app.canvas.clientWidth;
        const scale = (cssW > 0) ? (logicalW / cssW) : 1;

        const deltaX = (e.clientX - this.lastMousePos.x) * scale;
        const deltaY = (e.clientY - this.lastMousePos.y) * scale;

        this.pan.x += deltaX;
        this.pan.y += deltaY;

        this.lastMousePos = { x: e.clientX, y: e.clientY };

        this.updateUI();
        this.clampPan();

        // Sayfalar arası geçişi senkronize et
        this.syncActivePageByScroll();
    }

    endPan() {
        this.isPanning = false;
        // Cursor reset is handled by App based on key state or tool
    }
}
