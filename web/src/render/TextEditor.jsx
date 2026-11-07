import { useEffect, useRef } from "react";
import { useEditor, useEditorState } from "@/store/EditorContext.jsx";
import { toScreen } from "@/engine/viewport.js";
import { touch, deleteElements } from "@/engine/scene.js";
import { labelPoint } from "@/engine/connectors.js";
import { COPY } from "@/ui/copy.js";
import { fontFor, LINE_HEIGHT, TEXT_PAD, measureText, textBox } from "@/render/text.js";

const boxFor = (el) => ({ ...textBox(el), pad: el.type === "text" ? 0 : TEXT_PAD });

function Editable({ initial, style, onChange, onDone, label }) {
  const ref = useRef(null);
  const initialRef = useRef(initial);
  useEffect(() => {
    const node = ref.current;
    node.innerText = initialRef.current ?? "";
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);
  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      data-testid="text-editor"
      className="outline-none"
      style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", minWidth: 4, caretColor: style.color, ...style }}
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/\n$/, ""))}
      onBlur={(e) => onDone(e.currentTarget.innerText.replace(/\n$/, ""))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function TextEditor({ vp, page }) {
  const editor = useEditor();
  const editingTextId = useEditorState((s) => s.editingTextId);
  const editingCell = useEditorState((s) => s.editingCell);
  const el = page.elements.find((e) => e.id === (editingTextId ?? editingCell?.id));
  if (!el) return null;
  const z = vp.zoom;

  const finishText = (text) => {
    const current = editor.elements.find((e) => e.id === el.id);
    editor.set({ editingTextId: null });
    if (current && current.type === "text" && !text.trim()) editor.setElements(deleteElements(editor.elements, [el.id]));
    editor.end("text");
  };

  const setText = (text) => {
    editor.setElements(
      editor.elements.map((e) => {
        if (e.id !== el.id) return e;
        if (e.type === "text" && e.autoSize !== false) {
          const m = measureText(text || " ", e);
          return touch(e, { text, w: m.w, h: m.h });
        }
        if (e.type === "text") return touch(e, { text, h: Math.max(e.h, measureText(text || " ", { ...e }).h) });
        return touch(e, { text });
      }),
      { raw: true },
    );
  };

  const color = el.textColor ?? (el.stroke === "transparent" || el.type === "sticky" ? "#1e1e1e" : el.stroke);
  const font = { fontFamily: fontFor(el), fontSize: el.fontSize * z, lineHeight: LINE_HEIGHT, color, fontWeight: el.fontWeight ?? 400 };

  if (editingCell) {
    const cw = el.w / el.cols;
    const rh = el.h / el.rows;
    const s = toScreen(vp, { x: el.x + editingCell.c * cw, y: el.y + editingCell.r * rh });
    const initial = el.cells[editingCell.r][editingCell.c];
    return (
      <div className="absolute flex items-center" style={{ left: s.x, top: s.y, width: cw * z, height: rh * z, padding: TEXT_PAD * z, background: "rgba(255,255,255,0.9)", outline: "2px solid #6d5efc" }}>
        <Editable
          initial={initial}
          label={COPY.LABELS.CELL}
          style={{ ...font, color: el.stroke === "transparent" ? "#1e1e1e" : el.stroke, width: "100%", textAlign: el.textAlign ?? "center", fontWeight: el.header && editingCell.r === 0 ? 600 : 400 }}
          onChange={(text) => {
            editor.setElements(editor.elements.map((e) => (e.id === el.id ? touch(e, { cells: e.cells.map((row, r) => row.map((c, ci) => (r === editingCell.r && ci === editingCell.c ? text : c))) }) : e)), { raw: true });
          }}
          onDone={() => {
            editor.set({ editingCell: null });
            editor.end("text");
          }}
        />
      </div>
    );
  }

  if (el.type === "line" || el.type === "arrow") {
    const p = toScreen(vp, labelPoint(el));
    return (
      <div className="absolute" style={{ left: p.x, top: p.y, transform: "translate(-50%, -50%)" }}>
        <Editable initial={el.text} label={COPY.LABELS.CONNECTOR_LABEL} style={{ ...font, textAlign: "center", minWidth: 20, background: "rgba(255,255,255,0.9)", padding: "2px 4px" }} onChange={setText} onDone={finishText} />
      </div>
    );
  }

  const box = boxFor(el);
  const origin = toScreen(vp, { x: el.x, y: el.y });
  const isText = el.type === "text";
  const align = el.textAlign ?? (isText ? "left" : "center");
  const valign = el.verticalAlign ?? (isText ? "top" : "middle");
  return (
    <div
      className="absolute"
      style={{
        left: origin.x,
        top: origin.y,
        width: el.w * z,
        height: el.h * z,
        transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
        transformOrigin: "center",
      }}
    >
      <div
        className="absolute flex"
        style={{
          left: box.x * z,
          top: box.y * z,
          width: isText && el.autoSize !== false ? "max-content" : box.w * z,
          height: isText ? undefined : box.h * z,
          padding: box.pad * z,
          alignItems: valign === "top" ? "flex-start" : valign === "bottom" ? "flex-end" : "center",
        }}
      >
        <Editable initial={el.text} label={COPY.LABELS.TEXT} style={{ ...font, width: "100%", textAlign: align, whiteSpace: isText && el.autoSize !== false ? "pre" : "pre-wrap" }} onChange={setText} onDone={finishText} />
      </div>
    </div>
  );
}
