//! Static native sprite-atlas registry.
//!
//! The PNGs are produced by `scripts/generate-sprite-atlases.ts` from the
//! authoritative Canvas artwork. Runtime code never invokes Canvas: it only
//! resolves a stable visual key to an atlas frame and submits textured quads.

use std::collections::HashMap;

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
        "npc" => match id {
            "npc_hank_guide" => Some("npc_npc_hank_guide"),
            "npc_seraph_smith" => Some("npc_npc_seraph_smith"),
            "npc_momoi_guide" => Some("npc_npc_momoi_guide"),
            "npc_chibi_cafe" => Some("npc_npc_chibi_cafe"),
            "npc_nyx_crucible" => Some("npc_npc_nyx_crucible"),
            _ => None,
        },
        "player" => resolve_player_frame(chibi?, weapon_type),
        "monster" => resolve_monster_frame(faction, effect_type, horde_kind, is_boss),
        _ => None,
    }
}

fn resolve_player_frame(recipe: &NativeChibiRecipe, weapon_type: &str) -> Option<&'static str> {
    let weapon = match weapon_type {
        "pistol" | "revolver" | "mac10" | "ak47" | "shotgun" | "cheytac" | "katana"
        | "sledgehammer" | "throwing_knives" | "scythe" | "greatsword" | "staff" | "wand"
        | "grimoire" | "totem" => weapon_type,
        _ => "pistol",
    };
    let is_miku = recipe.front_hair_style == "miku_fringe"
        && recipe.back_hair_style == "miku_twintails"
        && recipe.hair_color.eq_ignore_ascii_case("#06B6D4")
        && recipe.hat_type == "headphones"
        && recipe.outfit_type == "idol_stage";
    if is_miku {
        return Some(match weapon {
            "pistol" => "character_hatsune_miku_pistol", "revolver" => "character_hatsune_miku_revolver",
            "mac10" => "character_hatsune_miku_mac10", "ak47" => "character_hatsune_miku_ak47",
            "shotgun" => "character_hatsune_miku_shotgun", "cheytac" => "character_hatsune_miku_cheytac",
            "katana" => "character_hatsune_miku_katana", "sledgehammer" => "character_hatsune_miku_sledgehammer",
            "throwing_knives" => "character_hatsune_miku_throwing_knives", "scythe" => "character_hatsune_miku_scythe",
            "greatsword" => "character_hatsune_miku_greatsword", "staff" => "character_hatsune_miku_staff",
            "wand" => "character_hatsune_miku_wand", "grimoire" => "character_hatsune_miku_grimoire",
            _ => "character_hatsune_miku_totem",
        });
    }
    let is_yuuka = recipe.front_hair_style == "straight_bangs"
        && recipe.back_hair_style == "twintails"
        && recipe.hair_color.eq_ignore_ascii_case("#38BDF8")
        && recipe.hat_type == "cyber_cap"
        && recipe.outfit_type == "gym_bloomer";
    if !is_yuuka { return None; }
    Some(match weapon {
        "pistol" => "character_bloomer_yuuka_pistol", "revolver" => "character_bloomer_yuuka_revolver",
        "mac10" => "character_bloomer_yuuka_mac10", "ak47" => "character_bloomer_yuuka_ak47",
        "shotgun" => "character_bloomer_yuuka_shotgun", "cheytac" => "character_bloomer_yuuka_cheytac",
        "katana" => "character_bloomer_yuuka_katana", "sledgehammer" => "character_bloomer_yuuka_sledgehammer",
        "throwing_knives" => "character_bloomer_yuuka_throwing_knives", "scythe" => "character_bloomer_yuuka_scythe",
        "greatsword" => "character_bloomer_yuuka_greatsword", "staff" => "character_bloomer_yuuka_staff",
        "wand" => "character_bloomer_yuuka_wand", "grimoire" => "character_bloomer_yuuka_grimoire",
        _ => "character_bloomer_yuuka_totem",
    })
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
