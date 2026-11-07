import { test } from "node:test";
import assert from "node:assert/strict";
import { resizeElement, rotateElements, scaleElements, moveElements } from "../web/src/engine/transform.js";
import { center } from "../web/src/engine/geometry.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const rect = (p = {}) => ({ id: "r", type: "rect", x: 0, y: 0, w: 100, h: 50, angle: 0, ...p });

test("dragging the east handle widens the box", () => {
  const r = resizeElement(rect(), "e", { x: 150, y: 25 });
  assert.equal(r.x, 0); assert.equal(r.w, 150); assert.equal(r.h, 50);
});

test("dragging the north-west handle moves the origin", () => {
  const r = resizeElement(rect(), "nw", { x: -20, y: -10 });
  assert.equal(r.x, -20); assert.equal(r.y, -10); assert.equal(r.w, 120); assert.equal(r.h, 60);
});

test("keepRatio keeps the aspect ratio", () => {
  const r = resizeElement(rect(), "se", { x: 200, y: 60 }, { keepRatio: true });
  near(r.w / r.h, 2);
  assert.equal(r.w, 200);
});

test("fromCenter resizes symmetrically", () => {
  const r = resizeElement(rect(), "e", { x: 120, y: 25 }, { fromCenter: true });
  assert.equal(r.x, -20); assert.equal(r.w, 140);
});

test("dragging past the opposite edge flips without negative size", () => {
  const r = resizeElement(rect(), "e", { x: -50, y: 25 });
  assert.equal(r.x, -50); assert.equal(r.w, 50);
});

test("resizing a rotated rect keeps the opposite corner fixed", () => {
  const el = rect({ angle: Math.PI / 2 });
  const c = center(el);
  const fixedLocal = { x: 0, y: 0 };
  const rot = (p) => ({ x: c.x + (p.x - 50) * Math.cos(el.angle) - (p.y - 25) * Math.sin(el.angle), y: c.y + (p.x - 50) * Math.sin(el.angle) + (p.y - 25) * Math.cos(el.angle) });
  const fixedWorld = rot(fixedLocal);
  const target = rot({ x: 200, y: 100 });
  const r = resizeElement(el, "se", target);
  near(r.w, 200); near(r.h, 100);
  const c2 = center(r);
  const back = { x: c2.x + (-r.w / 2) * Math.cos(r.angle) - (-r.h / 2) * Math.sin(r.angle), y: c2.y + (-r.w / 2) * Math.sin(r.angle) + (-r.h / 2) * Math.cos(r.angle) };
  near(back.x, fixedWorld.x); near(back.y, fixedWorld.y);
});

test("resizing a line scales its points", () => {
  const ln = { id: "l", type: "line", x: 0, y: 0, w: 100, h: 50, angle: 0, points: [[0, 0], [100, 50]] };
  const r = resizeElement(ln, "se", { x: 200, y: 100 });
  assert.deepEqual(r.points, [[0, 0], [200, 100]]);
});

test("rotateElements rotates a group around its shared centre", () => {
  const a = rect({ id: "a", x: 0, y: 0, w: 10, h: 10 });
  const b = rect({ id: "b", x: 90, y: 0, w: 10, h: 10 });
  const [ra, rb] = rotateElements([a, b], { x: 50, y: 5 }, Math.PI);
  near(ra.x, 90); near(rb.x, 0); near(ra.angle, Math.PI);
});

test("scaleElements scales positions and sizes relative to bounds", () => {
  const a = rect({ id: "a", x: 0, y: 0, w: 50, h: 50 });
  const b = rect({ id: "b", x: 50, y: 50, w: 50, h: 50 });
  const [sa, sb] = scaleElements([a, b], { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 100 });
  assert.deepEqual([sa.x, sa.w, sb.x, sb.w, sb.y, sb.h], [0, 100, 100, 100, 50, 50]);
});

test("moveElements translates", () => {
  const [m] = moveElements([rect()], 5, -5);
  assert.equal(m.x, 5); assert.equal(m.y, -5);
});

test("rotating a line rotates its points and keeps angle 0", () => {
  const ln = { id: "l", type: "line", x: 0, y: 0, w: 100, h: 0, angle: 0, points: [[0, 0], [100, 0]] };
  const [r] = rotateElements([ln], { x: 50, y: 0 }, Math.PI / 2);
  assert.equal(r.angle, 0);
  near(r.x, 50); near(r.y, -50);
  near(r.points[1][0], 0); near(r.points[1][1], 100);
});
