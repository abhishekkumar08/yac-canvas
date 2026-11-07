import {
  Lock, Unlock, Hand, MousePointer2, Square, Diamond, Circle, ArrowRight, Minus, Pencil, Type, Image as ImageIcon, Eraser,
  StickyNote, Frame, PenTool, Pointer, MessageSquare, Table, Shapes, Undo2, Redo2, Trash2, BringToFront, SendToBack, ZoomIn, ZoomOut,
} from "lucide-react";
import { IconButton, Tooltip, Menu, cn } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { COPY } from "@/ui/copy.js";

export const TOOL_ICONS = {
  hand: Hand, select: MousePointer2, rect: Square, diamond: Diamond, ellipse: Circle, arrow: ArrowRight, line: Minus,
  freedraw: Pencil, text: Type, image: ImageIcon, eraser: Eraser, sticky: StickyNote, frame: Frame, pen: PenTool,
  laser: Pointer, comment: MessageSquare, table: Table,
};

const KEYS = { hand: "H", select: "V", rect: "R", diamond: "D", ellipse: "O", arrow: "A", line: "L", freedraw: "X", text: "T", image: "9", eraser: "E", sticky: "S", frame: "F", pen: "P", laser: "K", comment: "C", table: "" };

const SETS = {
  whiteboard: { main: ["hand", "select", "rect", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "image", "eraser"], more: ["frame", "sticky", "laser", "pen", "comment", "table"] },
  diagram: { main: ["select", "hand", "text", "rect", "ellipse", "diamond", "arrow", "line", "freedraw", "table", "sticky", "frame", "image"], more: ["pen", "eraser", "laser", "comment"] },
  design: { main: ["select", "hand", "frame", "rect", "ellipse", "line", "arrow", "pen", "text", "image", "comment"], more: ["diamond", "freedraw", "sticky", "table", "eraser", "laser"] },
};

const QUICK = [
  ["edit.undo", Undo2],
  ["edit.redo", Redo2],
  ["edit.delete", Trash2],
  ["arrange.front", BringToFront],
  ["arrange.back", SendToBack],
  ["view.zoomIn", ZoomIn],
  ["view.zoomOut", ZoomOut],
];

const Divider = () => <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line" />;

export function Toolbar({ mode = "whiteboard" }) {
  const editor = useEditor();
  const ui = useUi();
  const tool = useEditorState((s) => s.tool);
  const locked = useEditorState((s) => s.toolLocked);
  useEditorState((s) => (mode === "diagram" ? s.selectedIds : null));
  useEditorState((s) => (mode === "diagram" ? s.board : null));
  const { main, more } = SETS[mode];
  const side = mode === "design" ? "top" : "bottom";
  const pick = (t) => (t === "image" ? ui.pickImage() : editor.setTool(t));
  const button = (t) => (
    <Tooltip key={t} side={side} content={KEYS[t] ? `${COPY.TOOLS[t]} — ${KEYS[t]}` : COPY.TOOLS[t]}>
      <IconButton icon={TOOL_ICONS[t]} label={COPY.TOOLS[t]} size="sm" variant="ghost" pressed={tool === t} onClick={() => pick(t)} data-tool={t} />
    </Tooltip>
  );
  const lock = (
    <Tooltip side={side} content={`${COPY.ACTIONS.TOOL_LOCK} — Q`}>
      <IconButton icon={locked ? Lock : Unlock} label={COPY.ACTIONS.TOOL_LOCK} size="sm" variant="ghost" pressed={locked} onClick={() => editor.set({ toolLocked: !locked })} />
    </Tooltip>
  );
  const moreMenu = (
    <Menu
      label={COPY.LABELS.MORE_TOOLS}
      align="end"
      side={side === "top" ? "top" : "bottom"}
      trigger={<IconButton icon={Shapes} label={COPY.LABELS.MORE_TOOLS} size="sm" variant="ghost" pressed={more.includes(tool)} />}
      items={more.map((t) => ({ label: COPY.TOOLS[t], icon: TOOL_ICONS[t], shortcut: KEYS[t] ? [KEYS[t]] : undefined, onSelect: () => pick(t) }))}
    />
  );
  const bar = (
    <div role="toolbar" aria-label={COPY.LABELS.TOOLBAR} className={cn("pointer-events-auto flex items-center gap-0.5 p-1", mode !== "diagram" && "material-overlay rounded-card border border-line shadow-overlay")}>
      {mode === "whiteboard" && (
        <>
          {lock}
          <Divider />
        </>
      )}
      {main.map(button)}
      <Divider />
      {moreMenu}
      {mode === "diagram" && (
        <>
          <Divider />
          {QUICK.map(([id, icon]) => {
            const action = ui.actions.find((a) => a.id === id);
            return (
              <Tooltip key={id} side="bottom" content={action.shortcut ? `${action.label} — ${action.shortcut.join("")}` : action.label}>
                <IconButton icon={icon} label={action.label} size="sm" variant="ghost" disabled={action.enabled ? !action.enabled(editor.state) : false} onClick={action.run} />
              </Tooltip>
            );
          })}
          <Divider />
          {lock}
        </>
      )}
    </div>
  );
  if (mode === "diagram") {
    return (
      <div className="material-overlay absolute inset-x-0 top-12 z-20 flex h-11 items-center overflow-x-auto border-b border-line px-2" data-testid="toolbar">
        {bar}
      </div>
    );
  }
  if (mode === "design") {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center" data-testid="toolbar">
        {bar}
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-1" data-testid="toolbar">
      {bar}
      <p className="pointer-events-none text-caption text-fg-muted" data-testid="tool-hint">
        {COPY.TOOL_HINTS[tool]}
      </p>
    </div>
  );
}
