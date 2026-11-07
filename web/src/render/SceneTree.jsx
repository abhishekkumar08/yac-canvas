import { Fragment, useMemo, useRef } from "react";
import { frameTree } from "@/engine/scene.js";
import { elementBounds, rectsIntersect } from "@/engine/geometry.js";
import { ElementView } from "@/render/ElementView.jsx";

export function SceneTree({ elements, files, bg, zoom = 1, visible = null, editingTextId = null, faded = null, idPrefix = "clip" }) {
  const { roots, kids } = useMemo(() => frameTree(elements), [elements]);
  const viewCache = useRef(new Map());
  const seen = new Map();
  // Reusing the same React element for an unchanged shape lets React skip it without re-creating or comparing props.
  const viewFor = (el, shapes, z, fade) => {
    const hit = viewCache.current.get(el.id);
    const view =
      hit && hit.el === el && hit.files === files && hit.shapes === shapes && hit.bg === bg && hit.z === z && hit.fade === fade
        ? hit.view
        : <ElementView el={el} files={files} elements={shapes} bg={bg} zoom={z} faded={fade} />;
    seen.set(el.id, { el, files, shapes, bg, z, fade, view });
    return view;
  };
  const node = (el) => {
    if (el.hidden) return null;
    const isFrame = el.type === "frame";
    if (!isFrame && visible && !rectsIntersect(elementBounds(el), visible)) return null;
    let view = null;
    if (el.id !== editingTextId) {
      view = viewFor(el, el.type === "instance" ? elements : undefined, isFrame || el.type === "instance" ? zoom : 1, faded?.has(el.id));
    } else if (el.type !== "text") {
      view = <ElementView el={{ ...el, text: "" }} files={files} bg={bg} zoom={zoom} />;
    }
    const children = kids.get(el.id);
    if (!isFrame || !children?.length) return <Fragment key={el.id}>{view}</Fragment>;
    return (
      <Fragment key={el.id}>
        {view}
        <g clipPath={el.clip === false ? undefined : `url(#${idPrefix}-${el.id})`}>{children.map(node)}</g>
      </Fragment>
    );
  };
  const frames = elements.filter((e) => e.type === "frame" && e.clip !== false);
  const body = roots.map(node);
  viewCache.current = seen;
  return (
    <>
      <defs>
        {frames.map((f) => (
          <clipPath key={f.id} id={`${idPrefix}-${f.id}`}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.radius ?? 0} />
          </clipPath>
        ))}
      </defs>
      {body}
    </>
  );
}
