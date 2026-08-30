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
  }));

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

  // Add damage popup text
  const addDamagePopup = useCallback((x: number, y: number, text: string, color: string = '#F87171', isCrit: boolean = false, isHeal: boolean = false) => {
    const popup: DamagePopup = {
      id: `dp_${Date.now()}_${Math.random()}`,
      x: x + (Math.random() * 20 - 10),
      y: y - 20,
      text: isCrit ? `${text}!` : text,
      color,
      isCrit,
      isHeal,
      life: 0.65,
      maxLife: 0.65,
    };
    damagePopupsRef.current = [...damagePopupsRef.current, popup];
  }, []);

  // Trigger screen shake
  const triggerShake = useCallback((intensity: number = 6, duration: number = 0.2) => {
    setScreenShake({ intensity, duration });
  }, []);

  // Add Ground Decal (Blood stain / bullet mark / explosion scorch)
  const addGroundDecal = useCallback((x: number, y: number, color: string = '#991B1B', radius: number = 14) => {
    const newDecal: GroundDecal = {
      id: `decal_${Date.now()}_${Math.random()}`,
      x: x + (Math.random() * 10 - 5),
      y: y + (Math.random() * 6 - 3),
      radius: radius + Math.random() * 4,
      color,
      alpha: 0.85,
      life: 18.0,
      maxLife: 18.0,
      splatterCount: Math.floor(Math.random() * 3) + 2,
    };
    groundDecalsRef.current = [...groundDecalsRef.current.slice(-60), newDecal];
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

  // Handle Monster Defeated (Drops weapons directly onto the ground!)
  const handleMonsterDefeated = useCallback((m: Monster) => {
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

    setPlayer((prev) => ({
      ...prev,
      equipment: { ...prev.equipment, weapon: wpn },
    }));

    showToast('Equipped Weapon', wpn.name, wpn.icon);
    sound.playPickup();
  }, [showToast]);

  // Basic Attack firing based on active weapon
  const handleAttack = useCallback((targetWorldX?: number, targetWorldY?: number) => {
    const curPlayer = playerRef.current;
    if (curPlayer.stats.hp <= 0 || curPlayer.attackTimer > 0) return;

    const now = Date.now();
    const activeWeapon = curPlayer.equipment.weapon || ITEMS_DATABASE['wpn_starter_pistol'];
    const gunType: GunType = activeWeapon.gunType || 'pistol';

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
      attackTimer: gunType === 'mac10' ? 0.09 : gunType === 'cheytac' ? 0.45 : 0.16,
    }));

    // ==========================================
    // 1. CHEYTAC M200 SNIPER RIFLE
    // ==========================================
    if (gunType === 'cheytac') {
      sound.playShoot();
      triggerShake(8, 0.2);
      spawnParticles(curPlayer.x + aimDirX * 30, curPlayer.y + aimDirY * 30, '#38BDF8', 12, 'spark');

      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + 25);
      const sniperProj: Projectile = {
        id: `p_cheytac_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'laser',
        x: curPlayer.x + aimDirX * 28,
        y: curPlayer.y + aimDirY * 28 - 2,
        vx: aimDirX * 42,
        vy: aimDirY * 42,
        damage: Math.round(curPlayer.stats.atk * 3.8),
        range: 2200,
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
      const spreadAngle = (32 * Math.PI) / 180;
      for (let i = 0; i < numPellets; i++) {
        const offset = (i - (numPellets - 1) / 2) * (spreadAngle / (numPellets - 1));
        const angle = aimAngle + offset;
        const isCrit = Math.random() * 100 < curPlayer.stats.critRate;

        const pellet: Projectile = {
          id: `p_shot_${now}_${i}`,
          ownerId: curPlayer.id,
          type: 'bullet',
          x: curPlayer.x + aimDirX * 20,
          y: curPlayer.y + aimDirY * 20,
          vx: Math.cos(angle) * (20 + (Math.random() - 0.5) * 3),
          vy: Math.sin(angle) * (20 + (Math.random() - 0.5) * 3),
          damage: Math.round(curPlayer.stats.atk * 0.85),
          range: 950,
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
          const spread = (Math.random() - 0.5) * 0.15;
          const bulletAngle = aimAngle + spread;
          const isCrit = Math.random() * 100 < curPlayer.stats.critRate;

          const smgBullet: Projectile = {
            id: `p_mac_${now}_${b}`,
            ownerId: curPlayer.id,
            type: 'bullet',
            x: curPlayer.x + aimDirX * 20,
            y: curPlayer.y + aimDirY * 20,
            vx: Math.cos(bulletAngle) * 24,
            vy: Math.sin(bulletAngle) * 24,
            damage: Math.round(curPlayer.stats.atk * 0.9),
            range: 1300,
            distanceTraveled: 0,
            color: '#FBBF24',
            size: 4,
            isCrit,
          };
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

      const isCrit = Math.random() * 100 < curPlayer.stats.critRate;
      const akBullet: Projectile = {
        id: `p_ak_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 24,
        y: curPlayer.y + aimDirY * 24,
        vx: aimDirX * 28,
        vy: aimDirY * 28,
        damage: Math.round(curPlayer.stats.atk * 1.6),
        range: 1600,
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

      const isCrit = Math.random() * 100 < (curPlayer.stats.critRate + 15);
      const revBullet: Projectile = {
        id: `p_rev_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 22,
        y: curPlayer.y + aimDirY * 22,
        vx: aimDirX * 26,
        vy: aimDirY * 26,
        damage: Math.round(curPlayer.stats.atk * 2.2),
        range: 1600,
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

      const isCrit = Math.random() * 100 < curPlayer.stats.critRate;
      const pistolBullet: Projectile = {
        id: `p_pistol_${now}_${Math.random()}`,
        ownerId: curPlayer.id,
        type: 'bullet',
        x: curPlayer.x + aimDirX * 20,
        y: curPlayer.y + aimDirY * 20,
        vx: aimDirX * 24,
        vy: aimDirY * 24,
        damage: Math.round(curPlayer.stats.atk * 1.2),
        range: 1500,
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
      if (curPlayer.stats.hp <= 0) {
        animationFrameId = requestAnimationFrame(tick);
        return;
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

      // Normalize movement vector
      const mag = Math.sqrt(moveX * moveX + moveY * moveY);
      if (mag > 1) {
        moveX /= mag;
        moveY /= mag;
      }

      const isWalking = mag > 0.05;
      const isShiftPressed = keysRef.current['ShiftLeft'] || keysRef.current['ShiftRight'] || joystickSprintRef.current;
      const isSprinting = isShiftPressed && isWalking;

      // Jump & Bhop Physics (Hold Space to automatically chain smooth bunny hops!)
      let jumpZ = curPlayer.jumpZ ?? 0;
      let jumpVz = curPlayer.jumpVz ?? 0;
      let isJumping = curPlayer.isJumping ?? false;
      let bhopTimer = Math.max(0, (curPlayer.bhopTimer ?? 0) - dt);
      let bhopStreak = curPlayer.bhopStreak ?? 0;
      let bhopSpeedMult = curPlayer.bhopSpeedMult ?? 1.0;

      if (keysRef.current['Space'] && jumpZ <= 0) {
        // Holding space automatically triggers continuous bunny hop!
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
          bhopTimer = 0.35; // Landing window to continue streak
        }
      }

      if (bhopTimer <= 0 && jumpZ <= 0) {
        bhopStreak = 0;
        bhopSpeedMult = 1.0;
      }

      // Base Speed with sprint & bhop multipliers
      let baseSpeed = curPlayer.stats.speed * 40;
      if (curPlayer.isRiding) baseSpeed *= 1.8;
      if (isSprinting) baseSpeed *= 1.45;
      baseSpeed *= bhopSpeedMult;

      let nextX = curPlayer.x + moveX * baseSpeed * dt;
      let nextY = curPlayer.y + moveY * baseSpeed * dt;

      // Obstacle Collision (Invisible Walls / Rock cliffs / Tents)
      const resolvedPos = resolveObstacleCollisions(nextX, nextY, 18);
      nextX = Math.max(50, Math.min(WORLD_WIDTH - 50, resolvedPos.x));
      nextY = Math.max(50, Math.min(WORLD_HEIGHT - 50, resolvedPos.y));

      const facing = moveX < -0.1 ? 'left' : moveX > 0.1 ? 'right' : curPlayer.facing;
      const nextAttackTimer = Math.max(0, curPlayer.attackTimer - dt);

      const nextPlayer: Player = {
        ...curPlayer,
        x: nextX,
        y: nextY,
        vx: moveX * baseSpeed,
        vy: moveY * baseSpeed,
        facing,
        state: nextAttackTimer > 0 ? 'attack' : isWalking ? 'walk' : 'idle',
        jumpZ,
        jumpVz,
        isJumping,
        bhopStreak,
        bhopTimer,
        bhopSpeedMult,
        isSprinting,
        attackTimer: nextAttackTimer,
      };

      setPlayer(nextPlayer);
      net.updatePosition(nextPlayer);

      // 2. Magnetic Item Pickup
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

      // 3. Update Projectiles & Collisions
      const remainingProjectiles: Projectile[] = [];
      const livingMonsters = monstersRef.current.filter((m) => m.hp > 0);

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

        // Hit on Monsters (Player Projectiles)
        if (p.ownerId === nextPlayer.id) {
          livingMonsters.forEach((m) => {
            if (consumed || m.hp <= 0) return;
            const dx = m.x - p.x;
            const dy = m.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= (m.isBoss ? 55 : 30)) {
              const dmg = Math.round(p.damage * (p.isCrit ? 1.5 : 1.0));
              m.hp = Math.max(0, m.hp - dmg);
              m.state = 'chase';
              m.targetPlayerId = nextPlayer.id;

              // Physics knockback & head tilt on bandits
              if (m.isHumanoid || m.type.startsWith('bandit') || m.type === 'human_target') {
                m.headTilt = p.vx > 0 ? 0.45 : -0.45;
                m.knockbackX = p.vx > 0 ? 75 : -75;
                m.hitFlash = 0.18;
                addGroundDecal(m.x, m.y + 12, '#991B1B', 14);
              }

              sound.playHit(p.isCrit);
              triggerShake(p.isCrit ? 5 : 2, 0.08);
              addDamagePopup(m.x, m.y, `${dmg}`, p.isCrit ? '#FACC15' : '#EF4444', p.isCrit);
              spawnParticles(m.x, m.y, p.color || '#38BDF8', 8, 'spark');

              if (m.hp <= 0) handleMonsterDefeated(m);
              if (!p.piercing) consumed = true;
            }
          });
        }
        // Enemy Projectile hits Player
        else if (p.ownerId !== nextPlayer.id) {
          const dx = nextX - p.x;
          const dy = nextY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 26 && jumpZ < 30) {
            const dmg = Math.max(5, p.damage - nextPlayer.stats.def * 0.3);
            setPlayer((prev) => ({
              ...prev,
              stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - dmg) },
            }));
            addDamagePopup(nextX, nextY, `-${dmg}`, '#EF4444');
            sound.playHit();
            triggerShake(4, 0.1);
            consumed = true;
          }
        }

        if (!consumed && p.distanceTraveled < p.range) {
          remainingProjectiles.push(p);
        }
      });
      projectilesRef.current = remainingProjectiles;
      setProjectiles(remainingProjectiles);

      // 4. Update Monster AI (Outlaw Gunfighters & The Welder Boss)
      monstersRef.current.forEach((m) => {
        if (m.hp <= 0) return;

        // Apply physics knockback decay
        if (m.knockbackX) m.knockbackX *= 0.85;
        if (m.knockbackY) m.knockbackY *= 0.85;
        if (m.hitFlash && m.hitFlash > 0) m.hitFlash = Math.max(0, m.hitFlash - dt);

        const mdx = nextPlayer.x - m.x;
        const mdy = nextPlayer.y - m.y;
        const distToPlayer = Math.sqrt(mdx * mdx + mdy * mdy);

        m.attackCooldown = Math.max(0, m.attackCooldown - dt);
        m.specialCooldown = Math.max(0, m.specialCooldown - dt);

        // ==========================================
        // BOSS: "Iron Mask" Sledge (The Welder Boss)
        // ==========================================
        if (m.type === 'boss_welder') {
          if (distToPlayer < 900) {
            m.state = 'chase';
            setCurrentBoss(m);

            // 1. Sledgehammer Ground Slam Telegraph (every 4.5s)
            if (m.specialCooldown <= 0 && distToPlayer < 240) {
              m.specialCooldown = 4.8;
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
                if (m.hp <= 0) return;
                sound.playBossRoar();
                triggerShake(14, 0.4);
                addGroundDecal(m.x, m.y, '#EA580C', 35);
                spawnParticles(m.x, m.y, '#F59E0B', 25, 'spark');

                // Check player in slam
                const pdx = playerRef.current.x - m.x;
                const pdy = playerRef.current.y - m.y;
                if (Math.sqrt(pdx * pdx + pdy * pdy) <= 170 && playerRef.current.jumpZ < 20) {
                  setPlayer((prev) => ({
                    ...prev,
                    stats: { ...prev.stats, hp: Math.max(0, prev.stats.hp - 80) },
                  }));
                  addDamagePopup(playerRef.current.x, playerRef.current.y, '-80 SLAM!', '#EF4444', true);
                }
                m.telegraphedAttack = undefined;
              }, 1200);
            }

            // 2. Molten Torch Fire Sparks (Arc of 5 fireballs)
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

            // Move towards player
            if (distToPlayer > 80) {
              const spd = m.speed * 40 * dt;
              m.x += (mdx / distToPlayer) * spd + (m.knockbackX || 0) * dt;
              m.y += (mdy / distToPlayer) * spd + (m.knockbackY || 0) * dt;
            }
          }
        }
        // ==========================================
        // OUTLAW GUNSLINGERS, SHOTGUNNERS & SNIPERS
        // ==========================================
        else if (m.isHumanoid || m.type.startsWith('bandit')) {
          if (distToPlayer < 800) {
            m.state = 'chase';

            // Shoot at player
            if (m.attackCooldown <= 0) {
              m.attackCooldown = m.type === 'bandit_sniper' ? 3.0 : m.type === 'bandit_shotgunner' ? 2.4 : 1.6;
              sound.playShoot();

              if (m.weaponType === 'shotgun') {
                // Shotgun 4-pellet spread
                for (let i = -1.5; i <= 1.5; i++) {
                  const angle = Math.atan2(mdy, mdx) + i * 0.15;
                  const proj: Projectile = {
                    id: `p_bshot_${Date.now()}_${i}`,
                    ownerId: m.id,
                    type: 'enemy_bullet',
                    x: m.x,
                    y: m.y,
                    vx: Math.cos(angle) * 16,
                    vy: Math.sin(angle) * 16,
                    damage: 18,
                    range: 800,
                    distanceTraveled: 0,
                    color: '#FB923C',
                    size: 4,
                  };
                  projectilesRef.current = [...projectilesRef.current, proj];
                }
              } else {
                // Single accurate shot
                const angle = Math.atan2(mdy, mdx);
                const proj: Projectile = {
                  id: `p_bgun_${Date.now()}`,
                  ownerId: m.id,
                  type: 'enemy_bullet',
                  x: m.x,
                  y: m.y,
                  vx: Math.cos(angle) * (m.type === 'bandit_sniper' ? 28 : 18),
                  vy: Math.sin(angle) * (m.type === 'bandit_sniper' ? 28 : 18),
                  damage: m.type === 'bandit_sniper' ? 35 : 20,
                  range: 1200,
                  distanceTraveled: 0,
                  color: m.type === 'bandit_sniper' ? '#EF4444' : '#FDE047',
                  size: 5,
                };
                projectilesRef.current = [...projectilesRef.current, proj];
              }
              setProjectiles([...projectilesRef.current]);
            }

            // Maintain tactical distance
            const idealDist = m.type === 'bandit_sniper' ? 450 : m.type === 'bandit_grunt' ? 40 : 250;
            if (distToPlayer > idealDist) {
              const spd = m.speed * 40 * dt;
              m.x += (mdx / distToPlayer) * spd + (m.knockbackX || 0) * dt;
              m.y += (mdy / distToPlayer) * spd + (m.knockbackY || 0) * dt;
            }
          }
        }
      });

      // 5. Update Visual Particles & Popups
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
          y: dp.y - 35 * dt,
          life: dp.life - dt,
        }))
        .filter((dp) => dp.life > 0);
      setDamagePopups(damagePopupsRef.current);

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [addItemToInventory, handleMonsterDefeated, explodeInteractiveObject, spawnParticles, addDamagePopup, addGroundDecal, triggerShake]);

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

      // Skills: [Q], [E], [R]
      if (e.code === 'KeyQ') handleUseSkill(0);
      else if (e.code === 'KeyE') handleUseSkill(1);
      else if (e.code === 'KeyR') handleUseSkill(2);
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
      const curPlayer = playerRef.current;
      mouseWorldPosRef.current = {
        x: curPlayer.x + (screenX - canvas.width / 2),
        y: curPlayer.y + (screenY - canvas.height / 2),
      };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleSwitchWeapon, handleUseSkill]);

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
    handleAttack,
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
