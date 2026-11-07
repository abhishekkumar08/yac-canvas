import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rotatePoint, elementBounds, hitTest, distToSegment, pointInPolygon, rectsIntersect, outline, borderPoint, toLocal, center,
} from "../web/src/engine/geometry.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const rect = (p = {}) => ({ id: "r", type: "rect", x: 0, y: 0, w: 100, h: 50, angle: 0, fill: "#fff", strokeWidth: 2, ...p });

test("rotatePoint rotates around a centre", () => {
  const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
  near(p.x, 0); near(p.y, 10);
});

test("toLocal undoes rotation around the element centre", () => {
  const el = rect({ angle: Math.PI / 2 });
  const c = center(el);
  const world = rotatePoint({ x: 100, y: 0 }, c, el.angle);
  const l = toLocal(el, world);
  near(l.x, 100); near(l.y, 0);
});

test("elementBounds of an unrotated rect is the box", () => {
  assert.deepEqual(elementBounds(rect()), { x: 0, y: 0, w: 100, h: 50 });
});

test("elementBounds grows for a rotated rect", () => {
  const b = elementBounds(rect({ angle: Math.PI / 2 }));
  near(b.w, 50); near(b.h, 100); near(b.x, 25); near(b.y, -25);
});

test("elementBounds of a line comes from its points", () => {
  const b = elementBounds({ type: "line", x: 10, y: 10, points: [[0, 0], [50, -20], [80, 30]], angle: 0 });
  assert.deepEqual(b, { x: 10, y: -10, w: 80, h: 50 });
});

test("filled rect hits inside, misses outside", () => {
  assert.equal(hitTest(rect(), { x: 50, y: 25 }, 2), true);
  assert.equal(hitTest(rect(), { x: 150, y: 25 }, 2), false);
});

test("transparent rect hits only near its outline", () => {
  const el = rect({ fill: "transparent" });
  assert.equal(hitTest(el, { x: 50, y: 25 }, 4), false);
  assert.equal(hitTest(el, { x: 50, y: 1 }, 4), true);
  assert.equal(hitTest(el, { x: 99, y: 25 }, 4), true);
});

test("transparent rect with a label hits inside", () => {
  assert.equal(hitTest(rect({ fill: "transparent", text: "hi" }), { x: 50, y: 25 }, 4), true);
});

test("rotated rect hit uses its local frame", () => {
  const el = rect({ angle: Math.PI / 4 });
  assert.equal(hitTest(el, { x: 50, y: 25 }, 1), true);
  assert.equal(hitTest(el, { x: 0, y: -20 }, 1), false);
});

test("ellipse hit respects the curve", () => {
  const el = { type: "ellipse", x: 0, y: 0, w: 100, h: 100, angle: 0, fill: "#000", strokeWidth: 1 };
  assert.equal(hitTest(el, { x: 50, y: 50 }, 1), true);
  assert.equal(hitTest(el, { x: 5, y: 5 }, 1), false);
});

test("diamond hit uses its polygon", () => {
  const el = { type: "diamond", x: 0, y: 0, w: 100, h: 100, angle: 0, fill: "#000", strokeWidth: 1 };
  assert.equal(hitTest(el, { x: 50, y: 50 }, 1), true);
  assert.equal(hitTest(el, { x: 10, y: 10 }, 1), false);
});

test("line hit uses distance to segments", () => {
  const el = { type: "line", x: 0, y: 0, angle: 0, points: [[0, 0], [100, 0]], strokeWidth: 2 };
  assert.equal(hitTest(el, { x: 50, y: 3 }, 4), true);
  assert.equal(hitTest(el, { x: 50, y: 20 }, 4), false);
});

test("frame hits on its title strip and border, not its middle", () => {
  const el = { type: "frame", x: 0, y: 0, w: 300, h: 200, angle: 0, fill: "#fff", strokeWidth: 1 };
  assert.equal(hitTest(el, { x: 150, y: 100 }, 4), false);
  assert.equal(hitTest(el, { x: 10, y: -10 }, 4), true);
  assert.equal(hitTest(el, { x: 1, y: 100 }, 4), true);
});

test("path hit uses its rings", () => {
  const el = { type: "path", x: 0, y: 0, w: 10, h: 10, pw: 10, ph: 10, angle: 0, fill: "#000", strokeWidth: 1, rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
  assert.equal(hitTest(el, { x: 5, y: 5 }, 1), true);
  assert.equal(hitTest(el, { x: 15, y: 5 }, 1), false);
});

test("distToSegment and pointInPolygon basics", () => {
  near(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  near(distToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  assert.equal(pointInPolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]), true);
});

test("rectsIntersect", () => {
  assert.equal(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 }), false);
});

test("outline of a rect is its four corners in world space", () => {
  assert.equal(outline(rect()).length, 4);
});

test("borderPoint hits the edge toward a point", () => {
  const p = borderPoint(rect(), { x: 300, y: 25 });
  near(p.x, 100); near(p.y, 25);
  const q = borderPoint({ type: "ellipse", x: 0, y: 0, w: 100, h: 100, angle: 0 }, { x: 50, y: -200 });
  near(q.x, 50, 0.5); near(q.y, 0, 0.5);
});
