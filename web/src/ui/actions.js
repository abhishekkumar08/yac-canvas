import { toWorld, zoomAt, fitBounds } from "@/engine/viewport.js";
import { elementBounds, unionBounds } from "@/engine/geometry.js";
import { createElement, newId } from "@/engine/elements.js";
import {
  reorder, groupElements, ungroupElements, duplicateElements, deleteElements, alignElements, distributeElements,
  updateElements, expandSelection, touch, assignFrames, renderOrder,
} from "@/engine/scene.js";
import { booleanOp } from "@/engine/boolean.js";
import { treeLayout, applyAutoLayout, gridLayout, circleLayout } from "@/engine/layout.js";
import { flipElements } from "@/engine/transform.js";
import { makeComponent, createInstance, detachInstance } from "@/engine/components.js";
import { isConnector } from "@/engine/connectors.js";
import { COPY } from "@/ui/copy.js";
import { blobToDataUrl } from "@/render/exportImage.jsx";

export const nextFrameName = (els) => COPY.LABELS.FRAME_N(els.filter((e) => e.type === "frame").length + 1);

export const CLIPBOARD_TYPE = "yac-canvas/clipboard";
const STYLE_KEYS = ["stroke", "fill", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "opacity", "radius", "shadow", "fontFamily", "fontSize", "textAlign", "textColor", "startArrow", "endArrow", "routing"];
let styleClipboard = null;

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl+";
const SHIFT = isMac ? "⇧" : "Shift+";
const ALT = isMac ? "⌥" : "Alt+";
export const keyLabel = (combo) =>
  combo.split("+").map((part) => ({ mod: MOD, shift: SHIFT, alt: ALT, delete: "Del", escape: "Esc", enter: "↵" }[part] ?? part.toUpperCase()));

export function viewportCenter(editor, rect) {
  return toWorld(editor.viewport, { x: rect.width / 2, y: rect.height / 2 });
}

export function insertElements(editor, elements, { at, files = {}, select = true } = {}) {
  if (!elements.length) return [];
  const b = unionBounds(elements.map(elementBounds));
  const dx = at ? at.x - (b.x + b.w / 2) : 20;
  const dy = at ? at.y - (b.y + b.h / 2) : 20;
  const { elements: withCopies, newIds } = duplicateElements(elements, elements.map((e) => e.id), { dx, dy });
  const copies = withCopies.slice(elements.length).map((c) => (c.frameId && !newIds.includes(c.frameId) ? { ...c, frameId: null } : c));
  const fresh = Object.fromEntries(Object.entries(files).filter(([id]) => !editor.state.board.files[id]));
  if (Object.keys(fresh).length) editor.applyBoard({ ...editor.state.board, files: { ...editor.state.board.files, ...fresh } }, { record: false });
  editor.setElements(assignFrames([...editor.elements, ...copies], copies.filter((c) => !c.frameId).map((c) => c.id)));
  if (select) editor.select(newIds);
  return newIds;
}

export function clipboardPayload(editor) {
  const ids = expandSelection(editor.elements, editor.state.selectedIds, { withFrameChildren: true });
  const set = new Set(ids);
  const elements = renderOrder(editor.elements).filter((e) => set.has(e.id));
  const files = {};
  for (const el of elements) if (el.fileId && editor.state.board.files[el.fileId]) files[el.fileId] = editor.state.board.files[el.fileId];
  return elements.length ? JSON.stringify({ type: CLIPBOARD_TYPE, elements, files }) : null;
}

export function pasteText(editor, text, at) {
  try {
    const data = JSON.parse(text);
    if (data?.type === CLIPBOARD_TYPE && Array.isArray(data.elements)) {
      insertElements(editor, data.elements, { at, files: data.files ?? {} });
      return;
    }
  } catch {
    // Not our JSON: paste it as a text element below.
  }
  if (!text.trim()) return;
  const el = createElement("text", { x: at.x, y: at.y, text, fontFamily: editor.state.style.fontFamily, fontSize: editor.state.style.fontSize, stroke: editor.state.style.stroke, textAlign: "left" });
  insertElements(editor, [el], { at });
}

export async function readImageFile(file) {
  const dataUrl = await blobToDataUrl(file);
  const size = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 300, h: 200 });
    img.src = dataUrl;
  });
  return { dataUrl, ...size };
}

export async function insertImage(editor, file, at) {
  if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) throw new Error(COPY.ERRORS.IMAGE_TYPE);
  const { dataUrl, w, h } = await readImageFile(file);
  const fileId = newId();
  const scale = Math.min(1, 800 / Math.max(w, h));
  editor.applyBoard({ ...editor.state.board, files: { ...editor.state.board.files, [fileId]: dataUrl } }, { record: false });
  const el = createElement("image", { fileId, x: at.x - (w * scale) / 2, y: at.y - (h * scale) / 2, w: w * scale, h: h * scale });
  editor.setElements(assignFrames([...editor.elements, el], [el.id]));
  editor.select([el.id], { expand: false });
}

export function zoomToFit(editor, rect, ids) {
  const set = ids ? new Set(ids) : null;
  const els = editor.elements.filter((e) => !set || set.has(e.id));
  if (!els.length) return editor.setViewport({ scrollX: rect.width / 2, scrollY: rect.height / 2, zoom: 1 });
  editor.setViewport(fitBounds(unionBounds(els.map(elementBounds)), rect, 60, ids ? 4 : 1));
}

export const zoomTo = (editor, rect, zoom) => editor.setViewport(zoomAt(editor.viewport, { x: rect.width / 2, y: rect.height / 2 }, zoom));
const zoomBy = (editor, rect, factor) => zoomTo(editor, rect, editor.viewport.zoom * factor);

export const BOARD_FILE_ACCEPT = ".yaccanvas,.json,application/json";

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const sel = (editor) => editor.state.selectedIds;
const hasSel = (s) => s.selectedIds.length > 0;
const selEls = (editor) => editor.selected;

export function buildActions(editor, ui) {
  const rect = () => ui.getRect();
  const set = (fn, key) => editor.setElements(fn(editor.elements), { key });
  const tools = [
    ["select", COPY.TOOLS.select, ["v", "1"]],
    ["hand", COPY.TOOLS.hand, ["h"]],
    ["rect", COPY.TOOLS.rect, ["r", "2"]],
    ["diamond", COPY.TOOLS.diamond, ["d", "3"]],
    ["ellipse", COPY.TOOLS.ellipse, ["o", "4"]],
    ["arrow", COPY.TOOLS.arrow, ["a", "5"]],
    ["line", COPY.TOOLS.line, ["l", "6"]],
    ["freedraw", COPY.TOOLS.freedraw, ["x", "7"]],
    ["text", COPY.TOOLS.text, ["t", "8"]],
    ["image", COPY.TOOLS.image, ["9"]],
    ["eraser", COPY.TOOLS.eraser, ["e", "0"]],
    ["sticky", COPY.TOOLS.sticky, ["s"]],
    ["frame", COPY.TOOLS.frame, ["f"]],
    ["pen", COPY.TOOLS.pen, ["p"]],
    ["laser", COPY.TOOLS.laser, ["k"]],
    ["comment", COPY.TOOLS.comment, ["c"]],
    ["table", COPY.TOOLS.table, []],
  ];
  const actions = tools.map(([tool, label, keys]) => ({
    id: `tool.${tool}`,
    label,
    group: "Tools",
    keys,
    shortcut: keys[0] ? [keys[0].toUpperCase()] : undefined,
    run: () => (tool === "image" ? ui.pickImage() : editor.setTool(tool)),
    checked: (s) => s.tool === tool,
  }));

  const a = (def) => actions.push(def);
  a({ id: "tool.lock", label: COPY.ACTIONS.TOOL_LOCK, group: "Tools", keys: ["q"], run: () => editor.set({ toolLocked: !editor.state.toolLocked }), checked: (s) => s.toolLocked });

  a({ id: "file.new", label: COPY.ACTIONS.NEW_BOARD, group: "File", run: ui.newBoard });
  a({ id: "file.home", label: COPY.ACTIONS.ALL_BOARDS, group: "File", run: ui.goHome });
  a({ id: "file.open", label: COPY.ACTIONS.OPEN_FILE, group: "File", keys: ["mod+o"], run: ui.openFile });
  a({ id: "file.save", label: COPY.ACTIONS.SAVE_FILE, group: "File", keys: ["mod+s"], run: ui.saveFile });
  a({ id: "file.import", label: COPY.ACTIONS.IMPORT_FILE, group: "File", keys: ["mod+shift+o"], run: ui.importFile });
  a({ id: "file.exportExcalidraw", label: COPY.ACTIONS.EXPORT_WHITEBOARD_FILE, group: "File", sub: COPY.MENUS.EXPORT_AS, run: () => ui.exportAs("excalidraw") });
  a({ id: "file.exportDrawio", label: COPY.ACTIONS.EXPORT_DIAGRAM_FILE, group: "File", sub: COPY.MENUS.EXPORT_AS, run: () => ui.exportAs("drawio") });
  a({ id: "file.export", label: COPY.ACTIONS.EXPORT_IMAGE, group: "File", keys: ["mod+shift+e"], run: ui.openExport });
  a({ id: "file.versions", label: COPY.ACTIONS.VERSIONS, group: "File", keys: ["mod+alt+h"], run: ui.openVersions });
  a({ id: "file.print", label: COPY.ACTIONS.PRINT, group: "File", keys: ["mod+p"], run: ui.print });
  a({ id: "file.copyPng", label: COPY.ACTIONS.COPY_PNG, group: "File", keys: ["mod+shift+c"], run: ui.copyPng });
  a({ id: "file.duplicateBoard", label: COPY.ACTIONS.DUPLICATE_BOARD, group: "File", run: ui.duplicateBoard });
  a({ id: "file.rename", label: COPY.ACTIONS.RENAME_BOARD, group: "File", run: ui.renameBoard });

  a({ id: "edit.undo", label: COPY.ACTIONS.UNDO, group: "Edit", keys: ["mod+z"], run: () => editor.undo(), enabled: () => editor.history.canUndo });
  a({ id: "edit.redo", label: COPY.ACTIONS.REDO, group: "Edit", keys: ["mod+shift+z", "mod+y"], run: () => editor.redo(), enabled: () => editor.history.canRedo });
  a({ id: "edit.cut", label: COPY.ACTIONS.CUT, group: "Edit", shortcut: [MOD, "X"], run: ui.cut, enabled: hasSel });
  a({ id: "edit.copy", label: COPY.ACTIONS.COPY, group: "Edit", shortcut: [MOD, "C"], run: ui.copy, enabled: hasSel });
  a({ id: "edit.paste", label: COPY.ACTIONS.PASTE, group: "Edit", shortcut: [MOD, "V"], run: ui.paste });
  a({ id: "edit.duplicate", label: COPY.ACTIONS.DUPLICATE, group: "Edit", keys: ["mod+d"], enabled: hasSel, run: () => {
    const { elements, newIds } = duplicateElements(editor.elements, expandSelection(editor.elements, sel(editor), { withFrameChildren: true }), { dx: 20, dy: 20 });
    editor.setElements(elements);
    editor.select(newIds);
  } });
  a({ id: "edit.delete", label: COPY.ACTIONS.DELETE, group: "Edit", keys: ["delete", "backspace"], enabled: hasSel, run: () => {
    set((els) => deleteElements(els, sel(editor).filter((id) => !els.find((e) => e.id === id)?.locked)));
    editor.set({ selectedIds: [] });
  } });
  a({ id: "edit.selectAll", label: COPY.ACTIONS.SELECT_ALL, group: "Edit", keys: ["mod+a"], run: () => editor.set({ selectedIds: editor.elements.filter((e) => !e.locked).map((e) => e.id) }) });
  a({ id: "edit.find", label: COPY.ACTIONS.FIND, group: "Edit", keys: ["mod+f"], run: ui.openFind });
  a({ id: "edit.replace", label: COPY.REPLACE.TITLE, group: "Edit", keys: ["mod+shift+f"], run: ui.openReplace });
  a({ id: "edit.copySvg", label: COPY.ACTIONS.COPY_SVG, group: "Edit", enabled: hasSel, run: ui.copySvg });
  a({ id: "edit.copyCss", label: COPY.ACTIONS.COPY_CSS, group: "Edit", enabled: (s) => s.selectedIds.length === 1, run: ui.copyCss });
  a({ id: "edit.copyStyle", label: COPY.ACTIONS.COPY_STYLE, group: "Edit", keys: ["mod+alt+c"], enabled: hasSel, run: () => {
    const el = selEls(editor)[0];
    styleClipboard = Object.fromEntries(STYLE_KEYS.filter((k) => k in el).map((k) => [k, el[k]]));
    ui.notify(COPY.NOTES.STYLE_COPIED);
  } });
  a({ id: "edit.pasteStyle", label: COPY.ACTIONS.PASTE_STYLE, group: "Edit", keys: ["mod+alt+v"], enabled: (s) => hasSel(s) && !!styleClipboard, run: () => set((els) => updateElements(els, sel(editor), (el) => Object.fromEntries(Object.entries(styleClipboard).filter(([k]) => k in el)))) });
  a({ id: "edit.lock", label: COPY.ACTIONS.LOCK, group: "Edit", keys: ["mod+shift+l"], enabled: hasSel, run: () => {
    const lock = !selEls(editor).every((e) => e.locked);
    set((els) => updateElements(els, sel(editor), () => ({ locked: lock })));
    if (lock) editor.set({ selectedIds: [] });
  } });
  a({ id: "edit.unlockAll", label: COPY.ACTIONS.UNLOCK_ALL, group: "Edit", run: () => set((els) => updateElements(els, els.filter((e) => e.locked).map((e) => e.id), () => ({ locked: false }))) });

  a({ id: "view.zoomIn", label: COPY.ACTIONS.ZOOM_IN, group: "View", keys: ["mod+=", "="], run: () => zoomBy(editor, rect(), 1.25) });
  a({ id: "view.zoomOut", label: COPY.ACTIONS.ZOOM_OUT, group: "View", keys: ["mod+-", "-"], run: () => zoomBy(editor, rect(), 0.8) });
  a({ id: "view.zoomReset", label: COPY.ACTIONS.ZOOM_100, group: "View", keys: ["mod+0", "shift+0"], run: () => zoomBy(editor, rect(), 1 / editor.viewport.zoom) });
  a({ id: "view.zoomFit", label: COPY.ACTIONS.ZOOM_FIT, group: "View", keys: ["shift+1"], run: () => zoomToFit(editor, rect()) });
  a({ id: "view.zoomSel", label: COPY.ACTIONS.ZOOM_SELECTION, group: "View", keys: ["shift+2"], enabled: hasSel, run: () => zoomToFit(editor, rect(), sel(editor)) });
  a({ id: "view.grid", label: COPY.ACTIONS.GRID, group: "View", keys: ["mod+'"], checked: () => editor.page.grid !== "none", run: () => editor.updatePage({ grid: editor.page.grid === "none" ? "dots" : "none" }, { record: false }) });
  a({ id: "view.snapGrid", label: COPY.ACTIONS.SNAP_GRID, group: "View", checked: (s) => s.prefs.snapToGrid, run: () => editor.setPrefs({ snapToGrid: !editor.state.prefs.snapToGrid }) });
  a({ id: "view.snapObjects", label: COPY.ACTIONS.SNAP_OBJECTS, group: "View", checked: (s) => s.prefs.snapToObjects, run: () => editor.setPrefs({ snapToObjects: !editor.state.prefs.snapToObjects }) });
  a({ id: "view.rulers", label: COPY.ACTIONS.RULERS, group: "View", keys: ["shift+r"], checked: (s) => s.prefs.showRulers, run: () => editor.setPrefs({ showRulers: !editor.state.prefs.showRulers }) });
  a({ id: "view.minimap", label: COPY.ACTIONS.MINIMAP, group: "View", keys: ["shift+m"], checked: (s) => s.prefs.showMinimap, run: () => editor.setPrefs({ showMinimap: !editor.state.prefs.showMinimap }) });
  a({ id: "view.format", label: COPY.ACTIONS.FORMAT_PANEL, group: "View", keys: ["mod+shift+p"], checked: (s) => s.prefs.showFormat, run: () => editor.setPrefs({ showFormat: !editor.state.prefs.showFormat }) });
  a({ id: "view.library", label: COPY.ACTIONS.SHAPES_PANEL, group: "View", checked: (s) => s.prefs.leftPanel === "shapes", run: () => editor.setPrefs({ leftPanel: editor.state.prefs.leftPanel === "shapes" ? null : "shapes" }) });
  a({ id: "view.layers", label: COPY.ACTIONS.LAYERS_PANEL, group: "View", keys: ["alt+1"], checked: (s) => s.prefs.leftPanel === "layers", run: () => editor.setPrefs({ leftPanel: editor.state.prefs.leftPanel === "layers" ? null : "layers" }) });
  a({ id: "view.present", label: COPY.ACTIONS.PRESENT, group: "View", keys: ["mod+alt+enter"], run: ui.present });
  a({ id: "view.viewMode", label: COPY.ACTIONS.VIEW_MODE, group: "View", keys: ["alt+r"], checked: (s) => !!s.viewMode, run: () => editor.set({ viewMode: !editor.state.viewMode, tool: "hand", selectedIds: [] }) });
  a({ id: "view.zen", label: COPY.ACTIONS.ZEN, group: "View", keys: ["alt+z"], checked: (s) => s.prefs.zen, run: () => editor.setPrefs({ zen: !editor.state.prefs.zen }) });
  a({ id: "view.theme", label: COPY.ACTIONS.DARK_MODE, group: "View", keys: ["alt+shift+d"], checked: () => ui.isDark(), run: ui.toggleTheme });

  a({ id: "insert.table", label: COPY.ACTIONS.INSERT_TABLE, group: "Insert", run: () => editor.setTool("table") });
  a({ id: "insert.image", label: COPY.ACTIONS.INSERT_IMAGE, group: "Insert", run: ui.pickImage });
  a({ id: "insert.mermaid", label: COPY.ACTIONS.INSERT_MERMAID, group: "Insert", run: ui.openMermaid });
  a({ id: "insert.plugins", label: COPY.ACTIONS.PLUGINS, group: "Insert", keys: ["mod+alt+p"], run: ui.openPlugins });
  a({ id: "insert.page", label: COPY.ACTIONS.NEW_PAGE, group: "Insert", run: () => editor.addPage() });
  a({ id: "insert.instance", label: COPY.ACTIONS.INSERT_INSTANCE, group: "Insert", enabled: () => selEls(editor).length === 1 && selEls(editor)[0].isComponent, run: () => {
    const m = selEls(editor)[0];
    const inst = createInstance(editor.elements, m.id, { x: m.x + m.w + 40, y: m.y });
    editor.setElements([...editor.elements, inst]);
    editor.select([inst.id], { expand: false });
  } });

  a({ id: "arrange.front", label: COPY.ACTIONS.TO_FRONT, group: "Arrange", keys: ["mod+shift+]"], enabled: hasSel, run: () => set((els) => reorder(els, sel(editor), "front")) });
  a({ id: "arrange.forward", label: COPY.ACTIONS.FORWARD, group: "Arrange", keys: ["mod+]"], enabled: hasSel, run: () => set((els) => reorder(els, sel(editor), "forward")) });
  a({ id: "arrange.backward", label: COPY.ACTIONS.BACKWARD, group: "Arrange", keys: ["mod+["], enabled: hasSel, run: () => set((els) => reorder(els, sel(editor), "backward")) });
  a({ id: "arrange.back", label: COPY.ACTIONS.TO_BACK, group: "Arrange", keys: ["mod+shift+["], enabled: hasSel, run: () => set((els) => reorder(els, sel(editor), "back")) });
  for (const [axis, key, label] of [["x", "shift+h", COPY.ACTIONS.FLIP_H], ["y", "shift+v", COPY.ACTIONS.FLIP_V]]) {
    a({ id: `arrange.flip${axis}`, label, group: "Arrange", keys: [key], enabled: hasSel, run: () => {
      const flipped = new Map(flipElements(editor.selected.filter((e) => !e.locked), axis).map((e) => [e.id, e]));
      editor.setElements(editor.elements.map((e) => (flipped.has(e.id) ? { ...flipped.get(e.id), version: e.version + 1 } : e)));
    } });
  }
  a({ id: "arrange.group", label: COPY.ACTIONS.GROUP, group: "Arrange", keys: ["mod+g"], enabled: (s) => s.selectedIds.length > 1, run: () => set((els) => groupElements(els, sel(editor)).elements) });
  a({ id: "arrange.ungroup", label: COPY.ACTIONS.UNGROUP, group: "Arrange", keys: ["mod+shift+g"], enabled: () => selEls(editor).some((e) => e.groupIds.length), run: () => set((els) => ungroupElements(els, sel(editor))) });
  for (const [mode, key] of [["left", "alt+a"], ["center", "alt+h"], ["right", "alt+d"], ["top", "alt+w"], ["middle", "alt+v"], ["bottom", "alt+s"]]) {
    a({ id: `arrange.align.${mode}`, label: COPY.ALIGN[mode], group: "Arrange", sub: COPY.MENUS.ALIGN, keys: [key], enabled: (s) => s.selectedIds.length > 1, run: () => set((els) => alignElements(els, sel(editor), mode)) });
  }
  a({ id: "arrange.distributeX", label: COPY.ACTIONS.DISTRIBUTE_X, group: "Arrange", sub: COPY.MENUS.ALIGN, keys: ["alt+shift+h"], enabled: (s) => s.selectedIds.length > 2, run: () => set((els) => distributeElements(els, sel(editor), "x")) });
  a({ id: "arrange.distributeY", label: COPY.ACTIONS.DISTRIBUTE_Y, group: "Arrange", sub: COPY.MENUS.ALIGN, keys: ["alt+shift+v"], enabled: (s) => s.selectedIds.length > 2, run: () => set((els) => distributeElements(els, sel(editor), "y")) });
  for (const op of ["union", "subtract", "intersect", "exclude"]) {
    a({ id: `arrange.bool.${op}`, label: COPY.BOOLEAN[op], group: "Arrange", sub: COPY.MENUS.BOOLEAN, enabled: () => selEls(editor).filter((e) => !isConnector(e) && e.type !== "freedraw" && e.type !== "text").length > 1, run: () => {
      const order = new Map(editor.elements.map((e, i) => [e.id, i]));
      const shapes = selEls(editor).filter((e) => !isConnector(e) && e.type !== "freedraw" && e.type !== "text").sort((x, y) => order.get(x.id) - order.get(y.id));
      const result = booleanOp(op, shapes);
      const ids = new Set(shapes.map((e) => e.id));
      const rest = deleteElements(editor.elements, [...ids]);
      editor.setElements(result ? [...rest, result] : rest);
      editor.set({ selectedIds: result ? [result.id] : [] });
    } });
  }
  a({ id: "arrange.treeDown", label: COPY.ACTIONS.TREE_DOWN, group: "Arrange", sub: COPY.MENUS.LAYOUT, enabled: (s) => s.selectedIds.length > 1, run: () => set((els) => treeLayout(els, sel(editor), { direction: "down" })) });
  a({ id: "arrange.treeRight", label: COPY.ACTIONS.TREE_RIGHT, group: "Arrange", sub: COPY.MENUS.LAYOUT, enabled: (s) => s.selectedIds.length > 1, run: () => set((els) => treeLayout(els, sel(editor), { direction: "right" })) });
  a({ id: "arrange.grid", label: COPY.ACTIONS.GRID_LAYOUT, group: "Arrange", sub: COPY.MENUS.LAYOUT, enabled: (s) => s.selectedIds.length > 1, run: () => set((els) => gridLayout(els, editor.state.selectedIds)) });
  a({ id: "arrange.circle", label: COPY.ACTIONS.CIRCLE_LAYOUT, group: "Arrange", sub: COPY.MENUS.LAYOUT, enabled: (s) => s.selectedIds.length > 2, run: () => set((els) => circleLayout(els, editor.state.selectedIds)) });
  a({ id: "arrange.autoLayout", label: COPY.ACTIONS.AUTO_LAYOUT, group: "Arrange", sub: COPY.MENUS.LAYOUT, keys: ["shift+a"], enabled: hasSel, run: () => {
    const picked = selEls(editor);
    if (picked.length === 1 && picked[0].type === "frame") {
      const f = picked[0];
      const layout = f.layout ? null : { direction: "row", gap: 16, padding: 24, align: "start", hug: true };
      editor.setElements(applyAutoLayout(updateElements(editor.elements, [f.id], () => ({ layout })), f.id));
      return;
    }
    const b = unionBounds(picked.map(elementBounds));
    const frame = createElement("frame", { x: b.x - 24, y: b.y - 24, w: b.w + 48, h: b.h + 48, name: COPY.LABELS.AUTO_LAYOUT_FRAME, layout: { direction: b.w >= b.h ? "row" : "column", gap: 16, padding: 24, align: "start", hug: true } });
    const ids = new Set(picked.map((e) => e.id));
    const els = editor.elements.map((e) => (ids.has(e.id) ? touch(e, { frameId: frame.id }) : e));
    const firstIdx = els.findIndex((e) => ids.has(e.id));
    els.splice(firstIdx, 0, frame);
    editor.setElements(applyAutoLayout(els, frame.id));
    editor.select([frame.id], { expand: false });
  } });
  a({ id: "arrange.frameSelection", label: COPY.ACTIONS.FRAME_SELECTION, group: "Arrange", keys: ["mod+alt+g"], enabled: hasSel, run: () => {
    const picked = selEls(editor);
    const b = unionBounds(picked.map(elementBounds));
    const frame = createElement("frame", { x: b.x - 24, y: b.y - 24, w: b.w + 48, h: b.h + 48, name: nextFrameName(editor.elements) });
    const ids = new Set(picked.map((e) => e.id));
    const els = editor.elements.map((e) => (ids.has(e.id) && e.type !== "frame" ? touch(e, { frameId: frame.id }) : e));
    els.splice(els.findIndex((e) => ids.has(e.id)), 0, frame);
    editor.setElements(els);
    editor.select([frame.id], { expand: false });
  } });
  a({ id: "arrange.component", label: COPY.ACTIONS.MAKE_COMPONENT, group: "Arrange", sub: COPY.MENUS.COMPONENTS, keys: ["mod+alt+k"], enabled: () => selEls(editor).length === 1 && selEls(editor)[0].type === "frame", run: () => set((els) => makeComponent(els, sel(editor)[0])) });
  a({ id: "arrange.detach", label: COPY.ACTIONS.DETACH, group: "Arrange", sub: COPY.MENUS.COMPONENTS, keys: ["mod+alt+b"], enabled: () => selEls(editor).length === 1 && selEls(editor)[0].type === "instance", run: () => {
    editor.setElements(detachInstance(editor.elements, sel(editor)[0]));
    editor.set({ selectedIds: [] });
  } });

  a({ id: "help.shortcuts", label: COPY.ACTIONS.SHORTCUTS, group: "Help", keys: ["shift+/", "?"], run: ui.openHelp });
  a({ id: "help.palette", label: COPY.ACTIONS.COMMANDS, group: "Help", keys: ["mod+k", "mod+/"], run: ui.openPalette });
  a({ id: "help.share", label: COPY.ACTIONS.LIVE, group: "Help", run: ui.openShare });

  for (const act of actions) {
    if (!act.shortcut && act.keys?.length) act.shortcut = keyLabel(act.keys[0]);
  }
  return actions;
}

export function nudge(editor, dx, dy) {
  const ids = expandSelection(editor.elements, editor.state.selectedIds, { withFrameChildren: true });
  if (!ids.length) return;
  editor.setElements(updateElements(editor.elements, ids.filter((id) => !editor.elements.find((e) => e.id === id)?.locked), (el) => ({ x: el.x + dx, y: el.y + dy })), { key: "nudge" });
}
