class FountainPenTool {
    constructor(onRepaint) {
        this.isDrawing = false;
        this.currentPath = null;
        this.points = [];
        this.lastPoint = null;
        this.onRepaint = onRepaint;
        this.currentColor = '#000000';
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
            nibAngle: state.nibAngle !== undefined ? state.nibAngle : this.nibAngle,
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
        if (!object.points || object.points.length < 2) return;

        // Canvas2D "Continuous Envelope" Approach - Fixes jagged edges
        ctx.save();
        ctx.globalAlpha = object.opacity !== undefined ? object.opacity : 1.0;
        ctx.fillStyle = object.color;
        
        const pts = object.points;
        const len = pts.length;
        const nibAngle = object.nibAngle || Math.PI / 4;
        const baseWidth = object.width || 5;
        const minRatio = object.minWidthRatio || 0.2;

        const leftPoints = [];
        const rightPoints = [];

        // 1. Calculate Envelope Points
        for (let i = 0; i < len; i++) {
            const p = pts[i];
            const prev = pts[Math.max(0, i - 1)];
            const next = pts[Math.min(len - 1, i + 1)];
            
            // Movement angle (average of segment before and after)
            const moveAngle = Math.atan2(next.y - prev.y, next.x - prev.x);
            const diff = Math.abs(Math.sin(moveAngle - nibAngle));
            const currentBaseWidth = baseWidth * (minRatio + (1 - minRatio) * diff);
            const w = currentBaseWidth * (p.pressure || 0.5) * 1.5; // Slightly scaled for natural feel
            
            // Nib vector at fixed angle
            const dx = (w / 2) * Math.cos(nibAngle);
            const dy = (w / 2) * Math.sin(nibAngle);
            
            leftPoints.push({ x: p.x - dx, y: p.y - dy });
            rightPoints.push({ x: p.x + dx, y: p.y + dy });
        }

        // 2. Draw all segments in a single path with consistent winding to avoid gaps and seams
        ctx.beginPath();
        for (let i = 0; i < len - 1; i++) {
            const li = leftPoints[i];
            const ri = rightPoints[i];
            const li1 = leftPoints[i + 1];
            const ri1 = rightPoints[i + 1];

            // Determine winding direction to ensure all quads have the same sign (CW or CCW)
            // This prevents "winding cancellation" (white gaps) when quads overlap at sharp turns.
            const cp = (ri.x - li.x) * (li1.y - li.y) - (ri.y - li.y) * (li1.x - li.x);

            if (cp > 0) {
                ctx.moveTo(li.x, li.y);
                ctx.lineTo(ri.x, ri.y);
                ctx.lineTo(ri1.x, ri1.y);
                ctx.lineTo(li1.x, li1.y);
            } else {
                ctx.moveTo(li.x, li.y);
                ctx.lineTo(li1.x, li1.y);
                ctx.lineTo(ri1.x, ri1.y);
                ctx.lineTo(ri.x, ri.y);
            }
            ctx.closePath();
        }
        ctx.fill();
        ctx.restore();
    }

    /**
     * Draws the nib "stamp" at a specific point.
     * Uses a rotated rectangle to emulate a flat calligraphy nib.
     */
    drawNib(ctx, x, y, width, angle) {
        const hh = 0.5; // Thickness of the nib itself (keep small for sharpness)
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        // Using fillRect for high performance stamp
        ctx.fillRect(-width / 2, -hh, width, hh * 2);
        ctx.restore();
    }



    drawPreview(ctx, object) {
        this.draw(ctx, object);
    }
}
