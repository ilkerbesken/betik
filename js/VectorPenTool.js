/**
 * VectorPenTool.js
 * A Bezier-based vector drawing tool based on a finite state machine logic.
 */

class VectorPenPoint {
    constructor(x, y) {
        this.point = { x, y };
        this.handle1 = { x, y };
        this.handle2 = { x, y };
    }
}

const VectorPenStates = {
    UNUSED: 'UNUSED',
    ACTIVE: 'ACTIVE',
    PLACING: 'PLACING',
    PLACED: 'PLACED'
};

class VectorPenTool {
    constructor(onRepaint) {
        this.onRepaint = onRepaint;
        this.currentPath = null;
        this.state = VectorPenStates.UNUSED;
        this.isDrawing = false;
    }

    // FSM Transition simulation
    transition(newState) {
        console.log(`VectorPen transition: ${this.state} -> ${newState}`);
        this.state = newState;
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        this.isDrawing = true;

        if (this.state === VectorPenStates.UNUSED || this.state === VectorPenStates.ACTIVE) {
            // Start a new path
            this.currentPath = {
                type: 'vector-pen',
                points: [new VectorPenPoint(pos.x, pos.y)],
                color: state.strokeColor || '#000000',
                width: state.strokeWidth || 3,
                opacity: state.opacity || 1.0,
                filled: state.fillEnabled || false,
                fillColor: state.strokeColor || '#000000',
                id: Date.now() + Math.random().toString(36).substr(2, 9)
            };
            this.transition(VectorPenStates.PLACING);
        } else if (this.state === VectorPenStates.PLACED) {
            // Add a new point to existing path
            this.currentPath.points.push(new VectorPenPoint(pos.x, pos.y));
            this.transition(VectorPenStates.PLACING);
        }

        if (this.onRepaint) this.onRepaint();
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return false;

        if (this.state === VectorPenStates.PLACING) {
            // Adjust handles of the last point
            const points = this.currentPath.points;
            const currentPoint = points[points.length - 1];
            
            // Handle 1 follows the pointer
            currentPoint.handle1.x = pos.x;
            currentPoint.handle1.y = pos.y;

            // Handle 2 is opposite to Handle 1 relative to the anchor point
            const anchor = currentPoint.point;
            currentPoint.handle2.x = anchor.x - (pos.x - anchor.x);
            currentPoint.handle2.y = anchor.y - (pos.y - anchor.y);

            if (this.onRepaint) this.onRepaint();
            return true;
        }
        return false;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        if (!this.isDrawing) return null;
        this.isDrawing = false;

        if (this.state === VectorPenStates.PLACING) {
            this.transition(VectorPenStates.PLACED);
        }

        if (this.onRepaint) this.onRepaint();
        return null;
    }

    // Call this to finish the path (e.g. on Esc or tool change)
    finishPath() {
        if (!this.currentPath) return null;
        
        const path = this.currentPath;
        this.currentPath = null;
        this.state = VectorPenStates.UNUSED;
        this.isDrawing = false;
        
        // Only return if it has at least one point (excluding handles)
        return (path.points && path.points.length > 0) ? path : null;
    }

    draw(ctx, object) {
        if (!object.points || object.points.length === 0) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = object.opacity || 1.0;
        ctx.strokeStyle = object.color;
        ctx.lineWidth = object.width;

        const points = object.points;
        ctx.beginPath();
        ctx.moveTo(points[0].point.x, points[0].point.y);

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            
            // Draw Bezier curve from prev point to curr point
            // Using prev.handle1 and curr.handle2 as control points
            ctx.bezierCurveTo(
                prev.handle1.x, prev.handle1.y,
                curr.handle2.x, curr.handle2.y,
                curr.point.x, curr.point.y
            );
        }
        
        if (object.filled) {
            ctx.fillStyle = object.fillColor || object.color;
            ctx.fill();
        }
        
        ctx.stroke();

        // If this is the active path being drawn, we might want to show handles
        if (this.currentPath === object) {
            this.drawUI(ctx, object);
        }

        ctx.restore();
    }

    drawUI(ctx, object) {
        const points = object.points;
        const POINT_SIZE = 6;
        const HANDLE_RADIUS = 3;

        points.forEach((p, index) => {
            const isLast = (index === points.length - 1);

            // Draw handles
            ctx.beginPath();
            ctx.moveTo(p.handle1.x, p.handle1.y);
            ctx.lineTo(p.point.x, p.point.y);
            ctx.lineTo(p.handle2.x, p.handle2.y);
            ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw handle circles
            ctx.fillStyle = 'blue';
            ctx.beginPath(); ctx.arc(p.handle1.x, p.handle1.y, HANDLE_RADIUS, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(p.handle2.x, p.handle2.y, HANDLE_RADIUS, 0, Math.PI * 2); ctx.fill();

            // Draw anchor point (square)
            ctx.fillStyle = isLast ? 'black' : 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.fillRect(p.point.x - POINT_SIZE / 2, p.point.y - POINT_SIZE / 2, POINT_SIZE, POINT_SIZE);
            ctx.strokeRect(p.point.x - POINT_SIZE / 2, p.point.y - POINT_SIZE / 2, POINT_SIZE, POINT_SIZE);
        });
    }

    drawPreview(ctx, object) {
        this.draw(ctx, object);
    }
}
