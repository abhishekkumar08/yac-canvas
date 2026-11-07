import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Input, Select } from "@kasumi/ui";
import { useEditor, useEditorState } from "@/store/EditorContext.jsx";
import { updateElements } from "@/engine/scene.js";
import { COPY } from "@/ui/copy.js";
import { LinkEditor } from "@/ui/LinkEditor.jsx";

const C = COPY.EXTRAS;

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="text-caption font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

function Constraints({ sel }) {
  const editor = useEditor();
  const kids = sel.filter((e) => e.frameId && editor.elements.some((f) => f.id === e.frameId && f.type === "frame" && !f.layout));
  if (!kids.length) return null;
  const first = kids[0].constraints ?? { h: "left", v: "top" };
  const set = (axis, value) =>
    editor.setElements(updateElements(editor.elements, kids.map((k) => k.id), (el) => ({ constraints: { ...(el.constraints ?? { h: "left", v: "top" }), [axis]: value } })));
  return (
    <Section title={C.CONSTRAINTS}>
      <div className="grid grid-cols-2 gap-2">
        <Select label={C.HORIZONTAL} fieldSize="sm" value={first.h} onChange={(e) => set("h", e.target.value)}>
          {Object.entries(C.H).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Select label={C.VERTICAL} fieldSize="sm" value={first.v} onChange={(e) => set("v", e.target.value)}>
          {Object.entries(C.V).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </div>
    </Section>
  );
}

function Data({ el }) {
  const editor = useEditor();
  const [draftKey, setDraftKey] = useState("");
  const data = el.data ?? {};
  const write = (next) => editor.setElements(updateElements(editor.elements, [el.id], () => ({ data: next })), { key: `data:${el.id}` });
  const stop = (e) => e.stopPropagation();
  return (
    <Section title={C.DATA}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex items-end gap-1">
          <Input label={k} fieldSize="sm" value={v} onKeyDown={stop} onChange={(e) => write({ ...data, [k]: e.target.value })} containerClassName="flex-1" />
          <IconButton icon={Trash2} label={`${C.REMOVE} ${k}`} size="xs" variant="ghost" onClick={() => write(Object.fromEntries(Object.entries(data).filter(([key]) => key !== k)))} />
        </div>
      ))}
      <div className="flex items-end gap-1">
        <Input label={C.NEW_KEY} fieldSize="sm" value={draftKey} onKeyDown={(e) => {
          stop(e);
          if (e.key === "Enter" && draftKey.trim()) {
            write({ ...data, [draftKey.trim()]: "" });
            setDraftKey("");
          }
        }} onChange={(e) => setDraftKey(e.target.value)} containerClassName="flex-1" />
        <IconButton icon={Plus} label={C.ADD} size="xs" variant="secondary" disabled={!draftKey.trim() || draftKey.trim() in data} onClick={() => {
          write({ ...data, [draftKey.trim()]: "" });
          setDraftKey("");
        }} />
      </div>
    </Section>
  );
}

function Crop({ el }) {
  const editor = useEditor();
  const cropping = useEditorState((s) => s.croppingId === el.id);
  const reset = () => {
    const c = el.crop;
    const fw = el.w / c.w;
    const fh = el.h / c.h;
    editor.setElements(updateElements(editor.elements, [el.id], () => ({ crop: null, x: el.x - c.x * fw, y: el.y - c.y * fh, w: fw, h: fh })));
  };
  return (
    <Section title={C.IMAGE}>
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant={cropping ? "primary" : "secondary"} onClick={() => editor.set({ croppingId: cropping ? null : el.id })}>
          {cropping ? C.DONE_CROP : C.CROP}
        </Button>
        {el.crop && (
          <Button size="xs" variant="ghost" onClick={reset}>
            {C.RESET_CROP}
          </Button>
        )}
      </div>
    </Section>
  );
}

export function FormatExtras({ sel }) {
  const one = sel.length === 1 ? sel[0] : null;
  return (
    <>
      {one?.type === "image" && <Crop el={one} />}
      <Constraints sel={sel} />
      {one && (
        <Section title={C.LINK}>
          <LinkEditor />
        </Section>
      )}
      {one && <Data el={one} />}
    </>
  );
}
