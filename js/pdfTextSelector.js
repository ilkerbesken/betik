class PDFTextSelector {
    constructor(app) {
        this.app = app;
        // Try to find the canvas parent to use as container
        this.container = this.app.canvas ? this.app.canvas.parentNode : (document.getElementById('canvas-wrapper') || document.body);

        this.layerContainer = null;
        this.isActive = false;
        this.textLayers = new Map(); // pageIndex -> div

        // Remove old styles (cleanup from previous versions)
        ['pdf-text-selection-style', 'pdf-text-selection-style-v2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        this.injectStyles();
        this.createContainer();
    }

    /**
     * Create the main transformation container
     */
    createContainer() {
        if (this.layerContainer) this.layerContainer.remove();

        this.layerContainer = document.createElement('div');
        this.layerContainer.className = 'pdf-text-layer-container';

        // Styles for the container
        this.layerContainer.style.position = 'absolute';
        this.layerContainer.style.top = '0';
        this.layerContainer.style.left = '0';
        this.layerContainer.style.width = '100%';
        this.layerContainer.style.height = '100%';
        this.layerContainer.style.pointerEvents = 'none'; // Passthrough by default
        this.layerContainer.style.transformOrigin = '0 0';
        this.layerContainer.style.zIndex = '5'; // Above canvas
        this.layerContainer.style.overflow = 'visible';

        // Forward wheel events to ZoomManager for seamless zooming/scrolling
        this.layerContainer.addEventListener('wheel', (e) => {
            if (this.app.zoomManager && this.app.canvas) {
                // Fix coordinates to be relative to canvas
                const canvasRect = this.app.canvas.getBoundingClientRect();
                const relX = e.clientX - canvasRect.left;
                const relY = e.clientY - canvasRect.top;

                // Proxy event
                const proxyEvent = {
                    preventDefault: () => e.preventDefault(),
                    stopPropagation: () => e.stopPropagation(),
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    deltaX: e.deltaX,
                    deltaY: e.deltaY,
                    offsetX: relX,
                    offsetY: relY,
                    clientX: e.clientX,
                    clientY: e.clientY
                };

                this.app.zoomManager.handleWheel(proxyEvent);
            }
        }, { passive: false });

        this.container.appendChild(this.layerContainer);
    }

    /**
     * Inject CSS
     */
    injectStyles() {
        const styleId = 'pdf-text-selection-style-v3';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                /* Adjusted line-height to improve selection consistency */
                .pdf-text-layer {
                    position: absolute;
                    left: 0; 
                    transform-origin: 0 0;
                    line-height: 1.25;
                    pointer-events: none;
                    user-select: none;
                    -webkit-user-select: none;
                }
                
                .pdf-text-layer.active {
                    pointer-events: auto;
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }

                .pdf-text-layer span {
                    color: transparent;
                    position: absolute;
                    white-space: pre;
                    cursor: text;
                    transform-origin: 0% 0%;
                    user-select: text;
                    -webkit-user-select: text;
                }

                ::selection {
                    background: rgba(33, 150, 243, 0.3);
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Render text layer for a specific page
     */
    async renderTextLayer(pdfPage, viewport) {
        // Use 1.0 scale logic to match logical canvas coordinates
        const logicalViewport = pdfPage.getViewport({ scale: 1.0 });

        // Determine Page Index and Position
        const pageIndex = pdfPage.pageNumber - 1; // 1-based to 0-based
        let pageY = 0;
        if (this.app.pageManager) {
            pageY = this.app.pageManager.getPageY(pageIndex);
        }

        // --- OCR RESTORATION CHECK ---
        // Sayfa için önceden yapılmış OCR verisi var mı bak?
        if (this.app.pageManager && this.app.pageManager.pages[pageIndex]) {
            const pageData = this.app.pageManager.pages[pageIndex];
            if (pageData.ocrData) {
                console.log(`[PDFTextSelector] Restoring OCR layer for Page ${pdfPage.pageNumber}`);
                this.addOcrLayer(pageIndex, pageData.ocrData.lines, pageData.ocrData.scale);
                return; // OCR katmanı varken native katmana gerek yok
            }
        }
        // --- END OCR RESTORATION ---

        // Create Layer Div
        const layerDiv = document.createElement('div');
        layerDiv.className = 'pdf-text-layer';
        layerDiv.dataset.pageIndex = pageIndex;
        if (this.isActive) layerDiv.classList.add('active');

        layerDiv.style.width = `${logicalViewport.width}px`;
        layerDiv.style.height = `${logicalViewport.height}px`;
        layerDiv.style.top = `${pageY}px`;
        layerDiv.style.left = '0px';

        // Required for PDF.js 3.x+
        layerDiv.style.setProperty('--scale-factor', logicalViewport.scale);

        this.layerContainer.appendChild(layerDiv);
        this.textLayers.set(pageIndex, layerDiv);

        try {
            const textContent = await pdfPage.getTextContent();
            if (textContent.items.length === 0) {
                console.log(`Page ${pdfPage.pageNumber} has NO native text.`);
            }

            // Render
            await pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: layerDiv,
                viewport: logicalViewport,
                textDivs: [],
                enhanceTextSelection: true
            }).promise;

            console.log(`PDF Text Layer v3 created for Page ${pdfPage.pageNumber} at Y=${pageY}`);

        } catch (error) {
            console.error(`Error rendering text layer for Page ${pdfPage.pageNumber}:`, error);
        }
    }

    /**
     * OCR sonuçlarını bir sayfa katmanına ekler (Taramalı PDF'ler için)
     */
    addOcrLayer(pageIndex, lines, scale) {
        if (!this.layerContainer) this.createContainer();

        // Sayfa ofsetini al
        let pageY = 0;
        let pageWidth = 800;
        let pageHeight = 1100;
        if (this.app.pageManager) {
            pageY = this.app.pageManager.getPageY(pageIndex);
            const page = this.app.pageManager.pages[pageIndex];
            if (page) {
                pageWidth = page.pdfDimensions?.width || pageWidth;
                pageHeight = page.pdfDimensions?.height || pageHeight;
            }
        }

        // Mevcut OCR veya Text katmanını temizle
        if (this.textLayers.has(pageIndex)) {
            this.textLayers.get(pageIndex).remove();
        }

        const layerDiv = document.createElement('div');
        layerDiv.className = 'pdf-text-layer';
        if (this.isActive) layerDiv.classList.add('active'); // Respect current active state
        layerDiv.dataset.isOcr = 'true';
        layerDiv.style.width = `${pageWidth}px`;
        layerDiv.style.height = `${pageHeight}px`;
        layerDiv.style.top = `${pageY}px`;
        layerDiv.style.left = '0px';
        layerDiv.style.zIndex = '6'; // Native metnin bir üstüne koyabiliriz

        this.layerContainer.appendChild(layerDiv);
        this.textLayers.set(pageIndex, layerDiv);

        const noiseSymbols = ['|', '!', '.', ',', '-', '_', '~', '`', '°', '"', "'"];

        // Yazı genişliğini ölçmek için geçici bir canvas (bir defalık)
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');

        // Satırları span olarak ekle
        for (const line of lines) {
            const text = (line.text || '').trim();
            if (!text || (text.length <= 1 && noiseSymbols.includes(text))) continue;

            const { x0, y0, x1, y1 } = line.bbox;

            // Koordinatlar (Tesseract px -> PDF logical px)
            const lX = x0 * scale;
            const lY = y0 * scale;
            const lW = (x1 - x0) * scale;
            const lH = (y1 - y0) * scale;
            const fontSize = lH * 0.85;

            // Span oluştur
            const span = document.createElement('span');
            span.textContent = text;

            span.style.left = `${lX}px`;
            span.style.top = `${lY}px`;
            span.style.height = `${lH}px`;
            span.style.fontSize = `${fontSize}px`;
            span.style.lineHeight = `${lH}px`;
            span.style.fontFamily = 'sans-serif';
            span.style.color = 'transparent';
            span.style.background = 'transparent';
            span.style.position = 'absolute';
            span.style.whiteSpace = 'pre';
            span.style.transformOrigin = '0 0';

            // Ölçekleme: Metni yatayda kutusuna sığdır
            measureCtx.font = `${fontSize}px sans-serif`;
            const metrics = measureCtx.measureText(text);
            const measuredWidth = metrics.width;

            if (measuredWidth > 0 && lW > 0) {
                const scaleX = lW / measuredWidth;
                span.style.transform = `scaleX(${scaleX})`;
            }

            layerDiv.appendChild(span);
        }

        console.log(`OCR Layer added for page ${pageIndex} with ${lines.length} lines.`);

    }

    /**
     * Update transform for the container
     */
    updateTransform(scale, x, y) {
        if (!this.layerContainer) return;

        // Canvas elementinin parent içindeki ofsetini hesaba kat
        // Canvas ortalanmış olabilir, bu yüzden container'ı canvas üzerine tam oturtuyoruz
        if (this.app.canvas) {
            this.layerContainer.style.left = `${this.app.canvas.offsetLeft}px`;
            this.layerContainer.style.top = `${this.app.canvas.offsetTop}px`;
            this.layerContainer.style.width = `${this.app.canvas.offsetWidth}px`;
            this.layerContainer.style.height = `${this.app.canvas.offsetHeight}px`;
        }

        this.layerContainer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }

    /**
     * Toggle activation
     */
    toggle() {
        this.isActive = !this.isActive;
        if (this.layerContainer) {
            // Update all existing layers
            this.textLayers.forEach(div => {
                if (this.isActive) div.classList.add('active');
                else div.classList.remove('active');
            });
        }
        return this.isActive;
    }

    /**
     * Clear all
     */
    clear() {
        this.textLayers.clear();
        if (this.layerContainer) {
            this.layerContainer.innerHTML = '';
        }
        this.pdfPage = null;
    }

    /**
     * Highlight selected PDF text with highlighter tool
     */
    highlightSelectedText() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            console.log('No text selected');
            return;
        }

        const selectedText = selection.toString().trim();
        if (!selectedText) {
            console.log('No text');
            return;
        }

        console.log('Highlighting:', selectedText);

        // Get the bounding rectangle of the entire selection
        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();

        if (!rects || rects.length === 0) {
            console.log('No bounding rect');
            return;
        }

        console.log('Rects count:', rects.length);

        // Get zoom and pan
        const zoom = this.app.zoomManager ? this.app.zoomManager.zoom : 1;
        const pan = this.app.zoomManager ? this.app.zoomManager.pan : { x: 0, y: 0 };

        // Get canvas position
        const canvasRect = this.app.canvas.getBoundingClientRect();

        // Step 1: Convert all rects to page-relative coordinates
        const convertedRects = [];
        for (let i = 0; i < rects.length; i++) {
            const boundingRect = rects[i];

            if (!boundingRect || boundingRect.width === 0 || boundingRect.height === 0) {
                continue;
            }

            const viewportX = boundingRect.left;
            const viewportY = boundingRect.top;

            const canvasRelX = (viewportX - canvasRect.left - pan.x) / zoom;
            const canvasRelY = (viewportY - canvasRect.top - pan.y) / zoom;

            let pageIndex = 0;
            if (this.app.pageManager) {
                const totalWorldY = (viewportY - canvasRect.top - pan.y) / zoom;
                pageIndex = this.app.pageManager.getPageIndexAt(totalWorldY);
            }

            const pageY = this.app.pageManager ? this.app.pageManager.getPageY(pageIndex) : 0;
            const finalCanvasRelY = canvasRelY - pageY;

            const width = boundingRect.width / zoom;
            const height = boundingRect.height / zoom;

            if (width > 5 && height > 5) {
                convertedRects.push({
                    x: canvasRelX,
                    y: finalCanvasRelY,
                    width: width,
                    height: height,
                    pageIndex: pageIndex
                });
            }
        }

        // Step 2: Group by page and line, then merge overlapping rects
        const lineThreshold = 5; // pixels tolerance for same line
        const mergedHighlights = [];

        // Group by page
        const byPage = {};
        for (const rect of convertedRects) {
            if (!byPage[rect.pageIndex]) byPage[rect.pageIndex] = [];
            byPage[rect.pageIndex].push(rect);
        }

        // For each page, group by line and merge
        for (const pageIndexStr in byPage) {
            const pageRects = byPage[pageIndexStr];
            const pageIndex = parseInt(pageIndexStr);

            // Sort by y position
            pageRects.sort((a, b) => a.y - b.y);

            // Group into lines
            const lines = [];
            let currentLine = [pageRects[0]];

            for (let i = 1; i < pageRects.length; i++) {
                const rect = pageRects[i];
                const prevRect = currentLine[currentLine.length - 1];

                if (Math.abs(rect.y - prevRect.y) <= lineThreshold) {
                    // Same line
                    currentLine.push(rect);
                } else {
                    // New line
                    lines.push(currentLine);
                    currentLine = [rect];
                }
            }
            lines.push(currentLine);

            // Merge overlapping rects in each line
            for (const line of lines) {
                // Sort by x
                line.sort((a, b) => a.x - b.x);

                let mergedX = line[0].x;
                let mergedY = line[0].y;
                let mergedWidth = line[0].width;
                let mergedHeight = line[0].height;

                for (let i = 1; i < line.length; i++) {
                    const rect = line[i];
                    const rightmost = mergedX + mergedWidth;

                    if (rect.x <= rightmost + 2) {
                        // Overlapping or adjacent - merge
                        const newRight = Math.max(rightmost, rect.x + rect.width);
                        mergedWidth = newRight - mergedX;
                        mergedY = Math.min(mergedY, rect.y);
                        mergedHeight = Math.max(mergedHeight, rect.y + rect.height - mergedY);
                    } else {
                        // Not overlapping - save current and start new
                        mergedHighlights.push({
                            x: mergedX,
                            y: mergedY,
                            width: mergedWidth,
                            height: mergedHeight,
                            pageIndex: pageIndex
                        });
                        mergedX = rect.x;
                        mergedY = rect.y;
                        mergedWidth = rect.width;
                        mergedHeight = rect.height;
                    }
                }
                // Push last merged rect
                mergedHighlights.push({
                    x: mergedX,
                    y: mergedY,
                    width: mergedWidth,
                    height: mergedHeight,
                    pageIndex: pageIndex
                });
            }
        }

        console.log('Merged highlights:', mergedHighlights.length);

        // Step 3: Save history and add highlights
        this.app.saveHistory();

        for (const highlight of mergedHighlights) {
            const highlightColor = this.app.state.pdfHighlightColor || '#e3ff00';
            const highlightObj = {
                type: 'rectangle',
                x: highlight.x,
                y: highlight.y,
                width: highlight.width,
                height: highlight.height,
                color: 'transparent',
                fillColor: highlightColor,
                filled: true,
                opacity: 1,
                strokeWidth: 0,
                isHighlight: true,
                blendMode: 'multiply'
            };

            this.app.state.objects.push(highlightObj);
        }

        console.log('Total objects:', this.app.state.objects.length);

        // Trigger redraw
        this.app.needsRedrawOffscreen = true;
        this.app.needsRender = true;

        if (this.app.redrawOffscreen) {
            this.app.redrawOffscreen();
        }
        if (this.app.render) {
            this.app.render();
        }

        // Clear selection
        selection.removeAllRanges();
    }
}
