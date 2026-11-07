import { test } from "node:test";
import assert from "node:assert/strict";
import { History } from "../web/src/engine/history.js";

test("undo returns the last entry and redo returns it again", () => {
  const h = new History();
  h.record("a");
  assert.equal(h.undo(), "a");
  assert.equal(h.redo(), "a");
});

test("recording after undo drops the redo branch", () => {
  const h = new History();
  h.record("a");
  h.undo();
  h.record("b");
  assert.equal(h.canRedo, false);
});

test("same key merges consecutive entries with the merge function", () => {
  const h = new History();
  h.record("a", "nudge", (x, y) => x + y);
  h.record("b", "nudge", (x, y) => x + y);
  assert.equal(h.undo(), "ab");
  assert.equal(h.canUndo, false);
});

test("undo with nothing to undo returns null", () => {
  assert.equal(new History().undo(), null);
});

test("history is capped", () => {
  const h = new History(3);
  for (const s of ["a", "b", "c", "d"]) h.record(s);
  assert.deepEqual([h.undo(), h.undo(), h.undo(), h.canUndo], ["d", "c", "b", false]);
});
