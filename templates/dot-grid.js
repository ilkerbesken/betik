const DOT_GRID_TEMPLATE = {
    id: "dot-grid-template",
    name: "Noktalı (Dot Grid)",
    category: "Temel Şablonlar",
    description: "Noktalı defter düzeninde şablon.",
    thumbnail: "assets/templates/dot-grid.png",
    objects: [],
    generate: function () {
        this.objects = [];
        const width = 794;
        const height = 1123;
        const step = 25;

        for (let y = step; y < height; y += step) {
            for (let x = step; x < width; x += step) {
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
