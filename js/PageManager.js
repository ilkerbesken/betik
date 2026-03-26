class PageManager {
    constructor(app) {
        this.app = app;
        this.pages = [];
        this.currentPageIndex = -1;
        this.sidebar = document.getElementById('pageSidebar');
        this.pageListContainer = document.getElementById('pageList');
        this.addPageBtn = document.getElementById('btnAddPage');
        this.addPageBtnSidebar = document.getElementById('btnAddPageSidebar');
        this.toggleSidebarBtn = document.getElementById('btnTogglePageSidebar');
        this.toggleViewBtn = document.getElementById('btnTogglePageView');
        this.prevPageBtn = document.getElementById('btnPrevPage');
        this.nextPageBtn = document.getElementById('btnNextPage');
        this.overlay = document.getElementById('bottomSheetOverlay');


        this.viewMode = 'list'; // 'list' or 'grid'
        this.pageGap = 100; // Sayfalar arası boşluk

        this.init();
    }

    /**
     * Tüm sayfaları temizle ve başlangıç durumuna dön
     */
    clear() {
        this.pages = [];
        this.currentPageIndex = -1;
        this.app.state.objects = [];
    }

    getPageHeight() {
        const page = this.pages[this.currentPageIndex];
        if (page && page.pdfDimensions) {
            return page.pdfDimensions.height;
        }

        // Sabit mantıksal boyutlar - CanvasSettings ve app.js ile aynı olmalı
        const LOGICAL_HEIGHT = (typeof CANVAS_CONSTANTS !== 'undefined') ? CANVAS_CONSTANTS.LOGICAL_HEIGHT : 1123;

        if (this.app.canvasSettings) {
            const size = this.app.canvasSettings.settings.size;
            if (size === 'full') {
                return LOGICAL_HEIGHT; // Sabit mantıksal yükseklik
            }
            const dimensions = this.app.canvasSettings.sizes[size];
            return this.app.canvasSettings.settings.orientation === 'portrait' ? dimensions.height : dimensions.width;
        }
        return 1123; // A4 default
    }

    getPageWidth() {
        const page = this.pages[this.currentPageIndex];
        if (page && page.pdfDimensions) {
            return page.pdfDimensions.width;
        }

        // Sabit mantıksal boyutlar - CanvasSettings ve app.js ile aynı olmalı
        const LOGICAL_WIDTH = (typeof CANVAS_CONSTANTS !== 'undefined') ? CANVAS_CONSTANTS.LOGICAL_WIDTH : 794;

        if (this.app.canvasSettings) {
            const size = this.app.canvasSettings.settings.size;
            if (size === 'full') {
                return LOGICAL_WIDTH; // Sabit mantıksal genişlik
            }
            const dimensions = this.app.canvasSettings.sizes[size];
            return this.app.canvasSettings.settings.orientation === 'portrait' ? dimensions.width : dimensions.height;
        }
        return 794; // A4 default
    }

    getPageY(index) {
        if (index <= 0) return 0;
        const h = this.getPageHeight();
        return index * (h + this.pageGap);
    }

    getPageIndexAt(y) {
        const h = this.getPageHeight();
        const fullH = h + this.pageGap;
        let index = Math.floor(y / fullH);
        return Math.max(0, Math.min(index, this.pages.length - 1));
    }

    getTotalHeight() {
        if (this.pages.length === 0) return 0;
        return this.getPageY(this.pages.length - 1) + this.getPageHeight();
    }

    init() {
        this.pages.push({
            id: Date.now(),
            name: 'Sayfa 1',
            objects: [...this.app.state.objects],
            backgroundColor: this.app.canvasSettings ? this.app.canvasSettings.settings.backgroundColor : 'white',
            backgroundPattern: this.app.canvasSettings ? this.app.canvasSettings.settings.pattern : 'none',
            thumbnail: null
        });

        if (this.addPageBtn) {
            this.addPageBtn.addEventListener('click', () => this.addNewPage());
        }
        if (this.addPageBtnSidebar) {
            this.addPageBtnSidebar.addEventListener('click', () => this.addNewPage());
        }

        if (this.toggleSidebarBtn) {
            this.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());
        }

        if (this.toggleViewBtn) {
            this.toggleViewBtn.addEventListener('click', () => this.toggleViewMode());
        }

        if (this.prevPageBtn) {
            this.prevPageBtn.addEventListener('click', () => this.goToPrevPage());
        }

        if (this.nextPageBtn) {
            this.nextPageBtn.addEventListener('click', () => this.goToNextPage());
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', () => {
                if (this.sidebar && !this.sidebar.classList.contains('collapsed')) {
                    this.toggleSidebar();
                }
            });
        }

        this.renderPageList();

    }

    toggleViewMode() {
        this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
        this.renderPageList();
    }

    goToPrevPage() {
        if (this.currentPageIndex > 0) {
            this.switchPage(this.currentPageIndex - 1);
        }
    }

    goToNextPage() {
        if (this.currentPageIndex < this.pages.length - 1) {
            this.switchPage(this.currentPageIndex + 1);
        }
    }

    toggleSidebar() {
        if (this.sidebar) {
            const isCollapsed = this.sidebar.classList.contains('collapsed');
            this.sidebar.classList.toggle('collapsed');

            // Toggle overlay
            if (this.overlay) {
                if (isCollapsed) {
                    this.overlay.classList.add('show');
                } else {
                    this.overlay.classList.remove('show');
                }
            }

            // Re-render thumbnails if expanded
            if (isCollapsed) {
                this.updateCurrentPageThumbnail();
            }
        }
    }


    addNewPage() {
        // Mevcut sayfayı kaydet
        this.saveCurrentPageState();

        // Yeni sayfa oluştur (Mevcut sayfanın ayarlarını kopyalayabiliriz)
        const prevPage = this.pages[this.currentPageIndex];
        const newPage = {
            id: Date.now(),
            name: `Sayfa ${this.pages.length + 1}`,
            objects: [],
            backgroundColor: prevPage ? prevPage.backgroundColor : '#ffffff',
            backgroundPattern: prevPage ? prevPage.backgroundPattern : 'none',
            thumbnail: null
        };

        this.pages.push(newPage);
        this.switchPage(this.pages.length - 1);
    }

    switchPage(index, shouldScroll = true, shouldSave = true) {
        if (index < 0 || index >= this.pages.length) return;

        // Mevcut durumu kaydet (Geçiş yapmadan önce, eğer isteniyorsa)
        if (shouldSave) {
            this.saveCurrentPageState();
        }

        // Yeni sayfaya geç
        this.currentPageIndex = index;
        const page = this.pages[index];

        // Uygulama durumunu güncelle (Bu sayfanın nesnelerini aktif listeye yükle)
        this.app.state.objects = Utils.deepClone(page.objects);

        // Arkaplan ayarlarını yükle
        if (this.app.canvasSettings) {
            this.app.canvasSettings.settings.backgroundColor = page.backgroundColor || 'white';
            this.app.canvasSettings.settings.pattern = page.backgroundPattern || 'none';

            // UI'ı güncelle
            if (this.app.canvasSettings.loadSettingsToPanel) {
                this.app.canvasSettings.loadSettingsToPanel();
            }
            // Gerçekten uygula (Eksik olan buydu!)
            this.app.canvasSettings.applySettings(this.app.canvas, this.app.ctx);
        }

        // Eğer kaydırma isteniyorsa (Sidebar tıklaması veya navigasyon butonları)
        if (shouldScroll && this.app.zoomManager) {
            // Sayfayı dikeyde en tepeye getir (Zoom faktörünü hesaba katarak)
            this.app.zoomManager.pan.y = -this.getPageY(index) * this.app.zoomManager.zoom;
        }

        // Seçimi temizle
        if (this.app.tools.select) {
            this.app.tools.select.selectedObjects = [];
        }

        // Kanvası temizle ve yeniden çiz
        this.app.redrawOffscreen();
        this.app.render();

        this.renderPageList();
    }

    saveCurrentPageState(force = false, skipClone = false) {
        if (this.currentPageIndex >= 0 && this.currentPageIndex < this.pages.length) {
            const page = this.pages[this.currentPageIndex];
            
            // Only deepClone if not skipped. Skipping clone is useful for performance
            // when we know we will serialize the live state immediately (e.g. autosave).
            if (!skipClone) {
                page.objects = Utils.deepClone(this.app.state.objects);
            }
            
            if (this.app.canvasSettings) {
                page.backgroundColor = this.app.canvasSettings.settings.backgroundColor;
                page.backgroundPattern = this.app.canvasSettings.settings.pattern;
            }

            // Only update thumbnail if forced or enough time has passed (30s)
            // This prevents lag during heavy drawing/autosaving
            const now = Date.now();
            const shouldUpdateThumb = force || !page._lastThumbTime || (now - page._lastThumbTime > 30000);

            if (shouldUpdateThumb) {
                this.updateCurrentPageThumbnail(force);
            }
        }
    }

    updateCurrentPageThumbnail(force = false) {
        this.updatePageThumbnail(this.currentPageIndex, force);
    }

    /**
     * Belirli bir sayfanın küçük resmini güncelle
     */
    updatePageThumbnail(index, force = false, skipRender = false) {
        if (!this.app.canvas || index < 0 || index >= this.pages.length) return;

        // If not forced, only update if the sidebar is actually visible to save CPU
        const sidebarVisible = this.sidebar && !this.sidebar.classList.contains('collapsed');
        if (!force && !sidebarVisible) return;

        const page = this.pages[index];

        // Küçük bir küçük resim oluştur
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        const scale = 0.15; // Küçük resim ölçeği

        // Boyutları sayfa yapısına göre belirle
        let w = this.getPageWidth();
        let h = this.getPageHeight();

        if (page.pdfDimensions) {
            w = page.pdfDimensions.width;
            h = page.pdfDimensions.height;
        }

        if (w <= 0 || h <= 0) return;

        tempCanvas.width = w * scale;
        tempCanvas.height = h * scale;

        // Arkaplanı çiz
        const bgColor = (this.app.canvasSettings && this.app.canvasSettings.colors[page.backgroundColor])
            ? this.app.canvasSettings.colors[page.backgroundColor]
            : (page.backgroundColor || '#ffffff');

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // PDF Arkaplanını çiz (Eğer varsa)
        const isPdfBoard = this.app.pdfManager && this.app.pdfManager.isLoaded;
        if (isPdfBoard) {
            this.app.pdfManager.drawToContext(ctx, page, 0, 0, tempCanvas.width, tempCanvas.height);
        }

        // Nesneleri çiz
        ctx.save();
        ctx.scale(scale, scale);

        // Eğer güncel sayfaysa state.objects kullan, değilse sayfanın kendi objelerini kullan
        const objectsToDraw = (index === this.currentPageIndex)
            ? this.app.state.objects
            : (page.objects || []);

        objectsToDraw.forEach(obj => {
            this.app.drawObject(ctx, obj);
        });
        ctx.restore();

        try {
            page.thumbnail = tempCanvas.toDataURL('image/png', 0.4); // Lower quality for thumbnails
            page._lastThumbTime = Date.now();
        } catch (e) {
            console.warn("Could not generate thumbnail due to security restrictions (tainted canvas).", e);
            page.thumbnail = null; // Fallback
        }

        if (!skipRender && (sidebarVisible || force)) {
            this.renderPageList();
        }
    }

    /**
     * Tüm sayfaların küçük resimlerini yenile (Asenkron ve parça parça)
     */
    refreshAllThumbnails() {
        const total = this.pages.length;
        if (total === 0) return;

        // 1. Önce aktif sayfanınkini hemen yap (Kullanıcı görsün)
        this.updatePageThumbnail(this.currentPageIndex, true, false);

        // 2. Kalanları arka planda yap (İşlemciyi yormamak için)
        let index = 0;
        const processBatch = () => {
            const batchSize = 2; // Her adımda 2 sayfa işle
            const end = Math.min(index + batchSize, total);

            for (; index < end; index++) {
                if (index !== this.currentPageIndex) {
                    this.updatePageThumbnail(index, true, true);
                }
            }

            if (index < total) {
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(processBatch, { timeout: 2000 });
                } else {
                    setTimeout(processBatch, 100);
                }
            } else {
                this.renderPageList();
            }
        };

        // Gecikmeli başlat
        setTimeout(processBatch, 200);
    }

    deletePage(index, event) {
        if (event) event.stopPropagation();
        if (this.pages.length <= 1) return;

        this.pages.splice(index, 1);

        if (this.currentPageIndex >= index) {
            this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);
        }

        const page = this.pages[this.currentPageIndex];
        this.app.state.objects = Utils.deepClone(page.objects);
        this.app.redrawOffscreen();
        this.app.render();
        this.renderPageList();
    }

    duplicatePage(index, event) {
        if (event) event.stopPropagation();

        // Save current state if we are duplicatin current page
        if (index === this.currentPageIndex) {
            this.saveCurrentPageState();
        }

        const sourcePage = this.pages[index];
        const newPage = {
            id: Date.now() + Math.random(),
            name: `${sourcePage.name} (Kopyası)`,
            objects: Utils.deepClone(sourcePage.objects),
            backgroundColor: sourcePage.backgroundColor,
            backgroundPattern: sourcePage.backgroundPattern,
            thumbnail: sourcePage.thumbnail,
            pdfDimensions: sourcePage.pdfDimensions ? { ...sourcePage.pdfDimensions } : null,
            ocrData: sourcePage.ocrData ? Utils.deepClone(sourcePage.ocrData) : null
        };

        // Insert after the source page
        this.pages.splice(index + 1, 0, newPage);

        // Automatically switch to the new page
        this.switchPage(index + 1);
    }

    renderPageList() {
        if (!this.pageListContainer) return;

        // Navigasyon butonlarını güncelle
        if (this.prevPageBtn) this.prevPageBtn.disabled = this.currentPageIndex === 0;
        if (this.nextPageBtn) this.nextPageBtn.disabled = this.currentPageIndex === this.pages.length - 1;

        this.pageListContainer.innerHTML = '';
        this.pageListContainer.className = `page-list ${this.viewMode}-view`;

        this.pages.forEach((page, index) => {
            const item = document.createElement('div');
            item.className = `page-item ${index === this.currentPageIndex ? 'active' : ''}`;
            item.setAttribute('draggable', 'true');
            item.dataset.index = index;

            // Drag and Drop Events
            item.addEventListener('dragstart', (e) => this.handleDragStart(e, index));
            item.addEventListener('dragover', (e) => this.handleDragOver(e));
            item.addEventListener('drop', (e) => this.handleDrop(e, index));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));

            item.onclick = () => this.switchPage(index);

            const thumb = document.createElement('div');
            thumb.className = 'page-thumb';

            // Arkaplan rengini doğru eşle
            const thumbBgColor = (this.app.canvasSettings && this.app.canvasSettings.colors[page.backgroundColor])
                ? this.app.canvasSettings.colors[page.backgroundColor]
                : (page.backgroundColor || '#ffffff');
            thumb.style.backgroundColor = thumbBgColor;

            if (page.thumbnail) {
                thumb.style.backgroundImage = `url(${page.thumbnail})`;
            }

            const info = document.createElement('div');
            info.className = 'page-info';

            const name = document.createElement('span');
            name.className = 'page-name';
            name.textContent = page.name;
            name.title = 'İsim değiştirmek için çift tıklayın';

            // Rename logic
            name.addEventListener('click', (e) => {
                e.stopPropagation(); // Tek tıklamanın switchPage'i tetiklemesini engelle
            });

            name.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'page-name-input';
                input.value = page.name;

                const saveName = () => {
                    const newName = input.value.trim() || page.name;
                    this.renamePage(index, newName);
                };

                input.addEventListener('blur', saveName);
                input.addEventListener('keydown', (ke) => {
                    if (ke.key === 'Enter') saveName();
                    if (ke.key === 'Escape') this.renderPageList();
                });

                name.replaceWith(input);
                input.focus();
                input.select();
            });

            const actions = document.createElement('div');
            actions.className = 'page-actions';

            if (this.pages.length > 1) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-delete-page';
                deleteBtn.innerHTML = '×';
                deleteBtn.title = 'Sayfayı Sil';
                deleteBtn.onclick = (e) => this.deletePage(index, e);
                actions.appendChild(deleteBtn);
            }

            // Duplicate Button
            const duplicateBtn = document.createElement('button');
            duplicateBtn.className = 'btn-duplicate-page';
            duplicateBtn.innerHTML = `<app-icon name="copy-03" style="width: 14px; height: 14px; opacity: 0.6;"></app-icon>`;
            duplicateBtn.title = 'Sayfayı Çoğalt';
            duplicateBtn.onclick = (e) => this.duplicatePage(index, e);
            actions.appendChild(duplicateBtn);

            item.appendChild(thumb);
            info.appendChild(name);
            item.appendChild(info);
            item.appendChild(actions);

            this.pageListContainer.appendChild(item);
        });
    }

    handleDragStart(e, index) {
        this.draggedIndex = index;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Set a ghost image if needed, or just let default handle it
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const target = e.currentTarget;
        if (target && target.classList.contains('page-item')) {
            target.classList.add('drag-over');
        }
    }

    handleDragEnd(e) {
        document.querySelectorAll('.page-item').forEach(item => {
            item.classList.remove('dragging', 'drag-over');
        });
    }

    handleDrop(e, targetIndex) {
        e.preventDefault();
        if (this.draggedIndex === undefined || this.draggedIndex === targetIndex) return;

        // Sayfaların yerini değiştir
        const draggedPage = this.pages[this.draggedIndex];

        // Önce sürükleneni çıkar
        this.pages.splice(this.draggedIndex, 1);
        // Sonra hedef noktaya ekle
        this.pages.splice(targetIndex, 0, draggedPage);

        // Mevcut sayfa indexini güncelle
        if (this.currentPageIndex === this.draggedIndex) {
            this.currentPageIndex = targetIndex;
        } else if (this.currentPageIndex > this.draggedIndex && this.currentPageIndex <= targetIndex) {
            this.currentPageIndex--;
        } else if (this.currentPageIndex < this.draggedIndex && this.currentPageIndex >= targetIndex) {
            this.currentPageIndex++;
        }

        this.renderPageList();
    }

    renamePage(index, newName) {
        if (this.pages[index]) {
            this.pages[index].name = newName;
            this.renderPageList();
        }
    }
}
