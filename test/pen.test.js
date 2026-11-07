import { test } from "node:test";
import assert from "node:assert/strict";
import { penNodesToPoints, pathFromNodes, pathNodesWorld } from "../web/src/engine/pen.js";

test("straight nodes become a polyline through every node", () => {
  const pts = penNodesToPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false);
  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
});

test("a handle curves the segment", () => {
  const pts = penNodesToPoints([{ x: 0, y: 0, hx: 0, hy: -20 }, { x: 10, y: 0 }], false);
  assert.ok(pts.length > 2);
  assert.ok(Math.min(...pts.map((p) => p.y)) < -1);
});

test("pathFromNodes normalises to its bounds and keeps local nodes", () => {
  const p = pathFromNodes([{ x: 100, y: 50 }, { x: 140, y: 50 }, { x: 120, y: 90 }], true);
  assert.deepEqual([p.x, p.y, p.w, p.h, p.pw, p.ph], [100, 50, 40, 40, 40, 40]);
  assert.deepEqual(p.nodes[1], { x: 40, y: 0, hx: 0, hy: 0 });
  assert.equal(p.rings[0].length, 3);
});

test("moving a node round-trips through world space", () => {
  const p = { ...pathFromNodes([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 40 }], true), angle: 0 };
  const world = pathNodesWorld(p);
  world[2] = { ...world[2], y: 80 };
  const q = pathFromNodes(world, true);
  assert.deepEqual([q.h, q.nodes[2].y], [80, 80]);
});

test("pathNodesWorld scales nodes when the path was resized", () => {
  const p = { ...pathFromNodes([{ x: 0, y: 0 }, { x: 10, y: 10 }], false), angle: 0, w: 20, h: 20 };
  assert.deepEqual(pathNodesWorld(p)[1], { x: 20, y: 20, hx: 0, hy: 0 });
});
