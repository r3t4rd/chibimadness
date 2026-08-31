import { CharacterClass, ChibiConfig, Player, PlayerStats } from '../types/game';
import { CLASS_DEFAULTS, ITEMS_DATABASE } from './constants';
import type { EvolutionId } from './evolutions';

const SAVE_KEY = 'chibimadness.operators.v1';
const MAX_SLOTS = 8;

export interface SavedOperator {
  id: string;
  name: string;
  characterClass: CharacterClass;
  chibi: ChibiConfig;
  stats: PlayerStats;
  evolutions: Record<string, number>;
  pendingEvolutionPicks: number;
  gold: number;
  inventory: Player['inventory'];
  equipment: Player['equipment'];
  skills: Player['skills'];
  activeQuests: Player['activeQuests'];
  completedQuestIds: string[];
  createdAt: number;
  updatedAt: number;
}

function newId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listOperators(): SavedOperator[] {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === 'string' && s.chibi && s.stats);
  } catch {
    return [];
  }
}

function writeAll(list: SavedOperator[]) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(list.slice(0, MAX_SLOTS)));
}

export function makeBaseStats(cls: CharacterClass): PlayerStats {
  const d = CLASS_DEFAULTS[cls];
  return {
    level: 1,
    exp: 0,
    maxExp: 100,
    hp: d.baseHp,
    maxHp: d.baseHp,
    mp: d.baseMp,
    maxMp: d.baseMp,
    atk: d.baseAtk,
    def: d.baseDef,
    speed: d.baseSpd,
    critRate: 10,
    statPoints: 0,
    str: 5,
    agi: 5,
    int: 5,
    vit: 5,
  };
}

export function createOperatorPlayer(opts: {
  name: string;
  characterClass: CharacterClass;
  chibi: ChibiConfig;
  id?: string;
}): Player {
  const cls = opts.characterClass;
  const selected = CLASS_DEFAULTS[cls];
  const starterWeapon = ITEMS_DATABASE[selected.starterWeapon];
  const stats = makeBaseStats(cls);
  const id = opts.id || newId();

  return {
    // `id` is the multiplayer identity.  Reusing the old constant here made
    // every operator restored from local storage join as `local_player`, so a
    // server correctly accepted only one of them.  The save slot ID is already
    // a per-install random ID and is stable across launches.
    id,
    saveId: id,
    name: opts.name.trim() || 'Hero',
    characterClass: cls,
    chibi: { ...opts.chibi },
    x: 650,
    y: 750,
    vx: 0,
    vy: 0,
    facing: 'right',
    state: 'idle',
    stats,
    stamina: 100,
    maxStamina: 100,
    isSprinting: false,
    jumpZ: 0,
    jumpVz: 0,
    isJumping: false,
    bhopStreak: 0,
    bhopTimer: 0,
    bhopSpeedMult: 1,
    gold: 100,
    inventory: [
      { slotId: 1, item: starterWeapon, quantity: 1 },
      { slotId: 2, item: ITEMS_DATABASE['item_hp_potion_s'], quantity: 5 },
      { slotId: 3, item: ITEMS_DATABASE['item_ramen_bowl'], quantity: 3 },
    ],
    equipment: {
      weapon: starterWeapon,
      headwear: null,
      outfit: null,
      vehicle: null,
      accessory: null,
    },
    skills: JSON.parse(JSON.stringify(selected.starterSkills)),
    activeVehicleId: null,
    isRiding: false,
    spawnBounce: 1,
    attackTimer: 0,
    dodgeTimer: 0,
    combo: 0,
    lastAttackTime: 0,
    ammo: 12,
    maxAmmo: 12,
    isReloading: false,
    reloadTimer: 0,
    activeQuests: {
      q_first_steps: {
        questId: 'q_first_steps',
        status: 'active',
        objectives: [
          {
            type: 'kill',
            targetId: 'cyber_drone',
            targetName: 'Cyber Drones',
            current: 0,
            required: 2,
          },
        ],
      },
    },
    completedQuestIds: [],
    currentZone: 'cyber_city',
    activeBuffs: [],
    evolutions: {},
    pendingEvolutionPicks: 0,
  };
}

export function playerToSave(player: Player): SavedOperator {
  const now = Date.now();
  const existing = listOperators().find((s) => s.id === player.saveId);
  return {
    id: player.saveId || newId(),
    name: player.name,
    characterClass: player.characterClass,
    chibi: player.chibi,
    stats: { ...player.stats },
    evolutions: { ...(player.evolutions || {}) },
    pendingEvolutionPicks: player.pendingEvolutionPicks ?? 0,
    gold: player.gold,
    inventory: JSON.parse(JSON.stringify(player.inventory || [])),
    equipment: JSON.parse(JSON.stringify(player.equipment)),
    skills: JSON.parse(JSON.stringify(player.skills || [])),
    activeQuests: JSON.parse(JSON.stringify(player.activeQuests || {})),
    completedQuestIds: [...(player.completedQuestIds || [])],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function saveToPlayer(save: SavedOperator): Player {
  const fresh = createOperatorPlayer({
    id: save.id,
    name: save.name,
    characterClass: save.characterClass,
    chibi: save.chibi,
  });
  const skills = JSON.parse(JSON.stringify(save.skills?.length ? save.skills : fresh.skills));
  for (const s of skills) s.lastUsed = 0;

  return {
    ...fresh,
    saveId: save.id,
    name: save.name,
    characterClass: save.characterClass,
    chibi: save.chibi,
    stats: { ...save.stats, hp: save.stats.maxHp },
    gold: save.gold,
    inventory: save.inventory?.length ? JSON.parse(JSON.stringify(save.inventory)) : fresh.inventory,
    equipment: save.equipment ? JSON.parse(JSON.stringify(save.equipment)) : fresh.equipment,
    skills,
    activeQuests: save.activeQuests ? JSON.parse(JSON.stringify(save.activeQuests)) : fresh.activeQuests,
    completedQuestIds: [...(save.completedQuestIds || [])],
    evolutions: { ...(save.evolutions || {}) },
    pendingEvolutionPicks: save.pendingEvolutionPicks || 0,
  };
}

export function upsertOperator(player: Player): SavedOperator {
  const save = playerToSave(player);
  const list = listOperators().filter((s) => s.id !== save.id);
  list.unshift(save);
  writeAll(list);
  return save;
}

export function resetOperator(save: SavedOperator): Player {
  const fresh = createOperatorPlayer({
    id: save.id,
    name: save.name,
    characterClass: save.characterClass,
    chibi: save.chibi,
  });
  upsertOperator(fresh);
  return fresh;
}

export function deleteOperator(id: string) {
  writeAll(listOperators().filter((s) => s.id !== id));
}

export function persistOperatorDebounced(player: Player) {
  if (!player.saveId || player.id === 'default') return;
  upsertOperator(player);
}

export type { EvolutionId };
