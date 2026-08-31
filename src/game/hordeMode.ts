import { Monster } from '../types/game';
import { BossRiftBossKind, BossRiftState, createEmptyBossRift } from './bossRifts';

/** Pocket dimension west of the overworld so it never collides with interiors (x ≥ 6800). */
export const HORDE_ARENA = {
  minX: -11200,
  minY: -2400,
  maxX: -800,
  maxY: 6800,
  cx: -6000,
  cy: 2200,
};

export const HORDE_ZONE_ID = 'horde_crucible';
export const HORDE_UNLOCK_INTERVAL = 20;
export const HORDE_BOSS_INTERVAL = 28;
export const HORDE_EXTRACT_AFTER = 24;
export const HORDE_FADE_SECONDS = 0.48;
export const HORDE_LIVING_CAP = 58;
export const HORDE_GEM_MAGNET = 230;
export const HORDE_SPAWN_PLAZA = 520;

export type HordeEndReason = 'extract' | 'death' | 'teleport';

export type HordeArchetype =
  | 'shade'
  | 'mite'
  | 'raider'
  | 'laser'
  | 'shotgun'
  | 'bomber'
  | 'skycaller'
  | 'dasher'
  | 'sniper'
  | 'orbiter'
  | 'splitter'
  | 'blindcaster'
  | 'boss_titan'
  | 'boss_beam'
  | 'boss_skyfall'
  | 'boss_void'
  | 'boss_storm';

export type HordeHazardType = 'meteor' | 'beam' | 'ring' | 'cross' | 'void_burst';

export interface HordeHazard {
  id: string;
  type: HordeHazardType;
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  radius: number;
  telegraph: number;
  telegraphMax: number;
  active: number;
  activeMax: number;
  damage: number;
  didHit: boolean;
  ownerId?: string;
  color: string;
}

export type HordeFeatureKind = 'void' | 'leak' | 'rack';

export interface HordeFeature {
  id: string;
  kind: HordeFeatureKind;
  x: number;
  y: number;
  r: number;
  seed: number;
}

export interface HordeBlindness {
  active: boolean;
  remaining: number;
  casterId: string | null;
}

export interface HordeRunState {
  active: boolean;
  elapsed: number;
  kills: number;
  gemsCollected: number;
  returnX: number;
  returnY: number;
  canExtract: boolean;
  spawnAcc: number;
  unlockedCount: number;
  nextUnlockIn: number;
  nextBossIn: number;
  bossIndex: number;
  currentMobName: string;
  nextMobName: string;
  hazardAcc: number;
  blindness: HordeBlindness;
  bossRift: BossRiftState;
  riftWarp: number;
}

export const HORDE_ROSTER: { kind: Exclude<HordeArchetype, `boss_${string}`>; name: string; toast: string; icon: string }[] = [
  { kind: 'shade', name: 'Null Shade', toast: 'Packet shades crawl the grid', icon: '◆' },
  { kind: 'mite', name: 'Bit Mite', toast: 'Tiny crawlers — stomp them', icon: '·' },
  { kind: 'raider', name: 'Sys Raider', toast: 'They brought guns into the rack', icon: '▤' },
  { kind: 'laser', name: 'Beam Acolyte', toast: 'A line forms. Step off it.', icon: '━' },
  { kind: 'shotgun', name: 'Rack Scavenger', toast: 'Close-range pellet storms', icon: '▣' },
  { kind: 'bomber', name: 'Payload Imp', toast: 'Floor circles = leave now', icon: '◉' },
  { kind: 'skycaller', name: 'Skyfall Chanter', toast: 'Marks fall from the ceiling', icon: '☄' },
  { kind: 'dasher', name: 'Kernel Dasher', toast: 'They charge. Sidestep.', icon: '»' },
  { kind: 'sniper', name: 'Port Sniper', toast: 'Red line means MOVE', icon: '+' },
  { kind: 'orbiter', name: 'Orbit Wisp', toast: 'Circling packets — keep off the ring', icon: '◎' },
  { kind: 'splitter', name: 'Fork Process', toast: 'Kill it and it forks', icon: 'Y' },
  { kind: 'blindcaster', name: 'Void Priest', toast: 'It steals your eyes. Hunt the scream.', icon: '◉' },
];

export const HORDE_BOSSES: { kind: BossRiftBossKind; name: string; toast: string }[] = [
  { kind: 'boss_titan', name: 'CORE TITAN', toast: 'The rack itself stands up' },
  { kind: 'boss_beam', name: 'BEAMWEAVER', toast: 'Cross-lasers — walk the gaps' },
  { kind: 'boss_skyfall', name: 'SKYFALL ARCHON', toast: 'The ceiling is dropping' },
  { kind: 'boss_void', name: 'NULL PROPHET', toast: 'It wants your vision' },
  { kind: 'boss_storm', name: 'PACKET STORM', toast: 'Bullet hell in the aisle' },
];

export function createEmptyHordeRun(): HordeRunState {
  return {
    active: false,
    elapsed: 0,
    kills: 0,
    gemsCollected: 0,
    returnX: 650,
    returnY: 750,
    canExtract: false,
    spawnAcc: 0,
    unlockedCount: 1,
    nextUnlockIn: HORDE_UNLOCK_INTERVAL,
    nextBossIn: HORDE_BOSS_INTERVAL,
    bossIndex: 0,
    currentMobName: HORDE_ROSTER[0].name,
    nextMobName: HORDE_ROSTER[1].name,
    hazardAcc: 0,
    blindness: { active: false, remaining: 0, casterId: null },
    bossRift: createEmptyBossRift(),
    riftWarp: 0,
  };
}

export function isInHordeArena(x: number, y: number): boolean {
  return x >= HORDE_ARENA.minX - 120 && x <= HORDE_ARENA.maxX + 120
    && y >= HORDE_ARENA.minY - 120 && y <= HORDE_ARENA.maxY + 120;
}

export function clampToHordeArena(x: number, y: number, pad = 48): { x: number; y: number } {
  return {
    x: Math.max(HORDE_ARENA.minX + pad, Math.min(HORDE_ARENA.maxX - pad, x)),
    y: Math.max(HORDE_ARENA.minY + pad, Math.min(HORDE_ARENA.maxY - pad, y)),
  };
}

function hash01(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7 + 19.19) * 43758.5453;
  return x - Math.floor(x);
}

function generateHordeFeatures(): HordeFeature[] {
  const { minX, minY, maxX, maxY, cx, cy } = HORDE_ARENA;
  const out: HordeFeature[] = [];
  const w = maxX - minX;
  const h = maxY - minY;

  const tryPlace = (kind: HordeFeatureKind, i: number, r: number) => {
    const x = minX + 220 + hash01(i, 1) * (w - 440);
    const y = minY + 220 + hash01(i, 2) * (h - 440);
    if (Math.hypot(x - cx, y - cy) < HORDE_SPAWN_PLAZA + r) return;
    if (out.some((f) => Math.hypot(f.x - x, f.y - y) < f.r + r + 70)) return;
    out.push({ id: `hf_${kind}_${i}`, kind, x, y, r, seed: i });
  };

  for (let i = 0; i < 28; i++) tryPlace('void', i, 70 + (i % 5) * 18);
  for (let i = 40; i < 58; i++) tryPlace('leak', i, 36 + (i % 4) * 8);
  for (let i = 80; i < 118; i++) tryPlace('rack', i, 22 + (i % 3) * 4);
  return out;
}

export const HORDE_FEATURES: HordeFeature[] = generateHordeFeatures();

export function pushOutOfHordeFeatures(x: number, y: number, radius = 16): { x: number; y: number; inVoid: boolean; inLeak: boolean } {
  let nx = x;
  let ny = y;
  let inVoid = false;
  let inLeak = false;
  for (const f of HORDE_FEATURES) {
    const dx = nx - f.x;
    const dy = ny - f.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    if (f.kind === 'void' && dist < f.r + radius * 0.35) {
      inVoid = true;
      const push = (f.r + radius + 6) - dist;
      nx += (dx / dist) * push;
      ny += (dy / dist) * push;
    } else if (f.kind === 'rack' && dist < f.r + radius) {
      const push = (f.r + radius + 2) - dist;
      nx += (dx / dist) * push;
      ny += (dy / dist) * push;
    } else if (f.kind === 'leak' && dist < f.r + 8) {
      inLeak = true;
    }
  }
  const clamped = clampToHordeArena(nx, ny, 40);
  return { x: clamped.x, y: clamped.y, inVoid, inLeak };
}

export function difficultyScale(elapsed: number): number {
  return 1 + elapsed / 78;
}

export function hordeSpawnRate(elapsed: number): number {
  return Math.min(5.4, 0.95 + elapsed * 0.032);
}

export function hordeLivingCap(elapsed: number): number {
  return Math.min(HORDE_LIVING_CAP, 16 + Math.floor(elapsed / 9));
}

export function pickHordeArchetype(unlockedCount: number): HordeArchetype {
  const n = Math.max(1, Math.min(unlockedCount, HORDE_ROSTER.length));
  let kind: HordeArchetype;
  if (Math.random() < 0.42) {
    kind = HORDE_ROSTER[n - 1].kind;
  } else {
    kind = HORDE_ROSTER[Math.floor(Math.random() * n)].kind;
  }
  if (kind === 'blindcaster' && Math.random() > 0.14) {
    kind = HORDE_ROSTER[Math.max(0, n - 2)].kind;
  }
  return kind;
}

function clampSpawn(x: number, y: number): { x: number; y: number } {
  let p = clampToHordeArena(x, y, 90);
  p = pushOutOfHordeFeatures(p.x, p.y, 20);
  return { x: p.x, y: p.y };
}

export function rollHordeSpawnPoint(px: number, py: number, minR = 420, maxR = 720): { x: number; y: number } {
  let best = { x: px + minR, y: py };
  for (let attempt = 0; attempt < 8; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = minR + Math.random() * (maxR - minR);
    const cand = clampSpawn(px + Math.cos(ang) * dist, py + Math.sin(ang) * dist);
    if (!HORDE_FEATURES.some((f) => f.kind === 'void' && Math.hypot(f.x - cand.x, f.y - cand.y) < f.r + 30)) {
      return cand;
    }
    best = cand;
  }
  return best;
}

let hordeIdSeq = 1;
function nextHordeId(prefix: string): string {
  hordeIdSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${hordeIdSeq}`;
}

export function createHordeMob(
  px: number,
  py: number,
  elapsed: number,
  playerId: string,
  archetype: HordeArchetype = pickHordeArchetype(1),
  spawn?: { x: number; y: number }
): Monster {
  const pos = spawn ?? rollHordeSpawnPoint(px, py);
  const scale = difficultyScale(elapsed);
  const id = nextHordeId('horde');

  const base: Pick<Monster, 'id' | 'zone' | 'x' | 'y' | 'spawnX' | 'spawnY' | 'state' | 'targetPlayerId' | 'damagedByPlayer' | 'retaliatePlayer' | 'faction' | 'attackCooldown' | 'specialCooldown' | 'isRespawning' | 'hordeKind'> = {
    id,
    zone: HORDE_ZONE_ID,
    x: pos.x,
    y: pos.y,
    spawnX: pos.x,
    spawnY: pos.y,
    state: 'chase',
    targetPlayerId: playerId,
    damagedByPlayer: true,
    retaliatePlayer: true,
    faction: 'wild',
    attackCooldown: 0.15 + Math.random() * 0.55,
    specialCooldown: 1.2 + Math.random() * 1.8,
    isRespawning: false,
    hordeKind: archetype,
  };

  switch (archetype) {
    case 'mite':
      return {
        ...base,
        name: 'Bit Mite',
        type: 'forest_wolf',
        maxHp: Math.round(18 * scale),
        hp: Math.round(18 * scale),
        atk: Math.round(5 * scale),
        def: 0,
        speed: Math.min(5.4, 3.6 + elapsed * 0.008),
        expReward: Math.round(6 + elapsed * 0.12),
        goldReward: 2,
      };
    case 'raider':
      return {
        ...base,
        name: 'Sys Raider',
        type: 'bandit_grunt',
        maxHp: Math.round(62 * scale),
        hp: Math.round(62 * scale),
        atk: Math.round(11 * scale),
        def: 4,
        speed: Math.min(3.8, 2.4 + elapsed * 0.006),
        expReward: Math.round(16 + elapsed * 0.2),
        goldReward: 8,
        isHumanoid: true,
        weaponType: 'pistol',
      };
    case 'laser':
      return {
        ...base,
        name: 'Beam Acolyte',
        type: 'cadet_mage',
        maxHp: Math.round(78 * scale),
        hp: Math.round(78 * scale),
        atk: Math.round(22 * scale),
        def: 5,
        speed: Math.min(3.1, 1.9 + elapsed * 0.004),
        expReward: Math.round(24 + elapsed * 0.25),
        goldReward: 11,
        isHumanoid: true,
        weaponType: 'staff',
        specialCooldown: 2.2 + Math.random(),
      };
    case 'shotgun':
      return {
        ...base,
        name: 'Rack Scavenger',
        type: 'bandit_shotgunner',
        maxHp: Math.round(96 * scale),
        hp: Math.round(96 * scale),
        atk: Math.round(15 * scale),
        def: 6,
        speed: Math.min(3.5, 2.2 + elapsed * 0.005),
        expReward: Math.round(22 + elapsed * 0.22),
        goldReward: 12,
        isHumanoid: true,
        weaponType: 'shotgun',
      };
    case 'bomber':
      return {
        ...base,
        name: 'Payload Imp',
        type: 'punk_molotov',
        maxHp: Math.round(70 * scale),
        hp: Math.round(70 * scale),
        atk: Math.round(18 * scale),
        def: 3,
        speed: Math.min(3.4, 2.1 + elapsed * 0.005),
        expReward: Math.round(20 + elapsed * 0.22),
        goldReward: 10,
        isHumanoid: true,
        weaponType: 'molotov',
        specialCooldown: 1.6 + Math.random(),
      };
    case 'skycaller':
      return {
        ...base,
        name: 'Skyfall Chanter',
        type: 'cadet_mage',
        maxHp: Math.round(88 * scale),
        hp: Math.round(88 * scale),
        atk: Math.round(16 * scale),
        def: 4,
        speed: Math.min(2.8, 1.7 + elapsed * 0.004),
        expReward: Math.round(26 + elapsed * 0.28),
        goldReward: 14,
        isHumanoid: true,
        weaponType: 'staff',
        specialCooldown: 2.8 + Math.random(),
      };
    case 'dasher':
      return {
        ...base,
        name: 'Kernel Dasher',
        type: 'bandit_brawler',
        maxHp: Math.round(84 * scale),
        hp: Math.round(84 * scale),
        atk: Math.round(16 * scale),
        def: 5,
        speed: Math.min(4.8, 3.1 + elapsed * 0.007),
        expReward: Math.round(18 + elapsed * 0.2),
        goldReward: 9,
        isHumanoid: true,
        weaponType: 'blade',
      };
    case 'sniper':
      return {
        ...base,
        name: 'Port Sniper',
        type: 'bandit_sniper',
        maxHp: Math.round(64 * scale),
        hp: Math.round(64 * scale),
        atk: Math.round(28 * scale),
        def: 3,
        speed: Math.min(2.6, 1.6 + elapsed * 0.003),
        expReward: Math.round(28 + elapsed * 0.26),
        goldReward: 14,
        isHumanoid: true,
        weaponType: 'cheytac',
        specialCooldown: 2.4,
      };
    case 'orbiter':
      return {
        ...base,
        name: 'Orbit Wisp',
        type: 'cadet_mage',
        maxHp: Math.round(72 * scale),
        hp: Math.round(72 * scale),
        atk: Math.round(12 * scale),
        def: 4,
        speed: Math.min(3.2, 2.0 + elapsed * 0.004),
        expReward: Math.round(22 + elapsed * 0.24),
        goldReward: 11,
        isHumanoid: true,
        weaponType: 'staff',
        specialCooldown: 0.85,
      };
    case 'splitter':
      return {
        ...base,
        name: 'Fork Process',
        type: 'punk_grunt',
        maxHp: Math.round(58 * scale),
        hp: Math.round(58 * scale),
        atk: Math.round(10 * scale),
        def: 3,
        speed: Math.min(3.6, 2.3 + elapsed * 0.006),
        expReward: Math.round(14 + elapsed * 0.18),
        goldReward: 7,
        isHumanoid: true,
        weaponType: 'bat',
      };
    case 'blindcaster':
      return {
        ...base,
        name: 'Void Priest',
        type: 'cadet_mage',
        maxHp: Math.round(140 * scale),
        hp: Math.round(140 * scale),
        atk: Math.round(10 * scale),
        def: 6,
        speed: Math.min(2.4, 1.5 + elapsed * 0.003),
        expReward: Math.round(48 + elapsed * 0.4),
        goldReward: 22,
        isHumanoid: true,
        weaponType: 'staff',
        specialCooldown: 4 + Math.random() * 2,
        battleBark: { text: 'BLIND THE INTRUDER', timer: 1.6 },
      };
    case 'boss_titan':
      return {
        ...base,
        name: 'CORE TITAN',
        type: 'punk_juggernaut',
        maxHp: Math.round(980 * scale),
        hp: Math.round(980 * scale),
        atk: Math.round(32 * scale),
        def: 16,
        speed: Math.min(2.6, 1.5 + elapsed * 0.003),
        expReward: Math.round(180 + elapsed * 1.2),
        goldReward: Math.round(90 + elapsed),
        isHumanoid: true,
        isJuggernaut: true,
        isBoss: true,
        weaponType: 'sledgehammer',
        battleBark: { text: 'KERNEL PANIC', timer: 2 },
        specialCooldown: 2.4,
      };
    case 'boss_beam':
      return {
        ...base,
        name: 'BEAMWEAVER',
        type: 'cadet_mage',
        maxHp: Math.round(820 * scale),
        hp: Math.round(820 * scale),
        atk: Math.round(26 * scale),
        def: 12,
        speed: Math.min(2.4, 1.4 + elapsed * 0.003),
        expReward: Math.round(170 + elapsed * 1.1),
        goldReward: Math.round(85 + elapsed),
        isHumanoid: true,
        isBoss: true,
        weaponType: 'staff',
        battleBark: { text: 'ALIGN THE LATTICE', timer: 2 },
        specialCooldown: 2.1,
      };
    case 'boss_skyfall':
      return {
        ...base,
        name: 'SKYFALL ARCHON',
        type: 'cadet_mage',
        maxHp: Math.round(860 * scale),
        hp: Math.round(860 * scale),
        atk: Math.round(24 * scale),
        def: 11,
        expReward: Math.round(175 + elapsed * 1.15),
        goldReward: Math.round(88 + elapsed),
        speed: Math.min(2.5, 1.5 + elapsed * 0.003),
        isHumanoid: true,
        isBoss: true,
        weaponType: 'staff',
        battleBark: { text: 'DROP THE CLUSTER', timer: 2 },
        specialCooldown: 1.8,
      };
    case 'boss_void':
      return {
        ...base,
        name: 'NULL PROPHET',
        type: 'cadet_mage',
        maxHp: Math.round(900 * scale),
        hp: Math.round(900 * scale),
        atk: Math.round(20 * scale),
        def: 13,
        speed: Math.min(2.3, 1.4 + elapsed * 0.003),
        expReward: Math.round(190 + elapsed * 1.2),
        goldReward: Math.round(95 + elapsed),
        isHumanoid: true,
        isBoss: true,
        weaponType: 'staff',
        battleBark: { text: 'SEE NOTHING', timer: 2.2 },
        specialCooldown: 5,
      };
    case 'boss_storm':
      return {
        ...base,
        name: 'PACKET STORM',
        type: 'punk_anarchist',
        maxHp: Math.round(780 * scale),
        hp: Math.round(780 * scale),
        atk: Math.round(18 * scale),
        def: 10,
        speed: Math.min(3.0, 1.8 + elapsed * 0.004),
        expReward: Math.round(165 + elapsed * 1.1),
        goldReward: Math.round(80 + elapsed),
        isHumanoid: true,
        isBoss: true,
        weaponType: 'mac10',
        battleBark: { text: 'DDOS THE FLESH', timer: 2 },
        specialCooldown: 1.5,
      };
    default:
      return {
        ...base,
        name: 'Null Shade',
        type: 'forest_wolf',
        maxHp: Math.round(38 * scale),
        hp: Math.round(38 * scale),
        atk: Math.round(8 * scale),
        def: 2,
        speed: Math.min(4.5, 2.7 + elapsed * 0.008),
        expReward: Math.round(10 + elapsed * 0.16),
        goldReward: 4,
      };
  }
}

export function spawnHordeIntro(px: number, py: number, playerId: string): Monster[] {
  const mobs: Monster[] = [];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const dist = 480 + (i % 3) * 70;
    const spawn = clampSpawn(px + Math.cos(ang) * dist, py + Math.sin(ang) * dist);
    mobs.push(createHordeMob(px, py, 0, playerId, 'shade', spawn));
  }
  return mobs;
}

export function spawnHordeTypeBurst(
  px: number,
  py: number,
  elapsed: number,
  playerId: string,
  kind: HordeArchetype,
  count: number
): Monster[] {
  const mobs: Monster[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const dist = 500 + (i % 4) * 80;
    const spawn = clampSpawn(px + Math.cos(ang) * dist, py + Math.sin(ang) * dist);
    mobs.push(createHordeMob(px, py, elapsed, playerId, kind, spawn));
  }
  return mobs;
}

function hazardBase(partial: Omit<HordeHazard, 'id' | 'didHit'>): HordeHazard {
  return { ...partial, id: nextHordeId('hz'), didHit: false };
}

export function makeMeteorHazard(x: number, y: number, damage: number, telegraph = 1.35): HordeHazard {
  return hazardBase({
    type: 'meteor',
    x,
    y,
    angle: 0,
    length: 0,
    width: 0,
    radius: 58,
    telegraph,
    telegraphMax: telegraph,
    active: 0.22,
    activeMax: 0.22,
    damage,
    color: '#FB7185',
  });
}

export function makeBeamHazard(x: number, y: number, angle: number, length: number, damage: number, telegraph = 1.15): HordeHazard {
  return hazardBase({
    type: 'beam',
    x,
    y,
    angle,
    length,
    width: 26,
    radius: 0,
    telegraph,
    telegraphMax: telegraph,
    active: 0.28,
    activeMax: 0.28,
    damage,
    color: '#22D3EE',
  });
}

export function makeRingHazard(x: number, y: number, radius: number, damage: number, telegraph = 0.85): HordeHazard {
  return hazardBase({
    type: 'ring',
    x,
    y,
    angle: 0,
    length: 0,
    width: 22,
    radius,
    telegraph,
    telegraphMax: telegraph,
    active: 0.7,
    activeMax: 0.7,
    damage,
    color: '#A78BFA',
  });
}

export function makeCrossHazard(x: number, y: number, damage: number, telegraph = 1.2): HordeHazard {
  return hazardBase({
    type: 'cross',
    x,
    y,
    angle: Math.random() * 0.4,
    length: 980,
    width: 24,
    radius: 0,
    telegraph,
    telegraphMax: telegraph,
    active: 0.32,
    activeMax: 0.32,
    damage,
    color: '#67E8F9',
  });
}

export function makeVoidBurstHazard(x: number, y: number, damage: number, telegraph = 1.05): HordeHazard {
  return hazardBase({
    type: 'void_burst',
    x,
    y,
    angle: 0,
    length: 0,
    width: 0,
    radius: 92,
    telegraph,
    telegraphMax: telegraph,
    active: 0.35,
    activeMax: 0.35,
    damage,
    color: '#E879F9',
  });
}

export function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function isHitByHazard(h: HordeHazard, px: number, py: number, jumpZ: number): boolean {
  if (h.telegraph > 0 || h.didHit) return false;
  if (h.type === 'meteor' || h.type === 'void_burst') {
    if (jumpZ > 42 && h.type === 'meteor') return false;
    return Math.hypot(px - h.x, py - h.y) <= h.radius + 10;
  }
  if (h.type === 'ring') {
    const progress = 1 - h.active / h.activeMax;
    const ringR = 40 + h.radius * progress;
    const d = Math.hypot(px - h.x, py - h.y);
    return Math.abs(d - ringR) < h.width + 8;
  }
  if (h.type === 'beam') {
    const x2 = h.x + Math.cos(h.angle) * h.length;
    const y2 = h.y + Math.sin(h.angle) * h.length;
    return pointToSegmentDist(px, py, h.x, h.y, x2, y2) <= h.width + 8;
  }
  if (h.type === 'cross') {
    const a = h.angle;
    const hLen = h.length / 2;
    const d1 = pointToSegmentDist(
      px, py,
      h.x + Math.cos(a) * -hLen, h.y + Math.sin(a) * -hLen,
      h.x + Math.cos(a) * hLen, h.y + Math.sin(a) * hLen
    );
    const b = a + Math.PI / 2;
    const d2 = pointToSegmentDist(
      px, py,
      h.x + Math.cos(b) * -hLen, h.y + Math.sin(b) * -hLen,
      h.x + Math.cos(b) * hLen, h.y + Math.sin(b) * hLen
    );
    return d1 <= h.width + 8 || d2 <= h.width + 8;
  }
  return false;
}

export function pickAmbientHazard(px: number, py: number, elapsed: number, damageScale: number): HordeHazard {
  const roll = Math.random();
  const dmg = Math.round((12 + elapsed * 0.18) * damageScale);
  if (elapsed > 90 && roll < 0.22) {
    return makeCrossHazard(px + (Math.random() - 0.5) * 80, py + (Math.random() - 0.5) * 80, dmg + 8);
  }
  if (elapsed > 50 && roll < 0.5) {
    const ang = Math.random() * Math.PI * 2;
    const origin = rollHordeSpawnPoint(px, py, 180, 420);
    return makeBeamHazard(origin.x, origin.y, ang, 780, dmg + 6, 1.25);
  }
  if (elapsed > 70 && roll < 0.72) {
    return makeRingHazard(px, py, 260 + Math.random() * 80, dmg, 0.9);
  }
  const ox = px + (Math.random() - 0.5) * 280;
  const oy = py + (Math.random() - 0.5) * 280;
  return makeMeteorHazard(ox, oy, dmg, 1.25 + Math.random() * 0.3);
}

export function hordeExtractBonus(kills: number, elapsed: number): { gold: number; exp: number } {
  const minutes = elapsed / 60;
  return {
    gold: Math.round(kills * 6 + minutes * 140 + elapsed * 1.3),
    exp: Math.round(kills * 4 + minutes * 90),
  };
}

export function formatHordeTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

let liveHazards: HordeHazard[] = [];
let liveBlindness: HordeBlindness = { active: false, remaining: 0, casterId: null };
let liveRiftFx = { active: false, warp: 0, tint: '#22D3EE', cx: 0, cy: 0, r: 400 };

export function publishHordeFx(hazards: HordeHazard[], blindness: HordeBlindness) {
  liveHazards = hazards;
  liveBlindness = blindness;
}

export function publishHordeRift(rift: BossRiftState, warp: number) {
  liveRiftFx = {
    active: rift.active && rift.phase !== 'none',
    warp,
    tint: rift.tint,
    cx: rift.anchorX,
    cy: rift.anchorY,
    r: rift.arenaR,
  };
}

export function getHordeRiftFx() {
  return liveRiftFx;
}

export function getHordeHazards(): HordeHazard[] {
  return liveHazards;
}

export function getHordeBlindness(): HordeBlindness {
  return liveBlindness;
}

export function clearHordeFx() {
  liveHazards = [];
  liveBlindness = { active: false, remaining: 0, casterId: null };
  liveRiftFx = { active: false, warp: 0, tint: '#22D3EE', cx: 0, cy: 0, r: 400 };
}
