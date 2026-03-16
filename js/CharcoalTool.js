class CharcoalTool {
    constructor(onRepaint) {
        this.isDrawing = false;
        this.currentPath = null;
        this.points = [];
        this.lastPoint = null;
        this.onRepaint = onRepaint;
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.points = [];
        this.lastPoint = null;

        const pressure = (state.pressureEnabled !== false) ? Utils.normalizePressure(pos.pressure) : 0.5;
        const point = { x: pos.x, y: pos.y, pressure: pressure };
        this.points.push(point);
        this.lastPoint = point;

        this.currentPath = {
            type: 'charcoal',
            points: [...this.points],
            color: state.strokeColor,
            width: state.strokeWidth * 1.5,
            opacity: state.opacity * 0.9
        };
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return;

        const pressure = (state.pressureEnabled !== false) ? Utils.normalizePressure(pos.pressure) : 0.5;
        const point = { x: pos.x, y: pos.y, pressure: pressure };

        const dist = Utils.distance(this.lastPoint || point, point);
        if (dist < 1) return false;

        this.points.push(point);
        this.lastPoint = point;

        if (this.points.length > 3) {
            this.currentPath.points = Utils.chaikin(this.points, 1);
        } else {
            this.currentPath.points = [...this.points];
        }

        return true;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;
        this.isDrawing = false;

        if (this.points.length > 3) {
            this.currentPath.points = Utils.chaikin(this.points, 1);
        }

        const completedPath = this.currentPath;
        this.currentPath = null;
        this.points = [];
        this.lastPoint = null;
        return completedPath;
    }

    draw(ctx, object, zoom = 1, viewWidth = 0, viewHeight = 0, pan = {x:0, y:0}) {
        const pts = object.points;
        const len = pts.length;
        if (len < 1) return;

        // Try WebGPU for high performance
        if (window.webGPURenderer && window.webGPURenderer.isSupported && viewWidth > 0) {
            const success = window.webGPURenderer.drawCharcoal(ctx, object, zoom, viewWidth, viewHeight, pan);
            if (success) return;
        }

        // Fallback to Canvas2D
        ctx.save();
        ctx.fillStyle = object.color === 'rainbow' ? '#262626' : object.color;
        const baseOpacity = object.opacity || 0.9;
        const baseWidth = object.width || 5;

        let seed = 12345;
        const seededRandom = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };

        for (let i = 0; i < len - 1; i++) {
            const p1 = pts[i], p2 = pts[i + 1];
            const dist = Utils.distance(p1, p2);
            const steps = Math.max(1, Math.ceil(dist / 2));

            for (let s = 0; s < steps; s++) {
                const t = s / steps;
                const x = p1.x + (p2.x - p1.x) * t, y = p1.y + (p2.y - p1.y) * t;
                const p = (p1.pressure || 0.5) + ((p2.pressure || 0.5) - (p1.pressure || 0.5)) * t;
                const r = (baseWidth / 2) * (0.5 + p * 1.2);

                const dabCount = Math.ceil(r / 2) + 1;
                for (let d = 0; d < dabCount; d++) {
                    const jitterX = (seededRandom() - 0.5) * r * 1.2;
                    const jitterY = (seededRandom() - 0.5) * r * 1.2;
                    const dabR = seededRandom() * 0.8 + 0.2;
                    const dabAlpha = seededRandom() * 0.3 + 0.1;

                    ctx.globalAlpha = baseOpacity * dabAlpha * p;
                    ctx.beginPath();
                    ctx.arc(x + jitterX, y + jitterY, dabR, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();
    }

    drawPreview(ctx, object) {
        this.draw(ctx, object);
    }
}
