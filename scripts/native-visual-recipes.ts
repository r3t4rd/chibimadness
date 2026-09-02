import type { ChibiConfig, GunType } from '../src/types/game';

/** Build-time input for source Canvas -> PNG atlas generation only.
 * This module is never imported by the WebView bundle. */
export interface NativeCharacterSpriteRecipe {
  id: string;
  name: string;
  chibi: ChibiConfig;
}

export const NATIVE_CHARACTER_SPRITE_RECIPES: readonly NativeCharacterSpriteRecipe[] = [
  {
    id: 'bloomer_yuuka',
    name: 'Yuuka (PE Sports)',
    chibi: {
      frontHairStyle: 'straight_bangs', backHairStyle: 'twintails', hairColor: '#38BDF8',
      eyesOverHair: true, hatType: 'cyber_cap', hatColor: '#1E3A8A', wingType: 'none',
      earType: 'none', earColor: '#2B272C', haloType: 'cyber_hex', haloColor: '#38BDF8',
      coatColor: '#FFFFFF', accentColor: '#1E3A8A', skirtColor: '#1E3A8A',
      eyeType: 'determined', eyeColor: '#38BDF8', skinTone: '#FFF1E0',
      outfitType: 'gym_bloomer', ribbonColor: '#1E3A8A',
    },
  },
];

export const NATIVE_CHARACTER_WEAPONS: readonly GunType[] = [
  'pistol', 'revolver', 'mac10', 'ak47', 'shotgun', 'cheytac', 'katana',
  'sledgehammer', 'throwing_knives', 'scythe', 'greatsword', 'staff',
  'wand', 'grimoire', 'totem',
];
