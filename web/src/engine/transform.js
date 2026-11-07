import { center, rotatePoint, toLocal, LINEAR, linearWorldPoints, elementBounds } from "./geometry.js";

const HANDLE_AXES = {
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
  ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
};

export function resizeElement(el, handle, pointer, { keepRatio = false, fromCenter = false } = {}) {
  const [ax, ay] = HANDLE_AXES[handle];
  const lp = toLocal(el, pointer);
  let x1 = 0;
  let y1 = 0;
  let x2 = el.w;
  let y2 = el.h;
  if (ax === 1) x2 = lp.x;
  if (ax === -1) x1 = lp.x;
  if (ay === 1) y2 = lp.y;
  if (ay === -1) y1 = lp.y;
  if (fromCenter) {
    if (ax === 1) x1 = el.w - x2;
    if (ax === -1) x2 = el.w - x1;
    if (ay === 1) y1 = el.h - y2;
    if (ay === -1) y2 = el.h - y1;
  }
  if (keepRatio && el.w && el.h) {
    const ratio = el.w / el.h;
    let w = x2 - x1;
    let h = y2 - y1;
    if (ax && ay) {
      if (Math.abs(w) / ratio > Math.abs(h)) h = Math.sign(h || 1) * Math.abs(w) / ratio;
      else w = Math.sign(w || 1) * Math.abs(h) * ratio;
    } else if (ax) h = Math.abs(w) / ratio;
    else w = Math.abs(h) * ratio;
    if (ax === -1) x1 = x2 - w;
    else if (ax === 1) x2 = x1 + w;
    else {
      x1 = (el.w - w) / 2;
      x2 = x1 + w;
    }
    if (ay === -1) y1 = y2 - h;
    else if (ay === 1) y2 = y1 + h;
    else {
      y1 = (el.h - h) / 2;
      y2 = y1 + h;
    }
    if (fromCenter) {
      const cx = el.w / 2;
      const cy = el.h / 2;
      x1 = cx - Math.abs(w) / 2;
      x2 = cx + Math.abs(w) / 2;
      y1 = cy - Math.abs(h) / 2;
      y2 = cy + Math.abs(h) / 2;
    }
  }
  const flipX = x2 < x1;
  const flipY = y2 < y1;
  const lx = Math.min(x1, x2);
  const ly = Math.min(y1, y2);
  const w = Math.max(1, Math.abs(x2 - x1));
  const h = Math.max(1, Math.abs(y2 - y1));
  const c = center(el);
  const newCenterLocal = { x: el.x + lx + w / 2, y: el.y + ly + h / 2 };
  const nc = rotatePoint(newCenterLocal, c, el.angle || 0);
  const next = { ...el, x: nc.x - w / 2, y: nc.y - h / 2, w, h };
  if (LINEAR.has(el.type) || el.type === "path") return scaleShape(next, el, flipX, flipY);
  return next;
}

function scaleShape(next, el, flipX, flipY) {
  if (el.type === "path") return next;
  const sx = el.w ? next.w / el.w : 1;
  const sy = el.h ? next.h / el.h : 1;
  const minX = Math.min(...el.points.map((p) => p[0]));
  const minY = Math.min(...el.points.map((p) => p[1]));
  const points = el.points.map(([px, py]) => {
    let nx = (px - minX) * sx;
    let ny = (py - minY) * sy;
    if (flipX) nx = next.w - nx;
    if (flipY) ny = next.h - ny;
    return [nx, ny];
  });
  const [ox, oy] = points[0];
  return {
    ...next,
    x: next.x + ox,
    y: next.y + oy,
    points: points.map(([px, py]) => [px - ox, py - oy]),
    w: next.w,
    h: next.h,
  };
}

export function rotateElements(els, pivot, delta) {
  return els.map((el) => {
    if (el.type === "line" || el.type === "arrow") {
      const pts = linearWorldPoints(el).map((p) => rotatePoint(p, pivot, delta));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        ...el,
        angle: 0,
        x: pts[0].x,
        y: pts[0].y,
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        points: pts.map((p) => [p.x - pts[0].x, p.y - pts[0].y]),
      };
    }
    const c = center(el);
    const nc = rotatePoint(c, pivot, delta);
    return { ...el, x: nc.x - el.w / 2, y: nc.y - el.h / 2, angle: normAngle((el.angle || 0) + delta) };
  });
}

const normAngle = (a) => {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
};

export function scaleElements(els, from, to) {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  return els.map((el) => {
    const next = {
      ...el,
      x: to.x + (el.x - from.x) * sx,
      y: to.y + (el.y - from.y) * sy,
      w: Math.max(1, el.w * sx),
      h: Math.max(1, el.h * sy),
    };
    if (el.points) next.points = el.points.map(([px, py]) => [px * sx, py * sy]);
    if (el.fontSize && (el.type === "text" || el.type === "sticky")) next.fontSize = Math.max(4, el.fontSize * Math.min(sx, sy));
    return next;
  });
}

export const moveElements = (els, dx, dy) => els.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy }));

function unionOf(els) {
  const bs = els.map(elementBounds);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
}

export function flipElements(els, axis) {
  if (!els.length) return els;
  const b = unionOf(els);
  const mirror = (v, lo, size) => 2 * lo + size - v;
  return els.map((el) => {
    if (el.points && (el.type === "line" || el.type === "arrow" || el.type === "freedraw")) {
      const pts = el.points.map(([px, py]) => {
        const wx = el.x + px;
        const wy = el.y + py;
        return axis === "x" ? [mirror(wx, b.x, b.w), wy] : [wx, mirror(wy, b.y, b.h)];
      });
      const ox = el.type === "freedraw" ? Math.min(...pts.map((p) => p[0])) : pts[0][0];
      const oy = el.type === "freedraw" ? Math.min(...pts.map((p) => p[1])) : pts[0][1];
      return { ...el, x: ox, y: oy, points: pts.map(([px, py]) => [px - ox, py - oy]) };
    }
    const eb = elementBounds(el);
    const next = { ...el, angle: el.angle ? -el.angle : 0 };
    if (axis === "x") next.x = el.x + (mirror(eb.x + eb.w, b.x, b.w) - eb.x);
    else next.y = el.y + (mirror(eb.y + eb.h, b.y, b.h) - eb.y);
    if (el.type === "path") {
      const flipRing = (ring) => ring.map(([px, py]) => (axis === "x" ? [el.pw - px, py] : [px, el.ph - py]));
      next.rings = el.rings.map(flipRing);
      if (el.polys) next.polys = el.polys.map((poly) => poly.map(flipRing));
      if (el.nodes) next.nodes = el.nodes.map((n) => (axis === "x" ? { ...n, x: el.pw - n.x, hx: -n.hx } : { ...n, y: el.ph - n.y, hy: -n.hy }));
    } else if (axis === "x") next.flipX = !el.flipX;
    else next.flipY = !el.flipY;
    return next;
  });
}

function constrain(mode, pos, size, beforePos, beforeSize, afterPos, afterSize) {
  switch (mode) {
    case "right":
    case "bottom":
      return [afterPos + afterSize - (beforePos + beforeSize - pos), size];
    case "center":
      return [afterPos + afterSize / 2 + (pos + size / 2 - (beforePos + beforeSize / 2)) - size / 2, size];
    case "scale": {
      const k = beforeSize ? afterSize / beforeSize : 1;
      return [afterPos + (pos - beforePos) * k, size * k];
    }
    case "left-right":
    case "top-bottom":
      return [afterPos + (pos - beforePos), Math.max(1, size + afterSize - beforeSize)];
    default:
      return [afterPos + (pos - beforePos), size];
  }
}

export function applyConstraints(children, before, after) {
  return children.map((c) => {
    const { h = "left", v = "top" } = c.constraints ?? {};
    const [x, w] = constrain(h, c.x, c.w, before.x, before.w, after.x, after.w);
    const [y, hh] = constrain(v, c.y, c.h, before.y, before.h, after.y, after.h);
    const next = { ...c, x, y, w, h: hh };
    if (c.points && (h === "scale" || v === "scale")) {
      const sx = c.w ? w / c.w : 1;
      const sy = c.h ? hh / c.h : 1;
      next.points = c.points.map(([px, py]) => [px * sx, py * sy]);
    }
    return next;
  });
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function cropResize(orig, next) {
  const c = orig.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const fullW = orig.w / c.w;
  const fullH = orig.h / c.h;
  const imgX = orig.x - c.x * fullW;
  const imgY = orig.y - c.y * fullH;
  const x1 = Math.max(imgX, next.x);
  const y1 = Math.max(imgY, next.y);
  const x2 = Math.min(imgX + fullW, next.x + next.w);
  const y2 = Math.min(imgY + fullH, next.y + next.h);
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  return {
    ...orig,
    x: x1,
    y: y1,
    w,
    h,
    crop: { x: clamp01((x1 - imgX) / fullW), y: clamp01((y1 - imgY) / fullH), w: clamp01(w / fullW), h: clamp01(h / fullH) },
  };
}
