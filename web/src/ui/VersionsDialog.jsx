import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, List, ListRow, LoadingState, Menu, Modal, useNotifications } from "@kasumi/ui";
import { useEditor, useEditorState } from "@/store/EditorContext.jsx";
import { deleteVersion, getVersion, listVersions, renameVersion, saveVersion } from "@/store/versions.js";
import { BoardPreview } from "@/ui/TemplatesGallery.jsx";
import { VERSIONS_COPY as C } from "@/ui/copy-versions.js";

const titleOf = (v) => v.name ?? (v.auto ? C.AUTOSAVE : C.UNTITLED);

export function VersionsDialog({ open, onClose }) {
  const editor = useEditor();
  const boardId = useEditorState((s) => s.board.id);
  const { notify, confirmAction, promptAction } = useNotifications();
  const [versions, setVersions] = useState(null);
  const [preview, setPreview] = useState(null);

  const reload = useCallback(
    () =>
      listVersions(boardId)
        .then(setVersions)
        .catch(() => {
          setVersions([]);
          notify(C.ERRORS.LOAD, "error");
        }),
    [boardId, notify],
  );

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    reload();
  }, [open, reload]);

  const attempt = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch {
      notify(C.ERRORS.ACTION, "error");
    }
  };

  const save = attempt(async () => {
    const name = await promptAction({ title: C.SAVE_TITLE, value: "", placeholder: C.SAVE_PLACEHOLDER, confirmText: C.SAVE_CONFIRM, cancelText: C.CANCEL });
    if (name === null) return;
    await saveVersion(editor.state.board, { name: name || C.UNTITLED });
    notify(C.NOTES.SAVED, "success");
    await reload();
  });

  const showPreview = attempt(async (meta) => {
    const version = await getVersion(meta.id);
    if (version) setPreview(version);
  });

  const restore = attempt(async (meta) => {
    const ok = await confirmAction({ title: C.RESTORE_TITLE, description: C.RESTORE_BODY, confirmText: C.RESTORE_CONFIRM, cancelText: C.CANCEL });
    if (!ok) return;
    const version = preview?.id === meta.id ? preview : await getVersion(meta.id);
    if (!version) return;
    editor.applyBoard({ ...version.board, id: editor.state.board.id, updatedAt: Date.now() }, { key: null, selectedIds: [] });
    notify(C.NOTES.RESTORED(titleOf(meta)), "success");
    onClose();
  });

  const rename = attempt(async (meta) => {
    const name = await promptAction({ title: C.RENAME_TITLE, value: meta.name ?? "", confirmText: C.RENAME, cancelText: C.CANCEL });
    if (!name) return;
    await renameVersion(meta.id, name);
    notify(C.NOTES.RENAMED, "success");
    await reload();
  });

  const remove = attempt(async (meta) => {
    const ok = await confirmAction({ title: C.DELETE_TITLE, description: C.DELETE_BODY, confirmText: C.DELETE_CONFIRM, cancelText: C.CANCEL, variant: "error" });
    if (!ok) return;
    await deleteVersion(meta.id);
    if (preview?.id === meta.id) setPreview(null);
    notify(C.NOTES.DELETED, "success");
    await reload();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={C.TITLE}
      description={C.DESCRIPTION}
      size="lg"
      footer={
        <div className="flex w-full justify-end">
          <Button onClick={save}>{C.SAVE}</Button>
        </div>
      }
    >
      {preview && (
        <div className="mb-4 flex flex-col gap-2">
          <div className="aspect-[16/9] rounded-md border border-line bg-white p-3">
            <BoardPreview board={preview.board} label={C.PREVIEW_OF(titleOf(preview))} className="h-full w-full" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
              {C.HIDE_PREVIEW}
            </Button>
            <Button size="sm" onClick={() => restore(preview)}>
              {C.RESTORE}
            </Button>
          </div>
        </div>
      )}
      {!versions ? (
        <LoadingState title={C.LOADING} />
      ) : !versions.length ? (
        <EmptyState size="sm" title={C.EMPTY_TITLE} description={C.EMPTY_BODY} />
      ) : (
        <List>
          {versions.map((v) => (
            <ListRow
              key={v.id}
              selected={preview?.id === v.id}
              stackOnPhone
              title={titleOf(v)}
              description={`${new Date(v.createdAt).toLocaleString()} · ${C.ELEMENTS(v.elementCount)}`}
              trailing={
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => showPreview(v)}>
                    {C.PREVIEW}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => restore(v)}>
                    {C.RESTORE}
                  </Button>
                  <Menu
                    label={C.ACTIONS}
                    align="end"
                    items={[
                      { label: C.RENAME, onSelect: () => rename(v) },
                      { label: C.DELETE, tone: "danger", onSelect: () => remove(v) },
                    ]}
                  />
                </div>
              }
            />
          ))}
        </List>
      )}
    </Modal>
  );
}
