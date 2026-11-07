import { Link2 } from "lucide-react";
import { elementBounds } from "@/engine/geometry.js";

export function LinkBadges({ elements, zoom }) {
  const r = 9 / zoom;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {elements.filter((e) => e.link && !e.hidden).map((e) => {
        const b = elementBounds(e);
        const cx = b.x + b.w;
        return (
          <g key={e.id}>
            <circle cx={cx} cy={b.y} r={r} fill="#6d5efc" stroke="#ffffff" strokeWidth={1.5 / zoom} />
            <Link2 x={cx - r * 0.6} y={b.y - r * 0.6} size={r * 1.2} color="#ffffff" strokeWidth={2.5} />
          </g>
        );
      })}
    </g>
  );
}
