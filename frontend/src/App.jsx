import React, { useState, useRef, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import MP4Box from "mp4box";
import { extractEmbeddedSubtitles, parseVTT, getActiveCueText, loadFFmpeg } from "./subtitleExtractor";
import "./index.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const SYNC_INTERVAL_MS = 5000;
const REACTIONS = ["❤️", "😂", "😮", "👏", "😢", "🔥", "🎉", "👍"];

// ---------------------------------------------------------------
// SESSION HELPERS
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// SVG ICONS — Birebir mockup'tan
// ---------------------------------------------------------------

// Clapper board — HTML mockup'taki SVG paths birebir
const ClapperIcon = () => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Body */}
    <rect x="6" y="24" width="52" height="32" rx="4" fill="var(--panel-2)" stroke="var(--pink-deep)" strokeWidth="2"/>
    {/* Stripe 1 - pink */}
    <path d="M6 24l6-14h10l-6 14z" fill="var(--pink-deep)"/>
    {/* Stripe 2 - dark */}
    <path d="M28 24l6-14h10l-6 14z" fill="var(--text)"/>
    {/* Stripe 3 - pink */}
    <path d="M50 24l6-14v14z" fill="var(--pink-deep)"/>
  </svg>
);

// Moon icon (light mode -> click to go dark)
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// Sun icon (dark mode -> click to go light)
const SunIcon = () => (
  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>
);

// Copy icon
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

// Mic icon
const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
  </svg>
);

// Camera icon for video chat
const CameraIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 7l-7 5 7 5V7z"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);

// Send icon — birebir mockup
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
  </svg>
);

// Camera/Video icon for lobby button
const VideoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 7l-7 5 7 5V7z"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);

// Key icon for join button
const KeyIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="M21 2l-9.6 9.6M15.5 7.5L19 4l1 4 4 1-3.5 3.5"/>
  </svg>
);

// Speech bubble for chat empty state — birebir mockup
const ChatBubbleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
);

// Mobile chat toggle icon
const ChatToggleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

// Fullscreen toggle icon
const FullscreenIcon = ({ isFullscreen }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {isFullscreen ? (
      <>
        <polyline points="8 3 8 8 3 8" />
        <polyline points="16 3 16 8 21 8" />
        <polyline points="8 21 8 16 3 16" />
        <polyline points="16 21 16 16 21 16" />
      </>
    ) : (
      <>
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </>
    )}
  </svg>
);

// ---------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------
export default function App() {
  const saved = loadSession();

  // --- Theme (light default, dark toggle) ---
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("synccinema_theme") || "light";
  });

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
    localStorage.setItem("synccinema_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  // --- Fullscreen ---
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement);
    document.addEventListener("fullscreenchange", handleFs);
    document.addEventListener("webkitfullscreenchange", handleFs);
    return () => {
      document.removeEventListener("fullscreenchange", handleFs);
      document.removeEventListener("webkitfullscreenchange", handleFs);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const elem = document.documentElement;
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  };

  // --- Site Şifresi ---
  const [authPass, setAuthPass] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(saved?.roomName && saved?.myName));

  // --- Bağlantı & Oda ---
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(Boolean(saved?.roomName && saved?.myName));
  const [roomName, setRoomName] = useState(saved?.roomName || "");
  const [myName, setMyName] = useState(saved?.myName || "");
  const [roomPassword, setRoomPassword] = useState("");
  const [peerCount, setPeerCount] = useState(1);
  const [peerName, setPeerName] = useState("");
  const [systemNotice, setSystemNotice] = useState("");
  const [lobbyMode, setLobbyMode] = useState("select");
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [lobbyError, setLobbyError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // --- Video ---
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoFileName, setVideoFileName] = useState("");
  const [videoFileMeta, setVideoFileMeta] = useState(null);
  const [showSyncFlash, setShowSyncFlash] = useState(false);
  const [fileMismatch, setFileMismatch] = useState(false);
  const [peerTimeDiff, setPeerTimeDiff] = useState(null);
  const [subtitleSrc, setSubtitleSrc] = useState(null);
  const [subtitleName, setSubtitleName] = useState("");

  // --- Altyazı Ayarları ---
  const loadSubtitleSettings = () => {
    try {
      const s = localStorage.getItem("synccinema_subtitle_settings");
      if (s) return JSON.parse(s);
    } catch {}
    return { fontSize: 18, top: 15, left: 2, opacity: 85, color: "#ffffff", bgOpacity: 85 };
  };
  const [subtitleSettings, setSubtitleSettings] = useState(loadSubtitleSettings);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [activeCueText, setActiveCueText] = useState("");
  const [subtitleExtracting, setSubtitleExtracting] = useState(false);
  const [embeddedCues, setEmbeddedCues] = useState([]);
  const [activeEmbeddedTrack, setActiveEmbeddedTrack] = useState(null);
  const [showTrackSelector, setShowTrackSelector] = useState(false);

  useEffect(() => {
    localStorage.setItem("synccinema_subtitle_settings", JSON.stringify(subtitleSettings));
  }, [subtitleSettings]);

  // --- Chat ---
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [flyingEmojis, setFlyingEmojis] = useState([]);

  // --- WebRTC ---
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceAutoConfig, setVoiceAutoConfig] = useState({ autoVoice: false, voiceMode: "waiting" });
  const [remoteVideoStream, setRemoteVideoStream] = useState(null);
  const [localVideoStream, setLocalVideoStream] = useState(null);

  // --- Mobile Chat ---
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // --- Klavye Kısayolları ---
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Refs
  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const isIncomingSignal = useRef(false);
  const chatEndRef = useRef(null);
  const syncFlashTimeout = useRef(null);
  const typingTimerRef = useRef(null);
  const emojiIdRef = useRef(0);
  const roomNameRef = useRef(roomName);
  const videoFileInputRef = useRef(null);
  const subtitleFileInputRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const voiceAutoStartedRef = useRef(false);
  const videoFileMetaRef = useRef(videoFileMeta);
  const myNameRef = useRef(myName);
  const mobileChatOpenRef = useRef(mobileChatOpen);
  const isAdminRef = useRef(isAdmin);
  const initWebRTCRef = useRef(false);
  const initWebRTCGenerationRef = useRef(0);
  const cameraTogglingRef = useRef(false);
  const blobUrlsRef = useRef([]);
  const emojiTimeoutRefs = useRef([]);
  const voiceAutoConfigRef = useRef(voiceAutoConfig);
  const cameraEnabledRef = useRef(false);
  const localVideoRef = useRef(null);

  // ---------------------------------------------------------------
  // SOCKET
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
      const ss = loadSession();
      const savedRoom = roomNameRef.current || ss?.roomName;
      const savedName = myNameRef.current || ss?.myName;
      if (savedRoom && savedName) {
        socket.emit("join_room", { roomName: savedRoom, userName: savedName.trim() });
        socket.emit("request_sync", { room: savedRoom });
      }
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("reconnect", () => {
      const ss = loadSession();
      const savedRoom = roomNameRef.current || ss?.roomName;
      const savedName = myNameRef.current || ss?.myName;
      if (savedRoom && savedName) {
        socket.emit("join_room", { roomName: savedRoom, userName: savedName.trim() });
        socket.emit("request_sync", { room: savedRoom });
      }
    });

    const updatePeerName = (usersList) => {
      if (!usersList || !Array.isArray(usersList)) return;
      const peer = usersList.find((u) => u.socketId !== socket.id);
      setPeerName(peer ? peer.userName : "");
    };

    socket.on("room_status", (data) => {
      setJoined(true);
      setPeerCount(data.userCount || 1);
      updatePeerName(data.users);
      setIsAdmin(data.isAdmin || false);
      setVoiceAutoConfig({ autoVoice: Boolean(data.autoVoice), voiceMode: data.voiceMode || "waiting" });
    });

    socket.on("user_joined", (data) => {
      setPeerCount(data.userCount || 2);
      setSystemNotice(data.message);
      updatePeerName(data.users);
      setVoiceAutoConfig({ autoVoice: Boolean(data.autoVoice), voiceMode: data.voiceMode || "waiting" });
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
      cleanupWebRTC();
    });

    socket.on("admin_changed", (data) => {
      console.log(`[socket] Admin değişti: ${data.adminName} (${data.adminSocketId})`);
      setIsAdmin(data.adminSocketId === socket.id);
    });

    socket.on("room_full", (data) => {
      setLobbyError(data.message || "Bu oda dolu. Farklı bir kod deneyin.");
      setJoined(false);
      setRoomName("");
      saveSession(null);
    });

    socket.on("wrong_password", (data) => {
      setLobbyError(data.message || "Yanlış oda şifresi.");
    });

    socket.on("webrtc_signal_received", (data) => {
      if (!data.signal) return;
      const sigType = data.signal.type;
      console.log(`[WebRTC] Karşı taraftan sinyal alındı: ${sigType || (data.signal.candidate ? "candidate" : "unknown")}, mevcut peer: ${peerRef.current ? "var" : "yok"}`);

      if (sigType === "reset") {
        console.log("[WebRTC] Karşı taraf reset istedi, peer sıfırlanıyor...");
        destroyPeer();
        const currentInitiator = voiceAutoConfigRef.current.voiceMode === "initiator";
        initWebRTC(currentInitiator, null, cameraEnabledRef.current);
        return;
      }

      if (sigType === "offer") {
        console.log("[WebRTC] Offer alındı, yeniden bağlanılıyor...");
        destroyPeer();
        initWebRTC(false, data.signal);
      } else if (sigType === "answer") {
        const peer = peerRef.current;
        if (!peer) {
          console.log("[WebRTC] Answer geldi ama peer yok, yok sayılıyor");
          return;
        }
        try {
          console.log("[WebRTC] Answer işleniyor...");
          peer.signal(data.signal);
        } catch (err) {
          console.warn("[WebRTC] Answer işlenemedi:", err.message);
        }
      } else if (data.signal.candidate) {
        const peer = peerRef.current;
        if (peer && !peer.destroyed) {
          try { peer.signal(data.signal); } catch (_) {}
        }
      }
    });

    socket.on("video_action_received", (data) => {
      const video = videoRef.current;
      if (!video) return;
      isIncomingSignal.current = true;
      const latency = (Date.now() - (data.sentAt || Date.now())) / 1000;

      if (data.action === "play") {
        let t = data.currentTime + latency;
        if (video.duration && t > video.duration) t = video.duration;
        if (video.readyState < 3) {
          video.currentTime = t;
          video.addEventListener("canplay", () => {
            const ex = (Date.now() - data.sentAt) / 1000;
            let c = data.currentTime + ex;
            if (video.duration && c > video.duration) c = video.duration;
            video.currentTime = c;
            video.play().catch(() => {});
          }, { once: true });
        } else {
          video.currentTime = t;
          video.play().catch(() => {});
        }
      } else if (data.action === "pause") {
        video.currentTime = data.currentTime;
        video.pause();
      } else if (data.action === "seek") {
        let t = data.currentTime + latency;
        if (video.duration && t > video.duration) t = video.duration;
        video.currentTime = t;
      }

      triggerSyncFlash();
      setTimeout(() => { isIncomingSignal.current = false; }, 100);
    });

    socket.on("playback_sync_received", (data) => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      const latency = (Date.now() - (data.sentAt || Date.now())) / 1000;
      const peerRealTime = data.currentTime + latency;
      const diff = video.currentTime - peerRealTime;
      const abs = Math.abs(diff);
      setPeerTimeDiff(diff);
      if (abs > 1.5) {
        isIncomingSignal.current = true;
        video.currentTime = peerRealTime;
        video.playbackRate = 1.0;
        setTimeout(() => { isIncomingSignal.current = false; }, 100);
      } else if (abs > 0.20) {
        video.playbackRate = diff > 0 ? 0.95 : 1.05;
      } else if (abs < 0.05) {
        video.playbackRate = 1.0;
      }
    });

    socket.on("sync_response", (data) => {
      const video = videoRef.current;
      if (!video || !data || !video.src) return;
      const latency = (Date.now() - (data.sentAt || Date.now())) / 1000;
      let t = data.currentTime + latency;
      if (video.duration && t > video.duration) t = video.duration;
      isIncomingSignal.current = true;
      video.currentTime = t;
      if (!data.isPaused) video.play().catch(() => {});
      else video.pause();
      setTimeout(() => { isIncomingSignal.current = false; }, 100);
      triggerSyncFlash();
    });

    socket.on("file_info_received", (data) => {
      const currentMeta = videoFileMetaRef.current;
      if (!currentMeta) return;
      const nameMismatch = data.name !== currentMeta.name;
      const sizeMismatch = Math.abs(data.size - currentMeta.size) > 1024 * 100;
      const durMismatch = data.duration && currentMeta.duration && Math.abs(data.duration - currentMeta.duration) > 2;
      setFileMismatch(nameMismatch || sizeMismatch || durMismatch);
      if (nameMismatch || sizeMismatch || durMismatch)
        setSystemNotice("⚠️ Farklı video dosyası tespit edildi! Senkronizasyon hatalı olabilir.");
    });

    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
      if (!mobileChatOpenRef.current) setUnreadCount((prev) => prev + 1);
    });

    socket.on("reaction_received", (data) => spawnEmoji(data.emoji));
    socket.on("typing_received", () => setPeerIsTyping(true));
    socket.on("typing_stop_received", () => setPeerIsTyping(false));

    return () => {
      cleanupWebRTC();
      socket.disconnect();
      blobUrlsRef.current.forEach(u => revokeBlobUrl(u));
      blobUrlsRef.current = [];
      emojiTimeoutRefs.current.forEach(id => clearTimeout(id));
      emojiTimeoutRefs.current = [];
    };
  }, []);

  useEffect(() => { roomNameRef.current = roomName; }, [roomName]);
  useEffect(() => { videoFileMetaRef.current = videoFileMeta; }, [videoFileMeta]);
  useEffect(() => { myNameRef.current = myName; }, [myName]);
  useEffect(() => { mobileChatOpenRef.current = mobileChatOpen; }, [mobileChatOpen]);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
  useEffect(() => { voiceAutoConfigRef.current = voiceAutoConfig; }, [voiceAutoConfig]);
  useEffect(() => { cameraEnabledRef.current = cameraEnabled; }, [cameraEnabled]);

  useEffect(() => {
    if (isAuthenticated && joined && roomName && myName) saveSession({ roomName, myName });
    else saveSession(null);
  }, [isAuthenticated, joined, roomName, myName]);

  useEffect(() => {
    const el = chatEndRef.current?.parentElement;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
    if (!joined || !videoSrc || !isAdmin) return;
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
  }, [joined, videoSrc, roomName, isAdmin]);

  useEffect(() => {
    if (!videoSrc || !videoRef.current) return;
    const video = videoRef.current;
    const trackedIds = new Set();

    const setupTracks = () => {
      if (!video.textTracks) return;
      for (let i = 0; i < video.textTracks.length; i++) {
        const t = video.textTracks[i];
        if (trackedIds.has(t)) continue;
        if (t.kind === "subtitles" || t.kind === "captions" || t.kind === "metadata") {
          trackedIds.add(t);
          t.oncuechange = () => {
            if (t.activeCues && t.activeCues.length > 0) {
              const texts = [];
              for (let j = 0; j < t.activeCues.length; j++) {
                texts.push(t.activeCues[j].text.replace(/<[^>]+>/g, ""));
              }
              setActiveCueText(texts.join("\n"));
            } else {
              setActiveCueText("");
            }
          };
        }
      }
    };

    video.addEventListener("loadedmetadata", setupTracks);
    video.addEventListener("loadeddata", setupTracks);

    const retryInterval = setInterval(() => {
      if (video.textTracks && video.textTracks.length > 0) {
        setupTracks();
      }
    }, 500);

    const retryTimeout = setTimeout(() => {
      clearInterval(retryInterval);
      setupTracks();
    }, 10000);

    return () => {
      video.removeEventListener("loadedmetadata", setupTracks);
      video.removeEventListener("loadeddata", setupTracks);
      clearInterval(retryInterval);
      clearTimeout(retryTimeout);
      if (video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].oncuechange = null;
        }
      }
    };
  }, [videoSrc, subtitleSrc, subtitleTracks.length]);

  // Timeupdate tabanlı cue tracking (ffmpeg.wasm parsed cues için)
  useEffect(() => {
    if (!videoSrc || !videoRef.current || embeddedCues.length === 0) return;
    const video = videoRef.current;

    const handleTimeUpdate = () => {
      const text = getActiveCueText(embeddedCues, video.currentTime);
      if (text) {
        setActiveCueText(text);
      } else {
        setActiveCueText("");
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [videoSrc, embeddedCues]);

  useEffect(() => {
    if (!joined || micEnabled) return;
    const cfg = voiceAutoConfigRef.current;
    if (!cfg.autoVoice || voiceAutoStartedRef.current) return;
    voiceAutoStartedRef.current = true;
    initWebRTC(cfg.voiceMode === "initiator");
  }, [joined, micEnabled, voiceAutoConfig]);

  // ---------------------------------------------------------------
  // WEBRTC
  // ---------------------------------------------------------------
  const iceRetryTimeoutRef = useRef(null);

  const cleanupWebRTC = () => {
    console.log("[WebRTC] Temizleniyor...");
    if (iceRetryTimeoutRef.current) { clearTimeout(iceRetryTimeoutRef.current); iceRetryTimeoutRef.current = null; }
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    initWebRTCRef.current = false;
    setVoiceConnected(false);
    setMicEnabled(false);
    setCameraEnabled(false);
    setRemoteVideoStream(null);
    setLocalVideoStream(null);
    console.log("[WebRTC] Temizlendi.");
  };

  // remoteVideoStream değişince ref'e srcObject ata (inline callback yerine)
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    if (remoteVideoStream) {
      if (el.srcObject !== remoteVideoStream) {
        el.srcObject = remoteVideoStream;
      }
      el.play().catch((err) => {
        console.warn("[WebRTC] Remote video autoplay engellendi:", err.message);
      });
    } else {
      el.srcObject = null;
    }
  }, [remoteVideoStream]);

  // localVideoStream değişince ref'e srcObject ata
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (localVideoStream) {
      if (el.srcObject !== localVideoStream) {
        el.srcObject = localVideoStream;
      }
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [localVideoStream]);

  // streamRef'teki değişiklikleri localVideoStream'e aktar
  useEffect(() => {
    const stream = streamRef.current;
    if (stream && stream.getVideoTracks().length > 0 && cameraEnabled) {
      setLocalVideoStream(stream);
    } else {
      setLocalVideoStream(null);
    }
  }, [cameraEnabled, voiceConnected]);

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];

  const destroyPeer = () => {
    if (peerRef.current) {
      const oldPeer = peerRef.current;
      const oldGen = oldPeer._generation || "?";
      console.log(`[WebRTC] Peer yok ediliyor (generation: ${oldGen})...`);
      peerRef.current = null;
      oldPeer._destroying = true;
      try { oldPeer.destroy(); } catch (_) {}
    }
    if (iceRetryTimeoutRef.current) { clearTimeout(iceRetryTimeoutRef.current); iceRetryTimeoutRef.current = null; }
    initWebRTCRef.current = false;
  };

  const initWebRTC = (initiator, initialSignal = null, sendVideo = false, skipDestroy = false) => {
    if (!skipDestroy) {
      destroyPeer();
    }
    const generation = ++initWebRTCGenerationRef.current;
    initWebRTCRef.current = true;
    console.log(`[WebRTC] Başlatılıyor... initiator: ${initiator}, video: ${sendVideo}, signal: ${initialSignal?.type || 'yok'}, generation: ${generation}, skipDestroy: ${skipDestroy}`);

    const createPeer = (stream) => {
      if (!stream) {
        console.warn("[WebRTC] Stream yok, atlanıyor");
        initWebRTCRef.current = false;
        return;
      }
      if (generation !== initWebRTCGenerationRef.current) {
        console.warn(`[WebRTC] Generation eski (${generation} != ${initWebRTCGenerationRef.current}), atlanıyor`);
        return;
      }
      const peer = new Peer({
        initiator,
        trickle: true,
        stream,
        config: { iceServers },
      });
      peer._generation = generation;
      peer.on("signal", (data) => {
        if (peerRef.current !== peer || peer._destroying) return;
        console.log(`[WebRTC] Peer sinyal gönderdi: ${data.type} (generation: ${generation})`);
        socketRef.current.emit("webrtc_signal", { room: roomNameRef.current.trim(), signal: data });
      });
      peer.on("connect", () => {
        if (peerRef.current !== peer) return;
        console.log(`[WebRTC] Peer bağlandı! (generation: ${generation})`);
        setVoiceConnected(true);
        initWebRTCRef.current = false;
        if (iceRetryTimeoutRef.current) { clearTimeout(iceRetryTimeoutRef.current); iceRetryTimeoutRef.current = null; }
      });
      peer.on("stream", (remoteStream) => {
        if (peerRef.current !== peer) {
          console.warn(`[WebRTC] Stream eski peer'dan geldi, atlanıyor (generation: ${generation})`);
          return;
        }
        const audioCount = remoteStream.getAudioTracks().length;
        const videoCount = remoteStream.getVideoTracks().length;
        console.log(`[WebRTC] Remote stream: audio=${audioCount}, video=${videoCount} (generation: ${generation})`);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
        if (videoCount > 0) {
          console.log("[WebRTC] Remote video gösteriliyor...");
          setRemoteVideoStream(remoteStream);
        } else {
          console.log("[WebRTC] Aktif video track yok");
          setRemoteVideoStream(null);
        }
      });
      peer.on("error", (err) => {
        if (peer._destroying) {
          console.log(`[WebRTC] Destroy sonrası hata (beklenen): ${err.message} (generation: ${generation})`);
          return;
        }
        console.error(`[WebRTC] HATA (generation: ${generation}):`, err.message);
        if (peerRef.current === peer) {
          initWebRTCRef.current = false;
        }
      });
      peer.on("close", () => {
        if (peer._destroying) {
          console.log(`[WebRTC] Destroy sonrası kapanış (beklenen) (generation: ${generation})`);
          return;
        }
        console.log(`[WebRTC] Peer kapandı (generation: ${generation})`);
        if (peerRef.current === peer) {
          initWebRTCRef.current = false;
        }
      });
      if (initialSignal) peer.signal(initialSignal);
      peerRef.current = peer;

      if (initiator) {
        if (iceRetryTimeoutRef.current) { clearTimeout(iceRetryTimeoutRef.current); }
        iceRetryTimeoutRef.current = setTimeout(() => {
          if (generation !== initWebRTCGenerationRef.current) return;
          if (initWebRTCRef.current && peerRef.current && !peerRef.current.destroyed) {
            console.warn("[WebRTC] ICE toplanamadı, yeniden deneniyor...");
            initWebRTC(initiator, null, sendVideo);
          }
        }, 10000);
      }
    };

    if (streamRef.current) {
      if (sendVideo && !streamRef.current.getVideoTracks().length) {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then((videoStream) => {
            const videoTrack = videoStream.getVideoTracks()[0];
            if (videoTrack) streamRef.current.addTrack(videoTrack);
            createPeer(streamRef.current);
          })
          .catch(() => createPeer(streamRef.current));
      } else {
        createPeer(streamRef.current);
      }
    } else {
      navigator.mediaDevices.getUserMedia({ audio: true, video: sendVideo })
        .then((stream) => {
          console.log(`[WebRTC] Stream alındı. Audio: ${stream.getAudioTracks().length}, Video: ${stream.getVideoTracks().length}`);
          streamRef.current = stream;
          setMicEnabled(true);
          if (sendVideo) setCameraEnabled(true);
          createPeer(stream);
        })
        .catch((err) => {
          console.error("[WebRTC] getUserMedia hatası:", err.message);
          initWebRTCRef.current = false;
          setSystemNotice("Mikrofon/kamera erişimine izin vermeniz gerekiyor.");
        });
    }
  };

  const toggleMic = () => {
    if (micEnabled) {
      console.log("[WebRTC] Mikrofon kapatılıyor");
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      setMicEnabled(false);
    } else {
      console.log("[WebRTC] Mikrofon açılıyor");
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
        setMicEnabled(true);
      } else if (peerCount > 1 && !initWebRTCRef.current) {
        initWebRTC(true);
      } else if (peerCount <= 1) {
        setSystemNotice("Odadaki diğer kişi bekleniyor...");
      }
    }
  };

  const toggleCamera = async () => {
    if (cameraTogglingRef.current) {
      console.log("[WebRTC] Kamera toggle devam ediyor, atlanıyor");
      return;
    }
    cameraTogglingRef.current = true;

    try {
      if (cameraEnabled) {
        // Kamerayı kapat: track'i tamamen durdur
        console.log("[WebRTC] Kamera kapatılıyor...");
        if (streamRef.current) {
          streamRef.current.getVideoTracks().forEach(t => {
            t.stop();
            try { streamRef.current.removeTrack(t); } catch (_) {}
          });
        }
        setCameraEnabled(false);

        // Karşı tarafa reset sinyali gönder: her iki taraf peer'ı yeniden kursun
        if (peerCount > 1 && socketRef.current) {
          console.log("[WebRTC] Reset sinyali gönderiliyor (kamera kapatma)");
          socketRef.current.emit("webrtc_signal", {
            room: roomNameRef.current.trim(),
            signal: { type: "reset" }
          });
          const currentInitiator = voiceAutoConfigRef.current.voiceMode === "initiator";
          setTimeout(() => {
            destroyPeer();
            initWebRTC(currentInitiator, null, false);
          }, 150);
        }
      } else {
        // Kamerayı aç
        console.log("[WebRTC] Kamera açılıyor...");

        if (!streamRef.current) {
          // Hiç stream yok: ses + kamera
          const newStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          console.log("[WebRTC] Yeni stream alındı (ses+kamera)");
          streamRef.current = newStream;
          setMicEnabled(true);
          setCameraEnabled(true);
        } else {
          // Ses stream'i var: video track ekle
          const newVideoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newTrack = newVideoStream.getVideoTracks()[0];
          if (!newTrack) {
            console.warn("[WebRTC] Video track alınamadı");
            return;
          }
          console.log("[WebRTC] Yeni video track stream'e eklendi");
          streamRef.current.addTrack(newTrack);
          setCameraEnabled(true);
        }

        // Her iki tarafı reset sinyali ile yeniden bağla (video dahil)
        if (peerCount > 1 && socketRef.current) {
          console.log("[WebRTC] Reset sinyali gönderiliyor (kamera açma)");
          socketRef.current.emit("webrtc_signal", {
            room: roomNameRef.current.trim(),
            signal: { type: "reset" }
          });
          const currentInitiator = voiceAutoConfigRef.current.voiceMode === "initiator";
          setTimeout(() => {
            destroyPeer();
            initWebRTC(currentInitiator, null, true);
          }, 150);
        }
      }
    } catch (err) {
      console.error("[WebRTC] Kamera hatası:", err.message);
      setSystemNotice("Kamera erişimine izin vermeniz gerekiyor.");
      setCameraEnabled(false);
    } finally {
      cameraTogglingRef.current = false;
    }
  };

  // --- Klavye Kısayolları ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (!joined || !videoSrc || !isAdmin) return;
          const video = videoRef.current;
          if (video) {
            if (video.paused) video.play().catch(() => {});
            else video.pause();
          }
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleMic();
          break;
        case "c":
        case "C":
          e.preventDefault();
          if (subtitleTracks.length > 0) {
            setShowTrackSelector(prev => !prev);
          }
          break;
        case "Escape":
          if (mobileChatOpen) {
            e.preventDefault();
            setMobileChatOpen(false);
          }
          if (showShortcuts) setShowShortcuts(false);
          if (showSubtitleSettings) setShowSubtitleSettings(false);
          if (showTrackSelector) setShowTrackSelector(false);
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [joined, videoSrc, isAdmin, mobileChatOpen, showShortcuts, showSubtitleSettings, showTrackSelector, subtitleTracks.length, toggleMic, toggleFullscreen]);


  // ---------------------------------------------------------------
  // HELPERS
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
    const timeoutId = setTimeout(() => setFlyingEmojis((prev) => prev.filter((e) => e.id !== id)), 2200);
    emojiTimeoutRefs.current.push(timeoutId);
  }, []);

  // ---------------------------------------------------------------
  // ODA
  // ---------------------------------------------------------------
  const handleCreateRoom = () => {
    if (!myName.trim()) return;
    setLobbyError("");
    const code = String(Math.floor(10000 + Math.random() * 90000));
    setRoomName(code);
    socketRef.current.emit("join_room", { roomName: code, userName: myName.trim(), roomPassword: roomPassword.trim() });
  };

  const handleJoinRoom = () => {
    if (!roomName.trim() || !myName.trim()) return;
    setLobbyError("");
    socketRef.current.emit("join_room", { roomName: roomName.trim(), userName: myName.trim(), roomPassword: roomPassword.trim() });
  };

  const handleCopyCode = () => {
    if (!roomName) return;
    navigator.clipboard.writeText(roomName).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = (platform) => {
    const shareUrl = window.location.origin;
    const shareText = `SyncCinema ile aynı anda film izleyelim! Oda kodu: ${roomName}`;
    
    switch (platform) {
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText + "\n" + shareUrl)}`, "_blank");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank");
        break;
      case "telegram":
        window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, "_blank");
        break;
      case "copy":
        navigator.clipboard.writeText(shareText + "\n" + shareUrl).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
        break;
      default:
        break;
    }
    setShowShareMenu(false);
  };

  // ---------------------------------------------------------------
  // DOSYA
  // ---------------------------------------------------------------
  const formatVTTTimestamp = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  const extractEmbeddedSubtitlesOld = (file) => {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const buffer = e.target.result;
            const mp4 = MP4Box.createFile();
            const extractedTracks = [];
            const pendingTracks = new Set();

            mp4.onReady = (info) => {
              info.tracks.forEach((track) => {
                const isText = track.type === "text" ||
                  (track.codec && (
                    track.codec.includes("text") || track.codec.includes("subt") ||
                    track.codec.includes("stpp") || track.codec.includes("wvtt") ||
                    track.kind === "subtitles"
                  ));
                if (isText) {
                  extractedTracks.push({
                    id: track.id,
                    codec: track.codec,
                    language: track.language || "und",
                    name: track.name || "Altyazı",
                    vttContent: null,
                    allSamples: []
                  });
                  pendingTracks.add(track.id);
                  mp4.setExtractionOptions(track.id, null, { nbSamples: Infinity });
                }
              });

              if (pendingTracks.size === 0) {
                mp4.flush();
                resolve([]);
                return;
              }
            };

            mp4.onSamples = (trackId, user, samples) => {
              if (!pendingTracks.has(trackId)) return;

              const track = extractedTracks.find((t) => t.id === trackId);
              if (!track) return;

              track.allSamples.push(...samples);
            };

            mp4.onError = () => resolve([]);

            buffer.fileStart = 0;
            mp4.appendBuffer(buffer);
            mp4.flush();

            setTimeout(() => {
              extractedTracks.forEach((track) => {
                if (track.allSamples.length === 0) return;
                const decoder = new TextDecoder("utf-8");
                let vttContent = "WEBVTT\n\n";
                let idx = 0;
                track.allSamples.forEach((sample) => {
                  try {
                    const rawBytes = new Uint8Array(sample.data);
                    const text = decoder.decode(rawBytes).replace(/\0/g, "").trim();
                    if (!text) return;
                    const start = formatVTTTimestamp(sample.cts / sample.timescale);
                    const end = formatVTTTimestamp((sample.cts + sample.duration) / sample.timescale);
                    vttContent += `${++idx}\n${start} --> ${end}\n${text}\n\n`;
                  } catch (_) {}
                });
                track.vttContent = vttContent;
              });
              resolve(extractedTracks.filter((t) => t.vttContent));
            }, 200);
          } catch (err) {
            console.warn("Embedded altyazı çıkarma hatası:", err);
            resolve([]);
          }
        };
        reader.onerror = () => resolve([]);
        reader.readAsArrayBuffer(file);
      } catch { resolve([]); }
    });
  };

  const revokeBlobUrl = (url) => {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const trackBlobUrl = (url) => {
    if (url && url.startsWith("blob:")) {
      blobUrlsRef.current.push(url);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const oldUrl = videoSrc;
    const url = URL.createObjectURL(file);
    trackBlobUrl(url);
    setVideoSrc(url);
    setVideoFileName(file.name);
    setActiveCueText("");
    revokeBlobUrl(oldUrl);

    // Eski altyazı track'lerinin blob URL'lerini temizle (bellek sızıntısı engelleme)
    subtitleTracks.forEach(t => {
      if (t.vttBlobUrl) revokeBlobUrl(t.vttBlobUrl);
    });

    const tmpVideo = document.createElement("video");
    tmpVideo.preload = "metadata";
    tmpVideo.onloadedmetadata = () => {
      const meta = { name: file.name, size: file.size, duration: tmpVideo.duration };
      setVideoFileMeta(meta);
      if (socketRef.current) socketRef.current.emit("file_info", { room: roomName.trim(), ...meta });
    };
    tmpVideo.src = url;

    setSubtitleExtracting(true);
    setEmbeddedCues([]);
    setActiveEmbeddedTrack(null);
    try {
      const subs = await extractEmbeddedSubtitles(file, (progress) => {
        console.log(`[Subtitle] Çıkarma: %${progress}`);
      });
      const subsWithBlob = subs.map((t) => ({
        ...t,
        vttBlobUrl: t.vttContent
          ? URL.createObjectURL(new Blob([t.vttContent], { type: "text/vtt" }))
          : null,
        cues: parseVTT(t.vttContent),
      }));
      subsWithBlob.forEach(t => trackBlobUrl(t.vttBlobUrl));
      setSubtitleTracks(subsWithBlob);
      if (subsWithBlob.length > 0) {
        setActiveEmbeddedTrack(subsWithBlob[0].id);
        setEmbeddedCues(subsWithBlob[0].cues || []);
        setSystemNotice(`💬 ${subsWithBlob.length} altyazı track'i çıkarıldı.`);
      } else {
        setSystemNotice("ℹ️ Videoda gömülü altyazı bulunamadı. Altyazı dosyası (.srt/.vtt) ekleyebilirsiniz.");
      }
    } catch (err) {
      console.warn("[Subtitle] Çıkarma hatası, MP4Box fallback deneniyor:", err);
      try {
        const subs = await extractEmbeddedSubtitlesOld(file);
        const subsWithBlob = subs.map((t) => ({
          ...t,
          vttBlobUrl: t.vttContent
            ? URL.createObjectURL(new Blob([t.vttContent], { type: "text/vtt" }))
            : null,
          cues: parseVTT(t.vttContent),
        }));
        subsWithBlob.forEach(t => trackBlobUrl(t.vttBlobUrl));
        setSubtitleTracks(subsWithBlob);
        if (subsWithBlob.length > 0) {
          setActiveEmbeddedTrack(subsWithBlob[0].id);
          setEmbeddedCues(subsWithBlob[0].cues || []);
          setSystemNotice(`💬 ${subsWithBlob.length} altyazı track'i çıkarıldı (MP4Box).`);
        } else {
          setSystemNotice("ℹ️ Videoda gömülü altyazı bulunamadı. Altyazı dosyası (.srt/.vtt) ekleyebilirsiniz.");
        }
      } catch (fbErr) {
        console.error("[Subtitle] MP4Box fallback de başarısız:", fbErr);
        setSystemNotice("⚠️ Altyazı çıkarma başarısız oldu. Altyazı dosyası (.srt/.vtt) ile ekleyebilirsiniz.");
      }
    } finally {
      setSubtitleExtracting(false);
    }
  };

  const handleSubtitleSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.name.toLowerCase().endsWith('.srt')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        let text = ev.target.result;
        text = text.replace(/\{\\[^}]+\}/g, '');
        text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        const vttText = "WEBVTT\n\n" + text;
        const blob = new Blob([vttText], { type: 'text/vtt' });
        const oldSubSrc = subtitleSrc;
        const newUrl = URL.createObjectURL(blob);
        trackBlobUrl(newUrl);
        setSubtitleSrc(newUrl);
        setSubtitleName(file.name);
        revokeBlobUrl(oldSubSrc);
      };
      reader.readAsText(file);
    } else {
      const oldSubSrc = subtitleSrc;
      const newUrl = URL.createObjectURL(file);
      trackBlobUrl(newUrl);
      setSubtitleSrc(newUrl);
      setSubtitleName(file.name);
      revokeBlobUrl(oldSubSrc);
    }
  };

  // ---------------------------------------------------------------
  // VIDEO
  // ---------------------------------------------------------------
  const emitVideoAction = useCallback((action) => {
    if (isIncomingSignal.current || !isAdmin) return;
    const video = videoRef.current;
    if (!video || !socketRef.current) return;
    socketRef.current.emit("video_action", {
      room: roomName.trim(), action, currentTime: video.currentTime, sentAt: Date.now(),
    });
  }, [roomName, isAdmin]);

  const handlePlay = () => {
    if (!isAdmin) {
      const video = videoRef.current;
      if (video && !isIncomingSignal.current) {
        video.pause();
      }
      return;
    }
    emitVideoAction("play");
  };
  const handlePause = () => { if (!isAdmin) return; emitVideoAction("pause"); };
  const handleSeeked = () => { if (!isAdmin) return; emitVideoAction("seek"); };

  // ---------------------------------------------------------------
  // CHAT
  // ---------------------------------------------------------------
  const handleSendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const payload = { room: roomName.trim(), message: text, sender: myName.trim(), id: `${Date.now()}-${Math.random()}` };
    socketRef.current.emit("send_message", payload);
    setMessages((prev) => [...prev, payload]);
    setDraft("");
    socketRef.current.emit("typing_stop", { room: roomName.trim() });
  };

  const handleChatKeyDown = (e) => { if (e.key === "Enter") handleSendMessage(); };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    if (!typingTimerRef.current) {
      if (socketRef.current) socketRef.current.emit("typing", { room: roomName.trim(), sender: myName.trim() });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (socketRef.current) socketRef.current.emit("typing_stop", { room: roomName.trim() });
      typingTimerRef.current = null;
    }, 1500);
  };

  // ---------------------------------------------------------------
  // ODA TERK
  // ---------------------------------------------------------------
  const handleLeaveRoom = () => {
    if (!confirm("Odadan ayrılmak istediğine emin misin?")) return;
    cleanupWebRTC();
    if (socketRef.current) {
      socketRef.current.emit("leave_room", { room: roomName.trim() });
    }
    revokeBlobUrl(videoSrc);
    revokeBlobUrl(subtitleSrc);
    subtitleTracks.forEach(t => revokeBlobUrl(t.vttBlobUrl));
    blobUrlsRef.current.forEach(u => revokeBlobUrl(u));
    blobUrlsRef.current = [];
    emojiTimeoutRefs.current.forEach(id => clearTimeout(id));
    emojiTimeoutRefs.current = [];
    setJoined(false); setRoomName(""); setVideoSrc(null); setVideoFileName("");
    setVideoFileMeta(null); setMessages([]); setPeerCount(1); setPeerName("");
    setIsAdmin(false); setFileMismatch(false); setPeerTimeDiff(null);
    setActiveCueText(""); setSubtitleSrc(null); setSubtitleTracks([]);
    setEmbeddedCues([]); setActiveEmbeddedTrack(null); setSubtitleExtracting(false);
    setShowTrackSelector(false); setRoomPassword("");
    saveSession(null);
  };

  const handleReaction = (emoji) => {
    if (!socketRef.current) return;
    socketRef.current.emit("reaction", { room: roomName.trim(), emoji });
    spawnEmoji(emoji);
  };

  const voiceReady = peerCount > 1;

  const getSyncStatusColor = () => {
    if (peerTimeDiff === null) return "ok";
    const abs = Math.abs(peerTimeDiff);
    if (abs < 0.2) return "ok";
    if (abs < 1.5) return "warn";
    return "danger";
  };

  // =================================================================
  // ŞİFRE EKRANI
  // =================================================================
  if (!isAuthenticated) {
    return (
      <div className="lobby">
        {/* Theme toggle */}
        <button className="theme-toggle btn-toggle" onClick={toggleTheme} title="Karanlık / Aydınlık mod">
          <span className="icon-moon"><MoonIcon /></span>
          <span className="icon-sun"><SunIcon /></span>
        </button>

        <div className="lobby-card" style={{ textAlign: "center" }}>
          <h1 className="lobby-brand" style={{ justifyContent: "center", marginBottom: "12px" }}>
            SYNC<span>CİNEMA</span>
          </h1>
          <p className="lobby-tagline">Sistem şu an kapalı betadadır.</p>
          <label className="field-label">Giriş Şifresi</label>
          <input
            type="password"
            className="field-input"
            placeholder="Şifreyi giriniz"
            value={authPass}
            onChange={(e) => setAuthPass(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && authPass === (import.meta.env.VITE_AUTH_PASS || "12345")) setIsAuthenticated(true); }}
          />
          <button
            className="enter-btn"
            onClick={() => {
              if (authPass === (import.meta.env.VITE_AUTH_PASS || "12345")) setIsAuthenticated(true);
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
  // LOBİ
  // =================================================================
  if (!joined) {
    return (
      <div className="lobby">
        {/* Theme toggle */}
        <button className="theme-toggle btn-toggle" onClick={toggleTheme} title="Karanlık / Aydınlık mod">
          <span className="icon-moon"><MoonIcon /></span>
          <span className="icon-sun"><SunIcon /></span>
        </button>

        <div className="lobby-card">
          <h1 className="lobby-brand">
            SYNC<span>CİNEMA</span>
          </h1>
          <p className="lobby-tagline">
            Aynı filmi, aynı anda, farklı şehirlerde izleyin.
            Video hiçbir yere yüklenmez — sadece oynatma sinyalleri senkronize edilir.
          </p>

          <label className="field-label">Senin Adın</label>
          <input
            className="field-input"
            placeholder="örn. Mustafa"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && myName.trim() && handleCreateRoom()}
          />

          <div className="lobby-actions">
            <button
              className="lobby-btn primary"
              disabled={!connected || !myName.trim()}
              onClick={handleCreateRoom}
            >
              <VideoIcon />
              Oda Oluştur
            </button>
            <button
              className="lobby-btn secondary"
              disabled={!connected || !myName.trim()}
              onClick={() => { setLobbyMode("join"); setRoomName(""); setLobbyError(""); }}
            >
              <KeyIcon />
              Odaya Katıl
            </button>
          </div>

          <div className="lobby-password-section">
            <label className="field-label">Oda Şifresi (Opsiyonel)</label>
            <input
              className="field-input"
              type="password"
              placeholder="Şifre belirle veya boş bırak"
              value={roomPassword}
              onChange={(e) => setRoomPassword(e.target.value)}
            />
          </div>

          {lobbyMode === "join" && (
            <div className="lobby-join-section">
              <label className="field-label" style={{ marginTop: "4px" }}>5 Haneli Oda Kodu</label>
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
              <label className="field-label">Oda Şifresi (Varsa)</label>
              <input
                className="field-input"
                type="password"
                placeholder="Şifre varsa giriniz"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
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

          {lobbyError && <div className="lobby-error">⚠️ {lobbyError}</div>}

          <div className="conn-note">
            <span className={`dot ${connected ? "online" : "offline"}`} />
            {connected ? "Sunucuya bağlı" : "Sunucuya bağlanılıyor..."}
          </div>
        </div>
      </div>
    );
  }

  // =================================================================
  // ANA UYGULAMA
  // =================================================================
  return (
    <div className="app-shell">
      <audio ref={remoteAudioRef} autoPlay />

      {/* Klavye Kısayolları Modal */}
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-header">
              <h3>Klavye Kısayolları</h3>
              <button className="shortcuts-close" onClick={() => setShowShortcuts(false)}>✕</button>
            </div>
            <div className="shortcuts-list">
              <div className="shortcut-item"><kbd>Space</kbd><span>Oynat / Duraklat</span></div>
              <div className="shortcut-item"><kbd>F</kbd><span>Tam Ekran</span></div>
              <div className="shortcut-item"><kbd>M</kbd><span>Mikrofon Aç/Kapat</span></div>
              <div className="shortcut-item"><kbd>C</kbd><span>Altyazı Dil Seç</span></div>
              <div className="shortcut-item"><kbd>Esc</kbd><span>Panelleri Kapat</span></div>
              <div className="shortcut-item"><kbd>?</kbd><span>Bu Listeyi Göster</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Chat Toggle */}
      <button
        className="chat-toggle-btn"
        onClick={() => { setMobileChatOpen(!mobileChatOpen); setUnreadCount(0); }}
      >
        {mobileChatOpen ? "✕" : <ChatToggleIcon />}
        {!mobileChatOpen && unreadCount > 0 && (
          <span className="chat-toggle-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {/* ====== HEADER ====== */}
      <header className="topbar">
        {/* Logo */}
        <div className="topbar-brand">
          SYNC<span>CİNEMA</span>
        </div>

        {/* Center: oda kodu + kopyala + admin */}
        <div className="header-mid">
          <div className="room-share-container">
            <span className="room-label">ODA KODU</span>
            <span className="room-code-display">{roomName}</span>
          </div>
          <button className={`btn-ghost copy-btn ${copied ? "copied" : ""}`} onClick={handleCopyCode}>
            <CopyIcon />
            {copied ? "Kopyalandı" : "Kopyala"}
          </button>
          <div className="share-dropdown-container">
            <button className="btn-ghost share-btn" onClick={() => setShowShareMenu(!showShareMenu)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Paylaş
            </button>
            {showShareMenu && (
              <div className="share-dropdown">
                <button onClick={() => handleShare("whatsapp")}>📱 WhatsApp</button>
                <button onClick={() => handleShare("twitter")}>🐦 Twitter / X</button>
                <button onClick={() => handleShare("telegram")}>✈️ Telegram</button>
                <button onClick={() => handleShare("copy")}>📋 Linki Kopyala</button>
              </div>
            )}
          </div>
          {isAdmin && <div className="admin-badge">ADMİN</div>}
        </div>

        {/* Right: status + ses aç + toggle + çık */}
        <div className="header-right">
          <div className="presence">
            <span className="dot-pulse" />
            {peerCount > 1 ? `${peerName || "Karşı taraf"} odada` : "Karşı taraf bekleniyor..."}
          </div>

          <button
            className={`btn-ghost mic-btn ${micEnabled ? "active" : ""}`}
            onClick={toggleMic}
            disabled={!voiceReady}
            title={!voiceReady ? "Sesli sohbet için önce videoyu aç ve karşı tarafı bekle" : ""}
          >
            <MicIcon />
            {micEnabled ? "Sesi Kapat" : "Sesi Aç"}
          </button>

          <button
            className={`btn-ghost mic-btn ${cameraEnabled ? "active" : ""}`}
            onClick={toggleCamera}
            disabled={!voiceReady}
            title={!voiceReady ? "Görüntülü sohbet için önce videoyu aç ve karşı tarafı bekle" : ""}
          >
            <CameraIcon />
            {cameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
          </button>

          <button className="btn-toggle topbar-theme-toggle" onClick={toggleFullscreen} title="Tam Ekran">
            <FullscreenIcon isFullscreen={isFullscreen} />
          </button>

          <button className="btn-toggle topbar-theme-toggle" onClick={toggleTheme} title="Karanlık / Aydınlık mod">
            <span className="icon-moon"><MoonIcon /></span>
            <span className="icon-sun"><SunIcon /></span>
          </button>

          <button className="btn-exit leave-btn" onClick={handleLeaveRoom}>
            Çık
          </button>
        </div>

        {/* Filmstrip sprockets — header altında */}
        <div className="sprockets" />
      </header>

      {/* ====== MAIN LAYOUT ====== */}
      <div className="main-layout">

        {/* ====== STAGE (video) ====== */}
        <div className={`video-pane ${videoSrc ? "has-video" : ""}`}>
          {fileMismatch && (
            <div className="file-mismatch-banner">
              ⚠️ Farklı video dosyası! Senkronizasyon çalışmayabilir.
            </div>
          )}

          {!videoSrc ? (
            <div className="picker-zone">
              <div className="picker-card">
                {/* Clapper SVG — birebir mockup */}
                <div className="clapper-wrap">
                  <ClapperIcon />
                </div>

                <h2 className="picker-card-title">İzlemek istediğin videoyu seç</h2>
                <p className="picker-card-desc">
                  Karşı tarafın diskinde de aynı dosya olmalı — SyncCinema videoyu göndermez, sadece zamanlamayı eşitler.
                </p>

                {/* Gizli file inputs */}
                <input ref={videoFileInputRef} type="file" accept="video/*" onChange={handleFileSelect} style={{ display: "none" }} />
                <button className="btn-primary picker-btn" onClick={() => videoFileInputRef.current?.click()}>
                  Video Seç
                </button>

                <div className="picker-divider">opsiyonel</div>

                <input ref={subtitleFileInputRef} type="file" accept=".srt,.vtt,.sub" onChange={handleSubtitleSelect} style={{ display: "none" }} />
                <button className="btn-secondary picker-btn-ghost" onClick={() => subtitleFileInputRef.current?.click()}>
                  Altyazı Seç (SRT, VTT)
                </button>

                {subtitleName && (
                  <div style={{ marginTop: 12, textAlign: "center" }}>
                    <span className="subtitle-loaded-chip">✓ {subtitleName}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeeked}
                style={{
                  "--sub-font-size": subtitleSettings.fontSize + "px",
                  "--sub-top": subtitleSettings.top + "%",
                  "--sub-left": subtitleSettings.left + "%",
                  "--sub-bg-opacity": subtitleSettings.bgOpacity / 100,
                  "--sub-color": subtitleSettings.color
                }}
              >
                {subtitleSrc && <track src={subtitleSrc} kind="subtitles" srcLang="tr" label="Türkçe" default />}
                {subtitleTracks.map((track, idx) => (
                  track.vttBlobUrl && (
                    <track key={track.id} kind="subtitles" srcLang={track.language} label={track.name || track.language} src={track.vttBlobUrl} {...((!subtitleSrc && idx === 0) ? { default: true } : {})} />
                  )
                ))}
              </video>

              {/* Subtitle extraction loading */}
              {subtitleExtracting && (
                <div className="subtitle-loading">
                  <div className="subtitle-loading-spinner"></div>
                  <span>Altyazı hazırlanıyor...</span>
                </div>
              )}

              {/* Custom subtitle overlay */}
              {activeCueText && (
                <div
                  className="custom-subtitle-overlay"
                  style={{
                    "--sub-font-size": subtitleSettings.fontSize + "px",
                    "--sub-top": subtitleSettings.top + "%",
                    "--sub-bg-opacity": subtitleSettings.bgOpacity / 100,
                    "--sub-color": subtitleSettings.color
                  }}
                >
                  {activeCueText}
                </div>
              )}

              {!isAdmin && peerCount > 1 && (
                <div className="admin-only-banner">⚠️ Sadece oda sahibi videoyu kontrol edebilir</div>
              )}

              {(subtitleSrc || subtitleTracks.length > 0) && (
                <div className="subtitle-indicator">
                  💬 Altyazı
                  {subtitleTracks.length > 1 && (
                    <button className="subtitle-settings-btn" onClick={() => setShowTrackSelector(!showTrackSelector)}>🌍</button>
                  )}
                  <button className="subtitle-settings-btn" onClick={() => setShowSubtitleSettings(!showSubtitleSettings)}>⚙️</button>
                </div>
              )}

              {showTrackSelector && subtitleTracks.length > 1 && (
                <div className="subtitle-settings-panel" style={{ right: 100 }}>
                  <div className="subtitle-settings-title">Dil Seç</div>
                  {subtitleTracks.map((track) => (
                    <button
                      key={track.id}
                      className={`subtitle-track-btn ${activeEmbeddedTrack === track.id ? "active" : ""}`}
                      onClick={() => {
                        setActiveEmbeddedTrack(track.id);
                        const selected = subtitleTracks.find(t => t.id === track.id);
                        if (selected && selected.cues) {
                          setEmbeddedCues(selected.cues);
                        }
                        setShowTrackSelector(false);
                      }}
                    >
                      {track.name || track.language}
                      {activeEmbeddedTrack === track.id && " ✓"}
                    </button>
                  ))}
                </div>
              )}

              {showSubtitleSettings && (
                <div className="subtitle-settings-panel">
                  <div className="subtitle-settings-title">Altyazı Ayarları</div>
                  <div className="subtitle-setting">
                    <label>Boyut: {subtitleSettings.fontSize}px</label>
                    <input type="range" min="12" max="36" value={subtitleSettings.fontSize}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, fontSize: Number(e.target.value) })} />
                  </div>
                  <div className="subtitle-setting">
                    <label>Dikey Konum: %{subtitleSettings.top}</label>
                    <input type="range" min="5" max="80" value={subtitleSettings.top}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, top: Number(e.target.value) })} />
                  </div>
                  <div className="subtitle-setting">
                    <label>Yatay Konum: %{subtitleSettings.left}</label>
                    <input type="range" min="0" max="50" value={subtitleSettings.left}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, left: Number(e.target.value) })} />
                  </div>
                  <div className="subtitle-setting">
                    <label>Arka Plan: %{subtitleSettings.bgOpacity}</label>
                    <input type="range" min="0" max="100" value={subtitleSettings.bgOpacity}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, bgOpacity: Number(e.target.value) })} />
                  </div>
                  <div className="subtitle-setting">
                    <label>Renk:</label>
                    <input type="color" value={subtitleSettings.color}
                      onChange={(e) => setSubtitleSettings({ ...subtitleSettings, color: e.target.value })} />
                  </div>
                </div>
              )}

              <div className={`sync-flash ${showSyncFlash ? "show" : ""}`}>
                <span className="pulse-dot" />
                Senkronize edildi
              </div>

              {flyingEmojis.map((e) => (
                <div key={e.id} className="flying-emoji" style={{ left: `${e.x}%` }}>{e.emoji}</div>
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

        {/* ====== SIDEBAR (SOHBET) ====== */}
        <div className={`chat-pane ${mobileChatOpen ? "mobile-open" : ""}`}>
          {/* Header */}
          <div className="chat-header">
            <h3 className="chat-header-title">SOHBET</h3>
            <span className="chat-online-badge">{peerCount} çevrimiçi</span>
          </div>

          {/* Video Chat Area */}
          {peerCount > 1 && (
            <div className="video-chat-area">
              <div className="video-chat-circles">
                {/* Local video */}
                <div className={`video-circle local ${cameraEnabled && localVideoStream ? "has-stream" : ""}`}>
                  {cameraEnabled && localVideoStream ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted={true}
                    />
                  ) : (
                    <div className="video-circle-placeholder">
                      <span className="video-circle-initial">{myName ? myName[0].toUpperCase() : "?"}</span>
                    </div>
                  )}
                  <span className="video-circle-label">{myName || "Sen"}</span>
                </div>
                {/* Remote video */}
                <div className={`video-circle remote ${remoteVideoStream ? "has-stream" : ""}`}>
                  {remoteVideoStream ? (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      muted={false}
                    />
                  ) : (
                    <div className="video-circle-placeholder">
                      <span className="video-circle-initial">{peerName ? peerName[0].toUpperCase() : "?"}</span>
                    </div>
                  )}
                  <span className="video-circle-label">{peerName || "Karşı Taraf"}</span>
                </div>
              </div>
            </div>
          )}

          {/* Reactions */}
          {videoSrc && (
            <div className="reaction-btn-bar">
              {REACTIONS.map((emoji) => (
                <button key={emoji} className="reaction-btn" onClick={() => handleReaction(emoji)}>{emoji}</button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="chat-messages">
            {systemNotice && <div className="system-msg">{systemNotice}</div>}

            {messages.length === 0 && !systemNotice ? (
              <div className="chat-empty-state">
                <div className="chat-empty-icon"><ChatBubbleIcon /></div>
                <span className="chat-empty-text">
                  Henüz mesaj yok.<br />
                  Karşı taraf katılınca sohbet burada akacak.
                </span>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender === myName.trim();
                return (
                  <div key={m.id || `${m.sender}-${m.message}`} className={`bubble-row ${isMe ? "me" : "them"}`}>
                    {!isMe && <span className="bubble-sender">{m.sender}</span>}
                    <div className="bubble">{m.message}</div>
                  </div>
                );
              })
            )}

            {peerIsTyping && (
              <div className="typing-indicator">
                <span className="typing-name">{peerName || "Karşı taraf"}</span> yazıyor
                <span className="typing-dots"><span /><span /><span /></span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-row">
            <input
              placeholder="Mesaj yaz..."
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleChatKeyDown}
            />
            <button className="chat-send-btn" onClick={handleSendMessage}>
              <SendIcon />
            </button>
          </div>

          {/* Reklam Alanı Yer Tutucu */}
          <div className="ad-placeholder">
            <span>Reklam Alanı</span>
          </div>
        </div>
      </div>
    </div>
  );
}
