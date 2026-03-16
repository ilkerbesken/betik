class ArrowTool {
    constructor() {
        this.isDrawing = false;
        this.startPoint = null;
        this.currentArrow = null;
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;
        this.startPoint = { x: pos.x, y: pos.y };

        this.currentArrow = {
            type: 'arrow',
            start: this.startPoint,
            end: this.startPoint,
            color: state.strokeColor,
            width: state.strokeWidth,
            pressure: state.pressureEnabled ? Utils.normalizePressure(pos.pressure) : 0.5,
            startStyle: state.arrowStartStyle,
            endStyle: state.arrowEndStyle,
            lineStyle: state.lineStyle || 'solid',
            pathType: state.arrowPathType || 'straight',
            curveControlPoint: null // Will be set when path is curved
        };
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return;

        this.currentArrow.end = { x: pos.x, y: pos.y };
        this.currentArrow.pressure = state.pressureEnabled ? Utils.normalizePressure(pos.pressure) : 0.5;

        return true;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;

        this.isDrawing = false;
        const completedArrow = this.currentArrow;
        this.currentArrow = null;
        this.startPoint = null;

        return completedArrow;
    }

    draw(ctx, object) {
        // Support for both {start, end} and {x1, y1, x2, y2} formats
        const start = object.start || (object.x1 !== undefined ? { x: object.x1, y: object.y1 } : null);
        const end = object.end || (object.x2 !== undefined ? { x: object.x2, y: object.y2 } : null);

        if (!start || !end) return;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);

        // Calculate dynamic width based on pressure
        const pressure = object.pressure !== undefined ? object.pressure : 0.5;
        const lineWidth = Utils.getPressureWidth(object.width, pressure);
        const halfWidth = lineWidth / 2;

        ctx.save();
        ctx.globalAlpha = object.opacity !== undefined ? object.opacity : 1.0;

        let color = object.color;
        if (color === 'rainbow') {
            const minX = Math.min(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);
            color = Utils.getRainbowGradientForRect(ctx, minX, minY, Math.max(1, width), Math.max(1, height));
        }

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;

        // If line is too short, just draw a dot
        if (length < 1) {
            ctx.beginPath();
            ctx.arc(start.x, start.y, halfWidth, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        // Get arrow head styles (default to 'none' and 'triangle')
        const startStyle = object.startStyle || 'none';
        const endStyle = object.endStyle || 'triangle';

        // Arrow Head Dimensions (50% smaller)
        const headLength = Math.min(length * 0.2, 15 + lineWidth);
        const headWidth = Math.max(lineWidth, headLength * 0.6);

        // Arrow heads connect directly to shaft endpoints (no offset)
        const ux = dx / length;
        const uy = dy / length;

        const shaftStart = {
            x: start.x,
            y: start.y
        };

        const shaftEnd = {
            x: end.x,
            y: end.y
        };

        // Draw shaft line with line style and path type
        const lineStyle = object.lineStyle || 'solid';
        const pathType = object.pathType || 'straight';

        // Apply line dash pattern (not for wavy, it handles its own)
        if (lineStyle !== 'wavy') {
            switch (lineStyle) {
                case 'dashed':
                    ctx.setLineDash([lineWidth * 3, lineWidth * 3]);
                    break;
                case 'dotted':
                    ctx.setLineDash([lineWidth * 0.1, lineWidth * 3]);
                    break;
                case 'dash-dot':
                    ctx.setLineDash([lineWidth * 4, lineWidth * 3, lineWidth * 0.1, lineWidth * 3]);
                    break;
                default: // solid
                    ctx.setLineDash([]);
            }
        }

        // Draw path based on pathType
        if (pathType === 'curved') {
            // Calculate or use existing control point (NEEDED FOR BOTH SOLID AND WAVY)
            if (!object.curveControlPoint) {
                // Auto-calculate control point at midpoint, offset perpendicular
                const midX = (shaftStart.x + shaftEnd.x) / 2;
                const midY = (shaftStart.y + shaftEnd.y) / 2;
                const perpX = -(shaftEnd.y - shaftStart.y) * 10;  // Slightly more pronounced but clean arc
                const perpY = (shaftEnd.x - shaftStart.x) * 10;   // to ensure it feels like a 'bow' from the start

                object.curveControlPoint = {
                    x: midX + perpX,
                    y: midY + perpY
                };
            }

            // Curved path with Quadratic Bezier (Fluid/LeaderLine style)
            if (lineStyle === 'wavy') {
                this.drawWavyCurve(ctx, shaftStart, shaftEnd, lineWidth, object.curveControlPoint);
            } else {
                // Calculate actual Bezier Control Point so the curve passes through object.curveControlPoint
                // Handle M is the midpoint of the curve B(0.5)
                // B(0.5) = 0.25*P1 + 0.5*CP + 0.25*P2
                // CP = 2*M - 0.5*P1 - 0.5*P2
                const cp = {
                    x: 2 * object.curveControlPoint.x - 0.5 * shaftStart.x - 0.5 * shaftEnd.x,
                    y: 2 * object.curveControlPoint.y - 0.5 * shaftStart.y - 0.5 * shaftEnd.y
                };

                ctx.beginPath();
                ctx.moveTo(shaftStart.x, shaftStart.y);
                ctx.quadraticCurveTo(cp.x, cp.y, shaftEnd.x, shaftEnd.y);
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        } else if (pathType === 'elbow') {
            // Elbow (orthogonal) path
            if (lineStyle === 'wavy') {
                this.drawWavyElbow(ctx, shaftStart, shaftEnd, lineWidth);
            } else {
                ctx.beginPath();
                ctx.moveTo(shaftStart.x, shaftStart.y);

                // Orthogonal path (right angles)
                const midX = (shaftStart.x + shaftEnd.x) / 2;
                ctx.lineTo(midX, shaftStart.y);
                ctx.lineTo(midX, shaftEnd.y);
                ctx.lineTo(shaftEnd.x, shaftEnd.y);

                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
        } else {
            // Straight path (default)
            if (lineStyle === 'wavy') {
                this.drawWavyLine(ctx, shaftStart, shaftEnd, lineWidth);
            } else {
                ctx.beginPath();
                ctx.moveTo(shaftStart.x, shaftStart.y);
                ctx.lineTo(shaftEnd.x, shaftEnd.y);
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }


        ctx.setLineDash([]); // Reset

        // Calculate arrow head angles based on path type
        let startAngle, endAngle;

        if (pathType === 'curved' && object.curveControlPoint) {
            // For Quadratic Bezier, tagents at start/end point towards the control point
            // CP = 2*M - 0.5*P1 - 0.5*P2
            const cp = {
                x: 2 * object.curveControlPoint.x - 0.5 * start.x - 0.5 * end.x,
                y: 2 * object.curveControlPoint.y - 0.5 * start.y - 0.5 * end.y
            };

            // Start arrow head points away from the control point
            startAngle = Math.atan2(start.y - cp.y, start.x - cp.x);
            // End arrow head points towards the end following the tangent
            endAngle = Math.atan2(end.y - cp.y, end.x - cp.x);
        } else if (pathType === 'elbow') {
            // For elbow path, use direction of first/last segment
            const midX = (start.x + end.x) / 2;

            // Start arrow points along first horizontal segment
            startAngle = end.x > start.x ? 0 : Math.PI;

            // End arrow points along last horizontal segment  
            endAngle = end.x > start.x ? 0 : Math.PI;
        } else {
            // Straight path - use direct angle
            startAngle = angle + Math.PI;
            endAngle = angle;
        }

        // Draw arrow heads with correct angles
        if (startStyle !== 'none') {
            this.drawArrowHead(ctx, start, startAngle, headLength, headWidth, lineWidth, startStyle, lineStyle);
        }

        if (endStyle !== 'none') {
            this.drawArrowHead(ctx, end, endAngle, headLength, headWidth, lineWidth, endStyle, lineStyle);
        }

        ctx.restore();
    }

    drawArrowHead(ctx, point, angle, headLength, headWidth, lineWidth, style, lineStyle) {
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(angle);

        // Offset for styles that should extend beyond shaft
        // line and bar stay at 0 (connected to shaft)
        // triangle, circle, square get offset to extend beyond
        let offset = 0;
        if (style === 'triangle' || style === 'circle' || style === 'square') {
            offset = headLength * 0.3; // Extend beyond shaft

            // Extra offset for wavy lines (to compensate for wave amplitude)
            if (lineStyle === 'wavy') {
                offset += headLength * 0.2;
            }
        }

        ctx.translate(offset, 0);

        switch (style) {
            case 'triangle':
                // Filled triangle
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-headLength, -headWidth);
                ctx.lineTo(-headLength, headWidth);
                ctx.closePath();
                ctx.fill();
                break;

            case 'line':
                // Two lines forming a V (no offset, stays at shaft)
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-headLength, -headWidth);
                ctx.moveTo(0, 0);
                ctx.lineTo(-headLength, headWidth);
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'round';
                ctx.stroke();
                break;

            case 'circle':
                // Filled circle
                ctx.beginPath();
                ctx.arc(-headLength / 2, 0, headWidth / 2, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'square':
                // Filled square
                const squareSize = headWidth;
                ctx.fillRect(-headLength, -squareSize / 2, squareSize, squareSize);
                break;

            case 'bar':
                // Vertical bar (thinner and smaller, no offset)
                ctx.beginPath();
                ctx.moveTo(0, -headWidth * 0.5);
                ctx.lineTo(0, headWidth * 0.5);
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'round';
                ctx.stroke();
                break;
        }

        ctx.restore();
    }

    drawWavyLine(ctx, start, end, lineWidth) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length < 1) return;

        const ux = dx / length;
        const uy = dy / length;
        const nx = -uy;
        const ny = ux;

        const amplitude = Math.max(2, lineWidth * 0.8);
        const wavelength = 20 + lineWidth * 2;
        const frequency = (Math.PI * 2) / wavelength;

        ctx.beginPath();
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';

        const steps = Math.ceil(length / 2);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const dist = length * t;
            const x = start.x + dx * t;
            const y = start.y + dy * t;

            const offset = Math.sin(dist * frequency) * amplitude;
            const wx = x + nx * offset;
            const wy = y + ny * offset;

            if (i === 0) {
                ctx.moveTo(wx, wy);
            } else {
                ctx.lineTo(wx, wy);
            }
        }

        ctx.stroke();
    }

    drawWavyCurve(ctx, start, end, lineWidth, controlPoint) {
        // For now, just draw wavy line (TODO: Implement proper wavy curve along arc)
        // If controlPoint is provided, we could use it to draw a quadratic bezier wave
        this.drawWavyLine(ctx, start, end, lineWidth);
    }

    drawWavyElbow(ctx, start, end, lineWidth) {
        // For now, just draw wavy line (can be improved to follow elbow path)
        this.drawWavyLine(ctx, start, end, lineWidth);
    }

    drawCircularArc(ctx, p1, p2, p3) {
        // Draw a circular arc through three points: p1 (start), p2 (control/mid), p3 (end)
        // p2 is on the arc, not a bezier control point

        // Calculate circle center and radius from three points
        const center = this.getCircleCenter(p1, p2, p3);

        if (!center) {
            // Points are collinear, draw straight line
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineCap = 'round';
            ctx.stroke();
            return;
        }

        const radius = Math.sqrt(
            Math.pow(p1.x - center.x, 2) + Math.pow(p1.y - center.y, 2)
        );

        // Calculate angles
        const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
        const midAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
        const endAngle = Math.atan2(p3.y - center.y, p3.x - center.x);

        // Determine if we should draw clockwise or counterclockwise
        // Check if midpoint angle is between start and end angles
        let counterClockwise = false;

        // Normalize angles to [0, 2π]
        const normalizeAngle = (angle) => {
            while (angle < 0) angle += Math.PI * 2;
            while (angle >= Math.PI * 2) angle -= Math.PI * 2;
            return angle;
        };

        const normStart = normalizeAngle(startAngle);
        const normMid = normalizeAngle(midAngle);
        const normEnd = normalizeAngle(endAngle);

        // Check if mid is between start and end (counterclockwise)
        if (normStart < normEnd) {
            counterClockwise = normMid > normStart && normMid < normEnd;
        } else {
            counterClockwise = normMid > normStart || normMid < normEnd;
        }

        // Draw the arc
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, startAngle, endAngle, counterClockwise);
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    getCircleCenter(p1, p2, p3) {
        // Keeps it for backward compatibility or other uses if any
        const ax = p1.x, ay = p1.y;
        const bx = p2.x, by = p2.y;
        const cx = p3.x, cy = p3.y;

        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(d) < 0.0001) return null;

        const ux = ((ax * ax + ay * ay) * (by - cy) +
            (bx * bx + by * by) * (cy - ay) +
            (cx * cx + cy * cy) * (ay - by)) / d;

        const uy = ((ax * ax + ay * ay) * (cx - bx) +
            (bx * bx + by * by) * (ax - cx) +
            (cx * cx + cy * cy) * (bx - ax)) / d;

        return { x: ux, y: uy };
    }

    drawPreview(ctx, object) {
        this.draw(ctx, object);
    }
}
