import { createElement, newId } from "../elements.js";

const IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const FILL_STYLES = new Set(["hachure", "cross-hatch", "solid", "zigzag"]);
const STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const FONT_IN = { 1: "hand", 5: "hand", 2: "sans", 6: "sans", 3: "mono", 8: "mono" };
const FONT_OUT = { hand: 1, sans: 2, mono: 3 };
const HEAD_IN = { arrow: "arrow", bar: "bar", dot: "dot", circle: "dot", circle_outline: "dot", triangle: "triangle", triangle_outline: "triangle", diamond: "diamond", diamond_outline: "diamond" };
const TYPE_IN = { rectangle: "rect", embeddable: "rect", iframe: "rect", ellipse: "ellipse", diamond: "diamond", text: "text", arrow: "arrow", line: "line", freedraw: "freedraw", image: "image", frame: "frame", magicframe: "frame" };
const TYPE_OUT = { rect: "rectangle", ellipse: "ellipse", diamond: "diamond", shape: "rectangle", sticky: "rectangle", table: "rectangle", text: "text", arrow: "arrow", line: "line", freedraw: "freedraw", image: "image", frame: "frame" };

const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const color = (v, d) => (typeof v === "string" && v ? v : d);
const pts = (list) => (Array.isArray(list) ? list.filter((p) => Array.isArray(p)).map(([x, y]) => [num(x), num(y)]) : []);
const rand = () => Math.floor(Math.random() * 2 ** 31);

function style(x) {
  return {
    stroke: color(x.strokeColor, "#1e1e1e"),
    fill: color(x.backgroundColor, "transparent"),
    fillStyle: FILL_STYLES.has(x.fillStyle) ? x.fillStyle : "hachure",
    strokeWidth: num(x.strokeWidth, 2),
    strokeStyle: STROKE_STYLES.has(x.strokeStyle) ? x.strokeStyle : "solid",
    roughness: [0, 1, 2].includes(x.roughness) ? x.roughness : 1,
    opacity: Math.min(100, Math.max(0, num(x.opacity, 100))),
  };
}

const textProps = (t) => ({
  fontSize: num(t.fontSize, 20),
  fontFamily: FONT_IN[t.fontFamily] ?? "hand",
  textAlign: ["left", "center", "right"].includes(t.textAlign) ? t.textAlign : "left",
  verticalAlign: ["top", "middle", "bottom"].includes(t.verticalAlign) ? t.verticalAlign : "top",
});

const binding = (b, ids) => {
  const id = b && ids.get(b.elementId);
  if (!id) return null;
  if (Array.isArray(b.fixedPoint)) return { id, fx: num(b.fixedPoint[0], 0.5), fy: num(b.fixedPoint[1], 0.5), fixed: true };
  return { id, fx: 0.5, fy: 0.5, fixed: false };
};

export function importExcalidraw(json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  if (!data || !String(data.type ?? "").startsWith("excalidraw") || !Array.isArray(data.elements)) throw new Error("This is not an Excalidraw file.");
  const live = data.elements.filter((x) => x && !x.isDeleted && TYPE_IN[x.type]);
  const ids = new Map(live.map((x) => [x.id, newId()]));
  const groups = new Map();
  const group = (g) => (groups.has(g) ? groups.get(g) : groups.set(g, newId()).get(g));
  const bound = new Map(live.filter((x) => x.type === "text" && x.containerId && ids.has(x.containerId)).map((t) => [t.containerId, t]));
  const out = [];
  for (const x of live) {
    if (x.type === "text" && bound.get(x.containerId) === x) continue;
    const type = TYPE_IN[x.type];
    const props = {
      id: ids.get(x.id),
      x: num(x.x),
      y: num(x.y),
      w: Math.abs(num(x.width)),
      h: Math.abs(num(x.height)),
      angle: num(x.angle),
      groupIds: Array.isArray(x.groupIds) ? x.groupIds.map(group) : [],
      frameId: x.frameId ? ids.get(x.frameId) ?? null : null,
      locked: !!x.locked,
    };
    if (type !== "frame") Object.assign(props, style(x));
    if (type === "rect" && x.roundness) props.radius = 12;
    if (x.type === "embeddable" || x.type === "iframe") props.text = String(x.link ?? "");
    if (type === "text") Object.assign(props, textProps(x), { text: String(x.originalText ?? x.text ?? ""), fill: "transparent" });
    if (type === "frame") props.name = String(x.name ?? "Frame");
    if (type === "image") props.fileId = x.fileId ?? null;
    if (type === "freedraw") props.points = pts(x.points).length ? pts(x.points) : [[0, 0]];
    if (type === "arrow" || type === "line") {
      const p = pts(x.points);
      Object.assign(props, {
        points: p.length >= 2 ? p : [[0, 0], [props.w, props.h]],
        routing: x.elbowed ? "elbow" : x.roundness ? "curved" : "straight",
        startBinding: binding(x.startBinding, ids),
        endBinding: binding(x.endBinding, ids),
        startArrow: HEAD_IN[x.startArrowhead] ?? null,
        endArrow: HEAD_IN[x.endArrowhead] ?? null,
      });
    }
    const label = bound.get(x.id);
    if (label) Object.assign(props, textProps(label), { text: String(label.originalText ?? label.text ?? "") }, label.strokeColor && label.strokeColor !== props.stroke ? { textColor: label.strokeColor } : {});
    out.push(createElement(type, props));
  }
  const files = {};
  for (const [id, f] of Object.entries(data.files ?? {})) if (typeof f?.dataURL === "string" && IMAGE_DATA.test(f.dataURL)) files[id] = f.dataURL;
  return { elements: out, files };
}

const mimeOf = (url) => /^data:([^;,]+)/.exec(url)?.[1] ?? "image/png";

export function exportExcalidraw(board, page = board.pages[0]) {
  const now = Date.now();
  const out = [];
  const base = (el, type, extra = {}) => ({
    id: el.id,
    type,
    x: el.x,
    y: el.y,
    width: el.w,
    height: el.h,
    angle: el.angle || 0,
    strokeColor: el.stroke ?? "#1e1e1e",
    backgroundColor: el.fill ?? "transparent",
    fillStyle: FILL_STYLES.has(el.fillStyle) ? el.fillStyle : "solid",
    strokeWidth: el.strokeWidth ?? 2,
    strokeStyle: el.strokeStyle ?? "solid",
    roughness: el.roughness ?? 1,
    opacity: el.opacity ?? 100,
    groupIds: el.groupIds ?? [],
    frameId: el.frameId ?? null,
    roundness: null,
    seed: el.seed ?? rand(),
    version: el.version ?? 1,
    versionNonce: rand(),
    isDeleted: false,
    boundElements: [],
    updated: now,
    link: null,
    locked: !!el.locked,
    ...extra,
  });
  const text = (el, extra) => ({
    text: el.text,
    originalText: el.text,
    fontSize: el.fontSize ?? 20,
    fontFamily: FONT_OUT[el.fontFamily] ?? 1,
    textAlign: el.textAlign ?? "left",
    verticalAlign: el.verticalAlign ?? "top",
    lineHeight: 1.25,
    autoResize: true,
    containerId: null,
    ...extra,
  });
  const exBinding = (b) => (b ? { elementId: b.id, focus: 0, gap: 4, ...(b.fixed ? { fixedPoint: [b.fx, b.fy] } : {}) } : null);
  const byId = new Map();
  const files = {};
  for (const el of page.elements) {
    const type = TYPE_OUT[el.type];
    if (!type) continue;
    let x;
    if (type === "text") x = base(el, "text", { ...text(el), strokeColor: el.textColor ?? el.stroke ?? "#1e1e1e" });
    else if (type === "frame") x = base(el, "frame", { name: el.name ?? "Frame" });
    else if (type === "image") {
      x = base(el, "image", { fileId: el.fileId ?? null, status: "saved", scale: [1, 1] });
      const url = board.files?.[el.fileId];
      if (url) files[el.fileId] = { mimeType: mimeOf(url), id: el.fileId, dataURL: url, created: now };
    } else if (type === "freedraw") x = base(el, "freedraw", { points: el.points, pressures: [], simulatePressure: true });
    else if (type === "arrow" || type === "line") {
      x = base(el, type, {
        points: el.points,
        lastCommittedPoint: null,
        startBinding: exBinding(el.startBinding),
        endBinding: exBinding(el.endBinding),
        startArrowhead: el.startArrow ?? null,
        endArrowhead: el.endArrow ?? null,
        roundness: el.routing === "curved" ? { type: 2 } : null,
        elbowed: el.routing === "elbow",
      });
    } else x = base(el, type, { roundness: el.radius ? { type: 3 } : null });
    out.push(x);
    byId.set(el.id, x);
    const cells = el.type === "table" && Array.isArray(el.cells) ? el.cells.map((r) => r.join("\t")).join("\n") : "";
    const label = el.text || cells;
    if (label && type !== "text" && type !== "frame") {
      const id = newId();
      x.boundElements.push({ id, type: "text" });
      out.push(base(el, "text", { ...text({ ...el, text: label }), id, strokeColor: el.textColor ?? (el.stroke === "transparent" ? "#1e1e1e" : el.stroke), backgroundColor: "transparent", containerId: el.id, groupIds: el.groupIds ?? [], angle: 0, seed: rand(), version: 1 }));
    }
  }
  for (const x of out) {
    for (const key of ["startBinding", "endBinding"]) {
      const target = x[key] && byId.get(x[key].elementId);
      if (target) target.boundElements.push({ id: x.id, type: x.type });
      else if (x[key]) x[key] = null;
    }
  }
  return {
    type: "excalidraw",
    version: 2,
    source: "yac-canvas",
    elements: out,
    appState: { viewBackgroundColor: page.background ?? "#ffffff", gridSize: page.grid ? 20 : null },
    files,
  };
}
