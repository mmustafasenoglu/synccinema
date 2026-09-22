const request = require("supertest");
const { io: Client } = require("socket.io-client");
const { createServer } = require("./createServer");

describe("site authentication and TURN credentials", () => {
  let originalPassword;
  let originalTurnToken;
  let originalKeyId;
  let server;
  let address;

  beforeAll(async () => {
    originalPassword = process.env.SITE_PASSWORD;
    originalTurnToken = process.env.CLOUDFLARE_TURN_TOKEN;
    originalKeyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    process.env.SITE_PASSWORD = "test-secret";
    process.env.CLOUDFLARE_TURN_TOKEN = "test-turn-token";
    process.env.CLOUDFLARE_TURN_KEY_ID = "test-key-id";
    server = createServer();
    await new Promise(resolve => server.httpServer.listen(0, resolve));
    address = `http://localhost:${server.httpServer.address().port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.io.close(resolve));
    for (const [name, value] of [
      ["SITE_PASSWORD", originalPassword],
      ["CLOUDFLARE_TURN_TOKEN", originalTurnToken],
      ["CLOUDFLARE_TURN_KEY_ID", originalKeyId],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  async function login() {
    const response = await request(server.app).post("/api/auth").send({ password: "test-secret" });
    expect(response.status).toBe(200);
    return response.body.token;
  }

  test("wrong password cannot obtain a token", async () => {
    expect((await request(server.app).get("/api/auth/status")).body).toEqual({ required: true, authenticated: false });
    expect((await request(server.app).post("/api/auth").send({ password: "wrong" })).status).toBe(401);
  });

  test("Socket.IO rejects anonymous users and accepts a valid login", async () => {
    const anonymous = Client(address, { reconnection: false });
    const error = await new Promise(resolve => anonymous.once("connect_error", resolve));
    expect(error.message).toBe("unauthorized");
    anonymous.disconnect();

    const token = await login();
    const authenticated = Client(address, { auth: { siteToken: token }, reconnection: false });
    await new Promise((resolve, reject) => {
      authenticated.once("connect", resolve);
      authenticated.once("connect_error", reject);
    });
    authenticated.disconnect();
  });

  test("TURN endpoint requires authentication and forwards Cloudflare ICE servers", async () => {
    expect((await request(server.app).get("/api/turn-credentials")).status).toBe(401);
    const token = await login();
    const iceServers = [{ urls: "turn:turn.cloudflare.com:3478", username: "u", credential: "c" }];
    const provider = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ iceServers }),
    });
    try {
      const response = await request(server.app)
        .get("/api/turn-credentials")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.iceServers).toEqual(iceServers);
      expect(provider).toHaveBeenCalledWith(
        expect.stringContaining("/test-key-id/credentials/generate-ice-servers"),
        expect.objectContaining({ method: "POST", body: JSON.stringify({ ttl: 86400 }) })
      );
    } finally {
      provider.mockRestore();
    }
  });

  test("repeated incorrect passwords are rate limited", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await request(server.app).post("/api/auth").send({ password: "wrong" })).status).toBe(401);
    }
    expect((await request(server.app).post("/api/auth").send({ password: "wrong" })).status).toBe(429);
  });
});
