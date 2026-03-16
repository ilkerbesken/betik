class HandTool {
    constructor(zoomManager) {
        this.zoomManager = zoomManager;
    }

    handlePointerDown(e) {
        // Start panning via ZoomManager
        this.zoomManager.startPan(e);
    }

    handlePointerMove(e) {
        // Pan logic is handled in ZoomManager.updatePan() which is called by App.js
        // when zoomManager.isPanning is true.
        // However, if we want drag behavior without Spacebar, we rely on App.js delegation.
        // But App.js calls tool.handlePointerMove if NOT panning via spacebar.
        // So we need to trigger updatePan here if we started it manually?

        // Actually, ZoomManager.startPan sets isPanning = true.
        // App.js checks `if (this.zoomManager.isPanning)` in handlePointerMove and calls updatePan.
        // So we might not even need code here if App.js check is generic.

        // Let's verify App.js:
        // handlePointerMove(e) {
        //    if (this.zoomManager.isPanning) { ... }
        // }

        // So yes, once startPan sets isPanning, App.js handles the rest.
        // We just return true to indicate handled?
        return true;
    }

    handlePointerUp(e) {
        this.zoomManager.endPan();
    }
}
