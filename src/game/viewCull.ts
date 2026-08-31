/** Cheap viewport culling for world entities (replaces fog-of-war cull). */

export type ViewBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function getViewBounds(
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  margin = 200
): ViewBounds {
  const safeZoom = zoom > 0.2 && zoom < 8 ? zoom : 1;
  const halfW = canvasWidth / (2 * safeZoom) + margin;
  const halfH = canvasHeight / (2 * safeZoom) + margin;
  return {
    minX: cameraX - halfW,
    maxX: cameraX + halfW,
    minY: cameraY - halfH,
    maxY: cameraY + halfH,
  };
}

export function isInViewBounds(wx: number, wy: number, bounds: ViewBounds): boolean {
  return wx >= bounds.minX && wx <= bounds.maxX && wy >= bounds.minY && wy <= bounds.maxY;
}

export function clipToViewBounds(ctx: CanvasRenderingContext2D, bounds: ViewBounds): void {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.rect(bounds.minX, bounds.minY, w, h);
  ctx.clip();
}
