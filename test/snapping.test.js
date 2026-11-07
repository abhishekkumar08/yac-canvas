import { test } from "node:test";
import assert from "node:assert/strict";
import { snapToGrid, snapMove } from "../web/src/engine/snapping.js";

test("snapToGrid rounds to the nearest step", () => {
  assert.equal(snapToGrid(14, 10), 10);
  assert.equal(snapToGrid(16, 10), 20);
});

test("snapMove aligns left edges within the threshold", () => {
  const r = snapMove({ x: 103, y: 300, w: 50, h: 50 }, [{ x: 100, y: 0, w: 80, h: 40 }], 5);
  assert.equal(r.dx, -3);
  assert.equal(r.dy, 0);
  assert.ok(r.guides.some((g) => g.x1 === 100 && g.x2 === 100));
});

test("snapMove aligns centres", () => {
  const r = snapMove({ x: 0, y: 18, w: 20, h: 20 }, [{ x: 200, y: 0, w: 60, h: 60 }], 5);
  assert.equal(r.dy, 2);
});

test("snapMove ignores far targets", () => {
  const r = snapMove({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 500, y: 500, w: 10, h: 10 }], 5);
  assert.deepEqual([r.dx, r.dy, r.guides.length], [0, 0, 0]);
});
