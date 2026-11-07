import { COPY } from "@/ui/copy.js";
import { LEFT_COPY } from "@/ui/copy-left.js";
import { PLUGIN_COPY } from "@/plugins/copy.js";

const B = PLUGIN_COPY.BUILTINS;
const str = (v) => JSON.stringify(v);
const TEXT_TYPES = ["rect", "ellipse", "diamond", "shape", "text", "sticky"];
const FILL_TYPES = ["rect", "ellipse", "diamond", "shape", "sticky", "frame"];

const shuffle = `
const palette = ["#ffc9c9", "#ffd8a8", "#ffec99", "#b2f2bb", "#a5d8ff", "#d0bfff", "#fcc2d7", "#99e9f2"];
const picked = (await canvas.getSelection()).filter((el) => ${str(FILL_TYPES)}.includes(el.type));
if (!picked.length) await canvas.notify(${str(B.SELECT_FIRST)});
else await canvas.updateElements(picked.map((el) => ({ id: el.id, fill: palette[Math.floor(Math.random() * palette.length)], fillStyle: "solid" })));
canvas.close();
`;

const grid = `
const gap = 24;
const picked = await canvas.getSelection();
if (picked.length < 2) {
  await canvas.notify(${str(B.SELECT_FIRST)});
} else {
  const cols = Math.ceil(Math.sqrt(picked.length));
  const cw = Math.max(...picked.map((el) => el.w));
  const ch = Math.max(...picked.map((el) => el.h));
  const x0 = Math.min(...picked.map((el) => el.x));
  const y0 = Math.min(...picked.map((el) => el.y));
  const ordered = [...picked].sort((a, b) => a.y - b.y || a.x - b.x);
  await canvas.updateElements(ordered.map((el, i) => ({ id: el.id, x: x0 + (i % cols) * (cw + gap), y: y0 + Math.floor(i / cols) * (ch + gap) })));
}
canvas.close();
`;

const lorem = `
const sentences = ${str(B.SENTENCES)};
const pick = () => sentences[Math.floor(Math.random() * sentences.length)];
const picked = (await canvas.getSelection()).filter((el) => ${str(TEXT_TYPES)}.includes(el.type));
if (!picked.length) await canvas.notify(${str(B.SELECT_FIRST)});
else await canvas.updateElements(picked.map((el) => ({ id: el.id, text: Math.random() < 0.5 ? pick() : pick() + " " + pick() })));
canvas.close();
`;

const count = `
const labels = ${str({ ...COPY.TOOLS, ...LEFT_COPY.TYPES })};
const all = await canvas.getElements();
if (!all.length) {
  await canvas.notify(${str(B.EMPTY_PAGE)});
} else {
  const counts = {};
  for (const el of all) counts[el.type] = (counts[el.type] || 0) + 1;
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, n]) => n + " × " + (labels[type] || type));
  await canvas.notify(all.length + " " + ${str(B.COUNT_TOTAL)} + ": " + parts.join(", "));
}
canvas.close();
`;

export const BUILTIN_PLUGINS = [
  { id: "builtin.shuffle", name: B.SHUFFLE.NAME, description: B.SHUFFLE.DESCRIPTION, code: shuffle },
  { id: "builtin.grid", name: B.GRID.NAME, description: B.GRID.DESCRIPTION, code: grid },
  { id: "builtin.lorem", name: B.LOREM.NAME, description: B.LOREM.DESCRIPTION, code: lorem },
  { id: "builtin.count", name: B.COUNT.NAME, description: B.COUNT.DESCRIPTION, code: count },
];

export const PLUGIN_TEMPLATE = `// Your plugin runs inside an async function, so you can use await at the top level.
// It runs in a sandbox: no network, no cookies, no access to the page.
// Everything goes through the global \`canvas\` object; each call returns a promise.
//
//   await canvas.getSelection()            -> selected elements
//   await canvas.getElements()             -> every element on the page
//   await canvas.getPage()                 -> { name, background }
//   await canvas.createElements([{ type: "rect", x, y, w, h, fill, text }]) -> new ids
//   await canvas.updateElements([{ id, x, y, w, h, fill, stroke, text, ... }])
//   await canvas.deleteElements(ids)
//   await canvas.select(ids)
//   await canvas.zoomToFit()
//   await canvas.notify("Hello")
//   await canvas.showUI("<p>html</p>", { width: 320, height: 240 })
//   canvas.onMessage((data) => { ... })    -> messages from your UI
//   await canvas.postMessage(data)         -> send to your UI (inside the UI, use the same two calls)
//   canvas.close()                         -> always call this when you are done
//
// Types you can create: rect, ellipse, diamond, shape (with kind), text, sticky, frame, line, arrow, freedraw.
// Style keys: stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, opacity, radius,
// fontSize, fontFamily, textAlign, verticalAlign, textColor, shadow, name, points.

const picked = await canvas.getSelection();
if (!picked.length) {
  await canvas.createElements([{ type: "sticky", x: 0, y: 0, w: 160, h: 160, text: "Hello from a plugin" }]);
  await canvas.zoomToFit();
  canvas.close();
} else {
  await canvas.showUI(\`
    <p style="font: 14px system-ui">Make the selection bigger?</p>
    <button onclick="canvas.postMessage('grow')">Grow</button>
    <button onclick="canvas.postMessage('done')">Done</button>
  \`, { width: 260, height: 120 });
  canvas.onMessage(async (msg) => {
    if (msg === "grow") {
      const now = await canvas.getSelection();
      await canvas.updateElements(now.map((el) => ({ id: el.id, w: el.w * 1.2, h: el.h * 1.2 })));
    }
    if (msg === "done") canvas.close();
  });
}
`;
