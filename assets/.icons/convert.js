const fs = require('fs');
const path = require('path');

const ICONS_DIR = './icons'; // SVG dosyalarının olduğu klasör adı
const OUTPUT_FILE = './Icons.js'; // Oluşacak dosya

const files = fs.readdirSync(ICONS_DIR).filter(f => f.endsWith('.svg'));

let content = `/* Untitled UI Icons - Auto Generated */\n\nconst Icons = {\n`;

files.forEach(file => {
    const name = path.parse(file).name;
    let svg = fs.readFileSync(path.join(ICONS_DIR, file), 'utf8');

    // Temizlik ve Optimizasyon
    svg = svg
        .replace(/\r?\n|\r/g, "") // Satırları birleştir
        .replace(/"/g, "'")       // Çift tırnağı tek tırnak yap
        // RENK SİHİRİ: Sabit renkleri 'currentColor' yaparak CSS ile boyanabilir hale getiriyoruz
        .replace(/stroke='#[a-fA-F0-9]{3,6}'/g, "stroke='currentColor'")
        .replace(/fill='#[a-fA-F0-9]{3,6}'/g, "fill='currentColor'");

    content += `  '${name}': "${svg}",\n`;
});

content += `};\n\nexport default Icons;`;

fs.writeFileSync(OUTPUT_FILE, content);
console.log(`✅ Başarılı! ${files.length} ikon Icons.js dosyasına dönüştürüldü.`);
