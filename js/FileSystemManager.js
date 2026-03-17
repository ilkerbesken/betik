/**
 * FileSystemManager - Yerel klasör + IndexedDB depolama yöneticisi
 *
 * ─── Sorun Düzeltmeleri ───────────────────────────────────────────────────
 * 1. Yerelde kayıt artık .tik formatında (gzip sıkıştırılmış)
 * 2. Silme işlemleri yerel klasörü de etkiliyor (hem .tik hem .json)
 * 3. Klasör yapısı uygulama içi yapıyla birebir eşleşiyor:
 *      klasör_adı/
 *        alt_klasör_adı/
 *          not_adı.tik
 *        not_adı.tik
 *      köksüz_not.tik
 * ─────────────────────────────────────────────────────────────────────────
 */
class FileSystemManager {
    constructor() {
        this.mode = 'indexeddb';
        this.db = null;
        this._initialized = false;
        this.onStorageChange = null;
        this.onSave = null;
        this.onRemove = null;
        this.dirHandle = null;
        this.storedHandle = null;

        // Board ve klasör verisini cache'le (klasör yolunu hesaplamak için)
        this._boards = [];
        this._folders = [];
    }

    async init() {
        if (this._initialized) return;

        this.db = new Dexie("BetikDB");
        this.db.version(1).stores({
            settings: 'key',
            data: 'key'
        });
        this.db.version(2).stores({
            settings: 'key',
            data: 'key',
            syncMetadata: 'id'
        }).upgrade(() => {});

        await this.db.open();

        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`[FileSystemManager] Persistent storage: ${isPersisted}`);
        }

        if (window.showDirectoryPicker) {
            const savedHandle = await this.db.settings.get('folder_handle');
            if (savedHandle) {
                this.storedHandle = savedHandle.value;
                if (await this._verifyPermission(this.storedHandle)) {
                    this.dirHandle = this.storedHandle;
                    this.mode = 'native';
                }
            }
        }

        this._initialized = true;

        // Başlangıçta yapı cache'ini doldur (yol hesaplamaları için kritik)
        this._boards = await this.getItem('wb_boards', []);
        this._folders = await this.getItem('wb_folders', []);

        console.log(`[FileSystemManager] Başlatıldı: ${this.mode} modunda.`);
        
        // Eğer native moddaysak klasör yapısını fiziksel olarak oluştur
        if (this.mode === 'native') {
            await this._syncFoldersToNative();
        }

        await this._checkInitialMigration();
    }

    // ─────────────────────────────────────────────
    // Board/Klasör Cache (yol hesaplamak için)
    // ─────────────────────────────────────────────

    /**
     * Klasör ve board listesini güncelle.
     * saveItem çağrısında wb_boards ve wb_folders yakalanır.
     */
    _updateStructureCache(key, value) {
        if (key === 'wb_boards' && Array.isArray(value)) {
            this._boards = value;
        } else if (key === 'wb_folders' && Array.isArray(value)) {
            this._folders = value;
        }
    }

    /**
     * Bir boardın yerel klasör yolunu hesapla.
     * Örnek: ["Proje", "Alt Klasör", "not_adı.tik"]
     * @returns {string[]} path segments (son eleman dosya adıdır)
     */
    _getBoardFilePath(boardId) {
        const board = this._boards.find(b => b.id === boardId);
        if (!board) {
            return [`wb_content_${boardId}.tik`];
        }

        // Dosya adı: board adı (sanitize edilmiş) + .tik
        const safeName = this._sanitizeName(board.name) || boardId;
        const fileName = `${safeName}.tik`;

        if (!board.folderId) {
            return [fileName];  // Kök dizin
        }

        // Klasör yolunu recursive olarak çöz
        const folderPath = this._getFolderPath(board.folderId);
        return [...folderPath, fileName];
    }

    /**
     * Bir klasörün yol segmentlerini döndür.
     * @returns {string[]} path segments
     */
    _getFolderPath(folderId, visited = new Set()) {
        if (visited.has(folderId)) return []; // Döngüsel referans koruması
        visited.add(folderId);

        const folder = this._folders.find(f => f.id === folderId);
        if (!folder) return [];

        const safeName = this._sanitizeName(folder.name) || folderId;

        if (!folder.parentId) {
            return [safeName];
        }

        const parentPath = this._getFolderPath(folder.parentId, visited);
        return [...parentPath, safeName];
    }

    /**
     * Dosya/klasör adını temizle (geçersiz karakterleri kaldır)
     */
    _sanitizeName(name) {
        if (!name) return '';
        return name
            .replace(/[\\/:*?"<>|]/g, '_') // Windows geçersiz karakterler
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

    // ─────────────────────────────────────────────
    // Temel Operasyonlar
    // ─────────────────────────────────────────────

    async _checkInitialMigration() {
        const migrated = await this.db.settings.get('migrated_from_local');
        if (!migrated) {
            console.log('[FileSystemManager] localStorage migrasyonu yapılıyor...');
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('wb_') || key.startsWith('betik_'))) {
                    try {
                        const val = JSON.parse(localStorage.getItem(key));
                        await this.saveItem(key, val, true);
                    } catch (e) {}
                }
            }
            await this.db.settings.put({ key: 'migrated_from_local', value: true });
        }
    }

    async _verifyPermission(handle) {
        try {
            return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
        } catch (e) { return false; }
    }

    async requestStoredPermission() {
        if (!this.storedHandle) return false;
        try {
            const status = await this.storedHandle.requestPermission({ mode: 'readwrite' });
            if (status === 'granted') {
                this.dirHandle = this.storedHandle;
                this.mode = 'native';
                if (this.onStorageChange) this.onStorageChange();
                return true;
            }
            return false;
        } catch (e) { return false; }
    }

    async pickStorageFolder() {
        if (!window.showDirectoryPicker) {
            Utils.showToast('Tarayıcınız yerel klasör erişimini desteklemiyor. IndexedDB kullanılmaya devam edilecek.', 'info');
            return false;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await this.db.settings.put({ key: 'folder_handle', value: handle });
            this.dirHandle = handle;
            this.storedHandle = handle;
            this.mode = 'native';

            // Mevcut tüm içeriği yeni klasöre yaz
            await this.syncToFolder();

            if (this.onStorageChange) this.onStorageChange();
            return true;
        } catch (e) {
            console.warn('[FileSystemManager] pickStorageFolder hatası:', e);
            return false;
        }
    }

    /**
     * IndexedDB'deki tüm içeriği yerel klasöre yaz
     */
    async syncToFolder() {
        if (!this.dirHandle) return;

        // Boards ve folders listesini önceden yükle
        const boardsItem = await this.db.data.get('wb_boards');
        const foldersItem = await this.db.data.get('wb_folders');
        if (boardsItem) this._boards = boardsItem.value || [];
        if (foldersItem) this._folders = foldersItem.value || [];

        const allData = await this.db.data.toArray();
        for (const item of allData) {
            await this._saveToNative(item.key, item.value);
        }
        console.log(`[FileSystemManager] ${allData.length} öğe yerel klasöre senkronize edildi.`);
    }

    // ─────────────────────────────────────────────
    // CRUD Operasyonları
    // ─────────────────────────────────────────────

    async saveItem(key, value, skipNative = false) {
        // 1. Yapı cache'ini güncelle
        this._updateStructureCache(key, value);

        // 2. Her zaman Dexie'ye kaydet
        await this.db.data.put({ key, value });

        // 3. Sync metadata güncelle
        if (key.startsWith('wb_content_')) {
            const boardId = key.replace('wb_content_', '');
            await this.updateSyncMetadata(boardId);
        }

        // 4. LocalStorage mirror (legacy erişim için)
        try {
            // Content dosyaları çok büyük olabilir, localStorage'a yazma
            if (!key.startsWith('wb_content_')) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) {}

        // 5. Native klasöre yaz
        if (!skipNative && this.mode === 'native' && this.dirHandle) {
            await this._saveToNative(key, value);
        }

        if (this.onSave) this.onSave(key, value);
    }

    /**
     * Yerel klasöre kaydet.
     * - wb_content_{boardId} → klasör/alt_klasör/board_adı.tik (gzip)
     * - wb_boards, wb_folders, vb. → _meta/key.json (düz JSON)
     */
    async _saveToNative(key, value) {
        if (!this.dirHandle) return;

        try {
            if (key.startsWith('wb_content_')) {
                await this._saveBoardToNative(key, value);
            } else if (key === 'wb_folders') {
                // Önce meta veriyi kaydet
                await this._saveMetaToNative(key, value);
                // Sonra klasör yapısını fiziksel olarak yansıt (boş klasörler dahil)
                await this._syncFoldersToNative();
            } else {
                await this._saveMetaToNative(key, value);
            }
        } catch (e) {
            console.warn('[FileSystemManager] Yerel kayıt başarısız:', key, e.message);
        }
    }

    /**
     * Uygulamadaki tüm klasör yapısını yerel dosya sisteminde yansıt (fiziksel klasörleri oluştur).
     */
    async _syncFoldersToNative() {
        if (!this.dirHandle || !this._folders) return;
        
        console.log('[FileSystemManager] Klasör yapısı yerel diskte güncelleniyor...');
        
        // Derinliğe göre sırala (üstten alta doğru oluşturmak için)
        const sortedFolders = this._sortFoldersByDepth(this._folders);

        for (const folder of sortedFolders) {
            try {
                const pathSegments = this._getFolderPath(folder.id);
                if (pathSegments.length === 0) continue;

                let currentDir = this.dirHandle;
                for (const segment of pathSegments) {
                    currentDir = await currentDir.getDirectoryHandle(segment, { create: true });
                }
            } catch (e) {
                console.warn('[FileSystemManager] Klasör oluşturma hatası:', folder.name, e);
            }
        }
    }

    _sortFoldersByDepth(folders) {
        const getDepth = (folder, visited = new Set()) => {
            if (!folder.parentId || visited.has(folder.id)) return 0;
            visited.add(folder.id);
            const parent = folders.find(f => f.id === folder.parentId);
            return parent ? 1 + getDepth(parent, visited) : 0;
        };
        return [...folders].sort((a, b) => getDepth(a) - getDepth(b));
    }

    /**
     * Board içeriğini .tik formatında (gzip) yerel klasöre kaydet.
     * Klasör yapısını board'un folderId'sine göre oluşturur.
     */
    async _saveBoardToNative(key, value) {
        const boardId = key.replace('wb_content_', '');
        
        // GÜVENLİK: boardId geçerli değilse veya 'null' ise yazma
        if (!boardId || boardId === 'null' || boardId === 'undefined') {
            console.warn('[FileSystemManager] Geçersiz boardId tespit edildi, native kayıt atlanıyor:', key);
            return;
        }

        const pathSegments = this._getBoardFilePath(boardId);
        // pathSegments: ['Proje', 'Alt', 'notAdı.tik']

        // pathSegments'in son elemanı dosya adı, gerisi klasörler
        const folders = pathSegments.slice(0, -1);
        const fileName = pathSegments[pathSegments.length - 1];

        // Klasör zincirini oluştur
        let targetDir = this.dirHandle;
        for (const folderName of folders) {
            targetDir = await targetDir.getDirectoryHandle(folderName, { create: true });
        }

        // İçeriği hazırla — TikFileManager gibi gzip ile sıkıştır
        const content = JSON.stringify({
            version: value.version || '2.1',
            format: 'tom',
            savedAt: new Date().toISOString(),
            pages: value.pages || null,
            objects: value.objects || null
        });

        let binaryData;
        if (typeof pako !== 'undefined') {
            binaryData = pako.gzip(content);
        } else {
            // pako yoksa düz JSON yaz
            binaryData = new TextEncoder().encode(content);
        }

        const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(binaryData);
        await writable.close();

        console.log(`[FileSystemManager] ${pathSegments.join('/')} kaydedildi.`);
    }

    /**
     * Meta verileri (boards listesi, folders, vb.) _meta/ klasörüne kaydet.
     */
    async _saveMetaToNative(key, value) {
        const metaDir = await this.dirHandle.getDirectoryHandle('_meta', { create: true });
        const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const fileHandle = await metaDir.getFileHandle(`${safeKey}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(value, null, 2));
        await writable.close();
    }

    async getItem(key, defaultValue) {
        const item = await this.db.data.get(key);
        if (item !== undefined) {
            try {
                if (!key.startsWith('wb_content_')) {
                    localStorage.setItem(key, JSON.stringify(item.value));
                }
            } catch (e) {}
            return item.value;
        }

        // Fallback: localStorage
        const local = localStorage.getItem(key);
        if (local) {
            try {
                const val = JSON.parse(local);
                await this.db.data.put({ key, value: val });
                return val;
            } catch (e) {}
        }

        return defaultValue;
    }

    /**
     * Board veya meta veriyi sil.
     * - IndexedDB'den siler
     * - LocalStorage'dan siler
     * - Yerel klasörden .tik veya .json dosyasını siler
     */
    async removeItem(key) {
        await this.db.data.delete(key);
        localStorage.removeItem(key);

        if (this.mode === 'native' && this.dirHandle) {
            if (key.startsWith('wb_content_')) {
                await this._removeBoardFromNative(key);
            } else {
                await this._removeMetaFromNative(key);
            }
        }

        if (this.onRemove) this.onRemove(key);
    }

    async _removeBoardFromNative(key) {
        const boardId = key.replace('wb_content_', '');
        const pathSegments = this._getBoardFilePath(boardId);
        const folders = pathSegments.slice(0, -1);
        const fileName = pathSegments[pathSegments.length - 1];

        try {
            let targetDir = this.dirHandle;
            for (const folderName of folders) {
                targetDir = await targetDir.getDirectoryHandle(folderName, { create: false });
            }

            // .tik dosyasını sil
            await targetDir.removeEntry(fileName).catch(() => {});

            // Eski format (.json) de sil (geriye dönük uyumluluk)
            const jsonName = `${key}.json`;
            await this.dirHandle.removeEntry(jsonName).catch(() => {});

            // Boş klasörleri temizle (isteğe bağlı, sessizce başarısız)
            await this._cleanupEmptyFolders(folders);

        } catch (e) {
            console.warn('[FileSystemManager] Board silme başarısız:', key, e.message);
        }
    }

    async _removeMetaFromNative(key) {
        try {
            const metaDir = await this.dirHandle.getDirectoryHandle('_meta', { create: false });
            const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
            await metaDir.removeEntry(`${safeKey}.json`).catch(() => {});
        } catch (e) {}
    }

    /**
     * Boş klasörleri temizle (en içten dışa doğru)
     */
    async _cleanupEmptyFolders(folderPath) {
        for (let i = folderPath.length - 1; i >= 0; i--) {
            try {
                let dir = this.dirHandle;
                for (let j = 0; j < i; j++) {
                    dir = await dir.getDirectoryHandle(folderPath[j], { create: false });
                }
                const targetFolder = await dir.getDirectoryHandle(folderPath[i], { create: false });

                // Klasörde başka şey var mı?
                let isEmpty = true;
                for await (const _ of targetFolder.values()) {
                    isEmpty = false;
                    break;
                }

                if (isEmpty) {
                    await dir.removeEntry(folderPath[i], { recursive: false });
                    console.log(`[FileSystemManager] Boş klasör silindi: ${folderPath.slice(0, i + 1).join('/')}`);
                }
            } catch (e) {
                // Dizin var olmayabilir, sessizce geç
            }
        }
    }

    /**
     * Bir board yerel klasörde taşınmış olabilir (yeni klasöre/isim değişimi).
     * Eski dosyayı sil, yeni konuma kaydet.
     */
    async moveBoardNativeFile(boardId, oldBoard) {
        if (this.mode !== 'native' || !this.dirHandle) return;

        // Eski yolu hesapla (board güncellenmeden önceki haliyle)
        const oldCache = this._boards;
        const oldPath = this._getBoardFilePathFromBoard(oldBoard);
        const oldFolders = oldPath.slice(0, -1);
        const oldFileName = oldPath[oldPath.length - 1];

        try {
            let oldDir = this.dirHandle;
            for (const f of oldFolders) {
                oldDir = await oldDir.getDirectoryHandle(f, { create: false });
            }
            await oldDir.removeEntry(oldFileName).catch(() => {});
            await this._cleanupEmptyFolders(oldFolders);
        } catch (e) {}
    }

    _getBoardFilePathFromBoard(board) {
        if (!board) return [];
        const safeName = this._sanitizeName(board.name) || board.id;
        const fileName = `${safeName}.tik`;
        if (!board.folderId) return [fileName];
        const folderPath = this._getFolderPath(board.folderId);
        return [...folderPath, fileName];
    }

    // ─────────────────────────────────────────────
    // Sync Metadata
    // ─────────────────────────────────────────────

    async updateSyncMetadata(boardId) {
        const meta = await this.db.syncMetadata.get(boardId) || {
            id: boardId,
            googleDriveFileId: null,
            lastSyncedTime: 0
        };
        meta.lastModifiedLocally = Date.now();
        await this.db.syncMetadata.put(meta);
    }

    async getSyncMetadata(boardId) {
        return await this.db.syncMetadata.get(boardId);
    }

    async setSyncMetadata(boardId, data) {
        const current = await this.getSyncMetadata(boardId) || { id: boardId };
        await this.db.syncMetadata.put({ ...current, ...data });
    }
}

window.fileSystemManager = new FileSystemManager();
