import React, { useState, useEffect } from 'react';
import { Player, GunType } from '../types/game';
import { WEAPON_CONFIGS } from '../game/useGameEngine';

interface HandheldWeaponHUDProps {
  player: Player;
  onReload?: () => void;
  onOpenGunsmith?: () => void;
}

export const HandheldWeaponHUD: React.FC<HandheldWeaponHUDProps> = ({
  player,
  onReload,
  onOpenGunsmith,
}) => {
  const {
    equipment,
    ammo = 12,
    maxAmmo = 12,
    isReloading = false,
    reloadTimer = 0,
    attackTimer = 0,
    weaponAttachments,
  } = player;

  const activeGunType: GunType = equipment.weapon?.gunType || 'pistol';
  const config = WEAPON_CONFIGS[activeGunType] || WEAPON_CONFIGS.pistol;
  const totalReloadTime = config.reloadTime || 1.0;

  // Track reload progress 0 -> 1
  const reloadProgress = isReloading
    ? Math.max(0, Math.min(1, 1 - reloadTimer / totalReloadTime))
    : 0;

  // Recoil kick on shoot
  const isShooting = attackTimer > 0;
  const [shotEffect, setShotEffect] = useState(false);

  useEffect(() => {
    if (isShooting) {
      setShotEffect(true);
      const t = setTimeout(() => setShotEffect(false), 100);
      return () => clearTimeout(t);
    }
  }, [isShooting, attackTimer]);

  // Attachments check
  const hasOptic = !!weaponAttachments?.optic;
  const hasMuzzle = !!weaponAttachments?.muzzle;
  const hasUnderbarrel = !!weaponAttachments?.underbarrel;
  const hasMagazine = !!weaponAttachments?.magazine;
  const isDrumMag = weaponAttachments?.magazine?.id === 'mag_drum';

  // Determine ammo states
  const isLowAmmo = ammo <= Math.ceil(maxAmmo * 0.25) && !isReloading;
  const isEmptyAmmo = ammo === 0 && !isReloading;

  // Magazine reload swap animation offsets
  let weaponTransform = 'translate(0px, 0px) rotate(0deg)';
  let slideOffset = 0;
  let cylinderAngle = 0;
  let reloadStatusText = '';

  let isEjectingMag = false;
  let isInsertingMag = false;
  let magDropY = 0;
  let magDropRot = 0;
  let magDropOpacity = 1;
  let magInsertY = 0;
  let magInsertOpacity = 1;

  if (isShooting || shotEffect) {
    weaponTransform = 'translate(-6px, 3px) rotate(-8deg) scale(1.03)';
    slideOffset = -12;
  } else if (isReloading) {
    if (reloadProgress < 0.4) {
      // Phase 1: Tilting down, ejecting old empty magazine
      isEjectingMag = true;
      const p1 = reloadProgress / 0.4;
      weaponTransform = `translate(${4 * p1}px, ${8 * p1}px) rotate(${6 * p1}deg)`;
      magDropY = p1 * 80;
      magDropRot = p1 * 25;
      magDropOpacity = Math.max(0, 1 - p1 * 1.5);
      cylinderAngle = p1 * 60;
      reloadStatusText = 'EJECTING MAG...';
    } else if (reloadProgress < 0.8) {
      // Phase 2: Fresh magazine slides in from below
      isInsertingMag = true;
      const p2 = (reloadProgress - 0.4) / 0.4;
      weaponTransform = `translate(4px, 8px) rotate(6deg)`;
      magInsertY = Math.max(0, (1 - p2 * 1.05) * 65);
      magInsertOpacity = 1;
      cylinderAngle = (1 - p2) * 60;
      reloadStatusText = 'INSERTING FRESH MAG...';
    } else {
      // Phase 3: Chambering / Slide rack
      const p3 = (reloadProgress - 0.8) / 0.2;
      const rack = Math.sin(p3 * Math.PI);
      weaponTransform = `translate(${4 * (1 - p3)}px, ${8 * (1 - p3)}px) rotate(${6 * (1 - p3)}deg)`;
      slideOffset = -14 * rack;
      cylinderAngle = 0;
      reloadStatusText = 'CHAMBERING...';
    }
  } else if (isEmptyAmmo) {
    weaponTransform = 'translate(1px, 2px) rotate(2deg)';
    slideOffset = -10;
  }

  const renderMagazineElement = (gun: 'pistol' | 'mac10' | 'ak47' | 'cheytac') => {
    // Helper to draw actual mag shape
    const drawMagShape = (isFresh: boolean = false) => {
      if (gun === 'pistol') {
        return (
          <g>
            <rect
              x="0"
              y="0"
              width={isDrumMag ? 28 : 16}
              height={hasMagazine ? 44 : 30}
              rx="3"
              fill={isFresh ? '#1E293B' : '#18181B'}
              stroke="#0F172A"
              strokeWidth="2"
            />
            <rect x="0" y={hasMagazine ? 39 : 25} width={isDrumMag ? 28 : 16} height="5" fill={isFresh ? '#22C55E' : '#F59E0B'} />
            {isDrumMag && (
              <circle cx="14" cy="20" r="14" fill="#1E293B" stroke="#0F172A" strokeWidth="2.5" />
            )}
          </g>
        );
      }
      if (gun === 'mac10') {
        return (
          <g>
            <rect
              x="0"
              y="0"
              width={isDrumMag ? 30 : 18}
              height={hasMagazine ? 62 : 46}
              rx="2"
              fill={isFresh ? '#1E293B' : '#18181B'}
              stroke="#0F172A"
              strokeWidth="2"
            />
            <rect x="0" y={hasMagazine ? 57 : 41} width={isDrumMag ? 30 : 18} height="5" fill={isFresh ? '#22C55E' : '#F59E0B'} />
            {isDrumMag && (
              <circle cx="15" cy="28" r="16" fill="#18181B" stroke="#0F172A" strokeWidth="2.5" />
            )}
          </g>
        );
      }
      if (gun === 'ak47') {
        return (
          <g>
            <path
              d="M 10 0 C 2 28 -12 56 -24 76 L -12 80 C 4 60 18 28 26 0 Z"
              fill={isDrumMag ? '#1E293B' : isFresh ? '#9A3412' : '#78350F'}
              stroke="#1E1B18"
              strokeWidth="2.5"
            />
            {isDrumMag && (
              <circle cx="0" cy="38" r="20" fill="#18181B" stroke="#0F172A" strokeWidth="2.5" />
            )}
          </g>
        );
      }
      if (gun === 'cheytac') {
        return (
          <g>
            <rect x="0" y="0" width="26" height="40" rx="3" fill={isFresh ? '#1E293B' : '#18181B'} stroke="#0F172A" strokeWidth="2.5" />
            <rect x="0" y="34" width="26" height="6" fill={isFresh ? '#38BDF8' : '#F59E0B'} />
          </g>
        );
      }
      return null;
    };

    const basePositions: Record<string, { x: number; y: number }> = {
      pistol: { x: 62, y: 95 },
      mac10: { x: 60, y: 90 },
      ak47: { x: 32, y: 85 },
      cheytac: { x: 68, y: 90 },
    };

    const pos = basePositions[gun] || basePositions.pistol;

    if (isEjectingMag) {
      // Old mag falling away
      return (
        <g transform={`translate(${pos.x}, ${pos.y + magDropY}) rotate(${magDropRot})`} opacity={magDropOpacity}>
          {drawMagShape(false)}
        </g>
      );
    }
    if (isInsertingMag) {
      // Fresh mag entering
      return (
        <g transform={`translate(${pos.x}, ${pos.y + magInsertY})`} opacity={magInsertOpacity}>
          {drawMagShape(true)}
        </g>
      );
    }

    // Standard seated magazine
    return (
      <g transform={`translate(${pos.x}, ${pos.y})`}>
        {drawMagShape(false)}
      </g>
    );
  };

  return (
    <div className="fixed bottom-3 right-3 z-40 select-none pointer-events-none flex flex-col items-end">
      {/* CLEAN WEAPON PREVIEW CARD & AMMO DISPLAY (No hands, just clean weapon image & ammo counter) */}
      <div className="pointer-events-auto flex items-center gap-3 bg-black/85 border-2 border-slate-700/80 hover:border-amber-500/70 backdrop-blur-md p-3 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.85)] transition-all">
        {/* ========================================================================= */}
        {/* 1. LEFT SIDE: AMMO COUNTER & RELOAD ACTIONS                              */}
        {/* ========================================================================= */}
        <div className="flex flex-col items-start gap-1 min-w-[130px] border-r border-white/10 pr-3">
          {/* Weapon Name & Gunsmith button */}
          <div className="flex items-center justify-between w-full gap-2">
            <span className="text-xs font-black font-mono tracking-wider uppercase text-white truncate max-w-[95px] block">
              {equipment.weapon?.name || 'Standard 9mm'}
            </span>
            <button
              type="button"
              onClick={onOpenGunsmith}
              className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/50 text-[9px] font-mono font-bold text-amber-300 transition-colors cursor-pointer"
              title="Customize Weapon [C]"
            >
              [C] MODS
            </button>
          </div>

          {/* Big Ammo Number */}
          <div className="flex items-baseline gap-1.5 font-mono my-0.5">
            <span
              className={`text-3xl md:text-4xl font-black tracking-tighter ${
                isEmptyAmmo
                  ? 'text-red-500 animate-pulse'
                  : isLowAmmo
                  ? 'text-amber-400 animate-pulse'
                  : isReloading
                  ? 'text-yellow-300'
                  : 'text-white drop-shadow-md'
              }`}
            >
              {isReloading ? '--' : ammo}
            </span>
            <span className="text-xs font-bold text-zinc-400">/ {maxAmmo}</span>
          </div>

          {/* Reload Status or Action Button */}
          <div className="w-full mt-0.5">
            {isReloading ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/60">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                <span className="text-[9px] font-mono font-black text-amber-300 tracking-wider animate-pulse truncate">
                  {reloadStatusText || 'RELOADING...'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onReload}
                className={`w-full py-1 px-2 text-[10px] font-mono font-black rounded transition-all cursor-pointer shadow-sm text-center ${
                  isEmptyAmmo
                    ? 'bg-red-600 hover:bg-red-500 text-white animate-bounce'
                    : isLowAmmo
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600'
                }`}
                title="Reload Weapon [R]"
              >
                [R] RELOAD
              </button>
            )}
          </div>

          {/* Compact Cartridge Pips */}
          <div className="mt-1 flex flex-wrap items-center gap-1 max-w-[125px]">
            {Array.from({ length: Math.min(24, maxAmmo) }).map((_, i) => {
              const isFilled = i < ammo && !isReloading;
              return (
                <div
                  key={i}
                  className={`h-2.5 w-1 rounded-xs transition-all duration-100 ${
                    isFilled
                      ? activeGunType === 'shotgun'
                        ? 'bg-rose-500 shadow-[0_0_3px_rgba(244,63,94,0.8)]'
                        : activeGunType === 'cheytac'
                        ? 'bg-sky-400 shadow-[0_0_3px_rgba(56,189,248,0.9)]'
                        : 'bg-amber-400 shadow-[0_0_3px_rgba(251,191,36,0.8)]'
                      : 'bg-zinc-800 border border-zinc-700 opacity-30'
                  }`}
                  title={`Round ${i + 1}`}
                />
              );
            })}
            {maxAmmo > 24 && (
              <span className="text-[8px] font-mono text-zinc-500 font-bold">
                +{maxAmmo - 24}
              </span>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. RIGHT SIDE: PURE WEAPON PREVIEW PICTURE (NO HANDS)                    */}
        {/* ========================================================================= */}
        <div className="relative w-44 h-24 md:w-52 md:h-28 flex items-center justify-center overflow-visible">
          {/* Recoil Flash Burst */}
          {(isShooting || shotEffect) && (
            <div className="absolute top-4 left-2 z-20 pointer-events-none animate-ping">
              <svg width="40" height="40" viewBox="0 0 100 100">
                <polygon
                  points="50,0 62,35 98,35 68,58 80,95 50,72 20,95 32,58 2,35 38,35"
                  fill="#FEF08A"
                  stroke="#EA580C"
                  strokeWidth="3"
                />
              </svg>
            </div>
          )}

          {/* Pure Weapon SVG Vector Preview Container */}
          <div
            style={{
              transform: weaponTransform,
              transition: isShooting ? 'transform 0.04s ease-out' : isReloading ? 'none' : 'transform 0.15s ease-out',
            }}
            className="w-full h-full"
          >
            <svg
              viewBox="40 20 260 170"
              className="w-full h-full overflow-visible drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
            >
              <defs>
                <linearGradient id="wpn-metal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="50%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
                <linearGradient id="wpn-wood-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#B45309" />
                  <stop offset="50%" stopColor="#78350F" />
                  <stop offset="100%" stopColor="#451A03" />
                </linearGradient>
              </defs>

              {/* ----------------- 2.1 PISTOL (Glock / Combat 9mm) ----------------- */}
              {activeGunType === 'pistol' && (
                <g id="wpn-pistol" transform="translate(100, 45)">
                  {/* Swapping Magazine */}
                  {renderMagazineElement('pistol')}

                  {/* Lower Grip & Polymer Frame */}
                  <path
                    d="M 45 80 L 65 140 L 95 135 L 85 80 Z"
                    fill="#27272A"
                    stroke="#1E1B18"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  <line x1="58" y1="95" x2="78" y2="92" stroke="#3F3F46" strokeWidth="2" />
                  <line x1="62" y1="110" x2="82" y2="107" stroke="#3F3F46" strokeWidth="2" />
                  <line x1="66" y1="125" x2="86" y2="122" stroke="#3F3F46" strokeWidth="2" />

                  {/* Trigger Guard & Trigger */}
                  <path d="M 42 78 C 30 85 32 105 50 102" fill="none" stroke="#1E1B18" strokeWidth="3" />
                  <path d="M 46 86 Q 44 95 48 97" stroke="#94A3B8" strokeWidth="2.5" fill="none" />

                  {/* Slide (Animated with slideOffset on recoil / rack) */}
                  <g transform={`translate(${slideOffset}, 0)`}>
                    <rect x="-15" y="42" width="115" height="36" rx="3" fill="url(#wpn-metal-grad)" stroke="#1E1B18" strokeWidth="3.5" />
                    <line x1="72" y1="46" x2="72" y2="68" stroke="#0F172A" strokeWidth="2" />
                    <line x1="78" y1="46" x2="78" y2="68" stroke="#0F172A" strokeWidth="2" />
                    <line x1="84" y1="46" x2="84" y2="68" stroke="#0F172A" strokeWidth="2" />
                    <rect x="42" y="44" width="22" height="14" rx="1" fill="#09090B" stroke="#1E1B18" strokeWidth="2" />
                    <rect x="-10" y="34" width="7" height="8" fill="#1E293B" stroke="#1E1B18" strokeWidth="2" />
                    <circle cx="-6.5" cy="38" r="1.5" fill="#22C55E" />
                    <rect x="86" y="34" width="8" height="8" fill="#1E293B" stroke="#1E1B18" strokeWidth="2" />
                  </g>

                  {/* Attachments on Pistol */}
                  {hasMuzzle && (
                    <g id="pistol-suppressor" transform={`translate(${slideOffset - 48}, 44)`}>
                      <rect x="0" y="0" width="34" height="30" rx="3" fill="#18181B" stroke="#1E1B18" strokeWidth="3" />
                      <line x1="8" y1="2" x2="8" y2="28" stroke="#3F3F46" strokeWidth="2" />
                      <line x1="26" y1="2" x2="26" y2="28" stroke="#3F3F46" strokeWidth="2" />
                    </g>
                  )}
                  {hasOptic && (
                    <g id="pistol-optic" transform={`translate(${slideOffset + 24}, 18)`}>
                      <rect x="0" y="0" width="32" height="24" rx="2" fill="#0F172A" stroke="#1E1B18" strokeWidth="2.5" />
                      <rect x="4" y="4" width="24" height="16" fill="#38BDF8" fillOpacity="0.4" />
                      <circle cx="16" cy="12" r="2.5" fill="#EF4444" />
                    </g>
                  )}
                  {hasUnderbarrel && (
                    <g id="pistol-laser" transform="translate(0, 80)">
                      <rect x="0" y="0" width="30" height="14" rx="2" fill="#1E293B" stroke="#1E1B18" strokeWidth="2" />
                      <circle cx="2" cy="7" r="3" fill="#EF4444" />
                      <line x1="-40" y1="7" x2="0" y2="7" stroke="#EF4444" strokeWidth="1.5" strokeOpacity="0.7" />
                    </g>
                  )}
                </g>
              )}

              {/* ----------------- 2.2 REVOLVER (.44 Magnum Heavy) ----------------- */}
              {activeGunType === 'revolver' && (
                <g id="wpn-revolver" transform="translate(90, 40)">
                  <path
                    d="M 55 85 C 50 120 70 155 100 150 C 115 145 110 110 95 85 Z"
                    fill="url(#wpn-wood-grad)"
                    stroke="#1E1B18"
                    strokeWidth="3.5"
                  />
                  <circle cx="85" cy="115" r="5" fill="#FDE047" stroke="#78350F" strokeWidth="1.5" />

                  <rect x="15" y="48" width="85" height="38" rx="2" fill="url(#wpn-metal-grad)" stroke="#1E1B18" strokeWidth="3.5" />
                  <path
                    d="M -35 50 L 18 50 L 18 80 L -35 78 Z"
                    fill="url(#wpn-metal-grad)"
                    stroke="#1E1B18"
                    strokeWidth="3.5"
                  />
                  <rect x="-25" y="44" width="12" height="6" fill="#0F172A" stroke="#1E1B18" strokeWidth="1.5" />
                  <rect x="-8" y="44" width="12" height="6" fill="#0F172A" stroke="#1E1B18" strokeWidth="1.5" />
                  <polygon points="-35,50 -30,40 -20,40 -20,50" fill="#EA580C" stroke="#1E1B18" strokeWidth="2" />

                  {/* Revolver 6-Shot Cylinder (Fluted & Rotates on reload) */}
                  <g transform={`translate(48, 68) rotate(${cylinderAngle})`}>
                    <rect x="-24" y="-18" width="48" height="36" rx="4" fill="#0F172A" stroke="#1E1B18" strokeWidth="3" />
                    <ellipse cx="0" cy="-9" rx="16" ry="4" fill="#334155" />
                    <ellipse cx="0" cy="9" rx="16" ry="4" fill="#334155" />
                    <circle cx="-16" cy="0" r="4" fill="#FDE047" stroke="#B45309" strokeWidth="1.5" />
                    <circle cx="16" cy="0" r="4" fill="#FDE047" stroke="#B45309" strokeWidth="1.5" />
                  </g>

                  <path d="M 50 86 C 40 92 42 110 60 108" fill="none" stroke="#1E1B18" strokeWidth="3" />
                  <path d="M 56 92 Q 54 100 58 102" stroke="#CBD5E1" strokeWidth="2.5" fill="none" />
                  <path d="M 96 50 Q 108 42 105 60" stroke="#1E1B18" strokeWidth="3.5" fill="#334155" />
                </g>
              )}

              {/* ----------------- 2.3 MAC-10 (Micro SMG) ----------------- */}
              {activeGunType === 'mac10' && (
                <g id="wpn-mac10" transform="translate(100, 40)">
                  {/* Swapping Stick / Drum Magazine */}
                  {renderMagazineElement('mac10')}

                  <rect x="-10" y="44" width="115" height="46" rx="2" fill="#18181B" stroke="#1E1B18" strokeWidth="3.5" />
                  <rect x="52" y="88" width="30" height="42" rx="2" fill="#27272A" stroke="#1E1B18" strokeWidth="3" />
                  <rect x="-30" y="58" width="22" height="16" rx="1" fill="#334155" stroke="#1E1B18" strokeWidth="3" />
                  <path d="M -22 74 C -28 95 -10 115 -18 135" stroke="#10B981" strokeWidth="6" fill="none" strokeLinecap="round" />

                  <rect x={35 + slideOffset} y="34" width="14" height="10" rx="2" fill="#475569" stroke="#1E1B18" strokeWidth="2.5" />
                  <rect x="38" y="50" width="26" height="16" fill="#09090B" stroke="#1E1B18" strokeWidth="2" />
                </g>
              )}

              {/* ----------------- 2.4 AK-47 (Kalashnikov) ----------------- */}
              {activeGunType === 'ak47' && (
                <g id="wpn-ak47" transform="translate(75, 40)">
                  {/* Swapping Banana / Drum Magazine */}
                  {renderMagazineElement('ak47')}

                  <polygon points="120,68 180,85 175,130 115,100" fill="url(#wpn-wood-grad)" stroke="#1E1B18" strokeWidth="3.5" />
                  <rect x="15" y="52" width="105" height="42" rx="2" fill="url(#wpn-metal-grad)" stroke="#1E1B18" strokeWidth="3.5" />
                  <line x1="60" y1="72" x2="85" y2="76" stroke="#0F172A" strokeWidth="3" />
                  <rect x={48 + slideOffset} y="56" width="16" height="8" rx="2" fill="#E2E8F0" stroke="#1E1B18" strokeWidth="2" />

                  <rect x="-42" y="54" width="60" height="24" rx="3" fill="url(#wpn-wood-grad)" stroke="#1E1B18" strokeWidth="3" />
                  <rect x="-42" y="44" width="58" height="12" rx="2" fill="#334155" stroke="#1E1B18" strokeWidth="2.5" />

                  <rect x="-85" y="58" width="45" height="12" fill="#1E293B" stroke="#1E1B18" strokeWidth="3" />
                  <circle cx="-75" cy="50" r="7" fill="none" stroke="#1E1B18" strokeWidth="3" />
                  <line x1="-75" y1="56" x2="-75" y2="46" stroke="#EA580C" strokeWidth="2" />
                  <polygon points="-85,58 -96,54 -96,70 -85,70" fill="#334155" stroke="#1E1B18" strokeWidth="2.5" />

                  <polygon points="90,92 110,140 85,145 70,95" fill="url(#wpn-wood-grad)" stroke="#1E1B18" strokeWidth="3" />
                </g>
              )}

              {/* ----------------- 2.5 SHOTGUN (Tactical Pump Action) ----------------- */}
              {activeGunType === 'shotgun' && (
                <g id="wpn-shotgun" transform="translate(70, 40)">
                  <rect x="25" y="50" width="105" height="42" rx="3" fill="url(#wpn-metal-grad)" stroke="#1E1B18" strokeWidth="3.5" />
                  <rect x="55" y="54" width="34" height="20" rx="1" fill="#09090B" stroke="#1E1B18" strokeWidth="2" />

                  {/* Shell feeding into ejection port on reload */}
                  {isReloading && reloadProgress > 0.35 && reloadProgress < 0.75 && (
                    <rect x="60" y="58" width="24" height="12" rx="2" fill="#EF4444" stroke="#FDE047" strokeWidth="2" />
                  )}

                  <rect x="-80" y="50" width="108" height="20" rx="2" fill="url(#wpn-metal-grad)" stroke="#1E1B18" strokeWidth="3.5" />
                  <rect x="-70" y="70" width="98" height="16" rx="2" fill="#1E293B" stroke="#1E1B18" strokeWidth="3" />
                  <circle cx="-75" cy="45" r="4" fill="#22C55E" stroke="#1E1B18" strokeWidth="2" />

                  {/* Pump Forend */}
                  <g transform={`translate(${isReloading ? Math.sin(reloadProgress * Math.PI) * 16 : 0}, 0)`}>
                    <rect x="-35" y="66" width="55" height="24" rx="4" fill="#78350F" stroke="#1E1B18" strokeWidth="3" />
                    <line x1="-25" y1="68" x2="-25" y2="88" stroke="#451A03" strokeWidth="2.5" />
                    <line x1="-15" y1="68" x2="-15" y2="88" stroke="#451A03" strokeWidth="2.5" />
                    <line x1="-5" y1="68" x2="-5" y2="88" stroke="#451A03" strokeWidth="2.5" />
                    <line x1="5" y1="68" x2="5" y2="88" stroke="#451A03" strokeWidth="2.5" />
                  </g>

                  <polygon points="130,55 185,70 180,125 125,92" fill="#27272A" stroke="#1E1B18" strokeWidth="3.5" />
                </g>
              )}

              {/* ----------------- 2.6 CHEYTAC M200 (Heavy Sniper) ----------------- */}
              {activeGunType === 'cheytac' && (
                <g id="wpn-cheytac" transform="translate(55, 30)">
                  {/* Swapping Sniper Magazine */}
                  {renderMagazineElement('cheytac')}

                  <rect x="20" y="55" width="135" height="44" rx="3" fill="#1E293B" stroke="#1E1B18" strokeWidth="3.5" />
                  <rect x="-115" y="60" width="140" height="22" rx="2" fill="url(#wpn-metal-grad)" stroke="#1E1B18" strokeWidth="3.5" />
                  <polygon
                    points="-115,55 -145,52 -145,88 -115,86"
                    fill="#0F172A"
                    stroke="#1E1B18"
                    strokeWidth="3.5"
                  />
                  <line x1="-128" y1="56" x2="-128" y2="84" stroke="#EA580C" strokeWidth="3" />
                  <line x1="-138" y1="56" x2="-138" y2="84" stroke="#EA580C" strokeWidth="3" />

                  {/* Bipod */}
                  <line x1="-70" y1="82" x2="-95" y2="105" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
                  <line x1="-70" y1="82" x2="-45" y2="105" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />

                  {/* Oversized High-Magnification Sniper Scope */}
                  <g transform="translate(30, 20)">
                    <rect x="0" y="14" width="85" height="22" rx="3" fill="#0F172A" stroke="#1E1B18" strokeWidth="3.5" />
                    <polygon points="0,14 -18,8 -18,42 0,36" fill="#1E293B" stroke="#1E1B18" strokeWidth="3" />
                    <ellipse cx="-18" cy="25" rx="4" ry="16" fill="#38BDF8" stroke="#0284C7" strokeWidth="1.5" />
                    <rect x="35" y="6" width="14" height="9" fill="#334155" stroke="#1E1B18" strokeWidth="2" />
                    <rect x="48" y="20" width="8" height="12" fill="#334155" stroke="#1E1B18" strokeWidth="2" />
                    <rect x="12" y="34" width="10" height="10" fill="#475569" stroke="#1E1B18" strokeWidth="2" />
                    <rect x="62" y="34" width="10" height="10" fill="#475569" stroke="#1E1B18" strokeWidth="2" />
                  </g>

                  {/* Bolt Action Handle */}
                  <g transform={`translate(${slideOffset * 1.5}, 0)`}>
                    <line x1="55" y1="62" x2="65" y2="44" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="67" cy="42" r="5" fill="#0F172A" stroke="#1E1B18" strokeWidth="2" />
                  </g>
                </g>
              )}

              {/* ----------------- 2.7 MELEE (Katana / Sledgehammer) ----------------- */}
              {(activeGunType === 'katana' || activeGunType === 'sledgehammer') && (
                <g id="wpn-melee" transform="translate(90, 30)">
                  <path
                    d="M -90 -20 Q 20 45 100 80 L 105 90 Q 20 58 -95 -12 Z"
                    fill="#F1F5F9"
                    stroke="#1E1B18"
                    strokeWidth="3"
                  />
                  <path
                    d="M -90 -20 Q 20 45 100 80"
                    stroke="#38BDF8"
                    strokeWidth="3.5"
                    fill="none"
                  />
                  <rect x="95" y="70" width="18" height="26" rx="4" fill="#F59E0B" stroke="#1E1B18" strokeWidth="3" transform="rotate(25 104 83)" />
                  <rect x="105" y="80" width="45" height="16" rx="2" fill="#991B1B" stroke="#1E1B18" strokeWidth="3" transform="rotate(25 127 88)" />
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
