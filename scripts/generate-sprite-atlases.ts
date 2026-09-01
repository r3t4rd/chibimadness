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
import { ChibiConfig, Player, Monster } from '../src/types/game';

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

// ---------------------------------------------------------
// ATLAS 1: CHIBI CUSTOMIZATION ATLAS
// ---------------------------------------------------------
function generateChibiCustomizationAtlas() {
  const frontHairStyles: NonNullable<ChibiConfig['frontHairStyle']>[] = [
    'straight_bangs',
    'curtain_bangs',
    'side_swept',
    'spiky_bangs',
    'center_split',
    'none',
  ];

  const backHairStyles: NonNullable<ChibiConfig['backHairStyle']>[] = [
    'twintails',
    'bob',
    'ponytail',
    'long_flowing',
    'wolf_cut',
    'wavy',
    'braids',
    'spiky',
    'none_short',
  ];

  const eyeTypes: NonNullable<ChibiConfig['eyeType']>[] = [
    'happy',
    'determined',
    'anya_smug',
    'nya_cat',
    'wink_star',
    'heart_eyes',
    'sparkle_stars',
    'dead_x',
    'hypno_spiral',
  ];

  const outfits: { id: string; coat: string; skirt: string }[] = [
    { id: 'millennium_default', coat: '#FFFFFF', skirt: '#3A3640' },
    { id: 'trinity_sailor', coat: '#F1F5F9', skirt: '#1E3A8A' },
    { id: 'gehenna_coat', coat: '#18181B', skirt: '#991B1B' },
    { id: 'cyber_suit', coat: '#0F172A', skirt: '#0284C7' },
    { id: 'tactical_vest', coat: '#334155', skirt: '#475569' },
    { id: 'kimono_modern', coat: '#F472B6', skirt: '#831843' },
    { id: 'tracksuit_idol', coat: '#F43F5E', skirt: '#FFE4E6' },
  ];

  const earTypes: NonNullable<ChibiConfig['earType']>[] = [
    'cat',
    'bunny',
    'fox',
    'wolf',
    'bear',
    'elf',
    'cyber_antennas',
    'horns',
    'devil_horns',
    'none',
  ];

  const haloTypes: NonNullable<ChibiConfig['haloType']>[] = [
    'star',
    'circle',
    'winged',
    'crown',
    'cross',
    'cyber_hex',
    'heart',
    'neon_rings',
    'shuriken',
    'none',
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
    'none',
  ];

  const hatTypes: NonNullable<ChibiConfig['hatType']>[] = [
    'beret',
    'cyber_cap',
    'combat_helmet',
    'cat_beanie',
    'witch_hat',
    'maid_headdress',
    'bunny_hood',
    'cyber_visor',
    'headphones',
    'none',
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
      draw: (ctx, size) => drawOutfitThumbnail(ctx, size, size, outfit.id as any, outfit.coat, outfit.skirt),
    });
  });

  earTypes.forEach((ear) => {
    items.push({
      id: `ear_${ear}`,
      category: 'ears',
      draw: (ctx, size) => drawEarThumbnail(ctx, size, size, ear, '#18181B'),
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

// ---------------------------------------------------------
// ATLAS 2: CHIBI ENTITIES & VEHICLES ATLAS
// ---------------------------------------------------------
function generateChibiEntitiesAtlas() {
  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  const operatorPresets: { id: string; chibi: ChibiConfig }[] = [
    {
      id: 'millennium_student',
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
        coatColor: '#FFFFFF',
        skirtColor: '#3A3640',
        ribbonColor: '#F472B6',
        earColor: '#18181B',
      },
    },
    {
      id: 'trinity_scholar',
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
        coatColor: '#F1F5F9',
        skirtColor: '#1E3A8A',
        ribbonColor: '#F43F5E',
        earColor: '#18181B',
      },
    },
    {
      id: 'gehenna_rebel',
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
        coatColor: '#18181B',
        skirtColor: '#991B1B',
        earColor: '#18181B',
      },
    },
    {
      id: 'cyber_shinobi',
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
        coatColor: '#0F172A',
        skirtColor: '#0284C7',
        earColor: '#18181B',
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
          stats: {
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
          },
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
          equipment: { weapon: null, headwear: null, outfit: null, vehicle: null, accessory: null },
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
        ctx.translate(size / 2, size / 2 + 20);
        ctx.scale(1.2, 1.2);
        drawChibiCharacter(ctx, mockPlayer, 0, false, { bodyOnly: false });
        ctx.restore();
      },
    });
  });

  const humanoidEnemies: Monster['type'][] = ['cop_swat', 'cop_officer', 'cop_juggernaut', 'bandit_grunt', 'bandit_boss'];
  humanoidEnemies.forEach((type) => {
    items.push({
      id: `enemy_${type}`,
      category: 'enemy',
      draw: (ctx, size) => {
        const mockMonster: Monster = {
          id: type,
          name: type,
          type,
          zone: 'academy_square',
          x: 0,
          y: 0,
          spawnX: 0,
          spawnY: 0,
          hp: 100,
          maxHp: 100,
          atk: 10,
          def: 5,
          speed: 80,
          expReward: 10,
          goldReward: 5,
          targetPlayerId: null,
          attackCooldown: 0,
          specialCooldown: 0,
          isBoss: false,
          state: 'idle',
          facing: 'right',
        };
        ctx.save();
        ctx.translate(size / 2, size / 2 + 15);
        ctx.scale(1.2, 1.2);
        drawHumanoidEnemy(ctx, mockMonster, 0);
        ctx.restore();
      },
    });
  });

  items.push({
    id: 'vehicle_police_cruiser',
    category: 'vehicle',
    draw: (ctx, size) => {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.scale(0.8, 0.8);
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
      ctx.scale(0.8, 0.8);
      drawCyberMuscleCar(ctx, 0, 0, 0);
      ctx.restore();
    },
  });

  packGridAtlas('chibi_entities_atlas', 160, 10, items);
}

// ---------------------------------------------------------
// ATLAS 3: HORDE MOBS ATLAS
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// ATLAS 4: WEAPONS & ATTACHMENTS ATLAS
// ---------------------------------------------------------
function generateWeaponsAtlas() {
  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  const weapons: { id: string; name: string }[] = [
    { id: 'ak47', name: 'AK-47 Assault Rifle' },
    { id: 'm4a1', name: 'M4A1 Carbine' },
    { id: 'cheytac', name: 'CheyTac M200 Intervention' },
    { id: 'shotgun', name: 'Tactical Shotgun' },
    { id: 'mac10', name: 'MAC-10 SMG' },
    { id: 'pistol', name: 'Combat Pistol' },
    { id: 'revolver', name: 'Heavy Revolver' },
    { id: 'katana', name: 'High-Frequency Katana' },
    { id: 'sledgehammer', name: 'Welder Sledgehammer' },
    { id: 'scythe', name: 'Plasma Scythe' },
    { id: 'greatsword', name: 'Titan Greatsword' },
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
          stats: {
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
          },
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
        ctx.translate(size / 2 - 20, size / 2);
        ctx.scale(1.8, 1.8);
        drawChibiCharacter(ctx, mockPlayer, 0, false, { bodyOnly: false });
        ctx.restore();
      },
    });
  });

  packGridAtlas('weapons_atlas', 128, 8, items);
}

// ---------------------------------------------------------
// ATLAS 5: WORLD ENVIRONMENT & PROPS ATLAS
// ---------------------------------------------------------
function generateWorldEnvironmentAtlas() {
  const items: { id: string; category: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }[] = [];

  const props = [
    { id: 'server_rack', color: '#0F172A' },
    { id: 'quantum_core', color: '#06B6D4' },
    { id: 'explosive_barrel', color: '#DC2626' },
    { id: 'crate', color: '#78350F' },
    { id: 'streetlamp', color: '#FACC15' },
    { id: 'vending_machine', color: '#3B82F6' },
    { id: 'barrier', color: '#EA580C' },
  ];

  props.forEach((p) => {
    items.push({
      id: `prop_${p.id}`,
      category: 'prop',
      draw: (ctx, size) => {
        ctx.save();
        ctx.translate(size / 2, size / 2 + 10);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-24, -30, 48, 50, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.id.toUpperCase().slice(0, 8), 0, -4);
        ctx.restore();
      },
    });
  });

  packGridAtlas('world_environment_atlas', 128, 8, items);
}

// ---------------------------------------------------------
// MAIN EXECUTION
// ---------------------------------------------------------
function main() {
  console.log('🚀 Starting TS Vector Graphics Sprite Atlas Generation...');
  generateChibiCustomizationAtlas();
  generateChibiEntitiesAtlas();
  generateHordeMobsAtlas();
  generateWeaponsAtlas();
  generateWorldEnvironmentAtlas();
  console.log('🎉 All 5 Sprite Atlases and JSON Manifests successfully generated!');
}

main();
