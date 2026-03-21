/**
 * AlignmentTool - mathematical utility for aligning objects on canvas
 */
class AlignmentTool {
    constructor(app) {
        this.app = app;
    }

    // Returns raw bounds of an object using SelectTool if available
    getObjectBounds(obj) {
        if (this.app?.tools?.select?.getBoundingBox) {
            const bounds = this.app.tools.select.getBoundingBox(obj);
            return {
                minX: bounds.minX,
                minY: bounds.minY,
                maxX: bounds.maxX,
                maxY: bounds.maxY,
                width: bounds.maxX - bounds.minX,
                height: bounds.maxY - bounds.minY
            };
        }
        // Fallback for objects with x, y, width, height
        return {
            minX: obj.x || 0,
            minY: obj.y || 0,
            maxX: (obj.x || 0) + (obj.width || 0),
            maxY: (obj.y || 0) + (obj.height || 0),
            width: obj.width || 0,
            height: obj.height || 0
        };
    }

    // Seçili nesnelerin sınırlarını hesaplar
    getSelectionBounds(selectedObjects) {
        if (!selectedObjects || selectedObjects.length === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        selectedObjects.forEach(obj => {
            const bounds = this.getObjectBounds(obj);
            minX = Math.min(minX, bounds.minX);
            minY = Math.min(minY, bounds.minY);
            maxX = Math.max(maxX, bounds.maxX);
            maxY = Math.max(maxY, bounds.maxY);
        });

        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: minX + (maxX - minX) / 2,
            centerY: minY + (maxY - minY) / 2
        };
    }

    align(objects, type, canvasBounds = null) {
        if (!objects || objects.length === 0) return;

        // Undo functionality support
        if (this.app) {
            this.app.saveHistory();
        }

        // Eğer tek obje seçiliyse tuvale, çok obje varsa birbirlerine göre hizala
        const reference = (objects.length === 1 && canvasBounds)
            ? canvasBounds
            : this.getSelectionBounds(objects);

        if (!reference) return;

        objects.forEach(obj => {
            const currentBounds = this.getObjectBounds(obj);
            let dx = 0;
            let dy = 0;

            switch (type) {
                case 'left':
                    dx = reference.minX - currentBounds.minX;
                    break;
                case 'right':
                    dx = reference.maxX - currentBounds.maxX;
                    break;
                case 'center': // Yatay Orta
                    dx = reference.centerX - (currentBounds.minX + currentBounds.width / 2);
                    break;
                case 'top':
                    dy = reference.minY - currentBounds.minY;
                    break;
                case 'bottom':
                    dy = reference.maxY - currentBounds.maxY;
                    break;
                case 'middle': // Dikey Orta
                    dy = reference.centerY - (currentBounds.minY + currentBounds.height / 2);
                    break;
            }
            
            if (dx !== 0 || dy !== 0) {
                if (this.app?.tools?.select?.moveObject) {
                    this.app.tools.select.moveObject(obj, dx, dy);
                } else {
                    if (obj.x !== undefined) obj.x += dx;
                    if (obj.y !== undefined) obj.y += dy;
                }
            }
        });

        if (this.app) {
            this.app.needsRedrawOffscreen = true;
            this.app.needsRender = true;
        }
    }

    distribute(objects, direction) { // direction: 'horizontal' veya 'vertical'
        if (!objects || objects.length < 3) return;

        // Undo functionality support
        if (this.app) {
            this.app.saveHistory();
        }

        // Nesneleri koordinatlarına göre sırala
        const sorted = [...objects].sort((a, b) => {
            const bA = this.getObjectBounds(a);
            const bB = this.getObjectBounds(b);
            return direction === 'horizontal' ? bA.minX - bB.minX : bA.minY - bB.minY;
        });

        const n = sorted.length;
        const allBounds = sorted.map(obj => this.getObjectBounds(obj));
        const firstBounds = allBounds[0];
        const lastBounds = allBounds[n - 1];

        if (direction === 'horizontal') {
            const totalSpan = lastBounds.maxX - firstBounds.minX;
            const totalObjectsWidth = allBounds.reduce((sum, b) => sum + b.width, 0);
            const totalSpace = totalSpan - totalObjectsWidth;
            const gap = totalSpace / (n - 1);
            
            let currentX = firstBounds.maxX + gap;
            
            for (let i = 1; i < n - 1; i++) {
                const b = allBounds[i];
                const dx = currentX - b.minX;
                
                if (dx !== 0) {
                    if (this.app?.tools?.select?.moveObject) {
                        this.app.tools.select.moveObject(sorted[i], dx, 0);
                    } else if (sorted[i].x !== undefined) {
                        sorted[i].x += dx;
                    }
                }
                currentX += b.width + gap;
            }
        } else {
            const totalSpan = lastBounds.maxY - firstBounds.minY;
            const totalObjectsHeight = allBounds.reduce((sum, b) => sum + b.height, 0);
            const totalSpace = totalSpan - totalObjectsHeight;
            const gap = totalSpace / (n - 1);
            
            let currentY = firstBounds.maxY + gap;
            
            for (let i = 1; i < n - 1; i++) {
                const b = allBounds[i];
                const dy = currentY - b.minY;
                
                if (dy !== 0) {
                    if (this.app?.tools?.select?.moveObject) {
                        this.app.tools.select.moveObject(sorted[i], 0, dy);
                    } else if (sorted[i].y !== undefined) {
                        sorted[i].y += dy;
                    }
                }
                currentY += b.height + gap;
            }
        }

        if (this.app) {
            this.app.needsRedrawOffscreen = true;
            this.app.needsRender = true;
        }
    }
}

window.AlignmentTool = AlignmentTool;
