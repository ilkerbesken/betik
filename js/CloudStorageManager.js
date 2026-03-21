// ============================================================
// CloudStorageManager.js  v2.0
//
// Google Drive yapısı:
//   Betik/
//     .settings/
//       betik-manifest.json   ← SeCenek A: JSON yedek + meta
//     Klasör Adı/             ← Gerçek Drive klasörleri
//       Alt Klasör/
//         not-adı.tik
//       not-adı.tik
//     köksüz-not.tik          ← Klasörsüz boardlar kök dizinde
// ============================================================

class CloudStorageManager {
    constructor(app) {
        this.app = app;
        this.GOOGLE_CLIENT_ID = '915367935470-6ok8pt4dhr4thmmf4g4n2v112tksehds.apps.googleusercontent.com';
        this.GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
        this.gisLoaded = false;
        this.gdriveToken = localStorage.getItem('betik_gdrive_token');
        this.isSyncing = false;

        // Drive klasör ID önbelleği: path → driveId
        // Örn: "Betik" → "1abc...", "Betik/Proje" → "2def..."
        this._folderIdCache = {};
    }

    // ─── Platform Tespiti ────────────────────────────────────────
    static detect() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const hasFileSystem = 'showDirectoryPicker' in window;
        return { isIOS, isAndroid, isMobile: isIOS || isAndroid, hasFileSystem };
    }

    // ─── JSON Export ─────────────────────────────────────────────
    async exportToFile() {
        try {
            const data = await this._collectAllData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `betik-yedek-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    // ─── JSON Import ─────────────────────────────────────────────
    async importFromFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return resolve({ success: false, message: 'Dosya seçilmedi.' });
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        await this._applyImportedData(data);
                        resolve({ success: true, message: 'Veriler başarıyla yüklendi!' });
                    } catch (err) {
                        resolve({ success: false, message: 'Geçersiz dosya: ' + err.message });
                    }
                };
                reader.onerror = () => resolve({ success: false, message: 'Dosya okunamadı.' });
                reader.readAsText(file);
            };
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });
    }

    // ─── Google Identity Services ────────────────────────────────
    async _initGIS() {
        if (this.gisLoaded) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => { this.gisLoaded = true; resolve(); };
            script.onerror = () => reject(new Error('Google Identity Services yüklenemedi.'));
            document.head.appendChild(script);
        });
    }

    async signInGoogle() {
        await this._initGIS();
        return new Promise((resolve, reject) => {
            // eslint-disable-next-line no-undef
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.GOOGLE_CLIENT_ID,
                scope: this.GOOGLE_SCOPES,
                callback: (response) => {
                    if (response.error) return reject(new Error(response.error));
                    this.gdriveToken = response.access_token;
                    localStorage.setItem('betik_gdrive_token', response.access_token);
                    resolve(response.access_token);
                },
            });
            client.requestAccessToken();
        });
    }

    async signOutGoogle() {
        if (this.gdriveToken && typeof google !== 'undefined') {
            // eslint-disable-next-line no-undef
            google.accounts.oauth2.revoke(this.gdriveToken);
        }
        this.gdriveToken = null;
        localStorage.removeItem('betik_gdrive_token');
    }

    async _ensureToken() {
        if (!this.gdriveToken) await this.signInGoogle();
    }

    // ─── Ana Senkronizasyon ───────────────────────────────────────
    async syncWithGoogleDrive(targetId = null) {
        if (this.isSyncing && !targetId) return { success: false, message: 'Senkronizasyon zaten sürüyor.' };
        
        // Eğer bir targetId varsa ve o ID şu an zaten senkronize ediliyorsa bekleyebilir veya kuyruğa alınabilir.
        // Basitlik için sadece tekil sync'lerin çakışmasını engelliyoruz.
        if (targetId && this._activeSyncs?.has(targetId)) return { success: false, message: 'Bu öğe zaten senkronize ediliyor.' };
        
        if (!this._activeSyncs) this._activeSyncs = new Set();
        if (targetId) this._activeSyncs.add(targetId);
        else this.isSyncing = true;

        this._folderIdCache = {}; 

        try {
            await this._ensureToken();
            const fsm = window.fileSystemManager;
            const betikFolderId = await this._getOrCreateDriveFolder('Betik', null);
            const settingsFolderId = await this._getOrCreateDriveFolder('.settings', betikFolderId);
            
            let syncCount = 0;
            const locallyDeletedIds = await fsm.getItem('wb_deleted_ids', []);

            // ─── SENARYO A: DELTA SYNC (Sadece bir dosya/klasör değişti) ───
            if (targetId) {
                console.log(`[CloudSync] Delta Sync Başlatıldı: ${targetId}`);
                
                // 1. Silinmiş mi?
                if (locallyDeletedIds.includes(targetId)) {
                    await this._garbageCollect(betikFolderId, await fsm.getItem('wb_boards', []), await fsm.getItem('wb_folders', []), [targetId]);
                    await this._syncManifest(settingsFolderId);
                    return { success: true, delta: true };
                }

                // 2. Klasör mü?
                const folders = await fsm.getItem('wb_folders', []);
                const folder = folders.find(f => f.id === targetId);
                if (folder) {
                    await this._ensureDriveFolders(folders, betikFolderId);
                    await this._syncManifest(settingsFolderId);
                    return { success: true, delta: true };
                }

                // 3. Board mu?
                const boards = await fsm.getItem('wb_boards', []);
                const board = boards.find(b => b.id === targetId);
                if (board) {
                    const meta = await fsm.getSyncMetadata(board.id) || { id: board.id };
                    const content = await fsm.getItem(`wb_content_${board.id}`, null);
                    if (content) {
                        const driveFileId = await this._uploadBoardTik(board, content, folders, betikFolderId, meta.googleDriveFileId);
                        await fsm.setSyncMetadata(board.id, {
                            googleDriveFileId: driveFileId,
                            lastSyncedTime: Date.now()
                        });
                        await this._syncManifest(settingsFolderId);
                        return { success: true, delta: true };
                    }
                }
                
                return { success: false, message: 'ID bulunamadı.' };
            }

            // ─── SENARYO B: FULL SYNC (Uygulama açılışı veya Genel Yenileme) ───
            console.log('[CloudSync] Full Sync Başlatıldı...');
            const remoteManifestFile = await this._findFileInFolder('betik-manifest.json', settingsFolderId);
            // ... (Full Pull logic starts here from original code)

            let localBoards = await fsm.getItem('wb_boards', []);
            let localFolders = await fsm.getItem('wb_folders', []);
            // locallyDeletedIds zaten yukarıda tanımlandı.

            if (remoteManifestFile) {
                try {
                    const res = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${remoteManifestFile.id}?alt=media`,
                        { headers: { Authorization: `Bearer ${this.gdriveToken}` } }
                    );
                    if (res.ok) {
                        const remoteManifest = await res.json();
                        const remoteBoards = remoteManifest.boards || [];
                        const remoteFolders = remoteManifest.folders || [];

                        // 1. Klasörleri Senkronize Et (Merge)
                        for (const rf of remoteFolders) {
                            if (locallyDeletedIds.includes(rf.id)) {
                                // Yerelde az önce silindi, manifest henüz güncel değil
                                continue;
                            }
                            
                            const lfIndex = localFolders.findIndex(f => f.id === rf.id);
                            if (lfIndex === -1) {
                                // Yeni klasör (remote'da var, yerelde yok)
                                localFolders.push(rf);
                                syncCount++;
                            } else {
                                // Mevcut klasör - Güncelleme kontrolü (isim/renk değişmiş olabilir)
                                // Not: Klasörlerin lastModified özelliği yoksa isim kontrolü yapabiliriz
                                if (rf.name !== localFolders[lfIndex].name || rf.color !== localFolders[lfIndex].color || rf.parentId !== localFolders[lfIndex].parentId) {
                                    localFolders[lfIndex] = rf;
                                    syncCount++;
                                }
                            }
                        }

                        // 2. Boardları Senkronize Et (Download & Update)
                        const boardsToSync = [];
                        for (const rb of remoteBoards) {
                            const lb = localBoards.find(b => b.id === rb.id);
                            const meta = await fsm.getSyncMetadata(rb.id);

                            if (!lb) {
                                // Yerelde yok. Acaba silindiği için mi yok yoksa yeni mi?
                                if (meta && meta.googleDriveFileId) {
                                    // Daha önce senkronize edilmiş ama yerelde yok -> Yerelde silinmiş.
                                    continue;
                                } else if (locallyDeletedIds.includes(rb.id)) {
                                    // Yerelde az önce silindi, manifest henüz güncellenmedi
                                    continue;
                                } else {
                                    // Tamamen yeni bir board (başka cihazdan)
                                    boardsToSync.push(rb);
                                }
                            } else if (rb.lastModified > (lb.lastModified || 0)) {
                                // Remote daha güncel
                                boardsToSync.push(rb);
                            }
                        }

                        for (const rb of boardsToSync) {
                            const tikContent = await this._downloadBoardTik(rb, remoteFolders, betikFolderId);
                            if (tikContent) {
                                await fsm.saveItem(`wb_content_${rb.id}`, tikContent, true);
                                // Local listeyi güncelle/ekle
                                const idx = localBoards.findIndex(b => b.id === rb.id);
                                if (idx !== -1) {
                                    localBoards[idx] = rb;
                                } else {
                                    localBoards.push(rb);
                                }
                                syncCount++;
                            }
                        }

                        // 3. Uzaktan Silinenleri Yerelde Sil
                        const remoteBoardIds = new Set(remoteBoards.map(b => b.id));
                        const localBoardsAfterPull = [];
                        for (const lb of localBoards) {
                            const meta = await fsm.getSyncMetadata(lb.id);
                            if (meta && meta.googleDriveFileId && !remoteBoardIds.has(lb.id)) {
                                // Daha önce senkronize edilmiş ama artık remote manifest'te yok -> Remote'da silinmiş.
                                console.log(`[CloudSync] Uzaktan silinmiş, yerelden kaldırılıyor: ${lb.name}`);
                                await fsm.removeItem(`wb_content_${lb.id}`);
                                syncCount++;
                                continue;
                            }
                            localBoardsAfterPull.push(lb);
                        }
                        localBoards = localBoardsAfterPull;

                        // 4. Değişiklikleri Kaydet
                        if (syncCount > 0) {
                            await fsm.saveItem('wb_boards', localBoards, true);
                            await fsm.saveItem('wb_folders', localFolders, true);
                            if (remoteManifest.viewSettings) {
                                await fsm.saveItem('wb_view_settings', remoteManifest.viewSettings, true);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[CloudSync] Pull hatası:', e);
                }
            }

            // ── PUSH: Yereldeki değişiklikleri Drive'a yükle ──
            // localBoards ve localFolders güncel hallerini kullan
            const boards = localBoards;
            const folders = localFolders;

            // Uygulama klasör yapısını Drive'da yansıt
            await this._ensureDriveFolders(folders, betikFolderId);

            for (const board of boards) {
                let meta = await fsm.getSyncMetadata(board.id);
                if (!meta) {
                    await fsm.updateSyncMetadata(board.id);
                    meta = await fsm.getSyncMetadata(board.id);
                }

                const needsUpload = !meta.googleDriveFileId ||
                    (meta.lastModifiedLocally > (meta.lastSyncedTime || 0));

                if (needsUpload) {
                    const content = await fsm.getItem(`wb_content_${board.id}`, null);
                    if (content) {
                        const driveFileId = await this._uploadBoardTik(board, content, folders, betikFolderId, meta.googleDriveFileId);
                        await fsm.setSyncMetadata(board.id, {
                            googleDriveFileId: driveFileId,
                            lastSyncedTime: Date.now()
                        });
                        syncCount++;
                    }
                }
            }

            // ── Manifest Güncelleme ──
            // PUSH sonrası manifesti tekrar güncelle ki son haller (ID'ler vb) Drive'da olsun
            await this._syncManifest(settingsFolderId);

            // ── ÇÖP TOPLAMA (Garbage Collection) ──────────────────
            await this._garbageCollect(betikFolderId, boards, folders, locallyDeletedIds);

            // ── Temizlik: Artık silindiği kesinleşen ID'leri listeden çıkar ──
            if (locallyDeletedIds.length > 0) {
                // Sadece başarıyla işlenenleri değil, şimdilik hepsini temizliyoruz 
                // (Garbage collect hata verse bile yerel listeyi şişirmemek için)
                await fsm.saveItem('wb_deleted_ids', [], true);
            }

            return {
                success: true,
                message: syncCount > 0 ? `${syncCount} değişiklik işlendi.` : 'Her şey güncel.',
                syncCount: syncCount
            };

        } catch (err) {
            console.error('[CloudSync] Genel hata:', err);
            
            // Hata Durumu: Pending Queue (Kuyruğa Ekle)
            if (targetId) {
                await this._addToPendingQueue(targetId);
            }

            if (err.message?.includes('401') || err.message?.includes('token')) {
                this.gdriveToken = null;
                localStorage.removeItem('betik_gdrive_token');
            }
            return { success: false, message: err.message };
        } finally {
            if (targetId) this._activeSyncs.delete(targetId);
            else this.isSyncing = false;
        }
    }

    async _addToPendingQueue(id) {
        const fsm = window.fileSystemManager;
        const pending = await fsm.getItem('wb_pending_syncs', []);
        if (!pending.includes(id)) {
            pending.push(id);
            await fsm.saveItem('wb_pending_syncs', pending, true);
            console.log(`[CloudSync] İşlem kuyruğa alındı (Offline/Hata): ${id}`);
        }
    }

    async processPendingQueue() {
        if (!navigator.onLine) return;
        const fsm = window.fileSystemManager;
        const pending = await fsm.getItem('wb_pending_syncs', []);
        if (pending.length === 0) return;

        console.log(`[CloudSync] Kuyruk işleniyor (${pending.length} öğe)...`);
        const remaining = [];
        for (const id of pending) {
            const res = await this.syncWithGoogleDrive(id);
            if (!res.success) remaining.push(id);
        }
        await fsm.saveItem('wb_pending_syncs', remaining, true);
    }

    async saveToGoogleDrive() {
        return this.syncWithGoogleDrive();
    }

    async uploadImage(blob, fileName) {
        await this._ensureToken();
        const betikFolderId = await this._getOrCreateDriveFolder('Betik', null);
        const screenshotsFolderId = await this._getOrCreateDriveFolder('Ekran Görüntüleri', betikFolderId);
        
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        return await this._uploadRawToDrive(fileName, bytes, 'image/png', screenshotsFolderId);
    }

    async loadFromGoogleDrive() {
        return this.syncWithGoogleDrive();
    }

    // ─── Drive Klasör Yönetimi ────────────────────────────────────

    /**
     * Drive'da tek bir klasör bul veya oluştur.
     * @param {string} name  Klasör adı
     * @param {string|null} parentId  Üst klasör Drive ID'si (null → root)
     */
    async _getOrCreateDriveFolder(name, parentId, appFolderId = null) {
        const cacheKey = appFolderId ? appFolderId : (parentId ? `${parentId}/${name}` : name);
        if (this._folderIdCache[cacheKey]) return this._folderIdCache[cacheKey];

        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const folderMime = 'application/vnd.google-apps.folder';

        // ID ile ara (appProperties.folderId)
        if (appFolderId) {
            const qId = `appProperties has { key='folderId' and value='${appFolderId}' } and trashed=false`;
            const resId = await fetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({ q: qId, fields: 'files(id,name,parents)' }).toString(), { headers });
            if (resId.ok) {
                const dataId = await resId.json();
                if (dataId.files?.length > 0) {
                    const driveFolder = dataId.files[0];
                    // Eğer isim değişmişse veya klasör taşınmışsa güncelle
                    const nameChanged = driveFolder.name !== name;
                    const parentChanged = parentId && !driveFolder.parents?.includes(parentId);

                    if (nameChanged || parentChanged) {
                        let patchUrl = `https://www.googleapis.com/drive/v3/files/${driveFolder.id}?`;
                        const params = new URLSearchParams();
                        if (parentChanged) {
                            params.append('addParents', parentId);
                            if (driveFolder.parents?.[0]) params.append('removeParents', driveFolder.parents[0]);
                        }
                        
                        await fetch(patchUrl + params.toString(), {
                            method: 'PATCH',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name })
                        });
                    }
                    this._folderIdCache[cacheKey] = driveFolder.id;
                    return driveFolder.id;
                }
            }
        }

        // İsim ve Parent ile ara (fallback)
        let q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${folderMime}' and trashed=false`;
        if (parentId) q += ` and '${parentId}' in parents`;

        const searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
            new URLSearchParams({ q, fields: 'files(id,name,appProperties)' }).toString();

        const searchRes = await fetch(searchUrl, { headers });
        if (!searchRes.ok) {
            if (searchRes.status === 401) {
                this.gdriveToken = null;
                localStorage.removeItem('betik_gdrive_token');
            }
            throw new Error(`Drive bağlantı hatası: ${searchRes.status}`);
        }

        const data = await searchRes.json();
        if (data.files?.length > 0) {
            const foundFile = data.files[0];
            // REPAIR: Eğer isimle bulunduysa ama folderId'si yoksa (eski sürümden kalma vb), ID'yi ekle
            if (appFolderId && !foundFile.appProperties?.folderId) {
                console.log(`[CloudSync] Klasör onarılıyor (ID eklendi): ${name}`);
                await fetch(`https://www.googleapis.com/drive/v3/files/${foundFile.id}`, {
                    method: 'PATCH',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ appProperties: { folderId: appFolderId, type: 'folder' } })
                }).catch(e => console.warn('[CloudSync] Klasör onarım hatası:', e));
            }
            this._folderIdCache[cacheKey] = foundFile.id;
            return foundFile.id;
        }

        // 3. Oluştur
        const body = { 
            name, 
            mimeType: folderMime, 
            appProperties: { type: 'folder' } 
        };
        if (appFolderId) body.appProperties.folderId = appFolderId;
        if (parentId) body.parents = [parentId];

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!createRes.ok) throw new Error(`Klasör oluşturulamadı: ${name}`);
        const folder = await createRes.json();
        this._folderIdCache[cacheKey] = folder.id;
        return folder.id;
    }

    /**
     * Uygulama klasör hiyerarşisini Drive'da yansıt.
     * Her uygulama klasörü → Drive'da bir alt klasör.
     * Sonuç: { appFolderId → driveId } haritası döner.
     */
    async _ensureDriveFolders(folders, betikFolderId) {
        const appFolderToDriveId = {}; // appFolderId → driveId

        // Kök klasörler önce, sonra alt klasörler (parentId zincirini çözmek için)
        const sorted = this._sortFoldersByDepth(folders);

        for (const folder of sorted) {
            const safeName = this._sanitizeName(folder.name) || folder.id;
            let parentDriveId = betikFolderId;

            if (folder.parentId && appFolderToDriveId[folder.parentId]) {
                parentDriveId = appFolderToDriveId[folder.parentId];
            }

            const driveId = await this._getOrCreateDriveFolder(safeName, parentDriveId, folder.id);
            appFolderToDriveId[folder.id] = driveId;
        }

        return appFolderToDriveId;
    }

    /**
     * Klasörleri derinliğe göre sırala (üstten alta doğru).
     */
    _sortFoldersByDepth(folders) {
        const getDepth = (folder, visited = new Set()) => {
            if (!folder.parentId || visited.has(folder.id)) return 0;
            visited.add(folder.id);
            const parent = folders.find(f => f.id === folder.parentId);
            return parent ? 1 + getDepth(parent, visited) : 0;
        };
        return [...folders].sort((a, b) => getDepth(a) - getDepth(b));
    }

    // ─── .tik Dosyası Yükleme (PUSH) ─────────────────────────────

    /**
     * Bir board'un içeriğini .tik formatında Drive'a yükle.
     * Board'un klasörüne göre doğru Drive alt klasörünü kullanır.
     */
    async _uploadBoardTik(board, content, folders, betikFolderId, existingFileId) {
        // Hedef Drive klasörünü bul
        const targetFolderId = await this._getDriveTargetFolder(board, folders, betikFolderId);

        const safeName = this._sanitizeName(board.name) || board.id;
        const fileName = board.isPDF ? `${safeName}.pdf.tik` : `${safeName}.tik`;

        // .tik formatında sıkıştır (pako/gzip) - PDF verisi dahil
        const tikBytes = await this._contentToTik(content, board.id);

        const appProperties = { boardId: board.id, type: 'board' };
        return await this._uploadRawToDrive(fileName, tikBytes, 'application/x-betik', targetFolderId, existingFileId, appProperties);
    }

    /**
     * Board'un Drive'daki hedef klasör ID'sini döndür.
     */
    async _getDriveTargetFolder(board, folders, betikFolderId) {
        if (!board.folderId) return betikFolderId;

        // Klasör zincirini ID bazlı çöz (mükerrerliği önlemek için)
        const folderIds = this._getFolderPathIds(board.folderId, folders);
        let currentParent = betikFolderId;
        
        for (const fId of folderIds) {
            const folder = folders.find(f => f.id === fId);
            if (!folder) continue;
            
            const name = this._sanitizeName(folder.name) || folder.id;
            currentParent = await this._getOrCreateDriveFolder(name, currentParent, folder.id);
        }
        return currentParent;
    }

    _getFolderPathIds(folderId, folders) {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return [];
        if (!folder.parentId) return [folder.id];
        return [...this._getFolderPathIds(folder.parentId, folders), folder.id];
    }

    /**
     * Klasörün adını (ve üstlerinin adlarını) döndür.
     * @returns {string[]} ['Proje', 'Alt Klasör']
     */
    _getFolderPathNames(folderId, folders) {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return [];
        const safeName = this._sanitizeName(folder.name) || folderId;
        if (!folder.parentId) return [safeName];
        return [...this._getFolderPathNames(folder.parentId, folders), safeName];
    }

    /**
     * Board içeriğini .tik (gzip) byte dizisine dönüştür.
     * TikFileManager._serializeObject kullanarak canvas/tape/image gibi
     * nesneleri doğru şekilde serialize eder.
     */
    async _contentToTik(content, boardId = null) {
        // pako beklenmiyorsa yükle
        if (typeof pako === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        // TikFileManager._serializeObject'i kullan (canvas/tape/image serialization için)
        const tikFileManager = this.app?.tikFileManager;
        const serializeObj = tikFileManager
            ? (obj) => tikFileManager._serializeObject(obj)
            : (obj) => obj;

        // Sayfaları serialize et
        let serializedPages = null;
        if (content.pages) {
            serializedPages = content.pages.map(page => {
                const p = Object.assign({}, page);
                delete p.thumbnail;
                p.objects = (p.objects || []).map(obj => serializeObj(obj));
                return p;
            });
        }

        // PDF binary verisini ekle (eğer board PDF ise)
        let pdfBase64 = null;
        if (boardId) {
            try {
                const pdfBlob = await Utils.db.get(boardId);
                if (pdfBlob instanceof Blob && tikFileManager) {
                    pdfBase64 = await tikFileManager._blobToBase64(pdfBlob);
                }
            } catch (e) {
                console.warn('[CloudSync] PDF verisi alınamadı:', e);
            }
        }

        const jsonStr = JSON.stringify({
            version: content.version || '2.1',
            format: 'tik',
            savedAt: new Date().toISOString(),
            pages: serializedPages,
            objects: serializedPages ? null : (content.objects || null),
            pdfBase64: pdfBase64 || undefined
        });

        return pako.gzip(jsonStr);
    }

    // ─── .tik Dosyası İndirme (PULL) ─────────────────────────────

    /**
     * Bir board'un .tik dosyasını Drive'dan indir ve içeriği parse et.
     */
    async _downloadBoardTik(boardMeta, folders, betikFolderId) {
        try {
            // Önce .tik dosyasını ara
            const targetFolderId = await this._getDriveTargetFolder(boardMeta, folders, betikFolderId);
            const safeName = this._sanitizeName(boardMeta.name) || boardMeta.id;
            const fileName = boardMeta.isPDF ? `${safeName}.pdf.tik` : `${safeName}.tik`;

            const fileInfo = await this._findFileInFolder(fileName, targetFolderId);
            if (!fileInfo) return null;

            const res = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileInfo.id}?alt=media`,
                { headers: { Authorization: `Bearer ${this.gdriveToken}` } }
            );

            const arrayBuffer = await res.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);

            // pako ile decompress
            if (typeof pako === 'undefined') {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
                    s.onload = resolve; s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            let jsonStr;
            // BETIK! veya BETIK! imzasını kontrol et (gerûye uyumluluk)
            if (uint8[0] === 66 && uint8[1] === 69 || uint8[0] === 84 && uint8[1] === 79) {
                // Signed format: skip 6-byte header
                jsonStr = pako.inflate(uint8.slice(6), { to: 'string' });
            } else if (uint8[0] === 0x1f && uint8[1] === 0x8b) {
                jsonStr = pako.inflate(uint8, { to: 'string' });
            } else {
                jsonStr = new TextDecoder().decode(uint8);
            }

            const parsed = JSON.parse(jsonStr);

            // PDF base64 verisi varsa IndexedDB'ye geri yaz
            if (parsed.pdfBase64 && boardMeta.id) {
                try {
                    const tikFileManager = this.app?.tikFileManager;
                    if (tikFileManager) {
                        const pdfBlob = await tikFileManager._base64ToBlob(parsed.pdfBase64, 'application/pdf');
                        await Utils.db.save(boardMeta.id, pdfBlob);
                        console.log(`[CloudSync] PDF verisi geri yüklendi: ${boardMeta.name}`);
                    }
                } catch (e) {
                    console.warn('[CloudSync] PDF geri yükleme hatası:', e);
                }
            }

            return parsed;
        } catch (e) {
            console.warn('[CloudSync] .tik indirme hatası:', e);
            return null;
        }
    }

    // ─── Seçenek A: Manifest ──────────────────────────────────────

    /**
     * .settings/betik-manifest.json'u güncelle.
     * Board listesi, klasör yapısı, ve tüm meta verileri içerir.
     */
    async _syncManifest(settingsFolderId) {
        const fsm = window.fileSystemManager;
        const manifest = {
            version: 2,
            syncedAt: new Date().toISOString(),
            boards: await fsm.getItem('wb_boards', []),
            folders: await fsm.getItem('wb_folders', []),
            viewSettings: await fsm.getItem('wb_view_settings', {}),
            customCovers: await fsm.getItem('wb_custom_covers', [])
        };

        const fileName = 'betik-manifest.json';
        const existing = await this._findFileInFolder(fileName, settingsFolderId);
        const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
        await this._uploadRawToDrive(fileName, jsonBytes, 'application/json', settingsFolderId, existing?.id);
    }

    /**
     * Bir board veya klasörü Drive'dan anında çöpe at.
     * appProperties.boardId veya appProperties.folderId alanına göre dosyayı bulur.
     * @param {string[]} ids - Silinecek board/klasör ID listesi
     */
    async deleteFromDrive(ids = []) {
        if (!ids || ids.length === 0) return;
        try {
            await this._ensureToken();
        } catch (e) {
            // Token yoksa veya kullanıcı giriş yapmamışsa sessizce geç
            console.warn('[CloudSync] Drive silme: token alınamadı, atlanıyor.');
            return;
        }

        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const idSet = new Set(ids);

        try {
            // 1. appProperties'e göre dosyaları bul (sadece uygulamamızın dosyaları)
            let pageToken = null;
            do {
                const params = new URLSearchParams({
                    q: 'trashed=false',
                    fields: 'files(id,name,appProperties),nextPageToken',
                    pageSize: '1000'
                });
                if (pageToken) params.set('pageToken', pageToken);

                const res = await fetch(
                    `https://www.googleapis.com/drive/v3/files?${params}`,
                    { headers }
                );
                if (!res.ok) break;
                const data = await res.json();
                pageToken = data.nextPageToken;

                for (const file of (data.files || [])) {
                    const boardId = file.appProperties?.boardId;
                    const folderId = file.appProperties?.folderId;
                    const shouldTrash = (boardId && idSet.has(boardId)) || (folderId && idSet.has(folderId));

                    if (shouldTrash) {
                        console.log(`[CloudSync] Drive'dan çöpe atılıyor: ${file.name} (${boardId || folderId})`);
                        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                            method: 'PATCH',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ trashed: true })
                        }).catch(e => console.warn(`[CloudSync] Çöpe atma hatası (${file.name}):`, e));
                    }
                }
            } while (pageToken);
        } catch (e) {
            console.warn('[CloudSync] deleteFromDrive hatası:', e);
        }
    }

    // ─── Drive Dosya İşlemleri (Düşük Seviye) ────────────────────

    /**
     * Bir klasör içinde dosya ara.
     */
    async _findFileInFolder(fileName, folderId) {
        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const q = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
        const url = 'https://www.googleapis.com/drive/v3/files?' +
            new URLSearchParams({ q, fields: 'files(id,name)' }).toString();

        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const data = await res.json();
        return data.files?.[0] || null;
    }

    /**
     * Ham byte dizisini Drive'a yükle (multipart upload).
     * @returns {string} Drive file ID
     */
    async _uploadRawToDrive(fileName, bytes, mimeType, folderId, existingFileId, appProperties = {}) {
        const metadata = existingFileId
            ? { name: fileName, appProperties }
            : { name: fileName, parents: [folderId], appProperties };

        let url = existingFileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        // Eğer mevcut dosya varsa ve klasörü değişmişse taşı
        if (existingFileId && folderId) {
            try {
                const headRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFileId}?fields=parents`, {
                    headers: { Authorization: `Bearer ${this.gdriveToken}` }
                });
                if (headRes.ok) {
                    const fileInfo = await headRes.json();
                    const currentParent = fileInfo.parents?.[0];
                    if (currentParent && currentParent !== folderId) {
                        url += `&addParents=${folderId}&removeParents=${currentParent}`;
                    }
                }
            } catch (e) { console.warn('[CloudSync] Taşıma kontrolü hatası:', e); }
        }

        const blob = new Blob([bytes], { type: mimeType });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const res = await fetch(url, {
            method: existingFileId ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${this.gdriveToken}` },
            body: form
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Drive yükleme hatası (${res.status}): ${err.slice(0, 200)}`);
        }

        const result = await res.json();
        return result.id;
    }

    // ─── Garbage Collection ──────────────────────────────────────

    /**
     * Drive'daki dosyaları ve klasörleri kontrol ederek manifest'te olmayanları siler.
     */
    async _garbageCollect(betikFolderId, localBoards, localFolders, locallyDeletedIds = []) {
        try {
            const headers = { Authorization: `Bearer ${this.gdriveToken}` };
            
            // App tarafından oluşturulan TÜM dosyaları listele
            // (trashed=false ve parents kısıtlaması olmadan, drive.file scope sayesinde sadece kendi dosyalarımızı görürüz)
            const listUrl = 'https://www.googleapis.com/drive/v3/files?' +
                new URLSearchParams({ 
                    q: "trashed=false", 
                    fields: 'files(id,name,appProperties,mimeType,parents,createdTime)' 
                }).toString();

            const boardIds = new Set(localBoards.map(b => b.id));
            const folderIds = new Set(localFolders.map(f => f.id));
            
            let pageToken = null;
            do {
                const listUrl = 'https://www.googleapis.com/drive/v3/files?' +
                    new URLSearchParams({ 
                        q: "trashed=false", 
                        fields: 'files(id,name,appProperties,mimeType,parents,createdTime),nextPageToken',
                        pageToken: pageToken || ''
                    }).toString();

                const res = await fetch(listUrl, { headers });
                if (!res.ok) break;
                const data = await res.json();
                pageToken = data.nextPageToken;
                
                for (const file of (data.files || [])) {
                    // Sadece Betik klasörü altındakileri kontrol et (manifest hariç)
                    if (file.name === 'betik-manifest.json' || file.name === 'betik-manifest.json' || file.name === 'betik-manifest-v2.json') continue;
                    
                    const type = file.appProperties?.type;
                    const boardId = file.appProperties?.boardId;
                    const folderId = file.appProperties?.folderId;

                    let shouldDelete = false;

                    const createdTime = new Date(file.createdTime).getTime();
                    const now = Date.now();
                    const isNew = (now - createdTime < 60000); // 1 minute buffer for very new items

                    if (type === 'board') {
                        if (boardId) {
                            if (!boardIds.has(boardId)) {
                                if (locallyDeletedIds.includes(boardId) || !isNew) {
                                    shouldDelete = true;
                                }
                            }
                        }
                    } else if (type === 'folder') {
                        if (folderId && file.name !== 'Betik' && file.name !== 'Betik' && file.name !== '.settings') {
                            if (!folderIds.has(folderId)) {
                                if (locallyDeletedIds.includes(folderId) || !isNew) {
                                    shouldDelete = true;
                                }
                            }
                        }
                    }

                    if (shouldDelete) {
                        console.log(`[CloudSync] Garbage Collection: Çöpe Taşınıyor -> ${file.name}`);
                        try {
                            await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                                method: 'PATCH',
                                headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ trashed: true })
                            });
                        } catch (e) {
                            console.warn(`[CloudSync] Dosya çöpe atılamadı (${file.name}):`, e);
                        }
                    }
                }
            } while (pageToken);
        } catch (e) {
            console.warn('[CloudSync] Garbage Collection hatası:', e);
        }
    }

    // ─── Yardımcı Metotlar ────────────────────────────────────────

    _sanitizeName(name) {
        if (!name) return '';
        return name
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

    async _collectAllData() {
        const fsm = window.fileSystemManager;
        const boards = await fsm.getItem('wb_boards', []);
        const folders = await fsm.getItem('wb_folders', []);
        const viewSettings = await fsm.getItem('wb_view_settings', {});
        const customCovers = await fsm.getItem('wb_custom_covers', []);
        const contents = {};
        for (const board of boards) {
            const content = await fsm.getItem(`wb_content_${board.id}`, null);
            if (content) contents[board.id] = content;
        }
        return { version: 2, boards, folders, viewSettings, customCovers, contents };
    }

    async _applyImportedData(data) {
        const fsm = window.fileSystemManager;
        if (data.boards) await fsm.saveItem('wb_boards', data.boards);
        if (data.folders) await fsm.saveItem('wb_folders', data.folders);
        if (data.viewSettings) await fsm.saveItem('wb_view_settings', data.viewSettings);
        if (data.customCovers) await fsm.saveItem('wb_custom_covers', data.customCovers);
        if (data.contents) {
            for (const [boardId, content] of Object.entries(data.contents)) {
                await fsm.saveItem(`wb_content_${boardId}`, content);
            }
        }
    }
}

window.CloudStorageManager = CloudStorageManager;
