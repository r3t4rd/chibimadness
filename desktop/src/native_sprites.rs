//! Static native sprite-atlas registry.
//!
//! The PNGs are produced by `scripts/generate-sprite-atlases.ts` from the
//! authoritative Canvas artwork. Runtime code never invokes Canvas: it only
//! resolves a stable visual key to an atlas frame and submits textured quads.

use std::collections::HashMap;

use serde::Deserialize;

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
