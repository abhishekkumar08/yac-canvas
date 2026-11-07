import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@kasumi/ui";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { DEFAULT_VIEWPORT } from "@/store/editor.js";
import { toWorld, toScreen, viewRect } from "@/engine/viewport.js";
import { outline, center, elementBounds, unionBounds } from "@/engine/geometry.js";
import { measureGaps } from "@/engine/snapping.js";
import { selectionBounds } from "@/engine/scene.js";
import { connectionPointsWorld, isBindable } from "@/engine/connectors.js";
import { SceneTree } from "@/render/SceneTree.jsx";
import { LinkBadges } from "@/render/LinkBadges.jsx";
import { TextEditor } from "@/render/TextEditor.jsx";
import { getHandles, handleAt, CURSORS } from "@/tools/handles.js";
import { hitElement } from "@/tools/controller.js";
import { penNodesToPoints, pathNodesWorld } from "@/engine/pen.js";
import { CommentLayer } from "@/ui/Comments.jsx";
import { COPY } from "@/ui/copy.js";

const TOOL_CURSORS = { hand: "grab", text: "text", eraser: "cell", laser: "crosshair", comment: "copy", select: "default" };
const deg = (r) => (r * 180) / Math.PI;
const DARK_FILTER = "invert(93%) hue-rotate(180deg)";

function Grid({ vp, size, mode, dark }) {
  if (mode === "none") return null;
  let step = size * vp.zoom;
  while (step < 10) step *= 5;
  const ox = ((vp.scrollX * vp.zoom) % step + step) % step;
  const oy = ((vp.scrollY * vp.zoom) % step + step) % step;
  const color = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  return (
    <>
      <defs>
        <pattern id="yc-grid" width={step} height={step} patternUnits="userSpaceOnUse" x={ox} y={oy}>
          {mode === "dots" ? (
            <circle cx={1} cy={1} r={1} fill={color} />
          ) : (
            <path d={`M${step} 0 L0 0 0 ${step}`} fill="none" stroke={color} strokeWidth={1} />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#yc-grid)" pointerEvents="none" />
    </>
  );
}

function SelectionOverlay({ selected, zoom, editingGroup, elements }) {
  if (!selected.length) return null;
  const sw = 1.5 / zoom;
  const accent = "#6d5efc";
  const handles = getHandles(selected, zoom);
  const hs = 8 / zoom;
  const multi = selected.length > 1;
  const b = multi ? selectionBounds(selected, selected.map((e) => e.id)) : null;
  const groupBox = editingGroup ? selectionBounds(elements.filter((e) => e.groupIds.includes(editingGroup)), elements.filter((e) => e.groupIds.includes(editingGroup)).map((e) => e.id)) : null;
  return (
    <g pointerEvents="none">
      {groupBox && <rect x={groupBox.x - 6 / zoom} y={groupBox.y - 6 / zoom} width={groupBox.w + 12 / zoom} height={groupBox.h + 12 / zoom} fill="none" stroke={accent} strokeWidth={sw} strokeDasharray={`${4 / zoom} ${4 / zoom}`} opacity={0.6} />}
      {selected.map((el) => {
        if (el.type === "line" || el.type === "arrow") return null;
        const c = center(el);
        return (
          <rect
            key={el.id}
            x={el.x}
            y={el.y}
            width={el.w}
            height={el.h}
            transform={el.angle ? `rotate(${deg(el.angle)} ${c.x} ${c.y})` : undefined}
            fill="none"
            stroke={el.locked ? "#868e96" : accent}
            strokeWidth={sw}
            strokeDasharray={multi || el.locked ? `${4 / zoom} ${3 / zoom}` : undefined}
          />
        );
      })}
      {b && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={accent} strokeWidth={sw} />}
      {handles.map((h, i) => {
        if (h.kind === "resize") return <rect key={i} x={h.x - hs / 2} y={h.y - hs / 2} width={hs} height={hs} rx={2 / zoom} fill="#fff" stroke={accent} strokeWidth={sw} />;
        if (h.kind === "rotate") return <circle key={i} cx={h.x} cy={h.y} r={hs / 2} fill="#fff" stroke={accent} strokeWidth={sw} />;
        if (h.kind === "point") return <circle key={i} cx={h.x} cy={h.y} r={hs / 1.6} fill="#fff" stroke={accent} strokeWidth={sw * 1.4} />;
        return <circle key={i} cx={h.x} cy={h.y} r={hs / 2.6} fill={accent} opacity={0.55} />;
      })}
    </g>
  );
}

function BindingHint({ hint, elements, zoom }) {
  const el = hint && elements.find((e) => e.id === hint.id);
  if (!el) return null;
  const pts = outline(el);
  return (
    <g pointerEvents="none">
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#6d5efc" strokeWidth={3 / zoom} opacity={0.45} />
      {isBindable(el) &&
        connectionPointsWorld(el).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4 / zoom} fill={hint.fixed && hint.fx === p.fx && hint.fy === p.fy ? "#6d5efc" : "#fff"} stroke="#6d5efc" strokeWidth={1.5 / zoom} />
        ))}
    </g>
  );
}

function PenDraft({ draft, cursor, zoom, stroke }) {
  if (!draft?.nodes.length) return null;
  const pts = penNodesToPoints(draft.nodes, false);
  if (cursor) pts.push(cursor);
  return (
    <g pointerEvents="none">
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={stroke} strokeWidth={2 / zoom} />
      {draft.nodes.map((n, i) => (
        <g key={i}>
          {(n.hx || n.hy) && <line x1={n.x - n.hx} y1={n.y - n.hy} x2={n.x + n.hx} y2={n.y + n.hy} stroke="#6d5efc" strokeWidth={1 / zoom} />}
          <rect x={n.x - 3 / zoom} y={n.y - 3 / zoom} width={6 / zoom} height={6 / zoom} fill="#fff" stroke="#6d5efc" strokeWidth={1.5 / zoom} />
        </g>
      ))}
    </g>
  );
}

function PathNodes({ el, zoom }) {
  if (!el) return null;
  const nodes = pathNodesWorld(el);
  const s = 7 / zoom;
  return (
    <g pointerEvents="none" data-testid="path-nodes">
      {nodes.map((n, i) => (
        <g key={i}>
          {(n.hx || n.hy) && (
            <>
              <line x1={n.x - n.hx} y1={n.y - n.hy} x2={n.x + n.hx} y2={n.y + n.hy} stroke="#6d5efc" strokeWidth={1 / zoom} />
              <circle cx={n.x + n.hx} cy={n.y + n.hy} r={s / 2} fill="#6d5efc" />
              <circle cx={n.x - n.hx} cy={n.y - n.hy} r={s / 2} fill="#6d5efc" />
            </>
          )}
          <rect x={n.x - s / 2} y={n.y - s / 2} width={s} height={s} fill="#fff" stroke="#6d5efc" strokeWidth={1.5 / zoom} />
        </g>
      ))}
    </g>
  );
}

function CropGhost({ el, files, zoom }) {
  if (!el?.crop || !files?.[el.fileId]) return null;
  const fw = el.w / el.crop.w;
  const fh = el.h / el.crop.h;
  const x = el.x - el.crop.x * fw;
  const y = el.y - el.crop.y * fh;
  return (
    <g pointerEvents="none">
      <image href={files[el.fileId]} x={x} y={y} width={fw} height={fh} preserveAspectRatio="none" opacity={0.25} />
      <rect x={x} y={y} width={fw} height={fh} fill="none" stroke="#6d5efc" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />
    </g>
  );
}

function Measures({ gaps, zoom }) {
  if (!gaps?.length) return null;
  const color = "#e8590c";
  return (
    <g pointerEvents="none" data-testid="measures">
      {gaps.map((g, i) => {
        const mx = (g.x1 + g.x2) / 2;
        const my = (g.y1 + g.y2) / 2;
        const label = String(Math.round(g.value));
        const w = (label.length * 7 + 10) / zoom;
        return (
          <g key={i}>
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={color} strokeWidth={1 / zoom} />
            <rect x={mx - w / 2} y={my - 9 / zoom} width={w} height={18 / zoom} rx={4 / zoom} fill={color} />
            <text x={mx} y={my + 4 / zoom} fontSize={11 / zoom} fill="#fff" textAnchor="middle" fontFamily="Inter Variable, system-ui, sans-serif">{label}</text>
          </g>
        );
      })}
    </g>
  );
}

function Laser({ points, zoom }) {
  if (points.length < 2) return null;
  const now = performance.now();
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].start) continue;
    const age = (now - points[i].t) / 1200;
    if (age >= 1) continue;
    segs.push(<line key={i} x1={points[i - 1].x} y1={points[i - 1].y} x2={points[i].x} y2={points[i].y} stroke="#ff2d55" strokeWidth={(5 * (1 - age) + 1) / zoom} strokeLinecap="round" opacity={1 - age} />);
  }
  return <g pointerEvents="none">{segs}</g>;
}

function Peers({ peers, pageId, vp }) {
  return Object.entries(peers)
    .filter(([, p]) => p.pageId === pageId)
    .map(([id, p]) => {
      const s = toScreen(vp, p);
      return (
        <g key={id} transform={`translate(${s.x} ${s.y})`} pointerEvents="none">
          <path d="M0 0 L0 16 L4.5 12 L8 19 L10.5 18 L7 11 L13 11 Z" fill={p.color} stroke="#fff" strokeWidth={1} />
          <rect x={12} y={18} width={Math.max(30, (p.name?.length ?? 5) * 7 + 12)} height={20} rx={6} fill={p.color} />
          <text x={18} y={32} fontSize={12} fill="#fff" fontFamily="Inter Variable, system-ui, sans-serif">
            {p.name}
          </text>
        </g>
      );
    });
}

export function Canvas({ controller, onReady }) {
  const editor = useEditor();
  const ui = useUi();
  const board = useEditorState((s) => s.board);
  const pageId = useEditorState((s) => s.pageId);
  const viewports = useEditorState((s) => s.viewports);
  const selectedIds = useEditorState((s) => s.selectedIds);
  const tool = useEditorState((s) => s.tool);
  const guides = useEditorState((s) => s.guides);
  const marquee = useEditorState((s) => s.marquee);
  const bindingHint = useEditorState((s) => s.bindingHint);
  const erasing = useEditorState((s) => s.erasing);
  const laser = useEditorState((s) => s.laser);
  const penDraft = useEditorState((s) => s.penDraft);
  const cursorWorld = useEditorState((s) => s.cursorWorld);
  const editingTextId = useEditorState((s) => s.editingTextId);
  const editingGroupId = useEditorState((s) => s.editingGroupId);
  const editingPathId = useEditorState((s) => s.editingPathId);
  const croppingId = useEditorState((s) => s.croppingId);
  const peers = useEditorState((s) => s.peers);
  const prefs = useEditorState((s) => s.prefs);
  const style = useEditorState((s) => s.style);
  const { isDark } = useTheme();
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [hoverCursor, setHoverCursor] = useState(null);
  const [gaps, setGaps] = useState(null);

  const page = board.pages.find((p) => p.id === pageId) ?? board.pages[0];
  const vp = viewports[pageId] ?? DEFAULT_VIEWPORT;
  const pageBg = page.background ?? "#ffffff";

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    const onWheel = (e) => controller.wheel(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    onReady?.(() => el.getBoundingClientRect());
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [controller, onReady]);

  useEffect(() => {
    if (!laser.length) return undefined;
    const id = requestAnimationFrame(() => {
      const now = performance.now();
      editor.set({ laser: editor.state.laser.filter((l) => now - l.t < 1200) });
    });
    return () => cancelAnimationFrame(id);
  }, [laser, editor]);

  const visible = useMemo(() => viewRect(vp, size, 100), [vp, size]);

  const erasingSet = useMemo(() => new Set(erasing), [erasing]);
  const selected = useMemo(() => {
    const ids = new Set(selectedIds);
    return page.elements.filter((e) => ids.has(e.id));
  }, [page.elements, selectedIds]);

  const onPointerDown = (e) => {
    if (editor.state.editingTextId || editor.state.editingCell) return;
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    e.currentTarget.setPointerCapture(e.pointerId);
    controller.pointerDown(e);
  };
  const onPointerMove = (e) => {
    controller.pointerMove(e);
    if (e.altKey && !controller.dragging && editor.state.selectedIds.length) {
      const r = wrapRef.current.getBoundingClientRect();
      const hit = hitElement(editor, toWorld(editor.viewport, { x: e.clientX - r.left, y: e.clientY - r.top }));
      const sel = editor.selected;
      const next = hit && !editor.state.selectedIds.includes(hit.id) ? measureGaps(unionBounds(sel.map(elementBounds)), elementBounds(hit)) : null;
      setGaps(next);
    } else if (gaps) setGaps(null);
    if (!controller.dragging && editor.state.tool === "select") {
      const r = wrapRef.current.getBoundingClientRect();
      const p = toWorld(editor.viewport, { x: e.clientX - r.left, y: e.clientY - r.top });
      const h = handleAt(getHandles(editor.selected, editor.viewport.zoom), p, editor.viewport.zoom);
      const next = h ? (h.kind === "resize" ? CURSORS[h.handle] : h.kind === "rotate" ? "grab" : "move") : null;
      if (next !== hoverCursor) setHoverCursor(next);
    }
  };
  const onDrop = async (e) => {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const p = toWorld(editor.viewport, { x: e.clientX - r.left, y: e.clientY - r.top });
    const lib = e.dataTransfer.getData("application/x-yac-canvas");
    if (lib) return ui.insertLibraryItem(JSON.parse(lib), p);
    for (const file of e.dataTransfer.files) await ui.dropFile(file, p);
    return undefined;
  };

  const cursor = controller.spaceDown ? "grab" : hoverCursor ?? TOOL_CURSORS[tool] ?? "crosshair";
  const z = vp.zoom;

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-clip" style={{ cursor, background: isDark ? "#121212" : pageBg }} data-testid="canvas">
      <svg
        width={size.width}
        height={size.height}
        className="block touch-none select-none"
        onPointerDown={onPointerDown}
        onMouseDown={(e) => e.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={controller.pointerUp}
        onPointerCancel={controller.cancel}
        onDoubleClick={controller.doubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          const r = wrapRef.current.getBoundingClientRect();
          const hit = hitElement(editor, toWorld(editor.viewport, { x: e.clientX - r.left, y: e.clientY - r.top }));
          if (!hit) editor.set({ selectedIds: [] });
          else if (!editor.state.selectedIds.includes(hit.id)) editor.select([hit.id]);
          ui.openContextMenu(e);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        role="application"
        aria-label={COPY.LABELS.CANVAS}
      >
        <defs>
          <filter id="yc-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.18" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill={pageBg} style={isDark ? { filter: DARK_FILTER } : undefined} />
        <Grid vp={vp} size={prefs.gridSize} mode={page.grid ?? "dots"} dark={isDark} />
        <g transform={`scale(${z}) translate(${vp.scrollX} ${vp.scrollY})`}>
          <g className={isDark ? "yc-dark" : undefined} style={isDark ? { filter: DARK_FILTER } : undefined}>
            <SceneTree elements={page.elements} files={board.files} bg={pageBg} zoom={vp.zoom} visible={visible} editingTextId={editingTextId} faded={erasingSet} />
          </g>
          {croppingId ? <CropGhost el={page.elements.find((e) => e.id === croppingId)} files={board.files} zoom={z} /> : null}
          {editingPathId ? <PathNodes el={page.elements.find((e) => e.id === editingPathId)} zoom={z} /> : null}
          <SelectionOverlay selected={editingPathId ? [] : selected} zoom={z} editingGroup={editingGroupId} elements={page.elements} />
          <LinkBadges elements={page.elements} zoom={z} />
          <BindingHint hint={bindingHint} elements={page.elements} zoom={z} />
          {guides.map((g, i) => (
            <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#e8590c" strokeWidth={1 / z} strokeDasharray={`${3 / z} ${3 / z}`} pointerEvents="none" />
          ))}
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(109,94,252,0.08)" stroke="#6d5efc" strokeWidth={1 / z} pointerEvents="none" />}
          <PenDraft draft={penDraft} cursor={cursorWorld} zoom={z} stroke={style.stroke} />
          <Laser points={laser} zoom={z} />
          <Measures gaps={gaps} zoom={z} />
        </g>
        <Peers peers={peers} pageId={pageId} vp={vp} />
      </svg>
      <CommentLayer vp={vp} page={page} />
      <TextEditor vp={vp} page={page} />
    </div>
  );
}
