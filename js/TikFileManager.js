/**
 * TikFileManager - .tik dosya formatı için kaydetme ve açma yöneticisi
 *
 * .tik formatı: JSON içeriğini gzip ile sıkıştırılmış ikili dosya
 * Desteklenen araç tipleri:
 *   - pen, highlighter  → points dizisi (flat array ile optimize)
 *   - text              → htmlContent, fontSize, color, alignment, width, height
 *   - arrow / line      → start, end, curveControlPoint, styles
 *   - shapes            → rectangle, ellipse, triangle, trapezoid, star, diamond,
 *                         parallelogram, oval, heart, cloud
 *   - tape              → mode, pattern, points, customMask (canvas→base64)
 *   - table             → rows, cols, data, cellStyles, rowHeights, colWidths
 *   - sticker           → her sticker bir veya daha fazla alt obje içerir;
 *                         bunlar yukarıdaki tiplerin birleşimidir (group)
 *   - image             → src (base64 veya URL)
 *   - group             → children (recursive)
 */
class TikFileManager {
    constructor(app) {
        this.app = app;
        this._pakoReady = false;
        this._ensurePako();
    }

    // ─────────────────────────────────────────────
    // Pako yükleme
    // ─────────────────────────────────────────────

    async _ensurePako() {
        if (typeof pako !== 'undefined') { this._pakoReady = true; return; }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
            script.onload = () => { this._pakoReady = true; console.log('[TikFileManager] pako yüklendi.'); resolve(); };
            script.onerror = () => { console.error('[TikFileManager] pako yüklenemedi!'); reject(new Error('pako yüklenemedi')); };
            document.head.appendChild(script);
        });
    }

    async _waitForPako() {
        if (this._pakoReady) return;
        await this._ensurePako();
        let attempts = 0;
        while (typeof pako === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (typeof pako === 'undefined') throw new Error('pako kütüphanesi yüklenemedi');
    }

    // ─────────────────────────────────────────────
    // Kaydetme
    // ─────────────────────────────────────────────

    async saveAsTik() {
        await this._waitForPako();

        const dashboard = window.dashboard;
        if (!dashboard) { Utils.showToast('Dashboard bulunamadı.', 'error'); return; }

        // Mevcut sayfa durumunu diske/belleğe kaydet
        if (this.app.pageManager) {
            this.app.pageManager.saveCurrentPageState();
        }

        // Sayfaları serileştir
        let pages = null;
        if (this.app.pageManager) {
            pages = this.app.pageManager.pages.map(page => {
                const p = Utils.deepClone(page);
                delete p.thumbnail; // Büyük base64 thumbnail'i kaldır
                p.objects = p.objects.map(obj => this._serializeObject(obj));
                return p;
            });
        }

        // PDF binary verisini base64 olarak ekle
        let pdfBase64 = null;
        const boardId = dashboard.currentBoardId;
        if (boardId) {
            try {
                const pdfBlob = await Utils.db.get(boardId);
                if (pdfBlob instanceof Blob) {
                    pdfBase64 = await this._blobToBase64(pdfBlob);
                    console.log('[TikFileManager] PDF verisi .tik dosyasına eklendi.');
                }
            } catch (e) {
                console.warn('[TikFileManager] PDF verisi alınamadı:', e);
            }
        }

        const content = {
            version: '2.1',
            format: 'tik',
            savedAt: new Date().toISOString(),
            appVersion: 'Betik',
            pages: pages,
            objects: pages ? null : (this.app.state.objects || []).map(obj => this._serializeObject(obj)),
            pdfBase64: pdfBase64 || undefined
        };

        const jsonStr = JSON.stringify(content);
        const compressed = pako.gzip(jsonStr);

        // Özel Başlık (Magic Bytes): "BETIK!" + Veri
        const header = new TextEncoder().encode('BETIK!');
        const finalData = new Uint8Array(header.length + compressed.length);
        finalData.set(header);
        finalData.set(compressed, header.length);

        // Dosya adı
        const boardName = boardId
            ? (dashboard.boards.find(b => b.id === boardId)?.name || 'betik')
            : 'betik';
        const safeName = boardName.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s\-_]/g, '').trim() || 'betik';

        // File System Access API ile kaydet
        if (window.showSaveFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: `${safeName}.tik`,
                    types: [{ description: 'Betik Notu (.tik)', accept: { 'application/x-betik': ['.tik'] } }]
                });
                const writable = await fileHandle.createWritable();
                await writable.write(finalData);
                await writable.close();
                console.log('[TikFileManager] .tik dosyası kaydedildi (imzalı).');
                this._showToast('✅ .tik dosyası kaydedildi!');
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('[TikFileManager] showSaveFilePicker başarısız, fallback kullanılıyor:', e);
            }
        }

        // Fallback: <a> download
        const blob = new Blob([finalData], { type: 'application/x-betik' });
        const link = document.createElement('a');
        link.download = `${safeName}.tik`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        this._showToast('✅ .tik dosyası indirildi!');
    }

    /**
     * Bir template'i .tik dosyası olarak dışa aktar
     * @param {Object} template - TemplateManager'dan gelen template nesnesi
     */
    async saveTemplateAsTik(template) {
        await this._waitForPako();

        if (!template || !template.objects) {
            Utils.showToast('Geçerli bir şablon bulunamadı.', 'warning');
            return;
        }

        // Template nesnelerini serializeEt
        const serializedObjects = template.objects.map(obj => this._serializeObject(obj));

        const content = {
            version: '2.1',
            format: 'tik',
            savedAt: new Date().toISOString(),
            appVersion: 'Betik',
            templateId: template.id,
            templateName: template.name,
            pages: [{
                id: Date.now(),
                name: 'Sayfa 1',
                objects: serializedObjects,
                backgroundColor: 'white',
                backgroundPattern: 'none',
                thumbnail: null
            }],
            objects: null
        };

        const jsonStr = JSON.stringify(content);
        const compressed = pako.gzip(jsonStr);
        
        // Özel Başlık (Magic Bytes)
        const header = new TextEncoder().encode('BETIK!');
        const finalData = new Uint8Array(header.length + compressed.length);
        finalData.set(header);
        finalData.set(compressed, header.length);

        const safeName = (template.name || 'sablon').replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s\-_]/g, '').trim() || 'sablon';

        if (window.showSaveFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: `${safeName}.tik`,
                    types: [{ description: 'Betik Notu (.tik)', accept: { 'application/x-betik': ['.tik'] } }]
                });
                const writable = await fileHandle.createWritable();
                await writable.write(finalData);
                await writable.close();
                this._showToast(`✅ "${template.name}" şablonu .tik olarak kaydedildi!`);
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('[TikFileManager] showSaveFilePicker başarısız, fallback kullanılıyor:', e);
            }
        }

        const blob = new Blob([finalData], { type: 'application/x-betik' });
        const link = document.createElement('a');
        link.download = `${safeName}.tik`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        this._showToast(`✅ "${template.name}" şablonu .tik olarak indirildi!`);
    }

    // ─────────────────────────────────────────────
    // Açma
    // ─────────────────────────────────────────────

    async openTikFile() {
        await this._waitForPako();

        if (window.showOpenFilePicker) {
            try {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{ description: 'Betik Notu (.tik)', accept: { 'application/x-betik': ['.tik', '.tik'] } }],
                    multiple: false
                });
                const file = await fileHandle.getFile();
                await this._loadFromFile(file);
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('[TikFileManager] showOpenFilePicker başarısız, fallback kullanılıyor:', e);
            }
        }

        // Fallback: hidden input
        const input = document.getElementById('tikInput');
        if (input) {
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) await this._loadFromFile(file);
                input.value = '';
            };
            input.click();
        }
    }

    async _loadFromFile(file) {
        await this._waitForPako();
        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);

            let jsonStr;
            // "BETIK!" imzasını kontrol et (66, 69, 84, 73, 75, 33)
            // Gerûyü uyumluluk: eski "BETIK!" imzasını da destekle (84, 79, 77, 65, 82, 33)
            const isBetik = uint8[0] === 66 && uint8[1] === 69 && uint8[2] === 84 && uint8[3] === 73 && uint8[4] === 75 && uint8[5] === 33;
            const isLegacyBetik = uint8[0] === 84 && uint8[1] === 79 && uint8[2] === 77 && uint8[3] === 65 && uint8[4] === 82 && uint8[5] === 33;
            const isImzali = isBetik || isLegacyBetik;

            if (isImzali) {
                // Başlığı atla (6 bayt) ve decompress et
                const dataOnly = uint8.slice(6);
                jsonStr = pako.inflate(dataOnly, { to: 'string' });
            } else if (uint8[0] === 0x1f && uint8[1] === 0x8b) {
                // Eski düz Gzip (geriye dönük uyumluluk)
                jsonStr = pako.inflate(uint8, { to: 'string' });
            } else {
                // Eski düz JSON
                jsonStr = new TextDecoder().decode(uint8);
            }

            const content = JSON.parse(jsonStr);

            if (!content || (!content.pages && !content.objects)) {
                Utils.showToast('Geçersiz .tik dosyası.', 'error');
                return;
            }

            // Sayfaları deserialize et
            let pages = content.pages;
            if (pages) {
                // Paralel olarak tüm sayfaları deserialize et
                pages = await Promise.all(
                    pages.map(async page => {
                        page.objects = await Promise.all(
                            (page.objects || []).map(obj => this._deserializeObject(obj))
                        );
                        return page;
                    })
                );
            } else if (content.objects) {
                // Eski format: tek sayfa
                const deserializedObjects = await Promise.all(
                    content.objects.map(obj => this._deserializeObject(obj))
                );
                pages = [{
                    id: Date.now(),
                    name: 'Sayfa 1',
                    objects: deserializedObjects,
                    backgroundColor: 'white',
                    backgroundPattern: 'none',
                    thumbnail: null
                }];
            }

            const dashboard = this.app.dashboard || window.dashboard;
            if (!dashboard) {
                console.error('[TikFileManager] Dashboard not found!');
                return;
            }

            console.log('[TikFileManager] Loading file:', file.name);
            this._showToast(`📂 "${file.name}" okunuyor...`);
            
            const boardName = file.name.replace(/\.(tik|tom)$/i, '') || 'İçe Aktarılan Not';
            
            // Check if board already exists in current session to avoid duplicates during rapid opens
            let existingBoard = dashboard.boards.find(b => b.name === boardName && b.isTikFile && (Date.now() - b.createdAt < 5000));
            
            let board;
            if (existingBoard) {
                board = existingBoard;
            } else {
                const hasPDF = !!content.pdfBase64;
                board = {
                    id: 'tik_' + Date.now(),
                    name: boardName,
                    createdAt: Date.now(),
                    lastModified: Date.now(),
                    coverBg: hasPDF ? '#fa5252' : '#1971c2',
                    coverTexture: 'dots',
                    folderId: (dashboard.currentView && dashboard.currentView.startsWith('f_')) ? dashboard.currentView : null,
                    deleted: false,
                    isTikFile: true,
                    isPDF: hasPDF
                };

                dashboard.boards.push(board);
                await dashboard.saveDataAsync('wb_boards', dashboard.boards);

                // PDF base64 verisi varsa IndexedDB'ye kaydet
                if (hasPDF) {
                    try {
                         const pdfBlob = await this._base64ToBlob(content.pdfBase64, 'application/pdf');
                         await Utils.db.save(board.id, pdfBlob);
                         console.log('[TikFileManager] PDF verisi geri yüklendi.');
                    } catch (e) {
                         console.warn('[TikFileManager] PDF verisi geri yüklenemedi:', e);
                    }
                }

                const contentToSave = {
                    version: content.version || '2.1',
                    pages: pages,
                    objects: pages ? null : []
                };

                await dashboard.saveDataAsync(`wb_content_${board.id}`, contentToSave);
                
                // Sync metadata'yı güncelle (Drive PUSH'u tetiklemek için)
                if (window.fileSystemManager) {
                    await window.fileSystemManager.updateSyncMetadata(board.id);
                }
            }

            // Dashboard → App geçişi and Tab Management is handled by dashboard.loadBoard
            console.log('[TikFileManager] Transitioning to board:', board.id);
            this._showToast(`📂 "${board.name}" açıldı`);
            
            // Give a tiny bit of time for storage to settle and UI to be ready
            setTimeout(async () => {
                try {
                    await dashboard.loadBoard(board.id);
                    console.log('[TikFileManager] loadBoard completed for:', board.id);
                } catch (loadErr) {
                    console.error('[TikFileManager] loadBoard failed:', loadErr);
                    // Fallback manual transition if loadBoard fails
                    dashboard.container.style.display = 'none';
                    dashboard.appContainer.style.display = 'flex';
                    window.dispatchEvent(new Event('resize'));
                    if (this.app.tabManager) {
                        await this.app.tabManager.openBoard(board.id, board.name);
                    }
                }
            }, 100);

        } catch (err) {
            console.error('[TikFileManager] Error in _loadFromFile:', err);
            Utils.showToast('Dosya açılamadı: ' + err.message, 'error');
        }
    }

    // ─────────────────────────────────────────────
    // Serileştirme (Kayıt) Yardımcıları
    // ─────────────────────────────────────────────

    /**
     * Tek bir nesneyi JSON-güvenli hale getirir.
     * Araç tipine göre özel işlemler uygular.
     */
    _serializeObject(obj) {
        if (!obj) return obj;

        // Derin kopya — orijinal nesneyi değiştirme
        const o = Object.assign({}, obj);

        // ── Grup: recursive ──
        if (o.type === 'group') {
            o.children = (o.children || []).map(child => this._serializeObject(child));
            return o;
        }

        // ── Kalem / Vurgulayıcı: points flat array ──
        if ((o.type === 'pen' || o.type === 'highlighter') && Array.isArray(o.points) && !o._flat) {
            // High precision: NO SIMPLIFICATION. Keep Chaikin points for perfect curves.
            const flat = [];
            for (const p of o.points) {
                flat.push(Math.round(p.x * 100000) / 100000);
                flat.push(Math.round(p.y * 100000) / 100000);
                flat.push(p.pressure !== undefined ? (Math.round(p.pressure * 100000) / 100000) : 0.5);
            }
            o.points = flat;
            o._flat = true;
        }

        // ── Ok / Çizgi: koordinat hassasiyeti ──
        if (o.type === 'arrow' || o.type === 'line') {
            if (o.start) o.start = this._roundPoint(o.start);
            if (o.end) o.end = this._roundPoint(o.end);
            if (o.curveControlPoint) o.curveControlPoint = this._roundPoint(o.curveControlPoint);
        }

        // ── Şekiller: koordinat hassasiyeti ──
        if (o.x !== undefined) o.x = Math.round(o.x * 100000) / 100000;
        if (o.y !== undefined) o.y = Math.round(o.y * 100000) / 100000;
        if (o.width !== undefined) o.width = Math.round(o.width * 100000) / 100000;
        if (o.height !== undefined) o.height = Math.round(o.height * 100000) / 100000;
        if (o.rotation !== undefined) o.rotation = Math.round(o.rotation * 100) / 100;

        // ── Bant (Tape): points + customMask/customImage ──
        if (o.type === 'tape') {
            // Points dizisi flat array'e çevir (daha küçük dosya)
            if (Array.isArray(o.points) && !o._flat) {
                const flat = [];
                for (const p of o.points) {
                    flat.push(Math.round(p.x * 100000) / 100000);
                    flat.push(Math.round(p.y * 100000) / 100000);
                }
                o.points = flat;
                o._flat = true;
            }

            // HTMLCanvasElement → base64 PNG
            if (o.customMask && (o.customMask instanceof HTMLCanvasElement)) {
                try {
                    o.customMask = { _type: 'canvas_b64', data: o.customMask.toDataURL('image/png') };
                } catch (_) { delete o.customMask; }
            } else if (o.customMask && !(typeof o.customMask === 'object' && o.customMask._type)) {
                // Serialize edilemeyen nesneyi sil
                delete o.customMask;
            }

            if (o.customImage && (o.customImage instanceof HTMLImageElement || o.customImage instanceof HTMLCanvasElement)) {
                try {
                    if (o.customImage instanceof HTMLCanvasElement) {
                        o.customImage = { _type: 'canvas_b64', data: o.customImage.toDataURL('image/png') };
                    } else {
                        // HTMLImageElement: src üzerinden canvas'a çekip base64 al
                        const tmpCanvas = document.createElement('canvas');
                        tmpCanvas.width = o.customImage.naturalWidth || 100;
                        tmpCanvas.height = o.customImage.naturalHeight || 100;
                        tmpCanvas.getContext('2d').drawImage(o.customImage, 0, 0);
                        o.customImage = { _type: 'canvas_b64', data: tmpCanvas.toDataURL('image/png') };
                    }
                } catch (_) { delete o.customImage; }
            } else if (o.customImage && !(typeof o.customImage === 'object' && o.customImage._type)) {
                delete o.customImage;
            }

            // Pattern cache kaldır (her zaman yeniden oluşturulur)
            // patterns objesi TapeTool instance'ında saklanır, obj'de değil — sorun yok
        }

        // ── Metin (Text): sadece gerekli alanlar ──
        if (o.type === 'text') {
            // htmlContent, fontSize, color, alignment, x, y, width, height zaten var
            // _imageCache gibi runtime önbellekleri kaldır
            delete o._imageCache;
            delete o._cachedSvg;
        }

        // ── Tablo (Table): önbellek temizle ──
        if (o.type === 'table') {
            // _cellCaches runtime bilgisi — kayıt dışı
            delete o._cellCaches;
            // cellStyles'ın her hücresini serialize et
            if (Array.isArray(o.cellStyles)) {
                o.cellStyles = o.cellStyles.map(row =>
                    (row || []).map(cell => cell || {})
                );
            }
            // data 2D dizisi zaten JSON-serializable (string content HTML olabilir)
        }

        // ── Resim (Image): src base64 veya URL ──
        // src zaten string, ImageTool cache kaldır
        if (o.type === 'image') {
            // _cachedImage gibi runtime nesneleri kaldır
            delete o._cachedImage;
        }

        // ── Genel: DOM elemanlarını ve cyclic referansları temizle ──
        delete o._cellEditor;
        delete o._toolbar;

        return o;
    }

    _roundPoint(p) {
        if (!p) return p;
        return {
            x: Math.round(p.x * 100000) / 100000,
            y: Math.round(p.y * 100000) / 100000,
            pressure: p.pressure !== undefined ? (Math.round(p.pressure * 100000) / 100000) : 0.5
        };
    }

    // ─────────────────────────────────────────────
    // Deserileştirme (Açma) Yardımcıları
    // ─────────────────────────────────────────────

    /**
     * Tek bir nesneyi çalışma zamanı formatına geri çevirir.
     * Async çünkü canvas/image yükleme gerekebilir.
     */
    async _deserializeObject(obj) {
        if (!obj) return obj;

        // ── Grup: recursive ──
        if (obj.type === 'group') {
            obj.children = await Promise.all(
                (obj.children || []).map(child => this._deserializeObject(child))
            );
            return obj;
        }

        // ── Kalem / Vurgulayıcı: flat array → [{x,y,pressure},...] ──
        if ((obj.type === 'pen' || obj.type === 'highlighter') && obj._flat && Array.isArray(obj.points)) {
            const inflated = [];
            for (let i = 0; i < obj.points.length; i += 3) {
                inflated.push({
                    x: obj.points[i],
                    y: obj.points[i + 1],
                    pressure: obj.points[i + 2] !== undefined ? obj.points[i + 2] : 0.5
                });
            }
            obj.points = inflated;
            delete obj._flat;
        }

        // ── Bant (Tape): flat points + customMask/customImage ──
        if (obj.type === 'tape') {
            // Points flat array → [{x,y},...] (bant için pressure yok)
            if (obj._flat && Array.isArray(obj.points)) {
                const inflated = [];
                for (let i = 0; i < obj.points.length; i += 2) {
                    inflated.push({ x: obj.points[i], y: obj.points[i + 1] });
                }
                obj.points = inflated;
                delete obj._flat;
            }

            // customMask: base64 → HTMLImageElement (TapeTool bunu kullanabilir)
            if (obj.customMask && typeof obj.customMask === 'object' && obj.customMask._type === 'canvas_b64') {
                obj.customMask = await this._loadImageFromBase64(obj.customMask.data);
            }

            if (obj.customImage && typeof obj.customImage === 'object' && obj.customImage._type === 'canvas_b64') {
                obj.customImage = await this._loadImageFromBase64(obj.customImage.data);
            }
        }

        // ── Tablo (Table): önbellek başlat ──
        if (obj.type === 'table') {
            // _cellCaches runtime — boş olarak başlat
            obj._cellCaches = {};

            // cellStyles eksik satır/sütunları tamamla
            if (!Array.isArray(obj.cellStyles) || obj.cellStyles.length !== obj.rows) {
                obj.cellStyles = Array(obj.rows).fill(null).map((_, r) => {
                    const existingRow = (obj.cellStyles && obj.cellStyles[r]) ? obj.cellStyles[r] : [];
                    return Array(obj.cols).fill(null).map((__, c) => existingRow[c] || {});
                });
            }

            // rowHeights / colWidths eksikse varsayılan değer ver
            if (!Array.isArray(obj.rowHeights) || obj.rowHeights.length !== obj.rows) {
                obj.rowHeights = Array(obj.rows).fill(40);
            }
            if (!Array.isArray(obj.colWidths) || obj.colWidths.length !== obj.cols) {
                obj.colWidths = Array(obj.cols).fill(100);
            }

            // data eksik hücreleri tamamla
            if (!Array.isArray(obj.data)) {
                obj.data = Array(obj.rows).fill(null).map(() => Array(obj.cols).fill(''));
            }

            // width / height hesapla (eğer eksikse)
            if (!obj.width) obj.width = obj.colWidths.reduce((a, b) => a + b, 0);
            if (!obj.height) obj.height = obj.rowHeights.reduce((a, b) => a + b, 0);
        }

        // ── Metin (Text): eksik alanları tamamla ──
        if (obj.type === 'text') {
            obj.htmlContent = obj.htmlContent || obj.content || '';
            obj.fontSize = obj.fontSize || 12;
            obj.color = obj.color || '#000000';
            obj.width = obj.width || 200;
            obj.height = obj.height || 40;
        }

        // ── Ok / Çizgi: eksik alanları tamamla ──
        if (obj.type === 'arrow' || obj.type === 'line') {
            // Eski format geriye dönük uyumluluk
            if (!obj.start && obj.x1 !== undefined) {
                obj.start = { x: obj.x1, y: obj.y1 };
                obj.end = { x: obj.x2, y: obj.y2 };
            }
        }

        return obj;
    }

    /**
     * base64 PNG → HTMLImageElement (Promise)
     */
    _loadImageFromBase64(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                // Yüklenemezse null döndür
                console.warn('[TikFileManager] Resim yüklenemedi.');
                resolve(null);
            };
            img.src = dataUrl;
        });
    }

    /**
     * Blob → base64 data URL (Promise)
     */
    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * base64 data URL → Blob
     */
    async _base64ToBlob(dataUrl, mimeType) {
        // dataUrl may start with 'data:application/pdf;base64,...'
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType || 'application/pdf' });
    }

    // ─────────────────────────────────────────────
    // Toast Bildirimi
    // ─────────────────────────────────────────────

    _showToast(message) {
        Utils.showToast(message, message.includes('✅') || message.includes('📂') ? 'success' : 'info');
    }
}
