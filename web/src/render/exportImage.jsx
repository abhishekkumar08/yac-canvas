import { renderToStaticMarkup } from "react-dom/server";
import { elementBounds, unionBounds } from "@/engine/geometry.js";
import { expandSelection, renderOrder } from "@/engine/scene.js";
import { SceneTree } from "@/render/SceneTree.jsx";
import caveatUrl from "@fontsource/caveat/files/caveat-latin-400-normal.woff2?url";

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

let fontDataUrl = null;
async function caveatData() {
  if (fontDataUrl) return fontDataUrl;
  const blob = await fetch(caveatUrl).then((r) => r.blob());
  fontDataUrl = await blobToDataUrl(blob);
  return fontDataUrl;
}

export async function exportSvg(board, page, { ids, background = true, padding = 24, dark = false } = {}) {
  const all = page.elements;
  const wanted = ids?.length ? new Set(expandSelection(all, ids, { withFrameChildren: true })) : null;
  const els = renderOrder(all).filter((e) => !e.hidden && (!wanted || wanted.has(e.id)));
  const scene = all.filter((e) => !wanted || wanted.has(e.id)).map((e) => (e.frameId && wanted && !wanted.has(e.frameId) ? { ...e, frameId: null } : e));
  if (!els.length) return null;
  const b = unionBounds(els.map(elementBounds));
  const x = b.x - padding;
  const y = b.y - padding - 20;
  const w = b.w + padding * 2;
  const h = b.h + padding * 2 + 20;
  const bg = page.background ?? "#ffffff";
  const font = await caveatData();
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${x} ${y} ${w} ${h}`} width={w} height={h}>
      <defs>
        <style>{`@font-face{font-family:"Caveat";src:url(${font}) format("woff2");}`}</style>
        <filter id="yc-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.18" />
        </filter>
      </defs>
      {background && <rect x={x} y={y} width={w} height={h} fill={bg} />}
      <g style={dark ? { filter: "invert(93%) hue-rotate(180deg)" } : undefined}>
        <SceneTree elements={scene} files={board.files} bg={bg} zoom={1} idPrefix="xclip" />
      </g>
    </svg>,
  );
  return { svg: markup, width: w, height: h };
}

export async function svgToPngBlob({ svg, width, height }, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("The image could not be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeName = (name) => (name || "board").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "board";
