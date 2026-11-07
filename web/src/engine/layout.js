import { touch } from "./scene.js";
import { isConnector, updateBoundConnectors } from "./connectors.js";

export function treeLayout(els, ids, { direction = "down", gapX = 60, gapY = 80 } = {}) {
  const byId = new Map(els.map((e) => [e.id, e]));
  const nodes = ids.map((id) => byId.get(id)).filter((e) => e && !isConnector(e) && e.type !== "freedraw");
  const nodeSet = new Set(nodes.map((n) => n.id));
  const down = direction === "down";
  const breadthOf = (n) => (down ? n.w : n.h);
  const depthOf = (n) => (down ? n.h : n.w);
  const breadthPos = (n) => (down ? n.x : n.y);
  const depthPos = (n) => (down ? n.y : n.x);
  const siblingGap = down ? gapX : gapY;
  const levelGap = down ? gapY : gapX;

  const children = new Map(nodes.map((n) => [n.id, []]));
  const hasParent = new Set();
  for (const c of els) {
    if (!isConnector(c) || !c.startBinding || !c.endBinding) continue;
    const from = c.startBinding.id;
    const to = c.endBinding.id;
    if (!nodeSet.has(from) || !nodeSet.has(to) || from === to || hasParent.has(to)) continue;
    hasParent.add(to);
    children.get(from).push(to);
  }
  for (const list of children.values()) list.sort((a, b) => breadthPos(byId.get(a)) - breadthPos(byId.get(b)));
  let roots = nodes.filter((n) => !hasParent.has(n.id));
  if (!roots.length && nodes.length) roots = [nodes[0]];
  roots.sort((a, b) => breadthPos(a) - breadthPos(b));

  const visited = new Set();
  const sub = new Map();
  const measure = (id) => {
    if (visited.has(id)) return 0;
    visited.add(id);
    const kids = children.get(id).filter((k) => !visited.has(k));
    children.set(id, kids);
    const total = kids.reduce((s, k) => s + measure(k), 0) + siblingGap * Math.max(0, kids.length - 1);
    const size = Math.max(breadthOf(byId.get(id)), total);
    sub.set(id, size);
    return size;
  };
  roots.forEach((r) => measure(r.id));

  const pos = new Map();
  const place = (id, start, depth) => {
    const n = byId.get(id);
    const size = sub.get(id);
    pos.set(id, { b: start + (size - breadthOf(n)) / 2, d: depth });
    const kids = children.get(id);
    const total = kids.reduce((s, k) => s + sub.get(k), 0) + siblingGap * Math.max(0, kids.length - 1);
    let cursor = start + (size - total) / 2;
    for (const k of kids) {
      place(k, cursor, depth + depthOf(n) + levelGap);
      cursor += sub.get(k) + siblingGap;
    }
  };
  if (roots.length) {
    const first = roots[0];
    let cursor = breadthPos(first) - (sub.get(first.id) - breadthOf(first)) / 2;
    const depth = depthPos(first);
    for (const r of roots) {
      place(r.id, cursor, depth);
      cursor += sub.get(r.id) + siblingGap;
    }
  }
  const moved = [];
  const out = els.map((el) => {
    const p = pos.get(el.id);
    if (!p) return el;
    const x = down ? p.b : p.d;
    const y = down ? p.d : p.b;
    if (x === el.x && y === el.y) return el;
    moved.push(el.id);
    return touch(el, { x, y });
  });
  return updateBoundConnectors(out, moved);
}

export function applyAutoLayout(els, frameId) {
  const frame = els.find((e) => e.id === frameId);
  if (!frame?.layout) return els;
  const { direction = "row", gap = 10, padding = 16, align = "start", hug = true } = frame.layout;
  const row = direction === "row";
  const kids = els.filter((e) => e.frameId === frameId).sort((a, b) => (row ? a.x - b.x : a.y - b.y));
  const main = (e) => (row ? e.w : e.h);
  const cross = (e) => (row ? e.h : e.w);
  const maxCross = Math.max(0, ...kids.map(cross));
  const innerCross = hug ? maxCross : (row ? frame.h : frame.w) - padding * 2;
  const updates = new Map();
  let cursor = (row ? frame.x : frame.y) + padding;
  const crossStart = (row ? frame.y : frame.x) + padding;
  for (const k of kids) {
    const offset = align === "center" ? (innerCross - cross(k)) / 2 : align === "end" ? innerCross - cross(k) : 0;
    const x = row ? cursor : crossStart + offset;
    const y = row ? crossStart + offset : cursor;
    if (x !== k.x || y !== k.y) updates.set(k.id, { x, y });
    cursor += main(k) + gap;
  }
  if (hug) {
    const length = kids.reduce((s, k) => s + main(k), 0) + gap * Math.max(0, kids.length - 1) + padding * 2;
    const w = row ? length : maxCross + padding * 2;
    const h = row ? maxCross + padding * 2 : length;
    if (w !== frame.w || h !== frame.h) updates.set(frame.id, { w, h });
  }
  if (!updates.size) return els;
  const out = els.map((e) => (updates.has(e.id) ? touch(e, updates.get(e.id)) : e));
  return updateBoundConnectors(out, [...updates.keys()]);
}

function placeAll(els, positions) {
  const moved = [];
  const out = els.map((el) => {
    const p = positions.get(el.id);
    if (!p || (p.x === el.x && p.y === el.y)) return el;
    moved.push(el.id);
    return touch(el, p);
  });
  return updateBoundConnectors(out, moved);
}

const layoutNodes = (els, ids) => {
  const set = new Set(ids);
  return els.filter((e) => set.has(e.id) && !isConnector(e));
};

export function gridLayout(els, ids, { cols, gap = 24 } = {}) {
  const nodes = layoutNodes(els, ids).sort((a, b) => a.y - b.y || a.x - b.x);
  if (!nodes.length) return els;
  const n = cols ?? Math.ceil(Math.sqrt(nodes.length));
  const cw = Math.max(...nodes.map((e) => e.w));
  const ch = Math.max(...nodes.map((e) => e.h));
  const ox = Math.min(...nodes.map((e) => e.x));
  const oy = Math.min(...nodes.map((e) => e.y));
  const positions = new Map(nodes.map((e, i) => [e.id, { x: ox + (i % n) * (cw + gap), y: oy + Math.floor(i / n) * (ch + gap) }]));
  return placeAll(els, positions);
}

export function circleLayout(els, ids, { radius } = {}) {
  const nodes = layoutNodes(els, ids);
  if (nodes.length < 2) return els;
  const cx = nodes.reduce((s, e) => s + e.x + e.w / 2, 0) / nodes.length;
  const cy = nodes.reduce((s, e) => s + e.y + e.h / 2, 0) / nodes.length;
  const r = radius ?? Math.max(80, (Math.max(...nodes.map((e) => Math.max(e.w, e.h))) * nodes.length) / Math.PI);
  const positions = new Map(
    nodes.map((e, i) => {
      const t = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
      return [e.id, { x: cx + r * Math.cos(t) - e.w / 2, y: cy + r * Math.sin(t) - e.h / 2 }];
    }),
  );
  return placeAll(els, positions);
}
