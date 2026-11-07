import { Download, FileUp, Plus, Trash2 } from "lucide-react";
import { Button, Disclosure, IconButton, Tooltip, useNotifications } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { ElementView } from "@/render/ElementView.jsx";
import { downloadBlob, safeName } from "@/render/exportImage.jsx";
import { elementBounds, unionBounds } from "@/engine/geometry.js";
import { newId } from "@/engine/elements.js";
import { clipboardPayload, insertElements, pickFile, viewportCenter, CLIPBOARD_TYPE } from "@/ui/actions.js";
import { COPY } from "@/ui/copy.js";
import { exportLibrary, parseLibrary } from "@/plugins/libraries.js";
import { PLUGIN_COPY } from "@/plugins/copy.js";

const L = PLUGIN_COPY.LIBRARIES;
const DRAG_TYPE = "application/x-yac-canvas";
const MINE_ID = "mine";
const PREVIEW_SIZE = 36;
const PREVIEW_STROKE = 1.5;
const EMPTY = [];
const TILE_GRID = [
  "grid grid-cols-4 gap-1",
  "[&_[role=tooltip]]:hidden [&_span:hover>[role=tooltip]]:block [&_span:focus-within>[role=tooltip]]:block",
  "[&>:nth-child(4n+1)_[role=tooltip]]:left-0 [&>:nth-child(4n+1)_[role=tooltip]]:translate-x-0",
  "[&>:nth-child(4n)_[role=tooltip]]:left-auto [&>:nth-child(4n)_[role=tooltip]]:right-0 [&>:nth-child(4n)_[role=tooltip]]:translate-x-0",
].join(" ");

export function findLibraryItem(prefs, ref) {
  const lib = (prefs?.libraries ?? EMPTY).find((l) => l.id === ref?.libraryId);
  return lib?.items.find((i) => i.id === ref?.itemId) ?? null;
}

const previews = new WeakMap();
function previewOf(item) {
  if (!previews.has(item)) {
    const b = unionBounds(item.elements.map(elementBounds));
    const size = Math.max(b.w, b.h, 1);
    const sw = (PREVIEW_STROKE * size) / PREVIEW_SIZE;
    const pad = Math.max(sw * 3, size * 0.06);
    previews.set(item, {
      els: item.elements.map((e) => ({ ...e, shadow: false, strokeWidth: e.strokeWidth ? sw : e.strokeWidth })),
      viewBox: `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`,
    });
  }
  return previews.get(item);
}

function ItemTile({ libraryId, item, onInsert }) {
  const preview = previewOf(item);
  const label = item.name || L.UNTITLED_ITEM;
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon"
        className="h-12 w-full p-1"
        aria-label={label}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ libraryItem: { libraryId, itemId: item.id } }));
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onInsert(item)}
      >
        <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} viewBox={preview.viewBox} aria-hidden="true" className="pointer-events-none overflow-visible">
          {preview.els.map((el) => (
            <ElementView key={el.id} el={el} files={item.files} elements={preview.els} zoom={1} />
          ))}
        </svg>
      </Button>
    </Tooltip>
  );
}

const itemName = (elements) => {
  if (elements.length > 1) return L.ITEM_COUNT(elements.length);
  const el = elements[0];
  return el.name || el.text?.split("\n").find((l) => l.trim()) || COPY.TOOLS[el.type] || el.type;
};

export function LibrariesSection() {
  const editor = useEditor();
  const ui = useUi();
  const { notify, confirmAction } = useNotifications();
  const libraries = useEditorState((s) => s.prefs.libraries) ?? EMPTY;
  const hasSelection = useEditorState((s) => s.selectedIds.length > 0);
  const current = () => editor.state.prefs.libraries ?? EMPTY;

  const insert = (item) => insertElements(editor, item.elements, { at: viewportCenter(editor, ui.getRect()), files: item.files });

  const addSelection = () => {
    const payload = clipboardPayload(editor);
    if (!payload) return;
    const data = JSON.parse(payload);
    if (data.type !== CLIPBOARD_TYPE) return;
    const item = { id: newId(), name: itemName(data.elements), elements: data.elements, files: data.files ?? {} };
    const libs = current();
    const mine = libs.find((l) => l.id === MINE_ID);
    editor.setPrefs({
      libraries: mine
        ? libs.map((l) => (l.id === MINE_ID ? { ...l, items: [item, ...l.items] } : l))
        : [{ id: MINE_ID, name: L.MINE, items: [item] }, ...libs],
    });
    notify(L.ADDED(mine?.name ?? L.MINE), "success");
  };

  const importLibrary = async () => {
    const file = await pickFile(".yaclib,.excalidrawlib,.json");
    if (!file) return;
    try {
      const items = parseLibrary(await file.text());
      const name = file.name.replace(/\.[^.]+$/, "") || L.TITLE;
      editor.setPrefs({ libraries: [...current(), { id: newId(), name, items }] });
      notify(L.IMPORTED(name, items.length), "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const exportOne = (lib) => downloadBlob(new Blob([exportLibrary(lib.items)], { type: "application/json" }), `${safeName(lib.name)}.yaclib`);

  const remove = async (lib) => {
    const ok = await confirmAction({ title: L.DELETE_TITLE(lib.name), description: L.DELETE_BODY, confirmText: L.DELETE, variant: "error" });
    if (ok) editor.setPrefs({ libraries: current().filter((l) => l.id !== lib.id) });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-label text-fg">{L.TITLE}</h3>
        <div className="flex items-center gap-1">
          <IconButton icon={Plus} label={L.ADD_SELECTION} variant="ghost" size="xs" disabled={!hasSelection} onClick={addSelection} />
          <IconButton icon={FileUp} label={L.IMPORT} variant="ghost" size="xs" onClick={importLibrary} />
        </div>
      </div>
      {libraries.length ? (
        <div>
          {libraries.map((lib) => (
            <Disclosure key={lib.id} variant="plain" title={lib.name} meta={<span className="text-caption text-fg-muted">{L.COUNT(lib.items.length)}</span>}>
              <div className="flex flex-col gap-2">
                <div className={TILE_GRID}>
                  {lib.items.map((item) => (
                    <ItemTile key={item.id} libraryId={lib.id} item={item} onInsert={insert} />
                  ))}
                </div>
                <div className="flex justify-end gap-1">
                  <IconButton icon={Download} label={L.EXPORT} variant="ghost" size="xs" disabled={!lib.items.length} onClick={() => exportOne(lib)} />
                  <IconButton icon={Trash2} label={L.DELETE} variant="ghost" size="xs" onClick={() => remove(lib)} />
                </div>
              </div>
            </Disclosure>
          ))}
        </div>
      ) : (
        <p className="text-caption text-fg-muted">{L.EMPTY}</p>
      )}
    </section>
  );
}
