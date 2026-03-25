/**
 * PWA Güncelleme Yöneticisi
 */
function initPWAUpdates() {
    if ('serviceWorker' in navigator) {
        // Service Worker'ı kaydet
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('PWA: ServiceWorker başarıyla kaydedildi.');

                // 1. Sayfa yüklendiğinde zaten bekleyen bir güncelleme var mı?
                if (registration.waiting) {
                    showUpdateNotification(registration);
                }

                // 2. Yeni bir güncelleme bulunduğunda
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        // Yeni worker yüklendiğinde ve hazır olduğunda
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification(registration);
                        }
                    });
                });
            })
            .catch(error => {
                console.error('PWA: ServiceWorker kaydı başarısız:', error);
            });

        // Yeni Service Worker kontrolü ele aldığında sayfayı yenile
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });
    }
}

/**
 * Kullanıcıya güncelleme mevcut olduğunu bildiren bir banner gösterir.
 */
function showUpdateNotification(registration) {
    // Eğer zaten bir banner varsa tekrar ekleme
    if (document.getElementById('pwa-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #2d3436;
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        border: 1px solid rgba(255,255,255,0.1);
    `;

    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">
            <app-icon name="star-06" alt="star"></app-icon>
            </span>
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 14px; font-weight: 600;">Yeni Versiyon Hazır</span>
                <span style="font-size: 12px; opacity: 0.8;">Değişiklikleri görmek için yenileyin.</span>
            </div>
        </div>
        <button id="pwa-refresh-btn" style="
            background: #0984e3;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            white-space: nowrap;
            transition: background 0.2s;
        ">Şimdi Yenile</button>
    `;

    document.body.appendChild(banner);

    // Animasyonla içeri kaydır
    requestAnimationFrame(() => {
        banner.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Yenile butonuna tıklandığında SKIP_WAITING gönder
    document.getElementById('pwa-refresh-btn').addEventListener('click', () => {
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            // Eğer bir sebeple waiting yoksa direkt yenile
            window.location.reload();
        }
    });
}

// DOM hazır olduğunda başlat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWAUpdates);
} else {
    initPWAUpdates();
}
