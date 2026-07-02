# SyncCinema 🎬

İki uzak kullanıcının kendi diskindeki aynı video dosyasını, tarayıcı üzerinden senkronize (eş zamanlı) şekilde izlemesini sağlayan uygulama. Video sunucudan akıtılmaz (streaming yok) — sadece play/pause/seek komutları ve chat mesajları WebSocket ile senkronize edilir.

## Klasör Yapısı

```
synccinema/
├── backend/     -> Node.js + Express + Socket.io sunucusu (port 3001)
└── frontend/    -> Vite + React arayüzü (port 5173)
```

## Kurulum ve Çalıştırma

### 1) Backend

```bash
cd backend
npm install
npm start
```

Terminalde `Sunucu 3001 portunda çalışıyor` yazısını görmelisin.

### 2) Frontend

Yeni bir terminal sekmesi aç:

```bash
cd frontend
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` adresi açılır.

## Nasıl Kullanılır

1. İki farklı tarayıcı sekmesinde (ya da iki farklı bilgisayarda) `http://localhost:5173` adresini aç.
2. Her iki tarafta da aynı **Oda Adı**'nı gir (örn. `cuma-gecesi`), farklı isim gir ve "Odaya Katıl" butonuna bas.
3. Her iki tarafta da bilgisayarınızdaki **aynı video dosyasını** seçin (dosya sunucuya yüklenmez, sadece yerel olarak `URL.createObjectURL` ile oynatılır).
4. Bir tarafta play/pause/sarma yaptığında, diğer tarafta ~100-200ms gecikmeyle aynı aksiyon simüle edilir.
5. Sağdaki panelden anlık mesajlaşabilirsiniz.

## Uzak Erişim (İki Farklı Şehir/Ağdan Bağlanmak İçin)

Backend'i `localhost:3001` yerine herkese açık bir adresten (örn. bir VPS, ngrok, Cloudflare Tunnel) yayınlaman gerekir. Bunu yaptıktan sonra:

- `frontend/src/App.jsx` içindeki `SOCKET_URL` sabitini kendi sunucu adresinle güncelle.
- Backend'de CORS zaten `origin: "*"` ile açık, ekstra bir işlem gerekmiyor (geliştirme ortamı için).

## Sonsuz Döngü Koruması Nasıl Çalışıyor?

`isIncomingSignal` adlı bir `useRef` bayrağı kullanılıyor:

- Sunucudan bir video aksiyonu geldiğinde bu bayrak `true` yapılır, video güncellenir, sonra 100ms sonra tekrar `false` yapılır.
- Kullanıcının kendi tetiklediği `onPlay`/`onPause`/`onSeeked` eventlerinde, eğer bu bayrak `true` ise sunucuya emit yapılmaz. Böylece A → B → A şeklinde sonsuz bir sinyal döngüsü oluşmaz.

## Üretim İçin Notlar

- Bu proje geliştirme/kişisel kullanım amaçlıdır. `cors: { origin: "*" }` ayarı gerçek bir üretim ortamında güvenlik açısından daraltılmalıdır.
- Oda içindeki video dosyasının her iki tarafta da **bit bit aynı** olması gerekir (aynı encode, aynı süre), aksi halde zamanlama tam örtüşmeyebilir.
