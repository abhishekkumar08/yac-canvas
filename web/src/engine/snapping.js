export const snapToGrid = (v, size) => Math.round(v / size) * size;

const xs = (b) => [b.x, b.x + b.w / 2, b.x + b.w];
const ys = (b) => [b.y, b.y + b.h / 2, b.y + b.h];

function bestOffset(moving, targets) {
  let best = null;
  for (const m of moving) for (const t of targets) {
    const d = t - m;
    if (best === null || Math.abs(d) < Math.abs(best)) best = d;
  }
  return best;
}

export function snapMove(b, others, threshold) {
  let dx = bestOffset(xs(b), others.flatMap(xs));
  let dy = bestOffset(ys(b), others.flatMap(ys));
  dx = dx !== null && Math.abs(dx) <= threshold ? dx : 0;
  dy = dy !== null && Math.abs(dy) <= threshold ? dy : 0;
  const moved = { ...b, x: b.x + dx, y: b.y + dy };
  const guides = [];
  const eps = 0.5;
  for (const o of others) {
    for (const vx of xs(moved)) if (xs(o).some((ox) => Math.abs(ox - vx) < eps) && (dx || threshold)) {
      guides.push({ x1: vx, y1: Math.min(o.y, moved.y), x2: vx, y2: Math.max(o.y + o.h, moved.y + moved.h) });
    }
    for (const vy of ys(moved)) if (ys(o).some((oy) => Math.abs(oy - vy) < eps)) {
      guides.push({ x1: Math.min(o.x, moved.x), y1: vy, x2: Math.max(o.x + o.w, moved.x + moved.w), y2: vy });
    }
  }
  return { dx, dy, guides: dx || dy || guides.length ? dedupe(guides) : [] };
}

function dedupe(guides) {
  const seen = new Set();
  return guides.filter((g) => {
    const k = `${g.x1}|${g.y1}|${g.x2}|${g.y2}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function measureGaps(a, b) {
  const out = [];
  const ay = a.y + a.h / 2;
  const ax = a.x + a.w / 2;
  const inside = b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  if (inside) {
    const cy = b.y + b.h / 2;
    const cx = b.x + b.w / 2;
    out.push({ x1: a.x, y1: cy, x2: b.x, y2: cy, value: b.x - a.x });
    out.push({ x1: b.x + b.w, y1: cy, x2: a.x + a.w, y2: cy, value: a.x + a.w - (b.x + b.w) });
    out.push({ x1: cx, y1: a.y, x2: cx, y2: b.y, value: b.y - a.y });
    out.push({ x1: cx, y1: b.y + b.h, x2: cx, y2: a.y + a.h, value: a.y + a.h - (b.y + b.h) });
    return out;
  }
  if (b.x >= a.x + a.w) out.push({ x1: a.x + a.w, y1: ay, x2: b.x, y2: ay, value: b.x - (a.x + a.w) });
  else if (b.x + b.w <= a.x) out.push({ x1: b.x + b.w, y1: ay, x2: a.x, y2: ay, value: a.x - (b.x + b.w) });
  if (b.y >= a.y + a.h) out.push({ x1: ax, y1: a.y + a.h, x2: ax, y2: b.y, value: b.y - (a.y + a.h) });
  else if (b.y + b.h <= a.y) out.push({ x1: ax, y1: b.y + b.h, x2: ax, y2: a.y, value: a.y - (b.y + b.h) });
  return out;
}
