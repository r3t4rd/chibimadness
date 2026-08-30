import React from 'react';
import { motion } from 'motion/react';
import { Skull } from 'lucide-react';
import { Monster } from '../types/game';

interface BossBarProps {
  boss: Monster | null;
}

export const BossBar: React.FC<BossBarProps> = ({ boss }) => {
  if (!boss || boss.hp <= 0) return null;

  const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-white/40 backdrop-blur-2xl border-2 border-white rounded-[28px] p-3.5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.2)] flex flex-col gap-1.5 ring-1 ring-black/5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-rose-500 text-white flex items-center justify-center border-2 border-white shadow-xs">
              <Skull size={15} className="animate-pulse" />
            </div>
            <span className="font-['Fredoka'] font-black text-gray-900 text-sm tracking-tight">{boss.name}</span>
          </div>
          <span className="font-mono text-xs font-black text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-full border border-rose-300">
            {boss.hp} / {boss.maxHp} HP
          </span>
        </div>

        {/* Boss HP Gauge */}
        <div className="relative w-full h-3.5 bg-black/10 rounded-full overflow-hidden border border-white/60 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 rounded-full transition-all duration-200"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </motion.div>
    </div>
  );
};

