import { LINEAR, hitTest, toLocal } from "./geometry.js";
import { descendantsOf, renderOrder } from "./scene.js";

const NONE = { kind: null, target: null };
const URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function parseLink(link) {
  if (typeof link !== "string") return NONE;
  const s = link.trim();
  for (const kind of ["frame", "page"]) {
    const prefix = `#${kind}:`;
    if (s.startsWith(prefix)) return s.length > prefix.length ? { kind, target: s.slice(prefix.length) } : NONE;
  }
  try {
    const url = new URL(s);
    if (!URL_PROTOCOLS.has(url.protocol)) return NONE;
    if (url.protocol === "mailto:" ? !url.pathname : !url.hostname) return NONE;
    return { kind: "url", target: url.href };
  } catch {
    return NONE;
  }
}

export function presentationFrames(page) {
  const frames = (page?.elements ?? []).filter((e) => e.type === "frame" && !e.frameId && !e.hidden);
  const byY = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const f of byY) {
    const row = rows.at(-1);
    if (row && f.y < row[0].y + row[0].h / 2) row.push(f);
    else rows.push([f]);
  }
  const auto = rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
  if (!Array.isArray(page?.presentationOrder)) return auto;
  const byId = new Map(frames.map((f) => [f.id, f]));
  const ordered = [...new Set(page.presentationOrder)].map((id) => byId.get(id)).filter(Boolean);
  const listed = new Set(ordered.map((f) => f.id));
  return [...ordered, ...auto.filter((f) => !listed.has(f.id))];
}

const inBox = (el, p) => {
  const lp = toLocal(el, p);
  return lp.x >= 0 && lp.y >= 0 && lp.x <= el.w && lp.y <= el.h;
};

const solidHit = (el, p) => (el.type === "frame" ? inBox(el, p) : hitTest({ ...el, fill: "#000" }, p, LINEAR.has(el.type) ? 4 : 0));

export function linkAt(elements, frame, point) {
  if (!frame || !inBox(frame, point)) return null;
  const inside = descendantsOf(elements, [frame.id]);
  const byId = new Map(elements.map((e) => [e.id, e]));
  const reachable = (el) => {
    for (let p = byId.get(el.frameId); p && p.id !== frame.id; p = byId.get(p.frameId)) {
      if (p.hidden || (p.clip !== false && !inBox(p, point))) return false;
    }
    return true;
  };
  const order = renderOrder(elements);
  for (let i = order.length - 1; i >= 0; i--) {
    const el = order[i];
    if (!inside.has(el.id) || el.hidden || !el.link) continue;
    if (solidHit(el, point) && reachable(el)) return el;
  }
  return null;
}

export function nextFrameId(frames, currentId, dir) {
  if (!frames.length) return null;
  const i = frames.findIndex((f) => f.id === currentId);
  if (i < 0) return frames[0].id;
  return frames[Math.max(0, Math.min(frames.length - 1, i + dir))].id;
}
