class Dashboard {
    constructor(app) {
        this.app = app;
        app.dashboard = this;
        this.container = document.getElementById('dashboard');
        this.appContainer = document.getElementById('app');
        this.boardGrid = document.getElementById('boardGrid');
        this.btnNewBoard = document.getElementById('btnNewBoard');
        this.btnNewFolder = document.getElementById('btnNewFolder');
        this.breadcrumb = document.querySelector('.breadcrumb');
        this.folderList = document.getElementById('folderList');
        this.searchInput = document.getElementById('searchInput');
        this.mobileSearchInput = document.getElementById('mobileSearchInput');
        this.searchClearBtn = document.getElementById('searchClear');
        this.mobileSearchClearBtn = document.getElementById('mobileSearchClear');
        this.btnEmptyTrash = document.getElementById('btnEmptyTrash');
        this.btnSelectAll = document.getElementById('btnSelectAll');
        this.btnSelectAllMobile = document.getElementById('btnSelectAllMobile');
        this.loader = document.getElementById('dashboardLoader');




        this.currentBoardId = null;
        this.currentView = 'all';
        this.searchTerm = '';
        this.selectedBoards = new Set();
        this.bulkMode = false;
        this.currentView = 'all';
        this.searchTerm = '';


        this.boards = [];
        this.folders = [];
        this.viewSettings = { gridSize: 'xsmall' };
        this.expandedFolders = [];
        this.customCovers = [];

        this.defaultCovers = [
            { id: 'c1', bg: '#ff5c5c', texture: 'dots' },
            { id: 'c2', bg: '#ffb85c', texture: 'linear' },
            { id: 'c3', bg: '#ffd900', texture: 'linear' },
            { id: 'c4', bg: '#fab005', texture: 'linear' },
            { id: 'c5', bg: '#5cbd62', texture: 'linear' },
            { id: 'c6', bg: '#5c9bfe', texture: 'dots' },
            { id: 'c7', bg: '#b45cff', texture: 'dots' },
            { id: 'c8', bg: '#313131ff', texture: 'linear' }
        ];
        this.customCovers = []; // Will load in initAsync

        this.initAsync();
        this.setupAutosaveFlush();
    }

    async initAsync() {
        // Initialize FileSystemManager first
        await window.fileSystemManager.init();

        // Now load data using the new async manager
        this.boards = await this.loadDataAsync('wb_boards', []);
        this.folders = await this.loadDataAsync('wb_folders', []);
        this.viewSettings = await this.loadDataAsync('wb_view_settings', { gridSize: 'xsmall' });
        this.expandedFolders = await this.loadDataAsync('wb_expanded_folders', []);
        this.customCovers = await this.loadDataAsync('wb_custom_covers', []);

        this.init();
        this.setupStorageSettings();

        // ─── Cloud Sync Logic ─────────────────────────────────────
        if (localStorage.getItem('betik_gdrive_token')) {
            setTimeout(async () => {
                const cloud = new CloudStorageManager(this.app);

                // If local storage is empty, attempt a full restore from Drive
                if (this.boards.length === 0) {
                    console.log('[Dashboard] Local storage empty, attempting to restore from Google Drive...');
                    const res = await cloud.loadFromGoogleDrive();
                    if (res.success) {
                        // Refresh UI with new data
                        await this.initAsync();
                        return;
                    }
                }

                // Normal background sync
                cloud.syncWithGoogleDrive().catch(() => { });
            }, 1500);

            this.setupAutoSync();
        }
    }

    // Sync wrappers for legacy components
    loadData(key, defaultValue) {
        const local = localStorage.getItem(key);
        return local ? JSON.parse(local) : defaultValue;
    }

    saveData(key, value) {
        this.saveDataAsync(key, value);
    }

    getCloudSync() {
        if (!this._cloudStorage && window.CloudStorageManager) {
            this._cloudStorage = new window.CloudStorageManager(this.app);
        }
        return this._cloudStorage;
    }

    async _syncDeletionToDrive(ids) {
        if (!ids || ids.length === 0) return;
        const list = Array.isArray(ids) ? ids : [ids];
        if (localStorage.getItem('betik_gdrive_token')) {
            const cloud = this.getCloudSync();
            if (cloud) {
                await cloud.deleteFromDrive(list);
            }
        }
    }


    init() {
        // Storage Permission Alert handling
        const banner = document.getElementById('storageAlertBanner');
        const btnGrant = document.getElementById('btnGrantStoragePermission');
        if (banner && btnGrant) {
            const hasStored = !!window.fileSystemManager.storedHandle;
            const hasActive = !!window.fileSystemManager.dirHandle;

            if (hasStored && !hasActive) {
                banner.style.display = 'flex';
                btnGrant.onclick = async () => {
                    const success = await window.fileSystemManager.requestStoredPermission();
                    if (success) {
                        banner.style.display = 'none';
                        await this.initAsync();
                    }
                };
            } else {
                banner.style.display = 'none';
            }
        }

        try {
            this.renderSidebar();
            this.renderBoards();

            if (this.btnNewBoard) {
                this.btnNewBoard.onclick = () => {
                    console.log('New Board clicked');
                    this.createNewBoard();
                };

            } else {
                console.warn('btnNewBoard element not found.');
            }

            if (this.btnNewFolder) {
                this.btnNewFolder.onclick = () => {
                    console.log('New Folder clicked');
                    this.createNewFolder();
                };
            }

            // Mobile New Board
            const btnNewBoardMobile = document.getElementById('btnNewBoardMobile');
            if (btnNewBoardMobile) {
                btnNewBoardMobile.onclick = () => this.createNewBoard();
            }

            // Import Modal handling
            this.btnImport = document.getElementById('btnImport');
            const btnImportMobile = document.getElementById('btnImportMobile');
            this.importModal = document.getElementById('importModal');
            const btnCloseImportModal = document.getElementById('btnCloseImportModal');

            const btnModalUploadPDF = document.getElementById('btnModalUploadPDF');
            const btnModalOpenTom = document.getElementById('btnModalOpenTom');
            this.pdfInput = document.getElementById('pdfInput');
            this.tomInput = document.getElementById('tomInput');

            const toggleImportModal = (show) => {
                if (!this.importModal) return;
                console.log('toggleImportModal:', show);
                if (show) {
                    this.importModal.classList.add('show');
                } else {
                    this.importModal.classList.remove('show');
                }
            };

            if (this.btnImport) {
                this.btnImport.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleImportModal(true);
                };
            }
            if (btnImportMobile) {
                btnImportMobile.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleImportModal(true);
                };
            }
            if (btnCloseImportModal) {
                btnCloseImportModal.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleImportModal(false);
                };
            }

            // Close modal when clicking outside
            this.importModal?.addEventListener('click', (e) => {
                if (e.target === this.importModal) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleImportModal(false);
                }
            });

            if (btnModalUploadPDF) {
                btnModalUploadPDF.onclick = () => {
                    toggleImportModal(false);
                    this.pdfInput.click();
                };
            }

            if (this.pdfInput) {
                this.pdfInput.onchange = (e) => this.handlePDFUpload(e);
            }

            if (btnModalOpenTom) {
                btnModalOpenTom.onclick = () => {
                    toggleImportModal(false);
                    if (this.app.tikFileManager) {
                        this.app.tikFileManager.openTomFile();
                    } else {
                        this.tomInput.click();
                    }
                };
            }

            // Template Gallery
            this.btnOpenTemplates = document.getElementById('btnOpenTemplates');
            const btnOpenTemplatesMobile = document.getElementById('btnOpenTemplatesMobile');

            const triggerTemplates = () => this.openTemplateGallery();

            if (this.btnOpenTemplates) {
                this.btnOpenTemplates.onclick = triggerTemplates;
            }
            if (btnOpenTemplatesMobile) {
                btnOpenTemplatesMobile.onclick = triggerTemplates;
            }
            if (this.btnEmptyTrash) {
                this.btnEmptyTrash.onclick = () => this.emptyTrash();
            }

            this.setupAppNavigation();
            this.setupViewOptions();
            this.setupSearch();
            this.setupCoverModal();
            this.setupSelectAll();

            this.applyViewSettings();


            document.addEventListener('keydown', (e) => {
                // Ctrl/Cmd + S: Save
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    if (this.currentBoardId) {
                        this.saveCurrentBoard();
                        console.log('Saved!');
                    }
                }

                // Ctrl/Cmd + N: New note
                if ((e.ctrlKey || e.metaKey) && e.key === 'n' && this.container.style.display !== 'none') {
                    e.preventDefault();
                    this.createNewBoard();
                }

                // Ctrl/Cmd + F: Search focus
                if ((e.ctrlKey || e.metaKey) && e.key === 'f' && this.container.style.display !== 'none') {
                    e.preventDefault();
                    const visibleSearch = window.innerWidth <= 768 ? this.mobileSearchInput : this.searchInput;
                    visibleSearch?.focus();
                }

                // Escape: Clear Search or Selection
                if (e.key === 'Escape') {
                    if (this.selectedBoards.size > 0) {
                        this.clearSelection();
                    } else if (this.searchTerm) {
                        this.clearSearch();
                    }
                }

                // Ctrl/Cmd + A: Select All (only if dashboard is visible)
                if ((e.ctrlKey || e.metaKey) && e.key === 'a' && this.container.style.display !== 'none') {
                    const activeElement = document.activeElement;
                    const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.contentEditable === 'true';

                    if (!isInput) {
                        e.preventDefault();
                        this.toggleSelectAll();
                    }
                }
            });

            // Initialize Bulk Actions Logic
            this.setupBulkActions();

        } catch (err) {
            console.error('Dashboard init error:', err);
        }
    }

    async loadDataAsync(key, defaultValue) {
        return await window.fileSystemManager.getItem(key, defaultValue);
    }

    async saveDataAsync(key, value) {
        if (!key || key.includes('null') || key.includes('undefined')) {
            console.warn('[Dashboard] Geçersiz anahtar engellendi:', key);
            return;
        }

        // Fast purification check for IndexedDB compatibility.
        // Instead of full JSON stringify/parse which is slow on huge arrays,
        // we only perform it if we suspect the data might contain "live" objects.
        let safeValue = value;
        const heavyKeys = ['wb_boards', 'wb_folders'];
        const contentKey = key.startsWith('wb_content_');

        if (heavyKeys.includes(key) || contentKey) {
            // Note: The content itself is already mostly cleaned by serializeObj in saveCurrentBoard.
            // But if we still see errors, we might need a shallow check here.
            // For now, let's trust our improved serializeObj and only catch if put fails.
        }

        try {
            await window.fileSystemManager.saveItem(key, safeValue);
        } catch (error) {
            if (error.name === 'DataCloneError') {
                console.warn('[Dashboard] DataCloneError detected during save. Performing emergency purification for key:', key);
                try {
                    // Emergency slow pass only when actually needed
                    safeValue = JSON.parse(JSON.stringify(value));
                    await window.fileSystemManager.saveItem(key, safeValue);
                    console.info('[Dashboard] Emergency purification successful.');
                } catch (innerError) {
                    console.error('[Dashboard] Emergency purification failed:', innerError);
                }
            } else {
                throw error;
            }
        }
    }

    // Keep aliases for backward compatibility but make them async
    async loadData(key, defaultValue) {
        return await this.loadDataAsync(key, defaultValue);
    }

    async saveData(key, value) {
        await this.saveDataAsync(key, value);
    }

    isMobile() {
        return window.innerWidth <= 768;
    }

    async toggleFolder(folderId) {
        const index = this.expandedFolders.indexOf(folderId);
        if (index === -1) {
            this.expandedFolders.push(folderId);
        } else {
            this.expandedFolders.splice(index, 1);
        }
        await this.saveDataAsync('wb_expanded_folders', this.expandedFolders);
        this.renderSidebar();
    }

    showLoading() {
        if (this.loader) this.loader.style.display = 'flex';
    }

    hideLoading() {
        if (this.loader) this.loader.style.display = 'none';
    }

    renderSidebar() {
        this.folderList.innerHTML = '';

        // Listeners for static nav items (Tüm Sayfalar, Son Kullanılanlar, vb.)
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            const view = item.dataset.view;
            if (view && !view.startsWith('f_')) {
                item.onclick = () => this.switchView(view);
                item.classList.toggle('active', this.currentView === view);
            }
        });

        // Dynamic Folders Tree
        const rootFolders = this.folders.filter(f => !f.parentId);
        this.renderFolderTree(rootFolders, this.folderList, 0);

        // On mobile, render notes that don't have a folder at the end of the list
        if (this.isMobile()) {
            const orphanNotes = this.boards.filter(b => !b.folderId && !b.deleted);
            if (orphanNotes.length > 0) {
                const orphanSection = document.createElement('div');
                orphanSection.className = 'nav-section';
                orphanSection.innerHTML = '<div class="section-title">DİĞER NOTLAR</div>';

                orphanNotes.forEach(note => {
                    const noteItem = document.createElement('div');
                    noteItem.className = `tree-note-item ${this.currentBoardId === note.id ? 'active' : ''}`;
                    noteItem.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                            <app-icon name="text" class="note-icon" style="width: 14px; height: 14px; opacity: 0.6;"></app-icon>
                            <span class="note-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${note.name}</span>
                        </div>
                        <div class="folder-menu-trigger">⋮</div>
                        <div class="folder-dropdown" style="width: 130px;">
                            <div class="dropdown-item" data-action="rename">
                                <app-icon name="text-cursor" style="width: 12px; opacity: 0.6;"></app-icon>
                                İsmi Değiştir
                            </div>
                            <div class="dropdown-item" data-action="delete" style="color: #fa5252;">
                                <app-icon name="trash" style="width: 12px; opacity: 0.6; filter: invert(36%) sepia(84%) saturate(1450%) hue-rotate(338deg) brightness(98%) contrast(98%);"></app-icon>
                                Sil
                            </div>
                        </div>
                    `;

                    noteItem.onclick = (e) => {
                        if (e.target.closest('.folder-menu-trigger') || e.target.closest('.folder-dropdown') || e.target.closest('.note-name[contenteditable="true"]')) return;
                        this.loadBoard(note.id);
                    };

                    const trigger = noteItem.querySelector('.folder-menu-trigger');
                    const dropdown = noteItem.querySelector('.folder-dropdown');
                    const nameEl = noteItem.querySelector('.note-name');

                    trigger.onclick = (e) => {
                        e.stopPropagation();
                        // Close other dropdowns
                        document.querySelectorAll('.folder-dropdown.show').forEach(d => {
                            if (d !== dropdown) d.classList.remove('show');
                        });
                        dropdown.classList.toggle('show');
                    };

                    dropdown.querySelector('[data-action="rename"]').onclick = (e) => {
                        e.stopPropagation();
                        dropdown.classList.remove('show');
                        nameEl.contentEditable = "true";
                        nameEl.focus();
                        document.execCommand('selectAll', false, null);

                        const saveRename = () => {
                            nameEl.contentEditable = "false";
                            this.renameBoard(note.id, nameEl.textContent);
                        };

                        nameEl.onblur = saveRename;
                        nameEl.onkeydown = (ke) => {
                            if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                        };
                    };

                    dropdown.querySelector('[data-action="delete"]').onclick = (e) => {
                        e.stopPropagation();
                        dropdown.classList.remove('show');
                        this.deleteBoardConfirmation(note.id);
                    };

                    orphanSection.appendChild(noteItem);
                });
                this.folderList.appendChild(orphanSection);
            }
        }

        // Global click listener to close dropdowns
        if (!this.dropdownListenerAttached) {
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.folder-menu-trigger')) {
                    document.querySelectorAll('.folder-dropdown.show').forEach(d => d.classList.remove('show'));
                }

                // Close board actions if clicked outside
                if (!e.target.closest('.board-actions')) {
                    document.querySelectorAll('.board-actions.show').forEach(d => {
                        d.classList.remove('show');
                        const card = d.closest('.board-card');
                        if (card) card.classList.remove('actions-open');
                    });
                }
            });
            this.dropdownListenerAttached = true;
        }

        // Re-render when window is resized to handle mobile/desktop switch
        if (!this.resizeListenerAttached) {
            window.addEventListener('resize', () => {
                this.renderSidebar();
                this.renderBoards();
            });
            this.resizeListenerAttached = true;
        }
    }

    renderFolderTree(folders, container, level) {
        folders.forEach(folder => {
            const isExpanded = this.expandedFolders.includes(folder.id);
            const hasChildren = this.folders.some(f => f.parentId === folder.id) || (this.isMobile() && this.boards.some(b => b.folderId === folder.id && !b.deleted));

            const item = document.createElement('div');
            item.className = `nav-item folder-item ${this.currentView === folder.id ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`;
            item.dataset.view = folder.id;
            item.style.paddingLeft = `${12 + level * 20}px`; // Indentation for subfolders

            const folderColor = folder.color || '#ccc';
            item.innerHTML = `
                <div class="folder-content">
                    <app-icon name="arrow-dashboard" class="folder-chevron ${isExpanded ? 'rotated' : ''}" style="width: 6px; opacity: 0.4; transition: transform 0.2s; margin-right: 4px; ${hasChildren ? '' : 'visibility: hidden;'}"></app-icon>
                    <div class="folder-color-bar" style="background: ${folderColor};"></div>
                    <app-icon name="folder" class="folder-icon"></app-icon>
                    <span class="folder-name" spellcheck="false" style="color: ${folderColor === '#ccc' ? 'inherit' : folderColor};">${folder.name}</span>
                </div>
                <div class="folder-menu-trigger">⋮</div>
                <div class="folder-dropdown">
                    <div class="dropdown-item" data-action="addSub">
                        <app-icon name="git-branch-01" style="width: 12px; opacity: 0.6;"></app-icon>
                        Alt Klasör Ekle
                    </div>
                    ${this.isMobile() ? `
                    <div class="dropdown-item" data-action="addNote">
                        <app-icon name="add-page" style="width: 12px; opacity: 0.6;"></app-icon>
                        Yeni Not Ekle
                    </div>
                    ` : ''}
                    <div class="dropdown-item" data-action="rename">
                        <app-icon name="text-input" style="width: 12px; opacity: 0.6;"></app-icon>
                        İsmi Değiştir
                    </div>
                    <div class="dropdown-item" data-action="delete" style="color: #fa5252;">
                        <app-icon name="trash-02" style="width: 12px; opacity: 0.6; filter: invert(36%) sepia(84%) saturate(1450%) hue-rotate(338deg) brightness(98%) contrast(98%);"></app-icon>
                        Klasörü Sil
                    </div>
                    <div class="folder-color-palette">
                        ${['#ccc', '#b8e994', '#ffbe76', '#ff7979', '#4a90e2', '#862e9c', '#f1c40f', '#1abc9c', '#34495e', '#7f8c8d'].map(c => `
                            <div class="color-option" style="background: ${c}" data-color="${c}" title="Renk Değiştir"></div>
                        `).join('')}
                    </div>
                </div>
            `;

            const chevron = item.querySelector('.folder-chevron');
            if (hasChildren) {
                chevron.onclick = (e) => {
                    e.stopPropagation();
                    this.toggleFolder(folder.id);
                };
            }

            item.onclick = (e) => {
                if (e.target.closest('.folder-menu-trigger') || e.target.closest('.folder-dropdown') || e.target.closest('.folder-chevron')) return;

                // If it's the already active folder, toggle it. Otherwise switch view.
                if (this.currentView === folder.id) {
                    this.toggleFolder(folder.id);
                } else {
                    this.switchView(folder.id);
                    // Also auto-expand when switching to a folder
                    if (!isExpanded) {
                        this.toggleFolder(folder.id);
                    }
                }
            };

            const trigger = item.querySelector('.folder-menu-trigger');
            const dropdown = item.querySelector('.folder-dropdown');
            const nameEl = item.querySelector('.folder-name');

            trigger.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.folder-dropdown.show').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                dropdown.classList.toggle('show');
            };

            dropdown.querySelector('[data-action="addSub"]').onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                this.createNewFolder(folder.id);
                // Ensure parent is expanded when adding child
                if (!this.expandedFolders.includes(folder.id)) {
                    this.toggleFolder(folder.id);
                }
            };

            if (this.isMobile()) {
                dropdown.querySelector('[data-action="addNote"]').onclick = (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    this.currentBoardId = null;
                    this.switchView(folder.id);
                    this.createNewBoard();
                    if (!this.expandedFolders.includes(folder.id)) {
                        this.toggleFolder(folder.id);
                    }
                };
            }

            dropdown.querySelector('[data-action="rename"]').onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                nameEl.contentEditable = "true";
                nameEl.focus();
                document.execCommand('selectAll', false, null);

                nameEl.onblur = () => {
                    nameEl.contentEditable = "false";
                    this.renameFolder(folder.id, nameEl.textContent);
                };
                nameEl.onkeydown = (ke) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                };
            };

            dropdown.querySelector('[data-action="delete"]').onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                this.deleteFolderConfirmation(folder.id);
            };

            dropdown.querySelectorAll('.color-option').forEach(opt => {
                opt.onclick = (e) => {
                    e.stopPropagation();
                    this.changeFolderColor(folder.id, opt.dataset.color);
                    dropdown.classList.remove('show');
                };
            });

            container.appendChild(item);

            // Container for folder children (subfolders and notes)
            if (isExpanded) {
                const childContainer = document.createElement('div');
                childContainer.className = 'folder-children';
                container.appendChild(childContainer);

                // Render notes under this folder if on mobile
                if (this.isMobile()) {
                    const folderNotes = this.boards.filter(b => b.folderId === folder.id && !b.deleted);
                    folderNotes.forEach(note => {
                        const noteItem = document.createElement('div');
                        noteItem.className = `tree-note-item ${this.currentBoardId === note.id ? 'active' : ''}`;
                        noteItem.style.paddingLeft = `${32 + level * 20}px`;
                        noteItem.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                                <app-icon name="text" class="note-icon" style="width: 14px; height: 14px; opacity: 0.6;"></app-icon>
                                <span class="note-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${note.name}</span>
                            </div>
                            <div class="folder-menu-trigger">⋮</div>
                            <div class="folder-dropdown" style="width: 130px;">
                                <div class="dropdown-item" data-action="rename">
                                    <app-icon name="text-cursor" style="width: 10px; opacity: 0.6;"></app-icon>
                                    İsmi Değiştir
                                </div>
                                <div class="dropdown-item" data-action="delete" style="color: #fa5252;">
                                    <app-icon name="trash" style="width: 12px; opacity: 0.6; filter: invert(36%) sepia(84%) saturate(1450%) hue-rotate(338deg) brightness(98%) contrast(98%);"></app-icon>
                                    Sil
                                </div>
                            </div>
                        `;

                        noteItem.onclick = (e) => {
                            if (e.target.closest('.folder-menu-trigger') || e.target.closest('.folder-dropdown') || e.target.closest('.note-name[contenteditable="true"]')) return;
                            this.loadBoard(note.id);
                        };

                        const trigger = noteItem.querySelector('.folder-menu-trigger');
                        const dropdown = noteItem.querySelector('.folder-dropdown');
                        const nameEl = noteItem.querySelector('.note-name');

                        trigger.onclick = (e) => {
                            e.stopPropagation();
                            // Close other dropdowns
                            document.querySelectorAll('.folder-dropdown.show').forEach(d => {
                                if (d !== dropdown) d.classList.remove('show');
                            });
                            dropdown.classList.toggle('show');
                        };

                        dropdown.querySelector('[data-action="rename"]').onclick = (e) => {
                            e.stopPropagation();
                            dropdown.classList.remove('show');
                            nameEl.contentEditable = "true";
                            nameEl.focus();
                            document.execCommand('selectAll', false, null);

                            const saveRename = () => {
                                nameEl.contentEditable = "false";
                                this.renameBoard(note.id, nameEl.textContent);
                            };

                            nameEl.onblur = saveRename;
                            nameEl.onkeydown = (ke) => {
                                if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                            };
                        };

                        dropdown.querySelector('[data-action="delete"]').onclick = (e) => {
                            e.stopPropagation();
                            dropdown.classList.remove('show');
                            this.deleteBoardConfirmation(note.id);
                        };

                        childContainer.appendChild(noteItem);
                    });


                }

                // Render children
                const children = this.folders.filter(f => f.parentId === folder.id);
                if (children.length > 0) {
                    this.renderFolderTree(children, childContainer, level + 1);
                }
            }
        });
    }

    renderBoards() {
        if (!this.boardGrid) return;
        this.boardGrid.innerHTML = '';

        // Use in-memory boards (already up-to-date after any mutation).
        // Do NOT reload from localStorage here — saveData is async and may lag.
        if (!Array.isArray(this.boards)) this.boards = [];

        let filtered = [];

        if (this.currentView === 'trash') {
            filtered = this.boards.filter(b => b.deleted);
        } else {
            // Base filter: non-deleted
            let base = this.boards.filter(b => !b.deleted);

            if (this.currentView === 'all') {
                filtered = base;
            } else if (this.currentView === 'recent') {
                filtered = [...base].sort((a, b) => b.lastModified - a.lastModified);
            } else if (this.currentView === 'favorites') {
                filtered = base.filter(b => b.favorite);
            } else if (this.currentView.startsWith('f_')) {
                filtered = base.filter(b => b.folderId === this.currentView);
            } else {
                filtered = base;
            }
        }

        // Apply Search Filter
        if (this.searchTerm) {
            filtered = filtered.filter(b => b.name.toLowerCase().includes(this.searchTerm));
        }

        this.updateSelectAllButtonState(filtered);


        if (filtered.length === 0 && this.currentView === 'trash') {
            this.boardGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🗑️</div>
                    <h3>Çöp kutusu boş</h3>
                </div>
            `;
            return;
        }

        if (filtered.length === 0 && this.searchTerm) {
            this.boardGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3>"${this.searchTerm}" ile eşleşen not bulunamadı</h3>
                    <button class="btn btn-secondary" id="btnClearSearchGeneric">Aramayı Temizle</button>
                </div>
            `;
            this.boardGrid.querySelector('#btnClearSearchGeneric').onclick = () => this.clearSearch();
            return;
        }

        if (filtered.length === 0 && this.currentView !== 'trash') {
            this.boardGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📁</div>
                    <h3>Henüz not yok</h3>
                    <p>Yeni bir not oluşturmak için + butonuna tıklayın</p>
                    <button class="btn btn-primary" id="btnCreateFirstNote">
                        İlk Notunu Oluştur
                    </button>
                </div>
            `;
            const btn = this.boardGrid.querySelector('#btnCreateFirstNote');
            if (btn) btn.onclick = () => this.createNewBoard();
            return;
        }


        filtered.forEach(board => {
            const card = document.createElement('div');
            card.className = `board-card ${this.selectedBoards.has(board.id) ? 'selected' : ''}`;
            card.dataset.id = board.id;

            // Check if recent (last 24 hours)
            const isRecent = (Date.now() - board.lastModified) < (24 * 60 * 60 * 1000);
            if (isRecent && this.currentView === 'all') {
                card.dataset.recent = "true";
            }

            const hasImage = board.coverImage;
            const coverBg = board.coverBg || '#4a90e2';
            const coverTexture = board.coverTexture || 'linear';

            const notebookCoverHTML = `<div class="notebook-cover ${hasImage ? '' : `cover-texture-${coverTexture}`}"
                         style="background-color: ${coverBg}; ${hasImage ? `background-image: url(${board.coverImage}); background-size: cover; background-position: center;` : ''}">
                        ${board.isPDF
                    ? `<app-icon name="pdf" style="width: 64px; height: 64px; opacity: 0.8; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));"></app-icon>`
                    : ''
                }
                        <div class="notebook-spine"></div>
                   </div>`;

            card.innerHTML = `
                <div class="board-selection" onclick="event.stopPropagation()">
                    <input type="checkbox" class="board-checkbox" 
                           ${this.selectedBoards.has(board.id) ? 'checked' : ''}>
                </div>

                <div class="notebook-container">
                    ${notebookCoverHTML}
                </div>

                <div class="board-info">
                    <div class="board-title" contenteditable="true" spellcheck="false">${board.name}</div>
                    <div class="board-meta">
                        <span>${new Date(board.lastModified).toLocaleDateString()}</span>
                        ${board.isTomFile ? '<span class="tag-tom">.tik</span>' : ''}
                    </div>
                </div>
            `;

            card.querySelector('.board-checkbox').onchange = (e) => {
                this.toggleBoardSelection(board.id, e.target.checked);
            };

            card.onclick = (e) => {
                // Ignore clicks on title and selection
                if (e.target.classList.contains('board-title') ||
                    e.target.closest('.board-selection')) {
                    return;
                }

                // If in bulk mode (at least one selected), clicking card selects it
                if (this.selectedBoards.size > 0 || e.shiftKey) {
                    this.toggleBoardSelection(board.id, !this.selectedBoards.has(board.id));
                    return;
                }

                this.loadBoard(board.id);
            };

            // Long Press for Mobile Selection
            let pressTimer;
            card.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    this.toggleBoardSelection(board.id, true);
                    navigator.vibrate?.(50); // Haptic feedback
                }, 600);
            }, { passive: true });

            card.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
            card.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });

            // Title editing
            const titleEl = card.querySelector('.board-title');
            titleEl.onblur = () => this.renameBoard(board.id, titleEl.textContent);
            titleEl.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
            };

            this.boardGrid.appendChild(card);
        });

        this.setupBoardDragDrop();

        // Add "Create New" card at the end
        if (this.currentView !== 'trash' && !this.searchTerm) {
            const createCard = document.createElement('div');
            createCard.className = 'board-card create-new-card';
            createCard.innerHTML = `
                <div class="notebook-container">
                    <div class="notebook-cover-dashed">
                        <span class="dashed-plus-icon">+</span>
                    </div>
                </div>
                <div class="board-info">
                    <div class="board-title" style="color: #999;">Yeni Not</div>
                </div>
            `;
            createCard.onclick = () => {
                this.createNewBoard();
            };
            this.boardGrid.appendChild(createCard);
        }
    }

    async switchView(view) {
        this.currentView = view;
        const folder = this.folders.find(f => f.id === view);
        const titles = {
            all: 'Tüm Sayfalar',
            recent: 'Son Kullanılanlar',
            favorites: 'Favoriler',
            trash: 'Çöp Kutusu'
        };
        const title = titles[view] || (folder ? folder.name : 'Klasör');
        this.breadcrumb.textContent = `Betik / ${title}`;

        // Show/Hide Empty Trash button
        if (this.btnEmptyTrash) {
            this.btnEmptyTrash.style.display = (view === 'trash') ? 'flex' : 'none';
        }

        this.renderSidebar();
        this.renderBoards();
    }

    async createNewFolder(parentId = null) {
        const id = 'f_' + Date.now();

        // Find a unique name
        const baseName = 'Yeni Klasör';
        let name = baseName;
        let counter = 1;
        const existingNames = this.folders.map(f => f.name.trim());

        if (existingNames.includes(baseName)) {
            while (existingNames.includes(`${baseName} ${counter}`)) {
                counter++;
            }
            name = `${baseName} ${counter}`;
        }

        const newFolder = {
            id: id,
            name: name,
            created: Date.now(),
            parentId: parentId
        };
        // Position at top of dynamic list
        this.folders.unshift(newFolder);
        await this.saveDataAsync('wb_folders', this.folders);
        await this.switchView(id);

        // Auto focus for renaming
        setTimeout(() => {
            const nameEl = document.querySelector(`.nav-item[data-view="${id}"] .folder-name`);
            if (nameEl) {
                nameEl.contentEditable = "true";
                nameEl.focus();
                document.execCommand('selectAll', false, null);

                nameEl.onblur = () => {
                    nameEl.contentEditable = "false";
                    this.renameFolder(id, nameEl.textContent);
                };
                nameEl.onkeydown = (ke) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                };
            }
        }, 150);
    }

    setupStorageSettings() {
        const btnStorage = document.getElementById('btnStorageSettings');
        const modal = document.getElementById('storageSettingsModal');
        const btnClose = document.getElementById('btnCloseStorageSettingsModal');
        const btnCancel = document.getElementById('btnCancelStorageSettings');
        const btnPick = document.getElementById('btnChangeStorageLocation');
        const btnReset = document.getElementById('btnResetStorageLocation');
        const statusText = document.getElementById('currentStorageLocation');

        if (!btnStorage || !modal) return;

        // ─── CloudStorageManager başlat ───────────────────────────
        if (window.CloudStorageManager && !this._cloudStorage) {
            this._cloudStorage = new window.CloudStorageManager(this);
        }

        const updateStatusUI = () => {
            const mode = window.fileSystemManager.mode;
            const hasDir = !!window.fileSystemManager.dirHandle;
            const hasStored = !!window.fileSystemManager.storedHandle;
            const isFileSystemSupported = !!window.showDirectoryPicker;
            const platform = window.CloudStorageManager ? window.CloudStorageManager.detect() : { isMobile: false };

            // 1. Durum Metni UI
            if (mode === 'native' && hasDir) {
                statusText.innerHTML = `Mevcut Konum: <strong style="color: #2b8a3e">Yerel Klasör (${window.fileSystemManager.dirHandle.name})</strong>`;
            } else if (mode === 'native' && hasStored) {
                statusText.innerHTML = `Mevcut Konum: <strong style="color: #f08c00">İzin Bekleniyor (${window.fileSystemManager.storedHandle.name})</strong>`;
            } else {
                statusText.innerHTML = `Mevcut Konum: <strong>Tarayıcı Veritabanı (IndexedDB)</strong>`;
            }

            // 2. Buton ve Destek Notu Yönetimi
            const supportNote = document.getElementById('folderPickerSupportNote');

            if (isFileSystemSupported) {
                // Desteklenen sistem (Chromium Desktop/Android)
                btnPick.style.display = 'flex';
                if (hasDir) {
                    btnPick.innerHTML = '<app-icon name="folder" style="width: 16px; margin-right: 8px; filter: brightness(0) invert(1);"></app-icon> Klasörü Değiştir';
                    btnPick.className = 'btn btn-primary';
                } else if (hasStored) {
                    btnPick.innerHTML = '<app-icon name="folder" style="width: 16px; margin-right: 8px; filter: brightness(0) invert(1);"></app-icon> Erişime İzin Ver';
                    btnPick.className = 'btn btn-warning';
                } else {
                    btnPick.innerHTML = '<app-icon name="folder" style="width: 16px; margin-right: 8px; filter: brightness(0) invert(1);"></app-icon> Yerel Klasör Seç veya Oluştur';
                    btnPick.className = 'btn btn-primary';
                }
                if (supportNote) supportNote.style.display = 'none';
            } else {
                // Desteklenmeyen sistem (iPad/iOS/Firefox/Safari)
                btnPick.style.display = 'none';
                if (supportNote) {
                    if (platform.isMobile) {
                        supportNote.style.display = 'block';
                        supportNote.style.color = '#888';
                        supportNote.innerHTML = 'ℹ️ Bu cihazda tarayıcı içi veritabanı kullanılmaktadır.<br>Yedekleme için Google Drive kullanmanızı öneririz.';
                    } else {
                        // Desktop ama desteklenmiyor (Firefox vs)
                        supportNote.style.display = 'block';
                        supportNote.style.color = '#fa5252';
                        supportNote.innerHTML = '⚠️ Tarayıcınız yerel klasör erişimini desteklemiyor.';
                    }
                }
            }

            // 3. Sıfırla Butonu
            btnReset.style.display = (mode === 'native' || hasStored) ? 'flex' : 'none';

            // ─── Mobil bölümünü göster/gizle ─────────────────────
            const mobileSection = document.getElementById('mobile-storage-section');
            if (mobileSection) {
                if (platform.isMobile || !isFileSystemSupported) {
                    mobileSection.style.display = 'block';
                } else {
                    mobileSection.style.display = 'none';
                }
            }
        };

        btnStorage.onclick = () => {
            console.log('Depolama ayarları butonu tıklandı');
            const innerModal = modal.querySelector('.settings-modal');
            modal.style.display = 'flex';
            modal.classList.add('show');
            if (innerModal) innerModal.classList.add('show');
            updateStatusUI();
        };

        const closeModal = () => {
            const innerModal = modal.querySelector('.settings-modal');
            modal.style.display = 'none';
            modal.classList.remove('show');
            if (innerModal) innerModal.classList.remove('show');
        };
        if (btnClose) btnClose.onclick = closeModal;
        if (btnCancel) btnCancel.onclick = closeModal;
        window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        btnPick.onclick = async () => {
            const success = await window.fileSystemManager.pickStorageFolder();
            if (success) {
                updateStatusUI();
                this.initAsync();
            }
        };

        btnReset.onclick = async () => {
            const confirmed = await Utils.showConfirm({
                title: 'Depolama Konumunu Sıfırla',
                message: 'Depolama konumunu tarayıcıya geri döndürmek istediğinize emin misiniz? (Mevcut verileriniz silinmez, sadece tarayıcı içinde saklanmaya devam eder)',
                confirmText: 'Sıfırla',
                type: 'warning'
            });

            if (confirmed) {
                await window.fileSystemManager.db.settings.delete('folder_handle');
                window.fileSystemManager.dirHandle = null;
                window.fileSystemManager.storedHandle = null;
                window.fileSystemManager.mode = 'indexeddb';
                updateStatusUI();
                await this.initAsync();
            }
        };

        // ─── Mobil Yedekleme Butonları ────────────────────────────
        this._setupMobileStorageButtons();
    }

    _setupMobileStorageButtons() {
        const statusEl = document.getElementById('gdrive-status');
        const setStatus = (msg, isError = false) => {
            if (!statusEl) return;
            statusEl.textContent = msg;
            statusEl.style.color = isError ? '#fa5252' : '#2b8a3e';
        };

        const getCloud = () => {
            if (!this._cloudStorage && window.CloudStorageManager) {
                this._cloudStorage = new window.CloudStorageManager(this);
            }
            return this._cloudStorage;
        };

        // ─── JSON İndir ───────────────────────────────────────────
        const btnExport = document.getElementById('btn-export-json');
        if (btnExport) {
            btnExport.onclick = async () => {
                btnExport.disabled = true;
                btnExport.textContent = '⏳ Hazırlanıyor...';
                const result = await getCloud().exportToFile();
                btnExport.disabled = false;
                btnExport.innerHTML = '⬇️ Dosya Olarak İndir (.json)';
                Utils.showToast(result.message, 'info');
            };
        }

        // ─── JSON Yükle ───────────────────────────────────────────
        const btnImport = document.getElementById('btn-import-json');
        if (btnImport) {
            btnImport.onclick = async () => {
                const result = await getCloud().importFromFile();
                if (result.success) {
                    Utils.showToast(result.message, 'success');
                    await this.initAsync();
                } else if (result.message) {
                    Utils.showToast('Hata: ' + result.message, 'error');
                }
            };
        }

        // ─── Google Drive: Kaydet ─────────────────────────────────
        const btnGDriveSave = document.getElementById('btn-gdrive-save');
        if (btnGDriveSave) {
            btnGDriveSave.onclick = async () => {
                setStatus('⏳ Kaydediliyor...');
                btnGDriveSave.disabled = true;
                try {
                    const result = await getCloud().saveToGoogleDrive();
                    setStatus('✅ ' + result.message);
                    // Google oturumu açıksa çıkış butonunu göster
                    const signOutBtn = document.getElementById('btn-gdrive-signout');
                    if (signOutBtn) signOutBtn.style.display = 'flex';
                } catch (e) {
                    setStatus('❌ ' + e.message, true);
                }
                btnGDriveSave.disabled = false;
            };
        }

        // ─── Google Drive: Yükle ──────────────────────────────────
        const btnGDriveLoad = document.getElementById('btn-gdrive-load');
        if (btnGDriveLoad) {
            btnGDriveLoad.onclick = async () => {
                setStatus('⏳ Yükleniyor...');
                btnGDriveLoad.disabled = true;
                try {
                    const result = await getCloud().loadFromGoogleDrive();
                    if (result.success) {
                        setStatus('✅ ' + result.message);
                        const signOutBtn = document.getElementById('btn-gdrive-signout');
                        if (signOutBtn) signOutBtn.style.display = 'flex';
                        setTimeout(async () => {
                            await this.initAsync();
                        }, 1500);
                    } else {
                        setStatus('ℹ️ ' + result.message);
                    }
                } catch (e) {
                    setStatus('❌ ' + e.message, true);
                }
                btnGDriveLoad.disabled = false;
            };
        }

        // ─── Google Drive: Çıkış ──────────────────────────────────
        const btnSignOut = document.getElementById('btn-gdrive-signout');
        if (btnSignOut) {
            // Eğer token kayıtlıysa göster
            if (localStorage.getItem('betik_gdrive_token')) {
                btnSignOut.style.display = 'flex';
            }
            btnSignOut.onclick = async () => {
                await getCloud().signOutGoogle();
                btnSignOut.style.display = 'none';
                setStatus('Google hesabından çıkış yapıldı.');
            };
        }
    }

    async renameFolder(id, newName) {
        const folder = this.folders.find(f => f.id === id);
        if (folder && newName.trim()) {
            folder.name = newName.trim();
            await this.saveDataAsync('wb_folders', this.folders);
            this.renderSidebar();
            if (this.currentView === id) {
                this.breadcrumb.textContent = `Betik / ${folder.name}`;
            }
        } else {
            this.renderSidebar();
        }
    }

    async changeFolderColor(id, color) {
        const folder = this.folders.find(f => f.id === id);
        if (folder) {
            folder.color = color;
            await this.saveDataAsync('wb_folders', this.folders);
            this.renderSidebar();
        }
    }

    async deleteFolder(id) {
        const getAllChildren = (folderId) => {
            let result = [folderId];
            this.folders.filter(f => f.parentId === folderId).forEach(child => {
                result = result.concat(getAllChildren(child.id));
            });
            return result;
        };

        const idsToDelete = getAllChildren(id);

        // Bu klasörlerdeki board içeriklerini (native + IndexedDB) sil
        const boardsInFolders = this.boards.filter(b => idsToDelete.includes(b.folderId));
        await Promise.all(boardsInFolders.map(b =>
            window.fileSystemManager.removeItem(`wb_content_${b.id}`)
        ));

        // Native'de klasör yapısını temizle
        if (window.fileSystemManager.mode === 'native' && window.fileSystemManager.dirHandle) {
            const rootFolderPath = window.fileSystemManager._getFolderPath(id);
            if (rootFolderPath.length > 0) {
                try {
                    let parentDir = window.fileSystemManager.dirHandle;
                    for (let i = 0; i < rootFolderPath.length - 1; i++) {
                        parentDir = await parentDir.getDirectoryHandle(rootFolderPath[i], { create: false });
                    }
                    await parentDir.removeEntry(rootFolderPath[rootFolderPath.length - 1], { recursive: true }).catch(() => { });
                } catch (e) { }
            }
        }

        this.boards = this.boards.filter(b => !idsToDelete.includes(b.folderId));
        await this.saveDataAsync('wb_boards', this.boards);

        this.folders = this.folders.filter(f => !idsToDelete.includes(f.id));
        await this.saveDataAsync('wb_folders', this.folders);

        // Drive'dan anında sil (trash'e at)
        this._syncDeletionToDrive([...idsToDelete, ...boardsInFolders.map(b => b.id)]);

        // Senkronizasyon için silindiğini işaretle (Klasörler + Boardlar)
        const deletedIds = await this.loadDataAsync('wb_deleted_ids', []);
        let changed = false;

        // Klasör ID'lerini ekle
        idsToDelete.forEach(id => {
            if (!deletedIds.includes(id)) {
                deletedIds.push(id);
                changed = true;
            }
        });

        // Bu klasörlerdeki board ID'lerini de ekle
        boardsInFolders.forEach(b => {
            if (!deletedIds.includes(b.id)) {
                deletedIds.push(b.id);
                changed = true;
            }
        });
        if (changed) await this.saveDataAsync('wb_deleted_ids', deletedIds);

        if (idsToDelete.includes(this.currentView)) {
            this.switchView('all');
        } else {
            this.renderSidebar();
            this.renderBoards();
        }
    }

    async deleteFolderConfirmation(id) {
        const folder = this.folders.find(f => f.id === id);
        if (!folder) return;

        const confirmed = await Utils.showConfirm({
            title: 'Klasörü Sil',
            message: `'${folder.name}' klasörünü silmek istediğinize emin misiniz? (İçindeki notlar ve alt klasörler silinmez)`,
            confirmText: 'Sil',
            type: 'danger'
        });

        if (confirmed) {
            this.deleteFolder(id);
        }
    }

    async deleteBoardConfirmation(id) {
        const board = this.boards.find(b => b.id === id);
        if (!board) return;

        const msg = board.deleted
            ? `'${board.name}' notunu kalıcı olarak silmek istediğinize emin misiniz?`
            : `'${board.name}' notunu çöp kutusuna taşımak istediğinize emin misiniz?`;
        const title = board.deleted ? 'Kalıcı Olarak Sil' : 'Çöp Kutusuna Taşı';
        const btnText = board.deleted ? 'Kalıcı Sil' : 'Çöp Kutusuna Taşı';

        const confirmed = await Utils.showConfirm({
            title,
            message: msg,
            confirmText: btnText,
            type: 'danger'
        });

        if (confirmed) {
            this.deleteBoard(id);
        }
    }

    setupBoardDragDrop() {
        const cards = document.querySelectorAll('.board-card:not(.create-new-card)');
        cards.forEach(card => {
            card.draggable = true;
            card.ondragstart = (e) => {
                e.dataTransfer.setData('boardId', card.dataset.id);
                card.classList.add('dragging');
            };
            card.ondragend = () => card.classList.remove('dragging');
        });

        // Add drop support to folder items in sidebar
        document.querySelectorAll('.folder-item').forEach(folder => {
            folder.ondragover = (e) => {
                e.preventDefault();
                folder.classList.add('drop-target');
            };
            folder.ondragleave = () => folder.classList.remove('drop-target');
            folder.ondrop = (e) => {
                e.preventDefault();
                const boardId = e.dataTransfer.getData('boardId');
                const folderId = folder.dataset.view;
                this.moveBoardToFolder(boardId, folderId);
                folder.classList.remove('drop-target');
            };
        });
    }

    async createNewBoard() {
        console.log('createNewBoard başlatıldı');
        const id = 'b_' + Date.now();

        // Find a unique name like "Not", "Not 1", "Not 2", etc.
        const baseName = 'Not';
        let name = baseName;
        let counter = 1;
        const existingNames = this.boards.filter(b => !b.deleted).map(b => b.name.trim());

        if (existingNames.includes(baseName)) {
            while (existingNames.includes(`${baseName} ${counter}`)) {
                counter++;
            }
            name = `${baseName} ${counter}`;
        }

        const newBoard = {
            id: id,
            name: name,
            lastModified: Date.now(),
            favorite: false,
            deleted: false,
            objectCount: 0,
            preview: null,
            folderId: this.currentView.startsWith('f_') ? this.currentView : null,
            coverBg: '#4a90e2',
            coverTexture: 'linear'
        };

        this.boards.push(newBoard);
        await this.saveDataAsync('wb_boards', this.boards);

        // Refresh dashboard
        this.renderBoards();
        this.renderSidebar();
    }

    async handlePDFUpload(event) {
        const file = event.target.files[0];
        if (!file || file.type !== 'application/pdf') return;

        this.showLoading();

        const id = 'b_' + Date.now();
        const newBoard = {
            id: id,
            name: file.name,
            lastModified: Date.now(),
            favorite: false,
            deleted: false,
            objectCount: 0,
            preview: null,
            folderId: this.currentView.startsWith('f_') ? this.currentView : null,
            coverBg: '#fa5252',
            coverTexture: 'dots',
            isPDF: true
        };

        try {
            // Save to IndexedDB
            await Utils.db.save(id, file);

            this.boards.push(newBoard);
            await this.saveDataAsync('wb_boards', this.boards);

            // Sync metadata'yı güncelle (Drive PUSH'u tetiklemek için)
            await window.fileSystemManager.updateSyncMetadata(id);

            this.renderBoards();
            this.renderSidebar();

            // Optionally open immediately if you want, but per user request we stay on dashboard
            // this.loadBoard(id);

            // Clear input
            event.target.value = '';
        } catch (error) {
            console.error('Error saving PDF to IndexedDB:', error);
            Utils.showToast('PDF kaydedilirken bir hata oluştu.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async loadBoard(id, templateId = null) {
        const board = this.boards.find(b => b.id === id);
        if (!board) return;

        this.showLoading();

        // Transition UI
        this.container.style.display = 'none';
        this.appContainer.style.display = 'flex';

        // Force resize to calculate dimensions now that app is visible
        window.dispatchEvent(new Event('resize'));

        // Use TabManager to open this board as a tab
        if (this.app.tabManager) {
            await this.app.tabManager.openBoard(id, board.name, templateId);
        } else {
            // Fallback to old behavior if TabManager not available
            this.currentBoardId = id;
            await this.loadBoardContent(id, templateId);
        }

        // Fit to width by default 
        if (this.app.zoomManager) {
            setTimeout(() => {
                this.app.zoomManager.fitToWidth(10);
                this.hideLoading();
            }, 100);
            this.hideLoading();
        }
    }

    async loadBoardContent(id, templateId = null) {
        console.log(`[Dashboard] Loading content for board: ${id}`);

        // Reset state
        if (this.app.pageManager) this.app.pageManager.clear();
        this.app.state.objects = [];

        // Clear previous PDF if any
        if (this.app.pdfManager) this.app.pdfManager.clearPDF();

        // Check if there is an associated PDF in IndexedDB
        try {
            const pdfBlob = await Utils.db.get(id);
            if (pdfBlob && this.app.pdfManager) {
                console.log('[Dashboard] PDF found in DB, loading...');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                await this.app.pdfManager.loadPDF(pdfUrl);
            }
        } catch (error) {
            console.error('Error loading PDF from DB:', error);
        }

        const savedData = await this.loadDataAsync(`wb_content_${id}`, null);
        if (savedData) {
            let pages = savedData.pages;
            const objects = savedData.objects;

            const tomFM = this.app.tikFileManager;
            const deserializeObj = tomFM
                ? (obj) => tomFM._deserializeObject(obj)
                : (obj) => Promise.resolve(obj);

            if (pages) {
                console.log(`[Dashboard] ${pages.length} pages found in save file.`);
                pages = await Promise.all(pages.map(async page => {
                    page.objects = await Promise.all((page.objects || []).map(obj => deserializeObj(obj)));
                    return page;
                }));
                if (this.app.pageManager) {
                    this.app.pageManager.pages = pages;
                    this.app.pageManager.renderPageList();
                    this.app.pageManager.switchPage(0, true, false);
                }
            } else if (objects) {
                console.log(`[Dashboard] Legacy objects found in save file.`);
                const deserializedObjects = await Promise.all((objects || []).map(obj => deserializeObj(obj)));
                this.app.state.objects = deserializedObjects;
                if (this.app.pageManager) {
                    this.app.pageManager.pages = [{
                        id: Date.now(),
                        name: 'Sayfa 1',
                        objects: Utils.deepClone(this.app.state.objects),
                        backgroundColor: 'white',
                        backgroundPattern: 'none',
                        thumbnail: null
                    }];
                    this.app.pageManager.currentPageIndex = 0;
                    this.app.pageManager.renderPageList();
                }
            }
        } else {
            console.log('[Dashboard] No saved content found, creating fresh board.');
            // Fresh board
            if (this.app.pageManager) {
                const isPdf = this.app.pdfManager && this.app.pdfManager.isLoaded;
                if (!isPdf) {
                    this.app.pageManager.pages = [{
                        id: Date.now(),
                        name: 'Sayfa 1',
                        objects: [],
                        backgroundColor: 'white',
                        backgroundPattern: 'none',
                        thumbnail: null
                    }];
                    this.app.pageManager.currentPageIndex = 0;
                    this.app.pageManager.renderPageList();
                    this.app.pageManager.switchPage(0, true, false);
                }
            }

            // APPLY TEMPLATE ATOMICALLY IF REQUESTED
            if (templateId && this.app.templateManager) {
                console.log(`[Dashboard] Applying template ${templateId} to new board.`);
                await this.app.templateManager.applyTemplate(templateId);
            }
        }

        this.app.redrawOffscreen();
        this.app.render();
    }

    async saveCurrentBoard(force = false) {
        const boardId = this.currentBoardId;
        if (!boardId) return;

        // Clear existing timeout
        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
            this._saveTimeout = null;
        }

        const runSave = async () => {
            // 1. Sync current page state before saving everything
            if (this.app.pageManager) {
                this.app.pageManager.saveCurrentPageState();
            }

            // 2. Update board meta (Throttled)
            const boardIndex = this.boards.findIndex(b => b.id === boardId);
            if (boardIndex !== -1) {
                const board = this.boards[boardIndex];
                const now = Date.now();

                // Only generate preview if forced or 60s passed since last preview
                let preview = null;
                const shouldUpdatePreview = force || !board._lastPreviewTime || (now - board._lastPreviewTime > 60000);

                if (shouldUpdatePreview) {
                    try {
                        preview = this.app.canvas.toDataURL('image/webp', 0.4); // Lower quality (0.4) for faster generation
                        board.preview = preview;
                        board._lastPreviewTime = now;
                    } catch (error) {
                        console.warn('Could not generate preview:', error);
                    }
                }

                board.lastModified = now;
                board.objectCount = (this.app.state.objects || []).length;

                // Only save wb_boards (heavy file) if forced or 30s passed since last meta save
                const shouldSaveMeta = force || !board._lastMetaSaveTime || (now - board._lastMetaSaveTime > 30000);
                if (shouldSaveMeta) {
                    board._lastMetaSaveTime = now;
                    await this.saveDataAsync('wb_boards', this.boards);
                }
            }

            // Serializer: TikFileManager varsa kullan, yoksa basit deep clone
            const tomFM = this.app.tikFileManager;
            const serializeObj = (obj) => {
                if (!obj) return null;

                let o;
                if (tomFM) {
                    o = tomFM._serializeObject(obj);
                } else {
                    o = Object.assign({}, obj);

                    // Coordinates rounding
                    if (o.x !== undefined) o.x = Math.round(o.x * 100000) / 100000;
                    if (o.y !== undefined) o.y = Math.round(o.y * 100000) / 100000;
                    if (o.width !== undefined) o.width = Math.round(o.width * 100000) / 100000;
                    if (o.height !== undefined) o.height = Math.round(o.height * 100000) / 100000;

                    // Fast point serialization
                    if (o.points && Array.isArray(o.points) && !o._flat) {
                        const flat = new Float32Array(o.points.length * 3);
                        for (let i = 0; i < o.points.length; i++) {
                            const p = o.points[i];
                            flat[i * 3] = p.x;
                            flat[i * 3 + 1] = p.y;
                            flat[i * 3 + 2] = p.pressure !== undefined ? p.pressure : 0.5;
                        }
                        o.points = Array.from(flat); // Convert back for JSON storage
                        o._flat = true;
                    }
                }

                // IMPORTANT: Strip away ANY non-serializable garbage that tools might have attached
                for (const key in o) {
                    const val = o[key];
                    if (val === undefined || typeof val === 'function' || val instanceof Node) {
                        delete o[key];
                    } else if (key.startsWith('_') && key !== '_flat') {
                        // Skip internal caches but keep _flat marker
                        delete o[key];
                    }
                }

                return o;
            };

            const optimizedPages = this.app.pageManager ? this.app.pageManager.pages.map(page => {
                const optimizedPage = Object.assign({}, page);
                delete optimizedPage.thumbnail; // Clear huge base64 to save MBs
                optimizedPage.objects = (page.objects || []).map(obj => serializeObj(obj));
                return optimizedPage;
            }) : null;

            const content = {
                version: "2.1",
                pages: optimizedPages,
                objects: optimizedPages ? null : (this.app.state.objects || []).map(obj => serializeObj(obj))
            };

            await this.saveDataAsync(`wb_content_${boardId}`, content);
            console.log(`[Autosave] Board ${boardId} saved ${force ? '(FORCED)' : '(DEBOUNCED)'}`);
        };

        if (force) {
            return await runSave();
        } else {
            return new Promise((resolve) => {
                this._saveTimeout = setTimeout(async () => {
                    await runSave();
                    resolve();
                }, 1000); // 1s debounce feels more stable for heavy strokes
            });
        }
    }

    setupAutosaveFlush() {
        // Tab kapandığında veya arka plana atıldığında bekleyen kaydı anında yap
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.currentBoardId) {
                console.log('[Autosave] Visibility hidden, flushing save...');
                this.saveCurrentBoard(true);
            }
        });

        // Sayfa tamamen kapatılmadan önce (opsiyonel ama güvenli)
        window.addEventListener('beforeunload', () => {
            if (this.currentBoardId) {
                this.saveCurrentBoard(true);
            }
        });
    }

    async showDashboard() {
        try {
            await this.saveCurrentBoard(true); // Always force save when going back
        } catch (error) {
            console.error('[Dashboard] Background save failed, but proceeding to dashboard:', error);
        }

        // Keep tabs open when returning to dashboard
        // Users can close tabs manually if needed

        this.boards = await this.loadDataAsync('wb_boards', []); // Refresh
        this.folders = await this.loadDataAsync('wb_folders', []); // Refresh
        this.currentBoardId = null;
        this.container.style.display = 'flex';
        this.appContainer.style.display = 'none';
        this.renderSidebar(); // Re-render sidebar to update counts/active
        this.renderBoards();
    }

    async deleteBoard(id) {
        const board = this.boards.find(b => b.id === id);
        if (board) {
            if (board.deleted) {
                // Hard delete — IndexedDB + native klasör
                this.boards = this.boards.filter(b => b.id !== id);
                // FileSystemManager üzerinden sil (native klasörü de temizler)
                await window.fileSystemManager.removeItem(`wb_content_${id}`);

                // Senkronizasyon için silindiğini işaretle
                const deletedIds = await this.loadDataAsync('wb_deleted_ids', []);
                if (!deletedIds.includes(id)) {
                    deletedIds.push(id);
                    await this.saveDataAsync('wb_deleted_ids', deletedIds);
                    // Drive'dan anında sil (trash'e at)
                    this._syncDeletionToDrive([id]);
                }
            } else {
                // Soft delete (çöp kutusuna taşı)
                board.deleted = true;
            }

            await this.saveDataAsync('wb_boards', this.boards);

            // Remove from TabManager if open
            if (this.app.tabManager) {
                this.app.tabManager.closeTab(id);
            }

            this.renderBoards();
        }
    }

    async emptyTrash() {
        const trashedBoards = this.boards.filter(b => b.deleted);
        if (trashedBoards.length === 0) return;

        const confirmed = await Utils.showConfirm({
            title: 'Çöp Kutusunu Boşalt',
            message: `Çöp kutusundaki ${trashedBoards.length} öğeyi kalıcı olarak silmek istediğinize emin misiniz?`,
            confirmText: 'Kalıcı Sil',
            type: 'danger'
        });

        if (confirmed) {
            // FileSystemManager üzerinden sil (IndexedDB + native klasör)
            await Promise.all(trashedBoards.map(async b => {
                await window.fileSystemManager.removeItem(`wb_content_${b.id}`);
                if (b.isPDF) {
                    Utils.db.delete(b.id).catch(err => console.error('PDF silme hatası:', err));
                }
            }));

            const idsToRemove = trashedBoards.map(b => b.id);
            this.boards = this.boards.filter(b => !b.deleted);
            await this.saveDataAsync('wb_boards', this.boards);

            // Drive'dan anında sil (trash'e at)
            this._syncDeletionToDrive(idsToRemove);

            // Senkronizasyon için silindiğini işaretle
            const deletedIds = await this.loadDataAsync('wb_deleted_ids', []);
            let changed = false;
            idsToRemove.forEach(id => {
                if (!deletedIds.includes(id)) {
                    deletedIds.push(id);
                    changed = true;
                }
            });
            if (changed) await this.saveDataAsync('wb_deleted_ids', deletedIds);

            if (this.app.tabManager) {
                idsToRemove.forEach(id => this.app.tabManager.closeTab(id));
            }

            this.renderBoards();
        }
    }

    async toggleFavorite(id) {
        const board = this.boards.find(b => b.id === id);
        if (board) {
            board.favorite = !board.favorite;
            await this.saveDataAsync('wb_boards', this.boards);
            this.renderBoards();
        }
    }

    async renameBoard(id, newName) {
        const board = this.boards.find(b => b.id === id);
        if (board && newName.trim()) {
            // Eski yolu kaydet (taşıma için)
            const oldBoard = { ...board };
            board.name = newName.trim();
            board.lastModified = Date.now();
            await this.saveDataAsync('wb_boards', this.boards);

            // Sync metadata'yı güncelle (Drive PUSH'u tetiklemek için)
            await window.fileSystemManager.updateSyncMetadata(id);

            // Native klasörde dosyayı yeni isme taşı
            await window.fileSystemManager.moveBoardNativeFile(id, oldBoard);
            // Yeni konuma kaydet
            if (window.fileSystemManager.mode === 'native') {
                const content = await window.fileSystemManager.getItem(`wb_content_${id}`, null);
                if (content) await window.fileSystemManager._saveBoardToNative(`wb_content_${id}`, content);
            }

            if (this.app.tabManager) {
                this.app.tabManager.updateTabTitle(id, newName.trim());
            }

            // Sync trigger
            if (window.fileSystemManager.onSave) window.fileSystemManager.onSave();
        }
    }

    async moveBoardToFolder(boardId, folderId) {
        const board = this.boards.find(b => b.id === boardId);
        if (board) {
            const oldBoard = { ...board };
            board.folderId = folderId || null;
            board.lastModified = Date.now();
            await this.saveDataAsync('wb_boards', this.boards);

            // Sync metadata'yı güncelle (Drive PUSH'u tetiklemek için)
            await window.fileSystemManager.updateSyncMetadata(boardId);

            // Native klasörde dosyayı yeni konuma taşı
            await window.fileSystemManager.moveBoardNativeFile(boardId, oldBoard);
            if (window.fileSystemManager.mode === 'native') {
                const content = await window.fileSystemManager.getItem(`wb_content_${boardId}`, null);
                if (content) await window.fileSystemManager._saveBoardToNative(`wb_content_${boardId}`, content);
            }

            this.renderBoards();
            if (window.fileSystemManager.onSave) window.fileSystemManager.onSave();
        }
    }

    async updateBoardShape(boardId, shape) {
        const board = this.boards.find(b => b.id === boardId);
        if (board) {
            board.shape = shape;
            await this.saveDataAsync('wb_boards', this.boards);
            this.renderBoards();
        }
    }

    setupAppNavigation() {
        const logo = document.getElementById('btnHome');
        if (logo) {
            logo.style.pointerEvents = 'auto'; // Force enable
            logo.onclick = async () => await this.showDashboard();
        }

        const handleSave = () => {
            this.saveCurrentBoard();
            Utils.showToast('Beyaz tahta kaydedildi!', 'success');
            const dropdown = document.getElementById('appMenuDropdown');
            if (dropdown) dropdown.classList.remove('show');
        };

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.onclick = handleSave;

        const menuSave = document.getElementById('menuSave');
        if (menuSave) menuSave.onclick = handleSave;
    }

    setupViewOptions() {
        const trigger = document.getElementById('btnViewOptions');
        const dropdown = document.getElementById('viewOptionsDropdown');

        if (trigger && dropdown) {
            trigger.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            };

            // Size buttons
            dropdown.querySelectorAll('.size-btn').forEach(btn => {
                btn.onclick = () => {
                    this.viewSettings.gridSize = btn.dataset.size;
                    this.saveData('wb_view_settings', this.viewSettings);
                    this.applyViewSettings();

                    dropdown.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                };

                if (btn.dataset.size === this.viewSettings.gridSize) {
                    btn.classList.add('active');
                }
            });

            // Icon color picker
            const iconColorPicker = document.getElementById('uiIconColorPicker');
            const btnResetIconColor = document.getElementById('btnResetIconColor');

            if (iconColorPicker) {
                // Initialize from settings
                if (this.viewSettings.iconColor) {
                    iconColorPicker.value = this.viewSettings.iconColor;
                    document.documentElement.style.setProperty('--app-icon-color', this.viewSettings.iconColor);
                }

                iconColorPicker.oninput = () => {
                    const color = iconColorPicker.value;
                    this.viewSettings.iconColor = color;
                    this.saveData('wb_view_settings', this.viewSettings);
                    document.documentElement.style.setProperty('--app-icon-color', color);
                };
            }

            if (btnResetIconColor) {
                btnResetIconColor.onclick = () => {
                    const defaultColor = '#262626';
                    if (iconColorPicker) iconColorPicker.value = defaultColor;
                    this.viewSettings.iconColor = defaultColor;
                    this.saveData('wb_view_settings', this.viewSettings);
                    document.documentElement.style.setProperty('--app-icon-color', defaultColor);
                };
            }

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.view-options-container')) {
                    dropdown.classList.remove('show');
                }
            });
        }
    }

    setupSearch() {
        const handleSearch = (e) => {
            this.searchTerm = e.target.value.toLowerCase().trim();
            const hasTerm = this.searchTerm.length > 0;
            if (this.searchClearBtn) this.searchClearBtn.style.display = hasTerm ? 'block' : 'none';
            if (this.mobileSearchClearBtn) this.mobileSearchClearBtn.style.display = hasTerm ? 'block' : 'none';
            this.renderBoards();
        };

        if (this.searchInput) this.searchInput.oninput = handleSearch;
        if (this.mobileSearchInput) this.mobileSearchInput.oninput = handleSearch;

        if (this.searchClearBtn) this.searchClearBtn.onclick = () => this.clearSearch();
        if (this.mobileSearchClearBtn) this.mobileSearchClearBtn.onclick = () => this.clearSearch();
    }

    clearSearch() {
        this.searchTerm = '';
        if (this.searchInput) this.searchInput.value = '';
        if (this.mobileSearchInput) this.mobileSearchInput.value = '';
        if (this.searchClearBtn) this.searchClearBtn.style.display = 'none';
        if (this.mobileSearchClearBtn) this.mobileSearchClearBtn.style.display = 'none';
        this.renderBoards();
    }

    applyViewSettings() {
        if (!this.boardGrid) return;

        // Reset classes
        this.boardGrid.classList.remove('size-mini', 'size-xsmall', 'size-small', 'size-medium', 'size-large');

        // Apply new classes
        this.boardGrid.classList.add(`size-${this.viewSettings.gridSize}`);
    }

    setupCoverModal() {
        const modal = document.getElementById('coverModal');
        const grid = document.getElementById('coverGrid');
        const closeBtn = document.getElementById('btnCloseCoverModal');
        const addBtn = document.getElementById('btnAddCustomCover');
        const colorInput = document.getElementById('customCoverColor');
        const uploadBtn = document.getElementById('btnUploadCoverImage');
        const fileInput = document.getElementById('customCoverImage');

        if (!modal || !grid || !addBtn || !colorInput) return;

        if (closeBtn) closeBtn.onclick = () => modal.classList.remove('show');
        modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('show'); };

        addBtn.onclick = async () => {
            try {
                const color = colorInput.value;
                if (!color) return;

                const newCover = { id: 'custom_' + Date.now(), bg: color, texture: 'linear' };
                this.customCovers = Array.isArray(this.customCovers) ? this.customCovers : [];
                this.customCovers.unshift(newCover);
                this.saveData('wb_custom_covers', this.customCovers);

                if (this.activeBoardForCover) {
                    const board = (this.boards || []).find(b => b.id === this.activeBoardForCover);
                    if (board) {
                        board.coverBg = color;
                        board.coverTexture = 'linear';
                        delete board.coverImage; // Remove image if color selected
                        await this.saveDataAsync('wb_boards', this.boards);
                        this.renderBoards();
                    }
                } else if (this.selectedBoards && this.selectedBoards.size > 0) {
                    // Bulk mode custom color apply
                    this.selectedBoards.forEach(selId => {
                        const board = (this.boards || []).find(b => b.id === selId);
                        if (board) {
                            board.coverBg = color;
                            board.coverTexture = 'linear';
                            delete board.coverImage;
                        }
                    });
                    await this.saveDataAsync('wb_boards', this.boards);
                    this.renderBoards();
                    this.clearSelection();
                }
                modal.classList.remove('show');
            } catch (err) {
                console.error('Error in addBtn click handler:', err);
                modal.classList.remove('show');
            }

        };

        if (uploadBtn && fileInput) {
            uploadBtn.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (re) => {
                    const dataUrl = re.target.result;

                    // Compress image before saving
                    this.compressImage(dataUrl, (compressedUrl) => {
                        const newCover = { id: 'img_' + Date.now(), bg: '#ffffff', image: compressedUrl };
                        this.customCovers = Array.isArray(this.customCovers) ? this.customCovers : [];
                        this.customCovers.unshift(newCover);
                        this.saveData('wb_custom_covers', this.customCovers);

                        if (this.activeBoardForCover) {
                            const board = (this.boards || []).find(b => b.id === this.activeBoardForCover);
                            if (board) {
                                board.coverBg = '#ffffff';
                                board.coverImage = compressedUrl;
                                this.saveData('wb_boards', this.boards);
                                this.renderBoards();
                            }
                        } else if (this.selectedBoards && this.selectedBoards.size > 0) {
                            // Bulk mode custom image apply
                            this.selectedBoards.forEach(selId => {
                                const board = (this.boards || []).find(b => b.id === selId);
                                if (board) {
                                    board.coverBg = '#ffffff';
                                    board.coverImage = compressedUrl;
                                }
                            });
                            this.saveData('wb_boards', this.boards);
                            this.renderBoards();
                            this.clearSelection();
                        }
                        modal.classList.remove('show');
                        fileInput.value = ''; // Reset
                    });
                };

                reader.readAsDataURL(file);
            };
        }
    }

    compressImage(dataUrl, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDimension = 400;

            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Use JPEG with 0.7 quality to save substantial space
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    }

    openCoverPicker(boardId) {
        this.activeBoardForCover = boardId;
        const modal = document.getElementById('coverModal');

        if (modal) {
            modal.classList.add('show');
            this.renderCoverGrid(boardId);
        } else {
            console.error('Notebook cover modal not found');
        }
    }


    renderCoverGrid(boardId) {
        const grid = document.getElementById('coverGrid');
        const isBulk = !boardId;

        let board = null;
        if (!isBulk) {
            // Use == for type safety (string vs number)
            board = (this.boards || []).find(b => b.id == boardId);
            if (!board) return;
        }
        // Note: In bulk mode, we allow rendering even if selectedBoards is empty
        // User might select boards after opening the modal

        if (!grid) return;
        grid.innerHTML = '';

        const allCovers = [
            ...this.defaultCovers.map(c => ({ ...c, isDefault: true })),
            ...this.customCovers.map(c => ({ ...c, isDefault: false }))
        ];

        allCovers.forEach(cover => {
            const item = document.createElement('div');
            item.className = 'cover-item';

            const isImage = !!cover.image;
            if (!isImage && cover.texture) {
                item.classList.add(`cover-texture-${cover.texture}`);
            }

            if (isImage) {
                item.style.backgroundImage = `url(${cover.image})`;
                item.style.backgroundSize = 'cover';
                item.style.backgroundPosition = 'center';
            } else {
                item.style.backgroundColor = cover.bg;
            }

            // Check active state
            if (!isBulk && board) {
                if (isImage) {
                    if (board.coverImage === cover.image) item.classList.add('active');
                } else {
                    if (board.coverBg === cover.bg && !board.coverImage) item.classList.add('active');
                }
            }

            item.innerHTML = '<div class="mini-spine"></div>' +
                (!cover.isDefault ? `<div class="cover-item-delete" title="Sil">×</div>` : '');

            item.onclick = (e) => {
                // If it's a delete click, the handler below will deal with it
                if (e.target.classList.contains('cover-item-delete')) return;

                console.log('Cover clicked:', cover);
                console.log('isBulk:', isBulk);
                console.log('selectedBoards:', this.selectedBoards);

                const applyCoverToBoard = (target) => {
                    console.log('Applying cover to board:', target.id, 'Cover:', cover);
                    if (isImage) {
                        target.coverBg = '#ffffff';
                        target.coverImage = cover.image;
                        target.coverTexture = 'none';
                    } else {
                        target.coverBg = cover.bg;
                        target.coverTexture = cover.texture || 'linear';
                        target.coverImage = null;
                    }
                    console.log('Board after cover applied:', target);
                };

                if (isBulk) {
                    console.log('Bulk mode - applying to selected boards');
                    this.selectedBoards.forEach(selId => {
                        const targetBoard = this.boards.find(b => b.id == selId);
                        console.log('Found board for ID', selId, ':', targetBoard);
                        if (targetBoard) applyCoverToBoard(targetBoard);
                    });
                } else {
                    console.log('Single mode - applying to board:', board);
                    if (board) applyCoverToBoard(board);
                }

                // CRITICAL: Save BEFORE clearing selection (which triggers render)
                console.log('Saving boards:', this.boards);
                this.saveData('wb_boards', this.boards);

                // Close modal
                document.getElementById('coverModal').classList.remove('show');

                // Clear selection (this will call renderBoards internally)
                if (isBulk) {
                    this.clearSelection();
                } else {
                    this.renderBoards();
                }
            };

            // Set up delete handler
            if (!cover.isDefault) {
                item.querySelector('.cover-item-delete').onclick = (e) => {
                    e.stopPropagation();
                    this.customCovers = this.customCovers.filter(c => c.id !== cover.id);
                    this.saveData('wb_custom_covers', this.customCovers);
                    this.renderCoverGrid(boardId);
                };
            }

            grid.appendChild(item);
        });
    }

    /**
     * Template Gallery Methods
     */
    openTemplateGallery() {
        const modal = document.getElementById('templateGalleryModal');
        if (!modal) return;

        modal.style.display = 'flex';
        this.renderTemplateGallery();
        this.setupTemplateGalleryHandlers();
    }

    closeTemplateGallery() {
        const modal = document.getElementById('templateGalleryModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    setupTemplateGalleryHandlers() {
        // Close button
        const closeBtn = document.getElementById('btnCloseTemplateModal');
        if (closeBtn) {
            closeBtn.onclick = () => this.closeTemplateGallery();
        }

        // Overlay click
        const overlay = document.querySelector('.template-modal-overlay');
        if (overlay) {
            overlay.onclick = () => this.closeTemplateGallery();
        }

        // Tab filtering
        document.querySelectorAll('.template-tab').forEach(tab => {
            tab.onclick = () => {
                // Remove active from all tabs
                document.querySelectorAll('.template-tab').forEach(t => t.classList.remove('active'));
                // Add active to clicked tab
                tab.classList.add('active');

                const category = tab.dataset.category;
                this.renderTemplateGallery(category);
            };
        });

        // Search
        const searchInput = document.getElementById('templateSearchInput');
        if (searchInput) {
            searchInput.oninput = (e) => {
                const query = e.target.value;
                // If searching, show all categories
                this.renderTemplateGallery('Tümü', query);
            };
        }

        // ESC key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeTemplateGallery();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    /**
    * Show confirmation dialog
    */
    showConfirmDialog({ title, message, confirmText = 'Onayla', confirmClass = 'btn-danger', onConfirm, onCancel }) {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-dialog-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-dialog-actions">
                    <button class="btn-cancel">İptal</button>
                    <button class="${confirmClass}">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const dialog = overlay.querySelector('.confirm-dialog');
        const cancelBtn = overlay.querySelector('.btn-cancel');
        const confirmBtn = overlay.querySelector(`.${confirmClass}`);

        cancelBtn.onclick = () => {
            overlay.remove();
            if (onCancel) onCancel();
        };

        confirmBtn.onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onCancel) onCancel();
            }
        };
    }

    /**
     * Show undo toast notification
     */
    showUndoToast(message, undoCallback) {
        const toast = document.createElement('div');
        toast.className = 'undo-toast';
        toast.innerHTML = `
            <span>${message}</span>
            <button class="btn-undo">Geri Al</button>
        `;
        document.body.appendChild(toast);

        const undoBtn = toast.querySelector('.btn-undo');
        let undoClicked = false;

        undoBtn.onclick = () => {
            undoClicked = true;
            undoCallback();
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        };

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            if (!undoClicked) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    renderTemplateGallery(category = 'Tümü', searchQuery = '') {
        const grid = document.getElementById('templateGrid');
        if (!grid || !this.app.templateManager) return;

        let templates = [];

        if (searchQuery) {
            templates = this.app.templateManager.searchTemplates(searchQuery);
        } else if (category === 'Favoriler') {
            // Show only favorite templates
            const favoriteIds = this.app.templateManager.favoriteTemplates || [];
            templates = this.app.templateManager.templates.filter(t => favoriteIds.includes(t.id));
        } else if (category && category !== 'Tümü') {
            templates = this.app.templateManager.getTemplatesByCategory(category);
        } else {
            templates = this.app.templateManager.templates;
        }

        grid.innerHTML = '';

        if (templates.length === 0) {
            let emptyMessage, emptyHint, emptyIcon, showButton = false, buttonText = '', buttonAction = null;

            if (category === 'Favoriler') {
                emptyIcon = '⭐';
                emptyMessage = 'Henüz favori şablon eklemediniz';
                emptyHint = 'Şablonları favorilere eklemek için kalp ikonuna tıklayın';
                showButton = true;
                buttonText = 'Tüm Şablonları Gör';
                buttonAction = () => {
                    document.querySelector('[data-category="Tümü"]')?.click();
                };
            } else if (category === 'Kendi Şablonlarım') {
                emptyIcon = '📝';
                emptyMessage = 'Henüz kayıtlı şablonunuz yok';
                emptyHint = 'Bir şablon oluşturmak için:<br>1. İstediğiniz bir notu açın<br>2. Menüden "Şablon Olarak Kaydet" seçin';
                showButton = true;
                buttonText = 'Hazır Şablonlara Göz At';
                buttonAction = () => {
                    document.querySelector('[data-category="Tümü"]')?.click();
                };
            } else if (searchQuery) {
                emptyIcon = '🔍';
                emptyMessage = `"${searchQuery}" ile eşleşen şablon bulunamadı`;
                emptyHint = 'Arama kriterlerinizi değiştirmeyi deneyin';
            } else {
                emptyIcon = '📋';
                emptyMessage = 'Şablon bulunamadı';
                emptyHint = 'Bu kategoride henüz şablon bulunmuyor';
            }

            grid.innerHTML = `
                <div class="template-empty-state">
                    <div class="empty-icon">${emptyIcon}</div>
                    <h3>${emptyMessage}</h3>
                    <p>${emptyHint}</p>
                    ${showButton ? `<button class="btn" id="emptyStateAction">${buttonText}</button>` : ''}
                </div>
            `;

            if (showButton && buttonAction) {
                const btn = grid.querySelector('#emptyStateAction');
                if (btn) btn.onclick = buttonAction;
            }
            return;
        }

        templates.forEach(template => {
            const isFavorite = this.app.templateManager.favoriteTemplates.includes(template.id);
            const isUserTemplate = template.isUserTemplate || false;

            const card = document.createElement('div');
            card.className = 'template-card';
            card.innerHTML = `
                <div class="template-thumbnail" style="${template.thumbnail ? `background-image: url(${template.thumbnail}); background-size: cover; background-position: center;` : ''}">
                    ${!template.thumbnail ? '<div style="font-size: 48px; opacity: 0.3;">📋</div>' : ''}
                </div>
                <button class="template-favorite-btn ${isFavorite ? 'active' : ''}" data-template-id="${template.id}">
                    <svg viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>
                <button class="template-tom-btn" data-template-id="${template.id}" title=".tik olarak kaydet">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                </button>
                ${isUserTemplate ? `
                <button class="template-delete-btn" data-template-id="${template.id}" title="Şablonu Sil">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
                ` : ''}
                <div class="template-info">
                    <div class="template-name">${template.name}</div>
                    <div class="template-description">${template.description}</div>
                    <span class="template-category-badge">${template.category}</span>
                </div>
            `;

            // Apply template on click
            card.onclick = (e) => {
                if (e.target.closest('.template-favorite-btn') || e.target.closest('.template-delete-btn') || e.target.closest('.template-tom-btn')) return;
                this.applyTemplateAndCreateBoard(template.id);
            };

            // Favorite toggle
            const favoriteBtn = card.querySelector('.template-favorite-btn');
            favoriteBtn.onclick = (e) => {
                e.stopPropagation();
                this.app.templateManager.toggleFavorite(template.id);
                this.renderTemplateGallery(category, searchQuery);
            };

            // .tik olarak kaydet
            const tomBtn = card.querySelector('.template-tom-btn');
            if (tomBtn) {
                tomBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (this.app.tikFileManager) {
                        this.app.tikFileManager.saveTemplateAsTom(template);
                    }
                };
            }

            // Delete button (for user templates) - WITH CONFIRMATION
            const deleteBtn = card.querySelector('.template-delete-btn');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();

                    // Show confirmation dialog
                    this.showConfirmDialog({
                        title: 'Şablonu Sil',
                        message: `"${template.name}" şablonunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
                        confirmText: 'Sil',
                        confirmClass: 'btn-danger',
                        onConfirm: () => {
                            // Store template data for undo
                            const templateData = { ...template };

                            const success = this.app.templateManager.deleteUserTemplate(template.id);
                            if (success) {
                                // Show undo toast
                                this.showUndoToast('Şablon silindi', () => {
                                    // Restore template
                                    this.app.templateManager.templates.push(templateData);
                                    this.app.templateManager.saveTemplates();
                                    this.renderTemplateGallery(category, searchQuery);
                                });

                                this.renderTemplateGallery(category, searchQuery);
                            }
                        }
                    });
                };
            }

            grid.appendChild(card);
        });
    }


    async applyTemplateAndCreateBoard(templateId) {
        // Create a new board first
        const id = 'b_' + Date.now();
        const template = this.app.templateManager.templates.find(t => t.id === templateId);

        const newBoard = {
            id: id,
            name: template ? template.name : 'Yeni Not',
            lastModified: Date.now(),
            favorite: false,
            deleted: false,
            objectCount: 0,
            preview: null,
            folderId: this.currentView.startsWith('f_') ? this.currentView : null,
            coverBg: '#4a90e2',
            coverTexture: 'linear'
        };

        this.boards.push(newBoard);
        await this.saveDataAsync('wb_boards', this.boards);

        // Close template gallery
        this.closeTemplateGallery();

        // Load the board with templateId passed in
        // Await this to ensure the board is fully initialized before continuing
        await this.loadBoard(id, templateId);
    }
    setupBulkActions() {
        this.bulkToolbar = document.getElementById('bulkActionsToolbar');

        const btnCancel = document.getElementById('btnBulkCancel');
        if (btnCancel) btnCancel.onclick = () => this.clearSelection();

        const btnDelete = document.getElementById('btnBulkDelete');
        if (btnDelete) {
            btnDelete.onclick = async () => {
                const count = this.selectedBoards.size;
                if (count === 0) return;

                const confirmed = await Utils.showConfirm({
                    title: 'Notları Sil',
                    message: `${count} notu silmek istediğinize emin misiniz?`,
                    confirmText: 'Sil',
                    type: 'danger'
                });

                if (confirmed) {
                    // Collect IDs first to avoid set modification during iteration
                    const idsToArchive = Array.from(this.selectedBoards);
                    for (const id of idsToArchive) {
                        await this.deleteBoard(id);
                    }
                    this.clearSelection();
                }
            };
        }

        const btnFav = document.getElementById('btnBulkFavorite');
        if (btnFav) {
            btnFav.onclick = async () => {
                for (const id of this.selectedBoards) {
                    await this.toggleFavorite(id);
                }
                this.clearSelection();
            };
        }

        const btnCover = document.getElementById('btnBulkChangeCover');
        if (btnCover) {
            btnCover.onclick = (e) => {
                e.stopPropagation();
                this.openCoverPicker(null);
            };
        }

        const btnMove = document.getElementById('btnBulkMove');
        if (btnMove) {
            btnMove.onclick = (e) => {
                e.stopPropagation();
                this.showFolderPicker(async (folderId) => {
                    const folderIdFinal = folderId === "" ? null : folderId;
                    this.selectedBoards.forEach(id => {
                        const board = this.boards.find(b => b.id === id);
                        if (board) board.folderId = folderIdFinal;
                    });
                    await this.saveDataAsync('wb_boards', this.boards);
                    this.clearSelection();
                });
            };
        }
    }

    toggleBoardSelection(id, isSelected) {
        if (isSelected) {
            this.selectedBoards.add(id);
        } else {
            this.selectedBoards.delete(id);
        }

        // Update UI
        const card = document.querySelector(`.board-card[data-id="${id}"]`);
        if (card) {
            const checkbox = card.querySelector('.board-checkbox');
            if (checkbox) checkbox.checked = isSelected;

            if (isSelected) card.classList.add('selected');
            else card.classList.remove('selected');
        }

        this.updateBulkToolbar();
    }

    clearSelection() {
        this.selectedBoards.clear();
        this.renderBoards(); // Re-render to clear visual states
        this.updateBulkToolbar();
    }

    updateBulkToolbar() {
        if (!this.bulkToolbar) return;

        const count = this.selectedBoards.size;
        this.bulkToolbar.style.display = count > 0 ? 'flex' : 'none';
        this.bulkToolbar.querySelector('.selected-count').textContent = `${count} not seçildi`;
    }

    async showFolderPicker(callback) {
        // Ensure folders are up to date
        this.folders = await this.loadDataAsync('wb_folders', []);

        const overlay = document.createElement('div');
        overlay.className = 'confirm-dialog-overlay';
        overlay.style.zIndex = '10001'; // Ensure it's above dashboard (9000)

        const modal = document.createElement('div');
        modal.className = 'confirm-dialog';
        modal.style.maxWidth = '400px';

        let html = `
            <h3>Klasör Seç</h3>
            <p style="margin-bottom: 16px; color: #666;">Notları taşımak istediğiniz klasörü seçin</p>
            <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <div class="folder-picker-item" data-id="" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">📁</span>
                    <span>Kök Dizin</span>
                </div>
        `;

        const renderOptions = (parentId = null, level = 0) => {
            const children = this.folders.filter(f => (f.parentId || null) === parentId);
            children.forEach(f => {
                const paddingLeft = 16 + (level * 24);
                html += `
                    <div class="folder-picker-item" data-id="${f.id}" style="padding: 12px 16px; padding-left: ${paddingLeft}px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 18px; ${level > 0 ? 'opacity: 0.7;' : ''}">${level > 0 ? '↳ 📁' : '📁'}</span>
                        <div style="display: flex; flex-direction: column; overflow: hidden;">
                            <span style="font-weight: ${level === 0 ? '600' : '500'}; font-size: ${14 - (level * 0.5)}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.name}</span>
                        </div>
                    </div>
                `;
                renderOptions(f.id, level + 1);
            });
        };

        renderOptions();

        html += `
            </div>
            <div class="confirm-dialog-actions">
                <button class="btn-cancel">İptal</button>
            </div>
        `;

        modal.innerHTML = html;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add hover effects
        modal.querySelectorAll('.folder-picker-item').forEach(item => {
            item.onmouseover = () => item.style.background = '#f8f9fa';
            item.onmouseout = () => item.style.background = 'white';
            item.onclick = () => {
                callback(item.dataset.id || null);
                overlay.remove();
            };
        });

        // Cancel button
        modal.querySelector('.btn-cancel').onclick = () => overlay.remove();

        // Click outside to close
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };
    }

    setupSelectAll() {
        if (this.btnSelectAll) {
            this.btnSelectAll.onclick = () => this.toggleSelectAll();
        }
        if (this.btnSelectAllMobile) {
            this.btnSelectAllMobile.onclick = () => this.toggleSelectAll();
        }
    }

    getFilteredBoards() {
        // Refresh data to ensure we have latest states
        // Note: this.boards and this.folders should already be up to date from mutations
        // but we ensure it's an array for safety.
        if (!Array.isArray(this.boards)) this.boards = [];

        let filtered = [];

        if (this.currentView === 'trash') {
            filtered = this.boards.filter(b => b.deleted);
        } else {
            // Base filter: non-deleted
            let base = this.boards.filter(b => !b.deleted);

            if (this.currentView === 'all') {
                filtered = base;
            } else if (this.currentView === 'recent') {
                filtered = [...base].sort((a, b) => b.lastModified - a.lastModified);
            } else if (this.currentView === 'favorites') {
                filtered = base.filter(b => b.favorite);
            } else if (this.currentView.startsWith('f_')) {
                filtered = base.filter(b => b.folderId === this.currentView);
            } else {
                filtered = base;
            }
        }

        // Apply Search Filter
        if (this.searchTerm) {
            filtered = filtered.filter(b => b.name.toLowerCase().includes(this.searchTerm));
        }

        return filtered;
    }

    toggleSelectAll() {
        const filtered = this.getFilteredBoards();
        if (filtered.length === 0) return;

        const allSelected = filtered.every(b => this.selectedBoards.has(b.id));

        if (allSelected) {
            this.clearSelection();
        } else {
            this.selectAll(filtered);
        }
    }

    selectAll(boardsToSelect) {
        boardsToSelect.forEach(b => this.selectedBoards.add(b.id));
        this.renderBoards();
        this.updateBulkToolbar();
    }

    updateSelectAllButtonState(filteredBoards) {
        const desktopBtn = this.btnSelectAll;
        const mobileBtn = this.btnSelectAllMobile;
        if (!desktopBtn && !mobileBtn) return;

        const filtered = filteredBoards || [];
        const noItems = filtered.length === 0;

        [desktopBtn, mobileBtn].forEach(btn => {
            if (!btn) return;
            if (noItems) {
                btn.style.opacity = '0.3';
                btn.style.pointerEvents = 'none';
                btn.title = "Seçilecek not yok";
            } else {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
        });

        if (noItems) return;

        const allSelected = filtered.every(b => this.selectedBoards.has(b.id));

        [desktopBtn, mobileBtn].forEach(btn => {
            if (!btn) return;
            if (allSelected) {
                btn.classList.add('active');
                btn.title = "Seçimi Temizle (Ctrl+A)";
            } else {
                btn.classList.remove('active');
                btn.title = "Tümünü Seç (Ctrl+A)";
            }
        });
    }

    setupAutoSync() {
        if (!localStorage.getItem('betik_gdrive_token')) return;

        let syncTimer = null;
        const cloud = this.getCloudSync();

        // UI İndikatörü Oluştur (Görsel Deneyim)
        const createSyncIndicator = () => {
            let el = document.getElementById('syncIndicator');
            if (!el) {
                el = document.createElement('div');
                el.id = 'syncIndicator';
                el.style.cssText = `
                    position: fixed; top: 20px; right: 20px; z-index: 9999;
                    background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px);
                    padding: 8px 16px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                    display: none; align-items: center; gap: 10px; font-size: 13px; font-weight: 500;
                    border: 1px solid rgba(255,255,255,0.3); transition: all 0.3s ease;
                `;
                el.innerHTML = `
                    <div class="sync-spinner" style="width: 14px; height: 14px; border: 2px solid #4a90e2; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <span class="sync-text">Bulutla Eşitleniyor...</span>
                `;
                document.body.appendChild(el);
            }
            return el;
        };

        const showSync = (text = 'Bulutla Eşitleniyor...') => {
            const el = createSyncIndicator();
            el.querySelector('.sync-text').textContent = text;
            el.style.display = 'flex';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        };

        const hideSync = () => {
            const el = document.getElementById('syncIndicator');
            if (el) {
                el.style.opacity = '0';
                el.style.transform = 'translateY(-10px)';
                setTimeout(() => { el.style.display = 'none'; }, 300);
            }
        };

        const triggerSync = (targetId = null) => {
            if (syncTimer) clearTimeout(syncTimer);
            syncTimer = setTimeout(async () => {
                showSync();
                const res = await cloud.syncWithGoogleDrive(targetId);
                if (res.success && (res.syncCount > 0 || res.delta)) {
                    await this.initAsync();
                }
                hideSync();
            }, 3000); // 3 saniye debounce
        };

        // 1. Auto-Push (Debounced Delta Sync)
        window.fileSystemManager.onSave = (key) => {
            if (key.startsWith('wb_content_')) {
                // Board içeriği değişti: delta sync ile sadece bu board'u yükle
                const boardId = key.replace('wb_content_', '');
                if (boardId && boardId !== 'null' && boardId !== 'undefined') {
                    triggerSync(boardId);
                }
            } else if (key === 'wb_boards' || key === 'wb_folders') {
                // Klasör/board listesi değişti: manifest güncelle (full sync ama sessizce)
                triggerSync(null);
            }
            // wb_deleted_ids, wb_view_settings gibi diğer key'ler için sync tetiklemiyoruz
        };

        window.fileSystemManager.onRemove = (key) => {
            const id = key.startsWith('wb_content_') ? key.replace('wb_content_', '') : null;
            if (id && id !== 'null' && id !== 'undefined') {
                triggerSync(id);
            } else {
                triggerSync(null);
            }
        };

        // 2. Connectivity Support (Offline Queue)
        window.addEventListener('online', () => {
            console.log('[AutoSync] İnternet geri geldi, bekleyen işlemler işleniyor...');
            cloud.processPendingQueue();
        });

        // 3. Auto-Pull (Full Sync Polling)
        setInterval(async () => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                console.log('[AutoSync] Periyodik kontrol...');
                const res = await cloud.syncWithGoogleDrive();
                if (res.success && res.syncCount > 0) {
                    await this.initAsync();
                }
            }
        }, 120000); // 2 dakikada bir full kontrol
    }
}
