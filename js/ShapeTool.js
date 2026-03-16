/**
 * Advanced Shape Tool Module
 * Supports Rectangle, Ellipse, Triangle, Trapezoid, and Star.
 * Uses center-based or bounding-box-based coordinates and includes rotation.
 */
class ShapeTool {
    constructor(renderCallback) {
        this.isDrawing = false;
        this.startPoint = null;
        this.currentShape = null;
        this.renderCallback = renderCallback;

        // Shape-specific default configurations
        this.config = {
            star: { spikes: 5, inset: 0.5 },
            trapezoid: { topWidthPercent: 0.6 },
            parallelogram: { shiftPercent: 0.2 },
            oval: { borderRadius: 20 },
            triangle: { type: 'isosceles' }
        };
    }

    /**
     * Initializes a new shape on pointer down.
     */
    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.startPoint = { x: pos.x, y: pos.y };

        // Determine subtype from application state (defaulting to rect)
        const subtype = state.currentShapeType || 'rectangle';

        const isFilled = state.fillEnabled || false;

        this.currentShape = {
            type: subtype,
            x: pos.x,
            y: pos.y,
            width: 0,
            height: 0,
            rotation: 0,
            color: state.strokeColor || '#000000',
            strokeWidth: state.strokeWidth || 2,
            filled: isFilled,
            fillColor: isFilled ? (state.strokeColor || '#000000') : 'transparent',
            lineStyle: state.lineStyle || 'solid',
            opacity: state.opacity !== undefined ? state.opacity : 1,
            isAdvancedShape: true, // Marker for shared logic
            id: Date.now() + Math.random() // Unique ID for object-based tracking/deletion
        };

        return true;
    }

    /**
     * Updates shape bounds during mouse move.
     */
    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing || !this.currentShape) return false;

        const currentPoint = { x: pos.x, y: pos.y };

        // Calculate bounding box from start and current points
        const minX = Math.min(this.startPoint.x, currentPoint.x);
        const minY = Math.min(this.startPoint.y, currentPoint.y);
        const maxX = Math.max(this.startPoint.x, currentPoint.x);
        const maxY = Math.max(this.startPoint.y, currentPoint.y);

        this.currentShape.x = minX;
        this.currentShape.y = minY;
        this.currentShape.width = maxX - minX;
        this.currentShape.height = maxY - minY;

        // Proportional constraint if Shift is pressed (Square/Circle/Equilateral)
        if (e.shiftKey) {
            const size = Math.max(this.currentShape.width, this.currentShape.height);
            this.currentShape.width = size;
            this.currentShape.height = size;
            // Adjust x/y based on direction
            if (currentPoint.x < this.startPoint.x) this.currentShape.x = this.startPoint.x - size;
            if (currentPoint.y < this.startPoint.y) this.currentShape.y = this.startPoint.y - size;
        }

        return true;
    }

    /**
     * Finalizes the shape path.
     */
    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;

        this.isDrawing = false;

        // Don't add if too small
        if (this.currentShape.width < 1 && this.currentShape.height < 1) {
            this.currentShape = null;
            return null;
        }

        const completedShape = this.currentShape;
        this.currentShape = null;
        this.startPoint = null;

        return completedShape;
    }

    /**
     * Primary render entry point.
     */
    draw(ctx, obj) {
        ctx.save();

        // Apply global properties
        ctx.globalAlpha = obj.opacity !== undefined ? obj.opacity : 1.0;

        // Apply blend mode for PDF highlights
        if (obj.blendMode) {
            ctx.globalCompositeOperation = obj.blendMode;
        }

        // Rainbow support
        let color = obj.color || '#000000';
        let fillColor = obj.fillColor || 'transparent';

        if (color === 'rainbow') {
            color = Utils.getRainbowGradientForRect(ctx, obj.x, obj.y, obj.width, obj.height);
        }

        if (fillColor === 'rainbow') {
            fillColor = Utils.getRainbowGradientForRect(ctx, obj.x, obj.y, obj.width, obj.height);
        }

        ctx.strokeStyle = color;
        ctx.fillStyle = fillColor;
        ctx.lineWidth = obj.strokeWidth || 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Apply line style patterns
        if (ctx.setLineDash) {
            switch (obj.lineStyle) {
                case 'dashed':
                    ctx.setLineDash([obj.strokeWidth * 3, obj.strokeWidth * 3]);
                    break;
                case 'dotted':
                    ctx.setLineDash([obj.strokeWidth * 0.1, obj.strokeWidth * 3]);
                    break;
                case 'dash-dot':
                    ctx.setLineDash([obj.strokeWidth * 4, obj.strokeWidth * 3, obj.strokeWidth * 0.1, obj.strokeWidth * 3]);
                    break;
                default:
                    ctx.setLineDash([]);
            }
        }

        // Apply Rotation Transformation (around center)
        const centerX = obj.x + obj.width / 2;
        const centerY = obj.y + obj.height / 2;

        ctx.translate(centerX, centerY);
        ctx.rotate(obj.rotation || 0);
        ctx.scale(obj.scaleX || 1, obj.scaleY || 1);
        ctx.translate(-centerX, -centerY);

        // Sub-draw based on type
        ctx.beginPath();
        switch (obj.type) {
            case 'rectangle':
            case 'rect':
                ctx.rect(obj.x, obj.y, obj.width, obj.height);
                break;
            case 'ellipse':
                ctx.ellipse(centerX, centerY, obj.width / 2, obj.height / 2, 0, 0, Math.PI * 2);
                break;
            case 'triangle':
                this.drawTrianglePath(ctx, obj);
                break;
            case 'trapezoid':
                this.drawTrapezoidPath(ctx, obj);
                break;
            case 'star':
                this.drawStarPath(ctx, obj);
                break;
            case 'diamond':
                this.drawDiamondPath(ctx, obj);
                break;
            case 'parallelogram':
                this.drawParallelogramPath(ctx, obj);
                break;
            case 'oval':
                this.drawOvalPath(ctx, obj);
                break;
            case 'heart':
                this.drawHeartPath(ctx, obj);
                break;
            case 'cloud':
                this.drawCloudPath(ctx, obj);
                break;
        }

        // Perform Fill and Stroke
        if (obj.filled && obj.fillColor && obj.fillColor !== 'transparent') {
            ctx.fill();
        }
        ctx.stroke();

        ctx.restore();
    }

    /**
     * High-level path logic for Triangle
     */
    drawTrianglePath(ctx, obj) {
        ctx.moveTo(obj.x + obj.width / 2, obj.y); // Top
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height); // Bottom Right
        ctx.lineTo(obj.x, obj.y + obj.height); // Bottom Left
        ctx.closePath();
    }

    /**
     * High-level path logic for Trapezoid
     */
    drawTrapezoidPath(ctx, obj) {
        const inset = obj.width * (1 - this.config.trapezoid.topWidthPercent) / 2;
        ctx.moveTo(obj.x + inset, obj.y); // Top Left
        ctx.lineTo(obj.x + obj.width - inset, obj.y); // Top Right
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height); // Bottom Right
        ctx.lineTo(obj.x, obj.y + obj.height); // Bottom Left
        ctx.closePath();
    }

    /**
     * High-level path logic for Diamond (Karo)
     */
    drawDiamondPath(ctx, obj) {
        ctx.moveTo(obj.x + obj.width / 2, obj.y); // Top
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height / 2); // Right
        ctx.lineTo(obj.x + obj.width / 2, obj.y + obj.height); // Bottom
        ctx.lineTo(obj.x, obj.y + obj.height / 2); // Left
        ctx.closePath();
    }

    /**
     * High-level path logic for Parallelogram
     */
    drawParallelogramPath(ctx, obj) {
        const shiftX = obj.width * this.config.parallelogram.shiftPercent;
        ctx.moveTo(obj.x + shiftX, obj.y); // Top Left
        ctx.lineTo(obj.x + obj.width, obj.y); // Top Right
        ctx.lineTo(obj.x + obj.width - shiftX, obj.y + obj.height); // Bottom Right
        ctx.lineTo(obj.x, obj.y + obj.height); // Bottom Left
        ctx.closePath();
    }

    /**
     * High-level path logic for Oval (Rounded Rect)
     */
    drawOvalPath(ctx, obj) {
        const r = Math.min(obj.borderRadius !== undefined ? obj.borderRadius : this.config.oval.borderRadius, obj.width / 2, obj.height / 2);
        const x = obj.x, y = obj.y, w = obj.width, h = obj.height;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /**
     * High-level path logic for Heart
     * Uses two symmetrical bezier curves for a "perfect" geometric look.
     */
    drawHeartPath(ctx, obj) {
        const x = obj.x, y = obj.y, w = obj.width, h = obj.height;
        const topCenter = { x: x + w / 2, y: y + h * 0.25 };
        const bottomCenter = { x: x + w / 2, y: y + h };

        ctx.moveTo(topCenter.x, topCenter.y);

        // Right Side
        ctx.bezierCurveTo(
            x + w * 0.95, y - h * 0.05, // Control 1: Top Right "Puff"
            x + w * 1.0, y + h * 0.5,   // Control 2: Lower Right "Puff"
            bottomCenter.x, bottomCenter.y
        );

        // Left Side
        ctx.bezierCurveTo(
            x + w * 0.0, y + h * 0.5,   // Control 1: Lower Left "Puff"
            x + w * 0.05, y - h * 0.05, // Control 2: Top Left "Puff"
            topCenter.x, topCenter.y
        );

        ctx.closePath();
    }

    /**
     * High-level path logic for Cloud
     * Procedural: Arc count varies based on perimeter size.
     */
    drawCloudPath(ctx, obj) {
        const params = this._getCloudParams(obj);
        if (!params) return;

        const { cx, cy, rw, rh, n, points } = params;

        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < n; i++) {
            const p2 = points[(i + 1) % n];

            // Calculate a control point that is pushed outwards to create the "bubble"
            const midT = ((i + 0.5) / n) * Math.PI * 2;
            const puffFactor = 1.25; // How much the arcs bulge out
            const cpX = cx + rw * Math.cos(midT) * puffFactor;
            const cpY = cy + rh * Math.sin(midT) * puffFactor;

            ctx.quadraticCurveTo(cpX, cpY, p2.x, p2.y);
        }
        ctx.closePath();
    }

    /**
     * Helper to calculate procedural cloud parameters.
     * @private
     */
    _getCloudParams(obj) {
        const w = obj.width, h = obj.height;
        if (w < 1 || h < 1) return null;

        const cx = obj.x + w / 2, cy = obj.y + h / 2;
        const rw = w / 2, rh = h / 2;

        // Approximate perimeter of ellipse
        const perimeter = Math.PI * (rw + rh);
        const targetArcLength = 30; // Target width for each bubble
        const n = Math.max(8, Math.round(perimeter / targetArcLength));

        const points = [];
        for (let i = 0; i < n; i++) {
            const t = (i / n) * Math.PI * 2;
            points.push({
                x: cx + rw * Math.cos(t),
                y: cy + rh * Math.sin(t)
            });
        }

        return { cx, cy, rw, rh, n, points };
    }

    /**
     * High-level path logic for Star
     */
    drawStarPath(ctx, obj) {
        const spikes = this.config.star.spikes;
        const outerRadius = Math.min(obj.width, obj.height) / 2;
        const innerRadius = outerRadius * this.config.star.inset;
        const cx = obj.x + obj.width / 2;
        const cy = obj.y + obj.height / 2;

        let rot = Math.PI / 2 * 3;
        let step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            let x = cx + Math.cos(rot) * outerRadius;
            let y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
    }

    /**
     * Hit detection: Point in Polygon algorithm (Winding Number / Ray Casting)
     * Used for complex shapes like Star and Trapezoid.
     */
    isPointInside(obj, point) {
        // 1. Transform point to local (unrotated) space
        const centerX = obj.x + obj.width / 2;
        const centerY = obj.y + obj.height / 2;

        const relX = point.x - centerX;
        const relY = point.y - centerY;

        const cos = Math.cos(-(obj.rotation || 0));
        const sin = Math.sin(-(obj.rotation || 0));

        const localX = relX * cos - relY * sin + centerX;
        const localY = relX * sin + relY * cos + centerY;

        // 2. Simple BBox check for early exit
        if (localX < obj.x || localX > obj.x + obj.width || localY < obj.y || localY > obj.y + obj.height) {
            return false;
        }

        // 3. Precise check based on type
        if (obj.type === 'rectangle' || obj.type === 'rect') return true;

        if (obj.type === 'ellipse' || obj.type === 'oval') {
            const rx = obj.width / 2;
            const ry = obj.height / 2;
            if (rx === 0 || ry === 0) return false;
            const dx = (localX - centerX) / rx;
            const dy = (localY - centerY) / ry;
            return (dx * dx + dy * dy) <= 1;
        }

        // For heart and cloud, we'll use a slightly simplified polygon or just the BBox for now, 
        // but for exact "isPointInside" with curves, BBox is often enough for betiks.
        // I'll provide vertices for polygons.

        // Polygon based shapes
        const vertices = this.getVertices(obj);
        return this.isPointInPolygon({ x: localX, y: localY }, vertices);
    }

    /**
     * Gets unrotated vertices for polygonal shapes.
     */
    getVertices(obj) {
        switch (obj.type) {
            case 'triangle':
                return [
                    { x: obj.x + obj.width / 2, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ];
            case 'trapezoid':
                const inset = obj.width * (1 - this.config.trapezoid.topWidthPercent) / 2;
                return [
                    { x: obj.x + inset, y: obj.y },
                    { x: obj.x + obj.width - inset, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ];
            case 'star':
                const spikes = this.config.star.spikes;
                const outerRadius = Math.min(obj.width, obj.height) / 2;
                const innerRadius = outerRadius * this.config.star.inset;
                const cx = obj.x + obj.width / 2;
                const cy = obj.y + obj.height / 2;
                const verts = [];
                let rot = Math.PI / 2 * 3;
                let step = Math.PI / spikes;
                for (let i = 0; i < spikes; i++) {
                    verts.push({ x: cx + Math.cos(rot) * outerRadius, y: cy + Math.sin(rot) * outerRadius });
                    rot += step;
                    verts.push({ x: cx + Math.cos(rot) * innerRadius, y: cy + Math.sin(rot) * innerRadius });
                    rot += step;
                }
                return verts;
            case 'diamond':
                return [
                    { x: obj.x + obj.width / 2, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height / 2 },
                    { x: obj.x + obj.width / 2, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height / 2 }
                ];
            case 'parallelogram':
                const pShift = obj.width * this.config.parallelogram.shiftPercent;
                return [
                    { x: obj.x + pShift, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y },
                    { x: obj.x + obj.width - pShift, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ];
            case 'heart':
                // Symmetrical vertices for heart hit detection
                return [
                    { x: obj.x + obj.width / 2, y: obj.y + obj.height * 0.25 },
                    { x: obj.x + obj.width * 0.85, y: obj.y + obj.height * 0.05 },
                    { x: obj.x + obj.width * 1.0, y: obj.y + obj.height * 0.4 },
                    { x: obj.x + obj.width / 2, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height * 0.4 },
                    { x: obj.x + obj.width * 0.15, y: obj.y + obj.height * 0.05 }
                ];
            case 'cloud':
                const cloudParams = this._getCloudParams(obj);
                if (cloudParams) {
                    const verts = [];
                    const { cx, cy, rw, rh, n } = cloudParams;
                    // For the cloud, we return points on the "outer" arc boundary for best hit detection
                    for (let i = 0; i < n; i++) {
                        const t = ((i + 0.5) / n) * Math.PI * 2;
                        const puff = 1.25;
                        verts.push({
                            x: cx + rw * Math.cos(t) * puff,
                            y: cy + rh * Math.sin(t) * puff
                        });
                    }
                    return verts;
                }
                // Fallback
                return [
                    { x: obj.x, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ];
            default:
                return [
                    { x: obj.x, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ];
        }
    }

    /**
     * Point in Polygon Ray-Casting Algorithm
     */
    isPointInPolygon(point, vs) {
        let x = point.x, y = point.y;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i].x, yi = vs[i].y;
            let xj = vs[j].x, yj = vs[j].y;
            let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Preview drawing (same as draw but can add handles)
     */
    drawPreview(ctx, obj) {
        this.draw(ctx, obj);
    }
}
