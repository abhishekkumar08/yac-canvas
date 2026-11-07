import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "../web/src/engine/elements.js";
import { findBinding, resolveConnector, routeElbow, updateBoundConnectors, curvePath, connectorWorldPoints } from "../web/src/engine/connectors.js";
import { rectsIntersect } from "../web/src/engine/geometry.js";

const box = (id, x, y, w = 100, h = 60) => createElement("rect", { id, x, y, w, h, fill: "#fff" });
const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("findBinding snaps to a connection point when close", () => {
  const b = findBinding([box("a", 0, 0)], { x: 100, y: 31 }, { tol: 8 });
  assert.deepEqual(b, { id: "a", fx: 1, fy: 0.5, fixed: true });
});

test("findBinding floats when over the shape away from points", () => {
  const b = findBinding([box("a", 0, 0)], { x: 30, y: 20 }, { tol: 8 });
  assert.equal(b.id, "a");
  assert.equal(b.fixed, false);
});

test("findBinding ignores excluded and far elements", () => {
  assert.equal(findBinding([box("a", 0, 0)], { x: 500, y: 500 }, { tol: 8 }), null);
  assert.equal(findBinding([box("a", 0, 0)], { x: 30, y: 20 }, { tol: 8, exclude: new Set(["a"]) }), null);
});

test("a floating straight connector meets both borders", () => {
  const a = box("a", 0, 0);
  const b = box("b", 300, 0);
  const c = createElement("arrow", { id: "c", x: 50, y: 30, points: [[0, 0], [300, 0]], routing: "straight", startBinding: { id: "a", fx: 0.5, fy: 0.5, fixed: false }, endBinding: { id: "b", fx: 0.5, fy: 0.5, fixed: false } });
  const pts = connectorWorldPoints(resolveConnector(c, new Map([["a", a], ["b", b]])));
  near(pts[0].x, 100); near(pts[0].y, 30);
  near(pts.at(-1).x, 300); near(pts.at(-1).y, 30);
});

test("connector follows its shape when the shape moves", () => {
  const a = box("a", 0, 0);
  const b = box("b", 300, 0);
  const c = createElement("arrow", { id: "c", x: 100, y: 30, points: [[0, 0], [200, 0]], routing: "straight", startBinding: { id: "a", fx: 1, fy: 0.5, fixed: true }, endBinding: { id: "b", fx: 0, fy: 0.5, fixed: true } });
  const moved = { ...b, y: 200 };
  const out = updateBoundConnectors([a, moved, c], ["b"]);
  const pts = connectorWorldPoints(out[2]);
  near(pts.at(-1).x, 300); near(pts.at(-1).y, 230);
  assert.ok(out[2].version > c.version);
});

test("elbow routes are orthogonal and avoid an obstacle in between", () => {
  const start = { x: 0, y: 50 };
  const end = { x: 400, y: 50 };
  const obstacle = { x: 150, y: 0, w: 100, h: 100 };
  const pts = routeElbow(start, { x: 1, y: 0 }, end, { x: -1, y: 0 }, [obstacle]);
  assert.deepEqual(pts[0], start);
  assert.deepEqual(pts.at(-1), end);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, "segment not orthogonal");
    const seg = { x: Math.min(pts[i].x, pts[i - 1].x), y: Math.min(pts[i].y, pts[i - 1].y), w: Math.abs(pts[i].x - pts[i - 1].x), h: Math.abs(pts[i].y - pts[i - 1].y) };
    const inner = { x: obstacle.x + 1, y: obstacle.y + 1, w: obstacle.w - 2, h: obstacle.h - 2 };
    assert.ok(!rectsIntersect(seg, inner), "segment crosses obstacle");
  }
});

test("elbow route between facing shapes is a straight line when aligned", () => {
  const pts = routeElbow({ x: 100, y: 30 }, { x: 1, y: 0 }, { x: 300, y: 30 }, { x: -1, y: 0 }, []);
  assert.equal(pts.length, 2);
});

test("elbow connector leaves the source on its bound side", () => {
  const a = box("a", 0, 0);
  const b = box("b", 300, 200);
  const c = createElement("arrow", { id: "c", x: 0, y: 0, points: [[0, 0], [1, 1]], routing: "elbow", startBinding: { id: "a", fx: 0.5, fy: 1, fixed: true }, endBinding: { id: "b", fx: 0, fy: 0.5, fixed: true } });
  const pts = connectorWorldPoints(resolveConnector(c, new Map([["a", a], ["b", b]])));
  near(pts[0].x, 50); near(pts[0].y, 60);
  assert.equal(pts[1].x, pts[0].x);
  assert.ok(pts[1].y > pts[0].y);
});

test("curvePath produces a cubic path through all points", () => {
  const d = curvePath([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]);
  assert.match(d, /^M0 0 C/);
  assert.equal((d.match(/C/g) || []).length, 2);
});
