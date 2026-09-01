import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

import {
  drawBackHairThumbnail,
  drawChibiCharacter,
  drawEarThumbnail,
  drawFaceThumbnail,
  drawFrontHairThumbnail,
  drawHaloThumbnail,
  drawHatThumbnail,
  drawHumanoidEnemy,
  drawOutfitThumbnail,
  drawPoliceCruiser,
  drawCyberMuscleCar,
  drawWingThumbnail,
} from '../src/game/chibiRenderer';
import {
  drawHordeMobAtlasSprite,
  getHordeMobAtlasSprites,
} from '../src/game/worldRenderer';
import { ChibiConfig, Player, Monster, GunType } from '../src/types/game';

const OUTPUT_DIR = path.resolve(process.cwd(), 'assets/sprites');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

type FrameMetadata = {
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
  category: string;
};

type AtlasMetadata = {
  name: string;
  texture: string;
  width: number;
  height: number;
  frames: Record<string, FrameMetadata>;
};

function packGridAtlas(
  atlasName: string,
  cellSize: number,
  padding: number,
  items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[]
) {
  const count = items.length;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const step = cellSize + padding * 2;
  const atlasWidth = columns * step;
  const atlasHeight = rows * step;

  const canvas = createCanvas(atlasWidth, atlasHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  const frames: Record<string, FrameMetadata> = {};

  items.forEach((item, idx) => {
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    const x = col * step + padding;
    const y = row * step + padding;

    ctx.save();
    ctx.translate(x, y);
    item.draw(ctx as unknown as CanvasRenderingContext2D, cellSize);
    ctx.restore();

    frames[item.id] = {
      x,
      y,
      w: cellSize,
      h: cellSize,
      pivotX: 0.5,
      pivotY: 0.5,
      category: item.category,
    };
  });

  const buffer = canvas.toBuffer('image/png');
  const pngPath = path.join(OUTPUT_DIR, `${atlasName}.png`);
  const jsonPath = path.join(OUTPUT_DIR, `${atlasName}.json`);

  fs.writeFileSync(pngPath, buffer);

  const metadata: AtlasMetadata = {
    name: atlasName,
    texture: `${atlasName}.png`,
    width: atlasWidth,
    height: atlasHeight,
    frames,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`[Atlas Exported] ${pngPath} (${atlasWidth}x${atlasHeight}, ${count} frames)`);
}

function makeDefaultPlayerStats() {
  return {
    level: 1,
    exp: 0,
    maxExp: 100,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    atk: 10,
    def: 5,
    speed: 100,
    critRate: 0.05,
    statPoints: 0,
    str: 5,
    agi: 5,
    int: 5,
    vit: 5,
  };
}

// =========================================================
// 1. CHIBI CUSTOMIZATION ATLAS (ALL PARTS & ACCESSORIES)
// =========================================================
function generateChibiCustomizationAtlas() {
  const frontHairStyles: NonNullable<ChibiConfig['frontHairStyle']>[] = [
    'straight_bangs',
    'curtain_bangs',
    'teto_arched_bangs',
    'miku_fringe',
    'anya_horns_bangs',
    'bocchi_shaggy',
    'sailor_crescent',
    'side_swept',
    'hime_sidelocks',
    'spiky_bangs',
    'emo_fringe',
    'short_parted',
    'blunt_fringe',
    'center_split',
    'chad_quiff',
    'v_bangs',
    'messy_curly',
    'braided_headband',
    'feathered_bangs',
    'choppy_micro',
    'wispy_bangs',
    'zigzag_bangs',
    'twin_antenna',
    'thick_eyebrow_bangs',
    'ojou_ringlets',
    'cirno_fringe',
    'straight_bangs_short',
    'teto_arched_bangs_short',
    'miku_fringe_short',
    'curtain_bangs_short',
    'v_bangs_short',
    'blunt_fringe_short',
    'wispy_bangs_short',
    'side_swept_short',
    'feathered_bangs_short',
    'hime_sidelocks_short',
    'sailor_crescent_short',
    'spiky_bangs_short',
    'emo_fringe_short',
    'messy_curly_short',
    'forehead_peek',
    'buzz_fringe',
    'swept_back_bangs',
    'none',
  ];

  const backHairStyles: NonNullable<ChibiConfig['backHairStyle']>[] = [
    'teto_drills',
    'miku_twintails',
    'anya_buns',
    'bocchi_side',
    'sailor_odango',
    'gyaru_ponytail',
    'cat_hood_bob',
    'pompadour_chad',
    'bob',
    'twintails',
    'ponytail',
    'spiky',
    'wavy',
    'braids',
    'long_flowing',
    'wolf_cut',
    'cyber_buns',
    'short_messy',
    'side_ponytail',
    'hime_cut',
    'ojou_drills',
    'afro',
    'side_braid',
    'ahoge_messy',
    'slicked_back',
    'pixie_cut',
    'low_twintails',
    'half_updo',
    'topknot_samurai',
    'twin_buns_flowing',
    'mushroom_bob',
    'drill_ponytail',
    'fluffy_short',
    'dreadlocks',
    'mega_drill_buns',
    'super_saiyan',
    'rapunzel_braid',
    'twin_bubble_tails',
    'shaggy_mullet',
    'twin_drill_tails',
    'fishtail_braid',
    'high_bun',
    'waterfall_curls',
    'ribbon_ponytail',
    'asymmetric_bob',
    'cirno_bob',
    'none_short',
  ];

  const eyeTypes: NonNullable<ChibiConfig['eyeType']>[] = [
    'anya_smug',
    'aqua_crying',
    'bocchi_panic',
    'sparkle_stars',
    'heart_eyes',
    'owo',
    'pout',
    'giga_chad',
    'cat_w',
    'happy',
    'determined',
    'wink',
    'sparkle',
    'smug',
    'sleepy',
    'blush',
    'glasses',
    'dot',
    'teary',
    'dizzy_spiral',
    'deadpan',
    'starry_tears',
    'rage_fire',
    'derp',
    'hypno_spiral',
    'sleepy_closed',
    'wink_star',
    'nya_cat',
    'dead_x',
    'sparkle_hearts',
    'waterfall_cry',
    'smug_cat_face',
    'yandere_glow',
    'anime_shades',
    'laser_eyes',
    'pog_shock',
    'drool_sleepy',
    'diamond_shoujo',
    'heterochromia',
    '9ball',
    'tsurime_sharp',
    'tareme_soft',
    'closed_smile',
    'sweat_nervous',
  ];

  const outfits: { id: NonNullable<ChibiConfig['outfitType']>; coat: string; skirt: string; accent: string }[] = [
    { id: 'academy_blazer', coat: '#1E293B', skirt: '#0284C7', accent: '#38BDF8' },
    { id: 'cyber_hoodie', coat: '#0F172A', skirt: '#38BDF8', accent: '#00F0FF' },
    { id: 'tactical_shinobi', coat: '#18181B', skirt: '#52525B', accent: '#A855F7' },
    { id: 'maid_idol', coat: '#18181B', skirt: '#F8FAFC', accent: '#F472B6' },
    { id: 'streetwear', coat: '#F97316', skirt: '#1E293B', accent: '#FACC15' },
    { id: 'magic_robe', coat: '#581C87', skirt: '#C084FC', accent: '#FDE047' },
    { id: 'kimono_yukata', coat: '#F43F5E', skirt: '#881337', accent: '#FDA4AF' },
    { id: 'mecha_pilot', coat: '#0284C7', skirt: '#0F172A', accent: '#F43F5E' },
    { id: 'goth_lolita', coat: '#09090B', skirt: '#450A0A', accent: '#DC2626' },
    { id: 'military_officer', coat: '#14532D', skirt: '#052E16', accent: '#F59E0B' },
    { id: 'gym_bloomer', coat: '#FFFFFF', skirt: '#1E3A8A', accent: '#EF4444' },
    { id: 'swimsuit_sailor', coat: '#38BDF8', skirt: '#0369A1', accent: '#FFFFFF' },
    { id: 'bunny_suit', coat: '#18181B', skirt: '#27272A', accent: '#F472B6' },
    { id: 'shrine_miko', coat: '#FFFFFF', skirt: '#DC2626', accent: '#991B1B' },
    { id: 'cyber_ninja', coat: '#020617', skirt: '#00F0FF', accent: '#A855F7' },
    { id: 'techwear_poncho', coat: '#334155', skirt: '#1E293B', accent: '#F59E0B' },
    { id: 'magical_girl', coat: '#F472B6', skirt: '#FB7185', accent: '#FDE047' },
    { id: 'kigurumi_onesie', coat: '#FBBF24', skirt: '#D97706', accent: '#FFFFFF' },
    { id: 'vampire_noble', coat: '#450A0A', skirt: '#18181B', accent: '#DC2626' },
    { id: 'combat_commando', coat: '#3F3F46', skirt: '#18181B', accent: '#84CC16' },
    { id: 'sukeban_trench', coat: '#1E1B4B', skirt: '#312E81', accent: '#EF4444' },
    { id: 'work_overalls', coat: '#0284C7', skirt: '#0369A1', accent: '#F59E0B' },
    { id: 'sailor_uniform', coat: '#FFFFFF', skirt: '#1E3A8A', accent: '#EF4444' },
    { id: 'nurse_outfit', coat: '#F8FAFC', skirt: '#F43F5E', accent: '#EF4444' },
    { id: 'china_dress', coat: '#DC2626', skirt: '#991B1B', accent: '#FDE047' },
    { id: 'detective_coat', coat: '#78350F', skirt: '#451A03', accent: '#F59E0B' },
    { id: 'idol_stage', coat: '#EC4899', skirt: '#BE185D', accent: '#FDE047' },
    { id: 'winter_coat', coat: '#0284C7', skirt: '#F1F5F9', accent: '#38BDF8' },
  ];

  const earTypes: NonNullable<ChibiConfig['earType']>[] = [
    'cat',
    'bunny',
    'fox',
    'wolf',
    'bear',
    'mouse',
    'deer_antlers',
    'sheep_horns',
    'elf',
    'dog_floppy',
    'wings_head',
    'devil_wings',
    'devil_horns',
    'cyber_antennas',
    'horns',
    'dragon_horns',
    'raccoon',
    'bat',
    'cow_horns',
    'unicorn_horn',
  ];

  const haloTypes: NonNullable<ChibiConfig['haloType']>[] = [
    'star',
    'circle',
    'winged',
    'crown',
    'cross',
    'cyber_hex',
    'heart',
    'floral',
    'neon_rings',
    'shuriken',
    'diamond',
    'infinity',
    'saturn_rings',
    'music_notes',
    'snowflake',
  ];

  const wingTypes: NonNullable<ChibiConfig['wingType']>[] = [
    'angel_feathers',
    'devil_bat',
    'cyber_thrusters',
    'fairy_sparkle',
    'dragon_drake',
    'pixel_wings',
    'mecha_wings',
    'phoenix_fire',
    'butterfly_prisma',
    'crystal_shards',
    'shadow_tendrils',
    'bee_wings',
    'steampunk_gears',
    'ice_crystal_wings',
    'void_portals',
  ];

  const hatTypes: NonNullable<ChibiConfig['hatType']>[] = [
    'cyber_cap',
    'combat_helmet',
    'cat_beanie',
    'witch_hat',
    'maid_headdress',
    'beret',
    'bunny_hood',
    'cyber_visor',
    'straw_hat',
    'crown_hat',
    'police_cap',
    'kitsune_mask',
    'chef_toque',
    'pirate_hat',
    'propeller_beanie',
    'top_hat',
    'cowboy_hat',
    'shark_hood',
    'nvg_goggles',
    'flower_crown',
    'bandana',
    'headphones',
    'tiara',
    'aviator_goggles',
    'nurse_cap',
    'military_cap',
  ];

  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  frontHairStyles.forEach((style) => {
    items.push({
      id: `front_hair_${style}`,
      category: 'front_hair',
      draw: (ctx, size) => drawFrontHairThumbnail(ctx, size, size, style, '#38BDF8', '#FFE4D6', '#F472B6'),
    });
  });

  backHairStyles.forEach((style) => {
    items.push({
      id: `back_hair_${style}`,
      category: 'back_hair',
      draw: (ctx, size) => drawBackHairThumbnail(ctx, size, size, style, '#38BDF8', '#FFE4D6', '#F472B6'),
    });
  });

  eyeTypes.forEach((eye) => {
    items.push({
      id: `eye_${eye}`,
      category: 'eyes',
      draw: (ctx, size) => drawFaceThumbnail(ctx, size, size, eye, '#0284C7', '#FFE4D6'),
    });
  });

  outfits.forEach((outfit) => {
    items.push({
      id: `outfit_${outfit.id}`,
      category: 'outfits',
      draw: (ctx, size) => drawOutfitThumbnail(ctx, size, size, outfit.id, outfit.coat, outfit.accent, outfit.skirt),
    });
  });

  earTypes.forEach((ear) => {
    items.push({
      id: `ear_${ear}`,
      category: 'ears',
      draw: (ctx, size) => {
        ctx.save();
        ctx.translate(size / 2, size / 2 + 18);
        const scale = size / 75;
        ctx.scale(scale, scale);
        drawEarThumbnail(ctx, 75, 75, ear, '#2B272C', '#F472B6', '#FFE4D6');
        ctx.restore();
      },
    });
  });

  haloTypes.forEach((halo) => {
    items.push({
      id: `halo_${halo}`,
      category: 'halos',
      draw: (ctx, size) => drawHaloThumbnail(ctx, size, size, halo, '#38BDF8'),
    });
  });

  wingTypes.forEach((wing) => {
    items.push({
      id: `wing_${wing}`,
      category: 'wings',
      draw: (ctx, size) => drawWingThumbnail(ctx, size, size, wing, '#FFFFFF'),
    });
  });

  hatTypes.forEach((hat) => {
    items.push({
      id: `hat_${hat}`,
      category: 'hats',
      draw: (ctx, size) => drawHatThumbnail(ctx, size, size, hat, '#1E293B'),
    });
  });

  packGridAtlas('chibi_customization_atlas', 128, 8, items);
}

// =========================================================
// 2. CHIBI ENTITIES, POLICE, PUNKS & BOSSES ATLAS
// =========================================================
function generateChibiEntitiesAtlas() {
  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  // A. Operator Classes & Presets
  const operatorPresets: { id: string; chibi: ChibiConfig; weapon: GunType }[] = [
    {
      id: 'millennium_student',
      weapon: 'mac10',
      chibi: {
        frontHairStyle: 'straight_bangs',
        backHairStyle: 'twintails',
        hairColor: '#38BDF8',
        skinTone: '#FFE4D6',
        eyeType: 'happy',
        eyeColor: '#0284C7',
        earType: 'cat',
        haloType: 'cyber_hex',
        haloColor: '#38BDF8',
        outfitType: 'academy_blazer',
        coatColor: '#FFFFFF',
        skirtColor: '#3A3640',
        ribbonColor: '#F472B6',
        earColor: '#18181B',
      },
    },
    {
      id: 'trinity_scholar',
      weapon: 'cheytac',
      chibi: {
        frontHairStyle: 'curtain_bangs',
        backHairStyle: 'long_flowing',
        hairColor: '#FDE047',
        skinTone: '#FFE4D6',
        eyeType: 'determined',
        eyeColor: '#10B981',
        earType: 'none',
        haloType: 'winged',
        haloColor: '#FDE047',
        wingType: 'angel_feathers',
        outfitType: 'sailor_uniform',
        coatColor: '#F1F5F9',
        skirtColor: '#1E3A8A',
        ribbonColor: '#F43F5E',
        earColor: '#18181B',
      },
    },
    {
      id: 'gehenna_rebel',
      weapon: 'ak47',
      chibi: {
        frontHairStyle: 'side_swept',
        backHairStyle: 'wolf_cut',
        hairColor: '#EF4444',
        skinTone: '#FFE4D6',
        eyeType: 'anya_smug',
        eyeColor: '#DC2626',
        earType: 'devil_horns',
        haloType: 'circle',
        haloColor: '#EF4444',
        wingType: 'devil_bat',
        outfitType: 'sukeban_trench',
        coatColor: '#18181B',
        skirtColor: '#991B1B',
        earColor: '#18181B',
      },
    },
    {
      id: 'cyber_shinobi',
      weapon: 'katana',
      chibi: {
        frontHairStyle: 'spiky_bangs',
        backHairStyle: 'bob',
        hairColor: '#A855F7',
        skinTone: '#FFE4D6',
        eyeType: 'nya_cat',
        eyeColor: '#C084FC',
        earType: 'cyber_antennas',
        haloType: 'star',
        haloColor: '#C084FC',
        outfitType: 'cyber_ninja',
        coatColor: '#0F172A',
        skirtColor: '#0284C7',
        earColor: '#18181B',
      },
    },
    {
      id: 'tactical_vanguard',
      weapon: 'shotgun',
      chibi: {
        frontHairStyle: 'chad_quiff',
        backHairStyle: 'short_messy',
        hairColor: '#475569',
        skinTone: '#FAD2B8',
        eyeType: 'giga_chad',
        eyeColor: '#0F172A',
        earType: 'wolf',
        haloType: 'cross',
        haloColor: '#E2E8F0',
        outfitType: 'combat_commando',
        coatColor: '#334155',
        skirtColor: '#1E293B',
        earColor: '#334155',
      },
    },
    {
      id: 'idol_superstar',
      weapon: 'wand',
      chibi: {
        frontHairStyle: 'teto_arched_bangs',
        backHairStyle: 'teto_drills',
        hairColor: '#F43F5E',
        skinTone: '#FFE4D6',
        eyeType: 'sparkle_stars',
        eyeColor: '#EC4899',
        earType: 'bunny',
        haloType: 'heart',
        haloColor: '#F43F5E',
        outfitType: 'idol_stage',
        coatColor: '#FB7185',
        skirtColor: '#BE185D',
        earColor: '#FFFFFF',
      },
    },
  ];

  operatorPresets.forEach((op) => {
    items.push({
      id: `operator_${op.id}`,
      category: 'operator',
      draw: (ctx, size) => {
        const mockPlayer: Player = {
          id: op.id,
          name: op.id,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          facing: 'right',
          state: 'idle',
          characterClass: 'gunslinger',
          stats: makeDefaultPlayerStats(),
          stamina: 100,
          maxStamina: 100,
          isSprinting: false,
          jumpZ: 0,
          jumpVz: 0,
          isJumping: false,
          bhopStreak: 0,
          bhopTimer: 0,
          bhopSpeedMult: 1,
          gold: 0,
          inventory: [],
          equipment: { weapon: { id: op.weapon, gunType: op.weapon } as any, headwear: null, outfit: null, vehicle: null, accessory: null },
          skills: [],
          activeVehicleId: null,
          isRiding: false,
          spawnBounce: 1,
          attackTimer: 0,
          dodgeTimer: 0,
          combo: 0,
          lastAttackTime: 0,
          activeQuests: {},
          completedQuestIds: [],
          currentZone: 'academy_square',
          activeBuffs: [],
          chibi: op.chibi,
        };
        ctx.save();
        ctx.translate(size / 2, size / 2 + 25);
        ctx.scale(1.1, 1.1);
        drawChibiCharacter(ctx, mockPlayer, 0, false, { bodyOnly: false });
        ctx.restore();
      },
    });
  });

  // B. Police Units & SWAT
  const policeUnits: { type: Monster['type']; weapon: NonNullable<Monster['weaponType']>; hasShield?: boolean; name: string }[] = [
    { type: 'cop_officer', weapon: 'pistol', name: 'Police Officer' },
    { type: 'cop_swat', weapon: 'mac10', hasShield: true, name: 'SWAT Operator' },
    { type: 'cop_enforcer', weapon: 'baton', hasShield: true, name: 'Heavy Enforcer' },
    { type: 'cop_marksman', weapon: 'cheytac', name: 'Police Sniper' },
    { type: 'cop_juggernaut', weapon: 'shotgun', hasShield: true, name: 'Police Juggernaut' },
  ];

  policeUnits.forEach((u) => {
    items.push({
      id: `police_${u.type}`,
      category: 'police',
      draw: (ctx, size) => {
        const monster: Monster = {
          id: u.type,
          name: u.name,
          type: u.type,
          zone: 'police_hq',
          x: 0,
          y: 0,
          spawnX: 0,
          spawnY: 0,
          hp: 120,
          maxHp: 120,
          atk: 14,
          def: 8,
          speed: 85,
          expReward: 25,
          goldReward: 15,
          targetPlayerId: null,
          attackCooldown: 0,
          specialCooldown: 0,
          isBoss: u.type === 'cop_juggernaut',
          state: 'idle',
          facing: 'right',
          weaponType: u.weapon,
          hasShield: u.hasShield,
          faction: 'police',
          humanChibi: {
            frontHairStyle: 'short_parted',
            backHairStyle: 'short_messy',
            hairColor: '#1E293B',
            skinTone: '#FFE4D6',
            eyeType: 'determined',
            earType: 'none',
            haloType: 'cross',
            haloColor: '#38BDF8',
            outfitType: 'military_officer',
            coatColor: '#1E3A8A',
            skirtColor: '#0F172A',
            hatType: u.type === 'cop_officer' ? 'police_cap' : 'combat_helmet',
            hatColor: '#1E293B',
            earColor: '#18181B',
          },
        };
        ctx.save();
        ctx.translate(size / 2, size / 2 + 20);
        ctx.scale(1.1, 1.1);
        drawHumanoidEnemy(ctx, monster, 0, { bodyOnly: true });
        ctx.restore();
      },
    });
  });

  // C. Punk Gang Units
  const punkUnits: { type: Monster['type']; weapon: NonNullable<Monster['weaponType']>; name: string }[] = [
    { type: 'punk_grunt', weapon: 'bat', name: 'Punk Grunt' },
    { type: 'punk_anarchist', weapon: 'mac10', name: 'Punk Anarchist' },
    { type: 'punk_molotov', weapon: 'molotov', name: 'Punk Bomber' },
    { type: 'punk_juggernaut', weapon: 'sledgehammer', name: 'Punk Juggernaut' },
  ];

  punkUnits.forEach((u) => {
    items.push({
      id: `punk_${u.type}`,
      category: 'punk',
      draw: (ctx, size) => {
        const monster: Monster = {
          id: u.type,
          name: u.name,
          type: u.type,
          zone: 'punk_district',
          x: 0,
          y: 0,
          spawnX: 0,
          spawnY: 0,
          hp: 110,
          maxHp: 110,
          atk: 15,
          def: 6,
          speed: 95,
          expReward: 25,
          goldReward: 15,
          targetPlayerId: null,
          attackCooldown: 0,
          specialCooldown: 0,
          isBoss: u.type === 'punk_juggernaut',
          state: 'idle',
          facing: 'right',
          weaponType: u.weapon,
          faction: 'punk_demon',
          humanChibi: {
            frontHairStyle: 'spiky_bangs',
            backHairStyle: 'pompadour_chad',
            hairColor: '#EA580C',
            skinTone: '#FFE4D6',
            eyeType: 'rage_fire',
            earType: 'devil_horns',
            haloType: 'circle',
            haloColor: '#EA580C',
            outfitType: 'streetwear',
            coatColor: '#18181B',
            skirtColor: '#451A03',
            hatType: 'bandana',
            hatColor: '#DC2626',
            earColor: '#EA580C',
          },
        };
        ctx.save();
        ctx.translate(size / 2, size / 2 + 20);
        ctx.scale(1.1, 1.1);
        drawHumanoidEnemy(ctx, monster, 0, { bodyOnly: true });
        ctx.restore();
      },
    });
  });

  // D. Bandits & Outlaws
  const bandits: { type: Monster['type']; weapon: NonNullable<Monster['weaponType']>; name: string }[] = [
    { type: 'bandit_grunt', weapon: 'pistol', name: 'Bandit Grunt' },
    { type: 'bandit_scout', weapon: 'mac10', name: 'Bandit Scout' },
    { type: 'bandit_gunner', weapon: 'ak47', name: 'Bandit Gunner' },
    { type: 'bandit_shotgunner', weapon: 'shotgun', name: 'Bandit Shotgunner' },
    { type: 'bandit_sniper', weapon: 'cheytac', name: 'Bandit Sniper' },
    { type: 'bandit_brawler', weapon: 'sledgehammer', name: 'Bandit Brawler' },
  ];

  bandits.forEach((u) => {
    items.push({
      id: `bandit_${u.type}`,
      category: 'bandit',
      draw: (ctx, size) => {
        const monster: Monster = {
          id: u.type,
          name: u.name,
          type: u.type,
          zone: 'wasteland',
          x: 0,
          y: 0,
          spawnX: 0,
          spawnY: 0,
          hp: 90,
          maxHp: 90,
          atk: 12,
          def: 4,
          speed: 90,
          expReward: 20,
          goldReward: 12,
          targetPlayerId: null,
          attackCooldown: 0,
          specialCooldown: 0,
          isBoss: false,
          state: 'idle',
          facing: 'right',
          weaponType: u.weapon,
          faction: 'bandit',
        };
        ctx.save();
        ctx.translate(size / 2, size / 2 + 20);
        ctx.scale(1.1, 1.1);
        drawHumanoidEnemy(ctx, monster, 0, { bodyOnly: true });
        ctx.restore();
      },
    });
  });

  // E. MAJOR BOSSES
  const bosses: { id: string; name: string; type: Monster['type']; weapon: NonNullable<Monster['weaponType']>; chibi?: ChibiConfig }[] = [
    {
      id: 'boss_welder',
      name: 'Molten Welder Boss',
      type: 'boss_welder',
      weapon: 'sledgehammer',
      chibi: {
        frontHairStyle: 'buzz_fringe',
        backHairStyle: 'short_messy',
        hairColor: '#EA580C',
        skinTone: '#D97706',
        eyeType: 'rage_fire',
        earType: 'horns',
        haloType: 'circle',
        haloColor: '#EA580C',
        outfitType: 'work_overalls',
        coatColor: '#1C1917',
        skirtColor: '#78350F',
        hatType: 'combat_helmet',
        hatColor: '#1C1917',
        earColor: '#EA580C',
      },
    },
    {
      id: 'boss_outlaw_viktor',
      name: 'Outlaw King Viktor',
      type: 'boss_outlaw_viktor',
      weapon: 'revolver',
      chibi: {
        frontHairStyle: 'swept_back_bangs',
        backHairStyle: 'long_flowing',
        hairColor: '#E2E8F0',
        skinTone: '#FFE4D6',
        eyeType: 'laser_eyes',
        earType: 'wolf',
        haloType: 'shuriken',
        haloColor: '#EF4444',
        outfitType: 'detective_coat',
        coatColor: '#18181B',
        skirtColor: '#450A0A',
        hatType: 'cowboy_hat',
        hatColor: '#18181B',
        earColor: '#E2E8F0',
      },
    },
    {
      id: 'boss_bandit_warlord',
      name: 'Bandit Warlord',
      type: 'bandit_boss',
      weapon: 'blade',
    },
  ];

  bosses.forEach((b) => {
    items.push({
      id: `boss_${b.id}`,
      category: 'boss',
      draw: (ctx, size) => {
        const monster: Monster = {
          id: b.id,
          name: b.name,
          type: b.type,
          zone: 'boss_arena',
          x: 0,
          y: 0,
          spawnX: 0,
          spawnY: 0,
          hp: 2000,
          maxHp: 2000,
          atk: 35,
          def: 20,
          speed: 70,
          expReward: 500,
          goldReward: 250,
          targetPlayerId: null,
          attackCooldown: 0,
          specialCooldown: 0,
          isBoss: true,
          isJuggernaut: true,
          state: 'idle',
          facing: 'right',
          weaponType: b.weapon,
          humanChibi: b.chibi,
        };
        ctx.save();
        ctx.translate(size / 2, size / 2 + 25);
        ctx.scale(1.2, 1.2);
        drawHumanoidEnemy(ctx, monster, 0, { bodyOnly: true });
        ctx.restore();
      },
    });
  });

  // F. Cadets, Targets & Wolves
  const cadets: { type: Monster['type']; weapon: NonNullable<Monster['weaponType']>; name: string }[] = [
    { type: 'cadet_bat', weapon: 'bat', name: 'Cadet Bat' },
    { type: 'cadet_gunner', weapon: 'pistol', name: 'Cadet Gunner' },
    { type: 'cadet_mage', weapon: 'staff', name: 'Cadet Mage' },
    { type: 'human_target', weapon: 'pistol', name: 'Target Dummy' },
  ];

  cadets.forEach((c) => {
    items.push({
      id: `cadet_${c.type}`,
      category: 'cadet',
      draw: (ctx, size) => {
        const monster: Monster = {
          id: c.type,
          name: c.name,
          type: c.type,
          zone: 'academy_yard',
          x: 0,
          y: 0,
          spawnX: 0,
          spawnY: 0,
          hp: 80,
          maxHp: 80,
          atk: 8,
          def: 3,
          speed: 80,
          expReward: 15,
          goldReward: 8,
          targetPlayerId: null,
          attackCooldown: 0,
          specialCooldown: 0,
          isBoss: false,
          state: 'idle',
          facing: 'right',
          weaponType: c.weapon,
        };
        ctx.save();
        ctx.translate(size / 2, size / 2 + 20);
        ctx.scale(1.1, 1.1);
        drawHumanoidEnemy(ctx, monster, 0, { bodyOnly: true });
        ctx.restore();
      },
    });
  });

  // G. Vehicles
  items.push({
    id: 'vehicle_police_cruiser',
    category: 'vehicle',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.scale(0.85, 0.85);
      drawPoliceCruiser(ctx, 0, 0, 0);
      ctx.restore();
    },
  });

  items.push({
    id: 'vehicle_cyber_muscle_car',
    category: 'vehicle',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.scale(0.85, 0.85);
      drawCyberMuscleCar(ctx, 0, 0, 0);
      ctx.restore();
    },
  });

  packGridAtlas('chibi_entities_atlas', 160, 10, items);
}

// =========================================================
// 3. HORDE MOBS & RIFT BOSSES ATLAS
// =========================================================
function generateHordeMobsAtlas() {
  const sprites = getHordeMobAtlasSprites();
  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  sprites.forEach((sprite) => {
    items.push({
      id: `horde_${sprite.kind}${sprite.boss ? '_boss' : ''}`,
      category: 'horde_mob',
      draw: (ctx, size) => {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.scale(1.5, 1.5);
        drawHordeMobAtlasSprite(ctx, sprite);
        ctx.restore();
      },
    });
  });

  packGridAtlas('horde_mobs_atlas', 128, 8, items);
}

// =========================================================
// 4. WEAPONS, ATTACHMENTS & MELEE ATLAS
// =========================================================
function generateWeaponsAtlas() {
  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  const weapons: { id: GunType; name: string }[] = [
    { id: 'ak47', name: 'AK-47 Assault Rifle' },
    { id: 'cheytac', name: 'CheyTac M200 Intervention' },
    { id: 'mac10', name: 'MAC-10 SMG' },
    { id: 'shotgun', name: 'Tactical Shotgun' },
    { id: 'revolver', name: 'Heavy .44 Revolver' },
    { id: 'pistol', name: 'Combat 9mm Pistol' },
    { id: 'katana', name: 'High-Frequency Katana' },
    { id: 'sledgehammer', name: 'Industrial Welder Sledge' },
    { id: 'throwing_knives', name: 'Throwing Kunai' },
    { id: 'scythe', name: 'Plasma Scythe' },
    { id: 'greatsword', name: 'Titan Greatsword' },
    { id: 'staff', name: 'Archmage Staff' },
    { id: 'wand', name: 'Prismatic Wand' },
    { id: 'grimoire', name: 'Dark Grimoire' },
    { id: 'totem', name: 'Ancient Void Totem' },
  ];

  weapons.forEach((w) => {
    items.push({
      id: `weapon_${w.id}`,
      category: 'weapon',
      draw: (ctx, size) => {
        const mockPlayer: Player = {
          id: 'test',
          name: 'test',
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          facing: 'right',
          state: 'idle',
          characterClass: 'gunslinger',
          stats: makeDefaultPlayerStats(),
          stamina: 100,
          maxStamina: 100,
          isSprinting: false,
          jumpZ: 0,
          jumpVz: 0,
          isJumping: false,
          bhopStreak: 0,
          bhopTimer: 0,
          bhopSpeedMult: 1,
          gold: 0,
          inventory: [],
          equipment: { weapon: { id: w.id, gunType: w.id } as any, headwear: null, outfit: null, vehicle: null, accessory: null },
          skills: [],
          activeVehicleId: null,
          isRiding: false,
          spawnBounce: 1,
          attackTimer: 0,
          dodgeTimer: 0,
          combo: 0,
          lastAttackTime: 0,
          activeQuests: {},
          completedQuestIds: [],
          currentZone: 'academy_square',
          activeBuffs: [],
          chibi: {
            hairColor: '#38BDF8',
            skinTone: '#FFE4D6',
            earColor: '#18181B',
            haloColor: '#38BDF8',
            coatColor: '#FFFFFF',
            skirtColor: '#3A3640',
            eyeType: 'happy',
            earType: 'none',
            haloType: 'none',
          },
        };
        ctx.save();
        ctx.translate(size / 2 - 20, size / 2 + 5);
        ctx.scale(1.8, 1.8);
        drawChibiCharacter(ctx, mockPlayer, 0, false, { bodyOnly: false });
        ctx.restore();
      },
    });
  });

  // Attachments
  const attachments = [
    { id: 'ak_banana_mag', label: 'Banana Mag', color: '#F59E0B' },
    { id: 'sniper_scope', label: '8x Optic', color: '#38BDF8' },
    { id: 'suppressor', label: 'Suppressor', color: '#64748B' },
    { id: 'laser_sight', label: 'Laser Sight', color: '#EF4444' },
    { id: 'drum_magazine', label: '50-Rnd Drum', color: '#1E293B' },
  ];

  attachments.forEach((att) => {
    items.push({
      id: `attachment_${att.id}`,
      category: 'attachment',
      draw: (ctx, size) => {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.fillStyle = '#1E293B';
        ctx.strokeStyle = att.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-28, -20, 56, 40, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = att.color;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(att.label, 0, 0);
        ctx.restore();
      },
    });
  });

  packGridAtlas('weapons_atlas', 128, 8, items);
}

// =========================================================
// 5. WORLD ENVIRONMENT, TREES, RIFTS & PROPS ATLAS
// =========================================================
function generateWorldEnvironmentAtlas() {
  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  // A. Foliage / Trees
  items.push({
    id: 'tree_pine',
    category: 'foliage',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2 + 25);
      ctx.scale(1.4, 1.4);
      // Trunk
      ctx.fillStyle = '#451A03';
      ctx.fillRect(-5, 0, 10, 24);
      // Foliage tiers
      const tiers = [
        { y: 6, h: 26, w: 26, col: '#064E3B' },
        { y: -10, h: 26, w: 22, col: '#047857' },
        { y: -26, h: 26, w: 16, col: '#059669' },
      ];
      tiers.forEach((t) => {
        ctx.fillStyle = t.col;
        ctx.beginPath();
        ctx.moveTo(-t.w, t.y);
        ctx.lineTo(0, t.y - t.h);
        ctx.lineTo(t.w, t.y);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    },
  });

  items.push({
    id: 'tree_birch',
    category: 'foliage',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2 + 25);
      ctx.scale(1.4, 1.4);
      // Pale trunk
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(-5, -6, 10, 30);
      const layers = [
        { y: -8, rx: 22, ry: 14, color: '#4D7C0F' },
        { y: -22, rx: 18, ry: 13, color: '#65A30D' },
        { y: -34, rx: 14, ry: 11, color: '#84CC16' },
      ];
      layers.forEach((l) => {
        ctx.fillStyle = l.color;
        ctx.beginPath();
        ctx.ellipse(0, l.y, l.rx, l.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    },
  });

  items.push({
    id: 'tree_oak',
    category: 'foliage',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2 + 25);
      ctx.scale(1.3, 1.3);
      ctx.fillStyle = '#3F2A14';
      ctx.fillRect(-8, -8, 16, 32);
      const clusters = [
        { dx: -16, dy: -18, r: 16, color: '#14532D' },
        { dx: 16, dy: -16, r: 15, color: '#166534' },
        { dx: 0, dy: -28, r: 18, color: '#15803D' },
        { dx: 0, dy: -46, r: 12, color: '#4ADE80' },
      ];
      clusters.forEach((c) => {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(c.dx, c.dy, c.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    },
  });

  items.push({
    id: 'tree_autumn',
    category: 'foliage',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2 + 25);
      ctx.scale(1.3, 1.3);
      ctx.fillStyle = '#3F3F46';
      ctx.fillRect(-6, -6, 12, 30);
      const clusters = [
        { dx: -14, dy: -18, r: 15, color: '#991B1B' },
        { dx: 14, dy: -16, r: 14, color: '#C2410C' },
        { dx: 0, dy: -28, r: 17, color: '#EA580C' },
        { dx: 0, dy: -44, r: 12, color: '#FACC15' },
      ];
      clusters.forEach((c) => {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(c.dx, c.dy, c.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    },
  });

  // B. Rocks & Obstacles
  items.push({
    id: 'boulder_granite',
    category: 'terrain',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2 + 10);
      ctx.fillStyle = '#474554';
      ctx.strokeStyle = '#23222B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#22543D';
      ctx.beginPath();
      ctx.arc(0, -14, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  });

  items.push({
    id: 'mossy_log',
    category: 'terrain',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2 - 25, size / 2 - 8);
      ctx.fillStyle = '#5B3926';
      ctx.strokeStyle = '#321D12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(0, 0, 50, 16, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(15, 2, 8, 0, Math.PI, true);
      ctx.arc(35, 2, 7, 0, Math.PI, true);
      ctx.fill();
      ctx.restore();
    },
  });

  // C. Interactive World Props
  const interactiveProps = [
    { id: 'server_rack', label: 'SERVER', color: '#0F172A', border: '#0284C7' },
    { id: 'quantum_core', label: 'Q-CORE', color: '#020617', border: '#06B6D4' },
    { id: 'explosive_barrel', label: 'TNT', color: '#DC2626', border: '#7F1D1D' },
    { id: 'ammo_crate', label: 'AMMO', color: '#78350F', border: '#451A03' },
    { id: 'security_turret', label: 'TURRET', color: '#334155', border: '#EF4444' },
    { id: 'vending_machine', label: 'SODA', color: '#2563EB', border: '#1D4ED8' },
    { id: 'streetlamp', label: 'LIGHT', color: '#FACC15', border: '#EAB308' },
    { id: 'road_barrier', label: 'ROAD', color: '#EA580C', border: '#C2410C' },
    { id: 'campfire', label: 'FIRE', color: '#B45309', border: '#F97316' },
  ];

  interactiveProps.forEach((p) => {
    items.push({
      id: `prop_${p.id}`,
      category: 'prop',
      draw: (ctx, size) => {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.border;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-24, -28, 48, 56, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, 0, 0);
        ctx.restore();
      },
    });
  });

  // D. Boss Rift Portals & Sigils
  const rifts = [
    { id: 'rift_crimson', color: '#FB7185', label: 'CRIMSON' },
    { id: 'rift_void', color: '#A78BFA', label: 'VOID' },
    { id: 'rift_cyan', color: '#22D3EE', label: 'CYAN' },
    { id: 'rift_amber', color: '#FBBF24', label: 'AMBER' },
  ];

  rifts.forEach((r) => {
    items.push({
      id: `rift_${r.id}`,
      category: 'rift',
      draw: (ctx, size) => {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fill();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = r.color;
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.label, 0, 0);
        ctx.restore();
      },
    });
  });

  packGridAtlas('world_environment_atlas', 128, 8, items);
}

// =========================================================
// MAIN GENERATOR PIPELINE
// =========================================================
function main() {
  console.log('🚀 Starting Complete TS Vector Graphics Sprite Atlas Generation...');
  generateChibiCustomizationAtlas();
  generateChibiEntitiesAtlas();
  generateHordeMobsAtlas();
  generateWeaponsAtlas();
  generateWorldEnvironmentAtlas();
  console.log('🎉 100% of all TS vector graphics assets successfully extracted into 5 Sprite Atlases!');
}

main();
