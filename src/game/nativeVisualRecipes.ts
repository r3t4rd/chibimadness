import type { ChibiConfig, GunType, Player } from '../types/game';

/**
 * Authoritative native sprite recipes.
 *
 * The atlas generator consumes these recipes with the existing Canvas source
 * renderer during the build. Runtime only resolves a stable frame key and
 * WGPU samples that frame, so visual tuning never creates a Rust draw branch.
 */
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
];

/** Every handheld variant is baked: switching weapons never calls Canvas. */
export const NATIVE_CHARACTER_WEAPONS: readonly GunType[] = [
  'pistol', 'revolver', 'mac10', 'ak47', 'shotgun', 'cheytac', 'katana',
  'sledgehammer', 'throwing_knives', 'scythe', 'greatsword', 'staff',
  'wand', 'grimoire', 'totem',
];

function sameChibiRecipe(actual: ChibiConfig, recipe: ChibiConfig): boolean {
  return Object.entries(recipe).every(([key, value]) => (
    actual[key as keyof ChibiConfig] === value
  ));
}

export function getNativeCharacterSpriteFrame(player: Player): string | null {
  const recipe = NATIVE_CHARACTER_SPRITE_RECIPES.find((candidate) => (
    sameChibiRecipe(player.chibi, candidate.chibi)
  ));
  if (!recipe) return null;
  const weapon = player.equipment.weapon?.gunType ?? 'pistol';
  return `character_${recipe.id}_${weapon}`;
}

export function getNativeNpcSpriteFrame(npcId: string): string {
  return `npc_${npcId}`;
}
