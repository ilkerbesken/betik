class BetikApp {
    deactivatePdfTextSelection() {
        this.state.pdfTextSelectionActive = false;
        if (this.pdfManager && this.pdfManager.textSelector) {
            this.pdfManager.textSelector.isActive = false;
            if (this.pdfManager.textSelector.layerContainer) {
                this.pdfManager.textSelector.textLayers.forEach(div => {
                    div.classList.remove('active');
                });
            }
        }
        const btnTextSelect = document.getElementById('btnTextSelect');
        if (btnTextSelect) btnTextSelect.classList.remove('active');
        this.propertiesSidebar.hide();
    }

    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d', { desynchronized: true }); // Performance tip for drawing

        // Offscreen canvas for layered rendering (Performance optimization)
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');

        // Canvas ayarları
        this.canvasSettings = new CanvasSettings();

        // Araçlar - shapeTool'u state'de kullanabilmek için önce tanımlıyoruz
        const shapeTool = new ShapeTool(() => { this.needsRender = true; });

        // Durum
        this.state = {
            currentTool: 'pen',
            strokeColor: '#000000',
            table: { tableRows: 3, tableCols: 3, strokeWidth: 1, strokeColor: '#000000', opacity: 1.0 },
            strokeWidth: 3,
            lineStyle: 'solid',
            opacity: 1.0,
            pressureEnabled: true, // Default: Active for pen tool
            highlighterCap: 'round', // 'round' or 'butt'
            arrowStartStyle: 'none', // 'none', 'triangle', 'line', 'circle', 'square', 'bar'
            arrowEndStyle: 'triangle', // 'none', 'triangle', 'line', 'circle', 'square', 'bar'
            arrowPathType: 'straight', // 'straight', 'curved', 'elbow'
            eraserMode: 'object', // 'object', 'partial'
            stabilization: 0.7, // 0.0 to 1.0 (corresponds to 0-100% slider)
            decimation: 0, // Default 0
            fillEnabled: false, // Live fill toggle
            objects: [],
            tableRows: 3,
            tableCols: 3,
            shapeTool: shapeTool, // EraserTool access
            pdfTextSelectionActive: false,
            pdfHighlightColor: '#ffff00'
        };

        this.zoomManager = new ZoomManager(this);
        this.fillManager = new FillManager();

        this.tools = {
            pen: new PenTool(() => { this.needsRender = true; }),
            highlighter: new HighlighterTool(() => { this.needsRender = true; }),
            line: new LineTool(),
            rectangle: shapeTool,
            ellipse: shapeTool,
            triangle: shapeTool,
            trapezoid: shapeTool,
            star: shapeTool,
            diamond: shapeTool,
            parallelogram: shapeTool,
            oval: shapeTool,
            heart: shapeTool,
            cloud: shapeTool,
            shape: shapeTool,
            arrow: new ArrowTool(),

            eraser: new EraserTool(),
            hand: new HandTool(this.zoomManager),
            select: new SelectTool(),
            sticker: null,
            text: new TextTool(() => { this.needsRedrawOffscreen = true; this.needsRender = true; }),
            table: new TableTool(),
            image: new ImageTool(this),
            verticalSpace: new VerticalSpaceTool(() => { this.needsRender = true; }),
            charcoal: new CharcoalTool(() => { this.needsRender = true; }),
            'fountain-pen': new FountainPenTool(() => { this.needsRender = true; }),
            'vector-pen': new VectorPenTool(() => { this.needsRender = true; }),
            'grab-image': new GrabImageTool(this)
        };

        // Initialize sticker tool after this is available
        this.tools.sticker = new StickerTool(this.canvas, this.ctx, this);
        this.tools.tape = new TapeTool(() => { this.needsRender = true; });

        this.colorPalette = new ColorPalette(this);
        this.propertiesSidebar = new PropertiesSidebar(this);
        window.propertiesSidebar = this.propertiesSidebar;

        this.historyManager = new HistoryManager();
        this.pageManager = new PageManager(this);
        this.tabManager = new TabManager(this);
        this.pdfManager = new PDFManager(this);
        this.exportManager = new ExportManager(this);
        this.tikFileManager = new TikFileManager(this);
        this.cloudStorageManager = new CloudStorageManager(this);
        this.timerTool = new TimerTool(this);
        this.templateManager = new TemplateManager(this);
        // OCRManager: Lazy-initialized on first use to avoid loading Tesseract eagerly
        this.ocrManager = null;

        this.currentMousePos = { x: 0, y: 0 };
        this.isSpacePressed = false;

        this.needsRender = false;
        this.needsRedrawOffscreen = false;

        // Device detection for Smart Gestures
        this.deviceType = this.detectDeviceType();

        // Long press for context menu on mobile
        this.longPressTimer = null;
        this.longPressThreshold = 600; // ms
        this.longPressTriggered = false;
        this.pressStartPos = null;
        this.moveThreshold = 10; // px-hareket toleransı

        // 120Hz render loop — cap at ~8.33ms per frame
        this._TARGET_FRAME_MS = 1000 / 120; // ~8.33ms
        this._lastFrameTime = 0;

        this.renderLoop = this.renderLoop.bind(this);
        requestAnimationFrame(this.renderLoop);

        this.init();
    }

    renderLoop(timestamp) {
        requestAnimationFrame(this.renderLoop);

        // 120Hz throttle: skip if not enough time has passed
        const elapsed = timestamp - this._lastFrameTime;
        if (elapsed < this._TARGET_FRAME_MS - 0.5) return;
        this._lastFrameTime = timestamp - (elapsed % this._TARGET_FRAME_MS);

        // Flush any queued move events (non-drawing tools use the queue path)
        if (this.moveQueue && this.moveQueue.length > 0) {
            this.flushMoveQueue();
        }

        if (this.needsRedrawOffscreen) {
            this.redrawOffscreen();
            this.needsRedrawOffscreen = false;
        }

        if (this.needsRender) {
            this.render();
            this.needsRender = false;
        }
    }

    detectDeviceType() {
        const ua = navigator.userAgent;
        // iPad detection (including iPadOS)
        if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
            return 'tablet';
        }
        // Android Tablet
        if (/Android/.test(ua) && !/Mobile/.test(ua)) {
            return 'tablet';
        }
        // Phone
        if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) {
            return 'phone';
        }
        // Fallback for smaller touch screens
        if (window.innerWidth < 1024 && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
            return 'phone';
        }
        return 'desktop';
    }

    isDrawingTool(toolName) {
        const drawingTools = ['pen', 'highlighter', 'charcoal', 'fountain-pen', 'vector-pen', 'eraser', 'line', 'rectangle', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'shape', 'arrow', 'tape', 'text', 'sticker', 'table', 'verticalSpace', 'grab-image'];
        return drawingTools.includes(toolName);
    }

    simplifyEvent(e) {
        return {
            pointerId: e.pointerId,
            offsetX: e.offsetX,
            offsetY: e.offsetY,
            clientX: e.clientX,
            clientY: e.clientY,
            pressure: e.pressure,
            pointerType: e.pointerType,
            button: e.button,
            buttons: e.buttons,
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            metaKey: e.metaKey
        };
    }

    flushMoveQueue() {
        if (this.moveQueue && this.moveQueue.length > 0) {
            const events = [...this.moveQueue];
            this.moveQueue = [];
            events.forEach(ev => this.processPointerMove(ev));
        }
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupToolbar();
        this.setupAppMenu();
        this.setupCanvasModal();
        this.setupImageUpload();

        // Initialize UI for default tool
        this.propertiesSidebar.updateUIForTool(this.state.currentTool);

        // Initial draw (only if visible)
        if (this.canvas.clientWidth > 0) {
            this.needsRedrawOffscreen = true;
            this.needsRender = true;
        }

        // Double Click Handler for Table Text Edit
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

        // Range Slider Progress Sync (Pure CSS progress bars are tricky, so we use a CSS variable)
        const updateRangeProgress = (input) => {
            const percent = (input.value - input.min) / (input.max - input.min) * 100;
            input.style.setProperty('--value', percent + '%');
        };

        document.querySelectorAll('input[type="range"]').forEach(input => {
            updateRangeProgress(input);
            input.addEventListener('input', () => updateRangeProgress(input));
        });

        // Expose to window for PropertiesSidebar to use during manual sync
        window.updateRangeProgress = updateRangeProgress;

        // PWA File Handling API: .tik dosyasının çift tıklama ile açılması
        this._setupLaunchQueue();
    }

    _setupLaunchQueue() {
        if (!('launchQueue' in window)) return;
        try {
            launchQueue.setConsumer(async (launchParams) => {
                if (!launchParams.files || launchParams.files.length === 0) return;

                // Dashboard hazır olana kadar bekle (Race condition engellemek için)
                let attempts = 0;
                while (!window.dashboard && attempts < 100) {
                    await new Promise(r => setTimeout(r, 50));
                    attempts++;
                }

                if (!window.dashboard) {
                    console.error('[LaunchQueue] Dashboard zamanında yüklenemedi.');
                    return;
                }

                const fileHandle = launchParams.files[0];
                try {
                    const file = await fileHandle.getFile();
                    if ((file.name.toLowerCase().endsWith('.tik') || file.name.toLowerCase().endsWith('.tik')) && this.tikFileManager) {
                        await this.tikFileManager._loadFromFile(file);
                    }
                } catch (e) {
                    console.error('[LaunchQueue] .tik dosyası açılamadı:', e);
                }
            });
        } catch (e) {
            console.debug('[LaunchQueue] API desteklenmiyor veya kurulumda hata oluştu:', e);
        }
    }

    handleDoubleClick(e) {
        if (this.state.currentTool !== 'select') return;

        const worldPosGlobal = this.zoomManager.getPointerWorldPos(e);
        const pageIndex = this.pageManager.getPageIndexAt(worldPosGlobal.y);
        const pageY = this.pageManager.getPageY(pageIndex);
        const point = { ...worldPosGlobal, y: worldPosGlobal.y - pageY };

        // Check if we clicked a table (reverse order)
        for (let i = this.state.objects.length - 1; i >= 0; i--) {
            const obj = this.state.objects[i];
            if (obj.type === 'table') {
                if (point.x >= obj.x && point.x <= obj.x + obj.width &&
                    point.y >= obj.y && point.y <= obj.y + obj.height) {

                    // Identify cell
                    let currentY = obj.y;
                    for (let r = 0; r < obj.rows; r++) {
                        const rHeight = obj.rowHeights[r];
                        if (point.y >= currentY && point.y <= currentY + rHeight) {
                            let currentX = obj.x;
                            for (let c = 0; c < obj.cols; c++) {
                                const cWidth = obj.colWidths[c];
                                if (point.x >= currentX && point.x <= currentX + cWidth) {
                                    // Found cell [r][c]
                                    this.tools.table.editCell(obj, r, c, this.canvas, this);
                                    return;
                                }
                                currentX += cWidth;
                            }
                        }
                        currentY += rHeight;
                    }
                }
            } else if (obj.type === 'text') {
                if (point.x >= obj.x && point.x <= obj.x + obj.width &&
                    point.y >= obj.y && point.y <= obj.y + obj.height) {

                    this.setTool('text');
                    this.tools.text.startEditing(obj, this.canvas, this.state);
                    return;
                }
            }
        }
    }

    setupCanvas() {
        // ... (unchanged)
        // İlk tuval ayarlarını uygula
        this.canvasSettings.applySettings(this.canvas, this.ctx);

        // Offscreen canvas should perfectly match the main canvas dimensions and scale
        this.canvasSettings.applySettings(this.offscreenCanvas, this.offscreenCtx, this.canvas);

        window.addEventListener('resize', () => {
            const oldObjects = [...this.state.objects];

            // Re-apply settings to main
            this.canvasSettings.applySettings(this.canvas, this.ctx);

            // Re-sync offscreen
            this.canvasSettings.applySettings(this.offscreenCanvas, this.offscreenCtx, this.canvas);

            this.state.objects = oldObjects;
            this.needsRedrawOffscreen = true;
            this.needsRender = true;
        });
    }

    setTool(tool) {
        const prevTool = this.state.currentTool;

        // Deactivate PDF text selection when switching to another tool (except select tool)
        if (this.state.pdfTextSelectionActive && tool !== 'select') {
            this.deactivatePdfTextSelection();
        }

        // Always update tool state (even if tool is same, we need to update button state)
        this.state.currentTool = tool;

        // Handle Mobile UX Toggle for 480px (User wants to toggle settings bar by clicking the active icon)
        if (tool === prevTool && window.innerWidth <= 480) {
            if (this.propertiesSidebar) {
                this.propertiesSidebar.toggle();
            }
        }

        const shapeTypes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'];
        const isShape = shapeTypes.includes(tool);

        if (isShape) {
            this.state.currentShapeType = tool;
        }

        // --- Tool Specific Defaults (Apply only when switching TO the tool) ---
        if (tool !== prevTool) {
            const hasColor = (t) => ['pen', 'highlighter', 'charcoal', 'fountain-pen', 'vector-pen', 'rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'line', 'arrow'].includes(t);

            // Save previous tool's color if it supports it
            if (hasColor(prevTool) && this.tools[prevTool] && this.tools[prevTool].currentColor !== undefined) {
                this.tools[prevTool].currentColor = this.state.strokeColor;
            } else if (hasColor(prevTool) && shapeTypes.concat(['line', 'arrow']).includes(prevTool)) {
                // Shapes share the same color logic usually, but let's check if we want them independent too.
                // The user only specified Pen tools.
            }

            // Load new tool's color
            if (hasColor(tool) && this.tools[tool] && this.tools[tool].currentColor !== undefined) {
                this.state.strokeColor = this.tools[tool].currentColor;
            }

            if (tool === 'highlighter') {
                this.state.opacity = 0.5;
                this.state.strokeWidth = 14;
                this.state.highlighterCap = 'butt';
                
                // User requested color: #E4FF30
                // If it's the first time, currentColor would be #E4FF30.
                if (this.propertiesSidebar) {
                    this.propertiesSidebar.quickColors = ['#E4FF30', '#FF5FCF', '#B6FFA1'];
                    this.propertiesSidebar.renderQuickColors();
                }
            } else if (tool === 'pen') {
                this.state.opacity = 1.0;
                this.state.strokeWidth = 3;
            } else if (tool === 'charcoal' || tool === 'fountain-pen' || tool === 'vector-pen') {
                this.state.opacity = 1.0;
            } else if (tool === 'tape') {
                this.state.opacity = 1.0;
                this.state.strokeWidth = 20;
                this.state.strokeColor = '#5c9bfe';
                if (this.tools.tape) {
                    this.tools.tape.updateSettings({
                        mode: 'line',
                        pattern: 'stripes'
                    });
                }
            }
        }

        // --- Finish Text Editing if switching away from text tool ---
        if (prevTool === 'text' && tool !== 'text' && this.tools.text) {
            this.tools.text.finishEditing(this.state);
        }

        // --- Cleanup Table Editing if switching away from table tool ---
        if (prevTool === 'table' && tool !== 'table' && this.tools.table) {
            this.tools.table.cleanup();
        }

        const shapePickerBtn = document.getElementById('shapePickerBtn');

        // 1. Reset all active states in main toolbar
        document.querySelectorAll('.toolbar .tool-btn[data-tool], #shapePickerBtn').forEach(btn => {
            // Don't remove active from PDF text selection button if it's active
            if (btn.id === 'btnTextSelect' && this.state.pdfTextSelectionActive) return;
            btn.classList.remove('active');
        });

        // 2. Map tool selection to DOM updates
        const toolBtn = document.querySelector(`.toolbar .tool-btn[data-tool="${tool}"]`);

        if (isShape && shapePickerBtn) {
            shapePickerBtn.classList.add('active');
        } else if (toolBtn) {
            toolBtn.classList.add('active');
        }

        // --- Context & Sidebar Sync ---
        if (this.propertiesSidebar) {
            this.propertiesSidebar.updateUIForTool(tool);
        }

        // --- Special tool activation ---
        if (tool === 'sticker' && this.tools.sticker) {
            this.tools.sticker.activate();
            // Open sidebar for stickers
            if (this.propertiesSidebar && this.propertiesSidebar.container.style.display === 'none') {
                this.propertiesSidebar.toggle();
            }
        } else if (this.tools.sticker) {
            this.tools.sticker.deactivate();
        }

        if (prevTool === 'grab-image' && this.tools['grab-image']) {
            this.tools['grab-image'].deactivate();
        }

        if (prevTool === 'vector-pen' && this.tools['vector-pen']) {
            const completedPath = this.tools['vector-pen'].finishPath();
            if (completedPath) {
                this.saveHistory();
                this.state.objects.push(completedPath);
                this.needsRedrawOffscreen = true;
            }
        }

        // --- Cursor Sync ---
        const dotCursor = "url(\"data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='8' cy='8' r='3' fill='black' stroke='white' stroke-width='1'/%3E%3C/svg%3E\") 8 8, auto";

        if (tool === 'eraser') {
            this.canvas.style.cursor = dotCursor;
        } else if (tool === 'hand') {
            this.canvas.style.cursor = 'grab';
        } else if (tool === 'select') {
            this.canvas.style.cursor = 'default';
        } else if (tool === 'text') {
            this.canvas.style.cursor = 'text';
        } else if (tool === 'tape') {
            this.canvas.style.cursor = dotCursor;
        } else if (tool === 'verticalSpace') {
            this.canvas.style.cursor = 'ns-resize';
        } else if (tool === 'grab-image') {
            this.canvas.style.cursor = 'crosshair';
        } else {
            this.canvas.style.cursor = dotCursor;
        }

        this.updateStatus();
    }

    setupCanvasModal() {
        const panel = document.getElementById('canvasSettingsPanel');
        const openBtn = document.getElementById('canvasSettingsBtn');
        const menuBtn = document.getElementById('menuCanvasSettings');
        const applyBtn = document.getElementById('applySettingsBtn');

        const toggleSettings = (e) => {
            e.stopPropagation();
            this.canvasSettings.togglePanel();

            const dropdown = document.getElementById('appMenuDropdown');
            if (dropdown) dropdown.classList.remove('show');

            if (this.canvasSettings.isPanelOpen) {
                this.canvasSettings.loadSettingsToPanel();
                if (this.propertiesSidebar) {
                    this.propertiesSidebar.hide();
                }
            }
        };

        const closeBtn = document.getElementById('btnCloseSettings');
        if (closeBtn) closeBtn.onclick = () => this.canvasSettings.togglePanel();

        // Backdrop'a tıklayınca kapat
        const modal = document.getElementById('canvasSettingsModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.canvasSettings.togglePanel();
                }
            });
        }

        if (openBtn) openBtn.onclick = toggleSettings;
        if (menuBtn) menuBtn.onclick = toggleSettings;

        // Ayarları uygula
        applyBtn.addEventListener('click', () => {
            // Ayarları kaydet
            const activeBgBtn = document.querySelector('.color-option-rect[data-color].active') || document.getElementById('btnCustomBackground');
            const activePatternBtn = document.querySelector('.pattern-item.active');
            const activePatternColorBtn = document.querySelector('.color-option-rect[data-pattern-color].active') || document.getElementById('btnCustomPatternColor');
            const spacingSlider = document.getElementById('patternSpacingSlider');
            const thicknessSlider = document.getElementById('patternThicknessSlider');

            this.canvasSettings.settings = {
                size: document.getElementById('canvasSizeSelect').value,
                orientation: document.querySelector('input[name="orientation"]:checked').value,
                backgroundColor: activeBgBtn ? (activeBgBtn.dataset.color || 'white') : 'white',
                pattern: activePatternBtn ? activePatternBtn.dataset.pattern : 'none',
                patternColor: activePatternColorBtn ? (activePatternColorBtn.dataset.patternColor || 'rgba(0,0,0,0.15)') : 'rgba(0,0,0,0.15)',
                patternSpacing: spacingSlider ? parseInt(spacingSlider.value) : 20,
                patternThickness: thicknessSlider ? parseFloat(thicknessSlider.value) : 1
            };

            // Yeni ayarları uygula
            this.canvasSettings.applySettings(this.canvas, this.ctx);

            // Mevcut sayfayı yeni ayarlarla güncelle
            if (this.pageManager) {
                this.pageManager.saveCurrentPageState();
            }

            // Sync offscreen and its background
            this.canvasSettings.applySettings(this.offscreenCanvas, this.offscreenCtx, this.canvas);

            // Nesneleri yeniden çiz
            if (this.zoomManager) {
                this.zoomManager.clampPan(); // Ortalamayı ve kaydırmayı yeniden hesapla
            } else {
                this.needsRedrawOffscreen = true;
                this.needsRender = true;
                window.dashboard?.saveCurrentBoard();
            }

            // Panel'i kapat
            this.canvasSettings.togglePanel();

            // Durum güncelle
            this.updateStatus();
        });

        // Renk seçimi
        document.querySelectorAll('.color-option-rect[data-color]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-option-rect[data-color]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Özel Arkaplan Rengi
        const btnCustomBg = document.getElementById('btnCustomBackground');
        if (btnCustomBg) {
            btnCustomBg.addEventListener('click', (e) => {
                const currentColor = btnCustomBg.dataset.color || '#ffffff';
                this.colorPalette.showColorPicker(currentColor, (color) => {
                    if (color === 'rainbow') return;

                    btnCustomBg.style.backgroundColor = color;
                    btnCustomBg.dataset.color = color;
                    btnCustomBg.innerHTML = '';

                    document.querySelectorAll('.color-option-rect[data-color]').forEach(b => b.classList.remove('active'));
                    btnCustomBg.classList.add('active');
                }, btnCustomBg, 'right'); // Added anchor and direction
            });
        }

        // Desen seçimi
        document.querySelectorAll('.pattern-item').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pattern-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Show/hide sub-options
                const patternGroup = document.getElementById('patternOptionsGroup');
                if (patternGroup) {
                    patternGroup.style.display = (btn.dataset.pattern === 'none') ? 'none' : 'block';
                }
            });
        });

        // Desen Rengi Seçimi
        document.querySelectorAll('.color-option-rect[data-pattern-color]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-option-rect[data-pattern-color]').forEach(b => b.classList.remove('active'));
                const customBtn = document.getElementById('btnCustomPatternColor');
                if (customBtn) {
                    customBtn.classList.remove('active');
                    customBtn.style.backgroundColor = 'white';
                    customBtn.innerHTML = '+';
                }
                btn.classList.add('active');
            });
        });

        // Özel Desen Rengi
        const btnCustomPattern = document.getElementById('btnCustomPatternColor');
        if (btnCustomPattern) {
            btnCustomPattern.addEventListener('click', (e) => {
                const currentColor = btnCustomPattern.dataset.patternColor || 'rgba(0,0,0,0.15)';
                this.colorPalette.showColorPicker(currentColor, (color) => {
                    if (color === 'rainbow') return;
                    btnCustomPattern.style.backgroundColor = color;
                    btnCustomPattern.dataset.patternColor = color;
                    btnCustomPattern.innerHTML = ''; // Remove '+' when color is set
                    document.querySelectorAll('.color-option-rect[data-pattern-color]').forEach(b => b.classList.remove('active'));
                    btnCustomPattern.classList.add('active');
                }, btnCustomPattern, 'right');
            });
        }

        // Desen Aralığı Slider
        const spacingSlider = document.getElementById('patternSpacingSlider');
        const spacingVal = document.getElementById('patternSpacingVal');
        if (spacingSlider && spacingVal) {
            spacingSlider.addEventListener('input', (e) => {
                spacingVal.textContent = e.target.value + 'px';
            });
        }

        // Desen Kalınlığı Slider
        const thicknessSlider = document.getElementById('patternThicknessSlider');
        const thicknessVal = document.getElementById('patternThicknessVal');
        if (thicknessSlider && thicknessVal) {
            thicknessSlider.addEventListener('input', (e) => {
                thicknessVal.textContent = e.target.value + 'px';
            });
        }
    }

    setupImageUpload() {
        const btnInsertImage = document.getElementById('btnInsertImage');
        const btnToolbarInsertImage = document.getElementById('btnToolbarInsertImage');
        const imageInput = document.getElementById('imageInput');

        const onInsertClick = (e) => {
            e.stopPropagation();
            if (imageInput) imageInput.click();
            const dropdown = document.getElementById('appMenuDropdown');
            if (dropdown) dropdown.classList.remove('show');
        };

        if (btnInsertImage) btnInsertImage.addEventListener('click', onInsertClick);
        if (btnToolbarInsertImage) btnToolbarInsertImage.addEventListener('click', onInsertClick);

        const btnToolbarPaste = document.getElementById('btnToolbarPaste');
        if (btnToolbarPaste) {
            btnToolbarPaste.addEventListener('click', (e) => {
                e.stopPropagation();
                this.triggerPaste();
                const dropdown = document.getElementById('appMenuDropdown');
                if (dropdown) dropdown.classList.remove('show');
            });
        }

        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target.result;
                    this.insertImage(dataUrl);
                    imageInput.value = '';
                };
                reader.readAsDataURL(file);
            });
        }

        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.insertImage(event.target.result);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    insertImage(src) {
        const img = new Image();
        img.onload = () => {
            const viewport = this.zoomManager.getViewportBounds();

            // Default size: fit within viewport but not too large
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const maxW = viewport.width * 0.8;
            const maxH = viewport.height * 0.8;

            if (w > maxW || h > maxH) {
                const ratio = Math.min(maxW / w, maxH / h);
                w *= ratio;
                h *= ratio;
            }

            const pageIndex = this.pageManager.currentPageIndex;
            const pageY = this.pageManager.getPageY(pageIndex);

            // Center relative to page
            const x = viewport.x + (viewport.width - w) / 2;
            const y = (viewport.y - pageY) + (viewport.height - h) / 2;

            const imageObj = {
                type: 'image',
                src: src,
                x: x,
                y: y,
                width: w,
                height: h,
                rotation: 0,
                id: Date.now() + Math.random().toString(36).substr(2, 9)
            };

            this.saveHistory();
            this.state.objects.push(imageObj);

            // Select the newly added image
            if (this.tools.select) {
                this.tools.select.selectedObjects = [this.state.objects.length - 1];
            }

            this.needsRedrawOffscreen = true;
            this.needsRender = true;

            // Switch to select tool to allow moving the new image
            this.setTool('select');

            window.dashboard?.saveCurrentBoard();
        };
        img.onerror = () => {
            console.error('Image failed to load:', src.substring(0, 50) + '...');
            alert('Resim yüklenemedi. Lütfen başka bir dosya deneyin.');
        };
        img.src = src;
    }

    setupEventListeners() {
        const opts = { passive: false };

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.cancelable) e.preventDefault();
        }, opts);

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.cancelable) e.preventDefault();
            this.handlePointerDown(e);
        }, opts);
        this.canvas.addEventListener('pointermove', (e) => {
            if (e.cancelable) e.preventDefault();
            this.handlePointerMove(e);
        }, opts);
        this.canvas.addEventListener('pointerup', (e) => {
            if (e.cancelable) e.preventDefault();
            this.handlePointerUp(e);
        }, opts);
        this.canvas.addEventListener('pointerleave', (e) => {
            if (e.cancelable) e.preventDefault();
            this.handlePointerUp(e);
        }, opts);
        this.canvas.addEventListener('pointercancel', (e) => {
            if (e.cancelable) e.preventDefault();
            this.handlePointerUp(e);
        }, opts);

        // Klavye kısayolları
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Context menu (sağ tık) engelleme ve yönetme
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.state.currentTool === 'select') {
                this.tools.select.handleContextMenu(e, this.canvas, this.state);
            }
        });

        // Context menu dışına tıklama
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('contextMenu');
            if (menu && !menu.contains(e.target)) {
                this.tools.select.hideContextMenu();
            }
        });

        // Pasteurization (Global Paste Handling)
        document.addEventListener('paste', (e) => this.handlePaste(e));

        this.setupContextMenu();
    }

    async handlePaste(e) {
        // Skip if user is typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        if (!items) return;
        this.processPasteItems(items);
    }

    async processPasteItems(items) {
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target.result;
                    // Calculate world center accurately
                    const viewW = this.canvas.clientWidth;
                    const viewH = this.canvas.clientHeight;
                    const worldPos = {
                        x: (viewW / 2 - this.zoomManager.pan.x) / this.zoomManager.zoom,
                        y: (viewH / 2 - this.zoomManager.pan.y) / this.zoomManager.zoom
                    };
                    if (this.tools.image) {
                        this.insertImage(dataUrl);
                    }
                };
                reader.readAsDataURL(blob);
            }
        }
    }

    async triggerPaste() {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            alert('Tarayıcınız panoya erişimi desteklemiyor. Lütfen Ctrl+V kullanın.');
            return;
        }
        try {
            const clipboardItems = await navigator.clipboard.read();
            let foundImage = false;
            for (const item of clipboardItems) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const dataUrl = event.target.result;
                            const viewW = this.canvas.clientWidth;
                            const viewH = this.canvas.clientHeight;
                            const worldPos = {
                                x: (viewW / 2 - this.zoomManager.pan.x) / this.zoomManager.zoom,
                                y: (viewH / 2 - this.zoomManager.pan.y) / this.zoomManager.zoom
                            };
                            if (this.tools.image) {
                                this.insertImage(dataUrl);
                            }
                        };
                        reader.readAsDataURL(blob);
                        foundImage = true;
                    }
                }
            }
            if (!foundImage) {
                alert('Panoda yapıştırılacak bir resim bulunamadı.');
            }
        } catch (err) {
            console.error('Clipboard access denied:', err);
            if (err.name === 'NotAllowedError') {
                alert('Pano erişim izni reddedildi. Lütfen tarayıcı ayarlarından izin verin veya Ctrl+V kullanın.');
            } else {
                alert('Panoya erişilemedi. Lütfen Ctrl+V kullanın.');
            }
        }
    }

    setupToolbar() {
        const shapePickerBtn = document.getElementById('shapePickerBtn');
        if (shapePickerBtn) {
            shapePickerBtn.onclick = () => {
                const currentShape = this.state.currentShapeType || 'rectangle';
                const shapes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'];
                if (shapes.includes(this.state.currentTool)) {
                    this.propertiesSidebar.toggle();
                } else {
                    this.setTool(currentShape);
                }
            };
        }

        document.querySelectorAll('.tool-btn[data-tool]:not(#shapePickerBtn)').forEach(btn => {
            btn.onclick = () => {
                const tool = btn.dataset.tool;
                const toolsWithoutSidebar = ['hand', 'verticalSpace'];

                // If select tool is explicitly clicked while PDF text selection is active, deactivate it
                if (tool === 'select' && this.state.pdfTextSelectionActive) {
                    this.deactivatePdfTextSelection();
                }

                this.setTool(tool);
                if (toolsWithoutSidebar.includes(tool)) {
                    this.propertiesSidebar.hide();
                }
            };
        });

        const btnTimer = document.getElementById('btnTimerTool');
        if (btnTimer) {
            btnTimer.onclick = () => {
                this.timerTool.toggle();
                const dropdown = document.getElementById('appMenuDropdown');
                if (dropdown) dropdown.classList.remove('show');
            };
        }

        const btnTextSelect = document.getElementById('btnTextSelect');
        if (btnTextSelect) {
            btnTextSelect.onclick = () => {
                if (this.pdfManager && this.pdfManager.textSelector) {
                    const isActive = this.pdfManager.textSelector.toggle();
                    btnTextSelect.classList.toggle('active', isActive);
                    this.state.pdfTextSelectionActive = isActive;

                    if (isActive) {
                        this.setTool('select');
                        this.propertiesSidebar.show();
                        this.propertiesSidebar.updateUIForTool('select');
                    } else {
                        this.setTool('select');
                        this.propertiesSidebar.hide();
                    }
                }
            };
        }

        // PDF Highlight color buttons
        document.querySelectorAll('#pdfHighlightColors .quick-color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = btn.dataset.highlightColor;
                this.state.pdfHighlightColor = color;
                // Update active state
                document.querySelectorAll('#pdfHighlightColors .quick-color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        const safeBind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn;
        };

        safeBind('btnPageSidebarTrigger', () => {
            const isClosing = this.pageManager.sidebar && !this.pageManager.sidebar.classList.contains('collapsed');
            this.pageManager.toggleSidebar();
            // Hide properties sidebar if we are opening pages sidebar
            if (!isClosing && this.propertiesSidebar) {
                this.propertiesSidebar.hide();
            }
        });

        const btnHome = document.getElementById('btnHome');
        if (btnHome) {
            btnHome.onclick = async () => {
                if (window.dashboard) {
                    await window.dashboard.showDashboard();
                }
            };
        }

        const btnVerticalSpaceTool = document.getElementById('btnVerticalSpaceTool');
        if (btnVerticalSpaceTool) {
            btnVerticalSpaceTool.onclick = () => {
                this.setTool('verticalSpace');
            };
        }

        safeBind('clearBtn', () => {
            this.saveHistory();
            // persistent: true olan nesneleri tut, diğerlerini sil
            this.state.objects = this.state.objects.filter(obj => obj.persistent);
            this.needsRedrawOffscreen = true;
            this.needsRender = true;
        });
        safeBind('undoBtn', () => this.undo());
        safeBind('redoBtn', () => this.redo());
    }

    setupAppMenu() {
        const menuTrigger = document.getElementById('btnAppMenu');
        const dropdown = document.getElementById('appMenuDropdown');

        if (menuTrigger && dropdown) {
            menuTrigger.onclick = (e) => {
                e.stopPropagation();
                const isShowing = dropdown.classList.contains('show');
                dropdown.classList.toggle('show');

                // Hide properties sidebar if we are opening the menu
                if (!isShowing && this.propertiesSidebar) {
                    this.propertiesSidebar.hide();
                }
            };

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.app-menu-container')) {
                    dropdown.classList.remove('show');
                }
            });

            // .tik Aç / Kaydet
            document.getElementById('menuOpenTom')?.addEventListener('click', () => {
                this.tikFileManager.openTomFile();
                dropdown.classList.remove('show');
            });
            document.getElementById('menuSaveTom')?.addEventListener('click', () => {
                this.tikFileManager.saveAsTom();
                dropdown.classList.remove('show');
            });

            // Export Actions
            document.getElementById('btnExportPNG')?.addEventListener('click', () => {
                this.exportManager.exportToPNG();
                dropdown.classList.remove('show');
            });
            document.getElementById('btnExportSVG')?.addEventListener('click', () => {
                this.exportManager.exportToSVG();
                dropdown.classList.remove('show');
            });
            document.getElementById('btnExportPDF')?.addEventListener('click', () => {
                this.exportManager.exportToPDF();
                dropdown.classList.remove('show');
            });

            // Save as Template
            document.getElementById('btnSaveAsTemplate')?.addEventListener('click', () => {
                this.openSaveTemplateModal();
                dropdown.classList.remove('show');
            });

            // Grab Image Tool
            document.getElementById('btnGrabImage')?.addEventListener('click', () => {
                this.setTool('grab-image');
                dropdown.classList.remove('show');
            });
        }

        // Setup Save Template Modal
        this.setupSaveTemplateModal();
    }

    openSaveTemplateModal() {
        const modal = document.getElementById('saveTemplateModal');
        if (!modal) return;

        // Reset form
        document.getElementById('templateNameInput').value = '';
        document.getElementById('templateCategorySelect').value = 'Kendi Şablonlarım';
        document.getElementById('templateDescriptionInput').value = '';

        modal.style.display = 'flex';
        document.getElementById('templateNameInput').focus();
    }

    closeSaveTemplateModal() {
        const modal = document.getElementById('saveTemplateModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    setupSaveTemplateModal() {
        // Close button
        document.getElementById('btnCloseSaveTemplateModal')?.addEventListener('click', () => {
            this.closeSaveTemplateModal();
        });

        // Cancel button
        document.getElementById('btnCancelSaveTemplate')?.addEventListener('click', () => {
            this.closeSaveTemplateModal();
        });

        // Overlay click
        document.querySelector('#saveTemplateModal .template-modal-overlay')?.addEventListener('click', () => {
            this.closeSaveTemplateModal();
        });

        // Save button
        document.getElementById('btnConfirmSaveTemplate')?.addEventListener('click', async () => {
            const name = document.getElementById('templateNameInput').value;
            const category = document.getElementById('templateCategorySelect').value;
            const description = document.getElementById('templateDescriptionInput').value;

            if (!name || !name.trim()) {
                alert('Lütfen şablon için bir isim girin.');
                document.getElementById('templateNameInput').focus();
                return;
            }

            // Save template
            const success = await this.templateManager.saveCurrentPageAsTemplate(name, category, description);

            if (success) {
                this.closeSaveTemplateModal();
                alert(`"${name}" şablonu başarıyla kaydedildi!`);
            }
        });

        // Enter key to save
        document.getElementById('templateNameInput')?.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btnConfirmSaveTemplate').click();
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('saveTemplateModal');
                if (modal && modal.style.display === 'flex') {
                    this.closeSaveTemplateModal();
                }
            }
        });
    }

    setupContextMenu() {
        const menuItems = document.querySelectorAll('.context-menu-item');

        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                const selectTool = this.tools.select;

                // History kaydet (değişiklik yapan işlemler için)
                if (['delete', 'duplicate', 'cut', 'flipHorizontal', 'flipVertical', 'bringToFront', 'bringForward', 'sendBackward', 'sendToBack', 'group', 'ungroup', 'lock', 'unlock', 'addRowAbove', 'addRowBelow', 'addColLeft', 'addColRight', 'deleteRow', 'deleteCol'].includes(action)) {
                    this.saveHistory();
                }

                let result = null;

                // Table Actions
                if (selectTool.selectedObjects.length === 1) {
                    const obj = this.state.objects[selectTool.selectedObjects[0]];
                    if (obj.type === 'table') {
                        const cellHeight = 40; // Default height for new row
                        const cellWidth = 100; // Default width for new col

                        if (action === 'addRowAbove') {
                            // Insert above the clicked cell, or at top if no cell info
                            const insertAt = (selectTool.selectedTableCell && selectTool.selectedTableCell.row !== undefined)
                                ? selectTool.selectedTableCell.row
                                : 0;

                            const newRowData = Array(obj.cols).fill("");
                            obj.rows++;
                            obj.rowHeights.splice(insertAt, 0, cellHeight);
                            obj.data.splice(insertAt, 0, newRowData);
                            obj.height += cellHeight;
                        } else if (action === 'addRowBelow') {
                            // Insert below the clicked cell, or at bottom if no cell info
                            const insertAt = (selectTool.selectedTableCell && selectTool.selectedTableCell.row !== undefined)
                                ? selectTool.selectedTableCell.row + 1
                                : obj.rows;

                            const newRowData = Array(obj.cols).fill("");
                            obj.rows++;
                            obj.rowHeights.splice(insertAt, 0, cellHeight);
                            obj.data.splice(insertAt, 0, newRowData);
                            obj.height += cellHeight;
                        } else if (action === 'addColLeft') {
                            // Insert left of the clicked cell, or at left if no cell info
                            const insertAt = (selectTool.selectedTableCell && selectTool.selectedTableCell.col !== undefined)
                                ? selectTool.selectedTableCell.col
                                : 0;

                            obj.cols++;
                            obj.colWidths.splice(insertAt, 0, cellWidth);
                            obj.width += cellWidth;
                            obj.data.forEach(row => row.splice(insertAt, 0, ""));
                        } else if (action === 'addColRight') {
                            // Insert right of the clicked cell, or at right if no cell info
                            const insertAt = (selectTool.selectedTableCell && selectTool.selectedTableCell.col !== undefined)
                                ? selectTool.selectedTableCell.col + 1
                                : obj.cols;

                            obj.cols++;
                            obj.colWidths.splice(insertAt, 0, cellWidth);
                            obj.width += cellWidth;
                            obj.data.forEach(row => row.splice(insertAt, 0, ""));
                        } else if (action === 'deleteRow') {
                            if (obj.rows > 1) {
                                // Delete the row of the clicked cell, or last row if no cell info
                                const rowToDelete = (selectTool.selectedTableCell && selectTool.selectedTableCell.row !== undefined)
                                    ? selectTool.selectedTableCell.row
                                    : obj.rows - 1;

                                obj.rows--;
                                const h = obj.rowHeights.splice(rowToDelete, 1)[0];
                                obj.height -= h;
                                obj.data.splice(rowToDelete, 1);
                            }
                        } else if (action === 'deleteCol') {
                            if (obj.cols > 1) {
                                // Delete the col of the clicked cell, or last col if no cell info
                                const colToDelete = (selectTool.selectedTableCell && selectTool.selectedTableCell.col !== undefined)
                                    ? selectTool.selectedTableCell.col
                                    : obj.cols - 1;

                                obj.cols--;
                                const w = obj.colWidths.splice(colToDelete, 1)[0];
                                obj.width -= w;
                                obj.data.forEach(row => row.splice(colToDelete, 1));
                            }
                        }

                        // Clear cell caches to force re-render with new indices
                        obj._cellCaches = {};
                    }
                }

                switch (action) {
                    case 'lock':
                        selectTool.lockSelected(this.state);
                        break;
                    case 'unlock':
                        selectTool.unlockSelected(this.state);
                        break;
                    case 'cut':
                        selectTool.cutSelected(this.state);
                        break;
                    case 'copy':
                        selectTool.copySelected(this.state);
                        break;
                    case 'paste':
                        // ...
                        result = selectTool.paste(this.state);
                        if (result) {
                            if (Array.isArray(result)) {
                                const tapes = result.filter(obj => obj.type === 'tape');
                                const others = result.filter(obj => obj.type !== 'tape');
                                this.state.objects.push(...others);
                                this.state.objects.push(...tapes);
                            } else {
                                this.state.objects.push(result);
                            }
                        }
                        break;
                    case 'delete':
                        result = selectTool.deleteSelected(this.state);
                        break;
                    case 'duplicate':
                        selectTool.duplicateSelected(this.state);
                        break;
                    case 'flipHorizontal':
                        selectTool.flipHorizontal(this.state);
                        break;
                    case 'flipVertical':
                        selectTool.flipVertical(this.state);
                        break;
                    case 'bringToFront':
                        selectTool.bringToFront(this.state);
                        break;
                    case 'bringForward':
                        selectTool.bringForward(this.state);
                        break;
                    case 'sendBackward':
                        selectTool.sendBackward(this.state);
                        break;
                    case 'sendToBack':
                        selectTool.sendToBack(this.state);
                        break;
                    case 'group':
                        selectTool.groupSelected(this.state);
                        break;
                    case 'ungroup':
                        selectTool.ungroupSelected(this.state);
                        break;
                    case 'saveAsSticker':
                        if (selectTool.selectedObjects && selectTool.selectedObjects.length > 0) {
                            const selectedObjs = selectTool.selectedObjects.map(idx => this.state.objects[idx]);
                            if (selectedObjs.length === 1) {
                                this.tools.sticker.createStickerFromObject(selectedObjs[0]);
                            } else {
                                this.tools.sticker.createStickerFromSelection();
                            }
                        }
                        break;
                }

                selectTool.hideContextMenu();
                this.needsRedrawOffscreen = true;
                this.needsRender = true;
            });
        });
    }


    handlePointerDown(e) {
        this.flushMoveQueue();

        // Track stylus activity for palm rejection
        if (e.pointerType === 'pen') {
            this.zoomManager.lastStylusTime = Date.now();
        }

        // 1. TOUCH NAVIGATION (1-Finger Pan, 2-Finger Zoom)
        if (e.pointerType === 'touch') {
            this.zoomManager.handleTouchDown(e);

            // Start Long Press Timer for Context Menu
            if (this.state.currentTool === 'select' && !this.zoomManager.isPinching) {
                this.startLongPress(e);
            }

            // Smart Gesture: On phone, 1-finger touch should be mouse-like (draw/select) 
            // EXCEPT when the hand tool is active.
            // On tablets, we keep the previous behavior (1-finger touch = pan).
            if (this.deviceType === 'phone' && this.state.currentTool !== 'hand' && !this.zoomManager.isPinching) {
                // Let fall through to tool logic
            } else {
                return;
            }
        }

        // 2. SPACEBAR PAN (For Mouse/Pencil)
        if (this.isSpacePressed) {
            this.zoomManager.startPan(e);
            return;
        }

        const worldPosGlobal = this.zoomManager.getPointerWorldPos(e);
        const pageIndex = this.pageManager.getPageIndexAt(worldPosGlobal.y);
        const pageY = this.pageManager.getPageY(pageIndex);

        // Otomatik sayfa geçişi (Eğer farklı bir sayfaya tıkladıysak)
        if (pageIndex !== this.pageManager.currentPageIndex) {
            this.pageManager.switchPage(pageIndex, false); // false = scroll yapma (zaten oradayız)
        }

        // Araçlar için koordinatları o sayfanın yerel koordinatlarına çevir
        const worldPos = {
            ...worldPosGlobal,
            y: worldPosGlobal.y - pageY
        };

        const tool = this.tools[this.state.currentTool];
        if (!tool) return;

        // --- Pick Shape Mode for Tape Tool ---
        if (this.state.pickShapeMode) {
            for (let i = this.state.objects.length - 1; i >= 0; i--) {
                const obj = this.state.objects[i];
                let hit = this.tools.select.isNearObject(obj, worldPos);

                if (hit) {
                    // We found the object to use as mask
                    // Calculate bounds to center it properly
                    const bounds = this.tools.select.getBoundingBox(obj);
                    const bWidth = Math.max(bounds.maxX - bounds.minX, 1);
                    const bHeight = Math.max(bounds.maxY - bounds.minY, 1);

                    const targetPatternHeight = 60; // Base height for pattern
                    const padding = 1; // Small gap between repetitions
                    const scale = (targetPatternHeight - padding * 1) / bHeight;

                    const maskCanvas = document.createElement('canvas');
                    maskCanvas.width = bWidth * scale + (padding * 2);
                    maskCanvas.height = targetPatternHeight;
                    const mCtx = maskCanvas.getContext('2d');

                    // Fill with solid white background
                    mCtx.fillStyle = '#ffffff';
                    mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

                    mCtx.save();
                    mCtx.translate(maskCanvas.width / 2, maskCanvas.height / 2);
                    mCtx.scale(scale, scale);
                    mCtx.translate(-(bounds.minX + bWidth / 2), -(bounds.minY + bHeight / 2));

                    // Draw the object
                    this.drawObject(mCtx, obj);
                    mCtx.restore();

                    if (this.tools.tape) {
                        this.tools.tape.updateSettings({ pattern: 'mask', customMask: maskCanvas });

                        // Save to custom patterns list
                        if (this.propertiesSidebar) {
                            this.propertiesSidebar.addCustomTapePattern(maskCanvas, 'mask');
                        }

                        // UI: Deactivate other patterns
                        document.querySelectorAll('.pattern-btn[data-tape-pattern]').forEach(b => b.classList.remove('active'));
                    }

                    // Exit pick mode
                    this.state.pickShapeMode = false;
                    const btn = document.getElementById('btnTapePickShape');
                    if (btn) btn.classList.remove('active');
                    this.setTool('tape');
                    return;
                }
            }
            // If we clicked empty space, cancel pick mode?
            this.state.pickShapeMode = false;
            const btn = document.getElementById('btnTapePickShape');
            if (btn) btn.classList.remove('active');
            const dotCursor = "url(\"data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='8' cy='8' r='3' fill='black' stroke='white' stroke-width='1'/%3E%3C/svg%3E\") 8 8, auto";
            this.canvas.style.cursor = dotCursor;
            return;
        }

        // Save state for tools that modify state.objects immediately or via move (Eraser/Select)
        if (this.state.currentTool === 'eraser') {
            this.saveHistory();
        } else if (this.state.currentTool === 'select' && tool.selectedObjects.length > 0) {
            const clickPoint = { x: worldPos.x, y: worldPos.y };
            const selectedIndex = tool.selectedObjects[0];
            const selectedObj = this.state.objects[selectedIndex];

            if (selectedObj && tool.isNearObject(selectedObj, clickPoint)) {
                // Sürükleme başlayacak, history kaydet
                this.saveHistory();
            }
        }

        // --- Global Tape Interaction (Visibility Toggle) ---
        // --- Global Tape Interaction (Visibility Toggle) ---
        // Optimization: Iterate only if we are possibly clicking a tape (or optimize loop)
        // Reverse loop is correct for hit testing top-most first.
        let tapeHandled = false;
        for (let i = this.state.objects.length - 1; i >= 0; i--) {
            const obj = this.state.objects[i];
            if (obj.type === 'tape') {
                if (this.tools.tape.isPointInside(obj, worldPos)) {
                    if (e.button === 2) {
                        tapeHandled = true;
                        break;
                    } // Right click handled by context menu later

                    // Eğer tape seçili DEĞİLSE görünürlüğü değiştir.
                    // Eğer seçiliyse harekete izin vermek için burayı geçiyoruz.
                    if (this.state.currentTool === 'select' && this.tools.select.selectedObjects.includes(i)) {
                        continue;
                    }

                    // Left click to toggle visibility
                    this.tools.tape.toggleVisibility(obj);
                    this.needsRedrawOffscreen = true;
                    this.needsRender = true;
                    return; // Return immediately
                }
            }
        }

        tool.handlePointerDown(e, worldPos, this.canvas, this.ctx, this.state);

        // Update properties sidebar if selection might have changed
        if (this.state.currentTool === 'select') {
            this.propertiesSidebar.updateUIForTool('select');
        }

        this.needsRender = true;
    }


    handlePointerMove(e) {
        // Track stylus activity for palm rejection
        if (e.pointerType === 'pen') {
            this.zoomManager.lastStylusTime = Date.now();
        }

        if (e.pointerType === 'touch') {
            this.zoomManager.handleTouchMove(e);

            // Check if we moved enough to cancel long press
            if (this.pressStartPos && !this.longPressTriggered) {
                const dx = Math.abs(e.clientX - this.pressStartPos.x);
                const dy = Math.abs(e.clientY - this.pressStartPos.y);
                if (dx > this.moveThreshold || dy > this.moveThreshold) {
                    this.cancelLongPress();
                }
            }

            if (this.longPressTriggered) return;

            if (this.deviceType === 'phone' && this.state.currentTool !== 'hand' && !this.zoomManager.isPinching) {
                // Let fall through to processPointerMove (drawing)
            } else {
                this.needsRender = true;
                return;
            }
        }

        // DRAWING TOOLS: Process immediately and render right away — no rAF queue wait.
        // This eliminates the ~8–16ms input lag from queuing on slow/60Hz systems (e.g. macOS).
        const isActiveDrawing = this.isDrawingTool(this.state.currentTool) &&
            this.tools[this.state.currentTool] &&
            (this.tools[this.state.currentTool].isDrawing ||
                this.state.currentTool === 'eraser' ||
                this.state.currentTool === 'hand');

        if (isActiveDrawing) {
            // Also drain coalesced events for high-frequency input (120Hz stylus).
            // Linux/Chromium bug: getCoalescedEvents() often returns pressure=0.
            // Fix: if a coalesced event has no valid pressure, inherit it from the main event.
            const mainPressure = e.pressure;
            if (e.getCoalescedEvents) {
                const coalesced = e.getCoalescedEvents();
                if (coalesced && coalesced.length > 0) {
                    coalesced.forEach(ce => {
                        const simplified = this.simplifyEvent(ce);
                        // Inherit pressure from main event if coalesced reports 0 or missing
                        if (!simplified.pressure && mainPressure) {
                            simplified.pressure = mainPressure;
                        }
                        this.processPointerMove(simplified);
                    });
                } else {
                    this.processPointerMove(this.simplifyEvent(e));
                }
            } else {
                this.processPointerMove(this.simplifyEvent(e));
            }

            // Render immediately — don't wait for next rAF frame
            if (this.needsRedrawOffscreen) {
                this.redrawOffscreen();
                this.needsRedrawOffscreen = false;
            }
            if (this.needsRender) {
                this.render();
                this.needsRender = false;
            }
            return;
        }

        // NON-DRAWING TOOLS (select, pan, etc.): use normal rAF queue
        if (!this.moveQueue) this.moveQueue = [];

        if (e.getCoalescedEvents) {
            const coalesced = e.getCoalescedEvents();
            if (coalesced && coalesced.length > 0) {
                coalesced.forEach(ce => {
                    this.moveQueue.push(this.simplifyEvent(ce));
                });
            } else {
                this.moveQueue.push(this.simplifyEvent(e));
            }
        } else {
            this.moveQueue.push(this.simplifyEvent(e));
        }

        this.needsRender = true;
    }

    processPointerMove(e) {
        if (e.pointerType === 'pen') {
            this.zoomManager.lastStylusTime = Date.now();
        }

        if (this.zoomManager.isPanning) {
            this.zoomManager.updatePan(e);
            this.needsRender = true;
            return;
        }

        const worldPosGlobal = this.zoomManager.getPointerWorldPos(e);
        const pageIndex = this.pageManager.getPageIndexAt(worldPosGlobal.y);
        const pageY = this.pageManager.getPageY(pageIndex);

        const worldPos = {
            ...worldPosGlobal,
            y: worldPosGlobal.y - pageY
        };

        const tool = this.tools[this.state.currentTool];
        if (!tool) return;

        const beforeCount = this.state.objects.length;
        const needsRedraw = tool.handlePointerMove(e, worldPos, this.canvas, this.ctx, this.state);
        const afterCount = this.state.objects.length;

        this.currentMousePos = { x: e.offsetX, y: e.offsetY };

        if (needsRedraw || beforeCount !== afterCount || this.state.currentTool === 'eraser') {
            if (this.state.currentTool === 'select') {
                if (tool.isDragging || tool.activeHandle || tool.activeTableDivider) {
                    this.needsRedrawOffscreen = true;
                }
            }

            if (this.state.currentTool === 'eraser' && (needsRedraw || beforeCount !== afterCount)) {
                this.needsRedrawOffscreen = true;
            } else if (beforeCount !== afterCount) {
                this.needsRedrawOffscreen = true;
            }

            this.needsRender = true;
        }
    }

    handlePointerUp(e) {
        this.flushMoveQueue();

        // Track stylus activity for palm rejection
        if (e.pointerType === 'pen') {
            this.zoomManager.lastStylusTime = Date.now();
        }

        if (e.pointerType === 'touch') {
            const wasPanningOrPinching = this.zoomManager.isPanning || this.zoomManager.isPinching;
            this.zoomManager.handleTouchUp(e);

            this.cancelLongPress();
            if (this.longPressTriggered) {
                this.longPressTriggered = false;
                return;
            }

            if (this.deviceType === 'phone' && this.state.currentTool !== 'hand' && !wasPanningOrPinching) {
                // Fall through to tool logic (handlePointerUp)
            } else {
                return;
            }
        }

        if (this.zoomManager.isPanning) {
            this.zoomManager.endPan();
            // Restore cursor based on space key and current tool
            if (this.isSpacePressed) {
                this.canvas.style.cursor = 'grab';
            } else {
                this.setTool(this.state.currentTool); // Use setTool to restore correct cursor
            }
            return;
        }

        const worldPosGlobal = this.zoomManager.getPointerWorldPos(e);
        const pageIndex = this.pageManager.getPageIndexAt(worldPosGlobal.y);
        const pageY = this.pageManager.getPageY(pageIndex);

        const worldPos = {
            ...worldPosGlobal,
            y: worldPosGlobal.y - pageY
        };

        const tool = this.tools[this.state.currentTool];
        if (!tool) return;

        if (this.state.currentTool === 'verticalSpace') {
            this.saveHistory();
            this.needsRedrawOffscreen = true;
        }

        const completedObject = tool.handlePointerUp(e, worldPos, this.canvas, this.ctx, this.state);

        if (completedObject && typeof completedObject === 'object') {
            // 1. SAVE STATE BEFORE ADDING (to allow undo to previous state)
            this.saveHistory();

            // 2. IF AUTO-STRAIGHTENED, INJECT INTERMEDIATE STATE
            if (completedObject.isStraightened && completedObject.originalPoints) {
                // To allow undo back to squiggly:
                // We need a state that has all current objects PLUS the squiggly one
                const freehandObj = Utils.deepClone(completedObject);
                freehandObj.points = completedObject.originalPoints;
                freehandObj.isStraightened = false;
                delete freehandObj.originalPoints;

                const intermediateObjects = Utils.deepClone(this.state.objects);
                if (completedObject.isHighlighter) {
                    intermediateObjects.unshift(freehandObj);
                } else {
                    intermediateObjects.push(freehandObj);
                }

                // Save the intermediate (squiggly) state to the undo stack
                this.historyManager.saveState(intermediateObjects);
            }

            // 3. ADD THE FINAL OBJECT TO REAL STATE
            // Tapes always go to the top layer (end of array)
            if (completedObject.type === 'tape') {
                this.state.objects.push(completedObject);
            } else if (completedObject.isHighlighter) {
                this.state.objects.unshift(completedObject);
            } else {
                this.state.objects.push(completedObject);
            }

            this.needsRedrawOffscreen = true;
            window.dashboard?.saveCurrentBoard();
        }

        // Update properties sidebar if selection might have changed (e.g. drag selection finished)
        if (this.state.currentTool === 'select') {
            this.propertiesSidebar.updateUIForTool('select');
        }

        this.needsRender = true;
    }

    handleKeyDown(e) {
        // Eğer kullanıcı bir input, textarea veya contenteditable bir alanda yazı yazıyorsa kısayolları çalıştırma
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        if (e.repeat) return;

        if (e.code === 'Space') {
            this.isSpacePressed = true;
            if (!this.zoomManager.isPanning) {
                this.canvas.style.cursor = 'grab';
            }
            return;
        }

        // Clipboard kısayolları (sadece select tool aktifken)
        if (this.state.currentTool === 'select') {
            const selectTool = this.tools.select;

            // Ctrl+C - Kopyala
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                selectTool.copySelected(this.state);
                return;
            }
        }

        // Ctrl+V - Yapıştır
        if (e.ctrlKey && e.key === 'v') {
            // Note: We do NOT call preventDefault here, so the 'paste' event
            // can fire and handle system clipboard images.
            if (this.state.currentTool === 'select') {
                const selectTool = this.tools.select;
                const pastedResult = selectTool.paste(this.state);
                if (pastedResult) {
                    this.saveHistory();
                    if (Array.isArray(pastedResult)) {
                        // Separate tapes from other objects
                        const tapes = pastedResult.filter(obj => obj.type === 'tape');
                        const others = pastedResult.filter(obj => obj.type !== 'tape');

                        // Add non-tape objects first, then tapes at the end (top layer)
                        this.state.objects.push(...others);
                        this.state.objects.push(...tapes);
                    } else {
                        // Single object
                        if (pastedResult.type === 'tape') {
                            this.state.objects.push(pastedResult);
                        } else {
                            this.state.objects.push(pastedResult);
                        }
                    }
                    this.needsRedrawOffscreen = true;
                    this.needsRender = true;
                }
            }
            return;
        }

        // Ctrl+X - Kes
        if (e.ctrlKey && e.key === 'x') {
            if (this.state.currentTool === 'select') {
                e.preventDefault();
                this.saveHistory();
                this.tools.select.cutSelected(this.state);
                this.needsRedrawOffscreen = true;
                this.needsRender = true;
                window.dashboard?.saveCurrentBoard();
            }
            return;
        }

        // Ctrl+D - Çoğalt
        if (e.ctrlKey && e.key === 'd') {
            if (this.state.currentTool === 'select') {
                e.preventDefault();
                // Save state BEFORE modification
                this.saveHistory();
                const duplicateResult = this.tools.select.duplicateSelected(this.state);
                if (duplicateResult) {
                    this.needsRedrawOffscreen = true;
                    this.needsRender = true;
                    window.dashboard?.saveCurrentBoard();
                }
            }
            return;
        }

        // Ctrl+S - Kaydet
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (window.dashboard) {
                window.dashboard.saveCurrentBoard(true);
                this.showToast('Sayfa Kaydedildi', 'success');
            }
            return;
        }

        // Delete / Backspace - Sil
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.state.currentTool === 'select' && this.tools.select.selectedObjects.length > 0) {
                e.preventDefault();
                this.saveHistory();
                this.tools.select.deleteSelected(this.state);
                this.needsRedrawOffscreen = true;
                this.needsRender = true;
                window.dashboard?.saveCurrentBoard();
                return;
            }
        }

        // Geri al (Ctrl+Z)
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            this.undo();
            return;
        }

        // İleri al (Ctrl+Y)
        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            this.redo();
            return;
        }

        // Selection Actions (G, U, K, J)
        if (this.state.currentTool === 'select' && !e.ctrlKey) {
            const selectTool = this.tools.select;
            if (e.key.toLowerCase() === 'g') {
                e.preventDefault();
                this.saveHistory();
                selectTool.groupSelected(this.state);
                this.needsRedrawOffscreen = true;
                this.needsRender = true;
                window.dashboard?.saveCurrentBoard();
                return;
            }
            if (e.key.toLowerCase() === 'u') {
                e.preventDefault();
                this.saveHistory();
                selectTool.ungroupSelected(this.state);
                this.needsRedrawOffscreen = true;
                this.needsRender = true;
                window.dashboard?.saveCurrentBoard();
                return;
            }
            if (e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.saveHistory();
                selectTool.lockSelected(this.state);
                window.dashboard?.saveCurrentBoard();
                return;
            }
            if (e.key.toLowerCase() === 'j') {
                e.preventDefault();
                this.saveHistory();
                selectTool.unlockSelected(this.state);
                window.dashboard?.saveCurrentBoard();
                return;
            }
        }

        // Araç kısayolları
        const toolShortcuts = {
            'p': 'pen',
            'i': 'highlighter',
            'h': 'hand',
            'a': 'arrow',
            'l': 'arrow',
            'r': 'rectangle',
            'e': 'ellipse',
            'o': 'shape',
            'q': 'shape',
            'x': 'eraser',
            'v': 'select',
            'g': 'grab-image',
            's': 'sticker',
            't': 'text',
            'k': 'charcoal',
            'd': 'fountain-pen',
            'c': 'settings'
        };

        if (e.key === 'Enter' && this.state.currentTool === 'vector-pen') {
            const completedPath = this.tools['vector-pen'].finishPath();
            if (completedPath) {
                this.saveHistory();
                this.state.objects.push(completedPath);
                this.needsRedrawOffscreen = true;
                this.render();
            }
            return;
        }

        if (!e.ctrlKey && !e.altKey && !e.metaKey && toolShortcuts[e.key.toLowerCase()]) {
            e.preventDefault();
            const toolName = toolShortcuts[e.key.toLowerCase()];

            if (toolName === 'settings') {
                this.canvasSettings.togglePanel();
                if (this.canvasSettings.isPanelOpen) {
                    this.canvasSettings.loadSettingsToPanel();
                }
            } else if (toolName === 'shape') {
                const shapePickerBtn = document.getElementById('shapePickerBtn');
                if (shapePickerBtn) shapePickerBtn.click(); // Trigger the existing picker logic
            } else {
                this.setTool(toolName);
            }
        }
    }

    startLongPress(e) {
        this.cancelLongPress();
        this.pressStartPos = { x: e.clientX, y: e.clientY };
        this.longPressTriggered = false;

        this.longPressTimer = setTimeout(() => {
            this.longPressTriggered = true;

            // vibration feedback
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }

            // 1. Mevcut aracın çizimini/işlemini iptal et (obje eklenmesini önle)
            const currentTool = this.tools[this.state.currentTool];
            if (currentTool) {
                if (currentTool.isDrawing !== undefined) currentTool.isDrawing = false;
                if (currentTool.currentPath !== undefined) currentTool.currentPath = null;
                if (currentTool.activeObject !== undefined) currentTool.activeObject = null;
                if (currentTool.currentShape !== undefined) currentTool.currentShape = null;
                if (currentTool.currentTape !== undefined) currentTool.currentTape = null;
            }

            // 2. Seç aracına geç (Eğer henüz değilse)
            if (this.state.currentTool !== 'select') {
                this.setTool('select');
            }

            // 3. Tıklanan yerdeki objeyi bul ve seç
            const worldPosGlobal = this.zoomManager.getPointerWorldPos(e);
            const pageIndex = this.pageManager.getPageIndexAt(worldPosGlobal.y);
            const pageY = this.pageManager.getPageY(pageIndex);
            const worldPos = {
                ...worldPosGlobal,
                y: worldPosGlobal.y - pageY
            };

            if (pageIndex !== this.pageManager.currentPageIndex) {
                this.pageManager.switchPage(pageIndex, false);
            }

            // Seçim işlemini manuel tetikle
            this.tools.select.handlePointerDown(e, worldPos, this.canvas, this.ctx, this.state);

            // 4. Eğer bir obje seçildiyse sağ tık menüsünü aç
            if (this.tools.select.selectedObjects.length > 0) {
                this.tools.select.handleContextMenu(e, this.canvas, this.state);
            }

            this.needsRedrawOffscreen = true;
            this.needsRender = true;
        }, this.longPressThreshold);
    }

    cancelLongPress() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.pressStartPos = null;
    }

    handleKeyUp(e) {
        if (e.code === 'Space') {
            this.isSpacePressed = false;
            if (!this.zoomManager.isPanning) {
                // Restore tool cursor
                this.setTool(this.state.currentTool);
            }
        }
    }

    saveHistory() {
        this.historyManager.saveState({
            objects: this.state.objects,
            settings: this.getToolSettings()
        });
    }

    getToolSettings() {
        return {
            strokeWidth: this.state.strokeWidth,
            strokeColor: this.state.strokeColor,
            opacity: this.state.opacity,
            lineStyle: this.state.lineStyle,
            pressureEnabled: this.state.pressureEnabled,
            highlighterCap: this.state.highlighterCap,
            arrowStartStyle: this.state.arrowStartStyle,
            arrowEndStyle: this.state.arrowEndStyle,
            arrowPathType: this.state.arrowPathType,
            stabilization: this.state.stabilization,
            decimation: this.state.decimation,
            fillEnabled: this.state.fillEnabled,
            tableRows: this.state.tableRows,
            tableCols: this.state.tableCols
        };
    }

    applyToolSettings(settings) {
        if (!settings) return;
        Object.keys(settings).forEach(key => {
            if (this.state.hasOwnProperty(key)) {
                this.state[key] = settings[key];
            }
        });
        if (this.propertiesSidebar) {
            this.propertiesSidebar.updateUIForTool(this.state.currentTool);
        }
    }

    undo() {
        const previous = this.historyManager.undo({
            objects: this.state.objects,
            settings: this.getToolSettings()
        });
        if (previous) {
            if (Array.isArray(previous)) {
                // Backward compatibility
                this.state.objects = previous;
            } else {
                this.state.objects = previous.objects;
                this.applyToolSettings(previous.settings);
            }
            this.needsRedrawOffscreen = true;
            this.needsRender = true;
            window.dashboard?.saveCurrentBoard();
        }
    }

    redo() {
        const next = this.historyManager.redo({
            objects: this.state.objects,
            settings: this.getToolSettings()
        });
        if (next) {
            if (Array.isArray(next)) {
                // Backward compatibility
                this.state.objects = next;
            } else {
                this.state.objects = next.objects;
                this.applyToolSettings(next.settings);
            }
            this.needsRedrawOffscreen = true;
            this.needsRender = true;
            window.dashboard?.saveCurrentBoard();
        }
    }

    redrawOffscreen() {
        const dpr = window.devicePixelRatio || 1;
        const viewW = this.canvas.clientWidth;
        const viewH = this.canvas.clientHeight;

        // Reset and clear the whole viewport
        this.offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        this.offscreenCtx.scale(dpr, dpr);

        // Masaüstü arkaplanı (Tüm viewport'u kaplayan workspace rengi)
        this.offscreenCtx.fillStyle = '#eeeeee';
        this.offscreenCtx.fillRect(0, 0, viewW, viewH);

        // Apply zoom transformation
        this.offscreenCtx.save();
        this.offscreenCtx.translate(this.zoomManager.pan.x, this.zoomManager.pan.y);
        this.offscreenCtx.scale(this.zoomManager.zoom, this.zoomManager.zoom);

        // Visible World Bounds
        const worldBounds = {
            x: -this.zoomManager.pan.x / this.zoomManager.zoom,
            y: -this.zoomManager.pan.y / this.zoomManager.zoom,
            w: viewW / this.zoomManager.zoom,
            h: viewH / this.zoomManager.zoom
        };

        // Render Pages
        this.pageManager.pages.forEach((page, index) => {
            const pageY = this.pageManager.getPageY(index);
            const pageH = this.pageManager.getPageHeight();
            const pageWidth = this.pageManager.getPageWidth();

            // Check visibility
            if (pageY + pageH < worldBounds.y || pageY > worldBounds.y + worldBounds.h) return;

            this.offscreenCtx.save();
            this.offscreenCtx.translate(0, pageY);

            // Render PDF background if available
            this.pdfManager.drawToContext(this.offscreenCtx, page, 0, 0, pageWidth, pageH);

            // Draw individual page background (only if no PDF, or as a fallback)
            if (!this.pdfManager.isLoaded || !page.pdfPageNumber) {
                this.canvasSettings.drawBackground(this.offscreenCanvas, this.offscreenCtx,
                    { x: 0, y: 0, width: pageWidth, height: pageH },
                    null, null, 1,
                    { color: page.backgroundColor, pattern: page.backgroundPattern }
                );
            }

            // Draw objects
            const objs = (index === this.pageManager.currentPageIndex) ? this.state.objects : page.objects;
            objs.forEach(obj => this.drawObject(this.offscreenCtx, obj));

            this.offscreenCtx.restore();
        });

        this.offscreenCtx.restore();
    }

    render() {
        const viewW = this.canvas.clientWidth;
        const viewH = this.canvas.clientHeight;

        // 1. Clear Screen
        this.ctx.clearRect(0, 0, viewW, viewH);

        // 2. Draw Workspace from Offscreen Buffer
        if (this.offscreenCanvas.width > 0 && this.offscreenCanvas.height > 0) {
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(this.offscreenCanvas, 0, 0, viewW, viewH);
            this.ctx.imageSmoothingEnabled = true;
        }

        this.ctx.save();

        // Apply Zoom & Pan for dynamic elements (In logical coordinates)
        this.ctx.translate(this.zoomManager.pan.x, this.zoomManager.pan.y);
        this.ctx.scale(this.zoomManager.zoom, this.zoomManager.zoom);

        // 4. Draw Active Page Preview
        const activePageY = this.pageManager.getPageY(this.pageManager.currentPageIndex);
        const activePageH = this.pageManager.getPageHeight();

        // Aktif sayfa genişliğini hesapla
        const activePageW = this.pageManager.getPageWidth();

        this.ctx.save();
        this.ctx.translate(0, activePageY);

        // Aktif sayfa dışına taşan önizlemeyi kırp
        this.ctx.beginPath();
        this.ctx.rect(0, 0, activePageW, activePageH);
        this.ctx.clip();

        const currentTool = this.tools[this.state.currentTool];
        let needsNextFrame = false;

        if ((currentTool.isDrawing || (this.state.currentTool === 'vector-pen' && currentTool.currentPath)) && (currentTool.currentPath || currentTool.currentTape)) {
            // Live Fill Rendering
            if (currentTool.currentPath && currentTool.currentPath.filled && this.fillManager) {
                this.fillManager.drawFill(this.ctx, currentTool.currentPath);
            }
            // Support preview for both pen path and tape object
            currentTool.drawPreview(this.ctx, currentTool.currentPath || currentTool.currentTape);
        } else if (currentTool.isDrawing && currentTool.currentLine) {
            currentTool.drawPreview(this.ctx, currentTool.currentLine);
        } else if (currentTool.isDrawing && currentTool.currentShape) {
            currentTool.drawPreview(this.ctx, currentTool.currentShape);
        } else if (currentTool.isDrawing && currentTool.currentArrow) {
            currentTool.drawPreview(this.ctx, currentTool.currentArrow);
        } else if (this.state.currentTool === 'eraser' && currentTool.currentTrail) {
            // Eraser trail can exist even if not currently erasing (fading)
            if (currentTool.drawPreview(this.ctx)) {
                needsNextFrame = true;
            }
        } else if (this.state.currentTool === 'verticalSpace' && currentTool.isDrawing) {
            currentTool.draw(this.ctx, this.state);
        } else if (this.state.currentTool === 'grab-image' && currentTool.selection) {
            currentTool.draw(this.ctx, this.zoomManager.zoom);
        }
        this.ctx.restore();

        // Request next frame if an animation (like eraser trail fade) is active
        if (needsNextFrame) {
            requestAnimationFrame(() => { this.needsRender = true; });
        }

        // Silgi imleci - World Coordinates
        if (this.state.currentTool === 'eraser' && currentTool.drawCursor) {
            const worldPosGlobal = this.zoomManager.getPointerWorldPos({
                offsetX: this.currentMousePos.x,
                offsetY: this.currentMousePos.y
            });
            const pageY = this.pageManager.getPageY(this.pageManager.currentPageIndex);
            currentTool.drawCursor(this.ctx, worldPosGlobal.x, worldPosGlobal.y - pageY, this.state);
        }

        // Seçim gösterimi
        if (this.state.currentTool === 'select') {
            const pageY = this.pageManager.getPageY(this.pageManager.currentPageIndex);
            this.ctx.save();
            this.ctx.translate(0, pageY);
            currentTool.drawSelection(this.ctx, this.state, this.zoomManager.zoom);
            this.ctx.restore();
        }

        this.ctx.restore();

        this.updateStatus();
    }

    drawObject(ctx, obj) {
        if (obj.type === 'group') {
            obj.children.forEach(child => this.drawObject(ctx, child));
        } else {
            // Fill pass for closed pen paths
            if ((obj.type === 'pen' || obj.type === 'highlighter') && obj.filled && this.fillManager) {
                this.fillManager.drawFill(ctx, obj);
            }

            const tool = this.tools[obj.type];
            if (tool) {
                tool.draw(ctx, obj);
            }
        }
    }

    updateStatus() {
        const toolNames = {
            pen: 'Kalem',
            line: 'Çizgi',
            rectangle: 'Dikdörtgen',
            ellipse: 'Elips',
            triangle: 'Üçgen',
            trapezoid: 'Yamuk',
            star: 'Yıldız',
            diamond: 'Karo',
            parallelogram: 'Paralel Kenar',
            oval: 'Oval',
            heart: 'Kalp',
            cloud: 'Bulut',
            arrow: 'Ok',
            eraser: 'Silgi',
            hand: 'El',
            select: 'Seç',
            highlighter: 'Vurgulayıcı',
            sticker: 'Sticker',
            text: 'Metin',
            image: 'Resim',
            verticalSpace: 'Dikey Boşluk',
            charcoal: 'Karakalem',
            watercolor: 'Suluboya'
        };

        document.getElementById('toolInfo').textContent =
            `Aktif Araç: ${toolNames[this.state.currentTool]}`;

        document.getElementById('objectCount').textContent =
            `Öğe Sayısı: ${this.state.objects.length}`;

        document.getElementById('canvasSize').textContent =
            `Tuval: ${this.canvasSettings.getSizeLabel()}`;

        if (this.currentMousePos) {
            document.getElementById('cursorPos').textContent =
                `X: ${Math.round(this.currentMousePos.x)}, Y: ${Math.round(this.currentMousePos.y)}`;
        }
    }

    showToast(message, type = 'info') {
        let toast = document.getElementById('betik-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'betik-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 110px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(40,40,40,0.95);
                color: white;
                padding: 10px 24px;
                border-radius: 24px;
                font-size: 14px;
                z-index: 10000;
                pointer-events: none;
                transition: opacity 0.3s, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                border: 1px solid rgba(255,255,255,0.1);
            `;
            document.body.appendChild(toast);
        }

        const icons = {
            'success': '✅',
            'error': '❌',
            'info': 'ℹ️'
        };

        toast.innerHTML = `<span style="font-size: 16px;">${icons[type] || ''}</span> <span style="font-weight: 500;">${message}</span>`;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';

        if (this._toastTimeout) clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
        }, 2500);
    }
}

// Uygulamayı başlat
window.app = new BetikApp();
window.dashboard = new Dashboard(window.app);
