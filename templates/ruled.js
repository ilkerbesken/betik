const RULED_TEMPLATE = {
    id: "ruled-template",
    name: "Çizgili (Ruled/Lined)",
    category: "Temel Şablonlar",
    description: "Yazı yazmak için yatay çizgili şablon.",
    thumbnail: "assets/templates/ruled.png",
    objects: [],
    generate: function () {
        this.objects = [];
        // Kenarlık
        this.objects.push({
            type: "rectangle",
            x: 0, y: 0, width: 794, height: 1123,
            color: "#eeeeee", filled: false, strokeWidth: 1,
            locked: true, persistent: true
        });

        // Başlık alanı çizgisi
        this.objects.push({
            type: "line",
            x1: 50, y1: 100, x2: 744, y2: 100,
            color: "#4a90e2", strokeWidth: 2,
            locked: true, persistent: true
        });

        // Yatay çizgiler
        for (let y = 140; y <= 1050; y += 30) {
            this.objects.push({
                type: "line",
                x1: 50, y1: y, x2: 744, y2: y,
                color: "#e0e0e0", strokeWidth: 1,
                locked: true, persistent: true
            });
        }

        // Sol kenar dikey çizgisi (Kırmızı marjin)
        this.objects.push({
            type: "line",
            x1: 100, y1: 50, x2: 100, y2: 1073,
            color: "#ffcccc", strokeWidth: 1.5,
            locked: true, persistent: true
        });
    }
};
