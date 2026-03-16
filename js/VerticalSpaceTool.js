class VerticalSpaceTool {
    constructor(onNeedsRender) {
        this.onNeedsRender = onNeedsRender;
        this.isDrawing = false;
        this.startY = 0;
        this.currentY = 0;
        this.objectsSnapshot = [];
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.startY = pos.y;
        this.currentY = pos.y;
        
        this.objectsSnapshot = state.objects.map(obj => ({
            obj: obj,
            bounds: this.getObjectBounds(obj)
        }));
        
        return false;
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return false;
        
        const prevY = this.currentY;
        this.currentY = pos.y;
        const deltaY = this.currentY - prevY;
        
        if (Math.abs(deltaY) > 0) {
            this.applyVerticalSpaceLive(state, deltaY, this.startY);
            if (this.onNeedsRender) {
                this.onNeedsRender();
            }
        }
        
        return true;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;
        
        this.isDrawing = false;
        this.objectsSnapshot = [];
        
        return null;
    }

    draw(ctx, state) {
        if (this.isDrawing && Math.abs(this.currentY - this.startY) > 5) {
            ctx.save();
            
            const minY = Math.min(this.startY, this.currentY);
            const maxY = Math.max(this.startY, this.currentY);
            
            ctx.fillStyle = 'rgba(92, 155, 254, 0.2)';
            ctx.fillRect(0, minY, ctx.canvas.width, maxY - minY);
            
            ctx.strokeStyle = '#5c9bfe';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, this.startY);
            ctx.lineTo(ctx.canvas.width, this.startY);
            ctx.stroke();
            
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(0, this.currentY);
            ctx.lineTo(ctx.canvas.width, this.currentY);
            ctx.stroke();
            
            ctx.restore();
        }
        
        return false;
    }

    applyVerticalSpaceLive(state, deltaY, thresholdY) {
        state.objects.forEach((obj, index) => {
            const snapshot = this.objectsSnapshot[index];
            if (!snapshot || !snapshot.bounds) return;
            
            if (snapshot.bounds.y + snapshot.bounds.height > thresholdY) {
                this.moveObject(obj, deltaY);
            }
        });
    }

    getObjectBounds(obj) {
        if (!obj) return null;
        
        // Use SelectTool's comprehensive bounding box logic for consistency
        if (window.app && window.app.tools && window.app.tools.select) {
            const b = window.app.tools.select.getBoundingBox(obj);
            if (b) {
                return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
            }
        }

        // Local legacy fallback
        if (obj.type === 'line' || obj.type === 'arrow') {
            const start = obj.start || { x: obj.x1, y: obj.y1 };
            const end = obj.end || { x: obj.x2, y: obj.y2 };
            const minX = Math.min(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const maxX = Math.max(start.x, end.x);
            const maxY = Math.max(start.y, end.y);
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        } else if (obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'triangle' || 
                   obj.type === 'trapezoid' || obj.type === 'star' || obj.type === 'diamond' || 
                   obj.type === 'parallelogram' || obj.type === 'oval' || obj.type === 'heart' || 
                   obj.type === 'cloud' || obj.type === 'shape') {
            return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
        } else if (obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'charcoal' || obj.type === 'fountain-pen') {
            if (!obj.points || obj.points.length === 0) return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            obj.points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        } else if (obj.type === 'text' || obj.type === 'sticker' || obj.type === 'image' || obj.type === 'table') {
            return { x: obj.x, y: obj.y, width: obj.width || 100, height: obj.height || 20 };
        }
        
        return null;
    }

    moveObject(obj, deltaY) {
        if (!obj) return;

        // Use SelectTool's move logic which handles all types correctly (including vector-pen)
        if (window.app && window.app.tools && window.app.tools.select) {
            window.app.tools.select.moveObject(obj, 0, deltaY);
            return;
        }

        // Local legacy fallback
        if (obj.type === 'line' || obj.type === 'arrow') {
            if (obj.start) {
                obj.start.y += deltaY;
                obj.end.y += deltaY;
            } else {
                obj.y1 += deltaY;
                obj.y2 += deltaY;
            }
        } else if (obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'triangle' || 
                   obj.type === 'trapezoid' || obj.type === 'star' || obj.type === 'diamond' || 
                   obj.type === 'parallelogram' || obj.type === 'oval' || obj.type === 'heart' || 
                   obj.type === 'cloud' || obj.type === 'shape' || obj.type === 'text' || 
                   obj.type === 'sticker' || obj.type === 'image' || obj.type === 'table') {
            obj.y += deltaY;
        } else if (obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'charcoal' || obj.type === 'fountain-pen') {
            if (obj.points) {
                obj.points.forEach(p => {
                    p.y += deltaY;
                });
            }
        }
    }
}
