const CALENDAR_TEMPLATE = {
    id: "calendar-template",
    name: "Takvim Görünümü",
    category: "İş Planlama",
    description: "Aylık planlama için takvim ızgarası.",
    thumbnail: "assets/templates/calendar.png",
    objects: [
        { type: "text", x: 300, y: 60, text: "AY / YIL: ....................", fontSize: 24, fontWeight: "bold", color: "#333333", locked: true, persistent: true }
    ],
    generate: function () {
        const startX = 50;
        const startY = 120;
        const cellWidth = 100;
        const cellHeight = 120;
        const days = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

        // Gün başlıkları
        for (let i = 0; i < 7; i++) {
            this.objects.push({
                type: "rectangle",
                x: startX + i * cellWidth, y: startY, width: cellWidth, height: 40,
                color: "#f8f9fa", filled: true, fillColor: "#f8f9fa", strokeWidth: 1,
                locked: true, persistent: true
            });
            this.objects.push({
                type: "text",
                x: startX + i * cellWidth + 25, y: startY + 10, text: days[i],
                fontSize: 14, fontWeight: "bold", color: "#666666",
                locked: true, persistent: true
            });
        }

        // Takvim ızgarası (6 satır)
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                this.objects.push({
                    type: "rectangle",
                    x: startX + col * cellWidth, y: startY + 40 + row * cellHeight,
                    width: cellWidth, height: cellHeight,
                    color: "#e0e0e0", filled: false, strokeWidth: 1,
                    locked: true, persistent: true
                });
                // Küçük tarih kutucuğu
                this.objects.push({
                    type: "rectangle",
                    x: startX + col * cellWidth + 5, y: startY + 40 + row * cellHeight + 5,
                    width: 25, height: 20,
                    color: "#f0f0f0", filled: false, strokeWidth: 0.5,
                    locked: true, persistent: true
                });
            }
        }
    }
};
