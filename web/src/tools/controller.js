import { toWorld, zoomAt, viewRect } from "@/engine/viewport.js";
import { hitTest, elementBounds, LINEAR, boundsOfPoints, rectContains } from "@/engine/geometry.js";
import { createElement } from "@/engine/elements.js";
import { resizeElement, rotateElements, scaleElements, applyConstraints, cropResize } from "@/engine/transform.js";
import { snapMove, snapToGrid } from "@/engine/snapping.js";
import { findBinding, resolveConnector, connectorWorldPoints, setConnectorPoints, isConnector } from "@/engine/connectors.js";
import {
  expandSelection, duplicateElements, assignFrames, elementsInRect, touch, renderOrder, deleteElements, selectionBounds,
} from "@/engine/scene.js";
import { getHandles, handleAt } from "@/tools/handles.js";
import { nextFrameName } from "@/ui/actions.js";
import { pathFromNodes, pathNodesWorld } from "@/engine/pen.js";
import { measureText } from "@/render/text.js";

const BOX_TOOLS = new Set(["rect", "ellipse", "diamond", "frame", "sticky", "table"]);
const DEFAULT_SIZE = { rect: [160, 90], ellipse: [140, 100], diamond: [140, 110], frame: [400, 300], sticky: [200, 200], table: [300, 120] };

export function hitElement(editor, p, { includeLocked = false } = {}) {
  const tol = 6 / editor.viewport.zoom;
  const order = renderOrder(editor.elements);
  for (let i = order.length - 1; i >= 0; i--) {
    const el = order[i];
    if (el.hidden || (el.locked && !includeLocked)) continue;
    if (el.frameId) {
      const f = editor.elements.find((e) => e.id === el.frameId);
      if (f && (p.x < f.x || p.y < f.y || p.x > f.x + f.w || p.y > f.y + f.h)) continue;
    }
    if (hitTest(el, p, tol)) return el;
  }
  let best = null;
  let bestArea = Infinity;
  for (const el of order) {
    if (el.hidden || (el.locked && !includeLocked) || LINEAR.has(el.type) || el.type === "frame") continue;
    const area = el.w * el.h;
    if (area < bestArea && hitTest({ ...el, fill: "#000" }, p, tol)) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

export function createController(editor, { getRect, onImageTool, onComment, onCursor }) {
  let drag = null;
  let spaceDown = false;

  const screenPt = (e) => {
    const r = getRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const zoom = () => editor.viewport.zoom;
  const s = () => editor.state;
  const snapGrid = (p) => (s().prefs.snapToGrid ? { x: snapToGrid(p.x, s().prefs.gridSize), y: snapToGrid(p.y, s().prefs.gridSize) } : p);

  function newElement(type, props) {
    const st = s().style;
    const base = {
      stroke: st.stroke, fill: st.fill, fillStyle: st.fillStyle, strokeWidth: st.strokeWidth, strokeStyle: st.strokeStyle,
      roughness: st.roughness, opacity: st.opacity, radius: st.radius, fontFamily: st.fontFamily, fontSize: st.fontSize,
    };
    if (type === "line" || type === "arrow") Object.assign(base, { routing: st.routing, startArrow: type === "arrow" ? st.startArrow : null, endArrow: type === "arrow" ? st.endArrow : null });
    if (type === "text") Object.assign(base, { textAlign: "left" });
    if (type === "sticky" || type === "frame" || type === "table" || type === "freedraw") {
      for (const k of ["fill", "fillStyle", "radius"]) delete base[k];
      if (type !== "freedraw") delete base.stroke;
      if (type === "sticky" || type === "frame") delete base.roughness;
      if (type === "frame") delete base.strokeWidth;
    }
    return createElement(type, { ...base, ...props });
  }

  const textAt = (p) => newElement("text", { x: p.x, y: p.y - s().style.fontSize * 0.6, w: 10, h: s().style.fontSize * 1.25 });

  function finishCreate(el, { keepTool = false } = {}) {
    editor.setElements(assignFrames(editor.elements, [el.id]));
    editor.end("create");
    editor.select([el.id], { expand: false });
    if (!s().toolLocked && !keepTool) editor.set({ tool: "select" });
  }

  function startTextEdit(el) {
    editor.begin();
    editor.set({ editingTextId: el.id, selectedIds: [el.id] });
  }

  function beginMove(p, ids, { duplicate = false } = {}) {
    editor.begin();
    let moveIds = expandSelection(editor.elements, ids, { withFrameChildren: true });
    if (duplicate) {
      const { elements, newIds } = duplicateElements(editor.elements, moveIds, { dx: 0, dy: 0 });
      editor.setElements(elements);
      moveIds = newIds;
      editor.set({ selectedIds: newIds });
    }
    const orig = new Map(editor.elements.filter((e) => moveIds.includes(e.id)).map((e) => [e.id, e]));
    const movingSet = new Set(orig.keys());
    const bounds = selectionBounds([...orig.values()], [...orig.keys()]);
    const vb = visibleBounds();
    const others = editor.elements
      .filter((e) => !movingSet.has(e.id) && !LINEAR.has(e.type))
      .map(elementBounds)
      .filter((b) => b.x < vb.x + vb.w && b.x + b.w > vb.x && b.y < vb.y + vb.h && b.y + b.h > vb.y)
      .slice(0, 300);
    drag = { type: "move", start: p, orig, bounds, others, moved: false };
  }

  const visibleBounds = () => viewRect(editor.viewport, getRect());

  function pointerDown(e) {
    if (s().editingTextId) return;
    const sp = screenPt(e);
    const p = toWorld(editor.viewport, sp);
    const tool = s().tool;
    if (e.button === 1 || spaceDown || tool === "hand" || s().viewMode) {
      drag = { type: "pan", start: sp, vp: editor.viewport };
      return;
    }
    if (e.button !== 0) return;

    if (tool === "select" && s().croppingId) {
      const h = handleAt(getHandles(editor.selected, zoom()), p, zoom());
      if (h?.kind === "resize") return beginHandle(h, p, e);
      editor.set({ croppingId: null });
    }

    if (tool === "select" && s().editingPathId) {
      const path = editor.elements.find((x) => x.id === s().editingPathId);
      const ph = path && pathHandleAt(path, p);
      if (ph) {
        editor.begin();
        drag = { type: "path-node", id: path.id, ...ph };
        return;
      }
      editor.set({ editingPathId: null });
    }

    if (tool === "select") {
      const handles = getHandles(editor.selected, zoom());
      const h = handleAt(handles, p, zoom());
      if (h) return beginHandle(h, p, e);
      const el = hitElement(editor, p);
      if (el) {
        const groupEditing = s().editingGroupId && el.groupIds.includes(s().editingGroupId);
        const ids = groupEditing ? [el.id] : expandSelection(editor.elements, [el.id]);
        const already = ids.every((id) => s().selectedIds.includes(id));
        if (e.shiftKey) {
          const next = already ? s().selectedIds.filter((id) => !ids.includes(id)) : [...s().selectedIds, ...ids];
          editor.set({ selectedIds: next });
          return;
        }
        if (!already) editor.set({ selectedIds: ids, editingGroupId: groupEditing ? s().editingGroupId : null });
        if (s().selectedIds.length === 1 && isConnector(el) && (el.startBinding || el.endBinding)) {
          drag = { type: "connector-move", id: el.id, start: p, orig: el, moved: false };
          editor.begin();
          return;
        }
        beginMove(p, s().selectedIds, { duplicate: e.altKey });
        return;
      }
      if (!e.shiftKey) editor.set({ selectedIds: [], editingGroupId: null });
      drag = { type: "marquee", start: p, base: e.shiftKey ? s().selectedIds : [] };
      return;
    }

    if (BOX_TOOLS.has(tool)) {
      editor.begin();
      const start = snapGrid(p);
      const el = newElement(tool, { x: start.x, y: start.y, w: 1, h: 1, ...(tool === "frame" ? { name: nextFrameName(editor.elements) } : {}) });
      editor.setElements([...editor.elements, el]);
      drag = { type: "create", id: el.id, start, moved: false };
      return;
    }

    if (tool === "text") {
      const hit = hitElement(editor, p);
      if (hit && hit.type === "text") return startTextEdit(hit);
      editor.begin();
      const el = textAt(p);
      editor.setElements([...editor.elements, el]);
      if (!s().toolLocked) editor.set({ tool: "select" });
      editor.set({ editingTextId: el.id, selectedIds: [el.id] });
      return;
    }

    if (tool === "line" || tool === "arrow") {
      editor.begin();
      const start = snapGrid(p);
      const binding = tool === "arrow" || e.altKey ? findBinding(editor.elements, start, { tol: 8 / zoom() }) : null;
      const el = newElement(tool, { x: start.x, y: start.y, points: [[0, 0], [0, 0]], startBinding: binding });
      editor.setElements([...editor.elements, el]);
      drag = { type: "linear", id: el.id, start, moved: false };
      return;
    }

    if (tool === "freedraw") {
      editor.begin();
      const el = newElement("freedraw", { x: p.x, y: p.y, points: [[0, 0]] });
      editor.setElements([...editor.elements, el], { raw: true });
      drag = { type: "freedraw", id: el.id, pts: [[0, 0]] };
      return;
    }

    if (tool === "eraser") {
      drag = { type: "erase", last: p, ids: new Set() };
      eraseAt(p, p);
      return;
    }

    if (tool === "laser") {
      drag = { type: "laser" };
      editor.set({ laser: [...s().laser, { x: p.x, y: p.y, t: performance.now(), start: true }] });
      return;
    }

    if (tool === "pen") {
      const draft = s().penDraft ?? { nodes: [] };
      const first = draft.nodes[0];
      if (first && draft.nodes.length > 2 && Math.hypot(first.x - p.x, first.y - p.y) < 10 / zoom()) {
        finishPen(true);
        return;
      }
      const q = snapGrid(p);
      editor.set({ penDraft: { nodes: [...draft.nodes, { x: q.x, y: q.y, hx: 0, hy: 0 }] } });
      drag = { type: "pen-handle", start: q };
      return;
    }

    if (tool === "comment") return onComment?.(p);
    if (tool === "image") return onImageTool?.(p);
  }

  function beginHandle(h, p, e) {
    editor.begin();
    const sel = editor.selected.filter((x) => !x.locked);
    if (h.kind === "resize") {
      drag = { type: "resize", handle: h.handle, orig: sel, bounds: selectionBounds(sel, sel.map((x) => x.id)) };
      const frame = sel.length === 1 && sel[0].type === "frame" && !sel[0].layout && !sel[0].angle ? sel[0] : null;
      drag.kids = frame ? editor.elements.filter((c) => c.frameId === frame.id) : [];
      drag.crop = sel.length === 1 && sel[0].type === "image" && s().croppingId === sel[0].id;
    } else if (h.kind === "rotate") {
      drag = { type: "rotate", orig: sel, pivot: h.pivot, startAngle: Math.atan2(p.y - h.pivot.y, p.x - h.pivot.x) };
    } else if (h.kind === "point") {
      drag = { type: "point", id: h.id, index: h.index };
    } else if (h.kind === "midpoint") {
      const el = sel[0];
      const pts = connectorWorldPoints(el);
      pts.splice(h.index, 0, { x: h.x, y: h.y });
      editor.setElements(editor.elements.map((x) => (x.id === el.id ? touch(setConnectorPoints(x, pts), {}) : x)));
      drag = { type: "point", id: h.id, index: h.index };
    }
    drag.shift = e.shiftKey;
  }

  function eraseAt(a, b) {
    const tol = 8 / zoom();
    const found = [];
    for (const el of editor.elements) {
      if (el.locked || drag.ids.has(el.id)) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / tol));
      for (let i = 0; i <= steps; i++) {
        const q = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
        const solid = el.type === "frame" ? el : { ...el, fill: el.fill === "transparent" && !LINEAR.has(el.type) ? "#000" : el.fill };
        if (hitTest(solid, q, tol)) {
          found.push(el.id);
          break;
        }
      }
    }
    for (const id of expandSelection(editor.elements, found)) drag.ids.add(id);
    editor.set({ erasing: [...drag.ids] });
  }

  function pointerMove(e) {
    const sp = screenPt(e);
    const p = toWorld(editor.viewport, sp);
    onCursor?.(p);
    if (!drag) {
      if (s().tool === "arrow" || s().tool === "line") {
        const hint = findBinding(editor.elements, p, { tol: 8 / zoom() });
        if ((hint?.id ?? null) !== (s().bindingHint?.id ?? null)) editor.set({ bindingHint: hint });
      } else if (s().bindingHint) editor.set({ bindingHint: null });
      if (s().penDraft) editor.set({ cursorWorld: p });
      return;
    }
    switch (drag.type) {
      case "pan":
        editor.setViewport({ scrollX: drag.vp.scrollX + (sp.x - drag.start.x) / drag.vp.zoom, scrollY: drag.vp.scrollY + (sp.y - drag.start.y) / drag.vp.zoom });
        break;
      case "move": {
        let dx = p.x - drag.start.x;
        let dy = p.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) < 3 / zoom()) return;
        drag.moved = true;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let guides = [];
        const b = drag.bounds;
        if (s().prefs.snapToGrid) {
          dx = snapToGrid(b.x + dx, s().prefs.gridSize) - b.x;
          dy = snapToGrid(b.y + dy, s().prefs.gridSize) - b.y;
        } else if (s().prefs.snapToObjects && !(e.metaKey || e.ctrlKey)) {
          const snap = snapMove({ ...b, x: b.x + dx, y: b.y + dy }, drag.others, 6 / zoom());
          dx += snap.dx;
          dy += snap.dy;
          guides = snap.guides;
        }
        const next = editor.elements.map((el) => {
          const o = drag.orig.get(el.id);
          return o ? { ...o, x: o.x + dx, y: o.y + dy, version: el.version + 1 } : el;
        });
        editor.setElements(next);
        editor.set({ guides });
        break;
      }
      case "connector-move": {
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) < 3 / zoom()) return;
        drag.moved = true;
        const o = drag.orig;
        editor.setElements(editor.elements.map((el) => (el.id === o.id ? { ...o, x: o.x + dx, y: o.y + dy, startBinding: null, endBinding: null, version: el.version + 1 } : el)));
        break;
      }
      case "marquee": {
        const r = { x: Math.min(drag.start.x, p.x), y: Math.min(drag.start.y, p.y), w: Math.abs(p.x - drag.start.x), h: Math.abs(p.y - drag.start.y) };
        const covered = new Set(editor.elements.filter((f) => rectContains(r, f)).map((f) => f.id));
        const inside = elementsInRect(editor.elements.filter((x) => !x.frameId || !covered.has(x.frameId)), r).map((x) => x.id);
        const next = [...new Set([...drag.base, ...expandSelection(editor.elements, inside)])];
        const same = next.length === s().selectedIds.length && next.every((id, i) => id === s().selectedIds[i]);
        editor.set(same ? { marquee: r } : { marquee: r, selectedIds: next });
        break;
      }
      case "resize": {
        const q = snapGrid(p);
        const opts = { keepRatio: e.shiftKey, fromCenter: e.altKey };
        let updated;
        if (drag.orig.length === 1) {
          const o = drag.orig[0];
          if (o.type === "image" || o.type === "instance") opts.keepRatio = drag.crop ? false : !e.shiftKey;
          let r = resizeElement(o, drag.handle, q, opts);
          if (drag.crop) r = cropResize(o, r);
          if (o.type === "text") {
            if (drag.handle.length === 2) r = { ...r, fontSize: Math.max(4, (o.fontSize * r.h) / o.h) };
            else r = { ...r, autoSize: false, h: Math.max(r.h, measureText(o.text, o).h) };
          }
          updated = [r];
          if (drag.kids.length) updated.push(...applyConstraints(drag.kids, o, r));
        } else {
          const box = { id: "_", type: "rect", angle: 0, ...drag.bounds };
          const nb = resizeElement(box, drag.handle, q, opts);
          updated = scaleElements(drag.orig, drag.bounds, nb);
        }
        const map = new Map(updated.map((u) => [u.id, u]));
        editor.setElements(editor.elements.map((el) => (map.has(el.id) ? { ...map.get(el.id), version: el.version + 1 } : el)));
        break;
      }
      case "rotate": {
        let delta = Math.atan2(p.y - drag.pivot.y, p.x - drag.pivot.x) - drag.startAngle;
        if (e.shiftKey) {
          const base = drag.orig.length === 1 ? drag.orig[0].angle || 0 : 0;
          const step = Math.PI / 12;
          delta = Math.round((base + delta) / step) * step - base;
        }
        const map = new Map(rotateElements(drag.orig, drag.pivot, delta).map((u) => [u.id, u]));
        editor.setElements(editor.elements.map((el) => (map.has(el.id) ? { ...map.get(el.id), version: el.version + 1 } : el)));
        break;
      }
      case "point": {
        const el = editor.elements.find((x) => x.id === drag.id);
        const pts = connectorWorldPoints(el);
        const last = drag.index === pts.length - 1;
        const isEnd = drag.index === 0 || last;
        let q = snapGrid(p);
        let patch = {};
        if (isEnd && isConnector(el)) {
          const binding = findBinding(editor.elements, q, { tol: 8 / zoom(), exclude: new Set([el.id]) });
          patch = last ? { endBinding: binding } : { startBinding: binding };
          editor.set({ bindingHint: binding });
        } else if (e.shiftKey && pts.length > 1) {
          const ref = pts[drag.index - 1] ?? pts[drag.index + 1];
          q = Math.abs(q.x - ref.x) > Math.abs(q.y - ref.y) ? { x: q.x, y: ref.y } : { x: ref.x, y: q.y };
        }
        pts[drag.index] = q;
        let next = { ...setConnectorPoints(el, pts), ...patch };
        if (next.startBinding || next.endBinding) next = resolveConnector(next, new Map(editor.elements.map((x) => [x.id, x])));
        editor.setElements(editor.elements.map((x) => (x.id === el.id ? touch(next, {}) : x)), { raw: true });
        break;
      }
      case "create": {
        const q = snapGrid(p);
        let w = q.x - drag.start.x;
        let h = q.y - drag.start.y;
        if (Math.hypot(w, h) * zoom() > 3) drag.moved = true;
        if (e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * m;
          h = Math.sign(h || 1) * m;
        }
        let x = w < 0 ? drag.start.x + w : drag.start.x;
        let y = h < 0 ? drag.start.y + h : drag.start.y;
        if (e.altKey) {
          x = drag.start.x - Math.abs(w);
          y = drag.start.y - Math.abs(h);
          w *= 2;
          h *= 2;
        }
        editor.setElements(editor.elements.map((el) => (el.id === drag.id ? touch(el, { x, y, w: Math.max(1, Math.abs(w)), h: Math.max(1, Math.abs(h)) }) : el)), { raw: true });
        break;
      }
      case "linear": {
        let q = snapGrid(p);
        const el = editor.elements.find((x) => x.id === drag.id);
        if (e.shiftKey) {
          const dx = q.x - drag.start.x;
          const dy = q.y - drag.start.y;
          const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          q = { x: drag.start.x + len * Math.cos(a), y: drag.start.y + len * Math.sin(a) };
        }
        if (Math.hypot(q.x - drag.start.x, q.y - drag.start.y) * zoom() > 4) drag.moved = true;
        const binding = el.type === "arrow" || e.altKey ? findBinding(editor.elements, q, { tol: 8 / zoom(), exclude: new Set([el.id, el.startBinding?.id]) }) : null;
        editor.set({ bindingHint: binding });
        let next = { ...setConnectorPoints(el, [connectorWorldPoints(el)[0], q]), endBinding: binding };
        if (next.startBinding || next.endBinding) next = resolveConnector(next, new Map(editor.elements.map((x) => [x.id, x])));
        editor.setElements(editor.elements.map((x) => (x.id === el.id ? touch(next, {}) : x)), { raw: true });
        break;
      }
      case "freedraw": {
        const el = editor.elements.find((x) => x.id === drag.id);
        const lp = [p.x - el.x, p.y - el.y];
        const lastPt = drag.pts.at(-1);
        if (Math.hypot(lp[0] - lastPt[0], lp[1] - lastPt[1]) < 1.5 / zoom()) return;
        drag.pts.push(lp);
        editor.setElements(editor.elements.map((x) => (x.id === el.id ? { ...x, points: [...drag.pts], version: x.version + 1 } : x)), { raw: true });
        break;
      }
      case "erase":
        eraseAt(drag.last, p);
        drag.last = p;
        break;
      case "laser":
        editor.set({ laser: [...s().laser.filter((l) => performance.now() - l.t < 1200), { x: p.x, y: p.y, t: performance.now() }] });
        break;
      case "path-node": {
        const el = editor.elements.find((x) => x.id === drag.id);
        const nodes = pathNodesWorld(el);
        const n = nodes[drag.index];
        const q = snapGrid(p);
        if (drag.part === "node") nodes[drag.index] = { ...n, x: q.x, y: q.y };
        else if (drag.part === "out") nodes[drag.index] = { ...n, hx: q.x - n.x, hy: q.y - n.y };
        else nodes[drag.index] = { ...n, hx: n.x - q.x, hy: n.y - q.y };
        editor.setElements(editor.elements.map((x) => (x.id === el.id ? touch(x, pathFromNodes(nodes, el.closed)) : x)));
        break;
      }
      case "pen-handle": {
        const nodes = [...s().penDraft.nodes];
        const n = nodes.at(-1);
        nodes[nodes.length - 1] = { ...n, hx: p.x - n.x, hy: p.y - n.y };
        editor.set({ penDraft: { nodes } });
        break;
      }
      default:
    }
  }

  function pointerUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    switch (d.type) {
      case "move":
        if (d.moved) {
          editor.setElements(assignFrames(editor.elements, [...d.orig.keys()]));
          editor.end("move");
        } else editor.end();
        editor.set({ guides: [] });
        break;
      case "connector-move":
        editor.end(d.moved ? "move" : null);
        break;
      case "marquee":
        editor.set({ marquee: null });
        break;
      case "resize":
      case "rotate":
        editor.setElements(assignFrames(editor.elements, editor.state.selectedIds));
        editor.end(d.type);
        break;
      case "point":
        editor.set({ bindingHint: null });
        editor.end("point");
        break;
      case "path-node":
        editor.end("path-node");
        break;
      case "create": {
        let el = editor.elements.find((x) => x.id === d.id);
        if (!d.moved) {
          const [w, h] = DEFAULT_SIZE[el.type] ?? [100, 100];
          el = { ...el, x: d.start.x - w / 2, y: d.start.y - h / 2, w, h };
          editor.setElements(editor.elements.map((x) => (x.id === el.id ? touch(el, {}) : x)), { raw: true });
        }
        if (el.type === "frame") {
          const inside = elementsInRect(editor.elements.filter((x) => x.id !== el.id), el).map((x) => x.id);
          editor.setElements(assignFrames(editor.elements, [el.id, ...inside]), { raw: true });
          const rest = editor.elements.filter((x) => x.id !== el.id);
          const frame = editor.elements.find((x) => x.id === el.id);
          editor.setElements([...rest.filter((x) => x.type === "frame"), frame, ...rest.filter((x) => x.type !== "frame")], { raw: true });
          editor.end("create");
          editor.select([el.id], { expand: false });
          if (!s().toolLocked) editor.set({ tool: "select" });
          break;
        }
        finishCreate(el);
        if (el.type === "sticky") startTextEdit(editor.elements.find((x) => x.id === el.id));
        break;
      }
      case "linear": {
        editor.set({ bindingHint: null });
        const el = editor.elements.find((x) => x.id === d.id);
        if (!d.moved) {
          editor.setElements(editor.elements.filter((x) => x.id !== el.id), { raw: true });
          editor.cancel();
          break;
        }
        finishCreate(el);
        break;
      }
      case "freedraw": {
        const el = editor.elements.find((x) => x.id === d.id);
        const b = boundsOfPoints(el.points.map(([x, y]) => ({ x, y })));
        const norm = { ...el, x: el.x + b.x, y: el.y + b.y, w: Math.max(1, b.w), h: Math.max(1, b.h), points: el.points.map(([x, y]) => [x - b.x, y - b.y]) };
        editor.setElements(editor.elements.map((x) => (x.id === el.id ? touch(norm, {}) : x)), { raw: true });
        finishCreate(norm, { keepTool: true });
        editor.set({ selectedIds: [] });
        break;
      }
      case "erase":
        if (d.ids.size) editor.setElements(deleteElements(editor.elements, [...d.ids]));
        editor.set({ erasing: [] });
        break;
      default:
    }
  }

  function finishPen(closed) {
    const draft = s().penDraft;
    editor.set({ penDraft: null });
    if (!draft || draft.nodes.length < 2) return;
    const st = s().style;
    const el = createElement("path", {
      ...pathFromNodes(draft.nodes, closed),
      stroke: st.stroke, strokeWidth: st.strokeWidth, strokeStyle: st.strokeStyle, roughness: st.roughness, opacity: st.opacity,
      fill: closed ? st.fill : "transparent", fillStyle: st.fillStyle,
    });
    editor.setElements([...editor.elements, el]);
    editor.select([el.id], { expand: false });
    if (!s().toolLocked) editor.set({ tool: "select" });
  }

  function pathHandleAt(el, p) {
    const r = 7 / zoom();
    const nodes = pathNodesWorld(el);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.hx || n.hy) {
        if (Math.hypot(n.x + n.hx - p.x, n.y + n.hy - p.y) <= r) return { index: i, part: "out" };
        if (Math.hypot(n.x - n.hx - p.x, n.y - n.hy - p.y) <= r) return { index: i, part: "in" };
      }
      if (Math.hypot(n.x - p.x, n.y - p.y) <= r) return { index: i, part: "node" };
    }
    return null;
  }

  function doubleClick(e) {
    const p = toWorld(editor.viewport, screenPt(e));
    if (s().tool === "pen") return finishPen(false);
    if (s().tool !== "select") return;
    const el = hitElement(editor, p);
    if (!el) {
      editor.begin();
      const text = textAt(p);
      editor.setElements([...editor.elements, text]);
      editor.set({ editingTextId: text.id, selectedIds: [text.id] });
      return;
    }
    if (el.groupIds.length && !s().editingGroupId) {
      editor.set({ editingGroupId: el.groupIds[0], selectedIds: [el.id] });
      return;
    }
    if (el.type === "table") {
      const lx = p.x - el.x;
      const ly = p.y - el.y;
      const c = Math.min(el.cols - 1, Math.max(0, Math.floor(lx / (el.w / el.cols))));
      const r = Math.min(el.rows - 1, Math.max(0, Math.floor(ly / (el.h / el.rows))));
      editor.begin();
      editor.set({ editingCell: { id: el.id, r, c }, selectedIds: [el.id] });
      return;
    }
    if (el.type === "image") {
      editor.set({ croppingId: el.id, selectedIds: [el.id] });
      return;
    }
    if (el.type === "path" && el.nodes?.length) {
      editor.set({ editingPathId: el.id, selectedIds: [el.id] });
      return;
    }
    if (["image", "freedraw", "path", "instance", "frame"].includes(el.type)) return;
    startTextEdit(el);
  }

  function wheel(e) {
    e.preventDefault();
    const sp = screenPt(e);
    const vp = editor.viewport;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025) * (e.ctrlKey && !e.metaKey ? 2.5 : 1));
      editor.setViewport(zoomAt(vp, sp, vp.zoom * factor));
      return;
    }
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    editor.setViewport({ scrollX: vp.scrollX - dx / vp.zoom, scrollY: vp.scrollY - dy / vp.zoom });
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    doubleClick,
    wheel,
    finishPen,
    cancel() {
      if (drag && drag.type !== "pan") editor.cancel();
      drag = null;
      editor.set({ marquee: null, guides: [], bindingHint: null, erasing: [], penDraft: null });
    },
    setSpace(v) {
      spaceDown = v;
    },
    get spaceDown() {
      return spaceDown;
    },
    get dragging() {
      return drag?.type ?? null;
    },
  };
}

