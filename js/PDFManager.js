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
            this.isLoaded = true;
            this.pageBuffers.clear();
            if (this.textSelector) this.textSelector.clear();

            console.log(`PDF loaded: ${this.pdfDoc.numPages} pages`);

            if (this.app.pageManager) {
                // Clear existing pages for the new PDF
                this.app.pageManager.pages = [];

                for (let i = 1; i <= this.pdfDoc.numPages; i++) {
                    const pdfPage = await this.pdfDoc.getPage(i);
                    // Use scale 1.5 or 2.0 for better quality when zooming
                    const viewport = pdfPage.getViewport({ scale: 2.0 });

                    this.app.pageManager.pages.push({
                        id: Date.now() + i,
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

                // Switch to first page
                this.app.pageManager.switchPage(0, true, false);
                this.app.render();
            }

            return true;
        } catch (error) {
            console.error('Error loading PDF:', error);
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

        if (this.pageBuffers.has(pageNum)) {
            return this.pageBuffers.get(pageNum);
        }

        // Render lazily if not in buffer
        try {
            const page = await this.pdfDoc.getPage(pageNum);
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

            this.pageBuffers.set(pageNum, buffer);
            console.log(`Page ${pageNum} buffered`);

            // Trigger a redraw now that we have the background
            this.app.redrawOffscreen();
            this.app.render();

            return buffer;
        } catch (error) {
            console.error(`Error buffering PDF page ${pageNum}:`, error);
            return null;
        }
    }

    /**
     * Render the PDF background for a specific page onto the given context
     */
    drawToContext(ctx, page, x, y, width, height) {
        if (!this.isLoaded || !page.pdfPageNumber) return;

        const buffer = this.pageBuffers.get(page.pdfPageNumber);
        if (buffer) {
            ctx.drawImage(buffer, x, y, width, height);
        } else {
            // Initiate lazy load
            this.getPageBuffer(page.pdfPageNumber);
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
