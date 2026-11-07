import { useState } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, ArrowDown, ArrowUp, BringToFront, Copy,
  Group, Lock, SendToBack, Trash2, Ungroup, Unlock,
} from "lucide-react";
import { Button, ColorSwatches, IconButton, Input, NumberStepper, SegmentedControl, Select, Slider, Switch } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { DEFAULT_STYLE } from "@/engine/elements.js";
import { updateElements, expandSelection } from "@/engine/scene.js";
import { applyAutoLayout } from "@/engine/layout.js";
import { COPY } from "@/ui/copy.js";
import { FORMAT_COPY } from "@/ui/copy-format.js";
import { FormatExtras } from "@/ui/FormatExtras.jsx";

const F = COPY.FORMAT;
const O = COPY.OPTIONS;
const swatches = (list) => list.map(([value, label]) => ({ value, label }));
const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

const has = (list) => (t) => list.includes(t);
const not = (list) => (t) => !list.includes(t);
const CAN = {
  stroke: not(["image", "instance", "sticky"]),
  fill: not(["line", "arrow", "freedraw", "text", "image", "instance"]),
  line: not(["text", "image", "instance", "sticky"]),
  edges: has(["rect", "diamond", "frame", "table", "image", "sticky"]),
  text: not(["image", "freedraw", "path", "instance", "frame"]),
  connector: has(["line", "arrow"]),
  any: () => true,
};
const PROP_CAN = {
  stroke: CAN.stroke, fill: CAN.fill, fillStyle: CAN.fill, strokeWidth: CAN.line, strokeStyle: CAN.line, roughness: CAN.line,
  radius: CAN.edges, opacity: CAN.any, shadow: CAN.any, fontFamily: CAN.text, fontSize: CAN.text, textAlign: CAN.text,
  verticalAlign: CAN.text, textColor: CAN.text, routing: CAN.connector, startArrow: CAN.connector, endArrow: CAN.connector,
};
const DEFAULT_LAYOUT = { direction: "row", gap: 16, padding: 24, align: "start", hug: true };
const BOOLEAN_OPS = ["union", "subtract", "intersect", "exclude"];
const ALIGN_ICONS = {
  left: AlignStartVertical, center: AlignCenterVertical, right: AlignEndVertical,
  top: AlignStartHorizontal, middle: AlignCenterHorizontal, bottom: AlignEndHorizontal,
};
const isBoolShape = (e) => !["line", "arrow", "freedraw", "text"].includes(e.type);
const typeLabel = (el) => (el.type === "frame" && el.isComponent ? F.COMPONENT : FORMAT_COPY.TYPES[el.type] ?? COPY.TOOLS[el.type]);
const round = (n) => Math.round(n * 100) / 100;

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-caption font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-medium text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

function Segments({ label, options: opts, value, onChange }) {
  return (
    <Field label={label}>
      <SegmentedControl label={label} options={opts} value={String(value)} onChange={onChange} className="w-full" />
    </Field>
  );
}

function Choice({ label, options: opts, value, onChange }) {
  return (
    <Select label={label} fieldSize="sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </Select>
  );
}

function NumberField({ value, onCommit, ...props }) {
  const [draft, setDraft] = useState(null);
  return (
    <Input
      type="number"
      fieldSize="sm"
      {...props}
      value={draft ?? round(value ?? 0)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onCommit(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function StyleSections({ get, set, can, sticky }) {
  const show = (...props) => props.some(can);
  const fill = get("fill");
  const filled = fill && fill !== "transparent";
  const arrow = (prop) => (
    <Choice label={prop === "startArrow" ? F.START_ARROW : F.END_ARROW} options={options(O.ARROWS)} value={get(prop) ?? "none"} onChange={(v) => set(prop, v === "none" ? null : v)} />
  );
  return (
    <>
      {show("stroke", "fill", "strokeWidth", "radius", "opacity", "shadow") && (
        <Section title={F.TITLE_STYLE}>
          {can("stroke") && <ColorSwatches label={F.STROKE} colors={swatches(COPY.COLORS.STROKE)} value={get("stroke")} onChange={(v) => set("stroke", v)} allowCustom />}
          {can("fill") && <ColorSwatches label={F.FILL} colors={swatches(sticky ? COPY.COLORS.STICKY : COPY.COLORS.FILL)} value={fill} onChange={(v) => set("fill", v)} allowCustom />}
          {can("fillStyle") && filled && !sticky && <Choice label={F.FILL_STYLE} options={options(O.FILL_STYLES)} value={get("fillStyle")} onChange={(v) => set("fillStyle", v)} />}
          {can("strokeWidth") && <Segments label={F.STROKE_WIDTH} options={options(O.WIDTHS)} value={get("strokeWidth")} onChange={(v) => set("strokeWidth", Number(v))} />}
          {can("strokeStyle") && <Segments label={F.STROKE_STYLE} options={options(O.STROKE_STYLES)} value={get("strokeStyle")} onChange={(v) => set("strokeStyle", v)} />}
          {can("roughness") && <Segments label={F.SLOPPINESS} options={options(O.SLOPPINESS)} value={get("roughness")} onChange={(v) => set("roughness", Number(v))} />}
          {can("radius") && <Segments label={F.EDGES} options={options(O.EDGES)} value={get("radius") ? 12 : 0} onChange={(v) => set("radius", Number(v))} />}
          {can("opacity") && <Slider label={F.OPACITY} value={get("opacity") ?? 100} min={0} max={100} onChange={(v) => set("opacity", v, "style:opacity")} format={FORMAT_COPY.PERCENT} />}
          {can("shadow") && <Switch label={F.SHADOW} checked={!!get("shadow")} onChange={(v) => set("shadow", v)} />}
        </Section>
      )}
      {show("fontFamily") && (
        <Section title={F.TITLE_TEXT}>
          <Segments label={F.FONT} options={options(O.FONTS)} value={get("fontFamily")} onChange={(v) => set("fontFamily", v)} />
          <Field label={F.FONT_SIZE}>
            <div className="flex items-center gap-2">
              <SegmentedControl label={F.FONT_SIZE} options={options(O.SIZES)} value={String(get("fontSize"))} onChange={(v) => set("fontSize", Number(v))} />
              <NumberField aria-label={FORMAT_COPY.CUSTOM_SIZE} containerClassName="w-16" min={6} value={get("fontSize")} onCommit={(v) => v > 0 && set("fontSize", v, "style:fontSize")} />
            </div>
          </Field>
          {can("textAlign") && <Segments label={F.TEXT_ALIGN} options={options(O.ALIGN)} value={get("textAlign")} onChange={(v) => set("textAlign", v)} />}
          {can("verticalAlign") && <Segments label={F.VERTICAL_ALIGN} options={options(O.VALIGN)} value={get("verticalAlign")} onChange={(v) => set("verticalAlign", v)} />}
          {can("textColor") && <ColorSwatches label={F.TEXT_COLOR} colors={swatches(COPY.COLORS.STROKE)} value={get("textColor") ?? get("stroke")} onChange={(v) => set("textColor", v)} allowCustom />}
        </Section>
      )}
      {show("routing") && (
        <Section title={FORMAT_COPY.TITLE_CONNECTOR}>
          <Segments label={F.ROUTING} options={options(O.ROUTING)} value={get("routing")} onChange={(v) => set("routing", v)} />
          <div className="grid grid-cols-2 gap-2">
            {arrow("startArrow")}
            {arrow("endArrow")}
          </div>
        </Section>
      )}
    </>
  );
}

function CanvasPanel() {
  const editor = useEditor();
  useEditorState((s) => s.board);
  useEditorState((s) => s.pageId);
  const prefs = useEditorState((s) => s.prefs);
  const style = useEditorState((s) => s.style);
  const page = editor.page;
  return (
    <>
      <Section title={F.TITLE_CANVAS}>
        <ColorSwatches label={F.BACKGROUND} colors={swatches(COPY.COLORS.PAGE)} value={page.background ?? undefined} onChange={(background) => editor.updatePage({ background }, { record: false })} allowCustom />
        <Segments label={F.GRID} options={options(O.GRID)} value={page.grid ?? "dots"} onChange={(grid) => editor.updatePage({ grid }, { record: false })} />
        <Slider label={F.GRID_SIZE} value={prefs.gridSize} min={5} max={100} onChange={(gridSize) => editor.setPrefs({ gridSize })} />
        <Switch label={F.SNAP_GRID} checked={!!prefs.snapToGrid} onChange={(snapToGrid) => editor.setPrefs({ snapToGrid })} />
        <Switch label={F.SNAP_OBJECTS} checked={!!prefs.snapToObjects} onChange={(snapToObjects) => editor.setPrefs({ snapToObjects })} />
        <Switch label={COPY.ACTIONS.RULERS} checked={!!prefs.showRulers} onChange={(showRulers) => editor.setPrefs({ showRulers })} />
        <Switch label={COPY.ACTIONS.MINIMAP} checked={!!prefs.showMinimap} onChange={(showMinimap) => editor.setPrefs({ showMinimap })} />
      </Section>
      <p className="text-caption text-fg-muted">{F.NEW_STYLE_NOTE}</p>
      <StyleSections get={(p) => style[p]} set={(p, v) => editor.setStyle({ [p]: v })} can={(p) => p in style} />
    </>
  );
}

function FramePanel({ frame, patch }) {
  const layout = frame.layout;
  const setLayout = (next, key) => patch({ layout: { ...layout, ...next } }, key);
  return (
    <Section title={FORMAT_COPY.TITLE_FRAME}>
      <Input label={frame.isComponent ? F.COMPONENT_NAME : F.FRAME_NAME} fieldSize="sm" value={frame.name ?? ""} onChange={(e) => patch({ name: e.target.value }, "frame:name")} />
      <Field label={F.FRAME_PRESET}>
        <div className="flex flex-wrap gap-1">
          {COPY.FRAME_PRESETS.map(([name, w, h]) => (
            <Button key={name} size="xs" variant="secondary" onClick={() => patch({ w, h })}>{name}</Button>
          ))}
        </div>
      </Field>
      <Switch label={F.CLIP} checked={frame.clip !== false} onChange={(clip) => patch({ clip })} />
      <Switch label={COPY.GRIDS.TITLE} checked={!!frame.layoutGrid} onChange={(on) => patch({ layoutGrid: on ? { columns: 12, gutter: 20, margin: 24 } : null })} />
      {frame.layoutGrid && (
        <div className="grid grid-cols-3 gap-2">
          {["columns", "gutter", "margin"].map((k) => (
            <Input key={k} label={COPY.GRIDS[k.toUpperCase()]} fieldSize="sm" type="number" min={k === "columns" ? 1 : 0} value={frame.layoutGrid[k]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => {
              const v = Math.max(k === "columns" ? 1 : 0, parseInt(e.target.value, 10));
              if (Number.isFinite(v)) patch({ layoutGrid: { ...frame.layoutGrid, [k]: v } }, "grid");
            }} />
          ))}
        </div>
      )}
      <Switch label={F.AUTO_LAYOUT} checked={!!layout} onChange={(on) => patch({ layout: on ? DEFAULT_LAYOUT : null })} />
      {layout && (
        <>
          <Segments label={F.DIRECTION} options={options(O.DIRECTION)} value={layout.direction} onChange={(direction) => setLayout({ direction })} />
          <Slider label={F.GAP} value={layout.gap} min={0} max={200} onChange={(gap) => setLayout({ gap }, "layout:gap")} />
          <Slider label={F.PADDING} value={layout.padding} min={0} max={200} onChange={(padding) => setLayout({ padding }, "layout:padding")} />
          <Segments label={F.ALIGN_ITEMS} options={options(O.ALIGN_ITEMS)} value={layout.align} onChange={(align) => setLayout({ align })} />
          <Switch label={F.HUG} checked={!!layout.hug} onChange={(hug) => setLayout({ hug })} />
        </>
      )}
    </Section>
  );
}

function ComponentPanel({ el, patch }) {
  const editor = useEditor();
  const ui = useUi();
  if (el.type === "instance") {
    return (
      <Section title={F.COMPONENT}>
        <Input label={FORMAT_COPY.NAME} fieldSize="sm" value={el.name ?? ""} onChange={(e) => patch({ name: e.target.value }, "instance:name")} />
        <Button size="sm" variant="secondary" onClick={() => ui.runAction("arrange.detach")}>{COPY.ACTIONS.DETACH}</Button>
      </Section>
    );
  }
  if (!el.isComponent) {
    return (
      <Section title={F.COMPONENT}>
        <Button size="sm" variant="secondary" onClick={() => ui.runAction("arrange.component")}>{COPY.ACTIONS.MAKE_COMPONENT}</Button>
      </Section>
    );
  }
  const count = editor.elements.filter((e) => e.type === "instance" && e.componentId === el.id).length;
  return (
    <Section title={F.COMPONENT}>
      <p className="text-caption text-fg-muted">{F.INSTANCES(count)}</p>
      <Button size="sm" variant="secondary" onClick={() => ui.runAction("insert.instance")}>{FORMAT_COPY.CREATE_INSTANCE}</Button>
    </Section>
  );
}

function TablePanel({ table, patch }) {
  const resize = (rows, cols) =>
    patch({
      rows,
      cols,
      w: (table.w * cols) / table.cols,
      h: (table.h * rows) / table.rows,
      cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => table.cells?.[r]?.[c] ?? "")),
    });
  return (
    <Section title={F.TABLE}>
      <NumberStepper label={F.ROWS} value={table.rows} min={1} max={50} onChange={(rows) => resize(rows, table.cols)} className="py-0" />
      <NumberStepper label={F.COLS} value={table.cols} min={1} max={20} onChange={(cols) => resize(table.rows, cols)} className="py-0" />
      <Switch label={F.HEADER} checked={!!table.header} onChange={(header) => patch({ header })} />
    </Section>
  );
}

function ArrangePanel({ sel, patch }) {
  const editor = useEditor();
  const ui = useUi();
  const run = (id) => () => ui.runAction(id);
  const one = sel.length === 1 ? sel[0] : null;
  const linear = one && ["line", "arrow", "freedraw"].includes(one.type);
  const move = (axis, value, key) => {
    const delta = value - one[axis];
    const ids = expandSelection(editor.elements, [one.id], { withFrameChildren: true });
    editor.setElements(updateElements(editor.elements, ids, (el) => ({ [axis]: el[axis] + delta })), { key });
  };
  const btn = (icon, label, id, props) => <IconButton key={id} icon={icon} label={label} size="xs" variant="ghost" onClick={run(id)} {...props} />;
  return (
    <Section title={F.TITLE_ARRANGE}>
      {one && (
        <Field label={F.POSITION}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={F.X} value={one.x} onCommit={(v) => move("x", v, "arrange:x")} />
            <NumberField label={F.Y} value={one.y} onCommit={(v) => move("y", v, "arrange:y")} />
            {!linear && <NumberField label={F.W} value={one.w} min={1} onCommit={(v) => v > 0 && patch({ w: v }, "arrange:w")} />}
            {!linear && <NumberField label={F.H} value={one.h} min={1} onCommit={(v) => v > 0 && patch({ h: v }, "arrange:h")} />}
            {one.type !== "line" && one.type !== "arrow" && (
              <NumberField label={F.ANGLE} value={((one.angle ?? 0) * 180) / Math.PI} onCommit={(v) => patch({ angle: (v * Math.PI) / 180 }, "arrange:angle")} />
            )}
          </div>
        </Field>
      )}
      <Field label={F.LAYERS}>
        <div className="flex flex-wrap gap-1">
          {btn(BringToFront, COPY.ACTIONS.TO_FRONT, "arrange.front")}
          {btn(ArrowUp, COPY.ACTIONS.FORWARD, "arrange.forward")}
          {btn(ArrowDown, COPY.ACTIONS.BACKWARD, "arrange.backward")}
          {btn(SendToBack, COPY.ACTIONS.TO_BACK, "arrange.back")}
        </div>
      </Field>
      {sel.length > 1 && (
        <Field label={F.ALIGN}>
          <div className="flex flex-wrap gap-1">
            {Object.entries(ALIGN_ICONS).map(([mode, icon]) => btn(icon, COPY.ALIGN[mode], `arrange.align.${mode}`))}
            {btn(AlignHorizontalDistributeCenter, COPY.ACTIONS.DISTRIBUTE_X, "arrange.distributeX", { disabled: sel.length < 3 })}
            {btn(AlignVerticalDistributeCenter, COPY.ACTIONS.DISTRIBUTE_Y, "arrange.distributeY", { disabled: sel.length < 3 })}
            {btn(Group, COPY.ACTIONS.GROUP, "arrange.group")}
            {sel.some((e) => e.groupIds?.length) && btn(Ungroup, COPY.ACTIONS.UNGROUP, "arrange.ungroup")}
          </div>
        </Field>
      )}
      {sel.filter(isBoolShape).length > 1 && (
        <Field label={COPY.MENUS.BOOLEAN}>
          <div className="flex flex-wrap gap-1">
            {BOOLEAN_OPS.map((op) => (
              <Button key={op} size="xs" variant="secondary" onClick={run(`arrange.bool.${op}`)}>{COPY.BOOLEAN[op]}</Button>
            ))}
          </div>
        </Field>
      )}
      {sel.length > 1 && (
        <Field label={COPY.MENUS.LAYOUT}>
          <div className="flex flex-wrap gap-1">
            <Button size="xs" variant="secondary" onClick={run("arrange.treeDown")}>{COPY.ACTIONS.TREE_DOWN}</Button>
            <Button size="xs" variant="secondary" onClick={run("arrange.treeRight")}>{COPY.ACTIONS.TREE_RIGHT}</Button>
          </div>
        </Field>
      )}
      <div className="flex gap-1">
        {btn(Copy, COPY.ACTIONS.DUPLICATE, "edit.duplicate")}
        {btn(Lock, COPY.LABELS.LOCK, "edit.lock")}
        {btn(Trash2, COPY.ACTIONS.DELETE, "edit.delete")}
      </div>
    </Section>
  );
}

function SelectionPanel({ sel }) {
  const editor = useEditor();
  const ui = useUi();
  const one = sel.length === 1 ? sel[0] : null;

  if (sel.some((e) => e.locked)) {
    return (
      <Section title={F.LOCKED}>
        <p className="text-caption text-fg-muted">{FORMAT_COPY.LOCKED_NOTE}</p>
        <Button size="sm" variant="secondary" onClick={() => ui.runAction("edit.lock")}>
          <Unlock aria-hidden="true" className="h-4 w-4" />
          {COPY.LABELS.UNLOCK}
        </Button>
      </Section>
    );
  }

  const fillable = sel.filter((e) => CAN.fill(e.type));
  const sticky = fillable.length > 0 && fillable.every((e) => e.type === "sticky");
  const can = (prop) => sel.some((e) => PROP_CAN[prop](e.type));
  const get = (prop) => {
    const el = sel.find((e) => PROP_CAN[prop](e.type));
    return el && prop in el ? el[prop] : DEFAULT_STYLE[prop];
  };
  const set = (prop, value, key) => {
    const ids = sel.filter((e) => PROP_CAN[prop](e.type)).map((e) => e.id);
    editor.setElements(updateElements(editor.elements, ids, () => ({ [prop]: value })), { key });
    if (!(sticky && prop === "fill")) editor.setStyle({ [prop]: value });
  };
  const patch = (p, key) => {
    const next = updateElements(editor.elements, [one.id], () => p);
    editor.setElements(one.type === "frame" ? applyAutoLayout(next, one.id) : next, { key });
  };

  return (
    <>
      <StyleSections get={get} set={set} can={can} sticky={sticky} />
      {one?.type === "frame" && <FramePanel frame={one} patch={patch} />}
      {(one?.type === "frame" || one?.type === "instance") && <ComponentPanel el={one} patch={patch} />}
      {one?.type === "table" && <TablePanel table={one} patch={patch} />}
      <ArrangePanel sel={sel} patch={patch} />
      <FormatExtras sel={sel} />
    </>
  );
}

export function FormatPanel() {
  const editor = useEditor();
  const selectedIds = useEditorState((s) => s.selectedIds);
  useEditorState((s) => s.board);
  const sel = selectedIds.length ? editor.selected : [];
  return (
    <div className="flex flex-col gap-4 p-3 text-fg">
      {sel.length > 0 && <p className="text-label font-semibold text-fg">{sel.length > 1 ? F.MULTI(sel.length) : typeLabel(sel[0])}</p>}
      {sel.length ? <SelectionPanel sel={sel} /> : <CanvasPanel />}
    </div>
  );
}
