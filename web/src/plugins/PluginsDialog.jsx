import { useEffect, useRef, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Button, IconButton, Input, List, ListRow, Modal, Textarea, useNotifications } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { newId } from "@/engine/elements.js";
import { pickFile, zoomToFit } from "@/ui/actions.js";
import { runPlugin } from "@/plugins/host.js";
import { BUILTIN_PLUGINS, PLUGIN_TEMPLATE } from "@/plugins/builtins.js";
import { PLUGIN_COPY } from "@/plugins/copy.js";

const C = PLUGIN_COPY.DIALOG;
const EMPTY = [];
const MAX_FILE = 512 * 1024;

function PluginRow({ plugin, onRun, onRemove }) {
  return (
    <ListRow
      title={plugin.name}
      description={plugin.description}
      trailing={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" aria-label={C.RUN_NAMED(plugin.name)} onClick={() => onRun(plugin)}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {C.RUN}
          </Button>
          {onRemove && <IconButton icon={Trash2} label={C.REMOVE_NAMED(plugin.name)} variant="ghost" size="sm" onClick={() => onRemove(plugin)} />}
        </div>
      }
    />
  );
}

export function PluginsDialog({ open, onClose }) {
  const editor = useEditor();
  const ui = useUi();
  const { notify, confirmAction } = useNotifications();
  const saved = useEditorState((s) => s.prefs.plugins) ?? EMPTY;
  const [running, setRunning] = useState(null);
  const [draft, setDraft] = useState(null);
  const uiRef = useRef(null);
  const runningRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const current = runningRef;
    return () => current.current?.handle.stop();
  }, [open]);

  const run = (plugin) => {
    runningRef.current?.handle.stop();
    const entry = { name: plugin.name };
    entry.handle = runPlugin({
      code: plugin.code,
      name: plugin.name,
      editor,
      notify,
      onZoomToFit: () => zoomToFit(editor, ui.getRect()),
      uiContainer: uiRef.current,
      onExit: () => {
        if (runningRef.current !== entry) return;
        runningRef.current = null;
        setRunning(null);
      },
    });
    runningRef.current = entry;
    setRunning(entry);
  };

  const runFile = async () => {
    const file = await pickFile(".js,text/javascript");
    if (!file) return;
    if (file.size > MAX_FILE) {
      notify(PLUGIN_COPY.NOTES.FILE_TOO_LARGE, "error");
      return;
    }
    try {
      run({ name: file.name, code: await file.text() });
    } catch (err) {
      notify(PLUGIN_COPY.NOTES.FAILED(file.name, err.message), "error");
    }
  };

  const remove = async (plugin) => {
    const ok = await confirmAction({ title: C.REMOVE_TITLE(plugin.name), description: C.REMOVE_BODY, confirmText: C.REMOVE, variant: "error" });
    if (ok) editor.setPrefs({ plugins: (editor.state.prefs.plugins ?? EMPTY).filter((p) => p.id !== plugin.id) });
  };

  const draftPlugin = () => ({ id: newId(), name: draft.name.trim() || C.UNTITLED, code: draft.code });

  const save = () => {
    const plugin = draftPlugin();
    editor.setPrefs({ plugins: [...(editor.state.prefs.plugins ?? EMPTY), plugin] });
    notify(PLUGIN_COPY.NOTES.SAVED(plugin.name), "success");
    setDraft(null);
  };

  return (
    <Modal open={open} onClose={onClose} title={C.TITLE} description={C.DESCRIPTION} size="lg">
      <div className="flex flex-col gap-5">
        {running && (
          <section className="flex flex-col gap-2 rounded-card border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label text-fg">{C.RUNNING(running.name)}</span>
              <Button size="sm" variant="secondary" onClick={() => running.handle.stop()}>
                {C.STOP}
              </Button>
            </div>
          </section>
        )}
        <div ref={uiRef} className="flex justify-center empty:hidden" />

        <section className="flex flex-col gap-2">
          <h3 className="text-label text-fg">{C.BUILT_IN}</h3>
          <List>
            {BUILTIN_PLUGINS.map((p) => (
              <PluginRow key={p.id} plugin={p} onRun={run} />
            ))}
          </List>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-label text-fg">{C.YOURS}</h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={runFile}>
                {C.RUN_FILE}
              </Button>
              {!draft && (
                <Button size="sm" variant="secondary" onClick={() => setDraft({ name: "", code: PLUGIN_TEMPLATE })}>
                  {C.NEW}
                </Button>
              )}
            </div>
          </div>
          {saved.length ? (
            <List>
              {saved.map((p) => (
                <PluginRow key={p.id} plugin={p} onRun={run} onRemove={remove} />
              ))}
            </List>
          ) : (
            <p className="text-caption text-fg-muted">{C.NONE_SAVED}</p>
          )}
        </section>

        {draft && (
          <section className="flex flex-col gap-3">
            <h3 className="text-label text-fg">{C.NEW}</h3>
            <Input label={C.NAME} placeholder={C.NAME_PLACEHOLDER} fieldSize="sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea
              label={C.CODE}
              rows={16}
              spellCheck={false}
              className="font-mono text-caption"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                {C.CANCEL}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => run(draftPlugin())}>
                {C.RUN}
              </Button>
              <Button size="sm" onClick={save}>
                {C.SAVE}
              </Button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
