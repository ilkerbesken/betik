/**
 * StickerTool.js
 * Manages sticker functionality: saving, loading, and placing stickers on canvas
 */

class StickerTool {
    constructor(canvas, ctx, app) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.app = app;
        this.stickers = this.loadStickers();
        this.isPlacing = false;
        this.currentSticker = null;

        this.setupUI();
    }

    /**
     * Load stickers from localStorage
     */
    loadStickers() {
        try {
            const saved = localStorage.getItem('betik_stickers');
            const userStickers = saved ? JSON.parse(saved) : [];

            // Define default stickers
            this.defaultStickers = [
                {
                    id: 'math_set',
                    name: 'Matematik',
                    objects: [{ type: 'image', src: 'assets/stickers/math.png', x: 0, y: 0, width: 100, height: 100 }]
                },
                {
                    id: 'physics_set',
                    name: 'Fizik',
                    objects: [{ type: 'image', src: 'assets/stickers/physics.png', x: 0, y: 0, width: 100, height: 100 }]
                },
                {
                    id: 'chemistry_set',
                    name: 'Kimya',
                    objects: [{ type: 'image', src: 'assets/stickers/chemistry.png', x: 0, y: 0, width: 100, height: 100 }]
                },
                {
                    id: 'biology_set',
                    name: 'Biyoloji',
                    objects: [{ type: 'image', src: 'assets/stickers/biology.png', x: 0, y: 0, width: 100, height: 100 }]
                }
            ];

            return [...this.defaultStickers, ...userStickers];
        } catch (e) {
            console.error('Error loading stickers:', e);
            return [];
        }
    }

    /**
     * Save stickers to localStorage
     */
    saveStickers() {
        try {
            // Only save user stickers (filter out defaults)
            const userStickers = this.stickers.filter(s => !this.isDefaultSticker(s));
            localStorage.setItem('betik_stickers', JSON.stringify(userStickers));
        } catch (e) {
            console.error('Error saving stickers:', e);
        }
    }

    /**
     * Setup UI elements
     */
    setupUI() {
        // Create sticker popup if it doesn't exist
        if (!document.getElementById('stickerPopup')) {
            const popup = document.createElement('div');
            popup.id = 'stickerPopup';
            popup.className = 'sticker-popup';
            popup.innerHTML = `
                <div class="sticker-popup-header">
                    <h3>Stickerlar</h3>
                    <button id="closeStickerPopup" class="close-btn">×</button>
                </div>
                <div class="sticker-grid" id="stickerGrid">
                    <!-- Stickers will be added here -->
                </div>
                <button id="addNewSticker" class="btn btn-primary add-sticker-btn">
                    <span style="font-size: 20px;">+</span> Yeni Sticker
                </button>
            `;
            document.body.appendChild(popup);

            // Event listeners
            document.getElementById('closeStickerPopup').addEventListener('click', () => {
                this.hidePopup();
            });

            document.getElementById('addNewSticker').addEventListener('click', () => {
                this.createStickerFromSelection();
            });

            // Close popup when clicking outside
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    this.hidePopup();
                }
            });
        }

        // More button in sidebar
        const btnMore = document.getElementById('btnStickerMore');
        if (btnMore) {
            btnMore.addEventListener('click', () => {
                this.showPopup();
            });
        }
    }

    /**
     * Show sticker popup
     */
    showPopup() {
        const popup = document.getElementById('stickerPopup');
        if (popup) {
            popup.classList.add('active');
            this.renderStickers();
        }
    }

    /**
     * Hide sticker popup
     */
    hidePopup() {
        const popup = document.getElementById('stickerPopup');
        if (popup) {
            popup.classList.remove('active');
        }
    }

    /**
     * Render all stickers in the grid
     */
    renderStickers() {
        const grid = document.getElementById('stickerGrid');
        if (!grid) return;

        grid.innerHTML = '';

        if (this.stickers.length === 0) {
            grid.innerHTML = '<p class="no-stickers">Henüz sticker yok. Bir şekil seçip sağ tıklayarak sticker olarak kaydedin.</p>';
            this.renderStickersToSidebar(); // Sync
            return;
        }

        this.stickers.forEach((sticker, index) => {
            const stickerItem = document.createElement('div');
            stickerItem.className = 'sticker-item';

            const canvas = document.createElement('canvas');
            canvas.width = 80;
            canvas.height = 80;
            const ctx = canvas.getContext('2d');

            // Draw sticker preview
            this.drawStickerPreview(ctx, sticker, 80, 80);

            stickerItem.appendChild(canvas);

            stickerItem.appendChild(canvas);

            // Delete button (only for user stickers)
            if (!this.isDefaultSticker(sticker)) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'sticker-delete-btn';
                deleteBtn.innerHTML = '×';
                deleteBtn.title = 'Sil';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteSticker(index);
                });
                stickerItem.appendChild(deleteBtn);
            }

            // Click to place sticker
            stickerItem.addEventListener('click', () => {
                this.selectStickerToPlace(sticker);
            });

            grid.appendChild(stickerItem);
        });

        // Also update sidebar if it exists
        this.renderStickersToSidebar();
    }

    /**
     * Render stickers to the properties sidebar
     */
    renderStickersToSidebar() {
        const list = document.getElementById('stickerSidebarList');
        if (!list) return;

        list.innerHTML = '';

        if (this.stickers.length === 0) {
            list.innerHTML = '<div class="no-stickers-sidebar">Henüz sticker yok.</div>';
            return;
        }

        // Show last 10 stickers in sidebar
        const recentStickers = [...this.stickers].reverse().slice(0, 10);

        recentStickers.forEach((sticker) => {
            const item = document.createElement('div');
            item.className = 'sticker-sidebar-item';
            item.title = 'Yerleştirmek için tıkla';

            const canvas = document.createElement('canvas');
            canvas.width = 60;
            canvas.height = 60;
            const ctx = canvas.getContext('2d');

            this.drawStickerPreview(ctx, sticker, 60, 60);

            item.appendChild(canvas);

            item.addEventListener('click', () => {
                this.selectStickerToPlace(sticker);
            });

            list.appendChild(item);
        });
    }

    /**
     * Draw sticker preview on a small canvas
     */
    drawStickerPreview(ctx, sticker, width, height) {
        ctx.clearRect(0, 0, width, height);

        // Calculate scale to fit in preview
        const bounds = this.calculateBounds(sticker.objects);
        const margin = width * 0.1; // 10% margin for better fit
        const scaleX = (width - margin * 2) / (bounds.width || 1);
        const scaleY = (height - margin * 2) / (bounds.height || 1);
        const scale = Math.min(scaleX, scaleY, 1);

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-bounds.centerX, -bounds.centerY);

        // Draw each object
        sticker.objects.forEach(obj => {
            this.drawObject(ctx, obj);
        });

        ctx.restore();
    }

    /**
     * Helper to draw object (delegates to app)
     */
    drawObject(ctx, obj) {
        if (this.app.drawObject) {
            this.app.drawObject(ctx, obj);
        }
    }

    isDefaultSticker(sticker) {
        return this.defaultStickers.some(s => s.id === sticker.id);
    }

    /**
     * Calculate bounds of objects
     */
    calculateBounds(objects) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        objects.forEach(obj => {
            const bounds = this.getObjectBounds(obj);
            if (bounds.minX !== Infinity) {
                minX = Math.min(minX, bounds.minX);
                minY = Math.min(minY, bounds.minY);
                maxX = Math.max(maxX, bounds.maxX);
                maxY = Math.max(maxY, bounds.maxY);
            }
        });

        if (minX === Infinity) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100, centerX: 50, centerY: 50 };

        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    /**
     * Get bounds for a single object
     */
    getObjectBounds(obj) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        if (obj.type === 'path' || obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'vector-pen') {
            obj.points.forEach(p => {
                if (obj.type === 'vector-pen') {
                    minX = Math.min(minX, p.point.x, p.handle1.x, p.handle2.x);
                    minY = Math.min(minY, p.point.y, p.handle1.y, p.handle2.y);
                    maxX = Math.max(maxX, p.point.x, p.handle1.x, p.handle2.x);
                    maxY = Math.max(maxY, p.point.y, p.handle1.y, p.handle2.y);
                } else {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }
            });
        } else if (obj.type === 'arrow' || obj.type === 'line') {
            minX = Math.min(obj.start.x, obj.end.x);
            minY = Math.min(obj.start.y, obj.end.y);
            maxX = Math.max(obj.start.x, obj.end.x);
            maxY = Math.max(obj.start.y, obj.end.y);
            if (obj.curveControlPoint) {
                minX = Math.min(minX, obj.curveControlPoint.x);
                minY = Math.min(minY, obj.curveControlPoint.y);
                maxX = Math.max(maxX, obj.curveControlPoint.x);
                maxY = Math.max(maxY, obj.curveControlPoint.y);
            }
        } else if (obj.type === 'group') {
            obj.children.forEach(child => {
                const b = this.getObjectBounds(child);
                if (b.minX !== Infinity) {
                    minX = Math.min(minX, b.minX);
                    minY = Math.min(minY, b.minY);
                    maxX = Math.max(maxX, b.maxX);
                    maxY = Math.max(maxY, b.maxY);
                }
            });
        } else if (obj.x !== undefined && obj.y !== undefined) {
            // Shapes & Images
            minX = obj.x;
            minY = obj.y;
            maxX = obj.x + (obj.width || 0);
            maxY = obj.y + (obj.height || 0);
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Draw a single object (for previews)
     */
    drawObject(ctx, obj) {
        ctx.save();

        if (obj.type === 'group') {
            if (obj.children) {
                obj.children.forEach(child => this.drawObject(ctx, child));
            }
            ctx.restore();
            return;
        }

        // Find tool to draw
        let tool = null;
        if (obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'path') {
            tool = this.app.tools.pen;
        } else if (obj.type === 'arrow' || obj.type === 'line') {
            tool = this.app.tools.arrow;
        } else if (obj.type === 'image') {
            tool = this.app.tools.image;
        } else if (obj.type === 'vector-pen') {
            tool = this.app.tools['vector-pen'];
        } else {
            // It's a shape
            tool = this.app.tools.shape || this.app.tools.rectangle;
        }

        if (tool && tool.draw) {
            // Ensure obj has points if it's a legacy 'path'
            if (obj.type === 'path' && !obj.points) {
                // Should not happen with current saving logic
            }
            tool.draw(ctx, obj);
        }

        ctx.restore();
    }

    /**
     * Draw shape based on shapeType
     */
    drawShape(ctx, obj) {
        const shapeTool = this.app.tools.shape || this.app.tools.rectangle;
        if (shapeTool && shapeTool.draw) {
            shapeTool.draw(ctx, obj);
        }
    }

    /**
     * Create sticker from selected objects
     */
    createStickerFromSelection() {
        const selectTool = this.app.tools.select;
        if (!selectTool || !selectTool.selectedObjects ||
            selectTool.selectedObjects.length === 0) {
            alert('Lütfen önce bir veya daha fazla nesne seçin.');
            return;
        }

        // Get actual objects from indices
        const selectedObjs = selectTool.selectedObjects.map(idx => this.app.state.objects[idx]);
        const sticker = {
            id: Date.now(),
            objects: Utils.deepClone(selectedObjs), // Deep copy
            createdAt: new Date().toISOString()
        };

        this.stickers.push(sticker);
        this.saveStickers();
        this.renderStickers();

        // Show success message
        this.showMessage('Sticker kaydedildi!');
    }

    /**
     * Create sticker from context menu (right-click on object)
     */
    createStickerFromObject(object) {
        const sticker = {
            id: Date.now(),
            objects: [Utils.deepClone(object)], // Deep copy
            createdAt: new Date().toISOString()
        };

        this.stickers.push(sticker);
        this.saveStickers();

        // Show success message
        this.showMessage('Sticker kaydedildi!');
    }

    /**
     * Delete a sticker
     */
    deleteSticker(index) {
        if (confirm('Bu sticker\'ı silmek istediğinizden emin misiniz?')) {
            this.stickers.splice(index, 1);
            this.saveStickers();
            this.renderStickers();
        }
    }

    /**
     * Select sticker to place on canvas
     */
    selectStickerToPlace(sticker) {
        this.currentSticker = sticker;
        this.isPlacing = true;
        this.hidePopup();

        // Change cursor
        this.canvas.style.cursor = 'crosshair';

        // Show instruction
        this.showMessage('Sticker\'ı yerleştirmek için tuvale tıklayın');
    }

    /**
     * Place sticker on canvas at click position
     */
    placeSticker(x, y) {
        if (!this.isPlacing || !this.currentSticker) return;

        const bounds = this.calculateBounds(this.currentSticker.objects);
        const offsetX = x - bounds.centerX;
        const offsetY = y - bounds.centerY;

        // Add objects to canvas with offset
        this.currentSticker.objects.forEach(obj => {
            const newObj = Utils.deepClone(obj);
            this.moveObject(newObj, offsetX, offsetY);
            this.app.state.objects.push(newObj);
        });

        // Save state and redraw
        if (this.app.historyManager) {
            this.app.historyManager.saveState(this.app.state.objects);
        }
        this.app.redrawOffscreen();
        this.app.render();

        // Reset
        this.isPlacing = false;
        this.currentSticker = null;
        this.canvas.style.cursor = 'default';
    }

    /**
     * Recursively move object and its children
     */
    moveObject(obj, dx, dy) {
        if (obj.type === 'path' || obj.type === 'pen' || obj.type === 'highlighter' || obj.type === 'vector-pen') {
            if (obj.points) {
                obj.points.forEach(p => {
                    if (obj.type === 'vector-pen') {
                        p.point.x += dx; p.point.y += dy;
                        p.handle1.x += dx; p.handle1.y += dy;
                        p.handle2.x += dx; p.handle2.y += dy;
                    } else {
                        p.x += dx;
                        p.y += dy;
                    }
                });
            }
        } else if (obj.type === 'arrow' || obj.type === 'line') {
            if (obj.start) {
                obj.start.x += dx;
                obj.start.y += dy;
            }
            if (obj.end) {
                obj.end.x += dx;
                obj.end.y += dy;
            }
            if (obj.curveControlPoint) {
                obj.curveControlPoint.x += dx;
                obj.curveControlPoint.y += dy;
            }
        } else if (obj.type === 'group') {
            if (obj.children) {
                obj.children.forEach(child => this.moveObject(child, dx, dy));
            }
        } else {
            // Shapes
            if (obj.x !== undefined) obj.x += dx;
            if (obj.y !== undefined) obj.y += dy;
            // Handle start/end if they exist for shapes (legacy/fallback)
            if (obj.start) { obj.start.x += dx; obj.start.y += dy; }
            if (obj.end) { obj.end.x += dx; obj.end.y += dy; }
        }
    }

    /**
     * Handle pointer events to satisfy BetikApp interface
     */
    handlePointerDown(e, pos, canvas, ctx, state) {
        if (!this.isPlacing) return false;
        this.placeSticker(pos.x, pos.y);
        return true;
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        return false;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        return null;
    }

    /**
     * Handle mouse down event
     */
    handleMouseDown(e) {
        if (!this.isPlacing) return false;

        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.app.zoomManager.scale - this.app.zoomManager.panX;
        const y = (e.clientY - rect.top) / this.app.zoomManager.scale - this.app.zoomManager.panY;

        this.placeSticker(x, y);
        return true;
    }

    /**
     * Show temporary message
     */
    showMessage(text) {
        // Remove existing message
        const existing = document.getElementById('stickerMessage');
        if (existing) {
            existing.remove();
        }

        const message = document.createElement('div');
        message.id = 'stickerMessage';
        message.className = 'sticker-message';
        message.textContent = text;
        document.body.appendChild(message);

        setTimeout(() => {
            message.classList.add('show');
        }, 10);

        setTimeout(() => {
            message.classList.remove('show');
            setTimeout(() => message.remove(), 300);
        }, 2000);
    }

    /**
     * Activate sticker tool
     */
    activate() {
        // No longer auto-showing popup, handled by sidebar
        this.renderStickersToSidebar();
    }

    /**
     * Deactivate sticker tool
     */
    deactivate() {
        this.isPlacing = false;
        this.currentSticker = null;
        this.canvas.style.cursor = 'default';
        this.hidePopup();
    }
}
