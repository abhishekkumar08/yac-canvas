import { useMemo, useRef, useState } from "react";
import {
  Square, Circle, Diamond, Shapes, Type, StickyNote, Frame, Image, Pencil, Minus, MoveRight, PenTool, Table, Component,
  Eye, EyeOff, Lock, Unlock, Plus, Trash2, Search, Layers, Group,
} from "lucide-react";
import { Button, Disclosure, EmptyState, IconButton, Input, Tabs, Tooltip } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { ElementView } from "@/render/ElementView.jsx";
import { elementBounds, unionBounds } from "@/engine/geometry.js";
import { newId } from "@/engine/elements.js";
import { SHAPES } from "@/engine/shapes.js";
import { touch, updateElements } from "@/engine/scene.js";
import { clipboardPayload } from "@/ui/actions.js";
import { LIBRARY, LIBRARY_GROUPS, templateElement } from "@/ui/library.js";
import { COPY } from "@/ui/copy.js";
import { LEFT_COPY } from "@/ui/copy-left.js";
import { LibrariesSection } from "@/plugins/LibrariesSection.jsx";

const DRAG_TYPE = "application/x-yac-canvas";
const LAYER_DRAG_TYPE = "application/x-yac-layer";
const PREVIEW_SIZE = 36;
const PREVIEW_STROKE = 1.5;
const EMPTY = [];

const TILE_GRID = [
  "grid grid-cols-4 gap-1",
  "[&_[role=tooltip]]:hidden [&_span:hover>[role=tooltip]]:block [&_span:focus-within>[role=tooltip]]:block",
  "[&>:nth-child(4n+1)_[role=tooltip]]:left-0 [&>:nth-child(4n+1)_[role=tooltip]]:translate-x-0",
  "[&>:nth-child(4n)_[role=tooltip]]:left-auto [&>:nth-child(4n)_[role=tooltip]]:right-0 [&>:nth-child(4n)_[role=tooltip]]:translate-x-0",
].join(" ");

const TYPE_ICONS = {
  rect: Square, ellipse: Circle, diamond: Diamond, shape: Shapes, text: Type, sticky: StickyNote, frame: Frame, image: Image,
  freedraw: Pencil, line: Minus, arrow: MoveRight, path: PenTool, table: Table, instance: Component,
};

function buildPreview(els) {
  const b = unionBounds(els.map(elementBounds));
  const size = Math.max(b.w, b.h, 1);
  const sw = (PREVIEW_STROKE * size) / PREVIEW_SIZE;
  const pad = Math.max(sw * 3, size * 0.06);
  return {
    els: els.map((e) => ({ ...e, shadow: false, strokeWidth: e.strokeWidth ? sw : e.strokeWidth })),
    viewBox: `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`,
  };
}

const previews = new WeakMap();
function templatePreview(entry) {
  const el = templateElement(entry);
  if (!previews.has(el)) previews.set(el, buildPreview([el]));
  return previews.get(el);
}

function Preview({ preview, files }) {
  return (
    <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} viewBox={preview.viewBox} aria-hidden="true" className="pointer-events-none overflow-visible">
      {preview.els.map((el) => (
        <ElementView key={el.id} el={el} files={files} elements={preview.els} zoom={1} />
      ))}
    </svg>
  );
}

function Tile({ label, dragData, onInsert, children }) {
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon"
        className="h-12 w-full p-1"
        aria-label={label}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragData));
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={onInsert}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function ScratchItem({ entry }) {
  const ui = useUi();
  const parsed = useMemo(() => {
    const data = JSON.parse(entry.payload);
    return { preview: buildPreview(data.elements), files: data.files };
  }, [entry.payload]);
  return (
    <Tile label={entry.label} dragData={{ scratchpadId: entry.id }} onInsert={() => ui.insertLibraryItem({ scratchpadId: entry.id })}>
      <Preview preview={parsed.preview} files={parsed.files} />
    </Tile>
  );
}

function Scratchpad() {
  const editor = useEditor();
  const items = useEditorState((s) => s.prefs.scratchpad) ?? EMPTY;
  const hasSelection = useEditorState((s) => s.selectedIds.length > 0);
  const add = () => {
    const payload = clipboardPayload(editor);
    if (!payload) return;
    const { elements } = JSON.parse(payload);
    const label = elements.length === 1 ? layerName(elements[0]) : LEFT_COPY.SCRATCH_COUNT(elements.length);
    editor.setPrefs({ scratchpad: [{ id: newId(), label, payload }, ...items] });
  };
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-label text-fg">{COPY.LABELS.SCRATCHPAD}</h3>
        <div className="flex items-center gap-1">
          <IconButton icon={Plus} label={COPY.LABELS.SCRATCHPAD_ADD} variant="ghost" size="xs" disabled={!hasSelection} onClick={add} />
          <IconButton icon={Trash2} label={COPY.LABELS.SCRATCHPAD_CLEAR} variant="ghost" size="xs" disabled={!items.length} onClick={() => editor.setPrefs({ scratchpad: [] })} />
        </div>
      </div>
      {items.length ? (
        <div className={TILE_GRID}>
          {items.map((entry) => (
            <ScratchItem key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="text-caption text-fg-muted">{COPY.LABELS.SCRATCHPAD_HINT}</p>
      )}
    </section>
  );
}

const matches = (entry, q) =>
  !q || [entry.label, entry.group, LEFT_COPY.GROUPS[entry.group], ...(entry.keywords ?? [])].some((s) => s?.toLowerCase().includes(q));

function ShapesTab() {
  const ui = useUi();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () => LIBRARY_GROUPS.map((g) => [g, LIBRARY.filter((entry) => entry.group === g && matches(entry, q))]).filter(([, list]) => list.length),
    [q],
  );
  return (
    <div className="flex flex-col gap-3 pb-3">
      <Input
        type="search"
        aria-label={COPY.LABELS.SEARCH_SHAPES}
        placeholder={COPY.LABELS.SEARCH_SHAPES}
        fieldSize="sm"
        leading={<Search />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Scratchpad />
      <LibrariesSection />
      {groups.length ? (
        <div>
          {groups.map(([g, list]) => (
            <Disclosure key={q ? `q:${g}` : g} variant="plain" title={LEFT_COPY.GROUPS[g]} defaultOpen={Boolean(q) || g === "General"}>
              <div className={TILE_GRID}>
                {list.map((entry) => (
                  <Tile key={entry.id} label={entry.label} dragData={{ libraryId: entry.id }} onInsert={() => ui.insertLibraryItem(entry)}>
                    <Preview preview={templatePreview(entry)} />
                  </Tile>
                ))}
              </div>
            </Disclosure>
          ))}
        </div>
      ) : (
        <p className="text-caption text-fg-muted">{COPY.LABELS.NO_SHAPES}</p>
      )}
    </div>
  );
}

function layerName(el) {
  const firstLine = el.text?.split("\n").find((l) => l.trim());
  return el.name || firstLine || (el.type === "shape" && SHAPES[el.kind]?.label) || LEFT_COPY.TYPES[el.type] || COPY.TOOLS[el.type] || el.type;
}

function layerRows(elements) {
  const frames = new Set(elements.filter((e) => e.type === "frame").map((e) => e.id));
  const kids = new Map();
  for (const el of elements) {
    if (!el.frameId || !frames.has(el.frameId)) continue;
    if (!kids.has(el.frameId)) kids.set(el.frameId, []);
    kids.get(el.frameId).push(el);
  }
  const rows = [];
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.frameId && frames.has(el.frameId)) continue;
    rows.push({ el, depth: 0 });
    for (const k of [...(kids.get(el.id) ?? [])].reverse()) rows.push({ el: k, depth: 1 });
  }
  return rows;
}

function moveLayer(elements, dragId, targetId) {
  if (dragId === targetId) return null;
  const dragged = elements.find((e) => e.id === dragId);
  const target = elements.find((e) => e.id === targetId);
  if (!dragged || !target) return null;
  const frameId = dragged.type === "frame" ? dragged.frameId : target.type === "frame" ? target.id : target.frameId ?? null;
  const moved = touch(dragged, frameId === (dragged.frameId ?? null) ? {} : { frameId });
  const rest = elements.filter((e) => e.id !== dragId);
  const at = rest.findIndex((e) => e.id === targetId) + 1;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

function RenameField({ initial, onDone }) {
  const done = useRef(false);
  const finish = (value) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <Input
      autoFocus
      fieldSize="sm"
      aria-label={LEFT_COPY.RENAME}
      defaultValue={initial}
      containerClassName="min-w-0 flex-1"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
    />
  );
}

function LayerRow({ el, depth, selected, editing, dropTarget, onSelect, onRename, onToggle, drag }) {
  const Icon = TYPE_ICONS[el.type] ?? Shapes;
  const name = layerName(el);
  const pinned = selected || el.hidden || el.locked;
  return (
    <div
      className={`group/row flex items-center gap-1 rounded-control pr-1 ${dropTarget ? "shadow-[inset_0_2px_0_rgb(var(--mw-accent))]" : ""} ${selected ? "bg-accent-subtle" : "hover:bg-surface-muted"}`}
      style={{ paddingLeft: depth * 16 }}
      draggable={!editing}
      onDragStart={(e) => drag.start(e, el.id)}
      onDragOver={(e) => drag.over(e, el.id)}
      onDrop={(e) => drag.drop(e, el.id)}
      onDragEnd={drag.end}
    >
      {editing ? (
        <RenameField initial={el.name || name} onDone={(v) => onRename(el.id, v)} />
      ) : (
        <Button
          variant="ghost"
          size="xs"
          className={`min-w-0 flex-1 justify-start gap-2 px-2 font-normal hover:bg-transparent ${el.hidden ? "opacity-50" : ""}`}
          onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
          onDoubleClick={() => onRename(el.id)}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-fg">{name}</span>
          {el.groupIds.length > 0 && <Group className="h-3 w-3 shrink-0 text-fg-subtle" aria-label={LEFT_COPY.GROUPED} />}
        </Button>
      )}
      {!editing && (
        <div className={`flex shrink-0 items-center ${pinned ? "" : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"}`}>
          <IconButton icon={el.hidden ? EyeOff : Eye} label={el.hidden ? COPY.LABELS.SHOW : COPY.LABELS.HIDE} variant="ghost" size="xs" onClick={() => onToggle(el.id, "hidden")} />
          <IconButton icon={el.locked ? Lock : Unlock} label={el.locked ? COPY.LABELS.UNLOCK : COPY.LABELS.LOCK} variant="ghost" size="xs" onClick={() => onToggle(el.id, "locked")} />
        </div>
      )}
    </div>
  );
}

function LayersTab() {
  const editor = useEditor();
  const board = useEditorState((s) => s.board);
  const pageId = useEditorState((s) => s.pageId);
  const selectedIds = useEditorState((s) => s.selectedIds);
  const elements = useMemo(() => (board.pages.find((p) => p.id === pageId) ?? board.pages[0]).elements, [board, pageId]);
  const rows = useMemo(() => layerRows(elements), [elements]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [editingId, setEditingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const dragId = useRef(null);

  if (!rows.length) return <EmptyState size="sm" icon={Layers} title={COPY.LABELS.NO_LAYERS} />;

  const onSelect = (id, toggle) => {
    if (!toggle) return editor.select([id], { expand: false });
    const next = new Set(editor.state.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return editor.select([...next], { expand: false });
  };

  const onRename = (id, value) => {
    if (value === undefined) return setEditingId(id);
    setEditingId(null);
    if (value === null) return undefined;
    const name = value.trim() || null;
    const el = editor.elements.find((e) => e.id === id);
    if (el && (el.name ?? null) !== name) editor.setElements(updateElements(editor.elements, [id], () => ({ name })));
    return undefined;
  };

  const onToggle = (id, key) => editor.setElements(updateElements(editor.elements, [id], (el) => ({ [key]: !el[key] })));

  const drag = {
    start(e, id) {
      dragId.current = id;
      e.dataTransfer.setData(LAYER_DRAG_TYPE, id);
      e.dataTransfer.effectAllowed = "move";
    },
    over(e, id) {
      if (!dragId.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overId !== id) setOverId(id);
    },
    drop(e, id) {
      if (!dragId.current) return;
      e.preventDefault();
      const next = moveLayer(editor.elements, dragId.current, id);
      if (next) editor.setElements(next);
      drag.end();
    },
    end() {
      dragId.current = null;
      setOverId(null);
    },
  };

  return (
    <div className="flex flex-col gap-px pb-3">
      {rows.map(({ el, depth }) => (
        <LayerRow
          key={el.id}
          el={el}
          depth={depth}
          selected={selected.has(el.id)}
          editing={editingId === el.id}
          dropTarget={overId === el.id && dragId.current !== el.id}
          onSelect={onSelect}
          onRename={onRename}
          onToggle={onToggle}
          drag={drag}
        />
      ))}
    </div>
  );
}

const TABS_CLASS = [
  "flex min-h-0 flex-1 flex-col",
  "[&>[role=tabpanel]]:min-h-0 [&>[role=tabpanel]]:flex-1 [&>[role=tabpanel]]:overflow-y-auto [&>[role=tabpanel]]:overflow-x-hidden",
].join(" ");

export function LeftPanel() {
  const editor = useEditor();
  const leftPanel = useEditorState((s) => s.prefs.leftPanel);
  return (
    <div className="flex h-full flex-col px-3 pt-2">
      <Tabs
        variant="underline"
        className={TABS_CLASS}
        value={leftPanel === "layers" ? "layers" : "shapes"}
        onChange={(id) => editor.setPrefs({ leftPanel: id })}
        tabs={[
          { id: "shapes", label: COPY.LABELS.SHAPES, content: <ShapesTab /> },
          { id: "layers", label: COPY.LABELS.LAYERS, content: <LayersTab /> },
        ]}
      />
    </div>
  );
}
