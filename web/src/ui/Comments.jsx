import { useEffect, useRef, useState } from "react";
import { MessageSquare, Check, Trash2, X, RotateCcw } from "lucide-react";
import { Button, Card, IconButton, Textarea, Avatar } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { toScreen } from "@/engine/viewport.js";
import { newId } from "@/engine/elements.js";
import { COPY } from "@/ui/copy.js";

export function addComment(editor, p) {
  const comment = { id: newId(), x: p.x, y: p.y, resolved: false, thread: [] };
  editor.updatePage({ comments: [...(editor.page.comments ?? []), comment] });
  editor.set({ activeCommentId: comment.id, tool: editor.state.toolLocked ? "comment" : "select" });
}

function Thread({ comment, onClose }) {
  const editor = useEditor();
  const name = useEditorState((s) => s.prefs.name) || COPY.LABELS.YOU;
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const update = (patch) => editor.updatePage({ comments: editor.page.comments.map((c) => (c.id === comment.id ? { ...c, ...patch } : c)) });
  const post = () => {
    if (!draft.trim()) return;
    update({ thread: [...comment.thread, { id: newId(), author: name, text: draft.trim(), at: Date.now() }] });
    setDraft("");
  };
  const remove = () => {
    editor.updatePage({ comments: editor.page.comments.filter((c) => c.id !== comment.id) });
    onClose();
  };
  return (
    <Card className="w-72 p-3 shadow-overlay" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-label font-semibold text-fg">
          {COPY.COMMENTS.TITLE}
          {comment.resolved && <span className="ml-2 text-caption text-fg-muted">{COPY.COMMENTS.RESOLVED}</span>}
        </p>
        <div className="flex items-center gap-1">
          <IconButton icon={comment.resolved ? RotateCcw : Check} label={comment.resolved ? COPY.COMMENTS.REOPEN : COPY.COMMENTS.RESOLVE} variant="ghost" size="xs" onClick={() => update({ resolved: !comment.resolved })} />
          <IconButton icon={Trash2} label={COPY.COMMENTS.DELETE} variant="ghost" size="xs" onClick={remove} />
          <IconButton icon={X} label={COPY.LABELS.CLOSE} variant="ghost" size="xs" onClick={onClose} />
        </div>
      </div>
      <div className="flex max-h-60 flex-col gap-3 overflow-y-auto">
        {!comment.thread.length && <p className="text-caption text-fg-muted">{COPY.COMMENTS.EMPTY}</p>}
        {comment.thread.map((m) => (
          <div key={m.id} className="flex gap-2">
            <Avatar name={m.author} size="sm" />
            <div className="min-w-0">
              <p className="text-caption text-fg-muted">
                <span className="font-semibold text-fg">{m.author}</span> · {new Date(m.at).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap break-words text-body text-fg">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <Textarea
          aria-label={comment.thread.length ? COPY.COMMENTS.REPLY : COPY.COMMENTS.PLACEHOLDER}
          placeholder={comment.thread.length ? COPY.COMMENTS.REPLY : COPY.COMMENTS.PLACEHOLDER}
          ref={inputRef}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
            if (e.key === "Escape") onClose();
          }}
        />
        <Button size="xs" onClick={post} disabled={!draft.trim()} className="self-end">
          {COPY.COMMENTS.SEND}
        </Button>
      </div>
    </Card>
  );
}

export function CommentLayer({ vp, page }) {
  const editor = useEditor();
  const ui = useUi();
  const activeId = useEditorState((s) => s.activeCommentId);
  const comments = page.comments ?? [];
  const active = comments.find((c) => c.id === activeId);
  useEffect(() => {
    const list = editor.page.comments ?? [];
    if (list.some((c) => !c.thread.length && c.id !== activeId)) {
      editor.updatePage({ comments: list.filter((c) => c.thread.length || c.id === activeId) }, { record: false });
    }
  }, [activeId, editor]);
  const rect = ui.getRect();
  const anchor = active ? toScreen(vp, active) : null;
  return (
    <>
      {comments.map((c) => {
        const s = toScreen(vp, c);
        return (
          <div key={c.id} className="absolute" style={{ left: s.x, top: s.y, transform: "translate(-4px, -100%)", opacity: c.resolved ? 0.5 : 1 }}>
            <Button
              size="xs"
              variant={c.id === activeId ? "primary" : "secondary"}
              aria-label={`${COPY.COMMENTS.TITLE} ${c.thread[0]?.text ?? ""}`}
              className="rounded-full rounded-bl-none"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => editor.set({ activeCommentId: c.id === activeId ? null : c.id })}
            >
              <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
              {c.thread.length || ""}
            </Button>
          </div>
        );
      })}
      {active && (
        <div className="absolute z-20" style={{ left: Math.min(anchor.x + 20, rect.width - 300), top: Math.max(56, Math.min(anchor.y - 10, rect.height - 380)) }}>
          <Thread key={active.id} comment={active} onClose={() => {
            const c = editor.page.comments?.find((x) => x.id === active.id);
            if (c && !c.thread.length) editor.updatePage({ comments: editor.page.comments.filter((x) => x.id !== c.id) }, { record: false });
            editor.set({ activeCommentId: null });
          }} />
        </div>
      )}
    </>
  );
}
