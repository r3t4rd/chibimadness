export type PerfSnapshot = {
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  drawMs: number;
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
