const pts = (w, h, list) => list.map(([fx, fy]) => ({ x: fx * w, y: fy * h }));
const polyD = (p) => `M${p.map((q) => `${r(q.x)} ${r(q.y)}`).join(" L")} Z`;
const r = (n) => Math.round(n * 100) / 100;

function arc(cx, cy, rx, ry, from, to, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return out;
}

const fromList = (list) => (w, h) => pts(w, h, list);

function star(points, inner) {
  return (w, h) => {
    const out = [];
    for (let i = 0; i < points * 2; i++) {
      const rad = i % 2 ? inner : 1;
      const t = -Math.PI / 2 + (i * Math.PI) / points;
      out.push({ x: w / 2 + (w / 2) * rad * Math.cos(t), y: h / 2 + (h / 2) * rad * Math.sin(t) });
    }
    return out;
  };
}

function regular(n, rot = -Math.PI / 2) {
  return (w, h) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = rot + (i * 2 * Math.PI) / n;
      out.push({ x: w / 2 + (w / 2) * Math.cos(t), y: h / 2 + (h / 2) * Math.sin(t) });
    }
    return out;
  };
}

const wave = (w, h, depth = 0.1) => (y0) => {
  const d = h * depth;
  return `C${r(w * 0.75)} ${r(y0 - d * 2)} ${r(w * 0.25)} ${r(y0 + d * 2)} 0 ${r(y0)}`;
};

const docPoly = (w, h) => {
  const out = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h * 0.86 }];
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    out.push({ x: w * (1 - t), y: h * 0.86 + Math.sin(t * Math.PI * 2) * h * 0.07 });
  }
  out.push({ x: 0, y: h * 0.86 });
  return out;
};

const cylPoly = (w, h) => {
  const ry = Math.min(h * 0.12, 20);
  return [...arc(w / 2, ry, w / 2, ry, Math.PI, 2 * Math.PI), ...arc(w / 2, h - ry, w / 2, ry, 0, Math.PI)];
};

const stadiumPoly = (w, h) => {
  const rr = Math.min(h / 2, w / 2);
  return [...arc(w - rr, h / 2, rr, h / 2, -Math.PI / 2, Math.PI / 2), ...arc(rr, h / 2, rr, h / 2, Math.PI / 2, 1.5 * Math.PI)];
};

const cloudPoly = (w, h) => {
  const bumps = [
    [0.25, 0.32, 0.22, 0.24, Math.PI * 0.9, Math.PI * 1.75],
    [0.52, 0.22, 0.24, 0.22, Math.PI * 1.15, Math.PI * 1.95],
    [0.78, 0.38, 0.2, 0.24, Math.PI * 1.35, Math.PI * 2.35],
    [0.7, 0.72, 0.24, 0.22, Math.PI * 0.05, Math.PI * 0.85],
    [0.36, 0.74, 0.24, 0.22, Math.PI * 0.15, Math.PI * 0.95],
    [0.15, 0.56, 0.15, 0.2, Math.PI * 0.55, Math.PI * 1.45],
  ];
  return bumps.flatMap(([cx, cy, rx, ry, a, b]) => arc(cx * w, cy * h, rx * w, ry * h, a, b, 8));
};

const heartPoly = (w, h) => {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out.push({ x: w / 2 + (x / 34) * w, y: h * 0.4 + (y / 30) * h });
  }
  return out;
};

const delayPoly = (w, h) => [{ x: 0, y: 0 }, { x: w * 0.6, y: 0 }, ...arc(w * 0.6, h / 2, w * 0.4, h / 2, -Math.PI / 2, Math.PI / 2), { x: 0, y: h }];

const displayPoly = (w, h) => [
  { x: w * 0.15, y: 0 },
  { x: w * 0.8, y: 0 },
  ...arc(w * 0.8, h / 2, w * 0.2, h / 2, -Math.PI / 2, Math.PI / 2),
  { x: w * 0.15, y: h },
  { x: 0, y: h / 2 },
];

const storedPoly = (w, h) => [
  { x: w * 0.12, y: 0 },
  { x: w, y: 0 },
  ...arc(w, h / 2, w * 0.12, h / 2, -Math.PI / 2, -1.5 * Math.PI),
  { x: w * 0.12, y: h },
  ...arc(w * 0.12, h / 2, w * 0.12, h / 2, Math.PI / 2, 1.5 * Math.PI),
];

const curvedD = (fn) => (w, h) => polyD(fn(w, h));

export const SHAPES = {
  triangle: { label: "Triangle", group: "Basic", poly: fromList([[0.5, 0], [1, 1], [0, 1]]) },
  "right-triangle": { label: "Right triangle", group: "Basic", poly: fromList([[0, 0], [1, 1], [0, 1]]) },
  pentagon: { label: "Pentagon", group: "Basic", poly: regular(5) },
  hexagon: { label: "Hexagon", group: "Basic", poly: fromList([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]) },
  octagon: { label: "Octagon", group: "Basic", poly: fromList([[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]]) },
  parallelogram: { label: "Parallelogram", group: "Basic", poly: fromList([[0.2, 0], [1, 0], [0.8, 1], [0, 1]]) },
  trapezoid: { label: "Trapezoid", group: "Basic", poly: fromList([[0.2, 0], [0.8, 0], [1, 1], [0, 1]]) },
  star: { label: "Star", group: "Basic", poly: star(5, 0.45) },
  plus: { label: "Cross", group: "Basic", poly: fromList([[0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65], [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]]) },
  cloud: { label: "Cloud", group: "Basic", poly: cloudPoly, path: curvedD(cloudPoly) },
  heart: { label: "Heart", group: "Basic", poly: heartPoly, path: curvedD(heartPoly) },
  note: {
    label: "Note",
    group: "Basic",
    poly: fromList([[0, 0], [0.8, 0], [1, 0.2], [1, 1], [0, 1]]),
    detail: (w, h) => `M${r(w * 0.8)} 0 L${r(w * 0.8)} ${r(h * 0.2)} L${r(w)} ${r(h * 0.2)}`,
  },
  card: { label: "Card", group: "Basic", poly: fromList([[0.15, 0], [1, 0], [1, 1], [0, 1], [0, 0.2]]) },
  callout: { label: "Callout", group: "Basic", poly: fromList([[0, 0], [1, 0], [1, 0.75], [0.45, 0.75], [0.25, 1], [0.28, 0.75], [0, 0.75]]) },
  cube: {
    label: "Cube",
    group: "Basic",
    poly: fromList([[0.2, 0], [1, 0], [1, 0.8], [0.8, 1], [0, 1], [0, 0.2]]),
    detail: (w, h) => `M0 ${r(h * 0.2)} L${r(w * 0.8)} ${r(h * 0.2)} L${r(w)} 0 M${r(w * 0.8)} ${r(h * 0.2)} L${r(w * 0.8)} ${r(h)}`,
  },
  "arrow-right": { label: "Arrow right", group: "Arrows", poly: fromList([[0, 0.3], [0.65, 0.3], [0.65, 0], [1, 0.5], [0.65, 1], [0.65, 0.7], [0, 0.7]]) },
  "arrow-left": { label: "Arrow left", group: "Arrows", poly: fromList([[1, 0.3], [0.35, 0.3], [0.35, 0], [0, 0.5], [0.35, 1], [0.35, 0.7], [1, 0.7]]) },
  "arrow-up": { label: "Arrow up", group: "Arrows", poly: fromList([[0.3, 1], [0.3, 0.35], [0, 0.35], [0.5, 0], [1, 0.35], [0.7, 0.35], [0.7, 1]]) },
  "arrow-down": { label: "Arrow down", group: "Arrows", poly: fromList([[0.3, 0], [0.3, 0.65], [0, 0.65], [0.5, 1], [1, 0.65], [0.7, 0.65], [0.7, 0]]) },
  "double-arrow": { label: "Double arrow", group: "Arrows", poly: fromList([[0, 0.5], [0.25, 0], [0.25, 0.3], [0.75, 0.3], [0.75, 0], [1, 0.5], [0.75, 1], [0.75, 0.7], [0.25, 0.7], [0.25, 1]]) },
  chevron: { label: "Chevron", group: "Arrows", poly: fromList([[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1], [0.25, 0.5]]) },
  step: { label: "Step", group: "Arrows", poly: fromList([[0, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0, 1]]) },
  process: { label: "Process", group: "Flowchart", poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]) },
  decision: { label: "Decision", group: "Flowchart", poly: fromList([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]) },
  terminator: { label: "Start / end", group: "Flowchart", poly: stadiumPoly, path: curvedD(stadiumPoly) },
  data: { label: "Data", group: "Flowchart", poly: fromList([[0.2, 0], [1, 0], [0.8, 1], [0, 1]]) },
  "predefined-process": {
    label: "Predefined process",
    group: "Flowchart",
    poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]),
    detail: (w, h) => `M${r(w * 0.1)} 0 L${r(w * 0.1)} ${r(h)} M${r(w * 0.9)} 0 L${r(w * 0.9)} ${r(h)}`,
  },
  "manual-input": { label: "Manual input", group: "Flowchart", poly: fromList([[0, 0.3], [1, 0], [1, 1], [0, 1]]) },
  "manual-operation": { label: "Manual operation", group: "Flowchart", poly: fromList([[0, 0], [1, 0], [0.8, 1], [0.2, 1]]) },
  preparation: { label: "Preparation", group: "Flowchart", poly: fromList([[0.15, 0], [0.85, 0], [1, 0.5], [0.85, 1], [0.15, 1], [0, 0.5]]) },
  document: {
    label: "Document",
    group: "Flowchart",
    poly: docPoly,
    path: (w, h) => `M0 0 L${r(w)} 0 L${r(w)} ${r(h * 0.86)} ${wave(w, h)(h * 0.86)} Z`,
  },
  "multi-document": {
    label: "Multiple documents",
    group: "Flowchart",
    poly: docPoly,
    path: (w, h) => `M0 ${r(h * 0.1)} L${r(w * 0.9)} ${r(h * 0.1)} L${r(w * 0.9)} ${r(h * 0.86)} ${wave(w * 0.9, h)(h * 0.86)} Z`,
    detail: (w, h) => `M${r(w * 0.05)} ${r(h * 0.1)} L${r(w * 0.05)} ${r(h * 0.05)} L${r(w * 0.95)} ${r(h * 0.05)} L${r(w * 0.95)} ${r(h * 0.8)} L${r(w * 0.9)} ${r(h * 0.8)} M${r(w * 0.1)} ${r(h * 0.05)} L${r(w * 0.1)} 0 L${r(w)} 0 L${r(w)} ${r(h * 0.75)} L${r(w * 0.95)} ${r(h * 0.75)}`,
  },
  delay: { label: "Delay", group: "Flowchart", poly: delayPoly, path: curvedD(delayPoly) },
  display: { label: "Display", group: "Flowchart", poly: displayPoly, path: curvedD(displayPoly) },
  "stored-data": { label: "Stored data", group: "Flowchart", poly: storedPoly, path: curvedD(storedPoly) },
  "internal-storage": {
    label: "Internal storage",
    group: "Flowchart",
    poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]),
    detail: (w, h) => `M${r(w * 0.15)} 0 L${r(w * 0.15)} ${r(h)} M0 ${r(h * 0.2)} L${r(w)} ${r(h * 0.2)}`,
  },
  database: {
    label: "Database",
    group: "Flowchart",
    poly: cylPoly,
    path: curvedD(cylPoly),
    detail: (w, h) => {
      const ry = Math.min(h * 0.12, 20);
      return polyD(arc(w / 2, ry, w / 2, ry, 0, Math.PI)).replace(/ Z$/, "");
    },
  },
  "off-page": { label: "Off-page connector", group: "Flowchart", poly: fromList([[0, 0], [1, 0], [1, 0.7], [0.5, 1], [0, 0.7]]) },
  merge: { label: "Merge", group: "Flowchart", poly: fromList([[0, 0], [1, 0], [0.5, 1]]) },
  extract: { label: "Extract", group: "Flowchart", poly: fromList([[0.5, 0], [1, 1], [0, 1]]) },
  "loop-limit": { label: "Loop limit", group: "Flowchart", poly: fromList([[0.2, 0], [0.8, 0], [1, 0.3], [1, 1], [0, 1], [0, 0.3]]) },
  "punched-card": { label: "Card", group: "Flowchart", poly: fromList([[0.2, 0], [1, 0], [1, 1], [0, 1], [0, 0.25]]) },
  "or-junction": {
    label: "Or",
    group: "Flowchart",
    poly: regular(32),
    path: curvedD(regular(32)),
    detail: (w, h) => `M${r(w / 2)} 0 L${r(w / 2)} ${r(h)} M0 ${r(h / 2)} L${r(w)} ${r(h / 2)}`,
  },
  "weak-entity": {
    label: "Weak entity",
    group: "Entity relation",
    poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]),
    detail: (w, h) => polyD(pts(w, h, [[0.06, 0.12], [0.94, 0.12], [0.94, 0.88], [0.06, 0.88]])),
  },
  "weak-relationship": {
    label: "Identifying relationship",
    group: "Entity relation",
    poly: fromList([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]),
    detail: (w, h) => polyD(pts(w, h, [[0.5, 0.14], [0.86, 0.5], [0.5, 0.86], [0.14, 0.5]])),
  },
  package: {
    label: "Package",
    group: "UML",
    poly: fromList([[0, 0], [0.4, 0], [0.45, 0.15], [1, 0.15], [1, 1], [0, 1]]),
    detail: (w, h) => `M0 ${r(h * 0.15)} L${r(w * 0.45)} ${r(h * 0.15)}`,
  },
  component: {
    label: "Component",
    group: "UML",
    poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]),
    detail: (w) => `M${r(w - 26)} 8 L${r(w - 10)} 8 L${r(w - 10)} 24 L${r(w - 26)} 24 Z M${r(w - 30)} 11 L${r(w - 22)} 11 M${r(w - 30)} 21 L${r(w - 22)} 21`,
  },
  actor: {
    label: "Actor",
    group: "UML",
    poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]),
    path: () => "",
    detail: (w, h) => {
      const hr = Math.min(w, h) * 0.13;
      const head = polyD(arc(w / 2, hr, hr, hr, 0, Math.PI * 2, 16));
      return `${head} M${r(w / 2)} ${r(hr * 2)} L${r(w / 2)} ${r(h * 0.65)} M0 ${r(h * 0.35)} L${r(w)} ${r(h * 0.35)} M${r(w / 2)} ${r(h * 0.65)} L0 ${r(h)} M${r(w / 2)} ${r(h * 0.65)} L${r(w)} ${r(h)}`;
    },
  },
  lifeline: {
    label: "Lifeline",
    group: "UML",
    poly: fromList([[0, 0], [1, 0], [1, 0.12], [0, 0.12]]),
    detail: (w, h) => `M${r(w / 2)} ${r(h * 0.12)} L${r(w / 2)} ${r(h)}`,
  },
  "initial-state": { label: "Initial state", group: "UML", poly: regular(24), path: curvedD(regular(24)) },
  "final-state": {
    label: "Final state",
    group: "UML",
    poly: regular(24),
    path: curvedD(regular(24)),
    detail: (w, h) => polyD(arc(w / 2, h / 2, w * 0.3, h * 0.3, 0, Math.PI * 2, 20)),
  },
  "fork-bar": { label: "Fork / join", group: "UML", poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]) },
  swimlane: {
    label: "Swimlane",
    group: "Containers",
    poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]),
    detail: (w) => `M0 32 L${r(w)} 32`,
  },
  "pool-vertical": {
    label: "Vertical pool",
    group: "Containers",
    poly: fromList([[0, 0], [1, 0], [1, 1], [0, 1]]),
    detail: (w, h) => `M32 0 L32 ${r(h)}`,
  },
};

export function shapePolygon(kind, w, h) {
  const def = SHAPES[kind];
  if (!def) return pts(w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return def.poly(w, h);
}

export function shapePath(kind, w, h) {
  const def = SHAPES[kind];
  if (def?.path) return def.path(w, h);
  return polyD(shapePolygon(kind, w, h));
}

export function shapeDetail(kind, w, h) {
  return SHAPES[kind]?.detail?.(w, h) ?? "";
}

export { polyD };
