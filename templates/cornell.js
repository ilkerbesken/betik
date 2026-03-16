const CORNELL_TEMPLATE = {
    id: "cornell-template",
    name: "Cornell Not Sistemi",
    category: "Eğitim",
    description: "Etkili not alma tekniği için Cornell düzeni.",
    thumbnail: "assets/templates/cornell.png",
    objects: [
        // Dış Çerçeve
        { type: "rectangle", x: 40, y: 40, width: 714, height: 1043, color: "#333333", filled: false, strokeWidth: 2, locked: true, persistent: true },
        // Başlık Alanı
        { type: "line", x1: 40, y1: 120, x2: 754, y2: 120, color: "#333333", strokeWidth: 2, locked: true, persistent: true },
        // Başlık Metni
        { type: "text", x: 60, y: 65, text: "Konu:", fontSize: 18, fontWeight: "bold", color: "#666666", locked: true, persistent: true },
        { type: "text", x: 500, y: 65, text: "Tarih: ___/___/___", fontSize: 14, color: "#666666", locked: true, persistent: true },

        // Cue (İpucu) Kolonu Dikey Çizgi
        { type: "line", x1: 220, y1: 120, x2: 220, y2: 900, color: "#333333", strokeWidth: 2, locked: true, persistent: true },

        // Özet Alanı Yatay Çizgi
        { type: "line", x1: 40, y1: 900, x2: 754, y2: 900, color: "#333333", strokeWidth: 2, locked: true, persistent: true },

        // Etiketler
        { type: "text", x: 60, y: 140, text: "İPUÇLARI / SORULAR", fontSize: 12, fontWeight: "bold", color: "#999999", locked: true, persistent: true },
        { type: "text", x: 240, y: 140, text: "NOTLAR", fontSize: 12, fontWeight: "bold", color: "#999999", locked: true, persistent: true },
        { type: "text", x: 60, y: 920, text: "ÖZET", fontSize: 12, fontWeight: "bold", color: "#999999", locked: true, persistent: true }
    ],
    generate: function () {
        // Not alma alanına ince çizgiler ekle
        for (let y = 170; y < 900; y += 30) {
            this.objects.push({
                type: "line",
                x1: 220, y1: y, x2: 754, y2: y,
                color: "#eeeeee", strokeWidth: 1,
                locked: true, persistent: true
            });
        }
    }
};
