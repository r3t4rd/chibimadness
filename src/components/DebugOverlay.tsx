import React, { useEffect, useState } from 'react';
import { perfMonitor, PerfSnapshot } from '../game/performanceMonitor';

interface DebugOverlayProps {
  visible?: boolean;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ visible = true }) => {
  const [stats, setStats] = useState<PerfSnapshot>(() => perfMonitor.getSnapshot());

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setStats(perfMonitor.getSnapshot()), 200);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const frameColor =
    stats.frameMs > 33 ? 'text-rose-400' : stats.frameMs > 20 ? 'text-amber-300' : 'text-emerald-400';

  return (
    <div className="fixed top-3 right-3 z-[60] pointer-events-none select-none font-mono text-[10px] leading-relaxed">
      <div className="rounded-lg border border-white/10 bg-black/70 backdrop-blur-md px-3 py-2 text-slate-200 shadow-lg min-w-[148px]">
        <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Debug</div>
        <div className={`font-bold text-sm ${frameColor}`}>
          {stats.fps} FPS
          <span className="text-slate-400 font-normal text-[10px] ml-1.5">
            {stats.frameMs.toFixed(1)} ms
          </span>
        </div>
        <div className="text-slate-400">
          avg {stats.avgFrameMs.toFixed(1)} ms
        </div>
        <div className="mt-1 pt-1 border-t border-white/10 space-y-0.5">
          <div>draw {stats.drawMs.toFixed(1)} ms</div>
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
