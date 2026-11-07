import { toWorldPoint, LINEAR, center } from "@/engine/geometry.js";
import { connectorWorldPoints } from "@/engine/connectors.js";
import { selectionBounds } from "@/engine/scene.js";

const BOX_HANDLES = [
  ["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0], ["e", 1, 0.5],
  ["se", 1, 1], ["s", 0.5, 1], ["sw", 0, 1], ["w", 0, 0.5],
];

export const ROTATE_OFFSET = 26;

export function getHandles(selected, zoom) {
  const live = selected.filter((e) => !e.locked);
  if (!live.length) return [];
  if (live.length === 1) {
    const el = live[0];
    if (el.type === "line" || el.type === "arrow") {
      const pts = connectorWorldPoints(el);
      const out = pts.map((p, i) => ({ kind: "point", id: el.id, index: i, ...p }));
      if (el.routing === "elbow") return out.filter((h) => h.index === 0 || h.index === pts.length - 1);
      for (let i = 0; i < pts.length - 1; i++) {
        out.push({ kind: "midpoint", id: el.id, index: i + 1, x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 });
      }
      return out;
    }
    const small = el.w * zoom < 24 || el.h * zoom < 24;
    const handles = BOX_HANDLES.filter(([h]) => !small || h.length === 2).map(([handle, fx, fy]) => ({
      kind: "resize",
      handle,
      ...toWorldPoint(el, { x: fx * el.w, y: fy * el.h }),
    }));
    if (!LINEAR.has(el.type) || el.type === "freedraw") {
      handles.push({ kind: "rotate", ...toWorldPoint(el, { x: el.w / 2, y: -ROTATE_OFFSET / zoom }), pivot: center(el) });
    }
    return handles;
  }
  const b = selectionBounds(live, live.map((e) => e.id));
  const handles = BOX_HANDLES.map(([handle, fx, fy]) => ({ kind: "resize", handle, x: b.x + fx * b.w, y: b.y + fy * b.h }));
  handles.push({ kind: "rotate", x: b.x + b.w / 2, y: b.y - ROTATE_OFFSET / zoom, pivot: { x: b.x + b.w / 2, y: b.y + b.h / 2 } });
  return handles;
}

export function handleAt(handles, p, zoom) {
  const r = 7 / zoom;
  for (const h of handles) if (Math.hypot(h.x - p.x, h.y - p.y) <= r) return h;
  return null;
}

export const CURSORS = {
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
  ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
};
