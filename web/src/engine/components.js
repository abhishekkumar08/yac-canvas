import { createElement, newId, reseed } from "./elements.js";
import { touch } from "./scene.js";

export const makeComponent = (els, frameId) =>
  els.map((e) => (e.id === frameId ? touch(e, { isComponent: true, name: e.name && e.name !== "Frame" ? e.name : "Component" }) : e));

export function createInstance(els, masterId, at) {
  const m = els.find((e) => e.id === masterId);
  return createElement("instance", { componentId: masterId, x: at.x, y: at.y, w: m.w, h: m.h, name: m.name });
}

export function instanceChildren(els, inst) {
  const m = els.find((e) => e.id === inst.componentId);
  if (!m) return [];
  const sx = inst.w / (m.w || 1);
  const sy = inst.h / (m.h || 1);
  return els
    .filter((e) => e.frameId === m.id)
    .map((c) => ({
      ...c,
      id: `${inst.id}:${c.id}`,
      x: inst.x + (c.x - m.x) * sx,
      y: inst.y + (c.y - m.y) * sy,
      w: c.w * sx,
      h: c.h * sy,
      points: c.points?.map(([px, py]) => [px * sx, py * sy]),
      frameId: inst.id,
      locked: true,
    }));
}

export function detachInstance(els, instId) {
  const inst = els.find((e) => e.id === instId);
  const m = inst && els.find((e) => e.id === inst.componentId);
  if (!m) return els;
  const frame = createElement("frame", {
    x: inst.x, y: inst.y, w: inst.w, h: inst.h,
    name: inst.name ?? m.name, fill: m.fill, stroke: m.stroke, strokeWidth: m.strokeWidth, radius: m.radius, isComponent: false,
  });
  const idMap = {};
  const kids = instanceChildren(els, inst).map((c) => {
    const id = newId();
    idMap[c.id.split(":")[1]] = id;
    return { ...c, id, frameId: frame.id, locked: false, seed: reseed(), version: 1 };
  });
  for (const k of kids) {
    for (const key of ["startBinding", "endBinding"]) {
      if (k[key]) k[key] = idMap[k[key].id] ? { ...k[key], id: idMap[k[key].id] } : null;
    }
  }
  const i = els.indexOf(inst);
  return [...els.slice(0, i), frame, ...kids, ...els.slice(i + 1)];
}
