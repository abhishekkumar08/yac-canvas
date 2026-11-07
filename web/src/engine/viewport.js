export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;

export const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const toWorld = (vp, p) => ({ x: p.x / vp.zoom - vp.scrollX, y: p.y / vp.zoom - vp.scrollY });

export const toScreen = (vp, p) => ({ x: (p.x + vp.scrollX) * vp.zoom, y: (p.y + vp.scrollY) * vp.zoom });

export function zoomAt(vp, screenPoint, zoom) {
  const z = clampZoom(zoom);
  const w = toWorld(vp, screenPoint);
  return { zoom: z, scrollX: screenPoint.x / z - w.x, scrollY: screenPoint.y / z - w.y };
}

export function fitBounds(b, size, padding = 40, maxZoom = 1) {
  const zoom = clampZoom(
    Math.min(maxZoom, (size.width - padding * 2) / Math.max(b.w, 1), (size.height - padding * 2) / Math.max(b.h, 1)),
  );
  return {
    zoom,
    scrollX: size.width / 2 / zoom - (b.x + b.w / 2),
    scrollY: size.height / 2 / zoom - (b.y + b.h / 2),
  };
}

export function viewRect(vp, size, margin = 0) {
  const a = toWorld(vp, { x: -margin, y: -margin });
  return { x: a.x, y: a.y, w: (size.width + 2 * margin) / vp.zoom, h: (size.height + 2 * margin) / vp.zoom };
}
