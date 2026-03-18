class TextTool {
    constructor(renderCallback) {
        this.renderCallback = renderCallback;
        this.isEditing = false;
        this.editingObject = null;
        this.activeEditor = null;
        this.activeToolbar = null;
        this.savedSelection = null;
        this.toolbarTimeout = null;
    }

    handlePointerDown(e, worldPos, canvas, ctx, state) {
        if (this.isEditing) {
            this.finishEditing(state);
            return;
        }

        // Check if we clicked on an existing text object (search in reverse order)
        for (let i = state.objects.length - 1; i >= 0; i--) {
            const obj = state.objects[i];
            if (obj.type === 'text' && !obj.locked) {
                if (this.isPointInside(obj, worldPos)) {
                    this.startEditing(obj, canvas, state);
                    return;
                }
            }
        }

        // Create new text object
        const newText = {
            type: 'text',
            id: Date.now(),
            x: worldPos.x,
            y: worldPos.y,
            width: 200,
            height: 40,
            htmlContent: '',
            fontSize: 12,
            color: state.strokeColor || '#000000',
            alignment: 'left',
            locked: false,
            opacity: 1
        };

        this.startEditing(newText, canvas, state, true);
    }

    handlePointerMove(e, worldPos, canvas, ctx, state) {
        return false;
    }

    handlePointerUp(e, worldPos, canvas, ctx, state) {
        return null;
    }

    isPointInside(obj, worldPos) {
        return worldPos.x >= obj.x && worldPos.x <= obj.x + obj.width &&
            worldPos.y >= obj.y && worldPos.y <= obj.y + obj.height;
    }

    startEditing(obj, canvas, state, isNew = false, readOnly = false) {
        if (this.isEditing) this.finishEditing(state);
        this.isEditing = true;
        this.editingObject = obj;
        this.editingInReadOnly = readOnly;

        // Create Editor UI
        const editor = document.createElement('div');
        editor.className = 'rich-text-editor';
        editor.classList.toggle('ocr-readonly', readOnly);
        editor.contentEditable = readOnly ? 'false' : 'true';
        editor.dataset.placeholder = 'Yeni Metin';
        editor.innerHTML = obj.htmlContent;

        // Parent to .canvas-container for stable positioning
        const container = canvas.parentElement;
        const zoom = window.app.zoomManager.zoom;
        const pan = window.app.zoomManager.pan;
        const pageY = window.app.pageManager.getPageY(window.app.pageManager.currentPageIndex);

        // Calculate Scale: Always 1 in the current full-viewport canvas implementation
        const scale = 1;

        const logicLeft = (obj.x * zoom) + pan.x;
        const logicTop = ((obj.y + pageY) * zoom) + pan.y;

        const left = logicLeft + canvas.offsetLeft;
        const top = logicTop + canvas.offsetTop;

        editor.style.left = `${left}px`;
        editor.style.top = `${top}px`;
        editor.style.width = `${obj.width}px`;
        editor.style.minHeight = `${obj.height}px`;

        // With scale transform, we use the original logic font size
        editor.style.fontSize = `${obj.fontSize}px`;
        editor.style.color = obj.color;

        // Use transform-origin and scale to match canvas zoom exactly
        editor.style.transformOrigin = '0 0';
        editor.style.transform = `scale(${zoom})`;

        container.appendChild(editor);
        this.activeEditor = editor;

        if (!readOnly) {
            // Create Toolbar
            this.activeToolbar = this.createToolbar(editor, left, top - 60);
            container.appendChild(this.activeToolbar);
        }

        // Mobile Viewport Handling (Keyboard adjustment)
        if (window.visualViewport) {
            const updateToolbarPosition = () => {
                if (!this.activeToolbar) return;
                // Only apply on mobile width
                if (window.innerWidth > 768) {
                    this.activeToolbar.style.removeProperty('--mobile-toolbar-bottom');
                    return;
                }

                const vv = window.visualViewport;
                // Calculate difference between layout height and visual height (keyboard height usually)
                // Note: On modern browsers with interactive-widget=resizes-content, this diff might be 0, which is fine (bottom: 0 works).
                // On older iOS, this diff acts as bottom padding.
                const offset = window.innerHeight - vv.height - vv.offsetTop;
                this.activeToolbar.style.setProperty('--mobile-toolbar-bottom', `${Math.max(0, offset)}px`);
            };

            this.viewportHandler = updateToolbarPosition;
            window.visualViewport.addEventListener('resize', this.viewportHandler);
            window.visualViewport.addEventListener('scroll', this.viewportHandler);
            // Initial call
            updateToolbarPosition();
        }

        if (!readOnly) {
            editor.focus();

            const isDefault = () => {
                const text = editor.innerText.trim().toLowerCase();
                return text === '' || text === 'yeni metin';
            };

            if (isDefault()) {
                // Select all by default so typing replaces it
                document.execCommand('selectAll', false, null);
            }
        }

        editor.addEventListener('pointerdown', e => e.stopPropagation());

        // Handle placeholder clearing on first input
        editor.addEventListener('beforeinput', (e) => {
            if (isDefault() && e.inputType.startsWith('insert')) {
                editor.innerHTML = '';
            }
        });

        editor.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.finishEditing(state);
            }
            if (e.key === 'Enter') {
                if (e.ctrlKey) {
                    this.finishEditing(state);
                } else if (!e.shiftKey) {
                    this.handleEnter(e);
                }
            }
            // Clear placeholder on first keydown if it's a printable character (safeguard for beforeinput)
            if (isDefault() && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                editor.innerHTML = '';
            }
            e.stopPropagation();
        });

        editor.addEventListener('input', () => {
            // Since we use transform: scale, offsetWidth is already the logical width
            this.editingObject.width = editor.offsetWidth;
            this.editingObject.height = editor.offsetHeight;
            this.editingObject.htmlContent = editor.innerHTML;

            this.handleSelectionChange();
        });

        editor.addEventListener('keyup', () => this.handleSelectionChange());
        editor.addEventListener('mouseup', () => this.handleSelectionChange());

        // Handle checkbox clicks during editing
        editor.addEventListener('click', (e) => {
            const checkbox = e.target.closest('.checkbox');
            if (checkbox) {
                const item = checkbox.closest('.checklist-item');
                if (item) {
                    item.classList.toggle('checked');
                    this.editingObject.htmlContent = editor.innerHTML;
                    this.handleSelectionChange();
                }
            }
        });

        if (this.renderCallback) this.renderCallback();
    }

    createToolbarHTML() {
        return `
            <div class="text-toolbar-container">
                <!-- Block Type Selector (Dropdown) -->
                <div class="text-toolbar-block-selector">
                    <button class="text-toolbar-btn" id="blockTypeSelector" title="Blok Tipi Seç" style="min-width: 80px; display: flex; align-items: center; gap: 4px;">
                        <span id="currentBlockType">Para</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;">
                            <polyline points="6,9 12,15 18,9"></polyline>
                        </svg>
                    </button>
                    <div class="block-type-dropdown" id="blockTypeDropdown">
                        <div class="block-type-option" data-block="paragraph">
                            <span>P</span> Paragraf
                        </div>
                        <div class="block-type-option" data-block="h1">
                            <span style="font-weight: 600;">H1</span> Başlık 1
                        </div>
                        <div class="block-type-option" data-block="h2">
                            <span style="font-weight: 600;">H2</span> Başlık 2
                        </div>
                        <div class="block-type-option" data-block="h3">
                            <span style="font-weight: 600;">H3</span> Başlık 3
                        </div>
                        <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>
                        <div class="block-type-option" data-block="toggleh1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg>
                            <span style="font-weight: 600;">H</span> Açılır Başlık
                        </div>
                        <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>
                        <div class="block-type-option" data-block="quote">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>
                            Alıntı
                        </div>
                        <div class="block-type-option" data-block="callout">
                            <span>💡</span> Callout
                        </div>
                        <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>
                        <div class="block-type-option" data-block="bulletlist">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="4" y1="12" x2="21" y2="12"></line><line x1="4" y1="18" x2="21" y2="18"></line><circle cx="3" cy="6" r="1" fill="currentColor"></circle></svg>
                            Madde Listesi
                        </div>
                        <div class="block-type-option" data-block="numberedlist">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><text x="3" y="15" font-size="12" fill="currentColor">1</text><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line></svg>
                            Numaralı Liste
                        </div>
                        <div class="block-type-option" data-block="checklist">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            Yapılacaklar
                        </div>
                        <div class="block-type-option" data-block="togglelist">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg>
                            Açılır Liste
                        </div>
                        <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>
                        <div class="block-type-option" data-block="code">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16,18 22,12 16,6"></polyline><polyline points="8,6 2,12 8,18"></polyline></svg>
                            Kod Bloğu
                        </div>
                    </div>
                </div>

                <div class="text-toolbar-separator"></div>

                <!-- Font Size Selector -->
                <select class="text-toolbar-select" id="fontSizeSelector" title="Yazı Boyutu">
                    <option value="8">8px</option>
                    <option value="10">10px</option>
                    <option value="12">12px</option>
                    <option value="14">14px</option>
                    <option value="16">16px</option>
                    <option value="18">18px</option>
                    <option value="20">20px</option>
                    <option value="24">24px</option>
                    <option value="28">28px</option>
                    <option value="32">32px</option>
                    <option value="36">36px</option>
                    <option value="48">48px</option>
                </select>
                
                <div class="text-toolbar-separator"></div>

                <!-- History Actions -->
                <button class="text-toolbar-btn" id="textUndoBtn" title="Geri Al (Ctrl+Z)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 7v6h6"></path>
                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
                    </svg>
                </button>
                <button class="text-toolbar-btn" id="textRedoBtn" title="Yinele (Ctrl+Y)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="21 7 21 13 15 13"></polyline>
                        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
                    </svg>
                </button>

                <div class="text-toolbar-separator"></div>
                
                <!-- Text Formatting -->
                <button class="text-toolbar-btn format" data-command="bold" title="Kalın (Ctrl+B)">
                    <span style="font-weight: bold; font-size: 14px;">B</span>
                </button>
                <button class="text-toolbar-btn format" data-command="italic" title="İtalik (Ctrl+I)">
                    <span style="font-style: italic; font-size: 14px;">I</span>
                </button>
                <button class="text-toolbar-btn format" data-command="underline" title="Alt Çizgi (Ctrl+U)">
                    <span style="text-decoration: underline; font-size: 14px;">U</span>
                </button>
                <button class="text-toolbar-btn format" data-command="strikeThrough" title="Üstü Çizili">
                    <span style="text-decoration: line-through; font-size: 14px;">S</span>
                </button>
                
                <div class="text-toolbar-separator"></div>
                
                <!-- Alignment -->
                <button class="text-toolbar-btn align" data-command="justifyLeft" title="Sola Yasla">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="15" y2="12"></line>
                        <line x1="3" y1="18" x2="18" y2="18"></line>
                    </svg>
                </button>
                <button class="text-toolbar-btn align" data-command="justifyCenter" title="Ortala">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="6" y1="12" x2="18" y2="12"></line>
                        <line x1="4" y1="18" x2="20" y2="18"></line>
                    </svg>
                </button>
                <button class="text-toolbar-btn align" data-command="justifyRight" title="Sağa Yasla">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="9" y1="12" x2="21" y2="12"></line>
                        <line x1="6" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                
                <div class="text-toolbar-separator"></div>
                
                <!-- Text Color -->
                <div class="text-toolbar-color-wrapper">
                    <button class="text-toolbar-btn" id="textColorBtn" title="Yazı Rengi">
                        <span style="text-decoration: underline; font-size: 14px; font-weight: 600;">A</span>
                    </button>
                </div>
                
                <!-- Background Color -->
                <div class="text-toolbar-color-wrapper">
                    <button class="text-toolbar-btn" id="bgColorBtn" title="Arka Plan Rengi">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="#fef3c7" stroke="#f59e0b"></rect>
                        </svg>
                    </button>
                </div>

                <div class="text-toolbar-separator"></div>
                
                <!-- Indent -->
                <button class="text-toolbar-btn" id="indentBtn" title="Girintiyi Artır">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="21" y1="6" x2="11" y2="6"></line>
                        <line x1="21" y1="12" x2="11" y2="12"></line>
                        <line x1="21" y1="18" x2="11" y2="18"></line>
                        <polyline points="3,8 7,12 3,16"></polyline>
                    </svg>
                </button>
                
                <!-- Link -->
                <button class="text-toolbar-btn" id="linkBtn" title="Bağlantı Ekle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                </button>

                <div class="text-toolbar-separator"></div>

                <!-- Clear Formatting -->
                <button class="text-toolbar-btn" id="clearStylesBtn" title="Stilleri Temizle">
                    <app-icon name="clean" alt="clean" class="icon"></app-icon>
                </button>
            </div>
        `;
    }

    bindToolbarEvents(toolbar, editor) {
        // Block Type Dropdown
        const blockSelector = toolbar.querySelector('#blockTypeSelector');
        const blockDropdown = toolbar.querySelector('#blockTypeDropdown');
        const currentBlockTypeLabel = toolbar.querySelector('#currentBlockType');
        const toolbarContainer = toolbar.querySelector('.text-toolbar-container');

        if (blockSelector && blockDropdown) {
            // Function to position dropdown dynamically
            const positionDropdown = () => {
                const rect = blockSelector.getBoundingClientRect();
                const isMobile = window.innerWidth <= 480;

                blockDropdown.style.position = 'fixed';
                blockDropdown.style.left = `${rect.left}px`;

                if (isMobile) {
                    // On mobile, open upward
                    blockDropdown.style.bottom = `${window.innerHeight - rect.top}px`;
                    blockDropdown.style.top = 'auto';
                } else {
                    // On desktop, open downward
                    blockDropdown.style.top = `${rect.bottom + 4}px`;
                    blockDropdown.style.bottom = 'auto';
                }
            };

            blockSelector.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();

                const isVisible = blockDropdown.classList.contains('visible');

                if (!isVisible) {
                    // Position before showing
                    positionDropdown();
                    blockDropdown.classList.add('visible');
                } else {
                    blockDropdown.classList.remove('visible');
                }
            };

            const blockOptions = blockDropdown.querySelectorAll('.block-type-option');
            blockOptions.forEach(opt => {
                opt.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const blockType = opt.dataset.block;
                    this.handleBlockTypeChange(blockType, editor);
                    currentBlockTypeLabel.textContent = opt.textContent.trim().split(' ')[0];
                    blockDropdown.classList.remove('visible');
                    editor.focus();
                };
            });

            // Close dropdown when scrolling the toolbar
            if (toolbarContainer) {
                const closeOnScroll = () => {
                    if (blockDropdown.classList.contains('visible')) {
                        blockDropdown.classList.remove('visible');
                    }
                };
                toolbarContainer.addEventListener('scroll', closeOnScroll);

                // Store reference for cleanup
                toolbar._scrollHandler = closeOnScroll;
            }

            // Close dropdown on window resize
            const closeOnResize = () => {
                if (blockDropdown.classList.contains('visible')) {
                    blockDropdown.classList.remove('visible');
                }
            };
            window.addEventListener('resize', closeOnResize);
            toolbar._resizeHandler = closeOnResize;
        }

        // Formatting buttons
        const formatBtns = toolbar.querySelectorAll('.text-toolbar-btn.format, .text-toolbar-btn.align');
        formatBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                const command = btn.dataset.command;
                document.execCommand(command, false, null);
                this.updateActiveStates(toolbar);
                editor.focus();
            };
        });

        // History buttons
        const textUndoBtn = toolbar.querySelector('#textUndoBtn');
        if (textUndoBtn) {
            textUndoBtn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                document.execCommand('undo', false, null);
                editor.focus();
            };
        }

        const textRedoBtn = toolbar.querySelector('#textRedoBtn');
        if (textRedoBtn) {
            textRedoBtn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                document.execCommand('redo', false, null);
                editor.focus();
            };
        }

        // Color buttons
        const textColorBtn = toolbar.querySelector('#textColorBtn');
        if (textColorBtn) {
            textColorBtn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (window.app.colorPalette) {
                    window.app.colorPalette.showColorPicker(this.editingObject.color || '#000000', (newColor) => {
                        // Apply only to selection, don't change object global color unless specific intent
                        document.execCommand('foreColor', false, newColor);
                        editor.focus();
                    }, textColorBtn, 'left');
                }
            };
        }

        const bgColorBtn = toolbar.querySelector('#bgColorBtn');
        if (bgColorBtn) {
            bgColorBtn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (window.app.colorPalette) {
                    window.app.colorPalette.showColorPicker('#ffffff', (newColor) => {
                        document.execCommand('hiliteColor', false, newColor);
                        editor.focus();
                    }, bgColorBtn, 'left');
                }
            };
        }

        // Indent button
        const indentBtn = toolbar.querySelector('#indentBtn');
        if (indentBtn) {
            indentBtn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                document.execCommand('indent', false, null);
                editor.focus();
            };
        }

        // Link button
        const linkBtn = toolbar.querySelector('#linkBtn');
        if (linkBtn) {
            linkBtn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                this.handleLinkCommand(editor);
            };
        }

        // Font size selector
        const fontSizeSelector = toolbar.querySelector('#fontSizeSelector');
        if (fontSizeSelector) {
            fontSizeSelector.onchange = (e) => {
                const size = e.target.value;
                // execCommand 'fontSize' is weird (1-7), so we use a style span
                const sel = window.getSelection();
                if (!sel.rangeCount) return;

                const span = document.createElement('span');
                span.style.fontSize = size + 'px';

                const range = sel.getRangeAt(0);
                if (range.collapsed) {
                    // Empty selection, insert a styled space and move cursor
                    span.innerHTML = '&#8203;'; // Zero-width space
                    range.insertNode(span);
                    const newRange = document.createRange();
                    newRange.setStart(span, 1);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else {
                    const content = range.extractContents();
                    span.appendChild(content);
                    range.insertNode(span);
                }

                editor.focus();
                this.handleSelectionChange();
            };
        }

        // Clear Styles button
        const clearStylesBtn = toolbar.querySelector('#clearStylesBtn');
        if (clearStylesBtn) {
            clearStylesBtn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();

                // Select everything and clear it
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(editor);
                sel.removeAllRanges();
                sel.addRange(range);

                // 1. Remove standard formatting
                document.execCommand('removeFormat', false, null);

                // 2. Clear block formatting (resets everything to paragraphs)
                document.execCommand('formatBlock', false, 'p');

                // 3. Clear colors manually (removeFormat doesn't always catch foreColor/hiliteColor)
                document.execCommand('foreColor', false, this.editingObject.color || '#000000');
                document.execCommand('hiliteColor', false, 'transparent');

                // 4. Clear complex structures (Lists, Checklists, Toggles, etc.)
                const complexBlocks = editor.querySelectorAll('ul, ol, .checklist-item, .toggle-list, .toggle-heading, .callout, blockquote, pre');
                complexBlocks.forEach(block => {
                    const p = document.createElement('p');
                    if (block.tagName === 'UL' || block.tagName === 'OL') {
                        // For lists, merge all items into paragraphs
                        const items = block.querySelectorAll('li');
                        items.forEach(li => {
                            const newP = document.createElement('p');
                            newP.innerHTML = li.innerHTML;
                            block.parentElement.insertBefore(newP, block);
                        });
                        block.remove();
                    } else if (block.classList.contains('checklist-item')) {
                        // Remove checkbox and keep text
                        const textSpan = block.querySelector('span:not(.checkbox)');
                        p.innerHTML = textSpan ? textSpan.innerHTML : block.innerHTML;
                        block.replaceWith(p);
                    } else if (block.classList.contains('toggle-list') || block.classList.contains('toggle-heading')) {
                        // Keep header text and content
                        const header = block.querySelector('.toggle-header');
                        const content = block.querySelector('.toggle-content');
                        p.innerHTML = (header ? header.innerText.replace(/[▼▶]/g, '') : '') +
                            (content ? '<br>' + content.innerHTML : '');
                        block.replaceWith(p);
                    } else {
                        // Simple unwrap for others
                        p.innerHTML = block.innerHTML;
                        block.replaceWith(p);
                    }
                });

                // 5. Final sweep: Remove all inline styles and reset elements
                const allElements = editor.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.classList.contains('checkbox')) {
                        el.remove(); // Remove stray checkboxes
                    } else {
                        el.removeAttribute('style');
                        el.className = ''; // Remove all classes
                    }
                });

                // Update UI
                this.updateActiveStates(toolbar);
                editor.focus();

                // Move cursor to start
                sel.collapseToStart();
                this.handleSelectionChange();
            };
        }

        // Close dropdown when clicking outside
        const closeDropdown = (e) => {
            if (blockDropdown && !blockSelector.contains(e.target) && !blockDropdown.contains(e.target)) {
                blockDropdown.classList.remove('visible');
            }
        };
        document.addEventListener('mousedown', closeDropdown);

        // Clean up event listeners when toolbar is removed
        const originalRemove = toolbar.remove.bind(toolbar);
        toolbar.remove = () => {
            document.removeEventListener('mousedown', closeDropdown);
            if (toolbar._scrollHandler && toolbarContainer) {
                toolbarContainer.removeEventListener('scroll', toolbar._scrollHandler);
            }
            if (toolbar._resizeHandler) {
                window.removeEventListener('resize', toolbar._resizeHandler);
            }
            originalRemove();
        };
    }

    handleBlockTypeChange(blockType, editor) {
        switch (blockType) {
            case 'paragraph': document.execCommand('formatBlock', false, 'p'); break;
            case 'h1': document.execCommand('formatBlock', false, 'h1'); break;
            case 'h2': document.execCommand('formatBlock', false, 'h2'); break;
            case 'h3': document.execCommand('formatBlock', false, 'h3'); break;
            case 'quote': document.execCommand('formatBlock', false, 'blockquote'); break;
            case 'toggleh1': this.insertToggleHeading(1); break;
            case 'callout': this.insertCallout(); break;
            case 'bulletlist': document.execCommand('insertUnorderedList', false, null); break;
            case 'numberedlist': document.execCommand('insertOrderedList', false, null); break;
            case 'checklist': this.insertChecklist(); break;
            case 'togglelist': this.insertToggleList(); break;
            case 'code': this.insertCodeBlock(); break;
        }
    }

    insertToggleHeading(level) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const selectedText = range.toString() || `Başlık ${level}`;
            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'toggle-heading';
            toggleDiv.innerHTML = `
                <div class="toggle-header">
                    <span class="toggle-arrow">▼</span>
                    <span style="font-weight: 600;">H</span>
                    <span>${selectedText}</span>
                </div>
                <div class="toggle-content">
                    <p>İçerik buraya gelecek...</p>
                </div>
            `;
            range.deleteContents();
            range.insertNode(toggleDiv);
        }
    }

    insertToggleList() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'toggle-list';
            toggleDiv.innerHTML = `
                <div class="toggle-header">
                    <span class="toggle-arrow">▼</span>
                    <span>Açılır Liste</span>
                </div>
                <div class="toggle-content">
                    <ul><li>Öğe 1</li></ul>
                </div>
            `;
            range.deleteContents();
            range.insertNode(toggleDiv);
        }
    }

    insertCallout() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const callout = document.createElement('div');
            callout.className = 'callout';
            callout.innerHTML = `<span class="callout-icon">💡</span><span>Yeni Callout</span>`;
            range.deleteContents();
            range.insertNode(callout);
        }
    }

    insertChecklist() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const item = document.createElement('div');
            item.className = 'checklist-item';
            item.innerHTML = `<span class="checkbox" contenteditable="false"></span><span>Yapılacak madde</span>`;
            range.deleteContents();
            range.insertNode(item);
        }
    }

    insertCodeBlock() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const pre = document.createElement('pre');
            pre.innerHTML = `<code>// Kod buraya</code>`;
            range.deleteContents();
            range.insertNode(pre);
        }
    }

    handleLinkCommand(editor) {
        const url = prompt('Bağlantı URLsi:', 'https://');
        if (url) {
            document.execCommand('createLink', false, url);
        }
        editor.focus();
    }

    handleSelectionChange() {
        if (this.toolbarTimeout) clearTimeout(this.toolbarTimeout);
        this.toolbarTimeout = setTimeout(() => {
            if (this.activeToolbar) this.updateActiveStates(this.activeToolbar);
        }, 50);
    }

    updateActiveStates(toolbar) {
        const formatButtons = toolbar.querySelectorAll('.text-toolbar-btn.format');
        formatButtons.forEach(btn => {
            const command = btn.dataset.command;
            if (document.queryCommandState(command)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const alignButtons = toolbar.querySelectorAll('.text-toolbar-btn.align');
        alignButtons.forEach(btn => {
            const command = btn.dataset.command;
            if (document.queryCommandState(command)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update font size selector
        const fontSizeSelector = toolbar.querySelector('#fontSizeSelector');
        if (fontSizeSelector) {
            const size = document.queryCommandValue('fontSize');
            // document.queryCommandValue('fontSize') might return browser-specific numbers (1-7)
            // It's safer to check the actual computed style of the selection
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
                let node = sel.getRangeAt(0).startContainer;
                if (node.nodeType === 3) node = node.parentElement;
                const computedSize = window.getComputedStyle(node).fontSize;
                const pxValue = parseInt(computedSize);
                if (pxValue) {
                    fontSizeSelector.value = pxValue;
                }
            }
        }
    }

    createToolbar(editor, x, y) {
        const toolbar = document.createElement('div');
        toolbar.className = 'rich-text-toolbar text-toolbar-wrapper visible';
        toolbar.style.left = `${Math.max(10, x)}px`;
        toolbar.style.top = `${Math.max(10, y)}px`;

        toolbar.innerHTML = this.createToolbarHTML();
        this.bindToolbarEvents(toolbar, editor);

        return toolbar;
    }

    handleEnter(e) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        // Find closest block element
        let current = range.startContainer;
        if (current.nodeType === 3) current = current.parentElement;

        const checklistItem = current.closest('.checklist-item');

        if (checklistItem) {
            e.preventDefault();
            e.stopPropagation();

            // Logic 1: Find if item is empty
            // Same logic as before but more robust: use innerText of the whole item.
            // This covers cases where text is typed outside the span.
            const itemText = checklistItem.innerText;
            const isEmpty = !itemText || itemText.trim().replace(/\u200B/g, '') === '';

            if (isEmpty) {
                // Return to paragraph mode (exit checklist)
                const p = document.createElement('div');
                p.innerHTML = '<br>'; // Empty line to hold height

                // Replace the empty checklist item with the new paragraph
                checklistItem.replaceWith(p);

                const newRange = document.createRange();
                newRange.setStart(p, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                return;
            }

            // Logic 2: Create new checklist item
            const newItem = document.createElement('div');
            newItem.className = 'checklist-item';
            newItem.innerHTML = `<span class="checkbox" contenteditable="false"></span><span></span>`;
            const newSpan = newItem.querySelector('span:not(.checkbox)');

            // Logic 3: Split content if cursor is in middle
            // move remaining content to new item
            const frag = range.extractContents();
            newSpan.appendChild(frag);

            // Insert after current
            if (checklistItem.nextSibling) {
                checklistItem.parentElement.insertBefore(newItem, checklistItem.nextSibling);
            } else {
                checklistItem.parentElement.appendChild(newItem);
            }

            // Move cursor to start of new item
            const newRange = document.createRange();
            newRange.selectNodeContents(newSpan);
            newRange.collapse(true); // Start
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    }

    finishEditing(state) {
        if (!this.isEditing) return;

        if (!this.editingInReadOnly) {
            this.editingObject.htmlContent = this.activeEditor.innerHTML;
            this.editingObject.width = this.activeEditor.offsetWidth;
            this.editingObject.height = this.activeEditor.offsetHeight;
        }

        const plainText = this.activeEditor.innerText.trim();
        const isPlaceholder = plainText.toLowerCase() === 'yeni metin';

        if ((plainText === "" || isPlaceholder) && !this.activeEditor.querySelector('img')) {
            const idx = state.objects.indexOf(this.editingObject);
            if (idx !== -1) {
                state.objects.splice(idx, 1);
            }
        } else {
            if (!state.objects.includes(this.editingObject)) {
                state.objects.push(this.editingObject);
            }
        }

        // Force a final image generation
        this.generateCachedImage(this.editingObject);

        if (this.activeEditor) this.activeEditor.remove();
        if (this.activeToolbar) this.activeToolbar.remove();

        if (this.viewportHandler && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this.viewportHandler);
            window.visualViewport.removeEventListener('scroll', this.viewportHandler);
            this.viewportHandler = null;
        }

        this.isEditing = false;
        this.editingObject = null;
        this.activeEditor = null;
        this.activeToolbar = null;

        if (this.renderCallback) this.renderCallback();
    }

    /**
     * Handles interactive clicks on a rendered text object (e.g. toggling headers)
     */
    handleInteractiveClick(obj, pageRelativePos) {
        // Convert pageRelativePos to local relative to object
        const localX = pageRelativePos.x - obj.x;
        const localY = pageRelativePos.y - obj.y;

        // Safety check for bounds
        if (localX < 0 || localX > obj.width || localY < 0 || localY > obj.height) return false;

        // Create a mirror for hit-testing that matches the SVG layout exactly
        const mirror = document.createElement('div');
        // IMPORTANT: Element must be within viewport and visible for elementFromPoint to work.
        // We use opacity: 0 to hide it visually, and position: fixed to control placement.
        mirror.style.cssText = `
            position: fixed;
            opacity: 0;
            pointer-events: auto;
            z-index: 99999;
            width: ${obj.width}px;
            height: ${obj.height}px;
            font-family: sans-serif;
            font-size: ${obj.fontSize}px;
            line-height: 1.4;
            padding: 8px;
            margin: 0;
            box-sizing: border-box;
            word-wrap: break-word;
            white-space: pre-wrap;
            overflow: hidden;
            background: transparent;
        `;
        mirror.innerHTML = obj.htmlContent;
        if (obj.alignment) mirror.style.textAlign = obj.alignment;

        document.body.appendChild(mirror);

        // Position the mirror so that the point (localX, localY) aligns with a safe viewport coordinate (center of screen)
        // This is better than (10,10) which might be covered by sidebars or other UI elements.
        const testX = window.innerWidth / 2;
        const testY = window.innerHeight / 2;
        mirror.style.left = `${testX - localX}px`;
        mirror.style.top = `${testY - localY}px`;

        // Find element at the test coordinates
        const target = document.elementFromPoint(testX, testY);

        let changed = false;
        const header = target?.closest('.toggle-header');
        const checklistBox = target?.closest('.checkbox');
        const checklistItem = target?.closest('.checklist-item');

        if (checklistBox && checklistItem) {
            checklistItem.classList.toggle('checked');
            // Update object
            obj.htmlContent = mirror.innerHTML;
            this.generateCachedImage(obj);
            changed = true;
        } else if (header) {
            const container = header.parentElement;
            if (container.classList.contains('toggle-heading') || container.classList.contains('toggle-list')) {
                const isCollapsed = container.classList.toggle('collapsed');
                const arrow = header.querySelector('.toggle-arrow');
                if (arrow) {
                    arrow.textContent = isCollapsed ? '▶' : '▼';
                }

                // Update object
                obj.htmlContent = mirror.innerHTML;

                // Recalculate object height based on the new layout
                // To get the new height, we might need to let the browser compute it.
                // Since mirror has fixed height, we should remove height constraint to measure new height.
                mirror.style.height = 'auto';
                obj.height = mirror.offsetHeight;

                this.generateCachedImage(obj);
                changed = true;
            }
        }

        document.body.removeChild(mirror);
        return changed;
    }

    draw(ctx, obj) {
        if (!obj.htmlContent) return;

        // NEW: Don't draw the object on canvas if it is currently being edited
        // This fixes the "ghost" or "shadow" effect.
        if (this.isEditing && this.editingObject && this.editingObject.id === obj.id) {
            return;
        }

        // If restored from localStorage, _cachedImage might be a plain object {} 
        // We must ensure it's a real HTMLImageElement.
        const isRealImage = obj._cachedImage instanceof HTMLImageElement;

        if (!isRealImage || obj._cachedHtml !== obj.htmlContent || obj._cachedWidth !== obj.width || obj._cachedHeight !== obj.height || obj._cachedSize !== obj.fontSize || obj._cachedColor !== obj.color) {
            this.generateCachedImage(obj);
        }

        if (obj._cachedImage && obj._imageLoaded && (obj._cachedImage instanceof HTMLImageElement) && obj._cachedImage.complete && obj._cachedImage.naturalWidth > 0) {
            // Draw slightly offset to compensate for potential sub-pixel differences or padding
            if (obj.width > 0 && obj.height > 0) {
                ctx.drawImage(obj._cachedImage, obj.x, obj.y, obj.width, obj.height);
            }
        } else {
            // Minimal fallback so it's not invisible
            ctx.save();
            ctx.fillStyle = obj.color;
            ctx.font = `${obj.fontSize}px sans-serif`;
            ctx.textBaseline = 'top';
            const temp = document.createElement('div');
            temp.innerHTML = obj.htmlContent;
            ctx.fillText(temp.innerText.substring(0, 50) + (temp.innerText.length > 50 ? '...' : ''), obj.x + 8, obj.y + 8); // Offset by padding
            ctx.restore();
        }
    }

    generateCachedImage(obj) {
        obj._cachedHtml = obj.htmlContent;
        obj._cachedWidth = obj.width;
        obj._cachedHeight = obj.height;
        obj._cachedSize = obj.fontSize;
        obj._cachedColor = obj.color;
        obj._imageLoaded = false;

        // Use a temporary div to sanitize and serialize the content
        const tempDiv = document.createElement('div');
        // We apply the styles directly to this div before serialization to avoid nesting
        // Note: We're using standard CSS checks.
        tempDiv.innerHTML = obj.htmlContent;

        // Match .rich-text-editor CSS exactly to ensure identical rendering
        tempDiv.style.cssText = `
            font-family: sans-serif;
            font-size: ${obj.fontSize}px;
            color: ${obj.color};
            word-wrap: break-word;
            white-space: pre-wrap;
            margin: 0;
            padding: 8px; /* Match CSS padding */
            line-height: 1.4; /* Match CSS line-height */
            display: block;
            width: 100%;
            height: 100%;
            overflow: hidden; /* Match CSS overflow */
            box-sizing: border-box; /* Match CSS box-sizing */
            overflow: hidden; /* Match CSS overflow */
            box-sizing: border-box; /* Match CSS box-sizing */
            background: transparent;
            /* Removed global text-align to support per-paragraph styles */
        `;

        // Ensure proper XML serialization
        const serializer = new XMLSerializer();
        const xmlContent = serializer.serializeToString(tempDiv);

        // Exact dimensions of the object as calculated from offsetWidth/Height
        const svgWidth = Math.ceil(obj.width);
        const svgHeight = Math.ceil(obj.height);

        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
                <foreignObject width="100%" height="100%">
                    <div xmlns="http://www.w3.org/1999/xhtml">
                        <style>
                            .rich-text-editor { font-family: sans-serif; line-height: 1.4; color: ${obj.color}; }
                            h1 { font-size: 2em; font-weight: 700; margin: 0.3em 0; }
                            h2 { font-size: 1.5em; font-weight: 600; margin: 0.2em 0; }
                            h3 { font-size: 1.25em; font-weight: 600; margin: 0.1em 0; }
                            ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
                            blockquote { border-left: 3px solid #f59e0b; margin: 0.5em 0; padding: 0.5em 1em; background-color: #fffbeb; color: #92400e; border-radius: 0 6px 6px 0; }
                            .callout { display: flex; align-items: flex-start; gap: 8px; border-left: 3px solid #3b82f6; margin: 0.5em 0; padding: 0.75em 1em; background-color: #eff6ff; color: #1e40af; border-radius: 0 6px 6px 0; }
                            code { background-color: #181818ff; padding: 0.2em 0.4em; border-radius: 4px; color: #7e7e7eff; font-family: monospace; }
                            .checklist-item { display: flex; align-items: flex-start; gap: 10px; margin: 6px 0; }
                            .checklist-item .checkbox { width: 16px; height: 16px; border: 2px solid #ccc; border-radius: 4px; flex-shrink: 0; margin-top: 3px; position: relative; background-color: #fff; }
                            .checklist-item.checked .checkbox { background-color: #10b981; border-color: #10b981; }
                            .checklist-item.checked .checkbox::after { content: ''; position: absolute; left: 4px; top: 1px; width: 5px; height: 9px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
                            .checklist-item.checked { text-decoration: line-through; color: #9ca3af; opacity: 0.8; }
                            .checklist-item.checked span:not(.checkbox) { text-decoration: line-through; }
                             .toggle-heading, .toggle-list { border: 1px solid #e5e7eb; border-radius: 6px; padding: 2px 10px; margin: 4px 0; background-color: #fafafa; }
                            .toggle-header { display: flex; align-items: center; gap: 1px; cursor: pointer; min-height: 24px; }
                            .toggle-arrow { font-size: 10px; color: #6b7280; width: 12px; display: inline-block; text-align: center; }
                            .collapsed .toggle-content { display: none; }
                        </style>
                        <div class="rich-text-editor">
                            ${xmlContent}
                        </div>
                    </div>
                </foreignObject>
            </svg>
        `;

        const img = new Image();
        // Use data URL instead of blob URL to prevent canvas tainting
        const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

        img.onload = () => {
            obj._cachedImage = img;
            obj._imageLoaded = true;
            if (this.renderCallback) this.renderCallback();
        };
        img.onerror = (e) => {
            console.warn("Text SVG render error", e);
            obj._imageLoaded = true;
            if (this.renderCallback) this.renderCallback();
        };
        img.src = svgDataUrl;
    }

    /**
     * Export content as JSON format
     */
    exportAsJSON() {
        const content = this.editingObject?.htmlContent;
        if (!content) return null;
        return {
            version: 1,
            html: content,
            width: this.editingObject.width,
            height: this.editingObject.height
        };
    }

    /**
     * Import from Markdown
     */
    importFromMarkdown(markdown) {
        let html = markdown
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/__(.+?)__/g, '<u>$1</u>')
            .replace(/~~(.+?)~~/g, '<s>$1</s>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
            .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/^\s*(\d+)\. (.+)$/gm, '<li>$2</li>')
            .replace(/^\s*>\s*(.+)$/gm, '<blockquote>$1</blockquote>')
            .replace(/\n/g, '<br>');

        return html;
    }
}
