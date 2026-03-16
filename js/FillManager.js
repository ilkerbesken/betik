class FillManager {
    constructor() {
        this.fillThreshold = 80; // Distance in pixels to consider a path closed
    }

    /**
     * Checks if a pen object represents a closed path.
     * @param {Object} object - The pen object with points.
     * @returns {boolean} - True if closed, false otherwise.
     */
    isClosedPath(object) {
        if (!object.points || object.points.length < 3) return false;

        const start = object.points[0];
        const end = object.points[object.points.length - 1];

        const distance = Math.sqrt(
            Math.pow(end.x - start.x, 2) +
            Math.pow(end.y - start.y, 2)
        );

        return distance <= this.fillThreshold;
    }

    /**
     * Checks if the object has any content that can be filled (Must have intersections).
     * @param {Object} object 
     */
    canBeFilled(object) {
        if (!object.points || object.points.length < 3) return false;

        // Strict Mode: Only check for self-intersections (loops)
        // Ignor start-to-end proximity
        return this.findLoops(object.points).length > 0;
    }

    /**
     * Toggles fill on the object. If filling, sets fill color.
     * @param {Object} object - The object to modify.
     * @param {string} color - The fill color.
     */
    toggleFill(object, color) {
        if (object.filled) {
            delete object.filled;
            delete object.fillColor;
        } else {
            object.filled = true;
            object.fillColor = color || object.color;
        }
    }

    /**
     * Draws the fill for a given object.
     * To be called before drawing the stroke.
     * @param {CanvasRenderingContext2D} ctx 
     * @param {Object} object 
     */
    drawFill(ctx, object) {
        if (!object.filled || !object.points || object.points.length < 3) return;

        ctx.save();
        ctx.fillStyle = object.fillColor || object.color;

        // STRICT MODE: Always find and fill only the loops.
        // We do NOT connect start to end explicitly.
        // If the path just loops back near the start but doesn't cross, it won't fill.
        // This is what the user requested.

        const loops = this.findLoops(object.points);
        if (loops.length > 0) {
            ctx.beginPath();
            loops.forEach(loopPoints => {
                if (loopPoints.length < 3) return;
                ctx.moveTo(loopPoints[0].x, loopPoints[0].y);
                for (let i = 1; i < loopPoints.length; i++) {
                    ctx.lineTo(loopPoints[i].x, loopPoints[i].y);
                }
                ctx.closePath();
            });
            ctx.fill('nonzero');
        }

        ctx.restore();
    }

    /**
     * Finds self-intersecting loops in a point key.
     * @param {Array} points 
     * @returns {Array<Array>} Array of polygon point arrays
     */
    findLoops(points) {
        const loops = [];
        const len = points.length;

        // Simplification: We don't construct a full planar graph.
        // We just find intersections and treat the sequence from Intersection -> ... -> Intersection as a loop.
        // This might overlap or duplicate for complex knots, but 'nonzero' fill handles overlap nicely (idempotent).

        for (let i = 0; i < len - 2; i++) {
            for (let j = i + 2; j < len - 1; j++) {
                // Check if segment i intersects segment j
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[j];
                const p4 = points[j + 1];

                const intersect = this.getLineIntersection(p1, p2, p3, p4);

                if (intersect) {
                    // Found a loop!
                    // The loop consists of: Intersection Point -> p(i+1) ... -> p(j) -> Intersection Point
                    const loopPoly = [intersect];
                    for (let k = i + 1; k <= j; k++) {
                        loopPoly.push(points[k]);
                    }
                    // Close the loop
                    loopPoly.push(intersect);
                    loops.push(loopPoly);

                    // Optimization: If we found an intersection for segment 'i', should we skip?
                    // A single segment could intersect multiple others. We want ALL loops.
                    // However, we should be careful about performance.
                    // For now, let's collect all.
                }
            }
        }
        return loops;
    }

    /**
     * Calculates intersection of two line segments p1-p2 and p3-p4.
     * Returns point {x,y} or null.
     */
    getLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;

        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

        if (denom === 0) return null; // Parallel

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

        // strict intersection within segment bounds (approximate for floating point)
        // Relaxed epsilon to catch endpoints slightly
        if (ua >= 0.001 && ua <= 0.999 && ub >= 0.001 && ub <= 0.999) {
            return {
                x: x1 + ua * (x2 - x1),
                y: y1 + ua * (y2 - y1)
            };
        }

        return null;
    }
}
