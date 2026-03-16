const ISOMETRIC_GRID_TEMPLATE = {
    id: "isometric-grid-template",
    name: "İzometrik Grid",
    category: "Tasarım",
    description: "3B çizimler için izometrik ızgara şablonu.",
    thumbnail: "assets/templates/isometric-grid.png",
    objects: [],
    generate: function () {
        const width = 794;
        const height = 1123;
        const step = 30;
        const angle = Math.PI / 6; // 30 degrees

        // Dikey çizgiler (opsiyonel ama izometrikte genellikle dikey hatlar da olur)
        for (let x = 0; x <= width; x += step) {
            this.objects.push({
                type: "line",
                x1: x, y1: 0, x2: x, y2: height,
                color: "#e0e0e0", strokeWidth: 0.5,
                locked: true, persistent: true
            });
        }

        // Pozitif eğimli çizgiler (30 derece)
        for (let y = -width; y <= height; y += step * Math.sin(angle) * 2) {
            this.objects.push({
                type: "line",
                x1: 0, y1: y, x2: width, y2: y + width * Math.tan(angle),
                color: "#e0e0e0", strokeWidth: 0.5,
                locked: true, persistent: true
            });
        }

        // Negatif eğimli çizgiler (-30 derece)
        for (let y = 0; y <= height + width; y += step * Math.sin(angle) * 2) {
            this.objects.push({
                type: "line",
                x1: 0, y1: y, x2: width, y2: y - width * Math.tan(angle),
                color: "#e0e0e0", strokeWidth: 0.5,
                locked: true, persistent: true
            });
        }
    }
};
