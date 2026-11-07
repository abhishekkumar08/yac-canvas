import { nudge } from "@/ui/actions.js";

const CODE_KEYS = { BracketLeft: "[", BracketRight: "]", Equal: "=", Minus: "-", Slash: "/", Quote: "'", Period: ".", Comma: "," };

export function comboOf(e) {
  let key;
  if (e.code?.startsWith("Key")) key = e.code.slice(3).toLowerCase();
  else if (e.code?.startsWith("Digit")) key = e.code.slice(5);
  else key = CODE_KEYS[e.code] ?? e.key.toLowerCase();
  const parts = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

const isTyping = (t) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function bindKeys(editor, actions, controller) {
  const byCombo = new Map();
  for (const a of actions) for (const k of a.keys ?? []) if (!byCombo.has(k)) byCombo.set(k, a);

  const onKeyDown = (e) => {
    if (isTyping(e.target) || document.querySelector("[role=dialog][aria-modal=true]")) return;
    const s = editor.state;
    if (e.key === " " && !e.repeat) {
      controller.setSpace(true);
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      if (s.penDraft) return controller.finishPen(false);
      controller.cancel();
      if (s.croppingId) editor.set({ croppingId: null });
      else if (s.editingPathId) editor.set({ editingPathId: null });
      else if (s.editingGroupId) editor.set({ editingGroupId: null });
      else if (s.selectedIds.length) editor.set({ selectedIds: [] });
      else if (s.tool !== "select") editor.setTool("select");
      editor.set({ activeCommentId: null });
      return;
    }
    if (e.key === "Enter") {
      if (s.penDraft) {
        e.preventDefault();
        return controller.finishPen(false);
      }
      const el = editor.selected[0];
      if (s.selectedIds.length === 1 && el && !["image", "freedraw", "path", "instance", "frame", "table"].includes(el.type)) {
        e.preventDefault();
        editor.begin();
        editor.set({ editingTextId: el.id });
      }
      return;
    }
    if (e.key.startsWith("Arrow") && s.selectedIds.length && !(e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      nudge(editor, d[0], d[1]);
      return;
    }
    const combo = comboOf(e);
    const action = byCombo.get(combo) ?? (e.key === "?" ? byCombo.get("?") : null);
    if (!action) return;
    if (action.enabled && !action.enabled(s)) return;
    if (s.viewMode && !/^(view|help)\./.test(action.id)) return;
    e.preventDefault();
    action.run();
  };
  const onKeyUp = (e) => {
    if (e.key === " ") controller.setSpace(false);
  };
  const onBlur = () => controller.setSpace(false);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}
