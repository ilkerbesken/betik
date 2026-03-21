/**
 * TemplateManager - Betik şablonlarını yöneten sınıf
 * Ayrı JS dosyalarındaki şablon tanımlarını kullanır
 */

const TemplateLibrary = {
    kanban: typeof KANBAN_TEMPLATE !== 'undefined' ? KANBAN_TEMPLATE : null,
    dottedNotes: typeof DOTTED_NOTES_TEMPLATE !== 'undefined' ? DOTTED_NOTES_TEMPLATE : null,
    swot: typeof SWOT_TEMPLATE !== 'undefined' ? SWOT_TEMPLATE : null,
    ruled: typeof RULED_TEMPLATE !== 'undefined' ? RULED_TEMPLATE : null,
    grid: typeof GRID_TEMPLATE !== 'undefined' ? GRID_TEMPLATE : null,
    dotGrid: typeof DOT_GRID_TEMPLATE !== 'undefined' ? DOT_GRID_TEMPLATE : null,
    cornell: typeof CORNELL_TEMPLATE !== 'undefined' ? CORNELL_TEMPLATE : null,
    todoList: typeof TODO_LIST_TEMPLATE !== 'undefined' ? TODO_LIST_TEMPLATE : null,
    calendar: typeof CALENDAR_TEMPLATE !== 'undefined' ? CALENDAR_TEMPLATE : null,
    storyboard: typeof STORYBOARD_TEMPLATE !== 'undefined' ? STORYBOARD_TEMPLATE : null,
    isometricGrid: typeof ISOMETRIC_GRID_TEMPLATE !== 'undefined' ? ISOMETRIC_GRID_TEMPLATE : null,
    meetingNotes: typeof MEETING_NOTES_TEMPLATE !== 'undefined' ? MEETING_NOTES_TEMPLATE : null
};

class TemplateManager {
    constructor(app) {
        this.app = app;
        this.defaultTemplates = [];
        this.userTemplates = this.loadUserTemplates();
        this.templates = [];
        this.categories = ['Tümü', 'İş Planlama', 'Eğitim', 'Yazılım', 'Tasarım', 'Kendi Şablonlarım', 'Diğer'];
        this.favoriteTemplates = this.loadFavorites();

        // Şablonları yükle
        this.initTemplates();
    }

    /**
     * Tüm varsayılan şablonları başlatır
     */
    initTemplates() {
        const libraryTemplates = this.loadTemplatesFromLibrary();

        this.defaultTemplates = libraryTemplates.filter(t => t !== null);
        this.templates = [...this.defaultTemplates, ...this.userTemplates];

        console.log(`${this.defaultTemplates.length} varsayılan şablon yüklendi`);
    }

    /**
     * JS Kütüphanesinden şablonları yükler
     */
    loadTemplatesFromLibrary() {
        return Object.keys(TemplateLibrary).map(key => this.generateTemplateFromLibrary(key));
    }

    /**
     * Kütüphaneden belirli bir şablonu üretir (dinamik içerik dahil)
     */
    generateTemplateFromLibrary(key) {
        const baseTemplate = TemplateLibrary[key];
        if (!baseTemplate) return null;

        // Derin kopyala (clone)
        const template = JSON.parse(JSON.stringify(baseTemplate));

        // Eğer şablonun kendi üretme (generate) fonksiyonu varsa çalıştır
        // Not: JSON.stringify fonksiyonları kopyalamaz, bu yüzden orijinal nesnedeki fonksiyonu referans alıyoruz
        if (typeof baseTemplate.generate === 'function') {
            baseTemplate.generate.call(template);
        }

        return template;
    }

    /**
     * Şablonu canvas'a uygular
     */
    async applyTemplate(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) {
            console.error('Şablon bulunamadı:', templateId);
            return;
        }

        // Canvas ayarlarını şablondan geri yükle
        if (template.canvasSettings && this.app.canvasSettings) {
            const cs = template.canvasSettings;
            if (cs.backgroundColor) this.app.canvasSettings.settings.backgroundColor = cs.backgroundColor;
            if (cs.pattern !== undefined) this.app.canvasSettings.settings.pattern = cs.pattern;
            if (cs.patternColor) this.app.canvasSettings.settings.patternColor = cs.patternColor;
            if (cs.patternSpacing !== undefined) this.app.canvasSettings.settings.patternSpacing = cs.patternSpacing;
            if (cs.patternThickness !== undefined) this.app.canvasSettings.settings.patternThickness = cs.patternThickness;

            // Panel açıksa güncelle
            if (typeof this.app.canvasSettings.loadSettingsToPanel === 'function') {
                this.app.canvasSettings.loadSettingsToPanel();
            }
        }

        // Şablon nesnelerini topla ve en başa (arka plana) ekle
        const templateObjectsToApply = [];

        template.objects.forEach(obj => {
            const normalizedObj = Utils.deepClone(obj);
            normalizedObj.persistent = true; // Mark as part of template

            // 1. Renk ve Dolgu Normalizasyonu
            if (normalizedObj.filled && !normalizedObj.fillColor) {
                normalizedObj.fillColor = normalizedObj.color || '#000000';
            }
            if (!normalizedObj.color && normalizedObj.type !== 'text') {
                normalizedObj.color = '#000000';
            }

            // 2. Metin Nesnesi Normalizasyonu
            if (normalizedObj.type === 'text') {
                if (!normalizedObj.htmlContent && normalizedObj.text) {
                    normalizedObj.htmlContent = `<div>${normalizedObj.text}</div>`;
                }
                if (!normalizedObj.alignment && normalizedObj.textAlign) {
                    normalizedObj.alignment = normalizedObj.textAlign;
                }
                if (!normalizedObj.width) normalizedObj.width = 200;
                if (!normalizedObj.height) normalizedObj.height = 50;
                if (!normalizedObj.fontSize) normalizedObj.fontSize = 16;
                if (!normalizedObj.color) normalizedObj.color = '#000000';

                // Extra check for bold/italic in templates
                if (normalizedObj.fontWeight === 'bold' && normalizedObj.htmlContent && !normalizedObj.htmlContent.includes('font-weight: bold')) {
                    normalizedObj.htmlContent = `<div style="font-weight: bold;">${normalizedObj.text || normalizedObj.htmlContent.replace(/<\/?div>/g, '')}</div>`;
                }
            }

            // 3. Line ve Arrow Normalizasyonu (x1, y1 -> start, end)
            if ((normalizedObj.type === 'line' || normalizedObj.type === 'arrow') && normalizedObj.x1 !== undefined) {
                normalizedObj.start = { x: normalizedObj.x1, y: normalizedObj.y1, pressure: 0.5 };
                normalizedObj.end = { x: normalizedObj.x2, y: normalizedObj.y2, pressure: 0.5 };
                if (normalizedObj.type === 'arrow') normalizedObj.pressure = 0.5;
                delete normalizedObj.x1; delete normalizedObj.y1;
                delete normalizedObj.x2; delete normalizedObj.y2;
            }

            // 4. Ortak özellikler
            if (normalizedObj.opacity === undefined) normalizedObj.opacity = 1.0;
            if (normalizedObj.strokeWidth === undefined) normalizedObj.strokeWidth = 2;
            if (normalizedObj.lineStyle === undefined) normalizedObj.lineStyle = 'solid';

            // Benzersiz ID oluştur
            normalizedObj.id = 'tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            templateObjectsToApply.push(normalizedObj);
        });

        // En başa ekle (arka plan olarak)
        this.app.state.objects.splice(0, 0, ...templateObjectsToApply);

        // If pageManager exists, save to ensure it's synced with the board data
        if (this.app.pageManager) {
            if (this.app.pageManager.currentPageIndex < 0) {
                console.warn('[TemplateManager] PageManager index -1 iken şablon uygulanıyor, index 0 yapılıyor.');
                this.app.pageManager.currentPageIndex = 0;
            }
            this.app.pageManager.saveCurrentPageState();
        }

        // Canvas'ı yeniden çiz
        if (this.app.redrawOffscreen) this.app.redrawOffscreen();
        this.app.render();

        // Geçmişe kaydet
        this.app.saveHistory();

        // Persist immediately after applying template
        if (window.dashboard) {
            await window.dashboard.saveCurrentBoard(true);
        }

        console.log(`Şablon uygulandı: ${template.name}`);
    }

    /**
     * Favori şablonları yükler
     */
    loadFavorites() {
        if (this.app.dashboard) {
            return this.app.dashboard.loadData('betik_favorite_templates', []);
        }
        const saved = localStorage.getItem('betik_favorite_templates');
        return saved ? JSON.parse(saved) : [];
    }

    /**
     * Favori şablonları kaydeder
     */
    saveFavorites() {
        if (this.app.dashboard) {
            this.app.dashboard.saveData('betik_favorite_templates', this.favoriteTemplates);
        } else {
            localStorage.setItem('betik_favorite_templates', JSON.stringify(this.favoriteTemplates));
        }
    }

    /**
     * Şablonu favorilere ekler/çıkarır
     */
    toggleFavorite(templateId) {
        const index = this.favoriteTemplates.indexOf(templateId);
        if (index > -1) {
            this.favoriteTemplates.splice(index, 1);
        } else {
            this.favoriteTemplates.push(templateId);
        }
        this.saveFavorites();
    }

    /**
     * Kategoriye göre şablonları filtreler
     */
    getTemplatesByCategory(category) {
        if (category === 'Tümü') {
            return this.templates;
        }
        if (category === 'Kendi Şablonlarım') {
            return this.userTemplates;
        }
        return this.templates.filter(t => t.category === category);
    }

    /**
     * Favori şablonları getirir
     */
    getFavoriteTemplates() {
        return this.templates.filter(t => this.favoriteTemplates.includes(t.id));
    }

    /**
     * Şablon arar
     */
    searchTemplates(query) {
        const lowerQuery = query.toLowerCase();
        return this.templates.filter(t =>
            t.name.toLowerCase().includes(lowerQuery) ||
            t.description.toLowerCase().includes(lowerQuery) ||
            t.category.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * USER TEMPLATE MANAGEMENT
     */

    /**
     * Kullanıcı şablonlarını yükler
     */
    loadUserTemplates() {
        try {
            if (this.app.dashboard) {
                return this.app.dashboard.loadData('betik_user_templates', []);
            }
            const saved = localStorage.getItem('betik_user_templates');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error loading user templates:', e);
            return [];
        }
    }

    /**
     * Kullanıcı şablonlarını kaydeder
     */
    saveUserTemplates() {
        try {
            if (this.app.dashboard) {
                this.app.dashboard.saveData('betik_user_templates', this.userTemplates);
            } else {
                localStorage.setItem('betik_user_templates', JSON.stringify(this.userTemplates));
            }
            this.templates = [...this.defaultTemplates, ...this.userTemplates];
        } catch (e) {
            console.error('Error saving user templates:', e);
            if (e.name === 'QuotaExceededError') {
                Utils.showToast('Depolama alanı doldu! Bazı şablonları silmeyi deneyin.', 'error');
            }
        }
    }

    /**
     * Mevcut sayfayı şablon olarak kaydeder
     */
    async saveCurrentPageAsTemplate(name, category = 'Kendi Şablonlarım', description = '') {
        if (!name || !name.trim()) {
            Utils.showToast('Lütfen şablon için bir isim girin.', 'warning');
            return false;
        }

        try {
            // Mevcut canvas durumunu kopyala
            const objects = JSON.parse(JSON.stringify(this.app.state.objects));

            // Canvas ayarlarını al
            const cs = this.app.canvasSettings ? this.app.canvasSettings.settings : null;
            const hasCustomBackground = cs && (
                (cs.backgroundColor && cs.backgroundColor !== 'white') ||
                (cs.pattern && cs.pattern !== 'none')
            );

            // Boşluk kontrolü: hem nesneler hem arkaplan ayarları varsayılan ise reddet
            if (objects.length === 0 && !hasCustomBackground) {
                Utils.showToast('Boş bir sayfa şablon olarak kaydedilemez.', 'info');
                return false;
            }

            // Thumbnail oluştur
            const thumbnail = await this.generateThumbnail();

            // Yeni şablon oluştur
            const template = {
                id: 'user_' + Date.now(),
                name: name.trim(),
                category: category,
                description: description.trim() || `${name} için özel şablon`,
                thumbnail: thumbnail,
                objects: objects,
                isUserTemplate: true,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Canvas ayarlarını şablona ekle (arkaplan rengi, desen vb.)
            if (cs) {
                template.canvasSettings = {
                    backgroundColor: cs.backgroundColor || 'white',
                    pattern: cs.pattern || 'none',
                    patternColor: cs.patternColor || 'rgba(0,0,0,0.15)',
                    patternSpacing: cs.patternSpacing || 20,
                    patternThickness: cs.patternThickness || 1
                };
            }

            // Kullanıcı şablonlarına ekle
            this.userTemplates.push(template);
            this.saveUserTemplates();

            console.log('Şablon kaydedildi:', template.name);
            return true;
        } catch (e) {
            console.error('Error saving template:', e);
            Utils.showToast('Şablon kaydedilirken bir hata oluştu.', 'error');
            return false;
        }
    }

    /**
     * Canvas'tan thumbnail oluşturur
     */
    async generateThumbnail() {
        try {
            const canvas = this.app.canvas;

            // Geçici bir canvas oluştur
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');

            // Thumbnail boyutları
            const thumbWidth = 280;
            const thumbHeight = 180;
            tempCanvas.width = thumbWidth;
            tempCanvas.height = thumbHeight;

            // Beyaz arka plan
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, thumbWidth, thumbHeight);

            // Canvas içeriğini küçült ve çiz
            const scale = Math.min(
                thumbWidth / canvas.width,
                thumbHeight / canvas.height
            ) * 0.9;

            const offsetX = (thumbWidth - canvas.width * scale) / 2;
            const offsetY = (thumbHeight - canvas.height * scale) / 2;

            tempCtx.drawImage(
                canvas,
                0, 0, canvas.width, canvas.height,
                offsetX, offsetY, canvas.width * scale, canvas.height * scale
            );

            // Data URL olarak döndür
            return tempCanvas.toDataURL('image/png', 0.8);
        } catch (e) {
            console.error('Error generating thumbnail:', e);
            return null;
        }
    }

    /**
     * Kullanıcı şablonunu günceller
     */
    async updateUserTemplate(templateId, updates) {
        const template = this.userTemplates.find(t => t.id === templateId);
        if (!template || !template.isUserTemplate) {
            console.error('Şablon bulunamadı veya güncellenemez:', templateId);
            return false;
        }

        try {
            if (updates.name) template.name = updates.name.trim();
            if (updates.category) template.category = updates.category;
            if (updates.description !== undefined) template.description = updates.description.trim();
            if (updates.objects) template.objects = JSON.parse(JSON.stringify(updates.objects));

            if (updates.objects) {
                template.thumbnail = await this.generateThumbnail();
            }

            template.updatedAt = Date.now();

            this.saveUserTemplates();
            console.log('Şablon güncellendi:', template.name);
            return true;
        } catch (e) {
            console.error('Error updating template:', e);
            return false;
        }
    }

    /**
     * Kullanıcı şablonunu siler
     */
    async deleteUserTemplate(templateId) {
        const index = this.userTemplates.findIndex(t => t.id === templateId);
        if (index === -1) {
            console.error('Şablon bulunamadı:', templateId);
            return false;
        }

        const template = this.userTemplates[index];
        if (!template.isUserTemplate) {
            console.error('Varsayılan şablonlar silinemez');
            return false;
        }

        const confirmed = await Utils.showConfirm({
            title: 'Şablonu Sil',
            message: `"${template.name}" şablonunu silmek istediğinize emin misiniz?`,
            confirmText: 'Sil',
            type: 'danger'
        });

        if (confirmed) {
            this.userTemplates.splice(index, 1);
            this.saveUserTemplates();

            const favIndex = this.favoriteTemplates.indexOf(templateId);
            if (favIndex > -1) {
                this.favoriteTemplates.splice(favIndex, 1);
                this.saveFavorites();
            }

            console.log('Şablon silindi:', template.name);
            return true;
        }

        return false;
    }

    /**
     * Kullanıcının şablonlarını getirir
     */
    getUserTemplates() {
        return this.userTemplates;
    }

    /**
     * Şablonun kullanıcı şablonu olup olmadığını kontrol eder
     */
    isUserTemplate(templateId) {
        return this.userTemplates.some(t => t.id === templateId);
    }

    /**
     * Şablonu JSON olarak dışa aktar
     */
    exportTemplateAsJSON(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) {
            console.error('Şablon bulunamadı:', templateId);
            return;
        }

        const jsonStr = JSON.stringify(template, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.id}.json`;
        a.click();

        URL.revokeObjectURL(url);
        console.log('Şablon JSON olarak dışa aktarıldı:', template.name);
    }

    /**
     * JSON dosyasından şablon içe aktar
     */
    async importTemplateFromJSON(file) {
        try {
            const text = await file.text();
            const template = JSON.parse(text);

            // Validate template structure
            if (!template.id || !template.name || !template.objects) {
                throw new Error('Geçersiz şablon formatı');
            }

            // Add as user template
            template.isUserTemplate = true;
            template.id = 'user_' + Date.now();
            template.createdAt = Date.now();
            template.updatedAt = Date.now();

            this.userTemplates.push(template);
            this.saveUserTemplates();

            console.log('Şablon içe aktarıldı:', template.name);
            return true;
        } catch (e) {
            console.error('Şablon içe aktarma hatası:', e);
            Utils.showToast('Şablon dosyası okunamadı. Lütfen geçerli bir JSON dosyası seçin.', 'error');
            return false;
        }
    }
}
