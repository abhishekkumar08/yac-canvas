export const ELEMENT_TYPES = [
  "rect", "ellipse", "diamond", "shape", "text", "sticky", "frame", "image",
  "freedraw", "line", "arrow", "path", "table", "instance",
];

export const DEFAULT_STYLE = {
  stroke: "#1e1e1e",
  fill: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  radius: 0,
  shadow: false,
  fontSize: 20,
  fontFamily: "hand",
  textAlign: "center",
  verticalAlign: "middle",
  textColor: null,
};

const TYPE_DEFAULTS = {
  text: { fill: "transparent", textAlign: "left", verticalAlign: "top", autoSize: true },
  sticky: { fill: "#fff3a3", fillStyle: "solid", stroke: "transparent", shadow: true, fontSize: 22, roughness: 0 },
  frame: { fill: "#ffffff", fillStyle: "solid", stroke: "#c4c4cc", strokeWidth: 1, roughness: 0, name: "Frame", layout: null, isComponent: false },
  image: { fill: "transparent", strokeWidth: 0, stroke: "transparent" },
  line: { points: [[0, 0], [0, 0]], routing: "straight", startBinding: null, endBinding: null, startArrow: null, endArrow: null },
  arrow: { points: [[0, 0], [0, 0]], routing: "straight", startBinding: null, endBinding: null, startArrow: null, endArrow: "arrow" },
  freedraw: { points: [[0, 0]], fill: "transparent" },
  table: { rows: 3, cols: 3, cells: null, header: true, fill: "#ffffff", fillStyle: "solid", roughness: 0, fontSize: 16, fontFamily: "sans" },
  instance: { fill: "transparent" },
  path: { rings: [], pw: 1, ph: 1, closed: true },
};

const rand = () => Math.floor(Math.random() * 2 ** 31);

export const newId = () =>
  globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 12) : `e${rand().toString(36)}${Date.now().toString(36)}`;

export function createElement(type, props = {}) {
  const el = {
    id: newId(),
    type,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    angle: 0,
    ...DEFAULT_STYLE,
    groupIds: [],
    locked: false,
    frameId: null,
    text: "",
    ...TYPE_DEFAULTS[type],
    ...props,
    seed: props.seed ?? rand(),
    version: props.version ?? 1,
  };
  if (type === "table" && !el.cells) el.cells = Array.from({ length: el.rows }, () => Array(el.cols).fill(""));
  return el;
}

export const reseed = () => rand();
