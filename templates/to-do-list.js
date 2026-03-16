const TODO_LIST_TEMPLATE = {
    id: "todo-list-template",
    name: "Yapılacaklar Listesi (To-Do List)",
    category: "İş Planlama",
    description: "Günlük işleri takip etmek için yapılacaklar listesi.",
    thumbnail: "assets/templates/to-do-list.png",
    objects: [
        { type: "text", x: 60, y: 60, text: "YAPILACAKLAR LİSTESİ", fontSize: 32, fontWeight: "bold", color: "#333333", locked: true, persistent: true },
        { type: "line", x1: 60, y1: 110, x2: 734, y2: 110, color: "#333333", strokeWidth: 3, locked: true, persistent: true }
    ],
    generate: function () {
        let startY = 160;
        const rowHeight = 45;
        for (let i = 0; i < 18; i++) {
            let y = startY + i * rowHeight;
            // Checkbox
            this.objects.push({
                type: "rectangle",
                x: 60, y: y, width: 25, height: 25,
                color: "#666666", filled: false, strokeWidth: 2, borderRadius: 4,
                locked: true, persistent: true
            });
            // Line
            this.objects.push({
                type: "line",
                x1: 100, y1: y + 25, x2: 734, y2: y + 25,
                color: "#eeeeee", strokeWidth: 1,
                locked: true, persistent: true
            });
        }
    }
};
