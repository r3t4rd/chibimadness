import React from 'react';
import {
  Volume2,
  VolumeX,
  Map as MapIcon,
  Award,
  Zap,
  Footprints,
  Crosshair,
} from 'lucide-react';
import { Player, QuestProgress, GunType } from '../types/game';
import { ZONES, QUESTS_DATABASE } from '../game/constants';

interface HUDProps {
  player: Player;
  onOpenModal: (modal: 'inventory' | 'craft' | 'shop' | 'skills' | 'map') => void;
  onUseSkill: (idx: number) => void;
  onSwitchWeapon?: (gunType: GunType) => void;
  onToggleVehicle: () => void;
  onJump?: () => void;
  onAttack?: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onlineCount: number;
}

const WEAPONS_LIST: { type: GunType; key: string; name: string; icon: string }[] = [
  { type: 'pistol', key: '1', name: 'Pistol', icon: '🔫' },
  { type: 'revolver', key: '2', name: 'Revolver', icon: '🤠' },
  { type: 'mac10', key: '3', name: 'MAC-10', icon: '⚡' },
  { type: 'ak47', key: '4', name: 'AK-47', icon: '🔥' },
  { type: 'shotgun', key: '5', name: 'Shotgun', icon: '💥' },
  { type: 'cheytac', key: '6', name: 'CheyTac', icon: '🎯' },
];

export const HUD: React.FC<HUDProps> = ({
  player,
  onOpenModal,
  onUseSkill,
  onSwitchWeapon,
  onToggleVehicle,
  onJump,
  onAttack,
  isMuted,
  onToggleMute,
  onlineCount,
}) => {
  const {
    stats,
    gold,
    skills,
    isRiding,
    activeQuests,
    equipment,
    bhopStreak = 0,
  } = player;

  const activeGunType: GunType = equipment.weapon?.gunType || 'pistol';
  const hpRatio = Math.max(0, Math.min(1, stats.hp / stats.maxHp));
  const expRatio = Math.max(0, Math.min(1, stats.exp / stats.maxExp));

  const currentZoneData =
    ZONES.find((z) => {
      return (
        player.x >= z.bounds.minX &&
        player.x <= z.bounds.maxX &&
        player.y >= z.bounds.minY &&
        player.y <= z.bounds.maxY
      );
    }) || ZONES[0];

  const activeQuestList = (Object.values(activeQuests) as QuestProgress[])
    .filter((q) => q.status === 'active' || q.status === 'completed')
    .map((q) => ({
      quest: QUESTS_DATABASE[q.questId],
      progress: q,
    }))
    .filter((q) => !!q.quest);

  return (
    <>
      {/* 1. TOP EDGE FULL-WIDTH EXP PROGRESS BAR */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-white/10 z-50 pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-200 transition-all duration-200 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
          style={{ width: `${expRatio * 100}%` }}
        />
      </div>

      {/* 2. TOP-LEFT BORDERLESS EXP & LEVEL DISPLAY */}
      <div className="fixed top-2.5 left-4 z-40 flex items-center gap-3 text-xs font-mono font-bold text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] select-none pointer-events-none">
        <span className="text-amber-400">LVL {stats.level}</span>
        <span className="text-white/40">·</span>
        <span className="text-slate-300">{stats.exp} / {stats.maxExp} EXP</span>
        <span className="text-white/40">·</span>
        <span className="text-amber-300">🪙 {gold}G</span>
        <span className="text-white/40">·</span>
        <span className="text-rose-400">{stats.hp}/{stats.maxHp} HP</span>
      </div>

      {/* 3. TOP-CENTER MINIMALIST ZONE & BHOP STREAK */}
      <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 select-none pointer-events-none">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-[11px] font-mono text-slate-300 border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{currentZoneData.name}</span>
          <span className="text-white/30">|</span>
          <span>{onlineCount} online</span>
        </div>

        {bhopStreak >= 2 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/80 backdrop-blur-md text-[11px] font-mono font-bold text-slate-950 shadow-sm animate-pulse">
            <span>BHOP x{bhopStreak}</span>
            <span>(+{bhopStreak * 12}%)</span>
          </div>
        )}
      </div>

      {/* 4. TOP-RIGHT MINIMAL MENU & QUEST TRACKER */}
      <div className="fixed top-2.5 right-4 z-40 flex items-center gap-2 select-none pointer-events-auto">
        <button
          type="button"
          onClick={onToggleMute}
          className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-md text-white/80 border border-white/10 transition-all cursor-pointer"
          title="Toggle Audio"
        >
          {isMuted ? <VolumeX size={15} className="text-rose-400" /> : <Volume2 size={15} className="text-emerald-400" />}
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('map')}
          className="px-2.5 py-1 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-md text-xs font-mono text-white/90 border border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
        >
          <MapIcon size={13} className="text-sky-400" />
          <span>Map [M]</span>
        </button>
      </div>

      {/* FLOATING BORDERLESS QUEST OBJECTIVES (TOP-RIGHT) */}
      {activeQuestList.length > 0 && (
        <div className="fixed top-12 right-4 z-30 pointer-events-none max-w-xs space-y-1.5 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {activeQuestList.map(({ quest, progress }) => (
            <div key={quest.id} className="text-right font-mono">
              <div className="text-xs font-bold text-amber-300">
                {quest.title} {progress.status === 'completed' && '✓'}
              </div>
              {progress.objectives.map((obj, i) => (
                <div key={i} className="text-[10px] text-slate-300">
                  {obj.targetName}: {obj.current} / {obj.required}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 5. BOTTOM MINIMALIST WEAPON ARSENAL & SKILL HOTBAR */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 select-none pointer-events-auto">
        {/* WEAPONS DOCK [1] - [6] */}
        <div className="flex items-center gap-1 bg-black/50 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-lg">
          {WEAPONS_LIST.map((w) => {
            const isActive = activeGunType === w.type;
            return (
              <button
                key={w.type}
                type="button"
                onClick={() => onSwitchWeapon && onSwitchWeapon(w.type)}
                className={`relative px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer flex flex-col items-center justify-center min-w-[42px] ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 font-black shadow-md scale-105'
                    : 'bg-white/5 hover:bg-white/15 text-white/80'
                }`}
                title={`Equip ${w.name} [${w.key}]`}
              >
                <span className="text-sm">{w.icon}</span>
                <span className="text-[9px] opacity-80">[{w.key}]</span>
              </button>
            );
          })}
        </div>

        {/* SKILLS DOCK [Q], [E], [R] */}
        <div className="flex items-center gap-1 bg-black/50 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-lg">
          {skills.map((s, idx) => {
            const keyLetters = ['Q', 'E', 'R'];
            const now = Date.now();
            const cdRemaining = Math.max(0, Math.ceil((s.cooldown * 1000 - (now - s.lastUsed)) / 1000));
            const onCd = cdRemaining > 0;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onUseSkill(idx)}
                disabled={onCd}
                className={`relative px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer flex flex-col items-center justify-center min-w-[42px] ${
                  onCd
                    ? 'bg-slate-800/80 text-slate-500'
                    : 'bg-white/10 hover:bg-white/20 text-white font-bold hover:scale-105'
                }`}
                title={`${s.name} [${keyLetters[idx]}]`}
              >
                <span className="text-sm">{s.icon}</span>
                <span className="text-[9px] opacity-80">[{keyLetters[idx]}]</span>

                {onCd && (
                  <div className="absolute inset-0 bg-black/70 rounded-xl flex items-center justify-center text-[10px] font-mono font-bold text-amber-300">
                    {cdRemaining}s
                  </div>
                )}
              </button>
            );
          })}

          {/* Mount Toggle [V] */}
          <button
            type="button"
            onClick={onToggleVehicle}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer flex flex-col items-center justify-center min-w-[42px] ${
              isRiding ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Mount [V]"
          >
            <span className="text-sm">🛹</span>
            <span className="text-[9px] opacity-80">[V]</span>
          </button>
        </div>

        {/* UTILITY MODALS [I], [B], [K] */}
        <div className="hidden sm:flex items-center gap-1 bg-black/50 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => onOpenModal('inventory')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/15 text-white/80 transition-all cursor-pointer flex flex-col items-center min-w-[38px]"
            title="Bag [I]"
          >
            <span className="text-sm">🎒</span>
            <span className="text-[9px] opacity-70">[I]</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('craft')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/15 text-white/80 transition-all cursor-pointer flex flex-col items-center min-w-[38px]"
            title="Craft [B]"
          >
            <span className="text-sm">🛠️</span>
            <span className="text-[9px] opacity-70">[B]</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('skills')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/15 text-white/80 transition-all cursor-pointer flex flex-col items-center min-w-[38px]"
            title="Talents [K]"
          >
            <span className="text-sm">✨</span>
            <span className="text-[9px] opacity-70">[K]</span>
          </button>
        </div>
      </div>
    </>
  );
};
