import { useState } from "react";
import { Input, Select, SelectMenu } from "@kasumi/ui";
import { useEditor, useEditorState } from "@/store/EditorContext.jsx";
import { updateElements } from "@/engine/scene.js";
import { parseLink, presentationFrames } from "@/engine/prototype.js";
import { PRESENT_COPY as P } from "@/ui/copy-present.js";

const NONE = "none";
const URL_MODE = "url";

function LinkFields({ el }) {
  const editor = useEditor();
  const board = useEditorState((s) => s.board);
  const pageId = useEditorState((s) => s.pageId);
  const parsed = parseLink(el.link);
  const [urlMode, setUrlMode] = useState(!!el.link && (parsed.kind === "url" || parsed.kind === null));
  const [draft, setDraft] = useState(parsed.kind === "url" || parsed.kind === null ? el.link ?? "" : "");

  const write = (patch) => editor.setElements(updateElements(editor.elements, [el.id], () => patch), { key: "link" });

  const frames = presentationFrames(editor.page).filter((f) => f.id !== el.id);
  const pages = board.pages.filter((p) => p.id !== pageId);
  const options = [
    { value: NONE, label: P.NO_LINK },
    ...frames.map((f) => ({ value: `#frame:${f.id}`, label: P.FRAME_OPTION(f.name || P.UNTITLED_FRAME) })),
    ...pages.map((p) => ({ value: `#page:${p.id}`, label: P.PAGE_OPTION(p.name) })),
    { value: URL_MODE, label: P.WEB_ADDRESS },
  ];
  const value = urlMode ? URL_MODE : parsed.kind === "frame" || parsed.kind === "page" ? el.link.trim() : NONE;

  const pick = (next) => {
    setUrlMode(next === URL_MODE);
    if (next === URL_MODE) {
      setDraft("");
      if (el.link) write({ link: null, linkTransition: null });
    } else if (next === NONE) write({ link: null, linkTransition: null });
    else write(next.startsWith("#frame:") ? { link: next } : { link: next, linkTransition: null });
  };

  const typeUrl = (text) => {
    setDraft(text);
    if (!text.trim()) write({ link: null, linkTransition: null });
    else if (parseLink(text).kind === "url") write({ link: text.trim(), linkTransition: null });
  };

  const invalid = urlMode && draft.trim() !== "" && parseLink(draft).kind !== "url";

  return (
    <div className="flex flex-col gap-2" data-testid="link-editor">
      <SelectMenu label={P.LINK} size="sm" value={value} options={options} onChange={pick} />
      {urlMode && (
        <Input
          label={P.URL_LABEL}
          fieldSize="sm"
          type="url"
          placeholder={P.URL_PLACEHOLDER}
          value={draft}
          error={invalid ? P.URL_ERROR : undefined}
          onChange={(e) => typeUrl(e.target.value)}
        />
      )}
      {parsed.kind === "frame" && !urlMode && (
        <Select label={P.TRANSITION} fieldSize="sm" value={el.linkTransition ?? "instant"} onChange={(e) => write({ linkTransition: e.target.value })}>
          {Object.entries(P.TRANSITIONS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
      )}
    </div>
  );
}

export function LinkEditor() {
  const editor = useEditor();
  useEditorState((s) => s.board);
  const selectedIds = useEditorState((s) => s.selectedIds);
  const el = selectedIds.length === 1 ? editor.selected[0] : null;
  if (!el) return null;
  return <LinkFields key={el.id} el={el} />;
}
