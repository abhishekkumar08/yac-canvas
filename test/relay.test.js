import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startRelay } from "../server/relay.js";
import { connectRelay, createRoom, parseRoomHash, roomHash } from "../web/src/store/relay.js";
import { createBoard } from "../web/src/engine/serialize.js";
import { createElement } from "../web/src/engine/elements.js";

const relay = await startRelay({ host: "127.0.0.1", port: 0 });
const url = `ws://127.0.0.1:${relay.port}`;
const clients = [];
after(async () => {
  for (const c of clients) c.close();
  await new Promise((r) => setTimeout(r, 50));
  await relay.close();
});

const waitFor = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

function client(room, board = createBoard("t")) {
  const status = [];
  const c = { board, status };
  c.conn = connectRelay(board.id, {
    url,
    ...room,
    WebSocketImpl: WebSocket,
    getBoard: () => c.board,
    applyRemote: (b) => {
      c.board = b;
    },
    onPeers: () => {},
    getName: () => "t",
    onStatus: (s) => status.push(s),
  });
  c.ids = () => c.board.pages[0].elements.map((e) => e.id);
  c.edit = (fn) => {
    const prev = c.board;
    const page = prev.pages[0];
    c.board = { ...prev, pages: [{ ...page, elements: fn(page.elements) }, ...prev.pages.slice(1)] };
    c.conn.publish(c.board, prev);
  };
  c.close = () => c.conn.close();
  clients.push(c);
  return c;
}

const connected = (c) => waitFor(() => c.status.includes("connected"));
const sharedBoard = () => {
  const b = createBoard("shared");
  return () => structuredClone(b);
};

test("room helpers round-trip through the URL hash", () => {
  const room = createRoom();
  assert.equal(room.roomId.length, 20);
  assert.deepEqual(parseRoomHash(roomHash(room.roomId, room.key)), room);
  assert.equal(parseRoomHash("#nope"), null);
});

test("health check answers ok", async () => {
  const res = await fetch(`http://127.0.0.1:${relay.port}/health`);
  assert.equal(await res.text(), "ok");
});

test("edits sync between clients, encrypted on the wire", async () => {
  const room = createRoom();
  const board = sharedBoard();
  const wire = [];
  const spy = new WebSocket(url);
  await new Promise((r) => (spy.onopen = r));
  spy.send(JSON.stringify({ t: "join", room: room.roomId }));
  spy.onmessage = ({ data }) => wire.push(data);

  const a = client(room, board());
  const b = client(room, board());
  await Promise.all([connected(a), connected(b)]);
  const el = createElement("rect", { id: "secret-rect-id", w: 10, h: 10 });
  a.edit((els) => [...els, el]);
  await waitFor(() => b.ids().includes("secret-rect-id"));

  assert.ok(wire.length > 0);
  for (const frame of wire) {
    const { d } = JSON.parse(frame);
    assert.throws(() => JSON.parse(d));
    assert.ok(!Buffer.from(d, "base64").toString("latin1").includes("secret-rect-id"));
  }

  a.edit((els) => els.filter((e) => e.id !== "secret-rect-id"));
  await waitFor(() => !b.ids().includes("secret-rect-id"));
  spy.close();
  a.close();
  b.close();
});

test("a late joiner gets the stored snapshot when nobody else is online", async () => {
  const room = createRoom();
  const board = sharedBoard();
  const a = client(room, board());
  await connected(a);
  a.edit((els) => [...els, createElement("rect", { id: "kept" })]);
  a.close();
  await new Promise((r) => setTimeout(r, 100));
  const late = client(room, board());
  await waitFor(() => late.ids().includes("kept"));
  late.close();
});

test("a wrong key cannot read the room and other rooms stay isolated", async () => {
  const room = createRoom();
  const board = sharedBoard();
  const a = client(room, board());
  const wrong = client({ roomId: room.roomId, key: createRoom().key }, board());
  const other = client({ roomId: createRoom().roomId, key: room.key }, board());
  const b = client(room, board());
  await Promise.all([a, wrong, other, b].map(connected));
  a.edit((els) => [...els, createElement("rect", { id: "only-a-room" })]);
  wrong.edit((els) => [...els, createElement("rect", { id: "from-wrong" })]);
  await waitFor(() => b.ids().includes("only-a-room"));
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!wrong.ids().includes("only-a-room"));
  assert.ok(!other.ids().includes("only-a-room"));
  assert.ok(!a.ids().includes("from-wrong"));
  assert.ok(!b.ids().includes("from-wrong"));
  for (const c of [a, wrong, other, b]) c.close();
});
