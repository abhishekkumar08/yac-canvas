import { createElement, newId } from "../elements.js";
import { SHAPES } from "../shapes.js";
import { linearWorldPoints } from "../geometry.js";
import { setConnectorPoints, resolveConnector } from "../connectors.js";

const IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

const TAG = /<([A-Za-z_][\w:.-]*)/y;
const ATTR = /\s*([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
const TAG_END = /\s*(\/?)>/y;

export function parseXml(src) {
  const root = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const need = (idx) => {
    if (idx < 0) throw new Error("The XML is not well formed.");
    return idx;
  };
  let i = 0;
  while (i < src.length) {
    const top = stack.at(-1);
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      top.text += decodeEntities(src.slice(i));
      break;
    }
    top.text += decodeEntities(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) i = need(src.indexOf("-->", lt)) + 3;
    else if (src.startsWith("<![CDATA[", lt)) {
      const end = need(src.indexOf("]]>", lt));
      top.text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src[lt + 1] === "?" || src[lt + 1] === "!") i = need(src.indexOf(">", lt)) + 1;
    else if (src[lt + 1] === "/") {
      const gt = need(src.indexOf(">", lt));
      const name = src.slice(lt + 2, gt).trim();
      const at = stack.map((n) => n.tag).lastIndexOf(name);
      if (at < 1) throw new Error(`Unexpected closing tag </${name}>.`);
      stack.length = at;
      i = gt + 1;
    } else {
      TAG.lastIndex = lt;
      const m = TAG.exec(src);
      if (!m) throw new Error("The XML is not well formed.");
      const node = { tag: m[1], attrs: {}, children: [], text: "" };
      let pos = TAG.lastIndex;
      for (;;) {
        ATTR.lastIndex = pos;
        const a = ATTR.exec(src);
        if (!a) break;
        node.attrs[a[1]] = decodeEntities(a[2] ?? a[3]);
        pos = ATTR.lastIndex;
      }
      TAG_END.lastIndex = pos;
      const end = TAG_END.exec(src);
      if (!end) throw new Error(`The XML tag <${node.tag}> is not well formed.`);
      top.children.push(node);
      if (!end[1]) stack.push(node);
      i = TAG_END.lastIndex;
    }
  }
  if (stack.length > 1) throw new Error(`The XML tag <${stack.at(-1).tag}> is never closed.`);
  return root;
}

const find = (node, tag) => node.children.find((c) => c.tag === tag);
const findDeep = (node, tag) => {
  if (node.tag === tag) return node;
  for (const c of node.children) {
    const hit = findDeep(c, tag);
    if (hit) return hit;
  }
  return null;
};

async function inflate(b64) {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const text = await new Response(stream).text();
  return decodeURIComponent(text);
}

function parseStyle(s = "") {
  const style = {};
  const names = [];
  for (const part of s.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq < 0) names.push(p);
    else style[p.slice(0, eq)] = p.slice(eq + 1);
  }
  if (style.shape) names.unshift(style.shape);
  return { style, names };
}

export function htmlToText(html) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(div|p|li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text).replace(/^\n+/, "");
}

const KIND_IN = { cylinder: "database", cylinder3: "database", datastore: "database", process: "process", document: "document", parallelogram: "parallelogram", hexagon: "hexagon", triangle: "triangle", cloud: "cloud", step: "step", note: "note", card: "card", callout: "callout" };
const KIND_OUT = { database: "cylinder3" };
const HEAD_IN = { classic: "triangle", classicThin: "triangle", block: "triangle", blockThin: "triangle", open: "arrow", openThin: "arrow", oval: "dot", diamond: "diamond", diamondThin: "diamond", dash: "bar", none: null };
const HEAD_OUT = { triangle: "block", arrow: "open", dot: "oval", diamond: "diamond", bar: "dash" };
const FONT_OUT = { hand: "Architects Daughter", sans: "Helvetica", mono: "Courier New" };
const FILL_STYLES = new Set(["hachure", "cross-hatch", "solid", "dots", "zigzag"]);

const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const colour = (v, d) => (v === "none" ? "transparent" : !v || v === "default" ? d : v);
const fontIn = (f = "") => (/courier|mono|consol/i.test(f) ? "mono" : /architects|comic|virgil|hand|kalam|caveat/i.test(f) ? "hand" : "sans");
const kindOf = (name) => {
  const k = name.replace(/^mxgraph\.(flowchart|basic)\./, "").replace(/_/g, "-");
  return KIND_IN[k] ?? (SHAPES[k] ? k : null);
};

function vertexType(names, style) {
  const has = (n) => names.includes(n);
  if (has("group")) return { type: "group" };
  if (has("swimlane") || style.container === "1") return { type: "frame" };
  if (has("text") || has("edgeLabel")) return { type: "text" };
  if (has("image") || style.image) return { type: "image" };
  if (has("ellipse") || has("doubleEllipse")) return { type: "ellipse" };
  if (has("rhombus")) return { type: "diamond" };
  for (const n of names) {
    const kind = kindOf(n);
    if (kind) return { type: "shape", kind };
  }
  return { type: "rect" };
}

function cellText(cell, style) {
  const v = cell.attrs.value ?? cell.attrs.label ?? "";
  return style.html === "1" ? htmlToText(v) : v;
}

function styleProps(style, text) {
  const sketch = style.sketch === "1";
  const dashed = style.dashed === "1";
  return {
    stroke: colour(style.strokeColor, "#000000"),
    strokeWidth: num(style.strokeWidth, 1),
    strokeStyle: dashed ? (/^1\s/.test(style.dashPattern ?? "") ? "dotted" : "dashed") : "solid",
    roughness: sketch ? 1 : 0,
    opacity: Math.min(100, Math.max(0, num(style.opacity, 100))),
    fontSize: num(style.fontSize, 12),
    fontFamily: fontIn(style.fontFamily),
    textAlign: ["left", "center", "right"].includes(style.align) ? style.align : "center",
    verticalAlign: ["top", "middle", "bottom"].includes(style.verticalAlign) ? style.verticalAlign : "middle",
    textColor: style.fontColor && style.fontColor !== "none" && style.fontColor !== "default" ? style.fontColor : null,
    text,
  };
}

function pointOf(node) {
  return node ? { x: num(node.attrs.x, 0), y: num(node.attrs.y, 0) } : null;
}

function buildPage(model, files) {
  const rootNode = find(model, "root") ?? model;
  const cells = rootNode.children.filter((c) => c.tag === "mxCell" || ((c.tag === "object" || c.tag === "UserObject") && find(c, "mxCell")));
  const norm = cells.map((c) => {
    if (c.tag === "mxCell") return c;
    const inner = find(c, "mxCell");
    return { ...inner, attrs: { ...inner.attrs, id: c.attrs.id, value: c.attrs.label ?? inner.attrs.value } };
  });
  const byCell = new Map(norm.map((c) => [c.attrs.id, c]));
  const roots = new Set(norm.filter((c) => !c.attrs.parent).map((c) => c.attrs.id));
  const origins = new Set([...roots, ...norm.filter((c) => roots.has(c.attrs.parent)).map((c) => c.attrs.id)]);
  const info = new Map(norm.map((c) => [c.attrs.id, { cell: c, ...parseStyle(c.attrs.style) }]));
  for (const v of info.values()) v.kind = v.cell.attrs.edge === "1" ? { type: "edge" } : vertexType(v.names, v.style);

  const absCache = new Map();
  const abs = (id, seen = new Set()) => {
    if (!id || origins.has(id) || !byCell.has(id) || seen.has(id)) return { x: 0, y: 0 };
    if (absCache.has(id)) return absCache.get(id);
    seen.add(id);
    const c = byCell.get(id);
    const g = pointOf(find(c, "mxGeometry")) ?? { x: 0, y: 0 };
    const p = c.attrs.edge === "1" ? { x: 0, y: 0 } : abs(c.attrs.parent, seen);
    const r = { x: g.x + p.x, y: g.y + p.y };
    absCache.set(id, r);
    return r;
  };
  const ancestors = (id) => {
    const out = [];
    const seen = new Set();
    for (let p = byCell.get(id)?.attrs.parent; p && !origins.has(p) && byCell.has(p) && !seen.has(p); p = byCell.get(p).attrs.parent) {
      seen.add(p);
      out.push(p);
    }
    return out;
  };
  const groupIds = new Map();
  const groupOf = (id) => (groupIds.has(id) ? groupIds.get(id) : groupIds.set(id, newId()).get(id));

  const isVertex = (c) => !origins.has(c.attrs.id) && c.attrs.vertex === "1";
  const isEdgeLabel = (c) => info.get(c.attrs.parent)?.kind.type === "edge";
  const ids = new Map(norm.filter((c) => isVertex(c) && !isEdgeLabel(c) && info.get(c.attrs.id).kind.type !== "group").map((c) => [c.attrs.id, newId()]));
  const els = [];
  const edgeLabels = new Map();
  for (const c of norm) {
    const id = c.attrs.id;
    if (!isVertex(c)) continue;
    const { style, kind } = info.get(id);
    const text = cellText(c, style);
    if (isEdgeLabel(c)) {
      if (text) edgeLabels.set(c.attrs.parent, text);
      continue;
    }
    if (!ids.has(id)) continue;
    const geo = find(c, "mxGeometry");
    const p = abs(id);
    const up = ancestors(id);
    const frameAncestor = kind.type === "frame" ? null : up.find((a) => info.get(a)?.kind.type === "frame");
    const props = {
      id: ids.get(id),
      x: p.x,
      y: p.y,
      w: Math.max(0, num(geo?.attrs.width, 0)),
      h: Math.max(0, num(geo?.attrs.height, 0)),
      angle: (num(style.rotation, 0) * Math.PI) / 180,
      groupIds: up.filter((a) => info.get(a)?.kind.type === "group").map(groupOf),
      frameId: frameAncestor ? ids.get(frameAncestor) ?? null : null,
      ...styleProps(style, text),
    };
    const fill = colour(style.fillColor, "#ffffff");
    if (kind.type === "frame") {
      els.push(createElement("frame", { id: props.id, x: props.x, y: props.y, w: props.w, h: props.h, angle: props.angle, name: text || "Frame", groupIds: props.groupIds }));
    } else if (kind.type === "text") {
      els.push(createElement("text", { ...props, stroke: props.textColor ?? "#000000", textColor: null, fill: "transparent", autoSize: false }));
    } else if (kind.type === "image") {
      const url = (style.image ?? "").replace(/^data:([^;,]+),/, "data:$1;base64,");
      let fileId = null;
      if (IMAGE_DATA.test(url)) {
        fileId = newId();
        files[fileId] = url;
      }
      els.push(createElement("image", { ...props, fileId, stroke: "transparent", strokeWidth: 0, fill: "transparent" }));
    } else {
      const extra = {
        fill,
        fillStyle: style.sketch === "1" && FILL_STYLES.has(style.fillStyle) ? style.fillStyle : "solid",
        ...(kind.kind ? { kind: kind.kind } : {}),
        radius: kind.type === "rect" && style.rounded === "1" ? 12 : 0,
      };
      els.push(createElement(kind.type, { ...props, ...extra }));
    }
  }

  const byId = new Map(els.map((e) => [e.id, e]));
  const connectors = [];
  for (const c of norm) {
    const id = c.attrs.id;
    if (c.attrs.edge !== "1") continue;
    const { style } = info.get(id);
    const geo = find(c, "mxGeometry");
    const off = abs(c.attrs.parent);
    const shift = (pt) => pt && { x: pt.x + off.x, y: pt.y + off.y };
    const geoPoint = (as) => shift(pointOf(geo?.children.find((n) => n.tag === "mxPoint" && n.attrs.as === as)));
    const arr = geo?.children.find((n) => n.tag === "Array" && n.attrs.as === "points");
    const waypoints = (arr?.children ?? []).filter((n) => n.tag === "mxPoint").map((n) => shift(pointOf(n)));
    const bind = (cellId, fxKey, fyKey) => {
      const elId = ids.get(cellId);
      if (!elId) return null;
      if (style[fxKey] !== undefined && style[fyKey] !== undefined) return { id: elId, fx: num(style[fxKey], 0.5), fy: num(style[fyKey], 0.5), fixed: true };
      return { id: elId, fx: 0.5, fy: 0.5, fixed: false };
    };
    const startBinding = bind(c.attrs.source, "exitX", "exitY");
    const endBinding = bind(c.attrs.target, "entryX", "entryY");
    const centre = (b) => b && { x: byId.get(b.id).x + byId.get(b.id).w / 2, y: byId.get(b.id).y + byId.get(b.id).h / 2 };
    const s = centre(startBinding) ?? geoPoint("sourcePoint");
    const e = centre(endBinding) ?? geoPoint("targetPoint");
    if (!s || !e) continue;
    const startArrow = style.startArrow in HEAD_IN ? HEAD_IN[style.startArrow] : style.startArrow ? "arrow" : null;
    const endArrow = style.endArrow === undefined ? "triangle" : style.endArrow in HEAD_IN ? HEAD_IN[style.endArrow] : "arrow";
    const routing = /orthogonal|elbow|entityRelation/i.test(style.edgeStyle ?? "") ? "elbow" : style.curved === "1" ? "curved" : "straight";
    const sp = styleProps(style, cellText(c, style) || edgeLabels.get(id) || "");
    const conn = createElement(startArrow || endArrow ? "arrow" : "line", { ...sp, routing, startBinding, endBinding, startArrow, endArrow });
    connectors.push(setConnectorPoints(conn, [s, ...waypoints, e]));
  }
  return [...els, ...connectors.map((conn) => (conn.startBinding || conn.endBinding ? resolveConnector(conn, byId) : conn))];
}

export async function importDrawio(xmlString) {
  const doc = parseXml(String(xmlString));
  const files = {};
  const mxfile = find(doc, "mxfile");
  if (!mxfile) {
    const model = findDeep(doc, "mxGraphModel");
    if (!model) throw new Error("This is not a draw.io file.");
    return { pages: [{ name: "Page 1", elements: buildPage(model, files) }], files };
  }
  const pages = [];
  for (const [i, d] of mxfile.children.filter((c) => c.tag === "diagram").entries()) {
    let model = find(d, "mxGraphModel");
    if (!model && d.text.trim()) {
      let xml;
      try {
        xml = await inflate(d.text.trim());
      } catch {
        throw new Error(`Page ${i + 1} of the draw.io file could not be decompressed.`);
      }
      model = findDeep(parseXml(xml), "mxGraphModel");
    }
    if (model) pages.push({ name: d.attrs.name || `Page ${i + 1}`, elements: buildPage(model, files) });
  }
  if (!pages.length) throw new Error("The draw.io file has no diagrams.");
  return { pages, files };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#xa;");
const r2 = (n) => Math.round(n * 100) / 100;
const col = (c) => (!c || c === "transparent" ? "none" : c);

function commonStyle(el) {
  const s = [
    `strokeColor=${col(el.stroke)}`,
    `strokeWidth=${el.strokeWidth ?? 1}`,
    `fontSize=${el.fontSize ?? 12}`,
    `fontFamily=${FONT_OUT[el.fontFamily] ?? "Helvetica"}`,
  ];
  if (el.textColor) s.push(`fontColor=${el.textColor}`);
  if (el.strokeStyle === "dashed") s.push("dashed=1");
  if (el.strokeStyle === "dotted") s.push("dashed=1", "dashPattern=1 4");
  if ((el.opacity ?? 100) < 100) s.push(`opacity=${el.opacity}`, `textOpacity=${el.opacity}`);
  if (el.roughness) s.push("sketch=1", `fillStyle=${el.fillStyle ?? "hachure"}`);
  return s;
}

function vertexStyle(el, files) {
  const s = [];
  if (el.type === "ellipse") s.push("ellipse");
  else if (el.type === "diamond") s.push("rhombus");
  else if (el.type === "text") s.push("text");
  else if (el.type === "frame") s.push("swimlane", "startSize=24", "container=1");
  else if (el.type === "image") {
    s.push("shape=image", "imageAspect=0");
    const url = files?.[el.fileId];
    if (url) s.push(`image=${url.replace(";base64,", ",")}`);
  } else if (el.type === "shape") s.push(`shape=${KIND_OUT[el.kind] ?? el.kind}`);
  s.push("whiteSpace=wrap", `rounded=${el.radius ? 1 : 0}`, `align=${el.textAlign ?? "center"}`, `verticalAlign=${el.verticalAlign ?? "middle"}`);
  s.push(`fillColor=${el.type === "text" ? "none" : col(el.fill)}`, ...commonStyle(el));
  if (el.type === "text" && !el.textColor && el.stroke && el.stroke !== "transparent") s.push(`fontColor=${el.stroke}`);
  if (el.angle) s.push(`rotation=${r2((el.angle * 180) / Math.PI)}`);
  return s.join(";") + ";";
}

const VERTEX = new Set(["rect", "ellipse", "diamond", "shape", "text", "sticky", "frame", "image", "table"]);
const EDGE = new Set(["arrow", "line", "freedraw"]);

function pageXml(page, files) {
  const els = page.elements;
  const frames = new Map(els.filter((e) => e.type === "frame").map((e) => [e.id, e]));
  const out = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];
  const vertices = [...els.filter((e) => e.type === "frame"), ...els.filter((e) => VERTEX.has(e.type) && e.type !== "frame")];
  const exported = new Set(vertices.map((e) => e.id));
  for (const el of vertices) {
    const frame = el.type !== "frame" && el.frameId ? frames.get(el.frameId) : null;
    const x = frame ? el.x - frame.x : el.x;
    const y = frame ? el.y - frame.y : el.y;
    const text = el.type === "frame" ? el.name ?? "" : el.type === "table" && Array.isArray(el.cells) ? el.cells.map((r) => r.join("\t")).join("\n") : el.text ?? "";
    out.push(
      `<mxCell id="${esc(el.id)}" value="${esc(text)}" style="${esc(vertexStyle(el, files))}" vertex="1" parent="${frame ? esc(frame.id) : "1"}">` +
        `<mxGeometry x="${r2(x)}" y="${r2(y)}" width="${r2(el.w)}" height="${r2(el.h)}" as="geometry" /></mxCell>`,
    );
  }
  for (const el of els.filter((e) => EDGE.has(e.type))) {
    const pts = linearWorldPoints(el);
    if (pts.length < 2) continue;
    const s = [
      el.routing === "elbow" ? "edgeStyle=orthogonalEdgeStyle" : "",
      el.routing === "curved" ? "curved=1" : "",
      `startArrow=${HEAD_OUT[el.startArrow] ?? "none"}`,
      `endArrow=${HEAD_OUT[el.endArrow] ?? "none"}`,
      "html=0",
      ...commonStyle(el),
    ].filter(Boolean);
    const sb = el.startBinding && exported.has(el.startBinding.id) ? el.startBinding : null;
    const eb = el.endBinding && exported.has(el.endBinding.id) ? el.endBinding : null;
    if (sb?.fixed) s.push(`exitX=${sb.fx}`, `exitY=${sb.fy}`);
    if (eb?.fixed) s.push(`entryX=${eb.fx}`, `entryY=${eb.fy}`);
    const mid = pts.slice(1, -1).map((p) => `<mxPoint x="${r2(p.x)}" y="${r2(p.y)}" />`).join("");
    out.push(
      `<mxCell id="${esc(el.id)}" value="${esc(el.text ?? "")}" style="${esc(s.join(";") + ";")}" edge="1" parent="1"${sb ? ` source="${esc(sb.id)}"` : ""}${eb ? ` target="${esc(eb.id)}"` : ""}>` +
        `<mxGeometry relative="1" as="geometry">` +
        `<mxPoint x="${r2(pts[0].x)}" y="${r2(pts[0].y)}" as="sourcePoint" />` +
        `<mxPoint x="${r2(pts.at(-1).x)}" y="${r2(pts.at(-1).y)}" as="targetPoint" />` +
        (mid ? `<Array as="points">${mid}</Array>` : "") +
        `</mxGeometry></mxCell>`,
    );
  }
  return `<mxGraphModel><root>${out.join("")}</root></mxGraphModel>`;
}

export function exportDrawio(board) {
  const diagrams = board.pages.map((p) => `<diagram id="${esc(p.id)}" name="${esc(p.name ?? "Page")}">${pageXml(p, board.files)}</diagram>`);
  return `<mxfile host="yac-canvas" type="device">${diagrams.join("")}</mxfile>`;
}
