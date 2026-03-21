/**
 * PDFIncrementalSave - Utility to save PDF with annotations incrementally
 * Uses pdf-lib to modify existing PDFs without quality loss.
 */
class PDFIncrementalSave {
    constructor(app) {
        this.app = app;
    }

    /**
     * Export the current whiteboard state to a PDF incrementally
     * @param {Blob|ArrayBuffer} originalPdfData - Original PDF bytes
     * @returns {Promise<Uint8Array>}
     */
    async export(originalPdfData) {
        const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;

        let pdfDoc;
        if (originalPdfData) {
            const bytes = originalPdfData instanceof Blob 
                ? await originalPdfData.arrayBuffer() 
                : originalPdfData;
            pdfDoc = await PDFDocument.load(bytes);
        } else {
            pdfDoc = await PDFDocument.create();
        }

        const pages = this.app.pageManager.pages;
        const totalWbPages = pages.length;

        for (let i = 0; i < totalWbPages; i++) {
            const wbPage = pages[i];
            let pdfPage;

            if (wbPage.pdfPageNumber && originalPdfData) {
                // Use original page if it exists
                // Note: pdf-lib uses 0-indexed pages
                pdfPage = pdfDoc.getPages()[wbPage.pdfPageNumber - 1];
            } else {
                // Create new page
                const w = wbPage.pdfDimensions ? wbPage.pdfDimensions.width : this.app.pageManager.getPageWidth();
                const h = wbPage.pdfDimensions ? wbPage.pdfDimensions.height : this.app.pageManager.getPageHeight();
                pdfPage = pdfDoc.addPage([w, h]);
            }

            if (!pdfPage) continue;

            const { width, height } = pdfPage.getSize();
            
            // Whiteboard coordinates are (0,0) at top-left.
            // PDF coordinates are (0,0) at bottom-left.
            // We need to flip Y.

            const objects = (i === this.app.pageManager.currentPageIndex) 
                ? this.app.state.objects 
                : wbPage.objects;

            for (const obj of objects) {
                await this.drawObject(pdfPage, obj, height, pdfDoc);
            }
        }

        // pdf-lib's save() doesn't do "pure" incremental append by default in a way that
        // preserves exactly every original byte (unless you use specific low-level APIs),
        // but it does preserve the vector nature and quality of the original PDF, 
        // which avoids the "7.7MB image-based PDF" problem.
        return await pdfDoc.save();
    }

    /**
     * Draw a whiteboard object on a pdf-lib page
     */
    async drawObject(page, obj, pageHeight, pdfDoc) {
        const { rgb, degrees } = PDFLib;

        if (obj.type === 'pen' || obj.type === 'highlighter') {
            if (!obj.points || obj.points.length < 2) return;

            const color = this.hexToRgb(obj.color || '#000000');
            const opacity = obj.type === 'highlighter' ? 0.4 : (obj.opacity || 1);
            const thickness = obj.width || 2;

            // Simple path drawing
            // To be accurate, we should use SVG path or multiple line segments
            for (let i = 0; i < obj.points.length - 1; i++) {
                const p1 = obj.points[i];
                const p2 = obj.points[i + 1];
                
                page.drawLine({
                    start: { x: p1.x, y: pageHeight - p1.y },
                    end: { x: p2.x, y: pageHeight - p2.y },
                    thickness: thickness,
                    color: rgb(color.r, color.g, color.b),
                    opacity: opacity,
                    lineCap: 'round'
                });
            }
        } 
        else if (obj.type === 'line' || obj.type === 'arrow') {
            const color = this.hexToRgb(obj.color || '#000000');
            const thickness = obj.width || 2;
            
            const startX = obj.startX !== undefined ? obj.startX : obj.start?.x;
            const startY = obj.startY !== undefined ? obj.startY : obj.start?.y;
            const endX = obj.endX !== undefined ? obj.endX : obj.end?.x;
            const endY = obj.endY !== undefined ? obj.endY : obj.end?.y;

            if (startX === undefined || startY === undefined) return;

            page.drawLine({
                start: { x: startX, y: pageHeight - startY },
                end: { x: endX, y: pageHeight - endY },
                thickness: thickness,
                color: rgb(color.r, color.g, color.b),
                opacity: obj.opacity || 1
            });

            if (obj.type === 'arrow') {
                // Draw arrowhead (simplified)
                this.drawArrowhead(page, startX, startY, endX, endY, thickness, color, pageHeight);
            }
        }
        else if (obj.type === 'rectangle' || obj.type === 'rect') {
            const color = this.hexToRgb(obj.color || '#000000');
            page.drawRectangle({
                x: obj.x,
                y: pageHeight - obj.y - obj.height,
                width: obj.width,
                height: obj.height,
                borderColor: rgb(color.r, color.g, color.b),
                borderWidth: obj.strokeWidth || 2,
                color: obj.fillColor ? rgb(...this.hexToRgbArray(obj.fillColor)) : undefined,
                opacity: obj.opacity || 1,
                rotate: degrees(obj.rotation || 0)
            });
        }
        else if (obj.type === 'text') {
            const color = this.hexToRgb(obj.color || '#000000');
            // Text is hard because we use HTML on whiteboard.
            // We'll extract plain text for now.
            const plainText = this.stripHtml(obj.htmlContent || obj.content || "");
            
            // Standard fonts only for now to avoid embedding overhead
            const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
            
            page.drawText(plainText, {
                x: obj.x,
                y: pageHeight - obj.y - (obj.fontSize || 12),
                size: obj.fontSize || 12,
                font: font,
                color: rgb(color.r, color.g, color.b),
                maxWidth: obj.width,
                lineHeight: (obj.fontSize || 12) * 1.2
            });
        }
        // Add more shapes as needed (ellipse, triangle...)
    }

    drawArrowhead(page, x1, y1, x2, y2, thickness, color, pageHeight) {
        const { rgb } = PDFLib;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headlen = thickness * 5;
        
        const px1 = x2 - headlen * Math.cos(angle - Math.PI / 6);
        const py1 = y2 - headlen * Math.sin(angle - Math.PI / 6);
        const px2 = x2 - headlen * Math.cos(angle + Math.PI / 6);
        const py2 = y2 - headlen * Math.sin(angle + Math.PI / 6);

        page.drawLine({
            start: { x: x2, y: pageHeight - y2 },
            end: { x: px1, y: pageHeight - py1 },
            thickness: thickness,
            color: rgb(color.r, color.g, color.b)
        });
        page.drawLine({
            start: { x: x2, y: pageHeight - y2 },
            end: { x: px2, y: pageHeight - py2 },
            thickness: thickness,
            color: rgb(color.r, color.g, color.b)
        });
    }

    hexToRgb(hex) {
        if (!hex) return { r: 0, g: 0, b: 0 };
        // Remove #
        hex = hex.replace(/^#/, '');
        // Parse
        if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
        const bigint = parseInt(hex, 16);
        return {
            r: ((bigint >> 16) & 255) / 255,
            g: ((bigint >> 8) & 255) / 255,
            b: (bigint & 255) / 255
        };
    }

    hexToRgbArray(hex) {
        const c = this.hexToRgb(hex);
        return [c.r, c.g, c.b];
    }

    stripHtml(html) {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    }
}
