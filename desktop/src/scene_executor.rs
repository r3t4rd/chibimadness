//! First stage of the canonical Canvas display-list executor.
//!
//! This module deliberately consumes `NativeRenderScene`, never game entities.
//! Unsupported Canvas operations are counted rather than approximated: native
//! presentation stays on the legacy backend until coverage is sufficient.

use crate::world_renderer::{NativeRenderScene, NativeSceneCommand};
use lyon_path::{math::{point, Point}, Path};
use lyon_tessellation::{geometry_builder::{simple_builder, VertexBuffers}, FillOptions, FillTessellator};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SceneTriangle {
    pub positions: [[f32; 2]; 3],
    pub color: [f32; 4],
}

#[derive(Default, Debug)]
pub struct SceneTessellation {
    pub triangles: Vec<SceneTriangle>,
    pub unsupported_commands: usize,
}

#[derive(Clone, Copy)]
struct Transform {
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
    f: f32,
}

impl Default for Transform {
    fn default() -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 }
    }
}

impl Transform {
    fn point(self, x: f32, y: f32) -> [f32; 2] {
        [self.a * x + self.c * y + self.e, self.b * x + self.d * y + self.f]
    }

    fn multiply(&mut self, right: Self) {
        *self = Self {
            a: self.a * right.a + self.c * right.b,
            b: self.b * right.a + self.d * right.b,
            c: self.a * right.c + self.c * right.d,
            d: self.b * right.c + self.d * right.d,
            e: self.a * right.e + self.c * right.f + self.e,
            f: self.b * right.e + self.d * right.f + self.f,
        };
    }
}

#[derive(Clone, Copy)]
struct State {
    transform: Transform,
    fill: [f32; 4],
    global_alpha: f32,
}

impl Default for State {
    fn default() -> Self {
        Self { transform: Transform::default(), fill: [0.0, 0.0, 0.0, 1.0], global_alpha: 1.0 }
    }
}

#[derive(Clone, Copy)]
enum PathCommand {
    Move([f32; 2]),
    Line([f32; 2]),
    Quadratic { control: [f32; 2], to: [f32; 2] },
    Cubic { control1: [f32; 2], control2: [f32; 2], to: [f32; 2] },
    Close,
}

fn number(value: &serde_json::Value) -> Option<f32> {
    value.as_f64().map(|value| value as f32).filter(|value| value.is_finite())
}

fn numbers(args: &[serde_json::Value], length: usize) -> Option<Vec<f32>> {
    (args.len() == length).then(|| args.iter().map(number).collect::<Option<Vec<_>>>())?
}

fn hex_byte(value: &str, offset: usize) -> Option<f32> {
    u8::from_str_radix(value.get(offset..offset + 2)?, 16).ok().map(|channel| channel as f32 / 255.0)
}

fn css_hex(value: &str) -> Option<[f32; 4]> {
    if value.len() == 7 && value.starts_with('#') {
        return Some([hex_byte(value, 1)?, hex_byte(value, 3)?, hex_byte(value, 5)?, 1.0]);
    }
    if value.len() == 9 && value.starts_with('#') {
        return Some([hex_byte(value, 1)?, hex_byte(value, 3)?, hex_byte(value, 5)?, hex_byte(value, 7)?]);
    }
    None
}

fn push_quad(output: &mut SceneTessellation, state: State, x: f32, y: f32, width: f32, height: f32) {
    let color = [state.fill[0], state.fill[1], state.fill[2], state.fill[3] * state.global_alpha];
    let top_left = state.transform.point(x, y);
    let top_right = state.transform.point(x + width, y);
    let bottom_right = state.transform.point(x + width, y + height);
    let bottom_left = state.transform.point(x, y + height);
    output.triangles.extend_from_slice(&[
        SceneTriangle { positions: [top_left, bottom_left, bottom_right], color },
        SceneTriangle { positions: [top_left, bottom_right, top_right], color },
    ]);
}

fn point_from(value: [f32; 2]) -> Point { point(value[0], value[1]) }

fn build_path(commands: &[PathCommand]) -> Option<Path> {
    let mut builder = Path::builder();
    let mut active = false;
    for command in commands {
        match *command {
            PathCommand::Move(to) => {
                if active { builder.end(false); }
                builder.begin(point_from(to));
                active = true;
            }
            PathCommand::Line(to) if active => { builder.line_to(point_from(to)); }
            PathCommand::Quadratic { control, to } if active => {
                builder.quadratic_bezier_to(point_from(control), point_from(to));
            }
            PathCommand::Cubic { control1, control2, to } if active => {
                builder.cubic_bezier_to(point_from(control1), point_from(control2), point_from(to));
            }
            PathCommand::Close if active => { builder.end(true); active = false; }
            _ => return None,
        }
    }
    if active { builder.end(false); }
    Some(builder.build())
}

fn push_fill_path(output: &mut SceneTessellation, state: State, commands: &[PathCommand]) -> bool {
    let Some(path) = build_path(commands) else { return false; };
    let mut buffers: VertexBuffers<Point, u16> = VertexBuffers::new();
    let mut builder = simple_builder(&mut buffers);
    if FillTessellator::new()
        .tessellate_path(&path, &FillOptions::default(), &mut builder)
        .is_err()
    {
        return false;
    }
    let color = [state.fill[0], state.fill[1], state.fill[2], state.fill[3] * state.global_alpha];
    for indices in buffers.indices.chunks_exact(3) {
        let first = buffers.vertices[indices[0] as usize];
        let second = buffers.vertices[indices[1] as usize];
        let third = buffers.vertices[indices[2] as usize];
        output.triangles.push(SceneTriangle {
            positions: [[first.x, first.y], [second.x, second.y], [third.x, third.y]],
            color,
        });
    }
    true
}

/// Converts the currently supported, exact Canvas subset to GPU-ready
/// triangles in source pixel coordinates.
pub fn tessellate(scene: &NativeRenderScene) -> SceneTessellation {
    let mut output = SceneTessellation::default();
    let mut state = State::default();
    let mut stack = Vec::new();
    let mut path = Vec::new();

    for command in &scene.commands {
        match command {
            NativeSceneCommand::Set { property, value } if property == "fillStyle" => {
                if let Some(fill) = value.as_str().and_then(css_hex) { state.fill = fill; } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Set { property, value } if property == "globalAlpha" => {
                if let Some(alpha) = number(value) { state.global_alpha = alpha.clamp(0.0, 1.0); } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Set { .. } => {}
            NativeSceneCommand::Call { method, args, .. } if method == "save" && args.is_empty() => stack.push(state),
            NativeSceneCommand::Call { method, args, .. } if method == "restore" && args.is_empty() => {
                if let Some(previous) = stack.pop() { state = previous; } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "translate" => {
                if let Some(values) = numbers(args, 2) { state.transform.multiply(Transform { e: values[0], f: values[1], ..Transform::default() }); } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "scale" => {
                if let Some(values) = numbers(args, 2) { state.transform.multiply(Transform { a: values[0], d: values[1], ..Transform::default() }); } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "rotate" => {
                if let Some(values) = numbers(args, 1) {
                    let (sin, cos) = values[0].sin_cos();
                    state.transform.multiply(Transform { a: cos, b: sin, c: -sin, d: cos, e: 0.0, f: 0.0 });
                } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "fillRect" => {
                if let Some(values) = numbers(args, 4) { push_quad(&mut output, state, values[0], values[1], values[2], values[3]); } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "beginPath" && args.is_empty() => path.clear(),
            NativeSceneCommand::Call { method, args, .. } if method == "moveTo" => {
                if let Some(values) = numbers(args, 2) { path.push(PathCommand::Move(state.transform.point(values[0], values[1]))); } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "lineTo" => {
                if let Some(values) = numbers(args, 2) { path.push(PathCommand::Line(state.transform.point(values[0], values[1]))); } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "quadraticCurveTo" => {
                if let Some(values) = numbers(args, 4) {
                    path.push(PathCommand::Quadratic { control: state.transform.point(values[0], values[1]), to: state.transform.point(values[2], values[3]) });
                } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "bezierCurveTo" => {
                if let Some(values) = numbers(args, 6) {
                    path.push(PathCommand::Cubic { control1: state.transform.point(values[0], values[1]), control2: state.transform.point(values[2], values[3]), to: state.transform.point(values[4], values[5]) });
                } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "rect" => {
                if let Some(values) = numbers(args, 4) {
                    let (x, y, width, height) = (values[0], values[1], values[2], values[3]);
                    path.extend_from_slice(&[
                        PathCommand::Move(state.transform.point(x, y)), PathCommand::Line(state.transform.point(x + width, y)),
                        PathCommand::Line(state.transform.point(x + width, y + height)), PathCommand::Line(state.transform.point(x, y + height)), PathCommand::Close,
                    ]);
                } else { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "closePath" && args.is_empty() => path.push(PathCommand::Close),
            NativeSceneCommand::Call { method, args, .. } if method == "fill" && args.is_empty() => {
                if !push_fill_path(&mut output, state, &path) { output.unsupported_commands += 1; }
            }
            NativeSceneCommand::Call { method, args, .. } if method == "clearRect" && args.len() == 4 => {}
            NativeSceneCommand::Call { .. } | NativeSceneCommand::ResourceCall { .. } => output.unsupported_commands += 1,
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_renderer::{NativeSceneCamera, NativeSceneViewport};

    fn scene(commands: Vec<NativeSceneCommand>) -> NativeRenderScene {
        NativeRenderScene {
            version: 1,
            viewport: NativeSceneViewport { width: 100.0, height: 100.0 },
            camera: NativeSceneCamera { x: 0.0, y: 0.0, zoom: 1.0 },
            time_seconds: 0.0,
            commands,
        }
    }

    #[test]
    fn applies_canvas_transform_and_alpha_to_fill_rect() {
        let output = tessellate(&scene(vec![
            NativeSceneCommand::Set { property: "fillStyle".into(), value: serde_json::json!("#336699") },
            NativeSceneCommand::Set { property: "globalAlpha".into(), value: serde_json::json!(0.5) },
            NativeSceneCommand::Call { method: "translate".into(), args: vec![serde_json::json!(10), serde_json::json!(20)], result: None },
            NativeSceneCommand::Call { method: "fillRect".into(), args: vec![serde_json::json!(1), serde_json::json!(2), serde_json::json!(3), serde_json::json!(4)], result: None },
        ]));
        assert_eq!(output.triangles.len(), 2);
        assert_eq!(output.triangles[0].positions[0], [11.0, 22.0]);
        assert_eq!(output.triangles[0].color, [0.2, 0.4, 0.6, 0.5]);
        assert_eq!(output.unsupported_commands, 0);
    }

    #[test]
    fn tessellates_transformed_canvas_path() {
        let output = tessellate(&scene(vec![
            NativeSceneCommand::Set { property: "fillStyle".into(), value: serde_json::json!("#FFFFFF") },
            NativeSceneCommand::Call { method: "translate".into(), args: vec![serde_json::json!(10), serde_json::json!(20)], result: None },
            NativeSceneCommand::Call { method: "beginPath".into(), args: vec![], result: None },
            NativeSceneCommand::Call { method: "moveTo".into(), args: vec![serde_json::json!(0), serde_json::json!(0)], result: None },
            NativeSceneCommand::Call { method: "lineTo".into(), args: vec![serde_json::json!(10), serde_json::json!(0)], result: None },
            NativeSceneCommand::Call { method: "lineTo".into(), args: vec![serde_json::json!(0), serde_json::json!(10)], result: None },
            NativeSceneCommand::Call { method: "closePath".into(), args: vec![], result: None },
            NativeSceneCommand::Call { method: "fill".into(), args: vec![], result: None },
        ]));
        assert_eq!(output.triangles.len(), 1);
        assert!(output.triangles[0].positions.contains(&[10.0, 20.0]));
        assert_eq!(output.unsupported_commands, 0);
    }
}
