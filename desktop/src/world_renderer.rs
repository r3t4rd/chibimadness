use std::{borrow::Cow, collections::HashMap, time::Instant};

use bytemuck::{Pod, Zeroable};
use serde::{Deserialize, Serialize};
use yuyib::render::{RenderFrame, wgpu};

const MAX_RENDER_ENTITIES: usize = 2_048;
const GRID_SPACING: f32 = 160.0;
const MAX_GRID_LINES: usize = 96;
const MAX_PREDICTION_SECONDS: f32 = 0.12;
const MAX_ENTITY_SPEED: f32 = 10_000.0;

const WORLD_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@location(0) position: vec2<f32>, @location(1) color: vec4<f32>) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(position, 0.0, 1.0);
    output.color = color;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
"#;

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
    pub theme: String,
    #[serde(default)]
    pub entities: Vec<NativeRenderEntity>,
}

fn default_hp_ratio() -> f32 {
    1.0
}

#[derive(Default)]
pub struct NativeWorldState {
    frame: Option<NativeRenderFrame>,
    received_at: Option<Instant>,
}

impl NativeWorldState {
    pub fn apply(&mut self, mut frame: NativeRenderFrame) {
        if !frame.camera_x.is_finite()
            || !frame.camera_y.is_finite()
            || !frame.zoom.is_finite()
            || !frame.viewport_width.is_finite()
            || !frame.viewport_height.is_finite()
        {
            return;
        }
        frame.zoom = frame.zoom.clamp(0.2, 8.0);
        frame.viewport_width = frame.viewport_width.clamp(1.0, 16_384.0);
        frame.viewport_height = frame.viewport_height.clamp(1.0, 16_384.0);
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
                && entity.kind.len() <= 32
                && entity.faction.len() <= 32
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
            for channel in &mut entity.color {
                *channel = channel.clamp(0.0, 1.0);
            }
        }
        frame.entities.sort_by_key(|entity| entity.layer);
        self.frame = Some(frame);
        self.received_at = Some(received_at);
    }

    fn frame_with_prediction(&self) -> Option<(&NativeRenderFrame, f32)> {
        self.frame.as_ref().map(|frame| {
            let prediction_seconds = self
                .received_at
                .map(|received_at| {
                    (Instant::now() - received_at)
                        .as_secs_f32()
                        .clamp(0.0, MAX_PREDICTION_SECONDS)
                })
                .unwrap_or_default();
            (frame, prediction_seconds)
        })
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex {
    position: [f32; 2],
    color: [f32; 4],
}

pub struct NativeWorldRenderer {
    pipeline: Option<wgpu::RenderPipeline>,
    surface_format: Option<wgpu::TextureFormat>,
    vertex_buffer: Option<wgpu::Buffer>,
    vertex_capacity: usize,
    vertices: Vec<Vertex>,
    last_presented_at: Option<Instant>,
    metrics_started_at: Instant,
    metrics_frame_count: u32,
    metrics_total_ms: f32,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererMetrics {
    pub fps: u32,
    pub frame_ms: f32,
}

impl Default for NativeWorldRenderer {
    fn default() -> Self {
        Self {
            pipeline: None,
            surface_format: None,
            vertex_buffer: None,
            vertex_capacity: 0,
            vertices: Vec::new(),
            last_presented_at: None,
            metrics_started_at: Instant::now(),
            metrics_frame_count: 0,
            metrics_total_ms: 0.0,
        }
    }
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
        };
        self.metrics_started_at = now;
        self.metrics_frame_count = 0;
        self.metrics_total_ms = 0.0;
        Some(metrics)
    }

    pub fn render(&mut self, frame: &mut RenderFrame<'_>, state: &NativeWorldState) {
        let Some((world, prediction_seconds)) = state.frame_with_prediction() else {
            return;
        };
        self.build_vertices(world, prediction_seconds);
        if self.vertices.is_empty() {
            return;
        }
        self.ensure_pipeline(frame);
        self.upload_vertices(frame);
        let (Some(pipeline), Some(vertex_buffer)) = (&self.pipeline, &self.vertex_buffer) else {
            return;
        };
        let vertex_count = self.vertices.len() as u32;
        frame.with_surface_pass(wgpu::LoadOp::Load, |pass| {
            pass.set_pipeline(pipeline);
            pass.set_vertex_buffer(0, vertex_buffer.slice(..));
            pass.draw(0..vertex_count, 0..1);
        });
    }

    fn ensure_pipeline(&mut self, frame: &RenderFrame<'_>) {
        let format = frame.surface_format();
        if self.pipeline.is_some() && self.surface_format == Some(format) {
            return;
        }
        let device = frame.device();
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("chibimadness native world shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(WORLD_SHADER)),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("chibimadness native world layout"),
            bind_group_layouts: &[],
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
        self.surface_format = Some(format);
    }

    fn upload_vertices(&mut self, frame: &RenderFrame<'_>) {
        use wgpu::util::DeviceExt;

        let bytes = bytemuck::cast_slice(&self.vertices);
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

    fn build_vertices(&mut self, world: &NativeRenderFrame, prediction_seconds: f32) {
        self.vertices.clear();
        // The native pass intentionally owns the world surface. The WebView
        // stays transparent and therefore cannot force WebView2 to composite
        // a full-screen Canvas2D texture every gameplay frame.
        self.add_district(world);
        for entity in &world.entities {
            let x = entity.x + entity.velocity_x * prediction_seconds;
            let y = entity.y + entity.velocity_y * prediction_seconds;
            self.add_entity(entity, x, y, world);
        }
    }

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
        let shadow = [0.0, 0.0, 0.0, (entity.color[3] * 0.34).min(0.34)];
        self.add_world_rect(
            x + entity.size * 0.10,
            y + entity.size * 0.30,
            entity.size * 0.94,
            entity.size * 0.24,
            shadow,
            world,
        );
        match entity.kind.as_str() {
            "projectile" => self.add_projectile(entity, x, y, world),
            "resource" => self.add_resource(entity, x, y, world),
            "vehicle" => self.add_vehicle(entity, x, y, world),
            "pickup" | "poi" => self.add_pickup(entity, x, y, world),
            _ => self.add_humanoid(entity, x, y, world),
        }
    }

    fn add_humanoid(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let size = entity.size;
        let outline = [0.008, 0.014, 0.035, 0.94];
        let skin = if entity.kind == "player" {
            [1.0, 0.84, 0.72, 1.0]
        } else {
            [0.98, 0.72, 0.60, 1.0]
        };
        let hair = if entity.kind == "player" {
            [0.15, 0.88, 1.0, 1.0]
        } else if entity.faction == "punk_demon" {
            [1.0, 0.16, 0.31, 1.0]
        } else {
            entity.color
        };
        self.add_world_rect(x, y + size * 0.10, size * 0.60, size * 0.62, outline, world);
        self.add_world_rect(
            x,
            y + size * 0.08,
            size * 0.50,
            size * 0.54,
            entity.color,
            world,
        );
        self.add_world_circle(x, y - size * 0.28, size * 0.34, outline, 12, world);
        self.add_world_circle(x, y - size * 0.30, size * 0.29, skin, 12, world);
        self.add_world_circle(x, y - size * 0.43, size * 0.30, hair, 12, world);
        self.add_world_rect(x, y - size * 0.29, size * 0.46, size * 0.12, hair, world);
        let eye_offset = if entity.facing_left {
            -size * 0.10
        } else {
            size * 0.10
        };
        self.add_world_circle(
            x + eye_offset,
            y - size * 0.30,
            size * 0.045,
            [0.02, 0.08, 0.13, 1.0],
            8,
            world,
        );
        let weapon_direction = if entity.facing_left { -1.0 } else { 1.0 };
        self.add_world_rect(
            x + weapon_direction * size * 0.42,
            y + size * 0.04,
            size * 0.46,
            size * 0.12,
            outline,
            world,
        );
        self.add_world_rect(
            x + weapon_direction * size * 0.42,
            y + size * 0.01,
            size * 0.34,
            size * 0.06,
            [0.58, 0.66, 0.76, 1.0],
            world,
        );
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

    fn add_projectile(
        &mut self,
        entity: &NativeRenderEntity,
        x: f32,
        y: f32,
        world: &NativeRenderFrame,
    ) {
        let radius = entity.size * 0.52;
        self.add_world_circle(
            x - entity.velocity_x.signum() * radius * 1.5,
            y,
            radius * 1.7,
            [entity.color[0], entity.color[1], entity.color[2], 0.16],
            10,
            world,
        );
        self.add_world_circle(x, y, radius, entity.color, 10, world);
        self.add_world_circle(x, y, radius * 0.34, [1.0, 0.95, 0.76, 1.0], 8, world);
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
