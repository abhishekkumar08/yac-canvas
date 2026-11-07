import { newId, reseed } from "./elements.js";
import { elementBounds, center, LINEAR, rectContains } from "./geometry.js";

export const touch = (el, patch) => ({ ...el, ...patch, version: (el.version || 0) + 1 });

export function updateElements(els, ids, fn) {
  const set = new Set(ids);
  return els.map((el) => (set.has(el.id) ? touch(el, fn(el)) : el));
}

export function replaceElements(els, updated) {
  const map = new Map(updated.map((e) => [e.id, e]));
  return els.map((el) => {
    const next = map.get(el.id);
    return next ? { ...next, version: Math.max(next.version || 0, (el.version || 0) + 1) } : el;
  });
}

export function reorder(els, ids, op) {
  const set = new Set(ids);
  if (op === "front") return [...els.filter((e) => !set.has(e.id)), ...els.filter((e) => set.has(e.id))];
  if (op === "back") return [...els.filter((e) => set.has(e.id)), ...els.filter((e) => !set.has(e.id))];
  const out = [...els];
  if (op === "forward") {
    for (let i = out.length - 2; i >= 0; i--) {
      if (set.has(out[i].id) && !set.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (set.has(out[i].id) && !set.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
    }
  }
  return out;
}

export function groupElements(els, ids) {
  const groupId = newId();
  return { groupId, elements: updateElements(els, ids, (el) => ({ groupIds: [...el.groupIds, groupId] })) };
}

export function ungroupElements(els, ids) {
  const set = new Set(ids);
  const outer = new Set(els.filter((e) => set.has(e.id) && e.groupIds.length).map((e) => e.groupIds.at(-1)));
  return els.map((el) => (el.groupIds.length && outer.has(el.groupIds.at(-1)) ? touch(el, { groupIds: el.groupIds.slice(0, -1) }) : el));
}

export function expandSelection(els, ids, { withFrameChildren = false } = {}) {
  const set = new Set(ids);
  const groups = new Set(els.filter((e) => set.has(e.id) && e.groupIds.length).map((e) => e.groupIds.at(-1)));
  for (const el of els) if (el.groupIds.some((g) => groups.has(g))) set.add(el.id);
  if (withFrameChildren) for (const id of descendantsOf(els, [...set])) set.add(id);
  return [...set];
}

export function duplicateElements(els, ids, { dx = 10, dy = 10 } = {}) {
  const set = new Set(ids);
  const idMap = {};
  const groupMap = {};
  for (const id of set) idMap[id] = newId();
  const remapGroup = (g) => (groupMap[g] ??= newId());
  const copies = els
    .filter((e) => set.has(e.id))
    .map((el) => {
      const copy = {
        ...structuredClone(el),
        id: idMap[el.id],
        x: el.x + dx,
        y: el.y + dy,
        seed: reseed(),
        version: 1,
        groupIds: el.groupIds.map(remapGroup),
        frameId: el.frameId && idMap[el.frameId] ? idMap[el.frameId] : el.frameId,
      };
      for (const key of ["startBinding", "endBinding"]) {
        if (el[key]) copy[key] = idMap[el[key].id] ? { ...el[key], id: idMap[el[key].id] } : null;
      }
      return copy;
    });
  return { elements: [...els, ...copies], idMap, newIds: copies.map((c) => c.id) };
}

export function descendantsOf(els, ids) {
  const found = new Set();
  let frontier = new Set(ids);
  while (frontier.size) {
    const next = new Set();
    for (const el of els) if (el.frameId && frontier.has(el.frameId) && !found.has(el.id)) {
      found.add(el.id);
      next.add(el.id);
    }
    frontier = next;
  }
  return found;
}

export function deleteElements(els, ids) {
  const set = new Set(ids);
  for (const id of descendantsOf(els, ids)) set.add(id);
  return els
    .filter((el) => !set.has(el.id))
    .map((el) => {
      const s = el.startBinding && set.has(el.startBinding.id);
      const e = el.endBinding && set.has(el.endBinding.id);
      return s || e ? touch(el, { startBinding: s ? null : el.startBinding, endBinding: e ? null : el.endBinding }) : el;
    });
}

export function selectionBounds(els, ids) {
  const set = new Set(ids);
  const bs = els.filter((e) => set.has(e.id)).map(elementBounds);
  if (!bs.length) return null;
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
}

export function alignElements(els, ids, mode) {
  const box = selectionBounds(els, ids);
  if (!box) return els;
  return updateElements(els, ids, (el) => {
    const b = elementBounds(el);
    switch (mode) {
      case "left": return { x: el.x + box.x - b.x };
      case "right": return { x: el.x + box.x + box.w - (b.x + b.w) };
      case "center": return { x: el.x + box.x + box.w / 2 - (b.x + b.w / 2) };
      case "top": return { y: el.y + box.y - b.y };
      case "bottom": return { y: el.y + box.y + box.h - (b.y + b.h) };
      case "middle": return { y: el.y + box.y + box.h / 2 - (b.y + b.h / 2) };
      default: return {};
    }
  });
}

export function distributeElements(els, ids, axis) {
  const set = new Set(ids);
  const items = els.filter((e) => set.has(e.id)).map((el) => ({ el, b: elementBounds(el) }));
  if (items.length < 3) return els;
  const pos = axis === "x" ? "x" : "y";
  const size = axis === "x" ? "w" : "h";
  items.sort((a, b) => a.b[pos] - b.b[pos]);
  const first = items[0].b;
  const last = items.at(-1).b;
  const total = items.reduce((s, i) => s + i.b[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - total) / (items.length - 1);
  const shift = new Map();
  let cursor = first[pos];
  for (const { el, b } of items) {
    shift.set(el.id, cursor - b[pos]);
    cursor += b[size] + gap;
  }
  return updateElements(els, ids, (el) => ({ [pos]: el[pos] + shift.get(el.id) }));
}

export function assignFrames(els, ids) {
  const frames = els.filter((e) => e.type === "frame");
  const set = new Set(ids);
  return els.map((el) => {
    if (!set.has(el.id)) return el;
    const b = elementBounds(el);
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const own = el.type === "frame" ? descendantsOf(els, [el.id]) : null;
    let frameId = null;
    let best = Infinity;
    for (const f of frames) {
      if (f.id === el.id || own?.has(f.id)) continue;
      const area = f.w * f.h;
      if (el.type === "frame" && area <= el.w * el.h) continue;
      if (area < best && c.x >= f.x && c.x <= f.x + f.w && c.y >= f.y && c.y <= f.y + f.h) {
        frameId = f.id;
        best = area;
      }
    }
    return frameId === (el.frameId ?? null) ? el : touch(el, { frameId });
  });
}

export function elementsInRect(els, rect, { contain = true } = {}) {
  return els.filter((el) => {
    if (el.locked) return false;
    const b = elementBounds(el);
    return contain ? rectContains(rect, b) : rect.x <= b.x + b.w && b.x <= rect.x + rect.w && rect.y <= b.y + b.h && b.y <= rect.y + rect.h;
  });
}

export const isLinear = (el) => LINEAR.has(el.type);
export { center };

export function frameTree(els) {
  const frames = new Set(els.filter((e) => e.type === "frame").map((e) => e.id));
  const kids = new Map();
  const roots = [];
  for (const el of els) {
    if (el.frameId && frames.has(el.frameId) && el.frameId !== el.id) {
      if (!kids.has(el.frameId)) kids.set(el.frameId, []);
      kids.get(el.frameId).push(el);
    } else roots.push(el);
  }
  return { roots, kids };
}

export function renderOrder(els) {
  const { roots, kids } = frameTree(els);
  const out = [];
  const seen = new Set();
  const walk = (el) => {
    if (seen.has(el.id)) return;
    seen.add(el.id);
    out.push(el);
    for (const k of kids.get(el.id) ?? []) walk(k);
  };
  roots.forEach(walk);
  for (const el of els) if (!seen.has(el.id)) walk(el);
  return out;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function replaceText(els, find, replacement, { caseSensitive = false } = {}) {
  if (!find) return { elements: els, count: 0 };
  const re = new RegExp(escapeRegExp(find), caseSensitive ? "g" : "gi");
  let count = 0;
  const swap = (s) => {
    if (typeof s !== "string" || !s) return s;
    const hits = s.match(re)?.length ?? 0;
    count += hits;
    return hits ? s.replace(re, () => replacement) : s;
  };
  const elements = els.map((el) => {
    const before = count;
    const patch = { text: swap(el.text), name: swap(el.name) };
    if (el.cells) patch.cells = el.cells.map((row) => row.map(swap));
    return count === before ? el : touch(el, patch);
  });
  return { elements, count };
}
