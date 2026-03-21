/**
 * ExportManager - Handles Exporting Betik to PNG, SVG, and PDF
 */
class ExportManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * Export current view (active page) as PNG
     */
    /**
     * Export current view (active page) as PNG
     */
    async exportToPNG() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Get dimensions from active page
        const pageWidth = this.app.pageManager.getPageWidth();
        const pageHeight = this.app.pageManager.getPageHeight();

        canvas.width = pageWidth * dpr;
        canvas.height = pageHeight * dpr;

        ctx.scale(dpr, dpr);

        // 1. Draw Background (Color/Pattern/PDF)
        await this.drawPageToContext(ctx, this.app.pageManager.currentPageIndex);

        // 2. Download
        const link = document.createElement('a');
        link.download = `betik_page_${this.app.pageManager.currentPageIndex + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    /**
     * Export current view as SVG
     * Note: This is a complex task. For a basic implementation, we can wrap the canvas image in SVG
     * OR iterate objects and create SVG elements.
     * Iterating objects is better for vector quality but harder to support all canvas features.
     * For now, we'll try to vectorize objects.
     */
    exportToSVG() {
        const pageWidth = this.app.pageManager.getPageWidth();
        const pageHeight = this.app.pageManager.getPageHeight();

        let svgContent = `<svg width="${pageWidth}" height="${pageHeight}" xmlns="http://www.w3.org/2000/svg">`;

        // Background
        const page = this.app.pageManager.pages[this.app.pageManager.currentPageIndex];
        svgContent += `<rect width="100%" height="100%" fill="${page.backgroundColor || 'white'}"/>`;

        // Objects
        const objects = (this.app.pageManager.currentPageIndex === this.app.pageManager.currentPageIndex)
            ? this.app.state.objects
            : page.objects;

        objects.forEach(obj => {
            if (obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'eraser') {
                // Convert points to path
                if (obj.points && obj.points.length > 0) {
                    const pathData = this.pointsToSVGPath(obj.points);
                    const stroke = obj.color;
                    const width = obj.width || 2;
                    const opacity = (obj.type === 'highlighter') ? 0.4 : 1;
                    // Eraser logic is tricky in SVG (usually masking), skipping for simplicity or drawing white
                    if (obj.type !== 'eraser') {
                        svgContent += `<path d="${pathData}" stroke="${stroke}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
                    }
                }
            } else if (obj.type === 'line' || obj.type === 'arrow') {
                svgContent += `<line x1="${obj.startX}" y1="${obj.startY}" x2="${obj.endX}" y2="${obj.endY}" stroke="${obj.color}" stroke-width="${obj.width}" stroke-linecap="round" />`;
                if (obj.type === 'arrow') {
                    // Arrowhead logic would go here (simplified)
                }
            }
            // Add other shapes as needed (rect, circle, etc.)
        });

        svgContent += '</svg>';

        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = `betik_page_${this.app.pageManager.currentPageIndex + 1}.svg`;
        link.href = URL.createObjectURL(blob);
        link.click();
    }

    /**
     * Export All Pages to PDF
     */
    /**
     * Generate PDF as a Blob
     */
    async generatePDFBlob() {
        if (!window.jspdf) {
            console.error("jsPDF library not loaded");
            return null;
        }

        const { jsPDF } = window.jspdf;
        const totalPages = this.app.pageManager.pages.length;

        const doc = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: 'a4',
            hotfixes: ['px_scaling']
        });

        for (let i = 0; i < totalPages; i++) {
            if (i > 0) doc.addPage();

            const page = this.app.pageManager.pages[i];
            let w = 794;
            let h = 1123;

            if (page.pdfDimensions) {
                w = page.pdfDimensions.width;
                h = page.pdfDimensions.height;
            } else if (this.app.canvasSettings) {
                w = this.app.pageManager.getPageWidth();
                h = this.app.pageManager.getPageHeight();
            }

            doc.setPage(i + 1);
            doc.internal.pageSize.width = w;
            doc.internal.pageSize.height = h;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const scale = 2; // Better resolution
            canvas.width = w * scale;
            canvas.height = h * scale;
            ctx.scale(scale, scale);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);

            await this.drawPageToContext(ctx, i);

            const imgData = canvas.toDataURL('image/jpeg', 0.85);
            doc.addImage(imgData, 'JPEG', 0, 0, w, h);
        }

        return doc.output('blob');
    }

    /**
     * Export All Pages to PDF
     */
    async exportToPDF() {
        const blob = await this.generatePDFBlob();
        if (blob) {
            const link = document.createElement('a');
            link.download = `betik_export_${Date.now()}.pdf`;
            link.href = URL.createObjectURL(blob);
            link.click();
        }
    }

    /**
     * Export to PDF using incremental save (pdf-lib)
     * This preserves the original PDF quality and text.
     */
    async exportToPDFIncremental() {
        const dashboard = window.dashboard;
        if (!dashboard) return;

        const boardId = dashboard.currentBoardId;
        if (!boardId) return;

        Utils.showToast('PDF hazırlanıyor (Hızlı mod)...', 'info');

        try {
            // 1. Get original PDF blob from IndexedDB if it exists
            const originalPdfBlob = await Utils.db.get(boardId);
            
            // 2. Initialize Incremental Saver
            const saver = new PDFIncrementalSave(this.app);
            
            // 3. Generate incremental bytes
            const pdfBytes = await saver.export(originalPdfBlob);
            
            // 4. Download
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            const board = dashboard.boards.find(b => b.id === boardId);
            const name = board ? board.name : 'betik_export';
            
            link.download = `${name}_annotated.pdf`;
            link.href = URL.createObjectURL(blob);
            link.click();
            
            Utils.showToast('✅ PDF başarıyla indirildi!', 'success');
        } catch (error) {
            console.error('Incremental PDF export failed:', error);
            Utils.showToast('PDF dışa aktarma hatası: ' + error.message, 'error');
            
            // Fallback to standard export if incremental fails
            console.log('Falling back to standard PDF export...');
            this.exportToPDF();
        }
    }

    /**
     * Helper to get background settings safely
     */
    getBackgroundSettings(pageIndex) {
        let color, pattern;

        if (pageIndex === this.app.pageManager.currentPageIndex && this.app.canvasSettings) {
            color = this.app.canvasSettings.settings.backgroundColor;
            pattern = this.app.canvasSettings.settings.pattern;
        } else {
            const page = this.app.pageManager.pages[pageIndex];
            color = page.backgroundColor || '#ffffff';
            pattern = page.backgroundPattern || 'none';
        }

        // Resolve color name to HEX if valid ID
        if (this.app.canvasSettings && this.app.canvasSettings.colors[color]) {
            color = this.app.canvasSettings.colors[color];
        }

        return { color, pattern };
    }

    /**
     * Export current view as SVG
     */
    exportToSVG() {
        const pageWidth = this.app.pageManager.getPageWidth();
        const pageHeight = this.app.pageManager.getPageHeight();
        const bgSettings = this.getBackgroundSettings(this.app.pageManager.currentPageIndex);

        // Start SVG
        let svgContent = `<svg width="${pageWidth}" height="${pageHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;

        // Defs for Patterns
        svgContent += `<defs>`;
        if (bgSettings.pattern === 'grid') {
            svgContent += `
            <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
            </pattern>`;
        } else if (bgSettings.pattern === 'dots') {
            svgContent += `
            <pattern id="dotPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="rgba(0,0,0,0.15)"/>
            </pattern>`;
        } else if (bgSettings.pattern === 'line') {
            svgContent += `
            <pattern id="linePattern" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 0 20 L 20 20" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
            </pattern>`;
        }
        svgContent += `</defs>`;

        // Background Color Rect
        svgContent += `<rect width="100%" height="100%" fill="${bgSettings.color}"/>`;

        // Pattern Rect (Overlay)
        if (bgSettings.pattern !== 'none') {
            const patternId = bgSettings.pattern + 'Pattern'; // gridPattern, dotPattern...
            // Simple mapping, might need more complex logic if patterns have custom names
            let pid = 'gridPattern';
            if (bgSettings.pattern === 'dots') pid = 'dotPattern';
            if (bgSettings.pattern === 'line') pid = 'linePattern';

            svgContent += `<rect width="100%" height="100%" fill="url(#${pid})"/>`;
        }

        // Objects
        const objects = (this.app.pageManager.currentPageIndex === this.app.pageManager.currentPageIndex)
            ? this.app.state.objects
            : this.app.pageManager.pages[this.app.pageManager.currentPageIndex].objects;

        objects.forEach(obj => {
            if (obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'eraser') {
                if (obj.points && obj.points.length > 0) {
                    const pathData = this.pointsToSVGPath(obj.points);
                    const stroke = obj.color;
                    const width = obj.width || 2;
                    const opacity = (obj.type === 'highlighter') ? 0.4 : 1;
                    if (obj.type !== 'eraser') {
                        svgContent += `<path d="${pathData}" stroke="${stroke}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
                    }
                }
            } else if (obj.type === 'line' || obj.type === 'arrow') {
                svgContent += `<line x1="${obj.startX}" y1="${obj.startY}" x2="${obj.endX}" y2="${obj.endY}" stroke="${obj.color}" stroke-width="${obj.width}" stroke-linecap="round" />`;
            }
            // Add other shapes as needed...
        });

        svgContent += '</svg>';

        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = `betik_page_${this.app.pageManager.currentPageIndex + 1}.svg`;
        link.href = URL.createObjectURL(blob);
        link.click();
    }

    /**
     * Helper to draw a specific page (background + objects) to a 2D context
     */
    async drawPageToContext(ctx, pageIndex) {
        const page = this.app.pageManager.pages[pageIndex];
        const w = (page.pdfDimensions) ? page.pdfDimensions.width : this.app.pageManager.getPageWidth();
        const h = (page.pdfDimensions) ? page.pdfDimensions.height : this.app.pageManager.getPageHeight();

        // Arkaplan ayarlarını al (Canlı veya Kayıtlı)
        const bg = this.getBackgroundSettings(pageIndex);

        // 1. Fill with background color first (Base Layer)
        ctx.fillStyle = bg.color;
        ctx.fillRect(0, 0, w, h);

        // 2. Draw PDF Background if exists (Overwrites color if opaque, creates layer if transparent)
        if (page.pdfPageNumber && this.app.pdfManager) {
            const buffer = await this.app.pdfManager.getPageBuffer(page.pdfPageNumber);
            if (buffer) {
                ctx.drawImage(buffer, 0, 0, w, h);
            }
        }

        // 3. Draw Pattern (always, on top of color/PDF)
        if (bg.pattern !== 'none') {
            this.app.canvasSettings.drawPattern(null, ctx,
                { x: 0, y: 0, w: w, h: h },
                1, // zoom = 1 for export
                { pattern: bg.pattern }
            );
        }

        // 4. Draw Objects
        const objects = (pageIndex === this.app.pageManager.currentPageIndex)
            ? this.app.state.objects
            : page.objects;

        objects.forEach(obj => {
            this.app.drawObject(ctx, obj);
        });
    }

    pointsToSVGPath(points) {
        if (!points || points.length === 0) return '';
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }
        return d;
    }
}
