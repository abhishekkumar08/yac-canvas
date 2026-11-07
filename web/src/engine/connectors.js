import { center, borderPoint, toWorldPoint, toLocal, hitTest, elementBounds, LINEAR, boundsOfPoints, rotatePoint, pointAlong } from "./geometry.js";
import { touch } from "./scene.js";

export const CONNECTION_POINTS = [
  { fx: 0.5, fy: 0 },
  { fx: 1, fy: 0.5 },
  { fx: 0.5, fy: 1 },
  { fx: 0, fy: 0.5 },
];

export const isConnector = (el) => el.type === "arrow" || el.type === "line";
export const isBindable = (el) => !LINEAR.has(el.type);

export const connectionPointsWorld = (el) =>
  CONNECTION_POINTS.map((p) => ({ ...p, ...toWorldPoint(el, { x: p.fx * el.w, y: p.fy * el.h }) }));

export function findBinding(els, p, { tol = 8, exclude } = {}) {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (!isBindable(el) || exclude?.has(el.id)) continue;
    for (const cp of connectionPointsWorld(el)) {
      if (Math.hypot(cp.x - p.x, cp.y - p.y) <= tol * 1.5) return { id: el.id, fx: cp.fx, fy: cp.fy, fixed: true };
    }
    const solid = el.type === "frame" ? el : { ...el, fill: el.fill === "transparent" ? "#000" : el.fill };
    if (hitTest(solid, p, tol)) return { id: el.id, fx: 0.5, fy: 0.5, fixed: false };
  }
  return null;
}

export function connectorWorldPoints(conn) {
  return conn.points.map(([px, py]) => ({ x: conn.x + px, y: conn.y + py }));
}

export function setConnectorPoints(conn, pts) {
  const b = boundsOfPoints(pts);
  return { ...conn, x: pts[0].x, y: pts[0].y, w: b.w, h: b.h, angle: 0, points: pts.map((p) => [p.x - pts[0].x, p.y - pts[0].y]) };
}

const fixedAnchor = (el, b) => toWorldPoint(el, { x: b.fx * el.w, y: b.fy * el.h });

function sideOfAnchor(el, fx, fy) {
  const d = [
    [fy, { x: 0, y: -1 }],
    [1 - fx, { x: 1, y: 0 }],
    [1 - fy, { x: 0, y: 1 }],
    [fx, { x: -1, y: 0 }],
  ].sort((a, b) => a[0] - b[0])[0][1];
  return rotatePoint(d, { x: 0, y: 0 }, el.angle || 0);
}

function facingSide(el, toward) {
  const lp = toLocal(el, toward);
  const nx = lp.x / Math.max(el.w, 1) - 0.5;
  const ny = lp.y / Math.max(el.h, 1) - 0.5;
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? { fx: 1, fy: 0.5 } : { fx: 0, fy: 0.5 };
  return ny > 0 ? { fx: 0.5, fy: 1 } : { fx: 0.5, fy: 0 };
}

const roundDir = (d) => ({ x: Math.round(d.x), y: Math.round(d.y) });

export function resolveConnector(conn, byId) {
  const cur = connectorWorldPoints(conn);
  const sEl = conn.startBinding ? byId.get(conn.startBinding.id) : null;
  const eEl = conn.endBinding ? byId.get(conn.endBinding.id) : null;
  const routing = conn.routing || "straight";
  if (routing === "elbow") {
    let sb = conn.startBinding;
    let eb = conn.endBinding;
    if (sEl && !sb.fixed) sb = { ...sb, ...facingSide(sEl, eEl ? center(eEl) : cur.at(-1)) };
    if (eEl && !eb.fixed) eb = { ...eb, ...facingSide(eEl, sEl ? center(sEl) : cur[0]) };
    const s = sEl ? fixedAnchor(sEl, sb) : cur[0];
    const e = eEl ? fixedAnchor(eEl, eb) : cur.at(-1);
    const sDir = sEl ? roundDir(sideOfAnchor(sEl, sb.fx, sb.fy)) : null;
    const eDir = eEl ? roundDir(sideOfAnchor(eEl, eb.fx, eb.fy)) : null;
    const boxes = [sEl, eEl].filter(Boolean).map(elementBounds);
    return setConnectorPoints(conn, routeElbow(s, sDir, e, eDir, boxes));
  }
  const wps = cur.slice(1, -1);
  let s = sEl && conn.startBinding.fixed ? fixedAnchor(sEl, conn.startBinding) : sEl ? null : cur[0];
  let e = eEl && conn.endBinding.fixed ? fixedAnchor(eEl, conn.endBinding) : eEl ? null : cur.at(-1);
  if (!s) s = borderPoint(sEl, wps[0] ?? e ?? center(eEl));
  if (!e) e = borderPoint(eEl, wps.at(-1) ?? s);
  return setConnectorPoints(conn, [s, ...wps, e]);
}

export function updateBoundConnectors(els, changedIds) {
  const set = new Set(changedIds);
  const byId = new Map(els.map((e) => [e.id, e]));
  return els.map((el) => {
    if (!isConnector(el) || !(el.startBinding || el.endBinding)) return el;
    const hit = (el.startBinding && set.has(el.startBinding.id)) || (el.endBinding && set.has(el.endBinding.id)) || set.has(el.id);
    return hit ? touch(resolveConnector(el, byId), {}) : el;
  });
}

const dominant = (d) => (Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x) || 1, y: 0 } : { x: 0, y: Math.sign(d.y) || 1 });

class Heap {
  constructor() {
    this.items = [];
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const last = out.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

const uniqSorted = (vals) => [...new Set(vals.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function routeElbow(a, aDir, b, bDir, boxes, margin = 20) {
  const sd = aDir ?? dominant({ x: b.x - a.x, y: b.y - a.y });
  const ed = bDir ?? dominant({ x: a.x - b.x, y: a.y - b.y });
  const s = { x: a.x + sd.x * margin, y: a.y + sd.y * margin };
  const t = { x: b.x + ed.x * margin, y: b.y + ed.y * margin };
  const block = boxes.map((bx) => ({ x: bx.x - margin + 1, y: bx.y - margin + 1, w: bx.w + 2 * margin - 2, h: bx.h + 2 * margin - 2 }));
  const inside = (p) => block.some((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h);
  const segFree = (p, q) =>
    !block.some((r) => {
      const x1 = Math.min(p.x, q.x);
      const x2 = Math.max(p.x, q.x);
      const y1 = Math.min(p.y, q.y);
      const y2 = Math.max(p.y, q.y);
      return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
    });

  let xs = [s.x, t.x, (s.x + t.x) / 2];
  let ys = [s.y, t.y, (s.y + t.y) / 2];
  for (const bx of boxes) {
    xs.push(bx.x - margin, bx.x + bx.w + margin);
    ys.push(bx.y - margin, bx.y + bx.h + margin);
  }
  xs = uniqSorted(xs);
  ys = uniqSorted(ys);
  const mid = (arr) => arr.slice(1).map((v, i) => (v + arr[i]) / 2);
  xs = uniqSorted([...xs, ...mid(xs)]);
  ys = uniqSorted([...ys, ...mid(ys)]);
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));
  const key = (i, j, d) => (i * ys.length + j) * 4 + d;
  const round = (v) => Math.round(v * 100) / 100;
  const si = xi.get(round(s.x));
  const sj = yi.get(round(s.y));
  const ti = xi.get(round(t.x));
  const tj = yi.get(round(t.y));
  const bend = margin * 1.5;
  const startDir = DIRS.findIndex((d) => d.x === sd.x && d.y === sd.y);
  const endDir = DIRS.findIndex((d) => d.x === -ed.x && d.y === -ed.y);

  const fallback = () => simplify([a, s, { x: s.x, y: t.y }, t, b]);
  if (inside(s) || inside(t) || si === undefined || ti === undefined) return fallback();

  const heap = new Heap();
  const best = new Map();
  const prev = new Map();
  const h = (i, j) => Math.abs(xs[i] - xs[ti]) + Math.abs(ys[j] - ys[tj]);
  const startKey = key(si, sj, startDir);
  best.set(startKey, 0);
  heap.push({ i: si, j: sj, d: startDir, g: 0, f: h(si, sj) });
  let goal = null;
  while (heap.size) {
    const cur = heap.pop();
    const ck = key(cur.i, cur.j, cur.d);
    if (cur.g > (best.get(ck) ?? Infinity)) continue;
    if (cur.i === ti && cur.j === tj) {
      const finalCost = cur.g + (cur.d === endDir ? 0 : bend);
      if (!goal || finalCost < goal.cost) goal = { key: ck, cost: finalCost };
      if (cur.d === endDir) break;
      continue;
    }
    DIRS.forEach((d, di) => {
      if (di === (cur.d ^ 1)) return;
      const ni = cur.i + d.x;
      const nj = cur.j + d.y;
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) return;
      const p = { x: xs[cur.i], y: ys[cur.j] };
      const q = { x: xs[ni], y: ys[nj] };
      if (inside(q) || !segFree(p, q)) return;
      const g = cur.g + Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + (di === cur.d ? 0 : bend);
      const nk = key(ni, nj, di);
      if (g < (best.get(nk) ?? Infinity)) {
        best.set(nk, g);
        prev.set(nk, ck);
        heap.push({ i: ni, j: nj, d: di, g, f: g + h(ni, nj) });
      }
    });
  }
  if (!goal) return fallback();
  const path = [];
  for (let k = goal.key; k !== undefined; k = prev.get(k)) {
    const cell = Math.floor(k / 4);
    path.unshift({ x: xs[Math.floor(cell / ys.length)], y: ys[cell % ys.length] });
  }
  return simplify([a, ...path, b]);
}

const fmt = (n) => Math.round(n * 100) / 100;

export function curvePath(pts) {
  if (pts.length < 2) return "";
  let d = `M${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

export const labelPoint = (conn) => pointAlong(connectorWorldPoints(conn), 0.5);
