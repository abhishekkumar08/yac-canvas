import { mergePage } from "../engine/merge.js";

const COLORS = ["#e8590c", "#2f9e44", "#1971c2", "#9c36b5", "#c2255c", "#0c8599", "#f08c00"];
export const clientId = Math.random().toString(36).slice(2, 10);
export const clientColor = COLORS[Math.floor(Math.random() * COLORS.length)];

const raf = globalThis.requestAnimationFrame ?? ((fn) => setTimeout(fn, 16));
const cancelRaf = globalThis.cancelAnimationFrame ?? clearTimeout;

function mergeInto(board, data, tombstones) {
  const local = board.pages.find((p) => p.id === data.page.id) ?? { id: data.page.id, name: data.page.name, elements: [], comments: [] };
  const merged = mergePage(local, data.page, tombstones);
  const useMeta = (data.meta.metaVersion ?? 0) > (board.metaVersion ?? 0);
  const order = useMeta ? data.meta.pages.map((p) => p.id) : board.pages.map((p) => p.id);
  if (!order.includes(merged.id)) order.push(merged.id);
  const byId = new Map(board.pages.map((p) => [p.id, p]));
  byId.set(merged.id, merged);
  const pages = order.map((id) => byId.get(id)).filter(Boolean);
  return {
    ...board,
    name: useMeta ? data.meta.name : board.name,
    uiMode: useMeta && data.meta.uiMode ? data.meta.uiMode : board.uiMode,
    metaVersion: Math.max(board.metaVersion ?? 0, data.meta.metaVersion ?? 0),
    pages: useMeta ? pages.map((p) => ({ ...p, name: data.meta.pages.find((q) => q.id === p.id)?.name ?? p.name })) : pages,
    files: Object.keys(data.files ?? {}).length ? { ...board.files, ...data.files } : board.files,
  };
}

export function createSync({ id = clientId, send, getBoard, applyRemote, onPeers, getName, onHello, delta = true, settleMs = 250 }) {
  const tombstones = new Map();
  const peers = new Map();
  const sentFiles = new Set();
  const merge = (board, data) => mergeInto(board, data, tombstones);
  let lastCursor = 0;

  const post = (msg) => send({ ...msg, from: id });

  const sentElements = new Map();
  const remember = (page) => sentElements.set(page.id, new Map(page.elements.map((e) => [e.id, e])));

  const pagePayload = (board, page, deleted = {}, fileSet = sentFiles, order = null) => {
    const files = {};
    for (const el of page.elements) {
      if (el.fileId && board.files[el.fileId] && !fileSet.has(el.fileId)) {
        files[el.fileId] = board.files[el.fileId];
        fileSet.add(el.fileId);
      }
    }
    return { type: "page", page: { ...page, deleted, ...(order ? { order: page.elements.map((e) => e.id), elements: order } : {}) }, files, meta: { name: board.name, uiMode: board.uiMode, metaVersion: board.metaVersion ?? 0, pages: board.pages.map((p) => ({ id: p.id, name: p.name })) } };
  };

  const snapshotPages = (track = true) => {
    if (track) sentFiles.clear();
    const fileSet = track ? sentFiles : new Set();
    const board = getBoard();
    return board.pages.map((page) => {
      if (track) remember(page);
      return pagePayload(board, page, {}, fileSet);
    });
  };

  const receive = (data) => {
    if (!data || data.from === id) return;
    if (data.type === "hello") {
      onHello();
      return;
    }
    if (data.type === "cursor") {
      peers.set(data.from, { ...data, at: Date.now() });
      onPeers(Object.fromEntries(peers));
      return;
    }
    if (data.type === "bye") {
      peers.delete(data.from);
      onPeers(Object.fromEntries(peers));
      return;
    }
    if (data.type === "page") applyRemote(merge(getBoard(), data));
    if (data.type === "snapshot" && Array.isArray(data.pages)) applyRemote(data.pages.reduce(merge, getBoard()));
  };

  const sweep = setInterval(() => {
    let changed = false;
    for (const [id, p] of peers) if (Date.now() - p.at > 8000) {
      peers.delete(id);
      changed = true;
    }
    if (changed) onPeers(Object.fromEntries(peers));
  }, 3000);

  let pending = null;
  let frame = 0;
  const flushPublish = (board, prevBoard) => {
    for (const page of board.pages) {
      const prev = prevBoard?.pages.find((p) => p.id === page.id);
      if (prev === page && prevBoard?.metaVersion === board.metaVersion) continue;
      const deleted = {};
      if (prev) {
        const ids = new Set(page.elements.map((e) => e.id));
        for (const e of prev.elements) if (!ids.has(e.id)) {
          deleted[e.id] = e.version;
          tombstones.set(e.id, e.version);
        }
      }
      const base = delta ? sentElements.get(page.id) : null;
      post(pagePayload(board, page, deleted, sentFiles, base ? page.elements.filter((e) => base.get(e.id) !== e) : null));
      if (delta) remember(page);
    }
  };

  // A delta stream can leave a peer behind after a dropped message; one full page once edits pause puts it right.
  let settleTimer = 0;
  const settle = () => {
    settleTimer = 0;
    const board = getBoard();
    for (const page of board.pages) {
      const ids = new Set(page.elements.map((e) => e.id));
      const deleted = {};
      for (const [eid, v] of tombstones) if (!ids.has(eid)) deleted[eid] = v;
      post(pagePayload(board, page, deleted));
      remember(page);
    }
  };

  return {
    post,
    receive,
    snapshotPages,
    publish(board, prevBoard) {
      pending = { board, prevBoard: pending?.prevBoard ?? prevBoard };
      if (frame) return;
      frame = raf(() => {
        frame = 0;
        const { board: next, prevBoard: before } = pending;
        pending = null;
        flushPublish(next, before);
        if (delta) {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(settle, settleMs);
        }
      });
    },
    cursor(point, pageId) {
      const now = Date.now();
      if (now - lastCursor < 40) return;
      lastCursor = now;
      post({ type: "cursor", x: point.x, y: point.y, pageId, name: getName(), color: clientColor });
    },
    close() {
      if (frame) cancelRaf(frame);
      const dirty = pending || settleTimer;
      clearTimeout(settleTimer);
      if (pending) flushPublish(pending.board, pending.prevBoard);
      if (delta && dirty) settle();
      post({ type: "bye" });
      clearInterval(sweep);
    },
  };
}
