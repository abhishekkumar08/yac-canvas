import { memo } from "react";
import { COPY } from "@/ui/copy.js";
import { shapePath, shapeDetail, polyD } from "@/engine/shapes.js";
import { curvePath, connectorWorldPoints, labelPoint } from "@/engine/connectors.js";
import { localPolygon, center } from "@/engine/geometry.js";
import { ringsToD } from "@/engine/boolean.js";
import { instanceChildren } from "@/engine/components.js";
import { roughOptions, roughPaths, dash } from "@/render/rough.js";
import { wrapText, fontFor, LINE_HEIGHT, TEXT_PAD, measureText, textBox } from "@/render/text.js";

const deg = (rad) => (rad * 180) / Math.PI;
const flipOf = (el) => (el.flipX || el.flipY ? `translate(${el.flipX ? el.w : 0} ${el.flipY ? el.h : 0}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})` : undefined);
const isFilled = (el) => el.fill && el.fill !== "transparent";

function RoughPaths({ paths }) {
  return paths.map((p, i) => (
    <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? "none"} strokeLinecap="round" strokeLinejoin="round" />
  ));
}

function roundedRectD(w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!rr) return `M0 0 H${w} V${h} H0 Z`;
  return `M${rr} 0 H${w - rr} Q${w} 0 ${w} ${rr} V${h - rr} Q${w} ${h} ${w - rr} ${h} H${rr} Q0 ${h} 0 ${h - rr} V${rr} Q0 0 ${rr} 0 Z`;
}

function outlineD(el) {
  switch (el.type) {
    case "rect":
    case "sticky":
    case "frame":
    case "table":
    case "instance":
    case "image":
      return roundedRectD(el.w, el.h, el.radius ?? 0);
    case "ellipse":
      return `M0 ${el.h / 2} A${el.w / 2} ${el.h / 2} 0 1 0 ${el.w} ${el.h / 2} A${el.w / 2} ${el.h / 2} 0 1 0 0 ${el.h / 2} Z`;
    case "shape":
      return shapePath(el.kind, el.w, el.h);
    case "path": {
      const sx = el.w / (el.pw || 1);
      const sy = el.h / (el.ph || 1);
      return ringsToD((el.rings ?? []).map((r) => r.map(([x, y]) => [x * sx, y * sy])));
    }
    default:
      return polyD(localPolygon(el));
  }
}

function ShapeBody({ el }) {
  const d = outlineD(el);
  const detail = el.type === "shape" ? shapeDetail(el.kind, el.w, el.h) : "";
  const flat = ["sticky", "frame", "table", "instance", "image"].includes(el.type);
  if (flat || (!el.roughness && (el.fillStyle === "solid" || !isFilled(el)))) {
    const stroke = el.stroke === "transparent" ? "none" : el.stroke;
    const da = dash(el)?.join(" ");
    return (
      <>
        {d && (
          <path
            d={d}
            fill={isFilled(el) ? el.fill : "none"}
            fillRule="evenodd"
            stroke={stroke}
            strokeWidth={el.strokeWidth}
            strokeDasharray={da}
            strokeLinejoin="round"
          />
        )}
        {detail && <path d={detail} fill="none" stroke={stroke} strokeWidth={el.strokeWidth} strokeDasharray={da} strokeLinecap="round" />}
      </>
    );
  }
  const main = roughPaths(el, "body", (g) => {
    const o = roughOptions(el);
    if (el.type === "rect" && !el.radius) return g.rectangle(0, 0, el.w, el.h, o);
    if (el.type === "ellipse") return g.ellipse(el.w / 2, el.h / 2, el.w, el.h, o);
    return g.path(d, o);
  });
  const extra = detail ? roughPaths(el, "detail", (g) => g.path(detail, roughOptions(el, { fill: false }))) : [];
  return (
    <>
      <RoughPaths paths={main} />
      <RoughPaths paths={extra} />
    </>
  );
}

export function TextBlock({ el, box, color }) {
  if (!el.text) return null;
  const pad = el.type === "text" ? 0 : TEXT_PAD;
  const maxW = el.type === "text" && el.autoSize ? Infinity : Math.max(10, box.w - pad * 2);
  const lines = wrapText(el.text, maxW, el);
  const lh = el.fontSize * LINE_HEIGHT;
  const total = lines.length * lh;
  const valign = el.verticalAlign ?? "middle";
  const top = valign === "top" ? box.y + pad : valign === "bottom" ? box.y + box.h - pad - total : box.y + (box.h - total) / 2;
  const align = el.textAlign ?? "center";
  const x = align === "left" ? box.x + pad : align === "right" ? box.x + box.w - pad : box.x + box.w / 2;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  return (
    <text
      fontFamily={fontFor(el)}
      fontSize={el.fontSize}
      fontWeight={el.fontWeight ?? 400}
      fill={color ?? el.textColor ?? (el.stroke === "transparent" ? "#1e1e1e" : el.stroke)}
      textAnchor={anchor}
      style={{ whiteSpace: "pre" }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={top + i * lh + el.fontSize * 0.95}>
          {line || " "}
        </tspan>
      ))}
    </text>
  );
}

export function arrowHead(kind, tip, from, sw) {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const size = Math.max(10, sw * 4.5);
  const at = (a, len) => ({ x: tip.x - len * Math.cos(angle + a), y: tip.y - len * Math.sin(angle + a) });
  switch (kind) {
    case "arrow":
      return { d: `M${at(0.45, size).x} ${at(0.45, size).y} L${tip.x} ${tip.y} L${at(-0.45, size).x} ${at(-0.45, size).y}`, fill: false };
    case "triangle":
      return { d: `M${tip.x} ${tip.y} L${at(0.4, size).x} ${at(0.4, size).y} L${at(-0.4, size).x} ${at(-0.4, size).y} Z`, fill: true };
    case "diamond": {
      const back = at(0, size * 1.4);
      return { d: `M${tip.x} ${tip.y} L${at(0.35, size * 0.75).x} ${at(0.35, size * 0.75).y} L${back.x} ${back.y} L${at(-0.35, size * 0.75).x} ${at(-0.35, size * 0.75).y} Z`, fill: true };
    }
    case "dot": {
      const r = size / 3;
      const c = at(0, r);
      return { d: `M${c.x - r} ${c.y} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`, fill: true };
    }
    case "bar": {
      const a = { x: tip.x + (size / 2) * Math.cos(angle + Math.PI / 2), y: tip.y + (size / 2) * Math.sin(angle + Math.PI / 2) };
      const b = { x: tip.x - (size / 2) * Math.cos(angle + Math.PI / 2), y: tip.y - (size / 2) * Math.sin(angle + Math.PI / 2) };
      return { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, fill: false };
    }
    default:
      return null;
  }
}

function LinearBody({ el, bg }) {
  const pts = el.type === "freedraw" ? null : connectorWorldPoints({ ...el, x: 0, y: 0 });
  if (el.type === "freedraw") {
    const p = el.points;
    let d = `M${p[0][0]} ${p[0][1]}`;
    if (p.length === 1) d += ` L${p[0][0] + 0.1} ${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2;
      const my = (p[i][1] + p[i + 1][1]) / 2;
      d += ` Q${p[i][0]} ${p[i][1]} ${mx} ${my}`;
    }
    if (p.length > 1) d += ` L${p.at(-1)[0]} ${p.at(-1)[1]}`;
    return <path d={d} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth * 1.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash(el)?.join(" ")} />;
  }
  const curved = el.routing === "curved" && pts.length > 2;
  const d = curved ? curvePath(pts) : `M${pts.map((p) => `${p.x} ${p.y}`).join(" L")}`;
  const heads = [];
  if (el.endArrow && pts.length > 1) heads.push(arrowHead(el.endArrow, pts.at(-1), pts.at(-2), el.strokeWidth));
  if (el.startArrow && pts.length > 1) heads.push(arrowHead(el.startArrow, pts[0], pts[1], el.strokeWidth));
  const body = el.roughness
    ? (
      <RoughPaths
        paths={roughPaths(el, "line", (g) => (curved ? g.path(d, roughOptions(el, { fill: false })) : g.linearPath(pts.map((p) => [p.x, p.y]), roughOptions(el, { fill: false }))))}
      />
    )
    : <path d={d} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} strokeDasharray={dash(el)?.join(" ")} strokeLinejoin="round" strokeLinecap="round" />;
  const label = el.text ? labelPoint({ ...el, x: 0, y: 0 }) : null;
  const size = el.text ? measureText(el.text, el) : null;
  return (
    <>
      {body}
      {heads.filter(Boolean).map((h, i) => (
        <path key={i} d={h.d} fill={h.fill ? el.stroke : "none"} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {label && (
        <>
          <rect x={label.x - size.w / 2 - 4} y={label.y - size.h / 2 - 2} width={size.w + 8} height={size.h + 4} fill={bg} rx={4} />
          <TextBlock el={{ ...el, textAlign: "center", verticalAlign: "middle" }} box={{ x: label.x - size.w / 2 - TEXT_PAD, y: label.y - size.h / 2 - TEXT_PAD, w: size.w + TEXT_PAD * 2, h: size.h + TEXT_PAD * 2 }} />
        </>
      )}
    </>
  );
}

function LayoutGrid({ el }) {
  const { columns, gutter, margin } = el.layoutGrid;
  const width = (el.w - margin * 2 - gutter * (columns - 1)) / columns;
  if (!(width > 0)) return null;
  return (
    <g pointerEvents="none">
      {Array.from({ length: columns }, (_, i) => (
        <rect key={i} x={margin + i * (width + gutter)} y={0} width={width} height={el.h} fill="#ff4d4f" opacity={0.08} />
      ))}
    </g>
  );
}

function TableBody({ el }) {
  const cw = el.w / el.cols;
  const rh = el.h / el.rows;
  const stroke = el.stroke === "transparent" ? "#868e96" : el.stroke;
  const lines = [];
  for (let c = 1; c < el.cols; c++) lines.push(`M${c * cw} 0 V${el.h}`);
  for (let r = 1; r < el.rows; r++) lines.push(`M0 ${r * rh} H${el.w}`);
  return (
    <>
      <rect width={el.w} height={el.h} fill={isFilled(el) ? el.fill : "none"} stroke={stroke} strokeWidth={el.strokeWidth} rx={el.radius ?? 0} />
      {el.header && <rect width={el.w} height={rh} fill={stroke} opacity={0.12} />}
      <path d={lines.join(" ")} stroke={stroke} strokeWidth={Math.max(1, el.strokeWidth / 2)} fill="none" />
      {el.cells.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <TextBlock
              key={`${r}-${c}`}
              el={{ ...el, text: cell, fontWeight: el.header && r === 0 ? 600 : 400, verticalAlign: "middle", textAlign: el.textAlign ?? "center" }}
              box={{ x: c * cw, y: r * rh, w: cw, h: rh }}
              color={el.textColor ?? (el.stroke === "transparent" ? "#1e1e1e" : el.stroke)}
            />
          ) : null,
        ),
      )}
    </>
  );
}

function Body({ el, files, elements, bg, zoom }) {
  switch (el.type) {
    case "text":
      return <TextBlock el={el} box={{ x: 0, y: 0, w: el.w, h: el.h }} color={el.textColor ?? el.stroke} />;
    case "image":
      if (files?.[el.fileId] && el.crop) {
        const fw = el.w / el.crop.w;
        const fh = el.h / el.crop.h;
        return (
          <g transform={flipOf(el)}>
            <svg width={el.w} height={el.h} overflow="hidden" style={{ clipPath: el.radius ? `inset(0 round ${el.radius}px)` : undefined }}>
              <image href={files[el.fileId]} x={-el.crop.x * fw} y={-el.crop.y * fh} width={fw} height={fh} preserveAspectRatio="none" />
            </svg>
          </g>
        );
      }
      return files?.[el.fileId] ? (
        <image href={files[el.fileId]} width={el.w} height={el.h} preserveAspectRatio="none" transform={flipOf(el)} style={{ clipPath: el.radius ? `inset(0 round ${el.radius}px)` : undefined }} />
      ) : (
        <rect width={el.w} height={el.h} fill="#e9ecef" stroke="#adb5bd" strokeDasharray="6 6" />
      );
    case "table":
      return <TableBody el={el} />;
    case "frame":
      return (
        <>
          <ShapeBody el={el} />
          {el.layoutGrid && <LayoutGrid el={el} />}
          <text x={0} y={-6 / zoom} fontSize={13 / zoom} fontFamily={fontFor({ fontFamily: "sans" })} fill={el.isComponent ? "#7048e8" : "#868e96"} fontWeight={500}>
            {el.isComponent ? "◆ " : ""}
            {el.name}
            {el.layout ? "  ⇶" : ""}
          </text>
        </>
      );
    case "instance": {
      const master = elements?.find((e) => e.id === el.componentId);
      const kids = master ? instanceChildren(elements, el) : [];
      return (
        <>
          <rect width={el.w} height={el.h} fill={master && isFilled(master) ? master.fill : "none"} stroke={master?.stroke ?? "#adb5bd"} strokeWidth={master?.strokeWidth ?? 1} rx={master?.radius ?? 0} />
          <text x={0} y={-6 / zoom} fontSize={13 / zoom} fontFamily={fontFor({ fontFamily: "sans" })} fill="#7048e8">
            ◇ {el.name ?? master?.name ?? COPY.LABELS.INSTANCE}
          </text>
          <g transform={`translate(${-el.x} ${-el.y})`}>
            {kids.map((k) => (
              <ElementView key={k.id} el={k} files={files} elements={elements} bg={bg} zoom={zoom} />
            ))}
          </g>
        </>
      );
    }
    default: {
      return (
        <>
          <g transform={flipOf(el)}>
            <ShapeBody el={el} />
          </g>
          <TextBlock el={el} box={textBox(el)} color={el.textColor ?? (el.type === "sticky" || el.stroke === "transparent" ? "#1e1e1e" : el.stroke)} />
        </>
      );
    }
  }
}

export const ElementView = memo(function ElementView({ el, files, elements, bg = "#ffffff", zoom = 1, faded = false }) {
  const linear = el.type === "line" || el.type === "arrow" || el.type === "freedraw";
  const c = center(el);
  const rotate = el.angle ? ` rotate(${deg(el.angle)} ${c.x - el.x} ${c.y - el.y})` : "";
  return (
    <g
      data-id={el.id}
      transform={`translate(${el.x} ${el.y})${linear && el.type !== "freedraw" ? "" : rotate}`}
      opacity={(el.opacity ?? 100) / 100 * (faded ? 0.3 : 1)}
      filter={el.shadow ? "url(#yc-shadow)" : undefined}
    >
      {linear ? <LinearBody el={el} bg={bg} /> : <Body el={el} files={files} elements={elements} bg={bg} zoom={zoom} />}
    </g>
  );
});
