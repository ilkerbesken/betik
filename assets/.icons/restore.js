const fs = require('fs');
const path = require('path');

// 1. Ayarlar
const INPUT_FILE = './Icons.js'; // Icons.js dosyanın tam adı ve yolu
const OUTPUT_DIR = './restored_icons';

if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Hata: ${INPUT_FILE} dosyası bulunamadı!`);
    process.exit(1);
}

// 2. Dosyayı metin olarak oku ve içindeki objeyi ayıkla
const fileContent = fs.readFileSync(INPUT_FILE, 'utf8');

// Regex ile "Icons = { ... }" arasını bulmaya çalışalım
// Bu kısım Icons.js dosyanın yapısına göre basit bir yaklaşımdır
try {
    const jsonPart = fileContent
        .split('const Icons =')[1]
        .split('};')[0] + '}';
    
    // String'i JS objesine dönüştürmek için güvenli olmayan ama hızlı bir yöntem (eval benzeri)
    // Eğer dosyan çok karmaşıksa burayı düzeltebiliriz
    const Icons = eval('(' + jsonPart + ')');

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR);
    }

    Object.keys(Icons).forEach(name => {
        let svg = Icons[name];
        // Renkleri geri çevir (opsiyonel)
        svg = svg.replace(/currentColor/g, "#000000");
        
        fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.svg`), svg);
    });

    console.log(`✅ Başarılı! ${Object.keys(Icons).length} ikon geri yüklendi.`);

} catch (err) {
    console.error("❌ Dosya içeriği ayrıştırılamadı. Icons.js dosyanın formatı farklı olabilir.");
    console.error(err);
}
