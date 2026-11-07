import { createElement } from "@/engine/elements.js";
import { SHAPES } from "@/engine/shapes.js";
import { COPY } from "@/ui/copy.js";
import { LEFT_COPY } from "@/ui/copy-left.js";

export const LIBRARY_GROUPS = ["General", "Basic", "Arrows", "Flowchart", "Entity relation", "UML", "Containers"];

const L = LEFT_COPY.ITEMS;
const D = LEFT_COPY.DEFAULTS;
const INK = "#1e1e1e";

const SIZES = {
  triangle: [80, 70], "right-triangle": [80, 70], pentagon: [80, 80], hexagon: [100, 80], octagon: [80, 80],
  star: [80, 80], plus: [80, 80], cloud: [140, 90], heart: [80, 80], note: [120, 80], card: [120, 80],
  callout: [140, 90], cube: [100, 100], "arrow-up": [60, 120], "arrow-down": [60, 120], "double-arrow": [140, 60],
  chevron: [100, 60], decision: [120, 80], terminator: [120, 50], document: [120, 70], "multi-document": [120, 80],
  database: [80, 100], "or-junction": [40, 40], "off-page": [60, 60], merge: [70, 60], extract: [70, 60],
  "loop-limit": [120, 60], "weak-relationship": [120, 80], package: [140, 100], component: [140, 70],
  actor: [40, 80], lifeline: [100, 240], "initial-state": [24, 24], "final-state": [28, 28], "fork-bar": [120, 8],
  swimlane: [400, 200], "pool-vertical": [200, 400],
};

const box = (type, w, h, extra) => ({ type, x: 0, y: 0, w, h, ...extra });

const shape = (kind, extra) => {
  const [w, h] = SIZES[kind] ?? [120, 60];
  return box("shape", w, h, { kind, ...extra });
};

const link = (type, points, extra) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { type, x: 0, y: 0, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), points, ...extra };
};

const STRAIGHT = [[0, 0], [120, 0]];
const cells = (rows) => rows.map((r) => [...r]);

const item = (group, key, label, make, keywords) => ({ id: `${group.toLowerCase().replace(/\s+/g, "-")}.${key}`, label, group, keywords, make });

const fromShape = (group, kind, extra, keywords) => item(group, kind, SHAPES[kind].label, () => shape(kind, extra), keywords);

const shapeKinds = (group) => Object.keys(SHAPES).filter((k) => SHAPES[k].group === group);

const SHAPE_EXTRAS = {
  decision: { text: D.DECISION },
  terminator: { text: D.START },
  "weak-entity": { text: D.WEAK_ENTITY },
  "weak-relationship": { text: D.RELATIONSHIP },
  package: { text: D.PACKAGE },
  component: { text: D.COMPONENT },
  lifeline: { text: D.LIFELINE, verticalAlign: "top", fontSize: 14 },
  "initial-state": { fill: INK, fillStyle: "solid", roughness: 0 },
  "final-state": { roughness: 0 },
  "fork-bar": { fill: INK, fillStyle: "solid", roughness: 0, strokeWidth: 1 },
  swimlane: { text: D.LANE, verticalAlign: "top", textAlign: "left", fontSize: 16 },
};

const KEYWORDS = {
  database: ["cylinder", "db", "storage"],
  process: ["step", "box"],
  decision: ["if", "branch", "condition"],
  terminator: ["start", "end", "stadium", "pill"],
  data: ["input", "output", "io"],
  actor: ["person", "user", "stick"],
  cloud: ["internet", "network"],
  note: ["comment", "memo"],
  callout: ["speech", "bubble"],
};

const general = [
  item("General", "rect", L.RECT, () => box("rect", 120, 60), ["box"]),
  item("General", "rounded-rect", L.ROUNDED_RECT, () => box("rect", 120, 60, { radius: 12 }), ["box", "round"]),
  item("General", "square", L.SQUARE, () => box("rect", 80, 80), ["box"]),
  item("General", "ellipse", L.ELLIPSE, () => box("ellipse", 120, 60), ["oval"]),
  item("General", "circle", L.CIRCLE, () => box("ellipse", 80, 80), ["round"]),
  item("General", "diamond", L.DIAMOND, () => box("diamond", 120, 80), ["rhombus"]),
  item("General", "text", L.TEXT, () => box("text", 60, 28, { text: COPY.TOOLS.text, autoSize: true }), ["label", "type"]),
  item("General", "sticky", L.STICKY, () => box("sticky", 120, 120, { fill: COPY.COLORS.STICKY[0][0] }), ["note", "postit"]),
  item("General", "table", L.TABLE, () => box("table", 180, 90, { rows: 3, cols: 3 }), ["grid"]),
  ...["triangle", "hexagon", "database", "cloud", "document", "note", "callout", "actor"].map((k) => fromShape("General", k, undefined, KEYWORDS[k])),
];

const basic = [
  item("Basic", "rect", L.RECT, () => box("rect", 120, 60), ["box"]),
  item("Basic", "rounded-rect", L.ROUNDED_RECT, () => box("rect", 120, 60, { radius: 12 }), ["box", "round"]),
  item("Basic", "ellipse", L.ELLIPSE, () => box("ellipse", 120, 60), ["oval"]),
  item("Basic", "diamond", L.DIAMOND, () => box("diamond", 120, 80), ["rhombus"]),
  ...shapeKinds("Basic").map((k) => fromShape("Basic", k, undefined, KEYWORDS[k])),
];

const arrows = [
  ...shapeKinds("Arrows").map((k) => fromShape("Arrows", k, undefined, ["block"])),
  item("Arrows", "straight", L.STRAIGHT_ARROW, () => link("arrow", STRAIGHT), ["connector"]),
  item("Arrows", "elbow", L.ELBOW_ARROW, () => link("arrow", [[0, 0], [60, 0], [60, 60], [120, 60]], { routing: "elbow" }), ["connector", "orthogonal"]),
  item("Arrows", "curved", L.CURVED_ARROW, () => link("arrow", [[0, 0], [60, -30], [120, 0]], { routing: "curved" }), ["connector", "bezier"]),
  item("Arrows", "line", L.LINE, () => link("line", STRAIGHT), ["connector"]),
  item("Arrows", "dashed", L.DASHED_ARROW, () => link("arrow", STRAIGHT, { strokeStyle: "dashed" }), ["connector"]),
  item("Arrows", "dotted-line", L.DOTTED_LINE, () => link("line", STRAIGHT, { strokeStyle: "dotted" }), ["connector"]),
  item("Arrows", "double", L.DOUBLE_ARROW, () => link("arrow", STRAIGHT, { startArrow: "arrow" }), ["connector", "both"]),
  item("Arrows", "triangle-head", L.TRIANGLE_HEAD, () => link("arrow", STRAIGHT, { endArrow: "triangle" }), ["connector"]),
  item("Arrows", "dot-head", L.DOT_HEAD, () => link("arrow", STRAIGHT, { endArrow: "dot" }), ["connector"]),
  item("Arrows", "diamond-head", L.DIAMOND_HEAD, () => link("arrow", STRAIGHT, { endArrow: "diamond" }), ["connector"]),
  item("Arrows", "bar-head", L.BAR_HEAD, () => link("line", STRAIGHT, { endArrow: "bar" }), ["connector"]),
];

const flowchart = shapeKinds("Flowchart").map((k) => fromShape("Flowchart", k, SHAPE_EXTRAS[k], KEYWORDS[k]));

const er = [
  item("Entity relation", "entity", L.ENTITY, () => box("table", 160, 120, { rows: 4, cols: 2, header: true, textAlign: "left", cells: cells(D.ENTITY_CELLS) }), ["table", "er"]),
  item("Entity relation", "attribute", L.ATTRIBUTE, () => box("ellipse", 120, 60, { text: D.ATTRIBUTE }), ["er", "field"]),
  item("Entity relation", "key-attribute", L.KEY_ATTRIBUTE, () => box("ellipse", 120, 60, { text: D.KEY_ATTRIBUTE, strokeWidth: 4 }), ["er", "primary", "pk"]),
  item("Entity relation", "relationship", L.RELATIONSHIP, () => box("diamond", 120, 80, { text: D.RELATIONSHIP }), ["er"]),
  ...shapeKinds("Entity relation").map((k) => fromShape("Entity relation", k, SHAPE_EXTRAS[k], ["er"])),
];

const uml = [
  item("UML", "class", L.CLASS, () => box("table", 160, 90, { rows: 3, cols: 1, header: true, textAlign: "left", cells: cells(D.CLASS_CELLS) })),
  item("UML", "interface", L.INTERFACE, () => box("table", 160, 90, { rows: 3, cols: 1, header: true, textAlign: "left", cells: cells(D.INTERFACE_CELLS) })),
  item("UML", "use-case", L.USE_CASE, () => box("ellipse", 140, 60, { text: D.USE_CASE })),
  item("UML", "state", L.STATE, () => box("rect", 120, 60, { radius: 16, text: D.STATE })),
  fromShape("UML", "note", undefined, KEYWORDS.note),
  ...shapeKinds("UML").map((k) => fromShape("UML", k, SHAPE_EXTRAS[k], KEYWORDS[k])),
  item("UML", "association", L.ASSOCIATION, () => link("line", STRAIGHT), ["connector"]),
  item("UML", "dependency", L.DEPENDENCY, () => link("arrow", STRAIGHT, { strokeStyle: "dashed" }), ["connector"]),
  item("UML", "composition", L.COMPOSITION, () => link("line", STRAIGHT, { startArrow: "diamond" }), ["connector", "aggregation"]),
];

const containers = [
  ...COPY.FRAME_PRESETS.map(([name, w, h]) => item("Containers", `frame-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, L.FRAME(name), () => box("frame", w, h, { name }), ["frame", "artboard"])),
  ...shapeKinds("Containers").map((k) => fromShape("Containers", k, SHAPE_EXTRAS[k], ["lane", "pool"])),
  item("Containers", "group-box", L.GROUP_BOX, () => box("rect", 240, 160, { strokeStyle: "dashed", fill: "transparent" }), ["boundary", "container"]),
];

export const LIBRARY = [...general, ...basic, ...arrows, ...flowchart, ...er, ...uml, ...containers];

const TEMPLATE_SEED = 1337;
const templates = new Map();

export function templateElement(entry) {
  if (!templates.has(entry.id)) {
    const props = entry.make();
    templates.set(entry.id, createElement(props.type, { ...props, seed: TEMPLATE_SEED }));
  }
  return templates.get(entry.id);
}
