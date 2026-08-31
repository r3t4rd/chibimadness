import {
  Building,
  BuildingFloorTheme,
  BuildingProp,
  InteriorFloor,
  InteriorRoom,
  InteriorWorker,
} from '../types/game';

export const INTERIOR_WORLD_MIN_X = 6800;

export interface Occupancy {
  buildingId: string | null;
  floor: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WallSegment {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

export function pointInR(px: number, py: number, r: Rect): boolean {
  return pointInRect(px, py, r.x, r.y, r.width, r.height);
}

function doorOf(b: { x: number; y: number; width: number; height: number; doorWidth: number }): Rect {
  return {
    x: b.x + (b.width - b.doorWidth) / 2,
    y: b.y + b.height - 12,
    width: b.doorWidth,
    height: 36,
  };
}

function streetOf(b: { x: number; y: number; width: number; height: number; doorWidth: number }) {
  const d = doorOf(b);
  return { x: d.x + d.width / 2, y: b.y + b.height + 42 };
}

const policeLot = { x: 400, y: 3180, width: 420, height: 280, doorWidth: 72 };
const noodleLot = { x: 1040, y: 3180, width: 400, height: 280, doorWidth: 72 };
const hostLot = { x: 1640, y: 3140, width: 440, height: 340, doorWidth: 76 };
const punkALot = { x: 3140, y: 3180, width: 460, height: 300, doorWidth: 76 };
const punkBLot = { x: 3840, y: 3180, width: 440, height: 300, doorWidth: 76 };

export const BUILDINGS: Building[] = [
  {
    id: 'bldg_police_hq',
    name: 'SWAT Metro Precinct HQ',
    shortName: 'POLICE HQ',
    ...policeLot,
    facade: 'police',
    streetSpawn: streetOf(policeLot),
    door: doorOf(policeLot),
    floors: [
      { index: 0, name: 'F1 · Lobby', theme: 'lobby' },
      { index: 1, name: 'F2 · Armory', theme: 'armory' },
      { index: 2, name: 'F3 · Offices', theme: 'office' },
      { index: 3, name: 'F4 · Helipad', theme: 'helipad' },
    ],
  },
  {
    id: 'bldg_noodle_plaza',
    name: 'Cyber Noodle Plaza',
    shortName: 'NOODLE PLAZA',
    ...noodleLot,
    facade: 'noodle',
    streetSpawn: streetOf(noodleLot),
    door: doorOf(noodleLot),
    floors: [
      { index: 0, name: 'F1 · Buffet', theme: 'buffet' },
      { index: 1, name: 'F2 · Ammo Shop', theme: 'ammo' },
      { index: 2, name: 'F3 · Capsules', theme: 'apartment' },
      { index: 3, name: 'F4 · Roof Garden', theme: 'garden' },
    ],
  },
  {
    id: 'bldg_hostingovaya',
    name: 'HOSTINGOVAYA',
    shortName: 'HOSTINGOVAYA',
    ...hostLot,
    facade: 'datacenter',
    streetSpawn: streetOf(hostLot),
    door: doorOf(hostLot),
    floors: [
      { index: 0, name: 'F1 · Checkpoint', theme: 'checkpoint' },
      { index: 1, name: 'F2 · Server Hall', theme: 'server' },
      { index: 2, name: 'F3 · GPU Lab', theme: 'gpu' },
      { index: 3, name: 'F4 · Quantum', theme: 'quantum' },
    ],
  },
  {
    id: 'bldg_punk_warehouse',
    name: 'Syndicate Warehouse',
    shortName: 'WAREHOUSE A',
    ...punkALot,
    facade: 'punk',
    streetSpawn: streetOf(punkALot),
    door: doorOf(punkALot),
    floors: [
      { index: 0, name: 'F1 · Chop Shop', theme: 'chopshop' },
      { index: 1, name: 'F2 · Club', theme: 'club' },
      { index: 2, name: 'F3 · Stash', theme: 'stash' },
      { index: 3, name: 'F4 · Roof', theme: 'warehouse_roof' },
    ],
  },
  {
    id: 'bldg_anarchy_tower',
    name: 'Anarchy Tower',
    shortName: 'TOWER B',
    ...punkBLot,
    facade: 'punk',
    streetSpawn: streetOf(punkBLot),
    door: doorOf(punkBLot),
    floors: [
      { index: 0, name: 'F1 · Garage', theme: 'chopshop' },
      { index: 1, name: 'F2 · Lounge', theme: 'club' },
      { index: 2, name: 'F3 · Vault', theme: 'stash' },
      { index: 3, name: 'F4 · Roof', theme: 'warehouse_roof' },
    ],
  },
];

export function getBuilding(id: string | null | undefined): Building | undefined {
  if (!id) return undefined;
  return BUILDINGS.find((b) => b.id === id);
}

const T = 16;
const DOOR = 52;
const EXIT_W = 70;
const DOOR_EDGE = 8;

type RoomDef = {
  id: string;
  name: string;
  kind: InteriorRoom['kind'];
  x: number;
  y: number;
  w: number;
  h: number;
};

type PlacedRoom = RoomDef & InteriorRoom;

function overlapLen(a0: number, a1: number, b0: number, b1: number) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function doorGap(a: InteriorRoom, b: InteriorRoom): Rect | null {
  const ox = overlapLen(a.x, a.x + a.width, b.x, b.x + b.width);
  const oy = overlapLen(a.y, a.y + a.height, b.y, b.y + b.height);
  if (ox <= 0 || oy <= 0) return null;
  if (ox <= T + 6 && oy > 40) {
    const x = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y) + DOOR_EDGE;
    const y1 = Math.min(a.y + a.height, b.y + b.height) - DOOR_EDGE;
    const span = y1 - y0;
    if (span < 36) return null;
    const doorH = Math.min(DOOR, span);
    const mid = (y0 + y1) / 2;
    return { x: x - 2, y: mid - doorH / 2, width: ox + 4, height: doorH };
  }
  if (oy <= T + 6 && ox > 40) {
    const y = Math.max(a.y, b.y);
    const x0 = Math.max(a.x, b.x) + DOOR_EDGE;
    const x1 = Math.min(a.x + a.width, b.x + b.width) - DOOR_EDGE;
    const span = x1 - x0;
    if (span < 36) return null;
    const doorW = Math.min(DOOR, span);
    const mid = (x0 + x1) / 2;
    return { x: mid - doorW / 2, y: y - 2, width: doorW, height: oy + 4 };
  }
  return null;
}

function subtractRect(w: WallSegment, g: Rect): WallSegment[] {
  if (w.x >= g.x + g.width || w.x + w.width <= g.x || w.y >= g.y + g.height || w.y + w.height <= g.y) {
    return [w];
  }
  const ix = Math.max(w.x, g.x);
  const iy = Math.max(w.y, g.y);
  const ax = Math.min(w.x + w.width, g.x + g.width);
  const ay = Math.min(w.y + w.height, g.y + g.height);
  const pieces: WallSegment[] = [];
  if (ix > w.x) pieces.push({ x: w.x, y: w.y, width: ix - w.x, height: w.height });
  if (ax < w.x + w.width) pieces.push({ x: ax, y: w.y, width: w.x + w.width - ax, height: w.height });
  if (iy > w.y) pieces.push({ x: ix, y: w.y, width: ax - ix, height: iy - w.y });
  if (ay < w.y + w.height) pieces.push({ x: ix, y: ay, width: ax - ix, height: w.y + w.height - ay });
  return pieces.filter((p) => p.width >= 3 && p.height >= 3);
}

function punch(walls: WallSegment[], gap: Rect): WallSegment[] {
  const out: WallSegment[] = [];
  for (const w of walls) out.push(...subtractRect(w, gap));
  return out;
}

function wallsForRooms(rooms: InteriorRoom[]): WallSegment[] {
  const walls: WallSegment[] = [];
  for (const r of rooms) {
    walls.push(
      { x: r.x, y: r.y, width: r.width, height: T },
      { x: r.x, y: r.y, width: T, height: r.height },
      { x: r.x + r.width - T, y: r.y, width: T, height: r.height },
      { x: r.x, y: r.y + r.height - T, width: r.width, height: T }
    );
  }
  return walls;
}

function byId(list: PlacedRoom[], id: string): PlacedRoom {
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error(`interior room '${id}' missing`);
  return r;
}

function planFloor(
  buildingId: string,
  index: number,
  name: string,
  theme: BuildingFloorTheme,
  ox: number,
  oy: number,
  defs: RoomDef[],
  links: [string, string][],
  opt: {
    exitFrom?: string;
    lift: string;
    props?: BuildingProp[];
  }
): InteriorFloor {
  const placed: PlacedRoom[] = defs.map((d) => ({
    ...d,
    x: ox + d.x,
    y: oy + d.y,
    width: d.w,
    height: d.h,
  }));
  const rooms: InteriorRoom[] = placed.map(({ name: n, x, y, width, height, kind }) => ({
    name: n,
    x,
    y,
    width,
    height,
    kind,
  }));
  let walls = wallsForRooms(rooms);
  for (const [a, b] of links) {
    const gap = doorGap(byId(placed, a), byId(placed, b));
    if (!gap) {
      throw new Error(`no doorway between '${a}' and '${b}' on ${buildingId} F${index}`);
    }
    walls = punch(walls, gap);
  }
  const lift = byId(placed, opt.lift);
  const liftLink = links.find(([a, b]) => a === opt.lift || b === opt.lift);
  const neighbor = liftLink ? byId(placed, liftLink[0] === opt.lift ? liftLink[1] : liftLink[0]) : undefined;
  const nCx = neighbor ? neighbor.x + neighbor.width / 2 : lift.x + lift.width / 2;
  const nCy = neighbor ? neighbor.y + neighbor.height / 2 : lift.y + lift.height;
  const dx = nCx - (lift.x + lift.width / 2);
  const dy = nCy - (lift.y + lift.height / 2);
  const elevator =
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? { x: lift.x + T + 8, y: lift.y + T + 10, width: 64, height: 80 }
        : { x: lift.x + lift.width - T - 72, y: lift.y + T + 10, width: 64, height: 80 }
      : dy > 0
        ? { x: lift.x + Math.max(T + 8, (lift.width - 64) / 2), y: lift.y + T + 10, width: 64, height: 80 }
        : { x: lift.x + Math.max(T + 8, (lift.width - 64) / 2), y: lift.y + lift.height - T - 88, width: 64, height: 80 };
  const elevatorLanding =
    Math.abs(dx) > Math.abs(dy)
      ? {
          x: dx > 0 ? elevator.x + elevator.width + 48 : elevator.x - 48,
          y: elevator.y + elevator.height / 2,
        }
      : {
          x: elevator.x + elevator.width / 2,
          y: dy > 0 ? elevator.y + elevator.height + 48 : elevator.y - 48,
        };
  let exitPad: InteriorFloor['exitPad'];
  let spawn: { x: number; y: number };
  if (opt.exitFrom) {
    const lobby = byId(placed, opt.exitFrom);
    walls = punch(walls, {
      x: lobby.x + (lobby.width - EXIT_W) / 2,
      y: lobby.y + lobby.height - T - 2,
      width: EXIT_W,
      height: T + 4,
    });
    exitPad = {
      x: lobby.x + (lobby.width - EXIT_W) / 2,
      y: lobby.y + lobby.height - T - 8,
      width: EXIT_W,
      height: 28,
    };
    spawn = { x: lobby.x + lobby.width / 2, y: lobby.y + lobby.height - T - 40 };
  } else {
    spawn = { x: elevator.x + 32, y: Math.min(elevator.y + elevator.height + 24, lift.y + lift.height - 28) };
  }
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const maxY = Math.max(...rooms.map((r) => r.y + r.height));
  const props = (opt.props || []).map((p) => ({ ...p, x: p.x + ox, y: p.y + oy }));
  return {
    buildingId,
    index,
    name,
    theme,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    walls,
    rooms,
    props,
    exitPad,
    elevator,
    elevatorLanding,
    spawn,
  };
}

const OX = 7200;
const OY = 350;
const CW = 1100;
const RH = 950;

function col(c: number, r: number) {
  return { x: OX + c * CW, y: OY + r * RH };
}

const p0 = col(0, 0);
const p1 = col(0, 1);
const p2 = col(0, 2);
const p3 = col(0, 3);
const n0 = col(1, 0);
const n1 = col(1, 1);
const n2 = col(1, 2);
const n3 = col(1, 3);
const h0 = col(2, 0);
const h1 = col(2, 1);
const h2 = col(2, 2);
const h3 = col(2, 3);
const a0 = col(3, 0);
const a1 = col(3, 1);
const a2 = col(3, 2);
const a3 = col(3, 3);
const b0 = col(4, 0);
const b1 = col(4, 1);
const b2 = col(4, 2);
const b3 = col(4, 3);

export const INTERIORS: InteriorFloor[] = [
  planFloor(
    'bldg_police_hq',
    0,
    'F1 · Lobby',
    'lobby',
    p0.x,
    p0.y,
    [
      { id: 'spine', name: 'Corridor', kind: 'corridor', x: 440, y: 0, w: 96, h: 448 },
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 520, y: 0, w: 160, h: 160 },
      { id: 'duty', name: 'Duty desk', kind: 'office', x: 164, y: 70, w: 292, h: 190 },
      { id: 'hold', name: 'Holding', kind: 'vault', x: 520, y: 190, w: 240, h: 180 },
      { id: 'cells', name: 'Cells', kind: 'vault', x: 744, y: 190, w: 170, h: 180 },
      { id: 'lobby', name: 'Reception', kind: 'hall', x: 300, y: 432, w: 340, h: 220 },
      { id: 'brief', name: 'Interview', kind: 'office', x: 120, y: 460, w: 196, h: 170 },
      { id: 'wait', name: 'Waiting', kind: 'hall', x: 624, y: 460, w: 190, h: 170 },
    ],
    [
      ['spine', 'lift'],
      ['spine', 'duty'],
      ['spine', 'hold'],
      ['hold', 'cells'],
      ['spine', 'lobby'],
      ['lobby', 'brief'],
      ['lobby', 'wait'],
    ],
    {
      exitFrom: 'lobby',
      lift: 'lift',
      props: [
        { x: 340, y: 500, width: 160, height: 32, kind: 'counter', label: 'RECEPTION' },
        { x: 480, y: 540, width: 70, height: 40, kind: 'sofa' },
        { x: 190, y: 100, width: 80, height: 40, kind: 'desk' },
        { x: 290, y: 100, width: 80, height: 40, kind: 'desk' },
        { x: 150, y: 500, width: 90, height: 44, kind: 'table' },
        { x: 650, y: 500, width: 70, height: 40, kind: 'sofa' },
        { x: 560, y: 220, width: 48, height: 48, kind: 'crate' },
      ],
    }
  ),
  planFloor(
    'bldg_police_hq',
    1,
    'F2 · Armory',
    'armory',
    p1.x,
    p1.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 0, y: 0, w: 150, h: 160 },
      { id: 'hallN', name: 'North hall', kind: 'corridor', x: 134, y: 36, w: 380, h: 90 },
      { id: 'range', name: 'Range', kind: 'hall', x: 498, y: 0, w: 280, h: 220 },
      { id: 'hallV', name: 'Armory hall', kind: 'corridor', x: 240, y: 110, w: 90, h: 300 },
      { id: 'cage', name: 'Cage A', kind: 'vault', x: 0, y: 220, w: 256, h: 250 },
      { id: 'hallE', name: 'East spur', kind: 'corridor', x: 314, y: 196, w: 220, h: 120 },
      { id: 'lock', name: 'Lockers', kind: 'office', x: 314, y: 300, w: 220, h: 180 },
      { id: 'cageB', name: 'Cage B', kind: 'vault', x: 518, y: 240, w: 210, h: 220 },
    ],
    [
      ['lift', 'hallN'],
      ['hallN', 'range'],
      ['hallN', 'hallV'],
      ['hallV', 'cage'],
      ['hallV', 'hallE'],
      ['hallE', 'lock'],
      ['hallE', 'cageB'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 30, y: 250, width: 32, height: 110, kind: 'rack' },
        { x: 80, y: 250, width: 32, height: 110, kind: 'rack' },
        { x: 130, y: 250, width: 32, height: 110, kind: 'rack' },
        { x: 540, y: 40, width: 50, height: 40, kind: 'crate' },
        { x: 610, y: 40, width: 50, height: 40, kind: 'crate' },
        { x: 340, y: 330, width: 70, height: 36, kind: 'desk' },
        { x: 550, y: 280, width: 48, height: 48, kind: 'crate' },
      ],
    }
  ),
  planFloor(
    'bldg_police_hq',
    2,
    'F3 · Offices',
    'office',
    p2.x,
    p2.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 0, y: 0, w: 150, h: 160 },
      { id: 'hall', name: 'Office hall', kind: 'corridor', x: 134, y: 24, w: 620, h: 96 },
      { id: 'cubA', name: 'Cubicles A', kind: 'office', x: 180, y: 104, w: 200, h: 200 },
      { id: 'cubB', name: 'Cubicles B', kind: 'office', x: 396, y: 104, w: 200, h: 200 },
      { id: 'brief', name: 'Briefing', kind: 'office', x: 612, y: 104, w: 220, h: 220 },
      { id: 'hallS', name: 'South hall', kind: 'corridor', x: 240, y: 288, w: 96, h: 220 },
      { id: 'open', name: 'Open floor', kind: 'hall', x: 240, y: 492, w: 280, h: 170 },
      { id: 'brk', name: 'Break room', kind: 'hall', x: 80, y: 492, w: 176, h: 170 },
    ],
    [
      ['lift', 'hall'],
      ['hall', 'cubA'],
      ['hall', 'cubB'],
      ['hall', 'brief'],
      ['cubA', 'hallS'],
      ['hallS', 'open'],
      ['open', 'brk'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 200, y: 130, width: 70, height: 36, kind: 'desk' },
        { x: 280, y: 130, width: 70, height: 36, kind: 'desk' },
        { x: 200, y: 190, width: 70, height: 36, kind: 'desk' },
        { x: 420, y: 130, width: 70, height: 36, kind: 'desk' },
        { x: 500, y: 130, width: 70, height: 36, kind: 'desk' },
        { x: 420, y: 190, width: 70, height: 36, kind: 'desk' },
        { x: 640, y: 140, width: 100, height: 50, kind: 'table' },
        { x: 740, y: 140, width: 60, height: 50, kind: 'table' },
        { x: 280, y: 530, width: 90, height: 40, kind: 'sofa' },
        { x: 110, y: 530, width: 70, height: 40, kind: 'table' },
      ],
    }
  ),
  planFloor(
    'bldg_police_hq',
    3,
    'F4 · Helipad',
    'helipad',
    p3.x,
    p3.y,
    [
      { id: 'lift', name: 'Stair house', kind: 'hall', x: 40, y: 40, w: 150, h: 160 },
      { id: 'walk', name: 'Catwalk', kind: 'corridor', x: 174, y: 70, w: 280, h: 80 },
      { id: 'ctrl', name: 'Control', kind: 'office', x: 438, y: 40, w: 180, h: 160 },
      { id: 'pad', name: 'Helipad', kind: 'roof', x: 200, y: 134, w: 260, h: 240 },
      { id: 'fuel', name: 'Fuel cache', kind: 'vault', x: 200, y: 358, w: 180, h: 140 },
      { id: 'nest', name: 'Lookout', kind: 'roof', x: 444, y: 200, w: 160, h: 160 },
    ],
    [
      ['lift', 'walk'],
      ['walk', 'ctrl'],
      ['walk', 'pad'],
      ['pad', 'fuel'],
      ['pad', 'nest'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 460, y: 70, width: 70, height: 36, kind: 'desk' },
        { x: 230, y: 390, width: 50, height: 50, kind: 'crate' },
      ],
    }
  ),

  planFloor(
    'bldg_noodle_plaza',
    0,
    'F1 · Buffet',
    'buffet',
    n0.x,
    n0.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 320, y: 20, w: 150, h: 196 },
      { id: 'kit', name: 'Kitchen', kind: 'kitchen', x: 80, y: 80, w: 276, h: 200 },
      { id: 'pan', name: 'Pantry', kind: 'vault', x: 80, y: 264, w: 180, h: 150 },
      { id: 'hall', name: 'Service hall', kind: 'corridor', x: 340, y: 200, w: 96, h: 296 },
      { id: 'dine', name: 'Dining', kind: 'hall', x: 420, y: 220, w: 320, h: 260 },
      { id: 'wc', name: 'Restroom', kind: 'office', x: 724, y: 250, w: 140, h: 160 },
      { id: 'lobby', name: 'Entrance', kind: 'hall', x: 240, y: 480, w: 300, h: 200 },
    ],
    [
      ['lift', 'hall'],
      ['kit', 'hall'],
      ['kit', 'pan'],
      ['hall', 'dine'],
      ['dine', 'wc'],
      ['hall', 'lobby'],
    ],
    {
      exitFrom: 'lobby',
      lift: 'lift',
      props: [
        { x: 450, y: 250, width: 90, height: 48, kind: 'table' },
        { x: 560, y: 250, width: 90, height: 48, kind: 'table' },
        { x: 450, y: 330, width: 90, height: 48, kind: 'table' },
        { x: 560, y: 330, width: 90, height: 48, kind: 'table' },
        { x: 110, y: 110, width: 140, height: 32, kind: 'counter', label: 'KITCHEN' },
        { x: 110, y: 170, width: 50, height: 50, kind: 'crate' },
        { x: 110, y: 290, width: 48, height: 48, kind: 'crate' },
      ],
    }
  ),
  planFloor(
    'bldg_noodle_plaza',
    1,
    'F2 · Ammo Shop',
    'ammo',
    n1.x,
    n1.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 0, y: 0, w: 150, h: 160 },
      { id: 'hall', name: 'Stock hall', kind: 'corridor', x: 134, y: 40, w: 300, h: 88 },
      { id: 'stock', name: 'Back stock', kind: 'vault', x: 418, y: 0, w: 240, h: 200 },
      { id: 'hallV', name: 'Shop hall', kind: 'corridor', x: 220, y: 112, w: 90, h: 240 },
      { id: 'shop', name: 'Shop floor', kind: 'hall', x: 80, y: 336, w: 360, h: 200 },
      { id: 'range', name: 'Test range', kind: 'vault', x: 424, y: 360, w: 200, h: 170 },
    ],
    [
      ['lift', 'hall'],
      ['hall', 'stock'],
      ['hall', 'hallV'],
      ['hallV', 'shop'],
      ['shop', 'range'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 110, y: 380, width: 160, height: 30, kind: 'counter', label: 'AMMO' },
        { x: 450, y: 40, width: 36, height: 90, kind: 'rack' },
        { x: 500, y: 40, width: 36, height: 90, kind: 'rack' },
        { x: 550, y: 40, width: 36, height: 90, kind: 'rack' },
        { x: 460, y: 400, width: 44, height: 44, kind: 'crate' },
      ],
    }
  ),
  planFloor(
    'bldg_noodle_plaza',
    2,
    'F3 · Capsules',
    'apartment',
    n2.x,
    n2.y,
    [
      { id: 'hall', name: 'Pod hall', kind: 'corridor', x: 280, y: 40, w: 100, h: 560 },
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 364, y: 40, w: 150, h: 160 },
      { id: 'p1', name: 'Pod 1', kind: 'sleep', x: 80, y: 80, w: 216, h: 140 },
      { id: 'p2', name: 'Pod 2', kind: 'sleep', x: 80, y: 240, w: 216, h: 140 },
      { id: 'p3', name: 'Pod 3', kind: 'sleep', x: 364, y: 220, w: 216, h: 140 },
      { id: 'p4', name: 'Pod 4', kind: 'sleep', x: 364, y: 380, w: 216, h: 140 },
      { id: 'lounge', name: 'Lounge', kind: 'hall', x: 200, y: 584, w: 260, h: 180 },
    ],
    [
      ['hall', 'lift'],
      ['hall', 'p1'],
      ['hall', 'p2'],
      ['hall', 'p3'],
      ['hall', 'p4'],
      ['hall', 'lounge'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 110, y: 110, width: 70, height: 36, kind: 'sofa' },
        { x: 110, y: 270, width: 70, height: 36, kind: 'sofa' },
        { x: 400, y: 250, width: 70, height: 36, kind: 'sofa' },
        { x: 400, y: 410, width: 70, height: 36, kind: 'sofa' },
        { x: 230, y: 620, width: 80, height: 40, kind: 'table' },
        { x: 330, y: 620, width: 70, height: 40, kind: 'sofa' },
      ],
    }
  ),
  planFloor(
    'bldg_noodle_plaza',
    3,
    'F4 · Garden',
    'garden',
    n3.x,
    n3.y,
    [
      { id: 'lift', name: 'Greenhouse', kind: 'hall', x: 0, y: 80, w: 150, h: 160 },
      { id: 'path', name: 'Garden path', kind: 'corridor', x: 134, y: 110, w: 300, h: 80 },
      { id: 'east', name: 'East terrace', kind: 'roof', x: 418, y: 40, w: 240, h: 220 },
      { id: 'sp', name: 'South path', kind: 'corridor', x: 200, y: 174, w: 80, h: 220 },
      { id: 'pond', name: 'Pond court', kind: 'roof', x: 80, y: 378, w: 280, h: 200 },
      { id: 'look', name: 'Lookout', kind: 'roof', x: 344, y: 400, w: 180, h: 160 },
    ],
    [
      ['lift', 'path'],
      ['path', 'east'],
      ['path', 'sp'],
      ['sp', 'pond'],
      ['pond', 'look'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 460, y: 90, width: 120, height: 70, kind: 'table' },
        { x: 130, y: 430, width: 90, height: 50, kind: 'table' },
      ],
    }
  ),

  planFloor(
    'bldg_hostingovaya',
    0,
    'F1 · Checkpoint',
    'checkpoint',
    h0.x,
    h0.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 40, y: 0, w: 160, h: 160 },
      { id: 'laneA', name: 'Scan lane A', kind: 'hall', x: 184, y: 20, w: 120, h: 476 },
      { id: 'laneB', name: 'Scan lane B', kind: 'lab', x: 400, y: 80, w: 120, h: 416 },
      { id: 'guard', name: 'Guard post', kind: 'office', x: 504, y: 80, w: 200, h: 180 },
      { id: 'net', name: 'Net closet', kind: 'server', x: 504, y: 276, w: 180, h: 170 },
      { id: 'lobby', name: 'Checkpoint', kind: 'hall', x: 200, y: 480, w: 320, h: 200 },
    ],
    [
      ['lift', 'laneA'],
      ['laneA', 'lobby'],
      ['laneB', 'lobby'],
      ['laneB', 'guard'],
      ['laneB', 'net'],
    ],
    {
      exitFrom: 'lobby',
      lift: 'lift',
      props: [
        { x: 210, y: 420, width: 80, height: 28, kind: 'counter', label: 'SCAN' },
        { x: 530, y: 110, width: 90, height: 40, kind: 'desk' },
        { x: 530, y: 170, width: 90, height: 40, kind: 'desk' },
        { x: 530, y: 310, width: 28, height: 70, kind: 'rack' },
        { x: 580, y: 310, width: 28, height: 70, kind: 'rack' },
      ],
    }
  ),
  planFloor(
    'bldg_hostingovaya',
    1,
    'F2 · Servers',
    'server',
    h1.x,
    h1.y,
    [
      { id: 'hall', name: 'Cold hall', kind: 'corridor', x: 280, y: 40, w: 100, h: 520 },
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 364, y: 40, w: 150, h: 160 },
      { id: 'a', name: 'Aisle A', kind: 'server', x: 40, y: 80, w: 256, h: 160 },
      { id: 'b', name: 'Aisle B', kind: 'server', x: 40, y: 280, w: 256, h: 160 },
      { id: 'c', name: 'Aisle C', kind: 'server', x: 364, y: 220, w: 256, h: 160 },
      { id: 'cold', name: 'Backup bay', kind: 'server', x: 364, y: 420, w: 256, h: 160 },
      { id: 'ops', name: 'Netops', kind: 'office', x: 180, y: 544, w: 280, h: 150 },
    ],
    [
      ['hall', 'lift'],
      ['hall', 'a'],
      ['hall', 'b'],
      ['hall', 'c'],
      ['hall', 'cold'],
      ['hall', 'ops'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 70, y: 110, width: 28, height: 70, kind: 'rack' },
        { x: 120, y: 110, width: 28, height: 70, kind: 'rack' },
        { x: 170, y: 110, width: 28, height: 70, kind: 'rack' },
        { x: 70, y: 310, width: 28, height: 70, kind: 'rack' },
        { x: 120, y: 310, width: 28, height: 70, kind: 'rack' },
        { x: 400, y: 250, width: 28, height: 70, kind: 'rack' },
        { x: 210, y: 580, width: 80, height: 40, kind: 'desk' },
      ],
    }
  ),
  planFloor(
    'bldg_hostingovaya',
    2,
    'F3 · GPU Lab',
    'gpu',
    h2.x,
    h2.y,
    [
      { id: 'hall', name: 'Lab hall', kind: 'corridor', x: 300, y: 40, w: 96, h: 480 },
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 380, y: 40, w: 150, h: 160 },
      { id: 'cluster', name: 'Cluster', kind: 'server', x: 40, y: 80, w: 276, h: 280 },
      { id: 'lab', name: 'Lab', kind: 'lab', x: 380, y: 220, w: 260, h: 200 },
      { id: 'dev', name: 'Dev pit', kind: 'office', x: 180, y: 504, w: 280, h: 160 },
    ],
    [
      ['hall', 'lift'],
      ['hall', 'cluster'],
      ['hall', 'lab'],
      ['hall', 'dev'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 70, y: 120, width: 30, height: 80, kind: 'rack' },
        { x: 130, y: 120, width: 30, height: 80, kind: 'rack' },
        { x: 190, y: 120, width: 30, height: 80, kind: 'rack' },
        { x: 420, y: 260, width: 80, height: 40, kind: 'desk' },
        { x: 520, y: 260, width: 80, height: 40, kind: 'desk' },
        { x: 220, y: 540, width: 80, height: 40, kind: 'desk' },
      ],
    }
  ),
  planFloor(
    'bldg_hostingovaya',
    3,
    'F4 · Quantum',
    'quantum',
    h3.x,
    h3.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 0, y: 80, w: 150, h: 160 },
      { id: 'ante', name: 'Antechamber', kind: 'lab', x: 134, y: 100, w: 200, h: 140 },
      { id: 'hall', name: 'Core hall', kind: 'corridor', x: 318, y: 120, w: 220, h: 90 },
      { id: 'core', name: 'Core', kind: 'lab', x: 280, y: 194, w: 300, h: 280 },
      { id: 'obs', name: 'Observation', kind: 'office', x: 522, y: 80, w: 180, h: 180 },
      { id: 'vault', name: 'Spare vault', kind: 'vault', x: 160, y: 458, w: 220, h: 160 },
    ],
    [
      ['lift', 'ante'],
      ['ante', 'hall'],
      ['hall', 'core'],
      ['hall', 'obs'],
      ['core', 'vault'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 550, y: 120, width: 80, height: 40, kind: 'desk' },
        { x: 190, y: 500, width: 50, height: 50, kind: 'crate' },
      ],
    }
  ),

  planFloor(
    'bldg_punk_warehouse',
    0,
    'F1 · Chop Shop',
    'chopshop',
    a0.x,
    a0.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 320, y: 20, w: 150, h: 196 },
      { id: 'hall', name: 'Shop hall', kind: 'corridor', x: 340, y: 200, w: 96, h: 316 },
      { id: 'bay1', name: 'Bay 1', kind: 'garage', x: 40, y: 80, w: 316, h: 240 },
      { id: 'bay2', name: 'Bay 2', kind: 'garage', x: 420, y: 220, w: 280, h: 220 },
      { id: 'parts', name: 'Parts', kind: 'vault', x: 684, y: 240, w: 170, h: 180 },
      { id: 'office', name: 'Foreman', kind: 'office', x: 80, y: 304, w: 200, h: 160 },
      { id: 'lobby', name: 'Bay door', kind: 'garage', x: 240, y: 500, w: 300, h: 190 },
    ],
    [
      ['lift', 'hall'],
      ['hall', 'lobby'],
      ['hall', 'bay1'],
      ['hall', 'bay2'],
      ['bay2', 'parts'],
      ['bay1', 'office'],
    ],
    {
      exitFrom: 'lobby',
      lift: 'lift',
      props: [
        { x: 70, y: 110, width: 80, height: 50, kind: 'crate' },
        { x: 180, y: 110, width: 100, height: 36, kind: 'counter' },
        { x: 460, y: 250, width: 70, height: 50, kind: 'crate' },
        { x: 560, y: 250, width: 70, height: 50, kind: 'crate' },
        { x: 710, y: 270, width: 50, height: 50, kind: 'crate' },
        { x: 110, y: 340, width: 80, height: 40, kind: 'desk' },
      ],
    }
  ),
  planFloor(
    'bldg_punk_warehouse',
    1,
    'F2 · Club',
    'club',
    a1.x,
    a1.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 200, y: 20, w: 150, h: 196 },
      { id: 'dance', name: 'Dancefloor', kind: 'club', x: 160, y: 200, w: 360, h: 296 },
      { id: 'bar', name: 'Bar', kind: 'club', x: 0, y: 220, w: 176, h: 200 },
      { id: 'vipH', name: 'VIP hall', kind: 'corridor', x: 504, y: 80, w: 90, h: 200 },
      { id: 'vip', name: 'VIP', kind: 'office', x: 578, y: 40, w: 200, h: 180 },
      { id: 'bath', name: 'Toilets', kind: 'office', x: 504, y: 280, w: 160, h: 140 },
      { id: 'entry', name: 'Coat check', kind: 'hall', x: 240, y: 480, w: 280, h: 180 },
    ],
    [
      ['lift', 'dance'],
      ['dance', 'bar'],
      ['dance', 'vipH'],
      ['vipH', 'vip'],
      ['dance', 'bath'],
      ['dance', 'entry'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 20, y: 250, width: 140, height: 30, kind: 'bar', label: 'BAR' },
        { x: 200, y: 280, width: 70, height: 44, kind: 'table' },
        { x: 300, y: 280, width: 70, height: 44, kind: 'table' },
        { x: 400, y: 320, width: 80, height: 44, kind: 'sofa' },
        { x: 610, y: 70, width: 80, height: 40, kind: 'sofa' },
      ],
    }
  ),
  planFloor(
    'bldg_punk_warehouse',
    2,
    'F3 · Stash',
    'stash',
    a2.x,
    a2.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 280, y: 0, w: 150, h: 160 },
      { id: 'hall', name: 'Cage hall', kind: 'corridor', x: 300, y: 144, w: 90, h: 360 },
      { id: 'cageA', name: 'Cage A', kind: 'vault', x: 40, y: 180, w: 276, h: 180 },
      { id: 'cageB', name: 'Cage B', kind: 'vault', x: 40, y: 380, w: 276, h: 180 },
      { id: 'count', name: 'Count room', kind: 'office', x: 374, y: 200, w: 240, h: 170 },
      { id: 'look', name: 'Lookout', kind: 'office', x: 374, y: 390, w: 200, h: 160 },
    ],
    [
      ['lift', 'hall'],
      ['hall', 'cageA'],
      ['hall', 'cageB'],
      ['hall', 'count'],
      ['hall', 'look'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 70, y: 210, width: 48, height: 48, kind: 'crate' },
        { x: 130, y: 210, width: 48, height: 48, kind: 'crate' },
        { x: 70, y: 410, width: 48, height: 48, kind: 'crate' },
        { x: 410, y: 230, width: 80, height: 40, kind: 'desk' },
      ],
    }
  ),
  planFloor(
    'bldg_punk_warehouse',
    3,
    'F4 · Roof',
    'warehouse_roof',
    a3.x,
    a3.y,
    [
      { id: 'lift', name: 'Stair house', kind: 'hall', x: 40, y: 80, w: 150, h: 160 },
      { id: 'walk', name: 'Catwalk', kind: 'corridor', x: 174, y: 110, w: 320, h: 80 },
      { id: 'bill', name: 'Billboard', kind: 'roof', x: 478, y: 40, w: 220, h: 200 },
      { id: 'walkS', name: 'South walk', kind: 'corridor', x: 240, y: 174, w: 80, h: 200 },
      { id: 'nest', name: 'Nest', kind: 'roof', x: 80, y: 358, w: 240, h: 180 },
    ],
    [
      ['lift', 'walk'],
      ['walk', 'bill'],
      ['walk', 'walkS'],
      ['walkS', 'nest'],
    ],
    {
      lift: 'lift',
      props: [{ x: 520, y: 80, width: 70, height: 40, kind: 'crate' }],
    }
  ),

  planFloor(
    'bldg_anarchy_tower',
    0,
    'F1 · Garage',
    'chopshop',
    b0.x,
    b0.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 260, y: 20, w: 150, h: 220 },
      { id: 'office', name: 'Booth', kind: 'office', x: 224, y: 224, w: 240, h: 192 },
      { id: 'south', name: 'Pit hall', kind: 'corridor', x: 80, y: 400, w: 520, h: 96 },
      { id: 'bayL', name: 'West pit', kind: 'garage', x: 40, y: 80, w: 200, h: 336 },
      { id: 'bayR', name: 'East pit', kind: 'garage', x: 480, y: 80, w: 200, h: 336 },
      { id: 'lobby', name: 'Pit door', kind: 'garage', x: 220, y: 480, w: 280, h: 190 },
    ],
    [
      ['lift', 'office'],
      ['office', 'south'],
      ['south', 'lobby'],
      ['south', 'bayL'],
      ['south', 'bayR'],
    ],
    {
      exitFrom: 'lobby',
      lift: 'lift',
      props: [
        { x: 70, y: 120, width: 90, height: 50, kind: 'crate' },
        { x: 510, y: 120, width: 90, height: 50, kind: 'crate' },
        { x: 250, y: 260, width: 90, height: 36, kind: 'counter' },
      ],
    }
  ),
  planFloor(
    'bldg_anarchy_tower',
    1,
    'F2 · Lounge',
    'club',
    b1.x,
    b1.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 0, y: 40, w: 150, h: 160 },
      { id: 'hall', name: 'Lounge hall', kind: 'corridor', x: 134, y: 70, w: 400, h: 88 },
      { id: 'stage', name: 'Stage', kind: 'club', x: 518, y: 40, w: 220, h: 200 },
      { id: 'hallV', name: 'Bar hall', kind: 'corridor', x: 280, y: 142, w: 90, h: 240 },
      { id: 'bar', name: 'Bar', kind: 'club', x: 40, y: 200, w: 256, h: 180 },
      { id: 'booths', name: 'Booths', kind: 'office', x: 354, y: 280, w: 240, h: 180 },
      { id: 'back', name: 'Back room', kind: 'vault', x: 200, y: 366, w: 260, h: 160 },
    ],
    [
      ['lift', 'hall'],
      ['hall', 'stage'],
      ['hall', 'hallV'],
      ['hallV', 'bar'],
      ['hallV', 'booths'],
      ['hallV', 'back'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 60, y: 230, width: 150, height: 28, kind: 'bar' },
        { x: 70, y: 290, width: 80, height: 44, kind: 'sofa' },
        { x: 380, y: 320, width: 70, height: 44, kind: 'table' },
        { x: 480, y: 320, width: 70, height: 44, kind: 'sofa' },
      ],
    }
  ),
  planFloor(
    'bldg_anarchy_tower',
    2,
    'F3 · Vault',
    'stash',
    b2.x,
    b2.y,
    [
      { id: 'lift', name: 'Lift lobby', kind: 'hall', x: 240, y: 0, w: 150, h: 160 },
      { id: 'hall', name: 'Vault hall', kind: 'corridor', x: 260, y: 144, w: 90, h: 200 },
      { id: 'ante', name: 'Ante', kind: 'office', x: 40, y: 160, w: 236, h: 170 },
      { id: 'hallE', name: 'East hall', kind: 'corridor', x: 334, y: 200, w: 200, h: 80 },
      { id: 'safe', name: 'Safe', kind: 'vault', x: 518, y: 160, w: 200, h: 200 },
      { id: 'hallS', name: 'South hall', kind: 'corridor', x: 260, y: 328, w: 90, h: 180 },
      { id: 'inner', name: 'Inner vault', kind: 'vault', x: 40, y: 380, w: 236, h: 180 },
      { id: 'count', name: 'Count', kind: 'office', x: 334, y: 400, w: 220, h: 160 },
    ],
    [
      ['lift', 'hall'],
      ['hall', 'ante'],
      ['hall', 'hallE'],
      ['hallE', 'safe'],
      ['hall', 'hallS'],
      ['hallS', 'inner'],
      ['hallS', 'count'],
    ],
    {
      lift: 'lift',
      props: [
        { x: 70, y: 190, width: 50, height: 50, kind: 'crate' },
        { x: 550, y: 200, width: 50, height: 50, kind: 'crate' },
        { x: 70, y: 420, width: 50, height: 50, kind: 'crate' },
        { x: 370, y: 430, width: 80, height: 40, kind: 'desk' },
      ],
    }
  ),
  planFloor(
    'bldg_anarchy_tower',
    3,
    'F4 · Roof',
    'warehouse_roof',
    b3.x,
    b3.y,
    [
      { id: 'lift', name: 'Stair house', kind: 'hall', x: 80, y: 40, w: 150, h: 160 },
      { id: 'walk', name: 'Bridge', kind: 'corridor', x: 214, y: 80, w: 280, h: 72 },
      { id: 'padE', name: 'East pad', kind: 'roof', x: 478, y: 40, w: 220, h: 200 },
      { id: 'walkS', name: 'Drop walk', kind: 'corridor', x: 100, y: 184, w: 80, h: 180 },
      { id: 'padS', name: 'South pad', kind: 'roof', x: 40, y: 348, w: 240, h: 180 },
    ],
    [
      ['lift', 'walk'],
      ['walk', 'padE'],
      ['lift', 'walkS'],
      ['walkS', 'padS'],
    ],
    { lift: 'lift', props: [] }
  ),
];

export function getInterior(buildingId: string, floor: number): InteriorFloor | undefined {
  return INTERIORS.find((f) => f.buildingId === buildingId && f.index === floor);
}

export function getInteriorRoom(buildingId: string, floor: number, roomName: string): InteriorRoom | undefined {
  return getInterior(buildingId, floor)?.rooms.find((r) => r.name === roomName);
}

export function getInteriorAt(x: number, y: number): InteriorFloor | undefined {
  return INTERIORS.find((f) => pointInRect(x, y, f.x, f.y, f.width, f.height));
}

export function isInteriorWorld(x: number): boolean {
  return x >= INTERIOR_WORLD_MIN_X;
}

function pushAabb(nx: number, ny: number, minX: number, maxX: number, minY: number, maxY: number) {
  if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) {
    const distLeft = nx - minX;
    const distRight = maxX - nx;
    const distTop = ny - minY;
    const distBottom = maxY - ny;
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
    if (minDist === distLeft) return { x: minX, y: ny };
    if (minDist === distRight) return { x: maxX, y: ny };
    if (minDist === distTop) return { x: nx, y: minY };
    return { x: nx, y: maxY };
  }
  return { x: nx, y: ny };
}

function pushRect(nx: number, ny: number, r: Rect, radius: number) {
  return pushAabb(nx, ny, r.x - radius, r.x + r.width + radius, r.y - radius, r.y + r.height + radius);
}

function roomInset(r: InteriorRoom) {
  return Math.min(12, Math.max(4, Math.min(r.width, r.height) / 2 - 20));
}

export function clampToInteriorWalkable(
  x: number,
  y: number,
  fl: InteriorFloor,
  _radius: number
): { x: number; y: number } {
  const inside = fl.rooms.some((r) => {
    const inset = roomInset(r);
    return pointInRect(x, y, r.x + inset, r.y + inset, r.width - inset * 2, r.height - inset * 2);
  });
  if (inside) return { x, y };
  let bestX = x;
  let bestY = y;
  let bestD = Infinity;
  for (const r of fl.rooms) {
    const inset = roomInset(r);
    const cx = Math.max(r.x + inset, Math.min(r.x + r.width - inset, x));
    const cy = Math.max(r.y + inset, Math.min(r.y + r.height - inset, y));
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestX = cx;
      bestY = cy;
    }
  }
  return { x: bestX, y: bestY };
}

export function resolveBuildingCollisions(
  x: number,
  y: number,
  _elev: number,
  _jump: number,
  radius: number,
  occupancy: Occupancy
): { x: number; y: number } {
  let nx = x;
  let ny = y;

  if (occupancy.buildingId) {
    const fl = getInterior(occupancy.buildingId, occupancy.floor);
    if (!fl) return { x: nx, y: ny };
    for (const w of fl.walls) {
      const p = pushRect(nx, ny, w, radius);
      nx = p.x;
      ny = p.y;
    }
    for (const prop of fl.props) {
      const p = pushRect(nx, ny, prop, radius - 4);
      nx = p.x;
      ny = p.y;
    }
    return { x: nx, y: ny };
  }

  for (const b of BUILDINGS) {
    const near = pointInRect(nx, ny, b.x - radius - 8, b.y - radius - 8, b.width + radius * 2 + 16, b.height + radius * 2 + 16);
    if (!near) continue;
    if (pointInR(nx, ny, b.door)) continue;
    const p = pushAabb(nx, ny, b.x - radius, b.x + b.width + radius, b.y - radius, b.y + b.height + radius);
    nx = p.x;
    ny = p.y;
  }
  return { x: nx, y: ny };
}

export function getInteriorElevation(occ?: Occupancy, _x?: number, _y?: number): number | null {
  if (occ?.buildingId) return 0;
  return null;
}

export function isInElevator(x: number, y: number, occupancy: Occupancy): boolean {
  if (!occupancy.buildingId) return false;
  const fl = getInterior(occupancy.buildingId, occupancy.floor);
  return !!(fl && pointInR(x, y, fl.elevator));
}

export function getElevatorIntent(moveY: number): 'up' | 'down' | null {
  if (moveY < -0.35) return 'up';
  if (moveY > 0.35) return 'down';
  return null;
}

export function playerBehindBuilding(px: number, py: number, b: Building): boolean {
  const towerTop = b.y - 28 * 16;
  return px > b.x - 10 && px < b.x + b.width + 10 && py < b.y + b.height && py > towerTop;
}

const WORKER_BARKS = ['дедлайн...', 'кофе??', 'слак', 'ещё правки', 'созвон в 5', 'ок ок', 'на обед'];

function worker(
  id: string,
  name: string,
  x: number,
  y: number,
  room: { x: number; y: number; width: number; height: number },
  hair: string,
  coat: string
): InteriorWorker {
  return {
    id,
    name,
    x,
    y,
    facing: 'right',
    state: Math.random() > 0.5 ? 'walk' : 'idle',
    sitTimer: 1 + Math.random() * 4,
    tx: x,
    ty: y,
    minX: room.x + 24,
    minY: room.y + 24,
    maxX: room.x + room.width - 24,
    maxY: room.y + room.height - 24,
    hairColor: hair,
    coatColor: coat,
    bark: WORKER_BARKS[Math.floor(Math.random() * WORKER_BARKS.length)],
  };
}

function seedWorkers(): InteriorWorker[] {
  const list: InteriorWorker[] = [];
  const add = (fl: InteriorFloor, n: number, names: string[], colors: [string, string][]) => {
    const usable = fl.rooms.filter((r) => r.kind !== 'corridor');
    const pool = usable.length ? usable : fl.rooms;
    for (let i = 0; i < n; i++) {
      const room = pool[i % pool.length];
      const [hair, coat] = colors[i % colors.length];
      list.push(
        worker(
          `${fl.buildingId}_${fl.index}_w${i}`,
          names[i % names.length],
          room.x + 40 + (i * 37) % Math.max(40, room.width - 80),
          room.y + 40 + (i * 29) % Math.max(40, room.height - 80),
          room,
          hair,
          coat
        )
      );
    }
  };
  add(INTERIORS[0], 3, ['Mira', 'Ken', 'Sgt. Park'], [['#1F2937', '#1E3A5F'], ['#78350F', '#1E293B'], ['#111827', '#334155']]);
  add(INTERIORS[2], 6, ['Olga', 'Dan', 'Pavel', 'Nia', 'Chris', 'Yuna'], [['#F59E0B', '#1E3A5F'], ['#0F172A', '#334155'], ['#7C2D12', '#1E293B'], ['#831843', '#312E81'], ['#365314', '#1E293B'], ['#1E3A8A', '#0F172A']]);
  add(INTERIORS[4], 4, ['Chef Bo', 'Lin', 'Yuri', 'Mei'], [['#0F172A', '#7C2D12'], ['#1F2937', '#F97316'], ['#431407', '#44403C'], ['#111827', '#B45309']]);
  add(INTERIORS[6], 3, ['Guest A', 'Guest B', 'Night clerk'], [['#4C1D95', '#1E1B4B'], ['#701A75', '#3B0764'], ['#0F172A', '#44403C']]);
  add(INTERIORS[8], 3, ['Guard', 'Oleg', 'Scanner'], [['#1E293B', '#0EA5E9'], ['#111827', '#0369A1'], ['#0F172A', '#155E75']]);
  add(INTERIORS[9], 2, ['Sysadmin', 'Netops'], [['#082F49', '#22D3EE'], ['#164E63', '#0E7490']]);
  add(INTERIORS[10], 3, ['ML intern', 'Dev', 'SRE'], [['#042F2E', '#2DD4BF'], ['#0F172A', '#22D3EE'], ['#1E293B', '#38BDF8']]);
  add(INTERIORS[12], 2, ['Mechanic', 'Junk'], [['#1C1917', '#EA580C'], ['#27272A', '#EF4444']]);
  add(INTERIORS[13], 4, ['DJ', 'Bouncer', 'VIP', 'Dancer'], [['#4A044E', '#F472B6'], ['#18181B', '#EF4444'], ['#701A75', '#E879F9'], ['#0F172A', '#FB7185']]);
  add(INTERIORS[17], 3, ['Bartender', 'Regular', 'Punk'], [['#7F1D1D', '#F87171'], ['#18181B', '#FB923C'], ['#27272A', '#EF4444']]);
  return list;
}

export const INTERIOR_WORKERS: InteriorWorker[] = seedWorkers();

export function updateInteriorWorkers(dt: number) {
  for (const w of INTERIOR_WORKERS) {
    w.sitTimer -= dt;
    if (w.state === 'sit' || w.state === 'idle') {
      if (w.sitTimer <= 0) {
        w.state = 'walk';
        w.tx = w.minX + Math.random() * (w.maxX - w.minX);
        w.ty = w.minY + Math.random() * (w.maxY - w.minY);
        w.sitTimer = 2 + Math.random() * 4;
      }
      continue;
    }
    const dx = w.tx - w.x;
    const dy = w.ty - w.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < 8) {
      w.state = Math.random() > 0.45 ? 'sit' : 'idle';
      w.sitTimer = 2 + Math.random() * 5;
      if (Math.random() < 0.4) w.bark = WORKER_BARKS[Math.floor(Math.random() * WORKER_BARKS.length)];
    } else {
      const spd = 42;
      w.x += (dx / dist) * spd * dt;
      w.y += (dy / dist) * spd * dt;
      w.facing = dx < 0 ? 'left' : 'right';
    }
  }
}

export function occupancyMatchesObject(
  occupancy: Occupancy,
  obj: { x: number; y: number; elevationZ?: number; buildingId?: string; floorIndex?: number; rackLevel?: number }
): boolean {
  if (obj.buildingId) {
    if (!occupancy.buildingId) return false;
    const fl = obj.floorIndex ?? (obj.rackLevel !== undefined ? obj.rackLevel - 1 : 0);
    return occupancy.buildingId === obj.buildingId && occupancy.floor === fl;
  }
  if (occupancy.buildingId) return false;
  return !isInteriorWorld(obj.x);
}
