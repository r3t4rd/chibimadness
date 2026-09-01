export type PerfSnapshot = {
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  drawMs: number;
  nativeFps: number | null;
  nativeFrameMs: number | null;
  nativeStaticCacheRedraws: number | null;
  nativeStaticTriangles: number | null;
  nativeDynamicTriangles: number | null;
  fogMs: number;
  monsters: number;
  particles: number;
  projectiles: number;
  zoom: number;
  canvasW: number;
  canvasH: number;
};

const ROLLING = 60;

class PerformanceMonitor {
  private frameTimes: number[] = [];
  private frameMs = 0;
  private drawMs = 0;
  private nativeFps: number | null = null;
  private nativeFrameMs: number | null = null;
  private nativeStaticCacheRedraws: number | null = null;
  private nativeStaticTriangles: number | null = null;
  private nativeDynamicTriangles: number | null = null;
  private fogMs = 0;
  private extras: Partial<PerfSnapshot> = {};

  recordFrame(totalMs: number) {
    this.frameMs = totalMs;
    this.frameTimes.push(totalMs);
    if (this.frameTimes.length > ROLLING) this.frameTimes.shift();
  }

  recordDraw(ms: number) {
    this.drawMs = ms;
  }

  recordNativePresentation(
    fps: unknown,
    frameMs: unknown,
    staticCacheRedraws?: unknown,
    staticTriangles?: unknown,
    dynamicTriangles?: unknown
  ) {
    this.nativeFps = typeof fps === 'number' && Number.isFinite(fps)
      ? Math.max(0, Math.round(fps))
      : null;
    this.nativeFrameMs = typeof frameMs === 'number' && Number.isFinite(frameMs)
      ? Math.max(0, frameMs)
      : null;
    this.nativeStaticCacheRedraws = typeof staticCacheRedraws === 'number' && Number.isFinite(staticCacheRedraws)
      ? Math.max(0, Math.round(staticCacheRedraws))
      : null;
    this.nativeStaticTriangles = typeof staticTriangles === 'number' && Number.isFinite(staticTriangles)
      ? Math.max(0, Math.round(staticTriangles))
      : null;
    this.nativeDynamicTriangles = typeof dynamicTriangles === 'number' && Number.isFinite(dynamicTriangles)
      ? Math.max(0, Math.round(dynamicTriangles))
      : null;
  }

  recordFog(ms: number) {
    this.fogMs = ms;
  }

  setExtras(extras: Partial<PerfSnapshot>) {
    this.extras = extras;
  }

  getSnapshot(): PerfSnapshot {
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / (this.frameTimes.length || 1);
    return {
      fps: Math.round(1000 / Math.max(1, avg)),
      frameMs: this.frameMs,
      avgFrameMs: avg,
      drawMs: this.drawMs,
      nativeFps: this.nativeFps,
      nativeFrameMs: this.nativeFrameMs,
      nativeStaticCacheRedraws: this.nativeStaticCacheRedraws,
      nativeStaticTriangles: this.nativeStaticTriangles,
      nativeDynamicTriangles: this.nativeDynamicTriangles,
      fogMs: this.fogMs,
      monsters: this.extras.monsters ?? 0,
      particles: this.extras.particles ?? 0,
      projectiles: this.extras.projectiles ?? 0,
      zoom: this.extras.zoom ?? 1,
      canvasW: this.extras.canvasW ?? 0,
      canvasH: this.extras.canvasH ?? 0,
    };
  }
}

export const perfMonitor = new PerformanceMonitor();
