const GRID_TEMPLATE = {
    id: "grid-template",
    name: "Kareli (Grid/Graph)",
    category: "Temel Şablonlar",
    description: "Matematik ve grafik çalışmaları için kareli şablon.",
    thumbnail: "assets/templates/grid.png",
    objects: [],
    generate: function () {
        this.objects = [];
        const width = 794;
        const height = 1123;
        const step = 25;

        // Dikey çizgiler
        for (let x = 0; x <= width; x += step) {
            this.objects.push({
                type: "line",
                x1: x, y1: 0, x2: x, y2: height,
                color: "#f0f0f0", strokeWidth: 1,
                locked: true, persistent: true
            });
        }

        // Yatay çizgiler
        for (let y = 0; y <= height; y += step) {
            this.objects.push({
                type: "line",
                x1: 0, y1: y, x2: width, y2: y,
                color: "#f0f0f0", strokeWidth: 1,
                locked: true, persistent: true
            });
        }
    }
};
