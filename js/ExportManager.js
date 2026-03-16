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
    async exportToPDF() {
        if (!window.jspdf) {
            console.error("jsPDF library not loaded");
            alert("PDF dışa aktarma kütüphanesi yüklenemedi.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const totalPages = this.app.pageManager.pages.length;

        // Initial doc (A4 default, but we will change page size per page)
        const doc = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: 'a4',
            hotfixes: ['px_scaling']
        });

        // Remove the default first page effectively by adding a new one and deleting first? 
        // Or just use the first page and resize it.

        for (let i = 0; i < totalPages; i++) {
            if (i > 0) doc.addPage();

            // Switch current page logic temporarily to draw context? 
            // Better to just draw using data.

            const pageWidth = this.app.pageManager.getPageWidth(); // This takes current page index, need to be careful
            // We should get width/height specific to page i
            // But PageManager.getPageWidth uses currentPageIndex. 
            // Let's set index temporarily ?? Or access raw data.

            const page = this.app.pageManager.pages[i];
            let w = 794;
            let h = 1123;

            if (page.pdfDimensions) {
                w = page.pdfDimensions.width;
                h = page.pdfDimensions.height;
            } else if (this.app.canvasSettings) {
                // Fallback to settings if standard page
                w = this.app.pageManager.getPageWidth(); // Only mostly correct if all pages same size
                h = this.app.pageManager.getPageHeight();
            }

            // Set PDF page size
            doc.setPage(i + 1);
            doc.internal.pageSize.width = w;
            doc.internal.pageSize.height = h;

            // Render Page to Canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // High res for clear PDF text/lines
            const scale = 2;
            canvas.width = w * scale;
            canvas.height = h * scale;
            ctx.scale(scale, scale);

            // Fill white background to prevent black in JPEG
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);

            // Draw content to this temp canvas
            await this.drawPageToContext(ctx, i);

            // Add to PDF
            const imgData = canvas.toDataURL('image/jpeg', 0.85); // JPEG is faster and smaller for full page
            doc.addImage(imgData, 'JPEG', 0, 0, w, h);
        }

        doc.save('betik_export.pdf');
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
