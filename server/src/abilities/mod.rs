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
    /// Immediate melee damage resolved by the server at cast time. Travelling
    /// projectiles remain for their later follow-up hits and presentation.
    pub cone_hits: Vec<ConeHit>,
    pub destination: Option<(f64, f64)>,
}

/// A server-authoritative sweep in front of a caster.
#[derive(Clone, Copy, Debug)]
pub struct ConeHit {
    pub origin_x: f64,
    pub origin_y: f64,
    pub angle: f64,
    pub range: f64,
    pub arc_radians: f64,
    pub damage: f64,
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
                // The visible Reaper crescent is much wider than its centre
                // point. Preserve that volume for server collision too.
                "collisionRadius": if self.id == "basic_scythe" { 80.0 } else { 30.0 + self.size },
            }));
        }
        CastOutput { id: self.id(), cooldown: self.cooldown(), projectiles, cone_hits: Vec::new(), destination: None }
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
        CastOutput { id: self.id(), cooldown: self.cooldown(), projectiles: vec![projectile], cone_hits: Vec::new(), destination: Some(destination) }
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

/// Server-owned primary attack. The client supplies only where it aimed; the
/// active weapon comes from the server's player record and never from a
/// client-built projectile payload.
pub fn basic_attack(weapon: &str, context: &mut CastContext<'_>) -> CastOutput {
    let ability = match weapon {
        "scythe" => ProjectileAbility {
            id: "basic_scythe", cooldown_seconds: 0.48, kind: ProjectileKind::SlashWave,
            count: 3, spread_radians: 0.9, speed: 10.0, damage_multiplier: 0.4,
            range: 180.0, color: "#84CC16", size: 26.0, piercing: true, target_origin: false,
        },
        "katana" | "sledgehammer" | "greatsword" => ProjectileAbility {
            id: "basic_melee", cooldown_seconds: 0.22, kind: ProjectileKind::SlashWave,
            count: 1, spread_radians: 0.0, speed: 14.0, damage_multiplier: 1.25,
            range: 190.0, color: "#F8FAFC", size: 16.0, piercing: true, target_origin: false,
        },
        "staff" | "wand" | "grimoire" | "totem" => ProjectileAbility {
            id: "basic_magic", cooldown_seconds: 0.18, kind: ProjectileKind::MagicOrb,
            count: 1, spread_radians: 0.0, speed: 18.0, damage_multiplier: 1.15,
            range: 1_050.0, color: "#A78BFA", size: 8.0, piercing: false, target_origin: false,
        },
        "shotgun" => ProjectileAbility {
            id: "basic_shotgun", cooldown_seconds: 0.45, kind: ProjectileKind::Bullet,
            count: 6, spread_radians: 0.42, speed: 22.0, damage_multiplier: 0.58,
            range: 680.0, color: "#FDE047", size: 4.5, piercing: false, target_origin: false,
        },
        "cheytac" => ProjectileAbility {
            id: "basic_cheytac", cooldown_seconds: 0.85, kind: ProjectileKind::Bullet,
            count: 1, spread_radians: 0.0, speed: 38.0, damage_multiplier: 3.1,
            range: 2_200.0, color: "#E2E8F0", size: 6.0, piercing: true, target_origin: false,
        },
        "ak47" | "mac10" | "revolver" | "pistol" | "throwing_knives" | _ => ProjectileAbility {
            id: "basic_firearm", cooldown_seconds: 0.12, kind: ProjectileKind::Bullet,
            count: 1, spread_radians: 0.0, speed: 24.0, damage_multiplier: 1.2,
            range: 1_500.0, color: "#38BDF8", size: 5.0, piercing: false, target_origin: false,
        },
    };
    let mut output = ability.execute(context);
    if weapon == "scythe" {
        let (origin_x, origin_y) = player_position(context.player);
        let angle = (context.target_y - origin_y).atan2(context.target_x - origin_x);
        output.cone_hits.push(ConeHit {
            origin_x,
            origin_y,
            angle,
            range: 140.0,
            arc_radians: 2.5,
            damage: (attack_power(context.player) * 1.85).round(),
        });
        // Each animated crescent has its own server-side sweep. This does not
        // depend on the WebView visual projectile surviving long enough to
        // overlap a replicated target.
        for offset in [-0.45_f64, 0.0, 0.45] {
            output.cone_hits.push(ConeHit {
                origin_x,
                origin_y,
                angle: angle + offset,
                range: 180.0,
                arc_radians: 0.8,
                damage: (attack_power(context.player) * 0.4).round(),
            });
        }
    }
    output
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

    #[test]
    fn primary_shot_uses_server_weapon_pattern() {
        let player = json!({ "x": 100.0, "y": 200.0, "level": 3.0 });
        let mut sequence = 0;
        let output = basic_attack("shotgun", &mut CastContext { owner_id: "miku", player: &player, target_x: 300.0, target_y: 200.0, sequence: &mut sequence });
        assert_eq!(output.id, "basic_shotgun");
        assert_eq!(output.projectiles.len(), 6);
        assert!(output.projectiles.iter().all(|projectile| projectile["ownerId"] == "miku"));
    }

    #[test]
    fn reaper_scythe_primary_uses_three_crescent_waves() {
        let player = json!({ "x": 100.0, "y": 200.0, "level": 3.0 });
        let mut sequence = 0;
        let output = basic_attack(
            "scythe",
            &mut CastContext {
                owner_id: "reaper",
                player: &player,
                target_x: 300.0,
                target_y: 200.0,
                sequence: &mut sequence,
            },
        );
        assert_eq!(output.id, "basic_scythe");
        assert_eq!(output.projectiles.len(), 3);
        assert!(output.projectiles.iter().all(|projectile| {
            projectile["type"] == "slash_wave"
                && projectile["color"] == "#84CC16"
                && projectile["piercing"] == true
        }));
        assert_eq!(output.cone_hits.len(), 4);
        assert_eq!(output.cone_hits[0].range, 140.0);
        assert_eq!(output.cone_hits[0].arc_radians, 2.5);
        assert_eq!(output.cone_hits[0].damage, 30.0);
        assert_eq!(output.cone_hits[1].range, 180.0);
        assert_eq!(output.cone_hits[1].damage, 6.0);
        assert_eq!(output.cone_hits[1].angle, -0.45);
        assert_eq!(output.cone_hits[3].angle, 0.45);
        assert!(output.projectiles.iter().all(|projectile| projectile["collisionRadius"] == 80.0));
    }
}
