class SelectTool {
    constructor() {
        this.selectedObjects = [];
        this.isDragging = false;
        this.dragStartPoint = null;
        this.dragCurrentPoint = null;
        this.clipboard = null; // Kopyalanan nesne

        // Handle sistemi
        this.activeHandle = null; // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w', 'rotate'
        this.resizeStartBounds = null;
        this.rotateStartAngle = 0;
        this.rotateCenter = null;
        this.rotateCenter = null;
        this.handleSize = 8; // Tutamaç boyutu (px)

        // Selection Mode: 'normal' (click-select/drag-box) or 'area' (force drag-box)
        this.selectionMode = 'normal';

        // Long Press Logic for Touch Devices
        this.longPressTimer = null;
        this.longPressStartPos = null;
        this.LONG_PRESS_DURATION = 500; // ms
        this.LONG_PRESS_THRESHOLD = 5; // px movement tolerance
        this.activeTableDivider = null; // { tableIndex: number, type: 'row'|'col', index: number }
        this.selectedTableCell = null; // { row: number, col: number } - Last clicked cell in selected table
    }

    handlePointerDown(e, pos, canvas, ctx, state) {
        const clickPoint = { x: pos.x, y: pos.y };

        // Start Long Press Timer
        this.startLongPressTimer(e, canvas, state);

        const isCtrlPressed = e.ctrlKey || e.metaKey;
        const isRightClick = e.button === 2;

        // Önce seçili nesne varsa handle kontrolü yap
        if (this.selectedObjects.length > 0 && !isCtrlPressed && !isRightClick) {
            const selectedIndex = this.selectedObjects[0];
            const selectedObj = state.objects[selectedIndex];

            if (selectedObj) {
                // Eğri kontrol noktası kontrolü (curved arrow için)
                if (selectedObj.type === 'arrow' && selectedObj.pathType === 'curved' && selectedObj.curveControlPoint) {
                    const dist = Math.sqrt(
                        Math.pow(clickPoint.x - selectedObj.curveControlPoint.x, 2) +
                        Math.pow(clickPoint.y - selectedObj.curveControlPoint.y, 2)
                    );

                    if (dist < this.handleSize + 5) {
                        // Kontrol noktası yakalandı
                        this.activeHandle = 'curveControl';
                        this.dragStartPoint = clickPoint;
                        // Amplified dragging için başlangıç konumunu sakla
                        this.initialCurveControlPoint = { ...selectedObj.curveControlPoint };
                        return true;
                    }
                }

                const bounds = this.getBoundingBox(selectedObj);
                // Orijinal bounds'u (döndürülmemiş) kullanmak için
                // getBoundingBox döndürülmüş AABB veriyor.
                // Bize resize için "unrotated" bounds lazım.
                const allShapes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'text', 'image'];
                let unrotatedBounds = bounds;
                if (allShapes.includes(selectedObj.type) && (selectedObj.rotation || selectedObj.angle)) {
                    if (selectedObj.x !== undefined) {
                        unrotatedBounds = {
                            minX: selectedObj.x,
                            minY: selectedObj.y,
                            maxX: selectedObj.x + selectedObj.width,
                            maxY: selectedObj.y + selectedObj.height
                        };
                    } else if (selectedObj.start && selectedObj.end) {
                        const minX = Math.min(selectedObj.start.x, selectedObj.end.x);
                        const maxX = Math.max(selectedObj.start.x, selectedObj.end.x);
                        const minY = Math.min(selectedObj.start.y, selectedObj.end.y);
                        const maxY = Math.max(selectedObj.start.y, selectedObj.end.y);
                        unrotatedBounds = { minX, minY, maxX, maxY };
                    }
                }

                const handle = this.getHandleAtPoint(clickPoint, unrotatedBounds, selectedObj);

                if (handle) {
                    if (handle === 'move') {
                        // Taşıma tutamacı yakalandı - sürüklemeyi başlat
                        this.isDragging = true;
                        this.dragStartPoint = clickPoint;
                        this.dragCurrentPoint = clickPoint;
                        return true;
                    }

                    // Handle yakalandı
                    this.activeHandle = handle;
                    this.dragStartPoint = clickPoint;
                    this.resizeStartBounds = { ...unrotatedBounds };

                    if (handle === 'rotate') {
                        // Döndürme için merkez nokta
                        this.rotateCenter = {
                            x: (bounds.minX + bounds.maxX) / 2,
                            y: (bounds.minY + bounds.maxY) / 2
                        };
                    }

                    return true;
                }

                // TABLE DIVIDER CHECK
                if (selectedObj.type === 'table') {
                    const divider = this.isNearTableDivider(selectedObj, clickPoint);
                    if (divider) {
                        this.activeTableDivider = {
                            tableIndex: selectedIndex,
                            type: divider.type,
                            index: divider.index
                        };
                        this.dragStartPoint = clickPoint;
                        this.initialDividerState = {
                            rowHeights: [...selectedObj.rowHeights],
                            colWidths: [...selectedObj.colWidths],
                            width: selectedObj.width,
                            height: selectedObj.height,
                            x: selectedObj.x,
                            y: selectedObj.y
                        };
                        return true;
                    }
                }
            }
        }

        // Tıklanan nesneyi bul
        let clickedIndex = -1;
        for (let i = state.objects.length - 1; i >= 0; i--) {
            const obj = state.objects[i];
            if (obj.locked) continue;

            let hit = this.isNearObject(obj, clickPoint);
            
            // Sağ tık için daha esnek bir kontrol: Çizgi gibi ince nesnelerde bounding box'ı da kontrol et
            if (!hit && isRightClick) {
                const bounds = this.getBoundingBox(obj, 10);
                if (clickPoint.x >= bounds.minX && clickPoint.x <= bounds.maxX &&
                    clickPoint.y >= bounds.minY && clickPoint.y <= bounds.maxY) {
                    hit = true;
                }
            }

            if (hit) {
                clickedIndex = i;
                break;
            }
        }

        // Ctrl basılıysa çoklu seçim modu
        if (isCtrlPressed) {
            if (clickedIndex !== -1) {
                // Nesne bulundu
                const indexInSelection = this.selectedObjects.indexOf(clickedIndex);
                if (indexInSelection !== -1) {
                    // Zaten seçili, seçimden çıkar
                    this.selectedObjects.splice(indexInSelection, 1);
                } else {
                    // Seçime ekle
                    this.selectedObjects.push(clickedIndex);
                }
            }
            return true;
        }

        // Ctrl basılı değil - normal tek seçim modu
        // Önce seçili nesnelerden biri üzerinde miyiz kontrol et (seçili nesneler için bounding box'ı da kullanıyoruz)
        if (this.selectedObjects.length > 0) {
            const isOnSelectedObject = this.selectedObjects.some(index => {
                const obj = state.objects[index];
                if (!obj) return false;
                
                let hit = this.isNearObject(obj, clickPoint);
                if (!hit) {
                    // Zaten seçili nesneler için bounding box'ı tıklanabilir yapıyoruz (özellikle içi boş çizgiler için)
                    // Sağ tık veya normal sol tık fark etmeksizin bu alan artık sürüklenebilir.
                    const bounds = this.getBoundingBox(obj, 15);
                    hit = clickPoint.x >= bounds.minX && clickPoint.x <= bounds.maxX &&
                          clickPoint.y >= bounds.minY && clickPoint.y <= bounds.maxY;
                }
                return hit;
            });

            if (isOnSelectedObject) {
                // If it's a table, update the selected cell even if it's already selected
                const selectedIdx = this.selectedObjects[0];
                const selectedObj = state.objects[selectedIdx];
                if (selectedObj && selectedObj.type === 'table') {
                    this.selectedTableCell = this.detectTableCell(selectedObj, clickPoint);
                }

                // Seçili nesne üzerindeyiz, sürüklemeyi başlat (sağ tık değilse)
                if (!isRightClick) {
                    this.isDragging = true;
                    this.dragStartPoint = clickPoint;
                    this.dragCurrentPoint = clickPoint;
                }
                return true;
            }
        }

        // Seçili nesne üzerinde değiliz
        // In Area mode, we skip single object selection to prioritize Lasso drawing
        if (clickedIndex !== -1 && this.selectionMode !== 'area') {
            // Tape objects are special: they are selected via marquee ONLY (requested by user)
            // unless already selected.
            const obj = state.objects[clickedIndex];
            if (obj.type === 'tape') {
                // If it's a tape and not already selected, we don't select it on single click
                // This allows falling through to marquee selection start if it's a drag
                this.selectedObjects = [];
                this.isDragSelecting = true;
                this.dragSelectStart = clickPoint;
                this.dragCurrentPoint = clickPoint;
            } else {
                // Yeni bir nesneye tıkladık -> Seç ve sürüklemeyi başlat (sağ tık değilse)
                this.selectedObjects = [clickedIndex];
                
                // If it's a table, detect which cell was clicked
                if (obj.type === 'table') {
                    this.selectedTableCell = this.detectTableCell(obj, clickPoint);
                } else {
                    this.selectedTableCell = null;
                }

                if (!isRightClick) {
                    this.isDragging = true;
                    this.dragStartPoint = clickPoint;
                    this.dragCurrentPoint = clickPoint;
                }
            }
        } else {
            // Boş alana tıkladık (veya Area modunda nesneye tıkladık) -> Drag Select Başlat (sadece sol tık ise)
            if (isRightClick) {
                // Sağ tık ile boşluğa tıklamak seçimi temizler ama drag-select başlatmaz
                this.selectedObjects = [];
            } else {
                this.selectedObjects = []; // Mevcut seçimi temizle
                this.isDragSelecting = true;
                this.dragSelectStart = clickPoint;
                this.dragCurrentPoint = clickPoint;

                // Initialzie Lasso if in Area mode
                if (this.selectionMode === 'area') {
                    this.lassoPoints = [clickPoint];
                }
            }
        }

        return true;
    }

    handlePointerMove(e, pos, canvas, ctx, state) {
        const currentPoint = { x: pos.x, y: pos.y };

        // Check long press movement threshold
        if (this.longPressTimer && this.longPressStartPos) {
            const dist = Math.sqrt(
                Math.pow(e.clientX - this.longPressStartPos.x, 2) +
                Math.pow(e.clientY - this.longPressStartPos.y, 2)
            );
            if (dist > this.LONG_PRESS_THRESHOLD) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }

        // Handle aktifse (resize veya rotate veya curveControl)
        if (this.activeHandle && this.selectedObjects.length > 0) {
            const selectedIndex = this.selectedObjects[0];
            const selectedObj = state.objects[selectedIndex];

            if (selectedObj) {
                if (this.activeHandle === 'curveControl') {
                    // Free movement for the control point (LeaderLine behavior)
                    if (selectedObj.curveControlPoint && this.initialCurveControlPoint) {
                        const mouseDeltaX = currentPoint.x - this.dragStartPoint.x;
                        const mouseDeltaY = currentPoint.y - this.dragStartPoint.y;

                        selectedObj.curveControlPoint.x = this.initialCurveControlPoint.x + mouseDeltaX;
                        selectedObj.curveControlPoint.y = this.initialCurveControlPoint.y + mouseDeltaY;
                    }
                    return true;
                } else if (this.activeHandle === 'rotate') {
                    // Döndürme
                    this.handleRotate(selectedObj, this.rotateCenter, this.dragStartPoint, currentPoint);
                } else {
                    // Boyutlandırma
                    this.handleResize(this.activeHandle, selectedObj, this.resizeStartBounds, this.dragStartPoint, currentPoint);
                }
                return true;
            }
        }

        if (this.activeTableDivider) {
            const table = state.objects[this.activeTableDivider.tableIndex];
            if (table) {
                const deltaX = currentPoint.x - this.dragStartPoint.x;
                const deltaY = currentPoint.y - this.dragStartPoint.y;

                if (this.activeTableDivider.type === 'row') {
                    const idx = this.activeTableDivider.index;
                    if (idx === -1) {
                        // Top Border: Resize first row and shift Y
                        const newHeight = Math.max(10, this.initialDividerState.rowHeights[0] - deltaY);
                        const actualDelta = this.initialDividerState.rowHeights[0] - newHeight;
                        table.rowHeights[0] = newHeight;
                        table.y = this.initialDividerState.y + actualDelta;
                    } else {
                        // Internal or Bottom Border
                        const newHeight = Math.max(10, this.initialDividerState.rowHeights[idx] + deltaY);
                        table.rowHeights[idx] = newHeight;
                    }
                    table.height = table.rowHeights.reduce((a, b) => a + b, 0);
                } else {
                    const idx = this.activeTableDivider.index;
                    if (idx === -1) {
                        // Left Border: Resize first column and shift X
                        const newWidth = Math.max(10, this.initialDividerState.colWidths[0] - deltaX);
                        const actualDelta = this.initialDividerState.colWidths[0] - newWidth;
                        table.colWidths[0] = newWidth;
                        table.x = this.initialDividerState.x + actualDelta;
                    } else {
                        // Internal or Right Border
                        const newWidth = Math.max(10, this.initialDividerState.colWidths[idx] + deltaX);
                        table.colWidths[idx] = newWidth;
                    }
                    table.width = table.colWidths.reduce((a, b) => a + b, 0);
                }
                return true;
            }
        }

        if (this.isDragSelecting) {
            this.dragCurrentPoint = currentPoint;

            // Lasso Update
            if (this.selectionMode === 'area') {
                if (!this.lassoPoints) this.lassoPoints = [];
                // Add point if distance is enough to avoid too many points
                const lastPoint = this.lassoPoints[this.lassoPoints.length - 1];
                if (!lastPoint || Utils.distance(lastPoint, currentPoint) > 2) {
                    this.lassoPoints.push(currentPoint);
                }
            }

            return true; // Yeniden çiz
        }

        // Normal sürükleme (move)
        if (this.isDragging && this.selectedObjects.length > 0) {
            const deltaX = currentPoint.x - this.dragCurrentPoint.x;
            const deltaY = currentPoint.y - this.dragCurrentPoint.y;

            // Tüm seçili nesneleri taşı
            this.selectedObjects.forEach(index => {
                const obj = state.objects[index];
                if (obj) {
                    this.moveObject(obj, deltaX, deltaY);
                }
            });

            this.dragCurrentPoint = currentPoint;
            return true;
        }

        // --- Cursor Update for Table Dividers ---
        if (!this.isDragSelecting && !this.activeHandle && !this.activeTableDivider && this.selectedObjects.length === 1) {
            const selectedIdx = this.selectedObjects[0];
            const obj = state.objects[selectedIdx];
            if (obj && obj.type === 'table') {
                const divider = this.isNearTableDivider(obj, currentPoint);
                if (divider) {
                    canvas.style.cursor = divider.type === 'row' ? 'ns-resize' : 'ew-resize';
                } else {
                    // Reset to default if not over divider (app.js handles base tool cursors, but here we override specific select hover)
                    // Check if over resize handles first
                    const bounds = this.getBoundingBox(obj);
                    const handle = this.getHandleAtPoint(currentPoint, bounds, obj);
                    if (!handle) {
                        canvas.style.cursor = 'default';
                    }
                }
            }
        }

        return false;
    }

    handlePointerUp(e, pos, canvas, ctx, state) {
        // Cancel Timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        // Handle işlemi bitir
        if (this.activeHandle) {
            this.activeHandle = null;
            this.resizeStartBounds = null;
            this.rotateCenter = null;
            this.originalObjectState = null;
            return false;
        }

        if (this.activeTableDivider) {
            this.activeTableDivider = null;
            this.initialDividerState = null;
            return false;
        }

        // Drag Select bitir
        if (this.isDragSelecting) {
            this.isDragSelecting = false;
            this.finishDragSelection(state);
            this.dragSelectStart = null;
            this.dragCurrentPoint = null;
            return false;
        }

        if (this.isDragging) {
            // Case: Simple click on a selected object (no significant drag)
            if (this.dragStartPoint) {
                const dist = Math.sqrt(Math.pow(pos.x - this.dragStartPoint.x, 2) + Math.pow(pos.y - this.dragStartPoint.y, 2));
                if (dist < 5 && this.selectedObjects.length === 1) {
                    const idx = this.selectedObjects[0];
                    const obj = state.objects[idx];
                    if (obj && obj.type === 'text') {
                        // Forward to TextTool for interactive hit-testing
                        if (window.app.tools.text.handleInteractiveClick(obj, pos)) {
                            window.app.saveHistory();
                            window.app.needsRedrawOffscreen = true;
                            window.app.needsRender = true;
                        }
                    }
                }
            }
            this.isDragging = false;
            this.dragStartPoint = null;
            this.dragCurrentPoint = null;
        }

        return false;
    }

    finishDragSelection(state) {
        if (!this.dragSelectStart || !this.dragCurrentPoint) return;

        // Lasso (Area) Selection Logic
        if (this.selectionMode === 'area' && this.lassoPoints && this.lassoPoints.length > 2) {
            // Close the loop
            const polygon = [...this.lassoPoints];

            // Check objects inside polygon
            state.objects.forEach((obj, index) => {
                if (obj.locked) return;
                if (this.checkLassoIntersectionV2(obj, polygon)) {
                    if (!this.selectedObjects.includes(index)) {
                        this.selectedObjects.push(index);
                    }
                }
            });

            this.lassoPoints = null; // Clear lasso
            return;
        }

        // Standard Rect Selection Logic
        const startX = Math.min(this.dragSelectStart.x, this.dragCurrentPoint.x);
        const startY = Math.min(this.dragSelectStart.y, this.dragCurrentPoint.y);
        const endX = Math.max(this.dragSelectStart.x, this.dragCurrentPoint.x);
        const endY = Math.max(this.dragSelectStart.y, this.dragCurrentPoint.y);
        const width = endX - startX;
        const height = endY - startY;

        // Çok küçük oynamaları yoksay (tıklama gibi algıla)
        if (width < 3 && height < 3) return;

        const selectionBox = { x: startX, y: startY, width, height };

        // Kutu içindeki veya temas eden nesneleri bul
        state.objects.forEach((obj, index) => {
            if (obj.locked) return;
            if (this.checkIntersection(obj, selectionBox)) {
                if (!this.selectedObjects.includes(index)) {
                    this.selectedObjects.push(index);
                }
            }
        });
    }

    // Check if object is inside or intersecting the Lasso Polygon
    checkLassoIntersection(obj, polygon) {
        // 1. Check if Object Center is Inside Polygon
        // This is the most intuitive "Area Select" behavior requested ("Mouse ucunun taradığı yerin içinde kalan")

        let center = { x: 0, y: 0 };

        if (obj.x !== undefined) {
            center.x = obj.x + obj.width / 2;
            center.y = obj.y + obj.height / 2;
        } else if (obj.start && obj.end) {
            center.x = (obj.start.x + obj.end.x) / 2;
            center.y = (obj.start.y + obj.end.y) / 2;
        } else if (obj.points) {
            // Average of points
            let sx = 0, sy = 0;
            obj.points.forEach(p => { sx += p.x; sy += p.y; });
            center.x = sx / obj.points.length;
            center.y = sy / obj.points.length;
        }

        if (this.isPointInPolygon(center, polygon)) return true;

        // 2. Optional: Check if ANY point of the object is inside (Sensitive selection)
        // If the user wants "Inside" strictly, maybe only center. 
        // If "Scanned area" implies touching, we should check points.
        // Let's stick to Center first, or Corners.

        // Let's use Bounding Box Corners for better feel
        const bounds = this.getBoundingBox(obj);
        const corners = [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
            { x: bounds.minX, y: bounds.maxY }
        ];

        // If ANY corner is inside, select it? Or ALL?
        // "İçinde kalan" usually implies FULLY inside. 
        // But for usability, if I circle around half of it, I might expect selection.
        // Let's allow if Center is inside.

        return false;
    }

    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    checkLassoIntersectionV2(obj, polygon) {
        if (!polygon || polygon.length < 3) return false;

        const objBounds = this.getBoundingBox(obj);

        // 1. STEP: Fast AABB Filter
        let polyMinX = Infinity, polyMinY = Infinity, polyMaxX = -Infinity, polyMaxY = -Infinity;
        for (let p of polygon) {
            if (p.x < polyMinX) polyMinX = p.x;
            if (p.y < polyMinY) polyMinY = p.y;
            if (p.x > polyMaxX) polyMaxX = p.x;
            if (p.y > polyMaxY) polyMaxY = p.y;
        }

        if (objBounds.maxX < polyMinX || objBounds.minX > polyMaxX ||
            objBounds.maxY < polyMinY || objBounds.minY > polyMaxY) {
            return false;
        }

        // 2. STEP: Intersection Check (Sensitive)
        // User requested: "Small part is enough"

        let objPoints = [];
        let isClosedShape = false;
        const shapeTypes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'tape', 'sticker', 'image'];

        if (shapeTypes.includes(obj.type)) {
            objPoints = this.getRotatedCorners(obj);
            if (objPoints.length === 0) {
                objPoints = [
                    { x: objBounds.minX, y: objBounds.minY },
                    { x: objBounds.maxX, y: objBounds.minY },
                    { x: objBounds.maxX, y: objBounds.maxY },
                    { x: objBounds.minX, y: objBounds.maxY }
                ];
            }
            isClosedShape = true;
        } else if (obj.points) {
            if (obj.type === 'vector-pen') {
                objPoints = [];
                obj.points.forEach(p => objPoints.push(p.point, p.handle1, p.handle2));
            } else {
                objPoints = obj.points;
            }
            if (objPoints.length > 200) {
                const sampled = [];
                const step = Math.ceil(objPoints.length / 100);
                for (let i = 0; i < objPoints.length; i += step) sampled.push(objPoints[i]);
                if (sampled[sampled.length - 1] !== objPoints[objPoints.length - 1]) sampled.push(objPoints[objPoints.length - 1]);
                objPoints = sampled;
            }
        } else if (obj.start && obj.end) {
            objPoints = [obj.start, obj.end];
            if (obj.curveControlPoint) objPoints.push(obj.curveControlPoint);
        }

        if (objPoints.length === 0) return false;

        // A) ANY Object point inside Lasso -> Select
        for (let p of objPoints) {
            if (this.isPointInPolygon(p, polygon)) return true;
        }

        // B) Edge Intersection
        const objSegments = [];
        for (let i = 0; i < objPoints.length - 1; i++) {
            objSegments.push([objPoints[i], objPoints[i + 1]]);
        }
        if (isClosedShape && objPoints.length > 2) {
            objSegments.push([objPoints[objPoints.length - 1], objPoints[0]]);
        }

        const lassoSegments = [];
        for (let i = 0; i < polygon.length - 1; i++) {
            lassoSegments.push([polygon[i], polygon[i + 1]]);
        }
        if (polygon.length > 2) {
            lassoSegments.push([polygon[polygon.length - 1], polygon[0]]);
        }

        for (let os of objSegments) {
            for (let ls of lassoSegments) {
                if (Utils.lineLineIntersect(ls[0].x, ls[0].y, ls[1].x, ls[1].y, os[0].x, os[0].y, os[1].x, os[1].y)) {
                    return true;
                }
            }
        }

        return false;
    }

    checkIntersection(obj, box) {
        const objBounds = this.getBoundingBox(obj);

        // 1. Adım: İlk Filtreleme (AABB Check)
        // Eğer kutular kesişmiyorsa, o nesneyi doğrudan ele.
        const aabbOverlap = !(objBounds.minX > box.x + box.width ||
            objBounds.maxX < box.x ||
            objBounds.minY > box.y + box.height ||
            objBounds.maxY < box.y);

        if (!aabbOverlap) return false;

        // 2. Adım: Kesin Kontrol (Hassas Yöntem)
        return this.checkIntersectionPrecise(obj, box);
    }

    checkIntersectionPrecise(obj, box) {
        // Selection Box Vertices (Polygon)
        const boxPoly = [
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x + box.width, y: box.y + box.height },
            { x: box.x, y: box.y + box.height }
        ];

        // Handle Groups
        if (obj.type === 'group') {
            return obj.children.some(child => this.checkIntersectionPrecise(child, box));
        }

        const rotation = obj.rotation !== undefined ? obj.rotation : (obj.angle || 0);

        // A) Karmaşık Şekiller & Çizgiler İçin: Nokta/Segment Kontrolü
        // (Pen, Highlighter, Tape-Freehand, Line, Arrow)
        if (['pen', 'highlighter', 'charcoal', 'fountain-pen', 'vector-pen', 'tape', 'line', 'arrow'].includes(obj.type)) {
            let points = [];

            if (obj.points) {
                if (obj.type === 'vector-pen') {
                    obj.points.forEach(p => points.push(p.point, p.handle1, p.handle2));
                } else {
                    points = obj.points;
                }
            } else if (obj.start && obj.end) {
                points = [obj.start, obj.end];
                if (obj.curveControlPoint) points.push(obj.curveControlPoint); // Curve ise approximate et
            }

            // 1. Nokta İçeride mi? (Point-in-Rectangle)
            // Kullanıcı isteği: "Eğer nesnenin en az bir noktası seçim dikdörtgeninin koordinatları içindeyse"
            for (let p of points) {
                if (p.x >= box.x && p.x <= box.x + box.width &&
                    p.y >= box.y && p.y <= box.y + box.height) {
                    return true;
                }
            }

            // 2. Kenar Kesişimi (Segment Intersection)
            // Sadece noktaların içeride olması bazı durumlarda yetmeyebilir (boydan boya geçen çizgi).
            // AABB zaten geçtiği için, eğer çizgi selection box'ı kesiyorsa kesin olarak kesişim vardır.
            // Fakat kullanıcı özellikle "Point-in-Polygon" mantığına vurgu yapmış (vertices inside).
            // Yine de "pass-through" (içinden geçme) durumunu kaçırmamak için segment testi ekliyoruz.
            for (let i = 0; i < points.length - 1; i++) {
                if (Utils.lineRectIntersect(points[i], points[i + 1], box)) {
                    return true;
                }
            }

            // Eğer curve ise (Arrow curved) daha detaylı bakılabilir ama segment testi genellikle yeterlidir.
            return false;
        }

        if (obj.type === 'text' || obj.type === 'sticker' || obj.type === 'table') {
            const objPoly = [
                { x: obj.x, y: obj.y },
                { x: obj.x + obj.width, y: obj.y },
                { x: obj.x + obj.width, y: obj.y + obj.height },
                { x: obj.x, y: obj.y + obj.height }
            ];
            return this.doSATCheck(boxPoly, objPoly);
        }

        // B) Döndürülmüş Objeler İçin: "Separating Axis Theorem" (SAT)
        // (Rectangle, Ellipse, Triangle, Star, vb.)
        const shapeTypes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'image', 'sticker'];
        if (shapeTypes.includes(obj.type)) {
            // Eğer rotasyon yoksa ve basit dikdörtgense AABB yeterliydi ama hassas olması isteniyor.
            // Elips vb için AABB bazen fazladan alan kaplar (köşeler).
            // SAT kullanacağız.

            let objPoly = [];
            if (rotation !== 0 || obj.type !== 'rectangle') {
                // Döndürülmüş veya kompleks şekil köşe noktalarını al
                objPoly = this.getRotatedCorners(obj);
                // Not: getRotatedCorners şu an sadece bounding rect corners veriyor olabilir. 
                // Eğer Triangle, Star gibi şekillerin GERÇEK köşelerini döndürmüyorsa SAT yine bounding box üzerinde çalışır.
                // Mevcut `getRotatedCorners` metodunu kontrol ettik, sadece rotated bounding box veriyor gibi.
                // İdeal SAT için şeklin gerçek vertexlerine ihtiyacımız var. 
                // Ancak "SelectTool.js" içinde karmaşık şekillerin vertex hesabı yok (ShapeTool draw içinde var).
                // Bu yüzden şimdilik Rotated Bounding Box (OBB) üzerinden SAT yapacağız. 
                // Bu AABB'den çok daha iyidir.
            } else {
                // Rotasyon yoksa AABB köşeleri
                objPoly = [
                    { x: obj.x, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ];
            }

            // SAT Testi: Box vs Object
            return this.doSATCheck(boxPoly, objPoly);
        }

        // Diğer durumlar (fallback)
        return true; // AABB geçtiyse kabul et
    }

    doSATCheck(poly1, poly2) {
        const polygons = [poly1, poly2];

        for (let i = 0; i < polygons.length; i++) {
            const polygon = polygons[i];

            for (let j = 0; j < polygon.length; j++) {
                const p1 = polygon[j];
                const p2 = polygon[(j + 1) % polygon.length];

                const normal = { x: -(p2.y - p1.y), y: p2.x - p1.x };

                let min1 = Infinity, max1 = -Infinity;
                for (let k = 0; k < poly1.length; k++) {
                    const q = (poly1[k].x * normal.x + poly1[k].y * normal.y);
                    min1 = Math.min(min1, q);
                    max1 = Math.max(max1, q);
                }

                let min2 = Infinity, max2 = -Infinity;
                for (let k = 0; k < poly2.length; k++) {
                    const q = (poly2[k].x * normal.x + poly2[k].y * normal.y);
                    min2 = Math.min(min2, q);
                    max2 = Math.max(max2, q);
                }

                if (!(max1 >= min2 && max2 >= min1)) {
                    return false;
                }
            }
        }
        return true;
    }

    moveObject(obj, deltaX, deltaY) {
        if (obj.locked) return;

        if (obj.type === 'group') {
            obj.children.forEach(child => this.moveObject(child, deltaX, deltaY));
            return;
        }

        if (obj._renderCachePoints) delete obj._renderCachePoints;
        if (obj._bounds) delete obj._bounds;

        switch (obj.type) {
            case 'highlighter':
            case 'charcoal':
            case 'fountain-pen':
            case 'pen':
            case 'vector-pen':
                // Tüm noktaları taşı
                obj.points.forEach(p => {
                    if (obj.type === 'vector-pen') {
                        p.point.x += deltaX;
                        p.point.y += deltaY;
                        p.handle1.x += deltaX;
                        p.handle1.y += deltaY;
                        p.handle2.x += deltaX;
                        p.handle2.y += deltaY;
                    } else {
                        p.x += deltaX;
                        p.y += deltaY;
                    }
                });
                break;

            case 'line':
            case 'arrow':
                // Başlangıç ve bitiş noktalarını taşı
                obj.start.x += deltaX;
                obj.start.y += deltaY;
                obj.end.x += deltaX;
                obj.end.y += deltaY;
                // Eğri kontrol noktasını da taşı (varsa)
                if (obj.curveControlPoint) {
                    obj.curveControlPoint.x += deltaX;
                    obj.curveControlPoint.y += deltaY;
                }
                break;

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
            case 'cloud':
            case 'sticker':
            case 'image':
            case 'tape':
            case 'table':
                // Support both start/end (OLD) and x/y (NEW) formats
                if (obj.x !== undefined) {
                    obj.x += deltaX;
                    obj.y += deltaY;
                }
                if (obj.start) {
                    obj.start.x += deltaX;
                    obj.start.y += deltaY;
                }
                if (obj.end) {
                    obj.end.x += deltaX;
                    obj.end.y += deltaY;
                }
                if (obj.center) {
                    obj.center.x += deltaX;
                    obj.center.y += deltaY;
                }
                if (obj.points) {
                    obj.points.forEach(p => {
                        p.x += deltaX;
                        p.y += deltaY;
                    });
                }
                break;
            case 'text':
                obj.x += deltaX;
                obj.y += deltaY;
                break;
        }
    }


    getBoundingBox(obj, extraPadding = 0) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        let padding = extraPadding;

        // Base padding (from stroke width)
        if (obj.strokeWidth !== undefined) {
            padding += obj.strokeWidth / 2;
        } else if (obj.thickness !== undefined) {
            padding += obj.thickness / 2;
        } else if (obj.width !== undefined && (obj.type === 'pen' || obj.type === 'charcoal' || obj.type === 'fountain-pen' || obj.type === 'highlighter' || obj.type === 'line' || obj.type === 'arrow' || obj.type === 'vector-pen')) {
            padding += obj.width / 2;
        }

        // Arrow specific extra padding for heads
        if (obj.type === 'arrow') {
            padding += Math.max(0, 20 + (obj.width || 2) - padding);
        }

        if (obj.type === 'group') {
            obj.children.forEach(child => {
                const childBounds = this.getBoundingBox(child);
                minX = Math.min(minX, childBounds.minX);
                minY = Math.min(minY, childBounds.minY);
                maxX = Math.max(maxX, childBounds.maxX);
                maxY = Math.max(maxY, childBounds.maxY);
            });
            // Children bounds already include their padding
            return { minX, minY, maxX, maxY };
        } else if (obj.type === 'pen' || obj.type === 'charcoal' || obj.type === 'fountain-pen' || obj.type === 'highlighter' || obj.type === 'tape') {
            if (obj.mode === 'rectangle') {
                minX = obj.x;
                minY = obj.y;
                maxX = obj.x + obj.width;
                maxY = obj.y + obj.height;
            } else {
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
            }
        } else if (obj.type === 'line' || obj.type === 'arrow') {
            minX = Math.min(obj.start.x, obj.end.x);
            minY = Math.min(obj.start.y, obj.end.y);
            maxX = Math.max(obj.start.x, obj.end.x);
            maxY = Math.max(obj.start.y, obj.end.y);
        } else if (obj.type === 'table') {
            minX = obj.x;
            minY = obj.y;
            maxX = obj.x + obj.width;
            maxY = obj.y + obj.height;
        } else if (['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'text', 'sticker', 'tape', 'image'].includes(obj.type)) {
            const rotation = obj.rotation !== undefined ? obj.rotation : (obj.angle || 0);
            if (rotation !== 0 && obj.type !== 'tape') {
                const corners = this.getRotatedCorners(obj);
                corners.forEach(p => {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                });
            } else {
                if (obj.x !== undefined) {
                    minX = obj.x;
                    minY = obj.y;
                    maxX = obj.x + obj.width;
                    maxY = obj.y + obj.height;
                } else if (obj.start && obj.end) {
                    minX = Math.min(obj.start.x, obj.end.x);
                    minY = Math.min(obj.start.y, obj.end.y);
                    maxX = Math.max(obj.start.x, obj.end.x);
                    maxY = Math.max(obj.start.y, obj.end.y);
                } else if (obj.center) {
                    minX = obj.center.x - obj.radiusX;
                    minY = obj.center.y - obj.radiusY;
                    maxX = obj.center.x + obj.radiusX;
                    maxY = obj.center.y + obj.radiusY;
                }
            }
        } else if (obj.type === 'vector-pen') {
            obj.points.forEach(p => {
                minX = Math.min(minX, p.point.x, p.handle1.x, p.handle2.x);
                minY = Math.min(minY, p.point.y, p.handle1.y, p.handle2.y);
                maxX = Math.max(maxX, p.point.x, p.handle1.x, p.handle2.x);
                maxY = Math.max(maxY, p.point.y, p.handle1.y, p.handle2.y);
            });
        }

        // Fallback or fix for undefined min/max if object is empty
        if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

        // Apply Padding
        return {
            minX: minX - padding,
            minY: minY - padding,
            maxX: maxX + padding,
            maxY: maxY + padding
        };
    }


    isNearObject(obj, point, threshold = 10) {
        if (obj.type === 'group') {
            return obj.children.some(child => this.isNearObject(child, point, threshold));
        }

        switch (obj.type) {
            case 'highlighter':
            case 'charcoal':
            case 'fountain-pen':
            case 'pen':
            case 'vector-pen':
                const hitThreshold = threshold + (obj.width || 2) / 2;
                let isNearSpine = false;
                if (obj.type === 'vector-pen') {
                    isNearSpine = obj.points.some(p =>
                        Utils.distance(p.point, point) < hitThreshold ||
                        Utils.distance(p.handle1, point) < hitThreshold ||
                        Utils.distance(p.handle2, point) < hitThreshold
                    );
                } else {
                    isNearSpine = obj.points.some(p =>
                        Utils.distance(p, point) < hitThreshold
                    );
                }
                if (isNearSpine) return true;
                if (obj.filled && obj.points.length > 2 && window.app && window.app.fillManager) {
                    const loops = window.app.fillManager.findLoops(obj.points);
                    const shapeTool = window.app.tools.shape;
                    if (shapeTool && shapeTool.isPointInPolygon) {
                        return loops.some(loop => shapeTool.isPointInPolygon(point, loop));
                    }
                }
                return false;

            case 'line':
            case 'arrow':
                const pathType = obj.pathType || 'straight';
                let distanceToPath = Infinity;

                if (pathType === 'curved' && obj.curveControlPoint) {
                    distanceToPath = this.pointToBezierDistance(point, obj.start, obj.curveControlPoint, obj.end);
                } else if (pathType === 'elbow') {
                    distanceToPath = this.pointToElbowDistance(point, obj.start, obj.end);
                } else {
                    // Straight path
                    distanceToPath = this.pointToLineDistance(point, obj.start, obj.end);
                }

                return distanceToPath < threshold;

            case 'table':
                if (point.x >= obj.x - threshold && point.x <= obj.x + obj.width + threshold &&
                    point.y >= obj.y - threshold && point.y <= obj.y + obj.height + threshold) {
                    return true;
                }
                return false;

            case 'rectangle':
            // ... (rest unchanged)
            case 'rect':
            case 'ellipse':
            case 'triangle':
            case 'trapezoid':
            case 'star':
            case 'diamond':
            case 'parallelogram':
            case 'oval':
            case 'heart':
            case 'cloud':
                const sTool = (window.app && window.app.tools) ? (window.app.tools.shape || window.app.tools.rectangle) : null;
                if (sTool && sTool.isPointInside) {
                    if (sTool.isPointInside(obj, point)) return true;
                }
                const bounds = this.getBoundingBox(obj);
                if (point.x >= bounds.minX - threshold && point.x <= bounds.maxX + threshold &&
                    point.y >= bounds.minY - threshold && point.y <= bounds.maxY + threshold) {

                    const shapeTypes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'image', 'sticker'];
                    if (shapeTypes.includes(obj.type)) return true;
                }
                // Fallback for non-shape but x/y based objects (like legacy image/sticker entries)
                if (['image', 'sticker', 'text'].includes(obj.type) && obj.x !== undefined) {
                    const b = this.getBoundingBox(obj);
                    if (point.x >= b.minX - threshold && point.x <= b.maxX + threshold &&
                        point.y >= b.minY - threshold && point.y <= b.maxY + threshold) {
                        return true;
                    }
                }
                return false;

            case 'tape':
                const tTool = (window.app && window.app.tools) ? window.app.tools.tape : null;
                if (tTool && tTool.isPointInside) {
                    return tTool.isPointInside(obj, point);
                }
                return false;

            case 'text':
            case 'sticker':
            case 'image':
                // Only consider bounding box for sticker and text
                if (obj.x !== undefined && obj.width !== undefined) {
                    if (point.x >= obj.x - threshold && point.x <= obj.x + obj.width + threshold &&
                        point.y >= obj.y - threshold && point.y <= obj.y + obj.height + threshold) {
                        return true;
                    }
                }
                return false;
        }
        return false;
    }


    getRotatedCorners(obj) {
        let rx, ry, rw, rh;
        if (obj.x !== undefined) {
            rx = obj.x; ry = obj.y; rw = obj.width; rh = obj.height;
        } else if (obj.start && obj.end) {
            rx = Math.min(obj.start.x, obj.end.x);
            ry = Math.min(obj.start.y, obj.end.y);
            rw = Math.max(0.1, Math.abs(obj.end.x - obj.start.x));
            rh = Math.max(0.1, Math.abs(obj.end.y - obj.start.y));
        } else if (obj.center) {
            rx = obj.center.x - obj.radiusX;
            ry = obj.center.y - obj.radiusY;
            rw = obj.radiusX * 2;
            rh = obj.radiusY * 2;
        } else {
            return [];
        }

        const centerX = rx + rw / 2;
        const centerY = ry + rh / 2;
        const rotation = obj.rotation !== undefined ? obj.rotation : (obj.angle || 0);

        const rotate = (x, y) => {
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            return {
                x: cos * (x - centerX) - sin * (y - centerY) + centerX,
                y: sin * (x - centerX) + cos * (y - centerY) + centerY
            };
        };

        return [
            rotate(rx, ry),
            rotate(rx + rw, ry),
            rotate(rx + rw, ry + rh),
            rotate(rx, ry + rh)
        ];
    }
    getRawBounds(obj) {
        if (obj.x !== undefined) {
            return {
                minX: obj.x,
                minY: obj.y,
                maxX: obj.x + obj.width,
                maxY: obj.y + obj.height
            };
        } else if (obj.start && obj.end) {
            return {
                minX: Math.min(obj.start.x, obj.end.x),
                minY: Math.min(obj.start.y, obj.end.y),
                maxX: Math.max(obj.start.x, obj.end.x),
                maxY: Math.max(obj.start.y, obj.end.y)
            };
        } else if (obj.center) {
            return {
                minX: obj.center.x - (obj.radiusX || 0),
                minY: obj.center.y - (obj.radiusY || 0),
                maxX: obj.center.x + (obj.radiusX || 0),
                maxY: obj.center.y + (obj.radiusY || 0)
            };
        } else if (obj.points) {
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            obj.points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
            return { minX, minY, maxX, maxY };
        }
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }


    pointToLineDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            return Utils.distance(point, lineStart);
        }

        const t = Math.max(0, Math.min(1,
            ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq
        ));

        const projection = {
            x: lineStart.x + t * dx,
            y: lineStart.y + t * dy
        };

        return Utils.distance(point, projection);
    }

    pointToBezierDistance(point, p1, m, p2) {
        // Calculate Bezier Control Point from the midpoint handle m
        const cp = {
            x: 2 * m.x - 0.5 * p1.x - 0.5 * p2.x,
            y: 2 * m.y - 0.5 * p1.y - 0.5 * p2.y
        };

        // Sampling approach for simplicity and performance
        let minSquareDist = Infinity;
        const steps = 15; // Enough samples for hit detection

        let prevX = p1.x;
        let prevY = p1.y;

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const invT = 1 - t;

            // Quadratic Bezier Formula: (1-t)^2*P1 + 2(1-t)t*CP + t^2*P2
            const x = invT * invT * p1.x + 2 * invT * t * cp.x + t * t * p2.x;
            const y = invT * invT * p1.y + 2 * invT * t * cp.y + t * t * p2.y;

            // Check distance to this segment of the curve
            const d = this.pointToLineDistance(point, { x: prevX, y: prevY }, { x, y });
            if (d < minSquareDist) minSquareDist = d;

            prevX = x;
            prevY = y;
        }

        return minSquareDist;
    }

    pointToElbowDistance(point, start, end) {
        const midX = (start.x + end.x) / 2;

        // Orthogonal path segments: (start.x, start.y) -> (midX, start.y) -> (midX, end.y) -> (end.x, end.y)
        const d1 = this.pointToLineDistance(point, start, { x: midX, y: start.y });
        const d2 = this.pointToLineDistance(point, { x: midX, y: start.y }, { x: midX, y: end.y });
        const d3 = this.pointToLineDistance(point, { x: midX, y: end.y }, end);

        return Math.min(d1, d2, d3);
    }

    draw(ctx, object) {
        // Normal çizim
    }

    drawPreview(ctx, object) {
        // Önizleme yok
    }

    drawSelection(ctx, state, zoom = 1) {
        const uiScale = 1 / zoom;
        const handleSize = this.handleSize * uiScale;

        // Drag Select kutusunu çiz
        if (this.isDragSelecting && this.dragSelectStart && this.dragCurrentPoint) {

            // Lasso Drawing
            if (this.selectionMode === 'area' && this.lassoPoints && this.lassoPoints.length > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
                for (let i = 1; i < this.lassoPoints.length; i++) {
                    ctx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
                }
                // Close loop visually if needed, or just open line
                // Usually Lasso is open while dragging, closed on release.

                ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
                ctx.strokeStyle = '#2196f3';
                ctx.lineWidth = 1 * uiScale;
                ctx.setLineDash([5 * uiScale, 5 * uiScale]);

                ctx.stroke();
                // Optionally fill to show "Area"
                // ctx.fill(); // Filling an open path connects start/end automatically

                ctx.restore();
                return;
            }

            // Normal Rect Drawing
            const startX = Math.min(this.dragSelectStart.x, this.dragCurrentPoint.x);
            const startY = Math.min(this.dragSelectStart.y, this.dragCurrentPoint.y);
            const width = Math.abs(this.dragCurrentPoint.x - this.dragSelectStart.x);
            const height = Math.abs(this.dragCurrentPoint.y - this.dragSelectStart.y);

            ctx.save();
            ctx.fillStyle = 'rgba(33, 150, 243, 0.1)'; // Çok açık mavi dolgu
            ctx.strokeStyle = '#2196f3'; // Mavi kenarlık
            ctx.lineWidth = 1 * uiScale;
            ctx.setLineDash([5 * uiScale, 5 * uiScale]);
            ctx.fillRect(startX, startY, width, height);
            ctx.strokeRect(startX, startY, width, height);
            ctx.restore();
        }

        if (this.selectedObjects.length === 0) return;

        ctx.strokeStyle = '#2196f3';
        ctx.lineWidth = 2 * uiScale;
        ctx.setLineDash([5 * uiScale, 5 * uiScale]);

        this.selectedObjects.forEach(index => {
            const obj = state.objects[index];
            if (!obj) return;

            // Tutamaçları hesapla (döndürülmüş olabilir)
            let handles;
            const bounds = this.getBoundingBox(obj);

            // Path Spine Visualization for Pen Tool
            // This renders a thin line showing the actual path structure inside the stroke
            if ((obj.type === 'pen' || obj.type === 'highlighter') && obj.points && obj.points.length > 1) {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = obj.locked ? '#f44336' : '#2196f3';
                // Make spine more visible for highlighter as it's often wider/lighter
                ctx.lineWidth = (obj.type === 'highlighter' ? 2 : 1) * uiScale;
                ctx.globalAlpha = obj.locked ? 0.8 : (obj.type === 'highlighter' ? 0.8 : 0.6);
                ctx.setLineDash([]); // Solid line for spine

                ctx.moveTo(obj.points[0].x, obj.points[0].y);

                // Use the same smoothing logic as PenTool draw for the spine
                if (obj.points.length === 2) {
                    ctx.lineTo(obj.points[1].x, obj.points[1].y);
                } else {
                    for (let i = 0; i < obj.points.length - 2; i++) {
                        const p0 = obj.points[i];
                        const p1 = obj.points[i + 1];
                        const p2 = obj.points[i + 2];

                        const cp1x = p0.x + (p1.x - p0.x) * 0.66;
                        const cp1y = p0.y + (p1.y - p0.y) * 0.66;
                        const cp2x = p1.x + (p2.x - p1.x) * 0.33;
                        const cp2y = p1.y + (p2.y - p1.y) * 0.33;

                        const midX = (cp1x + cp2x) / 2;
                        const midY = (cp1y + cp2y) / 2;

                        ctx.quadraticCurveTo(cp1x, cp1y, midX, midY);
                    }
                    const last = obj.points[obj.points.length - 1];
                    ctx.lineTo(last.x, last.y);
                }

                ctx.stroke();
                ctx.restore();
            }

            // Eğer açı varsa ve destekleniyorsa, döndürülmemiş bounds ile handle hesapla
            const rotation = obj.rotation !== undefined ? obj.rotation : (obj.angle || 0);
            if (rotation !== 0) {
                const rawBounds = this.getRawBounds(obj);
                handles = this.getHandlePositions(rawBounds, obj);
            } else {
                handles = this.getHandlePositions(bounds, obj);
            }

            // Seçim kutusu çiz (döndürülmüş olabilir)
            ctx.save();
            if (obj.locked) {
                ctx.strokeStyle = '#f44336'; // Kilitli için kırmızı
            } else {
                ctx.strokeStyle = '#2196f3'; // Normal için mavi
            }
            ctx.beginPath();
            ctx.moveTo(handles.nw.x, handles.nw.y);
            ctx.lineTo(handles.ne.x, handles.ne.y);
            ctx.lineTo(handles.se.x, handles.se.y);
            ctx.lineTo(handles.sw.x, handles.sw.y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            // Tutamaçları çiz (sadece tek seçimde ve kilitli değilse)
            if (this.selectedObjects.length === 1 && !obj.locked) {
                ctx.fillStyle = 'white';
                ctx.strokeStyle = '#2196F3';
                ctx.lineWidth = 2 * uiScale;
                ctx.setLineDash([]);

                // Boyutlandırma tutamaçları (kareler)
                for (let [name, pos] of Object.entries(handles)) {
                    if (name !== 'rotate' && name !== 'move') {
                        ctx.fillRect(
                            pos.x - handleSize / 2,
                            pos.y - handleSize / 2,
                            handleSize,
                            handleSize
                        );
                        ctx.strokeRect(
                            pos.x - handleSize / 2,
                            pos.y - handleSize / 2,
                            handleSize,
                            handleSize
                        );
                    }
                }

                // Döndürme tutamacı (daire)
                const rotateHandle = handles.rotate;
                ctx.beginPath();
                ctx.arc(rotateHandle.x, rotateHandle.y, handleSize / 2 + 1 * uiScale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Döndürme çizgisi (üst orta noktadan)
                ctx.beginPath();
                ctx.moveTo(handles.n.x, handles.n.y);
                ctx.lineTo(rotateHandle.x, rotateHandle.y);
                ctx.stroke();

                // Taşıma tutamacı (merkezde artı işareti/oklar)
                const moveHandle = handles.move;
                if (moveHandle) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(moveHandle.x, moveHandle.y, handleSize / 2 + 1 * uiScale, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();

                    // Artı işareti (taşıma ikonu simgesi)
                    ctx.beginPath();
                    const iconSize = (handleSize / 2) * 0.7;
                    ctx.moveTo(moveHandle.x - iconSize, moveHandle.y);
                    ctx.lineTo(moveHandle.x + iconSize, moveHandle.y);
                    ctx.moveTo(moveHandle.x, moveHandle.y - iconSize);
                    ctx.lineTo(moveHandle.x, moveHandle.y + iconSize);
                    ctx.lineWidth = 1 * uiScale;
                    ctx.strokeStyle = '#2196F3';
                    ctx.stroke();
                    ctx.restore();
                }

                // Eğri kontrol noktası (curved arrow için)
                if (obj.type === 'arrow' && obj.pathType === 'curved' && obj.curveControlPoint) {
                    ctx.save();
                    ctx.fillStyle = '#FF9800'; // Turuncu renk
                    ctx.strokeStyle = '#F57C00';
                    ctx.lineWidth = 2 * uiScale;
                    ctx.setLineDash([]);

                    // Kontrol noktası daireyi çiz
                    ctx.beginPath();
                    ctx.arc(
                        obj.curveControlPoint.x,
                        obj.curveControlPoint.y,
                        handleSize / 2 + 2 * uiScale,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();
                    ctx.stroke();

                    // Kontrol noktasından start ve end'e ince çizgiler (yardımcı)
                    ctx.strokeStyle = '#FF9800';
                    ctx.lineWidth = 1 * uiScale;
                    ctx.setLineDash([3 * uiScale, 3 * uiScale]);
                    ctx.globalAlpha = 0.5;

                    ctx.beginPath();
                    ctx.moveTo(obj.start.x, obj.start.y);
                    ctx.lineTo(obj.curveControlPoint.x, obj.curveControlPoint.y);
                    ctx.lineTo(obj.end.x, obj.end.y);
                    ctx.stroke();

                    ctx.restore();
                }

                // Dash'i geri al
                ctx.setLineDash([5 * uiScale, 5 * uiScale]);
            }
        });

        ctx.setLineDash([]);
    }

    // Clipboard İşlevleri
    copySelected(state) {
        if (this.selectedObjects.length === 0) return false;

        const items = [];
        this.selectedObjects.forEach(index => {
            const obj = state.objects[index];
            if (obj) {
                // Deep copy to clipboard
                items.push(Utils.deepClone(obj));
            }
        });

        if (items.length > 0) {
            this.clipboard = items; // Array olarak sakla
            return true;
        }

        return false;
    }

    cutSelected(state) {
        if (this.copySelected(state)) {
            return this.deleteSelected(state);
        }
        return null;
    }

    paste(state, offsetX = 20, offsetY = 20) {
        if (!this.clipboard) return null;

        const pastedObjects = [];
        
        // Clipboard array mi tek obje mi kontrolü
        const items = Array.isArray(this.clipboard) ? this.clipboard : [this.clipboard];

        items.forEach(item => {
            // Deep copy clipboard item
            const newObj = Utils.deepClone(item);
            newObj.id = Date.now() + Math.random().toString(36).substr(2, 9); // Ensure unique ID

            // Offset uygula
            this.moveObject(newObj, offsetX, offsetY);
            pastedObjects.push(newObj);
        });

        return pastedObjects;
    }

    // Context Menu İşlevleri
    deleteSelected(state) {
        if (this.selectedObjects.length === 0) return null;

        // Sort indices descending to avoid shift issues
        const indices = [...this.selectedObjects].sort((a, b) => b - a);
        const deletedObjects = [];

        indices.forEach(index => {
            const obj = state.objects[index];
            if (obj && !obj.locked) {
                deletedObjects.push(obj);
                state.objects.splice(index, 1);
            }
        });

        this.selectedObjects = [];
        return deletedObjects.length > 0 ? deletedObjects : null;
    }

    duplicateSelected(state) {
        if (this.selectedObjects.length === 0) return null;

        const copies = this.paste(state, 20, 20); // Reuse paste logic for offset and cloning
        if (!copies || copies.length === 0) return null;

        // Separate tapes from other objects for layering
        const tapes = copies.filter(obj => obj.type === 'tape');
        const others = copies.filter(obj => obj.type !== 'tape');

        const newSelection = [];
        others.forEach(copy => {
            state.objects.push(copy);
            newSelection.push(state.objects.length - 1);
        });
        tapes.forEach(copy => {
            state.objects.push(copy);
            newSelection.push(state.objects.length - 1);
        });

        this.selectedObjects = newSelection;
        return copies;
    }

    bringToFront(state) {
        if (this.selectedObjects.length === 0) return false;

        // Seçili nesneleri mevcut sıralarıyla topla
        const selectedIndices = [...this.selectedObjects].sort((a, b) => a - b);
        const selectedObjs = selectedIndices.map(idx => state.objects[idx]);

        // Nesneleri diziden çıkar (indeks kaymasını önlemek için sondan başla)
        for (let i = selectedIndices.length - 1; i >= 0; i--) {
            state.objects.splice(selectedIndices[i], 1);
        }

        // En sona ekle
        state.objects.push(...selectedObjs);

        // Yeni indeksleri seç
        this.selectedObjects = [];
        for (let i = 0; i < selectedObjs.length; i++) {
            this.selectedObjects.push(state.objects.length - selectedObjs.length + i);
        }
        return true;
    }

    bringForward(state) {
        if (this.selectedObjects.length === 0) return false;

        const selectedIndices = [...this.selectedObjects].sort((a, b) => a - b);
        const maxIdx = selectedIndices[selectedIndices.length - 1];

        // Eğer en üstteki nesne zaten en üstteyse, grubu daha öne getiremeyiz
        if (maxIdx >= state.objects.length - 1) return false;

        // Üzerinden atlayacağımız nesneyi bul
        const targetElement = state.objects[maxIdx + 1];
        const selectedObjs = selectedIndices.map(idx => state.objects[idx]);

        // Seçili nesneleri çıkar
        for (let i = selectedIndices.length - 1; i >= 0; i--) {
            state.objects.splice(selectedIndices[i], 1);
        }

        // Hedef nesnenin yeni yerini bul ve hemen sonrasına ekle
        const newTargetIdx = state.objects.indexOf(targetElement);
        state.objects.splice(newTargetIdx + 1, 0, ...selectedObjs);

        // Seçimi güncelle
        this.selectedObjects = [];
        for (let i = 0; i < selectedObjs.length; i++) {
            this.selectedObjects.push(newTargetIdx + 1 + i);
        }
        return true;
    }

    sendBackward(state) {
        if (this.selectedObjects.length === 0) return false;

        const selectedIndices = [...this.selectedObjects].sort((a, b) => a - b);
        const minIdx = selectedIndices[0];

        // Eğer en alttaki nesne zaten en alttaysa, daha arkaya gönderemeyiz
        if (minIdx <= 0) return false;

        // Altına gireceğimiz nesneyi bul
        const targetElement = state.objects[minIdx - 1];
        const selectedObjs = selectedIndices.map(idx => state.objects[idx]);

        // Background (persistent) nesneleri koru
        const hasNonPersistent = selectedObjs.some(obj => !obj.persistent);
        if (hasNonPersistent && targetElement.persistent) {
            // Persistent olmayan bir nesneyi persistent bir nesnenin arkasına atamayız
            return false;
        }

        // Seçili nesneleri çıkar
        for (let i = selectedIndices.length - 1; i >= 0; i--) {
            state.objects.splice(selectedIndices[i], 1);
        }

        // Hedef nesnenin yeni yerini bul ve hemen öncesine ekle
        const newTargetIdx = state.objects.indexOf(targetElement);
        state.objects.splice(newTargetIdx, 0, ...selectedObjs);

        // Seçimi güncelle
        this.selectedObjects = [];
        for (let i = 0; i < selectedObjs.length; i++) {
            this.selectedObjects.push(newTargetIdx + i);
        }
        return true;
    }

    sendToBack(state) {
        if (this.selectedObjects.length === 0) return false;

        const selectedIndices = [...this.selectedObjects].sort((a, b) => a - b);
        const selectedObjs = selectedIndices.map(idx => state.objects[idx]);

        // Nesneleri diziden çıkar
        for (let i = selectedIndices.length - 1; i >= 0; i--) {
            state.objects.splice(selectedIndices[i], 1);
        }

        // Background (persistent) nesneleri koru.
        // Eğer seçili nesneler arasında persistent olmayan varsa, 
        // onları persistent olanların arkasına geçirmemeliyiz.
        let insertionIndex = 0;
        const hasNonPersistent = selectedObjs.some(obj => !obj.persistent);
        
        if (hasNonPersistent) {
            // Son persistent nesnenin indeksini bul
            for (let i = 0; i < state.objects.length; i++) {
                if (state.objects[i].persistent) {
                    insertionIndex = i + 1;
                }
            }
        }

        // Belirlenen indekse (en başa veya son persistent nesneden sonraya) ekle
        state.objects.splice(insertionIndex, 0, ...selectedObjs);

        // Yeni indeksleri seç
        this.selectedObjects = [];
        for (let i = 0; i < selectedObjs.length; i++) {
            this.selectedObjects.push(insertionIndex + i);
        }
        return true;
    }

    lockSelected(state) {
        if (this.selectedObjects.length === 0) return false;
        this.selectedObjects.forEach(index => {
            const obj = state.objects[index];
            if (obj) {
                obj.locked = true;
            }
        });
        return true;
    }

    unlockSelected(state) {
        if (this.selectedObjects.length === 0) return false;
        this.selectedObjects.forEach(index => {
            const obj = state.objects[index];
            if (obj) {
                obj.locked = false;
            }
        });
        return true;
    }

    handleContextMenu(e, canvas, state) {
        // Seçili nesne yoksa menüyü gösterme
        if (this.selectedObjects.length === 0) return;

        e.preventDefault();

        const menu = document.getElementById('contextMenu');

        // Menüyü konumlandır
        menu.style.left = e.clientX + 'px';

        if (e.clientY > window.innerHeight / 2) {
            menu.style.top = 'auto';
            menu.style.bottom = (window.innerHeight - e.clientY) + 'px';
        } else {
            menu.style.top = e.clientY + 'px';
            menu.style.bottom = 'auto';
        }

        // Prevent overflow on the right
        const menuWidth = 150; // Estimated width or getComputedStyle? Can't get computed easily before display.
        if (e.clientX + menuWidth > window.innerWidth) {
            menu.style.left = 'auto';
            menu.style.right = '10px';
        } else {
            menu.style.right = 'auto';
            menu.style.left = e.clientX + 'px';
        }

        // Check if any selected object is a tape or table
        let hasTape = false;
        let hasTable = false;

        this.selectedObjects.forEach(index => {
            const obj = state.objects[index];
            if (obj) {
                if (obj.type === 'tape') hasTape = true;
                if (obj.type === 'table') hasTable = true;
            }
        });

        // Show/hide table specific options
        const tableOptions = menu.querySelectorAll('.table-option');
        tableOptions.forEach(opt => {
            const isTableSpecific = hasTable && this.selectedObjects.length === 1;
            opt.style.display = isTableSpecific ? (opt.classList.contains('context-menu-separator') ? 'block' : 'flex') : 'none';
        });

        const flipItems = menu.querySelectorAll('[data-action="flipHorizontal"], [data-action="flipVertical"]');
        const layerItems = menu.querySelectorAll('[data-action="bringToFront"], [data-action="bringForward"], [data-action="sendBackward"], [data-action="sendToBack"]');
        const groupItems = menu.querySelectorAll('[data-action="group"], [data-action="ungroup"]');
        const stickerItem = menu.querySelector('[data-action="saveAsSticker"]');
        const separators = menu.querySelectorAll('.context-menu-separator');

        if (hasTape || hasTable) {
            // Hide flip options
            flipItems.forEach(item => item.style.display = 'none');

            if (hasTable) {
                // Table: Hide layering, grouping, stickers as well
                layerItems.forEach(item => item.style.display = 'none');
                groupItems.forEach(item => item.style.display = 'none');
                if (stickerItem) stickerItem.style.display = 'none';

                // Hide most separators for table
                separators.forEach((sep, index) => {
                    // Show separator after Paste(0), Delete(1), Unlock(2) and before TableOptions(4)
                    // Index 4 is the one with class .table-option, which is already handled above
                    if (index === 0 || index === 1 || index === 2) {
                        sep.style.display = 'block';
                    } else if (!sep.classList.contains('table-option')) {
                        sep.style.display = 'none';
                    }
                });
            } else {
                // Tape: Show layering but hide grouping/stickers
                layerItems.forEach(item => item.style.display = 'flex');
                groupItems.forEach(item => item.style.display = 'none');
                if (stickerItem) stickerItem.style.display = 'none';

                separators.forEach((sep, index) => {
                    // Show separator after Paste (0), after Delete (1), and after Unlock (2)
                    if (index === 0 || index === 1 || index === 2) {
                        sep.style.display = 'block';
                    } else if (!sep.classList.contains('table-option')) {
                        sep.style.display = 'none';
                    }
                });
            }
        } else {
            // Show all options for general objects
            flipItems.forEach(item => item.style.display = 'flex');
            layerItems.forEach(item => item.style.display = 'flex');
            groupItems.forEach(item => item.style.display = 'flex');
            if (stickerItem) stickerItem.style.display = 'flex';

            separators.forEach(sep => {
                if (!sep.classList.contains('table-option')) {
                    sep.style.display = 'block';
                }
            });
        }

        // Show/Hide "Change Border Color" only for shapes
        const borderItem = document.getElementById('ctxChangeBorderColor');
        if (borderItem) {
            let isShape = false;
            if (this.selectedObjects.length === 1) {
                const obj = state.objects[this.selectedObjects[0]];
                if (obj && ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'vector-pen'].includes(obj.type)) {
                    isShape = true;
                }
            }
            borderItem.style.display = isShape ? 'flex' : 'none';
        }

        // Show/Hide Lock/Unlock
        const lockItem = menu.querySelector('[data-action="lock"]');
        const unlockItem = menu.querySelector('[data-action="unlock"]');

        if (lockItem && unlockItem) {
            const anyLocked = this.selectedObjects.some(index => state.objects[index] && state.objects[index].locked);
            const anyUnlocked = this.selectedObjects.some(index => state.objects[index] && !state.objects[index].locked);

            lockItem.style.display = anyUnlocked ? 'flex' : 'none';
            unlockItem.style.display = anyLocked ? 'flex' : 'none';
        }

        menu.classList.add('show');

        return true;
    }

    // Flip İşlevleri
    flipHorizontal(state) {
        if (this.selectedObjects.length === 0) return false;

        // Bounding box merkezi hesapla (tüm seçim için)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.selectedObjects.forEach(index => {
            const b = this.getBoundingBox(state.objects[index]);
            minX = Math.min(minX, b.minX);
            minY = Math.min(minY, b.minY);
            maxX = Math.max(maxX, b.maxX);
            maxY = Math.max(maxY, b.maxY);
        });

        const centerX = (minX + maxX) / 2;

        this.selectedObjects.forEach(index => {
            this.flipObjectHorizontal(state.objects[index], centerX);
        });
        return true;
    }

    flipObjectHorizontal(obj, centerX) {
        if (obj.locked) return;
        if (obj._renderCachePoints) delete obj._renderCachePoints;

        if (obj.type === 'group') {
            obj.children.forEach(child => this.flipObjectHorizontal(child, centerX));
            return;
        }

        // Nesneyi yatay eksende çevir
        switch (obj.type) {
            case 'pen':
                obj.points.forEach(point => {
                    point.x = centerX - (point.x - centerX);
                });
                break;

            case 'vector-pen':
                obj.points.forEach(p => {
                    p.point.x = centerX - (p.point.x - centerX);
                    p.handle1.x = centerX - (p.handle1.x - centerX);
                    p.handle2.x = centerX - (p.handle2.x - centerX);
                    // Swap handles to maintain curvature orientation if needed? 
                    // Actually, if we mirror everything, it should just work.
                });
                break;

            case 'line':
            case 'arrow':
                const tempStartX = obj.start.x;
                obj.start.x = centerX - (obj.end.x - centerX);
                obj.end.x = centerX - (tempStartX - centerX);
                break;

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
            case 'cloud':
                if (obj.x !== undefined) {
                    // Reposition centered around centerX
                    obj.x = 2 * centerX - obj.x - obj.width;

                    // Mirror rotation
                    if (obj.rotation !== undefined) obj.rotation = -obj.rotation;
                    if (obj.angle !== undefined) obj.angle = -obj.angle;

                    // Handle internal points if it's a legacy shape with start/end
                    if (obj.start && obj.end) {
                        const tempStartX = obj.start.x;
                        obj.start.x = 2 * centerX - obj.end.x;
                        obj.end.x = 2 * centerX - tempStartX;
                    }
                    if (obj.center) {
                        obj.center.x = 2 * centerX - obj.center.x;
                    }

                    // Toggle scaleX for shapes to flip internal geometry (e.g. parallelogram skew)
                    if (!obj.scaleX) obj.scaleX = 1;
                    obj.scaleX *= -1;

                } else if (obj.start && obj.end) {
                    // Support for line/arrow style objects if they fall here
                    const tempStartX = obj.start.x;
                    obj.start.x = 2 * centerX - obj.end.x;
                    obj.end.x = 2 * centerX - tempStartX;
                    if (obj.angle) obj.angle = -obj.angle;
                }
                break;
        }
    }

    flipVertical(state) {
        if (this.selectedObjects.length === 0) return false;

        // Bounding box merkezi hesapla (tüm seçim için)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.selectedObjects.forEach(index => {
            const b = this.getBoundingBox(state.objects[index]);
            minX = Math.min(minX, b.minX);
            minY = Math.min(minY, b.minY);
            maxX = Math.max(maxX, b.maxX);
            maxY = Math.max(maxY, b.maxY);
        });

        const centerY = (minY + maxY) / 2;

        this.selectedObjects.forEach(index => {
            this.flipObjectVertical(state.objects[index], centerY);
        });
        return true;
    }

    flipObjectVertical(obj, centerY) {
        if (obj.locked) return;
        if (obj._renderCachePoints) delete obj._renderCachePoints;

        if (obj.type === 'group') {
            obj.children.forEach(child => this.flipObjectVertical(child, centerY));
            return;
        }

        // Nesneyi dikey eksende çevir
        switch (obj.type) {
            case 'pen':
                obj.points.forEach(point => {
                    point.y = centerY - (point.y - centerY);
                });
                break;

            case 'vector-pen':
                obj.points.forEach(p => {
                    p.point.y = centerY - (p.point.y - centerY);
                    p.handle1.y = centerY - (p.handle1.y - centerY);
                    p.handle2.y = centerY - (p.handle2.y - centerY);
                });
                break;

            case 'line':
            case 'arrow':
                const tempStartY = obj.start.y;
                obj.start.y = centerY - (obj.end.y - centerY);
                obj.end.y = centerY - (tempStartY - centerY);
                break;

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
            case 'cloud':
                if (obj.x !== undefined) {
                    // Reposition centered around centerY
                    obj.y = 2 * centerY - obj.y - obj.height;

                    // Mirror rotation
                    if (obj.rotation !== undefined) obj.rotation = -obj.rotation;
                    if (obj.angle !== undefined) obj.angle = -obj.angle;

                    // Handle internal points if it's a legacy shape with start/end
                    if (obj.start && obj.end) {
                        const tempStartY = obj.start.y;
                        obj.start.y = 2 * centerY - obj.end.y;
                        obj.end.y = 2 * centerY - tempStartY;
                    }
                    if (obj.center) {
                        obj.center.y = 2 * centerY - obj.center.y;
                    }

                    // Toggle scaleY for shapes to flip internal geometry (e.g. triangle up/down)
                    if (!obj.scaleY) obj.scaleY = 1;
                    obj.scaleY *= -1;

                } else if (obj.start && obj.end) {
                    const tempStartY = obj.start.y;
                    obj.start.y = 2 * centerY - obj.end.y;
                    obj.end.y = 2 * centerY - tempStartY;
                    if (obj.angle) obj.angle = -obj.angle;
                }
                break;
        }
    }



    // Gruplama İşlevleri
    groupSelected(state) {
        if (this.selectedObjects.length < 2) {
            // alert('Gruplamak için en az 2 nesne seçin'); // Alert is interfering sometimes
            return null;
        }

        // Seçilen nesneleri kopyala (referans değil, diziden alacağız)
        // İndeksleri büyükten küçüğe sırala ki silerken kayma olmasın
        const indices = [...this.selectedObjects].sort((a, b) => b - a);
        const children = [];

        // Orijinal sıralamayı korumak için, önce çekelim sonra ters çevirip ekleyelim ya da 
        // indices arrayini ters çevirmeyip, splice yaparken dikkatli olalım.
        // indices: [5, 2, 0] (descending)
        // children dizisine, orijinal sırasıyla (0, 2, 5) girmeli aslında.
        // O yüzden önce nesneleri toplayalım.

        const sortedIndices = [...this.selectedObjects].sort((a, b) => a - b);
        sortedIndices.forEach(idx => {
            children.push(state.objects[idx]);
        });

        // Şimdi state.objects'ten sil (indekslerin kaymaması için büyükten küçüğe)
        indices.forEach(idx => {
            state.objects.splice(idx, 1);
        });

        // Yeni grup oluştur
        const newGroup = {
            type: 'group',
            children: children
        };

        // Grubu ekle
        state.objects.push(newGroup);

        // Yeni grubu seç
        this.selectedObjects = [state.objects.length - 1];

        return newGroup;
    }

    ungroupSelected(state) {
        if (this.selectedObjects.length !== 1) return false;

        const groupIndex = this.selectedObjects[0];
        const groupObj = state.objects[groupIndex];

        if (groupObj.type !== 'group') return false;

        // Grubu sil
        state.objects.splice(groupIndex, 1);

        // Çocukları ana diziye ekle (grubun olduğu yere veya en sona?)
        // Kullanıcı deneyimi için grubun olduğu yere eklemek mantıklı olabilir ama z-index karışabilir.
        // Basitlik için en sona ekleyelim ya da grubun olduğu indexe insert edelim.

        // groupIndex konumuna çocukları insert et
        // splice(start, deleteCount, item1, item2, ...)
        state.objects.splice(groupIndex, 0, ...groupObj.children);

        // Yeni eklenen çocukları seçili yap
        this.selectedObjects = [];
        for (let i = 0; i < groupObj.children.length; i++) {
            this.selectedObjects.push(groupIndex + i);
        }

        return true;
    }

    // Handle Sistemi
    getHandlePositions(bounds, obj = null) {
        const { minX, minY, maxX, maxY } = bounds;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        let handles = {
            // Köşeler
            nw: { x: minX, y: minY },
            ne: { x: maxX, y: minY },
            sw: { x: minX, y: maxY },
            se: { x: maxX, y: maxY },
            // Kenarlar
            n: { x: centerX, y: minY },
            s: { x: centerX, y: maxY },
            e: { x: maxX, y: centerY },
            w: { x: minX, y: centerY },
            // Döndürme (üstte, biraz yukarıda)
            rotate: { x: centerX, y: minY - 30 * (obj && obj.type === 'verticalSpace' ? 0.5 : 1) },
            // Taşıma tutamacı (merkezde)
            move: { x: centerX, y: centerY }
        };

        // Eğer nesne döndürülmüşse, tutamaçları da döndür
        const rotationAngle = obj ? (obj.rotation !== undefined ? obj.rotation : (obj.angle || 0)) : 0;
        if (rotationAngle !== 0) {
            const rotate = (point) => {
                const cos = Math.cos(rotationAngle);
                const sin = Math.sin(rotationAngle);
                return {
                    x: cos * (point.x - centerX) - sin * (point.y - centerY) + centerX,
                    y: sin * (point.x - centerX) + cos * (point.y - centerY) + centerY
                };
            };

            // Tüm tutamaçları döndür
            for (let key in handles) {
                handles[key] = rotate(handles[key]);
            }
        }

        return handles;
    }

    getHandleAtPoint(point, bounds, obj = null) {
        if (obj && obj.locked) return null;

        // Eğer obj parametresi gelmezse ve seçili nesne varsa onu kullan
        if (!obj && this.selectedObjects.length === 1) {
            const index = this.selectedObjects[0];
            // state.objects erişimi için this.state'e ihtiyacımız var ama burada yok
            // Bu nedenle bounds ile birlikte obj da gönderilmeli
        }

        const handles = this.getHandlePositions(bounds, obj);
        const threshold = this.handleSize + 2;

        for (let [name, pos] of Object.entries(handles)) {
            const dist = Math.sqrt(
                Math.pow(point.x - pos.x, 2) +
                Math.pow(point.y - pos.y, 2)
            );
            if (dist <= threshold) {
                return name;
            }
        }
        return null;
    }

    handleResize(handle, obj, startBounds, startPoint, currentPoint) {
        if (obj.locked) return;
        let deltaX = currentPoint.x - startPoint.x;
        let deltaY = currentPoint.y - startPoint.y;

        if (obj._bounds) delete obj._bounds;
        if (obj._renderCachePoints) delete obj._renderCachePoints;

        // Eğer nesnenin açısı varsa, delta'yı yerel koordinatlara çevir
        if ((obj.type === 'rectangle' || obj.type === 'ellipse') && obj.angle) {
            const cos = Math.cos(-obj.angle);
            const sin = Math.sin(-obj.angle);
            const rotatedDeltaX = cos * deltaX - sin * deltaY;
            const rotatedDeltaY = sin * deltaX + cos * deltaY;
            deltaX = rotatedDeltaX;
            deltaY = rotatedDeltaY;
        }

        let newBounds = { ...startBounds };

        // Tutamaca göre bounds güncelle
        switch (handle) {
            case 'se': // Güneydoğu
                newBounds.maxX += deltaX;
                newBounds.maxY += deltaY;
                break;
            case 'nw': // Kuzeybatı
                newBounds.minX += deltaX;
                newBounds.minY += deltaY;
                break;
            case 'ne': // Kuzeydoğu
                newBounds.maxX += deltaX;
                newBounds.minY += deltaY;
                break;
            case 'sw': // Güneybatı
                newBounds.minX += deltaX;
                newBounds.maxY += deltaY;
                break;
            case 'n': // Kuzey
                newBounds.minY += deltaY;
                break;
            case 's': // Güney
                newBounds.maxY += deltaY;
                break;
            case 'e': // Doğu
                newBounds.maxX += deltaX;
                break;
            case 'w': // Batı
                newBounds.minX += deltaX;
                break;
        }

        // Minimum boyut kontrolü
        if (newBounds.maxX - newBounds.minX < 10) return;
        if (newBounds.maxY - newBounds.minY < 10) return;

        // Nesneyi yeni bounds'a uygula
        this.applyBoundsToObject(obj, newBounds);
    }

    applyBoundsToObject(obj, newBounds) {
        let { minX, minY, maxX, maxY } = newBounds;

        // "newBounds" parametresi, kullanıcının gördüğü/tuttuğu "Visual Bounds"dur (Resize handle'ları buna göre çizilir).
        // Ancak primitive nesneler (Line, Rect, Ellipse) "Center/Start/End" koordinatları ile tanımlanır (Stroke dahil değildir).
        // Bu yüzden Visual Bounds'dan Stroke Padding'i ÇIKARMALIYIZ.

        let padding = 0;
        if (obj.strokeWidth !== undefined) {
            padding = obj.strokeWidth / 2;
        } else if (obj.width !== undefined && ['pen', 'highlighter', 'line', 'arrow'].includes(obj.type)) {
            padding = obj.width / 2;
        }

        // Apply Padding Inverse (To get Content Bounds)
        // Eğer Rectangle ise: VisualMinX = ContentMinX - padding. -> ContentMinX = VisualMinX + padding.

        const contentMinX = minX + padding;
        const contentMinY = minY + padding;
        const contentMaxX = maxX - padding;
        const contentMaxY = maxY - padding;

        switch (obj.type) {
            case 'line':
            case 'arrow':
                // Arrow head extra padding check?
                // getBoundingBox obj.type === 'arrow' padding = Math.max(padding, 20 + obj.width)
                // We should match that logic exactly or drag might feel "drifting".
                // But for generic resize, using standard padding is safer unless we want complexities.
                // NOTE: getBoundingBox for Arrow uses EXTRA padding.
                // If we don't account for it here, the arrow will shrink on every interaction.

                let arrowPadding = padding;
                if (obj.type === 'arrow') {
                    // Re-calculate the exact padding used in getBoundingBox to be symmetric
                    // padding = Math.max(obj.width/2, 20 + obj.width)
                    // Wait, getBoundingBox Logic: padding = Math.max(padding, 20 + obj.width);
                    arrowPadding = Math.max(padding, 20 + obj.width);
                }

                // Use Specific Arrow Padding for Arrow
                const aMinX = minX + arrowPadding;
                const aMinY = minY + arrowPadding;
                const aMaxX = maxX - arrowPadding;
                const aMaxY = maxY - arrowPadding;

                // Mevcut yönü koru
                const startX = obj.start.x;
                const endX = obj.end.x;
                const startY = obj.start.y;
                const endY = obj.end.y;

                const isLeftToRight = startX <= endX;
                const isTopToBottom = startY <= endY;

                // Eski kontrol noktası oranlarını hesapla (eğer varsa)
                let relCpX = 0.5, relCpY = 0.5;
                if (obj.curveControlPoint) {
                    const oldDx = endX - startX;
                    const oldDy = endY - startY;

                    if (Math.abs(oldDx) > 0.001) {
                        relCpX = (obj.curveControlPoint.x - startX) / oldDx;
                    }
                    if (Math.abs(oldDy) > 0.001) {
                        relCpY = (obj.curveControlPoint.y - startY) / oldDy;
                    }
                }

                if (isLeftToRight) {
                    obj.start.x = aMinX;
                    obj.end.x = aMaxX;
                } else {
                    obj.start.x = aMaxX;
                    obj.end.x = aMinX;
                }

                if (isTopToBottom) {
                    obj.start.y = aMinY;
                    obj.end.y = aMaxY;
                } else {
                    obj.start.y = aMaxY;
                    obj.end.y = aMinY;
                }

                // Kontrol noktasını güncelle
                if (obj.curveControlPoint) {
                    const newDx = obj.end.x - obj.start.x;
                    const newDy = obj.end.y - obj.start.y;
                    obj.curveControlPoint.x = obj.start.x + relCpX * newDx;
                    obj.curveControlPoint.y = obj.start.y + relCpY * newDy;
                }
                break;

            case 'text':
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
            case 'cloud':
            case 'image':
                // Use standard content bounds (un-padded)
                const shapes = ['text', 'rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'image'];
                const sw = obj.strokeWidth || (shapes.includes(obj.type) ? 0 : (obj.width || 0));
                const padS = sw / 2;
                const cMinX = minX + padS;
                const cMinY = minY + padS;
                const cMaxX = maxX - padS;
                const cMaxY = maxY - padS;

                if (obj.x !== undefined) {
                    obj.x = cMinX;
                    obj.y = cMinY;
                    obj.width = Math.max(0.1, cMaxX - cMinX);
                    obj.height = Math.max(0.1, cMaxY - cMinY);
                } else if (obj.type === 'rectangle') {
                    obj.start = { x: cMinX, y: cMinY };
                    obj.end = { x: cMaxX, y: cMaxY };
                } else if (obj.type === 'ellipse') {
                    const centerX = (cMinX + cMaxX) / 2;
                    const centerY = (cMinY + cMaxY) / 2;
                    obj.center = { x: centerX, y: centerY };
                    obj.radiusX = Math.abs(cMaxX - cMinX) / 2;
                    obj.radiusY = Math.abs(cMaxY - cMinY) / 2;
                    obj.start = { x: cMinX, y: cMinY };
                    obj.end = { x: cMaxX, y: cMaxY };
                }
                break;

            case 'highlighter':
            case 'pen':
                // Pen ve Highlighter için zaten paddingli geliyor ama biz "Content" bounding box'a göre scale etmek istiyoruz.
                // Burada logic biraz daha karışık (Points scaling).
                // Mevcut kodda rMinX/Y hesaplanıp yapılıyordu, orası doğru.
                // Sadece "newBounds"un PADDED olduğunu bilelim.
                // Pen logic (aşağıda) kendi rMinX'ini hesaplıyor (raw points).
                // Scale factor hesaplarken: NewWidth / OldWidth.
                // OldWidth (raw points width).
                // NewWidth? Bizim "newBounds" Visual Bounds.
                // NewContentWidth = newBounds.width - Padding*2.
                // Scale = NewContentWidth / OldWidth.

                // Aşağıdaki Pen logic'i bu padding'i hesaba katmalı.

                let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
                obj.points.forEach(p => {
                    rMinX = Math.min(rMinX, p.x);
                    rMinY = Math.min(rMinY, p.y);
                    rMaxX = Math.max(rMaxX, p.x);
                    rMaxY = Math.max(rMaxY, p.y);
                });

                const oldWidth = Math.max(0.1, rMaxX - rMinX);
                const oldHeight = Math.max(0.1, rMaxY - rMinY);

                // Note: 'newBounds' passed here might be the user's drag selection which matches the VISUAL bounds (padded).
                // If user resizes the handle, they are resizing the VISUAL box.
                // If the visual box has padding, the content box should be smaller.

                // But typically, resize handle logic (handleResize) adds delta to the existing bounds.
                // Existing bounds coming from getBoundingBox (padded).
                // So newBounds is Padded.

                // We need to calculate the NEW CONTENT bounds from the NEW PADDED bounds.
                // Padding amount is obj.width/2 approx.
                const pad = (obj.width || 0) / 2;
                const contentMinX = minX + pad;
                const contentMinY = minY + pad;
                const contentMaxX = maxX - pad;
                const contentMaxY = maxY - pad;

                const newContentWidth = contentMaxX - contentMinX;
                const newContentHeight = contentMaxY - contentMinY;

                const scaleX = newContentWidth / oldWidth;
                const scaleY = newContentHeight / oldHeight;

                obj.points.forEach(point => {
                    point.x = contentMinX + (point.x - rMinX) * scaleX;
                    point.y = contentMinY + (point.y - rMinY) * scaleY;
                });
                break;

            case 'table':
                const oldW = obj.width;
                const oldH = obj.height;
                // Calculate new dimensions based on visual bounds
                const newW = Math.max(10, maxX - minX);
                const newH = Math.max(10, maxY - minY);

                // Update position and dimensions
                obj.x = minX;
                obj.y = minY;
                obj.width = newW;
                obj.height = newH;

                // Scale individual column widths and row heights
                const tableScaleX = newW / oldW;
                const tableScaleY = newH / oldH;

                obj.colWidths = obj.colWidths.map(w => w * tableScaleX);
                obj.rowHeights = obj.rowHeights.map(h => h * tableScaleY);
                break;

            case 'group':
                // Group logic: similar to Pen but recursive
                const gOldBounds = this.getBoundingBox(obj);
                const gOldWidth = Math.max(0.1, gOldBounds.maxX - gOldBounds.minX);
                const gOldHeight = Math.max(0.1, gOldBounds.maxY - gOldBounds.minY);

                const gScaleX = (maxX - minX) / gOldWidth;
                const gScaleY = (maxY - minY) / gOldHeight;

                // We need to transform each child such that it maintains relative position to group bounds
                // NewChildBounds = NewGroupMin + (ChildBounds - GroupOldMin) * Scale

                // But we can't just set bounds, we have to APPLY bounds recursively.
                // So we calculate the target bounds for the child and call applyBoundsToObject on it.

                obj.children.forEach(child => {
                    const childBounds = this.getBoundingBox(child);
                    const childRelX = childBounds.minX - gOldBounds.minX;
                    const childRelY = childBounds.minY - gOldBounds.minY;
                    const childWidth = childBounds.maxX - childBounds.minX;
                    const childHeight = childBounds.maxY - childBounds.minY;

                    const newChildMinX = minX + childRelX * gScaleX;
                    const newChildMinY = minY + childRelY * gScaleY;
                    const newChildWidth = childWidth * gScaleX;
                    const newChildHeight = childHeight * gScaleY;

                    this.applyBoundsToObject(child, {
                        minX: newChildMinX,
                        minY: newChildMinY,
                        maxX: newChildMinX + newChildWidth,
                        maxY: newChildMinY + newChildHeight
                    });
                });
                break;
        }
    }

    handleRotate(obj, centerPoint, startPoint, currentPoint) {
        // Başlangıç açısı
        const startAngle = Math.atan2(
            startPoint.y - centerPoint.y,
            startPoint.x - centerPoint.x
        );

        // Mevcut açı
        const currentAngle = Math.atan2(
            currentPoint.y - centerPoint.y,
            currentPoint.x - centerPoint.x
        );

        // Açı farkı (radyan)
        const deltaAngle = currentAngle - startAngle;

        const allShapes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud', 'image', 'sticker'];

        if (allShapes.includes(obj.type)) {
            // Primitive şekiller için açı özelliğini güncelle
            if (!this.originalObjectState) {
                this.originalObjectState = Utils.deepClone(obj);
                this.originalObjectState.startRotation = obj.rotation !== undefined ? obj.rotation : (obj.angle || 0);
            }

            const newAngle = (this.originalObjectState.startRotation || 0) + deltaAngle;
            if (obj.x !== undefined || obj.center) {
                obj.rotation = newAngle;
                obj.angle = newAngle; // Sync both
            } else {
                obj.angle = newAngle;
                obj.rotation = newAngle; // Sync both for compatibility
            }
        } else {
            // Diğerleri için (line, arrow, pen) nokta dönüşümü yap
            if (!this.originalObjectState) {
                this.originalObjectState = Utils.deepClone(obj);
            }
            // Orijinal nesneden başlayarak döndür
            this.rotateObjectFromOriginal(obj, this.originalObjectState, deltaAngle, centerPoint);
        }
    }

    rotateObjectFromOriginal(obj, originalObj, angle, centerPoint) {
        if (obj._renderCachePoints) delete obj._renderCachePoints;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rotatePoint = (p) => ({
            x: cos * (p.x - centerPoint.x) - sin * (p.y - centerPoint.y) + centerPoint.x,
            y: sin * (p.x - centerPoint.x) + cos * (p.y - centerPoint.y) + centerPoint.y
        });

        if (obj.type === 'group' && originalObj.type === 'group') {
            obj.children.forEach((child, index) => {
                this.rotateObjectFromOriginal(child, originalObj.children[index], angle, centerPoint);
            });
            return;
        }

        switch (obj.type) {
            case 'highlighter':
            case 'charcoal':
            case 'fountain-pen':
            case 'pen':
                obj.points = originalObj.points.map(p => {
                    const rp = rotatePoint(p);
                    return {
                        ...p,
                        x: rp.x,
                        y: rp.y
                    };
                });
                break;

            case 'vector-pen':
                obj.points = originalObj.points.map((p, i) => {
                    const origP = originalObj.points[i];
                    return {
                        ...p,
                        point: rotatePoint(origP.point),
                        handle1: rotatePoint(origP.handle1),
                        handle2: rotatePoint(origP.handle2)
                    };
                });
                break;

            case 'line':
            case 'arrow':
                obj.start = rotatePoint(originalObj.start);
                obj.end = rotatePoint(originalObj.end);
                break;

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
            case 'cloud':
                // 1. Merkezlerini (veya start/end noktalarını) taşı
                if (originalObj.start && originalObj.end) {
                    obj.start = rotatePoint(originalObj.start);
                    obj.end = rotatePoint(originalObj.end);
                } else if (originalObj.center) {
                    obj.center = rotatePoint(originalObj.center);
                } else if (originalObj.x !== undefined) {
                    const center = { x: originalObj.x + originalObj.width / 2, y: originalObj.y + originalObj.height / 2 };
                    const rotatedCenter = rotatePoint(center);
                    obj.x = rotatedCenter.x - originalObj.width / 2;
                    obj.y = rotatedCenter.y - originalObj.height / 2;
                }

                // 2. Kendi ekseni etrafındaki açıyı güncelle
                const newA = (originalObj.rotation !== undefined ? originalObj.rotation : (originalObj.angle || 0)) + angle;
                obj.rotation = newA;
                obj.angle = newA;
                break;
        }
    }

    rotateObject(obj, angle, centerPoint) {
        if (obj.locked) return;
        if (obj.type === 'group') {
            obj.children.forEach(child => this.rotateObject(child, angle, centerPoint));
            return;
        }

        if (obj._renderCachePoints) delete obj._renderCachePoints;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rotatePoint = (point) => {
            const x = point.x - centerPoint.x;
            const y = point.y - centerPoint.y;
            return {
                ...point, // Diğer özellikleri koru
                x: cos * x - sin * y + centerPoint.x,
                y: sin * x + cos * y + centerPoint.y
            };
        };

        switch (obj.type) {
            case 'line':
            case 'arrow':
                obj.start = rotatePoint(obj.start);
                obj.end = rotatePoint(obj.end);
                break;

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
            case 'cloud':
                // 1. Position update (center of gravity or center of x/y)
                if (obj.x !== undefined) {
                    const center = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
                    const rotatedCenter = rotatePoint(center);
                    obj.x = rotatedCenter.x - obj.width / 2;
                    obj.y = rotatedCenter.y - obj.height / 2;
                } else if (obj.start && obj.end) {
                    obj.start = rotatePoint(obj.start);
                    obj.end = rotatePoint(obj.end);
                } else if (obj.center) {
                    obj.center = rotatePoint(obj.center);
                }

                // 2. Rotation update
                if (obj.rotation !== undefined) {
                    obj.rotation += angle;
                } else {
                    obj.angle = (obj.angle || 0) + angle;
                }
                break;

            case 'pen':
            case 'fountain-pen':
            case 'charcoal':
            case 'highlighter':
                obj.points = obj.points.map(rotatePoint);
                break;
            case 'vector-pen':
                obj.points = obj.points.map(p => {
                    return {
                        ...p,
                        point: rotatePoint(p.point),
                        handle1: rotatePoint(p.handle1),
                        handle2: rotatePoint(p.handle2)
                    };
                });
                break;
        }
    }

    hideContextMenu() {
        const menu = document.getElementById('contextMenu');
        if (menu) {
            menu.classList.remove('show');
        }
    }

    updateSelectedObjectsStyle(state, style) {
        this.selectedObjects.forEach(index => {
            const obj = state.objects[index];
            if (obj) {
                this.updateObjectStyle(obj, style);
            }
        });
    }

    updateObjectStyle(obj, style) {
        if (obj.type === 'group') {
            obj.children.forEach(child => this.updateObjectStyle(child, style));
            return;
        }

        if (obj._renderCachePoints && (style.width !== undefined || style.lineStyle !== undefined)) {
            delete obj._renderCachePoints;
        }

        if (style.color !== undefined) {
            if (obj.type === 'table') {
                obj.borderColor = style.color;
            } else {
                obj.color = style.color;
                // Eger obje doluysa fill rengini de guncelle (stayFillColor seçeneği yoksa)
                if (!style.stayFillColor && (obj.filled || obj.fillColor && obj.fillColor !== 'transparent')) {
                    obj.fillColor = style.color;
                }
            }
        }
        if (style.fillColor !== undefined) {
            obj.fillColor = style.fillColor;
        }
        if (style.filled !== undefined) {
            obj.filled = style.filled;
        }
        if (style.width !== undefined) {
            const shapes = ['rectangle', 'rect', 'ellipse', 'triangle', 'trapezoid', 'star', 'diamond', 'parallelogram', 'oval', 'heart', 'cloud'];
            if (shapes.includes(obj.type)) {
                obj.strokeWidth = style.width;
            } else if (obj.type === 'tape') {
                obj.thickness = style.width;
            } else if (obj.type === 'table') {
                obj.borderWidth = style.width;
            } else {
                obj.width = style.width;
            }
        }
        if (style.lineStyle !== undefined) {
            obj.lineStyle = style.lineStyle;
        }
        if (style.opacity !== undefined) {
            obj.opacity = style.opacity;
            if (obj.type === 'tape') obj.originalOpacity = style.opacity;
        }
        if (style.highlighterCap !== undefined) {
            obj.cap = style.highlighterCap;
        }
        if (style.arrowStartStyle !== undefined) {
            obj.startStyle = style.arrowStartStyle;
        }
        if (style.arrowEndStyle !== undefined) {
            obj.endStyle = style.arrowEndStyle;
        }
        if (style.arrowPathType !== undefined) {
            obj.pathType = style.arrowPathType;
        }

        // Tape Specific Style Updates
        if (obj.type === 'tape') {
            if (style.tapeMode !== undefined) obj.mode = style.tapeMode;
            if (style.tapePattern !== undefined) obj.pattern = style.tapePattern;
            if (style.customImage !== undefined) obj.customImage = style.customImage;
            if (style.customMask !== undefined) obj.customMask = style.customMask;
        }
    }

    startLongPressTimer(e, canvas, state) {
        if (this.longPressTimer) clearTimeout(this.longPressTimer);

        this.longPressStartPos = { x: e.clientX, y: e.clientY };

        this.longPressTimer = setTimeout(() => {
            const fakeEvent = {
                preventDefault: () => { },
                clientX: this.longPressStartPos.x,
                clientY: this.longPressStartPos.y,
                target: e.target
            };

            this.handleContextMenu(fakeEvent, canvas, state);
            this.longPressTimer = null;
            if (navigator.vibrate) navigator.vibrate(50);

        }, this.LONG_PRESS_DURATION);
    }

    isNearTableDivider(obj, point, threshold = 8) {
        if (obj.type !== 'table') return null;

        // Check horizontal lines
        // 1. Top border
        if (point.x >= obj.x && point.x <= obj.x + obj.width &&
            Math.abs(point.y - obj.y) <= threshold) {
            return { type: 'row', index: -1 };
        }

        let currentY = obj.y;
        for (let r = 0; r < obj.rows; r++) {
            currentY += obj.rowHeights[r];
            if (point.x >= obj.x && point.x <= obj.x + obj.width &&
                Math.abs(point.y - currentY) <= threshold) {
                return { type: 'row', index: r };
            }
        }

        // Check vertical lines
        // 1. Left border
        if (point.y >= obj.y && point.y <= obj.y + obj.height &&
            Math.abs(point.x - obj.x) <= threshold) {
            return { type: 'col', index: -1 };
        }

        let currentX = obj.x;
        for (let c = 0; c < obj.cols; c++) {
            currentX += obj.colWidths[c];
            if (point.y >= obj.y && point.y <= obj.y + obj.height &&
                Math.abs(point.x - currentX) <= threshold) {
                return { type: 'col', index: c };
            }
        }
        return null;
    }

    detectTableCell(obj, point) {
        if (obj.type !== 'table') return null;

        // Find which cell contains the click point
        let currentY = obj.y;
        for (let r = 0; r < obj.rows; r++) {
            const rHeight = obj.rowHeights[r];
            if (point.y >= currentY && point.y <= currentY + rHeight) {
                let currentX = obj.x;
                for (let c = 0; c < obj.cols; c++) {
                    const cWidth = obj.colWidths[c];
                    if (point.x >= currentX && point.x <= currentX + cWidth) {
                        return { row: r, col: c };
                    }
                    currentX += cWidth;
                }
            }
            currentY += rHeight;
        }
        return null;
    }
}
