import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAutoSave, AUTO_SAVE_INTERVAL } from "../web/src/store/versions.js";
import { TEMPLATES } from "../web/src/ui/templates.js";
import { validateBoard } from "../web/src/engine/serialize.js";

test("shouldAutoSave waits for a change and five minutes since the last auto save", () => {
  const t0 = 1_000_000;
  assert.equal(shouldAutoSave(t0, t0 + AUTO_SAVE_INTERVAL, true), true);
  assert.equal(shouldAutoSave(t0, t0 + AUTO_SAVE_INTERVAL * 3, true), true);
  assert.equal(shouldAutoSave(t0, t0 + AUTO_SAVE_INTERVAL - 1, true), false);
  assert.equal(shouldAutoSave(t0, t0 + AUTO_SAVE_INTERVAL * 3, false), false);
  assert.equal(AUTO_SAVE_INTERVAL, 5 * 60 * 1000);
});

test("there are at least eight templates with unique ids", () => {
  assert.ok(TEMPLATES.length >= 8);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

for (const t of TEMPLATES) {
  test(`template "${t.name}" builds a valid, connected board`, () => {
    const board = t.build();
    assert.doesNotThrow(() => validateBoard(board));
    assert.equal(board.uiMode, t.uiMode);
    assert.equal(board.name, t.name);
    const els = board.pages[0].elements;
    assert.ok(els.length >= 3, `${t.id} has ${els.length} elements`);
    const ids = new Set(els.map((e) => e.id));
    assert.equal(ids.size, els.length, `${t.id} has duplicate element ids`);
    for (const el of els) {
      for (const b of [el.startBinding, el.endBinding]) if (b) assert.ok(ids.has(b.id), `${t.id}: ${el.id} binds to missing ${b.id}`);
      if (el.frameId) assert.ok(ids.has(el.frameId), `${t.id}: ${el.id} sits in missing frame ${el.frameId}`);
      if (el.points) assert.ok(el.points.length >= 2 && !(el.w === 1 && el.h === 0 && el.x === 0 && el.y === 0), `${t.id}: ${el.id} was not resolved`);
    }
    assert.notEqual(t.build().pages[0].elements[0].id, els[0].id);
  });
}
