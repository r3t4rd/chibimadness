import React, { useEffect, useState } from 'react';
import { perfMonitor, PerfSnapshot } from '../game/performanceMonitor';

interface DebugOverlayProps {
  visible?: boolean;
  nativeWorldActive?: boolean;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ visible = true, nativeWorldActive = false }) => {
  const [stats, setStats] = useState<PerfSnapshot>(() => perfMonitor.getSnapshot());

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setStats(perfMonitor.getSnapshot()), 200);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const frameColor =
    stats.frameMs > 33 ? 'text-rose-400' : stats.frameMs > 20 ? 'text-amber-300' : 'text-emerald-400';
  const pacingDiagnosis = !stats.pageVisible || !stats.pageFocused
    ? 'page is not foreground'
    : stats.longTaskMaxMs >= 50
      ? 'main-thread long task'
      : stats.rafWaitP95Ms > 40 && stats.timerPulseAvgMs <= 32
        ? 'rAF/compositor pacing'
        : stats.rafWaitP95Ms > 40 && stats.timerPulseAvgMs > 40
          ? 'host event-loop throttle'
          : 'no pacing throttle seen';
  const pacingColor = pacingDiagnosis === 'no pacing throttle seen'
    ? 'text-emerald-300'
    : pacingDiagnosis === 'rAF/compositor pacing'
      ? 'text-amber-300'
      : 'text-rose-300';

  return (
    <div className="fixed top-3 right-3 z-[60] pointer-events-none select-none font-mono text-[10px] leading-relaxed">
      <div className="rounded-lg border border-white/10 bg-black/70 backdrop-blur-md px-3 py-2 text-slate-200 shadow-lg min-w-[232px]">
        <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">WebView A/B timing</div>
        <div className={`font-bold text-sm ${frameColor}`}>
          {stats.fps} FPS
          <span className="text-slate-400 font-normal text-[10px] ml-1.5">
            {stats.frameMs.toFixed(1)} ms
          </span>
        </div>
        <div className="text-slate-400">
          avg {stats.avgFrameMs.toFixed(1)} ms · rAF p95 {stats.rafWaitP95Ms.toFixed(1)} ms
        </div>
        <div className="mt-1 pt-1 border-t border-white/10 space-y-0.5">
          <div className="text-cyan-300">
            mode {stats.canvasProbeMode} · {stats.timingSamples}/60 samples · F8 cycle
          </div>
          <div>callback {stats.frameCpuMs.toFixed(1)} ms · draw {stats.drawMs.toFixed(1)} ms</div>
          <div className={stats.rafWaitMs > 33 ? 'text-amber-300' : 'text-slate-400'}>
            rAF wait {stats.rafWaitMs.toFixed(1)} ms <span className="text-slate-500">after JS yields</span>
          </div>
          <div className={stats.timerPulseAvgMs > 32 ? 'text-amber-300' : 'text-slate-400'}>
            16ms timer {stats.timerPulseMs.toFixed(1)} ms · avg {stats.timerPulseAvgMs.toFixed(1)} ms
          </div>
          <div className={stats.longTaskCount > 0 ? 'text-amber-300' : 'text-slate-400'}>
            long tasks {stats.longTaskCount}/5s · max {stats.longTaskMaxMs.toFixed(1)} ms
          </div>
          <div className="text-slate-500">
            {stats.pageVisible ? 'visible' : 'hidden'} · {stats.pageFocused ? 'focused' : 'blurred'} · DPR {stats.devicePixelRatio.toFixed(2)} · {stats.hardwareConcurrency ?? '?'} cores
          </div>
          <div className="text-slate-500">
            {stats.gpuApi} · Edge {stats.webViewEngineVersion ?? '?'}
          </div>
          {stats.gpuRenderer && (
            <div className="max-w-[256px] break-words text-slate-600">
              GPU {stats.gpuRenderer}
            </div>
          )}
          <div className={`font-medium ${pacingColor}`}>probe: {pacingDiagnosis}</div>
          {stats.nativeFps !== null && stats.nativeFrameMs !== null && (
            <div className="text-cyan-300">
              native {stats.nativeFps} FPS {stats.nativeFrameMs.toFixed(1)} ms
            </div>
          )}
          {stats.nativeStaticCacheRedraws !== null && (
            <div className="text-slate-400">
              cache {stats.nativeStaticCacheRedraws}/0.5s · static {(stats.nativeStaticTriangles ?? 0).toLocaleString()} △ · dyn {(stats.nativeDynamicTriangles ?? 0).toLocaleString()} △
            </div>
          )}
          {stats.nativeBridgeMs !== null && (
            <div className={stats.nativeBridgeMs > 4 ? 'text-amber-300' : 'text-slate-400'}>
              bridge {stats.nativeBridgeMs.toFixed(1)} ms · {(stats.nativeDynamicCommands ?? 0).toLocaleString()} cmd · {stats.nativeSceneTargetHz ?? 0} Hz
            </div>
          )}
          {!nativeWorldActive && stats.offscreenDynamicFps !== null && (
            <div className="text-cyan-300">
              worker dyn {stats.offscreenDynamicFps} Hz · RTT {(stats.offscreenDynamicRoundTripMs ?? 0).toFixed(1)} ms · raster {(stats.dynamicRasterScale * 100).toFixed(0)}% · F9 scale
            </div>
          )}
          <div className={nativeWorldActive || stats.webglHordeMobBodies ? 'text-emerald-300' : 'text-slate-500'}>
            actor bodies {nativeWorldActive
              ? `WGPU atlas + primitives · ${stats.monsters} mobs`
              : stats.webglHordeMobBodies
                ? `WebGL2 ${stats.webglMonsterBodies}/${stats.monsters} mobs`
                : 'Canvas fallback'}
            {!nativeWorldActive && ' · F10 toggle'}
          </div>
          {!nativeWorldActive && (
            <div className="text-slate-400">
              layers: static {stats.staticWorldLayerEnabled ? 'on' : 'off'} F6 · dynamic {stats.dynamicCanvasLayerEnabled ? 'on' : 'off'} F7
            </div>
          )}
          <div className={nativeWorldActive || stats.webglStaticWorldActive ? 'text-emerald-300' : 'text-amber-300'}>
            world {nativeWorldActive
              ? 'native active'
              : !stats.staticWorldLayerEnabled
                ? 'off'
                : stats.webglStaticWorldActive
                  ? 'WebGL texture active'
                  : stats.forceStaticCanvas
                    ? 'Canvas present forced'
                    : 'Canvas fallback'} · F5 path
          </div>
          <div>zoom {stats.zoom.toFixed(2)}x</div>
          <div>
            {stats.canvasW}×{stats.canvasH}
          </div>
        </div>
        <div className="mt-1 pt-1 border-t border-white/10 space-y-0.5 text-slate-400">
          <div>mobs {stats.monsters}</div>
          <div>fx {stats.particles}</div>
          <div>proj {stats.projectiles}</div>
        </div>
      </div>
    </div>
  );
};
