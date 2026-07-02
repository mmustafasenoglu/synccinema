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

  const roomUserCounts = {};
  const roomPlaybackState = {};

  function getRoomUsers(roomName) {
    const clients = io.sockets.adapter.rooms.get(roomName);
    const users = [];
    if (clients) {
      for (const clientId of clients) {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (clientSocket) {
          users.push({
            socketId: clientId,
            userName: clientSocket.data.userName || "Misafir"
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

      const currentCount = roomUserCounts[roomName] || 0;
      if (currentCount >= 2) {
        socket.emit("room_full", { message: "Bu oda dolu (2/2). Farklı bir kod deneyin." });
        return;
      }

      socket.join(roomName);
      socket.data.room = roomName;
      socket.data.userName = userName || "Misafir";

      roomUserCounts[roomName] = currentCount + 1;
      const isSecondParticipant = roomUserCounts[roomName] === 2;

      const users = getRoomUsers(roomName);

      socket.to(roomName).emit("user_joined", {
        message: `${socket.data.userName} odaya katıldı.`,
        userCount: roomUserCounts[roomName],
        users: users,
        autoVoice: isSecondParticipant,
        voiceMode: isSecondParticipant ? "initiator" : "waiting"
      });

      socket.emit("room_status", {
        room: roomName,
        userCount: roomUserCounts[roomName],
        users: users,
        autoVoice: isSecondParticipant,
        voiceMode: isSecondParticipant ? "receiver" : "waiting"
      });

      if (roomPlaybackState[roomName]) {
        socket.emit("sync_response", roomPlaybackState[roomName]);
      }
    });

    socket.on("video_action", (data) => {
      if (!data || !data.room) return;
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
      // data: { room, signal, sender }
      // Broadcast signal to everyone else in the room
      socket.to(data.room).emit("webrtc_signal_received", data);
    });

    socket.on("send_message", (data) => {
      if (!data || !data.room) return;
      socket.to(data.room).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
      const room = socket.data.room;
      if (room && roomUserCounts[room]) {
        roomUserCounts[room] = Math.max(0, roomUserCounts[room] - 1);
        const users = getRoomUsers(room);
        socket.to(room).emit("user_left", {
          message: `${socket.data.userName || "Karşı taraf"} bağlantısı kesildi — video duraklatıldı.`,
          userCount: roomUserCounts[room],
          users: users
        });
      }
    });
  });

  return { app, httpServer, io, roomUserCounts, roomPlaybackState };
}

module.exports = { createServer };
