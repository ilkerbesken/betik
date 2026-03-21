# 🎨 Betik - Professional Digital Whiteboard & Note-Taking Application

Betik, modern web teknolojileri (HTML5, CSS3, ES6+) kullanılarak geliştirilmiş, düşük gecikmeli (low-latency) ve yüksek performanslı bir dijital beyaz tahta uygulamasıdır. Hem yaratıcı çizim süreçleri hem de profesyonel not alma ihtiyaçları için tablet kalitesinde bir deneyim sunar.

---

## 🚀 Öne Çıkan Özellikler

### ✒️ Gelişmiş Çizim Motoru
- **Basınç Hassasiyeti:** Stylus/Kalem girişlerinde gerçek zamanlı basınç algılama ve doğal çizgi kalınlığı değişimi.
- **Taper (İncelme) Efekti:** Çizgilerin sonunda organik bir bitiş sağlayan otomatik incelme algoritması.
- **Yumuşatma (Smoothing):** Weighted Moving Average ve Chaikin algoritması ile titremesiz, pürüzsüz çizgiler.
- **Vurgulayıcı (Highlighter):** Saydamlık ve farklı uç tipleri (yuvarlak/küt) desteği.

### 📐 Akıllı Şemalar ve Nesneler
- **Bağlantı Okları:** Düz, eğri veya dirsek tipinde; uçları dinamik olarak özelleştirilebilen akıllı oklar.
- **Dinamik Tablolar:** Satır/sütun eklenebilen, hücreleri zengin metin içeren akıllı tablolar.
- **Vektörel Şekiller:** Dikdörtgen, elips, yıldız, bulut gibi 15+ geometrik şekil ve zengin metin kutuları.
- **Dekoratif Araçlar:** Desenli bantlar (Tape), çıkartmalar (Sticker) ve resim yerleştirme.

### 📂 Doküman ve Bulut Yönetimi
- **PDF Entegrasyonu:** PDF dosyalarını içe aktarma, üzerinde not alma ve sayfalar arası navigasyon.
- **Çok Sayfalı Yapı:** Her not içinde sınırsız sayfa desteği ve kolay sayfa yönetimi.
- **Otomatik Kaydetme (Autosave):** Olay bazlı (Event-based) hibrit kayıt mekanizması ve akıllı veri flulshing sistemi.
- **Google Drive Senkronizasyonu:** Cihazlar arası çift yönlü, gerçek zamanlı bulut senkronizasyonu.
- **.tik Formatı:** Gzip ile sıkıştırılmış, optimize edilmiş özel dosya formatı.

---

## 🏗️ Teknik Mimari

Proje, sürdürülebilirlik ve performans için modüler bir mimari üzerine kurulmuştur:

1. **Çekirdek Durum Yönetimi (`app.js`):** Uygulamanın araç durumunu, nesne listesini ve yaşam döngüsünü (lifecycle) koordine eder.
2. **Araç Katmanı (`js/Tools/`):** Her araç (Pen, Shape, Arrow, Table vb.) bağımsız bir sınıf olarak tasarlanmıştır. Bu modülerlik, yeni özelliklerin çekirdek kodu bozmadan eklenmesini sağlar.
3. **Senkronizasyon & Depolama:**
   - **FileSystemManager:** Browser File System Access API kullanarak yerel klasörlerle doğrudan etkileşim.
   - **CloudStorageManager:** Google Drive API OAuth2 entegrasyonu ile bulut depolama.
   - **IndexedDB:** Büyük verilerin (PDF'ler, resimler) tarayıcıda performanslı saklanması.
4. **Rendering Optimizasyonları:**
   - **Offscreen Canvas:** Zoom ve Pan sırasında arkaplanı önceden render ederek 60+ FPS performans sağlar.
   - **Temporary Canvas:** Overlapping circles yönteminde opacity birikimini önlemek için ara katman kullanımı.
   - **Debounced Drawing:** Karmaşık nesneler için işlemci yükünü azaltan akıllı render kuyruğu.

---

## 🛠️ Teknoloji Yığını

- **Dil:** JavaScript (ES6+), Vanilla HTML5/CSS3.
- **Kütüphaneler:**
  - [PDF.js](https://mozilla.github.io/pdf.js/) - PDF işleme ve render.
  - [Pako](https://github.com/nodeca/pako) - Gzip sıkıştırma (.tik formatı için).
  - [jsPDF](https://github.com/parallax/jsPDF) - PDF export.
  - [The ultimate Figma UI kit and design system](www.untitledui.com) - Modern ikon seti.
- **Platform:** PWA (Progressive Web App) desteği ile masaüstü uygulaması gibi kurulum ve çevrimdışı kullanım.

---


## 🚀 Başlarken

Betik, herhangi bir derleme (build) adımı gerektirmez. Vanilla JS yapısı sayesinde doğrudan çalıştırılabilir:

1. Proje dizininde bir yerel sunucu başlatın:
   ```bash
   # Python ile
   python3 -m http.server 8080
   # Veya Node.js ile
   npx serve .
   ```
2. Tarayıcınızda `http://localhost:8080` adresine gidin.
3. (Opsiyonel) Google Drive senkronizasyonu için bir Google Cloud Console projesi üzerinden OAuth ID'nizi `CloudStorageManager.js` dosyasına ekleyin.

---

## 🔮 Roadmap

- [x] **WebGL Rendering:** Binlerce nesnenin bulunduğu devasa tuvaller için GPU hızlandırma.
- [ ] **AI Assist:** El yazısını metne (OCR) ve eskizleri mükemmel şekillere çevirme.
- [ ] **Canlı İşbirliği:** WebRTC üzerinden çok oyunculu (multiplayer) düzenleme.
- [ ] **Gelişmiş Fırçalar:** Sulu boya ve fırça doku motoru.
- [ ] **Align araclari:** secili ögeleri hizalayabilecek araclar.
---

## 📄 Lisans
Bu proje kişisel ve profesyonel kullanım için geliştirilmiştir. Lütfen ticari kullanımlar için iletişime geçin.

---
*Betik - Fikirleriniz Kağıttan Daha Fazlasını Hak Ediyor.*
