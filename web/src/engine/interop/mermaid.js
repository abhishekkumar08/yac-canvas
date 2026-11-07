import { createElement, newId } from "../elements.js";
import { treeLayout } from "../layout.js";
import { resolveConnector, isConnector } from "../connectors.js";

const FONT = 16;
const PAD = 24;

const NODE_SHAPES = [
  ["(((", ")))", { type: "ellipse", circle: true }],
  ["([", "])", { type: "shape", kind: "terminator" }],
  ["[[", "]]", { type: "shape", kind: "predefined-process" }],
  ["[(", ")]", { type: "shape", kind: "database" }],
  ["((", "))", { type: "ellipse", circle: true }],
  ["{{", "}}", { type: "shape", kind: "hexagon" }],
  ["[/", "/]", { type: "shape", kind: "parallelogram" }],
  ["[/", "\\]", { type: "shape", kind: "trapezoid" }],
  ["[\\", "\\]", { type: "shape", kind: "parallelogram" }],
  ["[\\", "/]", { type: "shape", kind: "trapezoid" }],
  [">", "]", { type: "shape", kind: "step" }],
  ["{", "}", { type: "diamond" }],
  ["(", ")", { type: "rect", radius: 12 }],
  ["[", "]", { type: "rect" }],
].sort((a, b) => b[0].length - a[0].length);

const ID = /[\p{L}\p{N}_]+/uy;
const TEXT_LINK = /\s*(<)?(--|==|-\.)\s+([^>\-.=|\s][^\n]*?)\s*(-{2,}>|-{3,}|={2,}>|={3,}|\.-+>|\.-+)/y;
const PLAIN_LINK = /\s*(<)?(-{2,}|={2,}|-\.+-)(>|[ox](?=\s|$))?\s*(?:\|([^|]*)\|)?/y;
const AMP = /\s*&\s*/y;
const CLASS_SUFFIX = /:::([\w-]+)/y;

const cleanLabel = (s) =>
  s
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/^`([\s\S]*)`$/, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();

function sizeFor(label, fontSize = FONT) {
  const lines = label.split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { w: Math.max(80, Math.round(longest * fontSize * 0.6 + 32)), h: Math.max(44, Math.round(lines.length * fontSize * 1.4 + 20)) };
}

function parseCss(css) {
  const out = {};
  for (const part of css.split(",")) {
    const [k, ...rest] = part.split(":");
    const v = rest.join(":").trim();
    const key = k?.trim();
    if (!key || !v) continue;
    if (key === "fill") Object.assign(out, { fill: v, fillStyle: "solid" });
    else if (key === "stroke") out.stroke = v;
    else if (key === "stroke-width") out.strokeWidth = parseFloat(v) || 2;
    else if (key === "color") out.textColor = v;
    else if (key === "stroke-dasharray") out.strokeStyle = "dashed";
  }
  return out;
}

function statements(text) {
  const body = text.replace(/^\s*---\n[\s\S]*?\n---\s*\n/, "").replace(/%%\{[\s\S]*?\}%%/g, "");
  const out = [];
  body.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("%%")) return;
    for (const s of t.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)) if (s.trim()) out.push({ s: s.trim(), line: i + 1 });
  });
  return out;
}

function closeIndex(src, start, close) {
  if (src[start] === '"') {
    const q = src.indexOf('"', start + 1);
    return q < 0 ? -1 : src.indexOf(close, q + 1);
  }
  return src.indexOf(close, start);
}

function parseFlow(stmts) {
  const nodes = new Map();
  const edges = [];
  const subgraphs = [];
  const classDefs = {};
  const classOf = [];
  const styles = [];
  const stack = [];

  const touchNode = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: { type: "rect" }, explicit: false, sub: null, classes: [] });
    const n = nodes.get(id);
    if (stack.length) n.sub = stack.at(-1);
    return n;
  };

  for (const { s, line } of stmts.slice(1)) {
    let m;
    if ((m = /^subgraph\s+(.*)$/.exec(s))) {
      const raw = m[1].trim();
      const sm = /^([\p{L}\p{N}_-]+)\s*\[(.*)\]$/u.exec(raw);
      const sg = sm ? { id: sm[1], title: cleanLabel(sm[2]) } : { id: /^[\p{L}\p{N}_-]+$/u.test(raw) ? raw : newId(), title: cleanLabel(raw) };
      sg.parent = stack.at(-1) ?? null;
      subgraphs.push(sg);
      stack.push(sg.id);
      continue;
    }
    if (s === "end") {
      stack.pop();
      continue;
    }
    if (/^(direction|click|linkStyle|accTitle|accDescr|title)\b/.test(s)) continue;
    if ((m = /^classDef\s+(\S+)\s+(.+)$/.exec(s))) {
      for (const name of m[1].split(",")) classDefs[name] = parseCss(m[2]);
      continue;
    }
    if ((m = /^class\s+(\S+)\s+(\S+)$/.exec(s))) {
      for (const id of m[1].split(",")) classOf.push([id, m[2]]);
      continue;
    }
    if ((m = /^style\s+(\S+)\s+(.+)$/.exec(s))) {
      styles.push([m[1], parseCss(m[2])]);
      continue;
    }

    let pos = 0;
    const fail = () => {
      throw new Error(`Mermaid line ${line}: could not read "${s}".`);
    };
    const node = () => {
      ID.lastIndex = pos;
      const idm = ID.exec(s);
      if (!idm) fail();
      pos = ID.lastIndex;
      const n = touchNode(idm[0]);
      let best = null;
      for (const [o, c, shape] of NODE_SHAPES) {
        if (!s.startsWith(o, pos)) continue;
        if (best && o.length < best.o.length) break;
        const end = closeIndex(s, pos + o.length, c);
        if (end >= 0 && (!best || end < best.end)) best = { o, c, shape, end };
      }
      if (best) {
        n.label = cleanLabel(s.slice(pos + best.o.length, best.end));
        n.shape = best.shape;
        n.explicit = true;
        pos = best.end + best.c.length;
      }
      CLASS_SUFFIX.lastIndex = pos;
      const cm = CLASS_SUFFIX.exec(s);
      if (cm) {
        n.classes.push(cm[1]);
        pos = CLASS_SUFFIX.lastIndex;
      }
      return n.id;
    };
    const group = () => {
      const ids = [node()];
      for (;;) {
        AMP.lastIndex = pos;
        if (!AMP.exec(s)) return ids;
        pos = AMP.lastIndex;
        ids.push(node());
      }
    };
    const link = () => {
      TEXT_LINK.lastIndex = pos;
      let lm = TEXT_LINK.exec(s);
      if (lm) {
        pos = TEXT_LINK.lastIndex;
        const close = lm[4];
        return { start: !!lm[1], end: close.endsWith(">") ? ">" : null, dashed: lm[2] === "-.", thick: lm[2] === "==", label: cleanLabel(lm[3]) };
      }
      PLAIN_LINK.lastIndex = pos;
      lm = PLAIN_LINK.exec(s);
      if (!lm) return null;
      pos = PLAIN_LINK.lastIndex;
      return { start: !!lm[1], end: lm[3] ?? null, dashed: lm[2].includes("."), thick: lm[2][0] === "=", label: cleanLabel(lm[4] ?? "") };
    };

    let left = group();
    for (;;) {
      const l = link();
      if (!l) break;
      while (s[pos] === " ") pos++;
      const right = group();
      for (const a of left) for (const b of right) edges.push({ from: a, to: b, ...l });
      left = right;
    }
    if (s.slice(pos).trim()) fail();
  }
  return { nodes, edges, subgraphs, classDefs, classOf, styles };
}

const HEADS = { ">": "triangle", o: "dot", x: "bar" };

function flowchart(stmts, dir) {
  const { nodes, edges, subgraphs, classDefs, classOf, styles } = parseFlow(stmts);
  const sgIds = new Set(subgraphs.map((g) => g.id));
  for (const [id, n] of nodes) if (sgIds.has(id) && !n.explicit) nodes.delete(id);
  const frameIds = new Map(subgraphs.map((g) => [g.id, newId()]));
  const elIds = new Map([...nodes.keys()].map((id) => [id, newId()]));
  const target = (id) => elIds.get(id) ?? frameIds.get(id);
  const extra = new Map([...nodes.keys()].map((id) => [id, { ...(classDefs.default ?? {}) }]));
  for (const n of nodes.values()) for (const c of n.classes) Object.assign(extra.get(n.id), classDefs[c]);
  for (const [id, c] of classOf) if (extra.has(id)) Object.assign(extra.get(id), classDefs[c]);
  for (const [id, css] of styles) if (extra.has(id)) Object.assign(extra.get(id), css);

  let els = [];
  for (const n of nodes.values()) {
    let { w, h } = sizeFor(n.label);
    const { type, kind, radius, circle } = n.shape;
    if (circle) w = h = Math.max(w, h);
    if (type === "diamond") [w, h] = [Math.round(w * 1.4), Math.round(h * 1.6)];
    if (kind === "parallelogram" || kind === "trapezoid" || kind === "hexagon") w = Math.round(w * 1.3);
    els.push(createElement(type, { id: elIds.get(n.id), x: 0, y: 0, w, h, text: n.label, fontSize: FONT, ...(kind ? { kind } : {}), ...(radius ? { radius } : {}), ...extra.get(n.id) }));
  }
  for (const e of edges) {
    const sId = target(e.from);
    const tId = target(e.to);
    if (!sId || !tId) continue;
    const startArrow = e.start ? "triangle" : null;
    const endArrow = HEADS[e.end] ?? null;
    els.push(
      createElement(startArrow || endArrow ? "arrow" : "line", {
        points: [[0, 0], [1, 1]],
        startBinding: { id: sId, fx: 0.5, fy: 0.5, fixed: false },
        endBinding: { id: tId, fx: 0.5, fy: 0.5, fixed: false },
        startArrow,
        endArrow,
        text: e.label,
        fontSize: 14,
        strokeStyle: e.dashed ? "dashed" : "solid",
        strokeWidth: e.thick ? 4 : 2,
      }),
    );
  }

  const down = dir === "TD" || dir === "TB" || dir === "BT";
  els = treeLayout(els, [...elIds.values()], { direction: down ? "down" : "right", gapX: 60, gapY: 70 });
  const boxes = els.filter((e) => !isConnector(e));
  const flip = dir === "BT" ? "y" : dir === "RL" ? "x" : null;
  const minX = Math.min(0, ...boxes.map((b) => (flip === "x" ? -(b.x + b.w) : b.x)));
  const minY = Math.min(0, ...boxes.map((b) => (flip === "y" ? -(b.y + b.h) : b.y)));
  els = els.map((e) => {
    if (isConnector(e)) return e;
    const x = flip === "x" ? -(e.x + e.w) : e.x;
    const y = flip === "y" ? -(e.y + e.h) : e.y;
    return { ...e, x: x - minX + PAD, y: y - minY + PAD * 2 };
  });

  const byNode = new Map(els.map((e) => [e.id, e]));
  const members = (sgId) => [
    ...[...nodes.values()].filter((n) => n.sub === sgId).map((n) => byNode.get(elIds.get(n.id))),
    ...subgraphs.filter((g) => g.parent === sgId).flatMap((g) => members(g.id)),
  ];
  // ponytail: frames are boxes around laid-out members; overlap with non-members is possible, upgrade to cluster-aware layout if it bites
  const frames = subgraphs
    .map((g) => {
      const list = members(g.id);
      if (!list.length) return null;
      const x = Math.min(...list.map((e) => e.x)) - PAD;
      const y = Math.min(...list.map((e) => e.y)) - PAD * 1.5;
      const w = Math.max(...list.map((e) => e.x + e.w)) - x + PAD;
      const h = Math.max(...list.map((e) => e.y + e.h)) - y + PAD;
      return createElement("frame", { id: frameIds.get(g.id), x, y, w, h, name: g.title || g.id });
    })
    .filter(Boolean);
  const liveFrames = new Set(frames.map((f) => f.id));
  const frameOf = new Map([...nodes.values()].filter((n) => n.sub).map((n) => [elIds.get(n.id), frameIds.get(n.sub)]));
  els = els.map((e) => (liveFrames.has(frameOf.get(e.id)) ? { ...e, frameId: frameOf.get(e.id) } : e));
  const all = [...frames, ...els];
  const byId = new Map(all.map((e) => [e.id, e]));
  return all.filter((e) => !isConnector(e) || (byId.has(e.startBinding.id) && byId.has(e.endBinding.id))).map((e) => (isConnector(e) ? resolveConnector(e, byId) : e));
}

const SEQ_ARROW = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*[+-]?\s*([^:]+?)\s*(?::\s*(.*))?$/;
const SEQ_STYLE = {
  "->>": ["arrow", "triangle", "solid"],
  "-->>": ["arrow", "triangle", "dashed"],
  "->": ["line", null, "solid"],
  "-->": ["line", null, "dashed"],
  "-x": ["arrow", "bar", "solid"],
  "--x": ["arrow", "bar", "dashed"],
  "-)": ["arrow", "arrow", "solid"],
  "--)": ["arrow", "arrow", "dashed"],
  "<<->>": ["arrow", "triangle", "solid"],
  "<<-->>": ["arrow", "triangle", "dashed"],
};

function sequence(stmts) {
  const parts = new Map();
  const msgs = [];
  const add = (id, label = id) => {
    if (!parts.has(id)) parts.set(id, { id, label: cleanLabel(label) });
    return parts.get(id);
  };
  for (const { s } of stmts.slice(1)) {
    let m;
    if ((m = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(s))) add(m[2].trim(), m[3] ?? m[2]);
    else if ((m = SEQ_ARROW.exec(s))) {
      add(m[1].trim());
      add(m[3].trim());
      msgs.push({ from: m[1].trim(), to: m[3].trim(), op: m[2], text: cleanLabel(m[4] ?? "") });
    }
  }
  if (!parts.size) throw new Error("The sequence diagram has no participants.");
  const top = PAD;
  const firstY = 110;
  const step = 50;
  const H = firstY + msgs.length * step + 40;
  const headH = Math.max(44, Math.ceil(H * 0.12));
  const els = [];
  const lifelines = new Map();
  let x = PAD;
  for (const p of parts.values()) {
    const { w } = sizeFor(p.label);
    const group = [newId()];
    const life = createElement("shape", { kind: "lifeline", x, y: top, w, h: H, groupIds: group, strokeStyle: "solid", roughness: 0 });
    els.push(life, createElement("rect", { x, y: top, w, h: headH, text: p.label, fontSize: FONT, fill: "#ffffff", fillStyle: "solid", groupIds: group, roughness: 0 }));
    lifelines.set(p.id, life);
    x += w + 80;
  }
  const byId = new Map(els.map((e) => [e.id, e]));
  msgs.forEach((m, i) => {
    const y = top + firstY + i * step;
    const [type, head, strokeStyle] = SEQ_STYLE[m.op];
    const a = lifelines.get(m.from);
    const b = lifelines.get(m.to);
    const props = { text: m.text, fontSize: 14, strokeStyle, endArrow: head, startArrow: m.op.startsWith("<<") ? head : null, roughness: 0 };
    if (a === b) {
      const cx = a.x + a.w / 2;
      els.push(createElement(type, { ...props, x: cx, y, w: 40, h: 20, points: [[0, 0], [40, 0], [40, 20], [0, 20]] }));
      return;
    }
    const fy = (y - a.y) / a.h;
    const conn = createElement(type, {
      ...props,
      points: [[0, 0], [1, 0]],
      startBinding: { id: a.id, fx: 0.5, fy, fixed: true },
      endBinding: { id: b.id, fx: 0.5, fy, fixed: true },
    });
    els.push(resolveConnector(conn, byId));
  });
  return els;
}

export function mermaidToElements(text) {
  const stmts = statements(String(text ?? ""));
  if (!stmts.length) throw new Error("The Mermaid text is empty.");
  const head = stmts[0].s;
  const flow = /^(graph|flowchart)(?:\s+(TD|TB|BT|LR|RL))?\s*$/i.exec(head);
  if (flow) return flowchart(stmts, (flow[2] ?? "TD").toUpperCase());
  if (/^sequenceDiagram\b/.test(head)) return sequence(stmts);
  throw new Error(`Unsupported Mermaid diagram "${head.split(/\s/)[0]}". Only flowcharts (graph/flowchart) and sequenceDiagram are supported.`);
}
