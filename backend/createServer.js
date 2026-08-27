/**
 * SyncCinema - Sunucu Fabrikası (Test İçin)
 * Sunucuyu export ederek test ortamında izole çalıştırmayı sağlar.
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

function createServer() {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGIN }));

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: ALLOWED_ORIGIN,
      methods: ["GET", "POST"],
    },
  });

  // Basit sağlık kontrolü endpoint'i
  app.get("/", (req, res) => {
    res.send("SyncCinema backend çalışıyor 🎬");
  });

  const roomUserCounts = {}; // Artık sadece test için tutulur, gerçek sayım Socket.io'dan alınır
  const roomPlaybackState = {};
  const roomAdmins = {}; // Oda sahibini takip et (socket.id değil, userName olarak)
  const roomTimers = {}; // Oda zamanlayıcıları
  const roomPasswords = {}; // Oda şifreleri (opsiyonel)
  const roomMediaType = {}; // roomName -> "local" | "youtube"
  const roomYouTubeUrl = {}; // roomName -> YouTube video ID
  const ROOM_TIMEOUT_MS = 30 * 60 * 1000; // 30 dakika
  const RATE_LIMIT_WINDOW_MS = 1000; // 1 saniye
  const RATE_LIMIT_MAX = 15; // pencere başına maksimum event
  const socketRateLimits = {};

  function checkRateLimit(socketId, eventName) {
    const now = Date.now();
    const key = `${socketId}:${eventName}`;
    if (!socketRateLimits[key]) {
      socketRateLimits[key] = { count: 1, windowStart: now };
      return true;
    }
    const entry = socketRateLimits[key];
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      entry.count = 1;
      entry.windowStart = now;
      return true;
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_MAX;
  }

  function startRoomTimer(roomName) {
    if (roomTimers[roomName]) return; // Zaten zamanlayıcı var
    console.log(`[timer] Oda için 30 dakikalık zamanlayıcı başlatıldı: ${roomName}`);
    roomTimers[roomName] = setTimeout(() => {
      // Oda hala boş mu kontrol et
      const remaining = io.sockets.adapter.rooms.get(roomName)?.size || 0;
      if (remaining === 0) {
        delete roomPlaybackState[roomName];
        delete roomUserCounts[roomName];
        delete roomAdmins[roomName];
        delete roomTimers[roomName];
        delete roomMediaType[roomName];
        delete roomYouTubeUrl[roomName];
        console.log(`[timer] Oda zaman aşımı ile silindi: ${roomName}`);
      }
    }, ROOM_TIMEOUT_MS);
  }

  function cancelRoomTimer(roomName) {
    if (roomTimers[roomName]) {
      clearTimeout(roomTimers[roomName]);
      delete roomTimers[roomName];
      console.log(`[timer] Oda zamanlayıcısı iptal edildi: ${roomName}`);
    }
  }

  function getRoomUsers(roomName) {
    const clients = io.sockets.adapter.rooms.get(roomName);
    const users = [];
    if (clients) {
      for (const clientId of clients) {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (clientSocket) {
          users.push({
            socketId: clientId,
            userName: clientSocket.data.userName || "Misafir",
            isAdmin: clientSocket.data.isAdmin || false
          });
        }
      }
    }
    return users;
  }

  io.on("connection", (socket) => {
    // --- ODA YÖNETİMİ ---
    socket.on("join_room", (data) => {
      let roomName = "";
      let userName = "";
      let roomPassword = "";
      let mediaType = "local";
      let youtubeUrl = "";
      if (typeof data === "object" && data !== null) {
        roomName = data.roomName;
        userName = data.userName;
        roomPassword = data.roomPassword || "";
        mediaType = data.mediaType || "local";
        youtubeUrl = data.youtubeUrl || "";
      } else {
        roomName = data;
      }

      if (!roomName) return;

      // Oda şifresi kontrolü (varsa)
      const existingPassword = roomPasswords[roomName];
      if (existingPassword && existingPassword !== roomPassword) {
        console.log(`[join_room] Yanlış şifre: ${roomName}`);
        socket.emit("wrong_password", { message: "Yanlış oda şifresi." });
        return;
      }

      // Gerçek üye sayısını Socket.io'dan al (manuel sayaç yerine)
      const currentCount = io.sockets.adapter.rooms.get(roomName)?.size || 0;
      console.log(`[join_room] Oda: ${roomName}, Mevcut üye: ${currentCount}, Katılan: ${userName}`);

      if (currentCount >= 2) {
        console.log(`[join_room] Oda dolu: ${roomName}`);
        socket.emit("room_full", { message: "Bu oda dolu (2/2). Farklı bir kod deneyin." });
        return;
      }

      // Aynı isimli kullanıcı kontrolü
      const existingUsers = getRoomUsers(roomName);
      if (existingUsers.some(u => u.userName.toLowerCase() === (userName || "").trim().toLowerCase())) {
        console.log(`[join_room] İsim çakışması: ${userName} odada zaten var.`);
        socket.emit("room_full", { message: "Bu isim odada zaten kullanımda. Farklı bir isim seçin." });
        return;
      }

      socket.join(roomName);
      socket.data.room = roomName;
      socket.data.userName = userName || "Misafir";

      // Zamanlayıcıyı iptal et (birisi odaya girdi)
      cancelRoomTimer(roomName);

      // join sonrası gerçek sayıyı al
      const newCount = io.sockets.adapter.rooms.get(roomName)?.size || 1;
      roomUserCounts[roomName] = newCount;
      const isSecondParticipant = newCount === 2;

      // Admin kontrolü - sadece socket.id üzerinden (userName karşılaştırması güvensiz)
      if (!roomAdmins[roomName]) {
        // Odanın ilk adminini ata
        socket.data.isAdmin = true;
        roomAdmins[roomName] = socket.id;
        // İlk katılan kişi şifre belirleyebilir
        if (roomPassword && !roomPasswords[roomName]) {
          roomPasswords[roomName] = roomPassword;
          console.log(`[join_room] Oda şifresi belirlendi: ${roomName}`);
        }
        // Media bilgisini kaydet
        if (mediaType === "youtube" && youtubeUrl) {
          roomMediaType[roomName] = "youtube";
          roomYouTubeUrl[roomName] = youtubeUrl;
        } else {
          roomMediaType[roomName] = "local";
        }
        console.log(`[join_room] Admin belirlendi: ${userName} (${socket.id}), Media: ${roomMediaType[roomName]}`);
      } else if (roomAdmins[roomName] === socket.id) {
        // Aynı socket geri döndü (reconnect)
        socket.data.isAdmin = true;
        console.log(`[join_room] Admin geri döndü (aynı socket): ${userName}`);
      } else {
        socket.data.isAdmin = false;
      }

      const users = getRoomUsers(roomName);
      const adminUserId = roomAdmins[roomName];
      const adminUser = users.find(u => u.socketId === adminUserId);
      const adminName = adminUser ? adminUser.userName : "";
      console.log(`[join_room] Oda: ${roomName}, Yeni üye sayısı: ${newCount}, Admin: ${adminName}, Kullanıcılar: ${users.map(u => u.userName).join(", ")}`);

      socket.to(roomName).emit("user_joined", {
        message: `${socket.data.userName} odaya katıldı.`,
        userCount: newCount,
        users: users,
        adminName: adminName,
        autoVoice: isSecondParticipant,
        voiceMode: isSecondParticipant ? "initiator" : "waiting"
      });

      socket.emit("room_status", {
        room: roomName,
        userCount: newCount,
        users: users,
        adminName: adminName,
        isAdmin: socket.data.isAdmin,
        autoVoice: isSecondParticipant,
        voiceMode: isSecondParticipant ? "receiver" : "waiting",
        hasPassword: Boolean(roomPasswords[roomName]),
        mediaType: roomMediaType[roomName] || "local",
        youtubeUrl: roomYouTubeUrl[roomName] || ""
      });

      if (roomPlaybackState[roomName]) {
        socket.emit("sync_response", {
          ...roomPlaybackState[roomName],
          mediaType: roomMediaType[roomName] || "local",
          youtubeUrl: roomYouTubeUrl[roomName] || ""
        });
      }
    });

    socket.on("video_action", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;

      // Sadece admin video kontrolü yapabilir
      const adminId = roomAdmins[data.room];
      if (socket.id !== adminId) {
        console.log(`[video_action] Reddedildi - Admin değil: ${socket.data.userName} (${socket.id}) (Admin: ${adminId})`);
        return;
      }

      console.log(`[video_action] İzin verildi - Admin: ${socket.data.userName} (${socket.id}), action: ${data.action}`);

      roomPlaybackState[data.room] = {
        currentTime: data.currentTime,
        isPaused: data.action === "pause",
        sentAt: Date.now(),
        mediaType: roomMediaType[data.room] || "local"
      };
      socket.to(data.room).emit("video_action_received", data);
    });

    socket.on("set_media", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;

      // Sadece admin media değiştirebilir
      const adminId = roomAdmins[data.room];
      if (socket.id !== adminId) {
        console.log(`[set_media] Reddedildi - Admin değil: ${socket.data.userName}`);
        return;
      }

      const mediaType = data.mediaType || "local";
      const youtubeUrl = data.youtubeUrl || "";

      roomMediaType[data.room] = mediaType;
      roomYouTubeUrl[data.room] = youtubeUrl;

      console.log(`[set_media] Admin ${socket.data.userName} media değiştirdi: ${mediaType}, URL: ${youtubeUrl || "yok"}`);

      // Karşı tarafa bildir
      socket.to(data.room).emit("media_changed", {
        mediaType,
        youtubeUrl,
        adminName: socket.data.userName
      });
    });

    socket.on("playback_sync", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      const adminId = roomAdmins[data.room];
      if (socket.id !== adminId) return;
      const existing = roomPlaybackState[data.room];
      roomPlaybackState[data.room] = {
        currentTime: data.currentTime,
        isPaused: existing ? existing.isPaused : false,
        sentAt: Date.now()
      };
      socket.to(data.room).emit("playback_sync_received", data);
    });

    socket.on("request_sync", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      const state = roomPlaybackState[data.room];
      if (state) {
        socket.emit("sync_response", { ...state, sentAt: Date.now() });
      }
    });

    socket.on("file_info", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      socket.to(data.room).emit("file_info_received", data);
    });

    socket.on("reaction", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      if (!checkRateLimit(socket.id, "reaction")) return;
      socket.to(data.room).emit("reaction_received", data);
    });

    socket.on("typing", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      if (!checkRateLimit(socket.id, "typing")) return;
      socket.to(data.room).emit("typing_received", { sender: data.sender });
    });

    socket.on("typing_stop", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      socket.to(data.room).emit("typing_stop_received");
    });

    socket.on("webrtc_signal", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      const signalType = data.signal?.type || "unknown";
      const userName = socket.data.userName || "?";
      console.log(`[webrtc] ${userName} sinyal gönderdi: ${signalType} (Oda: ${data.room})`);
      socket.to(data.room).emit("webrtc_signal_received", data);
    });

    socket.on("send_message", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      if (!checkRateLimit(socket.id, "send_message")) return;
      socket.to(data.room).emit("receive_message", data);
    });

    socket.on("leave_room", (data) => {
      if (!data || !data.room) return;
      if (socket.data.room !== data.room) return;
      socket.leave(data.room);
      const remaining = io.sockets.adapter.rooms.get(data.room)?.size || 0;
      roomUserCounts[data.room] = remaining;
      console.log(`[leave_room] ${socket.data.userName || "?"} odayı terk etti. Oda: ${data.room}, Kalan: ${remaining}`);
      
      if (roomAdmins[data.room] === socket.id) {
        delete roomAdmins[data.room];
      }

      const users = getRoomUsers(data.room);
      let nextAdminName = "";
      if (remaining > 0 && users.length > 0) {
        const nextAdmin = users[0];
        roomAdmins[data.room] = nextAdmin.socketId;
        nextAdminName = nextAdmin.userName;
        console.log(`[leave_room] Yeni admin atandı: ${nextAdmin.userName} (${nextAdmin.socketId})`);
        
        io.to(data.room).emit("admin_changed", {
          adminName: nextAdmin.userName,
          adminSocketId: nextAdmin.socketId
        });
      }

      socket.to(data.room).emit("user_left", {
        message: `${socket.data.userName || "Karşı taraf"} odadan ayrıldı.`,
        userCount: remaining,
        users: users,
        adminName: nextAdminName
      });
      if (remaining === 0) {
        startRoomTimer(data.room);
      }
      socket.data.room = null;
      socket.data.isAdmin = false;
    });

    socket.on("disconnect", () => {
      const room = socket.data.room;
      if (room) {
        // disconnect sonrası socket zaten odadan çıktı, gerçek sayıyı al
        const remaining = io.sockets.adapter.rooms.get(room)?.size || 0;
        roomUserCounts[room] = remaining;
        console.log(`[disconnect] ${socket.data.userName || "?"}  ayrıldı. Oda: ${room}, Kalan: ${remaining}`);
        
        if (roomAdmins[room] === socket.id) {
          delete roomAdmins[room];
        }

        const users = getRoomUsers(room);
        let nextAdminName = "";
        if (remaining > 0 && users.length > 0) {
          const nextAdmin = users[0];
          roomAdmins[room] = nextAdmin.socketId;
          nextAdminName = nextAdmin.userName;
          console.log(`[disconnect] Yeni admin atandı: ${nextAdmin.userName} (${nextAdmin.socketId})`);
          
          io.to(room).emit("admin_changed", {
            adminName: nextAdmin.userName,
            adminSocketId: nextAdmin.socketId
          });
        }

        socket.to(room).emit("user_left", {
          message: `${socket.data.userName || "Karşı taraf"} bağlantısı kesildi — video duraklatıldı.`,
          userCount: remaining,
          users: users,
          adminName: nextAdminName
        });
        // Oda tamamen boşaldıysa zamanlayıcı başlat
        if (remaining === 0) {
          startRoomTimer(room);
        }
      }
    });
  });

  return { app, httpServer, io, roomUserCounts, roomPlaybackState };
}

module.exports = { createServer };
