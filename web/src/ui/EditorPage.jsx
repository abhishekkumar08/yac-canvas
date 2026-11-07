import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, LoadingState, useNotifications, useTheme } from "@kasumi/ui";
import { Editor } from "@/store/editor.js";
import { EditorContext, useEditor, useEditorState } from "@/store/EditorContext.jsx";
import { boardsDb } from "@/store/db.js";
import { loadPrefs, savePrefs } from "@/store/prefs.js";
import { connectCollab } from "@/store/collab.js";
import { connectRelay, createRoom } from "@/store/relay.js";
import { createElement } from "@/engine/elements.js";
import { createBoard, serializeBoard } from "@/engine/serialize.js";
import { newId } from "@/engine/elements.js";
import { createController } from "@/tools/controller.js";
import { Canvas } from "@/render/Canvas.jsx";
import { exportSvg, svgToPngBlob, downloadBlob, safeName } from "@/render/exportImage.jsx";
import {
  buildActions, clipboardPayload, pickFile, pasteText, insertElements, insertImage, viewportCenter, zoomToFit,
} from "@/ui/actions.js";
import { bindKeys } from "@/ui/keys.js";
import { addComment } from "@/ui/Comments.jsx";
import { Toolbar } from "@/ui/Toolbar.jsx";
import { MenuBar } from "@/ui/MenuBar.jsx";
import { BottomBar, Pages } from "@/ui/BottomBar.jsx";
import { Minimap, Rulers } from "@/ui/Minimap.jsx";
import { ExportDialog, HelpDialog, ShareDialog, FindDialog, PaletteDialog, ContextMenu, MermaidDialog, ReplaceDialog } from "@/ui/Dialogs.jsx";
import { cssFor } from "@/engine/css.js";
import { useAutoVersions } from "@/ui/useAutoVersions.js";
import { VersionsDialog } from "@/ui/VersionsDialog.jsx";
import { Present } from "@/ui/Present.jsx";
import { FormatPanel } from "@/ui/FormatPanel.jsx";
import { LeftPanel } from "@/ui/LeftPanel.jsx";
import { LIBRARY } from "@/ui/library.js";
import { IMPORT_ACCEPT, openAsBoard, importIntoBoard, insertSvg, exportAs } from "@/ui/importers.js";
import { findLibraryItem } from "@/plugins/LibrariesSection.jsx";
import { PluginsDialog } from "@/plugins/PluginsDialog.jsx";
import { COPY } from "@/ui/copy.js";
import { MODE_STYLE, MODE_PANELS, modeOf } from "@/ui/modes.js";

const BASIC_TYPES = new Set(["rect", "ellipse", "diamond", "shape", "line", "arrow", "text"]);
const VP_KEY = (id) => `yac-canvas:vp:${id}`;


const STYLE_TOOLS = new Set(["rect", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "sticky", "frame", "pen", "table"]);

function Dialogs({ dialogs, setDialog, contextAt, setContextAt }) {
  const close = () => setDialog(null);
  const editor = useEditor();
  const presentStart = () => {
    const el = editor.selected[0];
    if (!el) return undefined;
    let cur = el;
    while (cur?.frameId) cur = editor.elements.find((e) => e.id === cur.frameId);
    return cur?.type === "frame" ? cur.id : undefined;
  };
  return (
    <>
      <ExportDialog open={dialogs === "export"} onClose={close} />
      <HelpDialog open={dialogs === "help"} onClose={close} />
      <ShareDialog open={dialogs === "share"} onClose={close} />
      <FindDialog open={dialogs === "find"} onClose={close} />
      <PaletteDialog open={dialogs === "palette"} onClose={close} />
      <MermaidDialog open={dialogs === "mermaid"} onClose={close} />
      <PluginsDialog open={dialogs === "plugins"} onClose={close} />
      <ReplaceDialog open={dialogs === "replace"} onClose={close} />
      <VersionsDialog open={dialogs === "versions"} onClose={close} />
      {dialogs === "present" && <Present startFrameId={presentStart()} onExit={close} />}
      <ContextMenu at={contextAt} onClose={() => setContextAt(null)} />
    </>
  );
}

const PANEL = "material-overlay absolute z-10 w-64 rounded-card border border-line shadow-overlay";
const DOCK = "material-canvas absolute z-10 w-64 border-line";

function Layout({ controller, onCanvasReady, dialogs, setDialog, contextAt, setContextAt }) {
  const prefs = useEditorState((s) => s.prefs);
  const mode = useEditorState((s) => modeOf(s.board));
  const tool = useEditorState((s) => s.tool);
  const hasSelection = useEditorState((s) => s.selectedIds.length > 0);
  const viewMode = useEditorState((s) => s.viewMode);
  const editor = useEditor();
  const zen = prefs.zen;
  const minimap = prefs.showMinimap && <Minimap />;
  const dialogsNode = <Dialogs dialogs={dialogs} setDialog={setDialog} contextAt={contextAt} setContextAt={setContextAt} />;

  if (viewMode) {
    return (
      <div className="fixed inset-0 overflow-clip bg-canvas text-fg" data-mode="view">
        <Canvas controller={controller} onReady={onCanvasReady} />
        <div className="absolute right-3 top-3 z-20">
          <Button size="sm" variant="secondary" onClick={() => editor.set({ viewMode: false, tool: "select" })}>
            {COPY.VIEW_MODE.EXIT}
          </Button>
        </div>
        <BottomBar showPages={false} showMinimapToggle={false} />
        {dialogsNode}
      </div>
    );
  }

  if (mode === "whiteboard") {
    const showStyle = !zen && prefs.showFormat && (hasSelection || STYLE_TOOLS.has(tool));
    return (
      <div className="fixed inset-0 overflow-clip bg-canvas text-fg" data-mode="whiteboard">
        <Canvas controller={controller} onReady={onCanvasReady} />
        {prefs.showRulers && <Rulers top={0} />}
        <MenuBar mode="whiteboard" />
        {!zen && <Toolbar mode="whiteboard" />}
        {showStyle && (
          <aside className={`${PANEL} bottom-20 left-3 top-20 w-60 overflow-y-auto overflow-x-clip`} style={{ height: "fit-content", maxHeight: "calc(100% - 10rem)" }} data-testid="format-panel">
            <FormatPanel />
          </aside>
        )}
        {!zen && prefs.leftPanel && (
          <aside className={`${PANEL} bottom-20 right-3 top-16 w-72 overflow-clip`} data-testid="left-panel">
            <LeftPanel />
          </aside>
        )}
        {minimap}
        <BottomBar showPages={false} />
        {dialogsNode}
      </div>
    );
  }

  if (mode === "design") {
    return (
      <div className="fixed inset-0 overflow-clip bg-canvas text-fg" data-mode="design">
        <Canvas controller={controller} onReady={onCanvasReady} />
        {prefs.showRulers && <Rulers top={48} />}
        <MenuBar mode="design" />
        {!zen && (
          <aside className={`${DOCK} bottom-0 left-0 top-12 flex flex-col border-r`} data-testid="left-panel">
            <div className="border-b border-line">
              <p className="px-3 pt-3 text-caption font-semibold uppercase tracking-wide text-fg-muted">{COPY.LABELS.PAGES_TITLE}</p>
              <div className="max-h-40 overflow-y-auto">
                <Pages vertical />
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <LeftPanel />
            </div>
          </aside>
        )}
        {!zen && prefs.showFormat && (
          <aside className={`${DOCK} bottom-0 right-0 top-12 overflow-y-auto overflow-x-clip border-l`} data-testid="format-panel">
            <FormatPanel />
          </aside>
        )}
        {!zen && <Toolbar mode="design" />}
        <BottomBar showPages={false} showMinimapToggle={false} className={zen ? "inset-x-0" : "left-64 right-64"} />
        {dialogsNode}
      </div>
    );
  }

  const top = prefs.showRulers ? "top-[7.5rem]" : "top-[6.25rem]";
  return (
    <div className="fixed inset-0 overflow-clip bg-canvas text-fg" data-mode="diagram">
      <Canvas controller={controller} onReady={onCanvasReady} />
      {prefs.showRulers && <Rulers top={92} />}
      <MenuBar mode="diagram" />
      {!zen && <Toolbar mode="diagram" />}
      {!zen && prefs.leftPanel && (
        <aside className={`${PANEL} bottom-16 overflow-clip ${prefs.showRulers ? "left-8" : "left-3"} ${top}`} data-testid="left-panel">
          <LeftPanel />
        </aside>
      )}
      {!zen && prefs.showFormat && (
        <aside className={`${PANEL} bottom-16 right-3 overflow-y-auto overflow-x-clip ${top}`} style={prefs.showMinimap ? { bottom: "12.5rem" } : undefined} data-testid="format-panel">
          <FormatPanel />
        </aside>
      )}
      {minimap}
      <BottomBar />
      {dialogsNode}
    </div>
  );
}

export function EditorPage({ boardId, navigate, room }) {
  const [board, setBoard] = useState(null);
  const { notify, promptAction } = useNotifications();
  useEffect(() => {
    let alive = true;
    boardsDb.get(boardId).then((b) => {
      if (!alive) return;
      if (!b) {
        notify(COPY.ERRORS.BOARD_MISSING, "error");
        navigate("/");
        return;
      }
      setBoard(b);
    });
    return () => {
      alive = false;
    };
  }, [boardId, navigate, notify]);
  if (!board || board.id !== boardId) return <LoadingState title={COPY.HOME.LOADING} />;
  return <LoadedEditor key={board.id} initialBoard={board} room={room} navigate={navigate} notify={notify} promptAction={promptAction} />;
}

function LoadedEditor({ initialBoard, room, navigate, notify, promptAction }) {
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const rectRef = useRef(() => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }));
  const [dialogs, setDialog] = useState(null);
  const [contextAt, setContextAt] = useState(null);
  const saveTimer = useRef(null);
  const saveFailed = useRef(false);
  const collabRef = useRef(null);

  const editor = useMemo(() => {
    const prefs = loadPrefs();
    const mode = modeOf(initialBoard);
    const ed = new Editor(initialBoard, { prefs: prefs.lastMode === mode ? prefs : { ...prefs, ...MODE_PANELS[mode], lastMode: mode } });
    ed.state.style = { ...ed.state.style, ...MODE_STYLE[mode] };
    try {
      const vp = JSON.parse(localStorage.getItem(VP_KEY(initialBoard.id)) ?? "null");
      if (vp) ed.state.viewports = vp;
    } catch {
      ed.state.viewports = {};
    }
    return ed;
  }, [initialBoard]);

  const flush = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    boardsDb.put(editor.state.board).catch(() => {
      if (!saveFailed.current) notify(COPY.NOTES.SAVE_FAILED, "error");
      saveFailed.current = true;
    });
  }, [editor, notify]);

  useEffect(() => {
    editor.onChange = (board, prev, origin) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 400);
      if (origin !== "remote") collabRef.current?.publish(board, prev);
    };
    let lastPrefs = editor.state.prefs;
    let lastVp = editor.state.viewports;
    const unsub = editor.subscribe(() => {
      if (editor.state.prefs !== lastPrefs) {
        lastPrefs = editor.state.prefs;
        savePrefs(lastPrefs);
      }
      if (editor.state.viewports !== lastVp) {
        lastVp = editor.state.viewports;
        try {
          localStorage.setItem(VP_KEY(initialBoard.id), JSON.stringify(lastVp));
        } catch {
          // Storage full or blocked: the view position just isn't remembered.
        }
      }
    });
    const onHide = () => saveTimer.current && flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      unsub();
      if (saveTimer.current) flush();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [editor, flush, initialBoard.id]);

  const roomId = room?.roomId ?? null;
  const roomKey = room?.key ?? null;
  useEffect(() => {
    const callbacks = {
      getBoard: () => editor.state.board,
      applyRemote: (b) => editor.applyBoard(b, { record: false, origin: "remote" }),
      onPeers: (peers) => editor.set({ peers }),
      getName: () => editor.state.prefs.name || COPY.LABELS.YOU,
    };
    let transport;
    if (roomId) {
      try {
        transport = connectRelay(initialBoard.id, { ...callbacks, roomId, key: roomKey, onStatus: (relayStatus) => editor.set({ relayStatus }) });
        editor.set({ room: { roomId, key: roomKey } });
      } catch (err) {
        notify(err.message, "error");
      }
    }
    transport ??= connectCollab(initialBoard.id, callbacks);
    collabRef.current = transport;
    return () => {
      transport.close();
      editor.set({ room: null, relayStatus: null, peers: {} });
    };
  }, [editor, initialBoard.id, roomId, roomKey, notify]);

  const ui = useMemo(() => {
    const api = {
      getRect: () => rectRef.current(),
      notify,
      isDark: () => themeRef.current.isDark,
      toggleTheme: () => themeRef.current.toggleTheme(),
      goHome: () => navigate("/"),
      openExport: () => setDialog("export"),
      openHelp: () => setDialog("help"),
      openShare: () => setDialog("share"),
      openFind: () => setDialog("find"),
      openPalette: () => setDialog("palette"),
      openContextMenu: (e) => {
        const r = rectRef.current();
        const p = { x: e.clientX - r.left, y: e.clientY - r.top };
        setContextAt(p);
      },
      async newBoard() {
        const b = createBoard(COPY.LABELS.UNTITLED);
        await boardsDb.put(b);
        navigate(`/board/${b.id}`);
      },
      async duplicateBoard() {
        flush();
        const b = { ...structuredClone(editor.state.board), id: newId(), name: COPY.LABELS.COPY_OF(editor.state.board.name), updatedAt: Date.now() };
        await boardsDb.put(b);
        navigate(`/board/${b.id}`);
      },
      async renameBoard() {
        const name = await promptAction({ title: COPY.ACTIONS.RENAME_BOARD, value: editor.state.board.name, confirmText: COPY.HOME.RENAME });
        if (name) editor.updateBoard((b) => ({ ...b, name }));
      },
      async openFile() {
        const file = await pickFile(IMPORT_ACCEPT);
        if (!file) return;
        try {
          if (file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".svg")) {
            await importIntoBoard(editor, file, viewportCenter(editor, api.getRect()));
            return;
          }
          const b = await openAsBoard(file);
          notify(COPY.NOTES.OPENED(b.name), "success");
          navigate(`/board/${b.id}`);
        } catch (err) {
          notify(`${COPY.ERRORS.OPEN}: ${err.message}`, "error");
        }
      },
      async importFile() {
        const file = await pickFile(IMPORT_ACCEPT);
        if (file) await api.dropFile(file, viewportCenter(editor, api.getRect()));
      },
      exportAs: (kind) => exportAs(editor, kind),
      openMermaid: () => setDialog("mermaid"),
      openPlugins: () => setDialog("plugins"),
      openReplace: () => setDialog("replace"),
      openVersions: () => setDialog("versions"),
      present: () => setDialog("present"),
      async print() {
        const r = await exportSvg(editor.state.board, editor.page, { ids: editor.state.selectedIds });
        if (!r) return;
        const frame = document.createElement("iframe");
        frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
        document.body.appendChild(frame);
        const doc = frame.contentDocument;
        doc.open();
        doc.write(`<!doctype html><title>${safeName(editor.state.board.name)}</title><style>@page{margin:12mm}body{margin:0}svg{width:100%;height:auto}</style>${r.svg}`);
        doc.close();
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1000);
      },
      async copySvg() {
        try {
          const r = await exportSvg(editor.state.board, editor.page, { ids: editor.state.selectedIds, background: false });
          if (r) await navigator.clipboard.writeText(r.svg);
          notify(COPY.NOTES.COPIED, "success");
        } catch {
          notify(COPY.ERRORS.CLIPBOARD, "warning");
        }
      },
      async copyCss() {
        try {
          await navigator.clipboard.writeText(cssFor(editor.selected[0]));
          notify(COPY.NOTES.COPIED, "success");
        } catch {
          notify(COPY.ERRORS.CLIPBOARD, "warning");
        }
      },
      saveFile() {
        const b = editor.state.board;
        downloadBlob(new Blob([serializeBoard(b)], { type: "application/json" }), `${safeName(b.name)}.yaccanvas`);
        notify(COPY.NOTES.SAVED_FILE, "success");
      },
      async copyPng() {
        try {
          const r = await exportSvg(editor.state.board, editor.page, { ids: editor.state.selectedIds });
          if (!r) return;
          const blob = await svgToPngBlob(r, 2);
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          notify(COPY.NOTES.COPIED_PNG, "success");
        } catch (err) {
          notify(`${COPY.ERRORS.EXPORT}: ${err.message}`, "error");
        }
      },
      async pickImage(at) {
        const file = await pickFile("image/png,image/jpeg,image/gif,image/webp,image/svg+xml");
        if (!file) return;
        try {
          await insertImage(editor, file, at ?? viewportCenter(editor, api.getRect()));
          if (!editor.state.toolLocked) editor.set({ tool: "select" });
        } catch (err) {
          notify(err.message, "error");
        }
      },
      async dropFile(file, p) {
        try {
          await importIntoBoard(editor, file, p);
        } catch (err) {
          notify(`${COPY.ERRORS.OPEN}: ${err.message}`, "error");
        }
        return undefined;
      },
      insertLibraryItem(ref, at) {
        const p = at ?? viewportCenter(editor, api.getRect());
        if (ref.libraryItem) {
          const item = findLibraryItem(editor.state.prefs, ref.libraryItem);
          if (item) insertElements(editor, item.elements, { at: p, files: item.files });
          return;
        }
        if (ref.scratchpadId) {
          const item = editor.state.prefs.scratchpad.find((s) => s.id === ref.scratchpadId);
          if (item) pasteText(editor, item.payload, p);
          return;
        }
        const item = LIBRARY.find((i) => i.id === (ref.libraryId ?? ref.id));
        if (!item) return;
        const props = item.make();
        const st = editor.state.style;
        const styled = BASIC_TYPES.has(props.type)
          ? { stroke: st.stroke, strokeWidth: st.strokeWidth, roughness: st.roughness, fontFamily: st.fontFamily, ...props }
          : props;
        const el = createElement(props.type, styled);
        insertElements(editor, [el], { at: p });
      },
      cut() {
        api.copy();
        api.runAction("edit.delete");
      },
      async copy() {
        const text = clipboardPayload(editor);
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          notify(COPY.ERRORS.CLIPBOARD, "warning");
        }
      },
      async paste() {
        try {
          const text = await navigator.clipboard.readText();
          pasteText(editor, text, editor.state.cursorWorld ?? viewportCenter(editor, api.getRect()));
        } catch {
          notify(COPY.ERRORS.CLIPBOARD, "warning");
        }
      },
      startLiveSession() {
        const { roomId: id, key } = createRoom();
        flush();
        navigate(`/board/${editor.state.board.id}?room=${id},${key}`);
      },
      stopLiveSession() {
        navigate(`/board/${editor.state.board.id}`);
      },
      roomLink(r) {
        return `${window.location.origin}${window.location.pathname}#/room/${r.roomId},${r.key}`;
      },
      setMode(mode) {
        if (modeOf(editor.state.board) === mode) return;
        editor.updateBoard((b) => ({ ...b, uiMode: mode }));
        editor.setStyle(MODE_STYLE[mode]);
        editor.setPrefs({ ...MODE_PANELS[mode], lastMode: mode });
      },
      runAction(id) {
        const a = api.actions.find((x) => x.id === id);
        if (a && (!a.enabled || a.enabled(editor.state))) a.run();
      },
    };
    api.actions = buildActions(editor, api);
    return api;
  }, [editor, navigate, notify, promptAction, flush]);

  const controller = useMemo(
    () =>
      createController(editor, {
        getRect: () => rectRef.current(),
        onImageTool: (p) => ui.pickImage(p),
        onComment: (p) => addComment(editor, p),
        onCursor: (p) => {
          editor.state.cursorWorld = p;
          collabRef.current?.cursor(p, editor.state.pageId);
        },
      }),
    [editor, ui],
  );

  useEffect(() => bindKeys(editor, ui.actions, controller), [editor, ui, controller]);
  useAutoVersions(editor);

  useEffect(() => {
    if (import.meta.env.DEV) window.__yacEditor = editor;
  }, [editor]);

  useEffect(() => {
    const target = (e) => e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA"].includes(e.target.tagName));
    const onCopy = (e) => {
      if (target(e) || window.getSelection()?.toString()) return;
      const text = clipboardPayload(editor);
      if (!text) return;
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      if (e.type === "cut") ui.runAction("edit.delete");
    };
    const onPaste = async (e) => {
      if (target(e)) return;
      e.preventDefault();
      const at = editor.state.cursorWorld ?? viewportCenter(editor, ui.getRect());
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        try {
          await insertImage(editor, file, at);
        } catch (err) {
          notify(err.message, "error");
        }
        return;
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(text)) {
        try {
          insertSvg(editor, text, at);
        } catch (err) {
          notify(err.message, "error");
        }
        return;
      }
      pasteText(editor, text, at);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [editor, ui, notify]);

  const onCanvasReady = useCallback(
    (getRect) => {
      rectRef.current = getRect;
      if (!editor.state.viewports[editor.state.pageId]) {
        const r = getRect();
        zoomToFit(editor, r);
      }
    },
    [editor],
  );

  return (
    <EditorContext.Provider value={{ editor, ui }}>
      <Layout controller={controller} onCanvasReady={onCanvasReady} dialogs={dialogs} setDialog={setDialog} contextAt={contextAt} setContextAt={setContextAt} />
    </EditorContext.Provider>
  );
}
