/**
 * PWA Update Manager (Temporarily disabled for diagnostics)
 */
function initPWAUpdates() {
    console.log('PWA: Update manager is disabled to fix launch errors.');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWAUpdates);
} else {
    initPWAUpdates();
}
