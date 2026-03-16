class FountainPenTool {
    constructor(onRepaint) {
        this.isDrawing = false;
        this.currentPath = null;
        this.points = [];
        this.lastPoint = null;
        this.onRepaint = onRepaint;
        this.lastPressure = 0.5;
        this.nibAngle = Math.PI / 4; // 45 degrees
        this.minWidthRatio = 0.2;
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.points = [];
        this.lastPoint = null;
        this.lastPressure = (state.pressureEnabled !== false) ? Utils.normalizePressure(pos.pressure) : 0.5;

        const point = { x: pos.x, y: pos.y, pressure: this.lastPressure, time: Date.now() };
        this.points.push(point);
        this.lastPoint = point;

        this.currentPath = {
            type: 'fountain-pen',
            points: [...this.points],
            color: state.strokeColor,
            width: state.strokeWidth,
            opacity: state.opacity,
            nibAngle: this.nibAngle,
            minWidthRatio: this.minWidthRatio
        };
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return;

        const pressure = (state.pressureEnabled !== false) ? Utils.normalizePressure(pos.pressure) : 0.5;
        this.lastPressure = this.lastPressure + (pressure - this.lastPressure) * 0.25;

        const point = {
            x: pos.x,
            y: pos.y,
            pressure: this.lastPressure,
            time: Date.now()
        };

        const zoom = ctx.getTransform().a || 1.0;
        const dist = Utils.distance(this.lastPoint || point, point);

        if (this.lastPoint) {
            const decimationFactor = state.decimation !== undefined ? state.decimation : 0.05;
            const minMoveThreshold = Math.max(0.2, (state.strokeWidth * decimationFactor) / zoom);
            if (dist < minMoveThreshold) return false;
        }

        this.points.push(point);
        this.lastPoint = point;

        // Better stabilization
        if (this.points.length > 3) {
            let pts = [...this.points];
            pts = Utils.chaikin(pts, 1);
            this.currentPath.points = Utils.smoothPressure(pts);
        } else {
            this.currentPath.points = [...this.points];
        }

        return true;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;
        this.isDrawing = false;

        if (this.points.length > 3) {
            let pts = [...this.points];
            pts = Utils.chaikin(pts, 2);
            this.currentPath.points = Utils.smoothPressure(pts);
        }

        const completedPath = this.currentPath;
        this.currentPath = null;
        this.points = [];
        this.lastPoint = null;
        return completedPath;
    }

    draw(ctx, object) {
        if (!object.points || object.points.length < 1) return;

        // WebGPU Path
        const gpu = window.webGPURenderer;
        if (gpu && gpu.isSupported && object.points.length >= 20) {
            const tx = ctx.getTransform();
            const zoom = tx.a || 1;
            const pan = { x: tx.e, y: tx.f };
            const canvas = ctx.canvas;
            const viewW = canvas.clientWidth || canvas.width;
            const viewH = canvas.clientHeight || canvas.height;
            if (gpu.drawFountainPen(ctx, object, zoom, viewW, viewH, pan)) return;
        }

        // Canvas2D Fallback - Envelope drawing for smoothness
        ctx.save();
        ctx.globalAlpha = object.opacity !== undefined ? object.opacity : 1.0;
        ctx.fillStyle = object.color;
        ctx.strokeStyle = object.color;

        const pts = object.points;
        const len = pts.length;
        if (len < 1) { ctx.restore(); return; }

        const nibAngle = object.nibAngle || Math.PI / 4;
        const minRatio = object.minWidthRatio || 0.2;
        const baseWidth = object.width || 5;

        // Single points (dots)
        if (len === 1) {
            const w = baseWidth * (pts[0].pressure || 0.5) * 2;
            const nx = -Math.sin(nibAngle) * (w / 2);
            const ny = Math.cos(nibAngle) * (w / 2);
            ctx.beginPath();
            ctx.moveTo(pts[0].x - nx, pts[0].y - ny);
            ctx.lineTo(pts[0].x + nx, pts[0].y + ny);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Build the envelope points
        const leftPoints = [];
        const rightPoints = [];

        // Calculation of width should ideally be smoothed across segments
        const look = 3; 

        for (let i = 0; i < len; i++) {
            const p = pts[i];
            
            // Smoothed direction at this point
            let dx = 0, dy = 0;
            const s = Math.max(0, i - look), e = Math.min(len - 1, i + look);
            for (let j = s; j < e; j++) {
                dx += (pts[j+1].x - pts[j].x);
                dy += (pts[j+1].y - pts[j].y);
            }
            if (dx === 0 && dy === 0) {
                if (i < len - 1) { dx = pts[i+1].x - p.x; dy = pts[i+1].y - p.y; }
                else if (i > 0) { dx = p.x - pts[i-1].x; dy = p.y - pts[i-1].y; }
            }
            
            const angle = Math.atan2(dy, dx);
            const diff = Math.abs(Math.sin(angle - nibAngle));
            const w = baseWidth * (minRatio + (1 - minRatio) * diff) * (p.pressure || 0.5) * 2;
            
            const nx = -Math.sin(nibAngle) * (w / 2);
            const ny = Math.cos(nibAngle) * (w / 2);
            
            leftPoints.push({ x: p.x - nx, y: p.y - ny });
            rightPoints.push({ x: p.x + nx, y: p.y + ny });
        }

        // Draw the envelope as a single path
        ctx.beginPath();
        ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 1; i < len; i++) {
            ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
        }
        // Caps/Connectors
        for (let i = len - 1; i >= 0; i--) {
            ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Anti-aliasing / gap sealer
        if (object.opacity > 0.9) {
            ctx.lineWidth = 0.5;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        ctx.restore();
    }

    drawPreview(ctx, object) {
        this.draw(ctx, object);
    }
}
