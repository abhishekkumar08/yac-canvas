import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import { serializeBoard, parseBoard, createBoard } from "../web/src/engine/serialize.js";
import { mergePage } from "../web/src/engine/merge.js";

const board = () => {
  const b = createBoard("Test");
  b.pages[0].elements = [createElement("rect", { id: "a", x: 1, y: 2, w: 3, h: 4, text: "<b>hi</b>" }), createElement("arrow", { id: "c", x: 0, y: 0, points: [[0, 0], [5, 5]] })];
  b.files = { f1: "data:image/png;base64,iVBORw0KGgo=" };
  return b;
};

test("serialize/parse round-trips a board exactly", () => {
  const b = board();
  assert.deepEqual(parseBoard(serializeBoard(b)), b);
});

test("parseBoard rejects other JSON", () => {
  assert.throws(() => parseBoard("{}"), /not a canvas file/i);
  assert.throws(() => parseBoard("nope"), /not valid JSON/i);
});

test("parseBoard rejects unknown element types and bad numbers", () => {
  const b = board();
  b.pages[0].elements[0].type = "script";
  assert.throws(() => parseBoard(serializeBoard(b)), /unknown element type/i);
  const c = board();
  c.pages[0].elements[0].x = "1";
  assert.throws(() => parseBoard(serializeBoard(c)), /invalid number/i);
});

test("parseBoard rejects non-image file data", () => {
  const b = board();
  b.files.f1 = "javascript:alert(1)";
  assert.throws(() => parseBoard(serializeBoard(b)), /image data/i);
});

test("mergePage keeps the newer version of each element and the sender's order", () => {
  const a1 = { id: "a", version: 2, x: 1 };
  const b1 = { id: "b", version: 1, x: 1 };
  const local = { id: "p", elements: [a1, b1] };
  const incoming = { id: "p", elements: [{ id: "b", version: 3, x: 9 }, { id: "a", version: 1, x: 0 }, { id: "n", version: 1 }] };
  const out = mergePage(local, incoming, new Map());
  assert.deepEqual(out.elements.map((e) => [e.id, e.x ?? null]), [["b", 9], ["a", 1], ["n", null]]);
});

test("mergePage drops elements the sender deleted unless edited locally since", () => {
  const local = { id: "p", elements: [{ id: "a", version: 2 }, { id: "b", version: 5 }] };
  const incoming = { id: "p", elements: [], deleted: { a: 2, b: 4 } };
  const tomb = new Map();
  const out = mergePage(local, incoming, tomb);
  assert.deepEqual(out.elements.map((e) => e.id), ["b"]);
  assert.equal(tomb.get("a"), 2);
});
