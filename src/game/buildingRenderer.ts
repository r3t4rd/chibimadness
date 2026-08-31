import { Building, InteriorFloor, Player } from '../types/game';
import {
  BUILDINGS,
  getBuilding,
  getInterior,
  INTERIOR_WORKERS,
  Occupancy,
  playerBehindBuilding,
} from './buildings';
import { drawChibiCharacter } from './chibiRenderer';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[]
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function palette(style: Building['facade']) {
  switch (style) {
    case 'police':
      return { wall: '#1E3A5F', trim: '#38BDF8', roof: '#334155', window: 'rgba(56,189,248,0.55)', door: '#0B1220', deep: '#020617' };
    case 'noodle':
      return { wall: '#44403C', trim: '#F97316', roof: '#292524', window: 'rgba(251,191,36,0.5)', door: '#1C1917', deep: '#0C0A09' };
    case 'punk':
      return { wall: '#27272A', trim: '#EF4444', roof: '#18181B', window: 'rgba(244,63,94,0.5)', door: '#09090B', deep: '#000000' };
    default:
      return { wall: '#164E63', trim: '#22D3EE', roof: '#0F172A', window: 'rgba(34,211,238,0.55)', door: '#020617', deep: '#000814' };
  }
}

function roomFill(kind: string): string {
  switch (kind) {
    case 'office':
      return '#1E3A5F';
    case 'kitchen':
      return '#44403C';
    case 'vault':
      return '#1C1917';
    case 'lab':
      return '#164E63';
    case 'club':
      return '#4A044E';
    case 'garage':
      return '#292524';
    case 'sleep':
      return '#312E81';
    case 'server':
      return '#082F49';
    case 'roof':
      return '#334155';
    case 'corridor':
      return '#111827';
    default:
      return '#1E293B';
  }
}

const STORIES_VISUAL = 28;
const SLAB_H = 16;

function drawExteriorTower(ctx: CanvasRenderingContext2D, b: Building, time: number, alpha: number) {
  const p = palette(b.facade);
  const faceH = 96;
  const eastW = 36;
  const towerTop = b.y - STORIES_VISUAL * SLAB_H;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, b.x + 18, b.y + 12, b.width + eastW, b.height + faceH * 0.25, 8);
  ctx.fill();

  ctx.fillStyle = p.deep;
  ctx.beginPath();
  ctx.moveTo(b.x + b.width, towerTop);
  ctx.lineTo(b.x + b.width + eastW, towerTop + 22);
  ctx.lineTo(b.x + b.width + eastW, b.y + b.height + faceH);
  ctx.lineTo(b.x + b.width, b.y + b.height + faceH - 10);
  ctx.closePath();
  ctx.fill();

  const sg = ctx.createLinearGradient(b.x, b.y + b.height, b.x, b.y + b.height + faceH);
  sg.addColorStop(0, p.wall);
  sg.addColorStop(1, p.deep);
  ctx.fillStyle = sg;
  ctx.fillRect(b.x, b.y + b.height, b.width, faceH);

  for (let i = 0; i < 3; i++) {
    const wy = b.y + b.height + 12 + i * 22;
    for (let wx = b.x + 18; wx < b.x + b.width - 18; wx += 18) {
      const lit = Math.sin(time * 2 + wx * 0.05 + i * 0.7) > 0.1;
      ctx.fillStyle = lit ? p.window : 'rgba(6,8,16,0.9)';
      ctx.fillRect(wx, wy, 11, 14);
    }
  }

  const d = b.door;
  ctx.fillStyle = p.door;
  roundRect(ctx, d.x, b.y + b.height - 6, d.width, 44, 5);
  ctx.fill();
  ctx.strokeStyle = p.trim;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 11px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ENTER', d.x + d.width / 2, b.y + b.height + 22);

  for (let s = STORIES_VISUAL; s >= 1; s--) {
    const slabY = b.y - s * SLAB_H;
    const inset = Math.min(28, s * 1.1);
    ctx.fillStyle = s % 2 === 0 ? p.wall : p.roof;
    roundRect(ctx, b.x + inset, slabY, b.width - inset * 2, 20, 3);
    ctx.fill();
    ctx.fillStyle = p.window;
    for (let wx = b.x + inset + 14; wx < b.x + b.width - inset - 14; wx += 16) {
      ctx.fillRect(wx, slabY + 4, 8, 12);
    }
  }

  ctx.fillStyle = p.roof;
  roundRect(ctx, b.x, b.y, b.width, b.height, 4);
  ctx.fill();
  ctx.strokeStyle = p.trim;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = 'rgba(2,6,23,0.94)';
  roundRect(ctx, b.x + 10, b.y + 10, Math.min(230, b.width - 20), 36, 4);
  ctx.fill();
  ctx.strokeStyle = p.trim;
  ctx.stroke();
  ctx.fillStyle = p.trim;
  ctx.font = '900 13px Fredoka, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.shortName, b.x + 18, b.y + 22);
  ctx.font = '700 10px Fredoka, sans-serif';
  ctx.fillText(`${STORIES_VISUAL}F  TOWER`, b.x + 18, b.y + 36);

  ctx.restore();
}

function drawInteriorFloorPlan(ctx: CanvasRenderingContext2D, fl: InteriorFloor, time: number) {
  ctx.fillStyle = '#050814';
  ctx.fillRect(fl.x - 140, fl.y - 120, fl.width + 280, fl.height + 240);

  const bldg = getBuilding(fl.buildingId);
  const p = palette(bldg?.facade || 'datacenter');

  for (const room of fl.rooms) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(room.x + 6, room.y + 8, room.width, room.height);
  }

  for (const room of fl.rooms) {
    ctx.fillStyle = roomFill(room.kind);
    ctx.fillRect(room.x, room.y, room.width, room.height);
    if (room.kind === 'corridor') {
      ctx.fillStyle = 'rgba(148,163,184,0.07)';
      if (room.width >= room.height) {
        for (let x = room.x + 10; x < room.x + room.width; x += 22) {
          ctx.fillRect(x, room.y, 6, room.height);
        }
      } else {
        for (let y = room.y + 10; y < room.y + room.height; y += 22) {
          ctx.fillRect(room.x, y, room.width, 6);
        }
      }
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let tx = room.x + 32; tx < room.x + room.width; tx += 32) {
        ctx.beginPath();
        ctx.moveTo(tx, room.y);
        ctx.lineTo(tx, room.y + room.height);
        ctx.stroke();
      }
    }
    ctx.fillStyle = room.kind === 'corridor' ? 'rgba(148,163,184,0.45)' : 'rgba(248,250,252,0.55)';
    ctx.font = '800 10px Fredoka, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(room.name, room.x + 10, room.y + 10);
  }

  ctx.strokeStyle = '#0B1220';
  ctx.lineWidth = 14;
  for (const w of fl.walls) {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(w.x, w.y, w.width, w.height);
    ctx.fillStyle = '#1E293B';
    if (w.width > w.height) {
      ctx.fillRect(w.x, w.y + w.height, w.width, 8);
    }
  }

  for (const prop of fl.props) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(prop.x + 3, prop.y + 5, prop.width, prop.height);
    if (prop.kind === 'desk' || prop.kind === 'counter' || prop.kind === 'bar') {
      ctx.fillStyle = '#78716C';
      ctx.fillRect(prop.x, prop.y, prop.width, prop.height);
      ctx.strokeStyle = '#F59E0B';
      ctx.strokeRect(prop.x, prop.y, prop.width, prop.height);
    } else if (prop.kind === 'table') {
      ctx.fillStyle = '#57534E';
      roundRect(ctx, prop.x, prop.y, prop.width, prop.height, 6);
      ctx.fill();
    } else if (prop.kind === 'rack') {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(prop.x, prop.y, prop.width, prop.height);
      ctx.strokeStyle = '#38BDF8';
      ctx.strokeRect(prop.x, prop.y, prop.width, prop.height);
    } else if (prop.kind === 'sofa') {
      ctx.fillStyle = '#7F1D1D';
      roundRect(ctx, prop.x, prop.y, prop.width, prop.height, 8);
      ctx.fill();
    } else {
      ctx.fillStyle = '#92400E';
      ctx.fillRect(prop.x, prop.y, prop.width, prop.height);
      ctx.strokeStyle = '#FBBF24';
      ctx.strokeRect(prop.x, prop.y, prop.width, prop.height);
    }
    if (prop.label) {
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '700 8px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(prop.label, prop.x + prop.width / 2, prop.y + 12);
    }
  }

  if (fl.exitPad) {
    ctx.fillStyle = '#14532D';
    roundRect(ctx, fl.exitPad.x, fl.exitPad.y, fl.exitPad.width, fl.exitPad.height, 4);
    ctx.fill();
    ctx.strokeStyle = '#22C55E';
    ctx.stroke();
    ctx.fillStyle = '#BBF7D0';
    ctx.font = '800 9px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ STREET', fl.exitPad.x + fl.exitPad.width / 2, fl.exitPad.y + fl.exitPad.height / 2 + 3);
  }

  const e = fl.elevator;
  const pulse = (Math.sin(time * 7) + 1) * 0.5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#020617';
  roundRect(ctx, e.x, e.y, e.width, e.height, 6);
  ctx.fill();
  ctx.strokeStyle = '#22D3EE';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#22D3EE';
  ctx.shadowBlur = 8 + pulse * 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#CFFAFE';
  ctx.font = '900 9px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LIFT', e.x + e.width / 2, e.y + 18);
  ctx.font = '900 20px Fredoka, sans-serif';
  ctx.fillText(`${fl.index + 1}`, e.x + e.width / 2, e.y + e.height / 2 + 6);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '700 8px Fredoka, sans-serif';
  ctx.fillText('W / S', e.x + e.width / 2, e.y + e.height - 12);

  ctx.fillStyle = 'rgba(2,6,23,0.92)';
  roundRect(ctx, fl.x + fl.width / 2 - 150, fl.y - 28, 300, 24, 5);
  ctx.fill();
  ctx.strokeStyle = p.trim;
  ctx.stroke();
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 12px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fl.name, fl.x + fl.width / 2, fl.y - 16);
}

function dummyFromWorker(w: (typeof INTERIOR_WORKERS)[number]): Player {
  return {
    id: w.id,
    name: w.name,
    characterClass: 'gunslinger',
    chibi: {
      hairStyle: 'bob',
      hairColor: w.hairColor,
      earType: 'none',
      earColor: '#1F2937',
      haloType: 'none',
      haloColor: '#E2E8F0',
      coatColor: w.coatColor,
      skirtColor: '#1E293B',
      eyeType: 'happy',
      skinTone: '#F1C7A1',
    },
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: w.facing,
    state: w.state === 'walk' ? 'walk' : 'idle',
    stats: { level: 1, exp: 0, maxExp: 100, hp: 80, maxHp: 80, mp: 40, maxMp: 40, atk: 5, def: 5, speed: 3, critRate: 5, statPoints: 0, str: 3, agi: 3, int: 3, vit: 3 },
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
    currentZone: 'cop_precinct',
    activeBuffs: [],
    hideWeapon: true,
  };
}

export function drawWorldBuildings(
  ctx: CanvasRenderingContext2D,
  player: Player,
  occupancy: Occupancy,
  time: number
) {
  if (occupancy.buildingId) {
    const fl = getInterior(occupancy.buildingId, occupancy.floor);
    if (fl) drawInteriorFloorPlan(ctx, fl, time);
    return;
  }

  for (const b of BUILDINGS) {
    ctx.save();
    const behind = playerBehindBuilding(player.x, player.y, b);
    if (behind) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = palette(b.facade).roof;
      roundRect(ctx, b.x, b.y, b.width, b.height, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      drawExteriorTower(ctx, b, time, 1);
    }
    ctx.restore();
  }
}

export function drawBuildingOccluders(
  ctx: CanvasRenderingContext2D,
  player: Player,
  occupancy: Occupancy,
  time: number
) {
  if (occupancy.buildingId) return;
  for (const b of BUILDINGS) {
    if (!playerBehindBuilding(player.x, player.y, b)) continue;
    ctx.save();
    drawExteriorTower(ctx, b, time, 0.28);
    ctx.restore();
  }
}

export function drawInteriorActors(ctx: CanvasRenderingContext2D, occupancy: Occupancy, time: number) {
  if (!occupancy.buildingId) return;
  const fl = getInterior(occupancy.buildingId, occupancy.floor);
  if (!fl) return;
  for (const w of INTERIOR_WORKERS) {
    if (w.x < fl.x || w.x > fl.x + fl.width || w.y < fl.y || w.y > fl.y + fl.height) continue;
    ctx.save();
    const dummy = dummyFromWorker(w);
    dummy.x = w.x;
    dummy.y = w.y;
    drawChibiCharacter(ctx, dummy, time, false);
    ctx.translate(w.x, w.y);
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    roundRect(ctx, -28, -58, 56, 14, 6);
    ctx.fill();
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 8px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.name, 0, -49);
    if (w.state === 'sit' || w.state === 'idle') {
      ctx.fillStyle = '#FDE68A';
      ctx.font = '700 8px Fredoka, sans-serif';
      ctx.fillText(w.bark || '...', 0, -70);
    }
    ctx.restore();
  }
}

export function drawInteriorPrompt(ctx: CanvasRenderingContext2D, player: Player, occupancy: Occupancy) {
  if (!occupancy.buildingId) return;
  const b = getBuilding(occupancy.buildingId);
  const fl = occupancy.buildingId ? getInterior(occupancy.buildingId, occupancy.floor) : undefined;
  if (!b || !fl) return;
  const e = fl.elevator;
  if (player.x < e.x || player.x > e.x + e.width || player.y < e.y || player.y > e.y + e.height) return;
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,0.92)';
  ctx.strokeStyle = '#22D3EE';
  ctx.lineWidth = 2;
  roundRect(ctx, player.x - 86, player.y - 58, 172, 26, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#CFFAFE';
  ctx.font = '800 10px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('W ▲  этаж     S ▼  этаж', player.x, player.y - 45);
  ctx.restore();
}
