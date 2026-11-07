import pc from "polygon-clipping";
import { outline, toWorldPoint } from "./geometry.js";
import { createElement } from "./elements.js";

const OPS = { union: "union", subtract: "difference", intersect: "intersection", exclude: "xor" };

function worldPolygons(el) {
  if (el.type === "path") {
    const polys = el.polys ?? (el.rings ?? []).map((r) => [r]);
    const sx = el.w / (el.pw || 1);
    const sy = el.h / (el.ph || 1);
    return polys.map((poly) => poly.map((ring) => ring.map(([x, y]) => {
      const p = toWorldPoint(el, { x: x * sx, y: y * sy });
      return [p.x, p.y];
    })));
  }
  return [[outline(el).map((p) => [p.x, p.y])]];
}

export const ringsToD = (rings) => rings.map((ring) => `M${ring.map(([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join(" L")} Z`).join(" ");

export function booleanOp(op, els) {
  if (els.length < 2) return null;
  const [first, ...rest] = els.map(worldPolygons);
  const result = pc[OPS[op]](first, ...rest);
  if (!result.length) return null;
  const all = result.flat(2);
  const minX = Math.min(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const w = Math.max(...all.map((p) => p[0])) - minX;
  const h = Math.max(...all.map((p) => p[1])) - minY;
  const polys = result.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x - minX, y - minY])));
  const base = els[0];
  return createElement("path", {
    x: minX,
    y: minY,
    w,
    h,
    pw: w,
    ph: h,
    polys,
    rings: polys.flat(),
    stroke: base.stroke,
    fill: base.fill === "transparent" ? "#ced4da" : base.fill,
    fillStyle: base.fillStyle,
    strokeWidth: base.strokeWidth,
    strokeStyle: base.strokeStyle,
    roughness: base.roughness,
    opacity: base.opacity,
  });
}
