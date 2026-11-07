const PAGE_META = ["name", "background", "grid", "comments"];

const metaOf = (board) => ({
  name: board.name,
  pages: board.pages.map((p) => Object.fromEntries([["id", p.id], ...PAGE_META.map((k) => [k, p[k]])])),
});

const sameMeta = (a, b) =>
  a.name === b.name &&
  a.pages.length === b.pages.length &&
  a.pages.every((p, i) => p.id === b.pages[i].id && PAGE_META.every((k) => p[k] === b.pages[i][k]));

function diffPage(before, after) {
  const was = new Map((before?.elements ?? []).map((e) => [e.id, e]));
  const now = new Map((after?.elements ?? []).map((e) => [e.id, e]));
  const b = {};
  const a = {};
  for (const [id, e] of was) if (now.get(id)?.version !== e.version) {
    b[id] = e;
    a[id] = now.get(id) ?? null;
  }
  for (const [id, e] of now) if (!was.has(id)) {
    b[id] = null;
    a[id] = e;
  }
  const orderBefore = (before?.elements ?? []).map((e) => e.id);
  const orderAfter = (after?.elements ?? []).map((e) => e.id);
  const reordered = orderBefore.length !== orderAfter.length || orderBefore.some((id, i) => id !== orderAfter[i]);
  if (!Object.keys(b).length && !reordered) return null;
  return { before: b, after: a, orderBefore, orderAfter };
}

export function diffBoards(prev, next) {
  const pages = {};
  const ids = new Set([...prev.pages.map((p) => p.id), ...next.pages.map((p) => p.id)]);
  for (const id of ids) {
    const d = diffPage(prev.pages.find((p) => p.id === id), next.pages.find((p) => p.id === id));
    if (d) pages[id] = d;
  }
  const mb = metaOf(prev);
  const ma = metaOf(next);
  return { pages, meta: sameMeta(mb, ma) ? null : { before: mb, after: ma } };
}

export const isEmptyDiff = (d) => !d.meta && !Object.keys(d.pages).length;

export function mergeDiffs(older, newer) {
  const pages = { ...older.pages };
  for (const [id, n] of Object.entries(newer.pages)) {
    const o = pages[id];
    if (!o) {
      pages[id] = n;
      continue;
    }
    const before = { ...o.before };
    for (const [eid, v] of Object.entries(n.before)) if (!(eid in before)) before[eid] = v;
    pages[id] = { before, after: { ...o.after, ...n.after }, orderBefore: o.orderBefore, orderAfter: n.orderAfter };
  }
  const meta = older.meta || newer.meta ? { before: (older.meta ?? newer.meta).before, after: (newer.meta ?? older.meta).after } : null;
  return { pages, meta };
}

function placeInOrder(current, wanted, order) {
  const result = current.filter((e) => !wanted.has(e.id));
  for (let i = 0; i < order.length; i++) {
    const el = wanted.get(order[i]);
    if (!el) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = result.findIndex((e) => e.id === order[j]);
      if (k !== -1) {
        at = k + 1;
        break;
      }
    }
    result.splice(at, 0, el);
  }
  const inOrder = new Set(order);
  for (const [id, el] of wanted) if (!inOrder.has(id)) result.push(el);
  return result;
}

function applyPage(page, d, dir) {
  const target = dir === "undo" ? d.before : d.after;
  const order = dir === "undo" ? d.orderBefore : d.orderAfter;
  const current = new Map(page.elements.map((e) => [e.id, e]));
  const wanted = new Map();
  for (const [id, el] of Object.entries(target)) {
    if (!el) continue;
    const cur = current.get(id);
    wanted.set(id, { ...el, version: Math.max(cur?.version ?? 0, el.version ?? 0) + 1 });
  }
  const removed = new Set(Object.entries(target).filter(([, el]) => !el).map(([id]) => id));
  let elements = page.elements.filter((e) => !removed.has(e.id));
  const orderChanged = d.orderBefore.length !== d.orderAfter.length || d.orderBefore.some((id, i) => id !== d.orderAfter[i]);
  if (orderChanged) {
    for (const id of order) if (!wanted.has(id) && current.has(id) && !removed.has(id)) wanted.set(id, current.get(id));
  }
  elements = placeInOrder(elements, wanted, order);
  return { ...page, elements };
}

export function applyDiff(board, diff, dir) {
  let pages = board.pages;
  let name = board.name;
  if (diff.meta) {
    const meta = dir === "undo" ? diff.meta.before : diff.meta.after;
    name = meta.name;
    pages = meta.pages.map((m) => {
      const existing = board.pages.find((p) => p.id === m.id);
      return { ...(existing ?? { elements: [] }), ...m };
    });
  }
  pages = pages.map((p) => (diff.pages[p.id] ? applyPage(p, diff.pages[p.id], dir) : p));
  return { ...board, name, pages, updatedAt: Date.now(), metaVersion: diff.meta ? (board.metaVersion ?? 0) + 1 : board.metaVersion };
}
