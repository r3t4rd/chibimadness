import { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Player,
  Monster,
  DropItem,
  ResourceNode,
  NPC,
  Projectile,
  DamagePopup,
  VisualParticle,
  QuestProgress,
  Item,
  CraftRecipe,
  GroundDecal,
  InteractiveObject,
  GunType,
  WeaponAttachment,
  AttachmentSlot,
  SummonedAlly,
  IntroCinematicPhase,
  IntroCinematicState,
  Platform,
  WorldPOI,
  CarEntity,
  SkateTrickId,
} from '../types/game';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ITEMS_DATABASE,
  INITIAL_MONSTERS,
  INITIAL_RESOURCE_NODES,
  NPCS_DATABASE,
  QUESTS_DATABASE,
  CRAFT_RECIPES,
  OBSTACLES,
  INITIAL_INTERACTIVE_OBJECTS,
  PLATFORMS,
  WORLD_POIS,
  NPC_INTERACT_RANGE,
  DAY_CYCLE_SECONDS,
  CLASS_HOTBAR,
  AUTO_FIRE_GUNS,
  AMMO_GUNS,
  ZONES,
} from './constants';
import { sound } from './audioEngine';
import { net } from './multiplayerClient';
import { screenToWorld } from './worldRenderer';
import {
  BUILDINGS,
  Occupancy,
  getBuilding,
  getElevatorIntent,
  getInterior,
  getInteriorElevation,
  clampToInteriorWalkable,
  isInElevator,
  occupancyMatchesObject,
  pointInR,
  resolveBuildingCollisions,
  updateInteriorWorkers,
} from './buildings';
import {
  HORDE_ARENA,
  HORDE_BOSSES,
  HORDE_BOSS_INTERVAL,
  HORDE_EXTRACT_AFTER,
  HORDE_FADE_SECONDS,
  HORDE_FEATURES,
  HORDE_GEM_MAGNET,
  HORDE_ROSTER,
  HORDE_UNLOCK_INTERVAL,
  HORDE_ZONE_ID,
  clampToHordeArena,
  clearHordeFx,
  createEmptyHordeRun,
  createHordeMob,
  formatHordeTime,
  hordeExtractBonus,
  hordeLivingCap,
  hordeSpawnRate,
  isHitByHazard,
  isInHordeArena,
  makeBeamHazard,
  makeCrossHazard,
  makeMeteorHazard,
  makeRingHazard,
  makeVoidBurstHazard,
  pickAmbientHazard,
  pickHordeArchetype,
  publishHordeFx,
  pushOutOfHordeFeatures,
  rollHordeSpawnPoint,
  spawnHordeIntro,
  spawnHordeTypeBurst,
  type HordeEndReason,
  type HordeHazard,
  type HordeRunState,
} from './hordeMode';

// WEAPONS MAGAZINE & FIRE RATE CONFIGURATIONS
export const WEAPON_CONFIGS: Record<GunType, { maxAmmo: number; reloadTime: number; fireRate: number; recoil: number; shake: number }> = {
  pistol: { maxAmmo: 12, reloadTime: 0.85, fireRate: 0.16, recoil: 4, shake: 2 },
  revolver: { maxAmmo: 6, reloadTime: 1.25, fireRate: 0.32, recoil: 8, shake: 5 },
  mac10: { maxAmmo: 45, reloadTime: 1.05, fireRate: 0.028, recoil: 1.4, shake: 1.4 },
  ak47: { maxAmmo: 30, reloadTime: 1.3, fireRate: 0.09, recoil: 5, shake: 3.5 },
  shotgun: { maxAmmo: 8, reloadTime: 1.5, fireRate: 0.42, recoil: 10, shake: 6 },
  cheytac: { maxAmmo: 5, reloadTime: 1.8, fireRate: 0.65, recoil: 14, shake: 8 },
  katana: { maxAmmo: 1, reloadTime: 0.2, fireRate: 0.26, recoil: 2, shake: 3 },
  sledgehammer: { maxAmmo: 1, reloadTime: 0.6, fireRate: 0.45, recoil: 6, shake: 7 },
  throwing_knives: { maxAmmo: 10, reloadTime: 0.85, fireRate: 0.16, recoil: 2, shake: 2 },
  scythe: { maxAmmo: 1, reloadTime: 0.2, fireRate: 0.48, recoil: 5, shake: 5 },
  greatsword: { maxAmmo: 1, reloadTime: 0.2, fireRate: 0.68, recoil: 8, shake: 8 },
  staff: { maxAmmo: 1, reloadTime: 0.2, fireRate: 0.36, recoil: 3, shake: 3 },
  wand: { maxAmmo: 1, reloadTime: 0.2, fireRate: 0.04, recoil: 1, shake: 1 },
  grimoire: { maxAmmo: 1, reloadTime: 0.2, fireRate: 0.85, recoil: 6, shake: 7 },
  totem: { maxAmmo: 1, reloadTime: 0.2, fireRate: 0.55, recoil: 4, shake: 4 },
};

// Calculate ground / platform elevation at position (x, y)
export function getGroundElevation(x: number, y: number, occupancy?: Occupancy): number {
  let highestElevation = 0;

  for (const plat of PLATFORMS) {
    if (x >= plat.x && x <= plat.x + plat.width && y >= plat.y && y <= plat.y + plat.height) {
      if (plat.type === 'ramp' && plat.rampElevationStart !== undefined && plat.rampElevationEnd !== undefined) {
        let t = 0;
        if (plat.rampDirection === 'up_x') {
          t = Math.max(0, Math.min(1, (x - plat.x) / plat.width));
        } else if (plat.rampDirection === 'down_x') {
          t = Math.max(0, Math.min(1, 1 - (x - plat.x) / plat.width));
        } else if (plat.rampDirection === 'up_y') {
          t = Math.max(0, Math.min(1, 1 - (y - plat.y) / plat.height));
        } else if (plat.rampDirection === 'down_y') {
          t = Math.max(0, Math.min(1, (y - plat.y) / plat.height));
        }
        const rampElev = plat.rampElevationStart + (plat.rampElevationEnd - plat.rampElevationStart) * t;
        if (rampElev > highestElevation) {
          highestElevation = rampElev;
        }
      } else {
        if (plat.elevationZ > highestElevation) {
          highestElevation = plat.elevationZ;
        }
      }
    }
  }

  if (occupancy) {
    const interiorZ = getInteriorElevation(occupancy, x, y);
    if (interiorZ !== null && interiorZ > highestElevation) {
      highestElevation = interiorZ;
    }
  }

  return highestElevation;
}

// Helper function to resolve collisions against solid obstacles (tents, cliffs, boulders)
// Supports jumping over vaultable obstacles (jumpZ > obstacleHeight)
function resolveObstacleCollisions(
  x: number,
  y: number,
  playerElevation: number = 0,
  playerJumpZ: number = 0,
  radius: number = 18,
  resourceNodes?: ResourceNode[]
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  const totalPlayerHeight = playerElevation + playerJumpZ;

  for (const obs of OBSTACLES) {
    const obsElevation = obs.elevationZ || 0;
    const obsPhysicalHeight = obs.obstacleHeight || (obs.type === 'cliff' ? 140 : 40);
    const obsTop = obsElevation + obsPhysicalHeight;

    // If player is vaulting / jumping above obstacle top, skip collision!
    if (obs.canVault && totalPlayerHeight >= obsTop) {
      continue;
    }

    // If player is already on an elevated plateau ABOVE the obstacle, skip ground collision
    if (playerElevation >= obsTop && obs.type === 'cliff') {
      continue;
    }

    if (obs.shape === 'circle' && obs.radius) {
      const dx = nx - obs.x;
      const dy = ny - obs.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = obs.radius + radius;
      if (dist < minDist && dist > 0) {
        nx = obs.x + (dx / dist) * minDist;
        ny = obs.y + (dy / dist) * minDist;
      }
    } else {
      // Rectangle AABB collision with sliding
      const minX = obs.x - radius;
      const maxX = obs.x + obs.width + radius;
      const minY = obs.y - radius;
      const maxY = obs.y + obs.height + radius;

      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) {
        // Find closest edge to push out
        const distLeft = nx - minX;
        const distRight = maxX - nx;
        const distTop = ny - minY;
        const distBottom = maxY - ny;
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

        if (minDist === distLeft) nx = minX;
        else if (minDist === distRight) nx = maxX;
        else if (minDist === distTop) ny = minY;
        else ny = maxY;
      }
    }
  }

  // Resolve collision against tree trunks
  if (resourceNodes) {
    for (const node of resourceNodes) {
      if (node.type === 'tree' && node.hp > 0) {
        const trunkRadius = 12;
        // The trunk base is visually offset downwards (near the bottom shadow of the tree)
        const trunkX = node.x;
        const trunkY = node.y + 16;
        const dx = nx - trunkX;
        const dy = ny - trunkY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = trunkRadius + radius;
        if (dist < minDist && dist > 0) {
          nx = trunkX + (dx / dist) * minDist;
          ny = trunkY + (dy / dist) * minDist;
        }
      }
    }
  }

  return { x: nx, y: ny };
}

const FRONTLINE_X = 2550;
const FRONTLINE_Y = 3650;
const FACTION_ENGAGE_RANGE = 1000;
const HIJACK_RANGE = 100;
const CAR_SPAWN_INTERVAL = 20;

function isDrivingHijackCar(player: Player): boolean {
  return !!player.isRiding && (player.activeVehicleId === 'police_car' || player.activeVehicleId === 'punk_car');
}

const SKATE_TRICKS: Record<SkateTrickId, { duration: number; points: number; label: string; color: string }> = {
  mount_kickflip: { duration: 0.58, points: 160, label: 'KICKFLIP MOUNT!', color: '#F472B6' },
  kickflip: { duration: 0.5, points: 120, label: 'KICKFLIP!', color: '#38BDF8' },
  ollie: { duration: 0.4, points: 80, label: 'OLLIE!', color: '#FDE047' },
  treflip: { duration: 0.68, points: 340, label: 'TRE FLIP!', color: '#C084FC' },
};

function isSkateVehicleId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.includes('skateboard') || id.includes('hoverboard');
}

function equippedSkate(player: Player): Item | null {
  const v = player.equipment?.vehicle;
  if (!v) return null;
  if (v.vehicleType === 'skateboard' || v.vehicleType === 'hoverboard' || isSkateVehicleId(v.id)) return v;
  return null;
}

function isSkating(player: Player): boolean {
  return !!player.isRiding && isSkateVehicleId(player.activeVehicleId);
}

function applySkateTrick(player: Player, trick: SkateTrickId): { player: Player; points: number; label: string; color: string } {
  const def = SKATE_TRICKS[trick];
  const streak = (player.coolStreakTimer ?? 0) > 0 ? (player.coolStreak ?? 0) + 1 : 1;
  const points = Math.round(def.points * (1 + (streak - 1) * 0.35));
  const label = streak >= 2 ? `${def.label} x${streak}` : def.label;
  return {
    points,
    label,
    color: def.color,
    player: {
      ...player,
      skateTrick: trick,
      skateTrickTimer: def.duration,
      skateTrickDuration: def.duration,
      coolness: (player.coolness ?? 0) + points,
      coolStreak: streak,
      coolStreakTimer: 2.8,
      gold: player.gold + Math.max(1, Math.floor(points / 28)),
      airTricksThisJump: (player.airTricksThisJump ?? 0) + 1,
    },
  };
}

function relocateFactionEdgeSpawns(mons: Monster[]): Monster[] {
  return mons.map((m) => {
    if ((m.faction !== 'police' && m.faction !== 'punk_demon') || m.y <= 3000) return m;
    const y = 3180 + Math.random() * 1020;
    if (m.faction === 'police') {
      const x = 50 + Math.random() * 110;
      return { ...m, x, y, spawnX: x, spawnY: y };
    }
    const x = WORLD_WIDTH - 160 + Math.random() * 90;
    return { ...m, x, y, spawnX: x, spawnY: y };
  });
}

function rollFactionEdgeSpawn(isCop: boolean): { x: number; y: number } {
  const y = 3180 + Math.random() * 1020;
  if (isCop) return { x: 50 + Math.random() * 110, y };
  return { x: WORLD_WIDTH - 160 + Math.random() * 90, y };
}

function createCarReinforcement(car: CarEntity, index: number): Monster {
  const isCop = car.type === 'police_car';
  const template = INITIAL_MONSTERS.find(
    (m) => m.faction === (isCop ? 'police' : 'punk_demon') && !m.isBoss && !m.isJuggernaut
  ) || INITIAL_MONSTERS.find((m) => m.faction === (isCop ? 'police' : 'punk_demon'))!;
  const clone = JSON.parse(JSON.stringify(template)) as Monster;
  const edge = rollFactionEdgeSpawn(isCop);
  clone.id = `${isCop ? 'cop' : 'punk'}_car_${Date.now()}_${index}_${Math.floor(Math.random() * 9999)}`;
  clone.x = car.x + 30 + (index - 1.5) * 18;
  clone.y = car.y + 28 + (Math.random() - 0.5) * 36;
  clone.spawnX = edge.x;
  clone.spawnY = edge.y;
  clone.hp = clone.maxHp;
  clone.state = 'idle';
  clone.retaliatePlayer = false;
  clone.damagedByPlayer = false;
  clone.targetPlayerId = null;
  clone.isRespawning = false;
  clone.deathProgress = 0;
  return clone;
}

function makeFactionCar(type: 'police_car' | 'punk_car'): CarEntity {
  const isCop = type === 'police_car';
  const y = 3380 + Math.random() * 700;
  const x = isCop ? 40 : WORLD_WIDTH - 150;
  return {
    id: `car_${type}_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    targetX: FRONTLINE_X + (isCop ? -80 : 80) + (Math.random() - 0.5) * 60,
    targetY: FRONTLINE_Y + (Math.random() - 0.5) * 180,
    speed: 220,
    maxSpeed: 280,
    angle: 0,
    state: 'driving',
    passengerCount: 4,
    hasUnloaded: false,
    hp: 400,
    maxHp: 400,
    width: isCop ? 100 : 110,
    height: isCop ? 48 : 50,
    facing: isCop ? 'right' : 'left',
    runOverHitIds: [],
  };
}

function generateForestNodes(): ResourceNode[] {
  const nodes: ResourceNode[] = [
    // Include the non-tree initial nodes
    ...INITIAL_RESOURCE_NODES.filter(n => n.type !== 'tree')
  ];

  const randRange = (min: number, max: number) => min + Math.random() * (max - min);

  let treeIdCounter = 1;
  const attempts = 1500; // Try placing trees
  const targetTrees = 220; // Target number of trees
  let treeCount = 0;

  for (let i = 0; i < attempts && treeCount < targetTrees; i++) {
    const x = randRange(80, 2550);
    const y = randRange(80, 3050);

    // 1. Campsite clearing check:
    // Campsite is centered at (680, 650) with ellipse radius 480x340.
    // Let's keep a margin of at least 420x300 from camp center so trees don't spawn in the middle of camp.
    const campDx = x - 680;
    const campDy = y - 650;
    const campEllipse = (campDx * campDx) / (500 * 500) + (campDy * campDy) / (350 * 350);
    if (campEllipse < 1.0) {
      continue; // Inside camp clearing
    }

    // 2. River check:
    const getRiverY = (rx: number) => {
      if (rx < 950) {
        const t = rx / 950;
        return (1 - t) * (1 - t) * 1950 + 2 * (1 - t) * t * 2050 + t * t * 2150;
      } else if (rx < 1900) {
        const t = (rx - 950) / 950;
        return (1 - t) * (1 - t) * 2150 + 2 * (1 - t) * t * 2250 + t * t * 2600;
      } else {
        const t = (rx - 1900) / 700;
        return (1 - t) * (1 - t) * 2600 + 2 * (1 - t) * t * 2850 + t * t * 3100;
      }
    };
    const riverY = getRiverY(x);
    if (Math.abs(y - riverY) < 95) {
      continue; // Inside river or too close to bank
    }

    // 3. Main paths check:
    // Path East to canyon: (1100, 700) to (2400, 800)
    if (x > 1100 && x < 2400) {
      const pathY = 700 + (x - 1100) * 0.077;
      if (Math.abs(y - pathY) < 55) {
        continue;
      }
    }

    // 4. Campsite tents and obstacles check:
    let overlapsObstacle = false;
    for (const obs of OBSTACLES) {
      if (obs.x !== undefined && obs.y !== undefined) {
        const obsW = obs.width || (obs.radius ? obs.radius * 2 : 40);
        const obsH = obs.height || (obs.radius ? obs.radius * 2 : 40);
        if (x >= obs.x - 30 && x <= obs.x + obsW + 30 &&
            y >= obs.y - 30 && y <= obs.y + obsH + 30) {
          overlapsObstacle = true;
          break;
        }
      }
    }
    if (overlapsObstacle) continue;

    // 5. Distance check to other generated trees to prevent tight clustering
    let tooClose = false;
    for (const node of nodes) {
      if (node.type === 'tree') {
        const dist = Math.hypot(x - node.x, y - node.y);
        if (dist < 42) {
          tooClose = true;
          break;
        }
      }
    }
    if (tooClose) continue;

    // Determine tree type and characteristics
    let treeType: 'pine' | 'birch' | 'oak' | 'autumn' = 'pine';
    
    // Check if in birch region:
    // Region 1: East of camp (x: 1300..2000, y: 600..1500)
    // Region 2: West of camp / transition area (x: 150..750, y: 1200..1650)
    const inBirchRegion1 = (x >= 1300 && x <= 2000 && y >= 600 && y <= 1500);
    const inBirchRegion2 = (x >= 150 && x <= 750 && y >= 1200 && y <= 1650);
    
    if (inBirchRegion1 || inBirchRegion2) {
      const roll = Math.random();
      if (roll < 0.8) {
        treeType = 'birch';
      } else if (roll < 0.9) {
        treeType = 'oak';
      } else {
        treeType = 'pine';
      }
    } else {
      const roll = Math.random();
      if (roll < 0.6) {
        treeType = 'pine';
      } else if (roll < 0.78) {
        treeType = 'oak';
      } else if (roll < 0.93) {
        treeType = 'autumn';
      } else {
        treeType = 'birch';
      }
    }

    const scale = randRange(0.85, 1.25);
    const hp = Math.round(30 * scale);

    let name = 'Dense Pine Tree';
    if (treeType === 'birch') name = 'Silver Birch Tree';
    else if (treeType === 'oak') name = 'Ancient Oak Tree';
    else if (treeType === 'autumn') name = 'Golden Autumn Maple';

    nodes.push({
      id: `node_tree_gen_${treeIdCounter++}`,
      type: 'tree',
      name,
      x,
      y,
      hp,
      maxHp: hp,
      dropItemId: 'mat_wood',
      treeType,
      scale,
    });

    treeCount++;
  }

  return nodes;
}

export function useGameEngine(initialPlayer: Player) {
  const [player, setPlayer] = useState<Player>(() => ({
    ...initialPlayer,
    elevationZ: 0,
    interiorBuildingId: null,
    interiorFloor: 0,
    jumpZ: 0,
    jumpVz: 0,
    isJumping: false,
    bhopStreak: 0,
    bhopTimer: 0,
    bhopSpeedMult: 1.0,
    stamina: 100,
    maxStamina: 100,
    isSprinting: false,
    ammo: 12,
    maxAmmo: 12,
    isReloading: false,
    reloadTimer: 0,
  }));

  // Sync state if initialPlayer changes (e.g. after Character Creation)
  useEffect(() => {
    if (initialPlayer && initialPlayer.id !== 'default') {
      const initCinematic: IntroCinematicState = { phase: 'black_fade_in', timer: 0, fallingWeaponY: -300 };
      introCinematicRef.current = initCinematic;
      setIntroCinematic(initCinematic);
      setPlayer((prev) => ({
        ...prev,
        ...initialPlayer,
        stats: { ...initialPlayer.stats },
        chibi: { ...initialPlayer.chibi },
        equipment: { ...initialPlayer.equipment },
        skills: [...initialPlayer.skills],
        inventory: [...initialPlayer.inventory],
        // Start off-screen for intro cinematic dive
        y: -200,
        jumpZ: 900,
        spawnBounce: 1,
        cinematicPose: 'dive' as const,
        hideWeapon: true,
      }));
    }
  }, [initialPlayer]);

  const [remotePlayers, setRemotePlayers] = useState<Record<string, Player>>({});
  const [monsters, setMonsters] = useState<Monster[]>(() =>
    relocateFactionEdgeSpawns(JSON.parse(JSON.stringify(INITIAL_MONSTERS)))
  );
  const [cars, setCars] = useState<CarEntity[]>([]);
  const [resourceNodes, setResourceNodes] = useState<ResourceNode[]>(() => generateForestNodes());
  const [dropItems, setDropItems] = useState<DropItem[]>([]);
  const [interactiveObjects, setInteractiveObjects] = useState<InteractiveObject[]>(() => JSON.parse(JSON.stringify(INITIAL_INTERACTIVE_OBJECTS)));
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [particles, setParticles] = useState<VisualParticle[]>([]);
  const [groundDecals, setGroundDecals] = useState<GroundDecal[]>([]);
  const [worldPois, setWorldPois] = useState<WorldPOI[]>(() => JSON.parse(JSON.stringify(WORLD_POIS)));
  const [screenShake, setScreenShake] = useState<{ intensity: number; duration: number }>({ intensity: 0, duration: 0 });

  // Interactive UI Modal states
  const [activeModal, setActiveModal] = useState<'none' | 'inventory' | 'craft' | 'shop' | 'dialogue' | 'skills' | 'map'>('none');
  const [activeNpc, setActiveNpc] = useState<NPC | null>(null);
  const [nearbyInteractable, setNearbyInteractable] = useState<{ type: 'npc' | 'node'; id: string; name: string } | null>(null);
  const nearbyInteractableRef = useRef<{ type: 'npc' | 'node'; id: string; name: string } | null>(null);
  const [gameTimePhase, setGameTimePhase] = useState(0.32);
  const gameTimePhaseRef = useRef(0.32);
  const gameTimeUiTimerRef = useRef(0);
  const [toastNotification, setToastNotification] = useState<{ id: string; title: string; message: string; icon: string } | null>(null);
  const activeModalRef = useRef<'none' | 'inventory' | 'craft' | 'shop' | 'dialogue' | 'skills' | 'map'>('none');
  activeModalRef.current = activeModal;

  const [hordeRun, setHordeRun] = useState<HordeRunState>(() => createEmptyHordeRun());
  const hordeRunRef = useRef<HordeRunState>(hordeRun);
  hordeRunRef.current = hordeRun;
  const hordeUiTimerRef = useRef(0);
  const hordeHazardsRef = useRef<HordeHazard[]>([]);
  const leakFireAccRef = useRef(0);
  const lastZoneIdRef = useRef<string>('forest_camp');
  const [worldFade, setWorldFade] = useState(0);
  const worldFadeRef = useRef<{ phase: 'none' | 'out' | 'in'; t: number; pending: 'enter' | 'extract' | 'death' | null }>({
    phase: 'none',
    t: 0,
    pending: null,
  });
  const endHordeRunRef = useRef<(reason: HordeEndReason, doTeleport: boolean) => void>(() => {});

  // Active World Boss Target
  const [currentBoss, setCurrentBoss] = useState<Monster | null>(null);

  // Intro Cinematic State Machine
  const [introCinematic, setIntroCinematic] = useState<IntroCinematicState>({ phase: 'none', timer: 0, fallingWeaponY: -300 });
  const introCinematicRef = useRef<IntroCinematicState>(introCinematic);

  // Keyboard input tracker ref
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const joystickVectorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const joystickSprintRef = useRef<boolean>(false);
  const toggleVehicleRef = useRef<() => void>(() => {});
  const playerRef = useRef<Player>(player);
  playerRef.current = player;
  const elevatorRideRef = useRef<{ cooldown: number; fromZ: number; toZ: number; t: number; active: boolean }>({
    cooldown: 0,
    fromZ: 0,
    toZ: 0,
    t: 1,
    active: false,
  });

  const monstersRef = useRef<Monster[]>(monsters);
  monstersRef.current = monsters;

  const resourceNodesRef = useRef<ResourceNode[]>(resourceNodes);
  resourceNodesRef.current = resourceNodes;

  const dropItemsRef = useRef<DropItem[]>(dropItems);
  dropItemsRef.current = dropItems;

  const interactiveObjectsRef = useRef<InteractiveObject[]>(interactiveObjects);
  interactiveObjectsRef.current = interactiveObjects;

  const worldPoisRef = useRef<WorldPOI[]>(worldPois);
  worldPoisRef.current = worldPois;

  const projectilesRef = useRef<Projectile[]>(projectiles);
  projectilesRef.current = projectiles;

  const particlesRef = useRef<VisualParticle[]>(particles);
  particlesRef.current = particles;

  const groundDecalsRef = useRef<GroundDecal[]>(groundDecals);
  groundDecalsRef.current = groundDecals;

  const carsRef = useRef<CarEntity[]>(cars);
  carsRef.current = cars;
  const carSpawnTimerRef = useRef(16);

  const damagePopupsRef = useRef<DamagePopup[]>(damagePopups);
  damagePopupsRef.current = damagePopups;

  const screenShakeRef = useRef<{ intensity: number; duration: number }>({ intensity: 0, duration: 0 });

  // Track live mouse position in world coordinates
  const mouseWorldPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const fireHeldRef = useRef(false);
  const handleAttackRef = useRef<(x?: number, y?: number) => void>(() => {});
  const [summons, setSummons] = useState<SummonedAlly[]>([]);
  const summonsRef = useRef<SummonedAlly[]>(summons);
  summonsRef.current = summons;

  // Show floating toast
  const showToast = useCallback((title: string, message: string, icon: string = '✨') => {
    setToastNotification({ id: `toast_${Date.now()}`, title, message, icon });
    setTimeout(() => {
      setToastNotification((curr) => (curr?.title === title ? null : curr));
    }, 3500);
  }, []);

  // Add visual particle
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number = 6, shape: VisualParticle['shape'] = 'spark') => {
    const newPts: VisualParticle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3.5 + 1.2;
      newPts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: Math.random() * 4 + 2,
        alpha: 1,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        shape,
      });
    }
    particlesRef.current = [...particlesRef.current, ...newPts];
  }, []);

  // Gunsmith & RMB Aiming States
  const [isModdingWeapon, setIsModdingWeaponState] = useState<boolean>(false);
  const isModdingWeaponRef = useRef<boolean>(false);

  const setIsModdingWeapon = useCallback((modding: boolean) => {
    isModdingWeaponRef.current = modding;
    setIsModdingWeaponState(modding);
    setPlayer((prev) => ({
      ...prev,
      isInspectingWeapon: modding,
    }));
  }, []);

  const [isAiming, setIsAimingState] = useState<boolean>(false);
  const isAimingRef = useRef<boolean>(false);

  const setIsAiming = useCallback((aiming: boolean) => {
    isAimingRef.current = aiming;
    setIsAimingState(aiming);
  }, []);

  // Equip / Unequip Weapon Attachment in Gunsmith
  const handleEquipAttachment = useCallback((slot: AttachmentSlot, attachment: WeaponAttachment | null) => {
    setPlayer((prev) => {
      const currentAttachments = prev.weaponAttachments || { optic: null, muzzle: null, underbarrel: null, magazine: null };
      const updatedAttachments = { ...currentAttachments, [slot]: attachment };
      
      const activeWeapon = prev.equipment.weapon || ITEMS_DATABASE['wpn_starter_pistol'];
      const gunType: GunType = activeWeapon.gunType || 'pistol';
      const baseConfig = WEAPON_CONFIGS[gunType] || WEAPON_CONFIGS.pistol;
      const extraAmmo = updatedAttachments.magazine?.statBonus?.ammoBonus || 0;
      const newMaxAmmo = baseConfig.maxAmmo + extraAmmo;

      return {
        ...prev,
        weaponAttachments: updatedAttachments,
        maxAmmo: newMaxAmmo,
        ammo: Math.min(prev.ammo ?? newMaxAmmo, newMaxAmmo),
      };
    });
    sound.playPickup();
  }, []);

  // Add damage popup text with comic typography styling
  const addDamagePopup = useCallback((
    x: number,
    y: number,
    text: string,
    color: string = '#F87171',
    isCrit: boolean = false,
    isHeal: boolean = false,
    type: DamagePopup['type'] = 'damage',
    scale: number = 1,
    vx: number = 0,
    vy?: number,
    rotation?: number
  ) => {
    const isMangaSound = type === 'manga' || ['POW!', 'ПИХ!', 'ПАХ!', 'BANG!', 'RATATA!', 'BOOM!', 'PEW!', 'БДЫЩ!', 'БАБАХ!', 'ТЫДЫЩ!', 'БАНГ!', 'КРАШ!', 'ВЖУХ!', 'ТРА-ТА!', 'ТА-ТА!', 'ПАХ-ПАХ!'].some(w => text === w);
    const isBark = type === 'bark';
    const popup: DamagePopup = {
      id: `dp_${Date.now()}_${Math.random()}`,
      x: isBark || isMangaSound ? x : x + (Math.random() * 16 - 8),
      y: isBark || isMangaSound ? y : y - 22,
      vx: vx,
      vy: vy !== undefined ? vy : isBark ? -12 : isMangaSound ? -15 : -35,
      rotation: rotation !== undefined ? rotation : (isMangaSound ? (Math.random() - 0.5) * 0.4 : 0),
      text: isCrit && !text.includes('!') ? `${text}!` : text,
      color,
      isCrit,
      isHeal,
      type: isMangaSound ? 'manga' : type,
      scale: isBark ? scale : isMangaSound ? (scale !== 1 ? scale : 0.82) : isCrit ? 1.35 : type === 'dodge' ? 1.2 : scale,
      life: isBark ? 1.4 : isMangaSound ? 0.48 : isCrit ? 0.8 : 0.65,
      maxLife: isBark ? 1.4 : isMangaSound ? 0.48 : isCrit ? 0.8 : 0.65,
    };
    damagePopupsRef.current = [...damagePopupsRef.current, popup];
    setDamagePopups([...damagePopupsRef.current]);
  }, []);

  // Trigger screen shake
  const triggerShake = useCallback((intensity: number = 6, duration: number = 0.2) => {
    screenShakeRef.current = { intensity, duration };
    setScreenShake({ intensity, duration });
  }, []);

  // Add Ground Decal (Blood stain / bullet mark / explosion scorch / burning Molotov fire pool)
  const addGroundDecal = useCallback((
    x: number,
    y: number,
    color: string = '#991B1B',
    radius: number = 14,
    type: GroundDecal['type'] = 'blood',
    life: number = 18.0,
    dps: number = 0
  ) => {
    const newDecal: GroundDecal = {
      id: `decal_${Date.now()}_${Math.random()}`,
      x: x + (Math.random() * 8 - 4),
      y: y + (Math.random() * 6 - 3),
      radius: radius + Math.random() * 4,
      color,
      alpha: 0.85,
      life,
      maxLife: life,
      type,
      dps,
      splatterCount: Math.floor(Math.random() * 3) + 2,
    };
    groundDecalsRef.current = [...groundDecalsRef.current.slice(-75), newDecal];
    setGroundDecals(groundDecalsRef.current);
  }, []);

  // Spawn Drop Item on Ground
  const spawnDrop = useCallback((itemId: string, x: number, y: number, quantity: number = 1) => {
    const item = ITEMS_DATABASE[itemId];
    if (!item) return;

    const newDrop: DropItem = {
      id: `drop_${Date.now()}_${Math.random()}`,
      itemId: item.id,
      item,
      x: x + (Math.random() * 30 - 15),
      y: y + (Math.random() * 30 - 15),
      quantity,
      createdAt: Date.now(),
      bounceOffset: 0,
      groundY: y,
    };

    dropItemsRef.current = [...dropItemsRef.current, newDrop];
    setDropItems(dropItemsRef.current);
    net.syncDropSpawn(newDrop);
  }, []);

  const spawnXpGem = useCallback((x: number, y: number, value: number) => {
    const item = ITEMS_DATABASE['item_soul_ember'];
    if (!item) return;
    const newDrop: DropItem = {
      id: `gem_${Date.now()}_${Math.random()}`,
      itemId: item.id,
      item,
      x: x + (Math.random() * 22 - 11),
      y: y + (Math.random() * 22 - 11),
      quantity: Math.max(1, value),
      createdAt: Date.now(),
      bounceOffset: 0,
      groundY: y,
      isXpGem: true,
    };
    dropItemsRef.current = [...dropItemsRef.current, newDrop];
    setDropItems(dropItemsRef.current);
  }, []);

  // Add Item to Player Inventory
  const addItemToInventory = useCallback((item: Item, quantity: number = 1) => {
    setPlayer((prev) => {
      const inv = [...prev.inventory];
      if (item.stackable) {
        const existing = inv.find((slot) => slot && slot.item && slot.item.id === item.id);
        if (existing) {
          existing.quantity += quantity;
          return { ...prev, inventory: inv };
        }
      }
      inv.push({
        slotId: Date.now() + Math.random(),
        item,
        quantity,
      });
      return { ...prev, inventory: inv };
    });

    showToast(`Obtained Item!`, `+${quantity} ${item.name}`, item.icon);
    sound.playPickup();
  }, [showToast]);

  // Give Quest Rewards
  const completeQuest = useCallback((questId: string) => {
    const quest = QUESTS_DATABASE[questId];
    if (!quest) return;

    setPlayer((prev) => {
      const qp = prev.activeQuests[questId];
      if (!qp || qp.status === 'turned_in') return prev;

      let newExp = prev.stats.exp + quest.rewardExp;
      let newLevel = prev.stats.level;
      let newMaxExp = prev.stats.maxExp;
      let newStatPoints = prev.stats.statPoints;

      while (newExp >= newMaxExp) {
        newExp -= newMaxExp;
        newLevel += 1;
        newMaxExp = Math.floor(newMaxExp * 1.4);
        newStatPoints += 3;
        sound.playLevelUp();
      }

      quest.rewardItems.forEach((ri) => {
        const it = ITEMS_DATABASE[ri.itemId];
        if (it) addItemToInventory(it, ri.quantity);
      });

      return {
        ...prev,
        gold: prev.gold + quest.rewardGold,
        stats: {
          ...prev.stats,
          level: newLevel,
          exp: newExp,
          maxExp: newMaxExp,
          statPoints: newStatPoints,
        },
        activeQuests: {
          ...prev.activeQuests,
          [questId]: { ...qp, status: 'turned_in' },
        },
        completedQuestIds: [...prev.completedQuestIds, questId],
      };
    });

    showToast('Quest Completed! 🎉', quest.title, '🏆');
  }, [addItemToInventory, showToast]);

  // Update Quest Objectives
  const updateQuestObjective = useCallback((type: 'kill' | 'gather' | 'craft', targetId: string, count: number = 1) => {
    setPlayer((prev) => {
      let questCompleted = false;
      const updatedQuests = { ...prev.activeQuests };

      Object.keys(updatedQuests).forEach((qId) => {
        const qp = updatedQuests[qId];
        if (qp.status !== 'active') return;

        let allDone = true;
        const newObjectives = qp.objectives.map((obj) => {
          if (obj.type === type && (obj.targetId === targetId || obj.targetId === 'any')) {
            const updatedCur = Math.min(obj.required, obj.current + count);
            if (updatedCur < obj.required) allDone = false;
            return { ...obj, current: updatedCur };
          }
          if (obj.current < obj.required) allDone = false;
          return obj;
        });

        updatedQuests[qId] = {
          ...qp,
          objectives: newObjectives,
          status: allDone ? 'completed' : 'active',
        };

        if (allDone && qp.status === 'active') questCompleted = true;
      });

      if (questCompleted) sound.playPickup();
      return { ...prev, activeQuests: updatedQuests };
    });
  }, []);

  // Award EXP & Gold
  const awardExpAndGold = useCallback((exp: number, gold: number) => {
    setPlayer((prev) => {
      let newExp = prev.stats.exp + exp;
      let newLevel = prev.stats.level;
      let newMaxExp = prev.stats.maxExp;
      let newStatPoints = prev.stats.statPoints;
      let newHp = prev.stats.hp;
      let newMaxHp = prev.stats.maxHp;
      let newAtk = prev.stats.atk;
      let newDef = prev.stats.def;

      let leveledUp = false;
      while (newExp >= newMaxExp) {
        newExp -= newMaxExp;
        newLevel += 1;
        newMaxExp = Math.floor(newMaxExp * 1.35);
        newStatPoints += 3;
        newMaxHp += 40;
        newHp = newMaxHp;
        newAtk += 4;
        newDef += 2;
        leveledUp = true;
      }

      if (leveledUp) {
        sound.playLevelUp();
        showToast('Level Up! 🌟', `You reached Level ${newLevel}! +3 Stat Points`, '⬆️');
      }

      return {
        ...prev,
        gold: prev.gold + gold,
        stats: {
          ...prev.stats,
          level: newLevel,
          exp: newExp,
          maxExp: newMaxExp,
          statPoints: newStatPoints,
          hp: newHp,
          maxHp: newMaxHp,
          atk: newAtk,
          def: newDef,
        },
      };
    });
  }, [showToast]);

  // Handle Monster Defeated (Initiates ragdoll death fall and drops loot)
  const handleMonsterDefeated = useCallback((m: Monster, killedByPlayer: boolean = false) => {
    m.state = 'dead';
    m.hp = 0;
    m.deathProgress = 0;
    m.deathType = Math.random() > 0.5 ? 'back' : 'front';
    m.battleBark = { text: m.isBoss ? 'IMPOSSIBLE...!' : 'AGHHH!!', timer: 1.2 };
    if (m.sniperLaser) m.sniperLaser.active = false;

    // Only award EXP and quest progress if killed by player or player dealt damage to this monster
    const isPlayerKill = killedByPlayer || !!m.damagedByPlayer;
    if (isPlayerKill) {
      if (m.zone === HORDE_ZONE_ID) {
        spawnXpGem(m.x, m.y, Math.max(6, Math.round(m.expReward * 0.85)));
        if (Math.random() < 0.12) spawnXpGem(m.x + 8, m.y - 6, Math.round(m.expReward * 0.4));
        if (hordeRunRef.current.active) {
          hordeRunRef.current.kills += 1;
          if (hordeRunRef.current.blindness.casterId === m.id) {
            hordeRunRef.current.blindness.active = false;
            hordeRunRef.current.blindness.remaining = 0;
            hordeRunRef.current.blindness.casterId = null;
            showToast('SIGHT RESTORED', 'The void priest is dead.', '👁');
          }
          if (m.hordeKind === 'splitter') {
            const mites = [
              createHordeMob(m.x, m.y, hordeRunRef.current.elapsed, playerRef.current.id, 'mite', { x: m.x - 18, y: m.y + 8 }),
              createHordeMob(m.x, m.y, hordeRunRef.current.elapsed, playerRef.current.id, 'mite', { x: m.x + 18, y: m.y - 8 }),
            ];
            monstersRef.current = [...monstersRef.current, ...mites];
            setMonsters([...monstersRef.current]);
          }
        }
      } else {
        awardExpAndGold(m.expReward, m.goldReward);
        updateQuestObjective('kill', m.type, 1);
      }
    }

    addGroundDecal(m.x, m.y + 10, '#7F1D1D', m.isBoss ? 32 : 18);
    spawnParticles(m.x, m.y, '#EF4444', m.isBoss ? 35 : 16, 'spark');

    // NPC loot drops disabled — enemies no longer scatter items on defeat.
    // if (m.dropTable && isPlayerKill) {
    //   m.dropTable.forEach((d) => {
    //     if (Math.random() <= d.chance) {
    //       const qty = Math.floor(Math.random() * (d.maxQty - d.minQty + 1)) + d.minQty;
    //       spawnDrop(d.itemId, m.x, m.y, qty);
    //     }
    //   });
    // }

    if (m.isBoss) {
      if (isPlayerKill) {
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 } });
      }
      showToast('WORLD BOSS DEFEATED! 🏆', `${m.name} has fallen!`, '👑');
      sound.playBossDefeated();
    } else {
      sound.playMonsterDeath();
    }

    // Auto-Respawn for Faction Warzone Cops & Punk Bandits
    if (m.faction === 'police' || m.faction === 'punk_demon' || m.zone === 'warzone_frontline' || m.zone === 'cop_precinct' || m.zone === 'punk_territory') {
      m.isRespawning = true;
      m.respawnTime = 2.5 + Math.random() * 1.5;
    }
  }, [awardExpAndGold, updateQuestObjective, addGroundDecal, spawnParticles, showToast, spawnXpGem]);

  // Refs for Hostingovaya dynamic escalation
  const brokenServersCountRef = useRef<number>(0);
  const hostingovayaAlarmRef = useRef<boolean>(false);
  const swatRaidSpawnedRef = useRef<boolean>(false);

  // Detonate Explosive Barrel / Object or Smash Server Rack
  const explodeInteractiveObject = useCallback((obj: InteractiveObject) => {
    // ==========================================
    // HOSTINGOVAYA SMASHABLE SERVERS & QUANTUM CORE
    // ==========================================
    if (obj.type === 'server_rack' || obj.type === 'quantum_core') {
      sound.playHit(true);
      triggerShake(12, 0.4);
      addGroundDecal(obj.x, obj.y, '#0284C7', 28);
      spawnParticles(obj.x, obj.y, '#38BDF8', 25, 'spark');
      spawnParticles(obj.x, obj.y, '#FACC15', 20, 'spark');
      spawnParticles(obj.x, obj.y, '#EF4444', 15, 'spark');
      spawnParticles(obj.x, obj.y, '#475569', 20, 'smoke');

      brokenServersCountRef.current += 1;
      const count = brokenServersCountRef.current;

      const serverPopups = ['KERNEL PANIC! 💥', '404 NOT FOUND! 🔥', 'DDoS 100%! ⚡', 'СЕРВЕР СЛОМАН! 💻', 'СБОЙ БАЗЫ ДАННЫХ! 🚨'];
      const chosenPopup = serverPopups[Math.floor(Math.random() * serverPopups.length)];
      addDamagePopup(obj.x, obj.y - 25, chosenPopup, '#38BDF8', true, false, 'manga', 1.4);

      // Tech loot drops
      spawnDrop('mat_refined_steel', obj.x, obj.y, 2 + Math.floor(Math.random() * 3));
      if (Math.random() < 0.7) spawnDrop('mat_lumite_crystal', obj.x, obj.y, 1 + Math.floor(Math.random() * 2));
      if (Math.random() < 0.4) spawnDrop('pot_hp_large', obj.x, obj.y, 1);

      // Level 1 Escalation: Sysadmins & Security Guards chase player!
      if (!hostingovayaAlarmRef.current) {
        hostingovayaAlarmRef.current = true;
        showToast('🚨 ТРЕВОГА В ХОСТИНГОВОЙ!', 'Сервера атакованы! Охрана и сисадмины выехали на перехват!', '🚨');
        sound.playBossRoar();

        const newGuards: Monster[] = [
          {
            id: `guard_host_${Date.now()}_1`,
            name: 'Senior Sysadmin Oleg',
            type: 'cop_enforcer',
            zone: 'cop_precinct',
            x: 1720,
            y: 3520,
            spawnX: 1720,
            spawnY: 3520,
            maxHp: 180,
            hp: 180,
            atk: 22,
            def: 12,
            speed: 5.5,
            expReward: 85,
            goldReward: 60,
            faction: 'police',
            isHumanoid: true,
            weaponType: 'mac10',
            state: 'chase',
            targetPlayerId: playerRef.current.id,
            damagedByPlayer: true,
            attackCooldown: 0.5,
            specialCooldown: 2.0,
            battleBark: { text: 'КТО ВЫДЕРНУЛ ПИТАНИЕ?! 😡', timer: 1.8 },
          },
          {
            id: `guard_host_${Date.now()}_2`,
            name: 'Data Center Tech Guard',
            type: 'cop_officer',
            zone: 'cop_precinct',
            x: 1980,
            y: 3520,
            spawnX: 1980,
            spawnY: 3520,
            maxHp: 160,
            hp: 160,
            atk: 20,
            def: 10,
            speed: 5.8,
            expReward: 75,
            goldReward: 50,
            faction: 'police',
            isHumanoid: true,
            weaponType: 'baton',
            state: 'chase',
            targetPlayerId: playerRef.current.id,
            damagedByPlayer: true,
            attackCooldown: 0.4,
            specialCooldown: 2.0,
            battleBark: { text: 'РУКИ ОТ НАШИХ GPU! 💻', timer: 1.8 },
          },
        ];
        monstersRef.current = [...monstersRef.current, ...newGuards];
        setMonsters([...monstersRef.current]);
      }

      // Level 2 Escalation (4+ servers): Threat Level Critical!
      if (count >= 4 && count < 7) {
        showToast('⚠️ КРИТИЧЕСКИЙ СБОЙ СЕРВЕРОВ!', 'DDoS атака 70%! Подкрепление охраны!', '⚡');
        const guard3: Monster = {
          id: `guard_host_${Date.now()}_3`,
          name: 'Cyber Security Drone-Bot',
          type: 'cop_enforcer',
          zone: 'cop_precinct',
          x: 1850,
          y: 3320,
          spawnX: 1850,
          spawnY: 3320,
          maxHp: 220,
          hp: 220,
          atk: 25,
          def: 14,
          speed: 6.0,
          expReward: 110,
          goldReward: 80,
          faction: 'police',
          isHumanoid: true,
          weaponType: 'shotgun',
          state: 'chase',
          targetPlayerId: playerRef.current.id,
          damagedByPlayer: true,
          attackCooldown: 0.6,
          specialCooldown: 2.0,
          battleBark: { text: 'ОБНАРУЖЕН ВЗЛОМ! ОГОНЬ! 💥', timer: 1.6 },
        };
        monstersRef.current = [...monstersRef.current, guard3];
        setMonsters([...monstersRef.current]);
      }

      // Level 3 Escalation: POLICE SWAT MASSIVE RAID & BRAWL (МЯСИЛОВКА!)
      if (count >= 7 && !swatRaidSpawnedRef.current) {
        swatRaidSpawnedRef.current = true;
        showToast('🚨 КОД КРАСНЫЙ: ВЫЗВАН СПЕЦНАЗ SWAT!', 'Полицейский штурм Хостинговой! ЖОСКАЯ МЯСИЛОВКА!', '🛡️');
        sound.playBossRoar();
        triggerShake(16, 0.6);

        const swatSquad: Monster[] = [
          {
            id: `swat_jugg_${Date.now()}`,
            name: 'SWAT Juggernaut Commander',
            type: 'cop_juggernaut',
            zone: 'cop_precinct',
            x: 1800,
            y: 3600,
            spawnX: 1800,
            spawnY: 3600,
            maxHp: 450,
            hp: 450,
            atk: 35,
            def: 22,
            speed: 4.8,
            expReward: 250,
            goldReward: 200,
            faction: 'police',
            isBoss: true,
            isJuggernaut: true,
            isHumanoid: true,
            hasShield: true,
            shieldHp: 400,
            weaponType: 'shotgun',
            state: 'chase',
            targetPlayerId: playerRef.current.id,
            damagedByPlayer: true,
            attackCooldown: 0.6,
            specialCooldown: 2.5,
            battleBark: { text: 'ШТУРМ ЗДАНИЯ! ВСЕМ НА ПОЛ! 🛡️', timer: 2.0 },
          },
          {
            id: `swat_breacher_${Date.now()}_1`,
            name: 'SWAT Riot Breacher',
            type: 'cop_enforcer',
            zone: 'cop_precinct',
            x: 1650,
            y: 3620,
            spawnX: 1650,
            spawnY: 3620,
            maxHp: 240,
            hp: 240,
            atk: 28,
            def: 16,
            speed: 5.4,
            expReward: 130,
            goldReward: 90,
            faction: 'police',
            isHumanoid: true,
            hasShield: true,
            shieldHp: 250,
            weaponType: 'mac10',
            state: 'chase',
            targetPlayerId: playerRef.current.id,
            damagedByPlayer: true,
            attackCooldown: 0.4,
            specialCooldown: 2.0,
            battleBark: { text: 'БРОСАЙ ОРУЖИЕ! 💥', timer: 1.8 },
          },
          {
            id: `swat_breacher_${Date.now()}_2`,
            name: 'SWAT Tactical Marksman',
            type: 'cop_marksman',
            zone: 'cop_precinct',
            x: 2050,
            y: 3620,
            spawnX: 2050,
            spawnY: 3620,
            maxHp: 200,
            hp: 200,
            atk: 32,
            def: 14,
            speed: 5.2,
            expReward: 140,
            goldReward: 95,
            faction: 'police',
            isHumanoid: true,
            weaponType: 'ak47',
            state: 'chase',
            targetPlayerId: playerRef.current.id,
            damagedByPlayer: true,
            attackCooldown: 0.5,
            specialCooldown: 2.0,
            battleBark: { text: 'ЦЕЛЬ ЗАХВАЧЕНА! 🎯', timer: 1.8 },
          },
        ];
        monstersRef.current = [...monstersRef.current, ...swatSquad];
        setMonsters([...monstersRef.current]);
      }
      return;
    }

    // Standard Explosive Barrel
    sound.playBossRoar();
    triggerShake(14, 0.45);
    addGroundDecal(obj.x, obj.y, '#1C1917', 36);
    spawnParticles(obj.x, obj.y, '#EF4444', 30, 'spark');
    spawnParticles(obj.x, obj.y, '#F59E0B', 25, 'spark');
    spawnParticles(obj.x, obj.y, '#78716C', 20, 'smoke');

    const blastRadius = 190;
    const blastDmg = 320;

    // Damage and launch nearby monsters
    monstersRef.current.forEach((m) => {
      if (m.hp <= 0) return;
      const dx = m.x - obj.x;
      const dy = m.y - obj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= blastRadius && dist > 0) {
        const dmg = Math.round(blastDmg * (1 - dist / blastRadius * 0.4));
        m.hp = Math.max(0, m.hp - dmg);
        m.knockbackX = (dx / dist) * 160;
        m.knockbackY = (dy / dist) * 100;
        m.hitFlash = 0.3;
        addDamagePopup(m.x, m.y, `${dmg} BOOM!`, '#FACC15', true);
        if (m.hp <= 0) handleMonsterDefeated(m);
      }
    });

    // Damage player if caught in blast
    const p = playerRef.current;
    const pdx = p.x - obj.x;
    const pdy = p.y - obj.y;
    const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (pDist <= blastRadius && pDist > 0) {
      const pDmg = Math.round(120 * (1 - pDist / blastRadius * 0.5));
      setPlayer((prev) => ({
        ...prev,
        stats: { ...prev.stats, hp: Math.max(1, prev.stats.hp - pDmg) },
      }));
      addDamagePopup(p.x, p.y, `-${pDmg} BLAST`, '#EF4444', true);
    }

    // Trigger chain explosions on other barrels
    interactiveObjectsRef.current.forEach((other) => {
      if (other.id !== obj.id && other.hp > 0 && other.type === 'explosive_barrel') {
        const odx = other.x - obj.x;
        const ody = other.y - obj.y;
        const oDist = Math.sqrt(odx * odx + ody * ody);
        if (oDist <= blastRadius) {
          other.hp = 0;
          setTimeout(() => explodeInteractiveObject(other), 120);
        }
      }
    });
  }, [triggerShake, addGroundDecal, spawnParticles, addDamagePopup, handleMonsterDefeated, spawnDrop, showToast]);

  // Jump Action (with Bhop Acceleration)
  const handleJump = useCallback(() => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    const curPlayer = playerRef.current;
    if (curPlayer.stats.hp <= 0 || isDrivingHijackCar(curPlayer)) return;

    if (curPlayer.jumpZ <= 1) {
      const isChainingBhop = curPlayer.bhopTimer > 0;
      const nextStreak = isChainingBhop ? Math.min(10, curPlayer.bhopStreak + 1) : 1;
      const nextSpeedMult = isChainingBhop ? 1.0 + nextStreak * 0.12 : 1.1;
      const doKickflip = isSkating(curPlayer) && (curPlayer.skateTrickTimer ?? 0) <= 0.08;
      const tricked = doKickflip ? applySkateTrick(curPlayer, 'kickflip') : null;

      setPlayer((prev) => {
        const base = tricked ? { ...prev, ...tricked.player } : prev;
        return {
          ...base,
          jumpZ: 1,
          jumpVz: doKickflip ? 380 : 320,
          isJumping: true,
          bhopStreak: nextStreak,
          bhopTimer: 0.45,
          bhopSpeedMult: nextSpeedMult,
        };
      });

      if (tricked) {
        sound.playSkateTrick('kickflip');
        spawnParticles(curPlayer.x, curPlayer.y + 10, tricked.color, 10, 'spark');
        addDamagePopup(curPlayer.x, curPlayer.y - 28, tricked.label, tricked.color, true, false, 'manga', 1.35, 0, -18);
      } else {
        sound.playJump();
        spawnParticles(curPlayer.x, curPlayer.y + 10, '#38BDF8', 5, 'spark');
      }
    }
  }, [spawnParticles, addDamagePopup]);

  // Weapon Hot-Swap / Equip (Keys 1-6)
  const handleSwitchWeapon = useCallback((gunTypeOrId: string) => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    if (isDrivingHijackCar(playerRef.current)) return;
    const wpn = Object.values(ITEMS_DATABASE).find((it) => it.id === gunTypeOrId || it.gunType === gunTypeOrId);
    if (!wpn) return;

    const gunType: GunType = wpn.gunType || 'pistol';
    const config = WEAPON_CONFIGS[gunType] || WEAPON_CONFIGS.pistol;
    const usesAmmo = AMMO_GUNS.includes(gunType);

    setPlayer((prev) => {
      const extraAmmo = prev.weaponAttachments?.magazine?.statBonus?.ammoBonus || 0;
      const totalMaxAmmo = (usesAmmo ? config.maxAmmo : 1) + extraAmmo;
      return {
        ...prev,
        equipment: { ...prev.equipment, weapon: wpn },
        ammo: usesAmmo ? totalMaxAmmo : 1,
        maxAmmo: usesAmmo ? totalMaxAmmo : 1,
        isReloading: false,
        reloadTimer: 0,
      };
    });

    showToast('Equipped', wpn.name, wpn.icon);
    sound.playPickup();
  }, [showToast]);

  // Weapon Reload (Manual [R] or automatic on empty magazine)
  const handleReload = useCallback(() => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    const curPlayer = playerRef.current;
    if (isDrivingHijackCar(curPlayer)) return;
    if (curPlayer.stats.hp <= 0 || curPlayer.isReloading) return;

    const activeWeapon = curPlayer.equipment.weapon || ITEMS_DATABASE['wpn_starter_pistol'];
    const gunType: GunType = activeWeapon.gunType || 'pistol';
    if (!AMMO_GUNS.includes(gunType)) return;
    const config = WEAPON_CONFIGS[gunType] || WEAPON_CONFIGS.pistol;
    const maxCapacity = curPlayer.maxAmmo ?? config.maxAmmo;

    if ((curPlayer.ammo !== undefined ? curPlayer.ammo : maxCapacity) >= maxCapacity) return;

    const reloadSpeedMult = curPlayer.weaponAttachments?.magazine?.statBonus?.reloadSpeedMult ?? 1.0;
    const duration = config.reloadTime * reloadSpeedMult;

    sound.playReload();
    setPlayer((prev) => ({
      ...prev,
      isReloading: true,
      reloadTimer: duration,
    }));
  }, []);

  // Basic Attack firing based on active weapon
  const handleAttack = useCallback((targetWorldX?: number, targetWorldY?: number) => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    const curPlayer = playerRef.current;
    if (isDrivingHijackCar(curPlayer)) return;
    if (curPlayer.stats.hp <= 0 || curPlayer.attackTimer > 0) return;

    const activeWeapon = curPlayer.equipment.weapon || ITEMS_DATABASE['wpn_starter_pistol'];
    const gunType: GunType = activeWeapon.gunType || 'pistol';
    const config = WEAPON_CONFIGS[gunType] || WEAPON_CONFIGS.pistol;
    const maxCapacity = curPlayer.maxAmmo ?? config.maxAmmo;

    // Cannot shoot while reloading
    if (curPlayer.isReloading) {
      return;
    }

    const usesAmmo = AMMO_GUNS.includes(gunType);
    const currentAmmo = curPlayer.ammo !== undefined ? curPlayer.ammo : maxCapacity;
    if (usesAmmo && currentAmmo <= 0) {
      sound.playEmptyClick();
      handleReload();
      return;
    }

    const nextAmmo = usesAmmo ? currentAmmo - 1 : currentAmmo;
    const now = Date.now();

    // Calculate aim vector
    let targetX = targetWorldX;
    let targetY = targetWorldY;

    if (targetX === undefined || targetY === undefined) {
      if (mouseWorldPosRef.current.x !== 0 || mouseWorldPosRef.current.y !== 0) {
        targetX = mouseWorldPosRef.current.x;
        targetY = mouseWorldPosRef.current.y;
      } else {
        targetX = curPlayer.x + (curPlayer.facing === 'left' ? -260 : 260);
        targetY = curPlayer.y;
      }
    }

    const dx = targetX - curPlayer.x;
    const dy = targetY - curPlayer.y;
    const aimAngle = Math.atan2(dy, dx);
    const aimDirX = Math.cos(aimAngle);
    const aimDirY = Math.sin(aimAngle);
    const newFacing: 'left' | 'right' = aimDirX >= 0 ? 'right' : 'left';

    playerRef.current = {
      ...playerRef.current,
      facing: newFacing,
      aimAngle,
      ammo: nextAmmo,
      maxAmmo: maxCapacity,
      attackTimer: config.fireRate,
    };
    setPlayer((prev) => ({
      ...prev,
      facing: newFacing,
      aimAngle,
      ammo: nextAmmo,
      maxAmmo: maxCapacity,
      attackTimer: config.fireRate,
    }));

    if (usesAmmo && nextAmmo === 0) {
      setTimeout(() => {
        handleReload();
      }, 90);
    }

    // Attachment Stat Modifiers
    const att = curPlayer.weaponAttachments;
    const dmgMult = att?.muzzle?.statBonus?.damageMult ?? 1.0;
    const critBonus = (att?.muzzle?.statBonus?.critRateBonus ?? 0) + (att?.optic?.statBonus?.critRateBonus ?? 0);
    const rangeBonus = att?.optic?.statBonus?.rangeBonus ?? 0;
    const spreadReduction = (att?.muzzle?.statBonus?.spreadReduction ?? 0) + (att?.underbarrel?.statBonus?.spreadReduction ?? 0);
    const spreadFactor = Math.max(0.1, 1.0 - spreadReduction);

    const triggerMuzzleSparks = (currentGun: GunType) => {
      const barrelLen = currentGun === 'cheytac' ? 42 :
                        currentGun === 'shotgun' ? 32 :
                        currentGun === 'ak47' ? 34 :
                        currentGun === 'revolver' ? 30 :
                        currentGun === 'mac10' ? 28 : 26;

      const muzzleBaseX = curPlayer.x + aimDirX * barrelLen;
      const muzzleBaseY = curPlayer.y + aimDirY * barrelLen - 3;
      const count = currentGun === 'shotgun' ? 18 : currentGun === 'cheytac' ? 14 : 11;
      const colors = ['#FFFBEB', '#FEF08A', '#FDE047', '#FBBF24', '#FB923C'];
      const sparks: VisualParticle[] = [];
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 0.9;
        const ang = aimAngle + spread;
        const speed = 2.8 + Math.random() * 5.2;
        sparks.push({
          x: muzzleBaseX + (Math.random() - 0.5) * 3,
          y: muzzleBaseY + (Math.random() - 0.5) * 3,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - Math.random() * 0.6,
          color: colors[i % colors.length],
          size: 1.1 + Math.random() * 2.4,
          alpha: 1,
          life: 0,
          maxLife: 0.1 + Math.random() * 0.16,
          shape: 'spark',
        });
      }
      particlesRef.current = [...particlesRef.current, ...sparks];

      const perpX = -aimDirY;
      const perpY = aimDirX;
      const casingCount = currentGun === 'shotgun' ? 2 : 1;
      const casings: VisualParticle[] = [];
      for (let i = 0; i < casingCount; i++) {
        const eject = playerRef.current.facing === 'left' ? -1 : 1;
        casings.push({
          x: muzzleBaseX - aimDirX * (barrelLen * 0.55) + perpX * 4 * eject,
          y: muzzleBaseY - aimDirY * (barrelLen * 0.55) + perpY * 4 * eject,
          vx: perpX * eject * (2.4 + Math.random() * 2.2) + (Math.random() - 0.5) * 0.8,
          vy: -3.6 - Math.random() * 2.4 + perpY * eject * 0.8,
          color: currentGun === 'shotgun' ? '#EF4444' : '#D97706',
          size: currentGun === 'shotgun' ? 3.4 : 2.6,
          alpha: 1,
          life: 0,
          maxLife: 0.55 + Math.random() * 0.25,
          shape: 'casing',
        });
      }
      particlesRef.current = [...particlesRef.current, ...casings];
    };

    const pushProj = (proj: Projectile) => {
      projectilesRef.current = [...projectilesRef.current, proj];
      setProjectiles([...projectilesRef.current]);
    };

    const hurtCone = (range: number, arc: number, damage: number, knock: number) => {
      monstersRef.current.forEach((m) => {
        if (m.hp <= 0 || m.state === 'dead') return;
        const mdx = m.x - curPlayer.x;
        const mdy = m.y - curPlayer.y;
        const dist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (dist > range + (m.isBoss || m.isJuggernaut ? 30 : 0)) return;
        const ang = Math.atan2(mdy, mdx);
        let diff = ang - aimAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > arc / 2) return;
        const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
        const dmg = Math.round(damage * (isCrit ? 1.5 : 1));
        m.hp = Math.max(0, m.hp - dmg);
        m.hitFlash = 0.2;
        m.damagedByPlayer = true;
        m.retaliatePlayer = true;
        m.state = 'chase';
        m.targetPlayerId = curPlayer.id;
        m.knockbackX = aimDirX * knock;
        m.knockbackY = aimDirY * knock;
        addDamagePopup(m.x, m.y - 12, isCrit ? `${dmg} CRIT` : `-${dmg}`, isCrit ? '#FDE047' : '#F8FAFC', isCrit);
        spawnParticles(m.x, m.y, '#E2E8F0', 8, 'spark');
        if (m.hp <= 0) handleMonsterDefeated(m, true);
      });
    };

    const FIREARMS: GunType[] = ['pistol', 'revolver', 'mac10', 'ak47', 'shotgun', 'cheytac'];
    if (FIREARMS.includes(gunType)) {
      triggerMuzzleSparks(gunType);
    }

    // ==========================================
    // 1. CHEYTAC M200 SNIPER RIFLE
    // ==========================================
    if (gunType === 'cheytac') {
      sound.playShoot();
      triggerShake(8, 0.2);
      spawnParticles(curPlayer.x + aimDirX * 30, curPlayer.y + aimDirY * 30, '#38BDF8', 12, 'spark');

      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + 25 + critBonus);
      pushProj({
        id: `p_cheytac_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'laser',
        x: curPlayer.x + aimDirX * 28,
        y: curPlayer.y + aimDirY * 28 - 2,
        vx: aimDirX * 42,
        vy: aimDirY * 42,
        damage: Math.round(curPlayer.stats.atk * 3.8 * dmgMult),
        range: 2200 + rangeBonus,
        distanceTraveled: 0,
        color: '#BAE6FD',
        size: 9,
        tracerLength: 78,
        tracerWidth: 5.2,
        isCrit,
        piercing: true,
      });
    }
    // ==========================================
    // 2. SHOTGUN (7-PELLET SPREAD)
    // ==========================================
    else if (gunType === 'shotgun') {
      sound.playShoot();
      triggerShake(6, 0.15);
      spawnParticles(curPlayer.x + aimDirX * 24, curPlayer.y + aimDirY * 24, '#FB923C', 14, 'spark');

      const numPellets = 7;
      const spreadAngle = ((32 * spreadFactor) * Math.PI) / 180;
      for (let i = 0; i < numPellets; i++) {
        const offset = (i - (numPellets - 1) / 2) * (spreadAngle / (numPellets - 1));
        const angle = aimAngle + offset;
        const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
        pushProj({
          id: `p_shot_${now}_${i}`,
          ownerId: curPlayer.id,
          type: 'bullet',
          x: curPlayer.x + aimDirX * 20,
          y: curPlayer.y + aimDirY * 20,
          vx: Math.cos(angle) * (20 + (Math.random() - 0.5) * 3),
          vy: Math.sin(angle) * (20 + (Math.random() - 0.5) * 3),
          damage: Math.round(curPlayer.stats.atk * 0.85 * dmgMult),
          range: 950 + rangeBonus,
          distanceTraveled: 0,
          color: '#FB923C',
          size: 4,
          isCrit,
        });
      }
    }
    // ==========================================
    // 3. MAC-10 — 9mm bullet hose
    // ==========================================
    else if (gunType === 'mac10') {
      sound.playShoot();
      const spread = (Math.random() - 0.5) * (0.22 * spreadFactor);
      const bulletAngle = aimAngle + spread;
      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
      pushProj({
        id: `p_mac_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 20,
        y: curPlayer.y + aimDirY * 20,
        vx: Math.cos(bulletAngle) * 26,
        vy: Math.sin(bulletAngle) * 26,
        damage: Math.round(curPlayer.stats.atk * 0.72 * dmgMult),
        range: 1100 + rangeBonus,
        distanceTraveled: 0,
        color: '#FDE047',
        size: 2.2,
        tracerLength: 11,
        tracerWidth: 1.15,
        isCrit,
      });
    }
    // ==========================================
    // 4. AK-47 (7.62 — thicker, longer tracers)
    // ==========================================
    else if (gunType === 'ak47') {
      sound.playShoot();
      triggerShake(3, 0.07);
      spawnParticles(curPlayer.x + aimDirX * 24, curPlayer.y + aimDirY * 24, '#EF4444', 5, 'spark');
      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
      pushProj({
        id: `p_ak_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 24,
        y: curPlayer.y + aimDirY * 24,
        vx: aimDirX * 28,
        vy: aimDirY * 28,
        damage: Math.round(curPlayer.stats.atk * 1.6 * dmgMult),
        range: 1700 + rangeBonus,
        distanceTraveled: 0,
        color: '#F97316',
        size: 6.5,
        tracerLength: 34,
        tracerWidth: 3.6,
        isCrit,
      });
    }
    // ==========================================
    // 5. REVOLVER (.44 MAGNUM)
    // ==========================================
    else if (gunType === 'revolver') {
      sound.playShoot();
      triggerShake(6, 0.15);
      spawnParticles(curPlayer.x + aimDirX * 24, curPlayer.y + aimDirY * 24, '#F97316', 8, 'spark');
      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + 15 + critBonus);
      pushProj({
        id: `p_rev_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 22,
        y: curPlayer.y + aimDirY * 22,
        vx: aimDirX * 26,
        vy: aimDirY * 26,
        damage: Math.round(curPlayer.stats.atk * 2.2 * dmgMult),
        range: 1600 + rangeBonus,
        distanceTraveled: 0,
        color: '#F97316',
        size: 6,
        isCrit,
      });
    }
    // ==========================================
    // BLADE: throwing knives
    // ==========================================
    else if (gunType === 'throwing_knives') {
      sound.playShoot();
      spawnParticles(curPlayer.x + aimDirX * 18, curPlayer.y + aimDirY * 18, '#CBD5E1', 6, 'spark');
      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + 8 + critBonus);
      pushProj({
        id: `p_knife_${now}`,
        ownerId: curPlayer.id,
        type: 'thrown_knife',
        x: curPlayer.x + aimDirX * 16,
        y: curPlayer.y + aimDirY * 16,
        vx: aimDirX * 22,
        vy: aimDirY * 22,
        damage: Math.round(curPlayer.stats.atk * 1.35 * dmgMult),
        range: 980,
        distanceTraveled: 0,
        color: '#E2E8F0',
        size: 8,
        isCrit,
      });
    }
    // ==========================================
    // BLADE: katana / scythe / greatsword
    // ==========================================
    else if (gunType === 'katana') {
      sound.playHit();
      triggerShake(3, 0.08);
      spawnParticles(curPlayer.x + aimDirX * 40, curPlayer.y + aimDirY * 40, '#38BDF8', 10, 'spark');
      hurtCone(95, 1.35, curPlayer.stats.atk * 1.45 * dmgMult, 70);
      pushProj({
        id: `p_slash_${now}`,
        ownerId: curPlayer.id,
        type: 'slash_wave',
        x: curPlayer.x + aimDirX * 28,
        y: curPlayer.y + aimDirY * 28,
        vx: aimDirX * 14,
        vy: aimDirY * 14,
        damage: Math.round(curPlayer.stats.atk * 0.55 * dmgMult),
        range: 160,
        distanceTraveled: 0,
        color: '#7DD3FC',
        size: 18,
        piercing: true,
      });
    } else if (gunType === 'scythe') {
      sound.playHit();
      triggerShake(5, 0.12);
      spawnParticles(curPlayer.x + aimDirX * 50, curPlayer.y + aimDirY * 50, '#A3E635', 14, 'spark');
      hurtCone(140, 2.5, curPlayer.stats.atk * 1.85 * dmgMult, 110);
      for (let i = 0; i < 3; i++) {
        const a = aimAngle + (i - 1) * 0.45;
        pushProj({
          id: `p_scythe_${now}_${i}`,
          ownerId: curPlayer.id,
          type: 'slash_wave',
          x: curPlayer.x + Math.cos(a) * 24,
          y: curPlayer.y + Math.sin(a) * 24,
          vx: Math.cos(a) * 10,
          vy: Math.sin(a) * 10,
          damage: Math.round(curPlayer.stats.atk * 0.4 * dmgMult),
          range: 180,
          distanceTraveled: 0,
          color: '#84CC16',
          size: 26,
          piercing: true,
        });
      }
    } else if (gunType === 'greatsword') {
      sound.playHit();
      triggerShake(9, 0.22);
      spawnParticles(curPlayer.x + aimDirX * 70, curPlayer.y + aimDirY * 70, '#F8FAFC', 18, 'spark');
      addGroundDecal(curPlayer.x + aimDirX * 80, curPlayer.y + aimDirY * 80, '#1E293B', 28);
      hurtCone(175, 0.85, curPlayer.stats.atk * 2.6 * dmgMult, 160);
      pushProj({
        id: `p_gs_${now}`,
        ownerId: curPlayer.id,
        type: 'slash_wave',
        x: curPlayer.x + aimDirX * 40,
        y: curPlayer.y + aimDirY * 40,
        vx: aimDirX * 8,
        vy: aimDirY * 8,
        damage: Math.round(curPlayer.stats.atk * 0.8 * dmgMult),
        range: 220,
        distanceTraveled: 0,
        color: '#F1F5F9',
        size: 36,
        piercing: true,
      });
    }
    // ==========================================
    // MAGE: staff fireball / wand spray / grimoire meteor / totem lightning
    // ==========================================
    else if (gunType === 'staff') {
      sound.playSkillCast('damage');
      spawnParticles(curPlayer.x + aimDirX * 22, curPlayer.y + aimDirY * 22, '#FB923C', 10, 'spark');
      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
      pushProj({
        id: `p_fb_${now}`,
        ownerId: curPlayer.id,
        type: 'fireball',
        x: curPlayer.x + aimDirX * 20,
        y: curPlayer.y + aimDirY * 20,
        vx: aimDirX * 16,
        vy: aimDirY * 16,
        damage: Math.round(curPlayer.stats.atk * 1.7 * dmgMult),
        range: 1100,
        distanceTraveled: 0,
        color: '#F97316',
        size: 14,
        isCrit,
        explosionRadius: 55,
        glow: true,
      });
    } else if (gunType === 'wand') {
      sound.playShoot();
      const spread = (Math.random() - 0.5) * 0.55;
      const a = aimAngle + spread;
      pushProj({
        id: `p_wand_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'magic_orb',
        x: curPlayer.x + Math.cos(a) * 14,
        y: curPlayer.y + Math.sin(a) * 14,
        vx: Math.cos(a) * 18,
        vy: Math.sin(a) * 18,
        damage: Math.round(curPlayer.stats.atk * 0.55 * dmgMult),
        range: 780,
        distanceTraveled: 0,
        color: ['#C084FC', '#38BDF8', '#F472B6', '#FDE047'][Math.floor(Math.random() * 4)],
        size: 4 + Math.random() * 3,
        glow: true,
      });
    } else if (gunType === 'grimoire') {
      sound.playSkillCast('ultimate');
      triggerShake(8, 0.25);
      pushProj({
        id: `p_meteor_${now}`,
        ownerId: curPlayer.id,
        type: 'meteor',
        x: targetX - 18,
        y: targetY - 160,
        vx: 2.2,
        vy: 18,
        damage: Math.round(curPlayer.stats.atk * 3.2 * dmgMult),
        range: 240,
        distanceTraveled: 0,
        color: '#FB7185',
        size: 22,
        explosionRadius: 95,
        glow: true,
      });
    } else if (gunType === 'totem') {
      sound.playSkillCast('aoe');
      triggerShake(4, 0.1);
      const living = monstersRef.current
        .filter((m) => m.hp > 0 && m.state !== 'dead')
        .map((m) => ({ m, d: Math.hypot(m.x - curPlayer.x, m.y - curPlayer.y) }))
        .filter((e) => e.d < 420)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      living.forEach((e, i) => {
        const dmg = Math.round(curPlayer.stats.atk * (1.4 - i * 0.15) * dmgMult);
        e.m.hp = Math.max(0, e.m.hp - dmg);
        e.m.hitFlash = 0.25;
        e.m.damagedByPlayer = true;
        e.m.retaliatePlayer = true;
        e.m.state = 'chase';
        e.m.targetPlayerId = curPlayer.id;
        addDamagePopup(e.m.x, e.m.y - 10, `-${dmg}`, '#A855F7', true);
        spawnParticles(e.m.x, e.m.y, '#C084FC', 12, 'spark');
        if (e.m.hp <= 0) handleMonsterDefeated(e.m, true);
      });
    }
    // ==========================================
    // 6. DEFAULT PISTOL / STARTER
    // ==========================================
    else {
      sound.playShoot();
      spawnParticles(curPlayer.x + aimDirX * 22, curPlayer.y + aimDirY * 22, '#38BDF8', 5, 'spark');
      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
      pushProj({
        id: `p_pistol_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 20,
        y: curPlayer.y + aimDirY * 20,
        vx: aimDirX * 24,
        vy: aimDirY * 24,
        damage: Math.round(curPlayer.stats.atk * 1.2 * dmgMult),
        range: 1500 + rangeBonus,
        distanceTraveled: 0,
        color: '#38BDF8',
        size: 5,
        isCrit,
      });
    }
  }, [triggerShake, spawnParticles, handleMonsterDefeated, addGroundDecal]);
  handleAttackRef.current = handleAttack;

  // Skill Cast action
  const handleUseSkill = useCallback((skillIndex: number, targetWorldX?: number, targetWorldY?: number) => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    const curPlayer = playerRef.current;
    if (isDrivingHijackCar(curPlayer)) return;
    if (curPlayer.stats.hp <= 0 || !curPlayer.skills[skillIndex]) return;

    const skill = curPlayer.skills[skillIndex];
    const now = Date.now();

    if (now - skill.lastUsed < skill.cooldown * 1000) {
      showToast('Skill on cooldown!', `${Math.ceil((skill.cooldown * 1000 - (now - skill.lastUsed)) / 1000)}s remaining`, '⏳');
      return;
    }

    let targetX = targetWorldX;
    let targetY = targetWorldY;

    if (targetX === undefined || targetY === undefined) {
      if (mouseWorldPosRef.current.x !== 0 || mouseWorldPosRef.current.y !== 0) {
        targetX = mouseWorldPosRef.current.x;
        targetY = mouseWorldPosRef.current.y;
      } else {
        targetX = curPlayer.x + (curPlayer.facing === 'left' ? -240 : 240);
        targetY = curPlayer.y;
      }
    }

    const dx = targetX - curPlayer.x;
    const dy = targetY - curPlayer.y;
    const aimAngle = Math.atan2(dy, dx);
    const aimDirX = Math.cos(aimAngle);
    const aimDirY = Math.sin(aimAngle);

    setPlayer((prev) => {
      const skills = [...prev.skills];
      skills[skillIndex] = { ...skill, lastUsed: now };
      return { ...prev, facing: aimDirX >= 0 ? 'right' : 'left', skills };
    });

    sound.playSkillCast(skill.type);

    const pushSkillProj = (proj: Projectile) => {
      projectilesRef.current = [...projectilesRef.current, proj];
      setProjectiles([...projectilesRef.current]);
    };

    if (skill.id === 'skill_gatling_burst') {
      showToast('Rapid Fire Burst! ⚡', '12 rapid bullets stream towards cursor', '⚡');
      triggerShake(4, 0.4);
      for (let i = 0; i < 12; i++) {
        setTimeout(() => {
          if (playerRef.current.stats.hp <= 0) return;
          const liveP = playerRef.current;
          sound.playShoot();
          pushSkillProj({
            id: `p_gat_${Date.now()}_${i}`,
            ownerId: liveP.id,
            type: 'bullet',
            x: liveP.x + aimDirX * 22,
            y: liveP.y + aimDirY * 22,
            vx: aimDirX * 24 + (Math.random() - 0.5) * 1.5,
            vy: aimDirY * 24 + (Math.random() - 0.5) * 1.5,
            damage: Math.round(liveP.stats.atk * 0.95),
            range: 1400,
            distanceTraveled: 0,
            color: '#F472B6',
            size: 5,
            isCrit: i % 3 === 0,
          });
        }, i * 45);
      }
    } else if (skill.id === 'skill_bullet_fan') {
      showToast('Fan of Bullets! 💥', 'Wide penetrating spread', '💥');
      sound.playShoot();
      triggerShake(6, 0.2);
      const numBullets = 9;
      const spreadAngle = (70 * Math.PI) / 180;
      for (let i = 0; i < numBullets; i++) {
        const offset = (i - (numBullets - 1) / 2) * (spreadAngle / (numBullets - 1));
        const angle = aimAngle + offset;
        pushSkillProj({
          id: `p_fan_${now}_${i}`,
          ownerId: curPlayer.id,
          type: 'bullet',
          x: curPlayer.x + aimDirX * 20,
          y: curPlayer.y + aimDirY * 20,
          vx: Math.cos(angle) * 22,
          vy: Math.sin(angle) * 22,
          damage: Math.round(curPlayer.stats.atk * 1.3),
          range: 1300,
          distanceTraveled: 0,
          color: '#38BDF8',
          size: 6,
          isCrit: true,
          piercing: true,
        });
      }
    } else if (skill.id === 'skill_aerial_aimbot') {
      showToast('Aerial Aimbot Ricochet! 🎯', 'Vaulted into air with homing ricochets', '🎯');
      triggerShake(10, 0.6);
      handleJump();
      const livingMonsters = monstersRef.current.filter((m) => m.hp > 0);
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (playerRef.current.stats.hp <= 0) return;
          const target = livingMonsters.length > 0 ? livingMonsters[i % livingMonsters.length] : null;
          const angle = aimAngle + (i - 2.5) * 0.25;
          pushSkillProj({
            id: `p_rico_${Date.now()}_${i}`,
            ownerId: playerRef.current.id,
            type: 'bullet',
            x: playerRef.current.x,
            y: playerRef.current.y - playerRef.current.jumpZ * 0.5,
            vx: Math.cos(angle) * 24,
            vy: Math.sin(angle) * 24,
            damage: Math.round(playerRef.current.stats.atk * 1.7),
            range: 1600,
            distanceTraveled: 0,
            color: '#FDE047',
            size: 6,
            isCrit: true,
            ricochetsRemaining: 3,
            homingTargetId: target ? target.id : undefined,
          });
        }, i * 50);
      }
    } else if (skill.id === 'skill_spinning_blade') {
      showToast('Sawblade Throw! 🌀', 'Spinning steel rips a line through the pack', '🌀');
      triggerShake(6, 0.2);
      pushSkillProj({
        id: `p_saw_${now}`,
        ownerId: curPlayer.id,
        type: 'spinning_blade',
        x: curPlayer.x + aimDirX * 20,
        y: curPlayer.y + aimDirY * 20,
        vx: aimDirX * 18,
        vy: aimDirY * 18,
        damage: Math.round(curPlayer.stats.atk * 2.2),
        range: 980,
        distanceTraveled: 0,
        color: '#CBD5E1',
        size: 22,
        piercing: true,
        glow: true,
      });
    } else if (skill.id === 'skill_slash_scatter') {
      showToast('Slash Scatter! 💥', 'Crescent waves fan out', '💥');
      triggerShake(5, 0.18);
      const n = 8;
      const spread = (95 * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const offset = (i - (n - 1) / 2) * (spread / (n - 1));
        const a = aimAngle + offset;
        pushSkillProj({
          id: `p_ss_${now}_${i}`,
          ownerId: curPlayer.id,
          type: 'slash_wave',
          x: curPlayer.x + Math.cos(a) * 18,
          y: curPlayer.y + Math.sin(a) * 18,
          vx: Math.cos(a) * 16,
          vy: Math.sin(a) * 16,
          damage: Math.round(curPlayer.stats.atk * 1.15),
          range: 520,
          distanceTraveled: 0,
          color: '#67E8F9',
          size: 20,
          piercing: true,
        });
      }
    } else if (skill.id === 'skill_blade_storm') {
      showToast('Blade Storm! ⚔️', 'Swords rain on the cursor', '⚔️');
      triggerShake(10, 0.5);
      for (let i = 0; i < 12; i++) {
        const ox = (Math.random() - 0.5) * 220;
        const oy = (Math.random() - 0.5) * 160;
        pushSkillProj({
          id: `p_fall_${now}_${i}`,
          ownerId: curPlayer.id,
          type: 'falling_sword',
          x: targetX + ox,
          y: targetY + oy - 180 - i * 8,
          vx: 0,
          vy: 16 + Math.random() * 6,
          damage: Math.round(curPlayer.stats.atk * 1.8),
          range: 260,
          distanceTraveled: 0,
          color: '#E0F2FE',
          size: 16,
          piercing: true,
        });
      }
    } else if (skill.id === 'skill_meteor_rain') {
      showToast('Meteor Rain! ☄️', 'Fire from the sky', '☄️');
      triggerShake(8, 0.4);
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (playerRef.current.stats.hp <= 0) return;
          const ox = (Math.random() - 0.5) * 160;
          const oy = (Math.random() - 0.5) * 90;
          pushSkillProj({
            id: `p_mrain_${Date.now()}_${i}`,
            ownerId: playerRef.current.id,
            type: 'meteor',
            x: targetX + ox - 20,
            y: targetY + oy - 200,
            vx: 1.5 + Math.random() * 2,
            vy: 17,
            damage: Math.round(playerRef.current.stats.atk * 2.1),
            range: 260,
            distanceTraveled: 0,
            color: '#FB7185',
            size: 18,
            explosionRadius: 80,
            glow: true,
          });
        }, i * 90);
      }
    } else if (skill.id === 'skill_hellhounds') {
      showToast('Hellhound Pack! 🐺', 'Demon dogs hunt for you', '🐺');
      triggerShake(5, 0.2);
      const pack: SummonedAlly[] = [0, 1, 2].map((i) => ({
        id: `hound_${now}_${i}`,
        kind: 'hellhound' as const,
        ownerId: curPlayer.id,
        x: curPlayer.x + (i - 1) * 28,
        y: curPlayer.y + 18,
        facing: curPlayer.facing,
        hp: 140,
        maxHp: 140,
        atk: Math.round(curPlayer.stats.atk * 0.85),
        speed: 7.2,
        attackTimer: 0.2 * i,
        life: 16,
        maxLife: 16,
        scale: 0.85,
      }));
      summonsRef.current = [...summonsRef.current.filter((s) => s.kind !== 'hellhound'), ...pack];
      setSummons([...summonsRef.current]);
    } else if (skill.id === 'skill_titan_golem') {
      showToast('Titan Golem! 🗿', 'A giant rips out of the earth', '🗿');
      triggerShake(14, 0.7);
      spawnParticles(curPlayer.x + aimDirX * 60, curPlayer.y, '#78716C', 28, 'spark');
      const golem: SummonedAlly = {
        id: `golem_${now}`,
        kind: 'golem',
        ownerId: curPlayer.id,
        x: curPlayer.x + aimDirX * 70,
        y: curPlayer.y + aimDirY * 70,
        facing: curPlayer.facing,
        hp: 900,
        maxHp: 900,
        atk: Math.round(curPlayer.stats.atk * 2.4),
        speed: 2.4,
        attackTimer: 0.4,
        life: 28,
        maxLife: 28,
        scale: 2.65,
      };
      summonsRef.current = [...summonsRef.current.filter((s) => s.kind !== 'golem'), golem];
      setSummons([...summonsRef.current]);
    }
  }, [showToast, triggerShake, handleJump, spawnParticles]);

  // Main Loop (Physics, Movement, Bhop, Projectiles, Boss Patterns)
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const clearHordeEntities = () => {
      monstersRef.current = monstersRef.current.filter((m) => m.zone !== HORDE_ZONE_ID);
      setMonsters([...monstersRef.current]);
      dropItemsRef.current = dropItemsRef.current.filter((d) => !d.isXpGem);
      setDropItems([...dropItemsRef.current]);
    };

    const startHordeNow = () => {
      const p = playerRef.current;
      const savedReturnX = hordeRunRef.current.returnX || p.x;
      const savedReturnY = hordeRunRef.current.returnY || p.y;
      const run: HordeRunState = {
        ...createEmptyHordeRun(),
        active: true,
        returnX: savedReturnX,
        returnY: savedReturnY,
      };
      hordeRunRef.current = run;
      setHordeRun({ ...run, blindness: { ...run.blindness } });
      hordeHazardsRef.current = [];
      leakFireAccRef.current = 0;
      clearHordeFx();
      const next: Player = {
        ...p,
        x: HORDE_ARENA.cx,
        y: HORDE_ARENA.cy,
        vx: 0,
        vy: 0,
        jumpZ: 0,
        jumpVz: 0,
        currentZone: HORDE_ZONE_ID,
      };
      playerRef.current = next;
      setPlayer(next);
      const intro = spawnHordeIntro(next.x, next.y, next.id);
      monstersRef.current = [...monstersRef.current.filter((m) => m.zone !== HORDE_ZONE_ID), ...intro];
      setMonsters([...monstersRef.current]);
      showToast('NULLSPACE OPEN', 'Endless slaughter. New type every 20s. Boss every minute.', '☠️');
      spawnParticles(next.x, next.y, '#22D3EE', 48, 'spark');
      sound.playBossRoar();
    };

    const endHordeNow = (reason: HordeEndReason, doTeleport: boolean) => {
      const run = hordeRunRef.current;
      const bonus = hordeExtractBonus(run.kills, run.elapsed);
      clearHordeEntities();
      hordeHazardsRef.current = [];
      clearHordeFx();
      setCurrentBoss(null);
      const empty = createEmptyHordeRun();
      hordeRunRef.current = empty;
      setHordeRun(empty);
      if (reason === 'extract') {
        awardExpAndGold(bonus.exp, bonus.gold);
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.55 } });
        showToast('EXTRACTED 💎', `${formatHordeTime(run.elapsed)} • ${run.kills} kills • +${bonus.gold}G`, '🚪');
      } else if (reason === 'death') {
        showToast('NULLSPACE FAILED', `${run.kills} kills. Ember EXP kept.`, '💀');
      }
      if (doTeleport) {
        const p = playerRef.current;
        const next: Player = {
          ...p,
          x: run.returnX || 650,
          y: run.returnY || 750,
          vx: 0,
          vy: 0,
          jumpZ: 0,
          jumpVz: 0,
        };
        playerRef.current = next;
        setPlayer(next);
        spawnParticles(next.x, next.y, '#22D3EE', 28, 'spark');
        sound.playRespawnFanfare();
      }
    };
    endHordeRunRef.current = endHordeNow;

    const tick = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      const curPlayer = playerRef.current;

      // Skip tick updates entirely during character creation (so default player doesn't get attacked)
      if (curPlayer.id === 'default') {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      const fade = worldFadeRef.current;
      if (fade.phase !== 'none') {
        fade.t += dt;
        const pFade = Math.min(1, fade.t / HORDE_FADE_SECONDS);
        if (fade.phase === 'out') {
          setWorldFade(pFade);
          if (pFade >= 1) {
            if (fade.pending === 'enter') startHordeNow();
            else if (fade.pending === 'extract' && hordeRunRef.current.active) endHordeNow('extract', true);
            fade.phase = 'in';
            fade.t = 0;
            fade.pending = null;
          }
        } else {
          setWorldFade(1 - pFade);
          if (pFade >= 1) {
            fade.phase = 'none';
            fade.t = 0;
            setWorldFade(0);
          }
        }
      }

      // 0. Player Death & Respawn System
      if (curPlayer.stats.hp <= 0) {
        if (!curPlayer.isRespawning) {
          if (hordeRunRef.current.active) {
            endHordeNow('death', false);
            if (worldFadeRef.current.pending === 'extract') {
              worldFadeRef.current.pending = null;
            }
          }
          const deathPlayer: Player = {
            ...curPlayer,
            isRespawning: true,
            respawnTimer: 3.0,
            state: 'dead',
          };
          playerRef.current = deathPlayer;
          setPlayer(deathPlayer);
          sound.playMonsterDeath();
          triggerShake(12, 0.4);
        } else {
          const nextTimer = (curPlayer.respawnTimer ?? 3.0) - dt;
          if (nextTimer <= 0) {
            // Revive at Campsite
            const revivedPlayer: Player = {
              ...curPlayer,
              x: 650,
              y: 750,
              vx: 0,
              vy: 0,
              jumpZ: 0,
              jumpVz: 0,
              isJumping: false,
              dodgeTimer: 1.8, // Invulnerability recovery shield
              dodgeCooldown: 0,
              stats: {
                ...curPlayer.stats,
                hp: curPlayer.stats.maxHp,
                mp: curPlayer.stats.maxMp,
              },
              stamina: curPlayer.maxStamina,
              state: 'idle',
              isRespawning: false,
              respawnTimer: undefined,
            };
            playerRef.current = revivedPlayer;
            setPlayer(revivedPlayer);
            sound.playRespawnFanfare();
            showToast('REVIVED! 🌟', 'You respawned safely at the Camp!', '✨');
            spawnParticles(650, 750, '#38BDF8', 25, 'spark');
          } else {
            const deathPlayer: Player = {
              ...curPlayer,
              respawnTimer: nextTimer,
            };
            playerRef.current = deathPlayer;
            setPlayer(deathPlayer);
          }
        }
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      // Update screen shake decay
      if (screenShakeRef.current.duration > 0) {
        screenShakeRef.current.duration = Math.max(0, screenShakeRef.current.duration - dt);
        if (screenShakeRef.current.duration === 0) {
          screenShakeRef.current.intensity = 0;
        }
        setScreenShake({ ...screenShakeRef.current });
      }

      // ====== INTRO CINEMATIC STATE MACHINE ======
      const curCinematic = introCinematicRef.current;
      if (curCinematic.phase !== 'none' && curCinematic.phase !== 'complete') {
        const ct = curCinematic.timer + dt;
        const phase = curCinematic.phase;
        let nextPhase: IntroCinematicPhase = phase;
        let fallingY = curCinematic.fallingWeaponY;
        let bonkTriggered = curCinematic.bonkTriggered ?? false;
        let pickupTriggered = curCinematic.pickupTriggered ?? false;

        if (phase === 'black_fade_in') {
          // Phase 1: Fade from black (0.0s - 0.4s)
          if (ct >= 0.4) {
            nextPhase = 'dive';
            sound.playDiveWhoosh();
            const updated = {
              ...playerRef.current,
              y: -200,
              x: 650,
              jumpZ: 900,
              cinematicPose: 'dive' as const,
              hideWeapon: true,
            };
            playerRef.current = updated;
            setPlayer(updated);
          }
        } else if (phase === 'dive') {
          // Phase 2: Supersonic dive from sky (0.0s - 1.0s)
          const diveProgress = Math.min(1, ct / 1.0);
          const eased = diveProgress * diveProgress; // Accelerating ease
          const newY = -200 + (750 - (-200)) * eased;
          const newJumpZ = 900 * (1 - eased);

          const updated = {
            ...playerRef.current,
            y: newY,
            x: 650,
            jumpZ: Math.max(0, newJumpZ),
            cinematicPose: 'dive' as const,
            hideWeapon: true,
          };
          playerRef.current = updated;
          setPlayer(updated);

          // Spawn speed particles during dive
          if (Math.random() < 0.6) {
            spawnParticles(650 + (Math.random() - 0.5) * 30, newY + 20, '#EF4444', 2, 'spark');
          }

          if (ct >= 1.0) {
            nextPhase = 'impact';
            sound.playCrashSlam();
            triggerShake(20, 0.6);
            spawnParticles(650, 750, '#F59E0B', 35, 'spark');
            spawnParticles(650, 750, '#78716C', 25, 'smoke');
            addGroundDecal(650, 760, '#1C1917', 40);
            addGroundDecal(645, 755, '#78716C', 30);
            addDamagePopup(615, 680, 'БАБАХ!', '#FDE047', true, false, 'manga', 1.7, 0, -25);
            addDamagePopup(660, 715, 'ВЖУУУХ!', '#38BDF8', true, false, 'manga', 1.4, 8, -12);
            const impactPlayer = {
              ...playerRef.current,
              y: 750,
              x: 650,
              jumpZ: 0,
              cinematicPose: 'skid' as const,
              hideWeapon: true,
              facing: 'right' as const,
            };
            playerRef.current = impactPlayer;
            setPlayer(impactPlayer);
          }
        } else if (phase === 'impact') {
          // Phase 3: Brief impact moment before skid (0.0s - 0.1s)
          if (ct >= 0.1) {
            nextPhase = 'skid';
            sound.playSkid();
            addDamagePopup(690, 725, 'КРАШ!', '#EF4444', false, false, 'manga', 1.2, 5, -15);
          }
        } else if (phase === 'skid') {
          // Phase 4: Ground skid ~10 meters/230px (0.0s - 1.2s)
          const skidProgress = Math.min(1, ct / 1.2);
          const skidEase = 1 - Math.pow(1 - skidProgress, 3); // Decelerating
          const skidX = 650 + 230 * skidEase;

          const skidPlayer = {
            ...playerRef.current,
            x: skidX,
            y: 750,
            jumpZ: 0,
            cinematicPose: 'skid' as const,
            hideWeapon: true,
            facing: 'right' as const,
          };
          playerRef.current = skidPlayer;
          setPlayer(skidPlayer);

          // Skid sparks and trail
          if (Math.random() < 0.7) {
            spawnParticles(skidX - 15, 762, '#F59E0B', 2, 'spark');
            if (Math.random() < 0.3) {
              addGroundDecal(skidX - 10, 760, '#78716C', 10);
            }
          }

          if (ct >= 1.2) {
            nextPhase = 'dazed';
            triggerShake(4, 0.2);
            const dazedPlayer = {
              ...playerRef.current,
              x: 880,
              y: 750,
              cinematicPose: 'dazed' as const,
              hideWeapon: true,
            };
            playerRef.current = dazedPlayer;
            setPlayer(dazedPlayer);
          }
        } else if (phase === 'dazed') {
          // Phase 5: Dazed on ground (0.0s - 0.8s)
          if (ct >= 0.8) {
            nextPhase = 'brush';
            const brushPlayer = {
              ...playerRef.current,
              cinematicPose: 'brush' as const,
              hideWeapon: true,
            };
            playerRef.current = brushPlayer;
            setPlayer(brushPlayer);
          }
        } else if (phase === 'brush') {
          // Phase 6: Brushing off dust (0.0s - 1.0s)
          if (ct >= 1.0) {
            nextPhase = 'gun_fall_bonk';
            fallingY = -300;
            const nonePlayer = {
              ...playerRef.current,
              cinematicPose: 'none' as const,
              hideWeapon: true,
            };
            playerRef.current = nonePlayer;
            setPlayer(nonePlayer);
          }
        } else if (phase === 'gun_fall_bonk') {
          // Phase 7: Weapon falls from sky and bonks head (0.0s - 1.6s)
          fallingY = -300 + (ct / 0.8) * 300; // Falls to head level (y=0 relative)

          if (ct >= 0.8 && !bonkTriggered) {
            bonkTriggered = true;
            sound.playBonk();
            sound.playOuchGrunt();
            triggerShake(8, 0.3);
            addDamagePopup(880, 665, '💥 АЙ БОЛЬНО!', '#EF4444', true, false, 'manga', 1.6, 0, -22);
            const bonkPlayer = {
              ...playerRef.current,
              cinematicPose: 'bonk' as const,
              hideWeapon: true,
            };
            playerRef.current = bonkPlayer;
            setPlayer(bonkPlayer);
          }

          if (ct >= 1.6) {
            nextPhase = 'pickup_ready';
            const pickupPlayer = {
              ...playerRef.current,
              cinematicPose: 'pickup' as const,
              hideWeapon: true,
            };
            playerRef.current = pickupPlayer;
            setPlayer(pickupPlayer);
          }
        } else if (phase === 'pickup_ready') {
          // Phase 8: Pick up weapon and battle ready (0.0s - 1.4s)
          if (ct < 0.7) {
            // Picking up
          } else if (ct >= 0.7 && !pickupTriggered) {
            pickupTriggered = true;
            sound.playPickup();
            const readyPlayer = {
              ...playerRef.current,
              cinematicPose: 'ready' as const,
              hideWeapon: false,
            };
            playerRef.current = readyPlayer;
            setPlayer(readyPlayer);
          }

          if (ct >= 1.4) {
            nextPhase = 'complete';
            addDamagePopup(880, 710, 'READY FOR COMBAT!', '#10B981', false, false, 'system', 1.3, 0, -15);
            const completePlayer = {
              ...playerRef.current,
              cinematicPose: undefined,
              hideWeapon: false,
              spawnBounce: 1,
            };
            playerRef.current = completePlayer;
            setPlayer(completePlayer);
          }
        }

        if (nextPhase !== phase) {
          const nextState: IntroCinematicState = {
            phase: nextPhase,
            timer: 0,
            fallingWeaponY: fallingY,
            bonkTriggered: false,
            pickupTriggered: false,
          };
          introCinematicRef.current = nextState;
          setIntroCinematic(nextState);
        } else {
          const nextState: IntroCinematicState = {
            phase,
            timer: ct,
            fallingWeaponY: fallingY,
            bonkTriggered,
            pickupTriggered,
          };
          introCinematicRef.current = nextState;
          setIntroCinematic(nextState);
        }

        // During cinematic, skip normal player update
        if (nextPhase !== 'complete') {
          animationFrameId = requestAnimationFrame(tick);
          return;
        }
      }

      // 1. Calculate Input Directions
      let moveX = 0;
      let moveY = 0;

      if (keysRef.current['KeyA'] || keysRef.current['ArrowLeft']) moveX -= 1;
      if (keysRef.current['KeyD'] || keysRef.current['ArrowRight']) moveX += 1;
      if (keysRef.current['KeyW'] || keysRef.current['ArrowUp']) moveY -= 1;
      if (keysRef.current['KeyS'] || keysRef.current['ArrowDown']) moveY += 1;

      if (joystickVectorRef.current.x !== 0 || joystickVectorRef.current.y !== 0) {
        moveX = joystickVectorRef.current.x;
        moveY = joystickVectorRef.current.y;
      }

      // Stand still and inspect gun when modding weapon
      if (isModdingWeaponRef.current) {
        moveX = 0;
        moveY = 0;
      }

      // Normalize movement vector
      const mag = Math.sqrt(moveX * moveX + moveY * moveY);
      if (mag > 1) {
        moveX /= mag;
        moveY /= mag;
      }

      const isWalking = mag > 0.05;

      // Jump & Bhop Physics
      let jumpZ = curPlayer.jumpZ ?? 0;
      let jumpVz = curPlayer.jumpVz ?? 0;
      let isJumping = curPlayer.isJumping ?? false;
      let curElevation = curPlayer.elevationZ ?? 0;
      let occupancy: Occupancy = {
        buildingId: curPlayer.interiorBuildingId ?? null,
        floor: curPlayer.interiorFloor ?? 0,
      };
      let fallStartZ = curPlayer.fallStartZ;
      let bhopTimer = Math.max(0, (curPlayer.bhopTimer ?? 0) - dt);
      let bhopStreak = curPlayer.bhopStreak ?? 0;
      let bhopSpeedMult = curPlayer.bhopSpeedMult ?? 1.0;

      let skateTrick = curPlayer.skateTrick ?? null;
      let skateTrickTimer = Math.max(0, (curPlayer.skateTrickTimer ?? 0) - dt);
      let skateTrickDuration = curPlayer.skateTrickDuration ?? 0;
      let coolness = curPlayer.coolness ?? 0;
      let coolStreak = curPlayer.coolStreak ?? 0;
      let coolStreakTimer = Math.max(0, (curPlayer.coolStreakTimer ?? 0) - dt);
      let airTricksThisJump = curPlayer.airTricksThisJump ?? 0;
      let skateGold = curPlayer.gold;
      if (coolStreakTimer <= 0) coolStreak = 0;
      if (skateTrickTimer <= 0) skateTrick = null;

      const fireSkateTrick = (trick: SkateTrickId) => {
        const awarded = applySkateTrick(
          {
            ...curPlayer,
            gold: skateGold,
            coolness,
            coolStreak,
            coolStreakTimer,
            airTricksThisJump,
          },
          trick
        );
        skateTrick = awarded.player.skateTrick ?? trick;
        skateTrickTimer = awarded.player.skateTrickTimer ?? SKATE_TRICKS[trick].duration;
        skateTrickDuration = awarded.player.skateTrickDuration ?? SKATE_TRICKS[trick].duration;
        coolness = awarded.player.coolness ?? 0;
        coolStreak = awarded.player.coolStreak ?? 0;
        coolStreakTimer = awarded.player.coolStreakTimer ?? 2.8;
        airTricksThisJump = awarded.player.airTricksThisJump ?? 0;
        skateGold = awarded.player.gold;
        sound.playSkateTrick(trick);
        spawnParticles(curPlayer.x, curPlayer.y + 8, awarded.color, trick === 'treflip' ? 18 : 10, 'spark');
        addDamagePopup(curPlayer.x, curPlayer.y - 30, awarded.label, awarded.color, true, false, 'manga', trick === 'treflip' ? 1.55 : 1.3, 0, -20);
        if (trick === 'treflip' && coolStreak >= 3) {
          confetti({ particleCount: 28, spread: 50, origin: { y: 0.62 }, colors: ['#C084FC', '#FDE047', '#38BDF8'] });
        }
      };

      // 2. Active Dodge Roll & Air Dash (Shift Key with I-Frames & Extended Slide Distance)
      let dodgeTimer = Math.max(0, (curPlayer.dodgeTimer ?? 0) - dt);
      let dodgeCooldown = Math.max(0, (curPlayer.dodgeCooldown ?? 0) - dt);
      let dashVx = curPlayer.dashVx ?? 0;
      let dashVy = curPlayer.dashVy ?? 0;
      let isAirDash = curPlayer.isAirDash ?? false;

      const drivingCar = isDrivingHijackCar(curPlayer);
      const skating = isSkating(curPlayer);

      const isShiftPressed = keysRef.current['ShiftLeft'] || keysRef.current['ShiftRight'] || joystickSprintRef.current;
      if (!drivingCar && isShiftPressed && dodgeCooldown <= 0 && dodgeTimer <= 0) {
        isAirDash = jumpZ > 3;
        dodgeTimer = skating ? 0.44 : 0.52;
        dodgeCooldown = skating ? 0.52 : 0.62;

        let dashDirX = moveX;
        let dashDirY = moveY;
        if (dashDirX === 0 && dashDirY === 0) {
          dashDirX = curPlayer.facing === 'left' ? -1 : 1;
          dashDirY = 0;
        }
        const dMag = Math.sqrt(dashDirX * dashDirX + dashDirY * dashDirY) || 1;
        dashDirX /= dMag;
        dashDirY /= dMag;

        const dashSpeed = skating ? (isAirDash ? 980 : 780) : isAirDash ? 850 : 960;
        dashVx = dashDirX * dashSpeed;
        dashVy = dashDirY * dashSpeed;

        if (skating) {
          if (isAirDash) {
            fireSkateTrick('treflip');
            jumpVz = Math.max(jumpVz, 80) + 110;
            isJumping = true;
          } else {
            fireSkateTrick('ollie');
            jumpZ = Math.max(jumpZ, 1);
            jumpVz = 390;
            isJumping = true;
            fallStartZ = curElevation;
          }
        } else {
          sound.playDodgeRoll();
          spawnParticles(curPlayer.x, curPlayer.y + 10, isAirDash ? '#38BDF8' : '#FDE047', 12, 'spark');
        }
      }

      if (dodgeTimer > 0 && Math.random() < 0.4 && jumpZ <= 1 && !skating) {
        spawnParticles(curPlayer.x, curPlayer.y + 12, '#F59E0B', 2, 'spark');
      }

      // Base Speed calculation (including Spirit Shrine speed buffs)
      let speedBuffMult = 1.0;
      if (curPlayer.activeBuffs && curPlayer.activeBuffs.length > 0) {
        const now = Date.now();
        curPlayer.activeBuffs.forEach((b) => {
          if (b.expiresAt > now && b.type === 'speed') {
            speedBuffMult += b.value;
          }
        });
      }

      let baseSpeed = curPlayer.stats.speed * 48 * speedBuffMult;
      if (drivingCar) baseSpeed *= 4.4;
      else if (skating) {
        const board = equippedSkate(curPlayer);
        const vehSpd = board?.vehicleSpeed ?? 25;
        baseSpeed *= 1.55 + vehSpd / 50;
      } else if (curPlayer.isRiding) baseSpeed *= 1.8;
      baseSpeed *= bhopSpeedMult;

      let nextX = curPlayer.x;
      let nextY = curPlayer.y;

      if (dodgeTimer > 0) {
        nextX += dashVx * dt;
        nextY += dashVy * dt;
        dashVx *= 0.96;
        dashVy *= 0.96;
      } else {
        nextX += moveX * baseSpeed * dt;
        nextY += moveY * baseSpeed * dt;
      }

      const ride = elevatorRideRef.current;
      ride.cooldown = Math.max(0, ride.cooldown - dt);
      ride.active = false;

      if (!occupancy.buildingId && ride.cooldown <= 0 && !drivingCar) {
        for (const b of BUILDINGS) {
          if (!pointInR(nextX, nextY, b.door)) continue;
          const lobby = getInterior(b.id, 0);
          if (!lobby) continue;
          nextX = lobby.spawn.x;
          nextY = lobby.spawn.y;
          occupancy = { buildingId: b.id, floor: 0 };
          ride.cooldown = 0.7;
          sound.playJump();
          showToast(b.name, lobby.name, '🏢');
          addDamagePopup(nextX, nextY - 28, lobby.name, '#22D3EE', true, false, 'system', 1.15, 0, -12);
          break;
        }
      } else if (occupancy.buildingId) {
        const fl = getInterior(occupancy.buildingId, occupancy.floor);
        const bldg = getBuilding(occupancy.buildingId);
        if (fl?.exitPad && bldg && ride.cooldown <= 0 && pointInR(nextX, nextY, fl.exitPad)) {
          nextX = bldg.streetSpawn.x;
          nextY = bldg.streetSpawn.y;
          occupancy = { buildingId: null, floor: 0 };
          ride.cooldown = 0.7;
          sound.playJump();
          showToast('Улица', bldg.shortName, '🚪');
        } else if (fl && isInElevator(nextX, nextY, occupancy) && !drivingCar) {
          nextX = fl.elevator.x + fl.elevator.width / 2;
          nextY = fl.elevator.y + fl.elevator.height / 2;
          const intent = getElevatorIntent(moveY);
          if (intent && ride.cooldown <= 0 && bldg) {
            const nextFloor = intent === 'up' ? occupancy.floor + 1 : occupancy.floor - 1;
            const dest = nextFloor >= 0 && nextFloor < bldg.floors.length ? getInterior(bldg.id, nextFloor) : undefined;
            if (dest) {
              occupancy = { buildingId: bldg.id, floor: nextFloor };
              nextX = dest.elevator.x + dest.elevator.width / 2;
              nextY = dest.elevator.y + dest.elevator.height / 2;
              ride.cooldown = 0.55;
              sound.playJump();
              addDamagePopup(nextX, nextY - 28, dest.name, '#22D3EE', true, false, 'system', 1.2, 0, -12);
              showToast(bldg.shortName, dest.name, '🛗');
            }
          }
        }
      }

      // 3. Elevation & Platform / Cliff Fall Detection
      const targetGroundElev = ride.active ? curElevation : getGroundElevation(nextX, nextY, occupancy);

      // If stepping off high plateau / bridge into thin air: initiate free-fall!
      if (curElevation > targetGroundElev && jumpZ <= 0) {
        jumpZ = curElevation - targetGroundElev;
        jumpVz = 0;
        fallStartZ = curElevation;
        curElevation = targetGroundElev;
        isJumping = true;
      } else if (jumpZ <= 0) {
        curElevation = targetGroundElev;
      }

      // Jump & Gravity Physics
      if (!drivingCar && keysRef.current['Space'] && jumpZ <= 0) {
        jumpZ = 1;
        jumpVz = skating ? 380 : 350;
        isJumping = true;
        fallStartZ = curElevation;
        if (bhopTimer > 0) {
          bhopStreak = Math.min(10, bhopStreak + 1);
          bhopSpeedMult = 1.0 + bhopStreak * 0.12;
        } else {
          bhopStreak = 1;
          bhopSpeedMult = 1.1;
        }
        bhopTimer = 0.45;
        if (skating) {
          fireSkateTrick('kickflip');
        } else {
          sound.playJump();
          spawnParticles(curPlayer.x, curPlayer.y + 10, '#38BDF8', 4, 'spark');
        }
      } else if (jumpZ > 0 || jumpVz !== 0) {
        jumpZ = Math.max(0, jumpZ + jumpVz * dt);
        jumpVz -= 720 * dt; // Gravity

        // Landing Detection
        if (jumpZ <= 0) {
          jumpZ = 0;
          jumpVz = 0;
          isJumping = false;
          bhopTimer = 0.35;
          curElevation = targetGroundElev;

          if (skating && airTricksThisJump > 0) {
            const landPts = 45 + airTricksThisJump * 35;
            const landMult = 1 + Math.max(0, coolStreak - 1) * 0.2;
            const awardedLand = Math.round(landPts * landMult);
            coolness += awardedLand;
            skateGold += Math.max(1, Math.floor(awardedLand / 40));
            coolStreakTimer = 2.8;
            const landLabel = airTricksThisJump >= 2 ? `SICK LINE! +${awardedLand}` : `CLEAN LANDING +${awardedLand}`;
            addDamagePopup(nextX, nextY - 22, landLabel, '#FDE047', true, false, 'manga', airTricksThisJump >= 2 ? 1.45 : 1.2, 0, -16);
            spawnParticles(nextX, nextY + 10, '#FDE047', 12, 'spark');
            airTricksThisJump = 0;
          }

          // Huge fall landing slam impact!
          if (fallStartZ !== undefined && (fallStartZ - curElevation) >= 65) {
            const dropDist = fallStartZ - curElevation;
            triggerShake(Math.min(18, dropDist * 0.12), 0.35);
            sound.playCrashSlam();
            addDamagePopup(nextX, nextY - 10, 'БАХ!', '#FDE047', true, false, 'manga', 1.5, 0, -20);
            spawnParticles(nextX, nextY + 12, '#78716C', 20, 'smoke');
            spawnParticles(nextX, nextY + 12, '#F59E0B', 15, 'spark');
            addGroundDecal(nextX, nextY + 10, '#1C1917', 28);
          }
          fallStartZ = undefined;
        }
      }

      if (bhopTimer <= 0 && jumpZ <= 0) {
        bhopStreak = 0;
        bhopSpeedMult = 1.0;
      }

      // Obstacle Collision with vaulting & elevation support
      if (!occupancy.buildingId) {
        const resolvedPos = resolveObstacleCollisions(nextX, nextY, curElevation, jumpZ, 18, resourceNodesRef.current);
        nextX = resolvedPos.x;
        nextY = resolvedPos.y;
      }
      const buildingResolved = resolveBuildingCollisions(nextX, nextY, curElevation, jumpZ, 18, occupancy);
      nextX = buildingResolved.x;
      nextY = buildingResolved.y;
      if (occupancy.buildingId) {
        const fl = getInterior(occupancy.buildingId, occupancy.floor);
        if (fl) {
          const clamped = clampToInteriorWalkable(nextX, nextY, fl, 18);
          nextX = clamped.x;
          nextY = clamped.y;
        }
      } else if (hordeRunRef.current.active || isInHordeArena(nextX, nextY)) {
        const clamped = clampToHordeArena(nextX, nextY, 48);
        nextX = clamped.x;
        nextY = clamped.y;
        const pushed = pushOutOfHordeFeatures(nextX, nextY, 18);
        nextX = pushed.x;
        nextY = pushed.y;
        if (pushed.inVoid && jumpZ < 12) {
          const voidDmg = Math.max(1, Math.round(14 * dt));
          setPlayer((prev) => ({
            ...prev,
            stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - voidDmg) },
          }));
        }
      } else {
        nextX = Math.max(50, Math.min(WORLD_WIDTH - 50, nextX));
        nextY = Math.max(50, Math.min(WORLD_HEIGHT - 50, nextY));
      }

      // Check World POIs (Bouncy mushrooms, steam geysers, spirit shrines, loot caches)
      if (!occupancy.buildingId) {
      worldPoisRef.current.forEach((poi) => {
        const pdx = nextX - poi.x;
        const pdy = nextY - poi.y;
        const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
        const triggerRad = poi.radius || 35;

        if (pDist <= triggerRad) {
          if ((poi.elevationZ ?? 0) > 40 && !occupancyMatchesObject(occupancy, poi)) {
            return;
          }
          if (poi.type === 'bouncy_mushroom' && jumpZ <= 20) {
            jumpZ = 15;
            jumpVz = 540;
            isJumping = true;
            fallStartZ = curElevation + 180;
            sound.playJump();
            triggerShake(6, 0.2);
            spawnParticles(poi.x, poi.y, '#34D399', 18, 'spark');
            addDamagePopup(poi.x, poi.y - 30, 'ПРУЖИНА! 🍄', '#34D399', true, false, 'manga', 1.4, 0, -18);
          } else if (poi.type === 'steam_geyser' && jumpZ <= 30) {
            jumpZ = 25;
            jumpVz = 600;
            isJumping = true;
            fallStartZ = curElevation + 200;
            sound.playDiveWhoosh();
            triggerShake(8, 0.35);
            spawnParticles(poi.x, poi.y, '#38BDF8', 25, 'smoke');
            spawnParticles(poi.x, poi.y, '#E0F2FE', 15, 'spark');
            addDamagePopup(poi.x, poi.y - 30, 'ВЖУУУХ! 💨', '#38BDF8', true, false, 'manga', 1.5, 0, -22);
          } else if (poi.type === 'spirit_shrine') {
            const now = Date.now();
            if (!poi.lastActivated || now - poi.lastActivated > 30000) {
              poi.lastActivated = now;
              sound.playLevelUp();
              triggerShake(5, 0.25);
              spawnParticles(poi.x, poi.y, '#C084FC', 30, 'spark');
              spawnParticles(poi.x, poi.y, '#A855F7', 20, 'smoke');
              addDamagePopup(poi.x, poi.y - 35, 'ДУХ СКОРОСТИ! +45% 🎐', '#C084FC', true, false, 'damage', 1.4);
              showToast('СВЯТИЛИЩЕ ДУХОВ АКТИВИРОВАНО! 🎐', 'Благословение ветра: +45% Скорости!', '✨');
              setPlayer((p) => ({
                ...p,
                activeBuffs: [
                  ...p.activeBuffs.filter((b) => b.type !== 'speed'),
                  { type: 'speed', value: 0.45, expiresAt: Date.now() + 25000 },
                ],
              }));
            }
          } else if (poi.type === 'fire_hydrant' && jumpZ <= 30) {
            jumpZ = 20;
            jumpVz = 620;
            isJumping = true;
            fallStartZ = curElevation + 220;
            sound.playDiveWhoosh();
            triggerShake(8, 0.3);
            spawnParticles(poi.x, poi.y, '#38BDF8', 25, 'spark');
            spawnParticles(poi.x, poi.y, '#E0F2FE', 20, 'smoke');
            addDamagePopup(poi.x, poi.y - 30, 'ГИДРАНТ! 🚰', '#38BDF8', true, false, 'manga', 1.5, 0, -22);
          } else if (poi.type === 'vending_machine') {
            const now = Date.now();
            if (!poi.lastActivated || now - poi.lastActivated > 8000) {
              poi.lastActivated = now;
              sound.playPickup();
              triggerShake(4, 0.2);
              spawnParticles(poi.x, poi.y, '#38BDF8', 20, 'spark');
              addDamagePopup(poi.x, poi.y - 30, 'КИБЕР-КОЛА! 🥤', '#38BDF8', true, false, 'damage', 1.3);
              showToast('АВТОМАТ ВЫДАЛ ЭНЕРГЕТИК!', '+50 HP & Энергия!', '🥤');
              if (poi.lootTable) {
                poi.lootTable.forEach((d) => {
                  if (Math.random() <= d.chance) {
                    const qty = Math.floor(Math.random() * (d.maxQty - d.minQty + 1)) + d.minQty;
                    spawnDrop(d.itemId, poi.x, poi.y + 25, qty);
                  }
                });
              }
            }
          } else if ((poi.type === 'treehouse_cache' || poi.type === 'minecart_cart' || poi.type === 'treasure_chest') && !poi.isLooted) {
            poi.isLooted = true;
            sound.playPickup();
            triggerShake(5, 0.2);
            spawnParticles(poi.x, poi.y, '#FACC15', 25, 'spark');
            addDamagePopup(poi.x, poi.y - 30, 'ТАЙНИК НАЙДЕН! 🎁', '#FACC15', true, false, 'damage', 1.4);
            showToast('ТАЙНИК ОБНАРУЖЕН! 🏆', poi.name, poi.icon || '🎁');
            if (poi.lootTable) {
              poi.lootTable.forEach((d) => {
                if (Math.random() <= d.chance) {
                  const qty = Math.floor(Math.random() * (d.maxQty - d.minQty + 1)) + d.minQty;
                  spawnDrop(d.itemId, poi.x, poi.y, qty);
                }
              });
            }
            setWorldPois([...worldPoisRef.current]);
          } else if (poi.id === 'poi_hostingovaya_checkpoint' && !hostingovayaAlarmRef.current) {
            hostingovayaAlarmRef.current = true;
            sound.playBossRoar();
            triggerShake(8, 0.3);
            showToast('🚨 ПУНКТ ОХРАНЫ ПРОЙДЕН!', 'Внимание! Нарушение периметра! Охрана и сисадмины подняты по тревоге!', '🚨');
            addDamagePopup(poi.x, poi.y - 30, 'ТРЕВОГА! 🚨', '#EF4444', true, false, 'manga', 1.5, 0, -20);
          }
        }
      });
      }

      const facing = moveX < -0.1 ? 'left' : moveX > 0.1 ? 'right' : curPlayer.facing;
      const nextAttackTimer = Math.max(0, curPlayer.attackTimer - dt);
      const nextSpawnBounce = Math.min(1, (curPlayer.spawnBounce ?? 1) + dt * 3.5);

      // Update Reloading Timer & Magazine State
      let isReloading = curPlayer.isReloading ?? false;
      let reloadTimer = curPlayer.reloadTimer ?? 0;
      const activeWeapon = curPlayer.equipment.weapon || ITEMS_DATABASE['wpn_starter_pistol'];
      const activeGunType: GunType = activeWeapon.gunType || 'pistol';
      const wpnConfig = WEAPON_CONFIGS[activeGunType] || WEAPON_CONFIGS.pistol;
      const curMaxAmmo = curPlayer.maxAmmo ?? wpnConfig.maxAmmo;
      let currentAmmo = curPlayer.ammo !== undefined ? curPlayer.ammo : curMaxAmmo;

      if (isReloading) {
        reloadTimer = Math.max(0, reloadTimer - dt);
        if (reloadTimer <= 0) {
          isReloading = false;
          currentAmmo = curMaxAmmo;
          sound.playPickup();
          addDamagePopup(nextX, nextY - 24, 'RELOADED!', '#FACC15', true, false, 'damage', 1.2);
        }
      }

      // Compute live aim angle from mouse position
      const mDx = (mouseWorldPosRef.current.x || (nextX + (facing === 'left' ? -200 : 200))) - nextX;
      const mDy = (mouseWorldPosRef.current.y || nextY) - nextY;
      const liveAimAngle = Math.atan2(mDy, mDx);

      const nextPlayer: Player = {
        ...curPlayer,
        x: nextX,
        y: nextY,
        vx: dodgeTimer > 0 ? dashVx : moveX * baseSpeed,
        vy: dodgeTimer > 0 ? dashVy : moveY * baseSpeed,
        facing,
        state: drivingCar || skating
          ? 'riding'
          : dodgeTimer > 0
            ? 'dodge'
            : nextAttackTimer > 0
              ? 'attack'
              : isWalking
                ? 'walk'
                : 'idle',
        isRiding: drivingCar ? true : curPlayer.isRiding,
        hideWeapon: drivingCar ? true : curPlayer.hideWeapon,
        gold: skateGold,
        skateTrick,
        skateTrickTimer,
        skateTrickDuration,
        coolness,
        coolStreak,
        coolStreakTimer,
        airTricksThisJump,
        elevationZ: curElevation,
        interiorBuildingId: occupancy.buildingId,
        interiorFloor: occupancy.floor,
        fallStartZ,
        jumpZ,
        jumpVz,
        isJumping,
        bhopStreak,
        bhopTimer,
        bhopSpeedMult,
        isSprinting: true,
        attackTimer: nextAttackTimer,
        dodgeTimer,
        dodgeCooldown,
        dashVx,
        dashVy,
        isAirDash,
        aimAngle: liveAimAngle,
        isAiming: isAimingRef.current,
        isInspectingWeapon: isModdingWeaponRef.current,
        ammo: currentAmmo,
        maxAmmo: curMaxAmmo,
        isReloading,
        reloadTimer,
        spawnBounce: nextSpawnBounce,
      };

      playerRef.current = nextPlayer;
      setPlayer(nextPlayer);
      net.updatePosition(nextPlayer);

      const zoneNow = ZONES.find((z) => (
        nextX >= z.bounds.minX && nextX <= z.bounds.maxX &&
        nextY >= z.bounds.minY && nextY <= z.bounds.maxY
      ));
      if (zoneNow && zoneNow.id !== lastZoneIdRef.current) {
        lastZoneIdRef.current = zoneNow.id;
        if (zoneNow.id !== HORDE_ZONE_ID) {
          showToast(zoneNow.name, zoneNow.desc, '🗺️');
        }
      }

      updateInteriorWorkers(dt);

      // NPC proximity for [E] interact
      let closestNpc: { type: 'npc'; id: string; name: string } | null = null;
      let closestDist = NPC_INTERACT_RANGE;
      if (!occupancy.buildingId) {
      for (const npc of Object.values(NPCS_DATABASE)) {
        const ndx = nextX - npc.x;
        const ndy = nextY - npc.y;
        const ndist = Math.hypot(ndx, ndy);
        if (ndist < closestDist) {
          closestDist = ndist;
          closestNpc = { type: 'npc', id: npc.id, name: npc.name };
        }
      }
      }
      const prevNearby = nearbyInteractableRef.current;
      if (
        (closestNpc?.id !== prevNearby?.id) ||
        (closestNpc === null && prevNearby !== null)
      ) {
        nearbyInteractableRef.current = closestNpc;
        setNearbyInteractable(closestNpc);
      }

      // Day/night cycle
      gameTimePhaseRef.current = (gameTimePhaseRef.current + dt / DAY_CYCLE_SECONDS) % 1;
      gameTimeUiTimerRef.current += dt;
      if (gameTimeUiTimerRef.current >= 1) {
        gameTimeUiTimerRef.current = 0;
        setGameTimePhase(gameTimePhaseRef.current);
      }

      if (fireHeldRef.current && AUTO_FIRE_GUNS.includes(activeGunType)) {
        handleAttackRef.current(mouseWorldPosRef.current.x, mouseWorldPosRef.current.y);
      }

      // Horde director — infinite slaughter, unlock a type every 20s, boss every 60s
      const horde = hordeRunRef.current;
      if (horde.active) {
        horde.elapsed += dt;
        horde.nextUnlockIn -= dt;
        horde.nextBossIn -= dt;
        horde.canExtract = horde.elapsed >= HORDE_EXTRACT_AFTER;
        const livingHorde = monstersRef.current.filter((m) => m.zone === HORDE_ZONE_ID && m.hp > 0 && m.state !== 'dead').length;
        const cap = hordeLivingCap(horde.elapsed);

        if (horde.blindness.active) {
          if (horde.blindness.casterId) {
            const caster = monstersRef.current.find((m) => m.id === horde.blindness.casterId && m.hp > 0 && m.state !== 'dead');
            if (!caster) {
              horde.blindness.active = false;
              horde.blindness.remaining = 0;
              horde.blindness.casterId = null;
            }
          }
          horde.blindness.remaining -= dt;
          if (horde.blindness.remaining <= 0) {
            horde.blindness.active = false;
            horde.blindness.remaining = 0;
            horde.blindness.casterId = null;
          }
        }

        if (horde.nextUnlockIn <= 0 && horde.unlockedCount < HORDE_ROSTER.length) {
          horde.unlockedCount += 1;
          horde.nextUnlockIn = HORDE_UNLOCK_INTERVAL;
          const entry = HORDE_ROSTER[horde.unlockedCount - 1];
          horde.currentMobName = entry.name;
          horde.nextMobName = HORDE_ROSTER[Math.min(HORDE_ROSTER.length - 1, horde.unlockedCount)]?.name ?? 'MAX';
          const burst = spawnHordeTypeBurst(nextX, nextY, horde.elapsed, nextPlayer.id, entry.kind, Math.min(10, 5 + Math.floor(horde.unlockedCount / 2)))
            .slice(0, Math.max(0, cap - livingHorde + 6));
          if (burst.length > 0) {
            monstersRef.current = [...monstersRef.current, ...burst];
            setMonsters([...monstersRef.current]);
          }
          showToast(`NEW TYPE · ${entry.name}`, entry.toast, entry.icon);
          spawnParticles(nextX, nextY, '#22D3EE', 22, 'spark');
        } else if (horde.unlockedCount >= HORDE_ROSTER.length) {
          horde.nextUnlockIn = HORDE_UNLOCK_INTERVAL;
          horde.nextMobName = 'ALL UNLOCKED';
        }

        if (horde.nextBossIn <= 0) {
          horde.nextBossIn = HORDE_BOSS_INTERVAL;
          const livingBosses = monstersRef.current.filter((m) => m.zone === HORDE_ZONE_ID && m.isBoss && m.hp > 0 && m.state !== 'dead').length;
          if (livingBosses < 2) {
            const bossDef = HORDE_BOSSES[horde.bossIndex % HORDE_BOSSES.length];
            horde.bossIndex += 1;
            const boss = createHordeMob(nextX, nextY, horde.elapsed, nextPlayer.id, bossDef.kind, rollHordeSpawnPoint(nextX, nextY, 380, 560));
            monstersRef.current = [...monstersRef.current, boss];
            setMonsters([...monstersRef.current]);
            setCurrentBoss(boss);
            showToast(`BOSS · ${bossDef.name}`, bossDef.toast, '👑');
            sound.playBossRoar();
            triggerShake(10, 0.35);
          }
        }

        horde.spawnAcc += dt * hordeSpawnRate(horde.elapsed);
        const spawned: Monster[] = [];
        while (horde.spawnAcc >= 1 && livingHorde + spawned.length < cap) {
          horde.spawnAcc -= 1;
          spawned.push(createHordeMob(nextX, nextY, horde.elapsed, nextPlayer.id, pickHordeArchetype(horde.unlockedCount)));
        }
        if (spawned.length > 0) {
          monstersRef.current = [...monstersRef.current, ...spawned];
          setMonsters([...monstersRef.current]);
        }

        horde.hazardAcc += dt;
        const hazardEvery = Math.max(3.6, 10.5 - horde.elapsed * 0.035);
        if (horde.hazardAcc >= hazardEvery) {
          horde.hazardAcc = 0;
          hordeHazardsRef.current.push(pickAmbientHazard(nextX, nextY, horde.elapsed, 1));
        }

        leakFireAccRef.current += dt;
        if (leakFireAccRef.current > 2.4) {
          leakFireAccRef.current = 0;
          const nearLeaks = HORDE_FEATURES.filter((f) => f.kind === 'leak' && Math.hypot(f.x - nextX, f.y - nextY) < 780);
          nearLeaks.slice(0, 3).forEach((f) => {
            const ang = Math.atan2(nextY - f.y, nextX - f.x) + (Math.random() - 0.5) * 0.5;
            const proj: Projectile = {
              id: `leak_${Date.now()}_${Math.random()}`,
              ownerId: f.id,
              type: 'enemy_bullet',
              x: f.x,
              y: f.y,
              vx: Math.cos(ang) * 9,
              vy: Math.sin(ang) * 9,
              damage: Math.max(6, Math.round(8 + horde.elapsed * 0.08)),
              range: 520,
              distanceTraveled: 0,
              color: '#22D3EE',
              size: 5,
            };
            projectilesRef.current = [...projectilesRef.current, proj];
          });
        }

        const remainingHz: HordeHazard[] = [];
        hordeHazardsRef.current.forEach((h) => {
          if (h.telegraph > 0) {
            h.telegraph -= dt;
            remainingHz.push(h);
            return;
          }
          h.active -= dt;
          if (!h.didHit && isHitByHazard(h, nextX, nextY, jumpZ)) {
            h.didHit = true;
            if (nextPlayer.dodgeTimer > 0) {
              addDamagePopup(nextX, nextY - 16, 'DODGE!', '#38BDF8', true, false, 'dodge', 1.2);
            } else {
              const dmg = h.damage;
              setPlayer((prev) => ({
                ...prev,
                stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - dmg) },
              }));
              addDamagePopup(nextX, nextY, `-${dmg}`, h.color);
              sound.playHit();
              triggerShake(h.type === 'meteor' ? 8 : 5, 0.14);
              spawnParticles(nextX, nextY, h.color, 14, 'spark');
            }
          }
          if (h.active > 0) remainingHz.push(h);
          else {
            spawnParticles(h.x, h.y, h.color, 10, 'spark');
            if (h.type === 'meteor' || h.type === 'void_burst') {
              addGroundDecal(h.x, h.y, '#0F172A', h.radius * 0.7, 'scorch', 3.2, 0);
            }
          }
        });
        hordeHazardsRef.current = remainingHz;
        publishHordeFx(hordeHazardsRef.current, horde.blindness);

        hordeUiTimerRef.current += dt;
        if (hordeUiTimerRef.current >= 0.2) {
          hordeUiTimerRef.current = 0;
          setHordeRun({ ...horde, blindness: { ...horde.blindness } });
          const liveBoss = monstersRef.current.find((m) => m.zone === HORDE_ZONE_ID && m.isBoss && m.hp > 0 && m.state !== 'dead') || null;
          setCurrentBoss(liveBoss);
        }
      } else {
        publishHordeFx([], { active: false, remaining: 0, casterId: null });
      }

      // Vehicle spawn, drive-in, unload, and player-driven follow
      if (!horde.active) {
      carSpawnTimerRef.current += dt;
      if (carSpawnTimerRef.current >= CAR_SPAWN_INTERVAL) {
        carSpawnTimerRef.current = 0;
        if (carsRef.current.length < 8) {
          const nextType: 'police_car' | 'punk_car' = Math.random() < 0.5 ? 'police_car' : 'punk_car';
          carsRef.current = [...carsRef.current, makeFactionCar(nextType)];
        }
      }

      const newPassengers: Monster[] = [];
      carsRef.current.forEach((car) => {
        if (car.state === 'player_driven') {
          car.x = nextX - 50;
          car.y = nextY - 24;
          car.facing = facing;
          car.vx = nextPlayer.vx;
          car.vy = nextPlayer.vy;
          return;
        }

        if (car.state === 'driving') {
          const cdx = (car.targetX ?? FRONTLINE_X) - car.x;
          const cdy = (car.targetY ?? FRONTLINE_Y) - car.y;
          const cDist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
          if (cDist < 55) {
            car.state = 'unloading';
            car.unloadTimer = 1.15;
            car.vx = 0;
            car.vy = 0;
          } else {
            car.vx = (cdx / cDist) * car.speed;
            car.vy = (cdy / cDist) * car.speed;
            car.x += car.vx * dt;
            car.y += car.vy * dt;
            car.facing = car.vx >= 0 ? 'right' : 'left';
          }
        } else if (car.state === 'unloading') {
          car.unloadTimer = (car.unloadTimer ?? 0) - dt;
          if ((car.unloadTimer ?? 0) <= 0 && !car.hasUnloaded) {
            car.hasUnloaded = true;
            for (let i = 0; i < 4; i++) {
              newPassengers.push(createCarReinforcement(car, i));
            }
            car.passengerCount = 0;
            car.state = 'empty';
            const bark = car.type === 'police_car' ? 'UNITS DEPLOYED!' : 'GANG OUT!';
            addDamagePopup(car.x + 50, car.y - 10, bark, car.type === 'police_car' ? '#38BDF8' : '#EA580C', true, false, 'system', 1.2);
            spawnParticles(car.x + 50, car.y + 20, car.type === 'police_car' ? '#38BDF8' : '#EA580C', 16, 'spark');
          }
        }
      });

      if (newPassengers.length > 0) {
        monstersRef.current = [...monstersRef.current, ...newPassengers];
        setMonsters(monstersRef.current);
      }
      setCars([...carsRef.current]);

      // Run over enemies while driving a hijacked car
      const drivenCar = carsRef.current.find((c) => c.state === 'player_driven');
      if (drivenCar) {
        const driveSpeed = Math.sqrt(nextPlayer.vx * nextPlayer.vx + nextPlayer.vy * nextPlayer.vy);
        if (!drivenCar.runOverHitIds) drivenCar.runOverHitIds = [];
        if (driveSpeed > 90) {
          monstersRef.current.forEach((m) => {
            if (m.hp <= 0 || m.state === 'dead') return;
            const rdx = m.x - nextX;
            const rdy = m.y - nextY;
            const rDist = Math.sqrt(rdx * rdx + rdy * rdy);
            if (rDist > 72 || drivenCar.runOverHitIds!.includes(m.id)) return;
            drivenCar.runOverHitIds!.push(m.id);
            const nxk = rdx / (rDist || 1);
            const nyk = rdy / (rDist || 1);
            const crunchDmg = 240;
            m.hp = Math.max(0, m.hp - crunchDmg);
            m.hitFlash = 0.4;
            m.knockbackX = nxk * 620;
            m.knockbackY = nyk * 620;
            m.damagedByPlayer = true;
            sound.playHit(true);
            sound.playCrashSlam();
            triggerShake(12, 0.28);
            addDamagePopup(m.x, m.y - 18, 'CRUNCH', '#F97316', true, false, 'crit', 1.55);
            addGroundDecal(m.x, m.y + 10, '#7F1D1D', 26);
            spawnParticles(m.x, m.y, '#EF4444', 20, 'spark');
            spawnParticles(m.x, m.y, '#991B1B', 10, 'smoke');
            if (m.hp <= 0) handleMonsterDefeated(m, true);
          });
        }
        drivenCar.runOverHitIds = drivenCar.runOverHitIds.filter((id) => {
          const hit = monstersRef.current.find((mm) => mm.id === id);
          if (!hit || hit.hp <= 0 || hit.state === 'dead') return false;
          return Math.sqrt((hit.x - nextX) ** 2 + (hit.y - nextY) ** 2) < 95;
        });
      }
      }

      // 3. Magnetic Item Pickup
      const remainingDrops: DropItem[] = [];
      dropItemsRef.current.forEach((drop) => {
        const dx = nextX - drop.x;
        const dy = nextY - drop.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (drop.isXpGem) {
          const mag = HORDE_GEM_MAGNET + Math.min(160, (hordeRunRef.current.elapsed || 0) * 2.2);
          if (dist < 32) {
            awardExpAndGold(drop.quantity, 0);
            if (hordeRunRef.current.active) hordeRunRef.current.gemsCollected += 1;
            sound.playPickup();
          } else {
            if (dist < mag) {
              const pull = (1 - dist / mag) * 620 * dt;
              drop.x += (dx / dist) * pull;
              drop.y += (dy / dist) * pull;
            }
            remainingDrops.push(drop);
          }
        } else if (dist <= 65) {
          addItemToInventory(drop.item, drop.quantity);
          net.syncDropPickup(drop.id);
        } else {
          remainingDrops.push(drop);
        }
      });
      dropItemsRef.current = remainingDrops;
      setDropItems(remainingDrops);

      // 4. Update Ground Decals & Fire Pool Hazard Damage
      groundDecalsRef.current = groundDecalsRef.current
        .map((decal) => {
          const nextLife = decal.life - dt;
          if (decal.type === 'fire_pool' && decal.dps && decal.dps > 0) {
            // Check player standing in fire
            const pdx = nextX - decal.x;
            const pdy = nextY - decal.y;
            if (Math.sqrt(pdx * pdx + pdy * pdy) <= decal.radius && jumpZ < 10 && nextPlayer.dodgeTimer <= 0) {
              const burnDmg = Math.max(1, Math.round(decal.dps * dt));
              setPlayer((prev) => ({
                ...prev,
                stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - burnDmg) },
              }));
              addDamagePopup(nextX, nextY, `-${burnDmg} 🔥`, '#F97316');
            }
          }
          return {
            ...decal,
            life: nextLife,
            alpha: Math.max(0, (nextLife / decal.maxLife) * 0.85),
          };
        })
        .filter((decal) => decal.life > 0);
      setGroundDecals(groundDecalsRef.current);

      // 5. Update Projectiles & Collisions (with In-Air Z and Head/Body 2-Part Hitbox)
      const remainingProjectiles: Projectile[] = [];
      const livingMonsters = monstersRef.current.filter((m) => m.hp > 0 && m.state !== 'dead');

      projectilesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.distanceTraveled += Math.sqrt(p.vx * p.vx + p.vy * p.vy);

        let consumed = false;

        // Hit on Interactive Objects (Explosive Barrels)
        interactiveObjectsRef.current.forEach((obj) => {
          if (consumed || obj.hp <= 0) return;
          const odx = obj.x - p.x;
          const ody = obj.y - p.y;
          const oDist = Math.sqrt(odx * odx + ody * ody);
          if (oDist <= obj.radius + 10 && occupancyMatchesObject(occupancy, obj)) {
            obj.hp = Math.max(0, obj.hp - p.damage);
            consumed = !p.piercing;
            if (obj.hp <= 0) explodeInteractiveObject(obj);
          }
        });

        // Hit on Monsters (Player Projectiles & Faction crossfire)
        if (p.ownerId === nextPlayer.id || p.ownerId.startsWith('cop_') || p.ownerId.startsWith('punk_')) {
          livingMonsters.forEach((m) => {
            if (consumed || m.hp <= 0 || m.state === 'dead' || m.id === p.ownerId) return;

            // Prevent friendly fire inside same faction
            if (p.ownerId.startsWith('cop_') && m.faction === 'police') return;
            if (p.ownerId.startsWith('punk_') && m.faction === 'punk_demon') return;

            const dx = m.x - p.x;
            const dy = m.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // In-Air 3D Hitbox: check if monster jumped over bullet
            const monsterJumpZ = m.jumpZ || 0;
            if (monsterJumpZ > 24) return;

            if (dist <= (m.isBoss || m.isJuggernaut ? 55 : 30) + Math.max(0, (p.size || 4) - 4) * 1.25) {
              // SWAT Ballistic Shield Block check (front-facing bullet deflection)
              if (m.hasShield && (m.shieldHp === undefined || m.shieldHp > 0)) {
                const isFrontalHit = (m.facing === 'left' && p.vx > 0) || (m.facing === 'right' && p.vx < 0);
                if (isFrontalHit) {
                  m.shieldHp = (m.shieldHp ?? 300) - p.damage;
                  sound.playShieldBlock();
                  addDamagePopup(m.x, m.y - 14, 'BLOCKED!', '#38BDF8', false, false, 'system', 1.2);
                  spawnParticles(p.x, p.y, '#67E8F9', 10, 'spark');
                  triggerShake(2, 0.06);
                  if (m.shieldHp <= 0) {
                    addDamagePopup(m.x, m.y - 20, 'SHIELD BROKEN!', '#EF4444', true);
                  }
                  if (!p.piercing) consumed = true;
                  return;
                }
              }

              // Check Monster Dodge I-Frames
              if (m.dodgeTimer && m.dodgeTimer > 0) {
                sound.playDodgeEvade();
                addDamagePopup(m.x, m.y - 12, 'DODGE!', '#38BDF8', true, false, 'dodge', 1.15);
                spawnParticles(m.x, m.y, '#38BDF8', 5, 'spark');
                consumed = true;
                return;
              }

              // 2-PART HITBOX: Upper 30% is Headshot Zone
              const headY = m.y - 20;
              const isHeadshotHit = Math.abs(p.y - headY) <= 10 || p.type === 'laser';
              const headMultiplier = isHeadshotHit ? 2.2 : 1.0;
              const critMultiplier = p.isCrit ? 1.5 : 1.0;
              const dmg = Math.round(p.damage * headMultiplier * critMultiplier);

              m.hp = Math.max(0, m.hp - dmg);
              m.hitFlash = 0.2;

              // If shot by player, set individual retaliation aggro & damagedByPlayer
              if (p.ownerId === nextPlayer.id) {
                m.damagedByPlayer = true;
                m.retaliatePlayer = true;
                m.state = 'chase';
                m.targetPlayerId = nextPlayer.id;

                // LIFESTEAL VAMPIRISM ON HIT (Heal player for 8% on body, 18% on headshot)
                const lifestealAmount = Math.max(1, Math.round(dmg * (isHeadshotHit ? 0.18 : 0.08)));
                setPlayer((prev) => ({
                  ...prev,
                  stats: { ...prev.stats, hp: Math.min(prev.stats.maxHp, prev.stats.hp + lifestealAmount) },
                }));
                sound.playLifesteal();
                addDamagePopup(nextX, nextY - 30, `+${lifestealAmount} HP`, '#10B981', false, true, 'damage', 1.0);
                spawnParticles(m.x, m.y, '#10B981', 5, 'spark');
              }

              // Physics knockback & head tilt on humanoid
              if (m.isHumanoid || m.type.startsWith('bandit') || m.type.startsWith('cop') || m.type.startsWith('punk')) {
                m.headTilt = p.vx > 0 ? (isHeadshotHit ? 0.6 : 0.35) : (isHeadshotHit ? -0.6 : -0.35);
                m.knockbackX = p.vx > 0 ? (isHeadshotHit ? 95 : 60) : (isHeadshotHit ? -95 : -60);
                addGroundDecal(m.x, m.y + 12, '#991B1B', 16);

                if (!m.battleBark || m.battleBark.timer <= 0) {
                  m.battleBark = {
                    text: isHeadshotHit ? 'MY HEAD!!' : 'DAMMIT, SHOOT BACK!',
                    timer: 0.9,
                  };
                }
              }

              if (isHeadshotHit) {
                sound.playHeadshot();
                triggerShake(6, 0.12);
                addDamagePopup(m.x, m.y - 14, `${dmg} HEADSHOT!`, '#EF4444', true, false, 'headshot', 1.45);
              } else {
                sound.playHit(p.isCrit);
                triggerShake(p.isCrit ? 5 : 2, 0.08);
                addDamagePopup(m.x, m.y, `${dmg}`, p.isCrit ? '#FACC15' : '#EF4444', p.isCrit, false, p.isCrit ? 'crit' : 'damage');
              }

              spawnParticles(m.x, m.y, p.color || '#38BDF8', 8, 'spark');

              if (m.hp <= 0) handleMonsterDefeated(m, p.ownerId === nextPlayer.id);
              if (!p.piercing) consumed = true;
            }
          });
        }
        // Enemy Projectile hits Player
        else if (p.ownerId !== nextPlayer.id) {
          const dx = nextX - p.x;
          // In-Air 3D Hitbox: player visual vertical position elevated by jumpZ
          const playerHitboxY = nextY - jumpZ;
          const dy = playerHitboxY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Dodge invulnerability
          if (dist < 26) {
            if (nextPlayer.dodgeTimer && nextPlayer.dodgeTimer > 0) {
              sound.playDodgeEvade();
              addDamagePopup(nextX, nextY - 20, 'DODGED!', '#38BDF8', true, false, 'dodge', 1.2);
              spawnParticles(nextX, nextY, '#38BDF8', 6, 'spark');
              consumed = true;
            } else if (jumpZ < 26) {
              const dmg = p.damage;
              setPlayer((prev) => ({
                ...prev,
                stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - dmg) },
              }));
              addDamagePopup(nextX, nextY, `-${dmg}`, '#EF4444');
              sound.playHit();
              triggerShake(5, 0.12);
              consumed = true;
            }
          }
        }

        if (!consumed && p.distanceTraveled < p.range) {
          remainingProjectiles.push(p);
        } else if (p.explosionRadius) {
          spawnParticles(p.x, p.y, p.color || '#FB923C', 18, 'spark');
          addGroundDecal(p.x, p.y, '#7C2D12', p.explosionRadius, 'scorch', 4.5, 0);
          livingMonsters.forEach((m) => {
            if (m.hp <= 0 || m.state === 'dead') return;
            if (Math.hypot(m.x - p.x, m.y - p.y) <= p.explosionRadius! + 12) {
              const boom = Math.round(p.damage * 0.85);
              m.hp = Math.max(0, m.hp - boom);
              m.hitFlash = 0.2;
              m.damagedByPlayer = true;
              addDamagePopup(m.x, m.y, `-${boom}`, '#FB7185', true);
              if (m.hp <= 0) handleMonsterDefeated(m, true);
            }
          });
          triggerShake(6, 0.12);
        }
      });
      projectilesRef.current = remainingProjectiles;
      setProjectiles(remainingProjectiles);

      // Summoned pets (hellhounds / golem)
      summonsRef.current = summonsRef.current
        .map((ally) => {
          const nextLife = ally.life - dt;
          if (nextLife <= 0 || ally.hp <= 0) return { ...ally, life: 0 };
          const prey = livingMonsters
            .map((m) => ({ m, d: Math.hypot(m.x - ally.x, m.y - ally.y) }))
            .sort((a, b) => a.d - b.d)[0];
          let x = ally.x;
          let y = ally.y;
          let facing = ally.facing;
          let attackTimer = Math.max(0, ally.attackTimer - dt);
          const follow = prey
            ? { x: prey.m.x, y: prey.m.y }
            : { x: nextX + (ally.kind === 'golem' ? 50 : 24), y: nextY + 10 };
          const adx = follow.x - x;
          const ady = follow.y - y;
          const adist = Math.hypot(adx, ady) || 1;
          const reach = ally.kind === 'golem' ? 78 : 38;
          if (adist > reach) {
            const spd = ally.speed * 38 * dt;
            x += (adx / adist) * spd;
            y += (ady / adist) * spd;
          }
          facing = adx < 0 ? 'left' : 'right';
          if (prey && adist <= reach + 8 && attackTimer <= 0) {
            attackTimer = ally.kind === 'golem' ? 1.15 : 0.42;
            const smashR = ally.kind === 'golem' ? 110 : 42;
            livingMonsters.forEach((m) => {
              if (m.hp <= 0 || m.state === 'dead') return;
              if (Math.hypot(m.x - x, m.y - y) <= smashR) {
                const dmg = ally.atk;
                m.hp = Math.max(0, m.hp - dmg);
                m.hitFlash = 0.2;
                m.damagedByPlayer = true;
                m.retaliatePlayer = true;
                m.state = 'chase';
                m.targetPlayerId = nextPlayer.id;
                m.knockbackX = (m.x - x) * (ally.kind === 'golem' ? 2.4 : 1.1);
                addDamagePopup(m.x, m.y - 8, `-${dmg}`, ally.kind === 'golem' ? '#A8A29E' : '#F97316');
                if (m.hp <= 0) handleMonsterDefeated(m, true);
              }
            });
            if (ally.kind === 'golem') {
              spawnParticles(x, y, '#78716C', 16, 'spark');
              triggerShake(7, 0.14);
            }
          }
          return { ...ally, x, y, facing, attackTimer, life: nextLife };
        })
        .filter((ally) => ally.life > 0 && ally.hp > 0);
      setSummons([...summonsRef.current]);

      // 6. Update Monster AI, Battle Barks, Faction Skirmishes, Dashing, Jumping, Charging/Pinning & Respawn
      monstersRef.current.forEach((m) => {
        // Update Battle Bark timer and spawn a world-space speech popup once per bark
        if (m.battleBark && m.battleBark.timer > 0) {
          if (m.lastSpawnedBark !== m.battleBark.text) {
            addDamagePopup(m.x, m.y - 40, m.battleBark.text, '#0F172A', false, false, 'bark', 1, 0, -12);
            m.lastSpawnedBark = m.battleBark.text;
          }
          m.battleBark.timer = Math.max(0, m.battleBark.timer - dt);
        } else if (m.lastSpawnedBark) {
          m.lastSpawnedBark = undefined;
        }

        // Update Death Ragdoll & Smooth Auto-Respawn
        if (m.state === 'dead') {
          m.deathProgress = Math.min(1, (m.deathProgress || 0) + dt * 0.65);
          if (m.isRespawning && m.respawnTime !== undefined) {
            m.respawnTime -= dt;
            if (m.respawnTime <= 0) {
              const isCop = m.faction === 'police';
              const edge = rollFactionEdgeSpawn(isCop);
              m.x = edge.x;
              m.y = edge.y;
              m.spawnX = edge.x;
              m.spawnY = edge.y;
              m.hp = m.maxHp;
              m.state = 'idle';
              m.deathProgress = 0;
              m.damagedByPlayer = false;
              m.retaliatePlayer = false;
              m.targetPlayerId = null;
              m.isRespawning = false;
              m.jumpZ = 0;
              m.jumpVz = 0;
              m.isJumping = false;
              m.isCharging = false;
              m.isPinned = false;
              m.shieldHp = m.hasShield ? 300 : undefined;
              const respawnBarks = isCop
                ? ['SWAT BACKUP ARRIVED!', 'HOLDING THE LINE!', 'SECTOR CLEARING IN PROGRESS!']
                : ['FRESH PUNKS ENTERED THE PIT!', 'ANARCHY REINFORCEMENTS!', 'READY TO BRAWL!'];
              m.battleBark = { text: respawnBarks[Math.floor(Math.random() * respawnBarks.length)], timer: 1.3 };
              spawnParticles(m.x, m.y, isCop ? '#38BDF8' : '#EF4444', 18, 'spark');
              sound.playSpawnBounce();
            }
          }
          return;
        }

        if (hordeRunRef.current.active && m.zone !== HORDE_ZONE_ID) {
          return;
        }
        if (!hordeRunRef.current.active && m.zone === HORDE_ZONE_ID) {
          return;
        }

        // Apply physics knockback decay
        if (m.knockbackX) m.knockbackX *= 0.85;
        if (m.knockbackY) m.knockbackY *= 0.85;
        if (m.hitFlash && m.hitFlash > 0) m.hitFlash = Math.max(0, m.hitFlash - dt);

        // Update Monster Jump Physics
        if (m.jumpZ !== undefined && (m.jumpZ > 0 || (m.jumpVz && m.jumpVz !== 0))) {
          m.jumpZ = Math.max(0, m.jumpZ + (m.jumpVz || 0) * dt);
          m.jumpVz = (m.jumpVz || 0) - 680 * dt;
          if (m.jumpZ <= 0) {
            m.jumpZ = 0;
            m.jumpVz = 0;
            m.isJumping = false;
          }
        }

        // Update Monster Dodge / Dash Slide
        if (m.dodgeTimer && m.dodgeTimer > 0) {
          m.dodgeTimer = Math.max(0, m.dodgeTimer - dt);
          m.x += (m.dashVx || 0) * dt;
          m.y += (m.dashVy || 0) * dt;
          m.dashVx = (m.dashVx || 0) * 0.95;
          m.dashVy = (m.dashVy || 0) * 0.95;
          if (Math.random() < 0.35) {
            spawnParticles(m.x, m.y + 10, m.faction === 'police' ? '#38BDF8' : '#F59E0B', 2, 'spark');
          }
        }
        if (m.dodgeCooldown && m.dodgeCooldown > 0) {
          m.dodgeCooldown = Math.max(0, m.dodgeCooldown - dt);
        }
        if (m.jumpCooldown && m.jumpCooldown > 0) {
          m.jumpCooldown = Math.max(0, m.jumpCooldown - dt);
        }

        // Update Monster Rushdown Charge & Pinning Stun
        if (m.isCharging && m.chargeTimer && m.chargeTimer > 0) {
          m.chargeTimer = Math.max(0, m.chargeTimer - dt);
          m.x += (m.chargeVx || 0) * dt;
          m.y += (m.chargeVy || 0) * dt;
          if (Math.random() < 0.45) {
            spawnParticles(m.x, m.y + 8, '#F59E0B', 3, 'spark');
          }
          if (m.chargeTimer <= 0) {
            m.isCharging = false;
          }
        }
        if (m.isPinned && m.pinTimer && m.pinTimer > 0) {
          m.pinTimer = Math.max(0, m.pinTimer - dt);
          if (m.pinTimer <= 0) {
            m.isPinned = false;
          }
        }

        const mdx = nextPlayer.x - m.x;
        const mdy = nextPlayer.y - m.y;
        const distToPlayer = Math.sqrt(mdx * mdx + mdy * mdy);

        m.attackCooldown = Math.max(0, m.attackCooldown - dt);
        m.specialCooldown = Math.max(0, m.specialCooldown - dt);

        if (m.zone === HORDE_ZONE_ID) {
          m.state = 'chase';
          m.facing = mdx >= 0 ? 'right' : 'left';
          const kind = m.hordeKind || 'shade';
          const sep = Math.sin((m.x + m.y) * 0.04) * 22;
          const nx = distToPlayer > 1 ? mdx / distToPlayer : 0;
          const ny = distToPlayer > 1 ? mdy / distToPlayer : 0;
          const hold =
            kind === 'sniper' ? 440
            : kind === 'laser' || kind === 'boss_beam' ? 310
            : kind === 'blindcaster' || kind === 'boss_void' ? 360
            : kind === 'skycaller' || kind === 'boss_skyfall' ? 300
            : kind === 'bomber' ? 240
            : 0;
          const spd = m.speed * 46 * dt;
          if (!m.isCharging) {
            if (hold > 0) {
              if (distToPlayer > hold + 40) {
                m.x += nx * spd + (m.knockbackX || 0) * dt - ny * sep * dt;
                m.y += ny * spd + (m.knockbackY || 0) * dt + nx * sep * dt;
              } else if (distToPlayer < hold - 50) {
                m.x -= nx * spd * 0.85;
                m.y -= ny * spd * 0.85;
              } else {
                m.x += -ny * spd * 0.55;
                m.y += nx * spd * 0.55;
              }
            } else if (distToPlayer > 34) {
              m.x += nx * spd + (m.knockbackX || 0) * dt - ny * sep * dt;
              m.y += ny * spd + (m.knockbackY || 0) * dt + nx * sep * dt;
            }
            const pushed = pushOutOfHordeFeatures(m.x, m.y, m.isBoss ? 28 : 16);
            m.x = pushed.x;
            m.y = pushed.y;
          }

          if (m.isCharging && distToPlayer < 46 && m.attackCooldown <= 0) {
            m.attackCooldown = 0.7;
            m.isCharging = false;
            const dmg = Math.max(6, m.atk);
            if (nextPlayer.dodgeTimer > 0) {
              addDamagePopup(nextX, nextY - 16, 'DODGE!', '#38BDF8', true, false, 'dodge', 1.2);
            } else {
              setPlayer((prev) => ({ ...prev, stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - dmg) } }));
              addDamagePopup(nextX, nextY, `-${dmg}`, '#F43F5E');
              sound.playHit();
            }
          }

          const fireEnemy = (angle: number, speed: number, dmg: number, color: string, size = 4, spread = 0) => {
            const proj: Projectile = {
              id: `p_horde_${Date.now()}_${Math.random()}`,
              ownerId: m.id,
              type: 'enemy_bullet',
              x: m.x,
              y: m.y,
              vx: Math.cos(angle + spread) * speed,
              vy: Math.sin(angle + spread) * speed,
              damage: dmg,
              range: 780,
              distanceTraveled: 0,
              color,
              size,
            };
            projectilesRef.current = [...projectilesRef.current, proj];
          };

          const aim = Math.atan2(mdy, mdx);
          const dmgScale = Math.max(6, Math.round(m.atk * 0.72));

          if (kind === 'sniper') {
            if (!m.sniperLaser) m.sniperLaser = { active: true, angle: aim, length: distToPlayer, chargeProgress: 0 };
            m.sniperLaser.active = true;
            m.sniperLaser.angle = aim;
            m.sniperLaser.length = Math.min(700, Math.max(80, distToPlayer));
            m.sniperLaser.chargeProgress = Math.min(1, (m.sniperLaser.chargeProgress || 0) + dt / 1.4);
            if (m.sniperLaser.chargeProgress >= 1 && m.attackCooldown <= 0 && distToPlayer < 720) {
              m.sniperLaser.chargeProgress = 0;
              m.attackCooldown = 1.7;
              fireEnemy(aim, 22, Math.round(m.atk * 1.15), '#EF4444', 6);
              sound.playShoot();
            }
          } else if (m.attackCooldown <= 0) {
            const meleeKinds = kind === 'shade' || kind === 'mite' || kind === 'dasher' || kind === 'splitter' || kind === 'boss_titan';
            if (meleeKinds && distToPlayer < (m.isBoss ? 62 : kind === 'mite' ? 28 : 48)) {
              m.attackCooldown = m.isBoss ? 0.9 : kind === 'mite' ? 0.42 : 0.62;
              const dmg = Math.max(4, m.atk);
              if (nextPlayer.dodgeTimer > 0) {
                addDamagePopup(nextX, nextY - 16, 'DODGE!', '#38BDF8', true, false, 'dodge', 1.2);
              } else {
                setPlayer((prev) => ({ ...prev, stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - dmg) } }));
                addDamagePopup(nextX, nextY, `-${dmg}`, '#EF4444');
                sound.playHit();
              }
              if (hordeRunRef.current.blindness.active && Math.random() < 0.35) {
                m.battleBark = { text: kind === 'mite' ? 'skrr' : 'AAAGH', timer: 0.7 };
              }
            } else if (!meleeKinds && distToPlayer < 620 && kind !== 'laser' && kind !== 'skycaller' && kind !== 'blindcaster' && kind !== 'bomber') {
              m.attackCooldown = kind === 'shotgun' ? 1.85 : kind === 'boss_storm' ? 0.38 : 1.05;
              const pellets = kind === 'shotgun' ? 4 : kind === 'boss_storm' ? 6 : 1;
              for (let i = 0; i < pellets; i++) {
                const spread = pellets === 1 ? 0 : (i - (pellets - 1) / 2) * (kind === 'boss_storm' ? 0.22 : 0.11);
                fireEnemy(aim, kind === 'boss_storm' ? 11 : 16, dmgScale, kind === 'shotgun' ? '#F59E0B' : '#67E8F9', kind === 'boss_storm' ? 3.2 : 4, spread);
              }
              sound.playShoot();
            }
          }

          if (m.specialCooldown <= 0) {
            if (kind === 'laser' && distToPlayer < 680) {
              m.specialCooldown = 3.1 + Math.random() * 0.6;
              hordeHazardsRef.current.push(makeBeamHazard(m.x, m.y, aim, Math.min(860, distToPlayer + 200), Math.round(m.atk * 1.05), 1.22));
              m.battleBark = { text: 'BEAM', timer: 0.7 };
            } else if (kind === 'bomber' && distToPlayer < 520) {
              m.specialCooldown = 2.4 + Math.random();
              hordeHazardsRef.current.push(makeVoidBurstHazard(nextX + (Math.random() - 0.5) * 40, nextY + (Math.random() - 0.5) * 40, Math.round(m.atk * 1.1), 1.15));
            } else if (kind === 'skycaller' && distToPlayer < 700) {
              m.specialCooldown = 3.4;
              for (let i = 0; i < 4; i++) {
                const ox = nextX + Math.cos(i * 1.7 + hordeRunRef.current.elapsed) * (70 + i * 38);
                const oy = nextY + Math.sin(i * 1.7 + hordeRunRef.current.elapsed) * (70 + i * 38);
                hordeHazardsRef.current.push(makeMeteorHazard(ox, oy, Math.round(m.atk * 0.9), 1.2 + i * 0.08));
              }
              m.battleBark = { text: 'SKYFALL', timer: 0.8 };
            } else if (kind === 'dasher' && distToPlayer < 380 && distToPlayer > 80) {
              m.specialCooldown = 2.8;
              m.isCharging = true;
              m.chargeTimer = 0.55;
              m.chargeVx = nx * 520;
              m.chargeVy = ny * 520;
              m.battleBark = { text: 'RUSH', timer: 0.5 };
            } else if (kind === 'orbiter') {
              m.specialCooldown = 1.15;
              for (let i = 0; i < 3; i++) {
                const a = aim + (i / 3) * Math.PI * 2 + hordeRunRef.current.elapsed * 2;
                fireEnemy(a, 8, Math.max(5, Math.round(m.atk * 0.55)), '#34D399', 5);
              }
            } else if ((kind === 'blindcaster' || kind === 'boss_void') && distToPlayer < 720) {
              m.specialCooldown = kind === 'boss_void' ? 7.5 : 9;
              hordeRunRef.current.blindness = { active: true, remaining: kind === 'boss_void' ? 7.2 : 5.6, casterId: m.id };
              m.battleBark = { text: 'SEE NOTHING', timer: 1.8 };
              showToast('VISION LOST', 'Kill the caster — or survive the dark.', '👁');
              spawnParticles(m.x, m.y, '#E879F9', 24, 'spark');
            } else if (kind === 'boss_titan') {
              m.specialCooldown = 2.6;
              hordeHazardsRef.current.push(makeRingHazard(m.x, m.y, 320, Math.round(m.atk * 0.9), 0.75));
              hordeHazardsRef.current.push(makeMeteorHazard(nextX, nextY, Math.round(m.atk * 0.85), 1.3));
            } else if (kind === 'boss_beam') {
              m.specialCooldown = 2.4;
              hordeHazardsRef.current.push(makeCrossHazard(nextX, nextY, Math.round(m.atk * 1.05), 1.15));
              hordeHazardsRef.current.push(makeBeamHazard(m.x, m.y, aim, 820, Math.round(m.atk * 0.9), 1.2));
            } else if (kind === 'boss_skyfall') {
              m.specialCooldown = 2.2;
              for (let i = 0; i < 7; i++) {
                const ox = nextX + (Math.random() - 0.5) * 340;
                const oy = nextY + (Math.random() - 0.5) * 340;
                hordeHazardsRef.current.push(makeMeteorHazard(ox, oy, Math.round(m.atk * 0.8), 1.05 + Math.random() * 0.4));
              }
            } else if (kind === 'boss_storm') {
              m.specialCooldown = 2.0;
              hordeHazardsRef.current.push(makeRingHazard(m.x, m.y, 280, Math.round(m.atk * 0.7), 0.7));
              for (let i = 0; i < 10; i++) fireEnemy((i / 10) * Math.PI * 2, 10, dmgScale, '#E879F9', 4);
            }
          }

          if (hordeRunRef.current.blindness.active && Math.random() < 0.012) {
            m.battleBark = { text: ['AAAH', 'HERE', 'HIT', 'SKREE', 'NULL'][Math.floor(Math.random() * 5)], timer: 0.55 };
          }
          return;
        }

        // Active SMART evasion: detect incoming projectile trajectory
        if ((!m.dodgeTimer || m.dodgeTimer <= 0) && (!m.dodgeCooldown || m.dodgeCooldown <= 0)) {
          const incomingBullet = projectilesRef.current.find((pr) => {
            if (pr.ownerId === m.id) return false;
            const bdx = m.x - pr.x;
            const bdy = m.y - pr.y;
            const distSq = bdx * bdx + bdy * bdy;
            if (distSq > 185 * 185) return false;
            // Vector dot product: is projectile heading toward monster?
            const dot = bdx * pr.vx + bdy * pr.vy;
            return dot > 0;
          });

          if (incomingBullet) {
            // Reaction check (80% chance to react on incoming bullet)
            if (Math.random() < 0.82) {
              m.dodgeTimer = 0.40;
              m.dodgeCooldown = m.isBoss ? 1.4 : 2.0 + Math.random() * 0.8;
              const bulletAngle = Math.atan2(incomingBullet.vy, incomingBullet.vx);
              const evadeDir = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
              m.dashVx = Math.cos(bulletAngle + evadeDir) * 480;
              m.dashVy = Math.sin(bulletAngle + evadeDir) * 480;
              m.facing = m.dashVx >= 0 ? 'right' : 'left';
              sound.playDodgeRoll();
              addDamagePopup(m.x, m.y - 14, 'DODGE!', '#38BDF8', true, false, 'dodge', 1.25);
              spawnParticles(m.x, m.y + 10, '#38BDF8', 7, 'spark');
            }
          }
        }

        // Active SMART jumping: jump out of fire pools, over obstacles or into melee combat
        if (!m.isJumping && (m.jumpZ === undefined || m.jumpZ <= 0) && (!m.jumpCooldown || m.jumpCooldown <= 0)) {
          // 1. Check if standing in burning fire pool
          const inFire = groundDecalsRef.current.some(
            (dec) => dec.type === 'fire_pool' && Math.hypot(dec.x - m.x, dec.y - m.y) <= (dec.radius || 30) + 10
          );
          // 2. Check if close to combat target for a jump slam
          const nearCombatTarget = (distToPlayer < 120 && m.retaliatePlayer) || (m.state === 'chase' && Math.random() < 0.04);

          if (inFire || nearCombatTarget) {
            m.jumpZ = 1;
            m.jumpVz = inFire ? 340 : 300 + Math.random() * 60;
            m.isJumping = true;
            m.jumpCooldown = inFire ? 1.5 : 2.6 + Math.random() * 0.8;
            sound.playJump();
            spawnParticles(m.x, m.y + 10, m.faction === 'police' ? '#38BDF8' : '#EF4444', 5, 'spark');
          }
        }

        // ==========================================
        // FACTION WARZONE AI: POLICE VS DEMON PUNKS
        // ==========================================
        if ((m.faction === 'police' || m.faction === 'punk_demon') && !m.retaliatePlayer) {
          // Find opposing faction enemy monster
          const opposingMonsters = monstersRef.current.filter(
            (other) => other.hp > 0 && other.state !== 'dead' && other.faction && other.faction !== m.faction
          );

          let nearestEnemy: Monster | null = null;
          let nearestDist = FACTION_ENGAGE_RANGE;

          opposingMonsters.forEach((enemy) => {
            const edx = enemy.x - m.x;
            const edy = enemy.y - m.y;
            const eDist = Math.sqrt(edx * edx + edy * edy);
            if (eDist < nearestDist) {
              nearestDist = eDist;
              nearestEnemy = enemy;
            }
          });

          if (nearestEnemy) {
            m.state = 'chase';
            const edx = (nearestEnemy as Monster).x - m.x;
            const edy = (nearestEnemy as Monster).y - m.y;
            m.facing = edx >= 0 ? 'right' : 'left';

            // RUSHDOWN TACKLE CHARGE & PIN TRIGGER ("зажимать друг в друга")
            if (
              !m.isCharging &&
              m.specialCooldown <= 0 &&
              nearestDist < 340 &&
              (m.weaponType === 'bat' || m.weaponType === 'baton' || m.weaponType === 'blade' || m.weaponType === 'sledgehammer' || m.weaponType === 'shotgun' || m.isJuggernaut) &&
              Math.random() < 0.14
            ) {
              m.isCharging = true;
              m.chargeTimer = 0.65;
              m.specialCooldown = 3.6 + Math.random() * 1.5;
              const chargeSpeed = 480;
              m.chargeVx = (edx / (nearestDist || 1)) * chargeSpeed;
              m.chargeVy = (edy / (nearestDist || 1)) * chargeSpeed;
              const chargeBarks = m.faction === 'police'
                ? ['RAM THEM DOWN!', 'BREACH AND CLEAR!', 'HOLD STILL!']
                : ['EAT DIRT!', 'CRUSH YA!', 'RAMMING SPEED!'];
              m.battleBark = { text: chargeBarks[Math.floor(Math.random() * chargeBarks.length)], timer: 1.1 };
              sound.playDodgeRoll();
              spawnParticles(m.x, m.y + 10, m.faction === 'police' ? '#38BDF8' : '#EA580C', 10, 'spark');
            }

            // TACKLE PIN COLLISION RESOLUTION
            if (m.isCharging && nearestDist < 48) {
              m.isCharging = false;
              sound.playHit(true);
              triggerShake(8, 0.22);
              const pushForceX = (m.chargeVx || 0) * 1.5;
              const pushForceY = (m.chargeVy || 0) * 1.5;
              (nearestEnemy as Monster).knockbackX = pushForceX;
              (nearestEnemy as Monster).knockbackY = pushForceY;
              (nearestEnemy as Monster).isPinned = true;
              (nearestEnemy as Monster).pinTimer = 0.55;
              (nearestEnemy as Monster).hp = Math.max(0, (nearestEnemy as Monster).hp - 35);
              (nearestEnemy as Monster).hitFlash = 0.3;
              addDamagePopup((nearestEnemy as Monster).x, (nearestEnemy as Monster).y - 12, 'SLAM!', '#F59E0B', true, false, 'crit', 1.35);
              spawnParticles((nearestEnemy as Monster).x, (nearestEnemy as Monster).y, '#F59E0B', 14, 'spark');
              addGroundDecal((nearestEnemy as Monster).x, (nearestEnemy as Monster).y + 10, '#991B1B', 18);

              // Check collision against walls or obstacles
              const enemyNextX = (nearestEnemy as Monster).x + (pushForceX > 0 ? 35 : -35);
              const enemyNextY = (nearestEnemy as Monster).y + (pushForceY > 0 ? 35 : -35);
              const resolvedEnemy = resolveObstacleCollisions(enemyNextX, enemyNextY, 0, 0, 20, resourceNodesRef.current);
              const hitWall = Math.abs(resolvedEnemy.x - enemyNextX) > 2 || Math.abs(resolvedEnemy.y - enemyNextY) > 2;

              // Check collision against other bystanders in crowd (bowling chain knockback)
              const bystander = monstersRef.current.find(
                (b) => b.id !== m.id && b.id !== (nearestEnemy as Monster).id && b.hp > 0 && Math.sqrt((b.x - (nearestEnemy as Monster).x) ** 2 + (b.y - (nearestEnemy as Monster).y) ** 2) < 44
              );

              if (hitWall || bystander) {
                triggerShake(12, 0.35);
                (nearestEnemy as Monster).hp = Math.max(0, (nearestEnemy as Monster).hp - 50);
                const comicWords = ['PINNED TO WALL!', 'CRUSHED IN CROWD!', 'БДЫЩ!', 'В СТЕНУ!'];
                const chosenWord = comicWords[Math.floor(Math.random() * comicWords.length)];
                addDamagePopup((nearestEnemy as Monster).x, (nearestEnemy as Monster).y - 24, chosenWord, '#EF4444', true, false, 'headshot', 1.55);
                spawnParticles((nearestEnemy as Monster).x, (nearestEnemy as Monster).y, '#EF4444', 18, 'spark');
                addGroundDecal((nearestEnemy as Monster).x, (nearestEnemy as Monster).y + 10, '#7F1D1D', 26);

                if (bystander) {
                  bystander.knockbackX = pushForceX * 0.85;
                  bystander.knockbackY = pushForceY * 0.85;
                  bystander.hp = Math.max(0, bystander.hp - 30);
                  bystander.hitFlash = 0.25;
                  addDamagePopup(bystander.x, bystander.y, 'COLLISION!', '#FACC15', true);
                  if (bystander.hp <= 0) handleMonsterDefeated(bystander);
                }
              }

              if ((nearestEnemy as Monster).hp <= 0) handleMonsterDefeated(nearestEnemy as Monster);
            }

            // Attack enemy faction member
            if (m.attackCooldown <= 0 && (!m.isPinned || (m.pinTimer ?? 0) <= 0)) {
              m.attackCooldown = m.weaponType === 'shotgun' ? 2.2 : m.weaponType === 'molotov' ? 2.8 : m.weaponType === 'cheytac' ? 3.0 : 1.3;
              const angle = Math.atan2(edy, edx);

              if (m.weaponType === 'molotov') {
                sound.playShoot();
                m.battleBark = { text: 'BURN IN HELL!', timer: 1.2 };
                // Spawn Molotov bottle
                const molotovProj: Projectile = {
                  id: `p_molotov_${Date.now()}_${Math.random()}`,
                  ownerId: m.id,
                  type: 'magic_orb',
                  x: m.x,
                  y: m.y,
                  vx: Math.cos(angle) * 15,
                  vy: Math.sin(angle) * 15,
                  damage: 35,
                  range: 580,
                  distanceTraveled: 0,
                  color: '#EA580C',
                  size: 8,
                };
                projectilesRef.current = [...projectilesRef.current, molotovProj];
                setProjectiles([...projectilesRef.current]);

                // Create burning ground fire pool at landing spot
                setTimeout(() => {
                  sound.playMolotovBurst();
                  addGroundDecal(m.x + Math.cos(angle) * 360, m.y + Math.sin(angle) * 360, '#EA580C', 40, 'fire_pool', 8.0, 16);
                  spawnParticles(m.x + Math.cos(angle) * 360, m.y + Math.sin(angle) * 360, '#F59E0B', 22, 'spark');
                }, 580);
              } else if (m.weaponType === 'baton' || m.weaponType === 'bat' || m.weaponType === 'blade') {
                // Melee strike with jumping air slam / whirlwind
                if (nearestDist < 65) {
                  sound.playHit();
                  const hitDmg = m.weaponType === 'blade' ? 38 : m.weaponType === 'bat' ? 32 : 28;
                  (nearestEnemy as Monster).hp = Math.max(0, (nearestEnemy as Monster).hp - hitDmg);
                  (nearestEnemy as Monster).hitFlash = 0.25;
                  (nearestEnemy as Monster).knockbackX = Math.cos(angle) * 80;
                  (nearestEnemy as Monster).knockbackY = Math.sin(angle) * 80;
                  addDamagePopup((nearestEnemy as Monster).x, (nearestEnemy as Monster).y, `-${hitDmg}`, m.faction === 'police' ? '#38BDF8' : '#F43F5E');
                  spawnParticles((nearestEnemy as Monster).x, (nearestEnemy as Monster).y, '#EF4444', 8, 'spark');
                  if ((nearestEnemy as Monster).hp <= 0) handleMonsterDefeated(nearestEnemy as Monster);
                }
              } else if (m.weaponType === 'shotgun') {
                // Shotgun 5-pellet spread
                sound.playShoot();
                triggerShake(4, 0.12);
                m.battleBark = { text: 'EAT BUCKSHOT!', timer: 1.1 };
                for (let i = -2; i <= 2; i++) {
                  const sAngle = angle + i * 0.12;
                  const pellet: Projectile = {
                    id: `p_facshot_${Date.now()}_${i}_${Math.random()}`,
                    ownerId: m.id,
                    type: 'enemy_bullet',
                    x: m.x,
                    y: m.y,
                    vx: Math.cos(sAngle) * 18,
                    vy: Math.sin(sAngle) * 18,
                    damage: 18,
                    range: 650,
                    distanceTraveled: 0,
                    color: m.faction === 'police' ? '#38BDF8' : '#FB923C',
                    size: 4.5,
                  };
                  projectilesRef.current = [...projectilesRef.current, pellet];
                }
                setProjectiles([...projectilesRef.current]);
              } else if (m.weaponType === 'mac10') {
                // Rapid 2-burst SMG
                for (let b = 0; b < 2; b++) {
                  setTimeout(() => {
                    if (m.hp <= 0 || m.state === 'dead') return;
                    sound.playShoot();
                    const smgBullet: Projectile = {
                      id: `p_facmac_${Date.now()}_${b}_${Math.random()}`,
                      ownerId: m.id,
                      type: 'enemy_bullet',
                      x: m.x,
                      y: m.y,
                      vx: Math.cos(angle + (Math.random() - 0.5) * 0.16) * 22,
                      vy: Math.sin(angle + (Math.random() - 0.5) * 0.16) * 22,
                      damage: 15,
                      range: 850,
                      distanceTraveled: 0,
                      color: m.faction === 'police' ? '#38BDF8' : '#FDE047',
                      size: 4,
                    };
                    projectilesRef.current = [...projectilesRef.current, smgBullet];
                    setProjectiles([...projectilesRef.current]);
                  }, b * 60);
                }
              } else {
                // Fire rifle / handgun
                sound.playShoot();
                const barks = m.faction === 'police'
                  ? ['FREEZE, SCUM!', 'HOLD THE LINE!', 'POLICE, DROP WEAPONS!']
                  : ['DIE PIGS!', 'ANARCHY!', 'BURN IT DOWN!'];
                if (Math.random() < 0.4 && (!m.battleBark || m.battleBark.timer <= 0)) {
                  m.battleBark = { text: barks[Math.floor(Math.random() * barks.length)], timer: 1.1 };
                }

                const bullet: Projectile = {
                  id: `p_fac_${Date.now()}_${Math.random()}`,
                  ownerId: m.id,
                  type: 'enemy_bullet',
                  x: m.x,
                  y: m.y,
                  vx: Math.cos(angle) * 19,
                  vy: Math.sin(angle) * 19,
                  damage: 22,
                  range: 850,
                  distanceTraveled: 0,
                  color: m.faction === 'police' ? '#38BDF8' : '#FB923C',
                  size: 4.5,
                };
                projectilesRef.current = [...projectilesRef.current, bullet];
                setProjectiles([...projectilesRef.current]);
              }
            }

            // Move towards enemy faction target with obstacle sliding
            const idealDist = (m.weaponType === 'baton' || m.weaponType === 'bat' || m.weaponType === 'blade') ? 35 : 240;
            if (nearestDist > idealDist && (!m.isPinned || (m.pinTimer ?? 0) <= 0)) {
              const spd = m.speed * 40 * dt;
              let nextMx = m.x + (edx / nearestDist) * spd + (m.knockbackX || 0) * dt;
              let nextMy = m.y + (edy / nearestDist) * spd + (m.knockbackY || 0) * dt;
              const resolvedM = resolveObstacleCollisions(nextMx, nextMy, 0, 0, 18, resourceNodesRef.current);
              m.x = resolvedM.x;
              m.y = resolvedM.y;
            }
            return;
          }

          // No enemy within 1000px: rush the center frontline
          const fdx = FRONTLINE_X - m.x;
          const fdy = FRONTLINE_Y - m.y;
          const fDist = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
          m.state = 'chase';
          m.facing = fdx >= 0 ? 'right' : 'left';
          if (fDist > 90 && (!m.isPinned || (m.pinTimer ?? 0) <= 0)) {
            const spd = m.speed * 40 * dt;
            const nextMx = m.x + (fdx / fDist) * spd + (m.knockbackX || 0) * dt;
            const nextMy = m.y + (fdy / fDist) * spd + (m.knockbackY || 0) * dt;
            const resolvedM = resolveObstacleCollisions(nextMx, nextMy, 0, 0, 18, resourceNodesRef.current);
            m.x = resolvedM.x;
            m.y = resolvedM.y;
          }
          return;
        }

        // ==========================================
        // BOSS: "Iron Mask" Sledge (The Welder Boss)
        // ==========================================
        if (m.type === 'boss_welder') {
          if (distToPlayer < 900) {
            m.state = 'chase';
            setCurrentBoss(m);

            if (m.specialCooldown <= 0 && distToPlayer < 240) {
              m.specialCooldown = 4.8;
              m.battleBark = { text: 'CRUSH TO DUST!!', timer: 1.4 };
              m.telegraphedAttack = {
                type: 'slam',
                x: m.x + (mdx / (distToPlayer || 1)) * 60,
                y: m.y + (mdy / (distToPlayer || 1)) * 60,
                radius: 160,
                duration: 1200,
                startTime: Date.now(),
                damage: 75,
              };

              setTimeout(() => {
                if (m.hp <= 0 || m.state === 'dead') return;
                sound.playBossRoar();
                triggerShake(14, 0.4);
                addGroundDecal(m.x, m.y, '#EA580C', 35);
                spawnParticles(m.x, m.y, '#F59E0B', 25, 'spark');

                const pdx = playerRef.current.x - m.x;
                const pdy = playerRef.current.y - m.y;
                if (Math.sqrt(pdx * pdx + pdy * pdy) <= 170 && playerRef.current.jumpZ < 20) {
                  if (playerRef.current.dodgeTimer > 0) {
                    sound.playDodgeEvade();
                    addDamagePopup(playerRef.current.x, playerRef.current.y - 16, 'DODGE!', '#38BDF8', true, false, 'dodge', 1.3);
                  } else {
                    setPlayer((prev) => ({
                      ...prev,
                      stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - 80) },
                    }));
                    addDamagePopup(playerRef.current.x, playerRef.current.y, '-80 SLAM!', '#EF4444', true);
                  }
                }
                m.telegraphedAttack = undefined;
              }, 1200);
            }

            if (m.attackCooldown <= 0 && distToPlayer < 650) {
              m.attackCooldown = 2.8;
              sound.playShoot();
              for (let i = -2; i <= 2; i++) {
                const angle = Math.atan2(mdy, mdx) + i * 0.18;
                const fireProj: Projectile = {
                  id: `p_welder_${Date.now()}_${i}`,
                  ownerId: m.id,
                  type: 'enemy_bullet',
                  x: m.x,
                  y: m.y,
                  vx: Math.cos(angle) * 14,
                  vy: Math.sin(angle) * 14,
                  damage: 32,
                  range: 850,
                  distanceTraveled: 0,
                  color: '#EA580C',
                  size: 6,
                };
                projectilesRef.current = [...projectilesRef.current, fireProj];
              }
              setProjectiles([...projectilesRef.current]);
            }

            if (distToPlayer > 80) {
              const spd = m.speed * 40 * dt;
              m.x += (mdx / distToPlayer) * spd + (m.knockbackX || 0) * dt;
              m.y += (mdy / distToPlayer) * spd + (m.knockbackY || 0) * dt;
            }
          }
        }
        // ==========================================
        // OUTLAW SNIPER: Crouching & Laser Aiming
        // ==========================================
        else if (m.type === 'bandit_sniper' || m.type === 'cop_marksman') {
          if (distToPlayer < 950) {
            m.state = 'chase';

            if (!m.sniperLaser && m.attackCooldown <= 0) {
              m.sniperLaser = {
                active: true,
                angle: Math.atan2(mdy, mdx),
                length: distToPlayer,
                chargeProgress: 0,
              };
              sound.playSniperCharge();
              m.battleBark = { text: 'TARGET LOCKED...', timer: 1.4 };
            }

            if (m.sniperLaser && m.sniperLaser.active) {
              m.sniperLaser.chargeProgress += dt / 1.15;
              m.sniperLaser.angle = Math.atan2(mdy, mdx);
              m.sniperLaser.length = distToPlayer;

              if (m.sniperLaser.chargeProgress >= 1.0) {
                sound.playSniperShot();
                triggerShake(6, 0.18);
                const angle = m.sniperLaser.angle;
                const sniperProj: Projectile = {
                  id: `p_bsniper_${Date.now()}`,
                  ownerId: m.id,
                  type: 'laser',
                  x: m.x,
                  y: m.y,
                  vx: Math.cos(angle) * 36,
                  vy: Math.sin(angle) * 36,
                  damage: 45,
                  range: 1400,
                  distanceTraveled: 0,
                  color: '#EF4444',
                  size: 6,
                };
                projectilesRef.current = [...projectilesRef.current, sniperProj];
                setProjectiles([...projectilesRef.current]);

                m.sniperLaser = undefined;
                m.attackCooldown = 3.4;
              }
            }

            if (distToPlayer > 420) {
              const spd = m.speed * 32 * dt;
              m.x += (mdx / distToPlayer) * spd + (m.knockbackX || 0) * dt;
              m.y += (mdy / distToPlayer) * spd + (m.knockbackY || 0) * dt;
            } else if (distToPlayer < 200) {
              const spd = m.speed * 28 * dt;
              m.x -= (mdx / distToPlayer) * spd;
              m.y -= (mdy / distToPlayer) * spd;
            }
          } else {
            if (m.sniperLaser) m.sniperLaser = undefined;
          }
        }
        // ==========================================
        // OUTLAW SHOTGUNNER / SWAT VANGUARD
        // ==========================================
        else if (m.type === 'bandit_shotgunner' || m.type === 'cop_swat') {
          if (distToPlayer < 750) {
            m.state = 'chase';

            if (m.attackCooldown <= 0) {
              m.attackCooldown = 2.4;
              m.knockbackX = (mdx / (distToPlayer || 1)) * 140;
              m.knockbackY = (mdy / (distToPlayer || 1)) * 140;
              sound.playShoot();
              m.battleBark = { text: 'EAT BUCKSHOT!', timer: 1.1 };
              spawnParticles(m.x, m.y + 10, '#F59E0B', 8, 'smoke');

              for (let i = -2; i <= 2; i++) {
                const angle = Math.atan2(mdy, mdx) + i * 0.14;
                const proj: Projectile = {
                  id: `p_bshot_${Date.now()}_${i}`,
                  ownerId: m.id,
                  type: 'enemy_bullet',
                  x: m.x,
                  y: m.y,
                  vx: Math.cos(angle) * 17,
                  vy: Math.sin(angle) * 17,
                  damage: 18,
                  range: 650,
                  distanceTraveled: 0,
                  color: '#FB923C',
                  size: 4.5,
                };
                projectilesRef.current = [...projectilesRef.current, proj];
              }
              setProjectiles([...projectilesRef.current]);
            }

            if (distToPlayer > 80) {
              const spd = m.speed * 44 * dt;
              m.x += (mdx / distToPlayer) * spd + (m.knockbackX || 0) * dt;
              m.y += (mdy / distToPlayer) * spd + (m.knockbackY || 0) * dt;
            }
          }
        }
        // ==========================================
        // OUTLAW GRUNTS, GUNNERS & CADETS
        // ==========================================
        else if (m.isHumanoid || m.type.startsWith('bandit') || m.type.startsWith('punk') || m.type.startsWith('cop')) {
          if (distToPlayer < 800) {
            m.state = 'chase';

            if (m.attackCooldown <= 0) {
              m.attackCooldown = 1.6;
              sound.playShoot();
              if (Math.random() < 0.35 && (!m.battleBark || m.battleBark.timer <= 0)) {
                const barks = ['DIE RAT!', 'LIGHT ’EM UP!', 'COVER ME!'];
                m.battleBark = { text: barks[Math.floor(Math.random() * barks.length)], timer: 1.0 };
              }

              const angle = Math.atan2(mdy, mdx);
              const proj: Projectile = {
                id: `p_bgun_${Date.now()}`,
                ownerId: m.id,
                type: 'enemy_bullet',
                x: m.x,
                y: m.y,
                vx: Math.cos(angle) * 18,
                vy: Math.sin(angle) * 18,
                damage: 18,
                range: 850,
                distanceTraveled: 0,
                color: '#FDE047',
                size: 4,
              };
              projectilesRef.current = [...projectilesRef.current, proj];
              setProjectiles([...projectilesRef.current]);
            }

            if (distToPlayer > 180) {
              const spd = m.speed * 40 * dt;
              m.x += (mdx / distToPlayer) * spd + (m.knockbackX || 0) * dt;
              m.y += (mdy / distToPlayer) * spd + (m.knockbackY || 0) * dt;
            }
          }
        }
      });

      if (hordeRunRef.current.active) {
        const before = monstersRef.current.length;
        monstersRef.current = monstersRef.current.filter((m) => {
          if (m.zone !== HORDE_ZONE_ID) return true;
          if (m.state === 'dead' && (m.deathProgress || 0) >= 1) return false;
          return true;
        });
        if (monstersRef.current.length !== before) {
          setMonsters([...monstersRef.current]);
        }
        setProjectiles([...projectilesRef.current]);
      }

      // 7. Update Visual Particles & Popups
      particlesRef.current = particlesRef.current
        .map((pt) => ({
          ...pt,
          x: pt.x + pt.vx,
          y: pt.y + pt.vy,
          vx: pt.vx * (pt.shape === 'casing' ? 0.985 : 1),
          vy: pt.vy + (pt.shape === 'casing' ? 18 * dt : 0),
          life: pt.life + dt,
          alpha: Math.max(0, 1 - pt.life / pt.maxLife),
        }))
        .filter((pt) => pt.life < pt.maxLife);
      setParticles(particlesRef.current);

      damagePopupsRef.current = damagePopupsRef.current
        .map((dp) => ({
          ...dp,
          x: dp.x + (dp.vx || 0) * dt,
          y: dp.y + (dp.vy !== undefined ? dp.vy : -35) * dt,
          life: dp.life - dt,
        }))
        .filter((dp) => dp.life > 0);
      setDamagePopups(damagePopupsRef.current);

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [addItemToInventory, handleMonsterDefeated, explodeInteractiveObject, spawnParticles, addDamagePopup, addGroundDecal, triggerShake, showToast, awardExpAndGold]);

  const handleInteract = useCallback(() => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    if (activeModalRef.current !== 'none') return;

    const nearby = nearbyInteractableRef.current;
    if (nearby?.type === 'npc') {
      const npc = Object.values(NPCS_DATABASE).find((n) => n.id === nearby.id);
      if (npc) {
        setActiveNpc(npc);
        setActiveModal('dialogue');
        sound.playPickup();
      }
    }
  }, []);

  const tryHijackOrExitCar = useCallback(() => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    const p = playerRef.current;
    if (p.stats.hp <= 0) return;

    const driven = carsRef.current.find((c) => c.state === 'player_driven');
    if (driven || isDrivingHijackCar(p)) {
      carsRef.current.forEach((c) => {
        if (c.state === 'player_driven') {
          c.state = 'empty';
          c.x = p.x - 50;
          c.y = p.y - 24;
          c.vx = 0;
          c.vy = 0;
          c.facing = p.facing;
          c.runOverHitIds = [];
        }
      });
      setCars([...carsRef.current]);
      const next: Player = {
        ...p,
        isRiding: false,
        activeVehicleId: null,
        hideWeapon: false,
        state: 'idle',
      };
      playerRef.current = next;
      setPlayer(next);
      showToast('EXITED VEHICLE', 'Back on foot — weapons ready.', '🚗');
      return;
    }

    const nearby = carsRef.current.find((c) => {
      if (c.state === 'player_driven' || c.state === 'driving') return false;
      const dx = p.x - (c.x + 50);
      const dy = p.y - (c.y + 24);
      return Math.sqrt(dx * dx + dy * dy) < HIJACK_RANGE;
    });
    if (!nearby) return;

    nearby.state = 'player_driven';
    nearby.passengerCount = 0;
    setCars([...carsRef.current]);
    const next: Player = {
      ...p,
      x: nearby.x + 50,
      y: nearby.y + 24,
      isRiding: true,
      activeVehicleId: nearby.type,
      facing: nearby.facing,
      hideWeapon: true,
      state: 'riding',
    };
    playerRef.current = next;
    setPlayer(next);
    showToast(
      'CARJACKED!',
      nearby.type === 'police_car' ? 'Police Cruiser stolen — ram them!' : 'Cyber Muscle Car stolen — ram them!',
      '🚗'
    );
  }, [showToast]);

  // Global Keyboard Listeners (Movement, Skills, Weapon Hotkeys 1-6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block all input during intro cinematic
      if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') {
        return;
      }

      const focused = e.target as HTMLElement | null;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;

      keysRef.current[e.code] = true;

      // Modal Hotkeys: [I] Inventory, [B] Craft, [K] Skills, [M] Map, [Esc] Close
      if (!e.repeat) {
        if (e.code === 'Escape') {
          if (activeModalRef.current !== 'none') {
            setActiveModal('none');
            setActiveNpc(null);
          }
          return;
        }

        const modal = activeModalRef.current;
        if (e.code === 'KeyI') {
          setActiveModal(modal === 'inventory' ? 'none' : 'inventory');
          return;
        }
        if (e.code === 'KeyB') {
          setActiveModal(modal === 'craft' ? 'none' : 'craft');
          return;
        }
        if (e.code === 'KeyK') {
          setActiveModal(modal === 'skills' ? 'none' : 'skills');
          return;
        }
        if (e.code === 'KeyM') {
          setActiveModal(modal === 'map' ? 'none' : 'map');
          return;
        }
      }

      if (activeModalRef.current !== 'none') return;

      // Weapon Hotkeys: Keys [1] - [6] (class loadout)
      const hotbar = CLASS_HOTBAR[playerRef.current.characterClass] || CLASS_HOTBAR.gunslinger;
      const digitIdx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
      if (digitIdx >= 0 && hotbar[digitIdx]) handleSwitchWeapon(hotbar[digitIdx]);

      // Skills & Reload: [Q], [E], [F], [R]
      if (e.code === 'KeyQ') handleUseSkill(0);
      else if (e.code === 'KeyE' && !e.repeat) {
        if (nearbyInteractableRef.current && activeModalRef.current === 'none') {
          const nearby = nearbyInteractableRef.current;
          if (nearby.type === 'npc') {
            const npc = Object.values(NPCS_DATABASE).find((n) => n.id === nearby.id);
            if (npc) {
              setActiveNpc(npc);
              setActiveModal('dialogue');
              sound.playPickup();
              return;
            }
          }
        }
        handleUseSkill(1);
      }
      else if (e.code === 'KeyF') handleUseSkill(2);
      else if (e.code === 'KeyR') handleReload();
      else if (e.code === 'KeyT' && !e.repeat) {
        const run = hordeRunRef.current;
        if (run.active) {
          if (!run.canExtract) {
            showToast('TOO EARLY', 'Hold the line a bit longer before extract.', '⏳');
          } else if (worldFadeRef.current.phase === 'none') {
            worldFadeRef.current = { phase: 'out', t: 0, pending: 'extract' };
            showToast('EXTRACTING', 'Stepping back through the gate...', '🚪');
          }
        }
      }

      // Hijack / exit car: [V] or [G]
      if ((e.code === 'KeyV' || e.code === 'KeyG') && !e.repeat) {
        toggleVehicleRef.current();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      mouseWorldPosRef.current = screenToWorld(screenX, screenY, canvas.width, canvas.height);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleSwitchWeapon, handleUseSkill, handleReload, tryHijackOrExitCar, showToast]);

  const handleToggleVehicle = useCallback(() => {
    if (introCinematicRef.current.phase !== 'none' && introCinematicRef.current.phase !== 'complete') return;
    const p = playerRef.current;
    if (p.stats.hp <= 0) return;

    const nearHijackable = carsRef.current.some((c) => {
      const dx = p.x - (c.x + 50);
      const dy = p.y - (c.y + 24);
      return Math.sqrt(dx * dx + dy * dy) < HIJACK_RANGE && c.state !== 'player_driven' && c.state !== 'driving';
    });
    if (isDrivingHijackCar(p) || nearHijackable) {
      tryHijackOrExitCar();
      return;
    }

    if (isSkating(p)) {
      const next: Player = {
        ...p,
        isRiding: false,
        activeVehicleId: null,
        skateTrick: null,
        skateTrickTimer: 0,
        state: 'idle',
      };
      playerRef.current = next;
      setPlayer(next);
      sound.playJump();
      showToast('DISMOUNT', 'Board kicked off — back on foot.', '🛹');
      return;
    }

    const board = equippedSkate(p);
    if (!board) {
      showToast('NO BOARD', 'Equip a skateboard first.', '🛹');
      return;
    }

    const mounted = applySkateTrick(
      {
        ...p,
        isRiding: true,
        activeVehicleId: board.id,
        state: 'riding',
        jumpZ: Math.max(p.jumpZ, 1),
        jumpVz: Math.max(p.jumpVz, 340),
        isJumping: true,
      },
      'mount_kickflip'
    );
    playerRef.current = mounted.player;
    setPlayer(mounted.player);
    sound.playSkateTrick('mount_kickflip');
    spawnParticles(p.x, p.y + 8, mounted.color, 14, 'spark');
    addDamagePopup(p.x, p.y - 30, mounted.label, mounted.color, true, false, 'manga', 1.45, 0, -20);
    showToast('KICKFLIP MOUNT!', `+${mounted.points} COOL  •  ${board.name}`, '🛹');
  }, [tryHijackOrExitCar, showToast, spawnParticles, addDamagePopup]);
  toggleVehicleRef.current = handleToggleVehicle;

  const handleCraftItem = useCallback((recipe: CraftRecipe) => {
    const it = ITEMS_DATABASE[recipe.resultItemId];
    if (it) addItemToInventory(it, recipe.resultQuantity);
  }, [addItemToInventory]);

  const handleEquipItem = useCallback((item: Item) => {
    setPlayer((prev) => {
      const eq = { ...prev.equipment };
      if (item.type === 'weapon') eq.weapon = item;
      else if (item.type === 'headwear') eq.headwear = item;
      else if (item.type === 'outfit') eq.outfit = item;
      else if (item.type === 'vehicle') eq.vehicle = item;
      return { ...prev, equipment: eq };
    });
  }, []);

  const handleUseItem = useCallback((item: Item) => {
    if (item && item.healHp) {
      setPlayer((prev) => {
        const newHp = Math.min(prev.stats.maxHp, prev.stats.hp + item.healHp);
        const inv = prev.inventory
          .map((s) => (s.item && s.item.id === item.id ? { ...s, quantity: s.quantity - 1 } : s))
          .filter((s) => s.quantity > 0);
        return {
          ...prev,
          stats: { ...prev.stats, hp: newHp },
          inventory: inv,
        };
      });
      sound.playPickup();
    }
  }, []);

  const handleAllocateStat = useCallback((stat: 'str' | 'agi' | 'int' | 'vit') => {
    setPlayer((prev) => {
      if (prev.stats.statPoints <= 0) return prev;
      return {
        ...prev,
        stats: {
          ...prev.stats,
          statPoints: prev.stats.statPoints - 1,
          [stat]: prev.stats[stat] + 1,
          atk: stat === 'str' ? prev.stats.atk + 3 : prev.stats.atk,
          def: stat === 'vit' ? prev.stats.def + 2 : prev.stats.def,
          maxHp: stat === 'vit' ? prev.stats.maxHp + 25 : prev.stats.maxHp,
          speed: stat === 'agi' ? prev.stats.speed + 0.1 : prev.stats.speed,
        },
      };
    });
  }, []);

  const handleSendEmote = useCallback((emoji: string) => {
    setPlayer((prev) => ({ ...prev, emote: emoji, emoteTimer: 3 }));
  }, []);

  const handleSendChat = useCallback((msg: string) => {
    setPlayer((prev) => ({ ...prev, chatMessage: msg, chatTimer: 4 }));
  }, []);

  const handleEnterHorde = useCallback(() => {
    if (hordeRunRef.current.active) return;
    if (worldFadeRef.current.phase !== 'none') return;
    const p = playerRef.current;
    if (p.stats.hp <= 0) return;
    hordeRunRef.current = {
      ...createEmptyHordeRun(),
      returnX: p.x,
      returnY: p.y,
    };
    worldFadeRef.current = { phase: 'out', t: 0, pending: 'enter' };
    setActiveModal('none');
    setActiveNpc(null);
    showToast('THE GATE OPENS', 'Nyx pulls you into Nullspace...', '💠');
  }, [showToast]);

  const handleExtractHorde = useCallback(() => {
    const run = hordeRunRef.current;
    if (!run.active || worldFadeRef.current.phase !== 'none') return;
    if (!run.canExtract) {
      showToast('TOO EARLY', 'Hold the line a bit longer before extract.', '⏳');
      return;
    }
    worldFadeRef.current = { phase: 'out', t: 0, pending: 'extract' };
  }, [showToast]);

  const handleTeleport = useCallback((x: number, y: number, zoneName: string) => {
    if (hordeRunRef.current.active) {
      endHordeRunRef.current('teleport', false);
    }
    setPlayer((prev) => ({
      ...prev,
      x,
      y,
      vx: 0,
      vy: 0,
      jumpZ: 0,
      jumpVz: 0,
    }));
    sound.playRespawnFanfare();
    showToast('FAST TRAVEL 🚀', `Teleported to ${zoneName}!`, '✨');
  }, [showToast]);

  const handleAcceptQuest = useCallback((questId: string) => {
    const quest = QUESTS_DATABASE[questId];
    if (!quest) return;
    setPlayer((prev) => {
      if (prev.activeQuests[questId] || prev.completedQuestIds.includes(questId)) return prev;
      return {
        ...prev,
        activeQuests: {
          ...prev.activeQuests,
          [questId]: {
            questId,
            status: 'active',
            objectives: quest.objectives.map((obj) => ({ ...obj, current: 0 })),
          },
        },
      };
    });
    sound.playPickup();
  }, []);

  const handleBuyItem = useCallback((item: Item) => {
    setPlayer((prev) => {
      if (prev.gold < item.price) return prev;
      const inv = [...prev.inventory];
      const existing = inv.find((s) => s.item && s.item.id === item.id);
      if (existing && item.stackable) {
        existing.quantity += 1;
      } else {
        inv.push({ slotId: Date.now() + Math.random(), item, quantity: 1 });
      }
      return {
        ...prev,
        gold: prev.gold - item.price,
        inventory: inv,
      };
    });
  }, []);

  const handleSellItem = useCallback((item: Item) => {
    setPlayer((prev) => {
      const sellPrice = Math.floor(item.price * 0.6) || 10;
      const inv = prev.inventory
        .map((s) => (s.item && s.item.id === item.id ? { ...s, quantity: s.quantity - 1 } : s))
        .filter((s) => s.quantity > 0);
      return {
        ...prev,
        gold: prev.gold + sellPrice,
        inventory: inv,
      };
    });
  }, []);

  return {
    player,
    remotePlayers,
    handleTeleport,
    handleEnterHorde,
    handleExtractHorde,
    hordeRun,
    worldFade,
    monsters,
    resourceNodes,
    dropItems,
    interactiveObjects,
    projectiles,
    damagePopups,
    particles,
    groundDecals,
    worldPois,
    cars,
    screenShake,
    activeModal,
    setActiveModal,
    activeNpc,
    setActiveNpc,
    nearbyInteractable,
    gameTimePhase,
    handleInteract,
    toastNotification,
    currentBoss,
    introCinematic,
    joystickVectorRef,
    joystickSprintRef,
    isModdingWeapon,
    setIsModdingWeapon,
    handleEquipAttachment,
    isAiming,
    setIsAiming,
    setFireHeld: (held: boolean) => {
      fireHeldRef.current = held;
    },
    summons,
    handleAttack,
    handleReload,
    handleJump,
    handleUseSkill,
    handleSwitchWeapon,
    handleToggleVehicle,
    handleCraftItem,
    handleEquipItem,
    handleUseItem,
    handleAllocateStat,
    handleSendEmote,
    handleSendChat,
    completeQuest,
    handleAcceptQuest,
    handleBuyItem,
    handleSellItem,
  };
}
