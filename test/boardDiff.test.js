import { test } from "node:test";
import assert from "node:assert/strict";
import { diffBoards, applyDiff, mergeDiffs, isEmptyDiff } from "../web/src/engine/boardDiff.js";

const el = (id, v = 1, x = 0) => ({ id, type: "rect", x, y: 0, w: 10, h: 10, angle: 0, version: v });
const board = (pages, name = "B", metaVersion = 0) => ({ id: "b", name, metaVersion, files: {}, pages });
const page = (id, elements, extra = {}) => ({ id, name: id, elements, comments: [], background: null, grid: "dots", ...extra });
const ids = (b, p = 0) => b.pages[p].elements.map((e) => e.id);

test("an unchanged board gives an empty diff", () => {
  const b = board([page("p", [el("a")])]);
  assert.equal(isEmptyDiff(diffBoards(b, b)), true);
});

test("undo of an edit restores only that element and keeps others' changes", () => {
  const a0 = board([page("p", [el("a", 1, 0), el("b", 1, 0)])]);
  const a1 = board([page("p", [el("a", 2, 50), el("b", 1, 0)])]);
  const d = diffBoards(a0, a1);
  const remote = board([page("p", [el("a", 2, 50), el("b", 5, 99)])]);
  const undone = applyDiff(remote, d, "undo");
  const [a, b] = undone.pages[0].elements;
  assert.equal(a.x, 0);
  assert.ok(a.version > 2);
  assert.equal(b.x, 99);
});

test("undo of an add removes it; redo puts it back in place", () => {
  const b0 = board([page("p", [el("a"), el("c")])]);
  const b1 = board([page("p", [el("a"), el("b"), el("c")])]);
  const d = diffBoards(b0, b1);
  const u = applyDiff(b1, d, "undo");
  assert.deepEqual(ids(u), ["a", "c"]);
  assert.deepEqual(ids(applyDiff(u, d, "redo")), ["a", "b", "c"]);
});

test("undo of a delete restores the element at its old z position", () => {
  const b0 = board([page("p", [el("a"), el("b"), el("c")])]);
  const b1 = board([page("p", [el("a"), el("c")])]);
  assert.deepEqual(ids(applyDiff(b1, diffBoards(b0, b1), "undo")), ["a", "b", "c"]);
});

test("undo of a reorder restores the order", () => {
  const b0 = board([page("p", [el("a"), el("b"), el("c")])]);
  const b1 = board([page("p", [el("b", 2), el("c"), el("a", 2)])]);
  assert.deepEqual(ids(applyDiff(b1, diffBoards(b0, b1), "undo")), ["a", "b", "c"]);
});

test("page add, rename and delete undo through meta", () => {
  const b0 = board([page("p", [el("a")])]);
  const b1 = board([page("p", [el("a")], { name: "Renamed" }), page("q", [el("z")])], "B2", 1);
  const d = diffBoards(b0, b1);
  const u = applyDiff(b1, d, "undo");
  assert.deepEqual(u.pages.map((p) => p.id), ["p"]);
  assert.equal(u.pages[0].name, "p");
  assert.equal(u.name, "B");
  const r = applyDiff(u, d, "redo");
  assert.deepEqual(r.pages.map((p) => p.id), ["p", "q"]);
  assert.deepEqual(ids(r, 1), ["z"]);
  const del = diffBoards(b1, board([page("p", [el("a")], { name: "Renamed" })], "B2", 2));
  const back = applyDiff(board([page("p", [el("a")], { name: "Renamed" })], "B2", 2), del, "undo");
  assert.deepEqual(ids(back, 1), ["z"]);
});

test("mergeDiffs keeps the oldest before and the newest after", () => {
  const b0 = board([page("p", [el("a", 1, 0)])]);
  const b1 = board([page("p", [el("a", 2, 10)])]);
  const b2 = board([page("p", [el("a", 3, 20)])]);
  const m = mergeDiffs(diffBoards(b0, b1), diffBoards(b1, b2));
  assert.equal(applyDiff(b2, m, "undo").pages[0].elements[0].x, 0);
  assert.equal(applyDiff(b0, m, "redo").pages[0].elements[0].x, 20);
});
