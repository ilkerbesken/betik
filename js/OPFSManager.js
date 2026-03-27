/**
 * OPFSManager - Origin Private File System (OPFS) Depolama Yöneticisi
 * Büyük dosyaları (PDF, .tik içerikleri) RAM'i yormadan, streaming ile saklamak için kullanılır.
 */
class OPFSManager {
    constructor() {
        this.root = null;
        this._initialized = false;
    }

    async init() {
        if (this._initialized) return true;
        try {
            if (!navigator.storage || !navigator.storage.getDirectory) {
                console.warn('[OPFSManager] OPFS desteği yok.');
                return false;
            }
            this.root = await navigator.storage.getDirectory();
            this._initialized = true;
            return true;
        } catch (e) {
            console.error('[OPFSManager] Başlatma hatası:', e);
            return false;
        }
    }

    /**
     * Veriyi (Blob veya ArrayBuffer) OPFS'e yazar.
     */
    async writeFile(fileName, data) {
        if (!this._initialized && !(await this.init())) return false;
        try {
            const fileHandle = await this.root.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();
            return true;
        } catch (e) {
            console.error(`[OPFSManager] Yazma hatası (${fileName}):`, e);
            return false;
        }
    }

    /**
     * Dosyayı OPFS'den okur (Blob olarak döner).
     */
    async readFile(fileName) {
        if (!this._initialized && !(await this.init())) return null;
        try {
            const fileHandle = await this.root.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            return file;
        } catch (e) {
            return null;
        }
    }

    /**
     * Dosyayı siler.
     */
    async deleteFile(fileName) {
        if (!this._initialized && !(await this.init())) return false;
        try {
            await this.root.removeEntry(fileName);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Tüm dosyaları listeler (hata ayıklama için).
     */
    async listFiles() {
        if (!this._initialized && !(await this.init())) return [];
        const files = [];
        for await (const entry of this.root.values()) {
            if (entry.kind === 'file') files.push(entry.name);
        }
        return files;
    }
}

window.opfsManager = new OPFSManager();