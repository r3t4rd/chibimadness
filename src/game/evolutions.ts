import { CharacterClass, Monster, Player } from '../types/game';

export type EvolutionRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type EvolutionId =
  | 'soul_burst'
  | 'chain_bolt'
  | 'garlic_ward'
  | 'blood_magnet'
  | 'frost_nova'
  | 'stardust_trail'
  | 'thunder_crown'
  | 'vampire_kiss'
  | 'overclock'
  | 'heartforge'
  | 'crit_matrix'
  | 'greed_engine'
  | 'void_slow'
  | 'death_lottery'
  | 'black_hole'
  | 'phoenix_core'
  | 'gem_bomb'
  | 'orbit_relic'
  | 'ricochet_soul'
  | 'bullet_ricochet'
  | 'harvest_moon'
  | 'hex_storm';

export interface EvolutionDef {
  id: EvolutionId;
  name: string;
  nameEn: string;
  icon: string;
  rarity: EvolutionRarity;
  maxRank: number;
  classLock?: CharacterClass;
  tagline: string;
  descFor: (rank: number) => string;
}

export const RARITY_STYLE: Record<EvolutionRarity, { border: string; glow: string; label: string; chip: string }> = {
  common: {
    border: 'border-slate-400/70',
    glow: 'shadow-[0_0_28px_rgba(148,163,184,0.35)]',
    label: 'COMMON',
    chip: 'bg-slate-500/80 text-white',
  },
  rare: {
    border: 'border-sky-400/80',
    glow: 'shadow-[0_0_32px_rgba(56,189,248,0.45)]',
    label: 'RARE',
    chip: 'bg-sky-500/90 text-white',
  },
  epic: {
    border: 'border-violet-400/80',
    glow: 'shadow-[0_0_36px_rgba(167,139,250,0.5)]',
    label: 'EPIC',
    chip: 'bg-violet-500/90 text-white',
  },
  legendary: {
    border: 'border-amber-300/90',
    glow: 'shadow-[0_0_42px_rgba(251,191,36,0.65)]',
    label: 'LEGENDARY',
    chip: 'bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950',
  },
};

const RARITY_WEIGHT: Record<EvolutionRarity, number> = {
  common: 44,
  rare: 28,
  epic: 18,
  legendary: 10,
};

export const EVOLUTION_CATALOG: EvolutionDef[] = [
  {
    id: 'soul_burst',
    name: 'Разрыв души',
    nameEn: 'SOUL BURST',
    icon: '💥',
    rarity: 'rare',
    maxRank: 5,
    tagline: 'Труп становится бомбой',
    descFor: (r) =>
      `Шанс ${12 + r * 8}% взорвать убитого. Радиус ${70 + r * 18}px, урон растёт с рангом. Цепные взрывы — это фича.`,
  },
  {
    id: 'chain_bolt',
    name: 'Цепная молния',
    nameEn: 'CHAIN BOLT',
    icon: '⚡',
    rarity: 'rare',
    maxRank: 5,
    tagline: 'Убийство зовёт гром',
    descFor: (r) =>
      `${18 + r * 10}% шанс при убийстве пустить молнию на ${2 + r} целей. Прыгает как бешеный роутер.`,
  },
  {
    id: 'garlic_ward',
    name: 'Чесночный щит',
    nameEn: 'GARLIC WARD',
    icon: '🧄',
    rarity: 'common',
    maxRank: 5,
    tagline: 'Попадание — ударная волна',
    descFor: (r) =>
      `${14 + r * 9}% шанс при попадании ударить мини-взрывом вокруг цели. Радиус ${52 + r * 14}px.`,
  },
  {
    id: 'blood_magnet',
    name: 'Кровавый магнит',
    nameEn: 'BLOOD MAGNET',
    icon: '🧲',
    rarity: 'common',
    maxRank: 5,
    tagline: 'Гемы сами бегут в рот',
    descFor: (r) => `Радиус притяжения душ +${90 * r}px. На 5 ранге карта почти целиком в кармане.`,
  },
  {
    id: 'frost_nova',
    name: 'Ледяная нова',
    nameEn: 'FROST NOVA',
    icon: '❄️',
    rarity: 'rare',
    maxRank: 5,
    tagline: 'Смерть замораживает зал',
    descFor: (r) =>
      `${16 + r * 8}% шанс при убийстве заморозить всех в ${90 + r * 22}px на ${1.1 + r * 0.35}с. Статуя-пати.`,
  },
  {
    id: 'stardust_trail',
    name: 'Звёздный след',
    nameEn: 'STARDUST TRAIL',
    icon: '✨',
    rarity: 'rare',
    maxRank: 5,
    tagline: 'Бег быстрее в Nullspace',
    descFor: (r) => `Скорость бега +${r * 4}% в Nullspace. Без жгучего следа под ногами.`,
  },
  {
    id: 'thunder_crown',
    name: 'Корона грома',
    nameEn: 'THUNDER CROWN',
    icon: '🌩️',
    rarity: 'epic',
    maxRank: 5,
    tagline: 'Попадание зовёт молнию с неба',
    descFor: (r) =>
      `${10 + r * 8}% шанс при попадании вызвать удар молнии с неба прямо в цель. Боссам тоже больно.`,
  },
  {
    id: 'vampire_kiss',
    name: 'Поцелуй вампира',
    nameEn: 'VAMPIRE KISS',
    icon: '🧛',
    rarity: 'rare',
    maxRank: 5,
    tagline: 'Каждый труп — аптечка',
    descFor: (r) => `При убийстве лечишься на ${4 + r * 5} HP. Толпа кормит тебя, как банкет.`,
  },
  {
    id: 'overclock',
    name: 'Разгон ядра',
    nameEn: 'OVERCLOCK',
    icon: '⚙️',
    rarity: 'common',
    maxRank: 5,
    tagline: 'Стреляй чаще, беги злее',
    descFor: (r) => `Скорость атаки +${r * 12}%, скорость бега +${(r * 0.12).toFixed(2)}. Пальцы дымятся.`,
  },
  {
    id: 'heartforge',
    name: 'Кузница сердца',
    nameEn: 'HEARTFORGE',
    icon: '❤️',
    rarity: 'common',
    maxRank: 5,
    tagline: 'Больше мяса, больше живучести',
    descFor: (r) => `+45 макс. HP за ранг (сейчас будет ранг ${r + 1}). Полное лечение при взятии.`,
  },
  {
    id: 'crit_matrix',
    name: 'Крит-матрица',
    nameEn: 'CRIT MATRIX',
    icon: '🎯',
    rarity: 'common',
    maxRank: 5,
    tagline: 'Цифры становятся жёлтыми',
    descFor: (r) => `+7% крит. шанса за ранг. Жёлтые циферки — это любовь.`,
  },
  {
    id: 'greed_engine',
    name: 'Двигатель жадности',
    nameEn: 'GREED ENGINE',
    icon: '💎',
    rarity: 'common',
    maxRank: 5,
    tagline: 'Больше гемов с каждого трупа',
    descFor: (r) => `Ценность душ +${r * 22}%, шанс дропнуть второй гем. Прокачка прёт как поезд.`,
  },
  {
    id: 'void_slow',
    name: 'Пустотный тормоз',
    nameEn: 'VOID SLOW',
    icon: '🌀',
    rarity: 'rare',
    maxRank: 5,
    tagline: 'Попадание вязнет во тьме',
    descFor: (r) =>
      `${12 + r * 7}% шанс при попадании замедлить цель на ${0.7 + r * 0.35}с. Без ауры вокруг тебя.`,
  },
  {
    id: 'death_lottery',
    name: 'Лотерея смерти',
    nameEn: 'DEATH LOTTERY',
    icon: '🎰',
    rarity: 'epic',
    maxRank: 5,
    tagline: 'Иногда хит = казнь',
    descFor: (r) =>
      `${3 + r * 2.2}% шанс казнить немассового врага одним попаданием. Боссы почти не палятся.`,
  },
  {
    id: 'black_hole',
    name: 'Чёрное сердце',
    nameEn: 'BLACK HEART',
    icon: '🕳️',
    rarity: 'legendary',
    maxRank: 5,
    tagline: 'Каждые N убийств — сингулярность',
    descFor: (r) =>
      `Каждые ${Math.max(6, 14 - r * 2)} убийств засасывает толпу и взрывает. Карманный апокалипсис.`,
  },
  {
    id: 'phoenix_core',
    name: 'Ядро феникса',
    nameEn: 'PHOENIX CORE',
    icon: '🔥',
    rarity: 'legendary',
    maxRank: 5,
    tagline: 'Почти смерть = ядерка',
    descFor: (r) =>
      `Если HP падает ниже ${32 - r * 3}%, вспышка, лечение и неуязвимость. КД ${Math.max(8, 18 - r * 2)}с.`,
  },
  {
    id: 'gem_bomb',
    name: 'Бомба-гем',
    nameEn: 'GEM BOMB',
    icon: '💣',
    rarity: 'epic',
    maxRank: 5,
    tagline: 'Подобрал душу — бабах',
    descFor: (r) =>
      `${14 + r * 8}% шанс при подборе гема взорвать окружение. Фарм = артиллерия.`,
  },
  {
    id: 'orbit_relic',
    name: 'Орбитальный реликвий',
    nameEn: 'ORBIT RELIC',
    icon: '🔮',
    rarity: 'rare',
    maxRank: 5,
    tagline: 'Попадание выпускает искру-снаряд',
    descFor: (r) =>
      `${11 + r * 6}% шанс при попадании выстрелить искрой в ближайшего врага. Без орбит вокруг тела.`,
  },
  {
    id: 'ricochet_soul',
    name: 'Рикошет душ',
    nameEn: 'RICOCHET SOUL',
    icon: '🎱',
    rarity: 'epic',
    maxRank: 5,
    classLock: 'gunslinger',
    tagline: 'Пули ищут следующую шею',
    descFor: (r) => `Пули рикошетят ещё ${r} раз(а) в ближайшего врага после попадания.`,
  },
  {
    id: 'bullet_ricochet',
    name: 'Рикошетный сердечник',
    nameEn: 'RICOCHET CORE',
    icon: '↩️',
    rarity: 'common',
    maxRank: 5,
    tagline: 'Любая атака отскакивает',
    descFor: (r) => `+${r} рикошет(а) для пуль и снарядов. Работает для всех классов в Nullspace.`,
  },
  {
    id: 'harvest_moon',
    name: 'Жатва',
    nameEn: 'HARVEST MOON',
    icon: '⚔️',
    rarity: 'epic',
    maxRank: 5,
    classLock: 'swordmaster',
    tagline: 'Клинок пьёт хорду',
    descFor: (r) => `Убийство лечит ${8 + r * 6} HP и даёт шанс ${10 + r * 6}% на круговой слэш.`,
  },
  {
    id: 'hex_storm',
    name: 'Гексошторм',
    nameEn: 'HEX STORM',
    icon: '☄️',
    rarity: 'epic',
    maxRank: 5,
    classLock: 'cybermage',
    tagline: 'Убийство вызывает метеор',
    descFor: (r) =>
      `${16 + r * 8}% шанс при убийстве вызвать метеор на труп. Не периодический — только с килла.`,
  },
];

export const EVOLUTION_BY_ID: Record<EvolutionId, EvolutionDef> = EVOLUTION_CATALOG.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<EvolutionId, EvolutionDef>
);

export function evoRank(player: Player, id: EvolutionId): number {
  return Math.max(0, player.evolutions?.[id] ?? 0);
}

export interface EvolutionMods {
  magnetBonus: number;
  fireRateMult: number;
  moveMult: number;
  kissHeal: number;
  greedGemMult: number;
  greedExtraChance: number;
  executeChance: number;
  soulBurstChance: number;
  soulBurstRadius: number;
  soulBurstDamage: number;
  chainChance: number;
  chainBounces: number;
  chainDamage: number;
  frostChance: number;
  frostRadius: number;
  frostDuration: number;
  blackHoleEvery: number;
  gemBombChance: number;
  gemBombRadius: number;
  gemBombDamage: number;
  harvestHeal: number;
  harvestSlashChance: number;
  hexKillChance: number;
  hexKillDamage: number;
  ricochetBounces: number;
  hitSkyChance: number;
  hitSkyDamage: number;
  hitShockChance: number;
  hitShockRadius: number;
  hitShockDamage: number;
  hitSlowChance: number;
  hitSlowDuration: number;
  hitSparkChance: number;
  hitSparkDamage: number;
  phoenixHpPct: number;
  phoenixHealPct: number;
  phoenixCd: number;
}

export const EMPTY_EVO_MODS: EvolutionMods = {
  magnetBonus: 0,
  fireRateMult: 1,
  moveMult: 1,
  kissHeal: 0,
  greedGemMult: 1,
  greedExtraChance: 0,
  executeChance: 0,
  soulBurstChance: 0,
  soulBurstRadius: 0,
  soulBurstDamage: 0,
  chainChance: 0,
  chainBounces: 0,
  chainDamage: 0,
  frostChance: 0,
  frostRadius: 0,
  frostDuration: 0,
  blackHoleEvery: 0,
  gemBombChance: 0,
  gemBombRadius: 0,
  gemBombDamage: 0,
  harvestHeal: 0,
  harvestSlashChance: 0,
  hexKillChance: 0,
  hexKillDamage: 0,
  ricochetBounces: 0,
  hitSkyChance: 0,
  hitSkyDamage: 0,
  hitShockChance: 0,
  hitShockRadius: 0,
  hitShockDamage: 0,
  hitSlowChance: 0,
  hitSlowDuration: 0,
  hitSparkChance: 0,
  hitSparkDamage: 0,
  phoenixHpPct: 0,
  phoenixHealPct: 0,
  phoenixCd: 0,
};

/** Evolution combat bonuses — only active inside Nullspace horde. */
export function getEvolutionMods(player: Player, inHorde = false): EvolutionMods {
  if (!inHorde) return { ...EMPTY_EVO_MODS };

  const r = (id: EvolutionId) => evoRank(player, id);
  const atk = player.stats?.atk ?? 20;
  const burst = r('soul_burst');
  const chain = r('chain_bolt');
  const frost = r('frost_nova');
  const trail = r('stardust_trail');
  const thunder = r('thunder_crown');
  const garlic = r('garlic_ward');
  const voidSlow = r('void_slow');
  const orbit = r('orbit_relic');
  const oc = r('overclock');
  const phoenix = r('phoenix_core');
  const hole = r('black_hole');
  const hex = r('hex_storm');
  const gem = r('gem_bomb');
  const lottery = r('death_lottery');
  const harvest = r('harvest_moon');
  const ricochet = r('ricochet_soul') + r('bullet_ricochet');

  return {
    magnetBonus: r('blood_magnet') * 95,
    fireRateMult: 1 / (1 + oc * 0.12),
    moveMult: 1 + oc * 0.04 + trail * 0.04,
    kissHeal: r('vampire_kiss') > 0 ? 4 + r('vampire_kiss') * 5 : 0,
    greedGemMult: 1 + r('greed_engine') * 0.22,
    greedExtraChance: r('greed_engine') * 0.12,
    executeChance: lottery > 0 ? (0.03 + lottery * 0.022) * (player.characterClass === 'swordmaster' ? 1.15 : 1) : 0,
    soulBurstChance: burst > 0 ? 0.12 + burst * 0.08 : 0,
    soulBurstRadius: 68 + burst * 18,
    soulBurstDamage: burst > 0 ? 16 + burst * 14 + atk * 0.55 : 0,
    chainChance: chain > 0 ? 0.18 + chain * 0.1 : 0,
    chainBounces: chain > 0 ? 2 + chain : 0,
    chainDamage: chain > 0 ? 12 + chain * 10 + atk * 0.4 : 0,
    frostChance: frost > 0 ? 0.16 + frost * 0.08 : 0,
    frostRadius: 88 + frost * 22,
    frostDuration: 1.05 + frost * 0.35,
    blackHoleEvery: hole > 0 ? Math.max(6, 14 - hole * 2) : 0,
    gemBombChance: gem > 0 ? 0.14 + gem * 0.08 : 0,
    gemBombRadius: 86 + gem * 16,
    gemBombDamage: gem > 0 ? 14 + gem * 12 + atk * 0.45 : 0,
    harvestHeal: harvest > 0 ? 8 + harvest * 6 : 0,
    harvestSlashChance: harvest > 0 ? 0.1 + harvest * 0.06 : 0,
    hexKillChance: hex > 0 ? 0.16 + hex * 0.08 : 0,
    hexKillDamage: hex > 0 ? 20 + hex * 14 + atk * 0.65 : 0,
    ricochetBounces: ricochet,
    hitSkyChance: thunder > 0 ? 0.1 + thunder * 0.08 : 0,
    hitSkyDamage: thunder > 0 ? 18 + thunder * 14 + atk * 0.75 : 0,
    hitShockChance: garlic > 0 ? 0.14 + garlic * 0.09 : 0,
    hitShockRadius: 52 + garlic * 14,
    hitShockDamage: garlic > 0 ? 10 + garlic * 9 + atk * 0.35 : 0,
    hitSlowChance: voidSlow > 0 ? 0.12 + voidSlow * 0.07 : 0,
    hitSlowDuration: 0.7 + voidSlow * 0.35,
    hitSparkChance: orbit > 0 ? 0.11 + orbit * 0.06 : 0,
    hitSparkDamage: orbit > 0 ? 8 + orbit * 7 + atk * 0.3 : 0,
    phoenixHpPct: phoenix > 0 ? (32 - phoenix * 3) / 100 : 0,
    phoenixHealPct: phoenix > 0 ? 0.12 + phoenix * 0.05 : 0,
    phoenixCd: phoenix > 0 ? Math.max(8, 18 - phoenix * 2) : 0,
  };
}

export function catalogForClass(cls: CharacterClass): EvolutionDef[] {
  return EVOLUTION_CATALOG.filter((d) => !d.classLock || d.classLock === cls);
}

export function rollLevelUpChoices(player: Player, count = 3): EvolutionDef[] {
  const pool = catalogForClass(player.characterClass).filter((d) => evoRank(player, d.id) < d.maxRank);
  if (pool.length === 0) return [];

  const weighted: EvolutionDef[] = [];
  for (const def of pool) {
    const owned = evoRank(player, def.id) > 0;
    const w = Math.max(1, Math.round(RARITY_WEIGHT[def.rarity] * (owned ? 1.55 : 1)));
    for (let i = 0; i < w; i++) weighted.push(def);
  }

  const picked: EvolutionDef[] = [];
  const used = new Set<EvolutionId>();
  const tries = 80;
  for (let t = 0; t < tries && picked.length < Math.min(count, pool.length); t++) {
    const def = weighted[Math.floor(Math.random() * weighted.length)];
    if (used.has(def.id)) continue;
    used.add(def.id);
    picked.push(def);
  }
  return picked;
}

export function applyEvolution(player: Player, id: EvolutionId): Player {
  const def = EVOLUTION_BY_ID[id];
  if (!def) {
    return {
      ...player,
      pendingEvolutionPicks: Math.max(0, (player.pendingEvolutionPicks ?? 0) - 1),
    };
  }
  const cur = evoRank(player, id);
  if (cur >= def.maxRank) {
    return {
      ...player,
      pendingEvolutionPicks: Math.max(0, (player.pendingEvolutionPicks ?? 0) - 1),
    };
  }
  const evolutions = { ...(player.evolutions || {}), [id]: cur + 1 };
  const stats = { ...player.stats };
  if (id === 'heartforge') {
    stats.maxHp += 45;
    stats.hp = stats.maxHp;
  }
  if (id === 'crit_matrix') {
    stats.critRate += 7;
  }
  if (id === 'overclock') {
    stats.speed += 0.12;
  }
  return {
    ...player,
    evolutions,
    stats,
    pendingEvolutionPicks: Math.max(0, (player.pendingEvolutionPicks ?? 0) - 1),
  };
}

export function ownedEvolutions(player: Player): { def: EvolutionDef; rank: number }[] {
  const evo = player.evolutions || {};
  return Object.keys(evo)
    .map((id) => {
      const def = EVOLUTION_BY_ID[id as EvolutionId];
      const rank = evo[id] ?? 0;
      return def && rank > 0 ? { def, rank } : null;
    })
    .filter((x): x is { def: EvolutionDef; rank: number } => !!x)
    .sort((a, b) => b.rank - a.rank);
}

export function orbitColor(cls: CharacterClass): string {
  if (cls === 'gunslinger') return '#FBBF24';
  if (cls === 'swordmaster') return '#E2E8F0';
  return '#E879F9';
}

export function mobSpeedMul(m: Monster): number {
  if ((m.frozenTimer || 0) > 0) return 0;
  if ((m.slowTimer || 0) > 0) return 0.4;
  return 1;
}

export function drawEvolutionFx(
  ctx: CanvasRenderingContext2D,
  player: Player,
  time: number,
  inHorde = false
) {
  if (!inHorde) return;
  void ctx;
  void player;
  void time;
}
