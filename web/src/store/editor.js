import { History } from "../engine/history.js";
import { diffBoards, applyDiff, mergeDiffs, isEmptyDiff } from "../engine/boardDiff.js";
import { updateBoundConnectors } from "../engine/connectors.js";
import { applyAutoLayout } from "../engine/layout.js";
import { createPage } from "../engine/serialize.js";
import { DEFAULT_STYLE } from "../engine/elements.js";
import { expandSelection } from "../engine/scene.js";
import { COPY } from "../ui/copy.js";

export const DEFAULT_VIEWPORT = { scrollX: 0, scrollY: 0, zoom: 1 };

export const NEW_ELEMENT_STYLE = {
  stroke: DEFAULT_STYLE.stroke,
  fill: DEFAULT_STYLE.fill,
  fillStyle: DEFAULT_STYLE.fillStyle,
  strokeWidth: DEFAULT_STYLE.strokeWidth,
  strokeStyle: DEFAULT_STYLE.strokeStyle,
  roughness: DEFAULT_STYLE.roughness,
  opacity: DEFAULT_STYLE.opacity,
  radius: 0,
  fontFamily: "hand",
  fontSize: 20,
  textAlign: "center",
  routing: "straight",
  startArrow: null,
  endArrow: "arrow",
};

function changedIds(prev, next) {
  const before = new Map(prev.map((e) => [e.id, e.version]));
  const ids = [];
  for (const e of next) if (before.get(e.id) !== e.version) ids.push(e.id);
  return ids;
}

export function finalizeElements(prev, next) {
  const changed = changedIds(prev, next);
  if (!changed.length) return next;
  let out = updateBoundConnectors(next, changed);
  const changedSet = new Set(changed);
  const frames = out.filter((e) => e.type === "frame" && e.layout && (changedSet.has(e.id) || out.some((c) => c.frameId === e.id && changedSet.has(c.id))));
  for (const f of frames) out = applyAutoLayout(out, f.id);
  return out;
}

export class Editor {
  constructor(board, { prefs, onChange } = {}) {
    this.history = new History();
    this.listeners = new Set();
    this.onChange = onChange;
    this.txn = null;
    this.state = {
      board,
      pageId: board.pages[0].id,
      selectedIds: [],
      editingGroupId: null,
      tool: "select",
      toolLocked: false,
      viewports: {},
      editingTextId: null,
      editingCell: null,
      guides: [],
      marquee: null,
      bindingHint: null,
      erasing: [],
      laser: [],
      penDraft: null,
      editingPathId: null,
      room: null,
      viewMode: false,
      croppingId: null,
      relayStatus: null,
      style: { ...NEW_ELEMENT_STYLE },
      prefs,
      peers: {},
      activeCommentId: null,
      cursorWorld: null,
    };
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  set(patch) {
    this.state = { ...this.state, ...(typeof patch === "function" ? patch(this.state) : patch) };
    for (const fn of this.listeners) fn();
  }

  get page() {
    return this.state.board.pages.find((p) => p.id === this.state.pageId) ?? this.state.board.pages[0];
  }

  get elements() {
    return this.page.elements;
  }

  get viewport() {
    return this.state.viewports[this.state.pageId] ?? DEFAULT_VIEWPORT;
  }

  get selected() {
    const els = this.elements;
    const ids = this.state.selectedIds;
    if (this.selCache?.els !== els || this.selCache.ids !== ids) {
      const set = new Set(ids);
      this.selCache = { els, ids, out: els.filter((e) => set.has(e.id)) };
    }
    return this.selCache.out;
  }

  setViewport(vp) {
    this.set((s) => ({ viewports: { ...s.viewports, [s.pageId]: { ...this.viewport, ...vp } } }));
  }

  withPage(board, pageId, fn) {
    return { ...board, updatedAt: Date.now(), pages: board.pages.map((p) => (p.id === pageId ? fn(p) : p)) };
  }

  snapshot() {
    return { board: this.state.board, selectedIds: this.state.selectedIds, pageId: this.state.pageId };
  }

  recordDiff(prev, next, key = null, selectedIds = this.state.selectedIds, pageId = this.state.pageId) {
    const diff = diffBoards(prev, next);
    if (isEmptyDiff(diff)) return;
    this.history.record({ diff, selectedIds, pageId }, key, (a, b) => ({ ...a, diff: mergeDiffs(a.diff, b.diff) }));
  }

  applyBoard(board, { record = true, key = null, selectedIds, origin = "local" } = {}) {
    if (board === this.state.board) return;
    const prev = this.state.board;
    if (record && !this.txn) this.recordDiff(prev, board, key);
    const patch = { board };
    if (selectedIds) patch.selectedIds = selectedIds;
    if (!board.pages.some((p) => p.id === this.state.pageId)) patch.pageId = board.pages[0].id;
    this.set(patch);
    this.onChange?.(board, prev, origin);
  }

  setElements(next, opts = {}) {
    const prev = this.elements;
    const finalized = opts.raw ? next : finalizeElements(prev, next);
    this.applyBoard(this.withPage(this.state.board, this.state.pageId, (p) => ({ ...p, elements: finalized })), opts);
  }

  updatePage(patch, opts) {
    this.applyBoard(this.withPage(this.state.board, this.state.pageId, (p) => ({ ...p, ...patch })), opts);
  }

  updateBoard(fn, opts) {
    const next = fn(this.state.board);
    this.applyBoard({ ...next, updatedAt: Date.now(), metaVersion: (this.state.board.metaVersion ?? 0) + 1 }, opts);
  }

  begin() {
    if (!this.txn) this.txn = this.snapshot();
  }

  end(key = null) {
    const start = this.txn;
    this.txn = null;
    if (start && start.board !== this.state.board) this.recordDiff(start.board, this.state.board, key, start.selectedIds, start.pageId);
  }

  cancel() {
    if (!this.txn) return;
    const { board } = this.txn;
    this.txn = null;
    this.applyBoard(board, { record: false });
  }

  undo() {
    const entry = this.history.undo();
    if (entry) this.step(entry, "undo");
  }

  redo() {
    const entry = this.history.redo();
    if (entry) this.step(entry, "redo");
  }

  step(entry, dir) {
    const before = this.state.board;
    const board = applyDiff(before, entry.diff, dir);
    const pageId = board.pages.some((p) => p.id === entry.pageId) ? entry.pageId : board.pages.some((p) => p.id === this.state.pageId) ? this.state.pageId : board.pages[0].id;
    const live = new Set(board.pages.find((p) => p.id === pageId).elements.map((e) => e.id));
    const selectedIds = dir === "undo" ? entry.selectedIds.filter((id) => live.has(id)) : this.state.selectedIds.filter((id) => live.has(id));
    const page = board.pages.find((p) => p.id === pageId);
    const prevPage = before.pages.find((p) => p.id === pageId);
    const fixed = prevPage ? { ...board, pages: board.pages.map((p) => (p.id === pageId ? { ...p, elements: finalizeElements(prevPage.elements, page.elements) } : p)) } : board;
    this.set({ board: fixed, selectedIds, pageId, editingTextId: null });
    this.onChange?.(fixed, before, "history");
  }

  select(ids, { expand = true } = {}) {
    const list = expand && !this.state.editingGroupId ? expandSelection(this.elements, ids) : ids;
    this.set({ selectedIds: list });
  }

  setTool(tool) {
    this.set({ tool, selectedIds: tool === "select" || tool === "hand" ? this.state.selectedIds : [], editingTextId: null, penDraft: null, editingPathId: null });
  }

  setStyle(patch) {
    this.set((s) => ({ style: { ...s.style, ...patch } }));
  }

  setPrefs(patch) {
    this.set((s) => ({ prefs: { ...s.prefs, ...patch } }));
  }

  goToPage(pageId) {
    this.set({ pageId, selectedIds: [], editingTextId: null, editingGroupId: null, editingPathId: null });
  }

  addPage(name) {
    const page = createPage(name ?? COPY.LABELS.PAGE_N(this.state.board.pages.length + 1));
    this.updateBoard((b) => ({ ...b, pages: [...b.pages, page] }));
    this.goToPage(page.id);
    return page;
  }
}
