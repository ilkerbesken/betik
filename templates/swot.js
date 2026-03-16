const SWOT_TEMPLATE = {
    id: "swot-analysis",
    name: "SWOT Analizi",
    category: "İş Planlama",
    description: "Güçlü/Zayıf yönler ve Fırsat/Tehdit analizi",
    thumbnail: "assets/templates/swot.png",
    objects: [],

    generate: function () {
        const config = {
            startX: 100,
            startY: 120,
            size: 300,
            gap: 15,
            titleOffset: 25
        };

        const quadrants = [
            { label: "GÜÇLÜ YÖNLER (Strengths)", color: "#2ecc71", row: 0, col: 0 },
            { label: "ZAYIF YÖNLER (Weaknesses)", color: "#e74c3c", row: 0, col: 1 },
            { label: "FIRSATLAR (Opportunities)", color: "#3498db", row: 1, col: 0 },
            { label: "TEHDİTLER (Threats)", color: "#f39c12", row: 1, col: 1 }
        ];

        this.objects = [];

        // 1. Ana Başlığı Ekle
        this.objects.push({
            type: "text",
            x: config.startX,
            y: 50,
            width: config.size * 2 + config.gap,
            height: 50,
            text: "SWOT ANALİZİ",
            htmlContent: "<div>SWOT ANALİZİ</div>",
            fontSize: 32, fontWeight: "bold", color: "#2c3e50", alignment: "center",
            locked: true, persistent: true
        });

        // 2. Çeyrekleri Döngü ile Oluştur
        quadrants.forEach(q => {
            const posX = config.startX + (q.col * (config.size + config.gap));
            const posY = config.startY + (q.row * (config.size + config.gap));

            // Arka plan kutusu
            this.objects.push({
                type: "rectangle",
                x: posX, y: posY, width: config.size, height: config.size,
                color: q.color, fillColor: q.color, filled: true,
                opacity: 0.1, strokeWidth: 2, lineStyle: "solid",
                locked: true, persistent: true
            });

            // Üst kenar çizgisi (daha belirgin olması için)
            this.objects.push({
                type: "rectangle",
                x: posX, y: posY, width: config.size, height: 40,
                color: q.color, fillColor: q.color, filled: true,
                opacity: 0.8, strokeWidth: 0,
                locked: true, persistent: true
            });

            // Bölüm başlığı
            this.objects.push({
                type: "text",
                x: posX,
                y: posY,
                width: config.size,
                height: 40,
                text: q.label,
                htmlContent: `<div>${q.label}</div>`,
                fontSize: 14, fontWeight: "bold", color: "#ffffff", alignment: "center",
                locked: true, persistent: true
            });
        });
    }
};