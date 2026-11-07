import { createSync } from "./syncCore.js";

const onLocalhost = !globalThis.location || ["localhost", "127.0.0.1"].includes(globalThis.location.hostname);
export const DEFAULT_RELAY_URL = onLocalhost
  ? "ws://127.0.0.1:5192"
  : `${globalThis.location.protocol === "https:" ? "wss" : "ws"}://${globalThis.location.host}/relay`;

const MAX_FRAME = 5 * 1024 * 1024;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const HASH = /^#?room=([A-Za-z0-9_-]{8,64}),([A-Za-z0-9_-]{43})$/;

const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (s) => fromBase64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

export function createRoom() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const roomId = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return { roomId, key: toBase64Url(crypto.getRandomValues(new Uint8Array(32))) };
}

export const roomHash = (roomId, key) => `#room=${roomId},${key}`;

export function parseRoomHash(hash) {
  const m = HASH.exec(hash ?? "");
  return m ? { roomId: m[1], key: m[2] } : null;
}

async function encrypt(key, msg) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(msg))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toBase64(out);
}

async function decrypt(key, data) {
  try {
    const bytes = fromBase64(data);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export function connectRelay(boardId, { url = DEFAULT_RELAY_URL, roomId, key, getBoard, applyRemote, onPeers, getName, onStatus = () => {}, WebSocketImpl = globalThis.WebSocket }) {
  if (!parseRoomHash(roomHash(roomId, key))) throw new Error("Invalid room id or key");
  const cryptoKey = crypto.subtle.importKey("raw", fromBase64Url(key), "AES-GCM", false, ["encrypt", "decrypt"]);
  let ws = null;
  let closed = false;
  let attempt = 0;
  let retryTimer = 0;
  let storeTimer = 0;
  let tx = Promise.resolve();

  const sendFrame = (t, msg) => {
    tx = tx.then(async () => {
      const frame = JSON.stringify({ t, d: await encrypt(await cryptoKey, msg) });
      if (frame.length <= MAX_FRAME && ws?.readyState === 1) ws.send(frame);
    });
  };

  const id = Math.random().toString(36).slice(2, 10);
  const sync = createSync({
    id,
    send: (msg) => sendFrame("msg", msg),
    getBoard,
    applyRemote,
    onPeers,
    getName,
    onHello: () => sync.post({ type: "snapshot", pages: sync.snapshotPages() }),
  });

  const storeNow = () => {
    clearTimeout(storeTimer);
    storeTimer = 0;
    sendFrame("snap", { type: "snapshot", from: id, pages: sync.snapshotPages(false) });
  };
  const storeSnapshot = () => {
    if (!storeTimer) storeTimer = setTimeout(storeNow, 1000);
  };

  const open = () => {
    onStatus("connecting");
    const sock = new WebSocketImpl(url);
    ws = sock;
    sock.onopen = () => {
      attempt = 0;
      onStatus("connected");
      sock.send(JSON.stringify({ t: "join", room: roomId }));
      sync.post({ type: "snapshot", pages: sync.snapshotPages() });
      sync.post({ type: "hello" });
      storeSnapshot();
    };
    sock.onmessage = ({ data }) => {
      const env = JSON.parse(data);
      if (env.t !== "msg") return;
      cryptoKey.then((k) => decrypt(k, env.d)).then((msg) => msg && sync.receive(msg));
    };
    sock.onclose = () => {
      if (ws !== sock || closed) return;
      ws = null;
      onStatus("offline");
      retryTimer = setTimeout(open, Math.min(10000, 1000 * 2 ** attempt++));
    };
  };
  open();

  return {
    publish(board, prevBoard) {
      sync.publish(board, prevBoard);
      storeSnapshot();
    },
    cursor: sync.cursor,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(retryTimer);
      sync.close();
      if (storeTimer) storeNow();
      tx.then(() => ws?.close());
    },
  };
}
