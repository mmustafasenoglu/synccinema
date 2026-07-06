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
  const ROOM_TIMEOUT_MS = 30 * 60 * 1000; // 30 dakika

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
      if (typeof data === "object" && data !== null) {
        roomName = data.roomName;
        userName = data.userName;
      } else {
        roomName = data;
      }

      if (!roomName) return;

      // Gerçek üye sayısını Socket.io'dan al (manuel sayaç yerine)
      const currentCount = io.sockets.adapter.rooms.get(roomName)?.size || 0;
      console.log(`[join_room] Oda: ${roomName}, Mevcut üye: ${currentCount}, Katılan: ${userName}`);

      if (currentCount >= 2) {
        console.log(`[join_room] Oda dolu: ${roomName}`);
        socket.emit("room_full", { message: "Bu oda dolu (2/2). Farklı bir kod deneyin." });
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

      // Admin kontrolü - ilk giren kişi admin, tekrar bağlanırsa da admin kalır
      if (!roomAdmins[roomName]) {
        // İlk kez oda açılıyor, bu kişi admin
        socket.data.isAdmin = true;
        roomAdmins[roomName] = userName; // userName olarak sakla
        console.log(`[join_room] Admin belirlendi: ${userName}`);
      } else if (roomAdmins[roomName] === userName) {
        // Orijinal admin tekrar bağlandı
        socket.data.isAdmin = true;
        console.log(`[join_room] Admin geri döndü: ${userName}`);
      } else {
        // Admin değil
        socket.data.isAdmin = false;
      }

      const users = getRoomUsers(roomName);
      const adminName = roomAdmins[roomName];
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
        voiceMode: isSecondParticipant ? "receiver" : "waiting"
      });

      if (roomPlaybackState[roomName]) {
        socket.emit("sync_response", roomPlaybackState[roomName]);
      }
    });

    socket.on("video_action", (data) => {
      if (!data || !data.room) return;
      
      // Sadece admin video kontrolü yapabilir (userName ile kontrol)
      const adminName = roomAdmins[data.room];
      if (socket.data.userName !== adminName) {
        console.log(`[video_action] Reddedildi - Admin değil: ${socket.data.userName} (Admin: ${adminName})`);
        return;
      }

      roomPlaybackState[data.room] = {
        currentTime: data.currentTime,
        isPaused: data.action === "pause",
        sentAt: Date.now()
      };
      socket.to(data.room).emit("video_action_received", data);
    });

    socket.on("playback_sync", (data) => {
      if (!data || !data.room) return;
      roomPlaybackState[data.room] = {
        currentTime: data.currentTime,
        isPaused: false,
        sentAt: Date.now()
      };
      socket.to(data.room).emit("playback_sync_received", data);
    });

    socket.on("request_sync", (data) => {
      if (!data || !data.room) return;
      const state = roomPlaybackState[data.room];
      if (state) {
        socket.emit("sync_response", { ...state, sentAt: Date.now() });
      }
    });

    socket.on("file_info", (data) => {
      if (!data || !data.room) return;
      socket.to(data.room).emit("file_info_received", data);
    });

    socket.on("reaction", (data) => {
      if (!data || !data.room) return;
      socket.to(data.room).emit("reaction_received", data);
    });

    socket.on("typing", (data) => {
      if (!data || !data.room) return;
      socket.to(data.room).emit("typing_received", { sender: data.sender });
    });

    socket.on("typing_stop", (data) => {
      if (!data || !data.room) return;
      socket.to(data.room).emit("typing_stop_received");
    });

    socket.on("webrtc_signal", (data) => {
      if (!data || !data.room) return;
      const signalType = data.signal?.type || "unknown";
      const userName = socket.data.userName || "?";
      console.log(`[webrtc] ${userName} sinyal gönderdi: ${signalType} (Oda: ${data.room})`);
      socket.to(data.room).emit("webrtc_signal_received", data);
    });

    socket.on("send_message", (data) => {
      if (!data || !data.room) return;
      socket.to(data.room).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
      const room = socket.data.room;
      if (room) {
        // disconnect sonrası socket zaten odadan çıktı, gerçek sayıyı al
        const remaining = io.sockets.adapter.rooms.get(room)?.size || 0;
        roomUserCounts[room] = remaining;
        console.log(`[disconnect] ${socket.data.userName || "?"}  ayrıldı. Oda: ${room}, Kalan: ${remaining}`);
        const users = getRoomUsers(room);
        socket.to(room).emit("user_left", {
          message: `${socket.data.userName || "Karşı taraf"} bağlantısı kesildi — video duraklatıldı.`,
          userCount: remaining,
          users: users
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
