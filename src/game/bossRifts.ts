export type BossRiftBossKind =
  | 'boss_titan'
  | 'boss_beam'
  | 'boss_skyfall'
  | 'boss_void'
  | 'boss_storm';

/** Pocket rift arenas inside Nullspace — separate “dimensions” for boss fights. */
export const RIFT_ARENAS = [
  { id: 'rift_crimson', cx: -6000, cy: 900, r: 400, tint: '#FB7185' },
  { id: 'rift_void', cx: -9200, cy: 2200, r: 420, tint: '#A78BFA' },
  { id: 'rift_cyan', cx: -2800, cy: 2200, r: 400, tint: '#22D3EE' },
  { id: 'rift_amber', cx: -6000, cy: 4200, r: 410, tint: '#FBBF24' },
] as const;

export type BossRiftKind =
  | 'trial_purge'
  | 'beam_maze'
  | 'split_core'
  | 'meteor_cage'
  | 'void_hunt'
  | 'storm_gauntlet';

export type BossRiftPhase = 'warp_in' | 'objective' | 'boss' | 'warp_out' | 'none';

export interface BossRiftState {
  active: boolean;
  kind: BossRiftKind;
  phase: BossRiftPhase;
  timer: number;
  objectiveCur: number;
  objectiveMax: number;
  arenaId: string;
  anchorX: number;
  anchorY: number;
  arenaR: number;
  tint: string;
  returnX: number;
  returnY: number;
  bossId: string | null;
  bossKind: BossRiftBossKind;
  bossName: string;
  bossToast: string;
  label: string;
  hint: string;
}

export const BOSS_RIFT_DEFS: {
  kind: BossRiftKind;
  label: string;
  hint: string;
  objectiveMax: number;
  warpIn: number;
  objectiveTime: number;
}[] = [
  {
    kind: 'trial_purge',
    label: 'PURGE TRIAL',
    hint: 'Убей волну теней, чтобы открыть босса',
    objectiveMax: 14,
    warpIn: 1.4,
    objectiveTime: 50,
  },
  {
    kind: 'beam_maze',
    label: 'BEAM MAZE',
    hint: 'Переживи лазерный лабиринт 18с',
    objectiveMax: 18,
    warpIn: 1.2,
    objectiveTime: 18,
  },
  {
    kind: 'split_core',
    label: 'SPLIT CORE',
    hint: 'Уничтожь все 3 ядра-призрака',
    objectiveMax: 3,
    warpIn: 1.3,
    objectiveTime: 55,
  },
  {
    kind: 'meteor_cage',
    label: 'METEOR CAGE',
    hint: 'Выживи под дождём метеоров и добей митов',
    objectiveMax: 10,
    warpIn: 1.35,
    objectiveTime: 42,
  },
  {
    kind: 'void_hunt',
    label: 'VOID HUNT',
    hint: 'Найди и убей Void Priest среди клонов',
    objectiveMax: 1,
    warpIn: 1.5,
    objectiveTime: 45,
  },
  {
    kind: 'storm_gauntlet',
    label: 'STORM GAUNTLET',
    hint: 'Сожги 20 мобов в кольце шторма',
    objectiveMax: 20,
    warpIn: 1.25,
    objectiveTime: 48,
  },
];

export function createEmptyBossRift(): BossRiftState {
  return {
    active: false,
    kind: 'trial_purge',
    phase: 'none',
    timer: 0,
    objectiveCur: 0,
    objectiveMax: 1,
    arenaId: RIFT_ARENAS[0].id,
    anchorX: RIFT_ARENAS[0].cx,
    anchorY: RIFT_ARENAS[0].cy,
    arenaR: RIFT_ARENAS[0].r,
    tint: RIFT_ARENAS[0].tint,
    returnX: 0,
    returnY: 0,
    bossId: null,
    bossKind: 'boss_titan',
    bossName: 'BOSS',
    bossToast: '',
    label: '',
    hint: '',
  };
}

export function pickRiftArena(seed: number) {
  return RIFT_ARENAS[Math.abs(seed) % RIFT_ARENAS.length];
}

export function pickRiftKind(seed: number): (typeof BOSS_RIFT_DEFS)[number] {
  return BOSS_RIFT_DEFS[Math.abs(seed) % BOSS_RIFT_DEFS.length];
}

export function clampToRiftArena(x: number, y: number, cx: number, cy: number, r: number, pad = 36) {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy) || 0.001;
  const maxR = r - pad;
  if (dist <= maxR) return { x, y };
  return { x: cx + (dx / dist) * maxR, y: cy + (dy / dist) * maxR };
}

export function initBossRift(
  returnX: number,
  returnY: number,
  seed: number,
  boss: { kind: BossRiftBossKind; name: string; toast: string }
): BossRiftState {
  const arena = pickRiftArena(seed);
  const def = pickRiftKind(seed + 5);
  return {
    active: true,
    kind: def.kind,
    phase: 'warp_in',
    timer: 0,
    objectiveCur: 0,
    objectiveMax: def.objectiveMax,
    arenaId: arena.id,
    anchorX: arena.cx,
    anchorY: arena.cy,
    arenaR: arena.r,
    tint: arena.tint,
    returnX,
    returnY,
    bossId: null,
    bossKind: boss.kind,
    bossName: boss.name,
    bossToast: boss.toast,
    label: def.label,
    hint: def.hint,
  };
}

export function riftDefFor(kind: BossRiftKind) {
  return BOSS_RIFT_DEFS.find((d) => d.kind === kind) ?? BOSS_RIFT_DEFS[0];
}
