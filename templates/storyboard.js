const STORYBOARD_TEMPLATE = {
    id: "storyboard-template",
    name: "Storyboard",
    category: "Tasarım",
    description: "Video ve animasyon planlama için storyboard şablonu.",
    thumbnail: "assets/templates/storyboard.png",
    objects: [
        { type: "text", x: 60, y: 50, text: "PROJE: ........................................", fontSize: 20, fontWeight: "bold", color: "#333333", locked: true, persistent: true }
    ],
    generate: function () {
        const startX = 60;
        const startY = 100;
        const frameW = 320;
        const frameH = 180;
        const gap = 30;

        for (let i = 0; i < 6; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = startX + col * (frameW + gap);
            const y = startY + row * (frameH + 110 + gap);

            // Çizim alanı
            this.objects.push({
                type: "rectangle",
                x: x, y: y, width: frameW, height: frameH,
                color: "#333333", filled: false, strokeWidth: 2,
                locked: true, persistent: true
            });

            // Metin alanı (açıklama)
            this.objects.push({
                type: "rectangle",
                x: x, y: y + frameH + 10, width: frameW, height: 80,
                color: "#eeeeee", filled: false, strokeWidth: 1,
                locked: true, persistent: true
            });

            // Frame No
            this.objects.push({
                type: "text",
                x: x, y: y - 25, text: `Kare ${i + 1}`,
                fontSize: 14, fontWeight: "bold", color: "#666666",
                locked: true, persistent: true
            });

            // Satırlar (açıklama için)
            for (let j = 1; j <= 3; j++) {
                this.objects.push({
                    type: "line",
                    x1: x + 10, y1: y + frameH + 10 + j * 20,
                    x2: x + frameW - 10, y2: y + frameH + 10 + j * 20,
                    color: "#dddddd", strokeWidth: 1,
                    locked: true, persistent: true
                });
            }
        }
    }
};
