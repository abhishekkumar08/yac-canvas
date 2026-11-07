import { newId } from "../engine/elements.js";

const DB_NAME = "yac-canvas-versions";
const STORE = "versions";
export const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

export const shouldAutoSave = (lastSavedAt, now, changedSinceSave) => Boolean(changedSinceSave) && now - lastSavedAt >= AUTO_SAVE_INTERVAL;

let dbPromise;
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("boardId", "boardId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const metaOf = ({ board, ...meta }) => meta;

export async function saveVersion(board, { name = null, auto = false } = {}) {
  const version = {
    id: newId(),
    boardId: board.id,
    name,
    auto,
    createdAt: Date.now(),
    elementCount: board.pages.reduce((n, p) => n + p.elements.length, 0),
    board,
  };
  await run("readwrite", (s) => s.put(version));
  return metaOf(version);
}

// ponytail: getAll loads every snapshot to list metadata; split into a meta store if boards get heavy.
export const listVersions = (boardId) =>
  run("readonly", (s) => s.index("boardId").getAll(boardId)).then((rows) => rows.map(metaOf).sort((a, b) => b.createdAt - a.createdAt));

export const getVersion = (id) => run("readonly", (s) => s.get(id));

export const renameVersion = (id, name) =>
  run("readwrite", (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      if (req.result) s.put({ ...req.result, name: name || null, auto: name ? false : req.result.auto });
    };
  });

export const deleteVersion = (id) => run("readwrite", (s) => s.delete(id));

export async function pruneAuto(boardId, keep = 50) {
  const extra = (await listVersions(boardId)).filter((v) => v.auto).slice(keep);
  if (extra.length) await run("readwrite", (s) => extra.forEach((v) => s.delete(v.id)));
  return extra.length;
}
