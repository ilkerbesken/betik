class HighlighterTool {
    constructor(onRepaint) {
        this.isDrawing = false;
        this.currentPath = null;
        this.points = [];
        this.rawPoints = [];
        this.lastPoint = null;
        this.minDistance = 0.5;
        this.onRepaint = onRepaint;
        this.straightenTimer = null;
        this.isStraightLocked = false;
        this.streamlinePoints = [];
        this.lastStreamlined = null;
        this.lastPressure = 0.5;
        this.currentColor = '#E4FF30'; // Default color for highlighter
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.isStraightLocked = false;
        this.points = [];
        this.rawPoints = [];
        this.streamlinePoints = [];
        this.lastStreamlined = null;
        this.lastPoint = null;
        // Highlighter typically doesn't use pressure for width but uses it for opacity/smoothing if enabled.
        // But the user rule suggests it shouldn't be affected by pressure for width.
        this.lastPressure = 0.5;

        clearTimeout(this.straightenTimer);

        const point = { x: pos.x, y: pos.y, pressure: this.lastPressure, time: Date.now() };
        this.rawPoints.push(point);
        this.points.push(point);
        this.lastPoint = point;
        this.lastStreamlined = point;
        this.streamlinePoints = [point];

        this.currentPath = {
            type: 'highlighter',
            points: [...this.points],
            color: state.strokeColor,
            width: state.strokeWidth,
            opacity: state.opacity,
            lineStyle: state.lineStyle || 'solid',
            cap: state.highlighterCap || 'butt',
            isHighlighter: true,
            filled: state.fillEnabled,
            fillColor: state.strokeColor
        };
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return;

        const point = {
            x: pos.x,
            y: pos.y,
            pressure: 0.5,
            time: Date.now()
        };

        const zoom = ctx.getTransform().a || 1.0;

        if (this.isStraightLocked) {
            this.points[this.points.length - 1] = point;
            this.currentPath.points = [this.points[0], point];
            this.lastPoint = point;
            return true;
        }

        const dist = Utils.distance(this.lastPoint || point, point);
        if (this.lastPoint) {
            if (dist > 80) return false;
            const decimationFactor = state.decimation !== undefined ? state.decimation : 0.10;
            const minMoveThreshold = Math.max(0.2, (state.strokeWidth * decimationFactor) / zoom);
            if (dist < minMoveThreshold) return false;
        }

        this.points.push(point);
        this.lastPoint = point;

        const userStab = state.stabilization !== undefined ? state.stabilization : 0.5;
        const zoomDampener = (Math.min(zoom, 5) - 1) * 0.1;
        const streamlineFactor = Math.max(0.0, (userStab * 0.98) - zoomDampener);

        const prev = this.lastStreamlined;
        const streamlined = {
            x: prev.x + (point.x - prev.x) * (1 - streamlineFactor),
            y: prev.y + (point.y - prev.y) * (1 - streamlineFactor),
            pressure: 0.5
        };
        this.lastStreamlined = streamlined;
        this.streamlinePoints.push(streamlined);

        if (this.streamlinePoints.length > 5) {
            let pts = [...this.streamlinePoints];
            const head = pts.slice(0, 2);
            const tail = pts.slice(-2);
            const mid = pts.slice(2, -2);
            pts = [...head, ...mid, ...tail];
            pts = Utils.chaikin(pts, 1);
            this.currentPath.points = pts;
        } else {
            this.currentPath.points = this.streamlinePoints;
        }

        clearTimeout(this.straightenTimer);
        this.straightenTimer = setTimeout(() => {
            if (this.isDrawing && this.points.length > 20) this.straightenPath();
        }, 500);

        return true;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;
        this.isDrawing = false;
        clearTimeout(this.straightenTimer);

        if (!this.currentPath.isStraightened) {
            let pts = [...this.streamlinePoints];
            if (this.lastPoint && pts.length > 0) {
                const endPos = this.lastPoint;
                pts.push({
                    x: pts[pts.length - 1].x + (endPos.x - pts[pts.length - 1].x) * 0.8,
                    y: pts[pts.length - 1].y + (endPos.y - pts[pts.length - 1].y) * 0.8,
                    pressure: endPos.pressure
                });
            }
            if (pts.length > 3) pts = Utils.chaikin(pts, 1);
            this.currentPath.points = pts;
        }

        const completedPath = this.currentPath;
        this.currentPath = null;
        this.points = [];
        this.lastPoint = null;
        return completedPath;
    }

    straightenPath() {
        if (this.points.length < 2) return;
        this.currentPath.originalPoints = [...this.points];
        this.currentPath.points = [this.points[0], this.points[this.points.length - 1]];
        this.currentPath.isStraightened = true;
        this.isStraightLocked = true;
        if (this.onRepaint) this.onRepaint();
    }

    draw(ctx, object) {
        if (!object.points || object.points.length < 1) return;

        ctx.save();
        ctx.globalAlpha = object.opacity !== undefined ? object.opacity : 1.0;
        this.drawSolid(ctx, object);
        ctx.restore();
    }

    drawSolid(ctx, object) {
        let pts = object.points;
        const len = pts.length;
        if (len < 1) return;

        let color = object.color;
        if (color === 'rainbow') {
            color = Utils.getRainbowGradient(ctx, pts);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = object.width;
        ctx.lineCap = object.cap || 'butt'; 
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < len; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
    }

    drawPreview(ctx, object) { this.draw(ctx, object); }
}
