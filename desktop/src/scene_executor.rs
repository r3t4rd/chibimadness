//! Canonical Canvas display-list executor used by the native WGPU surface.
//!
//! The browser records the authoritative draw order; this module turns that
//! order into GPU triangles. Keeping this boundary at Canvas commands avoids a
//! second, inevitably divergent, world renderer in Rust.

use std::collections::HashMap;

use ab_glyph::{point as font_point, Font, FontArc, ScaleFont};
use lyon_path::{
    math::{point, Point},
    Path,
};
use lyon_tessellation::{
    geometry_builder::{simple_builder, VertexBuffers},
    FillOptions, FillTessellator,
};

use crate::world_renderer::{NativeRenderScene, NativeSceneCommand};

const MAX_TRIANGLES: usize = 1_000_000;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SceneLayer {
    Screen,
    Static,
    Dynamic,
}

impl Default for SceneLayer {
    fn default() -> Self {
        Self::Screen
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SceneTriangle {
    pub positions: [[f32; 2]; 3],
    /// Vertex colours deliberately carry gradients through the existing WGPU
    /// pipeline without a second material pass.
    pub colors: [[f32; 4]; 3],
    pub layer: SceneLayer,
}

#[derive(Default, Debug)]
pub struct SceneTessellation {
    pub triangles: Vec<SceneTriangle>,
    pub unsupported_commands: usize,
    pub truncated: bool,
    current_layer: SceneLayer,
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
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: 0.0,
            f: 0.0,
        }
    }
}

impl Transform {
    fn point(self, x: f32, y: f32) -> [f32; 2] {
        [
            self.a * x + self.c * y + self.e,
            self.b * x + self.d * y + self.f,
        ]
    }

    fn scale(self) -> f32 {
        ((self.a.hypot(self.b) + self.c.hypot(self.d)) * 0.5).max(0.001)
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

#[derive(Clone)]
enum Paint {
    Solid([f32; 4]),
    Gradient(u32),
}

impl Default for Paint {
    fn default() -> Self {
        Self::Solid([0.0, 0.0, 0.0, 1.0])
    }
}

#[derive(Clone)]
enum GradientKind {
    Linear {
        from: [f32; 2],
        to: [f32; 2],
    },
    Radial {
        from: [f32; 2],
        r0: f32,
        to: [f32; 2],
        r1: f32,
    },
}

#[derive(Clone)]
struct Gradient {
    kind: GradientKind,
    stops: Vec<(f32, [f32; 4])>,
}

impl Gradient {
    fn color_at(&self, position: [f32; 2]) -> [f32; 4] {
        let t = match self.kind {
            GradientKind::Linear { from, to } => {
                let dx = to[0] - from[0];
                let dy = to[1] - from[1];
                let denominator = dx * dx + dy * dy;
                if denominator <= f32::EPSILON {
                    1.0
                } else {
                    ((position[0] - from[0]) * dx + (position[1] - from[1]) * dy) / denominator
                }
            }
            GradientKind::Radial { from, r0, to, r1 } => {
                // Canvas radial gradients use the two-circle solution. The
                // common concentric case is exact; this stable approximation
                // also handles the small focal offsets used by the game.
                let distance = (position[0] - from[0]).hypot(position[1] - from[1]);
                let center_shift = (to[0] - from[0]).hypot(to[1] - from[1]);
                let radius = (r1 - r0).abs().max(center_shift).max(0.001);
                (distance - r0) / radius
            }
        }
        .clamp(0.0, 1.0);
        let mut stops = self.stops.clone();
        stops.sort_by(|left, right| left.0.total_cmp(&right.0));
        let Some((first_stop, first)) = stops.first().copied() else {
            return [0.0; 4];
        };
        if t <= first_stop {
            return first;
        }
        for pair in stops.windows(2) {
            let (left_stop, left) = pair[0];
            let (right_stop, right) = pair[1];
            if t <= right_stop {
                let amount =
                    ((t - left_stop) / (right_stop - left_stop).max(0.000_01)).clamp(0.0, 1.0);
                return std::array::from_fn(|index| {
                    left[index] + (right[index] - left[index]) * amount
                });
            }
        }
        stops.last().map(|(_, color)| *color).unwrap_or(first)
    }
}

#[derive(Clone)]
struct State {
    transform: Transform,
    fill: Paint,
    stroke: Paint,
    global_alpha: f32,
    line_width: f32,
    line_cap: String,
    line_join: String,
    shadow_color: [f32; 4],
    shadow_blur: f32,
    shadow_offset_x: f32,
    shadow_offset_y: f32,
    font: String,
    text_align: String,
    text_baseline: String,
}

impl Default for State {
    fn default() -> Self {
        Self {
            transform: Transform::default(),
            fill: Paint::default(),
            stroke: Paint::default(),
            global_alpha: 1.0,
            line_width: 1.0,
            line_cap: "butt".into(),
            line_join: "miter".into(),
            shadow_color: [0.0; 4],
            shadow_blur: 0.0,
            shadow_offset_x: 0.0,
            shadow_offset_y: 0.0,
            font: "10px sans-serif".into(),
            text_align: "start".into(),
            text_baseline: "alphabetic".into(),
        }
    }
}

#[derive(Default)]
struct Subpath {
    points: Vec<[f32; 2]>,
    closed: bool,
}

#[derive(Default)]
struct CanvasPath {
    subpaths: Vec<Subpath>,
}

impl CanvasPath {
    fn current_mut(&mut self) -> Option<&mut Subpath> {
        self.subpaths.last_mut()
    }
    fn move_to(&mut self, point: [f32; 2]) {
        self.subpaths.push(Subpath {
            points: vec![point],
            closed: false,
        });
    }
    fn line_to(&mut self, point: [f32; 2]) {
        if let Some(path) = self.current_mut() {
            path.points.push(point);
        } else {
            self.move_to(point);
        }
    }
    fn close(&mut self) {
        if let Some(path) = self.current_mut() {
            path.closed = path.points.len() > 2;
        }
    }
}

fn number(value: &serde_json::Value) -> Option<f32> {
    value
        .as_f64()
        .map(|value| value as f32)
        .filter(|value| value.is_finite())
}
fn numbers(args: &[serde_json::Value], length: usize) -> Option<Vec<f32>> {
    (args.len() == length).then(|| args.iter().map(number).collect::<Option<Vec<_>>>())?
}
fn number_at(args: &[serde_json::Value], index: usize) -> Option<f32> {
    args.get(index).and_then(number)
}

fn css_color(value: &str) -> Option<[f32; 4]> {
    let value = value.trim();
    let hex = |text: &str| {
        u8::from_str_radix(text, 16)
            .ok()
            .map(|channel| channel as f32 / 255.0)
    };
    match value.to_ascii_lowercase().as_str() {
        "transparent" => return Some([0.0, 0.0, 0.0, 0.0]),
        "white" => return Some([1.0; 4]),
        "black" => return Some([0.0, 0.0, 0.0, 1.0]),
        "red" => return Some([1.0, 0.0, 0.0, 1.0]),
        "yellow" => return Some([1.0, 1.0, 0.0, 1.0]),
        "cyan" => return Some([0.0, 1.0, 1.0, 1.0]),
        _ => {}
    }
    if let Some(hex_value) = value.strip_prefix('#') {
        return match hex_value.len() {
            3 => Some([
                hex(&hex_value[0..1].repeat(2))?,
                hex(&hex_value[1..2].repeat(2))?,
                hex(&hex_value[2..3].repeat(2))?,
                1.0,
            ]),
            4 => Some([
                hex(&hex_value[0..1].repeat(2))?,
                hex(&hex_value[1..2].repeat(2))?,
                hex(&hex_value[2..3].repeat(2))?,
                hex(&hex_value[3..4].repeat(2))?,
            ]),
            6 => Some([
                hex(&hex_value[0..2])?,
                hex(&hex_value[2..4])?,
                hex(&hex_value[4..6])?,
                1.0,
            ]),
            8 => Some([
                hex(&hex_value[0..2])?,
                hex(&hex_value[2..4])?,
                hex(&hex_value[4..6])?,
                hex(&hex_value[6..8])?,
            ]),
            _ => None,
        };
    }
    let components = value
        .strip_prefix("rgba(")
        .or_else(|| value.strip_prefix("rgb("))?
        .strip_suffix(')')?
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>();
    if !(components.len() == 3 || components.len() == 4) {
        return None;
    }
    let channel = |part: &str| {
        part.strip_suffix('%')
            .and_then(|percent| percent.parse::<f32>().ok().map(|value| value / 100.0))
            .or_else(|| part.parse::<f32>().ok().map(|value| value / 255.0))
    };
    let alpha = components
        .get(3)
        .and_then(|part| part.parse::<f32>().ok())
        .unwrap_or(1.0);
    Some([
        channel(components[0])?.clamp(0.0, 1.0),
        channel(components[1])?.clamp(0.0, 1.0),
        channel(components[2])?.clamp(0.0, 1.0),
        alpha.clamp(0.0, 1.0),
    ])
}

fn paint_from(value: &serde_json::Value) -> Option<Paint> {
    value
        .as_str()
        .and_then(css_color)
        .map(Paint::Solid)
        .or_else(|| {
            value
                .get("ref")
                .and_then(|reference| reference.as_u64())
                .map(|reference| Paint::Gradient(reference as u32))
        })
}

fn paint_color(
    paint: &Paint,
    gradients: &HashMap<u32, Gradient>,
    position: [f32; 2],
    alpha: f32,
) -> [f32; 4] {
    let mut color = match paint {
        Paint::Solid(color) => *color,
        Paint::Gradient(reference) => gradients
            .get(reference)
            .map(|gradient| gradient.color_at(position))
            .unwrap_or([0.0; 4]),
    };
    color[3] *= alpha;
    color
}

fn push_raw(output: &mut SceneTessellation, positions: [[f32; 2]; 3], colors: [[f32; 4]; 3]) {
    if output.triangles.len() >= MAX_TRIANGLES {
        output.truncated = true;
        return;
    }
    output.triangles.push(SceneTriangle {
        positions,
        colors,
        layer: output.current_layer,
    });
}

fn emit_triangle(
    output: &mut SceneTessellation,
    state: &State,
    gradients: &HashMap<u32, Gradient>,
    positions: [[f32; 2]; 3],
    paint: &Paint,
) {
    if state.shadow_color[3] > 0.0
        && (state.shadow_blur > 0.0 || state.shadow_offset_x != 0.0 || state.shadow_offset_y != 0.0)
    {
        let blur = state.shadow_blur.min(64.0);
        let samples = if blur > 0.5 { 9 } else { 1 };
        for sample in 0..samples {
            let (x, y) = if sample == 0 {
                (0.0, 0.0)
            } else {
                let angle = std::f32::consts::TAU * (sample - 1) as f32 / (samples - 1) as f32;
                (angle.cos() * blur * 0.45, angle.sin() * blur * 0.45)
            };
            let offset = state
                .transform
                .point(state.shadow_offset_x, state.shadow_offset_y);
            let origin = state.transform.point(0.0, 0.0);
            let translated = positions.map(|position| {
                [
                    position[0] + offset[0] - origin[0] + x,
                    position[1] + offset[1] - origin[1] + y,
                ]
            });
            let mut shadow = state.shadow_color;
            shadow[3] *= state.global_alpha / samples as f32;
            push_raw(output, translated, [shadow; 3]);
        }
    }
    let colors =
        positions.map(|position| paint_color(paint, gradients, position, state.global_alpha));
    push_raw(output, positions, colors);
}

fn emit_quad(
    output: &mut SceneTessellation,
    state: &State,
    gradients: &HashMap<u32, Gradient>,
    points: [[f32; 2]; 4],
    paint: &Paint,
) {
    emit_triangle(
        output,
        state,
        gradients,
        [points[0], points[1], points[2]],
        paint,
    );
    emit_triangle(
        output,
        state,
        gradients,
        [points[0], points[2], points[3]],
        paint,
    );
}

fn transformed_rect(state: &State, x: f32, y: f32, width: f32, height: f32) -> [[f32; 2]; 4] {
    [
        state.transform.point(x, y),
        state.transform.point(x + width, y),
        state.transform.point(x + width, y + height),
        state.transform.point(x, y + height),
    ]
}

fn append_arc(
    path: &mut CanvasPath,
    state: &State,
    x: f32,
    y: f32,
    radius_x: f32,
    radius_y: f32,
    rotation: f32,
    start: f32,
    end: f32,
    anticlockwise: bool,
) {
    if radius_x <= 0.0 || radius_y <= 0.0 {
        return;
    }
    let mut span = end - start;
    if anticlockwise {
        while span > 0.0 {
            span -= std::f32::consts::TAU;
        }
    } else {
        while span < 0.0 {
            span += std::f32::consts::TAU;
        }
    }
    if span.abs() > std::f32::consts::TAU {
        span = if anticlockwise {
            -std::f32::consts::TAU
        } else {
            std::f32::consts::TAU
        };
    }
    let steps = ((span.abs() / std::f32::consts::TAU * 48.0).ceil() as usize).clamp(2, 96);
    for step in 0..=steps {
        let angle = start + span * step as f32 / steps as f32;
        let local_x = angle.cos() * radius_x;
        let local_y = angle.sin() * radius_y;
        let point = state.transform.point(
            x + local_x * rotation.cos() - local_y * rotation.sin(),
            y + local_x * rotation.sin() + local_y * rotation.cos(),
        );
        if step == 0 && path.subpaths.is_empty() {
            path.move_to(point);
        } else {
            path.line_to(point);
        }
    }
}

fn round_rect_radii(value: &serde_json::Value, limit: f32) -> [f32; 4] {
    let values = value
        .as_array()
        .map(|items| items.iter().filter_map(number).collect::<Vec<_>>())
        .or_else(|| number(value).map(|radius| vec![radius]))
        .unwrap_or_default();
    let radii = match values.as_slice() {
        [radius] => [*radius; 4],
        [top_left, top_right] => [*top_left, *top_right, *top_left, *top_right],
        [top_left, top_right, bottom_right] => [*top_left, *top_right, *bottom_right, *top_right],
        [top_left, top_right, bottom_right, bottom_left, ..] => {
            [*top_left, *top_right, *bottom_right, *bottom_left]
        }
        _ => [0.0; 4],
    };
    radii.map(|radius| radius.max(0.0).min(limit))
}

fn append_round_rect(
    path: &mut CanvasPath,
    state: &State,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    radii: [f32; 4],
) {
    let [top_left, top_right, bottom_right, bottom_left] = radii;
    path.move_to(state.transform.point(x + top_left, y));
    path.line_to(state.transform.point(x + width - top_right, y));
    append_arc(
        path,
        state,
        x + width - top_right,
        y + top_right,
        top_right,
        top_right,
        0.0,
        -std::f32::consts::FRAC_PI_2,
        0.0,
        false,
    );
    path.line_to(state.transform.point(x + width, y + height - bottom_right));
    append_arc(
        path,
        state,
        x + width - bottom_right,
        y + height - bottom_right,
        bottom_right,
        bottom_right,
        0.0,
        0.0,
        std::f32::consts::FRAC_PI_2,
        false,
    );
    path.line_to(state.transform.point(x + bottom_left, y + height));
    append_arc(
        path,
        state,
        x + bottom_left,
        y + height - bottom_left,
        bottom_left,
        bottom_left,
        0.0,
        std::f32::consts::FRAC_PI_2,
        std::f32::consts::PI,
        false,
    );
    path.line_to(state.transform.point(x, y + top_left));
    append_arc(
        path,
        state,
        x + top_left,
        y + top_left,
        top_left,
        top_left,
        0.0,
        std::f32::consts::PI,
        std::f32::consts::PI * 1.5,
        false,
    );
    path.close();
}

fn build_path(path: &CanvasPath) -> Option<Path> {
    let mut builder = Path::builder();
    let mut has_content = false;
    for subpath in &path.subpaths {
        let Some(first) = subpath.points.first().copied() else {
            continue;
        };
        builder.begin(point(first[0], first[1]));
        for current in subpath.points.iter().skip(1) {
            builder.line_to(point(current[0], current[1]));
        }
        builder.end(subpath.closed);
        has_content = true;
    }
    has_content.then(|| builder.build())
}

fn fill_path(
    output: &mut SceneTessellation,
    state: &State,
    gradients: &HashMap<u32, Gradient>,
    path: &CanvasPath,
) -> bool {
    let Some(path) = build_path(path) else {
        return false;
    };
    let mut buffers: VertexBuffers<Point, u16> = VertexBuffers::new();
    let mut builder = simple_builder(&mut buffers);
    if FillTessellator::new()
        .tessellate_path(&path, &FillOptions::default(), &mut builder)
        .is_err()
    {
        return false;
    }
    for indices in buffers.indices.chunks_exact(3) {
        let positions = [0, 1, 2].map(|slot| {
            let point = buffers.vertices[indices[slot] as usize];
            [point.x, point.y]
        });
        emit_triangle(output, state, gradients, positions, &state.fill);
    }
    true
}

fn circle(
    output: &mut SceneTessellation,
    state: &State,
    gradients: &HashMap<u32, Gradient>,
    center: [f32; 2],
    radius: f32,
    paint: &Paint,
) {
    let segments = ((radius.abs() * 0.8).ceil() as usize).clamp(8, 32);
    for index in 0..segments {
        let start = std::f32::consts::TAU * index as f32 / segments as f32;
        let end = std::f32::consts::TAU * (index + 1) as f32 / segments as f32;
        emit_triangle(
            output,
            state,
            gradients,
            [
                center,
                [
                    center[0] + start.cos() * radius,
                    center[1] + start.sin() * radius,
                ],
                [
                    center[0] + end.cos() * radius,
                    center[1] + end.sin() * radius,
                ],
            ],
            paint,
        );
    }
}

fn stroke_path(
    output: &mut SceneTessellation,
    state: &State,
    gradients: &HashMap<u32, Gradient>,
    path: &CanvasPath,
) -> bool {
    let width = (state.line_width * state.transform.scale()).clamp(0.1, 512.0);
    for subpath in &path.subpaths {
        if subpath.points.len() < 2 {
            continue;
        }
        let mut points = subpath.points.clone();
        if subpath.closed {
            points.push(points[0]);
        }
        for segment in points.windows(2) {
            let start = segment[0];
            let end = segment[1];
            let dx = end[0] - start[0];
            let dy = end[1] - start[1];
            let length = dx.hypot(dy);
            if length <= f32::EPSILON {
                continue;
            }
            let normal = [-dy / length * width * 0.5, dx / length * width * 0.5];
            emit_quad(
                output,
                state,
                gradients,
                [
                    [start[0] + normal[0], start[1] + normal[1]],
                    [end[0] + normal[0], end[1] + normal[1]],
                    [end[0] - normal[0], end[1] - normal[1]],
                    [start[0] - normal[0], start[1] - normal[1]],
                ],
                &state.stroke,
            );
        }
        if state.line_cap == "round" || state.line_join == "round" {
            let endpoints = if subpath.closed {
                subpath.points.clone()
            } else {
                vec![
                    subpath.points[0],
                    *subpath.points.last().expect("non-empty"),
                ]
            };
            for point in endpoints {
                circle(output, state, gradients, point, width * 0.5, &state.stroke);
            }
        }
    }
    true
}

fn font_size(font: &str) -> f32 {
    font.split_whitespace()
        .find_map(|part| part.strip_suffix("px"))
        .and_then(|value| value.parse::<f32>().ok())
        .unwrap_or(10.0)
        .clamp(4.0, 160.0)
}

fn text(
    output: &mut SceneTessellation,
    state: &State,
    gradients: &HashMap<u32, Gradient>,
    font: Option<&FontArc>,
    value: &str,
    x: f32,
    y: f32,
    stroke: bool,
) -> bool {
    let Some(font) = font else {
        return false;
    };
    let size = font_size(&state.font);
    let scaled = font.as_scaled(size);
    let glyphs = value
        .chars()
        .map(|character| (character, font.glyph_id(character)))
        .collect::<Vec<_>>();
    let width = glyphs
        .iter()
        .map(|(_, id)| scaled.h_advance(*id))
        .sum::<f32>();
    let origin_x = match state.text_align.as_str() {
        "center" => x - width * 0.5,
        "right" | "end" => x - width,
        _ => x,
    };
    let origin_y = match state.text_baseline.as_str() {
        "top" | "hanging" => y + scaled.ascent(),
        "middle" => y + (scaled.ascent() + scaled.descent()) * 0.5,
        "bottom" | "ideographic" => y + scaled.descent(),
        _ => y,
    };
    let paint = if stroke { &state.stroke } else { &state.fill };
    let mut pen_x = origin_x;
    for (_, id) in glyphs {
        let glyph = id.with_scale_and_position(size, font_point(pen_x, origin_y));
        if let Some(outline) = font.outline_glyph(glyph) {
            let bounds = outline.px_bounds();
            outline.draw(|pixel_x, pixel_y, coverage| {
                if coverage <= 0.01 {
                    return;
                }
                let mut text_state = state.clone();
                text_state.global_alpha *= coverage;
                let offsets: &[(f32, f32)] = if stroke {
                    &[(-1.0, 0.0), (1.0, 0.0), (0.0, -1.0), (0.0, 1.0)]
                } else {
                    &[(0.0, 0.0)]
                };
                for (offset_x, offset_y) in offsets {
                    emit_quad(
                        output,
                        &text_state,
                        gradients,
                        transformed_rect(
                            &text_state,
                            bounds.min.x + pixel_x as f32 + offset_x,
                            bounds.min.y + pixel_y as f32 + offset_y,
                            1.0,
                            1.0,
                        ),
                        paint,
                    );
                }
            });
        }
        pen_x += scaled.h_advance(id);
    }
    true
}

fn gradient_from_call(
    method: &str,
    args: &[serde_json::Value],
    transform: Transform,
) -> Option<Gradient> {
    match method {
        "createLinearGradient" => {
            let values = numbers(args, 4)?;
            Some(Gradient {
                kind: GradientKind::Linear {
                    from: transform.point(values[0], values[1]),
                    to: transform.point(values[2], values[3]),
                },
                stops: Vec::new(),
            })
        }
        "createRadialGradient" => {
            let values = numbers(args, 6)?;
            Some(Gradient {
                kind: GradientKind::Radial {
                    from: transform.point(values[0], values[1]),
                    r0: values[2] * transform.scale(),
                    to: transform.point(values[3], values[4]),
                    r1: values[5] * transform.scale(),
                },
                stops: Vec::new(),
            })
        }
        _ => None,
    }
}

/// Converts Canvas commands to triangles in source-pixel coordinates. `font`
/// is loaded once by the native renderer, never from the WebView payload.
pub fn tessellate(scene: &NativeRenderScene, font: Option<&FontArc>) -> SceneTessellation {
    let mut output = SceneTessellation::default();
    let mut state = State::default();
    let mut stack = Vec::new();
    let mut path = CanvasPath::default();
    let mut gradients = HashMap::<u32, Gradient>::new();

    for command in &scene.commands {
        match command {
            NativeSceneCommand::Layer { name } => {
                output.current_layer = match name.as_str() {
                    "screen" => SceneLayer::Screen,
                    "static" => SceneLayer::Static,
                    "dynamic" => SceneLayer::Dynamic,
                    // `NativeWorldState` rejects unknown labels before this
                    // executor sees a scene. Keeping the previous label here
                    // makes the executor defensive if it is reused directly.
                    _ => output.current_layer,
                };
            }
            NativeSceneCommand::Set { property, value } => match property.as_str() {
                "fillStyle" => {
                    if let Some(paint) = paint_from(value) {
                        state.fill = paint;
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "strokeStyle" => {
                    if let Some(paint) = paint_from(value) {
                        state.stroke = paint;
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "globalAlpha" => {
                    if let Some(alpha) = number(value) {
                        state.global_alpha = alpha.clamp(0.0, 1.0);
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "lineWidth" => {
                    if let Some(width) = number(value) {
                        state.line_width = width.clamp(0.0, 512.0);
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "lineCap" => {
                    if let Some(value) = value.as_str() {
                        state.line_cap = value.into();
                    }
                }
                "lineJoin" => {
                    if let Some(value) = value.as_str() {
                        state.line_join = value.into();
                    }
                }
                "shadowColor" => {
                    if let Some(color) = value.as_str().and_then(css_color) {
                        state.shadow_color = color;
                    }
                }
                "shadowBlur" => {
                    if let Some(blur) = number(value) {
                        state.shadow_blur = blur.clamp(0.0, 128.0);
                    }
                }
                "shadowOffsetX" => {
                    if let Some(offset) = number(value) {
                        state.shadow_offset_x = offset.clamp(-2048.0, 2048.0);
                    }
                }
                "shadowOffsetY" => {
                    if let Some(offset) = number(value) {
                        state.shadow_offset_y = offset.clamp(-2048.0, 2048.0);
                    }
                }
                "font" => {
                    if let Some(value) = value.as_str() {
                        state.font = value.into();
                    }
                }
                "textAlign" => {
                    if let Some(value) = value.as_str() {
                        state.text_align = value.into();
                    }
                }
                "textBaseline" => {
                    if let Some(value) = value.as_str() {
                        state.text_baseline = value.into();
                    }
                }
                _ => {}
            },
            NativeSceneCommand::ResourceCall {
                resource_ref,
                method,
                args,
            } if method == "addColorStop" => {
                if let (Some(offset), Some(color)) = (
                    number_at(args, 0),
                    args.get(1)
                        .and_then(|value| value.as_str())
                        .and_then(css_color),
                ) {
                    if let Some(gradient) = gradients.get_mut(resource_ref) {
                        gradient.stops.push((offset.clamp(0.0, 1.0), color));
                    } else {
                        output.unsupported_commands += 1;
                    }
                } else {
                    output.unsupported_commands += 1;
                }
            }
            NativeSceneCommand::ResourceCall { .. } => {}
            NativeSceneCommand::Call {
                method,
                args,
                result,
            } => match method.as_str() {
                "save" if args.is_empty() => stack.push(state.clone()),
                "restore" if args.is_empty() => {
                    if let Some(previous) = stack.pop() {
                        state = previous;
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "translate" => {
                    if let Some(values) = numbers(args, 2) {
                        state.transform.multiply(Transform {
                            e: values[0],
                            f: values[1],
                            ..Transform::default()
                        });
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "scale" => {
                    if let Some(values) = numbers(args, 2) {
                        state.transform.multiply(Transform {
                            a: values[0],
                            d: values[1],
                            ..Transform::default()
                        });
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "rotate" => {
                    if let Some(values) = numbers(args, 1) {
                        let (sin, cos) = values[0].sin_cos();
                        state.transform.multiply(Transform {
                            a: cos,
                            b: sin,
                            c: -sin,
                            d: cos,
                            e: 0.0,
                            f: 0.0,
                        });
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "transform" => {
                    if let Some(values) = numbers(args, 6) {
                        state.transform.multiply(Transform {
                            a: values[0],
                            b: values[1],
                            c: values[2],
                            d: values[3],
                            e: values[4],
                            f: values[5],
                        });
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "setTransform" => {
                    if let Some(values) = numbers(args, 6) {
                        state.transform = Transform {
                            a: values[0],
                            b: values[1],
                            c: values[2],
                            d: values[3],
                            e: values[4],
                            f: values[5],
                        };
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "resetTransform" if args.is_empty() => state.transform = Transform::default(),
                "createLinearGradient" | "createRadialGradient" => {
                    if let (Some(reference), Some(gradient)) = (
                        result.as_ref().map(|result| result.resource_ref),
                        gradient_from_call(method, args, state.transform),
                    ) {
                        gradients.insert(reference, gradient);
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "fillRect" => {
                    if let Some(values) = numbers(args, 4) {
                        emit_quad(
                            &mut output,
                            &state,
                            &gradients,
                            transformed_rect(&state, values[0], values[1], values[2], values[3]),
                            &state.fill,
                        );
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "strokeRect" => {
                    if let Some(values) = numbers(args, 4) {
                        let mut rectangle = CanvasPath::default();
                        let points =
                            transformed_rect(&state, values[0], values[1], values[2], values[3]);
                        rectangle.move_to(points[0]);
                        for point in points.iter().skip(1) {
                            rectangle.line_to(*point);
                        }
                        rectangle.close();
                        stroke_path(&mut output, &state, &gradients, &rectangle);
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "beginPath" if args.is_empty() => path = CanvasPath::default(),
                "moveTo" => {
                    if let Some(values) = numbers(args, 2) {
                        path.move_to(state.transform.point(values[0], values[1]));
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "lineTo" => {
                    if let Some(values) = numbers(args, 2) {
                        path.line_to(state.transform.point(values[0], values[1]));
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "quadraticCurveTo" => {
                    if let Some(values) = numbers(args, 4) {
                        let from = path
                            .current_mut()
                            .and_then(|subpath| subpath.points.last().copied())
                            .unwrap_or_else(|| state.transform.point(0.0, 0.0));
                        let control = state.transform.point(values[0], values[1]);
                        let to = state.transform.point(values[2], values[3]);
                        for step in 1..=12 {
                            let t = step as f32 / 12.0;
                            path.line_to([
                                from[0] * (1.0 - t).powi(2)
                                    + control[0] * 2.0 * (1.0 - t) * t
                                    + to[0] * t * t,
                                from[1] * (1.0 - t).powi(2)
                                    + control[1] * 2.0 * (1.0 - t) * t
                                    + to[1] * t * t,
                            ]);
                        }
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "bezierCurveTo" => {
                    if let Some(values) = numbers(args, 6) {
                        let from = path
                            .current_mut()
                            .and_then(|subpath| subpath.points.last().copied())
                            .unwrap_or_else(|| state.transform.point(0.0, 0.0));
                        let first = state.transform.point(values[0], values[1]);
                        let second = state.transform.point(values[2], values[3]);
                        let to = state.transform.point(values[4], values[5]);
                        for step in 1..=16 {
                            let t = step as f32 / 16.0;
                            let inverse = 1.0 - t;
                            path.line_to([
                                from[0] * inverse.powi(3)
                                    + first[0] * 3.0 * inverse.powi(2) * t
                                    + second[0] * 3.0 * inverse * t * t
                                    + to[0] * t.powi(3),
                                from[1] * inverse.powi(3)
                                    + first[1] * 3.0 * inverse.powi(2) * t
                                    + second[1] * 3.0 * inverse * t * t
                                    + to[1] * t.powi(3),
                            ]);
                        }
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "arc" => {
                    if args.len() == 5 || args.len() == 6 {
                        if let Some(values) =
                            args.iter().take(5).map(number).collect::<Option<Vec<_>>>()
                        {
                            append_arc(
                                &mut path,
                                &state,
                                values[0],
                                values[1],
                                values[2],
                                values[2],
                                0.0,
                                values[3],
                                values[4],
                                args.get(5)
                                    .and_then(|value| value.as_bool())
                                    .unwrap_or(false),
                            );
                        } else {
                            output.unsupported_commands += 1;
                        }
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "ellipse" => {
                    if args.len() == 7 || args.len() == 8 {
                        if let Some(values) =
                            args.iter().take(7).map(number).collect::<Option<Vec<_>>>()
                        {
                            append_arc(
                                &mut path,
                                &state,
                                values[0],
                                values[1],
                                values[2],
                                values[3],
                                values[4],
                                values[5],
                                values[6],
                                args.get(7)
                                    .and_then(|value| value.as_bool())
                                    .unwrap_or(false),
                            );
                        } else {
                            output.unsupported_commands += 1;
                        }
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "rect" => {
                    if let Some(values) = numbers(args, 4) {
                        let points =
                            transformed_rect(&state, values[0], values[1], values[2], values[3]);
                        path.move_to(points[0]);
                        for point in points.iter().skip(1) {
                            path.line_to(*point);
                        }
                        path.close();
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "roundRect" => {
                    if args.len() == 5 {
                        if let Some(values) =
                            args.iter().take(4).map(number).collect::<Option<Vec<_>>>()
                        {
                            append_round_rect(
                                &mut path,
                                &state,
                                values[0],
                                values[1],
                                values[2],
                                values[3],
                                round_rect_radii(
                                    &args[4],
                                    values[2].abs().min(values[3].abs()) * 0.5,
                                ),
                            );
                        } else {
                            output.unsupported_commands += 1;
                        }
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "closePath" if args.is_empty() => path.close(),
                "fill" if args.is_empty() => {
                    if !fill_path(&mut output, &state, &gradients, &path) {
                        output.unsupported_commands += 1;
                    }
                }
                "stroke" if args.is_empty() => {
                    stroke_path(&mut output, &state, &gradients, &path);
                }
                "fillText" => {
                    if let (Some(value), Some(x), Some(y)) = (
                        args.first().and_then(|value| value.as_str()),
                        number_at(args, 1),
                        number_at(args, 2),
                    ) {
                        if !text(&mut output, &state, &gradients, font, value, x, y, false) {
                            output.unsupported_commands += 1;
                        }
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "strokeText" => {
                    if let (Some(value), Some(x), Some(y)) = (
                        args.first().and_then(|value| value.as_str()),
                        number_at(args, 1),
                        number_at(args, 2),
                    ) {
                        if !text(&mut output, &state, &gradients, font, value, x, y, true) {
                            output.unsupported_commands += 1;
                        }
                    } else {
                        output.unsupported_commands += 1;
                    }
                }
                "clearRect" | "setLineDash" | "clip" => {}
                _ => output.unsupported_commands += 1,
            },
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
            viewport: NativeSceneViewport {
                width: 100.0,
                height: 100.0,
            },
            camera: NativeSceneCamera {
                x: 0.0,
                y: 0.0,
                zoom: 1.0,
            },
            time_seconds: 0.0,
            commands,
        }
    }

    #[test]
    fn applies_canvas_transform_and_alpha_to_fill_rect() {
        let output = tessellate(
            &scene(vec![
                NativeSceneCommand::Set {
                    property: "fillStyle".into(),
                    value: serde_json::json!("#336699"),
                },
                NativeSceneCommand::Set {
                    property: "globalAlpha".into(),
                    value: serde_json::json!(0.5),
                },
                NativeSceneCommand::Call {
                    method: "translate".into(),
                    args: vec![serde_json::json!(10), serde_json::json!(20)],
                    result: None,
                },
                NativeSceneCommand::Call {
                    method: "fillRect".into(),
                    args: vec![
                        serde_json::json!(1),
                        serde_json::json!(2),
                        serde_json::json!(3),
                        serde_json::json!(4),
                    ],
                    result: None,
                },
            ]),
            None,
        );
        assert_eq!(output.triangles.len(), 2);
        assert_eq!(output.triangles[0].positions[0], [11.0, 22.0]);
        assert_eq!(output.triangles[0].colors[0], [0.2, 0.4, 0.6, 0.5]);
        assert_eq!(output.unsupported_commands, 0);
    }

    #[test]
    fn preserves_retained_layer_boundaries_in_triangle_output() {
        let output = tessellate(
            &scene(vec![
                NativeSceneCommand::Layer {
                    name: "static".into(),
                },
                NativeSceneCommand::Call {
                    method: "fillRect".into(),
                    args: vec![
                        serde_json::json!(0),
                        serde_json::json!(0),
                        serde_json::json!(10),
                        serde_json::json!(10),
                    ],
                    result: None,
                },
                NativeSceneCommand::Layer {
                    name: "dynamic".into(),
                },
                NativeSceneCommand::Call {
                    method: "fillRect".into(),
                    args: vec![
                        serde_json::json!(10),
                        serde_json::json!(0),
                        serde_json::json!(10),
                        serde_json::json!(10),
                    ],
                    result: None,
                },
            ]),
            None,
        );
        assert_eq!(output.triangles.len(), 4);
        assert!(output.triangles[..2]
            .iter()
            .all(|triangle| triangle.layer == SceneLayer::Static));
        assert!(output.triangles[2..]
            .iter()
            .all(|triangle| triangle.layer == SceneLayer::Dynamic));
    }

    #[test]
    fn tessellates_arcs_strokes_and_gradient_paths() {
        let output = tessellate(
            &scene(vec![
                NativeSceneCommand::Call {
                    method: "createLinearGradient".into(),
                    args: vec![
                        serde_json::json!(0),
                        serde_json::json!(0),
                        serde_json::json!(20),
                        serde_json::json!(0),
                    ],
                    result: Some(crate::world_renderer::NativeSceneResourceRef {
                        resource_ref: 1,
                        kind: "gradient".into(),
                    }),
                },
                NativeSceneCommand::ResourceCall {
                    resource_ref: 1,
                    method: "addColorStop".into(),
                    args: vec![serde_json::json!(0), serde_json::json!("#FF0000")],
                },
                NativeSceneCommand::ResourceCall {
                    resource_ref: 1,
                    method: "addColorStop".into(),
                    args: vec![
                        serde_json::json!(1),
                        serde_json::json!("rgba(0, 0, 255, 0.5)"),
                    ],
                },
                NativeSceneCommand::Set {
                    property: "fillStyle".into(),
                    value: serde_json::json!({"ref": 1, "kind": "gradient"}),
                },
                NativeSceneCommand::Set {
                    property: "strokeStyle".into(),
                    value: serde_json::json!("#FFFFFF"),
                },
                NativeSceneCommand::Set {
                    property: "lineWidth".into(),
                    value: serde_json::json!(2),
                },
                NativeSceneCommand::Call {
                    method: "beginPath".into(),
                    args: vec![],
                    result: None,
                },
                NativeSceneCommand::Call {
                    method: "ellipse".into(),
                    args: vec![
                        serde_json::json!(10),
                        serde_json::json!(10),
                        serde_json::json!(8),
                        serde_json::json!(5),
                        serde_json::json!(0),
                        serde_json::json!(0),
                        serde_json::json!(std::f32::consts::TAU),
                    ],
                    result: None,
                },
                NativeSceneCommand::Call {
                    method: "fill".into(),
                    args: vec![],
                    result: None,
                },
                NativeSceneCommand::Call {
                    method: "stroke".into(),
                    args: vec![],
                    result: None,
                },
            ]),
            None,
        );
        assert!(!output.triangles.is_empty());
        assert_eq!(output.unsupported_commands, 0);
        assert_ne!(output.triangles[0].colors[0], output.triangles[0].colors[1]);
    }
}
