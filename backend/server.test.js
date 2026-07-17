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

  function waitForEvent(socket, event, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
      socket.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
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
      s1.emit("join_room", { roomName: "leave-test-1", userName: "A" });
      setTimeout(() => s2.emit("join_room", { roomName: "leave-test-1", userName: "B" }), 50);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("user_left", (data) => {
      expect(data.userCount).toBe(1);
      done();
    });
    setTimeout(() => s1.disconnect(), 300);
  });

  test("şifreli oda - doğru şifre ile katılınır", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "pwd-test", userName: "A", roomPassword: "secret123" });
      setTimeout(() => {
        s2.emit("join_room", { roomName: "pwd-test", userName: "B", roomPassword: "secret123" });
      }, 100);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("room_status", (data) => {
      expect(data.userCount).toBe(2);
      expect(data.hasPassword).toBe(true);
      done();
    });
  });

  test("şifreli oda - yanlış şifre ile reddedilir", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "pwd-wrong-test", userName: "A", roomPassword: "secret123" });
      setTimeout(() => {
        s2.emit("join_room", { roomName: "pwd-wrong-test", userName: "B", roomPassword: "wrongpassword" });
      }, 100);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("wrong_password", (data) => {
      expect(data.message).toContain("şifre");
      done();
    });
  });

  test("şifresiz oda - herkes katılabilir", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "no-pwd-test", userName: "A" });
      setTimeout(() => {
        s2.emit("join_room", { roomName: "no-pwd-test", userName: "B" });
      }, 100);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("room_status", (data) => {
      expect(data.userCount).toBe(2);
      expect(data.hasPassword).toBe(false);
      done();
    });
  });

  test("admin değiştirme - admin ayrılınca diğer kullanıcıya geçer", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "admin-test-1", userName: "A" });
      setTimeout(() => s2.emit("join_room", { roomName: "admin-test-1", userName: "B" }), 50);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s2.on("admin_changed", (data) => {
      expect(data.adminName).toBe("B");
      done();
    });
    setTimeout(() => s1.disconnect(), 300);
  });

  test("rate limiting - çok fazla mesaj gönderilince engellenir", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 2) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "rate-test-1", userName: "A" });
      setTimeout(() => s2.emit("join_room", { roomName: "rate-test-1", userName: "B" }), 50);
    };
    s1.on("connect", check);
    s2.on("connect", check);

    let messageCount = 0;
    s2.on("receive_message", () => { messageCount++; });

    s2.on("room_status", () => {
      // 20 mesaj gönder (limit 15)
      for (let i = 0; i < 20; i++) {
        s1.emit("send_message", { room: "rate-test-1", message: `msg-${i}`, sender: "A" });
      }
      setTimeout(() => {
        expect(messageCount).toBeLessThanOrEqual(15);
        done();
      }, 200);
    });
  });

  test("odada maksimum 2 kişi bulunabilir", (done) => {
    const s1 = createClient();
    const s2 = createClient();
    const s3 = createClient();
    let ready = 0;
    const check = () => { if (++ready === 3) join(); };
    const join = () => {
      s1.emit("join_room", { roomName: "capacity-test-1", userName: "A" });
      setTimeout(() => {
        s2.emit("join_room", { roomName: "capacity-test-1", userName: "B" });
      }, 50);
      setTimeout(() => {
        s3.emit("join_room", { roomName: "capacity-test-1", userName: "C" });
      }, 100);
    };
    s1.on("connect", check);
    s2.on("connect", check);
    s3.on("connect", check);
    s3.on("room_full", (data) => {
      expect(data.message).toContain("dolu");
      done();
    });
  });
});
