import { createBoard } from "../engine/serialize.js";
import { createElement, newId } from "../engine/elements.js";
import { isConnector, resolveConnector } from "../engine/connectors.js";
import { treeLayout } from "../engine/layout.js";
import { MODE_STYLE } from "./modes.js";
import { COPY } from "./copy.js";
import { TEMPLATES_COPY } from "./copy-versions.js";

const T = TEMPLATES_COPY.ITEMS;
const INK = "#1e1e1e";
const MUTED = "#868e96";
const STICKY = COPY.COLORS.STICKY.map(([color]) => color);

function kit(mode) {
  const { routing, ...base } = MODE_STYLE[mode];
  const el = (type, props) => createElement(type, { ...base, ...props });
  const bind = (node, at) => ({ id: node.id, fx: at?.[0] ?? 0.5, fy: at?.[1] ?? 0.5, fixed: Boolean(at) });
  const connect = (a, b, { from, to, type = "arrow", ...props } = {}) =>
    createElement(type, { ...base, fill: "transparent", routing, points: [[0, 0], [1, 0]], startBinding: bind(a, from), endBinding: bind(b, to), ...props });
  const text = (props) => {
    const fontSize = props.fontSize ?? base.fontSize;
    return el("text", { fill: "transparent", stroke: INK, w: 200, h: Math.ceil(fontSize * 1.25), ...props });
  };
  return { el, connect, text };
}

function board(name, mode, elements) {
  const b = createBoard(name, mode);
  const byId = new Map(elements.map((e) => [e.id, e]));
  b.pages[0].elements = elements.map((e) => (isConnector(e) && (e.startBinding || e.endBinding) ? resolveConnector(e, byId) : e));
  return b;
}

function flowchart() {
  const c = T.flowchart;
  const { el, connect } = kit("diagram");
  const node = (kind, x, y, w, h, text) => el("shape", { kind, x, y, w, h, text });
  const start = node("terminator", 230, 40, 140, 50, c.START);
  const input = node("process", 220, 140, 160, 60, c.INPUT);
  const check = node("decision", 220, 250, 160, 100, c.CHECK);
  const save = node("process", 220, 400, 160, 60, c.SAVE);
  const end = node("terminator", 230, 510, 140, 50, c.END);
  const error = node("process", 460, 270, 160, 60, c.ERROR);
  return board(c.NAME, "diagram", [
    start, input, check, save, end, error,
    connect(start, input),
    connect(input, check),
    connect(check, save, { text: c.YES }),
    connect(save, end),
    connect(check, error, { text: c.NO }),
    connect(error, input, { from: [0.5, 0], to: [1, 0.5] }),
  ]);
}

function orgChart() {
  const c = T.org;
  const { el, connect } = kit("diagram");
  const people = c.PEOPLE.map(([role, name], i) => el("rect", { x: i ? 0 : 400, y: i ? 0 : 40, w: 160, h: 60, radius: 8, text: `${role}\n${name}`, fill: i ? "#ffffff" : "#e7f5ff" }));
  const [ceo, cto, cfo, coo, eng, design, ops, support] = people;
  const reports = [[ceo, cto], [ceo, cfo], [ceo, coo], [cto, eng], [cto, design], [coo, ops], [coo, support]];
  const lines = reports.map(([a, b]) => connect(a, b, { type: "line", endArrow: null }));
  return board(c.NAME, "diagram", treeLayout([...people, ...lines], people.map((p) => p.id), { gapX: 40, gapY: 70 }));
}

function swimlane() {
  const c = T.swimlane;
  const { el, connect } = kit("diagram");
  const LANE_H = 170;
  const HEAD = 32;
  const fills = ["#f8f9fa", "#e7f5ff", "#ebfbee"];
  const lanes = c.LANES.map((text, i) =>
    el("shape", { kind: "swimlane", x: 0, y: i * LANE_H, w: 1000, h: LANE_H, text, textAlign: "left", verticalAlign: "top", fontWeight: 600, fill: fills[i] }),
  );
  const step = (lane, x, text, kind = "process") => {
    const [w, h] = kind === "decision" ? [120, 90] : [140, 60];
    return el("shape", { kind, x, y: lane * LANE_H + HEAD + (LANE_H - HEAD - h) / 2, w, h, text });
  };
  const order = step(0, 60, c.ORDER);
  const review = step(1, 240, c.REVIEW);
  const approve = step(1, 450, c.APPROVE, "decision");
  const reject = step(0, 440, c.REJECT);
  const pick = step(2, 640, c.PICK);
  const ship = step(2, 820, c.SHIP);
  const receive = step(0, 820, c.RECEIVE);
  return board(c.NAME, "diagram", [
    ...lanes, order, review, approve, reject, pick, ship, receive,
    connect(order, review),
    connect(review, approve),
    connect(approve, pick, { text: c.YES }),
    connect(approve, reject, { text: c.NO }),
    connect(pick, ship),
    connect(ship, receive),
  ]);
}

function mindMap() {
  const c = T.mindmap;
  const { el, connect } = kit("whiteboard");
  const colors = ["#e03131", "#1971c2", "#2f9e44", "#f08c00", "#9c36b5"];
  const mid = { x: 520, y: 360 };
  const at = (angle, rx, ry, w, h) => ({ x: mid.x + Math.cos(angle) * rx - w / 2, y: mid.y + Math.sin(angle) * ry - h / 2, w, h });
  const hub = el("ellipse", { ...at(0, 0, 0, 220, 110), text: c.CENTER, fontSize: 26 });
  const curve = (a, b, bend, props) => {
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    const len = Math.hypot(dx, dy) || 1;
    const bendAt = [dx / 2 - (dy / len) * bend, dy / 2 + (dx / len) * bend];
    return connect(a, b, { type: "line", endArrow: null, routing: "curved", x: ca.x, y: ca.y, points: [[0, 0], bendAt, [dx, dy]], ...props });
  };
  const els = [hub];
  c.BRANCHES.forEach((text, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / c.BRANCHES.length;
    const stroke = colors[i % colors.length];
    const branch = el("rect", { ...at(angle, 330, 220, 160, 64), text, stroke, radius: 16 });
    const leaf = el("rect", { ...at(angle + 0.18, 560, 380, 150, 48), text: c.LEAVES[i], stroke, strokeWidth: 1, fontSize: 18, radius: 12 });
    els.push(branch, leaf, curve(hub, branch, 40, { stroke, strokeWidth: 3 }), curve(branch, leaf, -25, { stroke }));
  });
  return board(c.NAME, "whiteboard", els);
}

function stickyColumns(name, columns, notes) {
  const NOTE = 140;
  const GAP = 20;
  const W = NOTE * 2 + GAP * 3;
  const els = [];
  columns.forEach((title, i) => {
    const frame = createElement("frame", { name: title, x: i * (W + 40), y: 0, w: W, h: 560 });
    els.push(frame);
    notes[i].forEach((text, j) => {
      els.push(
        createElement("sticky", {
          x: frame.x + GAP + (j % 2) * (NOTE + GAP),
          y: frame.y + GAP + Math.floor(j / 2) * (NOTE + GAP),
          w: NOTE,
          h: NOTE,
          text,
          fill: STICKY[i % STICKY.length],
          frameId: frame.id,
        }),
      );
    });
  });
  return board(name, "whiteboard", els);
}

const retrospective = () => stickyColumns(T.retro.NAME, T.retro.COLUMNS, T.retro.NOTES);
const kanban = () => stickyColumns(T.kanban.NAME, T.kanban.COLUMNS, T.kanban.NOTES);

function mobileWireframe() {
  const c = T.mobile;
  const { el, connect, text } = kit("design");
  const screen = (x, name) => createElement("frame", { name, x, y: 0, w: 390, h: 844, radius: 32 });
  const inside = (frame) => (type, props) => {
    const p = { ...props, x: frame.x + props.x, y: frame.y + props.y, frameId: frame.id };
    return type === "text" ? text(p) : el(type, p);
  };

  const home = screen(0, c.HOME);
  let add = inside(home);
  const homeEls = [
    add("text", { x: 24, y: 16, text: c.TIME, fontSize: 15, fontWeight: 600 }),
    add("text", { x: 24, y: 60, text: c.GREETING, fontSize: 28, fontWeight: 700, w: 300 }),
    add("rect", { x: 24, y: 116, w: 342, h: 48, radius: 12, fill: "#f1f3f5", text: c.SEARCH, textAlign: "left", textColor: MUTED }),
    add("text", { x: 24, y: 188, text: c.SECTION, fontSize: 18, fontWeight: 600 }),
    add("rect", { x: 24, y: 224, w: 342, h: 180, radius: 16, fill: "#e9ecef", text: c.CARD, textColor: MUTED }),
    add("rect", { x: 24, y: 420, w: 342, h: 180, radius: 16, fill: "#e9ecef", text: c.CARD, textColor: MUTED }),
    add("rect", { x: 0, y: 760, w: 390, h: 84, fill: "#f8f9fa" }),
    ...c.TABS.map((tab, i) => add("text", { x: 30 + i * 130, y: 780, w: 70, text: tab, fontSize: 13, textAlign: "center", textColor: i ? MUTED : INK })),
  ];

  const details = screen(470, c.DETAILS);
  add = inside(details);
  const detailEls = [
    add("text", { x: 24, y: 16, text: c.TIME, fontSize: 15, fontWeight: 600 }),
    add("text", { x: 16, y: 56, text: c.BACK, fontSize: 17, textColor: "#1971c2" }),
    add("rect", { x: 0, y: 96, w: 390, h: 300, fill: "#dee2e6" }),
    add("text", { x: 24, y: 420, text: c.DETAIL_TITLE, fontSize: 26, fontWeight: 700, w: 300 }),
    add("text", { x: 24, y: 464, w: 342, h: 44, text: c.BODY, autoSize: false, textColor: "#495057" }),
    add("rect", { x: 24, y: 740, w: 342, h: 56, radius: 14, fill: INK, text: c.CTA, textColor: "#ffffff", fontWeight: 600 }),
  ];

  const flow = connect(homeEls[4], details, { from: [1, 0.5], to: [0, 0.3], stroke: "#7048e8", strokeWidth: 2 });
  return board(c.NAME, "design", [home, ...homeEls, details, ...detailEls, flow]);
}

function landingWireframe() {
  const c = T.landing;
  const { el, text } = kit("design");
  const page = createElement("frame", { name: c.FRAME, x: 0, y: 0, w: 1440, h: 1024 });
  const f = { frameId: page.id };
  const button = (x, y, label, dark) =>
    el("rect", { ...f, x, y, w: 180, h: 56, radius: 12, text: label, fontWeight: 600, fill: dark ? INK : "#ffffff", stroke: dark ? "transparent" : INK, textColor: dark ? "#ffffff" : INK });
  const features = c.FEATURES.flatMap((title, i) => {
    const x = 80 + i * 440;
    return [
      el("rect", { ...f, x, y: 660, w: 400, h: 200, radius: 16, fill: "#f1f3f5" }),
      el("rect", { ...f, x: x + 32, y: 692, w: 48, h: 48, radius: 12, fill: "#dee2e6" }),
      text({ ...f, x: x + 32, y: 764, text: title, fontSize: 24, fontWeight: 700 }),
      text({ ...f, x: x + 32, y: 804, w: 336, text: c.FEATURE_BODY, textColor: "#495057" }),
    ];
  });
  return board(c.NAME, "design", [
    page,
    el("rect", { ...f, x: 80, y: 32, w: 120, h: 40, radius: 8, text: c.LOGO, fontWeight: 700 }),
    ...c.LINKS.map((link, i) => text({ ...f, x: 860 + i * 110, y: 42, w: 90, text: link })),
    el("rect", { ...f, x: 1240, y: 28, w: 120, h: 48, radius: 10, fill: INK, text: c.SIGN_UP, textColor: "#ffffff", fontWeight: 600 }),
    text({ ...f, x: 80, y: 200, w: 640, h: 140, text: c.HEADLINE, fontSize: 56, fontWeight: 700, autoSize: false }),
    text({ ...f, x: 80, y: 370, w: 560, h: 56, text: c.SUBHEAD, fontSize: 20, autoSize: false, textColor: "#495057" }),
    button(80, 460, c.PRIMARY, true),
    button(280, 460, c.SECONDARY, false),
    el("rect", { ...f, x: 760, y: 160, w: 600, h: 420, radius: 24, fill: "#dee2e6", text: c.IMAGE, textColor: MUTED }),
    ...features,
    el("rect", { ...f, x: 0, y: 944, w: 1440, h: 80, fill: "#f8f9fa", text: c.FOOTER, textColor: MUTED }),
  ]);
}

function erDiagram() {
  const c = T.er;
  const { el, connect } = kit("diagram");
  const table = (cells, x, y) => el("table", { x, y, w: 240, h: cells.length * 32, rows: cells.length, cols: 2, cells: cells.map((r) => [...r]), header: true, textAlign: "left" });
  const customer = table(c.TABLES.customer, 40, 40);
  const order = table(c.TABLES.order, 400, 40);
  const item = table(c.TABLES.item, 760, 40);
  const product = table(c.TABLES.product, 760, 320);
  const rel = (one, many) => connect(one, many, { type: "line", startArrow: "bar", endArrow: "arrow", text: c.ONE_MANY });
  return board(c.NAME, "diagram", [customer, order, item, product, rel(customer, order), rel(order, item), rel(product, item)]);
}

function sequenceDiagram() {
  const c = T.sequence;
  const { el, connect } = kit("diagram");
  const TOP = 40;
  const FIRST = 110;
  const STEP = 50;
  const H = FIRST + c.MESSAGES.length * STEP + 40;
  const els = [];
  const lifelines = c.PARTICIPANTS.map((name, i) => {
    const groupIds = [newId()];
    const x = 40 + i * 200;
    const life = el("shape", { kind: "lifeline", x, y: TOP, w: 140, h: H, groupIds });
    els.push(life, el("rect", { x, y: TOP, w: 140, h: Math.ceil(H * 0.12), text: name, groupIds, fontWeight: 600 }));
    return life;
  });
  const flow = [[0, 1], [1, 2], [2, 3], [3, 2], [2, 1], [1, 0]];
  flow.forEach(([from, to], i) => {
    const fy = (FIRST + i * STEP) / H;
    els.push(
      connect(lifelines[from], lifelines[to], {
        from: [0.5, fy],
        to: [0.5, fy],
        routing: "straight",
        text: c.MESSAGES[i],
        strokeStyle: from > to ? "dashed" : "solid",
        endArrow: from > to ? "arrow" : "triangle",
      }),
    );
  });
  return board(c.NAME, "diagram", els);
}

const template = (id, uiMode, build) => ({ id, name: T[id].NAME, description: T[id].DESCRIPTION, uiMode, build });

export const TEMPLATES = [
  template("flowchart", "diagram", flowchart),
  template("org", "diagram", orgChart),
  template("swimlane", "diagram", swimlane),
  template("mindmap", "whiteboard", mindMap),
  template("retro", "whiteboard", retrospective),
  template("kanban", "whiteboard", kanban),
  template("mobile", "design", mobileWireframe),
  template("landing", "design", landingWireframe),
  template("er", "diagram", erDiagram),
  template("sequence", "diagram", sequenceDiagram),
];
