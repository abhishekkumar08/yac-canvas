import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import { createBoard } from "../web/src/engine/serialize.js";
import { Editor } from "../web/src/store/editor.js";
import { exportLibrary, parseLibrary } from "../web/src/plugins/libraries.js";
import { sanitizePatch, sanitizeNewElement, pluginMethods, fitsMessage, workerDoc, CSP } from "../web/src/plugins/host.js";

const items = () => [
  {
    id: "i1",
    name: "Box",
    elements: [createElement("rect", { id: "a", x: 1, y: 2, w: 30, h: 40, text: "hi" }), createElement("arrow", { id: "b", points: [[0, 0], [10, 5]] })],
    files: {},
  },
  { id: "i2", name: "Pic", elements: [createElement("image", { id: "c", w: 10, h: 10, fileId: "f1" })], files: { f1: "data:image/png;base64,iVBORw0KGgo=" } },
];

test("library export/parse round-trips", () => {
  const list = items();
  assert.deepEqual(parseLibrary(exportLibrary(list)), list);
});

test("parseLibrary imports an excalidrawlib v2 file", () => {
  const lib = {
    type: "excalidrawlib",
    version: 2,
    libraryItems: [
      {
        id: "x1",
        name: "Card",
        elements: [
          { id: "r", type: "rectangle", x: 0, y: 0, width: 100, height: 50, angle: 0, strokeColor: "#e03131", backgroundColor: "#ffc9c9", fillStyle: "solid", strokeWidth: 4, roughness: 0, opacity: 80, groupIds: ["g"], roundness: { type: 3 } },
          { id: "t", type: "text", x: 10, y: 10, width: 80, height: 20, text: "Title", fontSize: 28, fontFamily: 3, containerId: "r" },
          { id: "l", type: "arrow", x: 0, y: 60, width: 50, height: 0, points: [[0, 0], [50, 0]], endArrowhead: "triangle" },
          { id: "z", type: "image", x: 0, y: 0, width: 1, height: 1, fileId: "nope" },
          { id: "d", type: "ellipse", x: 0, y: 0, width: 1, height: 1, isDeleted: true },
        ],
      },
      { id: "x2", elements: [{ id: "q", type: "embeddable", x: 0, y: 0, width: 1, height: 1 }] },
    ],
  };
  const [item, ...rest] = parseLibrary(JSON.stringify(lib));
  assert.equal(rest.length, 0);
  assert.equal(item.name, "Card");
  assert.deepEqual(item.elements.map((e) => e.type), ["rect", "arrow"]);
  const [rect, arrow] = item.elements;
  assert.equal(rect.stroke, "#e03131");
  assert.equal(rect.fill, "#ffc9c9");
  assert.equal(rect.strokeWidth, 4);
  assert.equal(rect.radius, 12);
  assert.equal(rect.text, "Title");
  assert.equal(rect.fontFamily, "mono");
  assert.deepEqual(rect.groupIds, ["g"]);
  assert.deepEqual(arrow.points, [[0, 0], [50, 0]]);
  assert.equal(arrow.endArrow, "triangle");
});

test("parseLibrary rejects bad data", () => {
  assert.throws(() => parseLibrary("nope"), /not valid JSON/);
  assert.throws(() => parseLibrary("{}"), /not a shape library/);
  assert.throws(() => parseLibrary(JSON.stringify({ type: "yac-canvas/library", version: 9, items: [] })), /newer version/);
  assert.throws(() => parseLibrary(JSON.stringify({ type: "yac-canvas/library", version: 1, items: [] })), /no shapes/);
  const bad = (mutate) => {
    const list = items();
    mutate(list);
    return () => parseLibrary(exportLibrary(list));
  };
  assert.throws(bad((l) => (l[0].elements[0].type = "script")), /Unknown element type/);
  assert.throws(bad((l) => (l[0].elements[0].x = Infinity)), /Invalid number/);
  assert.throws(bad((l) => (l[0].elements[1].points = [[0, "1"]])), /Invalid number in points/);
  assert.throws(bad((l) => (l[1].files.f1 = "javascript:alert(1)")), /not image data/);
  assert.throws(bad((l) => (l[0].elements[0].groupIds = "g")), /groupIds/);
  assert.throws(bad((l) => (l[0].elements = [])), /Item "Box"/);
  const ex = { type: "excalidrawlib", version: 2, libraryItems: [{ elements: [{ id: "a", type: "line", x: 0, y: 0, width: 1, height: 1, points: [[0, NaN]] }] }] };
  assert.throws(() => parseLibrary(JSON.stringify(ex).replace("null", '"x"')), /Invalid number in points/);
});

test("sanitizePatch keeps style, geometry and text keys only", () => {
  assert.deepEqual(sanitizePatch({ x: 1, fill: "#fff", text: "a", strokeStyle: "dashed", endArrow: null, points: [[0, 0], [1, 2]] }), {
    x: 1, fill: "#fff", text: "a", strokeStyle: "dashed", endArrow: null, points: [[0, 0], [1, 2]],
  });
  for (const key of ["id", "version", "fileId", "type", "frameId", "groupIds", "locked", "__proto__"]) {
    assert.throws(() => sanitizePatch(JSON.parse(`{"${key}": "x"}`)), /cannot set/);
  }
  assert.throws(() => sanitizePatch({ x: NaN }), /finite/);
  assert.throws(() => sanitizePatch({ w: Infinity }), /finite/);
  assert.throws(() => sanitizePatch({ y: "1" }), /finite/);
  assert.throws(() => sanitizePatch({ fill: "url(javascript:x)" }), /colour/);
  assert.throws(() => sanitizePatch({ fontFamily: "x\" onload=" }), /short string/);
  assert.throws(() => sanitizePatch({ points: [[0, Infinity]] }), /Points/);
  assert.throws(() => sanitizePatch([]), /object/);
});

test("sanitizeNewElement validates types and fills defaults", () => {
  const el = sanitizeNewElement({ type: "rect", x: 5, y: 6, fill: "#ff0000" });
  assert.equal(el.type, "rect");
  assert.equal(el.w, 100);
  assert.equal(el.version, 1);
  assert.equal(typeof el.id, "string");
  const line = sanitizeNewElement({ type: "line", points: [[0, 0], [30, 40]] });
  assert.equal(line.w, 30);
  assert.equal(line.h, 40);
  assert.equal(sanitizeNewElement({ type: "shape", kind: "hexagon" }).kind, "hexagon");
  assert.throws(() => sanitizeNewElement({ type: "image", fileId: "f" }), /Unsupported element type/);
  assert.throws(() => sanitizeNewElement({ type: "shape", kind: "constructor" }), /Unknown shape kind/);
  assert.throws(() => sanitizeNewElement({ type: "rect", id: "mine" }), /cannot set/);
});

test("plugin methods create, update and delete in single undo steps", () => {
  const editor = new Editor(createBoard("t"), { prefs: {} });
  const api = pluginMethods({ editor, notify: () => {} });
  const ids = api.createElements([{ type: "rect" }, { type: "ellipse", x: 200 }]);
  assert.equal(editor.elements.length, 2);
  assert.equal(editor.history.canUndo, true);
  api.updateElements([{ id: ids[0], fill: "#123456" }]);
  assert.equal(editor.elements[0].fill, "#123456");
  assert.throws(() => api.updateElements([{ id: "missing", x: 1 }]), /No element/);
  assert.throws(() => api.createElements([{ type: "rect" }, { type: "script" }]), /Unsupported/);
  assert.equal(editor.elements.length, 2);
  api.select(ids);
  assert.deepEqual(api.deleteElements([ids[1]]), [ids[1]]);
  assert.deepEqual(editor.state.selectedIds, [ids[0]]);
  editor.undo();
  assert.equal(editor.elements.length, 2);
  assert.deepEqual(api.getPage(), { name: "Page 1", background: null });
});

test("sandbox document carries the CSP and escapes script breakouts", () => {
  const doc = workerDoc('const s = "</script><img src=x>";');
  assert.ok(doc.includes(`content="${CSP}"`));
  assert.ok(CSP.startsWith("default-src 'none'"));
  assert.equal(doc.match(/<\/script>/g).length, 2);
  assert.equal(fitsMessage({ a: "x".repeat(10) }), true);
  assert.equal(fitsMessage("x".repeat(2_000_000)), false);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(fitsMessage(cyclic), false);
});
