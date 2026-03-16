/**
 * TabManager - Manages multiple betik tabs (boards) in a dropdown
 */
class TabManager {
    constructor(app) {
        this.app = app;
        this.tabs = []; // Array of { boardId, title }
        this.activeBoardId = null;

        // DOM Elements
        this.container = document.querySelector('.tab-selector-container');
        this.currentTabBtn = document.getElementById('current-tab-btn');
        this.activeTabName = document.getElementById('active-tab-name');
        this.tabDropdown = document.getElementById('tab-dropdown');

        this.setupDropdown();
    }

    setupDropdown() {
        if (!this.currentTabBtn) return;

        // Toggle dropdown
        this.currentTabBtn.onclick = (e) => {
            e.stopPropagation();
            const isShowing = this.tabDropdown.classList.contains('show');
            this.tabDropdown.classList.toggle('show');
            this.container.classList.toggle('active');

            // Hide properties sidebar if we are opening the dropdown
            if (!isShowing && this.app.propertiesSidebar) {
                this.app.propertiesSidebar.hide();
            }
        };

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.tabDropdown.classList.remove('show');
                this.container.classList.remove('active');
            }
        });
    }

    /**
     * Open a board as a new tab
     */
    async openBoard(boardId, boardTitle, templateId = null) {
        const existingTab = this.tabs.find(t => t.boardId === boardId);

        if (existingTab) {
            await this.switchToBoard(boardId, templateId);
        } else {
            this.tabs.push({
                boardId: boardId,
                title: boardTitle
            });
            await this.switchToBoard(boardId, templateId);
        }

        this.renderTabs();
    }

    /**
     * Switch to a specific board tab
     */
    async switchToBoard(boardId, templateId = null) {
        if (this.activeBoardId === boardId) return;

        // Save current board
        if (this.activeBoardId && window.dashboard) {
            window.dashboard.currentBoardId = this.activeBoardId;
            try {
                await window.dashboard.saveCurrentBoard(true); // Force save before switching
            } catch (e) {
                console.error('[TabManager] Save failed during switch:', e);
            }
        }

        this.activeBoardId = boardId;

        // Update UI
        const tab = this.tabs.find(t => t.boardId === boardId);
        if (tab && this.activeTabName) {
            this.activeTabName.textContent = tab.title;
        }

        // Load content
        if (window.dashboard) {
            window.dashboard.currentBoardId = boardId;
            await window.dashboard.loadBoardContent(boardId, templateId);
        }

        this.tabDropdown.classList.remove('show');
        this.container.classList.remove('active');
        this.renderTabs();
    }

    /**
     * Close a tab
     */
    async closeTab(boardId, event) {
        if (event) {
            event.stopPropagation();
        }

        if (this.tabs.length <= 1) {
            if (window.dashboard) {
                await window.dashboard.showDashboard();
            }
            this.tabs = [];
            this.activeBoardId = null;
            if (this.activeTabName) this.activeTabName.textContent = 'Sekme Seçin';
            this.renderTabs();
            return;
        }

        const tabIndex = this.tabs.findIndex(t => t.boardId === boardId);
        if (tabIndex === -1) return;

        if (this.activeBoardId === boardId && window.dashboard) {
            try {
                await window.dashboard.saveCurrentBoard(true);
            } catch (e) {
                console.error('[TabManager] Save failed during close:', e);
            }
        }

        this.tabs.splice(tabIndex, 1);

        if (this.activeBoardId === boardId) {
            const newActiveIndex = Math.max(0, tabIndex - 1);
            this.switchToBoard(this.tabs[newActiveIndex].boardId);
        } else {
            this.renderTabs();
        }
    }

    /**
     * Update tab title
     */
    updateTabTitle(boardId, newTitle) {
        const tab = this.tabs.find(t => t.boardId === boardId);
        if (tab) {
            tab.title = newTitle;
            if (this.activeBoardId === boardId && this.activeTabName) {
                this.activeTabName.textContent = newTitle;
            }
            this.renderTabs();
        }
    }

    /**
     * Clear all tabs
     */
    async clearAllTabs() {
        if (this.activeBoardId && window.dashboard) {
            try {
                await window.dashboard.saveCurrentBoard(true);
            } catch (e) {
                console.error('[TabManager] Save failed during clear all:', e);
            }
        }
        this.tabs = [];
        this.activeBoardId = null;
        if (this.activeTabName) this.activeTabName.textContent = 'Sekme Seçin';
        this.renderTabs();
    }

    /**
     * Render tabs in the Dropdown
     */
    renderTabs() {
        if (!this.tabDropdown) return;

        this.tabDropdown.innerHTML = '';

        this.tabs.forEach(tab => {
            const item = document.createElement('div');
            item.className = `tab-dropdown-item ${tab.boardId === this.activeBoardId ? 'active' : ''}`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tab-name';
            nameSpan.textContent = tab.title;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close-btn';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = (e) => this.closeTab(tab.boardId, e);

            item.onclick = () => this.switchToBoard(tab.boardId);

            item.appendChild(nameSpan);
            item.appendChild(closeBtn);
            this.tabDropdown.appendChild(item);
        });
    }
}
