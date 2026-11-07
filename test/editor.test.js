import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../web/src/store/editor.js";
import { createBoard } from "../web/src/engine/serialize.js";
import { createElement } from "../web/src/engine/elements.js";
import { updateElements } from "../web/src/engine/scene.js";
import { connectorWorldPoints } from "../web/src/engine/connectors.js";

const setup = () => {
  const ed = new Editor(createBoard("t"), { prefs: {} });
  const a = createElement("rect", { id: "a", x: 0, y: 0, w: 100, h: 60, fill: "#fff" });
  const b = createElement("rect", { id: "b", x: 300, y: 0, w: 100, h: 60, fill: "#fff" });
  const c = createElement("arrow", { id: "c", x: 100, y: 30, points: [[0, 0], [200, 0]], startBinding: { id: "a", fx: 1, fy: 0.5, fixed: true }, endBinding: { id: "b", fx: 0, fy: 0.5, fixed: true } });
  ed.setElements([a, b, c]);
  return ed;
};

test("setElements records history; undo and redo restore boards", () => {
  const ed = setup();
  ed.setElements(updateElements(ed.elements, ["a"], () => ({ x: 50 })));
  assert.equal(ed.elements[0].x, 50);
  ed.undo();
  assert.equal(ed.elements[0].x, 0);
  ed.redo();
  assert.equal(ed.elements[0].x, 50);
});

test("moving a shape updates its bound connector in the same step", () => {
  const ed = setup();
  ed.setElements(updateElements(ed.elements, ["b"], () => ({ y: 100 })));
  assert.equal(connectorWorldPoints(ed.elements[2]).at(-1).y, 130);
});

test("a transaction records one undo step for many previews", () => {
  const ed = setup();
  ed.begin();
  for (let i = 1; i <= 5; i++) ed.setElements(updateElements(ed.elements, ["a"], () => ({ x: i * 10 })));
  ed.end();
  ed.undo();
  assert.equal(ed.elements[0].x, 0);
});

test("cancel restores the board from before the transaction", () => {
  const ed = setup();
  ed.begin();
  ed.setElements(updateElements(ed.elements, ["a"], () => ({ x: 99 })));
  ed.cancel();
  assert.equal(ed.elements[0].x, 0);
});

test("pages: addPage switches page and undo removes it", () => {
  const ed = setup();
  ed.addPage();
  assert.equal(ed.state.board.pages.length, 2);
  assert.equal(ed.elements.length, 0);
  ed.undo();
  assert.equal(ed.state.board.pages.length, 1);
});

test("repeated previews from the same origin keep connectors following", () => {
  const ed = setup();
  const orig = ed.elements[1];
  ed.begin();
  for (const dy of [50, 100, 150]) {
    ed.setElements(ed.elements.map((el) => (el.id === "b" ? { ...orig, y: dy, version: el.version + 1 } : el)));
  }
  ed.end();
  assert.equal(connectorWorldPoints(ed.elements[2]).at(-1).y, 180);
});

test("undo leaves a collaborator's later edits alone", () => {
  const ed = setup();
  ed.setElements(updateElements(ed.elements, ["a"], () => ({ x: 50 })));
  const remote = ed.withPage(ed.state.board, ed.state.pageId, (p) => ({ ...p, elements: updateElements(p.elements, ["b"], () => ({ x: 999 })) }));
  ed.applyBoard(remote, { record: false, origin: "remote" });
  ed.undo();
  assert.equal(ed.elements.find((e) => e.id === "a").x, 0);
  assert.equal(ed.elements.find((e) => e.id === "b").x, 999);
});
