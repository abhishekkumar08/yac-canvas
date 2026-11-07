const FONT = { hand: '"Caveat", cursive', sans: '"Inter", system-ui, sans-serif', mono: "ui-monospace, monospace" };
const px = (n) => `${Math.round(n * 100) / 100}px`;

export function cssFor(el) {
  const lines = [`width: ${px(el.w)};`, `height: ${px(el.h)};`];
  if (el.fill && el.fill !== "transparent" && el.type !== "line" && el.type !== "arrow") lines.push(`background: ${el.fill};`);
  if (el.stroke && el.stroke !== "transparent" && el.strokeWidth > 0) lines.push(`border: ${px(el.strokeWidth)} ${el.strokeStyle ?? "solid"} ${el.stroke};`);
  if (el.type === "ellipse") lines.push("border-radius: 50%;");
  else if (el.radius) lines.push(`border-radius: ${px(el.radius)};`);
  if ((el.opacity ?? 100) < 100) lines.push(`opacity: ${el.opacity / 100};`);
  if (el.angle) lines.push(`transform: rotate(${Math.round((el.angle * 180) / Math.PI * 100) / 100}deg);`);
  if (el.shadow) lines.push("box-shadow: 0 3px 8px rgba(0, 0, 0, 0.18);");
  if (el.text) {
    lines.push(`font-family: ${FONT[el.fontFamily] ?? FONT.sans};`, `font-size: ${px(el.fontSize)};`, `color: ${el.textColor ?? el.stroke ?? "#1e1e1e"};`, `text-align: ${el.textAlign ?? "center"};`);
  }
  return lines.join("\n");
}
