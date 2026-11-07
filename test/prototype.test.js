import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import { parseLink, presentationFrames, linkAt, nextFrameId } from "../web/src/engine/prototype.js";

const frame = (id, x, y, p = {}) => createElement("frame", { id, x, y, w: 100, h: 100, frameId: null, ...p });
const rect = (id, x, y, p = {}) => createElement("rect", { id, x, y, w: 20, h: 20, fill: "transparent", ...p });
const ids = (els) => els.map((e) => e.id);

test("parseLink: internal targets", () => {
  assert.deepEqual(parseLink("#frame:f1"), { kind: "frame", target: "f1" });
  assert.deepEqual(parseLink("#page:p2"), { kind: "page", target: "p2" });
  assert.deepEqual(parseLink("#frame:"), { kind: null, target: null });
});

test("parseLink: only http(s) and mailto count as urls", () => {
  assert.deepEqual(parseLink("https://example.com/a"), { kind: "url", target: "https://example.com/a" });
  assert.equal(parseLink("http://example.com").kind, "url");
  assert.equal(parseLink("mailto:hi@example.com").kind, "url");
  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "ftp://x.com", "https://", "example.com", "", null, undefined, 42]) {
    assert.equal(parseLink(bad).kind, null, String(bad));
  }
});

test("presentationFrames: top-level frames in rows, top to bottom then left to right", () => {
  const page = {
    elements: [
      frame("c", 0, 300),
      frame("b", 200, 5),
      frame("a", 0, 0),
      frame("nested", 10, 10, { frameId: "a", w: 20, h: 20 }),
      rect("r", 0, 0),
      frame("hidden", 400, 0, { hidden: true }),
    ],
  };
  assert.deepEqual(ids(presentationFrames(page)), ["a", "b", "c"]);
});

test("presentationFrames: presentationOrder overrides, unknown ids dropped, unlisted frames appended", () => {
  const page = { elements: [frame("a", 0, 0), frame("b", 200, 0), frame("c", 0, 300)], presentationOrder: ["c", "gone", "a"] };
  assert.deepEqual(ids(presentationFrames(page)), ["c", "a", "b"]);
  assert.deepEqual(presentationFrames({ elements: [] }), []);
});

test("linkAt: finds a linked child of a nested frame", () => {
  const els = [
    frame("f", 0, 0),
    frame("inner", 10, 10, { frameId: "f", w: 50, h: 50 }),
    rect("btn", 20, 20, { frameId: "inner", link: "#frame:g" }),
  ];
  assert.equal(linkAt(els, els[0], { x: 30, y: 30 })?.id, "btn");
  assert.equal(linkAt(els, els[0], { x: 80, y: 80 }), null);
});

test("linkAt: topmost linked element wins and transparent fill still counts", () => {
  const els = [frame("f", 0, 0), rect("under", 10, 10, { frameId: "f", link: "#frame:a" }), rect("over", 15, 15, { frameId: "f", link: "#frame:b" })];
  assert.equal(linkAt(els, els[0], { x: 20, y: 20 })?.id, "over");
  assert.equal(linkAt(els, els[0], { x: 12, y: 12 })?.id, "under");
});

test("linkAt: ignores points outside the frame and elements of other frames", () => {
  const els = [
    frame("f", 0, 0),
    frame("g", 200, 0),
    rect("spill", 90, 10, { frameId: "f", link: "https://example.com" }),
    rect("other", 210, 10, { frameId: "g", link: "https://example.com" }),
  ];
  assert.equal(linkAt(els, els[0], { x: 105, y: 15 }), null);
  assert.equal(linkAt(els, els[0], { x: 215, y: 15 }), null);
  assert.equal(linkAt(els, els[0], { x: 95, y: 15 })?.id, "spill");
});

test("linkAt: clipped part of a nested frame child is not clickable", () => {
  const els = [frame("f", 0, 0), frame("inner", 0, 0, { frameId: "f", w: 30, h: 30 }), rect("wide", 20, 0, { frameId: "inner", w: 60, link: "#page:p" })];
  assert.equal(linkAt(els, els[0], { x: 25, y: 5 })?.id, "wide");
  assert.equal(linkAt(els, els[0], { x: 50, y: 5 }), null);
});

test("nextFrameId clamps at both ends", () => {
  const frames = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(nextFrameId(frames, "a", 1), "b");
  assert.equal(nextFrameId(frames, "c", 1), "c");
  assert.equal(nextFrameId(frames, "a", -1), "a");
  assert.equal(nextFrameId(frames, "b", -1), "a");
  assert.equal(nextFrameId(frames, "missing", 1), "a");
  assert.equal(nextFrameId([], "a", 1), null);
});
