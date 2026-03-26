// Canvas için sabit mantıksal boyutlar
// Bu değerler tüm uygulama boyunca tutarlı olmalıdır
// Responsive tasarımda canvas CSS ile ölçeklendirilir ama
// internal koordinat sistemi bu sabit boyutlarda kalır

const CANVAS_CONSTANTS = {
    LOGICAL_WIDTH: 1920,
    LOGICAL_HEIGHT: 1080
};

const APP_CONFIG = {
    NAME: "betik",
    ID: "betik",
    STORAGE_PREFIX: "betik_",
    FILE_EXTENSION: ".tik",
    MIME_TYPE: "application/x-betik",
    CACHE_NAME: "betik-v1",
    TOAST_ID: "betik-toast",
    GDRIVE_FOLDER: "betik",
    MANIFEST_FILE: "betik-manifest.json",
    SIGNATURE: "betik!!" // Dosya formatı imzası (6 karakter olmalı)
};
