const { createServer } = require("./createServer");
const { io: Client } = require("socket.io-client");

describe("SyncCinema Backend Tests", () => {
  let io, httpServer;
  let sockets = [];
  let port;

  beforeAll((done) => {
    const serverInstance = createServer();
    httpServer = serverInstance.httpServer;
    io = serverInstance.io;
    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  afterEach(() => {
    sockets.forEach((s) => { if (s && s.connected) s.disconnect(); });
    sockets = [];
  });

  function createClient() {
    const socket = Client(`http://localhost:${port}`);
    sockets.push(socket);
    return socket;
  }

  test("video_action karşı tarafa iletilir", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "video-test", userName: "A" });
      setTimeout(() => {
        s2.emit("join_room", { roomName: "video-test", userName: "B" });
      }, 50);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    let s2InRoom = false;
    s2.on("room_status", (data) => {
      s2InRoom = true;
      setTimeout(() => {
        s1.emit("video_action", { room: "video-test", action: "play", currentTime: 10 });
      }, 100);
    });
    s2.on("video_action_received", (data) => {
      expect(data.action).toBe("play");
      expect(data.currentTime).toBe(10);
      done();
    });
  });

  test("mesaj karşı tarafa iletilir", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "chat-test", userName: "A" });
      setTimeout(() => s2.emit("join_room", { roomName: "chat-test", userName: "B" }), 50);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("receive_message", (data) => {
      expect(data.message).toBe("Merhaba!");
      done();
    });
    setTimeout(() => {
      s1.emit("send_message", { room: "chat-test", message: "Merhaba!", sender: "A" });
    }, 300);
  });

  test("webrtc_signal karşı tarafa iletilir", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "webrtc-test", userName: "A" });
      setTimeout(() => s2.emit("join_room", { roomName: "webrtc-test", userName: "B" }), 50);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("webrtc_signal_received", (data) => {
      expect(data.signal).toEqual({ type: "offer", sdp: "test" });
      done();
    });
    setTimeout(() => {
      s1.emit("webrtc_signal", { room: "webrtc-test", signal: { type: "offer", sdp: "test" } });
    }, 300);
  });

  test("kullanıcı ayrılınca user_left bildirimi gider", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "leave-test", userName: "A" });
      setTimeout(() => s2.emit("join_room", { roomName: "leave-test", userName: "B" }), 50);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("user_left", (data) => {
      expect(data.userCount).toBe(1);
      done();
    });
    setTimeout(() => s1.disconnect(), 300);
  });
});
