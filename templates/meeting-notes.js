const MEETING_NOTES_TEMPLATE = {
    id: "meeting-notes-template",
    name: "Toplantı Notları",
    category: "İş Planlama",
    description: "Profesyonel toplantı kayıtları için düzeltilmiş şablon.",
    thumbnail: "assets/templates/meeting-notes.png",
    objects: [
        { type: "text", x: 60, y: 50, text: "TOPLANTI NOTLARI", fontSize: 28, fontWeight: "bold", color: "#2c3e50", locked: true, persistent: true },
        { type: "line", x1: 60, y1: 90, x2: 734, y2: 90, color: "#2c3e50", strokeWidth: 3, locked: true, persistent: true },

        // Üst bilgiler
        { type: "text", x: 60, y: 110, text: "Konu:", fontSize: 16, fontWeight: "bold", color: "#34495e", locked: true, persistent: true },
        { type: "line", x1: 115, y1: 128, x2: 400, y2: 128, color: "#bdc3c7", strokeWidth: 1, locked: true, persistent: true },

        { type: "text", x: 450, y: 110, text: "Tarih:", fontSize: 16, fontWeight: "bold", color: "#34495e", locked: true, persistent: true },
        { type: "line", x1: 505, y1: 128, x2: 734, y2: 128, color: "#bdc3c7", strokeWidth: 1, locked: true, persistent: true },

        { type: "text", x: 60, y: 150, text: "Katılımcılar:", fontSize: 16, fontWeight: "bold", color: "#34495e", locked: true, persistent: true },
        { type: "line", x1: 165, y1: 168, x2: 734, y2: 168, color: "#bdc3c7", strokeWidth: 1, locked: true, persistent: true },

        // Gündem Bölümü
        { type: "rectangle", x: 60, y: 200, width: 674, height: 150, color: "#34495e", filled: false, strokeWidth: 2, borderRadius: 8, locked: true, persistent: true },
        { type: "text", x: 75, y: 210, text: "GÜNDEM", fontSize: 14, fontWeight: "bold", color: "#7f8c8d", locked: true, persistent: true },

        // Notlar Bölümü
        { type: "rectangle", x: 60, y: 370, width: 674, height: 400, color: "#34495e", filled: false, strokeWidth: 2, borderRadius: 8, locked: true, persistent: true },
        { type: "text", x: 75, y: 380, text: "NOTLAR", fontSize: 14, fontWeight: "bold", color: "#7f8c8d", locked: true, persistent: true },

        // Kararlar ve Aksiyonlar
        { type: "rectangle", x: 60, y: 790, width: 674, height: 250, color: "#c0392b", filled: false, strokeWidth: 2, borderRadius: 8, locked: true, persistent: true },
        { type: "text", x: 75, y: 800, text: "AKSİYONLAR VE KARARLAR", fontSize: 14, fontWeight: "bold", color: "#c0392b", locked: true, persistent: true }
    ],
    generate: function () {
        // Notlar bölümüne çizgiler ekle
        for (let y = 420; y < 750; y += 30) {
            this.objects.push({
                type: "line",
                x1: 80, y1: y, x2: 714, y2: y,
                color: "#ecf0f1", strokeWidth: 1,
                locked: true, persistent: true
            });
        }
    }
};
