# SyncCinema - Tespit Edilen Sorunlar

## Kritik Sorunlar

### 1. ~~Odayı terk edince socket kapanıyor~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Düzeltme:** `leave_room` event'i gönderiliyor, socket açık kalıyor.

### 2. ~~`file_info_received` handler'ı çalışmıyor~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Düzeltme:** `videoFileMetaRef.current` kullanılıyor (stale closure düzeltildi).

### 3. ~~Şifre client-side'da açık~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Düzeltme:** `SITE_PASSWORD` backend'e taşındı. `/api/auth` endpoint'i eklendi. `VITE_AUTH_PASS` kaldırıldı.

---

## Düzeltilen Regression'lar (2026-08-06)

### R1. ~~TURN credentials endpoint ReferenceError~~ ✅ FIXED
- **Dosya:** `backend/createServer.js:431`
- **Sorun:** `app.get("/api/turn-credentials", ...)` fonksiyon dışındaydı, `app` tanımsız hatası.
- **Düzeltme:** Route `createServer()` içine taşındı.

### R2. ~~CORS hardcoded production origin~~ ✅ FIXED
- **Dosya:** `backend/createServer.js:12`
- **Sorun:** `ALLOWED_ORIGINS` sadece `["https://cinema.algoforge.com.tr"]` idi.
- **Düzeltme:** `ALLOWED_ORIGINS` environment variable'dan okunuyor, virgülle ayrılmış.

### R3. ~~App.jsx syntax error (malformed try/catch)~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Sorun:** İç içe `loadSession()` fonksiyonunda hatalı try/catch blok sınırları.
- **Düzeltme:** Duplicate inner `loadSession`/`saveSession` kaldırıldı, üst seviye helper'lar korundu.

### R4. ~~`turnIceServers` state tanımı eksik~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Sorun:** `turnIceServers` ve `setTurnIceServers` kullanılıyordu ama hiç tanımlanmamıştı.
- **Düzeltme:** `const [turnIceServers, setTurnIceServers] = useState([]);` eklendi.

### R5. ~~`const generation` duplicate declaration~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Sorun:** `initWebRTC()` içinde `const generation` iki kez tanımlanmıştı.
- **Düzeltme:** Duplicate blok kaldırıldı.

### R6. ~~TURN credentials stale state~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Sorun:** `fetchTurnCredentials()` state'i set ediyordu ama `iceServers` bir önceki render'ın değerini kullanıyordu.
- **Düzeltme:** `fetchTurnCredentials()` array'i direkt return ediyor, `initWebRTC` içinde kullanılıyor.

### R7. ~~Nginx /api/ proxy eksik~~ ✅ FIXED
- **Dosya:** `frontend/nginx.conf`
- **Sorun:** `/api/` location bloğu yoktu, TURN endpoint'i 404 veriyordu.
- **Düzeltme:** `location /api/ { proxy_pass http://backend:3001; }` eklendi.

### R8. ~~Cloudflare TURN API zoneId kullanımı~~ ✅ FIXED
- **Dosya:** `backend/createServer.js`
- **Sorun:** `CLOUDFLARE_ZONE_ID` alınıyor ama hiç kullanılmıyordu.
- **Düzeltme:** `CLOUDFLARE_ZONE_ID` kaldırıldı, `CLOUDFLARE_TURN_KEY_ID` eklendi.

### R9. ~~Rate-limit memory leak~~ ✅ FIXED
- **Dosya:** `backend/createServer.js`
- **Sorun:** Socket disconnect olduğunda rate-limit state temizlenmiyordu.
- **Düzeltme:** Disconnect handler'ında socket'e ait tüm rate-limit entry'leri siliniyor.

### R10. ~~YouTube API script injection crash in jsdom~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Sorun:** `getElementsByTagName("script")[0]` jsdom'da undefined dönüyordu.
- **Düzeltme:** Null check eklendi, fallback olarak `document.head.appendChild`.

### R11. ~~docker-compose.yml ALLOWED_ORIGIN singular~~ ✅ FIXED
- **Dosya:** `docker-compose.yml`
- **Sorun:** `ALLOWED_ORIGIN` (tekil) kullanılıyordu, backend `ALLOWED_ORIGINS` (çoğul) okuyordu.
- **Düzeltme:** `ALLOWED_ORIGINS` olarak düzeltildi.

### R12. ~~VITE_AUTH_PASS client-side'da~~ ✅ FIXED
- **Dosya:** `docker-compose.yml`, `frontend/Dockerfile`
- **Sorun:** Auth şifresi frontend build argümanı olarak geçiliyordu.
- **Düzeltme:** `VITE_AUTH_PASS` kaldırıldı, `SITE_PASSWORD` backend'e taşındı.

---

## Orta Düzey Sorunlar

### 4. Socket handler'larında stale closure
- **Dosya:** `frontend/src/App.jsx:268-449`
- **Durum:** Büyük ölçüde düzeltildi (ref-based value tracking mevcut).

### 5. ~~`playback_sync` admin kontrolü yok~~ ✅ FIXED
- **Dosya:** `backend/createServer.js`
- **Düzeltme:** `playback_sync` handler'ında admin kontrolü mevcut.

### 6. Admin kullanıcının adıyla belirleniyor
- **Dosya:** `backend/createServer.js:116-128`
- **Durum:** Artık `socket.id` kullanılıyor, userName karşılaştırması kaldırıldı.

### 7. ~~`initWebRTC` eş zamanlı çalışabilir~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Düzeltme:** Generation guard ve debounce (500ms) mevcut.

### 8. ~~Blob URL'leri hiç serbest bırakılmıyor~~ ✅ FIXED
- **Dosya:** `frontend/src/App.jsx`
- **Düzeltme:** `revokeBlobUrl()`, `trackBlobUrl()`, cleanup fonksiyonları mevcut.

### 9. `extractEmbeddedSubtitles` tüm dosyayı belleğe yüklüyor
- **Dosya:** `frontend/src/subtitleExtractor.js:68`
- **Durum:** OPEN — büyük dosyalarda OOM riski. Gelecekte MP4Box streaming API Consider edilmeli.

### 10. ~~Socket event'lerinde rate limiting yok~~ ✅ FIXED
- **Dosya:** `backend/createServer.js`
- **Düzeltme:** Rate limiting mevcut (15 event/saniye).

### 11. ~~Oda olaylarında oda doğrulama yok~~ ✅ FIXED
- **Dosya:** `backend/createServer.js`
- **Düzeltme:** Tüm handler'larda `socket.data.room !== data.room` kontrolü mevcut.

### 12. ~~Oda oluşturma/katılma sunucu onayı beklemiyor~~ ✅ FIXED
- **Durum:** `room_status` event'inden sonra `joined=true` yapılıyor.

---

## Düşük Öncelikli Sorunlar

### 13. ~~`spawnEmoji` timeout unmount'ta temizlenmiyor~~ ✅ FIXED
- **Düzeltme:** `emojiTimeoutRefs` ile takip ediliyor, cleanup'ta temizleniyor.

### 14. ~~`handleLeaveRoom` blob URL'leri revoke etmiyor~~ ✅ FIXED
- **Düzeltme:** `revokeBlobUrl()` çağrılıyor.

### 15. Birden fazla `<track>`'te `default` attribute'u var
- **Durum:** DÜŞÜK — belirsiz ama işlevsel.

### 16. Tema flash'ı (initial load)
- **Durum:** DÜŞÜK — `index.html` içinde inline script ile büyük ölçüde düzeltildi.

### 17. ~~Admin olmayan video play'de kısa titreme~~ ✅ FIXED
- **Düzeltme:** `video.pause()` senkron olarak çağrılıyor.

### 18. ~~Chat mesajlarında array index key kullanılıyor~~ ✅ FIXED
- **Düzeltme:** `${Date.now()}-${Math.random()}` unique ID kullanılıyor.

### 19. ~~`playback_sync` her zaman `isPaused: false` yazıyor~~ ✅ FIXED
- **Düzeltme:** Mevcut `isPaused` değeri korunuyor.

### 20. ~~`typing` event'i her tuş vuruşunda gönderiliyor~~ ✅ FIXED
- **Düzeltme:** 1500ms debounce mevcut.

---

## CSS Sorunları

### 21. `--sub-top` değişkeni `bottom` olarak kullanılıyor
- **Durum:** DÜŞÜK — yanıltıcı isimlendirme ama işlevsel.

### 22. `:focus-visible` stili yok
- **Durum:** DÜŞÜK — erişilebilirlik iyileştirmesi.

### 23. Mobil header taşması
- **Durum:** DÜŞÜK — responsive iyileştirmesi.

---

## Özet

| Öncelik | Sayı | Durum |
|---------|------|-------|
| Kritik | 3 | ✅ 3/3 düzeltildi |
| Regression | 12 | ✅ 12/12 düzeltildi |
| Orta | 9 | ✅ 8/9 düzeltildi |
| Düşük | 8 | ✅ 5/8 düzeltildi |
