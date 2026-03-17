// Yardımcı Fonksiyonlar
const Utils = {
    // İki nokta arası mesafe
    distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    // Performans için kare mesafe (sqrt gerektirmez)
    sqDistance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return dx * dx + dy * dy;
    },

    // Basınç değerini normalize et
    normalizePressure(pressure) {
        // Fare kullanıyorsa 0.5, stylus kullanıyorsa gerçek basınç
        return pressure || 0.5;
    },

    // Basınca göre çizgi kalınlığı hesapla
    getPressureWidth(baseWidth, pressure) {
        const p = (pressure !== undefined && !isNaN(pressure)) ? pressure : 0.5;
        // 0.4x ile 1.6x arası dengeli bir aralık
        return baseWidth * (0.4 + p * 1.2);
    },

    // Noktaları yumuşat (Douglas-Peucker benzeri)
    simplifyPoints(points, tolerance = 2) {
        if (points.length < 3) return points;

        const simplified = [points[0]];

        for (let i = 1; i < points.length - 1; i++) {
            const prev = simplified[simplified.length - 1];
            const curr = points[i];

            if (this.distance(prev, curr) > tolerance) {
                simplified.push(curr);
            }
        }

        simplified.push(points[points.length - 1]);
        return simplified;
    },

    // Basınç değerlerini yumuşat
    smoothPressure(points) {
        if (points.length < 3) return points;

        const smoothed = points.map(p => ({ ...p }));

        for (let pass = 0; pass < 1; pass++) {
            for (let i = 1; i < smoothed.length - 1; i++) {
                const prev = smoothed[i - 1].pressure !== undefined ? smoothed[i - 1].pressure : 0.5;
                const curr = smoothed[i].pressure !== undefined ? smoothed[i].pressure : 0.5;
                const next = smoothed[i + 1].pressure !== undefined ? smoothed[i + 1].pressure : 0.5;
                smoothed[i].pressure = (prev + curr * 2 + next) / 4;
            }
        }

        return smoothed;
    },

    // Catmull-Rom interpolasyon
    getCatmullRomPoint(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        return {
            x: 0.5 * ((2 * p1.x) +
                (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y: 0.5 * ((2 * p1.y) +
                (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        };
    },

    // Vektör İşlemleri
    vecSub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y };
    },
    vecAdd(a, b) {
        return { x: a.x + b.x, y: a.y + b.y };
    },
    vecMul(a, n) {
        return { x: a.x * n, y: a.y * n };
    },
    vecDiv(a, n) {
        return { x: a.x / n, y: a.y / n };
    },
    vecLen(a) {
        return Math.sqrt(a.x * a.x + a.y * a.y);
    },
    vecNormalize(a) {
        const len = this.vecLen(a);
        return len === 0 ? { x: 0, y: 0 } : this.vecDiv(a, len);
    },
    vecPerp(a) {
        return { x: -a.y, y: a.x };
    },
    vecLrp(a, b, t) {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            pressure: (a.pressure !== undefined && b.pressure !== undefined)
                ? a.pressure + (b.pressure - a.pressure) * t
                : (a.pressure || b.pressure || 0.5)
        };
    },
    // Chaikin Smoothing Pass
    chaikin(points, iterations = 1) {
        if (points.length < 3) return points;
        let smoothed = points;
        for (let i = 0; i < iterations; i++) {
            const next = [smoothed[0]];
            for (let j = 0; j < smoothed.length - 1; j++) {
                const p0 = smoothed[j];
                const p1 = smoothed[j + 1];
                next.push(this.vecLrp(p0, p1, 0.25));
                next.push(this.vecLrp(p0, p1, 0.75));
            }
            next.push(smoothed[smoothed.length - 1]);
            smoothed = next;
        }
        return smoothed;
    },

    // Point to segment distance
    distToSegment(p, v, w) {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return this.distance(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return this.distance(p, {
            x: v.x + t * (w.x - v.x),
            y: v.y + t * (w.y - v.y)
        });
    },

    // Line segment (p1, p2) intersection with Rectangle (rect:{x,y,width,height})
    lineRectIntersect(p1, p2, rect) {
        const minX = rect.x;
        const minY = rect.y;
        const maxX = rect.x + rect.width;
        const maxY = rect.y + rect.height;

        // Cohen-Sutherland Line Clipping Algorithm simplified usually works, 
        // or just check intersection with 4 sides.

        // Helper to check line intersection
        const intersect = (x1, y1, x2, y2, x3, y3, x4, y4) => {
            const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            if (denom === 0) return false;
            const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
            const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
            return (ua >= 0 && ua <= 1) && (ub >= 0 && ub <= 1);
        };

        // Check 4 sides of rect
        const topLeft = { x: minX, y: minY };
        const topRight = { x: maxX, y: minY };
        const bottomRight = { x: maxX, y: maxY };
        const bottomLeft = { x: minX, y: maxY };

        if (intersect(p1.x, p1.y, p2.x, p2.y, topLeft.x, topLeft.y, topRight.x, topRight.y)) return true;
        if (intersect(p1.x, p1.y, p2.x, p2.y, topRight.x, topRight.y, bottomRight.x, bottomRight.y)) return true;
        if (intersect(p1.x, p1.y, p2.x, p2.y, bottomRight.x, bottomRight.y, bottomLeft.x, bottomLeft.y)) return true;
        if (intersect(p1.x, p1.y, p2.x, p2.y, bottomLeft.x, bottomLeft.y, topLeft.x, topLeft.y)) return true;

        // Check if line is completely inside (already handled by point check, but harmless to repeat implicitly if endpoints are inside)
        // If one point inside, it's intersection.
        if ((p1.x >= minX && p1.x <= maxX && p1.y >= minY && p1.y <= maxY) ||
            (p2.x >= minX && p2.x <= maxX && p2.y >= minY && p2.y <= maxY)) {
            return true;
        }

        return false;
    },
    // Line segment (p1, p2) intersection with Line segment (p3, p4)
    lineLineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return false;
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        return (ua >= 0 && ua <= 1) && (ub >= 0 && ub <= 1);
    },
    // Deep clone objects whilst preserving Canvas/Image references
    deepClone(obj, seen = new WeakMap()) {
        if (obj === null || typeof obj !== 'object') return obj;

        // IndexedDB compatibility: Never clone DOM elements, maintain Ref if needed elsewhere
        // but for deep cloning state, we usually want to avoid these if possible
        if (obj instanceof HTMLCanvasElement || obj instanceof HTMLImageElement || obj instanceof Node) {
            return obj; 
        }

        // Handle circular references
        if (seen.has(obj)) {
            return seen.get(obj);
        }

        if (Array.isArray(obj)) {
            const arrClone = [];
            seen.set(obj, arrClone);
            for (let i = 0; i < obj.length; i++) {
                arrClone[i] = this.deepClone(obj[i], seen);
            }
            return arrClone;
        }

        const clonedObj = {};
        seen.set(obj, clonedObj);
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const val = obj[key];
                // Skip functions and other non-clonable bits
                if (typeof val === 'function') continue;
                clonedObj[key] = this.deepClone(val, seen);
            }
        }
        return clonedObj;
    },
    // Rainbow Gradient Helpers
    getRainbowGradient(ctx, points) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        if (maxX - minX < 1) maxX = minX + 10;
        if (maxY - minY < 1) maxY = minY + 10;
        const gradient = ctx.createLinearGradient(minX, minY, maxX, maxY);
        gradient.addColorStop(0, "red");
        gradient.addColorStop(0.17, "yellow");
        gradient.addColorStop(0.33, "green");
        gradient.addColorStop(0.5, "cyan");
        gradient.addColorStop(0.66, "blue");
        gradient.addColorStop(0.83, "magenta");
        gradient.addColorStop(1, "red");
        return gradient;
    },
    getRainbowGradientForRect(ctx, x, y, width, height) {
        const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
        gradient.addColorStop(0, "red");
        gradient.addColorStop(0.17, "yellow");
        gradient.addColorStop(0.33, "green");
        gradient.addColorStop(0.5, "cyan");
        gradient.addColorStop(0.66, "blue");
        gradient.addColorStop(0.83, "magenta");
        gradient.addColorStop(1, "red");
        return gradient;
    },
    // IndexedDB for large file storage (PDFs)
    db: {
        name: 'BetikPDFDB',
        store: 'pdfs',
        version: 1,
        async open() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.name, this.version);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.store)) {
                        db.createObjectStore(this.store);
                    }
                };
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            });
        },
        async save(id, blob) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.store, 'readwrite');
                tx.objectStore(this.store).put(blob, id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        },
        async get(id) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.store, 'readonly');
                const request = tx.objectStore(this.store).get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        async delete(id) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.store, 'readwrite');
                tx.objectStore(this.store).delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
    },

    // Toast Notification System
    showToast(message, type = 'info') {
        let toast = document.getElementById('betik-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'betik-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 110px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(40,40,40,0.95);
                color: white;
                padding: 10px 24px;
                border-radius: 24px;
                font-size: 14px;
                z-index: 20000;
                pointer-events: none;
                transition: opacity 0.3s, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                border: 1px solid rgba(255,255,255,0.1);
            `;
            document.body.appendChild(toast);
        }

        const icons = {
            'success': '✅',
            'error': '❌',
            'info': 'ℹ️',
            'warning': '⚠️'
        };

        toast.innerHTML = `<span style="font-size: 16px;">${icons[type] || ''}</span> <span style="font-weight: 500;">${message}</span>`;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';

        if (this._toastTimeout) clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
        }, 2500);
    },

    // Global Confirmation Dialog
    showConfirm({ title, message, confirmText = 'Onayla', cancelText = 'İptal', type = 'danger' }) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-dialog-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
                display: flex; align-items: center; justify-content: center;
                z-index: 30000; animation: fadeIn 0.2s ease-out;
            `;

            const btnClass = type === 'danger' ? 'btn-danger' : 'btn-primary';
            
            overlay.innerHTML = `
                <div class="confirm-dialog" style="
                    background: white; width: 320px; padding: 24px;
                    border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                    animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                ">
                    <h3 style="margin-top: 0; font-size: 18px; margin-bottom: 12px;">${title}</h3>
                    <p style="color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">${message}</p>
                    <div class="confirm-dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button class="btn-cancel" style="
                            padding: 8px 16px; border-radius: 10px; border: 1px solid #e0e0e0;
                            background: #f8f9fa; color: #495057; cursor: pointer; font-size: 13px; font-weight: 600;
                        ">${cancelText}</button>
                        <button class="${btnClass}" style="
                            padding: 8px 16px; border-radius: 10px; border: none;
                            background: ${type === 'danger' ? '#fa5252' : '#228be6'};
                            color: white; cursor: pointer; font-size: 13px; font-weight: 600;
                        ">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const cancelBtn = overlay.querySelector('.btn-cancel');
            const confirmBtn = overlay.querySelector(`.${btnClass}`);

            const cleanup = (result) => {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            cancelBtn.onclick = () => cleanup(false);
            confirmBtn.onclick = () => cleanup(true);
            overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
        });
    }
};
