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
  Flame,
  Radio,
  Sliders,
  Award,
  Crown,
  Feather,
  Eye,
} from 'lucide-react';
import { Player, CharacterClass, ChibiConfig } from '../types/game';
import { CLASS_DEFAULTS, ITEMS_DATABASE } from '../game/constants';
import {
  drawChibiCharacter,
  drawFrontHairThumbnail,
  drawBackHairThumbnail,
  drawHatThumbnail,
  drawWingThumbnail,
  drawFaceThumbnail,
  drawOutfitThumbnail,
  drawEarThumbnail,
  drawHaloThumbnail,
} from '../game/chibiRenderer';
import { sound } from '../game/audioEngine';

interface CharacterCreatorProps {
  onStartGame: (player: Player) => void;
}

const HAIR_COLORS = [
  '#EF4444', // Teto Crimson Red
  '#06B6D4', // Miku Aqua Cyan
  '#F472B6', // Pastel / Anya Pink
  '#F6D268', // Blonde (Momoi)
  '#A3E635', // Lime Green (Midori)
  '#38BDF8', // Sky Blue
  '#C084FC', // Lavender Purple
  '#FB923C', // Coral Orange
  '#1E293B', // Midnight Black
  '#E2E8F0', // Platinum Silver
  '#78716C', // Chocolate Brown
  '#FDE047', // Solar Gold
];

const HAT_COLORS = [
  '#1E293B', // Stealth Slate
  '#0F172A', // Midnight Black
  '#EF4444', // Crimson Red
  '#EC4899', // Sakura Pink
  '#38BDF8', // Cyber Cyan
  '#FDE047', // Solar Yellow
  '#A855F7', // Royal Purple
  '#FFFFFF', // Pure White
];

const WING_COLORS = [
  '#FFFFFF', // Celestial White
  '#FDE047', // Holy Gold
  '#38BDF8', // Plasma Cyan
  '#312E81', // Abyssal Indigo
  '#F43F5E', // Succubus Crimson
  '#A855F7', // Void Purple
  '#10B981', // Emerald Pixie
];

const HALO_COLORS = [
  '#EF4444', // Crimson Red
  '#38BDF8', // Cyan Neon
  '#E65D8C', // Magenta Pink
  '#FDE047', // Gold Yellow
  '#10B981', // Emerald Green
  '#C084FC', // Cosmic Violet
  '#FB923C', // Flame Orange
  '#67E8F9', // Ice Blue
  '#F472B6', // Sakura Pink
  '#A855F7', // Royal Purple
];

const EYE_COLORS = [
  '#EF4444', // Crimson / Ruby
  '#0EA5E9', // Miku Cyan Ocean
  '#38BDF8', // Sky Blue
  '#F472B6', // Rosy Pink
  '#10B981', // Emerald Anya Green
  '#F59E0B', // Amber Gold
  '#8B5CF6', // Purple
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
  '#EF4444',
  '#06B6D4',
  '#E65D8C',
  '#38BDF8',
  '#FDE047',
  '#10B981',
  '#C084FC',
  '#FB923C',
];

const RANDOM_NICKNAMES = [
  'Teto',
  'Miku',
  'Anya',
  'Bocchi',
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
  'Usagi',
  'Marin',
  'Reimu',
  'Gura',
  'Madoka',
  'Chad_Chibi',
  'Koyuki',
];

export interface PresetCharacter {
  id: string;
  name: string;
  badge: string;
  desc: string;
  tagline: string;
  classType: CharacterClass;
  chibi: ChibiConfig;
}

const PRESET_CHARACTERS: PresetCharacter[] = [
  {
    id: 'teto',
    name: 'Kasane Teto',
    badge: 'DRILL QUEEN 🥖',
    desc: 'Bouncy spring twin drills & idol energy',
    tagline: '「 重音テト // DRILL OPERATIVE 」',
    classType: 'swordmaster',
    chibi: {
      frontHairStyle: 'teto_arched_bangs',
      backHairStyle: 'teto_drills',
      hairStyle: 'teto_drills',
      hairColor: '#EF4444',
      eyesOverHair: true,
      hatType: 'none',
      wingType: 'none',
      earType: 'wings_head',
      earColor: '#FFFFFF',
      haloType: 'shuriken',
      haloColor: '#EF4444',
      coatColor: '#1E293B',
      accentColor: '#EF4444',
      skirtColor: '#0F172A',
      eyeType: 'cat_w',
      eyeColor: '#EF4444',
      skinTone: '#FFF1E0',
      outfitType: 'tactical_shinobi',
      ribbonColor: '#EF4444',
    },
  },
  {
    id: 'miku',
    name: 'Hatsune Miku',
    badge: 'CYBER DIVA 🎵',
    desc: 'Floor-length cyan twin tails & cyber tech',
    tagline: '「 初音ミク // CYBER VOCALIST 」',
    classType: 'cybermage',
    chibi: {
      frontHairStyle: 'miku_fringe',
      backHairStyle: 'miku_twintails',
      hairStyle: 'miku_twintails',
      hairColor: '#06B6D4',
      eyesOverHair: true,
      hatType: 'cyber_visor',
      hatColor: '#0F172A',
      wingType: 'cyber_thrusters',
      wingColor: '#38BDF8',
      earType: 'cyber_antennas',
      earColor: '#1E293B',
      haloType: 'cyber_hex',
      haloColor: '#38BDF8',
      coatColor: '#FFFFFF',
      accentColor: '#06B6D4',
      skirtColor: '#1E293B',
      eyeType: 'sparkle_stars',
      eyeColor: '#0EA5E9',
      skinTone: '#FFF1E0',
      outfitType: 'academy_blazer',
      ribbonColor: '#EC4899',
    },
  },
  {
    id: 'anya',
    name: 'Anya Forger',
    badge: 'WAKU WAKU 🥜',
    desc: 'Cute buns + signature Anya Smug grin',
    tagline: '「 アーニャ // HEH MEME 𓁹‿𓁹 」',
    classType: 'gunslinger',
    chibi: {
      frontHairStyle: 'anya_horns_bangs',
      backHairStyle: 'anya_buns',
      hairStyle: 'anya_buns',
      hairColor: '#F472B6',
      eyesOverHair: true,
      hatType: 'cat_beanie',
      hatColor: '#EC4899',
      wingType: 'angel_feathers',
      wingColor: '#FFFFFF',
      earType: 'none',
      earColor: '#2B272C',
      haloType: 'star',
      haloColor: '#FDE047',
      coatColor: '#1E293B',
      accentColor: '#FDE047',
      skirtColor: '#0F172A',
      eyeType: 'anya_smug',
      eyeColor: '#10B981',
      skinTone: '#FFF1E0',
      outfitType: 'academy_blazer',
      ribbonColor: '#FDE047',
    },
  },
  {
    id: 'bocchi',
    name: 'Bocchi The Rock',
    badge: 'ANXIETY GUITAR 🎸',
    desc: 'Shaggy pink hair, cube clips & panic meme face',
    tagline: '「 後藤ひとり // GUITAR HERO 」',
    classType: 'swordmaster',
    chibi: {
      frontHairStyle: 'bocchi_shaggy',
      backHairStyle: 'bocchi_side',
      hairStyle: 'bocchi_side',
      hairColor: '#F472B6',
      eyesOverHair: true,
      hatType: 'none',
      wingType: 'fairy_sparkle',
      wingColor: '#F472B6',
      earType: 'none',
      earColor: '#2B272C',
      haloType: 'none',
      haloColor: '#38BDF8',
      coatColor: '#FCE7F3',
      accentColor: '#38BDF8',
      skirtColor: '#1E293B',
      eyeType: 'bocchi_panic',
      eyeColor: '#38BDF8',
      skinTone: '#FFF1E0',
      outfitType: 'cyber_hoodie',
      ribbonColor: '#38BDF8',
    },
  },
  {
    id: 'reimu',
    name: 'Shrine Priestess',
    badge: 'HAKUREI MIKO ⛩️',
    desc: 'Traditional crimson hakama, fox mask & yin-yang orbs',
    tagline: '「 博麗神社 // SHRINE MAIDEN 」',
    classType: 'cybermage',
    chibi: {
      frontHairStyle: 'hime_sidelocks',
      backHairStyle: 'side_ponytail',
      hairColor: '#1E293B',
      eyesOverHair: true,
      hatType: 'kitsune_mask',
      hatColor: '#FFFFFF',
      wingType: 'none',
      earType: 'none',
      earColor: '#2B272C',
      haloType: 'floral',
      haloColor: '#EF4444',
      coatColor: '#FFFFFF',
      accentColor: '#EF4444',
      skirtColor: '#DC2626',
      eyeType: 'smug_cat_face',
      eyeColor: '#DC2626',
      skinTone: '#FFF1E0',
      outfitType: 'shrine_miko',
      ribbonColor: '#EF4444',
    },
  },
  {
    id: 'bloomer_yuuka',
    name: 'Yuuka (PE Sports)',
    badge: 'CALCULATOR 🏃‍♀️',
    desc: 'Navy gym bloomers, twin pigtails & determined look',
    tagline: '「 ユウカ // MILLENNIUM SPORTS 」',
    classType: 'gunslinger',
    chibi: {
      frontHairStyle: 'straight_bangs',
      backHairStyle: 'twintails',
      hairColor: '#38BDF8',
      eyesOverHair: true,
      hatType: 'cyber_cap',
      hatColor: '#1E3A8A',
      wingType: 'none',
      earType: 'none',
      earColor: '#2B272C',
      haloType: 'cyber_hex',
      haloColor: '#38BDF8',
      coatColor: '#FFFFFF',
      accentColor: '#1E3A8A',
      skirtColor: '#1E3A8A',
      eyeType: 'determined',
      eyeColor: '#38BDF8',
      skinTone: '#FFF1E0',
      outfitType: 'gym_bloomer',
      ribbonColor: '#1E3A8A',
    },
  },
  {
    id: 'madoka',
    name: 'Magical Starlight',
    badge: 'HOPE DIVINE ✨',
    desc: 'Frilly magical star dress & gleaming prismatic wings',
    tagline: '「 魔法少女 // COSMIC GUARDIAN 」',
    classType: 'cybermage',
    chibi: {
      frontHairStyle: 'sailor_crescent',
      backHairStyle: 'twintails',
      hairColor: '#F472B6',
      eyesOverHair: true,
      hatType: 'crown_hat',
      hatColor: '#FDE047',
      wingType: 'butterfly_prisma',
      wingColor: '#F472B6',
      earType: 'wings_head',
      earColor: '#FFFFFF',
      haloType: 'heart',
      haloColor: '#F472B6',
      coatColor: '#F472B6',
      accentColor: '#FDE047',
      skirtColor: '#F472B6',
      eyeType: 'diamond_shoujo',
      eyeColor: '#F472B6',
      skinTone: '#FFF1E0',
      outfitType: 'magical_girl',
      ribbonColor: '#F472B6',
    },
  },
  {
    id: 'giga_chad',
    name: 'Giga Chad Chibi',
    badge: 'SIGMA LEADER 🗿',
    desc: 'Massive anime pompadour & chiseled shades',
    tagline: '「 ギガ・チャド // UNSTOPPABLE CHAD 」',
    classType: 'swordmaster',
    chibi: {
      frontHairStyle: 'chad_quiff',
      backHairStyle: 'pompadour_chad',
      hairStyle: 'pompadour_chad',
      hairColor: '#1E293B',
      eyesOverHair: true,
      hatType: 'police_cap',
      hatColor: '#0F172A',
      wingType: 'dragon_drake',
      wingColor: '#DC2626',
      earType: 'none',
      earColor: '#2B272C',
      haloType: 'crown',
      haloColor: '#FDE047',
      coatColor: '#0F172A',
      accentColor: '#F59E0B',
      skirtColor: '#1E293B',
      eyeType: 'anime_shades',
      eyeColor: '#F59E0B',
      skinTone: '#F7D7BA',
      outfitType: 'combat_commando',
      ribbonColor: '#F59E0B',
    },
  },
];

const FRONT_HAIR_LIST: { id: ChibiConfig['frontHairStyle']; name: string; tag?: string }[] = [
  { id: 'straight_bangs', name: 'Straight Bangs', tag: 'CLASSIC' },
  { id: 'teto_arched_bangs', name: 'Teto Arched', tag: 'POPULAR' },
  { id: 'miku_fringe', name: 'Miku Fringe', tag: 'NEW' },
  { id: 'anya_horns_bangs', name: 'Anya Round', tag: 'CUTE' },
  { id: 'bocchi_shaggy', name: 'Bocchi Shaggy', tag: 'MEME' },
  { id: 'sailor_crescent', name: 'Sailor Crescent', tag: 'CUTE' },
  { id: 'curtain_bangs', name: 'Curtain Bangs', tag: 'NEW' },
  { id: 'v_bangs', name: 'V-Point Fringe', tag: 'NEW' },
  { id: 'messy_curly', name: 'Messy Curls', tag: 'NEW' },
  { id: 'braided_headband', name: 'Crown Braid', tag: 'CUTE' },
  { id: 'feathered_bangs', name: 'Feathered Wisps', tag: 'NEW' },
  { id: 'choppy_micro', name: 'Micro Bangs', tag: 'NEW' },
  { id: 'side_swept', name: 'Side Swept' },
  { id: 'hime_sidelocks', name: 'Hime Locks' },
  { id: 'spiky_bangs', name: 'Spiky Bangs' },
  { id: 'emo_fringe', name: 'Emo Side' },
  { id: 'short_parted', name: 'Short Parted' },
  { id: 'blunt_fringe', name: 'Blunt Fringe' },
  { id: 'center_split', name: 'Center Split' },
  { id: 'chad_quiff', name: 'Chad Quiff', tag: 'MEME' },
  { id: 'none', name: 'Clear Forehead' },
];

const BACK_HAIR_LIST: { id: ChibiConfig['backHairStyle']; name: string; tag?: string }[] = [
  { id: 'teto_drills', name: 'Teto Drills', tag: 'POPULAR' },
  { id: 'miku_twintails', name: 'Miku Twintails', tag: 'NEW' },
  { id: 'anya_buns', name: 'Anya Buns', tag: 'CUTE' },
  { id: 'bocchi_side', name: 'Bocchi Side', tag: 'MEME' },
  { id: 'sailor_odango', name: 'Sailor Odango', tag: 'NEW' },
  { id: 'gyaru_ponytail', name: 'Gyaru Pony', tag: 'NEW' },
  { id: 'mega_drill_buns', name: 'Mega Drill Buns', tag: 'NEW' },
  { id: 'super_saiyan', name: 'Super Saiyan', tag: 'MEME' },
  { id: 'rapunzel_braid', name: 'Rapunzel Braid', tag: 'NEW' },
  { id: 'twin_bubble_tails', name: 'Bubble Pigtails', tag: 'CUTE' },
  { id: 'twin_drill_tails', name: 'Twin Drill Tails', tag: 'NEW' },
  { id: 'shaggy_mullet', name: 'Rock Mullet', tag: 'NEW' },
  { id: 'cat_hood_bob', name: 'Neko Bob', tag: 'CUTE' },
  { id: 'pompadour_chad', name: 'Chad Pompadour', tag: 'MEME' },
  { id: 'bob', name: 'Short Bob' },
  { id: 'twintails', name: 'Twin Tails' },
  { id: 'ojou_drills', name: 'Ojou Drills' },
  { id: 'drill_ponytail', name: 'Drill Pony' },
  { id: 'ponytail', name: 'High Ponytail' },
  { id: 'side_ponytail', name: 'Side Pony' },
  { id: 'spiky', name: 'Spiky Hero' },
  { id: 'wavy', name: 'Fluffy Wavy' },
  { id: 'long_flowing', name: 'Long Flowing' },
  { id: 'hime_cut', name: 'Hime Princess' },
  { id: 'braids', name: 'Dual Braids' },
  { id: 'side_braid', name: 'Side Braid' },
  { id: 'cyber_buns', name: 'Cyber Buns' },
  { id: 'twin_buns_flowing', name: 'Twin Odango' },
  { id: 'half_updo', name: 'Half Updo' },
  { id: 'low_twintails', name: 'Low Pigtails' },
  { id: 'wolf_cut', name: 'Wolf Cut' },
  { id: 'short_messy', name: 'Messy Shag' },
  { id: 'ahoge_messy', name: 'Ahoge Wild' },
  { id: 'fluffy_short', name: 'Fluffy Short' },
  { id: 'pixie_cut', name: 'Chic Pixie' },
  { id: 'slicked_back', name: 'Undercut Nape' },
  { id: 'mushroom_bob', name: 'Mushroom Bob' },
  { id: 'topknot_samurai', name: 'Samurai Topknot' },
  { id: 'afro', name: 'Afro Puff' },
  { id: 'dreadlocks', name: 'Cyber Dreads' },
  { id: 'none_short', name: 'Tapered Short' },
];

const HATS_LIST: { id: ChibiConfig['hatType']; name: string; tag?: string }[] = [
  { id: 'cyber_cap', name: 'Snapback Cap', tag: 'NEW' },
  { id: 'combat_helmet', name: 'Mecha Helmet', tag: 'NEW' },
  { id: 'cat_beanie', name: 'Cat Beanie', tag: 'CUTE' },
  { id: 'witch_hat', name: 'Witch Hat', tag: 'NEW' },
  { id: 'maid_headdress', name: 'Maid Headdress', tag: 'CUTE' },
  { id: 'kitsune_mask', name: 'Kitsune Mask', tag: 'POPULAR' },
  { id: 'shark_hood', name: 'Shark Hood', tag: 'CUTE' },
  { id: 'flower_crown', name: 'Flower Crown', tag: 'CUTE' },
  { id: 'propeller_beanie', name: 'Propeller Cap', tag: 'MEME' },
  { id: 'top_hat', name: 'Gentleman Top', tag: 'NEW' },
  { id: 'pirate_hat', name: 'Pirate Tricorn', tag: 'NEW' },
  { id: 'cowboy_hat', name: 'Cowboy Hat', tag: 'NEW' },
  { id: 'chef_toque', name: 'Chef Hat', tag: 'MEME' },
  { id: 'nvg_goggles', name: 'NVG Goggles', tag: 'TACTICAL' },
  { id: 'beret', name: 'Military Beret', tag: 'NEW' },
  { id: 'bunny_hood', name: 'Bunny Hoodie', tag: 'CUTE' },
  { id: 'cyber_visor', name: 'Cyber Visor', tag: 'NEW' },
  { id: 'straw_hat', name: 'Straw Hat', tag: 'NEW' },
  { id: 'crown_hat', name: 'Mini Crown', tag: 'ROYAL' },
  { id: 'police_cap', name: 'Officer Cap', tag: 'NEW' },
  { id: 'none', name: 'No Hat' },
];

const WINGS_LIST: { id: ChibiConfig['wingType']; name: string; tag?: string }[] = [
  { id: 'angel_feathers', name: 'Angel Feathers', tag: 'DIVINE' },
  { id: 'devil_bat', name: 'Devil Bat', tag: 'DARK' },
  { id: 'cyber_thrusters', name: 'Mecha Thrusters', tag: 'CYBER' },
  { id: 'mecha_wings', name: 'Gundam Wings', tag: 'NEW' },
  { id: 'phoenix_fire', name: 'Phoenix Fire', tag: 'HOT' },
  { id: 'butterfly_prisma', name: 'Prism Butterfly', tag: 'CUTE' },
  { id: 'crystal_shards', name: 'Crystal Shards', tag: 'NEW' },
  { id: 'shadow_tendrils', name: 'Shadow Tendrils', tag: 'DARK' },
  { id: 'fairy_sparkle', name: 'Fairy Sparkle', tag: 'CUTE' },
  { id: 'dragon_drake', name: 'Dragon Drake', tag: 'NEW' },
  { id: 'pixel_wings', name: '8-Bit Retro', tag: 'MEME' },
  { id: 'none', name: 'No Wings' },
];

const OUTFITS_LIST: { id: ChibiConfig['outfitType']; name: string; desc: string; tag?: string }[] = [
  { id: 'academy_blazer', name: 'Academy Blazer', desc: 'Kivotos uniform', tag: 'POPULAR' },
  { id: 'gym_bloomer', name: 'Gym Bloomers', desc: 'School PE sports', tag: 'NEW' },
  { id: 'shrine_miko', name: 'Shrine Miko', desc: 'Hakama & haori', tag: 'NEW' },
  { id: 'magical_girl', name: 'Magical Girl', desc: 'Starry frills', tag: 'CUTE' },
  { id: 'bunny_suit', name: 'Bunny Bodysuit', desc: 'Casino corset', tag: 'NEW' },
  { id: 'swimsuit_sailor', name: 'Sailor Bikini', desc: 'Summer beach', tag: 'NEW' },
  { id: 'tactical_shinobi', name: 'Shinobi Vest', desc: 'Combat tactical' },
  { id: 'cyber_hoodie', name: 'Cyber Hoodie', desc: 'Cozy oversized' },
  { id: 'cyber_ninja', name: 'Cyber Ninja', desc: 'Neon bodysuit', tag: 'NEW' },
  { id: 'techwear_poncho', name: 'Tech Poncho', desc: 'Straps & buckles', tag: 'NEW' },
  { id: 'mecha_pilot', name: 'Mecha Pilot', desc: 'Cyber plugsuit' },
  { id: 'maid_idol', name: 'Idol Maid', desc: 'Frilly apron dress' },
  { id: 'kigurumi_onesie', name: 'Kigurumi Onesie', desc: 'Animal pajama', tag: 'CUTE' },
  { id: 'vampire_noble', name: 'Vampire Noble', desc: 'Gothic cape & vest', tag: 'NEW' },
  { id: 'combat_commando', name: 'Plate Carrier', desc: 'Kevlar ammo gear', tag: 'NEW' },
  { id: 'sukeban_trench', name: 'Sukeban Trench', desc: 'Delinquent leader', tag: 'NEW' },
  { id: 'work_overalls', name: 'Denim Overalls', desc: 'Casual dungarees', tag: 'NEW' },
  { id: 'goth_lolita', name: 'Gothic Frills', desc: 'Victorian dark' },
  { id: 'streetwear', name: 'Urban Street', desc: 'Street runner' },
  { id: 'military_officer', name: 'Officer Coat', desc: 'Tactical greatcoat' },
  { id: 'magic_robe', name: 'Scholar Robe', desc: 'Arcane caster' },
  { id: 'kimono_yukata', name: 'Modern Kimono', desc: 'Festival wrap' },
];

const EYES_LIST: { id: ChibiConfig['eyeType']; name: string; tag?: string }[] = [
  { id: 'cat_w', name: 'Cat-W :3', tag: 'POPULAR' },
  { id: 'anya_smug', name: 'Anya Smug 𓁹‿𓁹', tag: 'MEME' },
  { id: 'starry_tears', name: 'Starry Tears 🥺✨', tag: 'CUTE' },
  { id: 'waterfall_cry', name: 'Waterfall Cry ｡ﾟ', tag: 'MEME' },
  { id: 'smug_cat_face', name: 'Smug Neko (｀・ω・´)', tag: 'POPULAR' },
  { id: 'diamond_shoujo', name: 'Diamond Shoujo 💎', tag: 'CUTE' },
  { id: 'yandere_glow', name: 'Yandere Rings 🌀', tag: 'DARK' },
  { id: 'anime_shades', name: 'Cool Shades 😎', tag: 'MEME' },
  { id: 'laser_eyes', name: 'Laser Beams ⚡', tag: 'MEME' },
  { id: 'pog_shock', name: 'Shocked Pog (°o°)', tag: 'MEME' },
  { id: 'drool_sleepy', name: 'Drool Sleepy (¬‿¬)', tag: 'CUTE' },
  { id: 'rage_fire', name: 'Rage Fire 🔥', tag: 'MEME' },
  { id: 'derp', name: 'Derp Wag 🤪', tag: 'MEME' },
  { id: 'hypno_spiral', name: 'Hypno Spiral 🌀', tag: 'MEME' },
  { id: 'nya_cat', name: 'Nya Slits 🐱', tag: 'CUTE' },
  { id: 'wink_star', name: 'Pop Star Wink ✨‿•', tag: 'CUTE' },
  { id: 'sparkle_hearts', name: 'Ruby Hearts 💖', tag: 'CUTE' },
  { id: 'sleepy_closed', name: 'Comfy Sleep (- ‿ -)', tag: 'CUTE' },
  { id: 'aqua_crying', name: 'Aqua Cry (ToT)', tag: 'MEME' },
  { id: 'bocchi_panic', name: 'Bocchi Panic (°Д°)', tag: 'MEME' },
  { id: 'sparkle_stars', name: 'Galaxy Stars ✨', tag: 'CUTE' },
  { id: 'heart_eyes', name: 'Heart Eyes 💕', tag: 'CUTE' },
  { id: 'owo', name: 'OwO Kawaii', tag: 'CUTE' },
  { id: 'pout', name: 'Cheek Pout >_<', tag: 'CUTE' },
  { id: 'giga_chad', name: 'Giga Chad 🗿', tag: 'MEME' },
  { id: 'wink', name: 'Wink >‿•' },
  { id: 'happy', name: 'Happy ^‿^' },
  { id: 'determined', name: 'Determined •_•' },
  { id: 'sleepy', name: 'Sleepy ˘◡˘' },
  { id: 'teary', name: 'Teary 🥺' },
  { id: 'dizzy_spiral', name: 'Dizzy Spiral' },
  { id: 'glasses', name: 'Smart Glasses' },
  { id: 'deadpan', name: 'Deadpan -_-' },
  { id: 'dot', name: 'Dots • •' },
  { id: 'dead_x', name: 'Knockout X_X', tag: 'MEME' },
];

const SKIN_TONES_LIST: { id: string; name: string; color: string }[] = [
  { id: '#FFF1E0', name: 'Porcelain', color: '#FFF1E0' },
  { id: '#FFE4D6', name: 'Peach', color: '#FFE4D6' },
  { id: '#FEE2D5', name: 'Rosy Fair', color: '#FEE2D5' },
  { id: '#F7D7BA', name: 'Golden', color: '#F7D7BA' },
  { id: '#E8BE9B', name: 'Sun Tan', color: '#E8BE9B' },
];

const EARS_LIST: { id: ChibiConfig['earType']; name: string; tag?: string }[] = [
  { id: 'cat', name: 'Neko Cat', tag: 'CUTE' },
  { id: 'fox', name: 'Fox Kitsune', tag: 'POPULAR' },
  { id: 'wolf', name: 'Wolf Fluff', tag: 'NEW' },
  { id: 'bunny', name: 'Bunny Ears', tag: 'CUTE' },
  { id: 'bear', name: 'Teddy Bear', tag: 'CUTE' },
  { id: 'mouse', name: 'Round Mouse', tag: 'NEW' },
  { id: 'deer_antlers', name: 'Deer Antlers', tag: 'NEW' },
  { id: 'sheep_horns', name: 'Sheep Horns', tag: 'NEW' },
  { id: 'dog_floppy', name: 'Puppy Floppy' },
  { id: 'elf', name: 'Pointy Elf' },
  { id: 'wings_head', name: 'Angel Wing Clips' },
  { id: 'cyber_antennas', name: 'Cyber Tech Fins' },
  { id: 'devil_horns', name: 'Devil Horns' },
  { id: 'dragon_horns', name: 'Dragon Horns' },
  { id: 'none', name: 'Human / None' },
];

const HALOS_LIST: { id: ChibiConfig['haloType']; name: string }[] = [
  { id: 'shuriken', name: 'Shuriken' },
  { id: 'star', name: 'Star' },
  { id: 'winged', name: 'Winged' },
  { id: 'crown', name: 'Crown' },
  { id: 'circle', name: 'Orbit' },
  { id: 'cyber_hex', name: 'Hexagon' },
  { id: 'heart', name: 'Heart' },
  { id: 'floral', name: 'Sakura' },
  { id: 'cross', name: 'Cross' },
  { id: 'neon_rings', name: 'Dual Rings' },
  { id: 'none', name: 'No Halo' },
];

// Miniature vector preview cards
const FrontHairCard: React.FC<{
  styleId: ChibiConfig['frontHairStyle'];
  name: string;
  tag?: string;
  isSelected: boolean;
  hairColor: string;
  skinTone: string;
  ribbonColor: string;
  onClick: () => void;
}> = ({ styleId, name, tag, isSelected, hairColor, skinTone, ribbonColor, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrontHairThumbnail(ctx, canvas.width, canvas.height, styleId, hairColor, skinTone, ribbonColor);
  }, [styleId, hairColor, skinTone, ribbonColor]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-102 ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={name}
    >
      {tag && (
        <span
          className={`absolute -top-1.5 -right-1 px-1 py-0.2 text-[7px] font-black rounded-xs uppercase tracking-tighter ${
            tag === 'NEW' ? 'bg-cyan-500 text-black' : tag === 'POPULAR' ? 'bg-amber-400 text-black' : 'bg-pink-500 text-white'
          }`}
        >
          {tag}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[8.5px] font-bold truncate w-full text-center mt-0.5 leading-tight">{name}</span>
    </button>
  );
};

const BackHairCard: React.FC<{
  styleId: ChibiConfig['backHairStyle'];
  name: string;
  tag?: string;
  isSelected: boolean;
  hairColor: string;
  skinTone: string;
  ribbonColor: string;
  onClick: () => void;
}> = ({ styleId, name, tag, isSelected, hairColor, skinTone, ribbonColor, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBackHairThumbnail(ctx, canvas.width, canvas.height, styleId, hairColor, skinTone, ribbonColor);
  }, [styleId, hairColor, skinTone, ribbonColor]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-102 ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={name}
    >
      {tag && (
        <span
          className={`absolute -top-1.5 -right-1 px-1 py-0.2 text-[7px] font-black rounded-xs uppercase tracking-tighter ${
            tag === 'NEW' ? 'bg-cyan-500 text-black' : tag === 'POPULAR' ? 'bg-amber-400 text-black' : 'bg-pink-500 text-white'
          }`}
        >
          {tag}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[8.5px] font-bold truncate w-full text-center mt-0.5 leading-tight">{name}</span>
    </button>
  );
};

const HatCard: React.FC<{
  hatId: ChibiConfig['hatType'];
  name: string;
  tag?: string;
  isSelected: boolean;
  hatColor: string;
  onClick: () => void;
}> = ({ hatId, name, tag, isSelected, hatColor, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawHatThumbnail(ctx, canvas.width, canvas.height, hatId, hatColor);
  }, [hatId, hatColor]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-102 ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={name}
    >
      {tag && (
        <span className="absolute -top-1.5 -right-1 px-1 py-0.2 text-[7px] font-black rounded-xs uppercase tracking-tighter bg-amber-400 text-black">
          {tag}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[8.5px] font-bold truncate w-full text-center mt-0.5 leading-tight">{name}</span>
    </button>
  );
};

const WingCard: React.FC<{
  wingId: ChibiConfig['wingType'];
  name: string;
  tag?: string;
  isSelected: boolean;
  wingColor: string;
  onClick: () => void;
}> = ({ wingId, name, tag, isSelected, wingColor, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawWingThumbnail(ctx, canvas.width, canvas.height, wingId, wingColor);
  }, [wingId, wingColor]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-102 ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={name}
    >
      {tag && (
        <span className="absolute -top-1.5 -right-1 px-1 py-0.2 text-[7px] font-black rounded-xs uppercase tracking-tighter bg-cyan-400 text-black">
          {tag}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[8.5px] font-bold truncate w-full text-center mt-0.5 leading-tight">{name}</span>
    </button>
  );
};

const FaceCard: React.FC<{
  eyeId: ChibiConfig['eyeType'];
  name: string;
  tag?: string;
  isSelected: boolean;
  eyeColor: string;
  skinTone: string;
  onClick: () => void;
}> = ({ eyeId, name, tag, isSelected, eyeColor, skinTone, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFaceThumbnail(ctx, canvas.width, canvas.height, eyeId, eyeColor, skinTone);
  }, [eyeId, eyeColor, skinTone]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-102 ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={name}
    >
      {tag && (
        <span
          className={`absolute -top-1.5 -right-1 px-1 py-0.2 text-[7px] font-black rounded-xs uppercase tracking-tighter ${
            tag === 'MEME' ? 'bg-amber-400 text-black' : tag === 'HOT' ? 'bg-red-500 text-white' : 'bg-pink-500 text-white'
          }`}
        >
          {tag}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[8.5px] font-bold truncate w-full text-center mt-0.5 leading-tight">{name}</span>
    </button>
  );
};

const OutfitCard: React.FC<{
  outfitId: ChibiConfig['outfitType'];
  name: string;
  desc: string;
  tag?: string;
  isSelected: boolean;
  coatColor: string;
  accentColor: string;
  skirtColor: string;
  skinTone: string;
  onClick: () => void;
}> = ({ outfitId, name, desc, tag, isSelected, coatColor, accentColor, skirtColor, skinTone, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawOutfitThumbnail(ctx, canvas.width, canvas.height, outfitId, coatColor, accentColor, skirtColor, skinTone);
  }, [outfitId, coatColor, accentColor, skirtColor, skinTone]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1.5 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-102 ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={`${name} - ${desc}`}
    >
      {tag && (
        <span
          className={`absolute -top-1.5 -right-1 px-1 py-0.2 text-[7px] font-black rounded-xs uppercase tracking-tighter ${
            tag === 'NEW' ? 'bg-cyan-500 text-black' : tag === 'POPULAR' ? 'bg-amber-400 text-black' : 'bg-pink-500 text-white'
          }`}
        >
          {tag}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-11 h-11 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[9px] font-black truncate w-full text-center mt-0.5">{name}</span>
      <span className="text-[7.5px] text-zinc-500 font-sans truncate w-full text-center">{desc}</span>
    </button>
  );
};

const EarCard: React.FC<{
  earId: ChibiConfig['earType'];
  name: string;
  tag?: string;
  isSelected: boolean;
  earColor: string;
  innerEarColor: string;
  skinTone: string;
  onClick: () => void;
}> = ({ earId, name, tag, isSelected, earColor, innerEarColor, skinTone, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawEarThumbnail(ctx, canvas.width, canvas.height, earId, earColor, innerEarColor, skinTone);
  }, [earId, earColor, innerEarColor, skinTone]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1.5 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-102 ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={name}
    >
      {tag && (
        <span className="absolute -top-1.5 -right-1 px-1 py-0.2 text-[7px] font-black rounded-xs uppercase tracking-tighter bg-pink-500 text-white">
          {tag}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[8.5px] font-bold truncate w-full text-center mt-0.5 leading-tight">{name}</span>
    </button>
  );
};

const HaloCard: React.FC<{
  haloId: ChibiConfig['haloType'];
  name: string;
  isSelected: boolean;
  haloColor: string;
  onClick: () => void;
}> = ({ haloId, name, isSelected, haloColor, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawHaloThumbnail(ctx, canvas.width, canvas.height, haloId, haloColor);
  }, [haloId, haloColor]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-between p-1 rounded-xs border transition-all cursor-pointer ${
        isSelected
          ? 'bg-red-600/30 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)] ring-1 ring-red-400'
          : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/60'
      }`}
      title={name}
    >
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
      />
      <span className="text-[8.5px] font-bold truncate w-full text-center mt-0.5 leading-tight">{name}</span>
    </button>
  );
};

export const CharacterCreator: React.FC<CharacterCreatorProps> = ({ onStartGame }) => {
  const [name, setName] = useState<string>('Kasane Teto');
  const [characterClass, setCharacterClass] = useState<CharacterClass>('swordmaster');
  const [activeTab, setActiveTab] = useState<
    'presets' | 'frontHair' | 'backHair' | 'face' | 'hats' | 'ears' | 'wings' | 'outfit' | 'halo'
  >('presets');

  // Customization states
  const [frontHairStyle, setFrontHairStyle] = useState<ChibiConfig['frontHairStyle']>('teto_arched_bangs');
  const [backHairStyle, setBackHairStyle] = useState<ChibiConfig['backHairStyle']>('teto_drills');
  const [hairColor, setHairColor] = useState<string>('#EF4444');

  const [eyesOverHair, setEyesOverHair] = useState<boolean>(true);

  const [hatType, setHatType] = useState<ChibiConfig['hatType']>('none');
  const [hatColor, setHatColor] = useState<string>('#1E293B');

  const [wingType, setWingType] = useState<ChibiConfig['wingType']>('none');
  const [wingColor, setWingColor] = useState<string>('#FFFFFF');

  const [eyeType, setEyeType] = useState<ChibiConfig['eyeType']>('cat_w');
  const [eyeColor, setEyeColor] = useState<string>('#EF4444');
  const [skinTone, setSkinTone] = useState<string>('#FFF1E0');

  const [earType, setEarType] = useState<ChibiConfig['earType']>('wings_head');
  const [haloType, setHaloType] = useState<ChibiConfig['haloType']>('shuriken');
  const [haloColor, setHaloColor] = useState<string>('#EF4444');

  const [outfitType, setOutfitType] = useState<ChibiConfig['outfitType']>('tactical_shinobi');
  const [coatColor, setCoatColor] = useState<string>('#1E293B');
  const [accentColor, setAccentColor] = useState<string>('#EF4444');
  const [skirtColor, setSkirtColor] = useState<string>('#0F172A');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply full preset
  const applyPreset = (preset: PresetCharacter) => {
    sound.playPickup();
    setName(preset.name);
    setCharacterClass(preset.classType);
    setFrontHairStyle(preset.chibi.frontHairStyle || 'teto_arched_bangs');
    setBackHairStyle(preset.chibi.backHairStyle || preset.chibi.hairStyle || 'teto_drills');
    setHairColor(preset.chibi.hairColor);
    setEyesOverHair(preset.chibi.eyesOverHair !== false);
    setHatType(preset.chibi.hatType || 'none');
    setHatColor(preset.chibi.hatColor || '#1E293B');
    setWingType(preset.chibi.wingType || 'none');
    setWingColor(preset.chibi.wingColor || '#FFFFFF');
    setEyeType(preset.chibi.eyeType);
    setEyeColor(preset.chibi.eyeColor || '#EF4444');
    setSkinTone(preset.chibi.skinTone || '#FFF1E0');
    setEarType(preset.chibi.earType);
    setHaloType(preset.chibi.haloType);
    setHaloColor(preset.chibi.haloColor);
    setOutfitType(preset.chibi.outfitType || 'academy_blazer');
    setCoatColor(preset.chibi.coatColor);
    setAccentColor(preset.chibi.accentColor || '#EF4444');
    setSkirtColor(preset.chibi.skirtColor);
  };

  // Live Canvas Preview of Chibi Character (ENLARGED & SHARP!)
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
        frontHairStyle,
        backHairStyle,
        hairStyle: backHairStyle,
        hairColor,
        eyesOverHair,
        hatType,
        hatColor,
        wingType,
        wingColor,
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
      x: 0,
      y: 0,
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

      // Scaled up preview
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2 + 35);
      ctx.scale(1.75, 1.75);
      drawChibiCharacter(ctx, previewPlayer, elapsed, true);
      ctx.restore();

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [
    name,
    characterClass,
    frontHairStyle,
    backHairStyle,
    hairColor,
    eyesOverHair,
    hatType,
    hatColor,
    wingType,
    wingColor,
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
    const frontHairs = FRONT_HAIR_LIST.map((h) => h.id);
    const backHairs = BACK_HAIR_LIST.map((h) => h.id);
    const hats = HATS_LIST.map((h) => h.id);
    const wings = WINGS_LIST.map((w) => w.id);
    const eyeTypes = EYES_LIST.map((e) => e.id);
    const earTypes = EARS_LIST.map((e) => e.id);
    const haloTypes = HALOS_LIST.map((h) => h.id);
    const outfits = OUTFITS_LIST.map((o) => o.id);

    setName(randName);
    setFrontHairStyle(frontHairs[Math.floor(Math.random() * frontHairs.length)]);
    setBackHairStyle(backHairs[Math.floor(Math.random() * backHairs.length)]);
    setHairColor(HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)]);
    setHatType(hats[Math.floor(Math.random() * hats.length)]);
    setHatColor(HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)]);
    setWingType(wings[Math.floor(Math.random() * wings.length)]);
    setWingColor(WING_COLORS[Math.floor(Math.random() * WING_COLORS.length)]);
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
    if (isDeploying) return;
    setIsDeploying(true);
    sound.playDanceJingle();

    // Phase 1: Dance (1.5s) → Phase 2: Zoom (1s) → Phase 3: Fade to black (1s) → Call onStartGame
    setDeployPhase('dance');
    setTimeout(() => {
      setDeployPhase('zoom');
      setTimeout(() => {
        setDeployPhase('fade');
        setTimeout(() => {
          sound.startCozyMusic();

          const selectedClassData = CLASS_DEFAULTS[characterClass];
          const starterWeapon = ITEMS_DATABASE[selectedClassData.starterWeapon];
          const starterSkateboard = ITEMS_DATABASE['veh_skateboard'];
          const starterPotion = ITEMS_DATABASE['item_hp_potion_s'];

          const chosenName = name.trim() || 'Hero';

          const newPlayer: Player = {
            id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: chosenName,
            characterClass,
            chibi: {
              frontHairStyle,
              backHairStyle,
              hairStyle: backHairStyle,
              hairColor,
              eyesOverHair,
              hatType,
              hatColor,
              wingType,
              wingColor,
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
            spawnBounce: 0.1,
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
        }, 1000);
      }, 1000);
    }, 1500);
  };

  // Deploy animation states
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<'none' | 'dance' | 'zoom' | 'fade'>('none');

  // Update preview chibi to dance when deploying
  useEffect(() => {
    if (!isDeploying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;
    const startTime = performance.now();

    const previewPlayer: Player = {
      id: 'preview_deploy',
      name: name.trim() || 'Hero',
      characterClass,
      chibi: {
        frontHairStyle,
        backHairStyle,
        hairStyle: backHairStyle,
        hairColor,
        eyesOverHair,
        hatType,
        hatColor,
        wingType,
        wingColor,
        earType,
        earColor: '#2B272C',
        innerEarColor: '#F472B6',
        haloType,
        haloColor,
        coatColor,
        accentColor,
        skirtColor,
        eyeType: 'happy',
        eyeColor,
        skinTone,
        outfitType,
        ribbonColor: accentColor,
      },
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 'right',
      state: 'idle',
      stats: { level: 1, exp: 0, maxExp: 100, hp: 300, maxHp: 300, mp: 100, maxMp: 100, atk: 20, def: 10, speed: 4.5, critRate: 10, statPoints: 0, str: 5, agi: 5, int: 5, vit: 5 },
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
      currentZone: 'cyber_city',
      activeBuffs: [],
      cinematicPose: 'dance',
      hideWeapon: true,
    };

    const render = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Progressive zoom during deployment
      const zoomProgress = deployPhase === 'zoom' || deployPhase === 'fade' ? 1.0 : Math.min(1, elapsed / 1.5) * 0.3;
      const scale = 1.75 + zoomProgress * 1.2;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2 + 35 - zoomProgress * 30);
      ctx.scale(scale, scale);
      drawChibiCharacter(ctx, previewPlayer, elapsed, true);
      ctx.restore();

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [isDeploying, deployPhase]);

  const selectedClassData = CLASS_DEFAULTS[characterClass];
  const starterWeapon = ITEMS_DATABASE[selectedClassData.starterWeapon];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl p-2 sm:p-4 overflow-y-auto font-mono select-none">
      {/* Heavy Cyberpunk Anime Background Ambient Graphic Stencils */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-15">
        <div className="absolute -top-10 -left-10 text-[180px] font-black text-red-500 italic tracking-tighter select-none">
          CHIBI//PROTOCOL
        </div>
        <div className="absolute -bottom-16 -right-10 text-[200px] font-black text-white italic tracking-tighter select-none">
          ARCHETYPE//07
        </div>
        <div className="absolute top-1/4 right-1/4 text-9xl font-black text-zinc-700 tracking-widest">
          「 決 闘 者 」
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        style={{
          clipPath:
            'polygon(0 14px, 4% 2px, 8% 16px, 14% 3px, 20% 15px, 27% 2px, 34% 16px, 41% 3px, 48% 15px, 55% 2px, 62% 16px, 70% 3px, 78% 15px, 86% 2px, 94% 15px, 100% 4px, 100% 100%, 0 100%)',
        }}
        className="w-full max-w-5xl bg-zinc-950/98 border-b-4 border-red-600 shadow-[0_32px_120px_rgba(0,0,0,0.98)] p-4 sm:p-6 pt-7 flex flex-col md:flex-row gap-5 sm:gap-7 ring-1 ring-red-900/50 relative z-10"
      >
        {/* Left: ENLARGED Character Showcase Card Banner */}
        <div className="flex flex-col items-center justify-between md:w-[380px] lg:w-[410px] bg-gradient-to-b from-zinc-900/90 via-zinc-950/95 to-black border-2 border-red-600/60 p-4 relative overflow-hidden shadow-2xl">
          {/* Vertical Sideways Background Watermarks */}
          <div className="absolute right-1 top-10 bottom-10 [writing-mode:vertical-rl] font-black text-5xl sm:text-6xl text-white/10 uppercase tracking-widest pointer-events-none select-none">
            CHIBI // UNIT 07
          </div>
          <div className="absolute left-1 top-10 bottom-10 [writing-mode:vertical-rl] rotate-180 font-black text-4xl sm:text-5xl text-red-500/10 uppercase tracking-widest pointer-events-none select-none">
            「 決 闘 者 」 ARCHETYPE
          </div>

          <div className="absolute -top-12 -right-12 w-32 h-32 bg-red-600/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute top-2 left-2 text-[8px] font-black tracking-widest text-zinc-600 uppercase">
            PROTOCOL // CHIBI-007
          </div>
          <div className="absolute top-2 right-2 text-[8px] font-black tracking-widest text-red-500 uppercase">
            LAT 35.6895 // LNG 139.6917
          </div>

          {/* Dossier Header */}
          <div className="w-full flex items-center justify-between border-b border-red-900/50 pb-2 mt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-950/80 px-2.5 py-1 rounded-xs border border-red-600/60">
              <Radio size={12} className="text-red-400 animate-pulse" />
              // AGENT_DOSSIER
            </div>
            <button
              type="button"
              onClick={handleRandomize}
              className="flex items-center gap-1.5 text-[11px] font-black text-zinc-200 hover:text-white bg-zinc-800 hover:bg-red-600/40 px-2.5 py-1 rounded-xs border border-zinc-700 hover:border-red-500 cursor-pointer active:scale-95 transition-all"
              title="Randomize operator appearance"
            >
              <Dice5 size={13} className="text-amber-400" />
              REROLL
            </button>
          </div>

          {/* Stenciled Background Name Watermark */}
          <div className="absolute top-24 left-1/2 -translate-x-1/2 text-5xl font-black text-white/5 tracking-tighter uppercase whitespace-nowrap pointer-events-none select-none">
            {name || 'OPERATOR'}
          </div>

          {/* ENLARGED Canvas Summoning Showcase */}
          <div className="my-2 relative flex items-center justify-center w-full">
            {/* Ambient Backlight Aura */}
            <div
              className="absolute inset-0 rounded-full blur-2xl pointer-events-none opacity-40"
              style={{
                background: `radial-gradient(circle, ${accentColor || '#EF4444'} 0%, transparent 70%)`,
              }}
            />
            {/* Tech Cyber Crosshair Ring Behind */}
            <div className="absolute w-52 h-52 border border-red-600/20 rounded-full pointer-events-none animate-[spin_30s_linear_infinite]" />
            <div className="absolute w-64 h-64 border border-dashed border-red-500/15 rounded-full pointer-events-none" />

            {/* Huge Canvas Viewport (360x340) */}
            <canvas
              ref={canvasRef}
              width={360}
              height={340}
              className="w-[290px] h-[270px] sm:w-[340px] sm:h-[310px] relative z-10 drop-shadow-[0_16px_32px_rgba(0,0,0,0.95)]"
            />
          </div>

          {/* Agent Typography & Metrics Dossier */}
          <div className="w-full space-y-2.5 text-center relative z-10">
            <div>
              <div className="flex items-center justify-center gap-2 mb-0.5">
                <span className="text-[9px] font-black text-red-500 tracking-widest uppercase">
                  /// COMBAT UNIT
                </span>
                <span className="text-zinc-500 text-[8px]">•</span>
                <span className="text-[9px] font-mono text-zinc-400 tracking-wider">
                  「 {selectedClassData.name.toUpperCase()} 」
                </span>
              </div>
              <h2 className="font-black text-2xl sm:text-3xl text-white tracking-tight italic uppercase drop-shadow-[0_4px_12px_rgba(239,68,68,0.5)]">
                {name || 'Unknown Agent'}
              </h2>
              <div className="inline-block mt-1 px-3 py-0.5 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest -skew-x-8 shadow-md">
                RADIANT // {characterClass.toUpperCase()}
              </div>
            </div>

            {/* Tactical Stat Radar Gauges (ATK, DEF, SPD) */}
            <div className="bg-black/70 p-2.5 rounded-xs border border-zinc-800 space-y-1.5 text-left text-[10px]">
              <div>
                <div className="flex justify-between text-zinc-400 font-bold mb-0.5">
                  <span className="text-red-400 flex items-center gap-1">
                    <Flame size={10} /> ATK LETHALITY
                  </span>
                  <span className="text-white font-mono">{selectedClassData.baseAtk} PTS</span>
                </div>
                <div className="w-full bg-zinc-850 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400"
                    style={{ width: `${(selectedClassData.baseAtk / 30) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-zinc-400 font-bold mb-0.5">
                  <span className="text-sky-400 flex items-center gap-1">
                    <Shield size={10} /> SHIELD & VIT
                  </span>
                  <span className="text-white font-mono">{selectedClassData.baseHp} HP</span>
                </div>
                <div className="w-full bg-zinc-850 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-sky-600 to-cyan-400"
                    style={{ width: `${(selectedClassData.baseHp / 150) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-zinc-400 font-bold mb-0.5">
                  <span className="text-amber-400 flex items-center gap-1">
                    <Zap size={10} /> MOBILITY DASH
                  </span>
                  <span className="text-white font-mono">{selectedClassData.baseSpd} SPD</span>
                </div>
                <div className="w-full bg-zinc-850 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-300"
                    style={{ width: `${(selectedClassData.baseSpd / 6) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Starter Tactical Kit Bar */}
            <div className="bg-black/50 p-2 rounded-xs border border-zinc-800/80 text-[10px] text-zinc-300 flex items-center justify-around font-mono">
              <span title="Primary Weapon">🔫 {starterWeapon?.name?.split(' ')[0] || 'Pistol'}</span>
              <span className="text-red-600 font-black">/</span>
              <span title="Transport Vehicle">🛹 Skateboard</span>
              <span className="text-red-600 font-black">/</span>
              <span title="Combat Stims">🧪 5x Stims</span>
            </div>
          </div>
        </div>

        {/* Right: Customization Console */}
        <div className="flex-1 flex flex-col justify-between space-y-2.5">
          <div>
            {/* Header Title */}
            <div className="flex items-center justify-between border-b border-red-900/50 pb-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white italic uppercase tracking-wider flex items-center gap-2">
                  <Wand2 className="text-red-500" size={20} />
                  // OPERATOR_CUSTOMIZATION
                </h1>
                <p className="text-[11px] text-zinc-400">
                  Build your anime operative with 2-part hair, outfits, headwear, wings, and meme faces.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Eyes Over Hair Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    setEyesOverHair(!eyesOverHair);
                    sound.playPickup();
                  }}
                  className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-xs border transition-all cursor-pointer ${
                    eyesOverHair
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Toggle anime eye rendering layer (Over or Under Bangs)"
                >
                  <Eye size={12} className={eyesOverHair ? 'text-cyan-400' : 'text-zinc-600'} />
                  <span>EYES OVER HAIR: {eyesOverHair ? 'ON' : 'OFF'}</span>
                </button>

                <span className="text-[9px] font-black text-red-500 tracking-widest uppercase border border-red-600/50 bg-red-950/40 px-2 py-1">
                  SYS 3.5
                </span>
              </div>
            </div>

            {/* Codename & Archetype Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                  // OPERATOR_CODENAME
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={name}
                    maxLength={18}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter agent codename..."
                    className="flex-1 bg-black/80 border border-zinc-800 focus:border-red-500 rounded-xs px-3 py-1.5 text-white font-bold text-xs focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setName(RANDOM_NICKNAMES[Math.floor(Math.random() * RANDOM_NICKNAMES.length)])}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-700 rounded-xs text-[11px] font-black cursor-pointer transition-all active:scale-95"
                  >
                    RAND
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                  // COMBAT_ARCHETYPE
                </label>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  {[
                    { id: 'gunslinger', label: 'Gunslinger', icon: Crosshair },
                    { id: 'swordmaster', label: 'Blade', icon: Zap },
                    { id: 'cybermage', label: 'Mage', icon: Shield },
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
                        className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xs border text-[10.5px] font-black transition-all cursor-pointer ${
                          isSelected
                            ? 'border-red-500 bg-red-600/30 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)] ring-1 ring-red-400'
                            : 'border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <Icon size={13} className={isSelected ? 'text-red-400' : 'text-zinc-500'} />
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Customization Tabs Bar */}
            <div className="grid grid-cols-5 sm:grid-cols-9 gap-1 p-1 bg-black/80 rounded-xs border border-zinc-800 mt-2">
              {[
                { id: 'presets', label: 'Presets', icon: '⭐' },
                { id: 'frontHair', label: 'Bangs', icon: '💇' },
                { id: 'backHair', label: 'Back Hair', icon: '🎀' },
                { id: 'outfit', label: 'Outfit', icon: '🥋' },
                { id: 'face', label: 'Face 3D', icon: '👁️' },
                { id: 'hats', label: 'Hats', icon: '🧢' },
                { id: 'wings', label: 'Wings', icon: '🪽' },
                { id: 'ears', label: 'Ears', icon: '🦊' },
                { id: 'halo', label: 'Halo', icon: '✨' },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xs text-[10px] font-black transition-all cursor-pointer ${
                      isActive
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white bg-zinc-900/60'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span className="truncate hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB: Presets Detailed Showcase */}
            {activeTab === 'presets' && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                    // CHOOSE_OPERATOR_PRESET ({PRESET_CHARACTERS.length} ICONIC CHARACTERS)
                  </label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {PRESET_CHARACTERS.map((preset) => {
                    const isSel = name === preset.name;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={`group relative flex flex-col items-start p-2.5 rounded-xs border transition-all cursor-pointer ${
                          isSel
                            ? 'bg-gradient-to-br from-red-600/30 to-black border-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.55)] ring-1 ring-red-400'
                            : 'bg-black/70 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] font-black text-white">{preset.name}</span>
                          <span className="text-[8px] bg-red-600/40 text-red-300 px-1 py-0.2 rounded-xs font-mono">
                            {preset.classType.slice(0, 4).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[8px] font-mono text-amber-400 mt-0.5">{preset.badge}</span>
                        <span className="text-[7.5px] text-zinc-500 mt-0.5 font-sans leading-tight">
                          {preset.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: Front Hair (Bangs / Чёлка) */}
            {activeTab === 'frontHair' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // FRONT_BANGS ({FRONT_HAIR_LIST.length} STYLES)
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {FRONT_HAIR_LIST.find((h) => h.id === frontHairStyle)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 max-h-[220px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {FRONT_HAIR_LIST.map((h) => {
                      const isSel = frontHairStyle === h.id;
                      return (
                        <FrontHairCard
                          key={h.id}
                          styleId={h.id}
                          name={h.name}
                          tag={h.tag}
                          isSelected={isSel}
                          hairColor={hairColor}
                          skinTone={skinTone}
                          ribbonColor={accentColor}
                          onClick={() => {
                            setFrontHairStyle(h.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1 border-t border-zinc-850">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // HAIR_DYE_COLOR
                    </label>
                    <span className="text-[9px] font-mono text-red-400">{hairColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HAIR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setHairColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                          hairColor === c
                            ? 'border-white scale-125 shadow-md ring-2 ring-red-500'
                            : 'border-zinc-800 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Back Hair (Length / Tails / Drills) */}
            {activeTab === 'backHair' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // BACK_HAIR_&_TAILS ({BACK_HAIR_LIST.length} STYLES)
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {BACK_HAIR_LIST.find((h) => h.id === backHairStyle)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 max-h-[220px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {BACK_HAIR_LIST.map((h) => {
                      const isSel = backHairStyle === h.id;
                      return (
                        <BackHairCard
                          key={h.id}
                          styleId={h.id}
                          name={h.name}
                          tag={h.tag}
                          isSelected={isSel}
                          hairColor={hairColor}
                          skinTone={skinTone}
                          ribbonColor={accentColor}
                          onClick={() => {
                            setBackHairStyle(h.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1 border-t border-zinc-850">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // HAIR_DYE_COLOR
                    </label>
                    <span className="text-[9px] font-mono text-red-400">{hairColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HAIR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setHairColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                          hairColor === c
                            ? 'border-white scale-125 shadow-md ring-2 ring-red-500'
                            : 'border-zinc-800 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Outfit (22 STYLES) */}
            {activeTab === 'outfit' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // TACTICAL_&_ANIME_OUTFITS ({OUTFITS_LIST.length} STYLES)
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {OUTFITS_LIST.find((o) => o.id === outfitType)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 max-h-[220px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {OUTFITS_LIST.map((o) => {
                      const isSel = outfitType === o.id;
                      return (
                        <OutfitCard
                          key={o.id}
                          outfitId={o.id}
                          name={o.name}
                          desc={o.desc}
                          tag={o.tag}
                          isSelected={isSel}
                          coatColor={coatColor}
                          accentColor={accentColor}
                          skirtColor={skirtColor}
                          skinTone={skinTone}
                          onClick={() => {
                            setOutfitType(o.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-850">
                  <div>
                    <label className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mb-1 block">
                      Coat / Top Color
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {COAT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCoatColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                            coatColor === c ? 'border-white scale-125 ring-2 ring-red-500' : 'border-zinc-800'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mb-1 block">
                      Accent / Ribbon Color
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ACCENT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAccentColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                            accentColor === c ? 'border-white scale-125 ring-2 ring-red-500' : 'border-zinc-800'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Face (3D SPHERICAL EYES, MEME FACES, COLOR & SKIN TONE) */}
            {activeTab === 'face' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // SPHERICAL_3D_EYES ({EYES_LIST.length} EXPRESSIONS)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setEyesOverHair(!eyesOverHair);
                        sound.playPickup();
                      }}
                      className={`flex items-center gap-1 text-[8.5px] font-black uppercase px-2 py-0.5 rounded-xs border cursor-pointer ${
                        eyesOverHair
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                      }`}
                    >
                      <Eye size={10} />
                      <span>Eyes Over Hair: {eyesOverHair ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 max-h-[220px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {EYES_LIST.map((e) => {
                      const isSel = eyeType === e.id;
                      return (
                        <FaceCard
                          key={e.id}
                          eyeId={e.id}
                          name={e.name}
                          tag={e.tag}
                          isSelected={isSel}
                          eyeColor={eyeColor}
                          skinTone={skinTone}
                          onClick={() => {
                            setEyeType(e.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-850">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                        // EYE_IRIS_COLOR
                      </label>
                      <span className="text-[9px] font-mono text-red-400">{eyeColor}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {EYE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEyeColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                            eyeColor === c
                              ? 'border-white scale-125 shadow-md ring-2 ring-red-500'
                              : 'border-zinc-800 hover:scale-110 shadow-xs'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                        // SKIN_TONE
                      </label>
                      <span className="text-[9px] font-mono text-zinc-400">
                        {SKIN_TONES_LIST.find((s) => s.id === skinTone)?.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {SKIN_TONES_LIST.map((s) => {
                        const isSel = skinTone === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSkinTone(s.id);
                              sound.playPickup();
                            }}
                            className={`flex flex-col items-center justify-center p-1 rounded-xs border text-[8px] font-bold transition-all cursor-pointer ${
                              isSel
                                ? 'bg-red-600/30 border-red-500 text-white ring-1 ring-red-400'
                                : 'bg-black/60 border-zinc-800 text-zinc-400 hover:text-white'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/50 shadow-xs"
                              style={{ backgroundColor: s.color }}
                            />
                            <span className="truncate mt-0.5">{s.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Hats & Headwear */}
            {activeTab === 'hats' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // HATS_&_HEADWEAR ({HATS_LIST.length} STYLES)
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {HATS_LIST.find((h) => h.id === hatType)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-h-[220px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {HATS_LIST.map((h) => {
                      const isSel = hatType === h.id;
                      return (
                        <HatCard
                          key={h.id}
                          hatId={h.id}
                          name={h.name}
                          tag={h.tag}
                          isSelected={isSel}
                          hatColor={hatColor}
                          onClick={() => {
                            setHatType(h.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1 border-t border-zinc-850">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // HAT_COLOR
                    </label>
                    <span className="text-[9px] font-mono text-red-400">{hatColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HAT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setHatColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                          hatColor === c
                            ? 'border-white scale-125 shadow-md ring-2 ring-red-500'
                            : 'border-zinc-800 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Back Wings */}
            {activeTab === 'wings' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // BACK_WINGS ({WINGS_LIST.length} STYLES)
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {WINGS_LIST.find((w) => w.id === wingType)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-h-[220px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {WINGS_LIST.map((w) => {
                      const isSel = wingType === w.id;
                      return (
                        <WingCard
                          key={w.id}
                          wingId={w.id}
                          name={w.name}
                          tag={w.tag}
                          isSelected={isSel}
                          wingColor={wingColor}
                          onClick={() => {
                            setWingType(w.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1 border-t border-zinc-850">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // WING_ENERGY_COLOR
                    </label>
                    <span className="text-[9px] font-mono text-red-400">{wingColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {WING_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setWingColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                          wingColor === c
                            ? 'border-white scale-125 shadow-md ring-2 ring-red-500'
                            : 'border-zinc-800 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Animal Ears & Horns */}
            {activeTab === 'ears' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // ANIMAL_EARS_&_HORNS ({EARS_LIST.length} STYLES)
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {EARS_LIST.find((e) => e.id === earType)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {EARS_LIST.map((e) => {
                      const isSel = earType === e.id;
                      return (
                        <EarCard
                          key={e.id}
                          earId={e.id}
                          name={e.name}
                          tag={e.tag}
                          isSelected={isSel}
                          earColor={'#2B272C'}
                          innerEarColor={'#F472B6'}
                          skinTone={skinTone}
                          onClick={() => {
                            setEarType(e.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Halo */}
            {activeTab === 'halo' && (
              <div className="space-y-2 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // FLOATING_HALO ({HALOS_LIST.length} STYLES)
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {HALOS_LIST.find((h) => h.id === haloType)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-h-[220px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {HALOS_LIST.map((h) => {
                      const isSel = haloType === h.id;
                      return (
                        <HaloCard
                          key={h.id}
                          haloId={h.id}
                          name={h.name}
                          isSelected={isSel}
                          haloColor={haloColor}
                          onClick={() => {
                            setHaloType(h.id);
                            sound.playPickup();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1 border-t border-zinc-850">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                      // HALO_&_ACCENT_GLOW_COLOR
                    </label>
                    <span className="text-[9px] font-mono text-red-400">{haloColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HALO_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setHaloColor(c);
                          setAccentColor(c);
                        }}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                          haloColor === c
                            ? 'border-white scale-125 shadow-md ring-2 ring-red-500'
                            : 'border-zinc-800 hover:scale-110 shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls Summary & Deploy Action Button */}
          <div className="space-y-2 pt-2 border-t border-red-900/40">
            <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-zinc-400 px-1">
              <span>⌨️ <b>WASD</b>: Move</span>
              <span>💨 <b>Shift</b>: Slide / Dash</span>
              <span>⚡ <b>Space</b>: Bhop</span>
              <span>🔫 <b>Click/F</b>: Fire</span>
              <span>🔄 <b>R</b>: Reload</span>
              <span>🛹 <b>V</b>: Mount</span>
            </div>

            <button
              type="button"
              onClick={handleLaunch}
              disabled={isDeploying}
              className={`w-full bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-black text-base py-3.5 px-6 rounded-xs shadow-[0_0_36px_rgba(220,38,38,0.85)] border-2 border-red-400 flex items-center justify-center gap-2 transform active:scale-98 transition-all cursor-pointer -skew-x-3 uppercase tracking-wider ${isDeploying ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Play size={18} className="fill-white" />
              {isDeploying ? 'DEPLOYING...' : 'LOCK IN // DEPLOY TO COMBAT ZONE'}
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Cinematic Deploy Fade Overlay */}
      {isDeploying && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: deployPhase === 'fade' ? 1 : deployPhase === 'zoom' ? 0.5 : 0.15 }}
          transition={{ duration: deployPhase === 'fade' ? 0.8 : 0.5 }}
          className="fixed inset-0 z-[60] bg-black pointer-events-none flex items-center justify-center"
        >
          {deployPhase === 'dance' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="text-2xl font-black text-red-500 tracking-widest uppercase animate-pulse">
                ✦ DEPLOYING OPERATOR ✦
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
};


