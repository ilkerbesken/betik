class ColorPalette {
    constructor(app) {
        this.app = app;
        // Tldraw'a benzer varsayılan renkler
        this.defaultColors = [
            '#000000', // Siyah
            '#737373', // Gri
            '#e0e0e0', // Açık Gri (Beyaz yerine canvas üstünde görünsün diye hafif gri)
            '#ff5c5c', // Açık Kırmızı
            '#ffb85c', // Turuncu
            '#ffd900', // Sarı
            '#5cbd62', // Yeşil
            '#5ce1e6', // Camgöbeği
            '#5c9bfe', // Mavi
            '#b45cff', // Mor
            '#ff5ce0', // Pembe
            '#e65c5c'  // Koyu Kırmızı (veya kullanıcının değiştireceği bir renk)
        ];

        // Kayıtlı renkleri yükle veya varsayılanları kullan
        const savedColors = localStorage.getItem('betik_colors');
        this.colors = savedColors ? JSON.parse(savedColors) : [...this.defaultColors];

        this.container = null;
        this.picker = null; // Store active picker
        this.tempColors = []; // Temporary clicked colors in picker
        this.init();
    }

    init() {
        // Sidebar creation removed as per user request to hide the left color palette.
        // We keep the object for its showColorPicker method.
    }

    createSidebar() {
        // No-op: Sidebar removed
    }

    renderColors() {
        // No-op: Sidebar removed
    }

    selectColor(color) {
        this.app.state.strokeColor = color;

        // UI Güncelle (Main sidebar is gone, so we only update properties sidebar if it exists)

        // Seçili nesne varsa güncelle
        if (this.app.state.currentTool === 'select' && this.app.tools.select.selectedObjects.length > 0) {
            this.app.tools.select.updateSelectedObjectsStyle(this.app.state, { color: color });
            this.app.redrawOffscreen();
            this.app.render();
            // History kaydet
            this.app.saveHistory();
        }

        // Properties Sidebar'ı güncelle (Bant desen ikon renkleri vb. için)
        if (this.app.propertiesSidebar) {
            this.app.propertiesSidebar.updateUIForTool(this.app.state.currentTool);
            this.app.propertiesSidebar.renderQuickColors();
        }
    }

    addColor() {
        this.showColorPicker('#000000', (newColor) => {
            this.colors.push(newColor);
            this.saveColors();
            this.renderColors();
            this.selectColor(newColor);
        });
    }

    editColor(index) {
        const currentColor = this.colors[index];
        this.showColorPicker(currentColor, (newColor) => {
            this.colors[index] = newColor;
            this.saveColors();
            this.renderColors();
            this.selectColor(newColor);
        });
    }

    async deleteColor(index) {
        const confirmed = await Utils.showConfirm({
            title: 'Rengi Sil',
            message: 'Bu rengi silmek istediğinizden emin misiniz?',
            confirmText: 'Sil',
            type: 'danger'
        });

        if (confirmed) {
            this.colors.splice(index, 1);
            this.saveColors();
            this.renderColors();
            if (this.app.propertiesSidebar) {
                this.app.propertiesSidebar.renderQuickColors();
                if (this.app.propertiesSidebar.activeColorPopupIndex !== -1) {
                    this.app.propertiesSidebar.showColorPalettePopup(this.app.propertiesSidebar.activeColorPopupIndex, null);
                }
            }
            // Eğer silinen renk aktifse, varsayılan siyaha dön
            if (this.colors.length > 0) {
                this.selectColor(this.colors[0]);
            }
        }
    }

    saveColors() {
        localStorage.setItem('betik_colors', JSON.stringify(this.colors));
    }

    resetToDefaults() {
        this.colors = [...this.defaultColors];
        this.saveColors();
        this.renderColors();
    }

    setupEventListeners() {
        // No-op: Sidebar removed
    }

    showContextMenu(e, index) {
        // Varsa eski menüyü kaldır
        const oldMenu = document.getElementById('colorContextMenu');
        if (oldMenu) oldMenu.remove();

        // Menü oluştur
        const menu = document.createElement('div');
        menu.id = 'colorContextMenu';
        menu.className = 'context-menu show'; // show class'ı ile görünür yap
        menu.style.left = `${e.clientX + 10}px`;
        if (e.clientY > window.innerHeight / 2) {
            menu.style.top = 'auto';
            menu.style.bottom = (window.innerHeight - e.clientY) + 'px';
        } else {
            menu.style.top = `${e.clientY}px`;
            menu.style.bottom = 'auto';
        }
        menu.innerHTML = `
            <div class="context-menu-item" id="editColorBtn">
                <span class="menu-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m 18.87,9.11 -3.9,-3.94 M 8.27,19.69 4.37,15.75 M 17,3 a 2.83,2.83 0 1 1 4,4 L 7.5,20.5 2,22 3.5,16.5 Z" />
                    </svg>
                </span>
                <span>Değiştir</span>
            </div>
            <div class="context-menu-item" id="deleteColorBtn">
                <span class="menu-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m 16.27,6.01 v -2 c 0,-1.1 -0.9,-2 -2,-2 L 10,2 C 8.9,2 8,2.9 8,4 v 2 m 11,0 v 14 c 0,1.1 -0.9,2 -2,2 H 7 C 5.9,22 5,21.1 5,20 V 6 M 3,6 h 2 16" />
                    </svg>
                </span>
                <span>Sil</span>
            </div>
        `;

        document.body.appendChild(menu);

        // Eventler
        menu.querySelector('#editColorBtn').onclick = () => {
            this.editColor(index);
            if (this.app.propertiesSidebar && this.app.propertiesSidebar.activeColorPopupIndex !== -1) {
                this.app.propertiesSidebar.showColorPalettePopup(this.app.propertiesSidebar.activeColorPopupIndex, null);
            }
            menu.remove();
        };
        menu.querySelector('#deleteColorBtn').onclick = () => {
            this.deleteColor(index);
            menu.remove();
        };

        // Dışarı tıklayınca kapat
        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        // Timeout ile ekle ki hemen tetiklenmesin
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    // --- Custom Color Picker Implementation (Figma Style) ---
    showColorPicker(initialColor, onSelect, anchorElement = null, direction = 'right') {
        if (this.picker) {
            this.picker.remove();
            this.picker = null;
        }

        this.tempColors = [];
        let selectedColor = initialColor || '#000000';
        let [h, s, v] = this.hexToHsv(selectedColor);

        const picker = document.createElement('div');
        picker.className = 'custom-color-picker';

        picker.innerHTML = `
            <div class="picker-sb-area">
                <div class="picker-sb-gradient-white"></div>
                <div class="picker-sb-gradient-black"></div>
                <div class="picker-sb-handle"></div>
            </div>
            
            <div class="picker-hue-slider-container">
                <div class="picker-hue-handle"></div>
            </div>

            <div class="picker-footer">
                <div class="picker-temp-colors" style="margin-bottom: 8px; min-height: 18px;">
                     <div class="temp-colors-list" style="display: flex; gap: 4px; overflow-x: auto; padding: 2px;"></div>
                </div>

                <div class="picker-input-row">
                    <div class="picker-preview" style="background-color: ${selectedColor};"></div>
                    <input type="text" class="picker-hex-input" value="${selectedColor}" maxlength="7">
                    ${window.EyeDropper ? `
                    <button class="picker-eyedropper-btn" title="Ekranda Renk Seç">
                        <img src="assets/icons/eyedropper.svg" class="icon" style="width: 14px; height: 14px;">
                    </button>
                    ` : ''}
                </div>
                <button class="picker-add-btn">Seç ve Ekle</button>
            </div>
        `;

        document.body.appendChild(picker);
        this.picker = picker;

        const sbArea = picker.querySelector('.picker-sb-area');
        const sbHandle = picker.querySelector('.picker-sb-handle');
        const hueSlider = picker.querySelector('.picker-hue-slider-container');
        const hueHandle = picker.querySelector('.picker-hue-handle');
        const previewBox = picker.querySelector('.picker-preview');
        const hexInput = picker.querySelector('.picker-hex-input');
        const tempColorsList = picker.querySelector('.temp-colors-list');
        const addBtn = picker.querySelector('.picker-add-btn');

        const updatePickerUI = () => {
            sbArea.style.backgroundColor = this.hsvToHex(h, 100, 100);
            sbHandle.style.left = `${s}%`;
            sbHandle.style.top = `${100 - v}%`;
            hueHandle.style.left = `${(h / 360) * 100}%`;
            selectedColor = this.hsvToHex(h, s, v);
            previewBox.style.backgroundColor = selectedColor;
            hexInput.value = selectedColor;
        };

        const updateFromSB = (e) => {
            const rect = sbArea.getBoundingClientRect();
            let x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            let y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            s = Math.round(x * 100);
            v = Math.round((1 - y) * 100);
            updatePickerUI();
        };

        const updateFromHue = (e) => {
            const rect = hueSlider.getBoundingClientRect();
            let x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            h = Math.round(x * 360);
            updatePickerUI();
        };

        let isDraggingSB = false;
        let isDraggingHue = false;

        const onMouseDownSB = (e) => { isDraggingSB = true; updateFromSB(e); };
        const onMouseDownHue = (e) => { isDraggingHue = true; updateFromHue(e); };

        sbArea.addEventListener('mousedown', onMouseDownSB);
        hueSlider.addEventListener('mousedown', onMouseDownHue);

        const onMouseMove = (e) => {
            if (isDraggingSB) updateFromSB(e);
            if (isDraggingHue) updateFromHue(e);
        };

        const onMouseUp = () => {
            isDraggingSB = false;
            isDraggingHue = false;
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        const cleanup = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        const eyedropperBtn = picker.querySelector('.picker-eyedropper-btn');
        if (eyedropperBtn) {
            eyedropperBtn.onclick = async () => {
                try {
                    const eyeDropper = new EyeDropper();
                    const result = await eyeDropper.open();
                    [h, s, v] = this.hexToHsv(result.sRGBHex);
                    updatePickerUI();
                } catch (e) { }
            };
        }

        hexInput.oninput = (e) => {
            const val = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                [h, s, v] = this.hexToHsv(val);
                updatePickerUI();
            }
        };

        const renderTempColors = () => {
            tempColorsList.innerHTML = '';
            this.colors.slice(-8).forEach(color => {
                const chip = document.createElement('div');
                chip.className = 'temp-color-chip';
                chip.style.backgroundColor = color;
                chip.onclick = () => {
                    [h, s, v] = this.hexToHsv(color);
                    updatePickerUI();
                };
                tempColorsList.appendChild(chip);
            });
        };
        renderTempColors();

        const anchor = anchorElement;
        const rect = anchor.getBoundingClientRect();
        if (direction === 'right') {
            picker.style.left = `${rect.right + 12}px`;
        } else {
            picker.style.left = 'auto';
            picker.style.right = `${window.innerWidth - rect.left + 12}px`;
        }

        requestAnimationFrame(() => {
            const pickerRect = picker.getBoundingClientRect();
            let top = (rect.top + rect.bottom) / 2 - pickerRect.height / 2;
            if (top + pickerRect.height > window.innerHeight - 20) top = window.innerHeight - pickerRect.height - 20;
            if (top < 20) top = 20;
            picker.style.top = `${top}px`;
        });

        updatePickerUI();

        addBtn.onclick = () => {
            // Eğer bu renk zaten listede yoksa ekle (Global Palette)
            if (!this.colors.includes(selectedColor)) {
                this.colors.push(selectedColor);
                this.saveColors();
                this.renderColors();
            }

            // Properties Sidebar'daki aktif slotu güncelle
            if (this.app.propertiesSidebar && this.app.propertiesSidebar.activeColorPopupIndex !== -1) {
                this.app.propertiesSidebar.updateQuickColor(this.app.propertiesSidebar.activeColorPopupIndex, selectedColor);
            }

            onSelect(selectedColor);
            cleanup();
            picker.remove();
            this.picker = null;
            document.removeEventListener('pointerdown', closePicker);
        };

        const closePicker = (e) => {
            if (!picker.contains(e.target) && !anchor.contains(e.target)) {
                cleanup();
                picker.remove();
                this.picker = null;
                document.removeEventListener('pointerdown', closePicker);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', closePicker), 0);
    }

    // --- Helpers ---
    hexToHsl(hex) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = "0x" + hex[1] + hex[1];
            g = "0x" + hex[2] + hex[2];
            b = "0x" + hex[3] + hex[3];
        } else if (hex.length === 7) {
            r = "0x" + hex[1] + hex[2];
            g = "0x" + hex[3] + hex[4];
            b = "0x" + hex[5] + hex[6];
        }
        r /= 255;
        g /= 255;
        b /= 255;
        let cmin = Math.min(r, g, b),
            cmax = Math.max(r, g, b),
            delta = cmax - cmin,
            h = 0,
            s = 0,
            l = 0;

        if (delta == 0)
            h = 0;
        else if (cmax == r)
            h = ((g - b) / delta) % 6;
        else if (cmax == g)
            h = (b - r) / delta + 2;
        else
            h = (r - g) / delta + 4;

        h = Math.round(h * 60);

        if (h < 0)
            h += 360;

        l = (cmax + cmin) / 2;
        s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
        s = +(s * 100).toFixed(1);
        l = +(l * 100).toFixed(1);

        return [h, s, l];
    }

    hslToHex(h, s, l) {
        s /= 100;
        l /= 100;

        let c = (1 - Math.abs(2 * l - 1)) * s,
            x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
            m = l - c / 2,
            r = 0,
            g = 0,
            b = 0;

        if (0 <= h && h < 60) {
            r = c; g = x; b = 0;
        } else if (60 <= h && h < 120) {
            r = x; g = c; b = 0;
        } else if (120 <= h && h < 180) {
            r = 0; g = c; b = x;
        } else if (180 <= h && h < 240) {
            r = 0; g = x; b = c;
        } else if (240 <= h && h < 300) {
            r = x; g = 0; b = c;
        } else if (300 <= h && h < 360) {
            r = c; g = 0; b = x;
        }
        r = Math.round((r + m) * 255).toString(16);
        g = Math.round((g + m) * 255).toString(16);
        b = Math.round((b + m) * 255).toString(16);

        if (r.length == 1)
            r = "0" + r;
        if (g.length == 1)
            g = "0" + g;
        if (b.length == 1)
            b = "0" + b;

        return "#" + r + g + b;
    }

    hsvToHex(h, s, v) {
        s /= 100;
        v /= 100;
        let i = Math.floor(h / 60);
        let f = h / 60 - i;
        let p = v * (1 - s);
        let q = v * (1 - f * s);
        let t = v * (1 - (1 - f) * s);
        let r, g, b;
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    hexToHsv(hex) {
        if (!hex || typeof hex !== 'string') return [0, 0, 0];

        // If it's rgba, convert to hex first
        if (hex.startsWith('rgba')) {
            const parts = hex.match(/[\d.]+/g);
            if (parts && parts.length >= 3) {
                const r = parseInt(parts[0]);
                const g = parseInt(parts[1]);
                const b = parseInt(parts[2]);
                const toHex = x => x.toString(16).padStart(2, '0');
                hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            }
        }

        let r, g, b;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16) / 255;
            g = parseInt(hex[2] + hex[2], 16) / 255;
            b = parseInt(hex[3] + hex[3], 16) / 255;
        } else {
            r = parseInt(hex.slice(1, 3), 16) / 255;
            g = parseInt(hex.slice(3, 5), 16) / 255;
            b = parseInt(hex.slice(5, 7), 16) / 255;
        }

        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;

        let d = max - min;
        s = max === 0 ? 0 : d / max;

        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(v * 100)];
    }
}
