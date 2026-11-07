import { useMemo, useRef } from "react";
import { useEditor, useEditorState, useUi } from "@/store/EditorContext.jsx";
import { DEFAULT_VIEWPORT } from "@/store/editor.js";
import { elementBounds, unionBounds } from "@/engine/geometry.js";
import { toWorld, viewRect } from "@/engine/viewport.js";
import { COPY } from "@/ui/copy.js";

const W = 200;
const H = 130;

export function Minimap() {
  const editor = useEditor();
  const ui = useUi();
  const board = useEditorState((s) => s.board);
  const pageId = useEditorState((s) => s.pageId);
  const vp = useEditorState((s) => s.viewports[s.pageId] ?? DEFAULT_VIEWPORT);
  const dragging = useRef(false);
  const page = board.pages.find((p) => p.id === pageId) ?? board.pages[0];
  const rect = ui.getRect();
  const view = useMemo(() => viewRect(vp, { width: rect.width, height: rect.height }), [vp, rect.width, rect.height]);
  const boxes = useMemo(() => page.elements.filter((e) => !e.hidden).map((e) => ({ id: e.id, frame: e.type === "frame", ...elementBounds(e) })), [page.elements]);
  const world = unionBounds([view, ...boxes]);
  const pad = 20;
  const scale = Math.min((W - 8) / (world.w + pad * 2), (H - 8) / (world.h + pad * 2));
  const ox = (W - (world.w + pad * 2) * scale) / 2 - (world.x - pad) * scale;
  const oy = (H - (world.h + pad * 2) * scale) / 2 - (world.y - pad) * scale;
  const rects = useMemo(
    () =>
      boxes.map((b) => (
        <rect key={b.id} x={b.x} y={b.y} width={Math.max(b.w, 1 / scale)} height={Math.max(b.h, 1 / scale)} className={b.frame ? "fill-surface stroke-line-strong" : "fill-fg-muted"} opacity={b.frame ? 1 : 0.45} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      )),
    [boxes, scale],
  );
  const centerOn = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left - ox) / scale;
    const wy = (e.clientY - r.top - oy) / scale;
    editor.setViewport({ scrollX: rect.width / 2 / vp.zoom - wx, scrollY: rect.height / 2 / vp.zoom - wy });
  };
  return (
    <div className="material-overlay pointer-events-auto absolute bottom-16 right-3 z-10 overflow-hidden rounded-card border border-line shadow-raised" data-testid="minimap">
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={COPY.LABELS.MINIMAP}
        className="block cursor-pointer"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          centerOn(e);
        }}
        onPointerMove={(e) => dragging.current && centerOn(e)}
        onPointerUp={() => {
          dragging.current = false;
        }}
      >
        <g transform={`translate(${ox} ${oy}) scale(${scale})`}>
          {rects}
        </g>
        <rect x={ox + view.x * scale} y={oy + view.y * scale} width={view.w * scale} height={view.h * scale} fill="rgba(109,94,252,0.12)" stroke="#6d5efc" strokeWidth={1.5} rx={2} />
      </svg>
    </div>
  );
}

function ticks(start, length, zoom) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const step = steps.find((s) => s * zoom >= 60) ?? 10000;
  const first = Math.ceil(start / step) * step;
  const out = [];
  for (let v = first; v <= start + length / zoom; v += step) out.push(v);
  return out;
}

export function Rulers({ top = 48 }) {
  const ui = useUi();
  const vp = useEditorState((s) => s.viewports[s.pageId] ?? DEFAULT_VIEWPORT);
  const selectedIds = useEditorState((s) => s.selectedIds);
  const editor = useEditor();
  const rect = ui.getRect();
  const origin = toWorld(vp, { x: 0, y: 0 });
  const sel = selectedIds.length ? unionBounds(editor.selected.map(elementBounds)) : null;
  const sx = (v) => (v + vp.scrollX) * vp.zoom;
  const sy = (v) => (v + vp.scrollY) * vp.zoom;
  return (
    <>
      <svg className="pointer-events-none absolute left-0 z-[15]" style={{ top }} width={rect.width} height={20} aria-hidden="true">
        <rect width="100%" height="20" className="fill-surface" />
        {sel && <rect x={sx(sel.x)} width={sel.w * vp.zoom} height={20} fill="rgba(109,94,252,0.18)" />}
        {ticks(origin.x, rect.width, vp.zoom).map((v) => (
          <g key={v} transform={`translate(${sx(v)} 0)`}>
            <line y1={12} y2={20} className="stroke-fg-muted" />
            <text x={3} y={10} fontSize={9} className="fill-fg-muted">{Math.round(v)}</text>
          </g>
        ))}
        <line y1={19.5} y2={19.5} x2="100%" className="stroke-line" />
      </svg>
      <svg className="pointer-events-none absolute left-0 z-[15]" style={{ top }} width={20} height={rect.height} aria-hidden="true">
        <rect width="20" height="100%" className="fill-surface" />
        {sel && <rect y={sy(sel.y) - top} width={20} height={sel.h * vp.zoom} fill="rgba(109,94,252,0.18)" />}
        {ticks(origin.y, rect.height, vp.zoom).map((v) => (
          <g key={v} transform={`translate(0 ${sy(v) - top})`}>
            <line x1={12} x2={20} className="stroke-fg-muted" />
            <text x={10} y={-3} fontSize={9} transform="rotate(-90 10 -3)" className="fill-fg-muted">{Math.round(v)}</text>
          </g>
        ))}
        <line x1={19.5} x2={19.5} y2="100%" className="stroke-line" />
      </svg>
    </>
  );
}
