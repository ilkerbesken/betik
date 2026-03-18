class PenTool {
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
        this.currentColor = '#000000';
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.isStraightLocked = false;
        this.points = [];
        this.rawPoints = [];
        this.streamlinePoints = [];
        this.lastStreamlined = null;
        this.lastPoint = null;
        this.lastPressure = (state.pressureEnabled !== false)
            ? Utils.normalizePressure(pos.pressure)
            : 0.5;

        clearTimeout(this.straightenTimer);

        const point = { x: pos.x, y: pos.y, pressure: this.lastPressure, time: Date.now() };
        this.rawPoints.push(point);
        this.points.push(point);
        this.lastPoint = point;
        this.lastStreamlined = point;
        this.streamlinePoints = [point];

        this.currentPath = {
            type: 'pen',
            points: [...this.points],
            color: state.strokeColor,
            width: state.strokeWidth,
            opacity: state.opacity,
            lineStyle: state.lineStyle || 'solid',
            cap: 'round',
            isHighlighter: false,
            filled: state.fillEnabled,
            fillColor: state.strokeColor
        };
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return;

        const point = {
            x: pos.x,
            y: pos.y,
            pressure: (state.pressureEnabled !== false)
                ? Utils.normalizePressure(pos.pressure)
                : 0.5,
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
            // Safety break for unexpected jumps
            if (dist > 80) return false;

            // ADAPTIVE DECIMATION
            const decimationFactor = state.decimation !== undefined ? state.decimation : 0.10;
            const minMoveThreshold = Math.max(0.2, (state.strokeWidth * decimationFactor) / zoom);
            if (dist < minMoveThreshold) return false;
        }

        // RAW JITTER FILTER
        if (this.points.length > 2) {
            const pPre = this.points[this.points.length - 1];
            const pPre2 = this.points[this.points.length - 2];
            const v1 = { x: pPre.x - pPre2.x, y: pPre.y - pPre2.y };
            const v2 = { x: point.x - pPre.x, y: point.y - pPre.y };
            const dist1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y), dist2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
            const dot = (v1.x * v2.x + v1.y * v2.y) / (dist1 * dist2 || 1);
            if (dot < -0.8 && dist < state.strokeWidth * 0.5) return false;
        }

        // Pressure smoothing
        this.lastPressure = this.lastPressure + (point.pressure - this.lastPressure) * 0.25;
        point.pressure = this.lastPressure;

        this.points.push(point);
        this.lastPoint = point;

        // ZOOM-RESPONSIVE USER STABILIZATION
        const userStab = state.stabilization !== undefined ? state.stabilization : 0.5;
        const zoomDampener = (Math.min(zoom, 5) - 1) * 0.1;
        const streamlineFactor = Math.max(0.0, (userStab * 0.98) - zoomDampener);


        const prev = this.lastStreamlined;
        const streamlined = {
            x: prev.x + (point.x - prev.x) * (1 - streamlineFactor),
            y: prev.y + (point.y - prev.y) * (1 - streamlineFactor),
            pressure: prev.pressure + (point.pressure - prev.pressure) * (1 - streamlineFactor)
        };
        this.lastStreamlined = streamlined;
        this.streamlinePoints.push(streamlined);

        if (this.streamlinePoints.length > 5) {
            let pts = [...this.streamlinePoints];
            const precision = 0.4 / zoom;
            if (pts.length > 10) {
                const head = pts.slice(0, 2);
                let lastKept = head[head.length - 1];
                const mid = pts.slice(2, -2).filter((p) => {
                    if (Utils.distance(p, lastKept) > precision) {
                        lastKept = p;
                        return true;
                    }
                    return false;
                });
                const tail = pts.slice(-2);
                pts = [...head, ...mid, ...tail];
            }
            pts = Utils.chaikin(pts, 1);
            this.currentPath.points = Utils.smoothPressure(pts);
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
            this.currentPath.points = Utils.smoothPressure(pts);
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

        const style = object.lineStyle || 'solid';
        const gpu = window.webGPURenderer;
        if (
            style === 'solid'
            && object.points.length >= 20
            && gpu && gpu.isSupported
        ) {
            const tx = ctx.getTransform();
            const zoom = tx.a || 1;
            const pan  = { x: tx.e || 0, y: tx.f || 0 };
            const canvas  = ctx.canvas;
            const viewW   = canvas.clientWidth  || canvas.width;
            const viewH   = canvas.clientHeight || canvas.height;
            if (gpu.drawStroke(ctx, object, zoom, viewW, viewH, pan)) return;
        }
        ctx.save();
        ctx.globalAlpha = object.opacity !== undefined ? object.opacity : 1.0;
        if (style === 'solid') this.drawSolid(ctx, object);
        else if (style === 'wavy') this.drawWavy(ctx, object);
        else this.drawDashed(ctx, object);
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

        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        if (len === 1) {
            const r = Utils.getPressureWidth(object.width, pts[0].pressure || 0.5) / 2;
            ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2); ctx.fill();
            return;
        }

        const envelope = [];
        let lastNx = 0, lastNy = 0;

        // ADAPTIVE SMOOTHING WINDOW
        const look = Math.max(10, Math.floor(object.width * 0.8));

        for (let i = 0; i < len; i++) {
            const p = pts[i];
            let dx = 0, dy = 0;
            const start = Math.max(0, i - look), end = Math.min(len - 1, i + look);
            for (let j = start; j < end; j++) {
                dx += (pts[j + 1].x - pts[j].x); dy += (pts[j + 1].y - pts[j].y);
            }
            if (dx === 0 && dy === 0) {
                if (i < len - 1) { dx = pts[i + 1].x - p.x; dy = pts[i + 1].y - p.y; }
                else if (i > 0) { dx = p.x - pts[i - 1].x; dy = p.y - pts[i - 1].y; }
            }
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let nx = -dy / dist, ny = dx / dist;

            // WIDTH-ADAPTIVE NORMAL BLENDING
            if (i > 0) {
                const dot = nx * lastNx + ny * lastNy;
                const blendThreshold = object.width > 8 ? 0.995 : 0.98;
                if (dot < blendThreshold) {
                    const lerpFactor = object.width > 12 ? 0.2 : 0.5;
                    nx = lastNx + (nx - lastNx) * lerpFactor;
                    ny = lastNy + (ny - lastNy) * lerpFactor;
                    const d2 = Math.sqrt(nx * nx + ny * ny) || 1; nx /= d2; ny /= d2;
                }
            }
            lastNx = nx; lastNy = ny;
            const r = Utils.getPressureWidth(object.width, p.pressure || 0.5) / 2;
            envelope.push({ x: p.x, y: p.y, r, nx, ny, angle: Math.atan2(dy, dx) });
        }

        ctx.beginPath();
        const s = envelope[0];
        // Start Cap
        for (let a = 0; a <= 180; a += 5) {
            const rad = (s.angle + Math.PI / 2) + (a * Math.PI / 180);
            ctx.lineTo(s.x + Math.cos(rad) * s.r, s.y + Math.sin(rad) * s.r);
        }
        // Left Side
        for (let i = 1; i < len - 1; i++) {
            ctx.lineTo(envelope[i].x - envelope[i].nx * envelope[i].r, envelope[i].y - envelope[i].ny * envelope[i].r);
        }
        // End Cap
        const endE = envelope[len - 1];
        if (endE) {
            for (let a = 0; a <= 180; a += 5) {
                const rad = (endE.angle - Math.PI / 2) + (a * Math.PI / 180);
                ctx.lineTo(endE.x + Math.cos(rad) * endE.r, endE.y + Math.sin(rad) * endE.r);
            }
        }
        // Right Side
        for (let i = len - 2; i >= 1; i--) {
            ctx.lineTo(envelope[i].x + envelope[i].nx * envelope[i].r, envelope[i].y + envelope[i].ny * envelope[i].r);
        }
        ctx.closePath();
        ctx.fill();

        // Sub-pixel seam sealer
        if (object.opacity > 0.95) {
            ctx.lineWidth = 0.3; ctx.lineJoin = 'round'; ctx.stroke();
        }
    }


    drawDashed(ctx, object) {
        const pts = this.flattenPath(object);
        const w = object.width;
        let color = object.color;
        if (color === 'rainbow') color = Utils.getRainbowGradient(ctx, pts);

        let pattern = [w * 3, w * 3];
        if (object.lineStyle === 'dotted') pattern = [w * 0.1, w * 4];
        else if (object.lineStyle === 'dash-dot') pattern = [w * 4, w * 2, w * 0.1, w * 2];

        ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = object.cap || 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        let dist = 0, pIdx = 0, isDash = true;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i], p2 = pts[i + 1], seg = Utils.distance(p1, p2);
            let rem = seg;
            while (rem > 0) {
                const target = pattern[pIdx] - dist;
                if (rem < target) { if (isDash) ctx.lineTo(p2.x, p2.y); else ctx.moveTo(p2.x, p2.y); dist += rem; rem = 0; }
                else {
                    const ratio = target / rem;
                    const x = p1.x + (p2.x - p1.x) * ratio, y = p1.y + (p2.y - p1.y) * ratio;
                    if (isDash) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                    rem -= target; dist = 0; pIdx = (pIdx + 1) % pattern.length; isDash = (pIdx % 2 === 0);
                }
            }
        }
        ctx.stroke();
    }

    flattenPath(object) {
        if (object.points.length < 2) return object.points;
        let res = [object.points[0]];
        for (let i = 0; i < object.points.length - 1; i++) {
            const p1 = object.points[i], p2 = object.points[i + 1];
            const d = Utils.distance(p1, p2);
            const steps = Math.max(1, Math.ceil(d / 2));
            for (let s = 1; s <= steps; s++) {
                const t = s / steps;
                res.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
            }
        }
        return res;
    }

    drawWavy(ctx, object) {
        const pts = this.flattenPath(object);
        let color = object.color;
        if (color === 'rainbow') color = Utils.getRainbowGradient(ctx, pts);

        const amp = object.width * 1.2, freq = (Math.PI * 2) / (15 + object.width * 2);
        ctx.lineWidth = object.width; ctx.strokeStyle = color; ctx.lineCap = object.cap || 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i], p2 = pts[i + 1], dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.1) continue;
            const nx = -dy / len, ny = dx / len;
            for (let t = 0; t <= 1; t += 0.2) {
                const offset = Math.sin((total + len * t) * freq) * amp;
                const x = p1.x + dx * t + nx * offset, y = p1.y + dy * t + ny * offset;
                if (i === 0 && t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            total += len;
        }
        ctx.stroke();
    }

    drawPreview(ctx, object) { this.draw(ctx, object); }
}
