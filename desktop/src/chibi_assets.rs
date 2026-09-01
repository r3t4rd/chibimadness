//! Bounded native character asset recipes.
//!
//! These are source-coordinate meshes, not Canvas display-list commands. A
//! recipe is selected by a small cosmetic configuration and tessellated by the
//! WGPU renderer locally, so the WebView never has to stream drawing work.

#[derive(Clone, Copy)]
pub enum Paint {
    Hair,
    Skin,
    Eye,
    Accent,
    Ribbon,
    Hat,
    Wing,
    Outline,
    Dark,
    White,
}

#[derive(Clone, Copy)]
pub enum PathCommand {
    Move(f32, f32),
    Line(f32, f32),
    Cubic(f32, f32, f32, f32, f32, f32),
    Close,
}

#[derive(Clone, Copy)]
pub enum Primitive {
    Path {
        commands: &'static [PathCommand],
        fill: Paint,
        stroke: Option<Paint>,
        stroke_width: f32,
    },
    Rect {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        fill: Paint,
        stroke: Option<Paint>,
        stroke_width: f32,
    },
    Ellipse {
        x: f32,
        y: f32,
        radius_x: f32,
        radius_y: f32,
        fill: Paint,
        stroke: Option<Paint>,
        stroke_width: f32,
    },
    Line {
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
        width: f32,
        paint: Paint,
    },
}

const LEFT_TAIL: &[PathCommand] = &[
    PathCommand::Move(-18.0, -20.0),
    PathCommand::Cubic(-38.0, -5.0, -34.0, 18.0, -26.0, 38.0),
    PathCommand::Cubic(-22.0, 44.0, -18.0, 44.0, -19.0, 36.0),
    PathCommand::Cubic(-24.0, 16.0, -20.0, -5.0, -14.0, -20.0),
    PathCommand::Close,
];

const RIGHT_TAIL: &[PathCommand] = &[
    PathCommand::Move(18.0, -20.0),
    PathCommand::Cubic(38.0, -5.0, 34.0, 18.0, 26.0, 38.0),
    PathCommand::Cubic(22.0, 44.0, 18.0, 44.0, 19.0, 36.0),
    PathCommand::Cubic(24.0, 16.0, 20.0, -5.0, 14.0, -20.0),
    PathCommand::Close,
];

const IDOL_SKIRT: &[PathCommand] = &[
    PathCommand::Move(-16.0, 2.0),
    PathCommand::Line(16.0, 2.0),
    PathCommand::Line(20.0, 11.0),
    PathCommand::Line(-20.0, 11.0),
    PathCommand::Close,
];

const HEAD: &[PathCommand] = &[
    PathCommand::Move(-25.0, -22.0),
    PathCommand::Cubic(-28.0, -8.0, -14.0, 0.0, 0.0, 0.0),
    PathCommand::Cubic(14.0, 0.0, 28.0, -8.0, 25.0, -22.0),
    PathCommand::Cubic(28.0, -42.0, -28.0, -42.0, -25.0, -22.0),
    PathCommand::Close,
];

const MIKU_FRINGE: &[PathCommand] = &[
    PathCommand::Move(-26.0, -30.0),
    PathCommand::Line(-28.0, -6.0),
    PathCommand::Line(-21.0, -6.0),
    PathCommand::Line(-19.0, -18.0),
    PathCommand::Line(-5.0, -17.0),
    PathCommand::Line(0.0, -23.0),
    PathCommand::Line(5.0, -17.0),
    PathCommand::Line(19.0, -18.0),
    PathCommand::Line(21.0, -6.0),
    PathCommand::Line(28.0, -6.0),
    PathCommand::Line(26.0, -30.0),
    PathCommand::Cubic(22.0, -48.0, -22.0, -48.0, -26.0, -30.0),
    PathCommand::Close,
];

/// Full source-coordinate layering for the Hatsune Miku preset. The order is
/// the same as `drawChibiCharacter`: wings, back hair, body, face, fringe,
/// headwear and halo.
pub const MIKU: &[Primitive] = &[
    Primitive::Rect { x: -37.0, y: -7.0, width: 8.0, height: 8.0, fill: Paint::Wing, stroke: None, stroke_width: 0.0 },
    Primitive::Rect { x: -47.0, y: 1.0, width: 7.0, height: 7.0, fill: Paint::Wing, stroke: None, stroke_width: 0.0 },
    Primitive::Rect { x: -55.0, y: 9.0, width: 6.0, height: 6.0, fill: Paint::Wing, stroke: None, stroke_width: 0.0 },
    Primitive::Rect { x: 37.0, y: -7.0, width: 8.0, height: 8.0, fill: Paint::Wing, stroke: None, stroke_width: 0.0 },
    Primitive::Rect { x: 47.0, y: 1.0, width: 7.0, height: 7.0, fill: Paint::Wing, stroke: None, stroke_width: 0.0 },
    Primitive::Rect { x: 55.0, y: 9.0, width: 6.0, height: 6.0, fill: Paint::Wing, stroke: None, stroke_width: 0.0 },
    Primitive::Path { commands: LEFT_TAIL, fill: Paint::Hair, stroke: Some(Paint::Outline), stroke_width: 2.5 },
    Primitive::Path { commands: RIGHT_TAIL, fill: Paint::Hair, stroke: Some(Paint::Outline), stroke_width: 2.5 },
    Primitive::Rect { x: -19.5, y: -20.0, width: 9.0, height: 8.0, fill: Paint::Dark, stroke: Some(Paint::Ribbon), stroke_width: 1.8 },
    Primitive::Rect { x: 19.5, y: -20.0, width: 9.0, height: 8.0, fill: Paint::Dark, stroke: Some(Paint::Ribbon), stroke_width: 1.8 },
    Primitive::Rect { x: -7.0, y: 12.5, width: 8.0, height: 11.0, fill: Paint::Dark, stroke: Some(Paint::Outline), stroke_width: 2.5 },
    Primitive::Rect { x: 7.0, y: 12.5, width: 8.0, height: 11.0, fill: Paint::Dark, stroke: Some(Paint::Outline), stroke_width: 2.5 },
    Primitive::Path { commands: IDOL_SKIRT, fill: Paint::Accent, stroke: Some(Paint::Outline), stroke_width: 2.5 },
    Primitive::Ellipse { x: -18.0, y: 11.0, radius_x: 3.0, radius_y: 2.2, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: -6.0, y: 11.0, radius_x: 3.0, radius_y: 2.2, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 6.0, y: 11.0, radius_x: 3.0, radius_y: 2.2, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 18.0, y: 11.0, radius_x: 3.0, radius_y: 2.2, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Rect { x: 0.0, y: -5.0, width: 26.0, height: 14.0, fill: Paint::Accent, stroke: Some(Paint::Outline), stroke_width: 2.2 },
    Primitive::Ellipse { x: -8.0, y: -9.0, radius_x: 1.1, radius_y: 1.1, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: -3.0, y: -5.0, radius_x: 1.1, radius_y: 1.1, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 2.0, y: -1.0, radius_x: 1.1, radius_y: 1.1, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 7.0, y: -5.0, radius_x: 1.1, radius_y: 1.1, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Path { commands: HEAD, fill: Paint::Skin, stroke: Some(Paint::Outline), stroke_width: 2.8 },
    Primitive::Path { commands: MIKU_FRINGE, fill: Paint::Hair, stroke: Some(Paint::Outline), stroke_width: 2.6 },
    Primitive::Line { start_x: -26.0, start_y: -32.0, end_x: -13.0, end_y: -46.0, width: 4.0, paint: Paint::Hat },
    Primitive::Line { start_x: -13.0, start_y: -46.0, end_x: 0.0, end_y: -49.0, width: 4.0, paint: Paint::Hat },
    Primitive::Line { start_x: 0.0, start_y: -49.0, end_x: 13.0, end_y: -46.0, width: 4.0, paint: Paint::Hat },
    Primitive::Line { start_x: 13.0, start_y: -46.0, end_x: 26.0, end_y: -32.0, width: 4.0, paint: Paint::Hat },
    Primitive::Ellipse { x: -26.0, y: -32.0, radius_x: 5.0, radius_y: 12.0, fill: Paint::Dark, stroke: Some(Paint::Outline), stroke_width: 2.4 },
    Primitive::Ellipse { x: 26.0, y: -32.0, radius_x: 5.0, radius_y: 12.0, fill: Paint::Dark, stroke: Some(Paint::Outline), stroke_width: 2.4 },
    Primitive::Ellipse { x: -26.0, y: -32.0, radius_x: 2.0, radius_y: 8.0, fill: Paint::Hat, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 26.0, y: -32.0, radius_x: 2.0, radius_y: 8.0, fill: Paint::Hat, stroke: None, stroke_width: 0.0 },
    // Miku's source preset uses eyesOverHair, so the entire face layer is
    // intentionally emitted after the fringe and headphones.
    Primitive::Ellipse { x: -11.0, y: -18.5, radius_x: 6.2, radius_y: 7.2, fill: Paint::White, stroke: Some(Paint::Outline), stroke_width: 1.5 },
    Primitive::Ellipse { x: 11.0, y: -18.5, radius_x: 6.2, radius_y: 7.2, fill: Paint::White, stroke: Some(Paint::Outline), stroke_width: 1.5 },
    Primitive::Ellipse { x: -11.0, y: -18.0, radius_x: 5.0, radius_y: 6.1, fill: Paint::Eye, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 11.0, y: -18.0, radius_x: 5.0, radius_y: 6.1, fill: Paint::Eye, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: -11.0, y: -17.0, radius_x: 2.5, radius_y: 3.5, fill: Paint::Dark, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 11.0, y: -17.0, radius_x: 2.5, radius_y: 3.5, fill: Paint::Dark, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: -13.0, y: -21.0, radius_x: 1.8, radius_y: 2.0, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Ellipse { x: 9.0, y: -21.0, radius_x: 1.8, radius_y: 2.0, fill: Paint::White, stroke: None, stroke_width: 0.0 },
    Primitive::Line { start_x: -3.0, start_y: -10.0, end_x: 3.0, end_y: -10.0, width: 1.8, paint: Paint::Outline },
    Primitive::Ellipse { x: 0.0, y: -56.0, radius_x: 20.0, radius_y: 3.0, fill: Paint::Wing, stroke: None, stroke_width: 0.0 },
];

pub fn is_miku(front_hair: &str, back_hair: &str, hair: &str, hat: &str, outfit: &str) -> bool {
    (front_hair == "miku_fringe" || hair == "miku_twintails")
        && (back_hair == "miku_twintails" || hair == "miku_twintails")
        && hat == "headphones"
        && outfit == "idol_stage"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_only_the_complete_virtual_idol_recipe() {
        assert!(is_miku(
            "miku_fringe",
            "miku_twintails",
            "miku_twintails",
            "headphones",
            "idol_stage",
        ));
        assert!(!is_miku(
            "miku_fringe",
            "miku_twintails",
            "miku_twintails",
            "none",
            "idol_stage",
        ));
        assert!(MIKU.len() > 30);
    }
}
