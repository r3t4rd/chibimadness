import React from 'react';
import {
  Volume2,
  VolumeX,
  Map as MapIcon,
} from 'lucide-react';
import { Player, QuestProgress, GunType } from '../types/game';
import { ZONES, QUESTS_DATABASE, CLASS_HOTBAR } from '../game/constants';
import { formatGameTime, getTimeOfDayLabel } from '../game/fogOfWar';
import { getBuilding } from '../game/buildings';
import { HandheldWeaponHUD } from './HandheldWeaponHUD';
import { formatHordeTime, type HordeRunState } from '../game/hordeMode';

interface HUDProps {
  player: Player;
  gameTimePhase?: number;
  nearbyNpcName?: string;
  onOpenModal: (modal: 'inventory' | 'craft' | 'shop' | 'skills' | 'map') => void;
  onUseSkill: (idx: number) => void;
  onSwitchWeapon?: (gunType: GunType) => void;
  onReload?: () => void;
  onToggleVehicle: () => void;
  onJump?: () => void;
  onAttack?: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onlineCount: number;
  onOpenGunsmith?: () => void;
  hordeRun?: HordeRunState;
  onExtractHorde?: () => void;
}

const WEAPON_META: Record<
  string,
  { name: string; icon: string; rotation: string; translateY: string; clipPath: string; tapeRotation: string }
> = {
  pistol: { name: 'Pistol', icon: '🔫', rotation: '-3.5deg', translateY: '2px', clipPath: 'polygon(0% 4px, 4px 0%, 96% 2px, 100% 8px, 97% 95%, 93% 100%, 3% 97%, 0% 92%)', tapeRotation: '-6deg' },
  revolver: { name: 'Revolver', icon: '🤠', rotation: '4.0deg', translateY: '-3px', clipPath: 'polygon(2% 0%, 98% 3px, 100% 92%, 96% 99%, 4% 96%, 0% 88%, 0% 6px)', tapeRotation: '5deg' },
  mac10: { name: 'MAC-10', icon: '⚡', rotation: '-2.0deg', translateY: '3px', clipPath: 'polygon(0% 2px, 95% 0%, 100% 6px, 98% 97%, 92% 100%, 5% 94%, 0% 96%)', tapeRotation: '-4deg' },
  ak47: { name: 'AK-47', icon: '🔥', rotation: '3.5deg', translateY: '-2px', clipPath: 'polygon(3% 0%, 97% 2px, 100% 94%, 95% 100%, 3% 98%, 0% 90%, 0% 4px)', tapeRotation: '7deg' },
  shotgun: { name: 'Shotgun', icon: '💥', rotation: '-4.2deg', translateY: '4px', clipPath: 'polygon(0% 5px, 6px 0%, 96% 0%, 100% 4px, 97% 93%, 91% 100%, 2% 96%, 0% 90%)', tapeRotation: '-5deg' },
  cheytac: { name: 'CheyTac', icon: '🎯', rotation: '2.8deg', translateY: '-1px', clipPath: 'polygon(2% 2px, 98% 0%, 100% 92%, 94% 98%, 4% 100%, 0% 95%, 0% 8px)', tapeRotation: '4deg' },
  throwing_knives: { name: 'Knives', icon: '🔪', rotation: '-3deg', translateY: '2px', clipPath: 'polygon(0% 4px, 4px 0%, 96% 2px, 100% 8px, 97% 95%, 93% 100%, 3% 97%, 0% 92%)', tapeRotation: '-5deg' },
  katana: { name: 'Katana', icon: '🗡️', rotation: '3deg', translateY: '-2px', clipPath: 'polygon(2% 0%, 98% 3px, 100% 92%, 96% 99%, 4% 96%, 0% 88%, 0% 6px)', tapeRotation: '4deg' },
  scythe: { name: 'Scythe', icon: '🪓', rotation: '-2deg', translateY: '3px', clipPath: 'polygon(0% 2px, 95% 0%, 100% 6px, 98% 97%, 92% 100%, 5% 94%, 0% 96%)', tapeRotation: '-4deg' },
  greatsword: { name: 'Zweihander', icon: '⚔️', rotation: '4deg', translateY: '-1px', clipPath: 'polygon(3% 0%, 97% 2px, 100% 94%, 95% 100%, 3% 98%, 0% 90%, 0% 4px)', tapeRotation: '6deg' },
  staff: { name: 'Fireball', icon: '🔥', rotation: '-3deg', translateY: '2px', clipPath: 'polygon(0% 4px, 4px 0%, 96% 2px, 100% 8px, 97% 95%, 93% 100%, 3% 97%, 0% 92%)', tapeRotation: '-6deg' },
  wand: { name: 'Sparks', icon: '✨', rotation: '3deg', translateY: '-2px', clipPath: 'polygon(2% 0%, 98% 3px, 100% 92%, 96% 99%, 4% 96%, 0% 88%, 0% 6px)', tapeRotation: '5deg' },
  grimoire: { name: 'Meteor', icon: '☄️', rotation: '-2deg', translateY: '3px', clipPath: 'polygon(0% 2px, 95% 0%, 100% 6px, 98% 97%, 92% 100%, 5% 94%, 0% 96%)', tapeRotation: '-4deg' },
  totem: { name: 'Hex', icon: '💀', rotation: '3.5deg', translateY: '-1px', clipPath: 'polygon(3% 0%, 97% 2px, 100% 94%, 95% 100%, 3% 98%, 0% 90%, 0% 4px)', tapeRotation: '7deg' },
};

const SKILLS_CONFIG: {
  keyLetter: string;
  rotation: string;
  translateY: string;
  clipPath: string;
}[] = [
  {
    keyLetter: 'Q',
    rotation: '-4.0deg',
    translateY: '-2px',
    clipPath: 'polygon(2% 0%, 97% 4px, 100% 92%, 94% 100%, 0% 96%)',
  },
  {
    keyLetter: 'E',
    rotation: '3.0deg',
    translateY: '3px',
    clipPath: 'polygon(0% 4px, 4px 0%, 98% 0%, 100% 94%, 95% 100%, 3% 96%)',
  },
  {
    keyLetter: 'F',
    rotation: '-2.5deg',
    translateY: '-3px',
    clipPath: 'polygon(0% 0%, 96% 2px, 100% 92%, 92% 98%, 4% 100%, 0% 92%)',
  },
];

export const HUD: React.FC<HUDProps> = ({
  player,
  gameTimePhase = 0.35,
  nearbyNpcName,
  onOpenModal,
  onUseSkill,
  onSwitchWeapon,
  onReload,
  onToggleVehicle,
  isMuted,
  onToggleMute,
  onlineCount,
  onOpenGunsmith,
  hordeRun,
  onExtractHorde,
}) => {
  const {
    stats,
    gold,
    activeQuests,
    equipment,
    skills,
    isRiding,
    bhopStreak = 0,
    coolness = 0,
    coolStreak = 0,
    skateTrick,
    skateTrickTimer = 0,
  } = player;

  const activeGunType: GunType = equipment.weapon?.gunType || 'pistol';
  const classLoadout = CLASS_HOTBAR[player.characterClass] || CLASS_HOTBAR.gunslinger;
  const weaponsList = classLoadout.map((type, i) => ({
    type,
    key: String(i + 1),
    ...(WEAPON_META[type] || { name: type, icon: '•', rotation: '0deg', translateY: '0px', clipPath: 'none', tapeRotation: '0deg' }),
  }));
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

  const interiorBldg = player.interiorBuildingId ? getBuilding(player.interiorBuildingId) : undefined;
  const interiorFloorName = interiorBldg
    ? interiorBldg.floors[Math.max(0, Math.min(interiorBldg.floors.length - 1, player.interiorFloor ?? 0))]?.name
    : null;

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
      <div className="fixed top-0 left-0 right-0 h-1.5 bg-black/40 z-50 pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-200 transition-all duration-200 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
          style={{ width: `${expRatio * 100}%` }}
        />
      </div>

      {/* 2. TOP-LEFT BORDERLESS EXP & LEVEL DISPLAY */}
      <div className="fixed top-2.5 left-4 z-40 flex items-center gap-3 text-xs font-mono font-bold text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] select-none pointer-events-none">
        <span className="px-2 py-0.5 rounded-xs bg-amber-500/20 border border-amber-400/40 text-amber-300">
          LVL {stats.level}
        </span>
        <span className="text-white/40">·</span>
        <span className="text-slate-300">{stats.exp} / {stats.maxExp} EXP</span>
        <span className="text-white/40">·</span>
        <span className="text-amber-300">🪙 {gold}G</span>
        <span className="text-white/40">·</span>
        <span className="text-rose-400">{stats.hp}/{stats.maxHp} HP</span>
      </div>

      {/* 3. TOP-CENTER MINIMALIST ZONE & BHOP STREAK */}
      <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 select-none pointer-events-none">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] font-mono text-slate-200 border border-white/15 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{currentZoneData.name}</span>
          {interiorFloorName && (
            <>
              <span className="text-cyan-400/80">·</span>
              <span className="text-cyan-300">{interiorBldg?.shortName} · {interiorFloorName}</span>
            </>
          )}
          <span className="text-white/30">|</span>
          <span>{onlineCount} online</span>
          <span className="text-white/30">|</span>
          <span className="text-amber-200">{formatGameTime(gameTimePhase)}</span>
          <span className="text-slate-400 text-[10px]">{getTimeOfDayLabel(gameTimePhase)}</span>
        </div>

        {nearbyNpcName && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-pink-500/90 backdrop-blur-md text-[11px] font-['Fredoka'] font-black text-white shadow-md animate-pulse">
            <span>[E] Поговорить с {nearbyNpcName}</span>
          </div>
        )}

        {bhopStreak >= 2 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/90 backdrop-blur-md text-[11px] font-mono font-bold text-slate-950 shadow-md animate-pulse">
            <span>BHOP x{bhopStreak}</span>
            <span>(+{bhopStreak * 12}%)</span>
          </div>
        )}

        {coolness > 0 && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-md text-[11px] font-mono font-bold shadow-md ${
            coolStreak >= 3
              ? 'bg-fuchsia-500/95 text-white animate-pulse'
              : 'bg-pink-500/85 text-slate-950'
          }`}>
            <span>😎 {coolness}</span>
            {coolStreak >= 2 && <span>COMBO x{coolStreak}</span>}
            {skateTrick && skateTrickTimer > 0 && (
              <span className="uppercase tracking-wide">
                {skateTrick === 'treflip' ? 'TRE FLIP' : skateTrick === 'ollie' ? 'OLLIE' : skateTrick === 'mount_kickflip' ? 'MOUNT' : 'KICKFLIP'}
              </span>
            )}
          </div>
        )}
      </div>

      {hordeRun?.active && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1 select-none">
          <div className="px-4 py-1.5 rounded-full bg-cyan-950/85 backdrop-blur-md border border-cyan-400/40 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.35)] font-mono text-xs font-bold tracking-wide pointer-events-none">
            {formatHordeTime(hordeRun.elapsed)}
            <span className="text-white/30 mx-2">|</span>
            ☠ {hordeRun.kills}
            <span className="text-white/30 mx-2">|</span>
            ◆ {hordeRun.gemsCollected}
            <span className="text-white/30 mx-2">|</span>
            {hordeRun.currentMobName}
          </div>
          <div className="text-[10px] font-mono font-bold text-cyan-200/80 pointer-events-none">
            NEXT {hordeRun.nextMobName} {Math.max(0, Math.ceil(hordeRun.nextUnlockIn))}s
            <span className="text-white/30 mx-2">|</span>
            BOSS {Math.max(0, Math.ceil(hordeRun.nextBossIn))}s
          </div>
          {hordeRun.blindness?.active && (
            <div className="text-[10px] font-mono font-black text-fuchsia-300 animate-pulse bg-black/60 px-3 py-1 rounded-full border border-fuchsia-400/50">
              VISION NULL — kill the caster
            </div>
          )}
          {hordeRun.canExtract ? (
            <button
              type="button"
              onClick={onExtractHorde}
              className="text-[10px] font-mono font-bold text-amber-300 animate-pulse bg-black/50 px-3 py-1 rounded-full border border-amber-400/40 cursor-pointer pointer-events-auto"
            >
              [T] EXTRACT — leave with the spoils
            </button>
          ) : (
            <div className="text-[10px] font-mono font-bold text-slate-400 pointer-events-none">
              Survive to open the extract gate
            </div>
          )}
        </div>
      )}

      {/* 4. TOP-RIGHT MINIMAL MENU & QUEST TRACKER */}
      <div className="fixed top-2.5 right-4 z-40 flex items-center gap-2 select-none pointer-events-auto">
        <button
          type="button"
          onClick={onToggleMute}
          className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 backdrop-blur-md text-white/80 border border-white/15 transition-all cursor-pointer shadow-md"
          title="Toggle Audio"
        >
          {isMuted ? <VolumeX size={15} className="text-rose-400" /> : <Volume2 size={15} className="text-emerald-400" />}
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('map')}
          className="px-2.5 py-1 rounded-lg bg-black/50 hover:bg-black/70 backdrop-blur-md text-xs font-mono text-white/90 border border-white/15 transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
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

      {/* 5. FIRST-PERSON PAPER HANDS HOLDING WEAPON & AMMO VIEWPORT (BOTTOM-RIGHT) */}
      {player.characterClass === 'gunslinger' && (
      <HandheldWeaponHUD
        player={player}
        onReload={onReload}
        onOpenGunsmith={onOpenGunsmith}
      />
      )}

      {/* 6. TORN PAPER COLLAGE SCRAPS HOTBAR & UTILITY DOCK (BOTTOM-CENTER) */}
      <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-40 flex items-end gap-2.5 select-none pointer-events-auto">
        {/* ========================================================= */}
        {/* 6.1 WEAPONS SCRAPS DOCK [1] - [6]                         */}
        {/* ========================================================= */}
        <div className="flex items-end -space-x-1.5 p-1">
          {weaponsList.map((w, i) => {
            const isActive = activeGunType === w.type;
            return (
              <button
                key={w.type}
                type="button"
                onClick={() => onSwitchWeapon && onSwitchWeapon(w.type)}
                style={{
                  clipPath: w.clipPath,
                  transform: isActive
                    ? `translateY(-14px) rotate(${w.rotation}) scale(1.18)`
                    : `translateY(${w.translateY}) rotate(${w.rotation})`,
                  transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                className={`relative px-3 py-2 text-xs font-mono cursor-pointer flex flex-col items-center justify-center min-w-[52px] group ${
                  isActive
                    ? 'z-30 bg-gradient-to-b from-amber-400 via-rose-500 to-red-600 text-white font-black shadow-[0_0_24px_rgba(244,63,94,0.9),0_8px_16px_rgba(0,0,0,0.8)] ring-2 ring-amber-300'
                    : `z-${i + 1} bg-[#18181B] text-zinc-300 hover:text-white hover:-translate-y-2 hover:scale-108 hover:z-25 border-2 border-zinc-700 hover:border-amber-400 shadow-[0_6px_14px_rgba(0,0,0,0.7)]`
                }`}
                title={`Equip ${w.name} [${w.key}]`}
              >
                {/* Translucent Masking Tape Strip on top corner */}
                <div
                  style={{
                    transform: `rotate(${w.tapeRotation})`,
                    clipPath: 'polygon(0% 0%, 100% 5%, 95% 100%, 5% 95%)',
                  }}
                  className="absolute -top-2 left-2 px-1.5 py-0.2 bg-amber-100/35 border border-amber-200/40 text-[6px] font-mono text-amber-200/80 pointer-events-none select-none"
                >
                  TAPE
                </div>

                {/* Active "★ ACTIVE" Paper Tag */}
                {isActive && (
                  <div className="absolute -top-3 right-1 px-1.5 py-0.2 rounded-xs bg-amber-300 text-slate-950 font-black text-[7px] tracking-wider uppercase rotate-[6deg] shadow-sm animate-bounce">
                    ★ READY
                  </div>
                )}

                <div className="flex flex-col items-center mt-1">
                  <span className="text-lg drop-shadow-md group-hover:scale-110 transition-transform">
                    {w.icon}
                  </span>
                  {/* Ransom-note Typewriter Key Badge */}
                  <span
                    className={`text-[9px] font-black font-mono px-1.5 py-0.2 rounded-xs mt-0.5 border ${
                      isActive
                        ? 'bg-black text-amber-300 border-amber-300 shadow-xs'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-600 group-hover:text-amber-300 group-hover:border-amber-400'
                    }`}
                  >
                    [{w.key}]
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ========================================================= */}
        {/* 6.2 SKILLS & ACTIONS DOCK [Q], [E], [F], [SHIFT], [V]     */}
        {/* ========================================================= */}
        <div className="flex items-end -space-x-1.5 p-1">
          {skills.map((s, idx) => {
            const conf = SKILLS_CONFIG[idx] || SKILLS_CONFIG[0];
            const now = Date.now();
            const cdRemaining = Math.max(0, Math.ceil((s.cooldown * 1000 - (now - s.lastUsed)) / 1000));
            const onCd = cdRemaining > 0;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onUseSkill(idx)}
                disabled={onCd}
                style={{
                  clipPath: conf.clipPath,
                  transform: `translateY(${conf.translateY}) rotate(${conf.rotation})`,
                  transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                className={`relative px-3 py-2 text-xs font-mono cursor-pointer flex flex-col items-center justify-center min-w-[50px] shadow-[0_6px_14px_rgba(0,0,0,0.7)] group ${
                  onCd
                    ? 'z-0 bg-zinc-950/90 text-zinc-600 border-2 border-zinc-800'
                    : `z-${idx + 1} bg-[#18181B] hover:bg-zinc-800 text-white font-bold hover:-translate-y-2 hover:scale-108 hover:z-25 border-2 border-zinc-700 hover:border-amber-400 hover:shadow-[0_0_18px_rgba(245,158,11,0.6)]`
                }`}
                title={`${s.name} [${conf.keyLetter}]`}
              >
                {/* Top Tape Accent */}
                <div
                  style={{
                    transform: 'rotate(-4deg)',
                    clipPath: 'polygon(0% 0%, 100% 5%, 95% 100%, 5% 95%)',
                  }}
                  className="absolute -top-2 right-2 px-1.5 py-0.2 bg-amber-100/35 border border-amber-200/40 text-[6px] font-mono text-amber-200/80 pointer-events-none select-none"
                >
                  TAPE
                </div>

                <div className="flex flex-col items-center mt-1">
                  <span className="text-lg drop-shadow-md group-hover:scale-110 transition-transform">{s.icon}</span>
                  <span className="text-[9px] font-black font-mono px-1.5 py-0.2 rounded-xs mt-0.5 bg-zinc-900 text-amber-400 border border-zinc-600">
                    [{conf.keyLetter}]
                  </span>
                </div>

                {/* Pencil Crosshatch Cooldown Overlay */}
                {onCd && (
                  <div
                    className="absolute inset-0 bg-black/85 flex items-center justify-center text-xs font-mono font-black text-rose-400"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.15) 0, rgba(239, 68, 68, 0.15) 2px, transparent 0, transparent 6px)',
                    }}
                  >
                    <span className="px-1.5 py-0.5 rounded-xs bg-black/90 border border-rose-500/60 shadow-xs">
                      {cdRemaining}s
                    </span>
                  </div>
                )}
              </button>
            );
          })}

          {/* Dodge Slide / Air Dash [SHIFT] (Cyan Paper Sticker) */}
          <div
            style={{
              clipPath: 'polygon(3% 0%, 100% 3px, 97% 95%, 93% 100%, 0% 94%)',
              transform: (player.dodgeTimer || 0) > 0
                ? 'translateY(-10px) rotate(4.5deg) scale(1.15)'
                : 'translateY(1px) rotate(4.5deg)',
              transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            className={`relative px-3 py-2 text-xs font-mono flex flex-col items-center justify-center min-w-[50px] shadow-[0_6px_14px_rgba(0,0,0,0.7)] ${
              (player.dodgeTimer || 0) > 0
                ? 'z-30 bg-gradient-to-tr from-sky-500 to-cyan-400 text-slate-950 font-black shadow-[0_0_24px_rgba(56,189,248,0.95)] ring-2 ring-white'
                : 'z-10 bg-[#18181B] text-white/90 border-2 border-cyan-800/80 hover:border-cyan-400 hover:-translate-y-1.5'
            }`}
            title="Dodge Slide / Air Dash [SHIFT] (I-Frames)"
          >
            <div className="flex flex-col items-center mt-1">
              <span className="text-lg">💨</span>
              <span className="text-[9px] font-black font-mono px-1.5 py-0.2 rounded-xs mt-0.5 bg-zinc-900 text-cyan-400 border border-cyan-700">
                SHIFT
              </span>
            </div>
          </div>

          {/* Mount Toggle [V] (Yellow Skateboard Paper Sticker) */}
          <button
            type="button"
            onClick={onToggleVehicle}
            style={{
              clipPath: 'polygon(0% 3px, 95% 0%, 100% 94%, 94% 100%, 4% 97%)',
              transform: isRiding
                ? 'translateY(-8px) rotate(-3.8deg) scale(1.12)'
                : 'translateY(2px) rotate(-3.8deg)',
              transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            className={`relative px-3 py-2 text-xs font-mono cursor-pointer flex flex-col items-center justify-center min-w-[50px] shadow-[0_6px_14px_rgba(0,0,0,0.7)] ${
              isRiding
                ? 'z-25 bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 font-black shadow-[0_0_20px_rgba(251,191,36,0.9)] ring-2 ring-slate-950'
                : 'z-10 bg-[#18181B] hover:bg-zinc-800 text-white/85 border-2 border-amber-800/80 hover:border-amber-400 hover:-translate-y-1.5'
            }`}
            title="Skate / Mount [V] — kickflip onto the board"
          >
            <div className="flex flex-col items-center mt-1">
              <span className="text-lg">🛹</span>
              <span className="text-[9px] font-black font-mono px-1.5 py-0.2 rounded-xs mt-0.5 bg-zinc-900 text-amber-400 border border-amber-700">
                [V]
              </span>
            </div>
          </button>
        </div>

        {/* ========================================================= */}
        {/* 6.3 UTILITY MODALS [I], [B], [K] (Notepad Tear-Off Scraps) */}
        {/* ========================================================= */}
        <div className="flex items-end -space-x-1.5 p-1">
          <button
            type="button"
            onClick={() => onOpenModal('inventory')}
            style={{
              clipPath: 'polygon(0% 4px, 96% 0%, 100% 92%, 95% 100%, 0% 96%)',
              transform: 'translateY(1px) rotate(-2.5deg)',
              transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            className="px-2.5 py-2 text-xs font-mono bg-[#18181B] hover:bg-zinc-800 text-white/90 cursor-pointer flex flex-col items-center min-w-[44px] shadow-[0_6px_14px_rgba(0,0,0,0.7)] border-2 border-zinc-700 hover:border-amber-400 hover:-translate-y-1.5 hover:scale-108 group"
            title="Bag [I]"
          >
            <span className="text-base group-hover:scale-110 transition-transform">🎒</span>
            <span className="text-[8px] font-black font-mono px-1 py-0.2 rounded-xs mt-0.5 bg-zinc-900 text-rose-400 border border-zinc-600">
              [I]
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('craft')}
            style={{
              clipPath: 'polygon(3% 0%, 98% 3px, 100% 96%, 93% 100%, 0% 94%)',
              transform: 'translateY(-2px) rotate(3.8deg)',
              transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            className="px-2.5 py-2 text-xs font-mono bg-[#18181B] hover:bg-zinc-800 text-white/90 cursor-pointer flex flex-col items-center min-w-[44px] shadow-[0_6px_14px_rgba(0,0,0,0.7)] border-2 border-zinc-700 hover:border-amber-400 hover:-translate-y-1.5 hover:scale-108 group"
            title="Craft [B]"
          >
            <span className="text-base group-hover:scale-110 transition-transform">🛠️</span>
            <span className="text-[8px] font-black font-mono px-1 py-0.2 rounded-xs mt-0.5 bg-zinc-900 text-rose-400 border border-zinc-600">
              [B]
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('skills')}
            style={{
              clipPath: 'polygon(0% 2px, 96% 0%, 100% 94%, 94% 100%, 4% 96%)',
              transform: 'translateY(3px) rotate(-3.0deg)',
              transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            className="px-2.5 py-2 text-xs font-mono bg-[#18181B] hover:bg-zinc-800 text-white/90 cursor-pointer flex flex-col items-center min-w-[44px] shadow-[0_6px_14px_rgba(0,0,0,0.7)] border-2 border-zinc-700 hover:border-amber-400 hover:-translate-y-1.5 hover:scale-108 group"
            title="Talents [K]"
          >
            <span className="text-base group-hover:scale-110 transition-transform">✨</span>
            <span className="text-[8px] font-black font-mono px-1 py-0.2 rounded-xs mt-0.5 bg-zinc-900 text-rose-400 border border-zinc-600">
              [K]
            </span>
          </button>
        </div>
      </div>

      {/* 7. PERSONA-STYLE DEATH RESPAWN OVERLAY */}
      {player.isRespawning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md select-none pointer-events-auto">
          <div className="relative bg-gradient-to-r from-red-700 via-zinc-950 to-red-700 py-6 px-16 -skew-y-3 shadow-[0_0_60px_rgba(220,38,38,0.9)] border-y-4 border-red-500 flex flex-col items-center text-center">
            <h2 className="text-5xl font-black italic tracking-widest text-white drop-shadow-[0_4px_12px_rgba(0,0,0,1)] uppercase">
              YOU DIED
            </h2>
            <div className="mt-2 text-sm font-mono font-black text-amber-300 tracking-wider">
              RESPAWNING AT CAMPSITE IN {(player.respawnTimer ?? 3.0).toFixed(1)}S...
            </div>
          </div>
        </div>
      )}
    </>
  );
};
