/**
 * PDFManager - Handles PDF background rendering for annotation
 * Senior Developer Approach: Renders PDF pages to offscreen buffers 
 * and integrates with the main Betik render loop.
 */
class PDFManager {
    constructor(app) {
        this.app = app;
        this.pdfDoc = null;
        this.currentUrl = null;
        this.isLoaded = false;
        this.pageBuffers = new Map(); // Stores offscreen canvases for each page
        this.loadingBuffers = new Set(); // To prevent redundant concurrent loads

        // PDF.js settings
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        // Initialize Text Selector
        if (typeof PDFTextSelector !== 'undefined') {
            this.textSelector = new PDFTextSelector(this.app);
        }
    }

    /**
     * Load a PDF from a URL or Blob
     * @param {string|Blob} url 
     */
    async loadPDF(url) {
        try {
            console.log('Loading PDF...');
            this.currentUrl = url;
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;
            this.pageBuffers.clear();
            if (this.textSelector) this.textSelector.clear();

            console.log(`PDF loaded: ${this.pdfDoc.numPages} pages`);
            this.isLoaded = true; // Set early to allow rendering if needed

            if (this.app.pageManager) {
                // Populate a temporary array first to avoid partial state during async loading
                const newPages = [];

                for (let i = 1; i <= this.pdfDoc.numPages; i++) {
                    const pdfPage = await this.pdfDoc.getPage(i);
                    // Use scale 1.5 or 2.0 for better quality when zooming
                    const viewport = pdfPage.getViewport({ scale: 2.0 });

                    newPages.push({
                        id: Date.now() + i + Math.random(),
                        name: `Sayfa ${i}`,
                        objects: [],
                        backgroundColor: 'white',
                        backgroundPattern: 'none',
                        thumbnail: null,
                        pdfPageNumber: i,
                        pdfDimensions: {
                            width: viewport.width / 2.0, // Storage in 1.0 scale
                            height: viewport.height / 2.0
                        }
                    });
                }

                // Update the app's page list once fully loaded
                this.app.pageManager.pages = newPages;

                // Caller should handle switching/rendering
                this.app.pageManager.renderPageList();
                this.app.pageManager.refreshAllThumbnails();
            }

            return true;
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.isLoaded = false;
            return false;
        }
    }

    /**
     * Get or render a PDF page buffer
     * @param {number} pageNum 1-indexed
     * @returns {HTMLCanvasElement|null}
     */
    async getPageBuffer(pageNum) {
        if (!this.isLoaded || !this.pdfDoc) return null;

        const pageId = Number(pageNum);
        if (this.pageBuffers.has(pageId)) {
            return this.pageBuffers.get(pageId);
        }

        if (this.loadingBuffers.has(pageId)) return null;
        this.loadingBuffers.add(pageId);

        // Render lazily if not in buffer
        try {
            const page = await this.pdfDoc.getPage(pageId);
            const viewport = page.getViewport({ scale: 2.0 }); // 2x for retina/zoom quality

            const buffer = document.createElement('canvas');
            const context = buffer.getContext('2d');
            buffer.width = viewport.width;
            buffer.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Generate Text Layer
            if (this.textSelector) {
                this.textSelector.renderTextLayer(page, viewport);
            }

            this.pageBuffers.set(pageId, buffer);
            this.loadingBuffers.delete(pageId);
            
            // Trigger a redraw now that we have the background
            this.app.needsRedrawOffscreen = true;
            this.app.needsRender = true;

            // Update thumbnail for this page
            if (this.app.pageManager) {
                this.app.pageManager.updatePageThumbnail(pageId - 1, true);
            }

            return buffer;
        } catch (error) {
            console.error(`Error buffering PDF page ${pageId}:`, error);
            this.loadingBuffers.delete(pageId);
            return null;
        }
    }

    /**
     * Render the PDF background for a specific page onto the given context
     */
    drawToContext(ctx, page, x, y, width, height) {
        if (!this.isLoaded || !this.pdfDoc) return;

        // Ensure page number exists (backward compatibility for old saves)
        const pageNum = Number(page.pdfPageNumber || (this.app.pageManager.pages.indexOf(page) + 1));
        if (!pageNum || isNaN(pageNum)) return;

        const buffer = this.pageBuffers.get(pageNum);
        if (buffer) {
            // Use WebGPU for faster composition if supported and available
            const gpu = window.webGPURenderer;
            if (gpu && gpu.isSupported) {
                const zoom = this.app.zoomManager.zoom;
                const pan = this.app.zoomManager.pan;
                const viewW = this.app.canvas.clientWidth;
                const viewH = this.app.canvas.clientHeight;

                // drawImage(targetCtx, image, x, y, width, height, zoom, viewWidth, viewHeight, pan, opacity)
                const success = gpu.drawImage(ctx, buffer, x, y, width, height, zoom, viewW, viewH, pan);
                if (success) return;
            }

            // Fallback to Canvas2D
            ctx.drawImage(buffer, x, y, width, height);
        } else {
            // Initiate lazy load
            this.getPageBuffer(pageNum);
        }
    }

    /**
     * Clear PDF and return to normal betik mode
     */
    clearPDF() {
        this.pdfDoc = null;
        this.currentUrl = null;
        this.isLoaded = false;
        this.pageBuffers.clear();
    }
}
