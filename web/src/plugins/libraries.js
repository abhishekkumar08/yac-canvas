import { createElement, newId } from "../engine/elements.js";
import { SHAPES } from "../engine/shapes.js";
import { validateBoard } from "../engine/serialize.js";
import { PLUGIN_COPY } from "./copy.js";

const E = PLUGIN_COPY.ERRORS;
export const LIBRARY_TYPE = "yac-canvas/library";
export const LIBRARY_VERSION = 1;
const MAX_ITEMS = 2000;
const MAX_NAME = 200;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v, fallback) => (typeof v === "string" ? v : fallback);

export const exportLibrary = (items) =>
  JSON.stringify({
    type: LIBRARY_TYPE,
    version: LIBRARY_VERSION,
    items: items.map(({ id, name, elements, files }) => ({ id, name, elements, files: files ?? {} })),
  });

function checkElement(el) {
  if (!isObject(el)) throw new Error(E.LIB_FIELD("element"));
  if (el.groupIds !== undefined && !(Array.isArray(el.groupIds) && el.groupIds.every((g) => typeof g === "string"))) throw new Error(E.LIB_FIELD("groupIds"));
  for (const k of ["text", "name", "fileId", "frameId", "stroke", "fill"]) {
    if (el[k] !== undefined && el[k] !== null && typeof el[k] !== "string") throw new Error(E.LIB_FIELD(k));
  }
  if (el.type === "shape" && !Object.hasOwn(SHAPES, el.kind)) throw new Error(E.LIB_FIELD("kind"));
}

function cleanItem(raw, index) {
  const name = typeof raw?.name === "string" ? raw.name.slice(0, MAX_NAME) : "";
  try {
    if (!isObject(raw) || !Array.isArray(raw.elements) || !raw.elements.length) throw new Error(E.LIB_FIELD("elements"));
    const files = raw.files ?? {};
    if (!isObject(files)) throw new Error(E.LIB_FIELD("files"));
    raw.elements.forEach(checkElement);
    validateBoard({ pages: [{ id: "library", elements: raw.elements }], files });
    const elements = raw.elements.map((el) => createElement(el.type, { ...el, groupIds: el.groupIds ?? [], frameId: el.frameId ?? null }));
    return { id: typeof raw.id === "string" && raw.id ? raw.id : newId(), name, elements, files: { ...files } };
  } catch (err) {
    throw new Error(E.LIB_ITEM(name || String(index + 1), err.message));
  }
}

const EX_TYPES = { rectangle: "rect", ellipse: "ellipse", diamond: "diamond", text: "text", line: "line", arrow: "arrow", freedraw: "freedraw" };
const EX_FONTS = { 1: "hand", 2: "sans", 3: "mono", 5: "hand", 6: "sans", 8: "mono" };
const EX_HEADS = { arrow: "arrow", triangle: "triangle", triangle_outline: "triangle", dot: "dot", circle: "dot", circle_outline: "dot", bar: "bar", diamond: "diamond", diamond_outline: "diamond" };
const FILL_STYLES = new Set(["hachure", "cross-hatch", "solid", "zigzag", "dots"]);
const STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const ALIGN = new Set(["left", "center", "right"]);
const V_ALIGN = new Set(["top", "middle", "bottom"]);

function fromExcalidraw(x) {
  const type = EX_TYPES[x.type];
  const props = {
    id: str(x.id, newId()),
    x: num(x.x, 0),
    y: num(x.y, 0),
    w: num(x.width, 0),
    h: num(x.height, 0),
    angle: num(x.angle, 0),
    stroke: str(x.strokeColor, "#1e1e1e"),
    fill: str(x.backgroundColor, "transparent"),
    fillStyle: FILL_STYLES.has(x.fillStyle) ? x.fillStyle : "hachure",
    strokeWidth: num(x.strokeWidth, 2),
    strokeStyle: STROKE_STYLES.has(x.strokeStyle) ? x.strokeStyle : "solid",
    roughness: num(x.roughness, 1),
    opacity: num(x.opacity, 100),
    groupIds: Array.isArray(x.groupIds) ? x.groupIds.filter((g) => typeof g === "string") : [],
  };
  if (Number.isFinite(x.seed)) props.seed = x.seed;
  if (type === "rect" && x.roundness) props.radius = 12;
  if (type === "text") {
    Object.assign(props, {
      text: str(x.text ?? x.originalText, ""),
      fontSize: num(x.fontSize, 20),
      fontFamily: EX_FONTS[x.fontFamily] ?? "hand",
      textAlign: ALIGN.has(x.textAlign) ? x.textAlign : "left",
      verticalAlign: V_ALIGN.has(x.verticalAlign) ? x.verticalAlign : "top",
      fill: "transparent",
    });
  }
  if (type === "line" || type === "arrow" || type === "freedraw") {
    props.points = Array.isArray(x.points) ? x.points : [[0, 0]];
  }
  if (type === "line" || type === "arrow") {
    props.startArrow = EX_HEADS[x.startArrowhead] ?? null;
    props.endArrow = EX_HEADS[x.endArrowhead] ?? null;
  }
  return createElement(type, props);
}

function excalidrawItems(data) {
  const raw = Array.isArray(data.libraryItems) ? data.libraryItems : Array.isArray(data.library) ? data.library.map((elements) => ({ elements })) : null;
  if (!raw) throw new Error(E.LIB_FORMAT);
  return raw.map((item) => {
    const source = Array.isArray(item?.elements) ? item.elements.filter((x) => isObject(x) && !x.isDeleted && EX_TYPES[x.type]) : [];
    const els = source.map(fromExcalidraw);
    const byId = new Map(els.map((e) => [e.id, e]));
    const bound = new Set();
    source.forEach((x, i) => {
      const container = x.type === "text" && typeof x.containerId === "string" ? byId.get(x.containerId) : null;
      if (!container || container.type === "text") return;
      Object.assign(container, { text: els[i].text, fontSize: els[i].fontSize, fontFamily: els[i].fontFamily, textAlign: "center", verticalAlign: "middle" });
      bound.add(els[i].id);
    });
    return { id: item?.id, name: item?.name, elements: els.filter((e) => !bound.has(e.id)), files: {} };
  }).filter((item) => item.elements.length);
}

export function parseLibrary(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(E.LIB_JSON);
  }
  if (!isObject(data)) throw new Error(E.LIB_FORMAT);
  let raw;
  if (data.type === LIBRARY_TYPE) {
    if (!(data.version <= LIBRARY_VERSION)) throw new Error(E.LIB_VERSION);
    if (!Array.isArray(data.items)) throw new Error(E.LIB_FORMAT);
    raw = data.items;
  } else if (data.type === "excalidrawlib") {
    raw = excalidrawItems(data);
  } else {
    throw new Error(E.LIB_FORMAT);
  }
  if (raw.length > MAX_ITEMS) throw new Error(E.LIB_TOO_MANY);
  if (!raw.length) throw new Error(E.LIB_EMPTY);
  return raw.map(cleanItem);
}
