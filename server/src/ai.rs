use std::cmp::Ordering;

pub const POLICY_PARAMETER_COUNT: usize = 9;
pub const NPC_LEVEL_COUNT: u8 = 40;
pub const DEFAULT_NPC_LEVEL: u8 = 20;
pub const DIFFICULTY_TIER_COUNT: usize = 5;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    pub const ZERO: Self = Self { x: 0.0, y: 0.0 };

    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn distance(self, other: Self) -> f64 {
        (other.x - self.x).hypot(other.y - self.y)
    }

    pub fn normalized_toward(self, other: Self) -> Self {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        let length = dx.hypot(dy);
        if length <= f64::EPSILON {
            return Self::ZERO;
        }
        Self::new(dx / length, dy / length)
    }

    pub fn scaled(self, scale: f64) -> Self {
        Self::new(self.x * scale, self.y * scale)
    }

    pub fn plus(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y)
    }

    pub fn clamped(self, bounds: WorldBounds) -> Self {
        Self::new(
            self.x.clamp(bounds.min_x, bounds.max_x),
            self.y.clamp(bounds.min_y, bounds.max_y),
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorldBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Archetype {
    Rusher,
    Shooter,
    Flanker,
    Sniper,
    Tank,
    Controller,
}

impl Archetype {
    pub fn from_labels(monster_type: &str, weapon_type: &str, is_boss: bool) -> Self {
        if matches!(weapon_type, "sledgehammer" | "riot_shield") {
            return Self::Tank;
        }
        if weapon_type == "cheytac" || monster_type.contains("sniper") {
            return Self::Sniper;
        }
        if matches!(weapon_type, "molotov" | "staff") {
            return Self::Controller;
        }
        if weapon_type == "shotgun" || monster_type.contains("brawler") {
            return Self::Flanker;
        }
        if matches!(weapon_type, "bat" | "baton" | "blade") || monster_type.contains("wolf") {
            return Self::Rusher;
        }
        if is_boss {
            return Self::Tank;
        }
        Self::Shooter
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Rusher => "rusher",
            Self::Shooter => "shooter",
            Self::Flanker => "flanker",
            Self::Sniper => "sniper",
            Self::Tank => "tank",
            Self::Controller => "controller",
        }
    }

    pub const fn profile(self) -> ArchetypeProfile {
        match self {
            Self::Rusher => ArchetypeProfile {
                perception_range: 760.0,
                memory_seconds: 3.2,
                preferred_distance: 54.0,
                attack_range: 82.0,
                move_speed_scale: 1.18,
                attack_interval: 0.95,
                telegraph_seconds: 0.28,
                retreat_health_ratio: 0.08,
            },
            Self::Shooter => ArchetypeProfile {
                perception_range: 900.0,
                memory_seconds: 4.8,
                preferred_distance: 310.0,
                attack_range: 560.0,
                move_speed_scale: 0.96,
                attack_interval: 1.35,
                telegraph_seconds: 0.42,
                retreat_health_ratio: 0.22,
            },
            Self::Flanker => ArchetypeProfile {
                perception_range: 880.0,
                memory_seconds: 4.5,
                preferred_distance: 225.0,
                attack_range: 430.0,
                move_speed_scale: 1.08,
                attack_interval: 1.65,
                telegraph_seconds: 0.5,
                retreat_health_ratio: 0.18,
            },
            Self::Sniper => ArchetypeProfile {
                perception_range: 1_050.0,
                memory_seconds: 6.0,
                preferred_distance: 650.0,
                attack_range: 790.0,
                move_speed_scale: 0.78,
                attack_interval: 2.8,
                telegraph_seconds: 1.1,
                retreat_health_ratio: 0.28,
            },
            Self::Tank => ArchetypeProfile {
                perception_range: 820.0,
                memory_seconds: 5.0,
                preferred_distance: 78.0,
                attack_range: 105.0,
                move_speed_scale: 0.82,
                attack_interval: 1.55,
                telegraph_seconds: 0.58,
                retreat_health_ratio: 0.04,
            },
            Self::Controller => ArchetypeProfile {
                perception_range: 940.0,
                memory_seconds: 5.4,
                preferred_distance: 390.0,
                attack_range: 620.0,
                move_speed_scale: 0.86,
                attack_interval: 2.25,
                telegraph_seconds: 0.72,
                retreat_health_ratio: 0.25,
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ArchetypeProfile {
    pub perception_range: f64,
    pub memory_seconds: f64,
    pub preferred_distance: f64,
    pub attack_range: f64,
    pub move_speed_scale: f64,
    pub attack_interval: f64,
    pub telegraph_seconds: f64,
    pub retreat_health_ratio: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PolicyParameters {
    pub aggression: f64,
    pub self_preservation: f64,
    pub coordination: f64,
    pub flank_bias: f64,
    pub patience: f64,
    pub preferred_range_scale: f64,
    pub reaction_scale: f64,
    pub cooldown_scale: f64,
    pub aim_lead: f64,
}

impl Default for PolicyParameters {
    fn default() -> Self {
        Self::production()
    }
}

impl PolicyParameters {
    pub const fn production() -> Self {
        Self {
            aggression: 1.1451,
            self_preservation: 0.9722,
            coordination: 0.9981,
            flank_bias: 0.7912,
            patience: 0.8865,
            preferred_range_scale: 0.8961,
            reaction_scale: 1.0443,
            cooldown_scale: 0.9877,
            aim_lead: 0.4001,
        }
    }

    pub fn from_array(values: [f64; POLICY_PARAMETER_COUNT]) -> Self {
        Self {
            aggression: values[0],
            self_preservation: values[1],
            coordination: values[2],
            flank_bias: values[3],
            patience: values[4],
            preferred_range_scale: values[5],
            reaction_scale: values[6],
            cooldown_scale: values[7],
            aim_lead: values[8],
        }
        .clamped()
    }

    pub fn as_array(self) -> [f64; POLICY_PARAMETER_COUNT] {
        [
            self.aggression,
            self.self_preservation,
            self.coordination,
            self.flank_bias,
            self.patience,
            self.preferred_range_scale,
            self.reaction_scale,
            self.cooldown_scale,
            self.aim_lead,
        ]
    }

    pub fn clamped(self) -> Self {
        Self {
            aggression: finite_clamp(self.aggression, 0.35, 2.5, 1.0),
            self_preservation: finite_clamp(self.self_preservation, 0.25, 2.5, 1.0),
            coordination: finite_clamp(self.coordination, 0.25, 2.5, 1.0),
            flank_bias: finite_clamp(self.flank_bias, 0.1, 2.5, 1.0),
            patience: finite_clamp(self.patience, 0.25, 2.5, 1.0),
            preferred_range_scale: finite_clamp(self.preferred_range_scale, 0.7, 1.3, 1.0),
            // Reaction windows and cooldowns have hard fairness floors.
            reaction_scale: finite_clamp(self.reaction_scale, 0.75, 1.8, 1.0),
            cooldown_scale: finite_clamp(self.cooldown_scale, 0.75, 1.8, 1.0),
            aim_lead: finite_clamp(self.aim_lead, 0.0, 0.85, 0.35),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DifficultyTier {
    Training,
    Street,
    Tactical,
    Elite,
    Nemesis,
}

impl DifficultyTier {
    pub const fn from_level(level: u8) -> Self {
        match clamp_npc_level(level) {
            1..=8 => Self::Training,
            9..=16 => Self::Street,
            17..=24 => Self::Tactical,
            25..=32 => Self::Elite,
            _ => Self::Nemesis,
        }
    }

    pub const fn index(self) -> usize {
        match self {
            Self::Training => 0,
            Self::Street => 1,
            Self::Tactical => 2,
            Self::Elite => 3,
            Self::Nemesis => 4,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Training => "training",
            Self::Street => "street",
            Self::Tactical => "tactical",
            Self::Elite => "elite",
            Self::Nemesis => "nemesis",
        }
    }

    pub const fn min_level(self) -> u8 {
        self.index() as u8 * 8 + 1
    }

    pub const fn max_level(self) -> u8 {
        self.min_level() + 7
    }

    pub const fn target_player_win_rate(self) -> f64 {
        match self {
            Self::Training => 0.95,
            Self::Street => 0.75,
            Self::Tactical => 0.58,
            Self::Elite => 0.40,
            Self::Nemesis => 0.22,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DifficultyProfile {
    pub level: u8,
    pub tier: DifficultyTier,
    pub target_player_win_rate: f64,
    pub attack_token_budget: usize,
    pub minimum_health: f64,
    pub health_scale: f64,
    pub damage_scale: f64,
    pub speed_scale: f64,
    pub perception_scale: f64,
    aggression_scale: f64,
    self_preservation_scale: f64,
    coordination_scale: f64,
    flank_scale: f64,
    patience_scale: f64,
    preferred_range_scale: f64,
    reaction_scale: f64,
    cooldown_scale: f64,
    aim_lead_scale: f64,
}

impl DifficultyProfile {
    pub fn from_level(level: u8) -> Self {
        let level = clamp_npc_level(level);
        let tier = DifficultyTier::from_level(level);
        let local = f64::from((level - 1) % 8) / 7.0;
        Self {
            level,
            tier,
            target_player_win_rate: tier.target_player_win_rate(),
            attack_token_budget: tier.index() + 1,
            minimum_health: 450.0 + f64::from(level - 1) * 35.0,
            health_scale: tier_lerp(
                tier,
                local,
                [
                    (1.25, 1.40),
                    (1.09, 1.16),
                    (1.14, 1.23),
                    (1.20, 1.30),
                    (1.52, 1.73),
                ],
            ),
            damage_scale: tier_lerp(
                tier,
                local,
                [
                    (0.85, 1.00),
                    (1.08, 1.20),
                    (1.08, 1.22),
                    (1.05, 1.20),
                    (1.55, 1.85),
                ],
            ),
            speed_scale: tier_lerp(
                tier,
                local,
                [
                    (0.95, 1.02),
                    (1.02, 1.08),
                    (1.08, 1.13),
                    (1.14, 1.20),
                    (1.20, 1.28),
                ],
            ),
            perception_scale: tier_lerp(
                tier,
                local,
                [
                    (0.50, 0.60),
                    (0.82, 0.95),
                    (0.96, 1.07),
                    (1.08, 1.16),
                    (1.17, 1.28),
                ],
            ),
            aggression_scale: tier_lerp(
                tier,
                local,
                [
                    (0.82, 1.00),
                    (1.02, 1.15),
                    (1.15, 1.30),
                    (1.35, 1.50),
                    (1.55, 1.80),
                ],
            ),
            self_preservation_scale: tier_lerp(
                tier,
                local,
                [
                    (0.75, 0.90),
                    (0.95, 1.08),
                    (1.10, 1.25),
                    (1.30, 1.45),
                    (1.50, 1.75),
                ],
            ),
            coordination_scale: tier_lerp(
                tier,
                local,
                [
                    (0.65, 0.90),
                    (0.95, 1.15),
                    (1.20, 1.40),
                    (1.45, 1.70),
                    (1.80, 2.10),
                ],
            ),
            flank_scale: tier_lerp(
                tier,
                local,
                [
                    (0.60, 0.85),
                    (0.90, 1.15),
                    (1.20, 1.45),
                    (1.50, 1.80),
                    (1.90, 2.25),
                ],
            ),
            patience_scale: tier_lerp(
                tier,
                local,
                [
                    (0.82, 0.95),
                    (1.00, 1.12),
                    (1.15, 1.30),
                    (1.35, 1.50),
                    (1.55, 1.75),
                ],
            ),
            preferred_range_scale: tier_lerp(
                tier,
                local,
                [
                    (0.95, 1.00),
                    (1.00, 1.03),
                    (1.03, 1.07),
                    (1.07, 1.11),
                    (1.12, 1.18),
                ],
            ),
            reaction_scale: tier_lerp(
                tier,
                local,
                [
                    (1.45, 1.30),
                    (1.22, 1.08),
                    (1.03, 0.93),
                    (0.88, 0.80),
                    (0.75, 0.65),
                ],
            ),
            cooldown_scale: tier_lerp(
                tier,
                local,
                [
                    (1.45, 1.30),
                    (1.20, 1.08),
                    (1.03, 0.93),
                    (0.88, 0.80),
                    (0.75, 0.65),
                ],
            ),
            aim_lead_scale: tier_lerp(
                tier,
                local,
                [
                    (0.35, 0.60),
                    (0.70, 1.00),
                    (1.05, 1.35),
                    (1.40, 1.70),
                    (1.75, 2.10),
                ],
            ),
        }
    }

    pub fn apply_policy(self, policy: PolicyParameters) -> PolicyParameters {
        let policy = policy.clamped();
        PolicyParameters {
            aggression: policy.aggression * self.aggression_scale,
            self_preservation: policy.self_preservation * self.self_preservation_scale,
            coordination: policy.coordination * self.coordination_scale,
            flank_bias: policy.flank_bias * self.flank_scale,
            patience: policy.patience * self.patience_scale,
            preferred_range_scale: policy.preferred_range_scale * self.preferred_range_scale,
            reaction_scale: policy.reaction_scale * self.reaction_scale,
            cooldown_scale: policy.cooldown_scale * self.cooldown_scale,
            aim_lead: policy.aim_lead * self.aim_lead_scale,
        }
        .clamped()
    }
}

pub const fn clamp_npc_level(level: u8) -> u8 {
    if level < 1 {
        1
    } else if level > NPC_LEVEL_COUNT {
        NPC_LEVEL_COUNT
    } else {
        level
    }
}

fn lerp(start: f64, end: f64, amount: f64) -> f64 {
    start + (end - start) * amount
}

fn tier_lerp(tier: DifficultyTier, local: f64, ranges: [(f64, f64); DIFFICULTY_TIER_COUNT]) -> f64 {
    let (start, end) = ranges[tier.index()];
    lerp(start, end, local)
}

fn finite_clamp(value: f64, min: f64, max: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Intent {
    #[default]
    Idle,
    Investigate,
    Advance,
    Hold,
    Flank,
    Retreat,
    Telegraph,
    Attack,
}

impl Intent {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Investigate => "investigate",
            Self::Advance => "advance",
            Self::Hold => "hold",
            Self::Flank => "flank",
            Self::Retreat => "retreat",
            Self::Telegraph => "telegraph",
            Self::Attack => "attack",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct TargetObservation {
    pub id: String,
    pub position: Vec2,
    pub velocity: Vec2,
    pub health_ratio: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StepInput {
    pub dt: f64,
    pub position: Vec2,
    pub health_ratio: f64,
    pub move_speed: f64,
    pub visible_target: Option<TargetObservation>,
    pub attack_token: bool,
    pub nearby_allies: usize,
    pub committed_allies: usize,
    pub bounds: WorldBounds,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Decision {
    pub intent: Intent,
    pub target_id: Option<String>,
    pub move_direction: Vec2,
    pub aim_position: Option<Vec2>,
    pub fire: bool,
    pub attack_committed: bool,
    pub telegraph_remaining: f64,
    pub telegraph_duration: f64,
    pub utility: f64,
}

impl Decision {
    fn idle() -> Self {
        Self {
            intent: Intent::Idle,
            target_id: None,
            move_direction: Vec2::ZERO,
            aim_position: None,
            fire: false,
            attack_committed: false,
            telegraph_remaining: 0.0,
            telegraph_duration: 0.0,
            utility: 0.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct AgentBrain {
    pub archetype: Archetype,
    pub intent: Intent,
    pub target_id: Option<String>,
    pub last_seen_position: Option<Vec2>,
    pub memory_remaining: f64,
    pub attack_cooldown: f64,
    pub telegraph_remaining: f64,
    pub telegraph_duration: f64,
    pending_aim: Option<Vec2>,
    flank_sign: f64,
    rng_state: u64,
}

impl AgentBrain {
    pub fn new(archetype: Archetype, seed: u64) -> Self {
        let mut brain = Self {
            archetype,
            intent: Intent::Idle,
            target_id: None,
            last_seen_position: None,
            memory_remaining: 0.0,
            attack_cooldown: 0.0,
            telegraph_remaining: 0.0,
            telegraph_duration: 0.0,
            pending_aim: None,
            flank_sign: 1.0,
            rng_state: seed.max(1),
        };
        brain.flank_sign = if brain.next_unit() < 0.5 { -1.0 } else { 1.0 };
        brain
    }

    pub fn is_committed(&self) -> bool {
        self.telegraph_remaining > 0.0 || self.intent == Intent::Attack
    }

    pub fn step(&mut self, input: &StepInput, parameters: PolicyParameters) -> Decision {
        let dt = finite_clamp(input.dt, 0.0, 0.25, 0.0);
        let parameters = parameters.clamped();
        let profile = self.archetype.profile();
        self.attack_cooldown = (self.attack_cooldown - dt).max(0.0);

        if let Some(target) = &input.visible_target {
            self.target_id = Some(target.id.clone());
            self.last_seen_position = Some(target.position);
            self.memory_remaining = profile.memory_seconds;
        } else {
            self.memory_remaining = (self.memory_remaining - dt).max(0.0);
            if self.memory_remaining <= 0.0 {
                self.target_id = None;
                self.last_seen_position = None;
            }
        }

        if self.telegraph_remaining > 0.0 {
            return self.continue_telegraph(dt, input, profile, parameters);
        }

        let Some(target_position) = input
            .visible_target
            .as_ref()
            .map(|target| target.position)
            .or(self.last_seen_position)
        else {
            self.intent = Intent::Idle;
            return Decision::idle();
        };

        if input.visible_target.is_none() {
            self.intent = Intent::Investigate;
            return Decision {
                intent: self.intent,
                target_id: self.target_id.clone(),
                move_direction: input.position.normalized_toward(target_position),
                aim_position: None,
                fire: false,
                attack_committed: false,
                telegraph_remaining: 0.0,
                telegraph_duration: 0.0,
                utility: self.memory_remaining / profile.memory_seconds,
            };
        }

        let distance = input.position.distance(target_position);
        let preferred_distance = profile.preferred_distance * parameters.preferred_range_scale;
        let low_health = (profile.retreat_health_ratio - input.health_ratio).max(0.0)
            / profile.retreat_health_ratio.max(0.01);
        let too_close =
            ((preferred_distance * 0.62 - distance) / preferred_distance.max(1.0)).clamp(0.0, 1.0);
        let too_far =
            ((distance - preferred_distance) / preferred_distance.max(1.0)).clamp(0.0, 2.0);
        let in_attack_range = distance <= profile.attack_range;
        let ready = self.attack_cooldown <= 0.0;
        let ally_pressure = (input.nearby_allies as f64 / 4.0).clamp(0.0, 1.0);
        let crowded_attack = (input.committed_allies as f64 / 4.0).clamp(0.0, 1.0);

        let retreat_score = low_health * 2.4 * parameters.self_preservation
            + too_close * ranged_retreat_weight(self.archetype) * parameters.self_preservation;
        let attack_score = if ready && in_attack_range && input.attack_token {
            1.15 * parameters.aggression + (1.0 - crowded_attack) * parameters.coordination * 0.35
        } else {
            f64::NEG_INFINITY
        };
        let advance_score = if distance > preferred_distance * 1.08 {
            0.42 + too_far * 0.88 * parameters.aggression
        } else {
            0.0
        };
        let flank_score = if matches!(self.archetype, Archetype::Flanker)
            || (!input.attack_token && input.nearby_allies > 0)
        {
            0.36 + parameters.flank_bias * 0.55
                + parameters.coordination * ally_pressure * 0.45
                + if input.attack_token { 0.0 } else { 0.38 }
        } else {
            0.0
        };
        let hold_score =
            if distance >= preferred_distance * 0.78 && distance <= preferred_distance * 1.2 {
                0.52 * parameters.patience + if ready { 0.0 } else { 0.42 }
            } else {
                0.08 * parameters.patience
            };

        let (intent, utility) = [
            (Intent::Retreat, retreat_score),
            (Intent::Attack, attack_score),
            (Intent::Flank, flank_score),
            (Intent::Advance, advance_score),
            (Intent::Hold, hold_score),
        ]
        .into_iter()
        .max_by(|left, right| left.1.partial_cmp(&right.1).unwrap_or(Ordering::Equal))
        .unwrap_or((Intent::Hold, 0.0));

        if intent == Intent::Attack {
            return self.begin_telegraph(input, profile, parameters, utility);
        }

        self.intent = intent;
        let toward = input.position.normalized_toward(target_position);
        let move_direction = match intent {
            Intent::Advance => toward,
            Intent::Retreat => toward.scaled(-1.0),
            Intent::Flank => Vec2::new(-toward.y * self.flank_sign, toward.x * self.flank_sign)
                .scaled(0.88)
                .plus(toward.scaled(0.28)),
            _ => Vec2::ZERO,
        };
        Decision {
            intent,
            target_id: self.target_id.clone(),
            move_direction,
            aim_position: Some(target_position),
            fire: false,
            attack_committed: false,
            telegraph_remaining: 0.0,
            telegraph_duration: 0.0,
            utility,
        }
    }

    fn begin_telegraph(
        &mut self,
        input: &StepInput,
        profile: ArchetypeProfile,
        parameters: PolicyParameters,
        utility: f64,
    ) -> Decision {
        let target = input
            .visible_target
            .as_ref()
            .expect("attack requires visible target");
        let lead_seconds = parameters.aim_lead
            * (input.position.distance(target.position) / profile.attack_range.max(1.0));
        self.pending_aim = Some(target.position.plus(target.velocity.scaled(lead_seconds)));
        self.telegraph_duration = (profile.telegraph_seconds * parameters.reaction_scale).max(0.2);
        self.telegraph_remaining = self.telegraph_duration;
        self.intent = Intent::Telegraph;
        Decision {
            intent: self.intent,
            target_id: self.target_id.clone(),
            move_direction: Vec2::ZERO,
            aim_position: self.pending_aim,
            fire: false,
            attack_committed: true,
            telegraph_remaining: self.telegraph_remaining,
            telegraph_duration: self.telegraph_duration,
            utility,
        }
    }

    fn continue_telegraph(
        &mut self,
        dt: f64,
        input: &StepInput,
        profile: ArchetypeProfile,
        parameters: PolicyParameters,
    ) -> Decision {
        if !input.attack_token {
            self.telegraph_remaining = 0.0;
            self.telegraph_duration = 0.0;
            self.pending_aim = None;
            self.intent = Intent::Hold;
            return Decision {
                intent: self.intent,
                target_id: self.target_id.clone(),
                move_direction: Vec2::ZERO,
                aim_position: self.last_seen_position,
                fire: false,
                attack_committed: false,
                telegraph_remaining: 0.0,
                telegraph_duration: 0.0,
                utility: 0.0,
            };
        }
        self.telegraph_remaining = (self.telegraph_remaining - dt).max(0.0);
        let fire = self.telegraph_remaining <= 0.0;
        self.intent = if fire {
            self.attack_cooldown = profile.attack_interval * parameters.cooldown_scale;
            if self.next_unit() < 0.28 {
                self.flank_sign *= -1.0;
            }
            Intent::Attack
        } else {
            Intent::Telegraph
        };
        let decision = Decision {
            intent: self.intent,
            target_id: self.target_id.clone(),
            move_direction: Vec2::ZERO,
            aim_position: self.pending_aim.or(self.last_seen_position),
            fire,
            attack_committed: true,
            telegraph_remaining: self.telegraph_remaining,
            telegraph_duration: self.telegraph_duration,
            utility: 1.0,
        };
        if fire {
            self.pending_aim = None;
            self.telegraph_duration = 0.0;
        }
        // Keep the target within the world even when velocity prediction points
        // beyond an edge.
        Decision {
            aim_position: decision
                .aim_position
                .map(|point| point.clamped(input.bounds)),
            ..decision
        }
    }

    fn next_unit(&mut self) -> f64 {
        self.rng_state ^= self.rng_state << 13;
        self.rng_state ^= self.rng_state >> 7;
        self.rng_state ^= self.rng_state << 17;
        (self.rng_state >> 11) as f64 / (u64::MAX >> 11) as f64
    }
}

fn ranged_retreat_weight(archetype: Archetype) -> f64 {
    match archetype {
        Archetype::Shooter | Archetype::Flanker => 1.1,
        Archetype::Sniper | Archetype::Controller => 1.55,
        Archetype::Rusher | Archetype::Tank => 0.05,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BOUNDS: WorldBounds = WorldBounds {
        min_x: 0.0,
        max_x: 1_000.0,
        min_y: 0.0,
        max_y: 1_000.0,
    };

    fn target(distance: f64) -> TargetObservation {
        TargetObservation {
            id: "player".into(),
            position: Vec2::new(100.0 + distance, 100.0),
            velocity: Vec2::ZERO,
            health_ratio: 1.0,
        }
    }

    fn input(target: Option<TargetObservation>) -> StepInput {
        StepInput {
            dt: 0.1,
            position: Vec2::new(100.0, 100.0),
            health_ratio: 1.0,
            move_speed: 2.0,
            visible_target: target,
            attack_token: true,
            nearby_allies: 2,
            committed_allies: 0,
            bounds: BOUNDS,
        }
    }

    #[test]
    fn archetype_mapping_is_data_driven() {
        assert_eq!(
            Archetype::from_labels("bandit_sniper", "cheytac", false),
            Archetype::Sniper
        );
        assert_eq!(
            Archetype::from_labels("forest_wolf", "bat", false),
            Archetype::Rusher
        );
        assert_eq!(
            Archetype::from_labels("punk_grunt", "sledgehammer", true),
            Archetype::Tank
        );
        assert_eq!(
            Archetype::from_labels("cadet_mage", "staff", true),
            Archetype::Controller
        );
    }

    #[test]
    fn attack_has_a_telegraph_before_it_fires() {
        let mut brain = AgentBrain::new(Archetype::Shooter, 7);
        let first = brain.step(&input(Some(target(300.0))), PolicyParameters::default());
        assert_eq!(first.intent, Intent::Telegraph);
        assert!(!first.fire);
        assert!(first.telegraph_remaining >= 0.2);

        let mut fired = false;
        for _ in 0..10 {
            let decision = brain.step(&input(Some(target(300.0))), PolicyParameters::default());
            fired |= decision.fire;
        }
        assert!(fired);
    }

    #[test]
    fn agent_without_attack_token_repositions_instead_of_firing() {
        let mut brain = AgentBrain::new(Archetype::Flanker, 9);
        let mut observation = input(Some(target(220.0)));
        observation.attack_token = false;
        let decision = brain.step(&observation, PolicyParameters::default());
        assert_eq!(decision.intent, Intent::Flank);
        assert!(!decision.fire);
        assert!(!decision.attack_committed);
    }

    #[test]
    fn losing_an_attack_token_cancels_the_pending_shot() {
        let mut brain = AgentBrain::new(Archetype::Shooter, 11);
        let first = brain.step(&input(Some(target(300.0))), PolicyParameters::default());
        assert_eq!(first.intent, Intent::Telegraph);

        let mut without_token = input(Some(target(300.0)));
        without_token.attack_token = false;
        let cancelled = brain.step(&without_token, PolicyParameters::default());
        assert!(!cancelled.fire);
        assert!(!cancelled.attack_committed);
        assert_eq!(cancelled.telegraph_remaining, 0.0);
    }

    #[test]
    fn memory_expires_and_target_is_forgotten() {
        let mut brain = AgentBrain::new(Archetype::Rusher, 11);
        brain.step(&input(Some(target(300.0))), PolicyParameters::default());
        let mut hidden = input(None);
        hidden.dt = 0.25;
        let first_hidden = brain.step(&hidden, PolicyParameters::default());
        assert_eq!(first_hidden.intent, Intent::Investigate);
        for _ in 0..20 {
            brain.step(&hidden, PolicyParameters::default());
        }
        assert_eq!(brain.intent, Intent::Idle);
        assert!(brain.target_id.is_none());
    }

    #[test]
    fn low_health_ranged_agent_retreats() {
        let mut brain = AgentBrain::new(Archetype::Sniper, 13);
        let mut observation = input(Some(target(120.0)));
        observation.health_ratio = 0.05;
        let decision = brain.step(&observation, PolicyParameters::default());
        assert_eq!(decision.intent, Intent::Retreat);
        assert!(decision.move_direction.x < 0.0);
    }

    #[test]
    fn non_finite_parameters_fall_back_to_safe_values() {
        let policy = PolicyParameters::from_array([
            f64::NAN,
            f64::INFINITY,
            10.0,
            -5.0,
            1.0,
            1.0,
            0.0,
            0.0,
            1.0,
        ]);
        assert_eq!(policy.aggression, 1.0);
        assert_eq!(policy.self_preservation, 1.0);
        assert_eq!(policy.coordination, 2.5);
        assert_eq!(policy.flank_bias, 0.1);
        assert_eq!(policy.reaction_scale, 0.75);
        assert_eq!(policy.cooldown_scale, 0.75);
        assert_eq!(policy.aim_lead, 0.85);
    }

    #[test]
    fn npc_levels_change_behavior_and_attack_budget() {
        let training = DifficultyProfile::from_level(1);
        let nemesis = DifficultyProfile::from_level(40);
        let training_policy = training.apply_policy(PolicyParameters::production());
        let nemesis_policy = nemesis.apply_policy(PolicyParameters::production());

        assert_eq!(training.tier, DifficultyTier::Training);
        assert_eq!(nemesis.tier, DifficultyTier::Nemesis);
        assert_eq!(training.attack_token_budget, 1);
        assert_eq!(nemesis.attack_token_budget, 5);
        assert_eq!(training.minimum_health, 450.0);
        assert!(training.health_scale >= 1.25);
        assert!(nemesis.health_scale > training.health_scale);
        assert!(nemesis.damage_scale > training.damage_scale);
        assert!(training_policy.reaction_scale > nemesis_policy.reaction_scale);
        assert!(training_policy.cooldown_scale > nemesis_policy.cooldown_scale);
        assert!(training_policy.coordination < nemesis_policy.coordination);
        assert!(training_policy.aim_lead < nemesis_policy.aim_lead);
        assert!(training.perception_scale < nemesis.perception_scale);
        assert!(training.target_player_win_rate > nemesis.target_player_win_rate);
    }
}
