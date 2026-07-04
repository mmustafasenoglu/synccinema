# SyncCinema - Proje Rehberi

## Genel Bakış
Senkron video izleme platformu. İki kullanıcı aynı videoyu aynı anda izler, video sunucuda depolanmaz sadece senkronizasyon sinyalleri paylaşılır.

## Roller
- **Admin**: İlk odaya giren kişi. Videoyu oynatır/duraklatır/seek yapar.
- **Normal Kullanıcı (Misafir)**: Video kontrolleri görünür ama play/pause/seek sunucuya gönderilmez.

## Tech Stack
- **Frontend**: React, Vite, Socket.io-client, simple-peer (WebRTC), mp4box
- **Backend**: Node.js, Express, Socket.io
- **Deploy**: Docker Compose, Nginx proxy
- **Port**: 8050 (frontend), 3001 (backend, docker içi)

## Dosya Yapısı
```
frontend/src/App.jsx    - Ana uygulama (1000+ satır, her şey burada)
frontend/src/index.css   - Tüm stiller (mobil responsive dahil)
backend/createServer.js  - Socket.io sunucu mantığı
backend/server.js        - Sunucu başlatma
docker-compose.yml       - Container tanımları
frontend/nginx.conf      - Nginx proxy ayarları
```

## Çalışma Mantığı

### Oda Sistemi
- 5 haneli rastgele kod ile oda oluşturulur
- Maksimum 2 kişi aynı odada
- İlk giren admin, ikinci giren misafir
- Oda 30 dakika boş kalırsa silinir

### Video Senkronizasyonu
- Video dosyası sunucuya yüklenmez, herkes kendi diskindeki dosyayı seçer
- `video_action` event'i ile play/pause/seek sinyalleri gönderilir
- `playback_sync` ile 5 saniyede bir durum paylaşılır
- `sync_response` ile yeni katılan kişi senkronize edilir

### Altyazı
- Dış altyazı dosyası (SRT/VTT) veya gömülü altyazı desteklenir
- Altyazı seçim butonu (CC) video player'da yerleşik olarak gelir
- `controls`属性'i her zaman açıktır
- Misafir kullanıcı play但onuna basarsa video otomatik duraklatılır

### Sesli Sohbet (WebRTC)
- simple-peer kütüphanesi ile P2P ses bağlantısı
- Otomatik olarak başlatılır (ilk bağlanan initiator, ikincisi receiver)
- Mikrofon izni gerekir

### Chat
- Socket.io üzerinden mesajlaşma
- Yazıyor göstergesi var
- **Mobil Responsive**: 768px altında WhatsApp tarzı overlay chat
  - Sağ altta turuncu buton (💬) ile açılır
  - Okunmamış mesaj badge'i görünür
  - Tam ekran overlay olarak açılır
  - Kapat butonu ile kapanır

## Önemli Kod Blokları

### Admin Kontrolü (backend/createServer.js)
```javascript
// İlk giren admin olur
if (!roomAdmins[roomName]) {
  socket.data.isAdmin = true;
  roomAdmins[roomName] = userName;
}
```

### Misafir Video Kontrolü (frontend/src/App.jsx)
```javascript
const handlePlay = () => {
  if (!isAdmin) {
    const video = videoRef.current;
    if (video && !isIncomingSignal.current) {
      setTimeout(() => { video.pause(); }, 50);
    }
    return;
  }
  emitVideoAction("play");
};
```

### Mobil Chat State (frontend/src/App.jsx)
```javascript
const [mobileChatOpen, setMobileChatOpen] = useState(false);
const [unreadCount, setUnreadCount] = useState(0);
```

## Bilinen Sorunlar
- Safari'de gömülü altyazılar her zaman CC butonunu tetiklemeyebilir
- CSS pseudo-element'leri (video kontrollerini gizleme) her tarayıcıda çalışmaz
- Mobilde chat overlay'i backdrop-filter desteklemeyebilir

## Deployment
```bash
docker compose up -d --build
```

## Docker Yapısı
- **Frontend**: Vite build → Nginx (port 8050 → 80)
- **Backend**: Node.js (port 3001, docker içi)
- **Network**: Frontend, backend'e `/socket.io/` proxy'si yapar
- **Environment**: `VITE_SOCKET_URL=/` (docker içi)
