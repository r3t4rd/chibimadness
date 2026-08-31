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
    tagline: 'Аура, которая грызёт толпу',
    descFor: (r) =>
      `Постоянный урон вокруг тебя. Радиус ${62 + r * 20}px. Чем ближе — тем больнее. Классика выживалки.`,
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
    tagline: 'Беги — и земля горит',
    descFor: (r) =>
      `За тобой остаётся раскалённый след. Враги, наступившие на него, жарятся. Скорость +${(r * 3).toFixed(0)}%.`,
  },
  {
    id: 'thunder_crown',
    name: 'Корона грома',
    nameEn: 'THUNDER CROWN',
    icon: '🌩️',
    rarity: 'epic',
    maxRank: 5,
    tagline: 'Небо бьёт за тебя',
    descFor: (r) =>
      `Каждые ${(Math.max(1.1, 3.4 - r * 0.4)).toFixed(1)}с молния падает в случайного врага рядом. Боссы тоже получают по макушке.`,
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
    tagline: 'Толпа вязнет в тебе',
    descFor: (r) =>
      `Враги в ${110 + r * 28}px замедляются до 40% скорости. Ты — чёрная дыра для ног.`,
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
    tagline: 'Крутящиеся убийцы вокруг тебя',
    descFor: (r) =>
      `${1 + r} снаряда летают вокруг и режут всё, что заденут. Вид зависит от класса.`,
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
    descFor: (r) => `Снаряды рикошетят ещё ${r} раз(а) в ближайшего врага. Одна пуля — целый хор.`,
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
    tagline: 'Небо само кидает метеоры',
    descFor: (r) =>
      `Каждые ${(Math.max(1.4, 3.6 - r * 0.4)).toFixed(1)}с метеор падает в случайного врага. Магия без кнопки.`,
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
  auraRadius: number;
  auraDps: number;
  orbitCount: number;
  orbitRadius: number;
  orbitDamage: number;
  orbitSize: number;
  soulBurstChance: number;
  soulBurstRadius: number;
  soulBurstDamage: number;
  chainChance: number;
  chainBounces: number;
  chainDamage: number;
  frostChance: number;
  frostRadius: number;
  frostDuration: number;
  trailDps: number;
  trailRadius: number;
  thunderEvery: number;
  thunderDamage: number;
  kissHeal: number;
  greedGemMult: number;
  greedExtraChance: number;
  voidSlowRadius: number;
  voidSlowDuration: number;
  executeChance: number;
  blackHoleEvery: number;
  phoenixHpPct: number;
  phoenixHealPct: number;
  phoenixCd: number;
  gemBombChance: number;
  gemBombRadius: number;
  gemBombDamage: number;
  hexEvery: number;
  hexDamage: number;
  harvestHeal: number;
  harvestSlashChance: number;
  ricochetBounces: number;
}

export function getEvolutionMods(player: Player): EvolutionMods {
  const r = (id: EvolutionId) => evoRank(player, id);
  const atk = player.stats?.atk ?? 20;
  const garlic = r('garlic_ward');
  const orbit = r('orbit_relic');
  const burst = r('soul_burst');
  const chain = r('chain_bolt');
  const frost = r('frost_nova');
  const trail = r('stardust_trail');
  const thunder = r('thunder_crown');
  const oc = r('overclock');
  const phoenix = r('phoenix_core');
  const hole = r('black_hole');
  const hex = r('hex_storm');
  const gem = r('gem_bomb');
  const lottery = r('death_lottery');
  const harvest = r('harvest_moon');

  return {
    magnetBonus: r('blood_magnet') * 95,
    fireRateMult: 1 / (1 + oc * 0.12),
    moveMult: 1 + oc * 0.04 + trail * 0.03,
    auraRadius: garlic > 0 ? 58 + garlic * 20 : 0,
    auraDps: garlic > 0 ? 9 + garlic * 11 + atk * 0.12 : 0,
    orbitCount: orbit > 0 ? 1 + orbit : 0,
    orbitRadius: 52 + orbit * 10,
    orbitDamage: orbit > 0 ? 6 + orbit * 7 + atk * 0.18 : 0,
    orbitSize: 7 + orbit * 1.4,
    soulBurstChance: burst > 0 ? 0.12 + burst * 0.08 : 0,
    soulBurstRadius: 68 + burst * 18,
    soulBurstDamage: burst > 0 ? 16 + burst * 14 + atk * 0.55 : 0,
    chainChance: chain > 0 ? 0.18 + chain * 0.1 : 0,
    chainBounces: chain > 0 ? 2 + chain : 0,
    chainDamage: chain > 0 ? 12 + chain * 10 + atk * 0.4 : 0,
    frostChance: frost > 0 ? 0.16 + frost * 0.08 : 0,
    frostRadius: 88 + frost * 22,
    frostDuration: 1.05 + frost * 0.35,
    trailDps: trail > 0 ? 8 + trail * 9 + atk * 0.1 : 0,
    trailRadius: trail > 0 ? 22 + trail * 4 : 0,
    thunderEvery: thunder > 0 ? Math.max(1.05, 3.35 - thunder * 0.4) : 0,
    thunderDamage: thunder > 0 ? 22 + thunder * 16 + atk * 0.7 : 0,
    kissHeal: r('vampire_kiss') > 0 ? 4 + r('vampire_kiss') * 5 : 0,
    greedGemMult: 1 + r('greed_engine') * 0.22,
    greedExtraChance: r('greed_engine') * 0.12,
    voidSlowRadius: r('void_slow') > 0 ? 108 + r('void_slow') * 28 : 0,
    voidSlowDuration: r('void_slow') > 0 ? 0.45 : 0,
    executeChance: lottery > 0 ? (0.03 + lottery * 0.022) * (player.characterClass === 'swordmaster' ? 1.15 : 1) : 0,
    blackHoleEvery: hole > 0 ? Math.max(6, 14 - hole * 2) : 0,
    phoenixHpPct: phoenix > 0 ? (32 - phoenix * 3) / 100 : 0,
    phoenixHealPct: phoenix > 0 ? 0.12 + phoenix * 0.05 : 0,
    phoenixCd: phoenix > 0 ? Math.max(8, 18 - phoenix * 2) : 0,
    gemBombChance: gem > 0 ? 0.14 + gem * 0.08 : 0,
    gemBombRadius: 86 + gem * 16,
    gemBombDamage: gem > 0 ? 14 + gem * 12 + atk * 0.45 : 0,
    hexEvery: hex > 0 ? Math.max(1.35, 3.55 - hex * 0.4) : 0,
    hexDamage: hex > 0 ? 20 + hex * 14 + atk * 0.65 : 0,
    harvestHeal: harvest > 0 ? 8 + harvest * 6 : 0,
    harvestSlashChance: harvest > 0 ? 0.1 + harvest * 0.06 : 0,
    ricochetBounces: r('ricochet_soul'),
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

export function getOrbitSlots(
  player: Player,
  time: number
): { x: number; y: number; color: string }[] {
  const mods = getEvolutionMods(player);
  if (mods.orbitCount <= 0) return [];
  const color = orbitColor(player.characterClass);
  const out: { x: number; y: number; color: string }[] = [];
  const spin = time * (1.8 + mods.orbitCount * 0.12);
  for (let i = 0; i < mods.orbitCount; i++) {
    const a = spin + (i / mods.orbitCount) * Math.PI * 2;
    out.push({
      x: player.x + Math.cos(a) * mods.orbitRadius,
      y: player.y + Math.sin(a) * mods.orbitRadius * 0.72,
      color,
    });
  }
  return out;
}

export function mobSpeedMul(m: Monster): number {
  if ((m.frozenTimer || 0) > 0) return 0;
  if ((m.slowTimer || 0) > 0) return 0.4;
  return 1;
}

export function drawEvolutionFx(
  ctx: CanvasRenderingContext2D,
  player: Player,
  time: number
) {
  const mods = getEvolutionMods(player);
  if (mods.auraRadius > 0) {
    const pulse = 0.55 + Math.sin(time * 4.2) * 0.2;
    ctx.save();
    ctx.globalAlpha = 0.18 + pulse * 0.12;
    ctx.strokeStyle = '#A3E635';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 8, mods.auraRadius, mods.auraRadius * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.07 + pulse * 0.05;
    ctx.fillStyle = '#84CC16';
    ctx.fill();
    ctx.restore();
  }

  if (mods.voidSlowRadius > 0) {
    ctx.save();
    ctx.globalAlpha = 0.1 + Math.sin(time * 2.4) * 0.04;
    ctx.strokeStyle = '#A78BFA';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 8, mods.voidSlowRadius, mods.voidSlowRadius * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const slots = getOrbitSlots(player, time);
  for (const s of slots) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, mods.orbitSize + 6);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.35, s.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, mods.orbitSize + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, mods.orbitSize * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
