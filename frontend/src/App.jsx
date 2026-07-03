import React, { useState, useRef, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import "./index.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const SYNC_INTERVAL_MS = 5000;
const REACTIONS = ["❤️", "😂", "😮", "👏", "😢", "🔥", "🎉", "👍"];

function loadSession() {
  try {
    const raw = localStorage.getItem("synccinema_session");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSession(data) {
  try {
    if (data) localStorage.setItem("synccinema_session", JSON.stringify(data));
    else localStorage.removeItem("synccinema_session");
  } catch {}
}

export default function App() {
  const saved = loadSession();

  // --- Site Şifresi State ---
  const [authPass, setAuthPass] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(saved?.roomName && saved?.myName));

  // --- Bağlantı & Oda State ---
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(Boolean(saved?.roomName && saved?.myName));
  const [roomName, setRoomName] = useState(saved?.roomName || "");
  const [myName, setMyName] = useState(saved?.myName || "");
  const [peerCount, setPeerCount] = useState(1);
  const [peerName, setPeerName] = useState("");
  const [systemNotice, setSystemNotice] = useState("");
  const [lobbyMode, setLobbyMode] = useState("select");
  const [copied, setCopied] = useState(false);
  const [lobbyError, setLobbyError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false); // Admin kontrolü

  // --- Video State ---
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoFileName, setVideoFileName] = useState("");
  const [videoFileMeta, setVideoFileMeta] = useState(null);
  const [showSyncFlash, setShowSyncFlash] = useState(false);
  const [fileMismatch, setFileMismatch] = useState(false);
  const [peerTimeDiff, setPeerTimeDiff] = useState(null);

  // --- Chat State ---
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [flyingEmojis, setFlyingEmojis] = useState([]);

  // --- WebRTC Ses State ---
  const [micEnabled, setMicEnabled] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceAutoConfig, setVoiceAutoConfig] = useState({ autoVoice: false, voiceMode: "waiting" });

  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const isIncomingSignal = useRef(false);
  const chatEndRef = useRef(null);
  const syncFlashTimeout = useRef(null);
  const typingTimerRef = useRef(null);
  const emojiIdRef = useRef(0);
  const roomNameRef = useRef(roomName);

  // WebRTC Refs
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const voiceAutoStartedRef = useRef(false);

  // ---------------------------------------------------------------
  // SOCKET BAĞLANTISI
  // ---------------------------------------------------------------
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const savedSession = loadSession();
      const savedRoom = roomNameRef.current || savedSession?.roomName;
      const savedName = myName || savedSession?.myName;
      if (savedRoom && savedName) {
        socket.emit("join_room", { roomName: savedRoom, userName: savedName.trim() });
        socket.emit("request_sync", { room: savedRoom });
      }
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("reconnect", () => {
      const savedSession = loadSession();
      const savedRoom = roomNameRef.current || savedSession?.roomName;
      const savedName = myName || savedSession?.myName;
      if (savedRoom && savedName) {
        socket.emit("join_room", { roomName: savedRoom, userName: savedName.trim() });
        socket.emit("request_sync", { room: savedRoom });
      }
    });

    const updatePeerName = (usersList) => {
      if (!usersList || !Array.isArray(usersList)) return;
      const peer = usersList.find((u) => u.socketId !== socket.id);
      if (peer) setPeerName(peer.userName);
      else setPeerName("");
    };

    socket.on("room_status", (data) => {
      setPeerCount(data.userCount || 1);
      updatePeerName(data.users);
      setIsAdmin(data.isAdmin || false); // Admin durumunu ayarla
      setVoiceAutoConfig({
        autoVoice: Boolean(data.autoVoice),
        voiceMode: data.voiceMode || "waiting",
      });
    });

    socket.on("user_joined", (data) => {
      setPeerCount(data.userCount || 2);
      setSystemNotice(data.message);
      updatePeerName(data.users);
      setVoiceAutoConfig({
        autoVoice: Boolean(data.autoVoice),
        voiceMode: data.voiceMode || "waiting",
      });
    });

    socket.on("user_left", (data) => {
      setPeerCount(data.userCount || 1);
      setSystemNotice(data.message);
      updatePeerName(data.users);
      
      const video = videoRef.current;
      if (video && !video.paused) {
        isIncomingSignal.current = true;
        video.pause();
        setTimeout(() => { isIncomingSignal.current = false; }, 100);
      }
      setPeerTimeDiff(null);
      setPeerIsTyping(false);
      setFileMismatch(false);
      setVoiceAutoConfig({ autoVoice: false, voiceMode: "waiting" });
      voiceAutoStartedRef.current = false;
      
      // Sesli sohbeti kapat (karşı taraf gitti)
      cleanupWebRTC();
    });

    socket.on("room_full", (data) => {
      setLobbyError(data.message || "Bu oda dolu. Farklı bir kod deneyin.");
      setJoined(false);
      setRoomName("");
      saveSession(null);
    });

    // --- WebRTC Sinyalleşme ---
    socket.on("webrtc_signal_received", (data) => {
      if (peerRef.current) {
        peerRef.current.signal(data.signal);
      } else {
        // We received a signal but don't have a peer yet (we are the receiver)
        // Automatically start receiver peer if we have microphone permission, 
        // or just accept it silently if we don't have a stream yet.
        initWebRTC(false, data.signal);
      }
    });

    socket.on("video_action_received", (data) => {
      const video = videoRef.current;
      if (!video) return;

      isIncomingSignal.current = true;
      const latency = (Date.now() - (data.sentAt || Date.now())) / 1000;

      if (data.action === "play") {
        let targetTime = data.currentTime + latency;
        if (video.duration && targetTime > video.duration) targetTime = video.duration;

        if (video.readyState < 3) {
          video.currentTime = targetTime;
          const onCanPlay = () => {
            const extraLatency = (Date.now() - data.sentAt) / 1000;
            let compensated = data.currentTime + extraLatency;
            if (video.duration && compensated > video.duration) compensated = video.duration;
            video.currentTime = compensated;
            video.play().catch(() => {});
          };
          video.addEventListener("canplay", onCanPlay, { once: true });
        } else {
          video.currentTime = targetTime;
          video.play().catch(() => {});
        }
      } else if (data.action === "pause") {
        video.currentTime = data.currentTime;
        video.pause();
      } else if (data.action === "seek") {
        let targetTime = data.currentTime + latency;
        if (video.duration && targetTime > video.duration) targetTime = video.duration;
        video.currentTime = targetTime;
      }

      triggerSyncFlash();
      setTimeout(() => { isIncomingSignal.current = false; }, 100);
    });

    socket.on("playback_sync_received", (data) => {
      const video = videoRef.current;
      if (!video || video.paused) return;

      const latency = (Date.now() - (data.sentAt || Date.now())) / 1000;
      const peerRealTime = data.currentTime + latency;
      const timeDiff = video.currentTime - peerRealTime;
      const absDiff = Math.abs(timeDiff);

      setPeerTimeDiff(timeDiff);

      if (absDiff > 1.5) {
        isIncomingSignal.current = true;
        video.currentTime = peerRealTime;
        video.playbackRate = 1.0;
        setTimeout(() => { isIncomingSignal.current = false; }, 100);
      } else if (absDiff > 0.20) {
        video.playbackRate = timeDiff > 0 ? 0.95 : 1.05;
      } else if (absDiff < 0.05) {
        video.playbackRate = 1.0;
      }
    });

    socket.on("sync_response", (data) => {
      const video = videoRef.current;
      if (!video || !data) return;
      const latency = (Date.now() - (data.sentAt || Date.now())) / 1000;
      let targetTime = data.currentTime + latency;
      if (video.duration && targetTime > video.duration) targetTime = video.duration;
      isIncomingSignal.current = true;
      video.currentTime = targetTime;
      if (!data.isPaused) video.play().catch(() => {});
      else video.pause();
      
      setTimeout(() => { isIncomingSignal.current = false; }, 100);
      triggerSyncFlash();
    });

    socket.on("file_info_received", (data) => {
      if (!videoFileMeta) return;
      const nameMismatch = data.name !== videoFileMeta.name;
      const sizeMismatch = Math.abs(data.size - videoFileMeta.size) > 1024 * 100;
      const durationMismatch = data.duration && videoFileMeta.duration && 
                               Math.abs(data.duration - videoFileMeta.duration) > 2; // 2 sn fark
      setFileMismatch(nameMismatch || sizeMismatch || durationMismatch);
      
      // Farklı dosya uyarısı gönder
      if (nameMismatch || sizeMismatch || durationMismatch) {
        setSystemNotice("⚠️ Farklı video dosyası tespit edildi! Senkronizasyon hatalı olabilir.");
      }
    });

    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on("reaction_received", (data) => {
      spawnEmoji(data.emoji);
    });

    socket.on("typing_received", () => setPeerIsTyping(true));
    socket.on("typing_stop_received", () => setPeerIsTyping(false));

    return () => {
      cleanupWebRTC();
      socket.disconnect();
    };
  }, []);

  // roomNameRef'i her değişiklikte güncelle
  useEffect(() => {
    roomNameRef.current = roomName;
  }, [roomName]);

  // Session'ı localStorage'a kaydet
  useEffect(() => {
    if (isAuthenticated && joined && roomName && myName) {
      saveSession({ roomName, myName });
    } else {
      saveSession(null);
    }
  }, [isAuthenticated, joined, roomName, myName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, peerIsTyping]);

  useEffect(() => {
    if (!systemNotice) return;
    const t = setTimeout(() => setSystemNotice(""), 5000);
    return () => clearTimeout(t);
  }, [systemNotice]);

  useEffect(() => {
    if (!lobbyError) return;
    const t = setTimeout(() => setLobbyError(""), 5000);
    return () => clearTimeout(t);
  }, [lobbyError]);

  useEffect(() => {
    if (!joined || !videoSrc) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && socketRef.current) {
        socketRef.current.emit("playback_sync", {
          room: roomName.trim(),
          currentTime: video.currentTime,
          sentAt: Date.now()
        });
      }
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [joined, videoSrc, roomName]);

  useEffect(() => {
    if (!joined || !videoSrc || micEnabled) return;
    if (!voiceAutoConfig.autoVoice || voiceAutoStartedRef.current) return;

    voiceAutoStartedRef.current = true;
    initWebRTC(voiceAutoConfig.voiceMode === "initiator");
  }, [joined, videoSrc, micEnabled, voiceAutoConfig]);

  // ---------------------------------------------------------------
  // WEBRTC SESLİ SOHBET
  // ---------------------------------------------------------------
  const cleanupWebRTC = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setVoiceConnected(false);
    setMicEnabled(false);
  };

  const initWebRTC = (initiator, initialSignal = null) => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        streamRef.current = stream;
        setMicEnabled(true);

        const peer = new Peer({
          initiator: initiator,
          trickle: true,
          stream: stream,
        });

        peer.on("signal", (data) => {
          socketRef.current.emit("webrtc_signal", {
            room: roomName.trim(),
            signal: data,
          });
        });

        peer.on("connect", () => {
          setVoiceConnected(true);
        });

        peer.on("stream", (remoteStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.error("Audio play error", e));
          }
        });

        peer.on("error", (err) => {
          console.error("WebRTC Error:", err);
          cleanupWebRTC();
        });

        if (initialSignal) {
          peer.signal(initialSignal);
        }

        peerRef.current = peer;
      })
      .catch((err) => {
        console.error("Mikrofon izni alınamadı", err);
        setSystemNotice("Mikrofon erişimine izin vermeniz gerekiyor.");
      });
  };

  const toggleMic = () => {
    if (micEnabled) {
      // Kapat
      cleanupWebRTC();
    } else {
      // Aç ve başlat
      if (peerCount > 1) {
        initWebRTC(true);
      } else {
        setSystemNotice("Odadaki diğer kişi bekleniyor...");
      }
    }
  };


  // ---------------------------------------------------------------
  // YARDIMCI FONKSİYONLAR
  // ---------------------------------------------------------------
  const triggerSyncFlash = () => {
    setShowSyncFlash(true);
    clearTimeout(syncFlashTimeout.current);
    syncFlashTimeout.current = setTimeout(() => setShowSyncFlash(false), 900);
  };

  const spawnEmoji = useCallback((emoji) => {
    const id = ++emojiIdRef.current;
    const x = 10 + Math.random() * 80;
    setFlyingEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFlyingEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2200);
  }, []);

  // ---------------------------------------------------------------
  // ODA OLUŞTURMA & KATILMA & KOPYALAMA
  // ---------------------------------------------------------------
  const handleCreateRoom = () => {
    if (!myName.trim()) return;
    setLobbyError("");
    const generatedCode = String(Math.floor(10000 + Math.random() * 90000));
    setRoomName(generatedCode);
    socketRef.current.emit("join_room", { roomName: generatedCode, userName: myName.trim() });
    setJoined(true);
  };

  const handleJoinRoom = () => {
    if (!roomName.trim() || !myName.trim()) return;
    setLobbyError("");
    socketRef.current.emit("join_room", { roomName: roomName.trim(), userName: myName.trim() });
    setJoined(true);
  };

  const handleCopyCode = () => {
    if (!roomName) return;
    navigator.clipboard.writeText(roomName).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ---------------------------------------------------------------
  // DOSYA SEÇİMİ
  // ---------------------------------------------------------------
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setVideoFileName(file.name);

    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.onloadedmetadata = () => {
      const meta = { name: file.name, size: file.size, duration: tempVideo.duration };
      setVideoFileMeta(meta);
      if (socketRef.current) {
        socketRef.current.emit("file_info", { room: roomName.trim(), ...meta });
      }
    };
    tempVideo.src = url;
  };

  // ---------------------------------------------------------------
  // VİDEO EVENT HANDLER'LARI
  // ---------------------------------------------------------------
  const emitVideoAction = useCallback(
    (action) => {
      if (isIncomingSignal.current) return;
      if (!isAdmin) return; // Sadece admin kontrol edebilir
      const video = videoRef.current;
      if (!video || !socketRef.current) return;

      socketRef.current.emit("video_action", {
        room: roomName.trim(),
        action,
        currentTime: video.currentTime,
        sentAt: Date.now(),
      });
    },
    [roomName, isAdmin]
  );

  const handlePlay = () => emitVideoAction("play");
  const handlePause = () => emitVideoAction("pause");
  const handleSeeked = () => emitVideoAction("seek");

  // ---------------------------------------------------------------
  // CHAT GÖNDERME
  // ---------------------------------------------------------------
  const handleSendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const payload = { room: roomName.trim(), message: text, sender: myName.trim() };
    socketRef.current.emit("send_message", payload);
    setMessages((prev) => [...prev, payload]);
    setDraft("");
    socketRef.current.emit("typing_stop", { room: roomName.trim() });
  };

  const handleChatKeyDown = (e) => {
    if (e.key === "Enter") handleSendMessage();
  };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    if (socketRef.current) {
      socketRef.current.emit("typing", { room: roomName.trim(), sender: myName.trim() });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit("typing_stop", { room: roomName.trim() });
      }
    }, 1000);
  };

  // ---------------------------------------------------------------
  // ODAYI TERK ETME
  // ---------------------------------------------------------------
  const handleLeaveRoom = () => {
    if (!confirm("Odadan ayrılmak istediğine emin misin?")) return;
    
    cleanupWebRTC();
    socketRef.current.disconnect();
    
    setJoined(false);
    setRoomName("");
    setVideoSrc(null);
    setVideoFileName("");
    setVideoFileMeta(null);
    setMessages([]);
    setPeerCount(1);
    setPeerName("");
    setIsAdmin(false);
    setFileMismatch(false);
    setPeerTimeDiff(null);
    saveSession(null);
  };

  const handleReaction = (emoji) => {
    if (!socketRef.current) return;
    socketRef.current.emit("reaction", { room: roomName.trim(), emoji });
    spawnEmoji(emoji);
  };

  const voiceReady = peerCount > 1 && Boolean(videoSrc);

  const getSyncStatusColor = () => {
    if (peerTimeDiff === null) return "ok";
    const abs = Math.abs(peerTimeDiff);
    if (abs < 0.2) return "ok";
    if (abs < 1.5) return "warn";
    return "danger";
  };

  // =================================================================
  // ŞİFRE EKRANI (GEÇİCİ KORUMA)
  // =================================================================
  if (!isAuthenticated) {
    return (
      <div className="lobby">
        <div className="lobby-card" style={{ textAlign: "center" }}>
          <h1 className="lobby-brand">
            Sync<span>Cinema</span>
          </h1>
          <p className="lobby-tagline">Sistem şu an kapalı betadadır.</p>
          <label className="field-label">Giriş Şifresi</label>
          <input
            type="password"
            className="field-input"
            placeholder="Şifreyi giriniz"
            value={authPass}
            onChange={(e) => setAuthPass(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && authPass === "12345") {
                setIsAuthenticated(true);
              }
            }}
          />
          <button
            className="enter-btn"
            style={{ marginTop: "1rem" }}
            onClick={() => {
              if (authPass === "12345") setIsAuthenticated(true);
              else alert("Hatalı şifre!");
            }}
          >
            Giriş Yap
          </button>
        </div>
      </div>
    );
  }

  // =================================================================
  // LOBİ EKRANI
  // =================================================================
  if (!joined) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1 className="lobby-brand">
            Sync<span>Cinema</span>
          </h1>
          <p className="lobby-tagline">
            Aynı filmi, aynı anda, farklı şehirlerde izleyin. Video hiçbir yere
            yüklenmez — sadece oynatma sinyalleri senkronize edilir.
          </p>

          <label className="field-label">Senin Adın</label>
          <input
            className="field-input"
            placeholder="örn. Mustafa"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
          />

          <div className="lobby-actions">
            <button
              className={`lobby-btn ${lobbyMode === "create" ? "active" : ""}`}
              disabled={!connected || !myName.trim()}
              onClick={handleCreateRoom}
              title="Yeni bir oda oluştur ve bağlan"
            >
              <span className="icon">🎬</span>
              Oda Oluştur
            </button>
            <button
              className={`lobby-btn ${lobbyMode === "join" ? "active" : ""}`}
              disabled={!connected || !myName.trim()}
              onClick={() => {
                setLobbyMode("join");
                setRoomName("");
                setLobbyError("");
              }}
              title="Var olan bir odaya katıl"
            >
              <span className="icon">🔑</span>
              Odaya Katıl
            </button>
          </div>

          {lobbyMode === "join" && (
            <div className="lobby-join-section">
              <label className="field-label">5 Haneli Oda Kodu</label>
              <input
                className="field-input"
                placeholder="örn. 12345"
                value={roomName}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val.length <= 5) setRoomName(val);
                }}
                onKeyDown={(e) => e.key === "Enter" && roomName.length === 5 && handleJoinRoom()}
              />
              <button
                className="enter-btn"
                disabled={!connected || roomName.length !== 5 || !myName.trim()}
                onClick={handleJoinRoom}
              >
                Katıl
              </button>
            </div>
          )}

          {lobbyError && (
            <div className="lobby-error">⚠️ {lobbyError}</div>
          )}

          <div className="conn-note">
            <span className={`dot ${connected ? "online" : "offline"}`} />
            {connected ? "Sunucuya bağlı" : "Sunucuya bağlanılıyor..."}
          </div>
        </div>
      </div>
    );
  }

  // =================================================================
  // ANA UYGULAMA EKRANI
  // =================================================================
  return (
    <div className="app-shell">
      <audio ref={remoteAudioRef} autoPlay />
      <div className="topbar">
        <div className="topbar-brand">
          Sync<span>Cinema</span>
        </div>
        <div className="room-share-container">
          <span className="room-label">Oda Kodu:</span>
          <span className="room-code-display">{roomName}</span>
          <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopyCode}>
            {copied ? "Kopyalandı! ✓" : "Kopyala 📋"}
          </button>
          {isAdmin && <span className="admin-badge">👑 ADMIN</span>}
        </div>
        <div className="presence" style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div>
            <span className={`dot ${peerCount > 1 ? "online" : "offline"}`} />
            {peerCount > 1 ? `${peerName || "Karşı taraf"} odada` : "Karşı taraf bekleniyor..."}
          </div>

          <div className="voice-status">
            <span className={`dot ${voiceConnected ? "online" : "offline"}`} />
            {voiceConnected ? "Sesli sohbet açık" : "Sesli sohbet kapalı"}
          </div>
          
          <button 
            className={`mic-btn ${micEnabled ? 'active' : ''}`} 
            onClick={toggleMic}
            disabled={!voiceReady}
            title={!voiceReady ? "Sesli sohbet için önce videoyu aç ve karşı tarafı bekle" : "Sesli sohbete bağlan"}
          >
            {micEnabled ? "🎙️ Sesi Kapat" : "🎤 Sesi Aç"}
          </button>
          
          <button 
            className="mic-btn leave-btn"
            onClick={handleLeaveRoom}
            title="Odadan ayrıl"
          >
            🚪 Çık
          </button>
        </div>
      </div>

      <div className="main-layout">
        <div className="video-pane">
          {fileMismatch && (
            <div className="file-mismatch-banner">
              ⚠️ Farklı video dosyası! Senkronizasyon çalışmayabilir — her iki taraf da aynı dosyayı seçmeli.
            </div>
          )}

          {!videoSrc ? (
            <div className="picker-zone">
              <div className="reel">🎬</div>
              <div>İzlemek istediğin video dosyasını seç.</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                Karşı tarafın da diskinde aynı dosya olmalı.
              </div>
              <label className="picker-label">
                Video Seç
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                controls={isAdmin} // Sadece admin kontrol edebilir
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeeked}
              />
              {!isAdmin && peerCount > 1 && (
                <div className="admin-only-banner">
                  ⚠️ Sadece oda sahibi videoyu kontrol edebilir
                </div>
              )}
              <div className={`sync-flash ${showSyncFlash ? "show" : ""}`}>
                <span className="pulse-dot" />
                Senkronize edildi
              </div>

              {flyingEmojis.map((e) => (
                <div
                  key={e.id}
                  className="flying-emoji"
                  style={{ left: `${e.x}%` }}
                >
                  {e.emoji}
                </div>
              ))}

              {peerCount > 1 && peerTimeDiff !== null && (
                <div className={`sync-status ${getSyncStatusColor()}`}>
                  ⏱ Fark: {Math.abs(peerTimeDiff).toFixed(2)} sn
                  {Math.abs(peerTimeDiff) < 0.2 ? " ✓" : ""}
                </div>
              )}
            </>
          )}
        </div>

        <div className="chat-pane">
          {videoSrc && (
            <div className="reaction-btn-bar">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="reaction-btn"
                  onClick={() => handleReaction(emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="chat-header">Sohbet</div>
          <div className="chat-messages">
            {systemNotice && <div className="system-msg">{systemNotice}</div>}
            {messages.map((m, i) => {
              const isMe = m.sender === myName.trim();
              return (
                <div key={i} className={`bubble-row ${isMe ? "me" : "them"}`}>
                  {!isMe && <span className="bubble-sender">{m.sender}</span>}
                  <div className="bubble">{m.message}</div>
                </div>
              );
            })}
            {peerIsTyping && (
              <div className="typing-indicator">
                <span className="typing-name">{peerName || "Karşı taraf"}</span> yazıyor
                <span className="typing-dots">
                  <span /><span /><span />
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-row">
            <input
              placeholder="Mesaj yaz..."
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleChatKeyDown}
            />
            <button onClick={handleSendMessage}>Gönder</button>
          </div>
        </div>
      </div>
    </div>
  );
}
