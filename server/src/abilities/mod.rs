//! Authoritative combat abilities.
//!
//! The WebView supplies only an input intent (`slot` and target point). This
//! module owns class loadouts, cooldowns, projectile shapes and movement
//! effects, so a client cannot forge a high-damage projectile or emulate a
//! skill with a different number of shots.

use serde_json::{Value, json};
use std::time::Duration;

pub struct CastContext<'a> {
    pub owner_id: &'a str,
    pub player: &'a Value,
    pub target_x: f64,
    pub target_y: f64,
    pub sequence: &'a mut u64,
}

pub struct CastOutput {
    pub id: &'static str,
    pub cooldown: Duration,
    pub projectiles: Vec<Value>,
    pub destination: Option<(f64, f64)>,
}

trait Ability: Sync {
    fn id(&self) -> &'static str;
    fn cooldown(&self) -> Duration;
    fn execute(&self, context: &mut CastContext<'_>) -> CastOutput;
}

#[derive(Clone, Copy)]
enum ProjectileKind {
    Bullet,
    SlashWave,
    MagicOrb,
}

#[derive(Clone, Copy)]
struct ProjectileAbility {
    id: &'static str,
    cooldown_seconds: f64,
    kind: ProjectileKind,
    count: usize,
    spread_radians: f64,
    speed: f64,
    damage_multiplier: f64,
    range: f64,
    color: &'static str,
    size: f64,
    piercing: bool,
    target_origin: bool,
}

impl Ability for ProjectileAbility {
    fn id(&self) -> &'static str { self.id }

    fn cooldown(&self) -> Duration { Duration::from_secs_f64(self.cooldown_seconds) }

    fn execute(&self, context: &mut CastContext<'_>) -> CastOutput {
        let (player_x, player_y) = player_position(context.player);
        let (target_x, target_y) = bounded_target(player_x, player_y, context.target_x, context.target_y, self.range.min(1_000.0));
        let angle = (target_y - player_y).atan2(target_x - player_x);
        let count = self.count.max(1);
        let atk = attack_power(context.player);
        let mut projectiles = Vec::with_capacity(count);
        for index in 0..count {
            let offset = if count == 1 { 0.0 } else { (index as f64 / (count - 1) as f64 - 0.5) * self.spread_radians };
            let shot_angle = angle + offset;
            let (x, y) = if self.target_origin {
                (target_x, target_y - 180.0)
            } else {
                (player_x + shot_angle.cos() * 22.0, player_y + shot_angle.sin() * 22.0)
            };
            let (kind, visual_offset_y) = match self.kind {
                ProjectileKind::Bullet => ("bullet", 0.0),
                ProjectileKind::SlashWave => ("slash_wave", 0.0),
                ProjectileKind::MagicOrb => ("magic_orb", if self.target_origin { -180.0 } else { 0.0 }),
            };
            projectiles.push(json!({
                "id": next_projectile_id(context), "ownerId": context.owner_id, "type": kind,
                "x": x, "y": y, "vx": shot_angle.cos() * self.speed, "vy": shot_angle.sin() * self.speed,
                "damage": (atk * self.damage_multiplier).round(), "range": self.range,
                "distanceTraveled": 0.0, "color": self.color, "size": self.size,
                "piercing": self.piercing, "visualOffsetY": visual_offset_y,
            }));
        }
        CastOutput { id: self.id(), cooldown: self.cooldown(), projectiles, destination: None }
    }
}

#[derive(Clone, Copy)]
struct DashAbility {
    id: &'static str,
    cooldown_seconds: f64,
    distance: f64,
    damage_multiplier: f64,
    color: &'static str,
}

impl Ability for DashAbility {
    fn id(&self) -> &'static str { self.id }

    fn cooldown(&self) -> Duration { Duration::from_secs_f64(self.cooldown_seconds) }

    fn execute(&self, context: &mut CastContext<'_>) -> CastOutput {
        let (player_x, player_y) = player_position(context.player);
        let (target_x, target_y) = bounded_target(player_x, player_y, context.target_x, context.target_y, self.distance);
        let angle = (target_y - player_y).atan2(target_x - player_x);
        let destination = (player_x + angle.cos() * self.distance.min((target_x - player_x).hypot(target_y - player_y)), player_y + angle.sin() * self.distance.min((target_x - player_x).hypot(target_y - player_y)));
        let projectile = json!({
            "id": next_projectile_id(context), "ownerId": context.owner_id, "type": "slash_wave",
            "x": destination.0, "y": destination.1, "vx": 0.0, "vy": 0.0,
            "damage": (attack_power(context.player) * self.damage_multiplier).round(), "range": 85.0,
            "distanceTraveled": 0.0, "color": self.color, "size": 22.0, "piercing": true,
        });
        CastOutput { id: self.id(), cooldown: self.cooldown(), projectiles: vec![projectile], destination: Some(destination) }
    }
}

static GUNSLINGER: [ProjectileAbility; 3] = [
    ProjectileAbility { id: "skill_gatling_burst", cooldown_seconds: 2.2, kind: ProjectileKind::Bullet, count: 12, spread_radians: 0.16, speed: 24.0, damage_multiplier: 0.95, range: 1_400.0, color: "#F472B6", size: 5.0, piercing: false, target_origin: false },
    ProjectileAbility { id: "skill_bullet_fan", cooldown_seconds: 3.2, kind: ProjectileKind::Bullet, count: 9, spread_radians: 70.0_f64.to_radians(), speed: 22.0, damage_multiplier: 1.3, range: 1_300.0, color: "#38BDF8", size: 6.0, piercing: true, target_origin: false },
    ProjectileAbility { id: "skill_aerial_aimbot", cooldown_seconds: 7.0, kind: ProjectileKind::Bullet, count: 6, spread_radians: 1.25, speed: 24.0, damage_multiplier: 1.7, range: 1_600.0, color: "#FDE047", size: 6.0, piercing: true, target_origin: false },
];

static SWORDMASTER: [ProjectileAbility; 3] = [
    ProjectileAbility { id: "skill_spinning_blade", cooldown_seconds: 4.0, kind: ProjectileKind::SlashWave, count: 8, spread_radians: std::f64::consts::TAU, speed: 14.0, damage_multiplier: 1.5, range: 500.0, color: "#FDE047", size: 18.0, piercing: true, target_origin: false },
    ProjectileAbility { id: "skill_slash_scatter", cooldown_seconds: 3.0, kind: ProjectileKind::SlashWave, count: 3, spread_radians: 0.7, speed: 20.0, damage_multiplier: 1.25, range: 320.0, color: "#A855F7", size: 16.0, piercing: true, target_origin: false },
    ProjectileAbility { id: "skill_blade_storm", cooldown_seconds: 9.0, kind: ProjectileKind::SlashWave, count: 12, spread_radians: std::f64::consts::TAU, speed: 18.0, damage_multiplier: 1.8, range: 520.0, color: "#F8FAFC", size: 18.0, piercing: true, target_origin: true },
];

static CYBERMAGE_PROJECTILES: [ProjectileAbility; 2] = [
    ProjectileAbility { id: "skill_meteor_rain", cooldown_seconds: 8.0, kind: ProjectileKind::MagicOrb, count: 24, spread_radians: 1.1, speed: 16.0, damage_multiplier: 1.8, range: 700.0, color: "#FB7185", size: 14.0, piercing: false, target_origin: true },
    ProjectileAbility { id: "skill_hellhounds", cooldown_seconds: 6.0, kind: ProjectileKind::MagicOrb, count: 8, spread_radians: std::f64::consts::TAU, speed: 30.0, damage_multiplier: 1.9, range: 600.0, color: "#22D3EE", size: 10.0, piercing: true, target_origin: true },
];

static CYBERMAGE_DASH: DashAbility = DashAbility { id: "skill_titan_golem", cooldown_seconds: 7.0, distance: 450.0, damage_multiplier: 2.2, color: "#67E8F9" };

/// Resolve a loadout slot entirely on the server. `None` means an invalid
/// class/slot and must not consume a cooldown.
pub fn cast(class: &str, slot: usize, context: &mut CastContext<'_>) -> Option<CastOutput> {
    let ability: &dyn Ability = match (class, slot) {
        ("gunslinger", 0..=2) => &GUNSLINGER[slot],
        ("swordmaster", 0..=2) => &SWORDMASTER[slot],
        ("cybermage", 0..=1) => &CYBERMAGE_PROJECTILES[slot],
        ("cybermage", 2) => &CYBERMAGE_DASH,
        _ => return None,
    };
    Some(ability.execute(context))
}

fn next_projectile_id(context: &mut CastContext<'_>) -> String {
    *context.sequence = context.sequence.wrapping_add(1);
    format!("skill_{}_{}", context.owner_id, *context.sequence)
}

fn player_position(player: &Value) -> (f64, f64) {
    (number(player, "x", 0.0), number(player, "y", 0.0))
}

fn attack_power(player: &Value) -> f64 {
    let level = number(player, "level", 1.0).clamp(1.0, 1_000.0);
    // Progression is server-owned as well; until equipment stats move here,
    // use a deterministic level baseline rather than client-provided damage.
    10.0 + level * 2.0
}

fn number(value: &Value, field: &str, fallback: f64) -> f64 {
    value.get(field).and_then(Value::as_f64).filter(|value| value.is_finite()).unwrap_or(fallback)
}

fn bounded_target(x: f64, y: f64, target_x: f64, target_y: f64, range: f64) -> (f64, f64) {
    let dx = target_x - x;
    let dy = target_y - y;
    let distance = dx.hypot(dy);
    if distance > range && distance > 0.0 {
        (x + dx / distance * range, y + dy / distance * range)
    } else {
        (target_x, target_y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gunslinger_slot_creates_server_owned_burst() {
        let player = json!({ "x": 100.0, "y": 200.0, "level": 3.0 });
        let mut sequence = 0;
        let output = cast("gunslinger", 0, &mut CastContext { owner_id: "miku", player: &player, target_x: 300.0, target_y: 200.0, sequence: &mut sequence }).expect("skill exists");
        assert_eq!(output.id, "skill_gatling_burst");
        assert_eq!(output.projectiles.len(), 12);
        assert_eq!(output.projectiles[0]["ownerId"], "miku");
        assert!(cast("gunslinger", 3, &mut CastContext { owner_id: "miku", player: &player, target_x: 300.0, target_y: 200.0, sequence: &mut sequence }).is_none());
    }
}
