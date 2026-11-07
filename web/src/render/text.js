export const FONTS = {
  hand: '"Caveat", "Comic Sans MS", cursive',
  sans: '"Inter Variable", Inter, system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
export const LINE_HEIGHT = 1.25;
export const TEXT_PAD = 8;

export const fontFor = (el) => FONTS[el.fontFamily] ?? FONTS.sans;
export const fontCss = (el) => `${el.fontWeight ?? 400} ${el.fontSize}px ${fontFor(el)}`;

let ctx;
let lastFont = "";
export function measureWidth(text, font, size) {
  if (typeof document === "undefined") return text.length * size * 0.55;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (lastFont !== font) {
    ctx.font = font;
    lastFont = font;
  }
  return ctx.measureText(text).width;
}

export function wrapText(text, maxWidth, el) {
  const font = fontCss(el);
  const out = [];
  for (const para of String(text ?? "").split("\n")) {
    if (!Number.isFinite(maxWidth)) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (measureWidth(next, font, el.fontSize) <= maxWidth || !line.trim()) {
        line = next;
        while (measureWidth(line, font, el.fontSize) > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && measureWidth(line.slice(0, cut), font, el.fontSize) > maxWidth) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line);
  }
  return out;
}

export function measureText(text, el) {
  const lines = String(text ?? "").split("\n");
  const font = fontCss(el);
  const w = Math.max(10, ...lines.map((l) => measureWidth(l, font, el.fontSize)));
  return { w: Math.ceil(w) + 2, h: Math.ceil(lines.length * el.fontSize * LINE_HEIGHT) };
}

export function textBox(el) {
  if (el.type === "diamond") return { x: el.w / 4, y: el.h / 4, w: el.w / 2, h: el.h / 2 };
  if (el.type === "ellipse") return { x: el.w * 0.15, y: el.h * 0.15, w: el.w * 0.7, h: el.h * 0.7 };
  return { x: 0, y: 0, w: el.w, h: el.h };
}
