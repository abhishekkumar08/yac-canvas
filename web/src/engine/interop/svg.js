const PROLOG = /^\s*(?:<\?xml[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>\s*)*<svg[\s>]/i;

const safeRef = (v) => /^\s*(#|data:)/i.test(v);

export function sanitizeSvg(svgText) {
  const src = String(svgText ?? "");
  if (!PROLOG.test(src) || !/<\/svg\s*>\s*$/i.test(src.replace(/<!--[\s\S]*?-->/g, ""))) throw new Error("This is not an SVG file.");
  return src
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>/gi, "")
    .replace(/<(?:[\w-]+:)?script\b[\s\S]*?(?:<\/(?:[\w-]+:)?script\s*>|\/>|$)/gi, "")
    .replace(/<(?:[\w-]+:)?foreignObject\b[\s\S]*?(?:<\/(?:[\w-]+:)?foreignObject\s*>|\/>|$)/gi, "")
    .replace(/<[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, (tag) =>
      tag
        .replace(/\s+on[\w.-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s+(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m, a, b, c) => (safeRef(a ?? b ?? c ?? "") ? m : "")),
    )
    .replace(/url\(\s*['"]?(?!\s*(?:#|data:))[^)]*\)/gi, "none");
}

const length = (v) => {
  if (!v || /%$/.test(v.trim())) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function base64(text) {
  if (globalThis.Buffer) return globalThis.Buffer.from(text, "utf8").toString("base64");
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function svgToImage(svgText) {
  const clean = sanitizeSvg(svgText);
  const tag = /<svg\b[^>]*>/i.exec(clean)[0];
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find((v) => v !== undefined) ?? null;
  const vb = (attr("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  let w = length(attr("width"));
  let h = length(attr("height"));
  if (hasVb) {
    if (!w && !h) [w, h] = [vb[2], vb[3]];
    else if (!w) w = (h * vb[2]) / vb[3];
    else if (!h) h = (w * vb[3]) / vb[2];
  }
  return { dataUrl: `data:image/svg+xml;base64,${base64(clean)}`, w: w ?? 300, h: h ?? 150 };
}
