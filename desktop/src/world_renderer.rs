use std::{
    borrow::Cow,
    collections::HashMap,
    env, fs,
    sync::{
        Arc, Condvar, Mutex,
        mpsc::{self, Receiver, TryRecvError},
    },
    thread,
    time::Instant,
};

use ab_glyph::FontArc;
use bytemuck::{Pod, Zeroable};
use serde::{Deserialize, Serialize};
use yuyib::render::{RenderFrame, wgpu};

use crate::scene_executor;
use crate::{
    chibi_assets::{self, Paint, PathCommand, Primitive},
    native_sprites::{self, SpriteAtlasDefinition, SpriteFrame},
};

const MAX_RENDER_ENTITIES: usize = 2_048;
// The display list crosses the WebView bridge, so it is untrusted input even
// though today's sender is local game code. Keep it bounded before a future
// WGPU executor looks at paths, styles, or arbitrary JSON arguments.
const MAX_SCENE_COMMANDS: usize = 65_536;
const MAX_SCENE_ARGUMENTS: usize = 64;
const MAX_SCENE_VALUE_DEPTH: usize = 8;
const MAX_SCENE_VALUE_ITEMS: usize = 2_048;
const MAX_SCENE_STRING_BYTES: usize = 512;
// Kept only as a visual-regression baseline while the source-layout renderer
// is being completed; this path is deliberately not selected at runtime.
#[allow(dead_code)]
const GRID_SPACING: f32 = 160.0;
#[allow(dead_code)]
const MAX_GRID_LINES: usize = 96;
const MAX_PREDICTION_SECONDS: f32 = 0.12;
const MAX_ENTITY_SPEED: f32 = 10_000.0;
const SOURCE_WORLD_WIDTH: f32 = 5_400.0;
const SOURCE_WORLD_HEIGHT: f32 = 4_400.0;

fn srgb_to_linear(channel: f32) -> f32 {
    if channel <= 0.040_45 {
        channel / 12.92
    } else {
        ((channel + 0.055) / 1.055).powf(2.4)
    }
}

/// Converts the source renderer's CSS palette to linear bridge colours once,
/// avoiding a second, hand-maintained palette in the native renderer.
fn hex(value: &str) -> [f32; 4] {
    let bytes = value.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return [1.0, 0.0, 1.0, 1.0];
    }
    let parse = |offset| {
        std::str::from_utf8(&bytes[offset..offset + 2])
            .ok()
            .and_then(|part| u8::from_str_radix(part, 16).ok())
            .map_or(0.0, |channel| srgb_to_linear(channel as f32 / 255.0))
    };
    [parse(1), parse(3), parse(5), 1.0]
}

fn recipe_color(value: &str, fallback: [f32; 4]) -> [f32; 4] {
    if value.len() == 7 && value.starts_with('#') {
        hex(value)
    } else {
        fallback
    }
}

const WORLD_SHADER: &str = r#"
struct Camera {
    viewport: vec2<f32>,
    position: vec2<f32>,
    zoom: f32,
    _padding0: f32,
    _padding1: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;

@vertex
fn vs_main(@location(0) position: vec2<f32>, @location(1) color: vec4<f32>) -> VertexOutput {
    var output: VertexOutput;
    if (color.a < 0.0) {
        let screen = (position - camera.position) * camera.zoom + camera.viewport * 0.5;
        output.position = vec4<f32>(
            screen.x / camera.viewport.x * 2.0 - 1.0,
            1.0 - screen.y / camera.viewport.y * 2.0,
            0.0,
            1.0,
        );
    } else {
        output.position = vec4<f32>(position, 0.0, 1.0);
    }
    output.color = vec4<f32>(color.rgb, abs(color.a));
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
"#;

// Samples the retained world texture using the live dynamic camera. The
// texture is deliberately larger than the presentation surface, so panning
// does not force the expensive static mesh to be rasterized every frame.
const STATIC_COMPOSITE_SHADER: &str = r#"
struct CompositeCamera {
    output_viewport: vec2<f32>,
    dynamic_position: vec2<f32>,
    dynamic_zoom: f32,
    _padding0: f32,
    static_viewport: vec2<f32>,
    static_position: vec2<f32>,
    static_zoom: f32,
    _padding1: f32,
};

@group(0) @binding(0) var<uniform> camera: CompositeCamera;
@group(0) @binding(1) var static_world: texture_2d<f32>;
@group(0) @binding(2) var static_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    );
    var output: VertexOutput;
    output.position = vec4<f32>(positions[index], 0.0, 1.0);
    return output;
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    // `@builtin(position)` is already expressed from the top-left in a WGPU
    // fragment shader. Flipping it here mirrored the retained texture and
    // made it move in the wrong direction when the camera panned.
    let pixel = vec2<f32>(position.x, position.y);
    let world = (pixel - camera.output_viewport * 0.5) / camera.dynamic_zoom + camera.dynamic_position;
    let static_pixel = (world - camera.static_position) * camera.static_zoom + camera.static_viewport * 0.5;
    let uv = static_pixel / camera.static_viewport;
    // The sampler clamps while an asynchronous cache refresh catches up with
    // a fast camera. Returning a dark fallback here exposed a distracting
    // expanding strip at the viewport edge during every dash.
    return textureSample(static_world, static_sampler, uv);
}
"#;

// Atlas pixels are authored in sRGB PNGs and uploaded as `Rgba8UnormSrgb`,
// therefore textureSample returns linear values suitable for the native
// surface. Keeping this distinct from WORLD_SHADER avoids putting UVs on the
// large retained terrain vertex format.
const SPRITE_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@location(0) position: vec2<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(position, 0.0, 1.0);
    output.uv = uv;
    return output;
}

@group(0) @binding(0) var sprite_atlas: texture_2d<f32>;
@group(0) @binding(1) var sprite_sampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(sprite_atlas, sprite_sampler, input.uv);
}
"#;

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeChibiRecipe {
    #[serde(default)]
    pub hair_style: String,
    #[serde(default)]
    pub front_hair_style: String,
    #[serde(default)]
    pub back_hair_style: String,
    #[serde(default)]
    pub hair_color: String,
    #[serde(default)]
    pub skin_tone: String,
    #[serde(default)]
    pub eye_color: String,
    #[serde(default)]
    pub eye_type: String,
    #[serde(default)]
    pub ear_type: String,
    #[serde(default)]
    pub ear_color: String,
    #[serde(default)]
    pub inner_ear_color: String,
    #[serde(default)]
    pub halo_type: String,
    #[serde(default)]
    pub halo_color: String,
    #[serde(default)]
    pub outfit_type: String,
    #[serde(default)]
    pub coat_color: String,
    #[serde(default)]
    pub skirt_color: String,
    #[serde(default)]
    pub accent_color: String,
    #[serde(default)]
    pub ribbon_color: String,
    #[serde(default)]
    pub hat_type: String,
    #[serde(default)]
    pub hat_color: String,
    #[serde(default)]
    pub wing_type: String,
    #[serde(default)]
    pub wing_color: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAnimationRecipe {
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub is_sprinting: bool,
    #[serde(default)]
    pub jump_z: f32,
    #[serde(default = "default_spawn_bounce")]
    pub spawn_bounce: f32,
    #[serde(default)]
    pub attack_timer: f32,
    #[serde(default)]
    pub dodge_timer: f32,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRenderEntity {
    pub id: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub faction: String,
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub color: [f32; 4],
    #[serde(default)]
    pub velocity_x: f32,
    #[serde(default)]
    pub velocity_y: f32,
    #[serde(default)]
    pub has_velocity: bool,
    #[serde(default = "default_hp_ratio")]
    pub hp_ratio: f32,
    #[serde(default)]
    pub facing_left: bool,
    #[serde(default)]
    pub layer: i16,
    #[serde(default)]
    pub projectile_type: String,
    #[serde(default)]
    pub weapon_type: String,
    #[serde(default)]
    pub has_shield: bool,
    #[serde(default)]
    pub effect_type: String,
    #[serde(default)]
    pub horde_kind: String,
    #[serde(default)]
    pub is_boss: bool,
    /// Stable generated-atlas frame name (for example `horde_mite`). The
    /// bridge sends state, never image bytes or Canvas commands.
    #[serde(default)]
    pub sprite_key: String,
    #[serde(default)]
    pub projectile_range: f32,
    #[serde(default)]
    pub tracer_length: f32,
    #[serde(default)]
    pub tracer_width: f32,
    #[serde(default)]
    pub distance_traveled: f32,
    #[serde(default)]
    pub chibi: Option<NativeChibiRecipe>,
    #[serde(default)]
    pub animation: Option<NativeAnimationRecipe>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRenderFrame {
    pub camera_x: f32,
    pub camera_y: f32,
    pub zoom: f32,
    pub viewport_width: f32,
    pub viewport_height: f32,
    #[serde(default)]
    pub time_seconds: f32,
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub entities: Vec<NativeRenderEntity>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRenderScene {
    pub version: u8,
    pub viewport: NativeSceneViewport,
    pub camera: NativeSceneCamera,
    #[serde(default)]
    pub time_seconds: f32,
    #[serde(default)]
    pub commands: Vec<NativeSceneCommand>,
}

#[derive(Clone, Deserialize)]
pub struct NativeSceneViewport {
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Deserialize)]
pub struct NativeSceneCamera {
    pub x: f32,
    pub y: f32,
    pub zoom: f32,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum NativeSceneCommand {
    Layer {
        name: String,
    },
    Set {
        property: String,
        value: serde_json::Value,
    },
    Call {
        method: String,
        args: Vec<serde_json::Value>,
        #[serde(default)]
        result: Option<NativeSceneResourceRef>,
    },
    ResourceCall {
        #[serde(rename = "ref")]
        resource_ref: u32,
        method: String,
        args: Vec<serde_json::Value>,
    },
}

#[derive(Clone, Deserialize)]
pub struct NativeSceneResourceRef {
    #[serde(rename = "ref")]
    pub resource_ref: u32,
    pub kind: String,
}

fn scene_value_is_bounded(
    value: &serde_json::Value,
    depth: usize,
    item_budget: &mut usize,
) -> bool {
    if depth > MAX_SCENE_VALUE_DEPTH || *item_budget == 0 {
        return false;
    }
    *item_budget -= 1;
    match value {
        serde_json::Value::Null | serde_json::Value::Bool(_) => true,
        serde_json::Value::Number(number) => number.as_f64().is_some_and(f64::is_finite),
        serde_json::Value::String(text) => text.len() <= MAX_SCENE_STRING_BYTES,
        serde_json::Value::Array(values) => values
            .iter()
            .all(|value| scene_value_is_bounded(value, depth + 1, item_budget)),
        serde_json::Value::Object(values) => values.iter().all(|(key, value)| {
            key.len() <= MAX_SCENE_STRING_BYTES
                && scene_value_is_bounded(value, depth + 1, item_budget)
        }),
    }
}

fn scene_command_is_bounded(command: &NativeSceneCommand) -> bool {
    let (name, args, resource) = match command {
        NativeSceneCommand::Layer { name } => {
            return matches!(name.as_str(), "screen" | "static" | "dynamic");
        }
        NativeSceneCommand::Set { property, value } => {
            (property, std::slice::from_ref(value), None)
        }
        NativeSceneCommand::Call {
            method,
            args,
            result,
        } => (method, args.as_slice(), result.as_ref()),
        NativeSceneCommand::ResourceCall {
            resource_ref,
            method,
            args,
        } => {
            if *resource_ref == 0 {
                return false;
            }
            (method, args.as_slice(), None)
        }
    };
    if name.is_empty() || name.len() > 64 || args.len() > MAX_SCENE_ARGUMENTS {
        return false;
    }
    if let Some(result) = resource {
        if result.resource_ref == 0 || result.kind.is_empty() || result.kind.len() > 32 {
            return false;
        }
    }
    let mut item_budget = MAX_SCENE_VALUE_ITEMS;
    args.iter()
        .all(|value| scene_value_is_bounded(value, 0, &mut item_budget))
}

fn default_hp_ratio() -> f32 {
    1.0
}

fn default_spawn_bounce() -> f32 {
    1.0
}

fn visual_recipe_is_bounded(recipe: &NativeChibiRecipe) -> bool {
    [
        &recipe.hair_style,
        &recipe.front_hair_style,
        &recipe.back_hair_style,
        &recipe.hair_color,
        &recipe.skin_tone,
        &recipe.eye_color,
        &recipe.eye_type,
        &recipe.ear_type,
        &recipe.ear_color,
        &recipe.inner_ear_color,
        &recipe.halo_type,
        &recipe.halo_color,
        &recipe.outfit_type,
        &recipe.coat_color,
        &recipe.skirt_color,
        &recipe.accent_color,
        &recipe.ribbon_color,
        &recipe.hat_type,
        &recipe.hat_color,
        &recipe.wing_type,
        &recipe.wing_color,
    ]
    .iter()
    .all(|value| value.len() <= 64)
}

#[derive(Default)]
pub struct NativeWorldState {
    frame: Option<NativeRenderFrame>,
    received_at: Option<Instant>,
    frame_revision: u64,
    // Legacy monolithic display-list endpoint. Kept so older content bundles
    // can still start while the retained protocol rolls out atomically.
    scene: Option<NativeRenderScene>,
    scene_received_at: Option<Instant>,
    scene_revision: u64,
    static_scene: Option<NativeRenderScene>,
    static_scene_revision: u64,
    dynamic_scene: Option<NativeRenderScene>,
    dynamic_scene_revision: u64,
}

impl NativeWorldState {
    pub fn apply(&mut self, mut frame: NativeRenderFrame) {
        if !frame.camera_x.is_finite()
            || !frame.camera_y.is_finite()
            || !frame.zoom.is_finite()
            || !frame.viewport_width.is_finite()
            || !frame.viewport_height.is_finite()
            || !frame.time_seconds.is_finite()
        {
            return;
        }
        frame.zoom = frame.zoom.clamp(0.2, 8.0);
        frame.viewport_width = frame.viewport_width.clamp(1.0, 16_384.0);
        frame.viewport_height = frame.viewport_height.clamp(1.0, 16_384.0);
        frame.time_seconds = frame.time_seconds.rem_euclid(10_000_000.0);
        frame.entities.truncate(MAX_RENDER_ENTITIES);
        frame.entities.retain(|entity| {
            !entity.id.is_empty()
                && entity.id.len() <= 128
                && entity.x.is_finite()
                && entity.y.is_finite()
                && entity.size.is_finite()
                && entity.velocity_x.is_finite()
                && entity.velocity_y.is_finite()
                && entity.hp_ratio.is_finite()
                && entity.projectile_range.is_finite()
                && entity.tracer_length.is_finite()
                && entity.tracer_width.is_finite()
                && entity.distance_traveled.is_finite()
                && entity.kind.len() <= 32
                && entity.faction.len() <= 32
                && entity.projectile_type.len() <= 32
                && entity.weapon_type.len() <= 32
                && entity.effect_type.len() <= 32
                && entity.horde_kind.len() <= 32
                && entity.sprite_key.len() <= 96
                && entity.chibi.as_ref().is_none_or(visual_recipe_is_bounded)
                && entity
                    .animation
                    .as_ref()
                    .is_none_or(|animation| animation.state.len() <= 16)
                && entity.color.iter().all(|value| value.is_finite())
        });
        let received_at = Instant::now();
        let prior_positions =
            self.frame
                .as_ref()
                .zip(self.received_at)
                .map(|(previous, previous_received_at)| {
                    let elapsed = (received_at - previous_received_at)
                        .as_secs_f32()
                        .clamp(1.0 / 240.0, 0.25);
                    let positions = previous
                        .entities
                        .iter()
                        .map(|entity| (entity.id.as_str(), (entity.x, entity.y)))
                        .collect::<HashMap<_, _>>();
                    (positions, elapsed)
                });
        for entity in &mut frame.entities {
            entity.size = entity.size.clamp(1.0, 256.0);
            if !entity.has_velocity {
                if let Some((positions, elapsed)) = &prior_positions {
                    if let Some((previous_x, previous_y)) = positions.get(entity.id.as_str()) {
                        entity.velocity_x = (entity.x - *previous_x) / elapsed;
                        entity.velocity_y = (entity.y - *previous_y) / elapsed;
                    }
                }
            }
            entity.velocity_x = entity.velocity_x.clamp(-MAX_ENTITY_SPEED, MAX_ENTITY_SPEED);
            entity.velocity_y = entity.velocity_y.clamp(-MAX_ENTITY_SPEED, MAX_ENTITY_SPEED);
            entity.hp_ratio = entity.hp_ratio.clamp(0.0, 1.0);
            entity.projectile_range = entity.projectile_range.clamp(0.0, 20_000.0);
            entity.tracer_length = entity.tracer_length.clamp(0.0, 512.0);
            entity.tracer_width = entity.tracer_width.clamp(0.0, 64.0);
            entity.distance_traveled = entity.distance_traveled.clamp(0.0, 100_000.0);
            if let Some(animation) = &mut entity.animation {
                if !animation.jump_z.is_finite()
                    || !animation.spawn_bounce.is_finite()
                    || !animation.attack_timer.is_finite()
                    || !animation.dodge_timer.is_finite()
                {
                    entity.animation = None;
                } else {
                    animation.jump_z = animation.jump_z.clamp(0.0, 256.0);
                    animation.spawn_bounce = animation.spawn_bounce.clamp(0.0, 1.0);
                    animation.attack_timer = animation.attack_timer.clamp(0.0, 10.0);
                    animation.dodge_timer = animation.dodge_timer.clamp(0.0, 10.0);
                }
            }
            for channel in &mut entity.color[..3] {
                *channel = srgb_to_linear(channel.clamp(0.0, 1.0));
            }
            entity.color[3] = entity.color[3].clamp(0.0, 1.0);
        }
        frame.entities.sort_by_key(|entity| entity.layer);
        self.frame = Some(frame);
        self.received_at = Some(received_at);
        self.frame_revision = self.frame_revision.wrapping_add(1);
    }

    /// Stages a canonical source-renderer display list.  It deliberately does
    /// not select the list for presentation yet: native mode will switch only
    /// once the WGPU executor covers and has been compared against the Canvas
    /// reference backend.
    pub fn apply_scene(&mut self, mut scene: NativeRenderScene) {
        if !Self::normalize_scene(&mut scene) {
            return;
        }
        self.scene = Some(scene);
        self.scene_received_at = Some(Instant::now());
        self.scene_revision = self.scene_revision.wrapping_add(1);
    }

    pub fn apply_static_scene(&mut self, mut scene: NativeRenderScene) {
        if !Self::normalize_scene(&mut scene) {
            return;
        }
        self.static_scene = Some(scene);
        self.static_scene_revision = self.static_scene_revision.wrapping_add(1);
    }

    pub fn apply_dynamic_scene(&mut self, mut scene: NativeRenderScene) {
        if !Self::normalize_scene(&mut scene) {
            return;
        }
        self.dynamic_scene = Some(scene);
        self.dynamic_scene_revision = self.dynamic_scene_revision.wrapping_add(1);
    }

    fn normalize_scene(scene: &mut NativeRenderScene) -> bool {
        if scene.version != 1
            || !scene.viewport.width.is_finite()
            || !scene.viewport.height.is_finite()
            || !scene.camera.x.is_finite()
            || !scene.camera.y.is_finite()
            || !scene.camera.zoom.is_finite()
            || !scene.time_seconds.is_finite()
        {
            return false;
        }
        scene.viewport.width = scene.viewport.width.clamp(1.0, 16_384.0);
        scene.viewport.height = scene.viewport.height.clamp(1.0, 16_384.0);
        scene.camera.zoom = scene.camera.zoom.clamp(0.2, 8.0);
        scene.time_seconds = scene.time_seconds.rem_euclid(10_000_000.0);
        if scene.commands.len() > MAX_SCENE_COMMANDS
            || !scene.commands.iter().all(scene_command_is_bounded)
        {
            return false;
        }
        true
    }

    pub fn scene_with_revision(&self) -> Option<(&NativeRenderScene, u64)> {
        self.scene
            .as_ref()
            .map(|scene| (scene, self.scene_revision))
    }

    pub fn retained_scenes_with_revisions(
        &self,
    ) -> Option<((&NativeRenderScene, u64), (&NativeRenderScene, u64))> {
        self.static_scene
            .as_ref()
            .zip(self.dynamic_scene.as_ref())
            .map(|(static_scene, dynamic_scene)| {
                (
                    (static_scene, self.static_scene_revision),
                    (dynamic_scene, self.dynamic_scene_revision),
                )
            })
    }

    pub fn static_scene_with_revision(&self) -> Option<(&NativeRenderScene, u64)> {
        self.static_scene
            .as_ref()
            .map(|scene| (scene, self.static_scene_revision))
    }

    #[cfg(test)]
    fn scene_command_count(&self) -> Option<usize> {
        self.scene.as_ref().map(|scene| scene.commands.len())
    }

    fn frame_with_prediction_and_revision(&self) -> Option<(&NativeRenderFrame, f32, u64)> {
        self.frame.as_ref().map(|frame| {
            let prediction_seconds = self
                .received_at
                .map(|received_at| {
                    (Instant::now() - received_at)
                        .as_secs_f32()
                        .clamp(0.0, MAX_PREDICTION_SECONDS)
                })
                .unwrap_or_default();
            (frame, prediction_seconds, self.frame_revision)
        })
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex {
    position: [f32; 2],
    color: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct SpriteVertex {
    position: [f32; 2],
    uv: [f32; 2],
}

struct NativeSpriteAtlas {
    id: &'static str,
    png: &'static [u8],
    width: u32,
    height: u32,
    frames: HashMap<String, SpriteFrame>,
    texture: Option<wgpu::Texture>,
    bind_group: Option<wgpu::BindGroup>,
    vertex_buffer: Option<wgpu::Buffer>,
    vertex_capacity: usize,
    vertices: Vec<SpriteVertex>,
}

impl From<SpriteAtlasDefinition> for NativeSpriteAtlas {
    fn from(definition: SpriteAtlasDefinition) -> Self {
        Self {
            id: definition.id,
            png: definition.png,
            width: definition.width,
            height: definition.height,
            frames: definition.frames,
            texture: None,
            bind_group: None,
            vertex_buffer: None,
            vertex_capacity: 0,
            vertices: Vec::new(),
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct CameraUniform {
    viewport: [f32; 2],
    position: [f32; 2],
    zoom: f32,
    _padding: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct CompositeCameraUniform {
    output_viewport: [f32; 2],
    dynamic_position: [f32; 2],
    dynamic_zoom: f32,
    _padding0: f32,
    static_viewport: [f32; 2],
    static_position: [f32; 2],
    static_zoom: f32,
    _padding1: f32,
}

#[derive(Clone, Copy)]
enum SceneVertexSelection {
    /// Compatibility path for one-piece display lists from older bundles.
    All,
    /// Retained background: screen clear plus camera-relative world geometry.
    Static,
    /// Actors, projectiles, decals and effects layered above the background.
    Dynamic,
    /// Viewport-relative effects that must not inherit the world camera.
    DynamicOverlay,
}

struct DynamicSceneCompileJob {
    revision: u64,
    scene: NativeRenderScene,
}

struct DynamicSceneCompileResult {
    revision: u64,
    vertices: Vec<Vertex>,
    overlay_vertices: Vec<Vertex>,
}

type LatestDynamicScene = Arc<(Mutex<Option<DynamicSceneCompileJob>>, Condvar)>;

#[derive(Clone, Copy)]
struct StaticSceneView {
    viewport: [f32; 2],
    position: [f32; 2],
    zoom: f32,
}

impl From<&NativeRenderScene> for StaticSceneView {
    fn from(scene: &NativeRenderScene) -> Self {
        Self {
            viewport: [scene.viewport.width, scene.viewport.height],
            position: [scene.camera.x, scene.camera.y],
            zoom: scene.camera.zoom,
        }
    }
}

struct StaticSceneCompileJob {
    revision: u64,
    scene: NativeRenderScene,
}

struct StaticSceneCompileResult {
    revision: u64,
    vertices: Vec<Vertex>,
    view: StaticSceneView,
}

type LatestStaticScene = Arc<(Mutex<Option<StaticSceneCompileJob>>, Condvar)>;

fn start_dynamic_scene_compiler(
    text_font: Option<FontArc>,
) -> (LatestDynamicScene, Receiver<DynamicSceneCompileResult>) {
    let pending: LatestDynamicScene = Arc::new((Mutex::new(None), Condvar::new()));
    let worker_pending = Arc::clone(&pending);
    let (result_tx, result_rx) = mpsc::channel();
    thread::Builder::new()
        .name("native-world-scene-compiler".to_owned())
        .spawn(move || {
            loop {
                let job = {
                    let (lock, ready) = &*worker_pending;
                    let mut slot = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                    while slot.is_none() {
                        slot = ready
                            .wait(slot)
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                    }
                    slot.take().expect("scene compiler notified without a job")
                };
                let Some(vertices) = scene_vertices_for(
                    &job.scene,
                    SceneVertexSelection::Dynamic,
                    text_font.as_ref(),
                ) else {
                    continue;
                };
                let Some(overlay_vertices) = scene_vertices_for(
                    &job.scene,
                    SceneVertexSelection::DynamicOverlay,
                    text_font.as_ref(),
                ) else {
                    continue;
                };
                if result_tx
                    .send(DynamicSceneCompileResult {
                        revision: job.revision,
                        vertices,
                        overlay_vertices,
                    })
                    .is_err()
                {
                    break;
                }
            }
        })
        .expect("native dynamic scene compiler thread must start");
    (pending, result_rx)
}

/// Static meshes can contain hundreds of thousands of triangles.  They must
/// not be tessellated on the Winit/WebView thread when a camera cache rolls.
fn start_static_scene_compiler(
    text_font: Option<FontArc>,
) -> (LatestStaticScene, Receiver<StaticSceneCompileResult>) {
    let pending: LatestStaticScene = Arc::new((Mutex::new(None), Condvar::new()));
    let worker_pending = Arc::clone(&pending);
    let (result_tx, result_rx) = mpsc::channel();
    thread::Builder::new()
        .name("native-world-static-compiler".to_owned())
        .spawn(move || {
            loop {
                let job = {
                    let (lock, ready) = &*worker_pending;
                    let mut slot = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                    while slot.is_none() {
                        slot = ready
                            .wait(slot)
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                    }
                    slot.take()
                        .expect("static scene compiler notified without a job")
                };
                let view = StaticSceneView::from(&job.scene);
                let Some(vertices) = scene_vertices_for(
                    &job.scene,
                    SceneVertexSelection::Static,
                    text_font.as_ref(),
                ) else {
                    continue;
                };
                if result_tx
                    .send(StaticSceneCompileResult {
                        revision: job.revision,
                        vertices,
                        view,
                    })
                    .is_err()
                {
                    break;
                }
            }
        })
        .expect("native static scene compiler thread must start");
    (pending, result_rx)
}

pub struct NativeWorldRenderer {
    pipeline: Option<wgpu::RenderPipeline>,
    surface_format: Option<wgpu::TextureFormat>,
    camera_bind_group_layout: Option<wgpu::BindGroupLayout>,
    camera_bind_group: Option<wgpu::BindGroup>,
    camera_buffer: Option<wgpu::Buffer>,
    static_camera_bind_group: Option<wgpu::BindGroup>,
    static_camera_buffer: Option<wgpu::Buffer>,
    static_vertex_buffer: Option<wgpu::Buffer>,
    static_vertex_capacity: usize,
    static_vertices: Vec<Vertex>,
    static_vertices_dirty: bool,
    /// Key for the fully-native static map. Unlike `static_scene_view`, this
    /// path is generated in Rust and never depends on a WebView Canvas
    /// display-list worker.
    native_static_key: Option<(String, u32, u32)>,
    last_static_scene_submitted_revision: Option<u64>,
    last_static_scene_applied_revision: Option<u64>,
    static_scene_view: Option<StaticSceneView>,
    static_texture: Option<wgpu::Texture>,
    static_texture_view: Option<wgpu::TextureView>,
    static_texture_size: [u32; 2],
    static_texture_format: Option<wgpu::TextureFormat>,
    static_texture_dirty: bool,
    composite_pipeline: Option<wgpu::RenderPipeline>,
    composite_bind_group_layout: Option<wgpu::BindGroupLayout>,
    composite_bind_group: Option<wgpu::BindGroup>,
    composite_uniform_buffer: Option<wgpu::Buffer>,
    static_sampler: Option<wgpu::Sampler>,
    sprite_pipeline: Option<wgpu::RenderPipeline>,
    sprite_bind_group_layout: Option<wgpu::BindGroupLayout>,
    sprite_sampler: Option<wgpu::Sampler>,
    sprite_atlases: Vec<NativeSpriteAtlas>,
    vertex_buffer: Option<wgpu::Buffer>,
    vertex_capacity: usize,
    vertices: Vec<Vertex>,
    vertices_dirty: bool,
    overlay_vertex_buffer: Option<wgpu::Buffer>,
    overlay_vertex_capacity: usize,
    overlay_vertices: Vec<Vertex>,
    overlay_vertices_dirty: bool,
    last_scene_revision: Option<u64>,
    last_dynamic_scene_submitted_revision: Option<u64>,
    last_dynamic_scene_applied_revision: Option<u64>,
    latest_dynamic_scene: LatestDynamicScene,
    dynamic_scene_results: Receiver<DynamicSceneCompileResult>,
    latest_static_scene: LatestStaticScene,
    static_scene_results: Receiver<StaticSceneCompileResult>,
    text_font: Option<FontArc>,
    last_presented_at: Option<Instant>,
    metrics_started_at: Instant,
    metrics_frame_count: u32,
    metrics_total_ms: f32,
    static_cache_redraws: u32,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererMetrics {
    pub fps: u32,
    pub frame_ms: f32,
    pub static_cache_redraws: u32,
    pub static_triangles: u32,
    pub dynamic_triangles: u32,
}

/// Canvas uses the user's installed font stack, so the native Windows client
/// does the same instead of shipping an unrelated embedded face. Segoe UI is
/// the first choice because it also covers the glyphs used in the HUD; Arial
/// is a conservative fallback on reduced Windows installations.
fn load_native_text_font() -> Option<FontArc> {
    let fonts = env::var_os("WINDIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"))
        .join("Fonts");
    ["segoeui.ttf", "arial.ttf", "calibri.ttf"]
        .into_iter()
        .find_map(|name| {
            fs::read(fonts.join(name))
                .ok()
                .and_then(|bytes| FontArc::try_from_vec(bytes).ok())
        })
}

impl Default for NativeWorldRenderer {
    fn default() -> Self {
        let text_font = load_native_text_font();
        let (latest_dynamic_scene, dynamic_scene_results) =
            start_dynamic_scene_compiler(text_font.clone());
        let (latest_static_scene, static_scene_results) =
            start_static_scene_compiler(text_font.clone());
        Self {
            pipeline: None,
            surface_format: None,
            camera_bind_group_layout: None,
            camera_bind_group: None,
            camera_buffer: None,
            static_camera_bind_group: None,
            static_camera_buffer: None,
            static_vertex_buffer: None,
            static_vertex_capacity: 0,
            static_vertices: Vec::new(),
            static_vertices_dirty: false,
            native_static_key: None,
            last_static_scene_submitted_revision: None,
            last_static_scene_applied_revision: None,
            static_scene_view: None,
            static_texture: None,
            static_texture_view: None,
            static_texture_size: [0, 0],
            static_texture_format: None,
            static_texture_dirty: false,
            composite_pipeline: None,
            composite_bind_group_layout: None,
            composite_bind_group: None,
            composite_uniform_buffer: None,
            static_sampler: None,
            sprite_pipeline: None,
            sprite_bind_group_layout: None,
            sprite_sampler: None,
            sprite_atlases: native_sprites::load_definitions()
                .into_iter()
                .map(NativeSpriteAtlas::from)
                .collect(),
            vertex_buffer: None,
            vertex_capacity: 0,
            vertices: Vec::new(),
            vertices_dirty: false,
            overlay_vertex_buffer: None,
            overlay_vertex_capacity: 0,
            overlay_vertices: Vec::new(),
            overlay_vertices_dirty: false,
            last_scene_revision: None,
            last_dynamic_scene_submitted_revision: None,
            last_dynamic_scene_applied_revision: None,
            latest_dynamic_scene,
            dynamic_scene_results,
            latest_static_scene,
            static_scene_results,
            text_font,
            last_presented_at: None,
            metrics_started_at: Instant::now(),
            metrics_frame_count: 0,
            metrics_total_ms: 0.0,
            static_cache_redraws: 0,
        }
    }
}

fn scene_vertices_for(
    scene: &NativeRenderScene,
    selection: SceneVertexSelection,
    text_font: Option<&FontArc>,
) -> Option<Vec<Vertex>> {
    let tessellation = scene_executor::tessellate(scene, text_font);
    if tessellation.truncated {
        eprintln!("native scene rejected because tessellation reached its triangle limit");
        return None;
    }
    // A visual effect can use an unimplemented Canvas operation while the
    // actors in the same display list are entirely supported. Dropping the
    // whole scene made monsters disappear whenever that happened; retain all
    // triangles we can faithfully execute and omit only the unsupported call.
    let mut vertices = Vec::with_capacity(tessellation.triangles.len() * 3);
    for triangle in tessellation.triangles {
        let include = match selection {
            SceneVertexSelection::All => true,
            SceneVertexSelection::Static => triangle.layer != scene_executor::SceneLayer::Dynamic,
            SceneVertexSelection::Dynamic => triangle.layer == scene_executor::SceneLayer::Dynamic,
            SceneVertexSelection::DynamicOverlay => {
                triangle.layer == scene_executor::SceneLayer::Screen
            }
        };
        if !include {
            continue;
        }
        let is_world_space = matches!(selection, SceneVertexSelection::Static)
            && triangle.layer == scene_executor::SceneLayer::Static
            || matches!(selection, SceneVertexSelection::Dynamic)
                && triangle.layer == scene_executor::SceneLayer::Dynamic;
        for index in 0..3 {
            let position = if is_world_space {
                [
                    scene.camera.x
                        + (triangle.positions[index][0] - scene.viewport.width * 0.5)
                            / scene.camera.zoom,
                    scene.camera.y
                        + (triangle.positions[index][1] - scene.viewport.height * 0.5)
                            / scene.camera.zoom,
                ]
            } else {
                [
                    triangle.positions[index][0] / scene.viewport.width * 2.0 - 1.0,
                    1.0 - triangle.positions[index][1] / scene.viewport.height * 2.0,
                ]
            };
            let mut color = triangle.colors[index];
            if is_world_space {
                color[3] = -color[3].max(f32::EPSILON);
            }
            vertices.push(Vertex { position, color });
        }
    }
    Some(vertices)
}

impl NativeWorldRenderer {
    /// Returns a half-second rolling sample for the native WGPU presentation
    /// loop. This must not reuse `requestAnimationFrame` metrics from the
    /// WebView: WebView2 can be throttled while the native surface is smooth.
    pub fn record_presentation(&mut self) -> Option<NativeRendererMetrics> {
        let now = Instant::now();
        if let Some(previous) = self.last_presented_at.replace(now) {
            self.metrics_total_ms += (now - previous).as_secs_f32() * 1_000.0;
            self.metrics_frame_count = self.metrics_frame_count.saturating_add(1);
        }

        let elapsed = now - self.metrics_started_at;
        if elapsed < std::time::Duration::from_millis(500) || self.metrics_frame_count == 0 {
            return None;
        }

        let metrics = NativeRendererMetrics {
            fps: (self.metrics_frame_count as f32 / elapsed.as_secs_f32()).round() as u32,
            frame_ms: self.metrics_total_ms / self.metrics_frame_count as f32,
            static_cache_redraws: self.static_cache_redraws,
            static_triangles: (self.static_vertices.len() / 3) as u32,
            dynamic_triangles: ((self.vertices.len() + self.overlay_vertices.len()) / 3) as u32,
        };
        self.metrics_started_at = now;
        self.metrics_frame_count = 0;
        self.metrics_total_ms = 0.0;
        self.static_cache_redraws = 0;
        Some(metrics)
    }

    /// Returns true only after the frame reached the native surface. The
    /// WebView uses this acknowledgement to hide its Canvas fallback safely.
    pub fn render(&mut self, frame: &mut RenderFrame<'_>, state: &NativeWorldState) -> bool {
        let mut retained_scene = None;
        let frame_scene: NativeRenderScene;
        let mut rendering_retained_scene = false;
        let rendered_scene = if let (
            Some((static_scene, static_revision)),
            Some((world, prediction_seconds, _frame_revision)),
        ) = (
            state.static_scene_with_revision(),
            state.frame_with_prediction_and_revision(),
        ) {
            // Static display-list + camera frame. Sprite atlas actors are
            // retained by WGPU, so rebuild their tiny dynamic vertex buffers
            // on every presentation. The WebView only sends position updates
            // at rAF cadence; deriving prediction here lets native frames
            // continue moving smoothly between those bridge messages.
            if self.last_static_scene_submitted_revision != Some(static_revision) {
                self.submit_static_scene(static_revision, static_scene.clone());
                self.last_static_scene_submitted_revision = Some(static_revision);
            }
            self.build_dynamic_frame_vertices(world, prediction_seconds);
            self.vertices_dirty = true;
            frame_scene = NativeRenderScene {
                version: 1,
                viewport: NativeSceneViewport {
                    width: world.viewport_width,
                    height: world.viewport_height,
                },
                camera: NativeSceneCamera {
                    x: world.camera_x,
                    y: world.camera_y,
                    zoom: world.zoom,
                },
                time_seconds: world.time_seconds,
                commands: Vec::new(),
            };
            retained_scene = Some(&frame_scene);
            rendering_retained_scene = true;
            true
        } else if let Some((scene, revision)) = state.scene_with_revision() {
            if self.last_scene_revision != Some(revision) {
                let Some(vertices) = self.scene_vertices(scene, SceneVertexSelection::All) else {
                    return false;
                };
                self.vertices = vertices;
                self.last_scene_revision = Some(revision);
                self.vertices_dirty = true;
            }
            true
        } else if let Some((world, prediction_seconds, _)) =
            state.frame_with_prediction_and_revision()
        {
            // Native-only world path: build the authored base map once in
            // Rust, then submit only mutable entities every presentation.
            // This replaces the old TS OffscreenCanvas scene compiler.
            let static_key = (
                world.theme.clone(),
                world.viewport_width.max(1.0).round() as u32,
                world.viewport_height.max(1.0).round() as u32,
            );
            if self.native_static_key.as_ref() != Some(&static_key) {
                self.rebuild_native_static_world(world);
                self.native_static_key = Some(static_key);
            }
            self.build_dynamic_frame_vertices(world, prediction_seconds);
            self.vertices_dirty = true;
            self.last_scene_revision = None;
            frame_scene = NativeRenderScene {
                version: 1,
                viewport: NativeSceneViewport {
                    width: world.viewport_width,
                    height: world.viewport_height,
                },
                camera: NativeSceneCamera {
                    x: world.camera_x,
                    y: world.camera_y,
                    zoom: world.zoom,
                },
                time_seconds: world.time_seconds,
                commands: Vec::new(),
            };
            retained_scene = Some(&frame_scene);
            true
        } else {
            false
        };
        self.drain_static_scene_results();
        self.drain_dynamic_scene_results();
        if !rendered_scene {
            return false;
        }
        // Keep the Canvas fallback visible until the first static cache is
        // compiled. Subsequent cache revisions preserve the previous texture
        // until their replacement is ready.
        if rendering_retained_scene && self.static_scene_view.is_none() {
            return false;
        }
        if self.vertices.is_empty()
            && self.static_vertices.is_empty()
            && self
                .sprite_atlases
                .iter()
                .all(|atlas| atlas.vertices.is_empty())
        {
            return false;
        }
        self.ensure_pipeline(frame);
        self.ensure_sprite_pipeline(frame);
        self.ensure_sprite_atlas_textures(frame);
        let static_scene_view = self.static_scene_view;
        if let Some(static_view) = static_scene_view {
            self.ensure_static_cache(frame, static_view);
        }
        if let Some(scene) = retained_scene {
            self.write_camera(frame, scene);
        }
        if self.static_vertices_dirty {
            self.upload_static_vertices(frame);
            self.static_vertices_dirty = false;
        }
        if self.vertices_dirty {
            self.upload_vertices(frame);
            self.vertices_dirty = false;
        }
        if self.overlay_vertices_dirty {
            self.upload_overlay_vertices(frame);
            self.overlay_vertices_dirty = false;
        }
        self.upload_sprite_vertices(frame);
        let static_vertex_count = self.static_vertices.len() as u32;
        let dynamic_vertex_count = self.vertices.len() as u32;
        let overlay_vertex_count = self.overlay_vertices.len() as u32;
        let static_cached = if let Some(static_view) = static_scene_view {
            self.rasterize_static_cache(frame, static_view, static_vertex_count)
        } else {
            false
        };
        // Tile-based/integrated GPUs pay a full render-target load/store for
        // every surface pass. The old path composited the retained texture,
        // dynamic world and screen overlay in three separate passes; that can
        // collapse presentation FPS even while the scene bridge is idle.
        // Prepare the composite uniform once, then issue all visible layers in
        // a single surface pass.
        let static_composite_ready = static_cached
            && self.prepare_static_composite(
                frame,
                retained_scene.expect("retained scene is present"),
                static_scene_view.expect("compiled static scene is present"),
            );
        let (Some(pipeline), Some(camera_bind_group)) = (&self.pipeline, &self.camera_bind_group)
        else {
            return false;
        };
        let composite = if static_composite_ready {
            self.composite_pipeline
                .as_ref()
                .zip(self.composite_bind_group.as_ref())
        } else {
            None
        };
        let static_vertex_buffer = self.static_vertex_buffer.as_ref();
        let dynamic_vertex_buffer = self.vertex_buffer.as_ref();
        let overlay_vertex_buffer = self.overlay_vertex_buffer.as_ref();
        let sprite_pipeline = self.sprite_pipeline.as_ref();
        let sprite_atlases = &self.sprite_atlases;
        frame.with_surface_pass(wgpu::LoadOp::Load, |pass| {
            if let Some((composite_pipeline, composite_bind_group)) = composite {
                pass.set_pipeline(composite_pipeline);
                pass.set_bind_group(0, composite_bind_group, &[]);
                pass.draw(0..6, 0..1);
            } else if static_vertex_count > 0 {
                pass.set_pipeline(pipeline);
                pass.set_bind_group(0, camera_bind_group, &[]);
                if let Some(static_vertex_buffer) = static_vertex_buffer {
                    pass.set_vertex_buffer(0, static_vertex_buffer.slice(..));
                    pass.draw(0..static_vertex_count, 0..1);
                }
            }
            if dynamic_vertex_count > 0 {
                pass.set_pipeline(pipeline);
                pass.set_bind_group(0, camera_bind_group, &[]);
                if let Some(dynamic_vertex_buffer) = dynamic_vertex_buffer {
                    pass.set_vertex_buffer(0, dynamic_vertex_buffer.slice(..));
                    pass.draw(0..dynamic_vertex_count, 0..1);
                }
            }
            if let Some(sprite_pipeline) = sprite_pipeline {
                pass.set_pipeline(sprite_pipeline);
                for atlas in sprite_atlases {
                    let vertex_count = atlas.vertices.len() as u32;
                    let (Some(bind_group), Some(vertex_buffer)) =
                        (&atlas.bind_group, &atlas.vertex_buffer)
                    else {
                        continue;
                    };
                    if vertex_count == 0 {
                        continue;
                    }
                    pass.set_bind_group(0, bind_group, &[]);
                    pass.set_vertex_buffer(0, vertex_buffer.slice(..));
                    pass.draw(0..vertex_count, 0..1);
                }
            }
            if overlay_vertex_count > 0 {
                pass.set_pipeline(pipeline);
                pass.set_bind_group(0, camera_bind_group, &[]);
                if let Some(overlay_vertex_buffer) = overlay_vertex_buffer {
                    pass.set_vertex_buffer(0, overlay_vertex_buffer.slice(..));
                    pass.draw(0..overlay_vertex_count, 0..1);
                }
            }
        });
        true
    }

    fn ensure_pipeline(&mut self, frame: &RenderFrame<'_>) {
        let format = frame.surface_format();
        if self.pipeline.is_some() && self.surface_format == Some(format) {
            return;
        }
        // A surface format change invalidates both the retained texture and
        // its sampling pipeline. Rebuild them lazily on the next static pass.
        self.static_texture = None;
        self.static_texture_view = None;
        self.static_texture_size = [0, 0];
        self.static_texture_format = None;
        self.static_texture_dirty = true;
        self.composite_pipeline = None;
        self.composite_bind_group_layout = None;
        self.composite_bind_group = None;
        self.composite_uniform_buffer = None;
        self.static_sampler = None;
        self.sprite_pipeline = None;
        self.sprite_bind_group_layout = None;
        self.sprite_sampler = None;
        for atlas in &mut self.sprite_atlases {
            atlas.texture = None;
            atlas.bind_group = None;
        }
        let device = frame.device();
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("chibimadness native world shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(WORLD_SHADER)),
        });
        let camera_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("chibimadness native world camera layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        use wgpu::util::DeviceExt;
        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("chibimadness native world camera"),
            contents: bytemuck::bytes_of(&CameraUniform {
                viewport: [1.0, 1.0],
                position: [0.0, 0.0],
                zoom: 1.0,
                _padding: [0.0; 3],
            }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("chibimadness native world camera bind group"),
            layout: &camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_buffer.as_entire_binding(),
            }],
        });
        let static_camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("chibimadness retained static camera"),
            contents: bytemuck::bytes_of(&CameraUniform {
                viewport: [1.0, 1.0],
                position: [0.0, 0.0],
                zoom: 1.0,
                _padding: [0.0; 3],
            }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let static_camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("chibimadness retained static camera bind group"),
            layout: &camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: static_camera_buffer.as_entire_binding(),
            }],
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("chibimadness native world layout"),
            bind_group_layouts: &[Some(&camera_bind_group_layout)],
            immediate_size: 0,
        });
        let attributes = wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x4];
        self.pipeline = Some(
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("chibimadness native world pipeline"),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    buffers: &[Some(wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<Vertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &attributes,
                    })],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("fs_main"),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
                    strip_index_format: None,
                    front_face: wgpu::FrontFace::Ccw,
                    cull_mode: None,
                    unclipped_depth: false,
                    polygon_mode: wgpu::PolygonMode::Fill,
                    conservative: false,
                },
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            }),
        );
        self.camera_bind_group_layout = Some(camera_bind_group_layout);
        self.camera_bind_group = Some(camera_bind_group);
        self.camera_buffer = Some(camera_buffer);
        self.static_camera_bind_group = Some(static_camera_bind_group);
        self.static_camera_buffer = Some(static_camera_buffer);
        self.surface_format = Some(format);
    }

    fn write_camera(&self, frame: &RenderFrame<'_>, scene: &NativeRenderScene) {
        let Some(buffer) = &self.camera_buffer else {
            return;
        };
        frame.queue().write_buffer(
            buffer,
            0,
            bytemuck::bytes_of(&CameraUniform {
                viewport: [scene.viewport.width, scene.viewport.height],
                position: [scene.camera.x, scene.camera.y],
                zoom: scene.camera.zoom,
                _padding: [0.0; 3],
            }),
        );
    }

    fn write_static_camera(&self, frame: &RenderFrame<'_>, view: StaticSceneView) {
        let Some(buffer) = &self.static_camera_buffer else {
            return;
        };
        frame.queue().write_buffer(
            buffer,
            0,
            bytemuck::bytes_of(&CameraUniform {
                viewport: view.viewport,
                position: view.position,
                zoom: view.zoom,
                _padding: [0.0; 3],
            }),
        );
    }

    /// Replaces queued work instead of building an unbounded backlog when the
    /// simulation publishes another state while tessellation is in flight.
    fn submit_dynamic_scene(&self, revision: u64, scene: NativeRenderScene) {
        let (lock, ready) = &*self.latest_dynamic_scene;
        let mut slot = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *slot = Some(DynamicSceneCompileJob { revision, scene });
        ready.notify_one();
    }

    /// Static compilation uses the same latest-only hand-off as dynamic
    /// geometry. A camera crossing can never queue a chain of expensive cache
    /// rebuilds behind the currently visible world.
    fn submit_static_scene(&self, revision: u64, scene: NativeRenderScene) {
        let (lock, ready) = &*self.latest_static_scene;
        let mut slot = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *slot = Some(StaticSceneCompileJob { revision, scene });
        ready.notify_one();
    }

    fn drain_static_scene_results(&mut self) {
        loop {
            match self.static_scene_results.try_recv() {
                Ok(result) => {
                    if self
                        .last_static_scene_applied_revision
                        .is_none_or(|revision| result.revision > revision)
                    {
                        self.static_vertices = result.vertices;
                        self.static_vertices_dirty = true;
                        self.static_texture_dirty = true;
                        self.static_scene_view = Some(result.view);
                        self.last_static_scene_applied_revision = Some(result.revision);
                    }
                }
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => return,
            }
        }
    }

    /// The WGPU/UI thread never tessellates a combat-rate display list. It
    /// uploads only completed vertex buffers and keeps presenting the previous
    /// valid dynamic scene while a newer one is being compiled in background.
    fn drain_dynamic_scene_results(&mut self) {
        loop {
            match self.dynamic_scene_results.try_recv() {
                Ok(result) => {
                    if self
                        .last_dynamic_scene_applied_revision
                        .is_none_or(|revision| result.revision > revision)
                    {
                        self.vertices = result.vertices;
                        self.vertices_dirty = true;
                        self.overlay_vertices = result.overlay_vertices;
                        self.overlay_vertices_dirty = true;
                        self.last_dynamic_scene_applied_revision = Some(result.revision);
                    }
                }
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => return,
            }
        }
    }

    fn ensure_static_cache(&mut self, frame: &RenderFrame<'_>, static_view: StaticSceneView) {
        let size = [
            static_view.viewport[0].max(1.0).ceil() as u32,
            static_view.viewport[1].max(1.0).ceil() as u32,
        ];
        let format = frame.surface_format();
        if self.static_texture_view.is_some()
            && self.static_texture_size == size
            && self.static_texture_format == Some(format)
        {
            return;
        }

        let texture = frame.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("chibimadness retained static world texture"),
            size: wgpu::Extent3d {
                width: size[0],
                height: size[1],
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        self.static_texture_view =
            Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
        self.static_texture = Some(texture);
        self.static_texture_size = size;
        self.static_texture_format = Some(format);
        self.static_texture_dirty = true;
        self.composite_bind_group = None;
    }

    fn rasterize_static_cache(
        &mut self,
        frame: &mut RenderFrame<'_>,
        static_view: StaticSceneView,
        vertex_count: u32,
    ) -> bool {
        let (Some(view), Some(pipeline), Some(camera_bind_group), Some(vertex_buffer)) = (
            &self.static_texture_view,
            &self.pipeline,
            &self.static_camera_bind_group,
            &self.static_vertex_buffer,
        ) else {
            return false;
        };
        if self.static_texture_dirty {
            self.write_static_camera(frame, static_view);
            frame.with_color_only_pass(
                view,
                wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                |pass| {
                    pass.set_pipeline(pipeline);
                    pass.set_bind_group(0, camera_bind_group, &[]);
                    pass.set_vertex_buffer(0, vertex_buffer.slice(..));
                    pass.draw(0..vertex_count, 0..1);
                },
            );
            self.static_texture_dirty = false;
            self.static_cache_redraws = self.static_cache_redraws.saturating_add(1);
        }
        true
    }

    fn ensure_composite_pipeline(&mut self, frame: &RenderFrame<'_>) -> bool {
        if self.composite_pipeline.is_some() && self.composite_bind_group.is_some() {
            return true;
        }
        let (Some(view), Some(format)) = (&self.static_texture_view, self.static_texture_format)
        else {
            return false;
        };
        use wgpu::util::DeviceExt;
        let device = frame.device();
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("chibimadness retained world composite layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("chibimadness retained world composite camera"),
            contents: bytemuck::bytes_of(&CompositeCameraUniform::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("chibimadness retained world sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("chibimadness retained world composite bind group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("chibimadness retained world composite shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(STATIC_COMPOSITE_SHADER)),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("chibimadness retained world composite pipeline layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });
        self.composite_pipeline = Some(device.create_render_pipeline(
            &wgpu::RenderPipelineDescriptor {
                label: Some("chibimadness retained world composite pipeline"),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    buffers: &[],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("fs_main"),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(wgpu::BlendState::REPLACE),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState::default(),
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            },
        ));
        self.composite_bind_group_layout = Some(bind_group_layout);
        self.composite_bind_group = Some(bind_group);
        self.composite_uniform_buffer = Some(uniform_buffer);
        self.static_sampler = Some(sampler);
        true
    }

    fn prepare_static_composite(
        &mut self,
        frame: &mut RenderFrame<'_>,
        dynamic_scene: &NativeRenderScene,
        static_view: StaticSceneView,
    ) -> bool {
        if !self.ensure_composite_pipeline(frame) {
            return false;
        }
        let (Some(buffer), Some(pipeline), Some(bind_group)) = (
            &self.composite_uniform_buffer,
            &self.composite_pipeline,
            &self.composite_bind_group,
        ) else {
            return false;
        };
        frame.queue().write_buffer(
            buffer,
            0,
            bytemuck::bytes_of(&CompositeCameraUniform {
                output_viewport: [dynamic_scene.viewport.width, dynamic_scene.viewport.height],
                dynamic_position: [dynamic_scene.camera.x, dynamic_scene.camera.y],
                dynamic_zoom: dynamic_scene.camera.zoom,
                _padding0: 0.0,
                static_viewport: static_view.viewport,
                static_position: static_view.position,
                static_zoom: static_view.zoom,
                _padding1: 0.0,
            }),
        );
        // Pipeline/bind group are checked above. Keeping the bindings live in
        // this method documents the exact precondition for the caller's single
        // presentation pass without re-borrowing the renderer there.
        let _ = (pipeline, bind_group);
        true
    }

    fn ensure_sprite_pipeline(&mut self, frame: &RenderFrame<'_>) {
        if self.sprite_pipeline.is_some() && self.sprite_bind_group_layout.is_some() {
            return;
        }
        let device = frame.device();
        let format = frame.surface_format();
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("chibimadness native sprite atlas layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("chibimadness native sprite atlas sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("chibimadness native sprite atlas shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(SPRITE_SHADER)),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("chibimadness native sprite atlas pipeline layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });
        let attributes = [
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x2,
                offset: 0,
                shader_location: 0,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x2,
                offset: std::mem::size_of::<[f32; 2]>() as u64,
                shader_location: 1,
            },
        ];
        self.sprite_pipeline = Some(device.create_render_pipeline(
            &wgpu::RenderPipelineDescriptor {
                label: Some("chibimadness native sprite atlas pipeline"),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    buffers: &[Some(wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<SpriteVertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &attributes,
                    })],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("fs_main"),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState::default(),
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            },
        ));
        self.sprite_bind_group_layout = Some(bind_group_layout);
        self.sprite_sampler = Some(sampler);
    }

    fn ensure_sprite_atlas_textures(&mut self, frame: &RenderFrame<'_>) {
        let (Some(layout), Some(sampler)) = (
            self.sprite_bind_group_layout.as_ref(),
            self.sprite_sampler.as_ref(),
        ) else {
            return;
        };
        let device = frame.device();
        let queue = frame.queue();
        for atlas in &mut self.sprite_atlases {
            if atlas.bind_group.is_some() {
                continue;
            }
            let Ok(decoded) = image::load_from_memory(atlas.png) else {
                continue;
            };
            let rgba = decoded.to_rgba8();
            if rgba.width() != atlas.width || rgba.height() != atlas.height {
                continue;
            }
            let row_bytes = atlas.width.saturating_mul(4) as usize;
            let padded_row_bytes = (row_bytes + 255) & !255;
            let mut upload = vec![0; padded_row_bytes * atlas.height as usize];
            for (row, source) in rgba.as_raw().chunks_exact(row_bytes).enumerate() {
                let start = row * padded_row_bytes;
                upload[start..start + row_bytes].copy_from_slice(source);
            }
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("chibimadness generated sprite atlas"),
                size: wgpu::Extent3d {
                    width: atlas.width,
                    height: atlas.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8UnormSrgb,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &upload,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_row_bytes as u32),
                    rows_per_image: Some(atlas.height),
                },
                wgpu::Extent3d {
                    width: atlas.width,
                    height: atlas.height,
                    depth_or_array_layers: 1,
                },
            );
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            atlas.bind_group = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("chibimadness native sprite atlas bindings"),
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(sampler),
                    },
                ],
            }));
            atlas.texture = Some(texture);
        }
    }

    fn upload_sprite_vertices(&mut self, frame: &RenderFrame<'_>) {
        use wgpu::util::DeviceExt;

        for atlas in &mut self.sprite_atlases {
            let bytes = bytemuck::cast_slice(&atlas.vertices);
            if bytes.is_empty() {
                continue;
            }
            if atlas.vertex_capacity < bytes.len() {
                atlas.vertex_buffer = Some(frame.device().create_buffer_init(
                    &wgpu::util::BufferInitDescriptor {
                        label: Some("chibimadness native sprite vertices"),
                        contents: bytes,
                        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                    },
                ));
                atlas.vertex_capacity = bytes.len();
            } else if let Some(buffer) = &atlas.vertex_buffer {
                frame.queue().write_buffer(buffer, 0, bytes);
            }
        }
    }

    fn upload_vertices(&mut self, frame: &RenderFrame<'_>) {
        use wgpu::util::DeviceExt;

        let bytes = bytemuck::cast_slice(&self.vertices);
        if bytes.is_empty() {
            return;
        }
        if self.vertex_capacity < bytes.len() {
            self.vertex_buffer = Some(frame.device().create_buffer_init(
                &wgpu::util::BufferInitDescriptor {
                    label: Some("chibimadness native world vertices"),
                    contents: bytes,
                    usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                },
            ));
            self.vertex_capacity = bytes.len();
        } else if let Some(buffer) = &self.vertex_buffer {
            frame.queue().write_buffer(buffer, 0, bytes);
        }
    }

    fn upload_overlay_vertices(&mut self, frame: &RenderFrame<'_>) {
        use wgpu::util::DeviceExt;

        let bytes = bytemuck::cast_slice(&self.overlay_vertices);
        if bytes.is_empty() {
            return;
        }
        if self.overlay_vertex_capacity < bytes.len() {
            self.overlay_vertex_buffer = Some(frame.device().create_buffer_init(
                &wgpu::util::BufferInitDescriptor {
                    label: Some("chibimadness native world screen overlays"),
                    contents: bytes,
                    usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                },
            ));
            self.overlay_vertex_capacity = bytes.len();
        } else if let Some(buffer) = &self.overlay_vertex_buffer {
            frame.queue().write_buffer(buffer, 0, bytes);
        }
    }

    fn upload_static_vertices(&mut self, frame: &RenderFrame<'_>) {
        use wgpu::util::DeviceExt;

        let bytes = bytemuck::cast_slice(&self.static_vertices);
        if self.static_vertex_capacity < bytes.len() {
            self.static_vertex_buffer = Some(frame.device().create_buffer_init(
                &wgpu::util::BufferInitDescriptor {
                    label: Some("chibimadness retained static world vertices"),
                    contents: bytes,
                    usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                },
            ));
            self.static_vertex_capacity = bytes.len();
        } else if let Some(buffer) = &self.static_vertex_buffer {
            frame.queue().write_buffer(buffer, 0, bytes);
        }
    }

    fn rebuild_native_static_world(&mut self, world: &NativeRenderFrame) {
        self.vertices.clear();
        self.add_source_world(world);
        // `add_source_world` predates retained rendering and emits camera-baked
        // NDC positions. Keeping those in the cache freezes terrain under the
        // player while dynamic actors still follow the live camera. Convert
        // its world primitives back once and mark them for WORLD_SHADER's
        // GPU camera branch (negative alpha is the compact vertex marker).
        // The first quad is the viewport clear and intentionally remains in
        // screen space.
        for vertex in self.vertices.iter_mut().skip(6) {
            let screen_x = (vertex.position[0] + 1.0) * 0.5 * world.viewport_width;
            let screen_y = (1.0 - vertex.position[1]) * 0.5 * world.viewport_height;
            vertex.position = [
                (screen_x - world.viewport_width * 0.5) / world.zoom + world.camera_x,
                (screen_y - world.viewport_height * 0.5) / world.zoom + world.camera_y,
            ];
            vertex.color[3] = -vertex.color[3].max(f32::MIN_POSITIVE);
        }
        self.static_vertices = std::mem::take(&mut self.vertices);
        self.static_vertices_dirty = true;
    }

    fn build_dynamic_frame_vertices(&mut self, world: &NativeRenderFrame, prediction_seconds: f32) {
        self.vertices.clear();
        self.overlay_vertices.clear();
        self.clear_sprite_vertices();
        for entity in &world.entities {
            let x = entity.x + entity.velocity_x * prediction_seconds;
            let y = entity.y + entity.velocity_y * prediction_seconds;
            self.add_entity(entity, x, y, world);
        }
        self.overlay_vertices_dirty = true;
    }

    fn scene_vertices(
        &self,
        scene: &NativeRenderScene,
        selection: SceneVertexSelection,
    ) -> Option<Vec<Vertex>> {
        scene_vertices_for(scene, selection, self.text_font.as_ref())
    }

    fn clear_sprite_vertices(&mut self) {
        for atlas in &mut self.sprite_atlases {
            atlas.vertices.clear();
        }
    }

    /// Faithful fixed-layout base layer mirrored from `worldRenderer.ts`.
    ///
    /// The former native renderer generated an unrelated infinite city grid.
    /// That made a fast frame, but it was not ChibiMadness. This layer keeps
    /// the canonical world coordinates, district boundaries and landmarks so
    /// camera movement exposes the same geography as the Canvas renderer.
    fn add_source_world(&mut self, world: &NativeRenderFrame) {
        let outside_world = if world.theme == "horde_crucible" {
            hex("#05070C")
        } else {
            [0.008, 0.012, 0.028, 1.0]
        };
        self.add_screen_quad(
            [0.0, 0.0],
            [world.viewport_width, world.viewport_height],
            outside_world,
            world,
        );
        if world.theme == "horde_crucible" {
            self.add_source_horde_floor(world);
            return;
        }
        self.add_world_rect(
            SOURCE_WORLD_WIDTH * 0.5,
            SOURCE_WORLD_HEIGHT * 0.5,
            SOURCE_WORLD_WIDTH,
            SOURCE_WORLD_HEIGHT,
            hex("#162C1E"),
            world,
        );

        // Source terrain regions (worldRenderer.ts/drawTerrain).
        self.add_world_rect(1_000.0, 800.0, 2_000.0, 1_600.0, hex("#162C1E"), world);
        self.add_world_rect(1_300.0, 2_350.0, 2_600.0, 1_600.0, hex("#0E1F14"), world);
        self.add_world_rect(3_550.0, 800.0, 3_500.0, 1_600.0, hex("#261F1A"), world);
        self.add_world_rect(3_950.0, 2_350.0, 2_700.0, 1_500.0, hex("#1A1820"), world);
        self.add_world_rect(1_250.0, 3_750.0, 2_500.0, 1_300.0, hex("#0B132B"), world);
        self.add_world_rect(3_950.0, 3_750.0, 2_900.0, 1_300.0, hex("#141115"), world);

        // Survivor campsite clearing and paths.
        self.add_world_ellipse(680.0, 650.0, 480.0, 340.0, hex("#30261A"), 30, world);
        self.add_world_ellipse(
            680.0,
            650.0,
            495.0,
            355.0,
            [0.153, 0.122, 0.082, 1.0],
            30,
            world,
        );
        self.add_world_ellipse(680.0, 650.0, 482.0, 342.0, hex("#30261A"), 30, world);
        self.add_world_line(350.0, 750.0, 680.0, 650.0, 42.0, hex("#3F3223"), world);
        self.add_world_line(680.0, 650.0, 1_000.0, 750.0, 42.0, hex("#3F3223"), world);
        self.add_world_line(680.0, 480.0, 680.0, 850.0, 42.0, hex("#3F3223"), world);
        self.add_world_line(1_100.0, 700.0, 2_400.0, 800.0, 55.0, hex("#383025"), world);

        // Forest river, banks and the six stepping stones in their original
        // positions. Segments intentionally use the same wide-stroke style.
        let river = [
            (0.0, 1_950.0),
            (550.0, 2_050.0),
            (950.0, 2_150.0),
            (1_450.0, 2_250.0),
            (1_900.0, 2_600.0),
            (2_250.0, 2_850.0),
            (2_600.0, 3_100.0),
        ];
        for edge in river.windows(2) {
            self.add_world_line(
                edge[0].0,
                edge[0].1,
                edge[1].0,
                edge[1].1,
                110.0,
                hex("#2B3B28"),
                world,
            );
        }
        for edge in river.windows(2) {
            self.add_world_line(
                edge[0].0,
                edge[0].1,
                edge[1].0,
                edge[1].1,
                75.0,
                hex("#0EA5E9"),
                world,
            );
        }
        for (x, y, r) in [
            (920.0, 2_130.0, 16.0),
            (950.0, 2_150.0, 18.0),
            (980.0, 2_170.0, 15.0),
            (1_870.0, 2_580.0, 16.0),
            (1_900.0, 2_605.0, 18.0),
            (1_930.0, 2_630.0, 15.0),
        ] {
            self.add_world_ellipse(x, y + 6.0, r, r * 0.55, [0.0, 0.0, 0.0, 0.35], 12, world);
            self.add_world_circle(x, y, r, hex("#475569"), 12, world);
            self.add_world_circle(x, y - r * 0.3, r * 0.45, hex("#15803D"), 10, world);
        }

        // Canyon, summit and their canonical platforms.
        self.add_world_rect(3_550.0, 800.0, 3_300.0, 640.0, hex("#3D2F24"), world);
        self.add_world_rect(3_725.0, 2_400.0, 1_750.0, 1_200.0, hex("#2A2430"), world);
        self.add_world_rect(
            3_725.0,
            1_800.0,
            1_550.0,
            1_020.0,
            [0.918, 0.345, 0.047, 0.10],
            world,
        );
        self.add_world_rect(2_280.0, 120.0, 1_550.0, 360.0, hex("#6B3A2A"), world);
        self.add_world_rect(2_280.0, 1_080.0, 1_600.0, 460.0, hex("#6B3A2A"), world);
        self.add_world_rect(2_680.0, 490.0, 130.0, 600.0, hex("#6E4B2D"), world);
        self.add_world_rect(3_420.0, 490.0, 130.0, 600.0, hex("#6E4B2D"), world);

        // Police precinct, central frontline and the punk territory follow
        // the source positions instead of the old repeating city blocks.
        self.add_world_rect(1_300.0, 3_205.0, 2_100.0, 50.0, hex("#1E293B"), world);
        self.add_world_rect(1_300.0, 3_745.0, 2_100.0, 50.0, hex("#1E293B"), world);
        self.add_world_rect(
            1_405.0,
            3_725.0,
            2_050.0,
            1_050.0,
            [0.22, 0.74, 0.97, 0.16],
            world,
        );
        self.add_world_ellipse(
            1_200.0,
            3_750.0,
            110.0,
            110.0,
            [0.22, 0.74, 0.97, 0.10],
            24,
            world,
        );
        self.add_world_rect(2_550.0, 3_750.0, 800.0, 1_300.0, hex("#09090B"), world);
        self.add_world_rect(2_545.0, 3_750.0, 4.0, 1_300.0, hex("#EAB308"), world);
        self.add_world_rect(2_555.0, 3_750.0, 4.0, 1_300.0, hex("#EAB308"), world);
        self.add_world_rect(3_750.0, 3_205.0, 2_300.0, 48.0, hex("#1C1917"), world);
        self.add_world_rect(3_750.0, 3_745.0, 2_300.0, 48.0, hex("#1C1917"), world);
        self.add_world_rect(
            3_900.0,
            3_725.0,
            2_600.0,
            1_050.0,
            [0.94, 0.27, 0.27, 0.12],
            world,
        );

        for x in (2_170..=2_930).step_by(74) {
            self.add_world_rect(x as f32, 3_360.0, 24.0, 62.0, [1.0, 1.0, 1.0, 0.28], world);
            self.add_world_rect(x as f32, 3_650.0, 24.0, 62.0, [1.0, 1.0, 1.0, 0.28], world);
        }

        // Exact exterior lots from `buildings.ts`. The original renderer draws
        // 28 visual storeys above each roof; preserving them is what gives the
        // city its familiar skyline instead of anonymous procedural blocks.
        self.add_source_tower(400.0, 3_180.0, 420.0, 280.0, "police", world);
        self.add_source_tower(1_040.0, 3_180.0, 400.0, 280.0, "noodle", world);
        self.add_source_tower(1_640.0, 3_140.0, 440.0, 340.0, "datacenter", world);
        self.add_source_tower(3_140.0, 3_180.0, 460.0, 300.0, "punk", world);
        self.add_source_tower(3_840.0, 3_180.0, 440.0, 300.0, "punk", world);

        // Camp landmarks and forest decoration use the source coordinates.
        self.add_source_tent(
            580.0,
            480.0,
            140.0,
            110.0,
            hex("#334155"),
            hex("#F59E0B"),
            world,
        );
        self.add_source_tent(
            860.0,
            480.0,
            130.0,
            100.0,
            hex("#451A03"),
            hex("#EA580C"),
            world,
        );
        self.add_source_tent(
            420.0,
            720.0,
            120.0,
            95.0,
            hex("#064E3B"),
            hex("#10B981"),
            world,
        );
        self.add_source_tent(
            920.0,
            740.0,
            115.0,
            90.0,
            hex("#1E3A8A"),
            hex("#38BDF8"),
            world,
        );
        self.add_source_campfire(680.0, 640.0, world);
        for (x, y, r) in [
            (260.0, 380.0, 38.0),
            (1_250.0, 420.0, 46.0),
            (1_520.0, 920.0, 50.0),
            (480.0, 1_950.0, 42.0),
            (1_450.0, 2_450.0, 55.0),
            (3_350.0, 2_150.0, 44.0),
            (4_050.0, 2_450.0, 46.0),
        ] {
            self.add_source_boulder(x, y, r, world);
        }
        // The source forest is deliberately crowded. Sparse repeated trees
        // made the retained native terrain read as an empty prototype once
        // Canvas stopped painting its decoration layer.
        for i in 0..224 {
            let x = ((i * 197) % 2_450 + 65) as f32;
            let y = ((i * 349) % 3_000 + 85) as f32;
            if (x - 680.0).abs() > 540.0 || (y - 650.0).abs() > 420.0 {
                self.add_source_tree(x, y, 0.64 + (i % 7) as f32 * 0.12, (i % 4) as u8, world);
            }
        }
    }

    fn add_source_horde_floor(&mut self, world: &NativeRenderFrame) {
        let half_width = world.viewport_width / world.zoom * 0.5;
        let half_height = world.viewport_height / world.zoom * 0.5;
        let start_x = ((world.camera_x - half_width) / 72.0).floor() as i32 * 72;
        let end_x = ((world.camera_x + half_width) / 72.0).ceil() as i32 * 72;
        let start_y = ((world.camera_y - half_height) / 72.0).floor() as i32 * 72;
        let end_y = ((world.camera_y + half_height) / 72.0).ceil() as i32 * 72;
        for x in (start_x..=end_x).step_by(72) {
            self.add_world_rect(
                x as f32,
                world.camera_y,
                1.0,
                half_height * 2.1,
                [0.13, 0.83, 0.93, 0.07],
                world,
            );
        }
        for y in (start_y..=end_y).step_by(72) {
            self.add_world_rect(
                world.camera_x,
                y as f32,
                half_width * 2.1,
                1.0,
                [0.13, 0.83, 0.93, 0.07],
                world,
            );
        }
        // Source horde plaza: this is intentionally anchored at the canonical
        // pocket-dimension centre, not the local camera origin.
        self.add_world_circle(
            -6_000.0,
            2_200.0,
            480.0,
            [0.13, 0.83, 0.93, 0.08],
            32,
            world,
        );
        self.add_world_ellipse(
            -6_000.0,
            2_200.0,
            210.0,
            210.0,
            [0.40, 0.91, 0.98, 0.24],
            30,
            world,
        );
        self.add_world_ellipse(
            -6_000.0,
            2_200.0,
            268.0,
            268.0,
            [0.91, 0.47, 0.98, 0.16],
            30,
            world,
        );
    }

    fn add_source_tower(
        &mut self,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        facade: &str,
        world: &NativeRenderFrame,
    ) {
        let (wall, trim, roof, window, deep) = match facade {
            "police" => (
                hex("#1E3A5F"),
                hex("#38BDF8"),
                hex("#334155"),
                [0.22, 0.74, 0.97, 0.55],
                hex("#020617"),
            ),
            "noodle" => (
                hex("#44403C"),
                hex("#F97316"),
                hex("#292524"),
                [0.98, 0.75, 0.22, 0.50],
                hex("#0C0A09"),
            ),
            "punk" => (
                hex("#27272A"),
                hex("#EF4444"),
                hex("#18181B"),
                [0.96, 0.25, 0.37, 0.50],
                hex("#000000"),
            ),
            _ => (
                hex("#164E63"),
                hex("#22D3EE"),
                hex("#0F172A"),
                [0.13, 0.83, 0.93, 0.55],
                hex("#000814"),
            ),
        };
        let face_h = 96.0;
        self.add_world_rect(
            x + width * 0.5 + 18.0,
            y + height + 28.0,
            width + 36.0,
            face_h * 0.32,
            [0.0, 0.0, 0.0, 0.5],
            world,
        );
        self.add_world_rect(
            x + width * 0.5,
            y + height + face_h * 0.5,
            width,
            face_h,
            wall,
            world,
        );
        self.add_world_rect(
            x + width + 18.0,
            y + height + face_h * 0.5,
            36.0,
            face_h,
            deep,
            world,
        );
        for row in 0..3 {
            for column in 0..((width - 36.0) / 18.0) as i32 {
                let wx = x + 24.0 + column as f32 * 18.0;
                let wy = y + height + 18.0 + row as f32 * 22.0;
                let lit = ((column + row * 7) % 3) != 0;
                self.add_world_rect(
                    wx,
                    wy,
                    11.0,
                    14.0,
                    if lit {
                        window
                    } else {
                        [0.024, 0.031, 0.063, 0.92]
                    },
                    world,
                );
            }
        }
        for story in (1..=28).rev() {
            let slab_y = y - story as f32 * 16.0;
            let inset = (story as f32 * 1.1).min(28.0);
            let slab_w = (width - inset * 2.0).max(24.0);
            self.add_world_rect(
                x + width * 0.5,
                slab_y + 10.0,
                slab_w,
                20.0,
                if story % 2 == 0 { wall } else { roof },
                world,
            );
            for wx in ((x + inset + 14.0) as i32..(x + width - inset - 14.0) as i32).step_by(16) {
                self.add_world_rect(wx as f32, slab_y + 10.0, 8.0, 12.0, window, world);
            }
        }
        self.add_world_rect(
            x + width * 0.5,
            y + height * 0.5,
            width,
            height,
            roof,
            world,
        );
        self.add_world_line(x, y, x + width, y, 3.0, trim, world);
        self.add_world_line(x, y, x, y + height, 3.0, trim, world);
        self.add_world_line(x + width, y, x + width, y + height, 3.0, trim, world);
        self.add_world_rect(x + width * 0.5, y + height - 3.0, 76.0, 44.0, deep, world);
        self.add_world_line(
            x + width * 0.5 - 38.0,
            y + height - 25.0,
            x + width * 0.5 + 38.0,
            y + height - 25.0,
            3.0,
            trim,
            world,
        );
    }

    fn add_source_tree(&mut self, x: f32, y: f32, scale: f32, variant: u8, world: &NativeRenderFrame) {
        let (dark, mid, light) = match variant {
            1 => (hex("#0C5A3E"), hex("#14834F"), hex("#22C55E")),
            2 => (hex("#15513A"), hex("#2D7A42"), hex("#84CC16")),
            3 => (hex("#6B3418"), hex("#D95B10"), hex("#FACC15")),
            _ => (hex("#0B6B45"), hex("#15995A"), hex("#1DBA68")),
        };
        self.add_world_ellipse(
            x,
            y + 20.0 * scale,
            24.0 * scale,
            8.0 * scale,
            [0.0, 0.0, 0.0, 0.36],
            10,
            world,
        );
        self.add_world_rect(
            x,
            y + 4.0 * scale,
            10.0 * scale,
            42.0 * scale,
            hex("#4A270B"),
            world,
        );
        self.add_world_circle(x, y - 28.0 * scale, 28.0 * scale, dark, 12, world);
        self.add_world_circle(
            x - 16.0 * scale,
            y - 12.0 * scale,
            19.0 * scale,
            mid,
            10,
            world,
        );
        self.add_world_circle(
            x + 17.0 * scale,
            y - 12.0 * scale,
            19.0 * scale,
            light,
            10,
            world,
        );
    }

    fn add_source_tent(
        &mut self,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        canvas: [f32; 4],
        trim: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        self.add_world_ellipse(
            x,
            y + height * 0.54,
            width * 0.52,
            height * 0.19,
            [0.0, 0.0, 0.0, 0.42],
            14,
            world,
        );
        self.add_world_triangle(
            [x - width * 0.5, y + height * 0.4],
            [x, y - height * 0.55],
            [x + width * 0.5, y + height * 0.4],
            canvas,
            world,
        );
        self.add_world_line(
            x - width * 0.5,
            y + height * 0.4,
            x,
            y - height * 0.55,
            3.0,
            trim,
            world,
        );
        self.add_world_line(
            x,
            y - height * 0.55,
            x + width * 0.5,
            y + height * 0.4,
            3.0,
            trim,
            world,
        );
        self.add_world_rect(
            x,
            y + height * 0.22,
            width * 0.22,
            height * 0.32,
            [0.06, 0.04, 0.025, 1.0],
            world,
        );
    }

    fn add_source_campfire(&mut self, x: f32, y: f32, world: &NativeRenderFrame) {
        self.add_world_ellipse(x, y + 12.0, 45.0, 20.0, [0.0, 0.0, 0.0, 0.42], 18, world);
        self.add_world_circle(x, y, 35.0, [0.96, 0.61, 0.04, 0.08], 20, world);
        for i in 0..12 {
            let angle = std::f32::consts::TAU * i as f32 / 12.0;
            self.add_world_circle(
                x + angle.cos() * 32.0,
                y + angle.sin() * 22.0,
                9.0,
                hex("#57534E"),
                9,
                world,
            );
        }
        self.add_world_ellipse(x, y, 24.0, 15.0, hex("#7F1D1D"), 14, world);
        self.add_world_triangle(
            [x - 14.0, y + 4.0],
            [x, y - 30.0],
            [x + 14.0, y + 4.0],
            hex("#F59E0B"),
            world,
        );
        self.add_world_triangle(
            [x - 7.0, y + 2.0],
            [x, y - 20.0],
            [x + 7.0, y + 2.0],
            hex("#FEF08A"),
            world,
        );
    }

    fn add_source_boulder(&mut self, x: f32, y: f32, radius: f32, world: &NativeRenderFrame) {
        self.add_world_ellipse(
            x,
            y + radius * 0.62,
            radius * 1.05,
            radius * 0.38,
            [0.0, 0.0, 0.0, 0.38],
            14,
            world,
        );
        self.add_world_circle(x, y, radius, hex("#475569"), 14, world);
        self.add_world_circle(
            x - radius * 0.24,
            y - radius * 0.28,
            radius * 0.54,
            hex("#64748B"),
            12,
            world,
        );
        self.add_world_circle(
            x + radius * 0.24,
            y - radius * 0.34,
            radius * 0.33,
            hex("#1E6544"),
            10,
            world,
        );
    }

    #[allow(dead_code)]
    fn add_district(&mut self, world: &NativeRenderFrame) {
        let (ground, asphalt, building, window) = match world.theme.as_str() {
            "cop_precinct" | "warzone_frontline" => (
                [0.015, 0.065, 0.13, 1.0],
                [0.025, 0.045, 0.075, 1.0],
                [0.035, 0.15, 0.25, 1.0],
                [0.08, 0.72, 0.96, 0.55],
            ),
            "punk_territory" => (
                [0.09, 0.018, 0.045, 1.0],
                [0.06, 0.025, 0.05, 1.0],
                [0.22, 0.035, 0.12, 1.0],
                [1.0, 0.16, 0.42, 0.58],
            ),
            "deep_forest" | "forest_camp" => (
                [0.018, 0.10, 0.07, 1.0],
                [0.04, 0.10, 0.08, 1.0],
                [0.06, 0.20, 0.12, 1.0],
                [0.38, 0.85, 0.42, 0.32],
            ),
            _ => (
                [0.06, 0.035, 0.045, 1.0],
                [0.08, 0.045, 0.05, 1.0],
                [0.22, 0.11, 0.08, 1.0],
                [1.0, 0.62, 0.16, 0.36],
            ),
        };
        self.add_screen_quad(
            [0.0, 0.0],
            [world.viewport_width, world.viewport_height],
            ground,
            world,
        );

        let road_spacing = 760.0;
        let road_width = 170.0;
        let half_width = world.viewport_width / world.zoom / 2.0;
        let half_height = world.viewport_height / world.zoom / 2.0;
        let min_column = ((world.camera_x - half_width) / road_spacing).floor() as i32 - 1;
        let max_column = ((world.camera_x + half_width) / road_spacing).ceil() as i32 + 1;
        let min_row = ((world.camera_y - half_height) / road_spacing).floor() as i32 - 1;
        let max_row = ((world.camera_y + half_height) / road_spacing).ceil() as i32 + 1;

        for column in min_column..=max_column {
            let x = column as f32 * road_spacing;
            self.add_world_rect(
                x,
                world.camera_y,
                road_width,
                half_height * 2.4,
                asphalt,
                world,
            );
            self.add_world_rect(
                x,
                world.camera_y,
                3.0,
                half_height * 2.2,
                [1.0, 0.78, 0.12, 0.68],
                world,
            );
        }
        for row in min_row..=max_row {
            let y = row as f32 * road_spacing;
            self.add_world_rect(
                world.camera_x,
                y,
                half_width * 2.4,
                road_width,
                asphalt,
                world,
            );
            self.add_world_rect(
                world.camera_x,
                y,
                half_width * 2.2,
                3.0,
                [1.0, 0.78, 0.12, 0.68],
                world,
            );
        }

        for column in min_column..=max_column {
            for row in min_row..=max_row {
                let block_x = column as f32 * road_spacing + road_spacing * 0.5;
                let block_y = row as f32 * road_spacing + road_spacing * 0.5;
                let variant = (column * 17 + row * 31).rem_euclid(3) as f32;
                let width = 380.0 + variant * 44.0;
                let height = 300.0 + (2.0 - variant) * 36.0;
                self.add_world_rect(block_x, block_y, width, height, building, world);
                self.add_world_rect(
                    block_x,
                    block_y - height * 0.42,
                    width * 0.78,
                    10.0,
                    window,
                    world,
                );
                for window_index in -2..=2 {
                    self.add_world_rect(
                        block_x + window_index as f32 * 56.0,
                        block_y,
                        22.0,
                        42.0,
                        window,
                        world,
                    );
                }
            }
        }
        self.add_grid(world);
    }

    fn add_entity(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        if !matches!(entity.kind.as_str(), "projectile" | "particle") {
            let shadow = [0.0, 0.0, 0.0, (entity.color[3] * 0.34).min(0.34)];
            self.add_world_ellipse(
                x + entity.size * 0.10,
                y + entity.size * 0.30,
                entity.size * 0.47,
                entity.size * 0.12,
                shadow,
                12,
                world,
            );
        }
        if self.add_generated_sprite(entity, x, y, world) {
            return;
        }
        match entity.kind.as_str() {
            "projectile" => self.add_projectile(entity, x, y, world),
            "particle" => self.add_particle(entity, x, y, world),
            "resource" => self.add_resource(entity, x, y, world),
            "vehicle" => self.add_vehicle(entity, x, y, world),
            "pickup" | "poi" => self.add_pickup(entity, x, y, world),
            "decal" => self.add_decal(entity, x, y, world),
            "summon" => self.add_summon(entity, x, y, world),
            "popup" => self.add_popup(entity, x, y, world),
            // Actors are atlas-only in native mode. A missing explicit match
            // resolves through `assets/native/characters.json`; never fall
            // back to the old hand-drawn chibi/humanoid geometry.
            "player" | "npc" | "monster" => {},
            _ => self.add_humanoid(entity, x, y, world),
        }
    }

    fn add_generated_sprite(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) -> bool {
        let frame_key = if entity.sprite_key.is_empty() {
            native_sprites::resolve_actor_frame(
                &entity.kind,
                &entity.id,
                &entity.faction,
                &entity.effect_type,
                &entity.weapon_type,
                &entity.horde_kind,
                entity.is_boss,
                entity.chibi.as_ref(),
            )
        } else {
            Some(entity.sprite_key.as_str())
        };
        let Some(frame_key) = frame_key else {
            return false;
        };
        let Some(atlas_id) = native_sprites::atlas_for_frame(frame_key) else {
            return false;
        };
        let world_to_ndc = |world_x: f32, world_y: f32| {
            [
                ((world_x - world.camera_x) * world.zoom + world.viewport_width * 0.5)
                    / world.viewport_width
                    * 2.0
                    - 1.0,
                1.0 - ((world_y - world.camera_y) * world.zoom + world.viewport_height * 0.5)
                    / world.viewport_height
                    * 2.0,
            ]
        };
        let Some(atlas) = self
            .sprite_atlases
            .iter_mut()
            .find(|atlas| atlas.id == atlas_id)
        else {
            return false;
        };
        let Some(frame) = atlas.frames.get(frame_key).copied() else {
            return false;
        };
        if frame.w == 0 || frame.h == 0 {
            return false;
        }
        // The generated cells preserve the source renderer's full canvas
        // bounds. Map those bounds to the native entity footprint rather than
        // cropping artwork per frame; this keeps wing/weapon silhouettes and
        // avoids a per-entity texture allocation.
        // Atlas cells preserve source-canvas padding; the old footprint made
        // every operator look toy-sized beside the map. Scale all actor
        // bodies consistently without allocating a texture per entity.
        let scale = if atlas_id == "horde" { 3.28 } else { 4.08 };
        let height = entity.size * scale;
        let width = height * frame.w as f32 / frame.h as f32;
        let center_x = x;
        let center_y = y - entity.size * 0.08;
        let left = center_x - width * frame.pivot_x.clamp(0.0, 1.0);
        let top = center_y - height * frame.pivot_y.clamp(0.0, 1.0);
        let right = left + width;
        let bottom = top + height;
        let inset_u = 0.5 / atlas.width as f32;
        let inset_v = 0.5 / atlas.height as f32;
        let mut u0 = frame.x as f32 / atlas.width as f32 + inset_u;
        let mut u1 = (frame.x + frame.w) as f32 / atlas.width as f32 - inset_u;
        let v0 = frame.y as f32 / atlas.height as f32 + inset_v;
        let v1 = (frame.y + frame.h) as f32 / atlas.height as f32 - inset_v;
        if entity.facing_left {
            std::mem::swap(&mut u0, &mut u1);
        }
        let top_left = world_to_ndc(left, top);
        let top_right = world_to_ndc(right, top);
        let bottom_right = world_to_ndc(right, bottom);
        let bottom_left = world_to_ndc(left, bottom);
        atlas.vertices.extend_from_slice(&[
            SpriteVertex {
                position: top_left,
                uv: [u0, v0],
            },
            SpriteVertex {
                position: bottom_left,
                uv: [u0, v1],
            },
            SpriteVertex {
                position: bottom_right,
                uv: [u1, v1],
            },
            SpriteVertex {
                position: top_left,
                uv: [u0, v0],
            },
            SpriteVertex {
                position: bottom_right,
                uv: [u1, v1],
            },
            SpriteVertex {
                position: top_right,
                uv: [u1, v0],
            },
        ]);
        true
    }

    fn add_humanoid(
        &mut self,
        entity: &NativeRenderEntity,
        mut x: f32,
        mut y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size;
        let outline = [0.008, 0.014, 0.035, 0.94];
        let recipe = entity.chibi.as_ref();
        let animation = entity.animation.as_ref();
        let skin = recipe.map_or_else(
            || {
                if entity.kind == "player" {
                    [1.0, 0.84, 0.72, 1.0]
                } else {
                    [0.98, 0.72, 0.60, 1.0]
                }
            },
            |style| recipe_color(&style.skin_tone, [1.0, 0.84, 0.72, 1.0]),
        );
        let hair = recipe.map_or_else(
            || {
                if entity.faction == "punk_demon" {
                    [1.0, 0.16, 0.31, 1.0]
                } else {
                    entity.color
                }
            },
            |style| recipe_color(&style.hair_color, entity.color),
        );
        let coat = recipe.map_or(entity.color, |style| {
            recipe_color(&style.coat_color, entity.color)
        });
        let skirt = recipe.map_or(coat, |style| recipe_color(&style.skirt_color, coat));
        let eye = recipe.map_or([0.02, 0.08, 0.13, 1.0], |style| {
            recipe_color(&style.eye_color, [0.02, 0.08, 0.13, 1.0])
        });
        let moving = animation.is_some_and(|state| state.state == "walk");
        let bob = if moving {
            (world.time_seconds
                * if animation.is_some_and(|state| state.is_sprinting) {
                    16.0
                } else {
                    11.0
                })
            .sin()
            .abs()
                * size
                * 0.075
        } else {
            (world.time_seconds * 2.0).sin() * size * 0.025
        };
        let spawn_lift = animation
            .map(|state| (1.0 - state.spawn_bounce).clamp(0.0, 1.0) * size * 0.46)
            .unwrap_or_default();
        let dodge_progress = animation
            .map(|state| (state.dodge_timer / 0.24).clamp(0.0, 1.0))
            .unwrap_or_default();
        if dodge_progress > 0.0 {
            x += if entity.facing_left { -1.0 } else { 1.0 } * size * 0.34 * dodge_progress;
        }
        y -= animation.map_or(0.0, |state| state.jump_z) + bob + spawn_lift;

        if let Some(style) = recipe.filter(|style| {
            chibi_assets::is_miku(
                &style.front_hair_style,
                &style.back_hair_style,
                &style.hair_style,
                &style.hat_type,
                &style.outfit_type,
            )
        }) {
            self.add_miku_asset(style, entity, x, y, size, world);
            self.add_weapon_asset(entity, x, y, size, outline, world);
            if entity.kind == "monster" {
                let bar_width = size * 1.28;
                self.add_world_rect(x, y - size * 0.86, bar_width, size * 0.11, outline, world);
                self.add_world_rect(
                    x - bar_width * (1.0 - entity.hp_ratio) * 0.5,
                    y - size * 0.86,
                    bar_width * entity.hp_ratio,
                    size * 0.065,
                    if entity.faction == "police" {
                        hex("#22D3EE")
                    } else {
                        hex("#FB2C4A")
                    },
                    world,
                );
            }
            return;
        }

        // The source Chibi order is shadow -> back hair/wings -> outfit ->
        // face/front hair -> cosmetics/weapon. The primitives below retain
        // that order and use the real `ChibiConfig` recipe, not faction paint.
        if let Some(style) = recipe {
            let halo = recipe_color(&style.halo_color, [0.9, 0.36, 0.55, 1.0]);
            if style.halo_type != "none" && !style.halo_type.is_empty() {
                self.add_world_ellipse(
                    x,
                    y - size * 0.83,
                    size * 0.24,
                    size * 0.08,
                    [halo[0], halo[1], halo[2], 0.34],
                    16,
                    world,
                );
                self.add_world_ellipse(
                    x,
                    y - size * 0.83,
                    size * 0.18,
                    size * 0.045,
                    halo,
                    16,
                    world,
                );
                match style.halo_type.as_str() {
                    "cross" => {
                        self.add_world_rect(
                            x,
                            y - size * 0.83,
                            size * 0.055,
                            size * 0.30,
                            halo,
                            world,
                        );
                        self.add_world_rect(
                            x,
                            y - size * 0.83,
                            size * 0.22,
                            size * 0.055,
                            halo,
                            world,
                        );
                    }
                    "star" | "floral" => {
                        for point in 0..5 {
                            let angle = point as f32 * std::f32::consts::TAU / 5.0
                                - std::f32::consts::FRAC_PI_2;
                            self.add_world_circle(
                                x + angle.cos() * size * 0.20,
                                y - size * 0.83 + angle.sin() * size * 0.12,
                                size * 0.045,
                                halo,
                                7,
                                world,
                            );
                        }
                    }
                    "crown" => {
                        for offset in [-0.16_f32, 0.0, 0.16] {
                            self.add_world_triangle(
                                [x + size * (offset - 0.07), y - size * 0.84],
                                [x + size * offset, y - size * 1.02],
                                [x + size * (offset + 0.07), y - size * 0.84],
                                halo,
                                world,
                            );
                        }
                    }
                    _ => {}
                }
            }
            let wing = recipe_color(&style.wing_color, [0.38, 0.76, 1.0, 1.0]);
            if style.wing_type == "pixel_wings" {
                // Miku's preset has pixel wings, not the generic angel
                // triangles. Keep the stepped silhouette from the source
                // asset recipe so it remains recognisable at gameplay scale.
                for side in [-1.0_f32, 1.0] {
                    for (index, (offset_x, offset_y, scale)) in [
                        (0.25_f32, -0.10_f32, 0.12_f32),
                        (0.39_f32, -0.02_f32, 0.10_f32),
                        (0.51_f32, 0.10_f32, 0.08_f32),
                    ]
                    .iter()
                    .enumerate()
                    {
                        let alpha = 0.92 - index as f32 * 0.16;
                        self.add_world_rect(
                            x + side * size * *offset_x,
                            y + size * *offset_y,
                            size * *scale,
                            size * *scale,
                            [wing[0], wing[1], wing[2], alpha],
                            world,
                        );
                    }
                }
            } else if style.wing_type != "none" && !style.wing_type.is_empty() {
                self.add_world_triangle(
                    [x - size * 0.16, y - size * 0.08],
                    [x - size * 0.68, y - size * 0.36],
                    [x - size * 0.42, y + size * 0.34],
                    wing,
                    world,
                );
                self.add_world_triangle(
                    [x + size * 0.16, y - size * 0.08],
                    [x + size * 0.68, y - size * 0.36],
                    [x + size * 0.42, y + size * 0.34],
                    wing,
                    world,
                );
            }
            let back_hair = if style.back_hair_style.is_empty() {
                style.hair_style.as_str()
            } else {
                style.back_hair_style.as_str()
            };
            match back_hair {
                "miku_twintails" => {
                    let clip = recipe_color(&style.ribbon_color, hex("#EC4899"));
                    for side in [-1.0_f32, 1.0] {
                        // Long, tapered tails: the source reaches below the
                        // waist rather than stopping in two round puffs.
                        self.add_world_ellipse(
                            x + side * size * 0.34,
                            y + size * 0.03,
                            size * 0.17,
                            size * 0.52,
                            outline,
                            14,
                            world,
                        );
                        self.add_world_ellipse(
                            x + side * size * 0.34,
                            y + size * 0.02,
                            size * 0.135,
                            size * 0.48,
                            hair,
                            14,
                            world,
                        );
                        self.add_world_rect(
                            x + side * size * 0.29,
                            y - size * 0.47,
                            size * 0.13,
                            size * 0.11,
                            outline,
                            world,
                        );
                        self.add_world_rect(
                            x + side * size * 0.29,
                            y - size * 0.47,
                            size * 0.090,
                            size * 0.066,
                            clip,
                            world,
                        );
                    }
                }
                "twintails" | "low_twintails" | "twin_bubble_tails" | "twin_drill_tails" => {
                    self.add_world_circle(
                        x - size * 0.36,
                        y - size * 0.35,
                        size * 0.21,
                        hair,
                        10,
                        world,
                    );
                    self.add_world_circle(
                        x + size * 0.36,
                        y - size * 0.35,
                        size * 0.21,
                        hair,
                        10,
                        world,
                    );
                }
                "ponytail" | "side_ponytail" | "gyaru_ponytail" | "drill_ponytail" => {
                    self.add_world_circle(
                        x - size * 0.32,
                        y - size * 0.25,
                        size * 0.23,
                        hair,
                        11,
                        world,
                    );
                }
                "long_flowing" | "wavy" | "braids" | "rapunzel_braid" => {
                    self.add_world_ellipse(
                        x,
                        y - size * 0.06,
                        size * 0.37,
                        size * 0.46,
                        hair,
                        14,
                        world,
                    );
                }
                "anya_buns" | "cyber_buns" | "sailor_odango" | "twin_buns_flowing"
                | "mega_drill_buns" | "high_bun" => {
                    self.add_world_circle(
                        x - size * 0.28,
                        y - size * 0.54,
                        size * 0.17,
                        hair,
                        10,
                        world,
                    );
                    self.add_world_circle(
                        x + size * 0.28,
                        y - size * 0.54,
                        size * 0.17,
                        hair,
                        10,
                        world,
                    );
                }
                "spiky" | "super_saiyan" | "pompadour_chad" | "topknot_samurai" => {
                    for offset in [-0.28_f32, -0.10, 0.10, 0.28] {
                        self.add_world_triangle(
                            [x + size * (offset - 0.11), y - size * 0.47],
                            [x + size * offset, y - size * 0.82],
                            [x + size * (offset + 0.11), y - size * 0.47],
                            hair,
                            world,
                        );
                    }
                }
                "afro" | "fluffy_short" | "mushroom_bob" | "asymmetric_bob" | "cirno_bob"
                | "cat_hood_bob" => {
                    self.add_world_ellipse(
                        x,
                        y - size * 0.40,
                        size * 0.40,
                        size * 0.32,
                        hair,
                        14,
                        world,
                    );
                }
                "side_braid" | "fishtail_braid" | "dreadlocks" => {
                    for offset in [-0.32_f32, 0.32] {
                        self.add_world_ellipse(
                            x + size * offset,
                            y - size * 0.10,
                            size * 0.08,
                            size * 0.38,
                            hair,
                            10,
                            world,
                        );
                    }
                }
                _ => {}
            }
            match style.ear_type.as_str() {
                "cat" | "fox" | "wolf" | "devil_horns" | "dragon_horns" => {
                    let ears = recipe_color(&style.ear_color, hair);
                    let inner_ears = recipe_color(&style.inner_ear_color, skin);
                    self.add_world_triangle(
                        [x - size * 0.28, y - size * 0.55],
                        [x - size * 0.17, y - size * 0.86],
                        [x - size * 0.02, y - size * 0.56],
                        ears,
                        world,
                    );
                    self.add_world_triangle(
                        [x + size * 0.28, y - size * 0.55],
                        [x + size * 0.17, y - size * 0.86],
                        [x + size * 0.02, y - size * 0.56],
                        ears,
                        world,
                    );
                    self.add_world_triangle(
                        [x - size * 0.20, y - size * 0.60],
                        [x - size * 0.17, y - size * 0.75],
                        [x - size * 0.09, y - size * 0.59],
                        inner_ears,
                        world,
                    );
                    self.add_world_triangle(
                        [x + size * 0.20, y - size * 0.60],
                        [x + size * 0.17, y - size * 0.75],
                        [x + size * 0.09, y - size * 0.59],
                        inner_ears,
                        world,
                    );
                }
                "bunny" | "dog_floppy" => {
                    let ears = recipe_color(&style.ear_color, hair);
                    self.add_world_ellipse(
                        x - size * 0.22,
                        y - size * 0.75,
                        size * 0.10,
                        size * 0.30,
                        ears,
                        10,
                        world,
                    );
                    self.add_world_ellipse(
                        x + size * 0.22,
                        y - size * 0.75,
                        size * 0.10,
                        size * 0.30,
                        ears,
                        10,
                        world,
                    );
                }
                _ => {}
            }
        }

        self.add_world_rect(x, y + size * 0.10, size * 0.64, size * 0.66, outline, world);
        self.add_world_rect(x, y + size * 0.06, size * 0.54, size * 0.53, coat, world);
        self.add_world_ellipse(
            x,
            y + size * 0.30,
            size * 0.31,
            size * 0.16,
            skirt,
            12,
            world,
        );
        if let Some(style) = recipe {
            self.add_outfit_asset(style, x, y, size, coat, skirt, outline, world);
        }
        self.add_world_circle(x, y - size * 0.28, size * 0.34, outline, 12, world);
        self.add_world_circle(x, y - size * 0.30, size * 0.29, skin, 12, world);
        self.add_world_circle(x, y - size * 0.43, size * 0.30, hair, 12, world);
        self.add_world_ellipse(
            x,
            y - size * 0.36,
            size * 0.30,
            size * 0.13,
            hair,
            12,
            world,
        );
        if let Some(style) = recipe {
            match style.front_hair_style.as_str() {
                "miku_fringe" | "miku_twintails" => {
                    // Center notch plus two long sidelocks, matching the
                    // Miku-specific source path rather than four bob bangs.
                    self.add_world_triangle(
                        [x - size * 0.29, y - size * 0.53],
                        [x, y - size * 0.25],
                        [x + size * 0.29, y - size * 0.53],
                        hair,
                        world,
                    );
                    for side in [-1.0_f32, 1.0] {
                        self.add_world_ellipse(
                            x + side * size * 0.26,
                            y - size * 0.26,
                            size * 0.065,
                            size * 0.24,
                            hair,
                            9,
                            world,
                        );
                    }
                }
                "straight_bangs" | "blunt_fringe" => {
                    for offset in [-0.18_f32, -0.06, 0.06, 0.18] {
                        self.add_world_ellipse(
                            x + size * offset,
                            y - size * 0.39,
                            size * 0.09,
                            size * 0.14,
                            hair,
                            7,
                            world,
                        );
                    }
                }
                "side_swept" | "emo_fringe" | "bocchi_shaggy" => {
                    self.add_world_triangle(
                        [x - size * 0.26, y - size * 0.52],
                        [x + size * 0.30, y - size * 0.50],
                        [x - size * 0.10, y - size * 0.14],
                        hair,
                        world,
                    );
                }
                _ => {}
            }
        }
        // The first native pass represented an eye as one coloured dot. That
        // disappears behind saturated hair/skin and is why operators read as
        // featureless silhouettes. Preserve the source's readable anime eye
        // stack: dark lash, white sclera, iris, pupil and two highlights.
        let face_ink = hex("#1A1816");
        let blush = hex("#F472B6");
        for cheek_x in [-0.18_f32, 0.18] {
            self.add_world_ellipse(
                x + size * cheek_x,
                y - size * 0.18,
                size * 0.065,
                size * 0.032,
                [blush[0], blush[1], blush[2], 0.42],
                8,
                world,
            );
        }
        let eye_type = recipe.map_or("", |style| style.eye_type.as_str());
        if matches!(eye_type, "happy" | "sleepy_closed") {
            for eye_x in [-0.11_f32, 0.11] {
                self.add_world_line(
                    x + size * (eye_x - 0.055),
                    y - size * 0.29,
                    x + size * eye_x,
                    y - size * 0.25,
                    size * 0.030,
                    face_ink,
                    world,
                );
                self.add_world_line(
                    x + size * eye_x,
                    y - size * 0.25,
                    x + size * (eye_x + 0.055),
                    y - size * 0.29,
                    size * 0.030,
                    face_ink,
                    world,
                );
            }
        } else if matches!(eye_type, "dead_x" | "dizzy_spiral") {
            for eye_x in [-0.11_f32, 0.11] {
                self.add_world_line(
                    x + size * (eye_x - 0.052),
                    y - size * 0.35,
                    x + size * (eye_x + 0.052),
                    y - size * 0.24,
                    size * 0.030,
                    face_ink,
                    world,
                );
                self.add_world_line(
                    x + size * (eye_x - 0.052),
                    y - size * 0.24,
                    x + size * (eye_x + 0.052),
                    y - size * 0.35,
                    size * 0.030,
                    face_ink,
                    world,
                );
            }
        } else {
            for eye_x in [-0.11_f32, 0.11] {
                self.add_world_circle(
                    x + size * eye_x,
                    y - size * 0.30,
                    size * 0.090,
                    face_ink,
                    10,
                    world,
                );
                self.add_world_circle(
                    x + size * eye_x,
                    y - size * 0.295,
                    size * 0.073,
                    hex("#FFFFFF"),
                    10,
                    world,
                );
                self.add_world_circle(
                    x + size * eye_x,
                    y - size * 0.292,
                    size * 0.060,
                    eye,
                    10,
                    world,
                );
                self.add_world_circle(
                    x + size * eye_x,
                    y - size * 0.287,
                    size * 0.032,
                    hex("#09090B"),
                    9,
                    world,
                );
                self.add_world_circle(
                    x + size * (eye_x - 0.021),
                    y - size * 0.322,
                    size * 0.023,
                    hex("#FFFFFF"),
                    7,
                    world,
                );
                self.add_world_circle(
                    x + size * (eye_x + 0.024),
                    y - size * 0.267,
                    size * 0.010,
                    hex("#FFFFFF"),
                    6,
                    world,
                );
                self.add_world_line(
                    x + size * (eye_x - 0.074),
                    y - size * 0.358,
                    x + size * (eye_x + 0.074),
                    y - size * 0.358,
                    size * 0.018,
                    face_ink,
                    world,
                );
            }
        }
        self.add_world_ellipse(
            x,
            y - size * 0.155,
            size * 0.060,
            size * 0.022,
            face_ink,
            8,
            world,
        );
        self.add_world_ellipse(
            x,
            y - size * 0.160,
            size * 0.044,
            size * 0.013,
            skin,
            8,
            world,
        );
        if let Some(style) = recipe {
            let accent = recipe_color(
                &style.ribbon_color,
                recipe_color(&style.accent_color, [0.96, 0.36, 0.55, 1.0]),
            );
            self.add_world_circle(x, y + size * 0.01, size * 0.06, accent, 8, world);
            if matches!(
                style.outfit_type.as_str(),
                "magic_robe" | "kimono_yukata" | "goth_lolita" | "winter_coat" | "detective_coat"
            ) {
                self.add_world_ellipse(
                    x,
                    y + size * 0.24,
                    size * 0.40,
                    size * 0.25,
                    coat,
                    14,
                    world,
                );
            }
            let hat = recipe_color(&style.hat_color, hair);
            if style.hat_type == "headphones" {
                // The preset's headphones are an identifying part of its
                // silhouette. Build the band and padded cups as native mesh
                // pieces instead of collapsing them into a generic cap.
                let cup = hex("#0F172A");
                for side in [-1.0_f32, 1.0] {
                    self.add_world_ellipse(
                        x + side * size * 0.37,
                        y - size * 0.39,
                        size * 0.090,
                        size * 0.19,
                        outline,
                        10,
                        world,
                    );
                    self.add_world_ellipse(
                        x + side * size * 0.37,
                        y - size * 0.39,
                        size * 0.060,
                        size * 0.145,
                        cup,
                        10,
                        world,
                    );
                    self.add_world_ellipse(
                        x + side * size * 0.37,
                        y - size * 0.39,
                        size * 0.025,
                        size * 0.095,
                        hat,
                        8,
                        world,
                    );
                }
                let band_points = [
                    (-0.34_f32, -0.48_f32),
                    (-0.22_f32, -0.67_f32),
                    (0.0_f32, -0.74_f32),
                    (0.22_f32, -0.67_f32),
                    (0.34_f32, -0.48_f32),
                ];
                for pair in band_points.windows(2) {
                    self.add_world_line(
                        x + size * pair[0].0,
                        y + size * pair[0].1,
                        x + size * pair[1].0,
                        y + size * pair[1].1,
                        size * 0.060,
                        outline,
                        world,
                    );
                    self.add_world_line(
                        x + size * pair[0].0,
                        y + size * pair[0].1,
                        x + size * pair[1].0,
                        y + size * pair[1].1,
                        size * 0.030,
                        hat,
                        world,
                    );
                }
            } else if style.hat_type != "none" && !style.hat_type.is_empty() {
                self.add_world_ellipse(
                    x,
                    y - size * 0.62,
                    size * 0.34,
                    size * 0.15,
                    hat,
                    14,
                    world,
                );
                self.add_world_rect(x, y - size * 0.70, size * 0.30, size * 0.16, hat, world);
            }
        }
        self.add_weapon_asset(entity, x, y, size, outline, world);
        if entity.has_shield {
            let shield_x = x + if entity.facing_left { -1.0 } else { 1.0 } * size * 0.34;
            let shield = if entity.faction == "police" {
                [0.06, 0.18, 0.42, 0.94]
            } else {
                [0.12, 0.10, 0.13, 0.94]
            };
            self.add_world_rect(
                shield_x,
                y + size * 0.02,
                size * 0.28,
                size * 0.64,
                outline,
                world,
            );
            self.add_world_rect(
                shield_x,
                y + size * 0.02,
                size * 0.22,
                size * 0.56,
                shield,
                world,
            );
            self.add_world_rect(
                shield_x,
                y - size * 0.10,
                size * 0.14,
                size * 0.10,
                if entity.faction == "police" {
                    [0.22, 0.82, 1.0, 0.72]
                } else {
                    [1.0, 0.22, 0.31, 0.72]
                },
                world,
            );
        }
        if entity.kind == "monster" {
            let bar_width = size * 1.28;
            self.add_world_rect(x, y - size * 0.86, bar_width, size * 0.11, outline, world);
            self.add_world_rect(
                x - bar_width * (1.0 - entity.hp_ratio) * 0.5,
                y - size * 0.86,
                bar_width * entity.hp_ratio,
                size * 0.065,
                if entity.faction == "police" {
                    [0.12, 0.86, 1.0, 1.0]
                } else {
                    [1.0, 0.18, 0.31, 1.0]
                },
                world,
            );
        }
    }

    /// Tessellates one complete bounded asset recipe in the source Chibi
    /// coordinate system. This is intentionally local Rust geometry: the
    /// WebView sends cosmetic data, never a Canvas command stream.
    fn add_miku_asset(
        &mut self,
        style: &NativeChibiRecipe,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        size: f32,
        world: &NativeRenderFrame,
    ) {
        // The source Miku art spans roughly 72 design units. Keeping that
        // scale makes its source paths visually stable regardless of camera.
        let scale = (size / 72.0).max(0.1);
        for primitive in chibi_assets::MIKU {
            match *primitive {
                Primitive::Path {
                    commands,
                    fill,
                    stroke,
                    stroke_width,
                } => self.add_asset_path(
                    commands,
                    x,
                    y,
                    scale,
                    self.asset_paint(style, entity, fill),
                    stroke.map(|paint| self.asset_paint(style, entity, paint)),
                    stroke_width * scale,
                    world,
                ),
                Primitive::Rect {
                    x: local_x,
                    y: local_y,
                    width,
                    height,
                    fill,
                    stroke,
                    stroke_width,
                } => {
                    let fill = self.asset_paint(style, entity, fill);
                    let center_x = x + local_x * scale;
                    let center_y = y + local_y * scale;
                    if let Some(stroke) = stroke {
                        self.add_world_rect(
                            center_x,
                            center_y,
                            (width + stroke_width) * scale,
                            (height + stroke_width) * scale,
                            self.asset_paint(style, entity, stroke),
                            world,
                        );
                    }
                    self.add_world_rect(
                        center_x,
                        center_y,
                        width * scale,
                        height * scale,
                        fill,
                        world,
                    );
                }
                Primitive::Ellipse {
                    x: local_x,
                    y: local_y,
                    radius_x,
                    radius_y,
                    fill,
                    stroke,
                    stroke_width,
                } => {
                    let center_x = x + local_x * scale;
                    let center_y = y + local_y * scale;
                    if let Some(stroke) = stroke {
                        self.add_world_ellipse(
                            center_x,
                            center_y,
                            (radius_x + stroke_width * 0.5) * scale,
                            (radius_y + stroke_width * 0.5) * scale,
                            self.asset_paint(style, entity, stroke),
                            14,
                            world,
                        );
                    }
                    self.add_world_ellipse(
                        center_x,
                        center_y,
                        radius_x * scale,
                        radius_y * scale,
                        self.asset_paint(style, entity, fill),
                        14,
                        world,
                    );
                }
                Primitive::Line {
                    start_x,
                    start_y,
                    end_x,
                    end_y,
                    width,
                    paint,
                } => self.add_world_line(
                    x + start_x * scale,
                    y + start_y * scale,
                    x + end_x * scale,
                    y + end_y * scale,
                    width * scale,
                    self.asset_paint(style, entity, paint),
                    world,
                ),
            }
        }
    }

    fn asset_paint(
        &self,
        style: &NativeChibiRecipe,
        entity: &NativeRenderEntity,
        paint: Paint,
    ) -> [f32; 4] {
        match paint {
            Paint::Hair => recipe_color(&style.hair_color, entity.color),
            Paint::Skin => recipe_color(&style.skin_tone, hex("#FFE4D6")),
            Paint::Eye => recipe_color(&style.eye_color, hex("#38BDF8")),
            Paint::Accent => recipe_color(
                &style.accent_color,
                recipe_color(&style.ribbon_color, hex("#06B6D4")),
            ),
            Paint::Ribbon => recipe_color(&style.ribbon_color, hex("#EC4899")),
            Paint::Hat => recipe_color(&style.hat_color, hex("#06B6D4")),
            Paint::Wing => recipe_color(&style.wing_color, hex("#67E8F9")),
            Paint::Outline => hex("#1E1B18"),
            Paint::Dark => hex("#0F172A"),
            Paint::White => hex("#FFFFFF"),
        }
    }

    fn add_asset_path(
        &mut self,
        commands: &[PathCommand],
        origin_x: f32,
        origin_y: f32,
        scale: f32,
        fill: [f32; 4],
        stroke: Option<[f32; 4]>,
        stroke_width: f32,
        world: &NativeRenderFrame,
    ) {
        let mut points = Vec::with_capacity(commands.len() * 8);
        let mut current = [0.0_f32, 0.0_f32];
        let mut closed = false;
        for command in commands {
            match *command {
                PathCommand::Move(x, y) => {
                    current = [x, y];
                    points.push(current);
                }
                PathCommand::Line(x, y) => {
                    current = [x, y];
                    points.push(current);
                }
                PathCommand::Cubic(c1x, c1y, c2x, c2y, end_x, end_y) => {
                    let start = current;
                    for step in 1..=8 {
                        let t = step as f32 / 8.0;
                        let inv = 1.0 - t;
                        points.push([
                            inv.powi(3) * start[0]
                                + 3.0 * inv.powi(2) * t * c1x
                                + 3.0 * inv * t.powi(2) * c2x
                                + t.powi(3) * end_x,
                            inv.powi(3) * start[1]
                                + 3.0 * inv.powi(2) * t * c1y
                                + 3.0 * inv * t.powi(2) * c2y
                                + t.powi(3) * end_y,
                        ]);
                    }
                    current = [end_x, end_y];
                }
                PathCommand::Close => closed = true,
            }
        }
        if points.len() < 3 {
            return;
        }
        let world_points = points
            .iter()
            .map(|point| [origin_x + point[0] * scale, origin_y + point[1] * scale])
            .collect::<Vec<_>>();
        self.add_world_polygon(&world_points, fill, world);
        if let Some(stroke) = stroke {
            for pair in world_points.windows(2) {
                self.add_world_line(
                    pair[0][0],
                    pair[0][1],
                    pair[1][0],
                    pair[1][1],
                    stroke_width,
                    stroke,
                    world,
                );
            }
            if closed {
                let first = world_points[0];
                let last = world_points[world_points.len() - 1];
                self.add_world_line(
                    last[0],
                    last[1],
                    first[0],
                    first[1],
                    stroke_width,
                    stroke,
                    world,
                );
            }
        }
    }

    fn add_world_polygon(
        &mut self,
        points: &[[f32; 2]],
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        for index in 1..points.len() - 1 {
            self.add_world_triangle(points[0], points[index], points[index + 1], color, world);
        }
    }

    /// Native equivalent of the source outfit pass. It keeps the recipe
    /// vocabulary in Rust so an entity only transfers cosmetic state, never
    /// a list of Canvas drawing commands.
    fn add_outfit_asset(
        &mut self,
        style: &NativeChibiRecipe,
        x: f32,
        y: f32,
        size: f32,
        coat: [f32; 4],
        skirt: [f32; 4],
        outline: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        let accent = recipe_color(
            &style.accent_color,
            recipe_color(&style.ribbon_color, [0.22, 0.74, 1.0, 1.0]),
        );
        match style.outfit_type.as_str() {
            "cyber_hoodie" => {
                self.add_world_rect(x, y + size * 0.02, size * 0.58, size * 0.44, coat, world);
                self.add_world_rect(x, y + size * 0.13, size * 0.34, size * 0.12, accent, world);
                self.add_world_line(
                    x - size * 0.08,
                    y - size * 0.10,
                    x - size * 0.08,
                    y + size * 0.08,
                    size * 0.025,
                    [1.0, 1.0, 1.0, 0.92],
                    world,
                );
                self.add_world_line(
                    x + size * 0.08,
                    y - size * 0.10,
                    x + size * 0.08,
                    y + size * 0.08,
                    size * 0.025,
                    [1.0, 1.0, 1.0, 0.92],
                    world,
                );
            }
            "maid_idol" => {
                self.add_world_rect(x, y + size * 0.02, size * 0.52, size * 0.42, coat, world);
                self.add_world_triangle(
                    [x - size * 0.15, y - size * 0.15],
                    [x + size * 0.15, y - size * 0.15],
                    [x, y + size * 0.22],
                    [1.0, 1.0, 1.0, 1.0],
                    world,
                );
                self.add_world_circle(x, y - size * 0.10, size * 0.07, accent, 8, world);
            }
            "magic_robe" | "kimono_yukata" | "shrine_miko" => {
                self.add_world_ellipse(
                    x,
                    y + size * 0.23,
                    size * 0.43,
                    size * 0.30,
                    coat,
                    14,
                    world,
                );
                self.add_world_rect(x, y + size * 0.08, size * 0.62, size * 0.07, accent, world);
                if style.outfit_type == "magic_robe" {
                    self.add_world_circle(
                        x,
                        y - size * 0.03,
                        size * 0.07,
                        hex("#FDE047"),
                        8,
                        world,
                    );
                }
            }
            "goth_lolita" | "magical_girl" | "idol_stage" | "sailor_uniform" => {
                self.add_world_ellipse(
                    x,
                    y + size * 0.30,
                    size * 0.40,
                    size * 0.22,
                    skirt,
                    14,
                    world,
                );
                for offset in [-0.22_f32, -0.07, 0.07, 0.22] {
                    self.add_world_circle(
                        x + size * offset,
                        y + size * 0.46,
                        size * 0.052,
                        if style.outfit_type == "goth_lolita" {
                            [1.0, 1.0, 1.0, 0.96]
                        } else {
                            accent
                        },
                        7,
                        world,
                    );
                }
                if style.outfit_type == "idol_stage" {
                    // Long cyan detached sleeves give the virtual-idol
                    // recipe its recognisable silhouette in motion.
                    for side in [-1.0_f32, 1.0] {
                        self.add_world_ellipse(
                            x + side * size * 0.37,
                            y + size * 0.05,
                            size * 0.105,
                            size * 0.29,
                            outline,
                            10,
                            world,
                        );
                        self.add_world_ellipse(
                            x + side * size * 0.37,
                            y + size * 0.05,
                            size * 0.074,
                            size * 0.25,
                            accent,
                            10,
                            world,
                        );
                        self.add_world_rect(
                            x + side * size * 0.37,
                            y + size * 0.19,
                            size * 0.105,
                            size * 0.045,
                            hex("#0F172A"),
                            world,
                        );
                    }
                }
                if style.outfit_type == "sailor_uniform" {
                    self.add_world_triangle(
                        [x - size * 0.16, y - size * 0.12],
                        [x + size * 0.16, y - size * 0.12],
                        [x, y + size * 0.12],
                        accent,
                        world,
                    );
                }
            }
            "tactical_shinobi" | "cyber_ninja" | "combat_commando" | "mecha_pilot"
            | "military_officer" | "techwear_poncho" => {
                self.add_world_rect(x, y + size * 0.22, size * 0.54, size * 0.20, outline, world);
                self.add_world_rect(x, y + size * 0.18, size * 0.47, size * 0.13, skirt, world);
                self.add_world_rect(x, y + size * 0.05, size * 0.54, size * 0.052, accent, world);
                self.add_world_rect(
                    x - size * 0.16,
                    y + size * 0.25,
                    size * 0.10,
                    size * 0.07,
                    accent,
                    world,
                );
                self.add_world_rect(
                    x + size * 0.16,
                    y + size * 0.25,
                    size * 0.10,
                    size * 0.07,
                    accent,
                    world,
                );
            }
            "bunny_suit" => {
                self.add_world_rect(x, y + size * 0.08, size * 0.46, size * 0.43, coat, world);
                self.add_world_circle(
                    x,
                    y + size * 0.38,
                    size * 0.10,
                    [1.0, 1.0, 1.0, 1.0],
                    8,
                    world,
                );
            }
            "vampire_noble" | "detective_coat" | "winter_coat" | "sukeban_trench" => {
                self.add_world_ellipse(
                    x,
                    y + size * 0.23,
                    size * 0.42,
                    size * 0.32,
                    coat,
                    14,
                    world,
                );
                self.add_world_line(
                    x,
                    y - size * 0.12,
                    x,
                    y + size * 0.43,
                    size * 0.028,
                    accent,
                    world,
                );
            }
            _ => {}
        }
    }

    /// Builds the equipment layer entirely on the native side. These are
    /// stable local asset recipes (not Canvas commands) selected by the
    /// authoritative entity snapshot.
    fn add_weapon_asset(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        size: f32,
        outline: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        let direction = if entity.facing_left { -1.0 } else { 1.0 };
        let origin_x = x + direction * size * 0.36;
        let metal = [0.70, 0.80, 0.92, 1.0];
        match entity.weapon_type.as_str() {
            "bat" | "baton" => {
                self.add_world_line(
                    origin_x - direction * size * 0.10,
                    y + size * 0.12,
                    origin_x + direction * size * 0.48,
                    y - size * 0.26,
                    size * 0.09,
                    outline,
                    world,
                );
                self.add_world_line(
                    origin_x - direction * size * 0.10,
                    y + size * 0.12,
                    origin_x + direction * size * 0.48,
                    y - size * 0.26,
                    size * 0.052,
                    if entity.weapon_type == "baton" {
                        metal
                    } else {
                        hex("#7C3F1D")
                    },
                    world,
                );
            }
            "sledgehammer" => {
                self.add_world_line(
                    origin_x - direction * size * 0.08,
                    y + size * 0.18,
                    origin_x + direction * size * 0.46,
                    y - size * 0.35,
                    size * 0.07,
                    hex("#5B3826"),
                    world,
                );
                self.add_world_rect(
                    origin_x + direction * size * 0.45,
                    y - size * 0.36,
                    size * 0.25,
                    size * 0.18,
                    outline,
                    world,
                );
                self.add_world_rect(
                    origin_x + direction * size * 0.45,
                    y - size * 0.36,
                    size * 0.19,
                    size * 0.12,
                    hex("#78716C"),
                    world,
                );
            }
            "blade" => {
                self.add_world_line(
                    origin_x,
                    y + size * 0.08,
                    origin_x + direction * size * 0.58,
                    y - size * 0.18,
                    size * 0.09,
                    outline,
                    world,
                );
                self.add_world_line(
                    origin_x,
                    y + size * 0.08,
                    origin_x + direction * size * 0.58,
                    y - size * 0.18,
                    size * 0.045,
                    hex("#E0F2FE"),
                    world,
                );
            }
            "staff" => {
                self.add_world_line(
                    origin_x,
                    y + size * 0.18,
                    origin_x + direction * size * 0.22,
                    y - size * 0.48,
                    size * 0.052,
                    hex("#6B3E26"),
                    world,
                );
                self.add_world_circle(
                    origin_x + direction * size * 0.22,
                    y - size * 0.48,
                    size * 0.13,
                    entity.color,
                    10,
                    world,
                );
            }
            "molotov" => {
                self.add_world_circle(
                    origin_x + direction * size * 0.25,
                    y - size * 0.08,
                    size * 0.13,
                    hex("#F97316"),
                    10,
                    world,
                );
                self.add_world_rect(
                    origin_x + direction * size * 0.25,
                    y - size * 0.25,
                    size * 0.055,
                    size * 0.14,
                    hex("#FDE68A"),
                    world,
                );
            }
            "shotgun" | "ak47" | "cheytac" | "mac10" | "revolver" | "pistol" => {
                let barrel_scale = match entity.weapon_type.as_str() {
                    "cheytac" => 0.78,
                    "ak47" => 0.62,
                    "shotgun" => 0.58,
                    "mac10" => 0.38,
                    "revolver" => 0.35,
                    _ => 0.32,
                };
                self.add_world_rect(
                    origin_x,
                    y + size * 0.04,
                    size * (barrel_scale + 0.10),
                    size * 0.13,
                    outline,
                    world,
                );
                self.add_world_rect(
                    origin_x + direction * size * 0.03,
                    y + size * 0.01,
                    size * barrel_scale,
                    size * 0.065,
                    metal,
                    world,
                );
                if matches!(entity.weapon_type.as_str(), "ak47" | "cheytac") {
                    self.add_world_circle(
                        origin_x - direction * size * 0.10,
                        y + size * 0.13,
                        size * 0.10,
                        hex("#3F2A1D"),
                        8,
                        world,
                    );
                }
            }
            _ => {
                self.add_world_rect(
                    origin_x,
                    y + size * 0.04,
                    size * 0.46,
                    size * 0.12,
                    outline,
                    world,
                );
                self.add_world_rect(
                    origin_x,
                    y + size * 0.01,
                    size * 0.34,
                    size * 0.06,
                    metal,
                    world,
                );
            }
        }
    }

    fn add_projectile(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let radius = entity.size * 0.52;
        let velocity_length =
            (entity.velocity_x * entity.velocity_x + entity.velocity_y * entity.velocity_y).sqrt();
        let direction_x = if velocity_length > 0.001 {
            entity.velocity_x / velocity_length
        } else {
            1.0
        };
        let direction_y = if velocity_length > 0.001 {
            entity.velocity_y / velocity_length
        } else {
            0.0
        };
        let tracer = if entity.tracer_length > 0.0 {
            entity.tracer_length
        } else if entity.projectile_range > 1_800.0 {
            72.0
        } else {
            18.0
        };
        let width = if entity.tracer_width > 0.0 {
            entity.tracer_width
        } else if entity.projectile_range > 1_800.0 {
            4.8
        } else {
            2.0
        };
        match entity.projectile_type.as_str() {
            "magic_orb" | "fireball" => {
                self.add_world_circle(
                    x,
                    y,
                    radius * 1.8,
                    [entity.color[0], entity.color[1], entity.color[2], 0.13],
                    16,
                    world,
                );
                self.add_world_circle(x, y, radius, entity.color, 14, world);
                self.add_world_circle(x, y, radius * 0.42, [1.0, 0.97, 0.93, 1.0], 10, world);
            }
            "slash_wave" => {
                for step in 0..5 {
                    let angle = -0.78 + step as f32 * 0.39;
                    let r = radius * 1.55;
                    self.add_world_line(
                        x + angle.cos() * r,
                        y + angle.sin() * r,
                        x + (angle + 0.22).cos() * r,
                        y + (angle + 0.22).sin() * r,
                        3.5,
                        entity.color,
                        world,
                    );
                }
            }
            "thrown_knife" => {
                self.add_world_triangle(
                    [
                        x + direction_x * radius * 1.4,
                        y + direction_y * radius * 1.4,
                    ],
                    [
                        x - direction_y * radius * 0.38 - direction_x * radius,
                        y + direction_x * radius * 0.38 - direction_y * radius,
                    ],
                    [
                        x + direction_y * radius * 0.38 - direction_x * radius,
                        y - direction_x * radius * 0.38 - direction_y * radius,
                    ],
                    [0.89, 0.93, 0.96, 1.0],
                    world,
                );
            }
            "meteor" | "boss_meteor" => {
                self.add_world_ellipse(x, y, radius, radius * 0.7, hex("#1C1917"), 14, world);
                self.add_world_triangle(
                    [x - direction_x * radius, y - direction_y * radius],
                    [
                        x - direction_x * radius * 2.6 - direction_y * radius * 0.38,
                        y - direction_y * radius * 2.6 + direction_x * radius * 0.38,
                    ],
                    [
                        x - direction_x * radius * 2.6 + direction_y * radius * 0.38,
                        y - direction_y * radius * 2.6 - direction_x * radius * 0.38,
                    ],
                    hex("#FB7185"),
                    world,
                );
            }
            "spinning_blade" => {
                let rotation = entity.distance_traveled * 0.18;
                let points = (0..6)
                    .map(|index| {
                        let angle = rotation + std::f32::consts::TAU * index as f32 / 6.0;
                        let r = if index % 2 == 0 {
                            radius
                        } else {
                            radius * 0.45
                        };
                        [x + angle.cos() * r, y + angle.sin() * r]
                    })
                    .collect::<Vec<_>>();
                for edge in 0..6 {
                    self.add_world_triangle(
                        [x, y],
                        points[edge],
                        points[(edge + 1) % 6],
                        [0.80, 0.84, 0.89, 1.0],
                        world,
                    );
                }
            }
            "falling_sword" => {
                self.add_world_rect(
                    x,
                    y - radius * 0.45,
                    radius * 0.34,
                    radius * 2.2,
                    hex("#0F172A"),
                    world,
                );
                self.add_world_rect(
                    x,
                    y - radius * 0.45,
                    radius * 0.22,
                    radius * 1.95,
                    hex("#E0F2FE"),
                    world,
                );
                self.add_world_rect(
                    x,
                    y + radius * 0.60,
                    radius * 0.78,
                    radius * 0.20,
                    hex("#F59E0B"),
                    world,
                );
            }
            "lightning_bolt" => {
                let mut previous = [x, y - radius * 18.0];
                for segment in 1..=6 {
                    let progress = segment as f32 / 6.0;
                    let phase = entity.distance_traveled * 0.037 + segment as f32 * 2.17;
                    let next = [
                        x + phase.sin() * radius * 1.35 * (1.0 - progress),
                        y - radius * 18.0 * (1.0 - progress),
                    ];
                    self.add_world_line(
                        previous[0],
                        previous[1],
                        next[0],
                        next[1],
                        radius * 0.82,
                        entity.color,
                        world,
                    );
                    self.add_world_line(
                        previous[0],
                        previous[1],
                        next[0],
                        next[1],
                        radius * 0.30,
                        [1.0, 1.0, 1.0, 0.94],
                        world,
                    );
                    previous = next;
                }
            }
            "void_singularity" => {
                let pulse = 1.0 + (world.time_seconds * 10.0).sin() * 0.16;
                self.add_world_circle(
                    x,
                    y,
                    radius * pulse * 1.22,
                    [0.49, 0.23, 0.93, 0.24],
                    18,
                    world,
                );
                self.add_world_circle(x, y, radius, [0.49, 0.23, 0.93, 0.62], 18, world);
                self.add_world_circle(x, y, radius * 0.45, hex("#0F172A"), 14, world);
                self.add_world_circle(x, y, radius * 0.15, [0.96, 0.45, 0.71, 0.92], 10, world);
            }
            "laser" => {
                self.add_world_line(
                    x - direction_x * tracer,
                    y - direction_y * tracer,
                    x + direction_x * 12.0,
                    y + direction_y * 12.0,
                    width * 2.4,
                    [entity.color[0], entity.color[1], entity.color[2], 0.18],
                    world,
                );
                self.add_world_line(
                    x - direction_x * tracer,
                    y - direction_y * tracer,
                    x + direction_x * 12.0,
                    y + direction_y * 12.0,
                    width,
                    entity.color,
                    world,
                );
                self.add_world_circle(
                    x + direction_x * 12.0,
                    y + direction_y * 12.0,
                    radius * 0.42,
                    [1.0, 1.0, 1.0, 1.0],
                    8,
                    world,
                );
            }
            _ => {
                self.add_world_line(
                    x - direction_x * tracer,
                    y - direction_y * tracer,
                    x + direction_x * 6.0,
                    y + direction_y * 6.0,
                    width * 2.8,
                    [entity.color[0], entity.color[1], entity.color[2], 0.15],
                    world,
                );
                self.add_world_line(
                    x - direction_x * tracer,
                    y - direction_y * tracer,
                    x + direction_x * 6.0,
                    y + direction_y * 6.0,
                    width,
                    entity.color,
                    world,
                );
                self.add_world_circle(
                    x + direction_x * 6.0,
                    y + direction_y * 6.0,
                    (radius * 0.28).max(1.1),
                    [1.0, 1.0, 1.0, 1.0],
                    8,
                    world,
                );
            }
        }
    }

    fn add_particle(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size.max(1.0);
        let color = entity.color;
        match entity.effect_type.as_str() {
            "spark" => {
                let speed = entity.velocity_x.hypot(entity.velocity_y);
                let (dx, dy) = if speed > 0.01 {
                    (entity.velocity_x / speed, entity.velocity_y / speed)
                } else {
                    (1.0, 0.0)
                };
                self.add_world_line(
                    x - dx * size * 2.8,
                    y - dy * size * 2.8,
                    x + dx * size * 0.7,
                    y + dy * size * 0.7,
                    (size * 0.42).max(0.7),
                    color,
                    world,
                );
            }
            "star" => {
                for point in 0..5 {
                    let a0 =
                        std::f32::consts::TAU * point as f32 / 5.0 - std::f32::consts::FRAC_PI_2;
                    let a1 = std::f32::consts::TAU * (point + 1) as f32 / 5.0
                        - std::f32::consts::FRAC_PI_2;
                    self.add_world_triangle(
                        [x, y],
                        [x + a0.cos() * size, y + a0.sin() * size],
                        [x + a1.cos() * size * 0.52, y + a1.sin() * size * 0.52],
                        color,
                        world,
                    );
                }
            }
            "ring" => {
                let radius = size * 0.95;
                let width = (size * 0.22).max(0.8);
                for segment in 0..12 {
                    let start = std::f32::consts::TAU * segment as f32 / 12.0;
                    let end = std::f32::consts::TAU * (segment + 1) as f32 / 12.0;
                    self.add_world_line(
                        x + start.cos() * radius,
                        y + start.sin() * radius,
                        x + end.cos() * radius,
                        y + end.sin() * radius,
                        width,
                        color,
                        world,
                    );
                }
            }
            "casing" => {
                self.add_world_rect(x, y, size * 0.70, size * 1.9, hex("#78350F"), world);
                self.add_world_rect(x, y - size * 0.35, size * 0.60, size * 0.48, color, world);
            }
            "smoke" => {
                self.add_world_circle(
                    x,
                    y,
                    size * 1.22,
                    [color[0], color[1], color[2], color[3] * 0.42],
                    14,
                    world,
                );
                self.add_world_circle(
                    x + size * 0.44,
                    y - size * 0.28,
                    size * 0.82,
                    [color[0], color[1], color[2], color[3] * 0.30],
                    12,
                    world,
                );
            }
            "petal" => {
                self.add_world_ellipse(x, y, size * 0.68, size * 0.36, color, 10, world);
            }
            _ => self.add_world_circle(x, y, size, color, 12, world),
        }
    }

    fn add_resource(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size;
        self.add_world_rect(
            x,
            y + size * 0.18,
            size * 0.20,
            size * 0.72,
            [0.25, 0.12, 0.04, 1.0],
            world,
        );
        self.add_world_circle(x, y - size * 0.23, size * 0.48, entity.color, 12, world);
        self.add_world_circle(
            x - size * 0.25,
            y - size * 0.05,
            size * 0.30,
            entity.color,
            10,
            world,
        );
        self.add_world_circle(
            x + size * 0.25,
            y - size * 0.05,
            size * 0.30,
            entity.color,
            10,
            world,
        );
    }

    fn add_vehicle(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size;
        self.add_world_rect(
            x,
            y,
            size * 1.65,
            size * 0.78,
            [0.01, 0.02, 0.05, 1.0],
            world,
        );
        self.add_world_rect(
            x,
            y - size * 0.05,
            size * 1.42,
            size * 0.58,
            entity.color,
            world,
        );
        self.add_world_rect(
            x,
            y - size * 0.16,
            size * 0.64,
            size * 0.30,
            [0.62, 0.85, 1.0, 0.86],
            world,
        );
        self.add_world_circle(
            x - size * 0.56,
            y + size * 0.34,
            size * 0.17,
            [0.02, 0.02, 0.03, 1.0],
            10,
            world,
        );
        self.add_world_circle(
            x + size * 0.56,
            y + size * 0.34,
            size * 0.17,
            [0.02, 0.02, 0.03, 1.0],
            10,
            world,
        );
    }

    fn add_pickup(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size;
        self.add_world_rect(x, y, size, size * 0.72, [0.02, 0.04, 0.08, 1.0], world);
        self.add_world_rect(x, y, size * 0.76, size * 0.52, entity.color, world);
        self.add_world_circle(
            x,
            y - size * 0.05,
            size * 0.14,
            [1.0, 0.9, 0.25, 1.0],
            8,
            world,
        );
    }

    fn add_decal(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let radius = entity.size.max(1.0);
        match entity.effect_type.as_str() {
            "fire_pool" => {
                self.add_world_ellipse(x, y, radius, radius * 0.65, [0.92, 0.22, 0.03, entity.color[3] * 0.42], 18, world);
                let flicker = 0.78 + (world.time_seconds * 12.0 + x).sin() * 0.16;
                self.add_world_ellipse(x, y, radius * flicker, radius * 0.42 * flicker, [0.96, 0.55, 0.04, entity.color[3] * 0.82], 18, world);
                self.add_world_circle(x, y, (radius * 0.18).max(2.0), [1.0, 0.94, 0.54, entity.color[3]], 10, world);
            }
            "ice_trail" => {
                self.add_world_ellipse(x, y, radius, radius * 0.65, [0.45, 0.86, 0.98, entity.color[3] * 0.42], 18, world);
                self.add_world_ellipse(x, y, radius, radius * 0.65, [0.22, 0.72, 0.98, entity.color[3] * 0.20], 18, world);
            }
            _ => {
                self.add_world_ellipse(x, y, radius, radius * 0.60, entity.color, 16, world);
                for step in 0..3 {
                    let angle = step as f32 * std::f32::consts::TAU / 3.0;
                    self.add_world_circle(
                        x + angle.cos() * radius * 1.25,
                        y + angle.sin() * radius * 0.75,
                        (radius * 0.09).max(1.5),
                        entity.color,
                        8,
                        world,
                    );
                }
            }
        }
    }

    fn add_summon(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size.max(12.0);
        let outline = [0.02, 0.03, 0.06, 0.96];
        match entity.effect_type.as_str() {
            "golem" => {
                self.add_world_rect(x, y - size * 0.16, size * 1.08, size * 1.20, outline, world);
                self.add_world_rect(x, y - size * 0.16, size * 0.94, size * 1.04, entity.color, world);
                self.add_world_rect(x, y - size * 0.76, size * 0.70, size * 0.34, [0.47, 0.44, 0.40, 1.0], world);
                for offset in [-0.16_f32, 0.16] {
                    self.add_world_circle(x + size * offset, y - size * 0.76, size * 0.07, [0.96, 0.60, 0.06, 1.0], 8, world);
                }
            }
            "totem" => {
                self.add_world_rect(x, y - size * 0.34, size * 0.30, size * 1.55, [0.30, 0.11, 0.58, 1.0], world);
                self.add_world_triangle(
                    [x - size * 0.20, y - size * 1.05],
                    [x, y - size * 1.48],
                    [x + size * 0.20, y - size * 1.05],
                    entity.color,
                    world,
                );
                self.add_world_circle(x, y - size * 1.28, size * 0.13, [0.86, 0.70, 1.0, 0.92], 10, world);
            }
            _ => {
                self.add_world_ellipse(x, y + size * 0.22, size * 0.56, size * 0.18, [0.0, 0.0, 0.0, 0.32], 12, world);
                self.add_world_rect(x, y, size * 0.86, size * 0.48, [0.50, 0.11, 0.11, 1.0], world);
                self.add_world_circle(x + size * 0.28, y - size * 0.28, size * 0.27, outline, 12, world);
                self.add_world_circle(x + size * 0.34, y - size * 0.33, size * 0.07, entity.color, 8, world);
            }
        }
    }

    fn add_popup(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size.max(4.0);
        if entity.effect_type == "heal" {
            self.add_world_circle(x, y, size * 0.52, entity.color, 10, world);
            self.add_world_rect(x, y, size * 0.20, size * 1.30, [1.0, 1.0, 1.0, entity.color[3]], world);
            self.add_world_rect(x, y, size * 1.30, size * 0.20, [1.0, 1.0, 1.0, entity.color[3]], world);
        } else {
            for point in 0..5 {
                let start = std::f32::consts::TAU * point as f32 / 5.0 - std::f32::consts::FRAC_PI_2;
                let end = std::f32::consts::TAU * (point + 1) as f32 / 5.0 - std::f32::consts::FRAC_PI_2;
                self.add_world_triangle(
                    [x, y],
                    [x + start.cos() * size, y + start.sin() * size],
                    [x + end.cos() * size * 0.54, y + end.sin() * size * 0.54],
                    entity.color,
                    world,
                );
            }
        }
    }

    fn add_forest_wolf(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size.max(20.0);
        self.add_world_ellipse(x, y + size * 0.33, size * 0.58, size * 0.16, [0.0, 0.0, 0.0, 0.40], 14, world);
        self.add_world_rect(x, y, size * 0.98, size * 0.58, [0.20, 0.25, 0.32, 1.0], world);
        self.add_world_circle(x + size * 0.34, y - size * 0.17, size * 0.30, [0.12, 0.18, 0.25, 1.0], 14, world);
        self.add_world_circle(x + size * 0.44, y - size * 0.22, size * 0.055, [0.94, 0.18, 0.25, 1.0], 8, world);
    }

    #[allow(dead_code)]
    fn add_grid(&mut self, world: &NativeRenderFrame) {
        let half_width = world.viewport_width / world.zoom / 2.0;
        let half_height = world.viewport_height / world.zoom / 2.0;
        let min_x = ((world.camera_x - half_width) / GRID_SPACING).floor() as i32;
        let max_x = ((world.camera_x + half_width) / GRID_SPACING).ceil() as i32;
        let min_y = ((world.camera_y - half_height) / GRID_SPACING).floor() as i32;
        let max_y = ((world.camera_y + half_height) / GRID_SPACING).ceil() as i32;
        let color = [0.08, 0.18, 0.30, 0.38];
        for grid_x in (min_x..=max_x).take(MAX_GRID_LINES) {
            let x = grid_x as f32 * GRID_SPACING;
            self.add_world_rect(
                x,
                world.camera_y,
                1.25 / world.zoom,
                half_height * 2.0,
                color,
                world,
            );
        }
        for grid_y in (min_y..=max_y).take(MAX_GRID_LINES) {
            let y = grid_y as f32 * GRID_SPACING;
            self.add_world_rect(
                world.camera_x,
                y,
                half_width * 2.0,
                1.25 / world.zoom,
                color,
                world,
            );
        }
    }

    fn add_world_rect(
        &mut self,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        let half_width = width / 2.0;
        let half_height = height / 2.0;
        let top_left = self.world_to_ndc(x - half_width, y - half_height, world);
        let top_right = self.world_to_ndc(x + half_width, y - half_height, world);
        let bottom_right = self.world_to_ndc(x + half_width, y + half_height, world);
        let bottom_left = self.world_to_ndc(x - half_width, y + half_height, world);
        self.vertices.extend_from_slice(&[
            Vertex {
                position: top_left,
                color,
            },
            Vertex {
                position: bottom_left,
                color,
            },
            Vertex {
                position: bottom_right,
                color,
            },
            Vertex {
                position: top_left,
                color,
            },
            Vertex {
                position: bottom_right,
                color,
            },
            Vertex {
                position: top_right,
                color,
            },
        ]);
    }

    fn add_overlay_world_rect(
        &mut self,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        let half_width = width * 0.5;
        let half_height = height * 0.5;
        let top_left = self.world_to_ndc(x - half_width, y - half_height, world);
        let top_right = self.world_to_ndc(x + half_width, y - half_height, world);
        let bottom_right = self.world_to_ndc(x + half_width, y + half_height, world);
        let bottom_left = self.world_to_ndc(x - half_width, y + half_height, world);
        self.overlay_vertices.extend_from_slice(&[
            Vertex {
                position: top_left,
                color,
            },
            Vertex {
                position: bottom_left,
                color,
            },
            Vertex {
                position: bottom_right,
                color,
            },
            Vertex {
                position: top_left,
                color,
            },
            Vertex {
                position: bottom_right,
                color,
            },
            Vertex {
                position: top_right,
                color,
            },
        ]);
    }

    fn add_world_circle(
        &mut self,
        x: f32,
        y: f32,
        radius: f32,
        color: [f32; 4],
        segments: usize,
        world: &NativeRenderFrame,
    ) {
        let center = self.world_to_ndc(x, y, world);
        let segments = segments.clamp(3, 24);
        for index in 0..segments {
            let start = std::f32::consts::TAU * index as f32 / segments as f32;
            let end = std::f32::consts::TAU * (index + 1) as f32 / segments as f32;
            let first =
                self.world_to_ndc(x + start.cos() * radius, y + start.sin() * radius, world);
            let second = self.world_to_ndc(x + end.cos() * radius, y + end.sin() * radius, world);
            self.vertices.extend_from_slice(&[
                Vertex {
                    position: center,
                    color,
                },
                Vertex {
                    position: first,
                    color,
                },
                Vertex {
                    position: second,
                    color,
                },
            ]);
        }
    }

    fn add_world_ellipse(
        &mut self,
        x: f32,
        y: f32,
        radius_x: f32,
        radius_y: f32,
        color: [f32; 4],
        segments: usize,
        world: &NativeRenderFrame,
    ) {
        let center = self.world_to_ndc(x, y, world);
        let segments = segments.clamp(3, 36);
        for index in 0..segments {
            let start = std::f32::consts::TAU * index as f32 / segments as f32;
            let end = std::f32::consts::TAU * (index + 1) as f32 / segments as f32;
            let first = self.world_to_ndc(
                x + start.cos() * radius_x,
                y + start.sin() * radius_y,
                world,
            );
            let second =
                self.world_to_ndc(x + end.cos() * radius_x, y + end.sin() * radius_y, world);
            self.vertices.extend_from_slice(&[
                Vertex {
                    position: center,
                    color,
                },
                Vertex {
                    position: first,
                    color,
                },
                Vertex {
                    position: second,
                    color,
                },
            ]);
        }
    }

    fn add_world_line(
        &mut self,
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
        width: f32,
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        let dx = end_x - start_x;
        let dy = end_y - start_y;
        let length = (dx * dx + dy * dy).sqrt();
        if length <= f32::EPSILON || !length.is_finite() {
            return;
        }
        let normal_x = -dy / length * width * 0.5;
        let normal_y = dx / length * width * 0.5;
        self.add_world_quad(
            [start_x + normal_x, start_y + normal_y],
            [start_x - normal_x, start_y - normal_y],
            [end_x - normal_x, end_y - normal_y],
            [end_x + normal_x, end_y + normal_y],
            color,
            world,
        );
    }

    fn add_world_triangle(
        &mut self,
        first: [f32; 2],
        second: [f32; 2],
        third: [f32; 2],
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        self.vertices.extend_from_slice(&[
            Vertex {
                position: self.world_to_ndc(first[0], first[1], world),
                color,
            },
            Vertex {
                position: self.world_to_ndc(second[0], second[1], world),
                color,
            },
            Vertex {
                position: self.world_to_ndc(third[0], third[1], world),
                color,
            },
        ]);
    }

    fn add_world_quad(
        &mut self,
        first: [f32; 2],
        second: [f32; 2],
        third: [f32; 2],
        fourth: [f32; 2],
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        let first = self.world_to_ndc(first[0], first[1], world);
        let second = self.world_to_ndc(second[0], second[1], world);
        let third = self.world_to_ndc(third[0], third[1], world);
        let fourth = self.world_to_ndc(fourth[0], fourth[1], world);
        self.vertices.extend_from_slice(&[
            Vertex {
                position: first,
                color,
            },
            Vertex {
                position: second,
                color,
            },
            Vertex {
                position: third,
                color,
            },
            Vertex {
                position: first,
                color,
            },
            Vertex {
                position: third,
                color,
            },
            Vertex {
                position: fourth,
                color,
            },
        ]);
    }

    fn add_screen_quad(
        &mut self,
        origin: [f32; 2],
        size: [f32; 2],
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        let top_left = self.screen_to_ndc(origin[0], origin[1], world);
        let top_right = self.screen_to_ndc(origin[0] + size[0], origin[1], world);
        let bottom_right = self.screen_to_ndc(origin[0] + size[0], origin[1] + size[1], world);
        let bottom_left = self.screen_to_ndc(origin[0], origin[1] + size[1], world);
        self.vertices.extend_from_slice(&[
            Vertex {
                position: top_left,
                color,
            },
            Vertex {
                position: bottom_left,
                color,
            },
            Vertex {
                position: bottom_right,
                color,
            },
            Vertex {
                position: top_left,
                color,
            },
            Vertex {
                position: bottom_right,
                color,
            },
            Vertex {
                position: top_right,
                color,
            },
        ]);
    }

    fn world_to_ndc(&self, x: f32, y: f32, world: &NativeRenderFrame) -> [f32; 2] {
        self.screen_to_ndc(
            (x - world.camera_x) * world.zoom + world.viewport_width / 2.0,
            (y - world.camera_y) * world.zoom + world.viewport_height / 2.0,
            world,
        )
    }

    fn screen_to_ndc(&self, x: f32, y: f32, world: &NativeRenderFrame) -> [f32; 2] {
        [
            x / world.viewport_width * 2.0 - 1.0,
            1.0 - y / world.viewport_height * 2.0,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_palette_matches_canvas_hex() {
        assert_eq!(
            hex("#162C1E"),
            [
                srgb_to_linear(22.0 / 255.0),
                srgb_to_linear(44.0 / 255.0),
                srgb_to_linear(30.0 / 255.0),
                1.0,
            ]
        );
        assert_eq!(hex("not-a-colour"), [1.0, 0.0, 1.0, 1.0]);
    }

    #[test]
    fn native_frame_preserves_chibi_recipe_and_projectile_shape() {
        let frame: NativeRenderFrame = serde_json::from_str(
            r##"{
                "cameraX": 680, "cameraY": 650, "zoom": 1,
                "viewportWidth": 1920, "viewportHeight": 1080,
                "timeSeconds": 42.5, "theme": "forest_camp",
                "entities": [{
                    "id": "player-1", "kind": "player", "x": 680, "y": 650,
                    "size": 38, "color": [0.1, 0.9, 1, 1],
                    "projectileType": "magic_orb", "tracerLength": 18,
                    "weaponType": "cheytac", "hasShield": true,
                    "chibi": {"hairStyle": "miku_twintails", "hairColor": "#38BDF8", "coatColor": "#FFFFFF", "skirtColor": "#334155", "earType": "cat", "earColor": "#38BDF8"},
                    "animation": {"state": "walk", "isSprinting": true, "jumpZ": 12}
                }]
            }"##,
        )
        .expect("native bridge frame must deserialize");
        let mut state = NativeWorldState::default();
        state.apply(frame);
        let entity = &state.frame.expect("frame is retained").entities[0];
        assert_eq!(
            entity
                .chibi
                .as_ref()
                .map(|recipe| recipe.hair_style.as_str()),
            Some("miku_twintails")
        );
        assert_eq!(entity.projectile_type, "magic_orb");
        assert_eq!(entity.weapon_type, "cheytac");
        assert!(entity.has_shield);
        assert!(
            entity
                .animation
                .as_ref()
                .is_some_and(|animation| animation.is_sprinting)
        );
    }

    #[test]
    fn native_sprite_resolver_owns_operator_selection() {
        let yuuka = NativeChibiRecipe {
            front_hair_style: "straight_bangs".into(),
            back_hair_style: "twintails".into(),
            hair_color: "#38BDF8".into(),
            hat_type: "cyber_cap".into(),
            outfit_type: "gym_bloomer".into(),
            ..NativeChibiRecipe::default()
        };
        assert_eq!(
            native_sprites::resolve_actor_frame(
                "player", "local", "", "", "pistol", "", false, Some(&yuuka),
            ),
            Some("character_bloomer_yuuka_pistol")
        );
        assert_eq!(
            native_sprites::resolve_actor_frame(
                "npc", "npc_hank_guide", "", "", "", "", false, None,
            ),
            Some("npc_npc_hank_guide")
        );
        assert_eq!(
            native_sprites::resolve_actor_frame(
                "monster", "", "punk_demon", "punk_grunt", "", "", false, None,
            ),
            Some("punk_punk_grunt")
        );
    }

    #[test]
    fn canonical_scene_is_staged_only_when_bounded() {
        let scene: NativeRenderScene = serde_json::from_str(
            r##"{
                "version": 1,
                "viewport": {"width": 1920, "height": 1080},
                "camera": {"x": 680, "y": 650, "zoom": 1},
                "timeSeconds": 42.5,
                "commands": [
                    {"op": "set", "property": "fillStyle", "value": "#162C1E"},
                    {"op": "call", "method": "fillRect", "args": [0, 0, 1920, 1080]}
                ]
            }"##,
        )
        .expect("canonical scene must deserialize");
        let mut state = NativeWorldState::default();
        state.apply_scene(scene);
        assert_eq!(state.scene_command_count(), Some(2));

        let invalid: NativeRenderScene = serde_json::from_str(
            r##"{
                "version": 1,
                "viewport": {"width": 1920, "height": 1080},
                "camera": {"x": 680, "y": 650, "zoom": 1},
                "commands": [{"op": "resourceCall", "ref": 0, "method": "addColorStop", "args": [0, "red"]}]
            }"##,
        )
        .expect("invalid payload shape still deserializes before validation");
        state.apply_scene(invalid);
        assert_eq!(state.scene_command_count(), Some(2));
    }
}
