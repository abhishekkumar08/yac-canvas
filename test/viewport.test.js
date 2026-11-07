import { test } from "node:test";
import assert from "node:assert/strict";
import { toWorld, toScreen, zoomAt, fitBounds, clampZoom, MIN_ZOOM, MAX_ZOOM } from "../web/src/engine/viewport.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("toWorld and toScreen are inverses", () => {
  const vp = { scrollX: 40, scrollY: -25, zoom: 1.7 };
  const w = toWorld(vp, toScreen(vp, { x: 123, y: 456 }));
  near(w.x, 123); near(w.y, 456);
});

test("zoomAt keeps the world point under the cursor fixed", () => {
  const vp = { scrollX: 10, scrollY: 20, zoom: 1 };
  const cursor = { x: 300, y: 200 };
  const before = toWorld(vp, cursor);
  const next = zoomAt(vp, cursor, 2.5);
  const after = toWorld(next, cursor);
  near(next.zoom, 2.5); near(before.x, after.x); near(before.y, after.y);
});

test("clampZoom keeps zoom within limits", () => {
  assert.equal(clampZoom(0.0001), MIN_ZOOM);
  assert.equal(clampZoom(1000), MAX_ZOOM);
});

test("fitBounds centres content and fits it", () => {
  const vp = fitBounds({ x: 0, y: 0, w: 1000, h: 500 }, { width: 600, height: 600 }, 50);
  near(vp.zoom, 0.5);
  const c = toScreen(vp, { x: 500, y: 250 });
  near(c.x, 300); near(c.y, 300);
});

test("fitBounds never zooms past 1 for small content", () => {
  assert.equal(fitBounds({ x: 0, y: 0, w: 10, h: 10 }, { width: 800, height: 600 }, 40).zoom, 1);
});
