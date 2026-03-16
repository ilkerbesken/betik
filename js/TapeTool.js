/**
 * Tape Tool Module
 * Provides modular 'tape' drawing functionality with patterns and interactive visibility.
 */
class TapeTool {
    constructor(renderCallback) {
        this.renderCallback = renderCallback;
        this.isDrawing = false;
        this.startPoint = null;
        this.currentTape = null;
        this.points = [];

        // Patterns cache
        this.patterns = {};

        // Default settings
        this.settings = {
            thickness: 20,
            mode: 'line', // 'freehand', 'line', 'rectangle'
            pattern: 'stripes', // 'solid', 'dots', 'grid', 'stripes', 'custom'
            customImage: null,
            customMask: null
        };
    }

    /**
     * Set the tool settings from UI
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.startPoint = { x: pos.x, y: pos.y };

        this.currentTape = {
            type: 'tape',
            mode: this.settings.mode,
            pattern: this.settings.pattern,
            color: state.strokeColor || '#ffea00',
            thickness: state.strokeWidth || this.settings.thickness,
            opacity: state.opacity !== undefined ? state.opacity : 1.0,
            originalOpacity: state.opacity !== undefined ? state.opacity : 1.0,
            isHidden: false,
            points: [{ x: pos.x, y: pos.y }],
            x: pos.x,
            y: pos.y,
            width: 0,
            height: 0,
            customImage: this.settings.customImage,
            customMask: this.settings.customMask,
            id: 'tape_' + Date.now() + Math.random()
        };

        return true;
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing || !this.currentTape) return false;

        const pts = this.currentTape.points;

        if (this.currentTape.mode === 'freehand') {
            const lastPoint = pts[pts.length - 1];
            const d = Utils.distance(lastPoint, pos);
            if (d > 2) {
                pts.push({ x: pos.x, y: pos.y });
            }
        } else {
            // Line and Rectangle modes
            const minX = Math.min(this.startPoint.x, pos.x);
            const minY = Math.min(this.startPoint.y, pos.y);
            const maxX = Math.max(this.startPoint.x, pos.x);
            const maxY = Math.max(this.startPoint.y, pos.y);

            this.currentTape.x = minX;
            this.currentTape.y = minY;
            this.currentTape.width = maxX - minX;
            this.currentTape.height = maxY - minY;

            if (this.currentTape.mode === 'line') {
                this.currentTape.points = [this.startPoint, { x: pos.x, y: pos.y }];
            }
        }

        return true;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;

        this.isDrawing = false;

        // For freehand, do a small smoothing sweep
        if (this.currentTape.mode === 'freehand' && this.currentTape.points.length > 3) {
            this.currentTape.points = Utils.chaikin(this.currentTape.points, 2);
        }

        // Validity check
        if (this.currentTape.mode === 'freehand' && this.currentTape.points.length < 2) {
            this.currentTape = null;
            return null;
        }
        if (this.currentTape.mode !== 'freehand' && this.currentTape.width < 2 && this.currentTape.height < 2) {
            // If it's a line, check distance
            if (this.currentTape.mode === 'line') {
                if (this.currentTape.points.length < 2) {
                    this.currentTape = null;
                    return null;
                }
                const p1 = this.currentTape.points[0];
                const p2 = this.currentTape.points[1];
                if (Utils.distance(p1, p2) < 2) {
                    this.currentTape = null;
                    return null;
                }
            } else {
                this.currentTape = null;
                return null;
            }
        }

        const completedTape = this.currentTape;
        this.currentTape = null;
        this.startPoint = null;

        return completedTape;
    }

    /**
     * Main draw function for the tape
     */
    draw(ctx, obj) {
        if (!obj) return;

        ctx.save();

        if (obj.isHidden) {
            // "Hidden" mode: Show only dashed boundaries
            ctx.globalAlpha = 0.4;
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = obj.color || '#888';
            ctx.lineWidth = 1;

            if (obj.mode === 'rectangle') {
                ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
            } else if (obj.mode === 'line') {
                const p1 = obj.points[0];
                const p2 = obj.points[1];
                this.drawTapeOutline(ctx, obj); // Use outline helper
            } else {
                this.drawTapeOutline(ctx, obj);
            }
        } else {
            // Normal mode: Show full pattern
            ctx.globalAlpha = obj.opacity;
            this.applyStyle(ctx, obj);

            if (obj.mode === 'rectangle') {
                ctx.beginPath();
                ctx.rect(obj.x, obj.y, obj.width, obj.height);
                ctx.fill();
            } else if (obj.mode === 'line') {
                if (obj.points && obj.points.length >= 2) {
                    this.drawLineTape(ctx, obj);
                }
            } else {
                if (obj.points && obj.points.length >= 2) {
                    this.drawFreehandTape(ctx, obj);
                }
            }
        }

        ctx.restore();
    }

    /**
     * Helper to draw just the path/outline of a tape (used for hidden state or line mode)
     */
    drawTapeOutline(ctx, obj) {
        const pts = obj.points;
        if (pts.length < 2) return;

        const r = obj.thickness / 2;
        ctx.beginPath();

        // One side
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const prev = pts[i - 1] || pts[i + 1];
            const next = pts[i + 1] || pts[i - 1];
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / d;
            const ny = dx / d;
            if (i === 0) ctx.moveTo(p.x + nx * r, p.y + ny * r);
            else ctx.lineTo(p.x + nx * r, p.y + ny * r);
        }

        // Other side
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            const prev = pts[i - 1] || pts[i + 1];
            const next = pts[i + 1] || pts[i - 1];
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / d;
            const ny = dx / d;
            ctx.lineTo(p.x - nx * r, p.y - ny * r);
        }

        ctx.closePath();
        ctx.stroke();
    }

    drawLineTape(ctx, obj) {
        if (!obj.points || obj.points.length < 2) return;
        const p1 = obj.points[0];
        const p2 = obj.points[1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const r = obj.thickness / 2;

        ctx.beginPath();
        ctx.moveTo(p1.x + nx * r, p1.y + ny * r);
        ctx.lineTo(p2.x + nx * r, p2.y + ny * r);
        ctx.lineTo(p2.x - nx * r, p2.y - ny * r);
        ctx.lineTo(p1.x - nx * r, p1.y - ny * r);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Draw freehand tape using an envelope method
     */
    drawFreehandTape(ctx, obj) {
        const pts = obj.points;
        if (pts.length < 2) return;

        const r = obj.thickness / 2;
        ctx.beginPath();

        const first = pts[0];
        const next = pts[1];
        const d1 = Math.sqrt((next.x - first.x) ** 2 + (next.y - first.y) ** 2) || 1;
        const nx1 = -(next.y - first.y) / d1;
        const ny1 = (next.x - first.x) / d1;

        ctx.moveTo(first.x + nx1 * r, first.y + ny1 * r);

        // Left side
        for (let i = 1; i < pts.length; i++) {
            const p = pts[i];
            const prev = pts[i - 1];
            const d = Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2) || 1;
            const nx = -(p.y - prev.y) / d;
            const ny = (p.x - prev.x) / d;
            ctx.lineTo(p.x + nx * r, p.y + ny * r);
        }

        // Right side (backwards)
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            const nextP = pts[i + 1] || pts[i - 1];
            const factor = (i === pts.length - 1) ? -1 : 1;
            const dx = (pts[i + 1] ? pts[i + 1].x - p.x : p.x - pts[i - 1].x);
            const dy = (pts[i + 1] ? pts[i + 1].y - p.y : p.y - pts[i - 1].y);
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / d;
            const ny = dx / d;
            ctx.lineTo(p.x - nx * r, p.y - ny * r);
        }

        ctx.closePath();
        ctx.fill();
    }

    /**
     * Apply style (pattern/color) to context
     */
    applyStyle(ctx, obj) {
        if (obj.pattern === 'solid') {
            ctx.fillStyle = obj.color || '#000';
        } else if (obj.pattern === 'custom' && obj.customImage && (obj.customImage instanceof HTMLImageElement || obj.customImage instanceof HTMLCanvasElement)) {
            try {
                const pattern = ctx.createPattern(obj.customImage, 'repeat');
                ctx.fillStyle = pattern;
            } catch (e) {
                ctx.fillStyle = obj.color || '#000';
            }
        } else if (obj.pattern === 'mask' && obj.customMask && (obj.customMask instanceof HTMLCanvasElement || obj.customMask instanceof HTMLImageElement)) {
            try {
                const pattern = ctx.createPattern(obj.customMask, 'repeat');
                ctx.fillStyle = pattern;
            } catch (e) {
                ctx.fillStyle = obj.color || '#000';
            }
        } else {
            // Built-in patterns
            const patternInstance = this.getBuiltInPattern(obj.pattern, obj.color);
            if (patternInstance) {
                ctx.fillStyle = patternInstance;
            } else {
                ctx.fillStyle = obj.color || '#000';
            }
        }
    }

    /**
     * Generate or retrieve built-in patterns
     */
    getBuiltInPattern(type, color) {
        const key = type + '_' + color;
        if (this.patterns[key]) return this.patterns[key];

        const pCanvas = document.createElement('canvas');
        const pCtx = pCanvas.getContext('2d');
        pCanvas.width = 20;
        pCanvas.height = 20;

        // Base color
        pCtx.fillStyle = color;
        pCtx.fillRect(0, 0, 20, 20);

        pCtx.strokeStyle = 'rgba(0,0,0,0.15)';
        pCtx.lineWidth = 2;

        if (type === 'dots') {
            pCtx.fillStyle = 'rgba(0,0,0,0.15)';
            pCtx.beginPath();
            pCtx.arc(10, 10, 3, 0, Math.PI * 2);
            pCtx.fill();
        } else if (type === 'grid') {
            pCtx.strokeRect(0, 0, 20, 20);
        } else if (type === 'stripes') {
            pCtx.beginPath();
            pCtx.moveTo(0, 0);
            pCtx.lineTo(20, 20);
            pCtx.stroke();
        }

        const pattern = document.createElement('canvas').getContext('2d').createPattern(pCanvas, 'repeat');
        this.patterns[key] = pattern;
        return pattern;
    }

    /**
     * Hit detection for tape objects
     */
    isPointInside(obj, point) {
        // Simple bounding box check first
        if (obj.mode === 'rectangle') {
            return point.x >= obj.x && point.x <= obj.x + obj.width &&
                point.y >= obj.y && point.y <= obj.y + obj.height;
        }

        if (obj.mode === 'line') {
            // Distance to segment
            const p1 = obj.points[0];
            const p2 = obj.points[1];
            const dist = Utils.distToSegment(point, p1, p2);
            return dist <= obj.thickness / 2;
        }

        if (obj.mode === 'freehand') {
            // Check each segment
            for (let i = 0; i < obj.points.length - 1; i++) {
                const p1 = obj.points[i];
                const p2 = obj.points[i + 1];
                if (Utils.distToSegment(point, p1, p2) <= obj.thickness / 2) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Toggle tape visibility
     */
    toggleVisibility(obj) {
        obj.isHidden = !obj.isHidden;
        obj.opacity = obj.isHidden ? 0 : (obj.originalOpacity || 1.0);
        if (this.renderCallback) this.renderCallback();
    }

    drawPreview(ctx, obj) {
        this.draw(ctx, obj);
    }

}
