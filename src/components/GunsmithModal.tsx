import React from 'react';
import { Player, WeaponAttachment, AttachmentSlot, GunType } from '../types/game';
import { sound } from '../game/audioEngine';
import { WEAPON_CONFIGS } from '../game/useGameEngine';

interface GunsmithModalProps {
  player: Player;
  isOpen: boolean;
  onEquipAttachment: (slot: AttachmentSlot, attachment: WeaponAttachment | null) => void;
}

export const ATTACHMENTS_CATALOG: Record<AttachmentSlot, WeaponAttachment[]> = {
  optic: [
    {
      id: 'optic_holo',
      slot: 'optic',
      name: 'Holo Red-Dot',
      icon: '🔴',
      description: '+200m Range',
      statBonus: { rangeBonus: 200, critRateBonus: 5 },
    },
    {
      id: 'optic_acog',
      slot: 'optic',
      name: '4x ACOG',
      icon: '🔭',
      description: '+450m Range',
      statBonus: { rangeBonus: 450, critRateBonus: 10 },
    },
    {
      id: 'optic_thermal',
      slot: 'optic',
      name: 'Thermal V2',
      icon: '👁️',
      description: '+20% Crit Rate',
      statBonus: { critRateBonus: 20 },
    },
  ],
  muzzle: [
    {
      id: 'muzzle_suppressor',
      slot: 'muzzle',
      name: 'Silencer',
      icon: '🔇',
      description: '+15% Crit Rate',
      statBonus: { critRateBonus: 15 },
    },
    {
      id: 'muzzle_compensator',
      slot: 'muzzle',
      name: 'Compensator',
      icon: '⚙️',
      description: '-45% Spread',
      statBonus: { spreadReduction: 0.45 },
    },
    {
      id: 'muzzle_brake',
      slot: 'muzzle',
      name: 'Muzzle Brake',
      icon: '🔥',
      description: '+15% Damage',
      statBonus: { damageMult: 1.15 },
    },
  ],
  underbarrel: [
    {
      id: 'under_grip',
      slot: 'underbarrel',
      name: 'Foregrip',
      icon: '🪓',
      description: '-25% Spread',
      statBonus: { spreadReduction: 0.25, aimSpeedBonus: 0.3 },
    },
    {
      id: 'under_laser',
      slot: 'underbarrel',
      name: 'Laser Beam',
      icon: '🎯',
      description: 'Laser Pointer',
      statBonus: { spreadReduction: 0.4 },
    },
    {
      id: 'under_bipod',
      slot: 'underbarrel',
      name: 'Bipod Mount',
      icon: '🛡️',
      description: '+25% Stability',
      statBonus: { spreadReduction: 0.25 },
    },
  ],
  magazine: [
    {
      id: 'mag_extended',
      slot: 'magazine',
      name: 'High-Cap (+15)',
      icon: '📦',
      description: '+15 Ammo',
      statBonus: { ammoBonus: 15 },
    },
    {
      id: 'mag_speed',
      slot: 'magazine',
      name: 'Fast Mag',
      icon: '⚡',
      description: '-50% Reload',
      statBonus: { reloadSpeedMult: 0.5 },
    },
    {
      id: 'mag_drum',
      slot: 'magazine',
      name: 'Drum Mag (+30)',
      icon: '🥁',
      description: '+30 Ammo',
      statBonus: { ammoBonus: 30 },
    },
  ],
};

export const GunsmithModal: React.FC<GunsmithModalProps> = ({
  player,
  isOpen,
  onEquipAttachment,
}) => {
  if (!isOpen) return null;

  const currentWeapon = player.equipment?.weapon;
  const gunType: GunType = currentWeapon?.gunType || 'pistol';
  const baseConfig = WEAPON_CONFIGS[gunType] || WEAPON_CONFIGS.pistol;
  const attachments = player.weaponAttachments || {
    optic: null,
    muzzle: null,
    underbarrel: null,
    magazine: null,
  };

  const getGunDisplayName = () => {
    if (gunType === 'cheytac') return 'CHEYTAC M200 INTERVENTION (.408 SNIPER)';
    if (gunType === 'ak47') return 'AK-47 KALASHNIKOV (7.62MM ASSAULT RIFLE)';
    if (gunType === 'shotgun') return 'SPAS-12 TACTICAL BREACHER (12 GAUGE)';
    if (gunType === 'mac10') return 'MAC-10 SUB-MACHINE GUN (9MM)';
    if (gunType === 'revolver') return '.44 MAGNUM ENFORCER REVOLVER';
    return 'M1911 COMPACT TACTICAL PISTOL (9MM)';
  };

  // Compute live stat totals with attachments
  const curDamageMult = attachments.muzzle?.statBonus?.damageMult ?? 1.0;
  const curCritBonus = (attachments.muzzle?.statBonus?.critRateBonus ?? 0) + (attachments.optic?.statBonus?.critRateBonus ?? 0);
  const curRangeBonus = attachments.optic?.statBonus?.rangeBonus ?? 0;
  const curSpreadReduction = Math.min(0.85, (attachments.muzzle?.statBonus?.spreadReduction ?? 0) + (attachments.underbarrel?.statBonus?.spreadReduction ?? 0));
  const curAmmoBonus = attachments.magazine?.statBonus?.ammoBonus ?? 0;
  const curReloadMult = attachments.magazine?.statBonus?.reloadSpeedMult ?? 1.0;
  const effectiveReloadTime = (baseConfig.reloadTime * curReloadMult).toFixed(2);
  const totalMaxAmmo = baseConfig.maxAmmo + curAmmoBonus;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none select-none overflow-hidden flex flex-col justify-between p-3 md:p-5 animate-fade-in">
      {/* Tactical Vignette & Grid Lines (Unobtrusive) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at center, transparent 40%, rgba(15, 23, 42, 0.95) 100%), linear-gradient(rgba(239, 68, 68, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(239, 68, 68, 0.06) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 32px 32px, 32px 32px',
        }}
      />

      {/* TOP HEADER: Weapon Info & Modding Status */}
      <div className="relative z-50 flex items-center justify-between w-full max-w-5xl mx-auto bg-black/85 border border-red-500/60 backdrop-blur-md px-4 py-2.5 rounded-lg shadow-[0_0_25px_rgba(239,68,68,0.25)] pointer-events-auto">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-[10px] font-black bg-red-600 text-white rounded tracking-wider shadow-xs animate-pulse">
            GUNSMITH ACTIVE
          </span>
          <div>
            <h2 className="text-sm md:text-base font-black tracking-widest text-white uppercase drop-shadow-md">
              {getGunDisplayName()}
            </h2>
            <span className="text-[10px] font-mono text-zinc-400">
              TARGET WEAPON INSPECTION // ATTACHMENT SLOTS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/60 text-amber-400 font-bold">
            HOLD [C] TO MOD
          </span>
          <span className="hidden sm:inline text-zinc-400 text-[11px]">RELEASE [C] TO COMBAT</span>
        </div>
      </div>

      {/* CENTER HUD: Tactical SVG Reticle & Connector Lines pointing directly to weapon parts */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <defs>
          <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowAmber" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowEmerald" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowPurple" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Center Target Rings around weapon in center of canvas */}
        <circle cx="50%" cy="50%" r="56" fill="none" stroke="#EF4444" strokeWidth="1" strokeDasharray="6 4" opacity="0.35" />
        <circle cx="50%" cy="50%" r="4" fill="#EF4444" opacity="0.8" />
        <line x1="50%" y1="44%" x2="50%" y2="56%" stroke="#EF4444" strokeWidth="1" opacity="0.5" />
        <line x1="44%" y1="50%" x2="56%" y2="50%" stroke="#EF4444" strokeWidth="1" opacity="0.5" />

        {/* 1. Connector to TOP (Optic Hub) */}
        <path
          d="M 50% calc(50% - 24px) L 50% calc(50% - 75px) L 50% 21%"
          fill="none"
          stroke="#06B6D4"
          strokeWidth="1.6"
          strokeDasharray="4 3"
          filter="url(#glowCyan)"
        />
        <circle cx="50%" cy="calc(50% - 24px)" r="4" fill="#06B6D4" stroke="#FFFFFF" strokeWidth="1" />

        {/* 2. Connector to RIGHT (Muzzle Hub) */}
        <path
          d="M calc(50% + 40px) calc(50% - 6px) L calc(50% + 110px) calc(50% - 6px) L 80% calc(50% - 6px)"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.6"
          strokeDasharray="4 3"
          filter="url(#glowAmber)"
        />
        <circle cx="calc(50% + 40px)" cy="calc(50% - 6px)" r="4" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1" />

        {/* 3. Connector to BOTTOM-RIGHT (Underbarrel Hub) */}
        <path
          d="M calc(50% + 18px) calc(50% + 18px) L calc(50% + 80px) calc(50% + 90px) L 76% 76%"
          fill="none"
          stroke="#10B981"
          strokeWidth="1.6"
          strokeDasharray="4 3"
          filter="url(#glowEmerald)"
        />
        <circle cx="calc(50% + 18px)" cy="calc(50% + 18px)" r="4" fill="#10B981" stroke="#FFFFFF" strokeWidth="1" />

        {/* 4. Connector to BOTTOM-LEFT (Magazine Hub) */}
        <path
          d="M calc(50% - 14px) calc(50% + 22px) L calc(50% - 80px) calc(50% + 90px) L 24% 76%"
          fill="none"
          stroke="#A855F7"
          strokeWidth="1.6"
          strokeDasharray="4 3"
          filter="url(#glowPurple)"
        />
        <circle cx="calc(50% - 14px)" cy="calc(50% + 22px)" r="4" fill="#A855F7" stroke="#FFFFFF" strokeWidth="1" />
      </svg>

      {/* 4 FLOATING ATTACHMENT HUBS WITH CLEAN SQUARES ("КВАДРАТИКИ") */}
      <div className="relative z-30 w-full h-full pointer-events-none flex flex-col justify-between my-auto">
        {/* ========================================================================= */}
        {/* HUB 1: TOP (OPTIC / SIGHTS)                                              */}
        {/* ========================================================================= */}
        <div className="absolute top-[12%] left-1/2 -translate-x-1/2 pointer-events-auto bg-black/85 border border-cyan-500/60 backdrop-blur-md p-2.5 rounded-xl shadow-[0_0_24px_rgba(6,182,212,0.3)] flex flex-col items-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs">🔭</span>
            <span className="text-[10px] font-black text-cyan-400 tracking-wider font-mono uppercase">
              // OPTIC_SIGHT
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Stock / Empty Square */}
            <button
              type="button"
              onClick={() => {
                onEquipAttachment('optic', null);
                sound.playEmptyClick();
              }}
              className={`w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer ${
                !attachments.optic
                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)] ring-2 ring-cyan-400 scale-105'
                  : 'bg-zinc-950/70 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
              title="Stock Iron Sights (Unequip)"
            >
              <span className="text-lg">🚫</span>
              <span className="text-[9px] font-mono font-bold mt-0.5">STOCK</span>
            </button>

            {/* Attachment Options Squares */}
            {ATTACHMENTS_CATALOG.optic.map((att) => {
              const isSelected = attachments.optic?.id === att.id;
              return (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => {
                    onEquipAttachment('optic', isSelected ? null : att);
                    sound.playReload();
                  }}
                  className={`relative w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-cyan-950/90 border-cyan-400 text-white shadow-[0_0_16px_rgba(6,182,212,0.5)] ring-2 ring-cyan-300 scale-105'
                      : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:text-white hover:border-cyan-500/60 hover:scale-102'
                  }`}
                  title={`${att.name} (${att.description})`}
                >
                  {isSelected && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center text-[9px] font-black shadow-sm">
                      ✓
                    </div>
                  )}
                  <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
                    {att.icon}
                  </span>
                  <span className="text-[9px] font-black truncate w-full px-0.5 mt-0.5 leading-tight">
                    {att.name.split(' ')[0]}
                  </span>
                  <span className="text-[8px] font-mono text-cyan-300 font-bold leading-none">
                    {att.description.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* HUB 2: RIGHT / FRONT (MUZZLE DEVICE)                                     */}
        {/* ========================================================================= */}
        <div className="absolute top-[38%] right-[4%] md:right-[10%] pointer-events-auto bg-black/85 border border-amber-500/60 backdrop-blur-md p-2.5 rounded-xl shadow-[0_0_24px_rgba(245,158,11,0.3)] flex flex-col items-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs">🔥</span>
            <span className="text-[10px] font-black text-amber-400 tracking-wider font-mono uppercase">
              // MUZZLE_DEVICE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Stock / Bare Barrel Square */}
            <button
              type="button"
              onClick={() => {
                onEquipAttachment('muzzle', null);
                sound.playEmptyClick();
              }}
              className={`w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer ${
                !attachments.muzzle
                  ? 'bg-amber-950/80 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.4)] ring-2 ring-amber-400 scale-105'
                  : 'bg-zinc-950/70 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
              title="Bare Barrel (Unequip)"
            >
              <span className="text-lg">🚫</span>
              <span className="text-[9px] font-mono font-bold mt-0.5">BARE</span>
            </button>

            {/* Attachment Options Squares */}
            {ATTACHMENTS_CATALOG.muzzle.map((att) => {
              const isSelected = attachments.muzzle?.id === att.id;
              return (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => {
                    onEquipAttachment('muzzle', isSelected ? null : att);
                    sound.playReload();
                  }}
                  className={`relative w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-amber-950/90 border-amber-400 text-white shadow-[0_0_16px_rgba(245,158,11,0.5)] ring-2 ring-amber-300 scale-105'
                      : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:text-white hover:border-amber-500/60 hover:scale-102'
                  }`}
                  title={`${att.name} (${att.description})`}
                >
                  {isSelected && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[9px] font-black shadow-sm">
                      ✓
                    </div>
                  )}
                  <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
                    {att.icon}
                  </span>
                  <span className="text-[9px] font-black truncate w-full px-0.5 mt-0.5 leading-tight">
                    {att.name.split(' ')[0]}
                  </span>
                  <span className="text-[8px] font-mono text-amber-300 font-bold leading-none">
                    {att.description.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* HUB 3: BOTTOM-RIGHT (UNDERBARREL / GRIP / LASER)                         */}
        {/* ========================================================================= */}
        <div className="absolute bottom-[16%] right-[6%] md:right-[15%] pointer-events-auto bg-black/85 border border-emerald-500/60 backdrop-blur-md p-2.5 rounded-xl shadow-[0_0_24px_rgba(16,185,129,0.3)] flex flex-col items-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs">🎯</span>
            <span className="text-[10px] font-black text-emerald-400 tracking-wider font-mono uppercase">
              // UNDERBARREL_MOUNT
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Empty Rail Square */}
            <button
              type="button"
              onClick={() => {
                onEquipAttachment('underbarrel', null);
                sound.playEmptyClick();
              }}
              className={`w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer ${
                !attachments.underbarrel
                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.4)] ring-2 ring-emerald-400 scale-105'
                  : 'bg-zinc-950/70 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
              title="Empty Rail (Unequip)"
            >
              <span className="text-lg">🚫</span>
              <span className="text-[9px] font-mono font-bold mt-0.5">EMPTY</span>
            </button>

            {/* Attachment Options Squares */}
            {ATTACHMENTS_CATALOG.underbarrel.map((att) => {
              const isSelected = attachments.underbarrel?.id === att.id;
              return (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => {
                    onEquipAttachment('underbarrel', isSelected ? null : att);
                    sound.playReload();
                  }}
                  className={`relative w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-emerald-950/90 border-emerald-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.5)] ring-2 ring-emerald-300 scale-105'
                      : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:text-white hover:border-emerald-500/60 hover:scale-102'
                  }`}
                  title={`${att.name} (${att.description})`}
                >
                  {isSelected && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center text-[9px] font-black shadow-sm">
                      ✓
                    </div>
                  )}
                  <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
                    {att.icon}
                  </span>
                  <span className="text-[9px] font-black truncate w-full px-0.5 mt-0.5 leading-tight">
                    {att.name.split(' ')[0]}
                  </span>
                  <span className="text-[8px] font-mono text-emerald-300 font-bold leading-none">
                    {att.description.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* HUB 4: BOTTOM-LEFT (MAGAZINE CLIP)                                       */}
        {/* ========================================================================= */}
        <div className="absolute bottom-[16%] left-[6%] md:left-[15%] pointer-events-auto bg-black/85 border border-purple-500/60 backdrop-blur-md p-2.5 rounded-xl shadow-[0_0_24px_rgba(168,85,247,0.3)] flex flex-col items-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs">⚡</span>
            <span className="text-[10px] font-black text-purple-400 tracking-wider font-mono uppercase">
              // MAGAZINE_CLIP
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Standard Mag Square */}
            <button
              type="button"
              onClick={() => {
                onEquipAttachment('magazine', null);
                sound.playEmptyClick();
              }}
              className={`w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer ${
                !attachments.magazine
                  ? 'bg-purple-950/80 border-purple-400 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.4)] ring-2 ring-purple-400 scale-105'
                  : 'bg-zinc-950/70 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
              title="Standard Mag (Unequip)"
            >
              <span className="text-lg">🚫</span>
              <span className="text-[9px] font-mono font-bold mt-0.5">STD</span>
            </button>

            {/* Attachment Options Squares */}
            {ATTACHMENTS_CATALOG.magazine.map((att) => {
              const isSelected = attachments.magazine?.id === att.id;
              return (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => {
                    onEquipAttachment('magazine', isSelected ? null : att);
                    sound.playReload();
                  }}
                  className={`relative w-14 h-14 md:w-16 md:h-16 flex flex-col items-center justify-center rounded-lg border text-center transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-purple-950/90 border-purple-400 text-white shadow-[0_0_16px_rgba(168,85,247,0.5)] ring-2 ring-purple-300 scale-105'
                      : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:text-white hover:border-purple-500/60 hover:scale-102'
                  }`}
                  title={`${att.name} (${att.description})`}
                >
                  {isSelected && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-purple-400 text-slate-950 flex items-center justify-center text-[9px] font-black shadow-sm">
                      ✓
                    </div>
                  )}
                  <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
                    {att.icon}
                  </span>
                  <span className="text-[9px] font-black truncate w-full px-0.5 mt-0.5 leading-tight">
                    {att.name.split(' ')[0]}
                  </span>
                  <span className="text-[8px] font-mono text-purple-300 font-bold leading-none">
                    {att.description.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* BOTTOM FOOTER: Live Weapon Stats Breakdown Panel */}
      <div className="relative z-50 w-full max-w-5xl mx-auto bg-black/90 border border-red-500/50 backdrop-blur-md px-4 py-2.5 rounded-lg shadow-[0_0_30px_rgba(239,68,68,0.25)] pointer-events-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5 text-xs font-mono">
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase">Damage</span>
            <span className="font-bold text-white text-sm">
              {Math.round(curDamageMult * 100)}%
              {curDamageMult > 1 && <span className="text-amber-400 ml-1 text-xs">+{Math.round((curDamageMult - 1) * 100)}%</span>}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase">Crit Rate</span>
            <span className="font-bold text-white text-sm">
              {player.stats.critRate + curCritBonus}%
              {curCritBonus > 0 && <span className="text-emerald-400 ml-1 text-xs">+{curCritBonus}%</span>}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase">Max Range</span>
            <span className="font-bold text-white text-sm">
              {1500 + curRangeBonus}m
              {curRangeBonus > 0 && <span className="text-cyan-400 ml-1 text-xs">+{curRangeBonus}m</span>}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase">Magazine</span>
            <span className="font-bold text-white text-sm">
              {totalMaxAmmo} Rds
              {curAmmoBonus > 0 && <span className="text-purple-400 ml-1 text-xs">+{curAmmoBonus}</span>}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase">Spread</span>
            <span className="font-bold text-white text-sm">
              {Math.round(curSpreadReduction * 100)}%
              {curSpreadReduction > 0 && <span className="text-emerald-400 ml-1 text-xs">Tighter</span>}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase">Reload</span>
            <span className="font-bold text-white text-sm">
              {effectiveReloadTime}s
              {curReloadMult < 1 && <span className="text-cyan-400 ml-1 text-xs">-50%</span>}
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[9px] font-mono text-zinc-400 block">REAL-TIME MODDING // ATTACHMENTS MOUNTED LIVE</span>
          <span className="text-xs font-mono font-black text-red-400">RELEASE [C] TO READY WEAPON</span>
        </div>
      </div>
    </div>
  );
};
