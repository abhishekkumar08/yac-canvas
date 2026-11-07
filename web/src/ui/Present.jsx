import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Presentation, X } from "lucide-react";
import { EmptyState, IconButton } from "@kasumi/ui";
import { useEditorState } from "@/store/EditorContext.jsx";
import { descendantsOf } from "@/engine/scene.js";
import { elementBounds } from "@/engine/geometry.js";
import { linkAt, nextFrameId, parseLink, presentationFrames } from "@/engine/prototype.js";
import { SceneTree } from "@/render/SceneTree.jsx";
import { PRESENT_COPY as P } from "@/ui/copy-present.js";

const IDLE_MS = 2000;
const ENTER = {
  dissolve: [{ opacity: 0 }, { opacity: 1 }],
  "slide-left": [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
  "slide-right": [{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }],
};
const STEP = { ArrowRight: 1, " ": 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 };
const isFilled = (c) => c && c !== "transparent";
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Present({ startFrameId, onExit }) {
  const page = useEditorState((s) => s.board.pages.find((p) => p.id === s.pageId) ?? s.board.pages[0]);
  const files = useEditorState((s) => s.board.files);
  const frames = useMemo(() => presentationFrames(page), [page]);
  const [nav, setNav] = useState({ id: startFrameId, transition: "instant" });
  const [hoveredId, setHoveredId] = useState(null);
  const [barVisible, setBarVisible] = useState(true);
  const rootRef = useRef(null);
  const slideRef = useRef(null);
  const svgRef = useRef(null);
  const idle = useRef(null);

  const current = frames.find((f) => f.id === nav.id) ?? frames[0] ?? null;
  const index = current ? frames.indexOf(current) : -1;
  const scene = useMemo(() => {
    if (!current) return [];
    const inside = descendantsOf(page.elements, [current.id]);
    return page.elements.filter((e) => e.id === current.id || inside.has(e.id));
  }, [page, current]);
  const hovered = hoveredId ? scene.find((e) => e.id === hoveredId) : null;
  const bg = current && isFilled(current.fill) ? current.fill : page.background ?? "#ffffff";

  const go = useCallback((id, transition = "instant") => {
    if (!id) return;
    setHoveredId(null);
    setNav({ id, transition });
  }, []);

  const wake = useCallback(() => {
    setBarVisible(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setBarVisible(false), IDLE_MS);
  }, []);

  useEffect(() => {
    rootRef.current?.focus();
    wake();
    return () => clearTimeout(idle.current);
  }, [wake]);

  useLayoutEffect(() => {
    const keyframes = ENTER[nav.transition];
    if (keyframes && !reducedMotion()) slideRef.current?.animate(keyframes, { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  }, [nav]);

  useEffect(() => {
    const onKey = (e) => {
      wake();
      if ((e.key === " " || e.key === "Enter") && e.target instanceof Element && e.target.closest("button")) return;
      e.stopPropagation();
      const step = STEP[e.key];
      if (e.key === "Escape") onExit();
      else if (step) go(nextFrameId(frames, current?.id, step));
      else if (e.key === "Home") go(frames[0]?.id);
      else if (e.key === "End") go(frames.at(-1)?.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [frames, current, go, onExit, wake]);

  const worldPoint = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: current.x + ((e.clientX - r.left) / r.width) * current.w, y: current.y + ((e.clientY - r.top) / r.height) * current.h };
  };

  const onSlideClick = (e) => {
    const hit = linkAt(page.elements, current, worldPoint(e));
    const { kind, target } = parseLink(hit?.link);
    if (kind === "frame" && frames.some((f) => f.id === target)) go(target, hit.linkTransition ?? "instant");
    else if (kind === "url") window.open(target, "_blank", "noopener,noreferrer");
  };

  const hb = hovered ? elementBounds(hovered) : null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={P.DIALOG_LABEL}
      tabIndex={-1}
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden bg-black outline-none"
      onPointerMove={wake}
      data-testid="present"
    >
      {current ? (
        <div ref={slideRef} className="flex h-full w-full items-center justify-center">
          <svg
            ref={svgRef}
            viewBox={`${current.x} ${current.y} ${current.w} ${current.h}`}
            className="block select-none"
            style={{ width: `min(100vw, calc(100vh * ${current.w / current.h}))`, aspectRatio: `${current.w} / ${current.h}`, cursor: hovered ? "pointer" : "default" }}
            onPointerMove={(e) => setHoveredId(linkAt(page.elements, current, worldPoint(e))?.id ?? null)}
            onPointerLeave={() => setHoveredId(null)}
            onClick={onSlideClick}
            role="img"
            aria-label={current.name || P.UNTITLED_FRAME}
          >
            <rect x={current.x} y={current.y} width={current.w} height={current.h} fill={bg} />
            <SceneTree elements={scene} files={files} bg={bg} zoom={1} idPrefix="present" />
            {hb && (
              <rect
                x={hb.x - 2}
                y={hb.y - 2}
                width={hb.w + 4}
                height={hb.h + 4}
                rx={4}
                fill="rgba(109,94,252,0.08)"
                stroke="rgba(109,94,252,0.7)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
          </svg>
        </div>
      ) : (
        <div className="material-overlay max-w-md rounded-card border border-line p-6 shadow-overlay">
          <EmptyState icon={Presentation} title={P.EMPTY_TITLE} description={P.EMPTY_DESCRIPTION} action={onExit} actionLabel={P.EXIT} />
        </div>
      )}
      {current && (
        <div
          className={`material-overlay fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-card border border-line p-1 shadow-overlay transition-opacity duration-200 motion-reduce:transition-none ${barVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
          data-testid="present-bar"
        >
          <IconButton icon={ChevronLeft} label={P.PREVIOUS} variant="ghost" size="sm" disabled={index <= 0} onClick={() => go(nextFrameId(frames, current.id, -1))} />
          <span className="min-w-12 text-center text-caption tabular-nums text-fg" aria-live="polite">{P.COUNTER(index + 1, frames.length)}</span>
          <IconButton icon={ChevronRight} label={P.NEXT} variant="ghost" size="sm" disabled={index >= frames.length - 1} onClick={() => go(nextFrameId(frames, current.id, 1))} />
          <IconButton icon={X} label={P.EXIT} variant="ghost" size="sm" onClick={onExit} />
        </div>
      )}
    </div>
  );
}
