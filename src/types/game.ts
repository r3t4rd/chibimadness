export type CharacterClass = 'gunslinger' | 'swordmaster' | 'cybermage';

export type GunType = 'pistol' | 'revolver' | 'mac10' | 'ak47' | 'shotgun' | 'cheytac' | 'katana' | 'sledgehammer';

export interface ChibiConfig {
  hairStyle?:
    | 'teto_drills'
    | 'miku_twintails'
    | 'anya_buns'
    | 'bocchi_side'
    | 'sailor_odango'
    | 'gyaru_ponytail'
    | 'cat_hood_bob'
    | 'pompadour_chad'
    | 'bob'
    | 'twintails'
    | 'ponytail'
    | 'spiky'
    | 'wavy'
    | 'braids'
    | 'long_flowing'
    | 'wolf_cut'
    | 'cyber_buns'
    | 'short_messy'
    | 'side_ponytail'
    | 'hime_cut'
    | 'ojou_drills'
    | 'afro'
    | 'side_braid'
    | 'ahoge_messy'
    | 'slicked_back'
    | 'pixie_cut'
    | 'low_twintails'
    | 'half_updo'
    | 'topknot_samurai'
    | 'curtain_bangs'
    | 'twin_buns_flowing'
    | 'mushroom_bob'
    | 'goth_side_fringe'
    | 'drill_ponytail'
    | 'fluffy_short'
    | 'dreadlocks'
    | 'mega_drill_buns'
    | 'super_saiyan'
    | 'rapunzel_braid'
    | 'twin_bubble_tails'
    | 'shaggy_mullet'
    | 'twin_drill_tails'
    | 'none_short';
  frontHairStyle?:
    | 'straight_bangs'
    | 'curtain_bangs'
    | 'teto_arched_bangs'
    | 'miku_fringe'
    | 'anya_horns_bangs'
    | 'bocchi_shaggy'
    | 'sailor_crescent'
    | 'side_swept'
    | 'hime_sidelocks'
    | 'spiky_bangs'
    | 'emo_fringe'
    | 'short_parted'
    | 'blunt_fringe'
    | 'center_split'
    | 'chad_quiff'
    | 'v_bangs'
    | 'messy_curly'
    | 'braided_headband'
    | 'feathered_bangs'
    | 'choppy_micro'
    | 'none';
  backHairStyle?:
    | 'teto_drills'
    | 'miku_twintails'
    | 'anya_buns'
    | 'bocchi_side'
    | 'sailor_odango'
    | 'gyaru_ponytail'
    | 'cat_hood_bob'
    | 'pompadour_chad'
    | 'bob'
    | 'twintails'
    | 'ponytail'
    | 'spiky'
    | 'wavy'
    | 'braids'
    | 'long_flowing'
    | 'wolf_cut'
    | 'cyber_buns'
    | 'short_messy'
    | 'side_ponytail'
    | 'hime_cut'
    | 'ojou_drills'
    | 'afro'
    | 'side_braid'
    | 'ahoge_messy'
    | 'slicked_back'
    | 'pixie_cut'
    | 'low_twintails'
    | 'half_updo'
    | 'topknot_samurai'
    | 'twin_buns_flowing'
    | 'mushroom_bob'
    | 'drill_ponytail'
    | 'fluffy_short'
    | 'dreadlocks'
    | 'mega_drill_buns'
    | 'super_saiyan'
    | 'rapunzel_braid'
    | 'twin_bubble_tails'
    | 'shaggy_mullet'
    | 'twin_drill_tails'
    | 'none_short';
  hairColor: string;
  skinTone?: string;
  eyesOverHair?: boolean;
  hatType?:
    | 'none'
    | 'cyber_cap'
    | 'combat_helmet'
    | 'cat_beanie'
    | 'witch_hat'
    | 'maid_headdress'
    | 'beret'
    | 'bunny_hood'
    | 'cyber_visor'
    | 'straw_hat'
    | 'crown_hat'
    | 'police_cap'
    | 'kitsune_mask'
    | 'chef_toque'
    | 'pirate_hat'
    | 'propeller_beanie'
    | 'top_hat'
    | 'cowboy_hat'
    | 'shark_hood'
    | 'nvg_goggles'
    | 'flower_crown';
  hatColor?: string;
  wingType?:
    | 'none'
    | 'angel_feathers'
    | 'devil_bat'
    | 'cyber_thrusters'
    | 'fairy_sparkle'
    | 'dragon_drake'
    | 'pixel_wings'
    | 'mecha_wings'
    | 'phoenix_fire'
    | 'butterfly_prisma'
    | 'crystal_shards'
    | 'shadow_tendrils';
  wingColor?: string;
  earType:
    | 'cat'
    | 'bunny'
    | 'fox'
    | 'wolf'
    | 'bear'
    | 'elf'
    | 'cyber_antennas'
    | 'horns'
    | 'devil_horns'
    | 'dragon_horns'
    | 'sheep_horns'
    | 'mouse'
    | 'deer_antlers'
    | 'dog_floppy'
    | 'wings_head'
    | 'devil_wings'
    | 'none';
  earColor: string;
  innerEarColor?: string;
  haloType:
    | 'star'
    | 'circle'
    | 'winged'
    | 'crown'
    | 'cross'
    | 'cyber_hex'
    | 'heart'
    | 'floral'
    | 'neon_rings'
    | 'shuriken'
    | 'none';
  haloColor: string;
  outfitType?:
    | 'academy_blazer'
    | 'cyber_hoodie'
    | 'tactical_shinobi'
    | 'maid_idol'
    | 'streetwear'
    | 'magic_robe'
    | 'kimono_yukata'
    | 'mecha_pilot'
    | 'goth_lolita'
    | 'military_officer'
    | 'gym_bloomer'
    | 'swimsuit_sailor'
    | 'bunny_suit'
    | 'shrine_miko'
    | 'cyber_ninja'
    | 'techwear_poncho'
    | 'magical_girl'
    | 'kigurumi_onesie'
    | 'vampire_noble'
    | 'combat_commando'
    | 'sukeban_trench'
    | 'work_overalls';
  coatColor: string;
  accentColor?: string;
  skirtColor: string;
  ribbonColor?: string;
  eyeType:
    | 'anya_smug'
    | 'aqua_crying'
    | 'bocchi_panic'
    | 'sparkle_stars'
    | 'heart_eyes'
    | 'owo'
    | 'pout'
    | 'giga_chad'
    | 'cat_w'
    | 'happy'
    | 'determined'
    | 'wink'
    | 'sparkle'
    | 'smug'
    | 'sleepy'
    | 'blush'
    | 'glasses'
    | 'dot'
    | 'teary'
    | 'dizzy_spiral'
    | 'deadpan'
    | 'starry_tears'
    | 'rage_fire'
    | 'derp'
    | 'hypno_spiral'
    | 'sleepy_closed'
    | 'wink_star'
    | 'nya_cat'
    | 'dead_x'
    | 'sparkle_hearts'
    | 'waterfall_cry'
    | 'smug_cat_face'
    | 'yandere_glow'
    | 'anime_shades'
    | 'laser_eyes'
    | 'pog_shock'
    | 'drool_sleepy'
    | 'diamond_shoujo';
  eyeColor?: string;
  ribbonColor?: string;
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type ItemType = 'weapon' | 'headwear' | 'outfit' | 'vehicle' | 'consumable' | 'material';

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  icon: string;
  description: string;
  gunType?: GunType;
  stats?: {
    atk?: number;
    def?: number;
    maxHp?: number;
    speed?: number;
    crit?: number;
  };
  healHp?: number;
  healMp?: number;
  buffDuration?: number;
  buffType?: 'speed' | 'atk' | 'exp';
  buffValue?: number;
  vehicleSpeed?: number;
  vehicleType?: 'skateboard' | 'hoverboard' | 'scooter' | 'cyber_bike' | 'mecha_car';
  price: number;
  stackable?: boolean;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: 'rect' | 'circle';
  radius?: number;
  type: 'rock' | 'tent' | 'cliff' | 'tree_trunk' | 'fence' | 'wall' | 'campfire_base';
}

export interface InteractiveObject {
  id: string;
  type: 'explosive_barrel' | 'ammo_crate' | 'campfire';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  isExploding?: boolean;
  fuseTimer?: number;
  respawnTime?: number;
}

export interface InventorySlot {
  slotId: number;
  item: Item;
  quantity: number;
}

export interface Equipment {
  weapon: Item | null;
  headwear: Item | null;
  outfit: Item | null;
  vehicle: Item | null;
  accessory: Item | null;
}

export interface PlayerStats {
  level: number;
  exp: number;
  maxExp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina?: number;
  maxStamina?: number;
  atk: number;
  def: number;
  speed: number;
  critRate: number;
  statPoints: number;
  str: number; // Attack & Crit
  agi: number; // Speed & Dodge
  int: number; // Magic & Max MP
  vit: number; // HP & Defense
}

export interface Skill {
  id: string;
  name: string;
  icon: string;
  description: string;
  costMp: number;
  cooldown: number; // in seconds
  lastUsed: number;
  unlockLevel: number;
  level: number;
  maxLevel: number;
  type: 'damage' | 'dash' | 'aoe' | 'buff' | 'ultimate';
  damageMult: number;
  range: number;
}

export type AttachmentSlot = 'muzzle' | 'optic' | 'magazine' | 'underbarrel';

export interface WeaponAttachment {
  id: string;
  name: string;
  slot: AttachmentSlot;
  icon: string;
  description: string;
  statBonus: {
    damageMult?: number;
    critRateBonus?: number;
    rangeBonus?: number;
    ammoBonus?: number;
    reloadSpeedMult?: number;
    spreadReduction?: number;
    aimSpeedBonus?: number;
  };
}

export interface Player {
  id: string;
  name: string;
  characterClass: CharacterClass;
  chibi: ChibiConfig;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 'left' | 'right';
  state: 'idle' | 'walk' | 'attack' | 'dodge' | 'riding' | 'cast' | 'dead';
  stats: PlayerStats;
  stamina: number;
  maxStamina: number;
  isSprinting: boolean;
  jumpZ: number; // 0 is on ground, >0 is in air
  jumpVz: number;
  isJumping: boolean;
  bhopStreak: number;
  bhopTimer: number;
  bhopSpeedMult: number;
  gold: number;
  inventory: InventorySlot[];
  equipment: Equipment;
  skills: Skill[];
  activeVehicleId: string | null;
  isRiding: boolean;
  spawnBounce: number; // 0 to 1 for spawn squash & stretch
  attackTimer: number;
  dodgeTimer: number;
  dodgeCooldown?: number;
  dashVx?: number;
  dashVy?: number;
  isAirDash?: boolean;
  aimAngle?: number;
  isAiming?: boolean;
  isInspectingWeapon?: boolean;
  weaponAttachments?: Record<AttachmentSlot, WeaponAttachment | null>;
  ammo?: number;
  maxAmmo?: number;
  isReloading?: boolean;
  reloadTimer?: number;
  respawnTimer?: number;
  isRespawning?: boolean;
  combo: number;
  lastAttackTime: number;
  chatMessage?: string;
  chatTimer?: number;
  emote?: string;
  emoteTimer?: number;
  cinematicPose?: 'dance' | 'dive' | 'skid' | 'dazed' | 'brush' | 'bonk' | 'pickup' | 'ready' | 'none';
  hideWeapon?: boolean;
  activeQuests: Record<string, QuestProgress>;
  completedQuestIds: string[];
  currentZone: string;
  activeBuffs: {
    type: 'speed' | 'atk' | 'exp';
    value: number;
    expiresAt: number;
  }[];
}

export type FactionType = 'police' | 'punk_demon' | 'bandit' | 'wild' | 'neutral';

export interface Monster {
  id: string;
  retaliatePlayer?: boolean;
  targetEnemyId?: string | null;
  name: string;
  type:
    | 'boss_welder'
    | 'boss_outlaw_viktor'
    | 'cop_officer'
    | 'cop_swat'
    | 'cop_marksman'
    | 'cop_juggernaut'
    | 'punk_grunt'
    | 'punk_anarchist'
    | 'punk_molotov'
    | 'punk_juggernaut'
    | 'bandit_boss'
    | 'bandit_grunt'
    | 'bandit_scout'
    | 'bandit_gunner'
    | 'bandit_shotgunner'
    | 'bandit_sniper'
    | 'bandit_brawler'
    | 'forest_wolf'
    | 'cadet_bat'
    | 'cadet_gunner'
    | 'cadet_mage'
    | 'human_target';
  zone: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  expReward: number;
  goldReward: number;
  faction?: FactionType;
  targetMonsterId?: string | null;
  isJuggernaut?: boolean;
  isBoss?: boolean;
  isHumanoid?: boolean;
  humanChibi?: ChibiConfig;
  weaponType?: 'bat' | 'pistol' | 'revolver' | 'shotgun' | 'mac10' | 'ak47' | 'cheytac' | 'sledgehammer' | 'staff' | 'blade' | 'baton' | 'molotov' | 'riot_shield';
  headTilt?: number; // Physics tilt angle when shot
  headTiltVel?: number;
  knockbackX?: number;
  knockbackY?: number;
  jumpZ?: number; // Vertical height in air (0 is ground)
  jumpVz?: number;
  isJumping?: boolean;
  dodgeTimer?: number;
  dodgeCooldown?: number;
  dashVx?: number;
  dashVy?: number;
  isAirDash?: boolean;
  isCharging?: boolean; // Rushdown tackle / pinning charge
  chargeTimer?: number;
  chargeVx?: number;
  chargeVy?: number;
  isPinned?: boolean; // Pinned to wall or enemy
  pinTimer?: number;
  hasShield?: boolean; // SWAT ballistic shield
  shieldHp?: number;
  isBlocking?: boolean;
  hitFlash?: number; // White flash on hit
  facing?: 'left' | 'right';
  state: 'idle' | 'patrol' | 'chase' | 'attack' | 'dead';
  targetPlayerId: string | null;
  attackCooldown: number;
  specialCooldown: number;
  sniperLaser?: {
    active: boolean;
    angle: number;
    length: number;
    chargeProgress: number;
  };
  battleBark?: {
    text: string;
    timer: number;
  };
  deathProgress?: number; // 0 to 1 for ragdoll death fall
  deathType?: 'back' | 'front';
  welderSpecialPhase?: number;
  telegraphedAttack?: {
    type: 'circle' | 'laser' | 'slam' | 'grenade' | 'fire_pool';
    x: number;
    y: number;
    radius: number;
    width?: number;
    height?: number;
    duration: number;
    startTime: number;
    damage: number;
  };
  dropTable: {
    itemId: string;
    chance: number; // 0 to 1
    minQty: number;
    maxQty: number;
  }[];
  animTimer: number;
  respawnTime?: number;
  isRespawning?: boolean;
}

export interface GroundDecal {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  type?: 'blood' | 'scorch' | 'fire_pool' | 'smoke';
  dps?: number;
  splatterCount?: number;
}

export interface DropItem {
  id: string;
  itemId: string;
  item: Item;
  x: number;
  y: number;
  quantity: number;
  createdAt: number;
  ownerId?: string;
  bounceOffset: number;
  groundY: number;
}

export interface ResourceNode {
  id: string;
  type: 'tree' | 'iron_ore' | 'lumite_crystal' | 'star_flower';
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  requiredTool?: 'axe' | 'pickaxe' | 'none';
  dropItemId: string;
  respawnAt?: number;
}

export interface QuestObjective {
  type: 'kill' | 'gather' | 'talk' | 'craft' | 'reach_zone';
  targetId: string;
  targetName: string;
  current: number;
  required: number;
}

export interface Quest {
  id: string;
  title: string;
  giverNpcId: string;
  description: string;
  minLevel: number;
  objectives: QuestObjective[];
  rewardExp: number;
  rewardGold: number;
  rewardItems: { itemId: string; quantity: number }[];
}

export interface QuestProgress {
  questId: string;
  status: 'active' | 'completed' | 'turned_in';
  objectives: QuestObjective[];
}

export interface CraftRecipe {
  id: string;
  name: string;
  category: 'weapons' | 'armor' | 'vehicles' | 'potions' | 'food';
  resultItemId: string;
  resultQuantity: number;
  materials: { itemId: string; count: number }[];
  unlockLevel: number;
}

export interface NPC {
  id: string;
  name: string;
  title: string;
  avatarChibi: ChibiConfig;
  role: 'quest' | 'shop' | 'craft' | 'cafe' | 'guide' | 'vehicle';
  x: number;
  y: number;
  dialogue: {
    greeting: string;
    options: {
      text: string;
      action: 'open_shop' | 'open_craft' | 'open_quests' | 'talk' | 'heal' | 'close';
      dialogueText?: string;
    }[];
  };
  shopItemIds?: string[];
  craftRecipeIds?: string[];
  questIds?: string[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor?: string;
  text: string;
  channel: 'all' | 'local' | 'party' | 'system';
  timestamp: number;
}

export interface DamagePopup {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  rotation?: number;
  text: string;
  color: string;
  isCrit: boolean;
  isHeal: boolean;
  type?: 'damage' | 'crit' | 'headshot' | 'dodge' | 'heal' | 'system' | 'manga';
  scale?: number;
  life: number;
  maxLife: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  type: 'bullet' | 'laser' | 'magic_orb' | 'slash_wave' | 'boss_meteor' | 'falling_sword' | 'vortex' | 'enemy_bullet' | 'molotov' | 'grenade' | 'smoke';
  bulletShape?: 'sphere' | 'needle' | 'diamond' | 'flame' | 'star' | 'ring' | 'missile' | 'laser';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  range: number;
  distanceTraveled: number;
  color: string;
  size: number;
  isCrit?: boolean;
  ricochetsRemaining?: number;
  isRicochet?: boolean;
  piercing?: boolean;
  hitIds?: string[];
  homingTargetId?: string;
  faction?: FactionType;
  isMolotov?: boolean;
  isGrenade?: boolean;
  isSmoke?: boolean;
  fuseTimer?: number;
  explosionRadius?: number;
  glow?: boolean;
}

export interface VisualParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'circle' | 'star' | 'spark' | 'smoke' | 'petal' | 'ring';
}
