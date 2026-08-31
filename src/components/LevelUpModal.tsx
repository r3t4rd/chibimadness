import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Player } from '../types/game';
import { EvolutionDef, EvolutionId, RARITY_STYLE, evoRank } from '../game/evolutions';
import { sound } from '../game/audioEngine';

interface LevelUpModalProps {
  player: Player;
  offers: EvolutionDef[];
  pending: number;
  onPick: (id: EvolutionId) => void;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({ player, offers, pending, onPick }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Digit1' && offers[0]) onPick(offers[0].id);
      if (e.code === 'Digit2' && offers[1]) onPick(offers[1].id);
      if (e.code === 'Digit3' && offers[2]) onPick(offers[2].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offers, onPick]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/78 backdrop-blur-md p-3 font-sans">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_rgba(251,191,36,0.18),_transparent_60%)]" />
      <div className="relative w-full max-w-5xl">
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-[11px] tracking-[0.2em] uppercase">
            LEVEL UP
          </div>
          <h2 className="mt-2 font-['Anton',sans-serif] text-4xl sm:text-5xl text-white italic tracking-wide drop-shadow-[0_4px_18px_rgba(251,191,36,0.55)]">
            ВЫБЕРИ ЭВОЛЮЦИЮ
          </h2>
          <p className="text-amber-200/90 text-xs font-mono mt-1">
            LVL {player.stats.level} · осталось выборов: {pending} · клавиши [1] [2] [3]
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {offers.map((def, i) => {
            const style = RARITY_STYLE[def.rarity];
            const have = evoRank(player, def.id);
            const nextRank = have + 1;
            return (
              <motion.button
                key={def.id}
                type="button"
                initial={{ opacity: 0, y: 24, rotate: i === 0 ? -2 : i === 2 ? 2 : 0 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 22 }}
                onClick={() => {
                  sound.playLevelUp();
                  onPick(def.id);
                }}
                className={`relative text-left rounded-3xl border-2 ${style.border} ${style.glow} bg-zinc-950/90 p-4 cursor-pointer hover:-translate-y-1.5 hover:scale-[1.02] transition-transform`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-4xl drop-shadow-md">{def.icon}</span>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full ${style.chip}`}>
                      {style.label}
                    </span>
                    <span className="text-[10px] font-mono text-white/50">[{i + 1}]</span>
                  </div>
                </div>
                <h3 className="mt-3 font-['Fredoka'] font-black text-lg text-white leading-tight">{def.name}</h3>
                <p className="text-[10px] font-mono text-amber-300/80 tracking-wider mt-0.5">{def.nameEn}</p>
                <p className="text-[11px] text-zinc-300 mt-2 font-medium leading-snug">{def.tagline}</p>
                <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">{def.descFor(have)}</p>
                <div className="mt-3 flex items-center gap-1.5">
                  {Array.from({ length: def.maxRank }).map((_, pip) => (
                    <span
                      key={pip}
                      className={`h-1.5 flex-1 rounded-full ${
                        pip < nextRank ? 'bg-amber-300' : 'bg-white/15'
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] font-mono text-white/50">
                  {have > 0 ? `РАНГ ${have} → ${nextRank}` : 'НОВЫЙ'}
                </p>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
