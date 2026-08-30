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
} from './constants';
import { sound } from './audioEngine';
import { net } from './multiplayerClient';
import { screenToWorld } from './worldRenderer';

// WEAPONS MAGAZINE & FIRE RATE CONFIGURATIONS
export const WEAPON_CONFIGS: Record<GunType, { maxAmmo: number; reloadTime: number; fireRate: number; recoil: number; shake: number }> = {
  pistol: { maxAmmo: 12, reloadTime: 0.85, fireRate: 0.16, recoil: 4, shake: 2 },
  revolver: { maxAmmo: 6, reloadTime: 1.25, fireRate: 0.32, recoil: 8, shake: 5 },
  mac10: { maxAmmo: 45, reloadTime: 1.1, fireRate: 0.055, recoil: 2, shake: 2 },
  ak47: { maxAmmo: 30, reloadTime: 1.3, fireRate: 0.11, recoil: 5, shake: 3.5 },
  shotgun: { maxAmmo: 8, reloadTime: 1.5, fireRate: 0.42, recoil: 10, shake: 6 },
  cheytac: { maxAmmo: 5, reloadTime: 1.8, fireRate: 0.65, recoil: 14, shake: 8 },
  katana: { maxAmmo: 1, reloadTime: 0.5, fireRate: 0.22, recoil: 2, shake: 3 },
  sledgehammer: { maxAmmo: 1, reloadTime: 0.6, fireRate: 0.45, recoil: 6, shake: 7 },
};

// Helper function to resolve collisions against solid obstacles (tents, cliffs, boulders)
function resolveObstacleCollisions(x: number, y: number, radius: number = 18): { x: number; y: number } {
  let nx = x;
  let ny = y;

  for (const obs of OBSTACLES) {
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

  return { x: nx, y: ny };
}

export function useGameEngine(initialPlayer: Player) {
  const [player, setPlayer] = useState<Player>(() => ({
    ...initialPlayer,
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
        cinematicPose: 'dive' as const,
        hideWeapon: true,
      }));
      // Start the intro cinematic sequence
      setIntroCinematic({ phase: 'black_fade_in', timer: 0, fallingWeaponY: -300 });
    }
  }, [initialPlayer]);

  const [remotePlayers, setRemotePlayers] = useState<Record<string, Player>>({});
  const [monsters, setMonsters] = useState<Monster[]>(() => JSON.parse(JSON.stringify(INITIAL_MONSTERS)));
  const [resourceNodes, setResourceNodes] = useState<ResourceNode[]>(() => JSON.parse(JSON.stringify(INITIAL_RESOURCE_NODES)));
  const [dropItems, setDropItems] = useState<DropItem[]>([]);
  const [interactiveObjects, setInteractiveObjects] = useState<InteractiveObject[]>(() => JSON.parse(JSON.stringify(INITIAL_INTERACTIVE_OBJECTS)));
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [particles, setParticles] = useState<VisualParticle[]>([]);
  const [groundDecals, setGroundDecals] = useState<GroundDecal[]>([]);
  const [screenShake, setScreenShake] = useState<{ intensity: number; duration: number }>({ intensity: 0, duration: 0 });

  // Interactive UI Modal states
  const [activeModal, setActiveModal] = useState<'none' | 'inventory' | 'craft' | 'shop' | 'dialogue' | 'skills' | 'map'>('none');
  const [activeNpc, setActiveNpc] = useState<NPC | null>(null);
  const [nearbyInteractable, setNearbyInteractable] = useState<{ type: 'npc' | 'node'; id: string; name: string } | null>(null);
  const [toastNotification, setToastNotification] = useState<{ id: string; title: string; message: string; icon: string } | null>(null);

  // Active World Boss Target
  const [currentBoss, setCurrentBoss] = useState<Monster | null>(null);

  // Intro Cinematic State Machine
  type IntroCinematicPhase = 'black_fade_in' | 'dive' | 'impact' | 'skid' | 'dazed' | 'brush' | 'gun_fall_bonk' | 'pickup_ready' | 'complete' | 'none';
  const [introCinematic, setIntroCinematic] = useState<{ phase: IntroCinematicPhase; timer: number; fallingWeaponY: number }>({ phase: 'none', timer: 0, fallingWeaponY: -300 });

  // Keyboard input tracker ref
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const joystickVectorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const joystickSprintRef = useRef<boolean>(false);
  const playerRef = useRef<Player>(player);
  playerRef.current = player;

  const monstersRef = useRef<Monster[]>(monsters);
  monstersRef.current = monsters;

  const resourceNodesRef = useRef<ResourceNode[]>(resourceNodes);
  resourceNodesRef.current = resourceNodes;

  const dropItemsRef = useRef<DropItem[]>(dropItems);
  dropItemsRef.current = dropItems;

  const interactiveObjectsRef = useRef<InteractiveObject[]>(interactiveObjects);
  interactiveObjectsRef.current = interactiveObjects;

  const projectilesRef = useRef<Projectile[]>(projectiles);
  projectilesRef.current = projectiles;

  const particlesRef = useRef<VisualParticle[]>(particles);
  particlesRef.current = particles;

  const groundDecalsRef = useRef<GroundDecal[]>(groundDecals);
  groundDecalsRef.current = groundDecals;

  const damagePopupsRef = useRef<DamagePopup[]>(damagePopups);
  damagePopupsRef.current = damagePopups;

  const screenShakeRef = useRef<{ intensity: number; duration: number }>({ intensity: 0, duration: 0 });

  // Track live mouse position in world coordinates
  const mouseWorldPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
    const popup: DamagePopup = {
      id: `dp_${Date.now()}_${Math.random()}`,
      x: isMangaSound ? x : x + (Math.random() * 16 - 8),
      y: isMangaSound ? y : y - 22,
      vx: vx,
      vy: vy !== undefined ? vy : isMangaSound ? -15 : -35,
      rotation: rotation !== undefined ? rotation : (isMangaSound ? (Math.random() - 0.5) * 0.4 : 0),
      text: isCrit && !text.includes('!') ? `${text}!` : text,
      color,
      isCrit,
      isHeal,
      type: isMangaSound ? 'manga' : type,
      scale: isMangaSound ? (scale !== 1 ? scale : 0.82) : isCrit ? 1.35 : type === 'dodge' ? 1.2 : scale,
      life: isMangaSound ? 0.48 : isCrit ? 0.8 : 0.65,
      maxLife: isMangaSound ? 0.48 : isCrit ? 0.8 : 0.65,
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

  // Add Item to Player Inventory
  const addItemToInventory = useCallback((item: Item, quantity: number = 1) => {
    setPlayer((prev) => {
      const inv = [...prev.inventory];
      if (item.stackable) {
        const existing = inv.find((slot) => slot.item.id === item.id);
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
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
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
        confetti({ particleCount: 75, spread: 60, origin: { y: 0.65 } });
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
  const handleMonsterDefeated = useCallback((m: Monster) => {
    m.state = 'dead';
    m.hp = 0;
    m.deathProgress = 0;
    m.deathType = Math.random() > 0.5 ? 'back' : 'front';
    m.battleBark = { text: m.isBoss ? 'IMPOSSIBLE...!' : 'AGHHH!!', timer: 1.2 };
    if (m.sniperLaser) m.sniperLaser.active = false;

    awardExpAndGold(m.expReward, m.goldReward);
    updateQuestObjective('kill', m.type, 1);
    addGroundDecal(m.x, m.y + 10, '#7F1D1D', m.isBoss ? 32 : 18);
    spawnParticles(m.x, m.y, '#EF4444', m.isBoss ? 35 : 16, 'spark');

    // Roll Loot Drops
    if (m.dropTable) {
      m.dropTable.forEach((d) => {
        if (Math.random() <= d.chance) {
          const qty = Math.floor(Math.random() * (d.maxQty - d.minQty + 1)) + d.minQty;
          spawnDrop(d.itemId, m.x, m.y, qty);
        }
      });
    }

    if (m.isBoss) {
      confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 } });
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
  }, [awardExpAndGold, updateQuestObjective, addGroundDecal, spawnParticles, spawnDrop, showToast]);

  // Detonate Explosive Barrel / Object
  const explodeInteractiveObject = useCallback((obj: InteractiveObject) => {
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
      if (other.id !== obj.id && other.hp > 0) {
        const odx = other.x - obj.x;
        const ody = other.y - obj.y;
        const oDist = Math.sqrt(odx * odx + ody * ody);
        if (oDist <= blastRadius) {
          other.hp = 0;
          setTimeout(() => explodeInteractiveObject(other), 120);
        }
      }
    });
  }, [triggerShake, addGroundDecal, spawnParticles, addDamagePopup, handleMonsterDefeated]);

  // Jump Action (with Bhop Acceleration)
  const handleJump = useCallback(() => {
    const curPlayer = playerRef.current;
    if (curPlayer.stats.hp <= 0) return;

    if (curPlayer.jumpZ <= 1) {
      const isChainingBhop = curPlayer.bhopTimer > 0;
      const nextStreak = isChainingBhop ? Math.min(10, curPlayer.bhopStreak + 1) : 1;
      const nextSpeedMult = isChainingBhop ? 1.0 + nextStreak * 0.12 : 1.1;

      setPlayer((prev) => ({
        ...prev,
        jumpZ: 1,
        jumpVz: 320,
        isJumping: true,
        bhopStreak: nextStreak,
        bhopTimer: 0.45,
        bhopSpeedMult: nextSpeedMult,
      }));

      sound.playJump();
      spawnParticles(curPlayer.x, curPlayer.y + 10, '#38BDF8', 5, 'spark');
    }
  }, [spawnParticles]);

  // Weapon Hot-Swap / Equip (Keys 1-6)
  const handleSwitchWeapon = useCallback((gunTypeOrId: string) => {
    const wpn = Object.values(ITEMS_DATABASE).find((it) => it.id === gunTypeOrId || it.gunType === gunTypeOrId);
    if (!wpn) return;

    const gunType: GunType = wpn.gunType || 'pistol';
    const config = WEAPON_CONFIGS[gunType] || WEAPON_CONFIGS.pistol;

    setPlayer((prev) => {
      const extraAmmo = prev.weaponAttachments?.magazine?.statBonus?.ammoBonus || 0;
      const totalMaxAmmo = config.maxAmmo + extraAmmo;
      return {
        ...prev,
        equipment: { ...prev.equipment, weapon: wpn },
        ammo: totalMaxAmmo,
        maxAmmo: totalMaxAmmo,
        isReloading: false,
        reloadTimer: 0,
      };
    });

    showToast('Equipped Weapon', `${wpn.name} [${config.maxAmmo}/${config.maxAmmo}]`, wpn.icon);
    sound.playPickup();
  }, [showToast]);

  // Weapon Reload (Manual [R] or automatic on empty magazine)
  const handleReload = useCallback(() => {
    const curPlayer = playerRef.current;
    if (curPlayer.stats.hp <= 0 || curPlayer.isReloading) return;

    const activeWeapon = curPlayer.equipment.weapon || ITEMS_DATABASE['wpn_starter_pistol'];
    const gunType: GunType = activeWeapon.gunType || 'pistol';
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
    const curPlayer = playerRef.current;
    if (curPlayer.stats.hp <= 0 || curPlayer.attackTimer > 0) return;

    const activeWeapon = curPlayer.equipment.weapon || ITEMS_DATABASE['wpn_starter_pistol'];
    const gunType: GunType = activeWeapon.gunType || 'pistol';
    const config = WEAPON_CONFIGS[gunType] || WEAPON_CONFIGS.pistol;
    const maxCapacity = curPlayer.maxAmmo ?? config.maxAmmo;

    // Cannot shoot while reloading
    if (curPlayer.isReloading) {
      return;
    }

    // Check empty magazine
    const currentAmmo = curPlayer.ammo !== undefined ? curPlayer.ammo : maxCapacity;
    if (currentAmmo <= 0) {
      sound.playEmptyClick();
      handleReload();
      return;
    }

    const nextAmmo = currentAmmo - 1;
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

    setPlayer((prev) => ({
      ...prev,
      facing: newFacing,
      aimAngle,
      ammo: nextAmmo,
      maxAmmo: maxCapacity,
      attackTimer: config.fireRate,
    }));

    if (nextAmmo === 0) {
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

    // Spawn Comic Onomatopoeia Shot Text Popup (POW!, ПИХ!, ПАХ!, BANG!, etc.)
    const triggerComicMuzzleFlash = (currentGun: GunType) => {
      const barrelLen = currentGun === 'cheytac' ? 42 :
                        currentGun === 'shotgun' ? 32 :
                        currentGun === 'ak47' ? 34 :
                        currentGun === 'revolver' ? 30 :
                        currentGun === 'mac10' ? 28 : 26;

      const muzzleBaseX = curPlayer.x + aimDirX * barrelLen;
      const muzzleBaseY = curPlayer.y + aimDirY * barrelLen - 3;

      // Perpendicular vector to aim direction (for left/right flank offsets)
      const perpX = -aimDirY;
      const perpY = aimDirX;

      // Dynamic positions around the muzzle (left flank, right flank, top/above, bottom/under, forward blast, diagonal fan)
      const mode = Math.floor(Math.random() * 6);
      let fwdOffset = 0;
      let sideOffset = 0;
      let extraY = 0;

      switch (mode) {
        case 0: // Слева сбоку (Left side flank)
          sideOffset = -(12 + Math.random() * 14);
          fwdOffset = (Math.random() - 0.2) * 12;
          break;
        case 1: // Справа сбоку (Right side flank)
          sideOffset = 12 + Math.random() * 14;
          fwdOffset = (Math.random() - 0.2) * 12;
          break;
        case 2: // Сверху над дулом (Above muzzle)
          sideOffset = (Math.random() - 0.5) * 12;
          fwdOffset = 4 + Math.random() * 12;
          extraY = -(12 + Math.random() * 8);
          break;
        case 3: // Снизу под дулом (Below muzzle)
          sideOffset = (Math.random() - 0.5) * 12;
          fwdOffset = 4 + Math.random() * 12;
          extraY = 10 + Math.random() * 8;
          break;
        case 4: // Прямо с дула вперед (Forward blast)
          sideOffset = (Math.random() - 0.5) * 10;
          fwdOffset = 14 + Math.random() * 14;
          break;
        default: // Диагонально в сторону (Diagonal angle)
          sideOffset = (Math.random() > 0.5 ? 1 : -1) * (12 + Math.random() * 10);
          fwdOffset = 8 + Math.random() * 12;
          extraY = (Math.random() - 0.5) * 10;
          break;
      }

      const spawnX = muzzleBaseX + aimDirX * fwdOffset + perpX * sideOffset;
      const spawnY = muzzleBaseY + aimDirY * fwdOffset + perpY * sideOffset + extraY;

      // Dynamic outward drift velocity so the flash flies away from the muzzle
      const driftAngle = Math.atan2(spawnY - muzzleBaseY, spawnX - muzzleBaseX);
      const driftSpeed = 24 + Math.random() * 24;
      const vx = Math.cos(driftAngle) * driftSpeed;
      const vy = Math.sin(driftAngle) * driftSpeed - 6;
      const rot = (Math.random() - 0.5) * 0.45;

      const WORDS_BY_GUN: Record<string, string[]> = {
        cheytac: ['PEW!', 'BANG!', 'ТЫДЫЩ!', 'БДЫЩ!', 'POW!', 'БАХ!'],
        shotgun: ['BOOM!', 'БАБАХ!', 'БДЫЩ!', 'POW!', 'ПАХ!', 'КРАШ!'],
        ak47: ['RATATA!', 'BANG!', 'ПАХ-ПАХ!', 'ПИХ!', 'POW!', 'ТРА-ТА!'],
        mac10: ['RATATA!', 'ПИХ!', 'POW!', 'ТА-ТА!', 'BANG!', 'ПАХ!'],
        revolver: ['BANG!', 'БДЫЩ!', 'БАБАХ!', 'POW!', 'ПАХ!', 'ТЫДЫЩ!'],
        pistol: ['POW!', 'ПИХ!', 'ПАХ!', 'BANG!', 'БДЫЩ!', 'PEW!'],
      };
      const wordsList = WORDS_BY_GUN[currentGun] || ['POW!', 'ПИХ!', 'ПАХ!', 'BANG!', 'БДЫЩ!', 'БАБАХ!'];
      const chosenWord = wordsList[Math.floor(Math.random() * wordsList.length)];
      const wordColor = currentGun === 'cheytac' ? '#38BDF8' : currentGun === 'ak47' ? '#EF4444' : currentGun === 'shotgun' ? '#F59E0B' : currentGun === 'mac10' ? '#FBBF24' : '#FDE047';

      addDamagePopup(
        spawnX,
        spawnY,
        chosenWord,
        wordColor,
        true,
        false,
        'manga',
        0.82,
        vx,
        vy,
        rot
      );
    };

    triggerComicMuzzleFlash(gunType);

    // ==========================================
    // 1. CHEYTAC M200 SNIPER RIFLE
    // ==========================================
    if (gunType === 'cheytac') {
      sound.playShoot();
      triggerShake(8, 0.2);
      spawnParticles(curPlayer.x + aimDirX * 30, curPlayer.y + aimDirY * 30, '#38BDF8', 12, 'spark');

      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + 25 + critBonus);
      const sniperProj: Projectile = {
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
        color: '#E0E7FF',
        size: 5,
        isCrit,
        piercing: true,
      };
      projectilesRef.current = [...projectilesRef.current, sniperProj];
      setProjectiles([...projectilesRef.current]);
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

        const pellet: Projectile = {
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
        };
        projectilesRef.current = [...projectilesRef.current, pellet];
      }
      setProjectiles([...projectilesRef.current]);
    }
    // ==========================================
    // 3. MAC-10 (2-BULLET RAPID BURST)
    // ==========================================
    else if (gunType === 'mac10') {
      for (let b = 0; b < 2; b++) {
        setTimeout(() => {
          sound.playShoot();
          const spread = (Math.random() - 0.5) * (0.15 * spreadFactor);
          const bulletAngle = aimAngle + spread;
          const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);

          const smgBullet: Projectile = {
            id: `p_mac_${now}_${b}`,
            ownerId: curPlayer.id,
            type: 'bullet',
            x: curPlayer.x + aimDirX * 20,
            y: curPlayer.y + aimDirY * 20,
            vx: Math.cos(bulletAngle) * 24,
            vy: Math.sin(bulletAngle) * 24,
            damage: Math.round(curPlayer.stats.atk * 0.9 * dmgMult),
            range: 1300 + rangeBonus,
            distanceTraveled: 0,
            color: '#FBBF24',
            size: 4,
            isCrit,
          };
          if (b > 0) {
            triggerComicMuzzleFlash('mac10');
          }
          projectilesRef.current = [...projectilesRef.current, smgBullet];
          setProjectiles([...projectilesRef.current]);
        }, b * 45);
      }
    }
    // ==========================================
    // 4. AK-47 (KALASHNIKOV)
    // ==========================================
    else if (gunType === 'ak47') {
      sound.playShoot();
      triggerShake(4, 0.1);
      spawnParticles(curPlayer.x + aimDirX * 24, curPlayer.y + aimDirY * 24, '#EF4444', 6, 'spark');

      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
      const akBullet: Projectile = {
        id: `p_ak_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 24,
        y: curPlayer.y + aimDirY * 24,
        vx: aimDirX * 28,
        vy: aimDirY * 28,
        damage: Math.round(curPlayer.stats.atk * 1.6 * dmgMult),
        range: 1600 + rangeBonus,
        distanceTraveled: 0,
        color: '#EF4444',
        size: 5,
        isCrit,
      };
      projectilesRef.current = [...projectilesRef.current, akBullet];
      setProjectiles([...projectilesRef.current]);
    }
    // ==========================================
    // 5. REVOLVER (.44 MAGNUM)
    // ==========================================
    else if (gunType === 'revolver') {
      sound.playShoot();
      triggerShake(6, 0.15);
      spawnParticles(curPlayer.x + aimDirX * 24, curPlayer.y + aimDirY * 24, '#F97316', 8, 'spark');

      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + 15 + critBonus);
      const revBullet: Projectile = {
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
      };
      projectilesRef.current = [...projectilesRef.current, revBullet];
      setProjectiles([...projectilesRef.current]);
    }
    // ==========================================
    // 6. DEFAULT PISTOL / STARTER
    // ==========================================
    else {
      sound.playShoot();
      spawnParticles(curPlayer.x + aimDirX * 22, curPlayer.y + aimDirY * 22, '#38BDF8', 5, 'spark');

      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + critBonus);
      const pistolBullet: Projectile = {
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
      };
      projectilesRef.current = [...projectilesRef.current, pistolBullet];
      setProjectiles([...projectilesRef.current]);
    }
  }, [triggerShake, spawnParticles]);

  // Skill Cast action
  const handleUseSkill = useCallback((skillIndex: number, targetWorldX?: number, targetWorldY?: number) => {
    const curPlayer = playerRef.current;
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

    // Skill 1: Gatling Stream (12 bullets towards cursor)
    if (skillIndex === 0) {
      showToast('Rapid Fire Burst! ⚡', '12 rapid bullets stream towards cursor', '⚡');
      triggerShake(4, 0.4);
      for (let i = 0; i < 12; i++) {
        setTimeout(() => {
          if (playerRef.current.stats.hp <= 0) return;
          const liveP = playerRef.current;
          sound.playShoot();
          const proj: Projectile = {
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
          };
          projectilesRef.current = [...projectilesRef.current, proj];
          setProjectiles([...projectilesRef.current]);
        }, i * 45);
      }
    }
    // Skill 2: Fan of Bullets (9 spread bullets)
    else if (skillIndex === 1) {
      showToast('Fan of Bullets! 💥', 'Wide penetrating spread', '💥');
      sound.playShoot();
      triggerShake(6, 0.2);
      const numBullets = 9;
      const spreadAngle = (70 * Math.PI) / 180;
      for (let i = 0; i < numBullets; i++) {
        const offset = (i - (numBullets - 1) / 2) * (spreadAngle / (numBullets - 1));
        const angle = aimAngle + offset;
        const proj: Projectile = {
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
        };
        projectilesRef.current = [...projectilesRef.current, proj];
      }
      setProjectiles([...projectilesRef.current]);
    }
    // Skill 3: Aerial Vault & Ricochet
    else if (skillIndex === 2) {
      showToast('Aerial Aimbot Ricochet! 🎯', 'Vaulted into air with homing ricochets', '🎯');
      triggerShake(10, 0.6);
      handleJump();
      const livingMonsters = monstersRef.current.filter((m) => m.hp > 0);
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (playerRef.current.stats.hp <= 0) return;
          const target = livingMonsters.length > 0 ? livingMonsters[i % livingMonsters.length] : null;
          const angle = aimAngle + (i - 2.5) * 0.25;
          const ricochetProj: Projectile = {
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
          };
          projectilesRef.current = [...projectilesRef.current, ricochetProj];
          setProjectiles([...projectilesRef.current]);
        }, i * 50);
      }
    }
  }, [showToast, triggerShake, handleJump]);

  // Main Loop (Physics, Movement, Bhop, Projectiles, Boss Patterns)
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      const curPlayer = playerRef.current;

      // 0. Player Death & Respawn System
      if (curPlayer.stats.hp <= 0) {
        if (!curPlayer.isRespawning) {
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
      if (introCinematic.phase !== 'none' && introCinematic.phase !== 'complete') {
        const ct = introCinematic.timer + dt;
        const phase = introCinematic.phase;
        let nextPhase: IntroCinematicPhase = phase;
        let fallingY = introCinematic.fallingWeaponY;

        if (phase === 'black_fade_in') {
          // Phase 1: Fade from black (0.0s - 0.4s)
          if (ct >= 0.4) {
            nextPhase = 'dive';
            sound.playDiveWhoosh();
            setPlayer((prev) => ({
              ...prev,
              y: -200,
              x: 650,
              jumpZ: 900,
              cinematicPose: 'dive' as const,
              hideWeapon: true,
            }));
          }
        } else if (phase === 'dive') {
          // Phase 2: Supersonic dive from sky (0.0s - 1.0s)
          const diveProgress = Math.min(1, ct / 1.0);
          const eased = diveProgress * diveProgress; // Accelerating ease
          const newY = -200 + (750 - (-200)) * eased;
          const newJumpZ = 900 * (1 - eased);

          setPlayer((prev) => ({
            ...prev,
            y: newY,
            x: 650,
            jumpZ: Math.max(0, newJumpZ),
            cinematicPose: 'dive' as const,
            hideWeapon: true,
          }));

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
            addDamagePopup(650, 700, 'БАБАХ!', '#FDE047', true, false, 'manga', 1.8, 0, -20);
            setPlayer((prev) => ({
              ...prev,
              y: 750,
              x: 650,
              jumpZ: 0,
              cinematicPose: 'skid' as const,
              hideWeapon: true,
              facing: 'right',
            }));
          }
        } else if (phase === 'impact') {
          // Phase 3: Brief impact moment before skid (0.0s - 0.1s)
          if (ct >= 0.1) {
            nextPhase = 'skid';
            sound.playSkid();
            addDamagePopup(680, 720, 'CRASH!', '#EF4444', true, false, 'manga', 1.4, 5, -15);
          }
        } else if (phase === 'skid') {
          // Phase 4: Ground skid ~10 meters/230px (0.0s - 1.2s)
          const skidProgress = Math.min(1, ct / 1.2);
          const skidEase = 1 - Math.pow(1 - skidProgress, 3); // Decelerating
          const skidX = 650 + 230 * skidEase;

          setPlayer((prev) => ({
            ...prev,
            x: skidX,
            y: 750,
            jumpZ: 0,
            cinematicPose: 'skid' as const,
            hideWeapon: true,
            facing: 'right',
          }));

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
            addDamagePopup(skidX, 720, 'ВЖУУУХ!', '#38BDF8', false, false, 'manga', 1.2, 0, -12);
            setPlayer((prev) => ({
              ...prev,
              x: 880,
              y: 750,
              cinematicPose: 'dazed' as const,
              hideWeapon: true,
            }));
          }
        } else if (phase === 'dazed') {
          // Phase 5: Dazed on ground (0.0s - 0.8s)
          if (ct >= 0.8) {
            nextPhase = 'brush';
            setPlayer((prev) => ({
              ...prev,
              cinematicPose: 'brush' as const,
              hideWeapon: true,
            }));
          }
        } else if (phase === 'brush') {
          // Phase 6: Brushing off dust (0.0s - 1.0s)
          if (ct >= 1.0) {
            nextPhase = 'gun_fall_bonk';
            fallingY = -300;
            setPlayer((prev) => ({
              ...prev,
              cinematicPose: 'none' as const,
              hideWeapon: true,
            }));
          }
        } else if (phase === 'gun_fall_bonk') {
          // Phase 7: Weapon falls from sky and bonks head (0.0s - 1.6s)
          fallingY = -300 + (ct / 0.8) * 300; // Falls to head level (y=0 relative)

          if (ct >= 0.8 && ct < 0.85) {
            // BONK moment!
            sound.playBonk();
            sound.playOuchGrunt();
            triggerShake(8, 0.3);
            addDamagePopup(880, 710, '💥 АЙ БОЛЬНО!', '#EF4444', true, false, 'manga', 1.5, 0, -18);
            setPlayer((prev) => ({
              ...prev,
              cinematicPose: 'bonk' as const,
              hideWeapon: true,
            }));
          }

          if (ct >= 1.6) {
            nextPhase = 'pickup_ready';
            setPlayer((prev) => ({
              ...prev,
              cinematicPose: 'pickup' as const,
              hideWeapon: true,
            }));
          }
        } else if (phase === 'pickup_ready') {
          // Phase 8: Pick up weapon and battle ready (0.0s - 1.4s)
          if (ct < 0.7) {
            // Picking up
          } else if (ct >= 0.7 && ct < 0.75) {
            sound.playPickup();
            setPlayer((prev) => ({
              ...prev,
              cinematicPose: 'ready' as const,
              hideWeapon: false,
            }));
          }

          if (ct >= 1.4) {
            nextPhase = 'complete';
            addDamagePopup(880, 710, 'READY FOR COMBAT!', '#10B981', false, false, 'system', 1.3, 0, -15);
            setPlayer((prev) => ({
              ...prev,
              cinematicPose: undefined,
              hideWeapon: false,
              spawnBounce: 0.1,
            }));
          }
        }

        if (nextPhase !== phase) {
          setIntroCinematic({ phase: nextPhase, timer: 0, fallingWeaponY: fallingY });
        } else {
          setIntroCinematic({ phase, timer: ct, fallingWeaponY: fallingY });
        }

        // During cinematic, skip normal player update
        if (nextPhase !== 'complete') {
          // Still update monsters and other systems minimally
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
      let bhopTimer = Math.max(0, (curPlayer.bhopTimer ?? 0) - dt);
      let bhopStreak = curPlayer.bhopStreak ?? 0;
      let bhopSpeedMult = curPlayer.bhopSpeedMult ?? 1.0;

      if (keysRef.current['Space'] && jumpZ <= 0) {
        jumpZ = 1;
        jumpVz = 320;
        isJumping = true;
        if (bhopTimer > 0) {
          bhopStreak = Math.min(10, bhopStreak + 1);
          bhopSpeedMult = 1.0 + bhopStreak * 0.12;
        } else {
          bhopStreak = 1;
          bhopSpeedMult = 1.1;
        }
        bhopTimer = 0.45;
        sound.playJump();
        spawnParticles(curPlayer.x, curPlayer.y + 10, '#38BDF8', 4, 'spark');
      } else if (jumpZ > 0 || jumpVz !== 0) {
        jumpZ = Math.max(0, jumpZ + jumpVz * dt);
        jumpVz -= 680 * dt; // Gravity
        if (jumpZ <= 0) {
          jumpZ = 0;
          jumpVz = 0;
          isJumping = false;
          bhopTimer = 0.35;
        }
      }

      if (bhopTimer <= 0 && jumpZ <= 0) {
        bhopStreak = 0;
        bhopSpeedMult = 1.0;
      }

      // 2. Active Dodge Roll & Air Dash (Shift Key with I-Frames & Extended Slide Distance)
      let dodgeTimer = Math.max(0, (curPlayer.dodgeTimer ?? 0) - dt);
      let dodgeCooldown = Math.max(0, (curPlayer.dodgeCooldown ?? 0) - dt);
      let dashVx = curPlayer.dashVx ?? 0;
      let dashVy = curPlayer.dashVy ?? 0;
      let isAirDash = curPlayer.isAirDash ?? false;

      const isShiftPressed = keysRef.current['ShiftLeft'] || keysRef.current['ShiftRight'] || joystickSprintRef.current;
      if (isShiftPressed && dodgeCooldown <= 0 && dodgeTimer <= 0) {
        dodgeTimer = 0.52;
        dodgeCooldown = 0.62;
        isAirDash = jumpZ > 3;

        let dashDirX = moveX;
        let dashDirY = moveY;
        if (dashDirX === 0 && dashDirY === 0) {
          dashDirX = curPlayer.facing === 'left' ? -1 : 1;
          dashDirY = 0;
        }
        const dMag = Math.sqrt(dashDirX * dashDirX + dashDirY * dashDirY) || 1;
        dashDirX /= dMag;
        dashDirY /= dMag;

        const dashSpeed = isAirDash ? 850 : 960;
        dashVx = dashDirX * dashSpeed;
        dashVy = dashDirY * dashSpeed;

        sound.playDodgeRoll();
        spawnParticles(curPlayer.x, curPlayer.y + 10, isAirDash ? '#38BDF8' : '#FDE047', 12, 'spark');
      }

      if (dodgeTimer > 0 && Math.random() < 0.4 && jumpZ <= 1) {
        spawnParticles(curPlayer.x, curPlayer.y + 12, '#F59E0B', 2, 'spark');
      }

      // Base Speed
      let baseSpeed = curPlayer.stats.speed * 48;
      if (curPlayer.isRiding) baseSpeed *= 1.8;
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

      // Obstacle Collision
      const resolvedPos = resolveObstacleCollisions(nextX, nextY, 18);
      nextX = Math.max(50, Math.min(WORLD_WIDTH - 50, resolvedPos.x));
      nextY = Math.max(50, Math.min(WORLD_HEIGHT - 50, resolvedPos.y));

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
        state: dodgeTimer > 0 ? 'dodge' : nextAttackTimer > 0 ? 'attack' : isWalking ? 'walk' : 'idle',
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

      // 3. Magnetic Item Pickup
      const remainingDrops: DropItem[] = [];
      dropItemsRef.current.forEach((drop) => {
        const dx = nextX - drop.x;
        const dy = nextY - drop.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 65) {
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
          if (oDist <= obj.radius + 10) {
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

            if (dist <= (m.isBoss || m.isJuggernaut ? 55 : 30)) {
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

              // If shot by player, set individual retaliation aggro
              if (p.ownerId === nextPlayer.id) {
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

              if (m.hp <= 0) handleMonsterDefeated(m);
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

          // If player jumps high over bullet (jumpZ > 24), projectile misses!
          if (dist <= 26 && jumpZ < 26) {
            // CHECK I-FRAMES (Dodge Roll Invulnerability)
            if (nextPlayer.dodgeTimer > 0) {
              sound.playDodgeEvade();
              addDamagePopup(nextX, nextY - 14, 'DODGE!', '#38BDF8', true, false, 'dodge', 1.2);
              spawnParticles(nextX, nextY, '#38BDF8', 6, 'spark');
              consumed = true;
            } else {
              const dmg = Math.max(5, Math.round(p.damage - nextPlayer.stats.def * 0.3));
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
        }
      });
      projectilesRef.current = remainingProjectiles;
      setProjectiles(remainingProjectiles);

      // 6. Update Monster AI, Battle Barks, Faction Skirmishes, Dashing, Jumping, Charging/Pinning & Respawn
      monstersRef.current.forEach((m) => {
        // Update Battle Bark timer
        if (m.battleBark && m.battleBark.timer > 0) {
          m.battleBark.timer = Math.max(0, m.battleBark.timer - dt);
        }

        // Update Death Ragdoll & Smooth Auto-Respawn
        if (m.state === 'dead') {
          m.deathProgress = Math.min(1, (m.deathProgress || 0) + dt * 0.65);
          if (m.isRespawning && m.respawnTime !== undefined) {
            m.respawnTime -= dt;
            if (m.respawnTime <= 0) {
              const isCop = m.faction === 'police';
              m.x = isCop ? 1750 + Math.random() * 450 : 2850 + Math.random() * 450;
              m.y = 3300 + Math.random() * 850;
              m.hp = m.maxHp;
              m.state = 'idle';
              m.deathProgress = 0;
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

        // Active evasion: chance to dodge roll if an incoming bullet is nearby
        if ((!m.dodgeTimer || m.dodgeTimer <= 0) && (!m.dodgeCooldown || m.dodgeCooldown <= 0) && Math.random() < 0.04) {
          const nearProj = projectilesRef.current.find(
            (pr) => pr.ownerId !== m.id && Math.sqrt((pr.x - m.x) ** 2 + (pr.y - m.y) ** 2) < 130
          );
          if (nearProj) {
            m.dodgeTimer = 0.42;
            m.dodgeCooldown = 1.8;
            const dodgeAngle = Math.atan2(nearProj.vy, nearProj.vx) + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
            m.dashVx = Math.cos(dodgeAngle) * 460;
            m.dashVy = Math.sin(dodgeAngle) * 460;
            sound.playDodgeRoll();
            addDamagePopup(m.x, m.y - 12, 'DODGE!', '#38BDF8', false, false, 'dodge', 1.15);
            spawnParticles(m.x, m.y + 10, '#38BDF8', 6, 'spark');
          }
        }

        // Active jumping: chance to jump into combat, over terrain or over fire
        if (!m.isJumping && (m.jumpZ === undefined || m.jumpZ <= 0) && Math.random() < 0.018) {
          m.jumpZ = 1;
          m.jumpVz = 280 + Math.random() * 80;
          m.isJumping = true;
          sound.playJump();
          spawnParticles(m.x, m.y + 10, m.faction === 'police' ? '#38BDF8' : '#EF4444', 4, 'spark');
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
          let nearestDist = 2000;

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
              const resolvedEnemy = resolveObstacleCollisions(enemyNextX, enemyNextY, 20);
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
              const resolvedM = resolveObstacleCollisions(nextMx, nextMy, 18);
              m.x = resolvedM.x;
              m.y = resolvedM.y;
            }
            return;
          }
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

      // 7. Update Visual Particles & Popups
      particlesRef.current = particlesRef.current
        .map((pt) => ({
          ...pt,
          x: pt.x + pt.vx,
          y: pt.y + pt.vy,
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
  }, [addItemToInventory, handleMonsterDefeated, explodeInteractiveObject, spawnParticles, addDamagePopup, addGroundDecal, triggerShake, showToast]);

  // Global Keyboard Listeners (Movement, Skills, Weapon Hotkeys 1-6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;

      // Weapon Hotkeys: Keys [1] - [6]
      if (e.code === 'Digit1') handleSwitchWeapon('pistol');
      else if (e.code === 'Digit2') handleSwitchWeapon('revolver');
      else if (e.code === 'Digit3') handleSwitchWeapon('mac10');
      else if (e.code === 'Digit4') handleSwitchWeapon('ak47');
      else if (e.code === 'Digit5') handleSwitchWeapon('shotgun');
      else if (e.code === 'Digit6') handleSwitchWeapon('cheytac');

      // Skills & Reload: [Q], [E], [F], [R]
      if (e.code === 'KeyQ') handleUseSkill(0);
      else if (e.code === 'KeyE') handleUseSkill(1);
      else if (e.code === 'KeyF' || e.code === 'KeyC') handleUseSkill(2);
      else if (e.code === 'KeyR') handleReload();
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
  }, [handleSwitchWeapon, handleUseSkill, handleReload]);

  const handleToggleVehicle = useCallback(() => {
    setPlayer((prev) => ({ ...prev, isRiding: !prev.isRiding }));
  }, []);

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
      return { ...prev, equipment: eq };
    });
  }, []);

  const handleUseItem = useCallback((slot: any) => {
    if (slot.item.healHp) {
      setPlayer((prev) => ({
        ...prev,
        stats: { ...prev.stats, hp: Math.min(prev.stats.maxHp, prev.stats.hp + slot.item.healHp) },
      }));
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

  return {
    player,
    remotePlayers,
    monsters,
    resourceNodes,
    dropItems,
    interactiveObjects,
    projectiles,
    damagePopups,
    particles,
    groundDecals,
    screenShake,
    activeModal,
    setActiveModal,
    activeNpc,
    setActiveNpc,
    nearbyInteractable,
    toastNotification,
    currentBoss,
    joystickVectorRef,
    joystickSprintRef,
    isModdingWeapon,
    setIsModdingWeapon,
    handleEquipAttachment,
    isAiming,
    setIsAiming,
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
  };
}
