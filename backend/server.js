/**
 * SyncCinema - Backend Sunucusu
 * -----------------------------------------------------
 * Bu sunucu video dosyalarını STREAM ETMEZ.
 * Sadece odadaki kullanıcılar arasında play/pause/seek
 * komutlarını ve chat mesajlarını WebSocket (Socket.io)
 * üzerinden anlık olarak dağıtır (relay/broadcast).
 */

const { createServer } = require("./createServer");

const PORT = 3001;
const { httpServer } = createServer();

httpServer.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
