use std::borrow::Cow;

use bytemuck::{Pod, Zeroable};
use serde::Deserialize;
use yuyib::render::{RenderFrame, wgpu};

const MAX_RENDER_ENTITIES: usize = 2_048;
const GRID_SPACING: f32 = 160.0;
const MAX_GRID_LINES: usize = 96;

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
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub color: [f32; 4],
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
    pub entities: Vec<NativeRenderEntity>,
}

#[derive(Default)]
pub struct NativeWorldState {
    frame: Option<NativeRenderFrame>,
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
            entity.x.is_finite()
                && entity.y.is_finite()
                && entity.size.is_finite()
                && entity.color.iter().all(|value| value.is_finite())
        });
        for entity in &mut frame.entities {
            entity.size = entity.size.clamp(1.0, 256.0);
            for channel in &mut entity.color {
                *channel = channel.clamp(0.0, 1.0);
            }
        }
        frame.entities.sort_by_key(|entity| entity.layer);
        self.frame = Some(frame);
    }

    fn frame(&self) -> Option<&NativeRenderFrame> {
        self.frame.as_ref()
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
}

impl Default for NativeWorldRenderer {
    fn default() -> Self {
        Self {
            pipeline: None,
            surface_format: None,
            vertex_buffer: None,
            vertex_capacity: 0,
            vertices: Vec::new(),
        }
    }
}

impl NativeWorldRenderer {
    pub fn render(&mut self, frame: &mut RenderFrame<'_>, state: &NativeWorldState) {
        let Some(world) = state.frame() else {
            return;
        };
        self.build_vertices(world);
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

    fn build_vertices(&mut self, world: &NativeRenderFrame) {
        self.vertices.clear();
        // The native pass intentionally owns the base world surface. The UI
        // WebView is transparent, so no WebView2 canvas is composited here.
        self.add_screen_quad(
            [0.0, 0.0],
            [world.viewport_width, world.viewport_height],
            [0.018, 0.035, 0.09, 1.0],
            world,
        );
        self.add_grid(world);
        for entity in &world.entities {
            let shadow = [0.0, 0.0, 0.0, (entity.color[3] * 0.32).min(0.32)];
            self.add_world_quad(
                entity.x + entity.size * 0.12,
                entity.y + entity.size * 0.28,
                entity.size * 1.12,
                shadow,
                world,
            );
            self.add_world_quad(entity.x, entity.y, entity.size, entity.color, world);
        }
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

    fn add_world_quad(
        &mut self,
        x: f32,
        y: f32,
        size: f32,
        color: [f32; 4],
        world: &NativeRenderFrame,
    ) {
        self.add_world_rect(x, y, size, size, color, world);
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
