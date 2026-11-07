const DB_NAME = "yac-canvas";
const STORES = ["boards", "meta"];

let dbPromise;
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function preview(board) {
  const els = board.pages[0]?.elements ?? [];
  return els.slice(0, 150).map((e) => ({ t: e.type, x: e.x, y: e.y, w: e.w || 1, h: e.h || 1, f: e.fill, s: e.stroke }));
}

export const boardsDb = {
  list: () => run("meta", "readonly", (s) => s.getAll()).then((rows) => rows.sort((a, b) => b.updatedAt - a.updatedAt)),
  get: (id) => run("boards", "readonly", (s) => s.get(id)),
  async put(board) {
    await run("boards", "readwrite", (s) => s.put(board, board.id));
    await run("meta", "readwrite", (s) =>
      s.put({ id: board.id, name: board.name, updatedAt: board.updatedAt, pages: board.pages.length, preview: preview(board) }, board.id),
    );
  },
  async remove(id) {
    await run("boards", "readwrite", (s) => s.delete(id));
    await run("meta", "readwrite", (s) => s.delete(id));
  },
};
