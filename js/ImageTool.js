class ImageTool {
    constructor(app) {
        this.app = app;
        this.imageCache = new Map();
        this.pendingImages = new Set();
    }

    draw(ctx, obj) {
        if (!obj.src) return;

        let img = this.imageCache.get(obj.src);

        if (!img) {
            // Check if already loading
            if (this.pendingImages.has(obj.src)) return;

            this.pendingImages.add(obj.src);
            img = new Image();
            img.crossOrigin = "Anonymous"; // Important for saving/exporting canvas
            img.src = obj.src;

            img.onload = () => {
                this.imageCache.set(obj.src, img);
                this.pendingImages.delete(obj.src);

                if (this.app) {
                    this.app.needsRedrawOffscreen = true;
                    this.app.needsRender = true;
                    this.app.render();
                }
            };

            img.onerror = () => {
                console.error("Failed to load image:", obj.src);
                this.pendingImages.delete(obj.src);
            };

            return; // Wait for load
        }

        if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(obj.x, obj.y);

            if (obj.rotation) {
                ctx.translate(obj.width / 2, obj.height / 2);
                ctx.rotate(obj.rotation);
                ctx.translate(-obj.width / 2, -obj.height / 2);
            }

            ctx.drawImage(img, 0, 0, obj.width, obj.height);

            // Optional: Draw border if defined
            if (obj.borderColor && obj.borderColor !== 'transparent') {
                ctx.strokeStyle = obj.borderColor;
                ctx.lineWidth = obj.borderWidth || 2;
                ctx.strokeRect(0, 0, obj.width, obj.height);
            }

            ctx.restore();
        } else {
            // Placeholder while loading or broken
            ctx.save();
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
            ctx.strokeStyle = '#e9ecef';
            ctx.lineWidth = 1;
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);

            // Loading text
            ctx.fillStyle = '#adb5bd';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Loading...', obj.x + obj.width / 2, obj.y + obj.height / 2);
            ctx.restore();
        }
    }

    // Interface requirements for tools
    handlePointerDown(e, pos) { return null; }
    handlePointerMove() { return false; }
    handlePointerUp() { return null; }
}
