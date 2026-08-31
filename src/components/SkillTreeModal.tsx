import React from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, Plus, Zap, Heart, Crosshair } from 'lucide-react';
import { Player } from '../types/game';
import { ownedEvolutions } from '../game/evolutions';

interface SkillTreeModalProps {
  player: Player;
  onClose: () => void;
  onAllocateStat: (stat: 'str' | 'agi' | 'int' | 'vit') => void;
}

export const SkillTreeModal: React.FC<SkillTreeModalProps> = ({ player, onClose, onAllocateStat }) => {
  const { stats, skills } = player;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl bg-white/40 backdrop-blur-2xl border-2 border-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] p-6 sm:p-8 relative max-h-[85vh] overflow-y-auto ring-1 ring-black/5"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-2xl bg-white/60 hover:bg-white/90 border border-white text-gray-700 hover:text-gray-900 shadow-xs transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-black/5 gap-3">
          <div>
            <h2 className="font-['Fredoka'] text-2xl font-black text-gray-900 flex items-center gap-2">
              <Sparkles size={22} className="text-amber-500" />
              Talents & Attributes
            </h2>
            <p className="text-xs text-gray-600 font-medium">Allocate points to boost stats & unlock combat capabilities</p>
          </div>

          <div className="flex items-center gap-2 bg-white/60 px-4 py-2 rounded-2xl border border-white shadow-xs">
            <span className="text-xs text-gray-600 font-black uppercase tracking-wider">Available Points:</span>
            <span className="font-mono text-base font-black text-pink-600">{stats.statPoints}</span>
          </div>
        </div>

        {/* Stat Allocation Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {[
            {
              id: 'str',
              name: 'Strength (STR)',
              desc: 'Increases base Attack Power (+3 ATK) & Crit rate',
              val: stats.str,
              color: 'text-rose-600 border-rose-200 bg-rose-50/70',
              icon: Zap,
            },
            {
              id: 'agi',
              name: 'Agility (AGI)',
              desc: 'Boosts movement speed (+0.15 SPD) and Crit strike rate',
              val: stats.agi,
              color: 'text-blue-600 border-blue-200 bg-blue-50/70',
              icon: Crosshair,
            },
            {
              id: 'int',
              name: 'Intelligence (INT)',
              desc: 'Expands maximum Mana (+25 MP) and skill potency',
              val: stats.int,
              color: 'text-purple-600 border-purple-200 bg-purple-50/70',
              icon: Sparkles,
            },
            {
              id: 'vit',
              name: 'Vitality (VIT)',
              desc: 'Increases maximum Health (+45 HP) and defense (+2 DEF)',
              val: stats.vit,
              color: 'text-emerald-600 border-emerald-200 bg-emerald-50/70',
              icon: Heart,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl border-2 flex items-center justify-between gap-3 shadow-xs ${item.color}`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white/80 border border-white shadow-xs">
                    <Icon size={20} className={item.color.split(' ')[0]} />
                  </div>
                  <div>
                    <h4 className="font-['Fredoka'] font-black text-xs text-gray-900">{item.name}</h4>
                    <p className="text-[11px] text-gray-600 font-medium">{item.desc}</p>
                    <span className="text-xs font-mono font-black text-gray-800 mt-0.5 block">Level: {item.val}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={stats.statPoints <= 0}
                  onClick={() => onAllocateStat(item.id as any)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer border border-white/60 shadow-xs ${
                    stats.statPoints > 0
                      ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-md active:scale-95'
                      : 'bg-white/40 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Plus size={16} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Active Combat Skills Showcase */}
        <div className="mt-6">
          <h3 className="font-['Fredoka'] text-xs font-black text-gray-700 uppercase tracking-wider mb-3">
            Evolutions
          </h3>
          {ownedEvolutions(player).length === 0 ? (
            <p className="text-[11px] text-gray-500 font-medium mb-4">
              Качай уровень — на каждый LVL открывается выбор эволюции, как в Vampire Survivors.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {ownedEvolutions(player).map(({ def, rank }) => (
                <div key={def.id} className="p-2.5 rounded-2xl bg-white/45 border border-white shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{def.icon}</span>
                    <span className="text-[10px] font-mono font-black text-amber-600">
                      {rank}/{def.maxRank}
                    </span>
                  </div>
                  <h4 className="font-['Fredoka'] font-black text-[11px] text-gray-900 mt-1">{def.name}</h4>
                  <p className="text-[10px] text-gray-600 leading-snug">{def.tagline}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Combat Skills Showcase */}
        <div className="mt-6">
          <h3 className="font-['Fredoka'] text-xs font-black text-gray-700 uppercase tracking-wider mb-3">
            Active Combat Skills
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {skills.map((s, idx) => (
              <div key={s.id} className="p-4 rounded-2xl bg-white/45 backdrop-blur-xl border-2 border-white space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-2xl drop-shadow-xs">{s.icon}</span>
                  <span className="text-[10px] font-mono font-black bg-blue-50/80 px-2 py-0.5 rounded-lg text-blue-600 border border-blue-200">
                    Hotbar [{idx + 1}]
                  </span>
                </div>
                <div>
                  <h4 className="font-['Fredoka'] font-black text-xs text-gray-900">{s.name}</h4>
                  <p className="text-[11px] text-gray-600 mt-0.5 font-medium">{s.description}</p>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono font-bold text-gray-600 border-t border-black/5 pt-2">
                  <span>💧 {s.costMp} MP</span>
                  <span>⏳ {s.cooldown}s CD</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

