const { createServer } = require("./createServer");
const { io: Client } = require("socket.io-client");

describe("SyncCinema Backend Socket.IO Tests", () => {
  let io, httpServer, app;
  let clientSocket1, clientSocket2, clientSocket3;
  let port;

  beforeAll((done) => {
    const serverInstance = createServer();
    httpServer = serverInstance.httpServer;
    io = serverInstance.io;
    app = serverInstance.app;

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
    if (clientSocket1) clientSocket1.disconnect();
    if (clientSocket2) clientSocket2.disconnect();
    if (clientSocket3) clientSocket3.disconnect();
  });

  test("should allow 2 users to join a room and limit the 3rd user", (done) => {
    clientSocket1 = Client(`http://localhost:${port}`);
    
    clientSocket1.on("connect", () => {
      clientSocket1.emit("join_room", { roomName: "test-room", userName: "User1" });
      
      clientSocket1.on("room_status", (data) => {
        expect(data.room).toBe("test-room");
        expect(data.userCount).toBe(1);
        expect(data.voiceMode).toBe("waiting");
        expect(data.autoVoice).toBe(false);
        
        // Connect second client
        clientSocket2 = Client(`http://localhost:${port}`);
        clientSocket2.on("connect", () => {
          clientSocket2.emit("join_room", { roomName: "test-room", userName: "User2" });
          
          clientSocket2.on("room_status", (data2) => {
            expect(data2.userCount).toBe(2);
            expect(data2.voiceMode).toBe("receiver");
            expect(data2.autoVoice).toBe(true);

            clientSocket1.on("user_joined", (joinedData) => {
              expect(joinedData.userCount).toBe(2);
              expect(joinedData.voiceMode).toBe("initiator");
              expect(joinedData.autoVoice).toBe(true);
            });
            
            // Connect third client (should be rejected)
            clientSocket3 = Client(`http://localhost:${port}`);
            clientSocket3.on("connect", () => {
              clientSocket3.emit("join_room", { roomName: "test-room", userName: "User3" });
              
              clientSocket3.on("room_full", (msg) => {
                expect(msg.message).toContain("dolu");
                done();
              });
            });
          });
        });
      });
    });
  });

  test("should relay video_action to other users in the room", (done) => {
    clientSocket1 = Client(`http://localhost:${port}`);
    clientSocket2 = Client(`http://localhost:${port}`);
    
    let connections = 0;
    const checkReady = () => {
      connections++;
      if (connections === 2) {
        clientSocket1.emit("join_room", { roomName: "video-room", userName: "User1" });
        setTimeout(() => {
          clientSocket2.emit("join_room", { roomName: "video-room", userName: "User2" });
        }, 50);
      }
    };
    
    clientSocket1.on("connect", checkReady);
    clientSocket2.on("connect", checkReady);
    
    clientSocket2.on("video_action_received", (data) => {
      expect(data.room).toBe("video-room");
      expect(data.action).toBe("play");
      expect(data.currentTime).toBe(10);
      done();
    });
    
    // Wait for joins to process
    setTimeout(() => {
      clientSocket1.emit("video_action", { room: "video-room", action: "play", currentTime: 10 });
    }, 200);
  });

  test("should relay webrtc_signal to other users in the room", (done) => {
    clientSocket1 = Client(`http://localhost:${port}`);
    clientSocket2 = Client(`http://localhost:${port}`);
    
    let connections = 0;
    const checkReady = () => {
      connections++;
      if (connections === 2) {
        clientSocket1.emit("join_room", { roomName: "webrtc-room", userName: "User1" });
        setTimeout(() => {
          clientSocket2.emit("join_room", { roomName: "webrtc-room", userName: "User2" });
        }, 50);
      }
    };
    
    clientSocket1.on("connect", checkReady);
    clientSocket2.on("connect", checkReady);
    
    clientSocket2.on("webrtc_signal_received", (data) => {
      expect(data.room).toBe("webrtc-room");
      expect(data.signal).toEqual({ type: 'offer', sdp: 'fake-sdp' });
      done();
    });
    
    // Wait for joins to process
    setTimeout(() => {
      clientSocket1.emit("webrtc_signal", { room: "webrtc-room", signal: { type: 'offer', sdp: 'fake-sdp' } });
    }, 200);
  });
});
