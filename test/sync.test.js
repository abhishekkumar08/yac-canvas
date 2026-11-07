import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createSync } from "../web/src/store/syncCore.js";
import { createBoard } from "../web/src/engine/serialize.js";
import { createElement } from "../web/src/engine/elements.js";

const peers = [];
after(() => {
  for (const p of peers) p.sync.close();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bump = (e, patch) => ({ ...e, ...patch, version: e.version + 1 });

function peer(board, { delta, id, drop = () => false }) {
  const p = { board, sent: [] };
  p.sync = createSync({
    id,
    delta,
    settleMs: 40,
    send: (msg) => {
      p.sent.push(msg);
      for (const o of p.links) if (!drop(msg, o)) o.sync.receive(structuredClone(msg));
    },
    getBoard: () => p.board,
    applyRemote: (b) => {
      p.board = b;
    },
    onPeers: () => {},
    getName: () => id,
    onHello: () => {},
  });
  p.links = [];
  peers.push(p);
  p.edit = (fn) => {
    const prev = p.board;
    const page = { ...prev.pages[0], elements: fn(prev.pages[0].elements) };
    p.board = { ...prev, pages: [page] };
    p.sync.publish(p.board, prev);
  };
  return p;
}

const els = (p) => p.board.pages[0].elements.map((e) => [e.id, e.version, e.x]);

test("delta stream gives receivers the same board as full pages after every edit, and sends far less", async () => {
  const base = createBoard("t");
  const mk = (delta, id) => {
    const a = peer(base, { delta, id: `a${id}` });
    const b = peer(base, { delta, id: `b${id}` });
    a.links = [b];
    return [a, b];
  };
  const [aD, bD] = mk(true, "d");
  const [aF, bF] = mk(false, "f");
  const ids = Array.from({ length: 30 }, (_, i) => createElement("rect", { x: i, y: 0, w: 5, h: 5 }));
  const stroke = createElement("freedraw", { x: 1, y: 1, points: [[0, 0], [3, 3]] });
  const steps = [
    (e) => [...e, ...ids],
    (e) => e.map((x, i) => (i % 3 ? x : bump(x, { x: x.x + 100 }))),
    (e) => e.filter((_, i) => i % 5),
    (e) => [...e].reverse(),
    (e) => [e[3], ...e.filter((_, i) => i !== 3)],
    (e) => [...e, stroke],
    (e) => e.map((x) => bump(x, { x: x.x + 1 })),
  ];
  for (const step of steps) {
    aD.edit(step);
    aF.edit(step);
    await wait(25);
    assert.deepEqual(els(bD), els(bF));
    assert.deepEqual(els(bD), els(aD));
  }
  const bytes = (p) => p.sent.filter((m) => m.type === "page").reduce((n, m) => n + JSON.stringify(m).length, 0);
  assert.ok(bytes(aD) < bytes(aF) * 0.6, `${bytes(aD)} vs ${bytes(aF)}`);
});

test("a peer that missed a delta is put right by the settle message", async () => {
  const base = createBoard("t");
  const a = peer(base, { delta: true, id: "a" });
  let dropNext = false;
  const b = peer(base, { delta: true, id: "b" });
  a.links = [{ sync: { receive: (m) => (dropNext && m.page?.order ? (dropNext = false) : b.sync.receive(m)) } }];
  a.edit((e) => [...e, createElement("rect", { w: 5, h: 5 }), createElement("rect", { w: 5, h: 5 })]);
  await wait(25);
  dropNext = true;
  a.edit((e) => e.map((x, i) => (i ? bump(x, { x: 50 }) : x)));
  await wait(25);
  assert.notDeepEqual(els(b), els(a));
  await wait(80);
  assert.deepEqual(els(b), els(a));
});

test("a late joiner that gets a snapshot then deltas ends with the same board", async () => {
  const base = createBoard("t");
  const a = peer(base, { delta: true, id: "a" });
  a.edit((e) => [...e, createElement("rect", { w: 5, h: 5 }), createElement("rect", { w: 5, h: 5 })]);
  await wait(25);
  const c = peer(base, { delta: true, id: "c" });
  for (const msg of a.sync.snapshotPages()) c.sync.receive(structuredClone({ ...msg, from: "a" }));
  a.links = [c];
  a.edit((e) => [bump(e[1], { x: 7 }), e[0]]);
  await wait(25);
  assert.deepEqual(els(c), els(a));
});

test("remote updates without new files keep the board's files object so unchanged shapes do not re-render", async () => {
  const base = createBoard("t");
  const a = peer(base, { delta: true, id: "a" });
  const b = peer(base, { delta: true, id: "b" });
  a.links = [b];
  const files = b.board.files;
  a.edit((e) => [...e, createElement("rect", { w: 5, h: 5 })]);
  await wait(25);
  assert.equal(b.board.pages[0].elements.length, 1);
  assert.equal(b.board.files, files);
});
