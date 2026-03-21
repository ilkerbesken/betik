class PropertiesSidebar {
    constructor(app) {
        this.app = app;
        this.customTapePatterns = []; // List of custom masks/images for tape
        this.loadCustomTapePatterns(); // Load from localStorage

        // Quick Colors Initialization
        this.quickColors = [];
        this.activeColorPopupIndex = -1;
        this.loadQuickColors();

        // Quick Stroke Widths Initialization
        this.quickStrokeWidths = [];
        this.activeStrokeIndex = 0;
        this.loadQuickStrokeWidths();

        this.init();
    }

    init() {
        this.container = document.getElementById('propertiesSidebar');
        this.isInteractionStarted = false;
        this.setupEventListeners();
        this.renderQuickColors();
        this.renderQuickStrokeWidths();
        this.setupClickOutside();
        this.setupOverlay();
    }

    setupOverlay() {
        const overlay = document.getElementById('bottomSheetOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeAllPopups());
        }
    }

    setupClickOutside() {
        document.addEventListener('mousedown', (e) => {
            // If click is outside popups and outside the triggers
            const isClickInsidePopup = e.target.closest('.property-popup');
            const isClickOnTrigger = e.target.closest('.quick-color-btn') ||
                e.target.closest('.quick-stroke-btn') ||
                e.target.closest('.property-trigger-btn') ||
                e.target.closest('.pattern-btn');

            if (!isClickInsidePopup && !isClickOnTrigger) {
                this.closeAllPopups();
            }
        });
    }

    setupEventListeners() {
        // Opacity Slider Sync
        const opacitySliders = document.querySelectorAll('.opacity-slider');
        const opacityInput = document.getElementById('opacityInput');
        opacitySliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);

                // Save state ONCE at the start of continuous interaction
                if (!this.isInteractionStarted && this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.isInteractionStarted = true;
                }

                this.app.state.opacity = val / 100;
                if (opacityInput) opacityInput.value = val;
                // Sync all opacity sliders
                opacitySliders.forEach(s => { if (s !== e.target) s.value = val; });

                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { opacity: this.app.state.opacity });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }
            });
            slider.addEventListener('change', (e) => {
                this.isInteractionStarted = false; // Reset flag for next interaction
            });
        });

        // Opacity Numerical Input Sync
        if (opacityInput) {
            opacityInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val)) return;
                if (val < 0) val = 0;
                if (val > 100) val = 100;

                this.app.state.opacity = val / 100;
                opacitySliders.forEach(s => { s.value = val; });

                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { opacity: this.app.state.opacity });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }
            });
        }

        // Stroke Width Slider Sync
        const widthSliders = document.querySelectorAll('.stroke-width-slider');
        const widthInput = document.getElementById('strokeWidthInput');
        widthSliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);

                // Save state ONCE at the start of continuous interaction
                if (!this.isInteractionStarted && this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.isInteractionStarted = true;
                }

                this.app.state.strokeWidth = val;
                if (widthInput) widthInput.value = val;
                const eraserVal = document.getElementById('eraserSizeVal');
                if (eraserVal) eraserVal.textContent = val + 'px';
                // Sync all width sliders
                widthSliders.forEach(s => { if (s !== e.target) s.value = val; });

                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { width: this.app.state.strokeWidth });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }

                // Update active quick stroke slot
                if (this.activeStrokeIndex !== -1) {
                    this.quickStrokeWidths[this.activeStrokeIndex] = val;
                    this.saveQuickStrokeWidths();
                    this.renderQuickStrokeWidths();
                }
            });
            slider.addEventListener('change', (e) => {
                this.isInteractionStarted = false; // Reset flag
            });
        });

        // Stroke Width Numerical Input Sync
        if (widthInput) {
            widthInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val)) return;
                if (val < 1) val = 1;
                if (val > 80) val = 80;

                this.app.state.strokeWidth = val;
                widthSliders.forEach(s => { s.value = val; });

                const eraserVal = document.getElementById('eraserSizeVal');
                if (eraserVal) eraserVal.textContent = val + 'px';

                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { width: this.app.state.strokeWidth });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }

                if (this.activeStrokeIndex !== -1) {
                    this.quickStrokeWidths[this.activeStrokeIndex] = val;
                    this.saveQuickStrokeWidths();
                    this.renderQuickStrokeWidths();
                }
            });
        }

        // Stabilization Slider Sync
        const stabSliders = document.querySelectorAll('.stabilization-slider');
        const stabInput = document.getElementById('stabilizationInput');
        stabSliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.app.state.stabilization = val / 100;
                if (stabInput) stabInput.value = val;
                // Sync all stabilization sliders
                stabSliders.forEach(s => { if (s !== e.target) s.value = val; });
            });
        });

        // Stabilization Numerical Input Sync
        if (stabInput) {
            stabInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val)) return;
                if (val < 0) val = 0;
                if (val > 100) val = 100;
                this.app.state.stabilization = val / 100;
                stabSliders.forEach(s => { s.value = val; });
            });
        }

        // Decimation Slider Sync
        const decSliders = document.querySelectorAll('.decimation-slider');
        const decInput = document.getElementById('decimationInput');
        decSliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.app.state.decimation = val / 100;
                if (decInput) decInput.value = val;
                // Sync all decimation sliders
                decSliders.forEach(s => { if (s !== e.target) s.value = val; });
            });
        });

        // Decimation Numerical Input Sync
        if (decInput) {
            decInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val)) return;
                if (val < 0) val = 0;
                if (val > 50) val = 50;
                this.app.state.decimation = val / 100;
                decSliders.forEach(s => { s.value = val; });
            });
        }

        // Nib Angle Slider Sync
        const nibAngleSliders = document.querySelectorAll('.nib-angle-slider');
        const nibAngleInput = document.getElementById('nibAngleInput');
        nibAngleSliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.app.state.nibAngle = (val * Math.PI) / 180;
                if (nibAngleInput) nibAngleInput.value = val;
                // Sync all nib angle sliders
                nibAngleSliders.forEach(s => { if (s !== e.target) s.value = val; });

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    const selectTool = this.app.tools.select;
                    const obj = this.app.state.objects[selectTool.selectedObjects[0]];
                    if (obj && obj.type === 'fountain-pen') {
                        selectTool.updateSelectedObjectsStyle(this.app.state, { nibAngle: this.app.state.nibAngle });
                        if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                        this.app.render();
                    }
                }
            });
        });

        // Nib Angle Numerical Input Sync
        if (nibAngleInput) {
            nibAngleInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val)) return;
                if (val < 0) val = 0;
                if (val > 360) val = 360;
                this.app.state.nibAngle = (val * Math.PI) / 180;
                nibAngleSliders.forEach(s => { s.value = val; });

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    const selectTool = this.app.tools.select;
                    const obj = this.app.state.objects[selectTool.selectedObjects[0]];
                    if (obj && obj.type === 'fountain-pen') {
                        selectTool.updateSelectedObjectsStyle(this.app.state, { nibAngle: this.app.state.nibAngle });
                        if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                        this.app.render();
                    }
                }
            });
        }

        // Pressure Sensitivity Button
        document.getElementById('pressureBtn').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            this.app.state.pressureEnabled = !this.app.state.pressureEnabled;
            btn.classList.toggle('active', this.app.state.pressureEnabled);
        });

        // Line Styles
        document.querySelectorAll('.tool-btn[data-linestyle]').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.linestyle;
                this.app.state.lineStyle = style;

                // UI Update
                document.querySelectorAll('.tool-btn[data-linestyle]').forEach(b =>
                    b.classList.remove('active')
                );
                btn.classList.add('active');

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory(); // Save state BEFORE change
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { lineStyle: style });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }
            });
        });

        // Highlighter Cap Settings
        document.querySelectorAll('.tool-btn[data-highlighter-cap]').forEach(btn => {
            btn.addEventListener('click', () => {
                const capValue = btn.dataset.highlighterCap;

                this.app.state.highlighterCap = capValue;

                // UI Update
                document.querySelectorAll('.tool-btn[data-highlighter-cap]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { highlighterCap: capValue });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }
            });
        });

        // Arrow Start Style Settings
        document.querySelectorAll('.tool-btn[data-arrow-start]').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.arrowStart;
                this.app.state.arrowStartStyle = style;

                // UI Update
                document.querySelectorAll('.tool-btn[data-arrow-start]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { arrowStartStyle: style });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }
            });
        });

        // Arrow End Style Settings
        document.querySelectorAll('.tool-btn[data-arrow-end]').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.arrowEnd;
                this.app.state.arrowEndStyle = style;

                // UI Update
                document.querySelectorAll('.tool-btn[data-arrow-end]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { arrowEndStyle: style });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }
            });
        });

        // Arrow Path Type Settings (toggle behavior)
        document.querySelectorAll('.tool-btn[data-arrow-path]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pathType = btn.dataset.arrowPath;
                const isActive = btn.classList.contains('active');
                let finalPathType = 'straight';

                // Toggle: clicking active button returns to straight
                if (isActive) {
                    finalPathType = 'straight';
                    this.app.state.arrowPathType = 'straight';
                    btn.classList.remove('active');
                } else {
                    finalPathType = pathType;
                    this.app.state.arrowPathType = pathType;
                    // Deactivate all others
                    document.querySelectorAll('.tool-btn[data-arrow-path]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { arrowPathType: finalPathType });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }
            });
        });

        // Arrow Settings Popovers (Start/End Arrow Heads)
        const btnStartTrigger = document.getElementById('btnArrowStartTrigger');
        const btnEndTrigger = document.getElementById('btnArrowEndTrigger');
        const popupStart = document.getElementById('popupArrowStart');
        const popupEnd = document.getElementById('popupArrowEnd');

        // Combined Brush Settings Trigger
        const btnBrushSettingsTrigger = document.getElementById('btnBrushSettingsTrigger');
        const popupBrushSettings = document.getElementById('popupBrushSettings');


        const closeAllPopups = () => this.closeAllPopups();

        // Close popups when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.property-trigger-btn') &&
                !e.target.closest('.property-popup') &&
                !e.target.closest('.property-popup-responsive') &&
                !e.target.closest('.quick-color-btn') &&
                !e.target.closest('.quick-stroke-btn') &&
                !e.target.closest('#btnQuickColorAdd') &&
                !e.target.closest('#btnTapeCustomPatterns') &&
                !e.target.closest('#btnStartTrigger') &&
                !e.target.closest('#btnEndTrigger')) {
                closeAllPopups();
            }
        });

        // Quick Color Add
        const btnQuickColorAdd = document.getElementById('btnQuickColorAdd');
        if (btnQuickColorAdd) {
            btnQuickColorAdd.addEventListener('click', () => {
                if (this.quickColors.length < 8) {
                    this.showColorPalettePopup(this.quickColors.length, btnQuickColorAdd);
                }
            });
        }

        // Palette Popup Listeners
        const btnPopupEyedropper = document.getElementById('btnPopupEyedropper');
        if (btnPopupEyedropper) {
            btnPopupEyedropper.addEventListener('click', async () => {
                if (window.EyeDropper) {
                    try {
                        const eyeDropper = new EyeDropper();
                        const result = await eyeDropper.open();
                        this.updateQuickColor(this.activeColorPopupIndex, result.sRGBHex);
                        this.closeAllPopups();
                    } catch (e) { console.log('Eyedropper failed', e); }
                }
            });
        }

        const btnPopupMoreColors = document.getElementById('btnPopupMoreColors');
        if (btnPopupMoreColors) {
            btnPopupMoreColors.addEventListener('click', (e) => {
                const popup = document.getElementById('popupColorPalette');
                if (this.app.colorPalette) {
                    this.app.colorPalette.showColorPicker('#000000', (newColor) => {
                        this.updateQuickColor(this.activeColorPopupIndex, newColor);
                        this.closeAllPopups();
                    }, btnPopupMoreColors, 'left');
                }
            });
        }


        if (btnStartTrigger && popupStart) {
            btnStartTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (popupStart.classList.contains('mobile-visible') || (popupStart.style.display === 'flex')) {
                    this.closeAllPopups();
                } else {
                    this.showPopup(popupStart, btnStartTrigger);
                }
            });
        }

        if (btnEndTrigger && popupEnd) {
            btnEndTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (popupEnd.classList.contains('mobile-visible') || (popupEnd.style.display === 'flex')) {
                    this.closeAllPopups();
                } else {
                    this.showPopup(popupEnd, btnEndTrigger);
                }
            });
        }

        // Brush Settings Trigger Logic
        if (btnBrushSettingsTrigger && popupBrushSettings) {
            btnBrushSettingsTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleBrushSettingsPopup(btnBrushSettingsTrigger);
            });
        }



        // Close popup when options are selected
        const popupButtons = document.querySelectorAll('.property-popup .tool-btn');
        popupButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                closeAllPopups();
            });
        });

        // Eraser Mode Settings
        document.querySelectorAll('.tool-btn[data-eraser-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.eraserMode;
                this.app.state.eraserMode = mode;

                // UI Update
                document.querySelectorAll('.tool-btn[data-eraser-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Fill Toggle
        // Fill Toggle
        const fillBtn = document.getElementById('btnFillToggle');
        if (fillBtn) {
            fillBtn.addEventListener('click', () => {
                const currentTool = this.app.state.currentTool;

                if (currentTool === 'select' && this.app.tools.select.selectedObjects.length === 1) {
                    const objIndex = this.app.tools.select.selectedObjects[0];
                    const obj = this.app.state.objects[objIndex];

                    if (obj) {
                        const isShape = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'].includes(obj.type);
                        const canFill = isShape || (obj.type === 'vector-pen') || (this.app.fillManager && this.app.fillManager.canBeFilled(obj));

                        if (canFill) {
                            this.app.saveHistory();

                            if (isShape || obj.type === 'vector-pen') {
                                // Toggle fill for advanced shapes and vector pens
                                obj.filled = !obj.filled;
                                obj.fillColor = obj.filled ? (obj.fillColor || obj.color || obj.strokeColor) : 'transparent';
                                // If it was 'transparent', make it follow current color
                                if (obj.filled && obj.fillColor === 'transparent') obj.fillColor = obj.color || obj.strokeColor;
                            } else {
                                // Toggle fill for freehand via FillManager (pen/highlighter)
                                this.app.fillManager.toggleFill(obj, obj.color);
                            }

                            fillBtn.classList.toggle('active', !!obj.filled);
                            if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                            this.app.render();
                        }
                    }
                } else if (['pen', 'highlighter', 'vector-pen', 'rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'].includes(currentTool)) {
                    // Logic for Live Drawing Mode
                    this.app.state.fillEnabled = !this.app.state.fillEnabled;
                    fillBtn.classList.toggle('active', this.app.state.fillEnabled);
                }
            });
        }

        // Select Tool Mode Settings
        document.querySelectorAll('.tool-btn[data-select-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.selectMode;
                if (this.app.tools.select) {
                    this.app.tools.select.selectionMode = mode;
                }
                document.querySelectorAll('.tool-btn[data-select-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Vertical Space Tool Button in Sidebar
        const btnVerticalSpaceTool = document.getElementById('btnVerticalSpaceTool');
        if (btnVerticalSpaceTool) {
            btnVerticalSpaceTool.addEventListener('click', () => {
                this.app.setTool('verticalSpace');
                document.querySelectorAll('.tool-btn[data-select-mode]').forEach(b => b.classList.remove('active'));
            });
        }

        // PDF Text Highlight Button
        const btnHighlightPdfText = document.getElementById('btnHighlightPdfText');
        if (btnHighlightPdfText) {
            btnHighlightPdfText.addEventListener('click', () => {
                if (this.app.pdfManager && this.app.pdfManager.textSelector && this.app.state.pdfTextSelectionActive) {
                    this.app.pdfManager.textSelector.highlightSelectedText();
                }
            });
        }

        // OCR: Resim nesnesini görünmez metin katmanına dönüştür
        const btnOcrImage = document.getElementById('btnOcrImage');
        if (btnOcrImage) {
            btnOcrImage.addEventListener('click', async () => {
                if (!this.app.ocrManager) {
                    this.app.ocrManager = new OCRManager(this.app);
                }
                const selectTool = this.app.tools.select;
                if (selectTool && selectTool.selectedObjects.length === 1) {
                    const obj = this.app.state.objects[selectTool.selectedObjects[0]];
                    if (obj && obj.type === 'image') {
                        await this.app.ocrManager.recognizeImageObject(obj);
                    }
                }
            });
        }

        // OCR: Dil seçici dropdown — dil değişince worker'ı sıfırla
        const ocrLangSelect = document.getElementById('ocrLangSelect');
        if (ocrLangSelect) {
            ocrLangSelect.addEventListener('change', () => {
                const lang = ocrLangSelect.value;
                if (this.app.ocrManager) {
                    this.app.ocrManager.setLanguage(lang);
                }
                console.log('[OCR] Dil seçildi:', lang);
            });
        }

        // OCR: Bu PDF sayfasını görünmez metin katmanına dönüştür
        const btnOcrPdfPage = document.getElementById('btnOcrPdfPage');
        if (btnOcrPdfPage) {
            btnOcrPdfPage.addEventListener('click', async () => {
                if (!this.app.ocrManager) {
                    this.app.ocrManager = new OCRManager(this.app);
                }
                await this.app.ocrManager.recognizeCurrentPDFPage();
            });
        }

        // OCR: Tüm PDF dökümanını metne dönüştür
        const btnOcrPdfAll = document.getElementById('btnOcrPdfAll');
        if (btnOcrPdfAll) {
            btnOcrPdfAll.addEventListener('click', async () => {
                if (!this.app.ocrManager) {
                    this.app.ocrManager = new OCRManager(this.app);
                }
                await this.app.ocrManager.recognizeEntirePDF();
            });
        }


        // Tape Tool Mode Settings
        document.querySelectorAll('.tool-btn[data-tape-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.tapeMode;
                if (this.app.tools.tape) {
                    this.app.tools.tape.updateSettings({ mode: mode });
                }

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { tapeMode: mode });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }

                document.querySelectorAll('.tool-btn[data-tape-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Tape Tool Pattern Settings
        document.querySelectorAll('.pattern-btn[data-tape-pattern]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pattern = btn.dataset.tapePattern;
                if (this.app.tools.tape) {
                    this.app.tools.tape.updateSettings({ pattern: pattern });
                }

                // Update Selection
                if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.saveHistory();
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { tapePattern: pattern });
                    if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                    this.app.render();
                }

                document.querySelectorAll('.pattern-btn[data-tape-pattern]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Tape Image Upload
        const tapeImageInput = document.getElementById('tapeImageInput');
        const btnTapeImageUpload = document.getElementById('btnTapeImageUpload');
        if (btnTapeImageUpload && tapeImageInput) {
            btnTapeImageUpload.addEventListener('click', () => {
                tapeImageInput.click();
            });

            tapeImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            if (this.app.tools.tape) {
                                this.app.tools.tape.updateSettings({ pattern: 'custom', customImage: img });

                                // Save to custom patterns list
                                this.addCustomTapePattern(img, 'custom');
                            }

                            // Update Selection
                            if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                                this.app.saveHistory();
                                this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { tapePattern: 'custom', customImage: img });
                                if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                                this.app.render();
                            }

                            // UI Update: highlight upload btn
                            document.querySelectorAll('.pattern-btn[data-tape-pattern]').forEach(b => b.classList.remove('active'));
                            btnTapeImageUpload.classList.add('active');
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // Tape Pick Shape
        const btnTapePickShape = document.getElementById('btnTapePickShape');
        if (btnTapePickShape) {
            btnTapePickShape.addEventListener('click', () => {
                // Enter pick shape mode
                this.app.state.pickShapeMode = !this.app.state.pickShapeMode;
                btnTapePickShape.classList.toggle('active', this.app.state.pickShapeMode);
                if (this.app.state.pickShapeMode) {
                    this.app.canvas.style.cursor = 'crosshair';
                } else {
                    this.app.canvas.style.cursor = (this.app.state.currentTool === 'tape') ? 'crosshair' : 'default';
                }
            });
        }

        // Custom Patterns Popup Toggle
        const btnTapeCustomPatterns = document.getElementById('btnTapeCustomPatterns');
        const popupTapeCustomPatterns = document.getElementById('popupTapeCustomPatterns');
        if (btnTapeCustomPatterns && popupTapeCustomPatterns) {
            btnTapeCustomPatterns.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = popupTapeCustomPatterns.classList.contains('mobile-visible') || (popupTapeCustomPatterns.style.display === 'flex');
                if (isVisible) {
                    this.closeAllPopups();
                } else {
                    this.renderCustomTapePatterns();
                    this.showPopup(popupTapeCustomPatterns, btnTapeCustomPatterns);
                }
            });
        }

        // Close popups on sidebar scroll
        if (this.container) {
            this.container.addEventListener('scroll', () => {
                closeAllPopups();
            }, { passive: true });
            // Table Row/Col Inputs
            const rowInput = document.getElementById('tableRowInput');
            const colInput = document.getElementById('tableColInput');

            if (rowInput) {
                rowInput.value = this.app.state.tableRows || 3;
                rowInput.addEventListener('change', (e) => {
                    let val = parseInt(e.target.value);
                    if (val < 1) val = 1;
                    this.app.state.tableRows = val;
                });
            }
            if (colInput) {
                colInput.value = this.app.state.tableCols || 3;
                colInput.addEventListener('change', (e) => {
                    let val = parseInt(e.target.value);
                    if (val < 1) val = 1;
                    this.app.state.tableCols = val;
                });
            }

            // Table Row/Col Adjustment Buttons
            document.querySelectorAll('.num-adj-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const targetId = btn.dataset.target;
                    const dir = btn.dataset.dir;
                    const input = document.getElementById(targetId);
                    if (input) {
                        let val = parseInt(input.value);
                        if (dir === 'up') val++;
                        else val--;

                        const min = parseInt(input.min) || 1;
                        const max = parseInt(input.max) || 20;

                        if (val < min) val = min;
                        if (val > max) val = max;

                        input.value = val;
                        // Trigger change event to update app state
                        input.dispatchEvent(new Event('change'));
                    }
                });
            });

            // Reset Properties Link Listener
            const btnReset = document.getElementById('btnResetProperties');
            if (btnReset) {
                btnReset.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.resetToDefaults();
                });
            }
        }
    }

    resetToDefaults() {
        const tool = this.app.state.currentTool;

        // Save history before change (allowing undo)
        this.app.saveHistory();

        // Defaults mapping
        const defaults = {
            pen: { strokeWidth: 3, strokeColor: '#000000', opacity: 1.0, lineStyle: 'solid', pressureEnabled: true, stabilization: 0.7, decimation: 0 },
            highlighter: { strokeWidth: 14, strokeColor: '#E4FF30', opacity: 0.5, lineStyle: 'solid', highlighterCap: 'butt', pressureEnabled: false, stabilization: 0.7 },
            eraser: { eraserMode: 'object', strokeWidth: 20 },
            select: { strokeWidth: 3, strokeColor: '#000000', opacity: 1.0, lineStyle: 'solid' },
            tape: { strokeWidth: 20, strokeColor: '#5c9bfe', opacity: 1.0, tapeMode: 'line', tapePattern: 'stripes' },
            table: { tableRows: 3, tableCols: 3, strokeWidth: 1, strokeColor: '#000000', opacity: 1.0 },
            text: { strokeWidth: 3, strokeColor: '#000000', opacity: 1.0 },
            charcoal: { strokeWidth: 8, strokeColor: '#262626', opacity: 0.9 },
            'fountain-pen': { strokeWidth: 5, strokeColor: '#000000', opacity: 1.0, pressureEnabled: true },
            'vector-pen': { strokeWidth: 3, strokeColor: '#000000', opacity: 1.0 }
        };

        // Shape defaults (shared)
        const shapeTypes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'line', 'arrow'];
        shapeTypes.forEach(t => {
            defaults[t] = { strokeWidth: 3, strokeColor: '#000000', opacity: 1.0, lineStyle: 'solid', fillEnabled: false };
        });

        const toolDefaults = defaults[tool] || defaults['pen'];

        // --- Sync Sidebar Settings with app.state ---
        Object.keys(toolDefaults).forEach(key => {
            if (this.app.state.hasOwnProperty(key)) {
                this.app.state[key] = toolDefaults[key];
            }
        });
        // Always ensure fill is off if not specified
        if (!toolDefaults.hasOwnProperty('fillEnabled')) {
            this.app.state.fillEnabled = false;
        }

        // Reset Properties Sidebar Colors for highlighter if needed
        if (tool === 'highlighter') {
            this.quickColors = ['#e3ff00', '#83f18d', '#67dfff', '#ff659f', '#fd934c', '#ff1837', '#5151ff'];
        } else {
            this.quickColors = ['#000000', '#ff5c5c', '#5c9bfe'];
        }
        this.saveQuickColors();
        this.renderQuickColors();

        // Reset Main Color Palette
        if (this.app.colorPalette) {
            this.app.colorPalette.resetToDefaults();
        }

        // Reset Quick Stroke Widths
        this.quickStrokeWidths = [3, 5, 7];
        this.saveQuickStrokeWidths();
        this.activeStrokeIndex = this.quickStrokeWidths.indexOf(this.app.state.strokeWidth);
        this.renderQuickStrokeWidths();

        // If selection exists and Select tool is used, update selected objects too
        if (tool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
            this.app.tools.select.updateSelectedObjectsStyle(this.app.state, toolDefaults);
        }

        // Update UI components
        this.updateUIForTool(tool);

        // Feedback
        if (this.app.redrawOffscreen) this.app.redrawOffscreen();
        this.app.render();

        // Show a brief toast or visual sign if needed (Optional)
        const btnReset = document.getElementById('btnResetProperties');
        if (btnReset) {
            btnReset.style.color = '#2196f3';
            setTimeout(() => { btnReset.style.color = ''; }, 500);
        }
    }

    addCustomTapePattern(canvas, type = 'mask') {
        // Create a thumbnail/copy of the canvas to store
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = canvas.width;
        patternCanvas.height = canvas.height;
        const pCtx = patternCanvas.getContext('2d');
        pCtx.drawImage(canvas, 0, 0);

        this.customTapePatterns.push({
            id: Date.now(),
            canvas: patternCanvas,
            type: type
        });

        // Show feedback (optional)
        const btn = document.getElementById('btnTapeCustomPatterns');
        if (btn) {
            btn.style.background = '#e3f2fd';
            setTimeout(() => btn.style.background = '', 500);
        }

        this.saveCustomTapePatterns();
    }

    saveCustomTapePatterns() {
        const patternsToSave = this.customTapePatterns.map(p => ({
            id: p.id,
            type: p.type,
            dataUrl: p.canvas.toDataURL()
        }));
        localStorage.setItem('betik_custom_tapes', JSON.stringify(patternsToSave));
    }

    loadCustomTapePatterns() {
        try {
            const saved = localStorage.getItem('betik_custom_tapes');
            if (saved) {
                const patterns = JSON.parse(saved);
                this.customTapePatterns = patterns.map(p => {
                    const canvas = document.createElement('canvas');
                    const img = new Image();
                    img.onload = () => {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                    };
                    img.src = p.dataUrl;
                    return {
                        id: p.id,
                        type: p.type,
                        canvas: canvas
                    };
                });
            }
        } catch (e) {
            console.error('Error loading custom tape patterns:', e);
            this.customTapePatterns = [];
        }
    }

    renderCustomTapePatterns() {
        const list = document.getElementById('tapeCustomPatternsList');
        if (!list) return;

        if (this.customTapePatterns.length === 0) {
            list.innerHTML = '<div style="padding: 10px; color: #999; font-size: 11px; text-align: center; width: 100%;">Henüz desen eklenmedi</div>';
            return;
        }

        list.innerHTML = '';
        this.customTapePatterns.forEach(pattern => {
            const item = document.createElement('div');
            item.className = 'tape-pattern-item';

            // Create a preview canvas
            const preview = document.createElement('canvas');
            preview.width = 40;
            preview.height = 40;
            const ctx = preview.getContext('2d');
            ctx.drawImage(pattern.canvas, 0, 0, 40, 40);

            item.appendChild(preview);

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '×';
            delBtn.title = 'Sil';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteCustomPattern(pattern.id);
            };
            item.appendChild(delBtn);

            item.onclick = () => {
                if (this.app.tools.tape) {
                    if (pattern.type === 'mask') {
                        this.app.tools.tape.updateSettings({ pattern: 'mask', customMask: pattern.canvas });
                    } else if (pattern.type === 'custom') {
                        this.app.tools.tape.updateSettings({ pattern: 'custom', customImage: pattern.canvas });
                    }
                }
                // Update UI: Deactivate built-in patterns
                document.querySelectorAll('.pattern-btn[data-tape-pattern]').forEach(b => b.classList.remove('active'));
                this.closeAllPopups();
            };

            list.appendChild(item);
        });
    }

    deleteCustomPattern(id) {
        this.customTapePatterns = this.customTapePatterns.filter(p => p.id !== id);
        this.saveCustomTapePatterns();
        this.renderCustomTapePatterns();
    }

    closeAllPopups() {
        const popups = document.querySelectorAll('.property-popup');
        popups.forEach(p => {
            p.style.display = 'none';
            p.classList.remove('mobile-visible');
        });

        const overlay = document.getElementById('bottomSheetOverlay');
        if (overlay) overlay.classList.remove('show');

        // Reset trigger states
        document.querySelectorAll('.active-popup').forEach(b => b.classList.remove('active-popup'));
        document.querySelectorAll('.active').forEach(b => {
            if (b.classList.contains('property-trigger-btn')) b.classList.remove('active');
        });

        // Close mobile-specific popups (if any legacy names remain)
        ['Thickness', 'Opacity', 'Stabilization', 'Decimation'].forEach(name => {
            const popup = document.getElementById(`popup${name}`);
            const btn = document.getElementById(`btn${name}Trigger`);
            if (popup) popup.classList.remove('show');
            if (btn) btn.classList.remove('active');
        });
    }

    showPopup(popup, anchor) {
        this.closeAllPopups();
        if (!popup) return;

        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            popup.style.display = 'flex';
            // Allow display: flex to apply before adding class for transition
            setTimeout(() => {
                popup.classList.add('mobile-visible');
                const overlay = document.getElementById('bottomSheetOverlay');
                if (overlay) overlay.classList.add('show');
            }, 10);
        } else {
            popup.style.display = 'flex';
            this.positionPopup(anchor, popup);
        }

        if (anchor) anchor.classList.add('active-popup');
    }

    positionPopup(trigger, popup) {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) return; // Let CSS handle mobile layout

        const rect = trigger.getBoundingClientRect();

        // If the trigger is hidden (e.g. display: none), getBoundingClientRect returns all 0s.
        // In that case, we don't want to show the popup at (0,0) or try to position it.
        if (rect.width === 0 && rect.height === 0) return;

        popup.style.position = 'fixed';
        popup.style.top = (rect.bottom + 8) + 'px';

        // Wait a tiny bit for the layout to compute the final width of the newly shown popup
        // or just use offsetWidth if it's already display: block/grid/etc. 
        let left = rect.left;
        const popupWidth = popup.offsetWidth || 200;

        // If the popup would overflow the right edge of the screen
        if (left + popupWidth > window.innerWidth) {
            left = window.innerWidth - popupWidth - 10;
        }

        // Ensure it doesn't overflow the left edge
        if (left < 10) left = 10;

        popup.style.left = left + 'px';
        popup.style.transform = 'none';
        popup.style.zIndex = '1001'; // Ensure it is above everything

        // Update arrow position (pseudo-element)
        const arrowOffset = rect.left - left + (rect.width / 2) - 6;
        popup.style.setProperty('--arrow-left', `${arrowOffset}px`);
    }

    toggleBrushSettingsPopup(anchor) {
        const popup = document.getElementById('popupBrushSettings');
        if (!popup) return;

        const isVisible = popup.style.display === 'flex' || popup.classList.contains('mobile-visible');
        if (isVisible) {
            this.closeAllPopups();
        } else {
            this.showPopup(popup, anchor);
        }
    }

    updateUIForTool(tool) {
        if (!this.container) return;

        // 1. Tool independent palettes: Sync storage with tool type
        this.loadQuickColors();
        this.loadQuickStrokeWidths();

        const toolsWithoutSidebar = ['hand', 'verticalSpace'];
        if (toolsWithoutSidebar.includes(tool)) {
            this.container.style.display = 'none';
            return;
        }

        this.container.style.display = 'flex';

        // Show PDF Text Highlight Settings if PDF text selection is active
        const pdfTextHighlightSettings = document.getElementById('pdfTextHighlightSettings');
        if (pdfTextHighlightSettings) {
            const isPdfTextSelectionActive = this.app.state.pdfTextSelectionActive;
            pdfTextHighlightSettings.style.display = isPdfTextSelectionActive ? 'flex' : 'none';
        }

        // Update Mobile Titles
        const mobileTitle = document.getElementById('mobileBrushTitle');
        if (mobileTitle) {
            const toolTitles = {
                'pen': 'Kalem Ayarları',
                'highlighter': 'Vurgulayıcı Ayarları',
                'eraser': 'Silgi Ayarları',
                'text': 'Metin Ayarları',
                'rectangle': 'Şekil Ayarları',
                'rect': 'Şekil Ayarları',
                'ellipse': 'Şekil Ayarları',
                'triangle': 'Şekil Ayarları',
                'trapezoid': 'Şekil Ayarları',
                'star': 'Şekil Ayarları',
                'diamond': 'Şekil Ayarları',
                'parallelogram': 'Şekil Ayarları',
                'oval': 'Şekil Ayarları',
                'heart': 'Şekil Ayarları',
                'cloud': 'Şekil Ayarları',
                'line': 'Ok/Çizgi Ayarları',
                'arrow': 'Ok Ayarları',
                'select': 'Seçim Ayarları',
                'tape': 'Bant Ayarları',
                'table': 'Tablo Ayarları'
            };
            mobileTitle.textContent = toolTitles[tool] || 'Araç Ayarları';
        }

        // 1. Sync State from Selection (If in Select Tool)
        if (tool === 'select') {
            const selectTool = this.app.tools.select;
            if (selectTool.selectedObjects.length === 1) {
                const obj = this.app.state.objects[selectTool.selectedObjects[0]];
                if (obj) {
                    const shapes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'];
                    // Update State to match selected object
                    if (shapes.includes(obj.type)) {
                        if (obj.strokeWidth !== undefined) this.app.state.strokeWidth = obj.strokeWidth;
                    } else if (obj.type === 'tape') {
                        if (obj.thickness !== undefined) this.app.state.strokeWidth = obj.thickness;
                    } else {
                        if (obj.width !== undefined) this.app.state.strokeWidth = obj.width;
                    }

                    if (obj.opacity !== undefined) this.app.state.opacity = obj.opacity;
                    if (obj.lineStyle) this.app.state.lineStyle = obj.lineStyle;
                    if (obj.color) this.app.state.strokeColor = obj.color;
                    if (obj.cap) this.app.state.highlighterCap = obj.cap;
                    if (obj.nibAngle !== undefined) this.app.state.nibAngle = obj.nibAngle;
                    if (obj.startStyle) this.app.state.arrowStartStyle = obj.startStyle;
                    if (obj.endStyle) this.app.state.arrowEndStyle = obj.endStyle;
                    if (obj.pathType) this.app.state.arrowPathType = obj.pathType;
                }
            }
        }

        // 2. Sync UI Components from Current State (Runs for ALL tools)

        // Sync Select Mode Buttons
        if (tool === 'select' && this.app.tools.select) {
            const currentMode = this.app.tools.select.selectionMode || 'normal';
            document.querySelectorAll('.tool-btn[data-select-mode]').forEach(b => {
                b.classList.toggle('active', b.dataset.selectMode === currentMode);
            });
        } else if (tool === 'verticalSpace') {
            document.querySelectorAll('.tool-btn[data-select-mode]').forEach(b => {
                b.classList.remove('active');
            });
        }

        // Sync Vertical Space Tool Button
        const btnVerticalSpaceTool = document.getElementById('btnVerticalSpaceTool');
        if (btnVerticalSpaceTool) {
            btnVerticalSpaceTool.classList.toggle('active', tool === 'verticalSpace');
        }

        // Sync Sliders
        const thicknessSlider = document.getElementById('strokeWidthSlider');
        if (thicknessSlider) {
            thicknessSlider.value = this.app.state.strokeWidth;
            if (window.updateRangeProgress) window.updateRangeProgress(thicknessSlider);
        }
        const thicknessSliders = document.querySelectorAll('.stroke-width-slider');
        thicknessSliders.forEach(s => {
            s.value = this.app.state.strokeWidth;
            if (window.updateRangeProgress) window.updateRangeProgress(s);
        });
        const thicknessInput = document.getElementById('strokeWidthInput');
        if (thicknessInput) thicknessInput.value = this.app.state.strokeWidth;
        const eraserSizeVal = document.getElementById('eraserSizeVal');
        if (eraserSizeVal) eraserSizeVal.textContent = this.app.state.strokeWidth + 'px';

        const opacitySlider = document.getElementById('opacitySlider');
        if (opacitySlider) {
            opacitySlider.value = Math.round(this.app.state.opacity * 100);
            if (window.updateRangeProgress) window.updateRangeProgress(opacitySlider);
        }
        const opacitySliders = document.querySelectorAll('.opacity-slider');
        opacitySliders.forEach(s => {
            s.value = Math.round(this.app.state.opacity * 100);
            if (window.updateRangeProgress) window.updateRangeProgress(s);
        });
        const opacityInput = document.getElementById('opacityInput');
        if (opacityInput) opacityInput.value = Math.round(this.app.state.opacity * 100);

        const stabSliders = document.querySelectorAll('.stabilization-slider');
        const stabInput = document.getElementById('stabilizationInput');
        const stabVal = Math.round(this.app.state.stabilization * 100);
        stabSliders.forEach(s => { s.value = stabVal; if (window.updateRangeProgress) window.updateRangeProgress(s); });
        if (stabInput) stabInput.value = stabVal;

        const decSliders = document.querySelectorAll('.decimation-slider');
        const decInput = document.getElementById('decimationInput');
        const decVal = Math.round(this.app.state.decimation * 100);
        decSliders.forEach(s => { s.value = decVal; if (window.updateRangeProgress) window.updateRangeProgress(s); });
        if (decInput) decInput.value = decVal;

        const nibAngleSliders = document.querySelectorAll('.nib-angle-slider');
        const nibAngleInput = document.getElementById('nibAngleInput');
        const nibAngleDeg = Math.round((this.app.state.nibAngle || 0) * 180 / Math.PI);
        nibAngleSliders.forEach(s => { s.value = nibAngleDeg; if (window.updateRangeProgress) window.updateRangeProgress(s); });
        if (nibAngleInput) nibAngleInput.value = nibAngleDeg;

        // Sync Active Buttons
        document.querySelectorAll('.tool-btn[data-linestyle]').forEach(b => b.classList.toggle('active', b.dataset.linestyle === this.app.state.lineStyle));
        document.querySelectorAll('.tool-btn[data-highlighter-cap]').forEach(b => b.classList.toggle('active', b.dataset.highlighterCap === this.app.state.highlighterCap));
        document.querySelectorAll('.tool-btn[data-arrow-start]').forEach(b => b.classList.toggle('active', b.dataset.arrowStart === this.app.state.arrowStartStyle));
        document.querySelectorAll('.tool-btn[data-arrow-end]').forEach(b => b.classList.toggle('active', b.dataset.arrowEnd === this.app.state.arrowEndStyle));
        document.querySelectorAll('.tool-btn[data-arrow-path]').forEach(b => b.classList.toggle('active', b.dataset.arrowPath === this.app.state.arrowPathType));

        // Tape Specific UI Sync
        const tapeSettingsGroup = document.getElementById('tapeSettings');
        if (tapeSettingsGroup) {
            let showTapeGroup = (tool === 'tape');
            let activeTapeSettings = (this.app.tools.tape) ? { ...this.app.tools.tape.settings } : null;

            if (tool === 'select') {
                const selectTool = this.app.tools.select;
                if (selectTool.selectedObjects.length === 1) {
                    const obj = this.app.state.objects[selectTool.selectedObjects[0]];
                    if (obj && obj.type === 'tape') {
                        showTapeGroup = true;
                        activeTapeSettings = {
                            mode: obj.mode,
                            pattern: obj.pattern
                        };
                    }
                }
            }

            tapeSettingsGroup.style.display = showTapeGroup ? 'flex' : 'none';

            if (showTapeGroup && activeTapeSettings) {
                document.querySelectorAll('.tool-btn[data-tape-mode]').forEach(b =>
                    b.classList.toggle('active', b.dataset.tapeMode === activeTapeSettings.mode)
                );
                document.querySelectorAll('.pattern-btn[data-tape-pattern]').forEach(b =>
                    b.classList.toggle('active', b.dataset.tapePattern === activeTapeSettings.pattern)
                );
            }
        }

        // Sync Color Palette
        if (this.app.colorPalette) this.app.colorPalette.renderColors();
        // We removed the forced reset to 1.0 for pen/shapes to allow persistent user choice.

        const hasSelection = (tool === 'select' && this.app.tools.select && this.app.tools.select.selectedObjects.length > 0);

        // Pressure Logic
        const pressureBtn = document.getElementById('pressureBtn');
        if (tool === 'pen' || tool === 'fountain-pen') {
            pressureBtn.style.display = 'flex';
            pressureBtn.classList.toggle('active', !!this.app.state.pressureEnabled);
        } else if (['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'line'].includes(tool)) {
            pressureBtn.style.display = 'flex';
            pressureBtn.classList.remove('active');
        } else if (tool === 'select' && hasSelection) {
            // Show for selection if it's a pressure-supported tool
            const selectTool = this.app.tools.select;
            const obj = this.app.state.objects[selectTool.selectedObjects[0]];
            if (obj && (obj.type === 'pen' || obj.type === 'fountain-pen')) {
                pressureBtn.style.display = 'flex';
                pressureBtn.classList.toggle('active', !!this.app.state.pressureEnabled);
            } else {
                pressureBtn.style.display = 'none';
            }
        } else {
            pressureBtn.style.display = 'none';
        }

        // Brush Settings Visibility Logic
        const isFreehand = (tool === 'pen' || tool === 'highlighter' || tool === 'tape' || tool === 'charcoal' || tool === 'fountain-pen' || tool === 'vector-pen');
        const showBrushSettings = ['pen', 'highlighter', 'charcoal', 'fountain-pen', 'vector-pen', 'rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'line', 'arrow', 'select', 'tape', 'table'].includes(tool);

        const brushSettingsGroup = document.getElementById('toolGroupBrushSettings');

        this.renderQuickColors();
        this.renderQuickStrokeWidths();

        // PDF Text Selection mode: hide all other settings (declare early for use below)
        const isPdfTextMode = this.app.state.pdfTextSelectionActive;

        // Toggle visibility of Quick Colors
        const quickColorsGroup = document.getElementById('quickColors');
        if (quickColorsGroup) {
            let showQuickColors = ['pen', 'highlighter', 'charcoal', 'fountain-pen', 'vector-pen', 'rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'line', 'arrow', 'select', 'tape', 'table'].includes(tool);
            // Hide colors when PDF text selection is active
            if (isPdfTextMode) showQuickColors = false;
            if (tool === 'select' && !hasSelection) showQuickColors = false;
            quickColorsGroup.style.display = showQuickColors ? 'flex' : 'none';
        }

        const selectSettingsGroup = document.getElementById('selectSettings');

        // Toggle visibility of Quick Stroke Widths
        const quickStrokeGroup = document.getElementById('quickStrokeWidths');
        if (quickStrokeGroup) {
            let showQuickStrokes = ['pen', 'highlighter', 'charcoal', 'fountain-pen', 'vector-pen', 'rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'line', 'arrow', 'select', 'table'].includes(tool);
            // Hide stroke widths when PDF text selection is active
            if (isPdfTextMode) showQuickStrokes = false;
            if (tool === 'select' && !hasSelection) showQuickStrokes = false;
            quickStrokeGroup.style.display = showQuickStrokes ? 'flex' : 'none';
        }

        if (selectSettingsGroup) {
            // Hide select settings when PDF text selection is active
            selectSettingsGroup.style.display = (tool === 'select' || tool === 'verticalSpace') && !isPdfTextMode ? 'flex' : 'none';
        }

        // Logic for Select Tool: Hide brush settings if no selection or in PDF text mode
        let actualShowBrushSettings = showBrushSettings;
        if ((tool === 'select' && this.app.tools.select.selectedObjects.length === 0) || isPdfTextMode) {
            actualShowBrushSettings = false;
        }

        if (brushSettingsGroup) {
            brushSettingsGroup.style.display = 'none';
        }

        // Hide quick colors when PDF text selection is active
        if (quickColorsGroup && isPdfTextMode) {
            quickColorsGroup.style.display = 'none';
        }

        // Toggle Line Styles visibility inside the popup
        const brushSettingLineStyles = document.getElementById('brushSettingLineStyles');
        if (brushSettingLineStyles) {
            const showLineStyles = showBrushSettings && tool !== 'tape' && tool !== 'highlighter';
            brushSettingLineStyles.style.display = showLineStyles ? 'block' : 'none';
        }

        const brushSettingHighlighterCap = document.getElementById('brushSettingHighlighterCap');
        if (brushSettingHighlighterCap) {
            let showCap = (tool === 'highlighter');
            if (tool === 'select') {
                const selectTool = this.app.tools.select;
                if (selectTool.selectedObjects.length === 1) {
                    const obj = this.app.state.objects[selectTool.selectedObjects[0]];
                    if (obj && obj.type === 'highlighter') showCap = true;
                }
            }
            brushSettingHighlighterCap.style.display = showCap ? 'block' : 'none';
        }

        if (brushSettingsGroup) {
            // Also manage internal visibility of stabilization/decimation inside the popup
            const stabSlider = document.getElementById('stabilizationSlider');
            const decSlider = document.getElementById('decimationSlider');

            if (stabSlider) {
                const stabItem = stabSlider.closest('.brush-setting-item');
                if (stabItem) stabItem.style.display = isFreehand ? 'block' : 'none';
            }
            if (decSlider) {
                const decItem = decSlider.closest('.brush-setting-item');
                if (decItem) decItem.style.display = isFreehand ? 'block' : 'none';
            }

            const nibAngleItem = document.getElementById('brushSettingAngle');
            if (nibAngleItem) {
                let showAngle = (tool === 'fountain-pen');
                if (tool === 'select' && hasSelection) {
                    const obj = this.app.state.objects[this.app.tools.select.selectedObjects[0]];
                    if (obj && obj.type === 'fountain-pen') showAngle = true;
                }
                nibAngleItem.style.display = showAngle ? 'block' : 'none';
            }

            // Handle Mobile Color Grid inside Brush Settings
            const mobileBrushColors = document.getElementById('mobileBrushColors');
            if (mobileBrushColors) {
                // User requested to REMOVE colors from this popup on mobile because they are already visible next to it
                mobileBrushColors.style.display = 'none';
            }
        }

        // Line Style Logic: Hide wavy for rect/ellipse
        const wavyBtn = document.querySelector('.tool-btn[data-linestyle="wavy"]');
        if (wavyBtn) {
            let showWavy = true;
            if (['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'].includes(tool)) {
                showWavy = false;
            } else if (tool === 'select') {
                const selectTool = this.app.tools.select;
                if (selectTool.selectedObjects.length > 0) {
                    const hasShape = selectTool.selectedObjects.some(index => {
                        const obj = this.app.state.objects[index];
                        return obj && ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'].includes(obj.type);
                    });
                    if (hasShape) showWavy = false;
                }
            }

            wavyBtn.style.display = showWavy ? 'flex' : 'none';

            // If wavy was selected but now hidden, fallback to solid
            if (!showWavy && this.app.state.lineStyle === 'wavy') {
                this.app.state.lineStyle = 'solid';
                document.querySelectorAll('.tool-btn[data-linestyle]').forEach(b => b.classList.remove('active'));
                const solidBtn = document.querySelector('.tool-btn[data-linestyle="solid"]');
                if (solidBtn) solidBtn.classList.add('active');

                // Update selection if needed
                if (tool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                    this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { lineStyle: 'solid' });
                    this.app.render();
                }
            }
        }


        // Toggle Arrow Settings visibility
        if (tool === 'arrow') {
            document.getElementById('arrowSettings').style.display = 'flex';
            document.getElementById('arrowPathSettings').style.display = 'flex';
        } else {
            document.getElementById('arrowSettings').style.display = 'none';
            document.getElementById('arrowPathSettings').style.display = 'none';
        }

        // Toggle Eraser Settings visibility
        if (tool === 'eraser') {
            document.getElementById('eraserSettings').style.display = 'flex';
        } else {
            document.getElementById('eraserSettings').style.display = 'none';
        }

        // Table Settings grouped
        const tableGroup = document.getElementById('toolGroupTable');
        if (tableGroup) {
            tableGroup.style.display = (tool === 'table') ? 'flex' : 'none';
        }

        // Arrow Settings grouped
        const arrowGroup = document.getElementById('toolGroupArrow');
        if (arrowGroup) {
            arrowGroup.style.display = (tool === 'arrow') ? 'flex' : 'none';
        }

        // Toggle Sticker Settings visibility
        const stickerSettings = document.getElementById('stickerSettings');
        if (stickerSettings) {
            if (tool === 'sticker') {
                stickerSettings.style.display = 'flex';
                if (this.app.tools.sticker) {
                    this.app.tools.sticker.renderStickersToSidebar();
                }
            } else {
                stickerSettings.style.display = 'none';
            }
        }


        // Toggle Shape Settings visibility
        const shapes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'];
        const shapeSettings = document.getElementById('shapeSettings');
        if (shapeSettings) {
            const isShapeActive = shapes.includes(tool);
            shapeSettings.style.display = isShapeActive ? 'flex' : 'none';
            if (isShapeActive) {
                document.querySelectorAll('#shapeSettings .tool-btn').forEach(b =>
                    b.classList.toggle('active', b.dataset.tool === tool)
                );
            }
        }

        // Fill Settings Visibility
        const fillSettings = document.getElementById('fillSettings');
        const fillBtn = document.getElementById('btnFillToggle');

        if (fillSettings && fillBtn) {
            let showFill = false;
            let isFilled = false;
            const shapes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'];

            if (tool === 'select' && !isPdfTextMode) {
                const selectTool = this.app.tools.select;
                if (selectTool.selectedObjects.length === 1) {
                    const objIndex = selectTool.selectedObjects[0];
                    const obj = this.app.state.objects[objIndex];
                    if (obj) {
                        if (shapes.includes(obj.type)) {
                            showFill = true;
                            isFilled = !!obj.filled;
                        } else if (obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'vector-pen') {
                            const canFill = (obj.type === 'vector-pen') || (this.app.fillManager && this.app.fillManager.canBeFilled(obj));
                            if (canFill) {
                                showFill = true;
                                isFilled = !!obj.filled;
                            }
                        }
                    }
                }
            } else if (['pen', 'vector-pen', ...shapes].includes(tool) && !isPdfTextMode) {
                // Show for pen tools and shapes to allow live toggle
                showFill = true;
                isFilled = this.app.state.fillEnabled;
            }

            fillSettings.style.display = showFill ? 'flex' : 'none';
            // Only toggle 'active' class, don't mess with click listeners here
            if (showFill) {
                fillBtn.classList.toggle('active', isFilled);
            }
        }

        // Tape Pattern Color Sync
        const patternButtons = document.querySelectorAll('.pattern-btn');
        const currentColor = this.app.state.strokeColor === 'rainbow' ? '#262626' : this.app.state.strokeColor;
        patternButtons.forEach(btn => {
            btn.style.color = currentColor;
            const colorSyncDiv = btn.querySelector('.color-sync');
            if (colorSyncDiv) {
                colorSyncDiv.style.backgroundColor = currentColor;
            }
        });

        // Toggle Reset Settings visibility
        const resetGroup = document.querySelector('.reset-group');
        if (resetGroup) {
            let showReset = (tool !== 'hand');
            if (tool === 'select' && !hasSelection) showReset = false;
            resetGroup.style.display = showReset ? 'flex' : 'none';
        }

        // --- OCR Group Visibility ---
        let showImageOcr = false;
        const imageOcrSettings = document.getElementById('imageOcrSettings');
        if (imageOcrSettings) {
            if (tool === 'select' && this.app.tools.select && this.app.tools.select.selectedObjects.length === 1) {
                const obj = this.app.state.objects[this.app.tools.select.selectedObjects[0]];
                if (obj && obj.type === 'image') {
                    showImageOcr = true;
                }
            }
            imageOcrSettings.style.display = showImageOcr ? 'flex' : 'none';
        }

        const pdfOcrSettings = document.getElementById('pdfOcrSettings');
        let showPdfOcr = false;
        if (pdfOcrSettings) {
            const isPdfLoaded = this.app.pdfManager && this.app.pdfManager.isLoaded;
            const currentPage = this.app.pageManager && this.app.pageManager.pages[this.app.pageManager.currentPageIndex];
            const isPdfPage = currentPage && currentPage.pdfPageNumber;
            // Sadece PDF yüklüyse VE 'PDF Metin Seçimi' butonu aktifse göster
            showPdfOcr = !!(isPdfLoaded && isPdfPage && this.app.state.pdfTextSelectionActive);
            pdfOcrSettings.style.display = showPdfOcr ? 'flex' : 'none';
        }

        // OCR Dil Grubu: imageOCR veya pdfOCR aktifse göster
        const ocrLangGroup = document.getElementById('ocrLangGroup');
        if (ocrLangGroup) {
            ocrLangGroup.style.display = (showImageOcr || showPdfOcr) ? 'flex' : 'none';
        }
    }



    // --- Quick Colors Logic ---

    loadQuickColors() {
        const tool = this.app.state.currentTool;
        let storageKey = `betik_quick_colors_${tool}`;
        let defaults = ['#000000', '#ff5c5c', '#5c9bfe'];

        if (tool === 'highlighter') {
            defaults = ['#e3ff00', '#83f18d', '#67dfff', '#ff659f', '#fd934c', '#ff1837', '#5151ff'];
        }

        const saved = localStorage.getItem(storageKey);
        if (saved) {
            this.quickColors = JSON.parse(saved);
        } else {
            // Check for a legacy generic key for backward compatibility if not specifically set for this tool
            const legacy = localStorage.getItem('betik_quick_colors');
            if (legacy && tool !== 'highlighter') {
                this.quickColors = JSON.parse(legacy);
            } else {
                this.quickColors = defaults;
            }
        }
    }

    saveQuickColors() {
        const tool = this.app.state.currentTool;
        let storageKey = `betik_quick_colors_${tool}`;
        localStorage.setItem(storageKey, JSON.stringify(this.quickColors));
    }

    renderQuickColors() {
        const list = document.getElementById('quickColorsList');
        if (!list) return;

        list.innerHTML = '';
        this.quickColors.forEach((color, index) => {
            const btn = document.createElement('button');
            btn.className = 'quick-color-btn';

            if (color === 'rainbow') {
                btn.classList.add('rainbow-btn');
            } else {
                btn.style.backgroundColor = color;
            }

            if (color.toLowerCase() === this.app.state.strokeColor.toLowerCase()) {
                btn.classList.add('active');

                // Create the inner indicator dot
                const dot = document.createElement('div');
                const isWhite = color.toLowerCase() === '#ffffff' || color.toLowerCase() === '#fff' || color.toLowerCase() === 'white';
                dot.className = 'indicator-dot';
                dot.style.backgroundColor = isWhite ? '#2196f3' : 'white';
                btn.appendChild(dot);
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleQuickColorClick(index, color, btn);
            });

            list.appendChild(btn);
        });

        // Show/Hide Add button based on limit
        const btnAdd = document.getElementById('btnQuickColorAdd');
        if (btnAdd) {
            btnAdd.style.display = this.quickColors.length < 8 ? 'flex' : 'none';
        }
    }

    handleQuickColorClick(index, color, btn) {
        const isCurrentlyActive = (this.app.state.strokeColor.toLowerCase() === color.toLowerCase());

        if (isCurrentlyActive) {
            // Second click on active color: Open Palette Popup
            this.showColorPalettePopup(index, btn);
        } else {
            // First click: Apply color
            if (this.app.colorPalette) {
                this.app.colorPalette.selectColor(color);
            } else {
                this.app.state.strokeColor = color;
                this.app.render();
            }
            this.renderQuickColors();
        }
    }

    showColorPalettePopup(index, anchor) {
        this.activeColorPopupIndex = index;
        const popup = document.getElementById('popupColorPalette');
        if (!popup) return;

        this.showPopup(popup, anchor);

        // Render Color Grid
        const grid = document.getElementById('popupColorGrid');
        if (grid && this.app.colorPalette) {
            grid.innerHTML = '';

            // Add Rainbow Button
            const rainbowItem = document.createElement('div');
            rainbowItem.className = 'color-btn rainbow-btn color-grid-item';
            if (this.app.state.strokeColor === 'rainbow') {
                rainbowItem.style.boxShadow = '0 0 0 2px white, 0 0 0 4px #2196f3';
            }
            rainbowItem.onclick = () => {
                this.updateQuickColor(index, 'rainbow');
                this.closeAllPopups();
            };
            grid.appendChild(rainbowItem);

            this.app.colorPalette.colors.forEach((color, idx) => {
                const item = document.createElement('div');
                item.className = 'color-grid-item';
                item.style.backgroundColor = color;

                // Left click: Select color
                item.onclick = () => {
                    this.updateQuickColor(index, color);
                    this.closeAllPopups();
                };

                // Right click: Show context menu (Edit/Delete)
                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    this.app.colorPalette.showContextMenu({
                        clientX: e.clientX,
                        clientY: e.clientY
                    }, idx);
                };

                // Mobile support: Long press for context menu
                let longPressTimer;
                item.addEventListener('touchstart', (e) => {
                    longPressTimer = setTimeout(() => {
                        this.app.colorPalette.showContextMenu({
                            clientX: e.touches[0].clientX,
                            clientY: e.touches[0].clientY
                        }, idx);
                    }, 500);
                }, { passive: true });
                item.addEventListener('touchend', () => clearTimeout(longPressTimer), { passive: true });
                item.addEventListener('touchmove', () => clearTimeout(longPressTimer), { passive: true });

                grid.appendChild(item);
            });
        }

        // EyeDropper visibility
        const btnEyedropper = document.getElementById('btnPopupEyedropper');
        if (btnEyedropper) {
            btnEyedropper.style.display = window.EyeDropper ? 'flex' : 'none';
        }
    }

    renderMobileColorGrid() {
        const grid = document.getElementById('popupColorGridMobile');
        if (!grid || !this.app.colorPalette) return;

        // Reuse logic but without index (just direct selection)
        grid.innerHTML = '';

        // Rainbow
        const rainbowItem = document.createElement('div');
        rainbowItem.className = 'color-btn rainbow-btn color-grid-item';
        if (this.app.state.strokeColor === 'rainbow') {
            rainbowItem.style.boxShadow = '0 0 0 2px white, 0 0 0 4px #2196f3';
        }
        rainbowItem.onclick = () => {
            if (this.app.colorPalette) {
                this.app.colorPalette.selectColor('rainbow');
            } else {
                this.app.state.strokeColor = 'rainbow';
                this.app.render();
            }
            this.renderQuickColors();
            this.renderMobileColorGrid(); // Refresh to show highlight
        };
        grid.appendChild(rainbowItem);

        this.app.colorPalette.colors.forEach((color, idx) => {
            const item = document.createElement('div');
            item.className = 'color-grid-item';

            if (color === 'rainbow') {
                item.classList.add('rainbow-btn');
            } else {
                item.style.backgroundColor = color;
            }

            // Highlight active color in mobile grid
            if (this.app.state.strokeColor === color) {
                item.style.boxShadow = '0 0 0 2px white, 0 0 0 4px #2196f3';
            }

            item.onclick = () => {
                if (this.app.colorPalette) {
                    this.app.colorPalette.selectColor(color);
                } else {
                    this.app.state.strokeColor = color;
                    this.app.render();
                }
                this.renderQuickColors();
            };
            grid.appendChild(item);
        });
    }

    updateQuickColor(index, newColor) {
        if (index >= 0 && index < this.quickColors.length) {
            this.quickColors[index] = newColor;
            this.saveQuickColors();
            this.renderQuickColors();
        } else if (index === this.quickColors.length && this.quickColors.length < 8) {
            // Addition mode
            this.quickColors.push(newColor);
            this.saveQuickColors();
            this.renderQuickColors();
        }

        // Also select it
        if (this.app.colorPalette) {
            this.app.colorPalette.selectColor(newColor);
        } else {
            this.app.state.strokeColor = newColor;
            this.app.render();
        }
    }

    // --- Quick Stroke Widths Logic ---

    loadQuickStrokeWidths() {
        const tool = this.app.state.currentTool;
        let storageKey = 'betik_quick_strokes';
        let defaults = [3, 5, 7];

        if (tool === 'table') {
            storageKey = 'betik_quick_strokes_table';
            defaults = [1, 3, 5];
        }

        const saved = localStorage.getItem(storageKey);
        if (saved) {
            this.quickStrokeWidths = JSON.parse(saved);
        } else {
            this.quickStrokeWidths = defaults;
        }
        // Try to find if current state matches any slot
        const current = this.app.state.strokeWidth;
        const index = this.quickStrokeWidths.indexOf(current);
        if (index !== -1) {
            this.activeStrokeIndex = index;
        } else {
            this.activeStrokeIndex = -1;
        }
    }

    saveQuickStrokeWidths() {
        const tool = this.app.state.currentTool;
        let storageKey = (tool === 'table') ? 'betik_quick_strokes_table' : 'betik_quick_strokes';
        localStorage.setItem(storageKey, JSON.stringify(this.quickStrokeWidths));
    }

    renderQuickStrokeWidths() {
        const list = document.getElementById('quickStrokeWidthsList');
        if (!list) return;

        list.innerHTML = '';
        this.quickStrokeWidths.forEach((val, index) => {
            const btn = document.createElement('button');
            btn.className = 'quick-stroke-btn';
            if (index === this.activeStrokeIndex) btn.classList.add('active');

            // Dynamic Dot Icon
            // Max value is 80, we scale the dot accordingly.
            const dotSize = Math.max(2, Math.min(18, 2 + (val / 80) * 16));

            btn.innerHTML = `
                <div style="
                    width: ${dotSize}px; 
                    height: ${dotSize}px; 
                    background: ${index === this.activeStrokeIndex ? '#2196f3' : 'currentColor'}; 
                    border-radius: 50%;
                "></div>
            `;

            btn.style.cssText = `
                width: 28px;
                height: 28px;
                border-radius: 6px;
                border: 1px solid ${index === this.activeStrokeIndex ? '#2196f3' : '#e9ecef'};
                background: ${index === this.activeStrokeIndex ? '#e3f2fd' : 'white'};
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                transition: all 0.2s;
            `;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleQuickStrokeClick(index, val, btn);
            });

            list.appendChild(btn);
        });
    }

    handleQuickStrokeClick(index, value, btn) {
        if (this.activeStrokeIndex === index) {
            // Second click on active: Open Tools Popup
            this.toggleBrushSettingsPopup(btn);
        } else {
            // First click: Apply
            this.activeStrokeIndex = index;
            this.app.state.strokeWidth = value;

            // Sync all sliders
            const widthSliders = document.querySelectorAll('.stroke-width-slider');
            widthSliders.forEach(s => { s.value = value; if (window.updateRangeProgress) window.updateRangeProgress(s); });
            const widthInput = document.getElementById('strokeWidthInput');
            if (widthInput) widthInput.value = value;

            if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
                this.app.saveHistory();
                this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { width: value });
                if (this.app.redrawOffscreen) this.app.redrawOffscreen();
                this.app.render();
            }

            this.renderQuickStrokeWidths();
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    toggle() {
        if (this.container) {
            if (this.container.style.display === 'none' || this.container.style.display === '') {
                this.container.style.display = 'flex';
            } else {
                this.container.style.display = 'none';
            }
        }
    }

    show() {
        if (this.container) {
            this.container.style.display = 'flex';
        }
    }
}
