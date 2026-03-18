class GrabImageTool {
    constructor(app) {
        this.app = app;
        this.selection = null; // {x, y, w, h} in page local coordinates
        this.isDragging = false;
        this.isResizing = false;
        this.activeHandle = null;
        this.dragStart = null; // World coordinates
        this.handleSize = 10;
        this.menu = null;
    }

    get isDrawing() {
        return this.isDragging || this.isResizing;
    }

    deactivate() {
        this.selection = null;
        this.hideMenu();
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        const point = { x: pos.x, y: pos.y };

        // If menu is open, and we click elsewhere, close it?
        // Actually, the user says "click outside to show menu".

        if (this.selection) {
            // Check handles (for resizing)
            const handle = this.getHandleAt(point, state);
            if (handle) {
                this.isResizing = true;
                this.activeHandle = handle;
                this.dragStart = { ...point };
                this.hideMenu();
                return true;
            }

            // Check if inside (for dragging)
            if (this.isPointInside(point)) {
                this.isDragging = true;
                this.dragStart = { ...point };
                this.hideMenu();
                return true;
            }

            // Clicked outside - Show options or start new selection
            if (Math.abs(this.selection.w) > 5 && Math.abs(this.selection.h) > 5) {
                this.showMenu(e, canvas);
                return true;
            }
        }

        // Start new selection
        this.selection = { x: point.x, y: point.y, w: 0, h: 0 };
        this.isResizing = true;
        this.activeHandle = 'se';
        this.dragStart = { ...point };
        this.hideMenu();
        return true;
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.dragStart) return false;

        const point = { x: pos.x, y: pos.y };
        const dx = point.x - this.dragStart.x;
        const dy = point.y - this.dragStart.y;

        if (this.isResizing) {
            if (this.activeHandle === 'se') {
                this.selection.w += dx;
                this.selection.h += dy;
            } else if (this.activeHandle === 'nw') {
                this.selection.x += dx;
                this.selection.y += dy;
                this.selection.w -= dx;
                this.selection.h -= dy;
            } else if (this.activeHandle === 'ne') {
                this.selection.y += dy;
                this.selection.w += dx;
                this.selection.h -= dy;
            } else if (this.activeHandle === 'sw') {
                this.selection.x += dx;
                this.selection.w -= dx;
                this.selection.h += dy;
            }
            this.dragStart = { ...point };
            return true;
        }

        if (this.isDragging) {
            this.selection.x += dx;
            this.selection.y += dy;
            this.dragStart = { ...point };
            return true;
        }

        return false;
    }

    handlePointerUp() {
        this.isDragging = false;
        this.isResizing = false;
        this.activeHandle = null;
        this.dragStart = null;

        // Correct negative w/h
        if (this.selection) {
            if (this.selection.w < 0) {
                this.selection.x += this.selection.w;
                this.selection.w = Math.abs(this.selection.w);
            }
            if (this.selection.h < 0) {
                this.selection.y += this.selection.h;
                this.selection.h = Math.abs(this.selection.h);
            }
        }
        this.app.needsRender = true;
        return null;
    }

    getHandleAt(point, state) {
        if (!this.selection) return null;
        const { x, y, w, h } = this.selection;
        const hs = this.handleSize / (this.app.zoomManager.zoom || 1);

        const handles = {
            nw: { x, y },
            ne: { x: x + w, y },
            sw: { x, y: y + h },
            se: { x: x + w, y: y + h }
        };

        for (const [key, pos] of Object.entries(handles)) {
            if (Math.abs(point.x - pos.x) < hs && Math.abs(point.y - pos.y) < hs) {
                return key;
            }
        }
        return null;
    }

    isPointInside(point) {
        if (!this.selection) return false;
        const { x, y, w, h } = this.selection;
        return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
    }

    draw(ctx, zoom) {
        if (!this.selection) return;

        const { x, y, w, h } = this.selection;
        const hs = this.handleSize / zoom;

        ctx.save();

        // Draw Overlay (dim outside)
        // This is tricky because we are inside a clipped/translated context in app.js.
        // But app.js calls this within the page's translate.
        // We'll just draw a dashed rect for now.

        ctx.strokeStyle = '#00a8ff';
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(x, y, w, h);

        // Fill selection with subtle highlight
        ctx.fillStyle = 'rgba(0, 168, 255, 0.1)';
        ctx.fillRect(x, y, w, h);

        // Draw handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#00a8ff';
        const handleX = [x, x + w];
        const handleY = [y, y + h];

        handleX.forEach(hx => {
            handleY.forEach(hy => {
                ctx.beginPath();
                ctx.arc(hx, hy, hs / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        });

        ctx.restore();
    }

    showMenu(e, canvas) {
        this.hideMenu();

        const menu = document.createElement('div');
        menu.id = 'grabImageMenu';
        menu.className = 'grab-image-menu';
        menu.style.position = 'fixed';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.style.zIndex = '10000';

        const options = [
            { label: 'Yapıştır', icon: '📥', action: () => this.pasteToCanvas() },
            { label: 'Kopyala', icon: '📋', action: () => this.copyToClipboard() },
            { label: 'Paylaş', icon: '🔗', action: () => this.showShareSubMenu(e, canvas) },
            { label: 'Kaydet', icon: '💾', action: () => this.saveImage() },
            { label: 'İptal', icon: '✕', action: () => this.hideMenu() }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'grab-menu-item';
            btn.innerHTML = `<span>${opt.icon}</span> ${opt.label}`;
            btn.onclick = (event) => {
                event.stopPropagation();
                if (opt.label === 'Paylaş') {
                    opt.action();
                } else {
                    opt.action();
                    this.hideMenu();
                }
            };
            menu.appendChild(btn);
        });

        document.body.appendChild(menu);
        this.menu = menu;

        // Ensure menu is within viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }

        // Click anywhere to close menu
        const closeMenu = (event) => {
            if (!menu.contains(event.target)) {
                this.hideMenu();
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeMenu), 10);
    }

    hideMenu() {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
        if (this.shareSubMenu) {
            this.shareSubMenu.remove();
            this.shareSubMenu = null;
        }
    }

    showShareSubMenu(e, canvas) {
        if (this.shareSubMenu) {
            this.shareSubMenu.remove();
            this.shareSubMenu = null;
        }

        const subMenu = document.createElement('div');
        subMenu.className = 'grab-image-menu share-submenu';
        subMenu.style.position = 'fixed';
        subMenu.style.left = (e.clientX + 150) + 'px';
        subMenu.style.top = e.clientY + 'px';
        subMenu.style.zIndex = '10001';

        const shareOptions = [
            { label: 'Sistem Paylaşımı', icon: '📱', action: () => this.shareImage() },
            { label: 'Google Drive', icon: '☁️', action: () => this.saveToGoogleDrive() },
            { label: 'E-posta Gönder', icon: '📧', action: () => this.shareViaEmail() },
            { label: 'Panoya Kopyala', icon: '📋', action: () => this.copyToClipboard() }
        ];

        shareOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'grab-menu-item';
            btn.innerHTML = `<span>${opt.icon}</span> ${opt.label}`;
            btn.onclick = (event) => {
                event.stopPropagation();
                opt.action();
                this.hideMenu();
            };
            subMenu.appendChild(btn);
        });

        document.body.appendChild(subMenu);
        this.shareSubMenu = subMenu;

        // Ensure subMenu is within viewport
        const rect = subMenu.getBoundingClientRect();
        const mainRect = this.menu.getBoundingClientRect();

        // Try Right
        let left = mainRect.right + 10;
        if (left + rect.width > window.innerWidth) {
            // Try Left
            left = mainRect.left - rect.width - 10;
        }

        subMenu.style.left = left + 'px';

        if (rect.bottom > window.innerHeight) {
            subMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
    }

    async pasteToCanvas() {
        const canvas = await this.captureArea();
        if (!canvas) return;

        const dataUrl = canvas.toDataURL('image/png');

        // Use app.insertImage to add it to canvas
        this.app.insertImage(dataUrl);

        this.selection = null;
        this.app.needsRender = true;
    }

    async captureArea() {
        if (!this.selection) return null;

        const { x, y, w, h } = this.selection;
        if (w < 1 || h < 1) return null;

        const pageY = this.app.pageManager.getPageY(this.app.pageManager.currentPageIndex);

        // We need to capture from the offscreen canvas but at full resolution if possible,
        // or just capture what's visible.
        // Actually, we can draw the relevant area to a new canvas.

        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = w;
        captureCanvas.height = h;
        const cCtx = captureCanvas.getContext('2d');

        // Translate to capture area
        cCtx.translate(-x, -y);

        // Draw everything from current page to this canvas
        // We need a version of drawObject that works for any context.
        // BetikApp.drawObject is available.

        // Draw background
        const page = this.app.pageManager.pages[this.app.pageManager.currentPageIndex];
        const pageWidth = this.app.pageManager.getPageWidth();
        const pageHeight = this.app.pageManager.getPageHeight();

        this.app.canvasSettings.drawBackground(captureCanvas, cCtx,
            { x: 0, y: 0, width: pageWidth, height: pageHeight },
            null, null, 1,
            { color: page.backgroundColor, pattern: page.backgroundPattern }
        );

        // Draw PDF background if available
        this.app.pdfManager.drawToContext(cCtx, page, 0, 0, pageWidth, pageHeight);

        // Draw objects
        this.app.state.objects.forEach(obj => this.app.drawObject(cCtx, obj));

        return captureCanvas;
    }

    async copyToClipboard() {
        const canvas = await this.captureArea();
        if (!canvas) return;

        canvas.toBlob(async blob => {
            try {
                const data = [new ClipboardItem({ 'image/png': blob })];
                await navigator.clipboard.write(data);
                console.log('Resim panoya kopyalandı.');
                this.selection = null;
                this.app.needsRender = true;
            } catch (err) {
                console.error('Panoya kopyalanamadı:', err);
                Utils.showToast('Panoya kopyalanamadı. Tarayıcınız desteklemiyor olabilir.', 'error');
            }
        });
    }

    async shareImage() {
        const canvas = await this.captureArea();
        if (!canvas) return;

        canvas.toBlob(async blob => {
            const file = new File([blob], 'ekran_goruntusu.png', { type: 'image/png' });
            if (navigator.share && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Betik Ekran Görüntüsü',
                        text: 'Betik ile yakalandı'
                    });
                    this.selection = null;
                    this.app.needsRender = true;
                } catch (err) {
                    console.error('Paylaşılamadı:', err);
                }
            } else {
                Utils.showToast('Tarayıcınız dosya paylaşımını desteklemiyor.', 'info');
            }
        });
    }

    async saveImage() {
        const canvas = await this.captureArea();
        if (!canvas) return;

        const fileName = 'betik_ekran_yakalama_' + Date.now() + '.png';

        // Check if we have a native file system handle
        const fsm = window.fileSystemManager;
        if (fsm && fsm.mode === 'native' && fsm.dirHandle) {
            try {
                canvas.toBlob(async blob => {
                    const fileHandle = await fsm.dirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    console.log(`Resim kaydedildi: ${fileName}`);
                });
                this.selection = null;
                this.app.needsRender = true;
                return;
            } catch (err) {
                console.warn('Yerel klasöre kaydedilemedi, indirmeye yönlendiriliyor:', err);
            }
        }

        // Fallback to download
        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();

        this.selection = null;
        this.app.needsRender = true;
    }

    async saveToGoogleDrive() {
        const canvas = await this.captureArea();
        if (!canvas) return;

        const fileName = 'betik_capture_' + Date.now() + '.png';
        const csm = this.app.cloudStorageManager;
        if (!csm) {
            Utils.showToast('Bulut depolama sistemi hazır değil.', 'warning');
            return;
        }

        canvas.toBlob(async blob => {
            try {
                await csm.uploadImage(blob, fileName);
                Utils.showToast('Google Drive\'a kaydedildi!', 'success');
                this.selection = null;
                this.app.needsRender = true;
            } catch (err) {
                console.error('Google Drive hatası:', err);
                Utils.showToast('Google Drive\'a kaydedilemedi: ' + err.message, 'error');
            }
        });
    }

    async shareViaEmail() {
        const canvas = await this.captureArea();
        if (!canvas) return;

        // mailto doesn't support attachments well. 
        // Best we can do is system share if available, or direct them to copy and paste.
        if (navigator.share && navigator.canShare) {
            this.shareImage();
        } else {
            const subject = encodeURIComponent('Betik Ekran Görüntüsü');
            const body = encodeURIComponent('Ekran görüntüsünü kopyalayıp buraya yapıştırabilirsiniz.');
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
            Utils.showToast('E-posta açıldı. Lütfen görüntüyü kopyalayıp yapıştırın.', 'info');
        }
    }
}
