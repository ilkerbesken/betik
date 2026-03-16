/**
 * PWA Update Manager
 * Handles Service Worker registration and update notifications inside the App Menu
 */
function initPWAUpdates() {
    console.log('PWA: Initializing update manager...');

    if ('serviceWorker' in navigator) {
        let newWorker;
        const menuUpdate = document.getElementById('menuUpdateApp');
        const menuSeparator = document.getElementById('menuUpdateSeparator');

        if (!menuUpdate) {
            console.warn('PWA: Update menu item not found!');
            return;
        }

        function handleUpdate(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            console.log('PWA: Update button clicked. worker ready?', !!newWorker);
            if (newWorker) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
            } else {
                console.warn('PWA: No new worker found to skip waiting');
                menuUpdate.style.display = 'none';
                if (menuSeparator) menuSeparator.style.display = 'none';
            }
        }

        // Attach events to menu item
        menuUpdate.addEventListener('click', handleUpdate);

        function showUpdateOption() {
            console.log('PWA: Showing update option in menu');
            menuUpdate.style.display = 'flex';
            if (menuSeparator) menuSeparator.style.display = 'block';
        }

        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('PWA: Service Worker registered');

            // Check if there is already a waiting worker
            if (reg.waiting) {
                console.log('PWA: Found waiting worker');
                newWorker = reg.waiting;
                showUpdateOption();
            }

            reg.addEventListener('updatefound', () => {
                console.log('PWA: New update found, installing...');
                newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    console.log('PWA: Worker state changed to:', newWorker.state);
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('PWA: Update fully installed and ready');
                        showUpdateOption();
                    }
                });
            });

            // Periodic check for updates (every hour)
            setInterval(() => {
                console.log('PWA: Checking for updates...');
                reg.update();
            }, 1000 * 60 * 60);

            window.addEventListener('focus', () => {
                reg.update();
            });
        }).catch(err => {
            console.error('PWA: Service Worker registration failed:', err);
        });

        // Reload when the new service worker takes over
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            console.log('PWA: Controller changed, reloading page...');
            window.location.reload();
            refreshing = true;
        });
    } else {
        console.log('PWA: Service workers not supported');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWAUpdates);
} else {
    initPWAUpdates();
}
