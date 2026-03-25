// calendar.js - Modern Takvim Mantığı ve Entegrasyonu
class BetikCalendar {
    constructor(containerId, app) {
        this.containerId = containerId;
        this.app = app;
        this.currentDate = new Date();
        this.selectedDate = this.formatDate(new Date()); // Default to today
        this.sidebarTab = 'all'; // 'all' or 'day'
        this.initialized = false;
        this.visible = false;
    }

    init() {
        if (this.initialized) return;
        this.container = document.getElementById(this.containerId);
        this.render();
        this.initialized = true;
        this.setupDraggableBoards();
        this.observeDashboard();
    }

    get notes() {
        return this.app.dashboard ? this.app.dashboard.boards : [];
    }

    get themeColor() {
        return (this.app.dashboard && this.app.dashboard.viewSettings && this.app.dashboard.viewSettings.iconColor) || '#3498db';
    }

    render() {
        if (!this.container) return;
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const monthName = this.currentDate.toLocaleString('tr-TR', { month: 'long', year: 'numeric' });
        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        let html = `
            <div class="calendar-wrapper animate-fade-in">
                <div class="calendar-header">
                    <button class="calendar-nav-btn" onclick="window.calendar.prevMonth()">‹</button>
                    <h2>${monthName}</h2>
                    <button class="calendar-nav-btn" onclick="window.calendar.nextMonth()">›</button>
                </div>
                <div class="calendar-grid">
                    ${['Pt', 'Sa', 'Çr', 'Pr', 'Cu', 'Ct', 'Pz'].map(day => `<div class="day-name">${day}</div>`).join('')}
        `;

        const emptyDays = firstDay === 0 ? 6 : firstDay - 1;
        for (let i = 0; i < emptyDays; i++) html += `<div class="day empty"></div>`;

        for (let date = 1; date <= lastDate; date++) {
            const currentLoopDate = new Date(year, month, date);
            const dateStr = this.formatDate(currentLoopDate);
            const dayNotes = this.notes.filter(n => this.formatDate(new Date(n.lastModified)) === dateStr && !n.deleted);
            const isToday = new Date().toDateString() === currentLoopDate.toDateString();
            const isSelected = this.selectedDate === dateStr;

            // Heatmap intensity (0-4)
            const heatLevel = Math.min(dayNotes.length, 4);
            const heatClass = heatLevel > 0 ? `heat-${heatLevel}` : '';

            html += `
                <div class="day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${heatClass}" 
                     onclick="window.calendar.selectDate('${dateStr}')"
                     ondragover="window.calendar.handleDragOver(event)"
                     ondragleave="window.calendar.handleDragLeave(event)"
                     ondrop="window.calendar.handleDrop(event, '${dateStr}')">
                    <div class="day-header">
                        <span class="day-number">${date}</span>
                        <button class="add-note-inline" onclick="event.stopPropagation(); window.calendar.createNewNoteForDate('${dateStr}')" title="Bu güne not ekle">+</button>
                    </div>
                    <div class="note-indicators">
                        ${dayNotes.slice(0, 4).map(n => `
                            <span class="note-dot" 
                                  style="background:${n.coverBg || this.themeColor}" 
                                  title="${n.name}"></span>
                        `).join('')}
                        ${dayNotes.length > 4 ? `<span class="more-indicator">+${dayNotes.length - 4}</span>` : ''}
                    </div>
                    ${dayNotes.length > 0 ? `
                        <div class="day-preview-tooltip">
                            <div style="font-weight:700; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                                ${dayNotes.length} Not
                            </div>
                            ${dayNotes.slice(0, 3).map(n => `
                                <div class="preview-item">
                                    <span class="preview-dot" style="background:${n.coverBg || this.themeColor}"></span>
                                    <span class="preview-title">${n.name}</span>
                                </div>
                            `).join('')}
                            ${dayNotes.length > 3 ? `<div style="font-size:10px; color:#888; margin-top:5px;">+${dayNotes.length - 3} daha...</div>` : ''}
                        </div>
                    ` : ''}
                </div>`;
        }
        this.container.innerHTML = html + `</div></div>`;
    }

    formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
    prevMonth() { this.currentDate.setMonth(this.currentDate.getMonth() - 1); this.render(); }
    nextMonth() { this.currentDate.setMonth(this.currentDate.getMonth() + 1); this.render(); }

    selectDate(dateStr) {
        this.selectedDate = dateStr;
        
        // Find notes for this day
        const dayNotes = this.notes.filter(n => {
            const noteDate = new Date(n.lastModified);
            return this.formatDate(noteDate) === dateStr && !n.deleted;
        });

        // Always stay on calendar and show notes in sidebar
        this.render(); // Highlight selected day
        this.switchSidebarTab('day'); // Show 'Günün Notları' tab

        if (dayNotes.length === 0) {
            // Show a small toast/popup if no notes found
            if (window.Utils?.showToast) {
                const displayDate = new Date(dateStr).toLocaleDateString('tr-TR');
                window.Utils.showToast(`${displayDate} tarihinde henüz bir notunuz yok.`, 'info');
            }
        }
    }

    show() {
        this.visible = true;
        document.getElementById('boardGrid').style.display = 'none';
        
        // Ensure calendar containers exist
        let calendarContent = document.getElementById('calendarContent');
        if (!calendarContent) {
            const container = document.getElementById('calendarContainer');
            container.innerHTML = `
                <div id="calendarContent" class="calendar-content-main"></div>
                <div id="calendarSidebar" class="calendar-sidebar-panel">
                    <div class="sidebar-tabs">
                        <button class="sidebar-tab-btn active" id="tabAllNotes" onclick="window.calendar.switchSidebarTab('all')">Tüm Notlar</button>
                        <button class="sidebar-tab-btn" id="tabDayNotes" onclick="window.calendar.switchSidebarTab('day')">Günün Notları</button>
                    </div>
                    <div id="calendarSidebarList" class="sidebar-panel-list"></div>
                </div>
            `;
            this.container = document.getElementById('calendarContent');
        }

        const container = document.getElementById('calendarContainer');
        if (container) {
            container.style.display = 'flex'; // Use flex for side-by-side
            this.render();
            this.renderSidebarNotes();
        }
        
        const breadcrumb = document.querySelector('.breadcrumb');
        if (breadcrumb) breadcrumb.textContent = 'Betik / Takvim';
    }

    renderSidebarNotes() {
        const sidebarList = document.getElementById('calendarSidebarList');
        if (!sidebarList) return;

        let notesToShow = [];
        if (this.sidebarTab === 'all') {
            notesToShow = this.notes
                .filter(n => !n.deleted)
                .sort((a, b) => b.lastModified - a.lastModified);
        } else {
            notesToShow = this.notes
                .filter(n => !n.deleted && this.formatDate(new Date(n.lastModified)) === this.selectedDate)
                .sort((a, b) => b.lastModified - a.lastModified);
        }

        if (notesToShow.length === 0) {
            sidebarList.innerHTML = `<div class="sidebar-empty-state">Bu kategoriye ait not bulunamadı.</div>`;
            return;
        }

        sidebarList.innerHTML = notesToShow.map(n => `
            <div class="sidebar-note-item" draggable="true" data-id="${n.id}">
                <div class="note-item-dot" style="background:${n.coverBg || this.themeColor}"></div>
                <div class="note-item-title">${n.name}</div>
            </div>
        `).join('');

        // Add drag listeners
        sidebarList.querySelectorAll('.sidebar-note-item').forEach(item => {
            item.ondragstart = (e) => {
                e.dataTransfer.setData("text/plain", item.dataset.id);
                item.style.opacity = '0.5';
                item.classList.add('dragging');
            };
            item.ondragend = () => {
                item.style.opacity = '1';
                item.classList.remove('dragging');
            };
        });
    }

    switchSidebarTab(tab) {
        this.sidebarTab = tab;
        document.getElementById('tabAllNotes').classList.toggle('active', tab === 'all');
        document.getElementById('tabDayNotes').classList.toggle('active', tab === 'day');
        this.renderSidebarNotes();
    }

    hide() {
        this.visible = false;
        document.getElementById('boardGrid').style.display = 'grid';
        const container = document.getElementById('calendarContainer');
        if (container) container.style.display = 'none';
    }

    setupDraggableBoards() {
        const observer = new MutationObserver(() => {
            document.querySelectorAll('.board-card').forEach(card => {
                if (!card.draggable) {
                    card.draggable = true;
                    card.addEventListener('dragstart', (e) => { 
                        e.dataTransfer.setData("text/plain", card.dataset.id); 
                        card.classList.add('dragging');
                        
                        // Create a ghost image if possible
                        if (e.dataTransfer.setDragImage) {
                            const ghost = card.cloneNode(true);
                            ghost.style.position = "absolute";
                            ghost.style.top = "-1000px";
                            ghost.style.width = "150px";
                            ghost.style.opacity = "0.8";
                            document.body.appendChild(ghost);
                            e.dataTransfer.setDragImage(ghost, 75, 75);
                            setTimeout(() => document.body.removeChild(ghost), 0);
                        }
                    });
                    card.addEventListener('dragend', () => card.classList.remove('dragging'));
                }
            });
        });
        const boardGrid = document.getElementById('boardGrid');
        if (boardGrid) observer.observe(boardGrid, { childList: true });
    }

    async createNewNoteForDate(dateStr) {
        if (!this.app.dashboard) return;
        
        const [y, m, d] = dateStr.split('-').map(Number);
        const newDate = new Date(y, m - 1, d, 12, 0, 0); // Set to noon
        
        const id = 'b_' + Date.now();
        const baseName = 'Yeni Not';
        let name = baseName;
        let counter = 1;
        const existingNames = this.app.dashboard.boards.filter(b => !b.deleted).map(b => b.name.trim());

        if (existingNames.includes(baseName)) {
            while (existingNames.includes(`${baseName} ${counter}`)) counter++;
            name = `${baseName} ${counter}`;
        }

        const newBoard = {
            id: id,
            name: name,
            lastModified: newDate.getTime(),
            favorite: false,
            deleted: false,
            objectCount: 0,
            preview: null,
            folderId: null,
            coverBg: this.themeColor,
            coverTexture: 'linear'
        };

        this.app.dashboard.boards.push(newBoard);
        await this.app.dashboard.saveDataAsync('wb_boards', this.app.dashboard.boards);
        
        // Refresh and show toast
        this.render();
        this.renderSidebarNotes();
        if (window.Utils?.showToast) window.Utils.showToast(`Yeni not ${dateStr} tarihine eklendi.`);
    }

    handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; e.currentTarget.classList.add('drag-over'); }
    handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
    async handleDrop(e, dateStr) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const boardId = e.dataTransfer.getData("text/plain");
        const board = this.notes.find(b => b.id === boardId);
        if (board) {
            const [y, m, d] = dateStr.split('-').map(Number);
            const newDate = new Date(board.lastModified);
            newDate.setFullYear(y); newDate.setMonth(m - 1); newDate.setDate(d);
            board.lastModified = newDate.getTime();
            await this.app.dashboard.saveDataAsync('wb_boards', this.app.dashboard.boards);
            this.render();
            if (window.Utils?.showToast) window.Utils.showToast(`${board.name} notu ${dateStr} tarihine taşındı.`);
        }
    }

    observeDashboard() {
        // Global listener for nav-item clicks to handle dynamic sidebar items
        document.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem && navItem.id !== 'navCalendar') {
                this.hide();
            }
        });
    }
}

(function() {
    const init = () => {
        if (!window.app || !window.app.dashboard) { setTimeout(init, 100); return; }
        const boardGrid = document.getElementById('boardGrid');
        if (boardGrid && !document.getElementById('calendarContainer')) {
            const calendarContainer = document.createElement('div');
            calendarContainer.id = 'calendarContainer';
            calendarContainer.style.display = 'none';
            boardGrid.parentNode.insertBefore(calendarContainer, boardGrid);
        }
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav && !document.getElementById('navCalendar')) {
            const firstSection = sidebarNav.querySelector('.nav-section');
            const calendarNavItem = document.createElement('div');
            calendarNavItem.className = 'nav-item';
            calendarNavItem.id = 'navCalendar';
            calendarNavItem.innerHTML = `<app-icon name="calendar" class="nav-icon"></app-icon><span>Takvim</span>`;
            calendarNavItem.onclick = () => {
                if (window.app && window.app.dashboard) {
                    window.app.dashboard.switchView('calendar');
                }
            };
            firstSection.appendChild(calendarNavItem);
        }
        window.calendar = new BetikCalendar('calendarContainer', window.app);
        window.calendar.init();
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
