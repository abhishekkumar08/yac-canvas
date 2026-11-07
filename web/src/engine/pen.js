import { boundsOfPoints, toWorldPoint, rotatePoint } from "./geometry.js";

function sampleCubic(a, c1, c2, b, n = 16) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    out.push({
      x: mt ** 3 * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * b.x,
      y: mt ** 3 * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * b.y,
    });
  }
  return out;
}

export function penNodesToPoints(nodes, closed) {
  if (!nodes.length) return [];
  const pts = [{ x: nodes[0].x, y: nodes[0].y }];
  const seg = (a, b) => {
    if (!a.hx && !a.hy && !b.hx && !b.hy) return [{ x: b.x, y: b.y }];
    return sampleCubic(a, { x: a.x + (a.hx ?? 0), y: a.y + (a.hy ?? 0) }, { x: b.x - (b.hx ?? 0), y: b.y - (b.hy ?? 0) }, b);
  };
  for (let i = 1; i < nodes.length; i++) pts.push(...seg(nodes[i - 1], nodes[i]));
  if (closed && nodes.length > 2) pts.push(...seg(nodes.at(-1), nodes[0]).slice(0, -1));
  return pts;
}

export function pathFromNodes(worldNodes, closed) {
  const pts = penNodesToPoints(worldNodes, closed);
  const b = boundsOfPoints(pts);
  const w = Math.max(1, b.w);
  const h = Math.max(1, b.h);
  return {
    x: b.x,
    y: b.y,
    w,
    h,
    pw: w,
    ph: h,
    angle: 0,
    closed,
    rings: [pts.map((p) => [p.x - b.x, p.y - b.y])],
    polys: undefined,
    nodes: worldNodes.map((n) => ({ x: n.x - b.x, y: n.y - b.y, hx: n.hx ?? 0, hy: n.hy ?? 0 })),
  };
}

export function pathNodesWorld(el) {
  const sx = el.w / (el.pw || 1);
  const sy = el.h / (el.ph || 1);
  return (el.nodes ?? []).map((n) => {
    const p = toWorldPoint(el, { x: n.x * sx, y: n.y * sy });
    const hv = rotatePoint({ x: n.hx * sx, y: n.hy * sy }, { x: 0, y: 0 }, el.angle || 0);
    return { x: p.x, y: p.y, hx: hv.x, hy: hv.y };
  });
}
