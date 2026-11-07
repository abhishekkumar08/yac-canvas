import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import { treeLayout, applyAutoLayout } from "../web/src/engine/layout.js";
import { booleanOp } from "../web/src/engine/boolean.js";
import { makeComponent, createInstance, instanceChildren, detachInstance } from "../web/src/engine/components.js";

const box = (id, x, y, p = {}) => createElement("rect", { id, x, y, w: 100, h: 50, fill: "#fff", ...p });
const link = (id, a, b) => createElement("arrow", { id, x: 0, y: 0, points: [[0, 0], [1, 1]], startBinding: { id: a, fx: 0.5, fy: 0.5, fixed: false }, endBinding: { id: b, fx: 0.5, fy: 0.5, fixed: false } });

test("treeLayout puts children one level below their parent, centred", () => {
  const els = [box("r", 500, 500), box("a", 0, 0), box("b", 900, 900), link("1", "r", "a"), link("2", "r", "b")];
  const out = treeLayout(els, ["r", "a", "b"], { gapX: 40, gapY: 80 });
  const by = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.equal(by.a.y, by.r.y + 50 + 80);
  assert.equal(by.b.y, by.a.y);
  assert.equal(by.b.x - by.a.x, 140);
  assert.equal(by.r.x + 50, (by.a.x + by.b.x + 100) / 2);
});

test("treeLayout direction right lays levels along x", () => {
  const els = [box("r", 0, 0), box("a", 0, 0), link("1", "r", "a")];
  const by = Object.fromEntries(treeLayout(els, ["r", "a"], { direction: "right", gapX: 60, gapY: 30 }).map((e) => [e.id, e]));
  assert.equal(by.a.x, by.r.x + 100 + 60);
});

test("auto-layout row places children with gap and padding and hugs content", () => {
  const frame = createElement("frame", { id: "f", x: 0, y: 0, w: 10, h: 10, layout: { direction: "row", gap: 10, padding: 20, align: "start", hug: true } });
  const els = [frame, box("b", 300, 40, { frameId: "f" }), box("a", 5, 5, { frameId: "f", h: 80 })];
  const out = applyAutoLayout(els, "f");
  const by = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.deepEqual([by.a.x, by.a.y, by.b.x, by.b.y], [20, 20, 130, 20]);
  assert.deepEqual([by.f.w, by.f.h], [250, 120]);
});

test("auto-layout column with centre alignment", () => {
  const frame = createElement("frame", { id: "f", x: 0, y: 0, w: 200, h: 10, layout: { direction: "column", gap: 5, padding: 10, align: "center", hug: false } });
  const els = [frame, box("a", 0, 0, { frameId: "f", w: 100 }), box("b", 0, 100, { frameId: "f", w: 50 })];
  const by = Object.fromEntries(applyAutoLayout(els, "f").map((e) => [e.id, e]));
  assert.deepEqual([by.a.x, by.b.x, by.b.y, by.f.w], [50, 75, 65, 200]);
});

test("boolean union of two overlapping squares has the right area", () => {
  const a = box("a", 0, 0, { w: 10, h: 10 });
  const b = box("b", 5, 0, { w: 10, h: 10 });
  const p = booleanOp("union", [a, b]);
  assert.equal(p.type, "path");
  assert.deepEqual([p.x, p.y, p.w, p.h], [0, 0, 15, 10]);
  const ring = p.rings[0];
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  assert.equal(Math.abs(area / 2), 150);
});

test("boolean subtract and intersect", () => {
  const a = box("a", 0, 0, { w: 10, h: 10 });
  const b = box("b", 5, 0, { w: 10, h: 10 });
  assert.deepEqual([booleanOp("subtract", [a, b]).w, booleanOp("intersect", [a, b]).x], [5, 5]);
  assert.equal(booleanOp("intersect", [a, box("c", 50, 50, { w: 1, h: 1 })]), null);
});

test("instances mirror their component and follow edits", () => {
  const frame = createElement("frame", { id: "m", x: 0, y: 0, w: 100, h: 100 });
  let els = makeComponent([frame, box("k", 10, 10, { frameId: "m", w: 20, h: 20 })], "m");
  assert.equal(els[0].isComponent, true);
  const inst = createInstance(els, "m", { x: 500, y: 0 });
  assert.deepEqual([inst.w, inst.h, inst.componentId], [100, 100, "m"]);
  els = [...els, { ...inst, w: 200, h: 200 }];
  let kids = instanceChildren(els, els[2]);
  assert.deepEqual([kids[0].x, kids[0].w], [520, 40]);
  els = els.map((e) => (e.id === "k" ? { ...e, fill: "#f00" } : e));
  kids = instanceChildren(els, els[2]);
  assert.equal(kids[0].fill, "#f00");
});

test("detachInstance replaces the instance with editable copies", () => {
  const frame = createElement("frame", { id: "m", x: 0, y: 0, w: 100, h: 100 });
  let els = makeComponent([frame, box("k", 10, 10, { frameId: "m" })], "m");
  const inst = createInstance(els, "m", { x: 500, y: 0 });
  els = detachInstance([...els, inst], inst.id);
  assert.equal(els.some((e) => e.type === "instance"), false);
  const newFrame = els.find((e) => e.type === "frame" && e.id !== "m");
  assert.equal(newFrame.isComponent, false);
  assert.equal(els.filter((e) => e.frameId === newFrame.id).length, 1);
});
