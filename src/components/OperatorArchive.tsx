import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, RotateCcw, Trash2, Plus, Shield, Zap, Sparkles } from 'lucide-react';
import { Player } from '../types/game';
import { CLASS_DEFAULTS } from '../game/constants';
import { drawChibiCharacter } from '../game/chibiRenderer';
import {
  deleteOperator,
  listOperators,
  resetOperator,
  saveToPlayer,
  type SavedOperator,
} from '../game/characterSave';
import { ownedEvolutions } from '../game/evolutions';
import { sound } from '../game/audioEngine';

interface OperatorArchiveProps {
  onContinue: (player: Player) => void;
  onNew: () => void;
}

const CLASS_ICON: Record<string, React.ReactNode> = {
  gunslinger: <Zap size={12} />,
  swordmaster: <Shield size={12} />,
  cybermage: <Sparkles size={12} />,
};

const ArchivePortrait: React.FC<{ save: SavedOperator }> = ({ save }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const player = saveToPlayer(save);
    player.hideWeapon = true;
    const start = performance.now();
    const render = (t: number) => {
      const elapsed = (t - start) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2 + 18);
      ctx.scale(1.15, 1.15);
      drawChibiCharacter(ctx, player, elapsed, true);
      ctx.restore();
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [save]);

  return <canvas ref={canvasRef} width={160} height={170} className="w-[140px] h-[148px]" />;
};

export const OperatorArchive: React.FC<OperatorArchiveProps> = ({ onContinue, onNew }) => {
  const [saves, setSaves] = useState<SavedOperator[]>(() => listOperators());
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = () => setSaves(listOperators());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-3 sm:p-6 overflow-y-auto font-mono">
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute -top-8 -left-6 text-[140px] font-['Anton',sans-serif] font-black text-red-500 italic tracking-widest uppercase">
          ARCHIVE
        </div>
        <div className="absolute -bottom-10 -right-8 text-[160px] font-['Anton',sans-serif] font-black text-white italic uppercase">
          NULLSPACE
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-5xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-black tracking-[0.22em] text-red-500 uppercase">OPERATOR ARCHIVE // SAVE SLOTS</p>
            <h1 className="font-['Anton',sans-serif] text-4xl sm:text-5xl text-white italic tracking-wide">
              ВЫБЕРИ ОПЕРАТОРА
            </h1>
            <p className="text-zinc-400 text-xs mt-1">
              Продолжи с уровнем и эволюциями — или сбрось прокачку, оставив внешность.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              sound.playPickup();
              onNew();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest border border-red-400 cursor-pointer"
          >
            <Plus size={14} />
            Новый оператор
          </button>
        </div>

        {saves.length === 0 ? (
          <div className="border border-zinc-800 bg-zinc-950/80 p-10 text-center text-zinc-400 text-sm">
            Архив пуст. Собери первого оператора.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {saves.map((save) => {
              const cls = CLASS_DEFAULTS[save.characterClass];
              const evoCount = Object.values(save.evolutions || {}).reduce((a: number, b) => a + (Number(b) || 0), 0);
              const owned = ownedEvolutions(saveToPlayer(save)).slice(0, 6);
              return (
                <div
                  key={save.id}
                  className="bg-zinc-950/90 border border-red-900/50 hover:border-red-500/70 p-3 flex flex-col shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0 bg-black/60 border border-zinc-800">
                      <ArchivePortrait save={save} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400">
                        {CLASS_ICON[save.characterClass]}
                        {cls.name}
                      </div>
                      <h3 className="text-white font-black text-lg italic uppercase truncate">{save.name}</h3>
                      <p className="text-[11px] font-mono text-amber-300">
                        LVL {save.stats.level} · {save.stats.exp}/{save.stats.maxExp} XP
                      </p>
                      <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        {save.gold}G · {evoCount} эволюций
                      </p>
                      {owned.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {owned.map(({ def, rank }) => (
                            <span
                              key={def.id}
                              title={`${def.name} ${rank}`}
                              className="text-[11px] bg-zinc-900 border border-zinc-700 px-1 rounded-sm"
                            >
                              {def.icon}
                              <span className="text-[9px] text-amber-300 ml-0.5">{rank}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playDanceJingle();
                        onContinue(saveToPlayer(save));
                      }}
                      className="col-span-2 flex items-center justify-center gap-2 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer"
                    >
                      <Play size={13} />
                      Продолжить
                    </button>
                    {confirmReset === save.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playHit(true);
                          onContinue(resetOperator(save));
                        }}
                        className="flex items-center justify-center gap-1 py-2 bg-rose-600 text-white font-black text-[10px] uppercase cursor-pointer"
                      >
                        Точно сбросить?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmReset(save.id);
                          setConfirmDelete(null);
                        }}
                        className="flex items-center justify-center gap-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-[10px] uppercase cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        Сброс уровня
                      </button>
                    )}
                    {confirmDelete === save.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          deleteOperator(save.id);
                          refresh();
                          setConfirmDelete(null);
                        }}
                        className="flex items-center justify-center gap-1 py-2 bg-red-700 text-white font-black text-[10px] uppercase cursor-pointer"
                      >
                        Удалить навсегда
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(save.id);
                          setConfirmReset(null);
                        }}
                        className="flex items-center justify-center gap-1 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-black text-[10px] uppercase cursor-pointer"
                      >
                        <Trash2 size={11} />
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};
