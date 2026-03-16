class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;
    }

    saveState(data) {
        // Deep clone the input data (objects and/or settings)
        const state = Utils.deepClone(data);
        this.undoStack.push(state);

        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        // Clear redo stack on new state
        this.redoStack = [];
    }

    undo(currentData) {
        if (this.undoStack.length === 0) return null;

        // Save current to redo
        this.redoStack.push(Utils.deepClone(currentData));

        return this.undoStack.pop();
    }

    redo(currentData) {
        if (this.redoStack.length === 0) return null;

        // Save current to undo
        this.undoStack.push(Utils.deepClone(currentData));

        return this.redoStack.pop();
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}
