import { shapePolygon } from "./shapes.js";

export const LINEAR = new Set(["line", "arrow", "freedraw"]);
const FRAME_TITLE = 24;

export const center = (el) => ({ x: el.x + el.w / 2, y: el.y + el.h / 2 });

export function rotatePoint(p, c, angle) {
  if (!angle) return { x: p.x, y: p.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export function toLocal(el, p) {
  const q = rotatePoint(p, center(el), -(el.angle || 0));
  return { x: q.x - el.x, y: q.y - el.y };
}

export function toWorldPoint(el, lp) {
  return rotatePoint({ x: el.x + lp.x, y: el.y + lp.y }, center(el), el.angle || 0);
}

export function boundsOfPoints(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function linearWorldPoints(el) {
  const c = center(el);
  return el.points.map(([px, py]) => rotatePoint({ x: el.x + px, y: el.y + py }, c, el.angle || 0));
}

const boundsCache = new WeakMap();

export function elementBounds(el) {
  let b = boundsCache.get(el);
  if (b) return { ...b };
  if (LINEAR.has(el.type)) b = boundsOfPoints(linearWorldPoints(el));
  else if (!el.angle) b = { x: el.x, y: el.y, w: el.w, h: el.h };
  else b = boundsOfPoints(cornerPoints(el));
  boundsCache.set(el, b);
  return { ...b };
}

export function unionBounds(list) {
  if (!list.length) return null;
  const pts = [];
  for (const b of list) pts.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
  return boundsOfPoints(pts);
}

export function cornerPoints(el) {
  return [
    { x: 0, y: 0 },
    { x: el.w, y: 0 },
    { x: el.w, y: el.h },
    { x: 0, y: el.h },
  ].map((p) => toWorldPoint(el, p));
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToPolyline(p, pts, closed) {
  let d = Infinity;
  const n = pts.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) d = Math.min(d, distToSegment(p, pts[i], pts[(i + 1) % n]));
  return d;
}

export const rectsIntersect = (a, b) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

export const rectContains = (outer, inner) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

function ellipsePoly(w, h, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: w / 2 + (w / 2) * Math.cos(t), y: h / 2 + (h / 2) * Math.sin(t) });
  }
  return pts;
}

export function localPolygon(el) {
  switch (el.type) {
    case "ellipse":
      return ellipsePoly(el.w, el.h);
    case "diamond":
      return [
        { x: el.w / 2, y: 0 },
        { x: el.w, y: el.h / 2 },
        { x: el.w / 2, y: el.h },
        { x: 0, y: el.h / 2 },
      ];
    case "shape":
      return shapePolygon(el.kind, el.w, el.h);
    case "path":
      return (el.rings?.[0] ?? []).map(([x, y]) => ({ x: (x * el.w) / (el.pw || 1), y: (y * el.h) / (el.ph || 1) }));
    default:
      return [
        { x: 0, y: 0 },
        { x: el.w, y: 0 },
        { x: el.w, y: el.h },
        { x: 0, y: el.h },
      ];
  }
}

export function outline(el) {
  return localPolygon(el).map((p) => toWorldPoint(el, p));
}

const isFilled = (el) => el.fill && el.fill !== "transparent";

export function hitTest(el, p, tol = 4) {
  const half = (el.strokeWidth || 1) / 2;
  if (LINEAR.has(el.type)) return distToPolyline(p, linearWorldPoints(el), false) <= tol + half;
  const lp = toLocal(el, p);
  if (el.type === "frame") {
    if (lp.x >= -tol && lp.x <= el.w + tol && lp.y >= -FRAME_TITLE && lp.y <= 0) return true;
    return distToPolyline(lp, localPolygon(el), true) <= tol + half;
  }
  if (["text", "image", "sticky", "table", "instance"].includes(el.type)) {
    return lp.x >= -tol && lp.y >= -tol && lp.x <= el.w + tol && lp.y <= el.h + tol;
  }
  if (el.type === "path" && el.rings?.length > 1) {
    const sx = el.w / (el.pw || 1);
    const sy = el.h / (el.ph || 1);
    let inside = false;
    let d = Infinity;
    for (const ring of el.rings) {
      const pts = ring.map(([x, y]) => ({ x: x * sx, y: y * sy }));
      if (pointInPolygon(lp, pts)) inside = !inside;
      d = Math.min(d, distToPolyline(lp, pts, true));
    }
    return d <= tol + half || (inside && isFilled(el));
  }
  const poly = localPolygon(el);
  if (distToPolyline(lp, poly, true) <= tol + half) return true;
  if (!isFilled(el) && !el.text) return false;
  return pointInPolygon(lp, poly);
}

function raySegment(o, d, a, b) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
  const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

export function borderPoint(el, toward) {
  const c = center(el);
  const d = { x: toward.x - c.x, y: toward.y - c.y };
  if (!d.x && !d.y) return c;
  const poly = outline(el);
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const t = raySegment(c, d, poly[i], poly[(i + 1) % poly.length]);
    if (t !== null && (best === null || t > best)) best = t;
  }
  if (best === null) return c;
  return { x: c.x + d.x * best, y: c.y + d.y * best };
}

export function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

export function pointAlong(pts, frac) {
  const total = polylineLength(pts);
  let target = total * frac;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (target <= seg && seg > 0) {
      const t = target / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    target -= seg;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}
