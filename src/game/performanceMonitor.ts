export type PerfSnapshot = {
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  frameGapMs: number;
  drawMs: number;
  updateMs: number;
  networkParseMs: number;
  snapshotApplyMs: number;
  fogMs: number;
  lastLongTaskMs: number;
  longTaskCount: number;
  monsters: number;
  particles: number;
  projectiles: number;
  zoom: number;
  canvasW: number;
  canvasH: number;
  quality: string;
};

const ROLLING = 60;

class PerformanceMonitor {
  private frameTimes: number[] = [];
  private frameMs = 0;
  private frameGapMs = 0;
  private drawMs = 0;
  private updateMs = 0;
  private networkParseMs = 0;
  private snapshotApplyMs = 0;
  private fogMs = 0;
  private lastLongTaskMs = 0;
  private longTaskCount = 0;
  private extras: Partial<PerfSnapshot> = {};

  recordFrame(totalMs: number) {
    this.frameMs = totalMs;
    this.frameTimes.push(totalMs);
    if (this.frameTimes.length > ROLLING) this.frameTimes.shift();
  }

  recordDraw(ms: number) {
    this.drawMs = ms;
  }

  recordFrameGap(ms: number) {
    this.frameGapMs = ms;
  }

  recordUpdate(ms: number) {
    this.updateMs = ms;
  }

  recordNetworkParse(ms: number) {
    this.networkParseMs = ms;
  }

  recordSnapshotApply(ms: number) {
    this.snapshotApplyMs = ms;
  }

  recordLongTask(ms: number) {
    this.lastLongTaskMs = ms;
    this.longTaskCount += 1;
  }

  observeLongTasks() {
    if (typeof PerformanceObserver === 'undefined') return () => {};
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => this.recordLongTask(entry.duration));
    });
    try {
      observer.observe({ entryTypes: ['longtask'] });
      return () => observer.disconnect();
    } catch {
      observer.disconnect();
      return () => {};
    }
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
      frameGapMs: this.frameGapMs,
      drawMs: this.drawMs,
      updateMs: this.updateMs,
      networkParseMs: this.networkParseMs,
      snapshotApplyMs: this.snapshotApplyMs,
      fogMs: this.fogMs,
      lastLongTaskMs: this.lastLongTaskMs,
      longTaskCount: this.longTaskCount,
      monsters: this.extras.monsters ?? 0,
      particles: this.extras.particles ?? 0,
      projectiles: this.extras.projectiles ?? 0,
      zoom: this.extras.zoom ?? 1,
      canvasW: this.extras.canvasW ?? 0,
      canvasH: this.extras.canvasH ?? 0,
      quality: this.extras.quality ?? 'high',
    };
  }
}

export const perfMonitor = new PerformanceMonitor();
