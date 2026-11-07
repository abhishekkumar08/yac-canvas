import { useState } from "react";
import { Minus, Plus, Undo2, Redo2, HelpCircle, Map as MapIcon, MoreHorizontal, FilePlus2 } from "lucide-react";
import { Button, IconButton, Input, Menu, Tooltip, useNotifications } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { DEFAULT_VIEWPORT } from "@/store/editor.js";
import { duplicateElements } from "@/engine/scene.js";
import { createPage } from "@/engine/serialize.js";
import { keyLabel, zoomTo } from "@/ui/actions.js";
import { COPY } from "@/ui/copy.js";

function ZoomControls() {
  const editor = useEditor();
  const ui = useUi();
  const zoom = useEditorState((s) => (s.viewports[s.pageId] ?? DEFAULT_VIEWPORT).zoom);
  const setZoom = (z) => zoomTo(editor, ui.getRect(), z);
  return (
    <div className="material-overlay flex items-center rounded-card border border-line p-0.5 shadow-raised">
      <IconButton icon={Minus} label={COPY.ACTIONS.ZOOM_OUT} size="xs" variant="ghost" onClick={() => setZoom(zoom / 1.25)} />
      <Menu
        label={COPY.LABELS.ZOOM}
        side="top"
        align="start"
        trigger={
          <Button variant="ghost" size="xs" className="w-16 tabular-nums" data-testid="zoom-level">
            {Math.round(zoom * 100)}%
          </Button>
        }
        items={[
          { label: COPY.ACTIONS.ZOOM_FIT, shortcut: keyLabel("shift+1"), onSelect: () => ui.runAction("view.zoomFit") },
          { label: COPY.ACTIONS.ZOOM_SELECTION, shortcut: keyLabel("shift+2"), onSelect: () => ui.runAction("view.zoomSel") },
          ...[0.5, 1, 2].map((z) => ({ label: `${z * 100}%`, onSelect: () => setZoom(z) })),
        ]}
      />
      <IconButton icon={Plus} label={COPY.ACTIONS.ZOOM_IN} size="xs" variant="ghost" onClick={() => setZoom(zoom * 1.25)} />
    </div>
  );
}

function HistoryControls() {
  const editor = useEditor();
  useEditorState((s) => s.board);
  return (
    <div className="material-overlay flex items-center rounded-card border border-line p-0.5 shadow-raised">
      <IconButton icon={Undo2} label={COPY.ACTIONS.UNDO} size="xs" variant="ghost" disabled={!editor.history.canUndo} onClick={() => editor.undo()} />
      <IconButton icon={Redo2} label={COPY.ACTIONS.REDO} size="xs" variant="ghost" disabled={!editor.history.canRedo} onClick={() => editor.redo()} />
    </div>
  );
}

export function Pages({ vertical = false }) {
  const editor = useEditor();
  const { notify, confirmAction } = useNotifications();
  const pages = useEditorState((s) => s.board.pages);
  const pageId = useEditorState((s) => s.pageId);
  const [renaming, setRenaming] = useState(null);
  const rename = (id, name) => {
    editor.updateBoard((b) => ({ ...b, pages: b.pages.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) }));
    setRenaming(null);
  };
  const duplicate = (page) => {
    const copy = createPage(COPY.LABELS.COPY_OF(page.name));
    const { elements } = duplicateElements(page.elements, page.elements.map((e) => e.id), { dx: 0, dy: 0 });
    copy.elements = elements.slice(page.elements.length);
    copy.background = page.background;
    copy.grid = page.grid;
    editor.updateBoard((b) => {
      const i = b.pages.findIndex((p) => p.id === page.id);
      return { ...b, pages: [...b.pages.slice(0, i + 1), copy, ...b.pages.slice(i + 1)] };
    });
    editor.goToPage(copy.id);
  };
  const remove = async (page) => {
    if (pages.length < 2) return;
    if (page.elements.length && !(await confirmAction({ title: `${COPY.LABELS.DELETE_PAGE}?`, description: page.name, confirmText: COPY.LABELS.DELETE_PAGE, variant: "error" }))) return;
    editor.updateBoard((b) => ({ ...b, pages: b.pages.filter((p) => p.id !== page.id) }));
    editor.goToPage(editor.state.board.pages[0].id);
    notify(COPY.NOTES.PAGE_DELETED, "success", { action: { label: COPY.NOTES.UNDO, onClick: () => editor.undo() } });
  };
  return (
    <nav
      aria-label={COPY.LABELS.PAGES}
      className={vertical ? "flex flex-col items-stretch gap-0.5 p-2" : "material-overlay flex max-w-[50vw] items-center gap-0.5 overflow-x-auto rounded-card border border-line p-0.5 shadow-raised"}
    >
      {pages.map((p) =>
        renaming === p.id ? (
          <Input
            key={p.id}
            aria-label={COPY.LABELS.RENAME_PAGE}
            defaultValue={p.name}
            autoFocus
            className="h-8 w-32 py-1"
            onBlur={(e) => rename(p.id, e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") rename(p.id, e.currentTarget.value);
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <Button
            key={p.id}
            size="xs"
            variant={p.id === pageId ? "secondary" : "ghost"}
            className={vertical ? "justify-start" : undefined}
            aria-current={p.id === pageId ? "page" : undefined}
            onClick={() => editor.goToPage(p.id)}
            onDoubleClick={() => setRenaming(p.id)}
          >
            {p.name}
          </Button>
        ),
      )}
      <Tooltip side="top" content={COPY.LABELS.ADD_PAGE}>
        <IconButton icon={FilePlus2} label={COPY.LABELS.ADD_PAGE} size="xs" variant="ghost" onClick={() => editor.addPage()} />
      </Tooltip>
      <Menu
        label={COPY.LABELS.PAGE_MENU}
        side={vertical ? "bottom" : "top"}
        align={vertical ? "start" : "end"}
        trigger={<IconButton icon={MoreHorizontal} label={COPY.LABELS.PAGE_MENU} size="xs" variant="ghost" />}
        items={[
          { label: COPY.LABELS.RENAME_PAGE, onSelect: () => setRenaming(pageId) },
          { label: COPY.LABELS.DUPLICATE_PAGE, onSelect: () => duplicate(pages.find((p) => p.id === pageId)) },
          { label: COPY.LABELS.DELETE_PAGE, tone: "danger", disabled: pages.length < 2, onSelect: () => remove(pages.find((p) => p.id === pageId)) },
        ]}
      />
    </nav>
  );
}

export function BottomBar({ showPages = true, showMinimapToggle = true, className }) {
  const editor = useEditor();
  const ui = useUi();
  const showMinimap = useEditorState((s) => s.prefs.showMinimap);
  return (
    <div className={`pointer-events-none absolute bottom-0 z-10 flex items-end gap-2 p-3 ${className ?? "inset-x-0"}`}>
      <div className="pointer-events-auto flex items-center gap-2">
        <ZoomControls />
        <HistoryControls />
        {showPages && <Pages />}
      </div>
      <div className="pointer-events-auto ml-auto flex items-center gap-1">
        {showMinimapToggle && (
          <Tooltip side="top" content={COPY.ACTIONS.MINIMAP}>
            <IconButton icon={MapIcon} label={COPY.ACTIONS.MINIMAP} size="sm" variant="secondary" pressed={showMinimap} onClick={() => editor.setPrefs({ showMinimap: !showMinimap })} />
          </Tooltip>
        )}
        <Tooltip side="top" content={`${COPY.ACTIONS.SHORTCUTS} — ?`}>
          <IconButton icon={HelpCircle} label={COPY.LABELS.HELP} size="sm" variant="secondary" onClick={ui.openHelp} />
        </Tooltip>
      </div>
    </div>
  );
}
