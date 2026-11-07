import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import {
  reorder, groupElements, ungroupElements, expandSelection, duplicateElements, deleteElements,
  alignElements, distributeElements, assignFrames, updateElements,
} from "../web/src/engine/scene.js";

const r = (id, x = 0, y = 0, p = {}) => createElement("rect", { id, x, y, w: 10, h: 10, ...p });
const ids = (els) => els.map((e) => e.id);

test("createElement fills defaults and a seed", () => {
  const el = createElement("rect", { x: 1 });
  assert.equal(el.type, "rect");
  assert.equal(el.version, 1);
  assert.ok(el.id && Number.isInteger(el.seed));
  assert.equal(el.stroke, "#1e1e1e");
});

test("updateElements bumps the version only for changed ids", () => {
  const out = updateElements([r("a"), r("b")], ["a"], () => ({ x: 5 }));
  assert.deepEqual([out[0].x, out[0].version, out[1].version], [5, 2, 1]);
});

test("reorder: front, back, forward, backward", () => {
  const els = [r("a"), r("b"), r("c"), r("d")];
  assert.deepEqual(ids(reorder(els, ["b"], "front")), ["a", "c", "d", "b"]);
  assert.deepEqual(ids(reorder(els, ["c"], "back")), ["c", "a", "b", "d"]);
  assert.deepEqual(ids(reorder(els, ["b"], "forward")), ["a", "c", "b", "d"]);
  assert.deepEqual(ids(reorder(els, ["c"], "backward")), ["a", "c", "b", "d"]);
  assert.deepEqual(ids(reorder(els, ["a", "b"], "front")), ["c", "d", "a", "b"]);
});

test("group then expandSelection selects the whole group", () => {
  const { elements, groupId } = groupElements([r("a"), r("b"), r("c")], ["a", "b"]);
  assert.ok(groupId);
  assert.deepEqual(expandSelection(elements, ["a"]).sort(), ["a", "b"]);
  assert.deepEqual(expandSelection(elements, ["c"]), ["c"]);
});

test("nested groups expand to the outermost group; ungroup peels one level", () => {
  let { elements } = groupElements([r("a"), r("b"), r("c")], ["a", "b"]);
  ({ elements } = groupElements(elements, ["a", "b", "c"]));
  assert.deepEqual(expandSelection(elements, ["a"]).sort(), ["a", "b", "c"]);
  elements = ungroupElements(elements, ["a", "b", "c"]);
  assert.deepEqual(expandSelection(elements, ["a"]).sort(), ["a", "b"]);
});

test("expandSelection pulls in a frame's children", () => {
  const els = [createElement("frame", { id: "f", x: 0, y: 0, w: 100, h: 100 }), r("a", 10, 10, { frameId: "f" })];
  assert.deepEqual(expandSelection(els, ["f"], { withFrameChildren: true }).sort(), ["a", "f"]);
});

test("duplicate gives new ids, new group ids, and rebinds connectors within the set", () => {
  let { elements } = groupElements([r("a"), r("b")], ["a", "b"]);
  const conn = createElement("arrow", { id: "c", x: 10, y: 5, points: [[0, 0], [20, 0]], startBinding: { id: "a", fx: 1, fy: 0.5, fixed: true }, endBinding: { id: "b", fx: 0, fy: 0.5, fixed: true } });
  elements = [...elements, conn];
  const { elements: out, idMap } = duplicateElements(elements, ["a", "b", "c"], { dx: 10, dy: 10 });
  assert.equal(out.length, 6);
  const copyA = out.find((e) => e.id === idMap.a);
  const copyC = out.find((e) => e.id === idMap.c);
  assert.equal(copyA.x, 10);
  assert.notEqual(copyA.groupIds[0], elements[0].groupIds[0]);
  assert.equal(copyC.startBinding.id, idMap.a);
  assert.equal(copyC.endBinding.id, idMap.b);
});

test("duplicate drops bindings to shapes outside the copied set", () => {
  const conn = createElement("arrow", { id: "c", x: 0, y: 0, points: [[0, 0], [20, 0]], startBinding: { id: "a", fx: 0.5, fy: 0.5, fixed: false } });
  const { elements: out, idMap } = duplicateElements([r("a"), conn], ["c"], { dx: 0, dy: 0 });
  assert.equal(out.find((e) => e.id === idMap.c).startBinding, null);
});

test("delete removes frame children and clears dangling bindings", () => {
  const els = [
    createElement("frame", { id: "f", x: 0, y: 0, w: 100, h: 100 }),
    r("a", 10, 10, { frameId: "f" }),
    r("b", 300, 0),
    createElement("arrow", { id: "c", x: 0, y: 0, points: [[0, 0], [1, 1]], startBinding: { id: "b", fx: 0.5, fy: 0.5, fixed: false } }),
  ];
  const out = deleteElements(els, ["f", "b"]);
  assert.deepEqual(ids(out), ["c"]);
  assert.equal(out[0].startBinding, null);
});

test("align left and distribute horizontally", () => {
  const els = [r("a", 0, 0), r("b", 50, 20), r("c", 200, 40)];
  assert.deepEqual(alignElements(els, ["a", "b", "c"], "left").map((e) => e.x), [0, 0, 0]);
  assert.deepEqual(alignElements(els, ["a", "b", "c"], "bottom").map((e) => e.y), [40, 40, 40]);
  const d = distributeElements([r("a", 0, 0), r("b", 30, 0), r("c", 100, 0)], ["a", "b", "c"], "x");
  assert.deepEqual(d.map((e) => e.x), [0, 50, 100]);
});

test("assignFrames puts elements inside a frame and takes them out again", () => {
  const els = [createElement("frame", { id: "f", x: 0, y: 0, w: 100, h: 100 }), r("a", 10, 10), r("b", 500, 500, { frameId: "f" })];
  const out = assignFrames(els, ["a", "b"]);
  assert.equal(out[1].frameId, "f");
  assert.equal(out[2].frameId, null);
});

test("renderOrder puts frame children right after their frame", async () => {
  const { renderOrder } = await import("../web/src/engine/scene.js");
  const els = [r("a", 0, 0, { frameId: "f" }), createElement("frame", { id: "f", x: 0, y: 0, w: 100, h: 100 }), r("b")];
  assert.deepEqual(ids(renderOrder(els)), ["f", "a", "b"]);
});

test("nested frames: renderOrder, selection, delete and assignment go all the way down", async () => {
  const { renderOrder, expandSelection, deleteElements, assignFrames } = await import("../web/src/engine/scene.js");
  const outer = createElement("frame", { id: "o", x: 0, y: 0, w: 400, h: 400 });
  const inner = createElement("frame", { id: "i", x: 50, y: 50, w: 200, h: 200 });
  const leaf = r("a", 100, 100);
  let els = assignFrames([leaf, inner, outer], ["a", "i"]);
  const by = Object.fromEntries(els.map((e) => [e.id, e]));
  assert.equal(by.i.frameId, "o");
  assert.equal(by.a.frameId, "i");
  assert.deepEqual(ids(renderOrder(els)), ["o", "i", "a"]);
  assert.deepEqual(expandSelection(els, ["o"], { withFrameChildren: true }).sort(), ["a", "i", "o"]);
  assert.deepEqual(ids(deleteElements(els, ["o"])), []);
  els = assignFrames(els, ["o"]);
  assert.equal(els.find((e) => e.id === "o").frameId, null);
});
