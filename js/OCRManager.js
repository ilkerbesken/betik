/**
 * OCRManager - Tesseract.js tabanlı Optik Karakter Tanıma sistemi
 * 
 * Güncellemeler:
 * - PDF için PDFTextSelector.addOcrLayer() entegrasyonu (Native seçim deneyimi)
 * - Taramalı PDF'ler için gürültü filtresi ve kalite iyileştirme
 * - Standalone resimler için geliştirilmiş gizli katman (Kilitli ve şeffaf)
 */
class OCRManager {
    constructor(app) {
        this.app = app;
        this.worker = null;
        this.isInitialized = false;
        this.isProcessing = false;
        this.defaultLang = 'tur+eng';

        this._progressOverlay = null;
        this._progressBar = null;
        this._progressText = null;
        this._progressStatus = null;
        this._timeoutId = null;
    }

    _getCurrentLang() {
        const sel = document.getElementById('ocrLangSelect');
        return (sel && sel.value) ? sel.value : this.defaultLang;
    }

    async setLanguage(lang) {
        if (this.defaultLang === lang && this.worker && this.isInitialized) return;
        if (this.worker) {
            try { await this.worker.terminate(); } catch (_) {}
            this.worker = null;
            this.isInitialized = false;
        }
        this.defaultLang = lang;
    }

    async _initWorker() {
        const lang = this._getCurrentLang();
        if (this.worker && this.isInitialized && this._activeLang !== lang) {
            try { await this.worker.terminate(); } catch (_) {}
            this.worker = null;
            this.isInitialized = false;
        }
        if (this.worker && this.isInitialized) return this.worker;

        this._activeLang = lang;
        this._updateProgress(5, `Dil paketi yükleniyor (${lang})...`);

        try {
            this.worker = await Tesseract.createWorker(lang, 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        const pct = Math.round(m.progress * 100);
                        this._updateProgress(40 + Math.round(pct * 0.55), `Metin tanınıyor... %${pct}`);
                    }
                }
            });
            this.isInitialized = true;
            return this.worker;
        } catch (err) {
            console.error('[OCRManager] Worker hatası:', err);
            throw new Error('OCR motoru başlatılamadı.');
        }
    }

    async _doRecognize(canvas, isBulk = false) {
        await this._initWorker();
        if (!isBulk) this._updateProgress(40, 'Görüntü analiz ediliyor...');

        try {
            // Görüntü iyileştirme: Kontrast artırma (Tesseract için kritik)
            this._preprocessCanvas(canvas);

            const { data } = await this.worker.recognize(canvas);
            return data;
        } catch (err) {
            throw err;
        }
    }

    /**
     * Tesseract için canvas'ı optimize eder (Grayscale + Threshold)
     */
    _preprocessCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            // Eşikleme (Thresholding): Daha keskin metinler için
            const v = avg > 180 ? 255 : (avg < 80 ? 0 : avg); 
            data[i] = data[i + 1] = data[i + 2] = v;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Resim nesnesi için görünmez katman (Standalone resimler için)
     */
    _insertImageOcrOverlay(lines, imageObj, scaleX, scaleY) {
        const noiseSymbols = ['|', '!', '.', ',', '-', '_', '~', '`', '°', '"', "'"];
        const validLines = (lines || []).filter(l => {
            const t = (l.text || '').trim();
            if (t.length <= 1 && noiseSymbols.includes(t)) return false;
            return t.length > 0 && l.bbox;
        });

        if (validLines.length === 0) return 0;

        let htmlLines = '';
        for (const line of validLines) {
            const { x0, y0, x1, y1 } = line.bbox;
            const text = (line.text || '').replace(/\n/g, ' ').trim();
            
            const lX = x0 * scaleX;
            const lY = y0 * scaleY;
            const lW = (x1 - x0) * scaleX;
            const lH = (y1 - y0) * scaleY;
            const fontSize = Math.max(8, Math.round(lH * 0.8));

            htmlLines += `<span style="position:absolute; left:${lX}px; top:${lY}px; width:${lW}px; height:${lH}px; font-size:${fontSize}px; color:transparent; background:transparent; user-select:text; pointer-events:auto; white-space:nowrap; overflow:hidden;">${this._escapeHtml(text)}</span>`;
        }

        const textObj = {
            type: 'text',
            id: 'ocr_img_' + Date.now(),
            x: imageObj.x,
            y: imageObj.y,
            width: imageObj.width,
            height: imageObj.height,
            htmlContent: `<div class="ocr-text-overlay" style="position:relative; width:100%; height:100%; pointer-events:none;">${htmlLines}</div>`,
            fontSize: 12,
            color: 'transparent',
            opacity: 0,
            locked: true,         // Yanlışlıkla kaydırılamaz
            _ocrInvisible: true,  
            _ocrCombined: true
        };

        this.app.saveHistory();
        this.app.state.objects.push(textObj);
        this.app.needsRedrawOffscreen = true;
        this.app.needsRender = true;
        return 1;
    }

    async recognizeImageObject(imageObj) {
        if (!imageObj || imageObj.type !== 'image') return null;
        if (this.isProcessing) return null;

        this.isProcessing = true;
        this._showProgress('Resim taranıyor...', 2);

        try {
            const canvas = await this._imageObjToCanvas(imageObj);
            if (!canvas) throw new Error('Resim yüklenemedi.');

            const data = await this._doRecognize(canvas);
            const scaleX = imageObj.width / canvas.width;
            const scaleY = imageObj.height / canvas.height;

            const count = this._insertImageOcrOverlay(data.lines, imageObj, scaleX, scaleY);
            
            this._updateProgress(100, 'Tamamlandı!');
            this._showResult(count);
            setTimeout(() => this._hideProgress(), 1000);
            return data.text;
        } catch (err) {
            this._hideProgress();
            this._showToast('Hata: ' + err.message);
            return null;
        } finally {
            this.isProcessing = false;
        }
    }

    async recognizeCurrentPDFPage() {
        if (!this.app.pdfManager || !this.app.pdfManager.isLoaded) return null;
        if (this.isProcessing) return null;

        const currentPage = this.app.pageManager.pages[this.app.pageManager.currentPageIndex];
        if (!currentPage || !currentPage.pdfPageNumber) return null;

        this.isProcessing = true;
        this._showProgress('PDF sayfası analiz ediliyor...', 5);

        try {
            const data = await this._analyzePdfPage(currentPage.pdfPageNumber);
            
            if (this.app.pdfManager.textSelector) {
                const pageIndex = this.app.pageManager.currentPageIndex;
                this.app.pdfManager.textSelector.addOcrLayer(pageIndex, data.lines, data.invScale);
                
                // OCR verisini sayfa nesnesine kaydet (Kalıcılık için)
                if (this.app.pageManager.pages[pageIndex]) {
                    this.app.pageManager.pages[pageIndex].ocrData = {
                        lines: data.lines,
                        scale: data.invScale
                    };
                }

                this._updateProgress(100, 'Tamamlandı!');
                this._showResult(data.lines.length);

                if (!this.app.state.pdfTextSelectionActive) {
                    this.app.pdfManager.textSelector.toggle();
                    this.app.state.pdfTextSelectionActive = true;
                    if (window.dashboard?.updateToolbarUI) window.dashboard.updateToolbarUI();
                }
            } else {
                throw new Error('PDF Metin Seçimi katmanı bulunamadı.');
            }
            setTimeout(() => this._hideProgress(), 1000);
            return data.text;
        } catch (err) {
            this._hideProgress();
            this._showToast('OCR Hatası: ' + err.message);
            return null;
        } finally {
            this.isProcessing = false;
        }
    }

    async recognizeEntirePDF() {
        if (!this.app.pdfManager || !this.app.pdfManager.isLoaded) return null;
        if (this.isProcessing) return null;

        const totalPages = this.app.pdfManager.pdfDoc.numPages;
        const confirmed = await Utils.showConfirm({
            title: 'Tüm Belgeyi Tara',
            message: `Tüm belge (${totalPages} sayfa) taranacak. Bu işlem birkaç dakika sürebilir. Devam etmek istiyor musunuz?`,
            confirmText: 'Taramayı Başlat',
            type: 'primary'
        });

        if (!confirmed) return;

        this.isProcessing = true;
        this._showProgress(`Hazırlanıyor (1 / ${totalPages})...`, 2);

        try {
            let totalLines = 0;
            for (let i = 1; i <= totalPages; i++) {
                if (!this.isProcessing) break; // Canceled

                const currentPct = Math.round(((i - 1) / totalPages) * 100);
                this._updateProgress(currentPct, `Sayfa Taranıyor: ${i} / ${totalPages}`);
                
                // Bulk modunda içsel progress güncellemelerini pas geçmesini söyleyebiliriz (isteğe bağlı)
                const data = await this._analyzePdfPage(i, true); 
                
                if (this.app.pdfManager.textSelector) {
                    this.app.pdfManager.textSelector.addOcrLayer(i - 1, data.lines, data.invScale);
                    
                    // OCR verisini sayfa nesnesine kaydet
                    if (this.app.pageManager.pages[i - 1]) {
                        this.app.pageManager.pages[i - 1].ocrData = {
                            lines: data.lines,
                            scale: data.invScale
                        };
                    }
                    
                    totalLines += data.lines.length;
                }
            }

            if (this.isProcessing) {
                this._updateProgress(100, 'Tüm döküman tarandı!');
                this._showResult(totalLines);
                
                if (!this.app.state.pdfTextSelectionActive && this.app.pdfManager.textSelector) {
                    this.app.pdfManager.textSelector.toggle();
                    this.app.state.pdfTextSelectionActive = true;
                    if (window.dashboard?.updateToolbarUI) window.dashboard.updateToolbarUI();
                }
            }
 else {
                this._showToast('OCR işlemi iptal edildi.');
            }

            setTimeout(() => this._hideProgress(), 1500);
        } catch (err) {
            this._hideProgress();
            this._showToast('OCR Hatası: ' + err.message);
        } finally {
            this.isProcessing = false;
        }
    }

    async _analyzePdfPage(pageNum, isBulk = false) {
        // High quality for OCR
        const OCR_SCALE = 2.5; 
        const pdfPage = await this.app.pdfManager.pdfDoc.getPage(pageNum);
        const viewport = pdfPage.getViewport({ scale: OCR_SCALE });

        const offCanvas = document.createElement('canvas');
        offCanvas.width = viewport.width;
        offCanvas.height = viewport.height;
        await pdfPage.render({ canvasContext: offCanvas.getContext('2d'), viewport }).promise;

        const data = await this._doRecognize(offCanvas, isBulk);
        return {
            text: data.text,
            lines: data.lines,
            invScale: 1.0 / OCR_SCALE
        };
    }

    _imageObjToCanvas(imageObj) {
        return new Promise((resolve) => {
            const src = imageObj.src;
            const img = new Image();
            if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                resolve(c);
            };
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    _showResult(count) {
        if (count > 0) this._showToast('✓ Metinler tanındı. Artık "PDF Metin Seçimi" aracıyla seçebilirsiniz.', 'success');
        else this._showToast('Metin bulunamadı.');
    }

    _showProgress(statusText, percent) {
        if (!this._progressOverlay) this._createProgressOverlay();
        this._progressOverlay.style.display = 'flex';
        this._updateProgress(percent, statusText);
    }

    _updateProgress(percent, statusText) {
        if (!this._progressOverlay) return;
        const p = Math.min(100, Math.max(0, percent));
        if (this._progressBar) this._progressBar.style.width = `${p}%`;
        if (this._progressText) this._progressText.textContent = `%${Math.round(p)}`;
        if (statusText && this._progressStatus) this._progressStatus.textContent = statusText;
    }

    _hideProgress() {
        if (this._progressOverlay) this._progressOverlay.style.display = 'none';
    }

    _createProgressOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'ocrProgressOverlay';
        overlay.style.cssText = `display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#e0e0e0;border-radius:16px;padding:16px 24px;min-width:300px;z-index:9999;flex-direction:column;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid rgba(99,99,255,0.25);font-family:sans-serif;`;
        overlay.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <span id="ocrProgressStatus" style="font-size:12px;">Hazırlanıyor...</span>
                <span id="ocrProgressText" style="margin-left:auto;font-size:12px;">%0</span>
                <button id="ocrCancelBtn" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>
            </div>
            <div style="background:rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;height:6px;">
                <div id="ocrProgressBar" style="height:100%;background:linear-gradient(90deg,#6363ff,#a855f7);width:0%;transition:width 0.25s;"></div>
            </div>`;
        document.body.appendChild(overlay);
        this._progressOverlay = overlay;
        this._progressBar = overlay.querySelector('#ocrProgressBar');
        this._progressText = overlay.querySelector('#ocrProgressText');
        this._progressStatus = overlay.querySelector('#ocrProgressStatus');
        overlay.querySelector('#ocrCancelBtn').onclick = () => { this.isProcessing = false; this._hideProgress(); };
    }

    _showToast(message, type = 'info') {
        if (window.dashboard?.showToast) { window.dashboard.showToast(message, type); return; }
        const t = document.createElement('div');
        t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 16px;border-radius:8px;z-index:10000;`;
        t.textContent = message;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    _escapeHtml(str) {
        const d = document.createElement('div');
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
    }
}
