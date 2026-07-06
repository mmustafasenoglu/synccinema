# SyncCinema - Tespit Edilen Sorunlar

## Kritik Sorunlar

### 1. Odayı terk edince socket kapanıyor
- **Dosya:** `frontend/src/App.jsx:934`
- **Sorun:** `handleLeaveRoom` socket'i disconnect ediyor. Socket.io v4+'ta manuel disconnect sonrası otomatik reconnect çalışmıyor. Kullanıcı tekrar odaya katılamıyor, sayfa yenilemesi gerekiyor.
- **Düzeltme:** Disconnect yerine `leave_room` event'i gönder, socket'i açık bırak.

### 2. `file_info_received` handler'ı çalışmıyor
- **Dosya:** `frontend/src/App.jsx:429-437`
- **Sorun:** Socket useEffect `[]` bağımlılığı ile çalışıyor. `videoFileMeta` ilk render'da `null`, dolayısıyla `if (!videoFileMeta) return` her zaman çıkıyor. Dosya eşleşme kontrolü hiç çalışmıyor.
- **Düzeltme:** `videoFileMeta` için ref kullan veya state updater callback ile yeniden yapılandır.

### 3. Şifre client-side'da açık
- **Dosya:** `frontend/src/App.jsx:982,987`
- **Sorun:** Auth şifresi `"12345"` plaintext olarak frontend bundle'ında. Kaynak kodu görüntüleyen herkes görebilir.
- **Düzeltme:** Auth'u backend'e taşı veya client-side auth'u tamamen kaldır.

---

## Orta Düzey Sorunlar

### 4. Socket handler'larında stale closure
- **Dosya:** `frontend/src/App.jsx:268-449`
- **Sorun:** Tüm socket handler'ları ilk render'daki state değerlerini yakalıyor. `myName`, `videoFileMeta`, `mobileChatOpen`_mount zamanında kalıyor. Yeniden bağlanma eski isimle yapılıyor, unread count her zaman artıyor.
- **Düzeltme:** Handler'ların okuması gereken değerler için ref kullan.

### 5. `playback_sync` admin kontrolü yok
- **Dosya:** `backend/createServer.js:176-183`
- **Sorun:** `video_action` admin kontrolü yaparken, `playback_sync` yapmıyor. Admin olmayan kullanıcı sahte sync verisi göndererek diğer peer'ın pozisyonunu bozabilir.
- **Düzeltme:** `video_action` ile aynı admin kontrolünü ekle.

### 6. Admin kullanıcının adıyla belirleniyor
- **Dosya:** `backend/createServer.js:116-128`
- **Sorun:** İki kullanıcı aynı ismi seçerse, ikinci kullanıcı yeniden bağlanmada admin olarak tanımlanıyor.
- **Düzeltme:** Unique user ID (UUID) kullan.

### 7. `initWebRTC` eş zamanlı çalışabilir
- **Dosya:** `frontend/src/App.jsx:565-606`
- **Sorun:** `initWebRTC` birden fazla yerden çağrılabilir (auto-voice, webrtc_signal_received, toggleMic). Önceki `getUserMedia` hala beklerken yenisi çalışırsa birden fazla stream oluşur, öncekiler sızar.
- **Düzeltme:** Guard ekle (örn. `const initRef = useRef(false)`).

### 8. Blob URL'leri hiç serbest bırakılmıyor
- **Dosya:** `frontend/src/App.jsx:832,848-849,870,876`
- **Sorun:** `URL.createObjectURL()` çağrılıyor ama hiçbir zaman `URL.revokeObjectURL()` ile serbest bırakılmıyor. Video/altyazı değişiminde blob URL sızıntısı oluşuyor.
- **Düzeltme:** Mevcut blob URL'leri ref ile takip et, yenisini oluşturmadan önce eskisini revoke et. Unmount'ta hepsini temizle.

### 9. `extractEmbeddedSubtitles` tüm dosyayı belleğe yüklüyor
- **Dosya:** `frontend/src/App.jsx:747`
- **Sorun:** `reader.readAsArrayBuffer(file)` çok büyük video dosyalarını (multi-GB) belleğe yükleyebilir, OOM hatası verebilir.
- **Düzeltme:** MP4Box streaming API kullan veya sadece moov atomunun bulunduğu kısmi oku.

### 10. Socket event'lerinde rate limiting yok
- **Dosya:** `backend/createServer.js` (tüm handler'lar)
- **Sorun:** Kötü niyetli istemci `send_message`, `video_action`, `playback_sync` gibi event'leri sınırsız gönderebilir.
- **Düzeltme:** Socket başına rate limiting ekle (örn. saniyede max 10 mesaj).

### 11. Oda olaylarında oda doğrulama yok
- **Dosya:** `backend/createServer.js:176,186,194,199,204,214,222`
- **Sorun:** `playback_sync`, `request_sync`, `file_info`, `typing`, `webrtc_signal`, `send_message` gibi event'ler, gönderenin gerçekten o odada olup olmadığını doğrulamıyor.
- **Düzeltme:** Her handler'da `socket.data.room === data.room` kontrolü yap.

### 12. Oda oluşturma/katılma sunucu onayı beklemiyor
- **Dosya:** `frontend/src/App.jsx:713-714,721-722`
- **Sorun:** `setJoined(true)` sunucu onayı beklemeden çalışıyor. Oda dolu/red edilirse kısa süreli oda UI'ı gösteriliyor.
- **Düzeltme:** `room_status` veya `room_full` event'inden önce `joined=true` yapma.

---

## Düşük Öncelikli Sorunlar

### 13. `spawnEmoji` timeout unmount'ta temizlenmiyor
- **Dosya:** `frontend/src/App.jsx:702`
- **Sorun:** `setTimeout` component unmount olmadan önce temizlenmiyor, unmount sonrası state güncellemesi yapıyor.
- **Düzeltme:** Timeout ID'lerini ref ile takip et, cleanup'ta temizle.

### 14. `handleLeaveRoom` blob URL'leri revoke etmiyor
- **Dosya:** `frontend/src/App.jsx:935`
- **Sorun:** `setVideoSrc(null)` ve `setSubtitleSrc(null)` referansları bırakıyor ama `URL.revokeObjectURL()` çağırmıyor.
- **Düzeltme:** State'i null yapmadan önce blob URL'leri revoke et.

### 15. Birden fazla `<track>`'te `default` attribute'u var
- **Dosya:** `frontend/src/App.jsx:1225-1229`
- **Sorun:** Hem dış altyazı hem gömülü altyazı track'lerinde `default` var. Bir tek default olmalı, aksi halde başlangıçta hangisi seçileceği belirsiz.
- **Düzeltme:** Sadece ilk/tercih edilen track'e `default` ver.

### 16. Tema flash'ı (initial load)
- **Dosya:** `frontend/src/App.jsx:156-159`
- **Sorun:** `dark` class'ı `useEffect` içinde uygulanıyor. İlk yüklemede sayfa karanlık tercihli olsa bile kısa süreli aydınlık mod görülüyor.
- **Düzeltme:** Tema class'ını HTML'de inline olarak veya React'ten önce blocking script ile uygula.

### 17. Admin olmayan video play'de kısa titreme
- **Dosya:** `frontend/src/App.jsx:894-897`
- **Sorun:** Admin olmayan play'e basınca 50ms gecikme ile `video.pause()` çağrılıyor. Video kısa süreli oynatılıp duruyor, titreme oluşuyor.
- **Düzeltme:** `video.pause()`'ı senkron olarak çağır veya play event'ini tamamen engelle.

### 18. Chat mesajlarında array index key kullanılıyor
- **Dosya:** `frontend/src/App.jsx:1371`
- **Sorun:** `key={i}` kullanılıyor. Mesajlar şu an sadece ekleniyor ama geleceği için güvenli değil.
- **Düzeltme:** Her mesaja unique ID ver (örn. `${Date.now()}-${Math.random()}`).

### 19. `playback_sync` her zaman `isPaused: false` yazıyor
- **Dosya:** `backend/createServer.js:178`
- **Sorun:** Geç gelen sync event'i `roomPlaybackState.isPaused`'ı `false`'a overwrite ediyor. Yeni peer yanlış pause durumu alabilir.
- **Düzeltme:** `playback_sync`'te sadece `currentTime`'ı güncelle, `isPaused`'ı değiştirme.

### 20. `typing` event'i her tuş vuruşunda gönderiliyor
- **Dosya:** `frontend/src/App.jsx:921`
- **Sorun:** Her `onChange` bir `typing` event'i gönderiyor. Hızlı yazarken socket flood oluyor.
- **Düzeltme:** `typing` event'ini de debounce et (örn. son emit'ten 300ms geçmişse gönder).

---

## CSS Sorunları

### 21. `--sub-top` değişkeni `bottom` olarak kullanılıyor
- **Dosya:** `frontend/src/index.css:774`
- **Sorun:** CSS değişkeni `--sub-top` ama `bottom` değerini kontrol ediyor. Yanıltıcı isimlendirme.
- **Düzeltme:** `--sub-bottom` olarak yeniden adlandır veya `top` kullan.

### 22. `:focus-visible` stili yok
- **Dosya:** `frontend/src/index.css`
- **Sorun:** Interaktif elementlerde keyboard odak göstergesi yok. Klavye kullanıcıları hangi elementin odakta olduğunu göremiyor.
- **Düzeltme:** Button, input gibi interaktif elementlere `:focus-visible` outline ekle.

### 23. Mobil header taşması
- **Dosya:** `frontend/src/index.css:1386-1391`
- **Sorun:** `.topbar` mobilde `overflow-x: auto`. Çok fazla element varsa yatay scroll oluyor ve bazı kontroller gizleniyor.
- **Düzeltme:** Mobilde daha az kritik header elementlerini menüye taşı veya azalt.

---

## Özet

| Öncelik | Sayı | Ana Sorunlar |
|---------|------|--------------|
| Kritik | 3 | Socket disconnect, stale closure, açık şifre |
| Orta | 9 | Admin kontrolü, rate limiting, memory leak, race condition |
| Düşük | 10 | UI titremeleri, CSS, erişilebilirlik |
