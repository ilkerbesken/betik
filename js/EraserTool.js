class EraserTool {
    constructor() {
        this.isErasing = false;
        this.eraserSize = 30;
        this.currentTrail = []; // Array of {x, y, age}
        this.maxTrailLife = 400; // ms
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isErasing = true;
        this.eraserSize = state.strokeWidth / 2;
        this.lastErasePos = pos;
        this.addTrailPoint(pos);
        return this.erase(pos, state);
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        this.eraserSize = state.strokeWidth / 2;
        let modified = false;
        if (this.isErasing) {
            this.addTrailPoint(pos);
            modified = this.erase(pos, state);
            this.lastErasePos = pos;
        }
        return modified; // Return true only if something was deleted to avoid unnecessary offscreen redraws
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        this.isErasing = false;
        this.lastErasePos = null;
        return null;
    }

    addTrailPoint(pos) {
        this.currentTrail.push({
            x: pos.x,
            y: pos.y,
            time: performance.now()
        });
    }

    erase(pos, state) {
        const lastPos = this.lastErasePos || pos;
        if (state.eraserMode === 'partial') {
            return this.erasePartial(pos, lastPos, state);
        } else {
            return this.eraseObject(pos, lastPos, state);
        }
    }

    eraseObject(pos, lastPos, state) {
        const radius = this.eraserSize;
        const beforeCount = state.objects.length;

        // Silgiye yakın nesneleri bul ve sil
        state.objects = state.objects.filter(obj => {
            if (obj.locked) return true;
            return !this.intersectsWithEraserSegment(obj, lastPos, pos, radius);
        });

        return state.objects.length !== beforeCount;
    }

    erasePartial(pos, lastPos, state) {
        const r = this.eraserSize;
        const nextObjects = [];
        let totalModified = false;

        for (const obj of state.objects) {
            if (obj.locked) {
                nextObjects.push(obj);
                continue;
            }
            if (obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'charcoal' || obj.type === 'fountain-pen') {
                if (this.intersectsWithEraserSegment(obj, lastPos, pos, r)) {
                    // Split logic currently only uses the current pos for simplicity, 
                    // but we check intersection against the whole segment to trigger it.
                    const segments = this.splitPath(obj, pos, r);
                    nextObjects.push(...segments);
                    totalModified = true;
                } else {
                    nextObjects.push(obj);
                }
            } else {
                nextObjects.push(obj);
            }
        }

        if (totalModified) {
            state.objects = nextObjects;
        }
        return totalModified;
    }

    splitPath(obj, pos, radius) {
        const points = obj.points;
        const segments = [];
        let currentSegment = [];

        // Effective radius for splitting (add a bit of stroke width padding)
        const effectiveRadius = radius + (obj.strokeWidth ? obj.strokeWidth / 4 : 0);

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const prevP = i > 0 ? points[i - 1] : null;

            // Check if point itself is inside
            const isPointInside = Utils.sqDistance(p, pos) < (effectiveRadius * effectiveRadius);

            // Check if we just crossed the eraser (even if points are outside)
            const isPassingThrough = prevP && this.lineIntersectsCircle(prevP, p, pos, effectiveRadius);

            if (isPointInside || isPassingThrough) {
                // Point is in or segment crossed eraser -> End current segment
                if (currentSegment.length > 1) {
                    segments.push(currentSegment);
                }
                currentSegment = [];
            } else {
                // Point is outside and we didn't cross eraser area
                currentSegment.push(p);
            }
        }

        if (currentSegment.length > 1) {
            segments.push(currentSegment);
        }

        // Create new objects from segments
        return segments.map(seg => {
            const newObj = { ...obj };
            newObj.points = seg;
            newObj.id = Date.now() + Math.random();
            return newObj;
        });
    }

    intersectsWithEraserSegment(obj, p1, p2, radius) {
        // --- 1. Fast AABB Culling ---
        // If eraser move segment doesn't touch object's bounding box, skip everything
        if (!this.intersectsWithEraserAABB(obj, p1, p2, radius)) {
            return false;
        }

        // --- 2. Precise Collision ---
        // Effective hit radius = eraser radius + object stroke width / 2
        const effectiveRadius = radius + (obj.strokeWidth ? obj.strokeWidth / 2 : 2);

        switch (obj.type) {
            case 'highlighter':
            case 'charcoal':
            case 'fountain-pen':
            case 'pen':
                // Check if any segment of the stroke intersects with the segment of eraser move
                for (let i = 0; i < obj.points.length - 1; i++) {
                    if (this.segmentsIntersect(obj.points[i], obj.points[i + 1], p1, p2, effectiveRadius)) {
                        return true;
                    }
                }
                // Check single points if it's a very short stroke
                if (obj.points.length === 1) {
                    if (this.pointDistanceToSegment(obj.points[0], p1, p2) < effectiveRadius) return true;
                }
                return false;

            case 'line':
            case 'arrow':
                return this.segmentsIntersect(obj.start, obj.end, p1, p2, effectiveRadius);

            case 'rectangle':
            case 'rect':
            case 'ellipse':
            case 'triangle':
            case 'trapezoid':
            case 'star':
            case 'diamond':
            case 'parallelogram':
            case 'oval':
            case 'heart':
            case 'cloud': {
                // For modern shapes, we use a hybrid approach:
                if (state.shapeTool && state.shapeTool.isPointInside) {
                    if (state.shapeTool.isPointInside(obj, p1) || state.shapeTool.isPointInside(obj, p2)) {
                        return true;
                    }
                }

                // 2. Check if the eraser segment intersects any edge of the shape
                // Get base vertices (unrotated)
                let vertices = (obj.type === 'rectangle' || obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'oval') ? [
                    { x: obj.x, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ] : (state.shapeTool ? state.shapeTool.getVertices(obj) : []);

                // Apply rotation to vertices if shape is rotated
                if (obj.rotation && vertices.length > 0) {
                    const centerX = obj.x + obj.width / 2;
                    const centerY = obj.y + obj.height / 2;
                    const cos = Math.cos(obj.rotation);
                    const sin = Math.sin(obj.rotation);
                    vertices = vertices.map(v => {
                        const dx = v.x - centerX;
                        const dy = v.y - centerY;
                        return {
                            x: centerX + (dx * cos - dy * sin),
                            y: centerY + (dx * sin + dy * cos)
                        };
                    });
                }

                if (vertices.length > 0) {
                    for (let i = 0; i < vertices.length; i++) {
                        const v1 = vertices[i];
                        const v2 = vertices[(i + 1) % vertices.length];
                        if (this.segmentsIntersect(v1, v2, p1, p2, effectiveRadius)) return true;
                    }
                }

                // Fallback for old Rectangle (start/end)
                if (obj.start && obj.end && obj.type === 'rectangle') {
                    const x1 = Math.min(obj.start.x, obj.end.x);
                    const y1 = Math.min(obj.start.y, obj.end.y);
                    const x2 = Math.max(obj.start.x, obj.end.x);
                    const y2 = Math.max(obj.start.y, obj.end.y);
                    const corners = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
                    for (let i = 0; i < 4; i++) {
                        if (this.segmentsIntersect(corners[i], corners[(i + 1) % 4], p1, p2, effectiveRadius)) return true;
                    }
                }

                return false;
            }

            default:
                return false;
        }
    }

    /**
     * Fast Axis-Aligned Bounding Box intersection test
     */
    intersectsWithEraserAABB(obj, p1, p2, radius) {
        // 1. Get object bounds (use cached or calculate)
        let objBounds;
        if (obj._bounds) {
            objBounds = obj._bounds;
        } else if (app.tools.select) {
            objBounds = app.tools.select.getBoundingBox(obj);
            obj._bounds = objBounds; // Cache it
        } else {
            return true; // Fallback if select tool not ready
        }

        // 2. Get eraser segment bounds
        const pad = radius + 2;
        const eMinX = Math.min(p1.x, p2.x) - pad;
        const eMinY = Math.min(p1.y, p2.y) - pad;
        const eMaxX = Math.max(p1.x, p2.x) + pad;
        const eMaxY = Math.max(p1.y, p2.y) + pad;

        // 3. Simple AABB check
        return !(objBounds.minX > eMaxX ||
            objBounds.maxX < eMinX ||
            objBounds.minY > eMaxY ||
            objBounds.maxY < eMinY);
    }

    segmentsIntersect(a1, a2, b1, b2, radius) {
        // Distance between two segments a and b
        // If distance < radius, they "intersect" via the circle
        return this.segmentToSegmentDistance(a1, a2, b1, b2) < radius;
    }

    segmentToSegmentDistance(p1, q1, p2, q2) {
        // Robust segment to segment distance algorithm
        const d1 = Utils.vecSub(q1, p1);
        const d2 = Utils.vecSub(q2, p2);
        const r = Utils.vecSub(p1, p2);
        const a = Utils.vecLen(d1) ** 2;
        const e = Utils.vecLen(d2) ** 2;
        const f = d2.x * r.x + d2.y * r.y;

        let s = 0, t = 0;

        if (a <= 0.0001 && e <= 0.0001) {
            return Utils.distance(p1, p2);
        }
        if (a <= 0.0001) {
            s = 0;
            t = Math.max(0, Math.min(1, f / e));
        } else {
            const c = d1.x * r.x + d1.y * r.y;
            if (e <= 0.0001) {
                t = 0;
                s = Math.max(0, Math.min(1, -c / a));
            } else {
                const b = d1.x * d2.x + d1.y * d2.y;
                const denom = a * e - b * b;
                if (denom !== 0) {
                    s = Math.max(0, Math.min(1, (b * f - c * e) / denom));
                } else {
                    s = 0; // Parallel lines
                }
                t = (b * s + f) / e;
                if (t < 0) {
                    t = 0;
                    s = Math.max(0, Math.min(1, -c / a));
                } else if (t > 1) {
                    t = 1;
                    s = Math.max(0, Math.min(1, (b - c) / a));
                }
            }
        }

        const closestP1 = Utils.vecAdd(p1, Utils.vecMul(d1, s));
        const closestP2 = Utils.vecAdd(p2, Utils.vecMul(d2, t));
        return Utils.distance(closestP1, closestP2);
    }

    pointDistanceToSegment(p, a, b) {
        const d = Utils.vecSub(b, a);
        const lenSq = d.x * d.x + d.y * d.y;
        if (lenSq === 0) return Utils.distance(p, a);
        let t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Utils.distance(p, { x: a.x + t * d.x, y: a.y + t * d.y });
    }

    lineIntersectsCircle(start, end, center, radius) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const fx = start.x - center.x;
        const fy = start.y - center.y;

        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - radius * radius;

        if (a === 0) return Utils.distance(start, center) < radius;

        const discriminant = b * b - 4 * a * c;

        if (discriminant < 0) return false;

        const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
        const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

        return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
    }

    rectIntersectsCircle(rect, center, radius) {
        const x1 = Math.min(rect.start.x, rect.end.x);
        const y1 = Math.min(rect.start.y, rect.end.y);
        const x2 = Math.max(rect.start.x, rect.end.x);
        const y2 = Math.max(rect.start.y, rect.end.y);

        // Closest point on rectangle to circle center
        const closestX = Math.max(x1, Math.min(center.x, x2));
        const closestY = Math.max(y1, Math.min(center.y, y2));

        const dist = Utils.distance({ x: closestX, y: closestY }, center);
        return dist < radius;
    }

    ellipseIntersectsCircle(ellipse, center, radius) {
        const x1 = Math.min(ellipse.start.x, ellipse.end.x);
        const y1 = Math.min(ellipse.start.y, ellipse.end.y);
        const x2 = Math.max(ellipse.start.x, ellipse.end.x);
        const y2 = Math.max(ellipse.start.y, ellipse.end.y);

        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;

        // Roughly check using distance to expanded ellipse
        const dx = center.x - cx;
        const dy = center.y - cy;

        // Normalized distance squared
        return (dx * dx) / ((rx + radius) * (rx + radius)) + (dy * dy) / ((ry + radius) * (ry + radius)) <= 1;
    }

    draw(ctx, object) {
        // Silgi için kalıcı çizim yok
    }

    drawPreview(ctx, trail) {
        if (!this.currentTrail || this.currentTrail.length === 0) return false;

        const now = performance.now();
        // Remove old points
        this.currentTrail = this.currentTrail.filter(p => now - p.time < this.maxTrailLife);

        if (this.currentTrail.length < 2) return this.currentTrail.length > 0;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw segments with fading opacity and width
        for (let i = 1; i < this.currentTrail.length; i++) {
            const p1 = this.currentTrail[i - 1];
            const p2 = this.currentTrail[i];
            const age = now - p2.time;
            const lifeRatio = 1 - (age / this.maxTrailLife);

            if (lifeRatio <= 0) continue;

            ctx.beginPath();
            // Even lighter trail: 0.04 opacity
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.04 * lifeRatio})`;
            ctx.lineWidth = (this.eraserSize * 1.2) * lifeRatio;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
        ctx.restore();

        // Return true if we need to keep rendering to finish the fade
        return this.currentTrail.length > 0;
    }

    drawCursor(ctx, x, y, state) {
        ctx.save();
        // Çap = Kalınlık değeri -> Yarıçap = Kalınlık / 2
        const radius = (state ? state.strokeWidth : 20) / 2;
        this.eraserSize = radius; // Sync logical size for consistency

        ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tiny center dot
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
