import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const MAX_MESSAGE = 5 * 1024 * 1024;
const MAX_ROOMS = 200;
const MAX_SOCKETS = 50;
const IDLE_MS = 60 * 60 * 1000;
const ROOM_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function startRelay({ host = "127.0.0.1", port = 5192 } = {}) {
  const rooms = new Map();
  const server = createServer((req, res) => {
    const ok = req.method === "GET" && req.url === "/health";
    res.writeHead(ok ? 200 : 404, { "content-type": "text/plain" });
    res.end(ok ? "ok" : "not found");
  });
  const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE });

  wss.on("connection", (socket) => {
    let room = null;
    socket.on("message", (raw, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.close(1003, "bad message");
        return;
      }
      if (!room) {
        if (msg.t !== "join" || typeof msg.room !== "string" || !ROOM_ID.test(msg.room)) return;
        room = rooms.get(msg.room);
        if (!room) {
          if (rooms.size >= MAX_ROOMS) return socket.close(1013, "too many rooms");
          room = { sockets: new Set(), snapshot: null, at: Date.now() };
          rooms.set(msg.room, room);
        }
        if (room.sockets.size >= MAX_SOCKETS) {
          room = null;
          return socket.close(1013, "room full");
        }
        room.sockets.add(socket);
        room.at = Date.now();
        if (room.snapshot) socket.send(JSON.stringify({ t: "msg", d: room.snapshot }));
        return;
      }
      if (typeof msg.d !== "string") return;
      room.at = Date.now();
      if (msg.t === "snap") room.snapshot = msg.d;
      if (msg.t !== "msg") return;
      const out = JSON.stringify({ t: "msg", d: msg.d });
      for (const peer of room.sockets) if (peer !== socket && peer.readyState === peer.OPEN) peer.send(out);
    });
    socket.on("close", () => {
      if (!room) return;
      room.sockets.delete(socket);
      room.at = Date.now();
    });
  });

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms) if (!room.sockets.size && now - room.at > IDLE_MS) rooms.delete(id);
  }, 60 * 1000);
  sweep.unref();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => {
          clearInterval(sweep);
          for (const socket of wss.clients) socket.terminate();
          wss.close();
          server.close(() => done());
          server.closeAllConnections();
        }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || "127.0.0.1";
  const relay = await startRelay({ host, port: Number(process.env.PORT || 5192) });
  console.log(`yac-canvas relay on ws://${host}:${relay.port}`);
}
