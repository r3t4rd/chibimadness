import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Shield,
  Zap,
  Crosshair,
  ChevronRight,
  Play,
  Wand2,
  Dice5,
  Palette,
  Shirt,
  Smile,
  User,
} from 'lucide-react';
import { Player, CharacterClass, ChibiConfig } from '../types/game';
import { CLASS_DEFAULTS, ITEMS_DATABASE } from '../game/constants';
import { drawChibiCharacter } from '../game/chibiRenderer';
import { sound } from '../game/audioEngine';

interface CharacterCreatorProps {
  onStartGame: (player: Player) => void;
}

const HAIR_COLORS = [
  '#F6D268', // Blonde (Momoi)
  '#A3E635', // Lime Green (Midori)
  '#F472B6', // Pastel Pink
  '#38BDF8', // Sky Blue
  '#C084FC', // Lavender Purple
  '#FB923C', // Coral Orange
  '#F43F5E', // Ruby Crimson
  '#1E293B', // Midnight Black
  '#E2E8F0', // Platinum Silver
  '#78716C', // Chocolate Brown
  '#2DD4BF', // Mint Teal
  '#FDE047', // Solar Gold
];

const HALO_COLORS = [
  '#E65D8C', // Magenta Pink
  '#38BDF8', // Cyan Neon
  '#FDE047', // Gold Yellow
  '#10B981', // Emerald Green
  '#C084FC', // Cosmic Violet
  '#F43F5E', // Crimson Red
  '#FB923C', // Flame Orange
  '#67E8F9', // Ice Blue
  '#F472B6', // Sakura Pink
  '#A855F7', // Royal Purple
];

const EYE_COLORS = [
  '#38BDF8', // Sky Blue
  '#F472B6', // Rosy Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber Gold
  '#8B5CF6', // Purple
  '#EF4444', // Ruby
  '#0EA5E9', // Deep Ocean
  '#1E293B', // Obsidian
];

const SKIN_TONES = [
  '#FFF1E0', // Warm Pale
  '#FFE4D6', // Soft Peach
  '#FEE2D5', // Fair Rosy
  '#F7D7BA', // Golden Warm
  '#E8BE9B', // Sun-Kissed Tan
];

const COAT_COLORS = [
  '#FFFFFF', // White Academy
  '#0F172A', // Stealth Navy
  '#1E293B', // Tactical Slate
  '#FCE7F3', // Pastel Pink
  '#E0F2FE', // Ice Blue
  '#FEF3C7', // Warm Cream
  '#F3E8FF', // Mystic Violet
  '#DC2626', // Crimson Red
];

const ACCENT_COLORS = [
  '#E65D8C',
  '#38BDF8',
  '#FDE047',
  '#10B981',
  '#C084FC',
  '#FB923C',
  '#F43F5E',
  '#0284C7',
];

const RANDOM_NICKNAMES = [
  'Momoi',
  'Midori',
  'Aris',
  'Yuzu',
  'Hina',
  'Aru',
  'Shiroko',
  'Nonomi',
  'Hoshino',
  'Mika',
  'Yuuka',
  'Noa',
  'Koyuki',
  'Koharu',
  'Hanako',
  'Azusa',
  'Hifumi',
  'Miyu',
  'Saki',
  'Kanna',
];

export const CharacterCreator: React.FC<CharacterCreatorProps> = ({ onStartGame }) => {
  const [name, setName] = useState<string>('Momoi');
  const [characterClass, setCharacterClass] = useState<CharacterClass>('gunslinger');
  const [activeTab, setActiveTab] = useState<'style' | 'outfit' | 'colors'>('style');

  // Customization states
  const [hairStyle, setHairStyle] = useState<ChibiConfig['hairStyle']>('bob');
  const [hairColor, setHairColor] = useState<string>('#F6D268');
  const [eyeType, setEyeType] = useState<ChibiConfig['eyeType']>('cat_w');
  const [eyeColor, setEyeColor] = useState<string>('#38BDF8');
  const [skinTone, setSkinTone] = useState<string>('#FFF1E0');

  const [earType, setEarType] = useState<ChibiConfig['earType']>('cat');
  const [haloType, setHaloType] = useState<ChibiConfig['haloType']>('star');
  const [haloColor, setHaloColor] = useState<string>('#E65D8C');

  const [outfitType, setOutfitType] = useState<ChibiConfig['outfitType']>('academy_blazer');
  const [coatColor, setCoatColor] = useState<string>('#FFFFFF');
  const [accentColor, setAccentColor] = useState<string>('#E65D8C');
  const [skirtColor, setSkirtColor] = useState<string>('#3A3640');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live Canvas Preview of Chibi Character
  useEffect(() => {
    let frameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewPlayer: Player = {
      id: 'preview',
      name: name.trim() || 'Hero',
      characterClass,
      chibi: {
        hairStyle,
        hairColor,
        earType,
        earColor: '#2B272C',
        innerEarColor: '#F472B6',
        haloType,
        haloColor,
        coatColor,
        accentColor,
        skirtColor,
        eyeType,
        eyeColor,
        skinTone,
        outfitType,
        ribbonColor: accentColor,
      },
      x: 110,
      y: 140,
      vx: 0,
      vy: 0,
      facing: 'right',
      state: 'idle',
      stats: {
        level: 1,
        exp: 0,
        maxExp: 100,
        hp: 300,
        maxHp: 300,
        mp: 100,
        maxMp: 100,
        atk: 20,
        def: 10,
        speed: 4.5,
        critRate: 10,
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
      bhopSpeedMult: 1.0,
      gold: 100,
      inventory: [],
      equipment: {
        weapon: ITEMS_DATABASE[CLASS_DEFAULTS[characterClass].starterWeapon] || null,
        headwear: null,
        outfit: null,
        vehicle: ITEMS_DATABASE['veh_skateboard'] || null,
        accessory: null,
      },
      skills: CLASS_DEFAULTS[characterClass].starterSkills,
      activeVehicleId: null,
      isRiding: false,
      spawnBounce: 1,
      attackTimer: 0,
      dodgeTimer: 0,
      combo: 0,
      lastAttackTime: 0,
      activeQuests: {
        quest_rookie_patrol: {
          questId: 'quest_rookie_patrol',
          status: 'active',
          objectives: [],
        },
      },
      completedQuestIds: [],
      currentZone: 'cyber_city',
      activeBuffs: [],
    };

    let startTime = performance.now();
    const render = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawChibiCharacter(ctx, previewPlayer, elapsed, true);
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [
    name,
    characterClass,
    hairStyle,
    hairColor,
    earType,
    haloType,
    haloColor,
    coatColor,
    accentColor,
    skirtColor,
    eyeType,
    eyeColor,
    skinTone,
    outfitType,
  ]);

  const handleRandomize = () => {
    sound.playPickup();
    const randName = RANDOM_NICKNAMES[Math.floor(Math.random() * RANDOM_NICKNAMES.length)];
    const hairStyles: ChibiConfig['hairStyle'][] = [
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
    ];
    const eyeTypes: ChibiConfig['eyeType'][] = [
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
    ];
    const earTypes: ChibiConfig['earType'][] = [
      'cat',
      'bunny',
      'fox',
      'bear',
      'elf',
      'cyber_antennas',
      'horns',
      'none',
    ];
    const haloTypes: ChibiConfig['haloType'][] = [
      'star',
      'circle',
      'winged',
      'crown',
      'cross',
      'cyber_hex',
      'heart',
      'neon_rings',
    ];
    const outfits: ChibiConfig['outfitType'][] = [
      'academy_blazer',
      'cyber_hoodie',
      'tactical_shinobi',
      'maid_idol',
      'streetwear',
      'magic_robe',
      'kimono_yukata',
    ];

    setName(randName);
    setHairStyle(hairStyles[Math.floor(Math.random() * hairStyles.length)]);
    setHairColor(HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)]);
    setEyeType(eyeTypes[Math.floor(Math.random() * eyeTypes.length)]);
    setEyeColor(EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)]);
    setSkinTone(SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]);
    setEarType(earTypes[Math.floor(Math.random() * earTypes.length)]);
    setHaloType(haloTypes[Math.floor(Math.random() * haloTypes.length)]);
    setHaloColor(HALO_COLORS[Math.floor(Math.random() * HALO_COLORS.length)]);
    setOutfitType(outfits[Math.floor(Math.random() * outfits.length)]);
    setCoatColor(COAT_COLORS[Math.floor(Math.random() * COAT_COLORS.length)]);
    setAccentColor(ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]);
  };

  const handleLaunch = () => {
    sound.playSpawnBounce();
    sound.startCozyMusic();

    const selectedClassData = CLASS_DEFAULTS[characterClass];
    const starterWeapon = ITEMS_DATABASE[selectedClassData.starterWeapon];
    const starterSkateboard = ITEMS_DATABASE['veh_skateboard'];
    const starterPotion = ITEMS_DATABASE['item_hp_potion_s'];

    const chosenName = name.trim() || 'Momoi';

    const newPlayer: Player = {
      id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: chosenName,
      characterClass,
      chibi: {
        hairStyle,
        hairColor,
        earType,
        earColor: '#2B272C',
        innerEarColor: '#F472B6',
        haloType,
        haloColor,
        coatColor,
        accentColor,
        skirtColor,
        eyeType,
        eyeColor,
        skinTone,
        outfitType,
        ribbonColor: accentColor,
      },
      x: 650,
      y: 750,
      vx: 0,
      vy: 0,
      facing: 'right',
      state: 'idle',
      stats: {
        level: 1,
        exp: 0,
        maxExp: 100,
        hp: selectedClassData.baseHp,
        maxHp: selectedClassData.baseHp,
        mp: selectedClassData.baseMp,
        maxMp: selectedClassData.baseMp,
        atk: selectedClassData.baseAtk,
        def: selectedClassData.baseDef,
        speed: selectedClassData.baseSpd,
        critRate: 10,
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
      bhopSpeedMult: 1.0,
      gold: 150,
      inventory: [
        { slotId: 1, item: starterWeapon, quantity: 1 },
        { slotId: 2, item: starterSkateboard, quantity: 1 },
        { slotId: 3, item: starterPotion, quantity: 5 },
      ],
      equipment: {
        weapon: starterWeapon,
        headwear: null,
        outfit: null,
        vehicle: starterSkateboard,
        accessory: null,
      },
      skills: selectedClassData.starterSkills,
      activeVehicleId: 'veh_skateboard',
      isRiding: false,
      spawnBounce: 0.1, // Initiates bouncy spawn squash & stretch!
      attackTimer: 0,
      dodgeTimer: 0,
      combo: 0,
      lastAttackTime: 0,
      activeQuests: {
        quest_rookie_patrol: {
          questId: 'quest_rookie_patrol',
          status: 'active',
          objectives: [
            {
              type: 'kill',
              targetId: 'slime_blob',
              targetName: 'Slime Blobs',
              current: 0,
              required: 3,
            },
            {
              type: 'kill',
              targetId: 'cyber_drone',
              targetName: 'Cyber Drones',
              current: 0,
              required: 2,
            },
          ],
        },
      },
      completedQuestIds: [],
      currentZone: 'cyber_city',
      activeBuffs: [],
    };

    onStartGame(newPlayer);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 overflow-y-auto font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl bg-white/75 dark:bg-slate-900/80 backdrop-blur-3xl border-2 border-white/80 dark:border-white/20 rounded-[36px] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.35)] p-6 sm:p-8 flex flex-col md:flex-row gap-7 ring-1 ring-black/5"
      >
        {/* Left: Chibi Live Interactive Avatar Preview in Liquid Glass Card */}
        <div className="flex flex-col items-center justify-between md:w-[340px] bg-gradient-to-b from-white/60 to-white/30 dark:from-slate-800/60 dark:to-slate-800/30 border-2 border-white/90 dark:border-white/10 rounded-[28px] p-6 relative overflow-hidden shadow-inner">
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-pink-600 dark:text-pink-400 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-3 py-1 rounded-full border border-white/60 shadow-xs">
              <Sparkles size={13} />
              CHIBI HERO
            </div>
            <button
              type="button"
              onClick={handleRandomize}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-700/80 hover:bg-white px-2.5 py-1 rounded-full border border-white/60 shadow-xs cursor-pointer active:scale-95 transition-all"
              title="Randomize appearance"
            >
              <Dice5 size={14} className="text-indigo-500" />
              Random
            </button>
          </div>

          <div className="my-2 flex items-center justify-center">
            <canvas ref={canvasRef} width={220} height={210} className="w-[200px] h-[190px]" />
          </div>

          <div className="w-full text-center">
            <h3 className="font-['Fredoka'] text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {name || 'Your Chibi'}
            </h3>
            <p className="text-xs text-sky-600 dark:text-sky-400 font-black uppercase tracking-wider mt-0.5">
              {CLASS_DEFAULTS[characterClass].name}
            </p>
            <div className="mt-2.5 bg-white/70 dark:bg-slate-800/80 rounded-2xl p-2.5 text-[11px] text-slate-700 dark:text-slate-300 border border-white/80 dark:border-white/10 leading-relaxed shadow-xs font-medium">
              {CLASS_DEFAULTS[characterClass].desc}
            </div>
          </div>
        </div>

        {/* Right: Customization Controls with Liquid Glass Tabs */}
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-3">
              <div>
                <h1 className="font-['Fredoka'] text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Wand2 className="text-pink-500" size={24} />
                  Kivotos ChibiVerse
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Enter your nickname, pick your combat class and craft your unique style!
                </p>
              </div>
            </div>

            {/* Nickname & Quick Randomize */}
            <div className="mt-3.5">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Player Nickname
              </label>
              <div className="relative mt-1">
                <input
                  type="text"
                  value={name}
                  maxLength={16}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter character nickname..."
                  className="w-full bg-white/70 dark:bg-slate-800/70 border-2 border-white dark:border-white/20 rounded-2xl px-4 py-2.5 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-sky-400 shadow-inner transition-all"
                />
              </div>
            </div>

            {/* Class Picker */}
            <div className="mt-3">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Combat Class
              </label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  {
                    id: 'gunslinger',
                    label: 'Gunslinger',
                    icon: Crosshair,
                    color: 'border-pink-500 bg-pink-500/10 text-pink-600 dark:text-pink-400',
                  },
                  {
                    id: 'swordmaster',
                    label: 'Blade Dancer',
                    icon: Zap,
                    color: 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400',
                  },
                  {
                    id: 'cybermage',
                    label: 'Cyber Mage',
                    icon: Shield,
                    color: 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400',
                  },
                ].map((c) => {
                  const Icon = c.icon;
                  const isSelected = characterClass === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCharacterClass(c.id as CharacterClass);
                        sound.playPickup();
                      }}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-2xl border-2 text-xs font-black transition-all cursor-pointer shadow-xs ${
                        isSelected
                          ? `${c.color} ring-2 ring-black/10 scale-102 shadow-sm`
                          : 'border-white/80 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:bg-white/70'
                      }`}
                    >
                      <Icon size={18} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mt-3 p-1 bg-white/40 dark:bg-slate-800/40 rounded-2xl border border-white/60 dark:border-white/10">
              {[
                { id: 'style', label: 'Face & Hair', icon: Smile },
                { id: 'outfit', label: 'Outfit & Ears', icon: Shirt },
                { id: 'colors', label: 'Color Palette', icon: Palette },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB 1: Face & Hair */}
            {activeTab === 'style' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                {/* Hair Style */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                    Hair Style
                  </label>
                  <select
                    value={hairStyle}
                    onChange={(e) => setHairStyle(e.target.value as any)}
                    className="mt-1 w-full bg-white/70 dark:bg-slate-800/70 border-2 border-white dark:border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white shadow-xs"
                  >
                    <option value="bob">Short Bob (Momoi)</option>
                    <option value="twintails">Twin Tails (Midori)</option>
                    <option value="ponytail">High Ponytail</option>
                    <option value="spiky">Spiky Anime Hero</option>
                    <option value="wavy">Fluffy Wavy Locks</option>
                    <option value="braids">Dual Braids</option>
                    <option value="long_flowing">Long Flowing</option>
                    <option value="wolf_cut">Modern Wolf Cut</option>
                    <option value="cyber_buns">Cyber Odango Buns</option>
                    <option value="short_messy">Short Playful Messy</option>
                    <option value="side_ponytail">Side Ponytail</option>
                    <option value="hime_cut">Princess Hime Cut</option>
                  </select>
                </div>

                {/* Face & Eye Expression */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                    Eye Expression
                  </label>
                  <select
                    value={eyeType}
                    onChange={(e) => setEyeType(e.target.value as any)}
                    className="mt-1 w-full bg-white/70 dark:bg-slate-800/70 border-2 border-white dark:border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white shadow-xs"
                  >
                    <option value="cat_w">Cute :3 Cat-W (Momoi)</option>
                    <option value="happy">Happy ^‿^ Smile</option>
                    <option value="sparkle">Star Sparkle Idol</option>
                    <option value="wink">Playful Wink &gt;‿&lt;</option>
                    <option value="smug">Smug Smirk &gt;v&lt;</option>
                    <option value="determined">Sharp Determined</option>
                    <option value="sleepy">Sleepy Comfy ˘◡˘</option>
                    <option value="blush">Innocent Blushing</option>
                    <option value="glasses">Smart Glasses</option>
                    <option value="dot">Kawaii Dot Eyes</option>
                  </select>
                </div>

                {/* Skin Tone */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                    Skin Tone
                  </label>
                  <select
                    value={skinTone}
                    onChange={(e) => setSkinTone(e.target.value)}
                    className="mt-1 w-full bg-white/70 dark:bg-slate-800/70 border-2 border-white dark:border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white shadow-xs"
                  >
                    <option value="#FFF1E0">Warm Porcelain</option>
                    <option value="#FFE4D6">Soft Peach</option>
                    <option value="#FEE2D5">Fair Rosy</option>
                    <option value="#F7D7BA">Golden Warm</option>
                    <option value="#E8BE9B">Sun-Kissed Tan</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB 2: Outfit & Ears */}
            {activeTab === 'outfit' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                {/* Outfit Type */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                    Outfit Style
                  </label>
                  <select
                    value={outfitType}
                    onChange={(e) => setOutfitType(e.target.value as any)}
                    className="mt-1 w-full bg-white/70 dark:bg-slate-800/70 border-2 border-white dark:border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white shadow-xs"
                  >
                    <option value="academy_blazer">Kivotos Academy Blazer</option>
                    <option value="cyber_hoodie">Cozy Cyber Hoodie</option>
                    <option value="tactical_shinobi">Tactical Shinobi Vest</option>
                    <option value="maid_idol">Frilly Idol Maid Dress</option>
                    <option value="streetwear">Urban Bomber Streetwear</option>
                    <option value="magic_robe">Arcane Scholar Robe</option>
                    <option value="kimono_yukata">Modern Kimono Yukata</option>
                  </select>
                </div>

                {/* Ears Type */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                    Animal Ears / Headgear
                  </label>
                  <select
                    value={earType}
                    onChange={(e) => setEarType(e.target.value as any)}
                    className="mt-1 w-full bg-white/70 dark:bg-slate-800/70 border-2 border-white dark:border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white shadow-xs"
                  >
                    <option value="cat">Cute Cat / Neko</option>
                    <option value="bunny">Tall Bunny Ears</option>
                    <option value="fox">Kitsune Fox Ears</option>
                    <option value="bear">Teddy Bear Ears</option>
                    <option value="elf">Pointy Elf Ears</option>
                    <option value="cyber_antennas">Cyber Mecha Fins</option>
                    <option value="horns">Dragon Horns</option>
                    <option value="none">Normal / None</option>
                  </select>
                </div>

                {/* Halo Style */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                    Floating Halo
                  </label>
                  <select
                    value={haloType}
                    onChange={(e) => setHaloType(e.target.value as any)}
                    className="mt-1 w-full bg-white/70 dark:bg-slate-800/70 border-2 border-white dark:border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:bg-white shadow-xs"
                  >
                    <option value="star">4-Point Star</option>
                    <option value="winged">Angelic Winged</option>
                    <option value="crown">Royal Crown</option>
                    <option value="circle">Orbiting Cyber Ring</option>
                    <option value="cross">Radiant Cross</option>
                    <option value="cyber_hex">Holographic Hexagon</option>
                    <option value="heart">Sweet Heart</option>
                    <option value="neon_rings">Gyroscopic Dual Rings</option>
                    <option value="none">No Halo</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB 3: Color Palette */}
            {activeTab === 'colors' && (
              <div className="space-y-2.5 mt-2.5">
                {/* Hair Color */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                      Hair Color
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">{hairColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {HAIR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setHairColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          hairColor === c
                            ? 'border-slate-900 dark:border-white scale-120 shadow-md ring-2 ring-sky-400'
                            : 'border-white dark:border-slate-700 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Eye Color */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                      Eye Iris Color
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">{eyeColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {EYE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEyeColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          eyeColor === c
                            ? 'border-slate-900 dark:border-white scale-120 shadow-md ring-2 ring-sky-400'
                            : 'border-white dark:border-slate-700 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Halo Glow Color */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                      Halo & Accent Glow Color
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">{haloColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {HALO_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setHaloColor(c);
                          setAccentColor(c);
                        }}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          haloColor === c
                            ? 'border-slate-900 dark:border-white scale-120 shadow-md ring-2 ring-sky-400'
                            : 'border-white dark:border-slate-700 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls Guide Pills & Launch Button */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 px-1">
              <span>⌨️ <b>WASD</b>: Move</span>
              <span>🏃 <b>Shift</b>: Sprint (Stamina)</span>
              <span>⚡ <b>Space</b>: Bunny Hop</span>
              <span>⚔️ <b>Click/F/J</b>: Attack</span>
              <span>🛹 <b>V</b>: Mount</span>
            </div>

            <button
              type="button"
              onClick={handleLaunch}
              className="w-full bg-gradient-to-r from-sky-500 via-indigo-600 to-pink-500 hover:from-sky-600 hover:to-pink-600 text-white font-['Fredoka'] font-black text-base py-3.5 px-6 rounded-2xl shadow-[0_16px_36px_-8px_rgba(56,189,248,0.45)] border-2 border-white flex items-center justify-center gap-2 transform active:scale-98 transition-all cursor-pointer"
            >
              <Play size={20} className="fill-white" />
              JOIN OPEN WORLD MMORPG
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
