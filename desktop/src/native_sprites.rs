//! Static native sprite-atlas registry.
//!
//! The PNGs are produced by `scripts/generate-sprite-atlases.ts` from the
//! authoritative Canvas artwork. Runtime code never invokes Canvas: it only
//! resolves a stable visual key to an atlas frame and submits textured quads.

use std::{collections::HashMap, sync::OnceLock};

use serde::Deserialize;

use crate::world_renderer::NativeChibiRecipe;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteFrame {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub pivot_x: f32,
    pub pivot_y: f32,
}

#[derive(Deserialize)]
struct AtlasMetadata {
    width: u32,
    height: u32,
    frames: HashMap<String, SpriteFrame>,
}

pub struct SpriteAtlasDefinition {
    pub id: &'static str,
    pub png: &'static [u8],
    pub width: u32,
    pub height: u32,
    pub frames: HashMap<String, SpriteFrame>,
}

struct SpriteAtlasSource {
    id: &'static str,
    png: &'static [u8],
    metadata: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterCatalog {
    weapons: Vec<String>,
    characters: Vec<CharacterCatalogEntry>,
    #[serde(default)]
    npcs: HashMap<String, String>,
    #[serde(default)]
    fallbacks: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterCatalogEntry {
    id: String,
    #[serde(default)]
    all_weapons: bool,
    #[serde(default)]
    weapon: String,
    #[serde(rename = "match")]
    match_recipe: Option<NativeChibiRecipe>,
}

const CHARACTER_CATALOG_JSON: &str = include_str!("../../assets/native/characters.json");
static CHARACTER_CATALOG: OnceLock<CharacterCatalog> = OnceLock::new();
static RESOLVED_CHARACTER_FRAMES: OnceLock<Vec<ResolvedCharacterFrames>> = OnceLock::new();

struct ResolvedCharacterFrames {
    match_recipe: Option<NativeChibiRecipe>,
    frames: HashMap<String, String>,
}

fn character_catalog() -> &'static CharacterCatalog {
    CHARACTER_CATALOG.get_or_init(|| {
        serde_json::from_str(CHARACTER_CATALOG_JSON)
            .expect("assets/native/characters.json must be valid native character catalog")
    })
}

fn resolved_character_frames() -> &'static [ResolvedCharacterFrames] {
    RESOLVED_CHARACTER_FRAMES
        .get_or_init(|| {
            let catalog = character_catalog();
            catalog
                .characters
                .iter()
                .map(|entry| {
                    let weapons = if entry.all_weapons {
                        catalog.weapons.iter().map(String::as_str).collect::<Vec<_>>()
                    } else {
                        vec![entry.weapon.as_str()]
                    };
                    let frames = weapons
                        .into_iter()
                        .filter(|weapon| !weapon.is_empty())
                        .map(|weapon| {
                            let key = if entry.all_weapons {
                                format!("character_{}_{}", entry.id, weapon)
                            } else {
                                format!("character_{}", entry.id)
                            };
                            (weapon.to_owned(), key)
                        })
                        .collect();
                    ResolvedCharacterFrames {
                        match_recipe: entry.match_recipe.clone(),
                        frames,
                    }
                })
                .collect()
        })
        .as_slice()
}

const SOURCES: &[SpriteAtlasSource] = &[
    SpriteAtlasSource {
        id: "horde",
        png: include_bytes!("../../assets/sprites/horde_mobs_atlas.png"),
        metadata: include_str!("../../assets/sprites/horde_mobs_atlas.json"),
    },
    SpriteAtlasSource {
        id: "enemies",
        png: include_bytes!("../../assets/sprites/enemies_factions_atlas.png"),
        metadata: include_str!("../../assets/sprites/enemies_factions_atlas.json"),
    },
    SpriteAtlasSource {
        id: "bosses",
        png: include_bytes!("../../assets/sprites/bosses_atlas.png"),
        metadata: include_str!("../../assets/sprites/bosses_atlas.json"),
    },
    SpriteAtlasSource {
        id: "characters",
        png: include_bytes!("../../assets/sprites/characters_operators_atlas.png"),
        metadata: include_str!("../../assets/sprites/characters_operators_atlas.json"),
    },
];

/// Metadata is parsed once while constructing the renderer, never during a
/// combat frame. An invalid generated atlas disables only that atlas instead
/// of making the native surface fail to present.
pub fn load_definitions() -> Vec<SpriteAtlasDefinition> {
    SOURCES
        .iter()
        .filter_map(|source| {
            serde_json::from_str::<AtlasMetadata>(source.metadata)
                .ok()
                .filter(|metadata| metadata.width > 0 && metadata.height > 0)
                .map(|metadata| SpriteAtlasDefinition {
                    id: source.id,
                    png: source.png,
                    width: metadata.width,
                    height: metadata.height,
                    frames: metadata.frames,
                })
        })
        .collect()
}

pub fn atlas_for_frame(frame_key: &str) -> Option<&'static str> {
    if frame_key.starts_with("horde_") {
        Some("horde")
    } else if frame_key.starts_with("boss_") {
        Some("bosses")
    } else if frame_key.starts_with("character_")
        || frame_key.starts_with("npc_")
        || frame_key.starts_with("vehicle_")
    {
        Some("characters")
    } else if frame_key.starts_with("police_")
        || frame_key.starts_with("punk_")
        || frame_key.starts_with("bandit_")
        || frame_key.starts_with("cadet_")
    {
        Some("enemies")
    } else {
        None
    }
}

/// Resolves generated body art inside the native renderer. The WebView sends
/// only simulation fields (entity type, faction, weapon and saved chibi data)
/// and never chooses a texture or executes a drawing recipe.
pub fn resolve_actor_frame(
    kind: &str,
    id: &str,
    faction: &str,
    effect_type: &str,
    weapon_type: &str,
    horde_kind: &str,
    is_boss: bool,
    chibi: Option<&NativeChibiRecipe>,
) -> Option<&'static str> {
    match kind {
        "npc" => catalog_npc_frame(id),
        "player" => catalog_player_frame(chibi, weapon_type),
        "monster" => resolve_monster_frame(faction, effect_type, horde_kind, is_boss)
            .or_else(|| character_catalog().fallbacks.get("monster").map(String::as_str)),
        _ => None,
    }
}

fn catalog_npc_frame(id: &str) -> Option<&'static str> {
    let catalog = character_catalog();
    catalog
        .npcs
        .get(id)
        .or_else(|| catalog.fallbacks.get("npc"))
        .map(String::as_str)
}

fn catalog_player_frame(
    recipe: Option<&NativeChibiRecipe>,
    requested_weapon: &str,
) -> Option<&'static str> {
    let catalog = character_catalog();
    let weapon = catalog
        .weapons
        .iter()
        .find(|weapon| weapon.as_str() == requested_weapon)
        .map(String::as_str)
        .unwrap_or("pistol");
    let actor = recipe.and_then(|recipe| {
        resolved_character_frames()
            .iter()
            .find(|entry| entry.match_recipe.as_ref().is_some_and(|rule| chibi_recipe_matches(rule, recipe)))
    });
    match actor {
        Some(entry) => entry
            .frames
            .get(weapon)
            .map(String::as_str)
            .or_else(|| entry.frames.values().next().map(String::as_str)),
        _ => catalog.fallbacks.get("player").map(String::as_str),
    }
}

fn chibi_recipe_matches(rule: &NativeChibiRecipe, actual: &NativeChibiRecipe) -> bool {
    fn same(rule: &str, actual: &str) -> bool {
        rule.is_empty() || rule.eq_ignore_ascii_case(actual)
    }
    same(&rule.hair_style, &actual.hair_style)
        && same(&rule.front_hair_style, &actual.front_hair_style)
        && same(&rule.back_hair_style, &actual.back_hair_style)
        && same(&rule.hair_color, &actual.hair_color)
        && same(&rule.skin_tone, &actual.skin_tone)
        && same(&rule.eye_color, &actual.eye_color)
        && same(&rule.eye_type, &actual.eye_type)
        && same(&rule.ear_type, &actual.ear_type)
        && same(&rule.ear_color, &actual.ear_color)
        && same(&rule.inner_ear_color, &actual.inner_ear_color)
        && same(&rule.halo_type, &actual.halo_type)
        && same(&rule.halo_color, &actual.halo_color)
        && same(&rule.outfit_type, &actual.outfit_type)
        && same(&rule.coat_color, &actual.coat_color)
        && same(&rule.skirt_color, &actual.skirt_color)
        && same(&rule.accent_color, &actual.accent_color)
        && same(&rule.ribbon_color, &actual.ribbon_color)
        && same(&rule.hat_type, &actual.hat_type)
        && same(&rule.hat_color, &actual.hat_color)
        && same(&rule.wing_type, &actual.wing_type)
        && same(&rule.wing_color, &actual.wing_color)
}

fn resolve_monster_frame(
    faction: &str,
    effect_type: &str,
    horde_kind: &str,
    is_boss: bool,
) -> Option<&'static str> {
    if !horde_kind.is_empty() {
        return match (horde_kind, is_boss) {
            ("mite", false) => Some("horde_mite"), ("shade", false) => Some("horde_shade"),
            ("raider", false) => Some("horde_raider"), ("shotgun", false) => Some("horde_shotgun"),
            ("bomber", false) => Some("horde_bomber"), ("dasher", false) => Some("horde_dasher"),
            ("sniper", false) => Some("horde_sniper"), ("splitter", false) => Some("horde_splitter"),
            ("boss_titan", true) => Some("horde_boss_titan_boss"),
            ("boss_storm", true) => Some("horde_boss_storm_boss"), _ => None,
        };
    }
    match effect_type {
        "boss_welder" => Some("boss_boss_welder"),
        "boss_outlaw_viktor" => Some("boss_boss_outlaw_viktor"),
        "bandit_boss" => Some("boss_boss_bandit_warlord"),
        "cop_juggernaut" => Some("boss_boss_police_juggernaut"),
        "punk_juggernaut" => Some("boss_boss_punk_juggernaut"),
        _ => match (if faction == "punk_demon" { "punk" } else { faction }, effect_type) {
            ("police", "cop_officer") => Some("police_cop_officer"),
            ("police", "cop_swat") => Some("police_cop_swat"),
            ("police", "cop_enforcer") => Some("police_cop_enforcer"),
            ("police", "cop_marksman") => Some("police_cop_marksman"),
            ("punk", "punk_grunt") => Some("punk_punk_grunt"),
            ("punk", "punk_anarchist") => Some("punk_punk_anarchist"),
            ("punk", "punk_molotov") => Some("punk_punk_molotov"),
            ("bandit", "bandit_grunt") => Some("bandit_bandit_grunt"),
            ("bandit", "bandit_scout") => Some("bandit_bandit_scout"),
            ("bandit", "bandit_gunner") => Some("bandit_bandit_gunner"),
            ("bandit", "bandit_shotgunner") => Some("bandit_bandit_shotgunner"),
            ("bandit", "bandit_sniper") => Some("bandit_bandit_sniper"),
            ("bandit", "bandit_brawler") => Some("bandit_bandit_brawler"),
            ("cadet", "cadet_bat") => Some("cadet_cadet_bat"),
            ("cadet", "cadet_gunner") => Some("cadet_cadet_gunner"),
            ("cadet", "cadet_mage") => Some("cadet_cadet_mage"),
            ("cadet", "human_target") => Some("cadet_human_target"), _ => None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_frames_are_resolved_without_a_runtime_canvas() {
        let definitions = load_definitions();
        let horde = definitions
            .iter()
            .find(|atlas| atlas.id == "horde")
            .expect("horde atlas must be generated before the desktop build");
        assert!(horde.frames.contains_key("horde_mite"));
        let characters = definitions
            .iter()
            .find(|atlas| atlas.id == "characters")
            .expect("character atlas must be generated before the desktop build");
        assert!(
            characters
                .frames
                .contains_key("character_hatsune_miku_pistol")
        );
        assert!(
            characters
                .frames
                .contains_key("character_bloomer_yuuka_pistol")
        );
        assert!(characters.frames.contains_key("npc_npc_hank_guide"));
        assert_eq!(atlas_for_frame("npc_npc_hank_guide"), Some("characters"));
        assert_eq!(atlas_for_frame("police_cop_officer"), Some("enemies"));
        assert_eq!(atlas_for_frame("unknown"), None);
    }
}
