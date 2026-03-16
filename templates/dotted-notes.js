const DOTTED_NOTES_TEMPLATE = {
    id: "dotted-notes",
    name: "Noktalı Notlar (Dotted Notes)",
    category: "Temel Şablonlar",
    description: "Not almak için başlık alanı ve noktalı ızgara içeren şablon.",
    thumbnail: "assets/templates/dotted-notes.png",
    objects: [],
    generate: function () {
        this.objects = [];
        const width = 794;
        const height = 1123;

        // Sayfa Kenarlığı
        this.objects.push({
            type: "rectangle",
            x: 0, y: 0, width: width, height: height,
            color: "#f0f0f0", filled: false, strokeWidth: 1,
            locked: true, persistent: true
        });

        // Başlık Alanı
        this.objects.push({
            type: "text",
            x: 50, y: 40, width: width - 100, height: 60,
            text: "NOTLAR",
            htmlContent: "<div>NOTLAR</div>",
            fontSize: 24, fontWeight: "bold", color: "#34495e", alignment: "left",
            locked: true, persistent: true
        });

        this.objects.push({
            type: "line",
            x1: 50, y1: 100, x2: width - 50, y2: 100,
            color: "#3498db", strokeWidth: 2,
            locked: true, persistent: true
        });

        // Noktalı Izgara
        const step = 25;
        for (let y = 140; y < height - 50; y += step) {
            for (let x = 50; x < width - 50; x += step) {
                this.objects.push({
                    type: "ellipse",
                    x: x - 1, y: y - 1, width: 2, height: 2,
                    color: "#cccccc", fillColor: "#cccccc", filled: true,
                    locked: true, persistent: true
                });
            }
        }
    }
};
