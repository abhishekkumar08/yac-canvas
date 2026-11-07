import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import { flipElements, applyConstraints } from "../web/src/engine/transform.js";
import { gridLayout, circleLayout } from "../web/src/engine/layout.js";
import { replaceText } from "../web/src/engine/scene.js";
import { cssFor } from "../web/src/engine/css.js";

const box = (id, x, y, p = {}) => createElement("rect", { id, x, y, w: 100, h: 50, ...p });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("flip horizontally mirrors positions across the selection and toggles flipX", () => {
  const [a, b] = flipElements([box("a", 0, 0), box("b", 200, 0)], "x");
  assert.deepEqual([a.x, b.x, a.flipX, b.flipX], [200, 0, true, true]);
});

test("flipping a line mirrors its points", () => {
  const ln = createElement("line", { id: "l", x: 0, y: 0, w: 100, h: 50, points: [[0, 0], [100, 50]] });
  const [f] = flipElements([ln], "y");
  const world = f.points.map(([px, py]) => [f.x + px, f.y + py]);
  assert.deepEqual(world, [[0, 50], [100, 0]]);
});

test("constraints: left/top stays, right moves, scale stretches, left-right grows", () => {
  const before = { x: 0, y: 0, w: 400, h: 300 };
  const after = { x: 0, y: 0, w: 600, h: 300 };
  const kids = [
    box("l", 10, 10),
    box("r", 290, 10, { constraints: { h: "right", v: "top" } }),
    box("s", 100, 10, { constraints: { h: "scale", v: "top" } }),
    box("lr", 20, 100, { w: 360, constraints: { h: "left-right", v: "top" } }),
    box("c", 150, 100, { constraints: { h: "center", v: "center" } }),
  ];
  const out = Object.fromEntries(applyConstraints(kids, before, after).map((e) => [e.id, e]));
  assert.deepEqual([out.l.x, out.r.x], [10, 490]);
  near(out.s.x, 150); near(out.s.w, 150);
  assert.deepEqual([out.lr.x, out.lr.w], [20, 560]);
  near(out.c.x, 250);
});

test("gridLayout arranges in rows with a gap", () => {
  const els = ["a", "b", "c", "d"].map((id, i) => box(id, i * 7, i * 3));
  const out = gridLayout(els, els.map((e) => e.id), { cols: 2, gap: 20 });
  const by = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.deepEqual([by.b.x - by.a.x, by.c.y - by.a.y, by.d.x, by.d.y], [120, 70, by.b.x, by.c.y]);
});

test("circleLayout puts elements on a circle around their centre", () => {
  const els = ["a", "b", "c", "d"].map((id, i) => box(id, i * 10, 0, { w: 20, h: 20 }));
  const out = circleLayout(els, els.map((e) => e.id), { radius: 100 });
  const cx = out.reduce((s, e) => s + e.x + 10, 0) / 4;
  const cy = out.reduce((s, e) => s + e.y + 10, 0) / 4;
  for (const e of out) near(Math.hypot(e.x + 10 - cx, e.y + 10 - cy), 100, 1e-6);
});

test("replaceText replaces in text, names and table cells and counts matches", () => {
  const t = createElement("table", { id: "t", rows: 1, cols: 2, cells: [["cat", "dog"]] });
  const els = [box("a", 0, 0, { text: "Cat and cat" }), createElement("frame", { id: "f", name: "Cats" }), t];
  const { elements, count } = replaceText(els, "cat", "fox");
  assert.equal(count, 4);
  assert.deepEqual([elements[0].text, elements[1].name, elements[2].cells[0][0]], ["fox and fox", "foxs", "fox"]);
  assert.equal(replaceText(els, "cat", "fox", { caseSensitive: true }).count, 2);
});

test("cssFor describes size, fill, border, radius, opacity and text", () => {
  const css = cssFor(box("a", 0, 0, { fill: "#ff0000", fillStyle: "solid", stroke: "#000000", strokeWidth: 2, radius: 8, opacity: 50, text: "Hi", fontFamily: "sans", fontSize: 16 }));
  for (const part of ["width: 100px;", "height: 50px;", "background: #ff0000;", "border: 2px solid #000000;", "border-radius: 8px;", "opacity: 0.5;", "font-size: 16px;"]) assert.ok(css.includes(part), part);
});

test("cropping an image narrows the visible window and keeps it inside the picture", async () => {
  const { cropResize } = await import("../web/src/engine/transform.js");
  const img = createElement("image", { id: "i", x: 0, y: 0, w: 200, h: 100, fileId: "f" });
  const c = cropResize(img, { ...img, x: 50, w: 150 });
  assert.deepEqual([c.x, c.w], [50, 150]);
  near(c.crop.x, 0.25); near(c.crop.w, 0.75);
  const out = cropResize(img, { ...img, x: -40, w: 240 });
  assert.deepEqual([out.x, out.w, out.crop.x, out.crop.w], [0, 200, 0, 1]);
  const again = cropResize(c, { ...c, w: 75 });
  near(again.crop.w, 0.375);
});

test("measureGaps reports horizontal and vertical gaps between two boxes", async () => {
  const { measureGaps } = await import("../web/src/engine/snapping.js");
  const side = measureGaps({ x: 0, y: 0, w: 100, h: 50 }, { x: 160, y: 10, w: 40, h: 40 });
  assert.equal(side.length, 1);
  assert.deepEqual([side[0].x1, side[0].x2, side[0].value], [100, 160, 60]);
  const diag = measureGaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 50, w: 10, h: 10 });
  assert.deepEqual(diag.map((g) => g.value).sort((a, b) => a - b), [20, 40]);
  const inside = measureGaps({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 20, w: 30, h: 30 });
  assert.deepEqual(inside.map((g) => g.value).sort((a, b) => a - b), [10, 20, 50, 60]);
});
