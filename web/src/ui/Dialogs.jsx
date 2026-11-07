import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Alert, Badge, Button, CommandPalette, Input, Kbd, Menu, Modal, SegmentedControl, Switch, Textarea, useNotifications } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { exportSvg, svgToPngBlob, downloadBlob, safeName } from "@/render/exportImage.jsx";
import { zoomToFit, insertElements, viewportCenter } from "@/ui/actions.js";
import { mermaidToElements } from "@/engine/interop/mermaid.js";
import { replaceText } from "@/engine/scene.js";
import { COPY } from "@/ui/copy.js";

export function ExportDialog({ open, onClose }) {
  const editor = useEditor();
  const { notify } = useNotifications();
  const board = useEditorState((s) => s.board);
  const pageId = useEditorState((s) => s.pageId);
  const selectedIds = useEditorState((s) => s.selectedIds);
  const [scope, setScope] = useState("all");
  const [background, setBackground] = useState(true);
  const [dark, setDark] = useState(false);
  const [scale, setScale] = useState("2");
  const [preview, setPreview] = useState(null);
  const page = board.pages.find((p) => p.id === pageId) ?? board.pages[0];
  const ids = scope === "selection" ? selectedIds : null;

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    exportSvg(board, page, { ids, background, dark }).then((r) => alive && setPreview(r));
    return () => {
      alive = false;
    };
  }, [open, board, page, ids, background, dark]);

  const name = `${safeName(board.name)}-${safeName(page.name)}`;
  const run = async (kind) => {
    try {
      if (!preview) return;
      if (kind === "svg") downloadBlob(new Blob([preview.svg], { type: "image/svg+xml" }), `${name}.svg`);
      else {
        const blob = await svgToPngBlob(preview, Number(scale));
        if (kind === "png") downloadBlob(blob, `${name}.png`);
        else {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          notify(COPY.NOTES.COPIED_PNG, "success");
        }
      }
      onClose();
    } catch (err) {
      notify(`${COPY.ERRORS.EXPORT}: ${err.message}`, "error");
    }
  };
  useEffect(() => {
    if (open) setScope(editor.state.selectedIds.length ? "selection" : "all");
  }, [open, editor]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={COPY.EXPORT.TITLE}
      description={COPY.EXPORT.DESCRIPTION}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => run("copy")} disabled={!preview}>
            {COPY.EXPORT.COPY}
          </Button>
          <Button variant="secondary" onClick={() => run("svg")} disabled={!preview}>
            {COPY.EXPORT.SVG}
          </Button>
          <Button onClick={() => run("png")} disabled={!preview} data-testid="export-png">
            {COPY.EXPORT.PNG}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <div className="grid min-h-48 place-items-center overflow-hidden rounded-card border border-line bg-surface-muted p-3" style={{ backgroundImage: "repeating-conic-gradient(rgb(0 0 0 / 0.04) 0 25%, transparent 0 50%)", backgroundSize: "16px 16px" }}>
          {preview ? (
            <img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`} className="max-h-72 max-w-full object-contain" data-testid="export-preview" />
          ) : (
            <p className="text-caption text-fg-muted">{COPY.EXPORT.EMPTY}</p>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <SegmentedControl
            label={COPY.EXPORT.SCOPE}
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: COPY.EXPORT.SCOPE_ALL },
              { value: "selection", label: COPY.EXPORT.SCOPE_SELECTION, disabled: !selectedIds.length },
            ]}
          />
          <Switch checked={background} onChange={setBackground} label={COPY.EXPORT.BACKGROUND} />
          <Switch checked={dark} onChange={setDark} label={COPY.EXPORT.DARK} />
          <SegmentedControl label={COPY.EXPORT.SCALE} value={scale} onChange={setScale} options={["1", "2", "3"].map((v) => ({ value: v, label: `${v}×` }))} />
        </div>
      </div>
    </Modal>
  );
}

export function HelpDialog({ open, onClose }) {
  const ui = useUi();
  const groups = useMemo(() => {
    const out = new Map();
    for (const a of ui.actions) {
      if (!a.shortcut) continue;
      if (!out.has(a.group)) out.set(a.group, []);
      out.get(a.group).push(a);
    }
    return [...out.entries()];
  }, [ui.actions]);
  return (
    <Modal open={open} onClose={onClose} title={COPY.HELP.TITLE} description={COPY.HELP.DESCRIPTION} size="xl">
      <div className="columns-1 gap-8 md:columns-2 xl:columns-3">
        {groups.map(([group, list]) => (
          <section key={group} className="mb-5 break-inside-avoid">
            <h3 className="mb-2 text-label font-semibold text-fg">{COPY.MENUS[group.toUpperCase()] ?? group}</h3>
            <dl className="flex flex-col gap-1.5">
              {list.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 text-body">
                  <dt className="text-fg-muted">{a.label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {a.shortcut.map((k, i) => (
                      <Kbd key={i}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section className="mb-5 break-inside-avoid">
          <h3 className="mb-2 text-label font-semibold text-fg">{COPY.HELP.GESTURES}</h3>
          <dl className="flex flex-col gap-1.5">
            {COPY.HELP.GESTURE_LIST.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 text-body">
                <dt className="text-fg-muted">{v}</dt>
                <dd className="text-right text-caption text-fg">{k}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Modal>
  );
}

export function ShareDialog({ open, onClose }) {
  const editor = useEditor();
  const ui = useUi();
  const { notify } = useNotifications();
  const name = useEditorState((s) => s.prefs.name);
  const peers = useEditorState((s) => s.peers);
  const room = useEditorState((s) => s.room);
  const status = useEditorState((s) => s.relayStatus);
  const link = room ? ui.roomLink(room) : "";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      notify(COPY.SHARE.LINK_COPIED, "success");
    } catch {
      notify(COPY.ERRORS.CLIPBOARD, "warning");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={COPY.SHARE.TITLE} description={room ? COPY.SHARE.LIVE_BODY : COPY.SHARE.BODY} size="lg">
      <div className="flex flex-col gap-4">
        <Input label={COPY.SHARE.NAME} value={name} onChange={(e) => editor.setPrefs({ name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        <p className="text-body text-fg">{COPY.SHARE.PEERS(Object.keys(peers).length)}</p>
        {room ? (
          <div className="flex flex-col gap-3 rounded-card border border-line p-3">
            <div className="flex items-center gap-2">
              <Badge tone={status === "connected" ? "success" : status === "offline" ? "error" : "warning"}>{COPY.SHARE.STATUS[status ?? "connecting"]}</Badge>
              <span className="text-caption text-fg-muted">{COPY.SHARE.ENCRYPTED}</span>
            </div>
            <Input label={COPY.SHARE.LINK} value={link} readOnly onFocus={(e) => e.target.select()} onKeyDown={(e) => e.stopPropagation()} data-testid="room-link" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyLink}>{COPY.SHARE.COPY_LINK}</Button>
              <Button variant="destructive" onClick={ui.stopLiveSession}>{COPY.SHARE.STOP}</Button>
            </div>
            {status === "offline" && <p className="text-caption text-error-fg">{COPY.SHARE.OFFLINE_HELP}</p>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={ui.startLiveSession} data-testid="start-live">{COPY.SHARE.START}</Button>
            <Button as="a" variant="secondary" href={window.location.href} target="_blank" rel="noopener">
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              {COPY.SHARE.OPEN_TAB}
            </Button>
          </div>
        )}
        <p className="text-caption text-fg-muted">{COPY.SHARE.LIMIT}</p>
      </div>
    </Modal>
  );
}

export function ReplaceDialog({ open, onClose }) {
  const editor = useEditor();
  const { notify } = useNotifications();
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const run = () => {
    const { elements, count } = replaceText(editor.elements, find, replacement, { caseSensitive });
    if (count) editor.setElements(elements);
    notify(COPY.REPLACE.DONE(count), count ? "success" : "info");
  };
  const stop = (e) => e.stopPropagation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={COPY.REPLACE.TITLE}
      footer={
        <Button onClick={run} disabled={!find}>
          {COPY.REPLACE.REPLACE_ALL}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label={COPY.REPLACE.FIND} value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={stop} autoFocus />
        <Input label={COPY.REPLACE.WITH} value={replacement} onChange={(e) => setReplacement(e.target.value)} onKeyDown={stop} />
        <Switch checked={caseSensitive} onChange={setCaseSensitive} label={COPY.REPLACE.CASE} />
      </div>
    </Modal>
  );
}

export function MermaidDialog({ open, onClose }) {
  const editor = useEditor();
  const ui = useUi();
  const [text, setText] = useState(COPY.MERMAID.SAMPLE);
  const [error, setError] = useState(null);
  const insert = () => {
    try {
      const { roughness, fontFamily } = editor.state.style;
      const elements = mermaidToElements(text).map((el) => ({ ...el, roughness, fontFamily }));
      insertElements(editor, elements, { at: viewportCenter(editor, ui.getRect()) });
      setError(null);
      onClose();
    } catch (err) {
      setError(`${COPY.ERRORS.MERMAID}: ${err.message}`);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={COPY.MERMAID.TITLE}
      description={COPY.MERMAID.DESCRIPTION}
      size="lg"
      footer={
        <Button onClick={insert} data-testid="mermaid-insert">
          {COPY.MERMAID.INSERT}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <Textarea aria-label={COPY.MERMAID.TITLE} rows={12} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="font-mono" />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

export function FindDialog({ open, onClose }) {
  const editor = useEditor();
  const ui = useUi();
  const search = (q) => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const hits = [];
    for (const el of editor.elements) {
      const texts = [el.text, el.name, ...(el.cells?.flat() ?? [])].filter(Boolean);
      const match = texts.find((t) => t.toLowerCase().includes(query));
      if (!match) continue;
      hits.push({
        id: el.id,
        label: match.split("\n")[0].slice(0, 80),
        tag: COPY.TOOLS[el.type] ?? el.type,
        onSelect: () => {
          editor.select([el.id], { expand: false });
          zoomToFit(editor, ui.getRect(), [el.id]);
        },
      });
      if (hits.length > 50) break;
    }
    return hits;
  };
  return <CommandPalette open={open} onClose={onClose} search={search} placeholder={COPY.LABELS.FIND_PLACEHOLDER} emptyLabel={COPY.LABELS.NOTHING_FOUND} />;
}

export function PaletteDialog({ open, onClose }) {
  const ui = useUi();
  const editor = useEditor();
  const commands = open
    ? ui.actions
        .filter((a) => !a.enabled || a.enabled(editor.state))
        .map((a) => ({ id: a.id, label: a.label, group: COPY.MENUS[a.group.toUpperCase()] ?? a.group, shortcut: a.shortcut, onSelect: a.run }))
    : [];
  return <CommandPalette open={open} onClose={onClose} commands={commands} placeholder={COPY.LABELS.PALETTE_PLACEHOLDER} emptyLabel={COPY.LABELS.NOTHING_FOUND} />;
}

const CONTEXT_SELECTION = ["edit.cut", "edit.copy", "edit.paste", "edit.duplicate", "edit.copyStyle", "edit.pasteStyle", "arrange.front", "arrange.back", "arrange.group", "arrange.ungroup", "arrange.frameSelection", "arrange.autoLayout", "arrange.component", "arrange.detach", "edit.lock", "file.export", "edit.delete"];
const CONTEXT_CANVAS = ["edit.paste", "edit.selectAll", "view.zoomFit", "view.grid", "view.snapObjects", "edit.unlockAll", "file.export"];

export function ContextMenu({ at, onClose }) {
  const ui = useUi();
  const editor = useEditor();
  if (!at) return null;
  const ids = editor.state.selectedIds.length ? CONTEXT_SELECTION : CONTEXT_CANVAS;
  const byId = new Map(ui.actions.map((a) => [a.id, a]));
  const items = ids
    .map((id) => byId.get(id))
    .filter((a) => a && (!a.enabled || a.enabled(editor.state)))
    .map((a) => ({ label: a.label, shortcut: a.shortcut, checked: a.checked?.(editor.state), tone: a.id === "edit.delete" ? "danger" : undefined, onSelect: a.run }));
  return (
    <div className="absolute z-30" style={{ left: at.x, top: at.y }}>
      <Menu open onOpenChange={(o) => !o && onClose()} align="start" label={COPY.LABELS.CONTEXT_MENU} items={items} trigger={<span aria-hidden="true" className="block h-0 w-0" />} />
    </div>
  );
}
