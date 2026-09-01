export type CanvasProbeMode = 'normal' | 'static-only' | 'dynamic-only' | 'present-only' | 'raf-only';

export type PerfSnapshot = {
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  drawMs: number;
  /** CPU time spent inside the Canvas rAF callback. */
  frameCpuMs: number;
  /** Time after the previous callback finished until the next rAF began. */
  rafWaitMs: number;
  rafWaitP95Ms: number;
  /** Actual cadence of a 16 ms timer; distinguishes rAF pacing from host throttling. */
  timerPulseMs: number;
  timerPulseAvgMs: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  pageVisible: boolean;
  pageFocused: boolean;
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  canvasProbeMode: CanvasProbeMode;
  timingSamples: number;
  webViewEngineVersion: string | null;
  gpuApi: 'WebGL2' | 'WebGL' | 'unavailable';
  gpuRenderer: string | null;
  nativeFps: number | null;
  nativeFrameMs: number | null;
  nativeStaticCacheRedraws: number | null;
  nativeStaticTriangles: number | null;
  nativeDynamicTriangles: number | null;
  nativeBridgeMs: number | null;
  nativeDynamicCommands: number | null;
  nativeSceneTargetHz: number | null;
  /** Completed visible OffscreenCanvas dynamic paints, not main-thread rAF. */
  offscreenDynamicFps: number | null;
  offscreenDynamicRoundTripMs: number | null;
  fogMs: number;
  monsters: number;
  particles: number;
  projectiles: number;
  zoom: number;
  canvasW: number;
  canvasH: number;
};

const ROLLING = 60;
const LONG_TASK_WINDOW_MS = 5_000;

type LongTask = { startedAt: number; duration: number };

class PerformanceMonitor {
  private frameTimes: number[] = [];
  private rafWaitTimes: number[] = [];
  private timerPulseTimes: number[] = [];
  private longTasks: LongTask[] = [];
  private frameMs = 0;
  private drawMs = 0;
  private frameCpuMs = 0;
  private rafWaitMs = 0;
  private timerPulseMs = 0;
  private lastFrameFinishedAt: number | null = null;
  private lastTimerAt: number | null = null;
  private canvasProbeMode: CanvasProbeMode = 'normal';
  private webViewEngineVersion: string | null = null;
  private gpuApi: PerfSnapshot['gpuApi'] = 'unavailable';
  private gpuRenderer: string | null = null;
  private pageVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
  private pageFocused = typeof document === 'undefined' || document.hasFocus();
  private nativeFps: number | null = null;
  private nativeFrameMs: number | null = null;
  private nativeStaticCacheRedraws: number | null = null;
  private nativeStaticTriangles: number | null = null;
  private nativeDynamicTriangles: number | null = null;
  private nativeBridgeMs: number | null = null;
  private nativeDynamicCommands: number | null = null;
  private nativeSceneTargetHz: number | null = null;
  private offscreenDynamicFrameTimes: number[] = [];
  private offscreenDynamicRoundTripMs: number | null = null;
  private lastOffscreenDynamicCompletedAt: number | null = null;
  private fogMs = 0;
  private extras: Partial<PerfSnapshot> = {};

  constructor() {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;
    this.webViewEngineVersion = browserEngineVersion();
    this.detectGpuPath();

    // Timers and rAF use different schedulers in WebView2. A regular 16 ms
    // pulse distinguishes a compositor/rAF cadence issue from a host event
    // loop that is not waking the WebView promptly at all.
    this.lastTimerAt = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      if (this.lastTimerAt !== null) {
        this.timerPulseMs = now - this.lastTimerAt;
        this.pushRolling(this.timerPulseTimes, this.timerPulseMs);
      }
      this.lastTimerAt = now;
    }, 16);

    const refreshPageState = () => {
      this.pageVisible = document.visibilityState === 'visible';
      this.pageFocused = document.hasFocus();
    };
    document.addEventListener('visibilitychange', refreshPageState);
    window.addEventListener('focus', refreshPageState);
    window.addEventListener('blur', refreshPageState);

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          const now = performance.now();
          for (const entry of list.getEntries()) {
            this.longTasks.push({ startedAt: now, duration: entry.duration });
          }
          this.pruneLongTasks(now);
        });
        observer.observe({ type: 'longtask', buffered: true });
      } catch {
        // Long Tasks is Chromium-specific and optional. The probe remains
        // useful when a WebView runtime does not expose this entry type.
      }
    }
  }

  private pushRolling(values: number[], value: number) {
    values.push(value);
    if (values.length > ROLLING) values.shift();
  }

  private pruneLongTasks(now: number) {
    this.longTasks = this.longTasks.filter((task) => now - task.startedAt <= LONG_TASK_WINDOW_MS);
  }

  private detectGpuPath() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      this.gpuApi = gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL';
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      this.gpuRenderer = typeof renderer === 'string' && renderer.length > 0 ? renderer : null;
    } catch {
      // The WebGL probe is diagnostic only; Canvas2D rendering must remain
      // functional when GPU identification is restricted by the runtime.
    }
  }

  setCanvasProbeMode(mode: CanvasProbeMode) {
    if (this.canvasProbeMode === mode) return;
    this.canvasProbeMode = mode;
    this.frameTimes = [];
    this.rafWaitTimes = [];
    this.timerPulseTimes = [];
    this.frameMs = 0;
    this.drawMs = 0;
    this.frameCpuMs = 0;
    this.rafWaitMs = 0;
    this.timerPulseMs = 0;
    this.lastFrameFinishedAt = null;
  }

  recordFrame(totalMs: number) {
    this.frameMs = totalMs;
    this.frameTimes.push(totalMs);
    if (this.frameTimes.length > ROLLING) this.frameTimes.shift();
  }

  recordDraw(ms: number) {
    this.drawMs = ms;
  }

  /**
   * Commits a Canvas frame as one record so the overlay cannot combine draw
   * time from one rAF callback with callback time from another one.
   */
  recordCanvasWebViewFrame(
    frameIntervalMs: number,
    callbackStartedAt: number,
    drawStartedAt: number,
    callbackFinishedAt: number,
  ) {
    this.frameMs = frameIntervalMs;
    this.pushRolling(this.frameTimes, frameIntervalMs);
    this.drawMs = Math.max(0, callbackFinishedAt - drawStartedAt);
    this.recordWebViewFrame(callbackStartedAt, callbackFinishedAt);
  }

  /**
   * Canvas2D exposes no portable GPU-present fence. `rafWaitMs` is therefore
   * intentionally only the observable gap after JS yields until WebView
   * schedules the next animation callback.
   */
  recordWebViewFrame(callbackStartedAt: number, callbackFinishedAt: number) {
    this.frameCpuMs = Math.max(0, callbackFinishedAt - callbackStartedAt);
    this.rafWaitMs = this.lastFrameFinishedAt === null
      ? 0
      : Math.max(0, callbackStartedAt - this.lastFrameFinishedAt);
    if (this.lastFrameFinishedAt !== null) {
      this.pushRolling(this.rafWaitTimes, this.rafWaitMs);
    }
    this.lastFrameFinishedAt = callbackFinishedAt;
    this.pruneLongTasks(callbackFinishedAt);
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

  recordNativeSceneBridge(commandCount: number, elapsedMs: number) {
    this.nativeDynamicCommands = Math.max(0, Math.round(commandCount));
    this.nativeBridgeMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : null;
  }

  recordNativeSceneTargetHz(hz: number) {
    this.nativeSceneTargetHz = Number.isFinite(hz) ? Math.max(0, Math.round(hz)) : null;
  }

  recordOffscreenDynamicFrame(roundTripMs: number) {
    const now = performance.now();
    this.offscreenDynamicRoundTripMs = Number.isFinite(roundTripMs) ? Math.max(0, roundTripMs) : null;
    if (this.lastOffscreenDynamicCompletedAt !== null) {
      this.pushRolling(this.offscreenDynamicFrameTimes, now - this.lastOffscreenDynamicCompletedAt);
    }
    this.lastOffscreenDynamicCompletedAt = now;
  }

  recordFog(ms: number) {
    this.fogMs = ms;
  }

  setExtras(extras: Partial<PerfSnapshot>) {
    this.extras = extras;
  }

  getSnapshot(): PerfSnapshot {
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / (this.frameTimes.length || 1);
    const rafWaitP95Ms = percentile(this.rafWaitTimes, 0.95);
    const timerPulseAvgMs = average(this.timerPulseTimes);
    const longTaskMaxMs = this.longTasks.reduce((max, task) => Math.max(max, task.duration), 0);
    return {
      fps: Math.round(1000 / Math.max(1, avg)),
      frameMs: this.frameMs,
      avgFrameMs: avg,
      drawMs: this.drawMs,
      frameCpuMs: this.frameCpuMs,
      rafWaitMs: this.rafWaitMs,
      rafWaitP95Ms,
      timerPulseMs: this.timerPulseMs,
      timerPulseAvgMs,
      longTaskCount: this.longTasks.length,
      longTaskMaxMs,
      pageVisible: this.pageVisible,
      pageFocused: this.pageFocused,
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      hardwareConcurrency: typeof navigator === 'undefined' ? null : navigator.hardwareConcurrency ?? null,
      canvasProbeMode: this.canvasProbeMode,
      timingSamples: this.frameTimes.length,
      webViewEngineVersion: this.webViewEngineVersion,
      gpuApi: this.gpuApi,
      gpuRenderer: this.gpuRenderer,
      nativeFps: this.nativeFps,
      nativeFrameMs: this.nativeFrameMs,
      nativeStaticCacheRedraws: this.nativeStaticCacheRedraws,
      nativeStaticTriangles: this.nativeStaticTriangles,
      nativeDynamicTriangles: this.nativeDynamicTriangles,
      nativeBridgeMs: this.nativeBridgeMs,
      nativeDynamicCommands: this.nativeDynamicCommands,
      nativeSceneTargetHz: this.nativeSceneTargetHz,
      offscreenDynamicFps: this.offscreenDynamicFrameTimes.length > 0
        ? Math.round(1000 / Math.max(1, average(this.offscreenDynamicFrameTimes)))
        : null,
      offscreenDynamicRoundTripMs: this.offscreenDynamicRoundTripMs,
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

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / (values.length || 1);
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.floor((values.length - 1) * ratio));
  return [...values].sort((a, b) => a - b)[index];
}

function browserEngineVersion() {
  if (typeof navigator === 'undefined') return null;
  const match = navigator.userAgent.match(/(?:Edg|Chrome)\/([\d.]+)/);
  return match?.[1] ?? null;
}

export const perfMonitor = new PerformanceMonitor();
