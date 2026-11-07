import rough from "roughjs";

const gen = rough.generator();
const cache = new WeakMap();

const dash = (el) => (el.strokeStyle === "dashed" ? [8, 8] : el.strokeStyle === "dotted" ? [1.5, 6] : undefined);

export function roughOptions(el, { fill = true } = {}) {
  const sw = el.strokeWidth || 1;
  const hasFill = fill && el.fill && el.fill !== "transparent";
  return {
    seed: el.seed % 2 ** 31 || 1,
    roughness: el.roughness ?? 1,
    bowing: 1,
    stroke: el.stroke === "transparent" ? "none" : el.stroke,
    strokeWidth: el.stroke === "transparent" ? 0 : sw,
    fill: hasFill ? el.fill : undefined,
    fillStyle: el.fillStyle === "none" ? "solid" : el.fillStyle || "hachure",
    fillWeight: sw / 2,
    hachureGap: sw * 4,
    strokeLineDash: dash(el),
    disableMultiStroke: el.strokeStyle !== "solid",
    preserveVertices: true,
  };
}

const SHAPE_KEYS = ["type", "kind", "w", "h", "seed", "stroke", "fill", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "radius", "routing", "points", "rings", "pw", "ph"];
const bySignature = new Map();

// ponytail: drawings are cached by shape signature (not position) so drags don't redraw hatching; capped by insertion order.
export function roughPaths(el, key, build) {
  let byKey = cache.get(el);
  if (!byKey) cache.set(el, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);
  const sig = `${key}|${JSON.stringify(SHAPE_KEYS.map((k) => el[k]))}`;
  let paths = bySignature.get(sig);
  if (!paths) {
    paths = gen.toPaths(build(gen));
    bySignature.set(sig, paths);
    if (bySignature.size > 4000) bySignature.delete(bySignature.keys().next().value);
  }
  byKey.set(key, paths);
  return paths;
}

export { dash };
