import type { Player, Projectile } from '../types/game';

export type CombatVisualProjectile = {
  projectile: Projectile;
  startsAt: number;
  expiresAt: number;
};

type VisualBurst = {
  projectileType: Projectile['type'];
  count: number;
  spreadRadians: number;
  delayMs: number;
  speed: number;
  range: number;
  colors: string[];
  size: number;
  piercing?: boolean;
};

// Presentation-only counterparts to the Rust `abilities` module. They give
// input feedback immediately; authoritative hit detection and server snapshots
// are intentionally not derived from this table.
const SHARED_SKILL_BURSTS: Record<string, VisualBurst> = {
  skill_gatling_burst: { projectileType: 'bullet', count: 12, spreadRadians: 0.16, delayMs: 45, speed: 24, range: 1_400, colors: ['#F472B6'], size: 5 },
  // This remains the same nine long-range, penetrating server shots. Only
  // its presentation is an orb fan, matching the original Miku effect.
  skill_bullet_fan: { projectileType: 'magic_orb', count: 9, spreadRadians: 70 * Math.PI / 180, delayMs: 0, speed: 22, range: 1_300, colors: ['#C084FC', '#38BDF8', '#FDE047'], size: 9, piercing: true },
  skill_aerial_aimbot: { projectileType: 'bullet', count: 6, spreadRadians: 1.25, delayMs: 50, speed: 24, range: 1_600, colors: ['#FDE047'], size: 6, piercing: true },
  skill_spinning_blade: { projectileType: 'slash_wave', count: 8, spreadRadians: Math.PI * 2, delayMs: 0, speed: 14, range: 500, colors: ['#FDE047'], size: 18, piercing: true },
  // The axe/scythe dash is three outward half-circle cuts, not one fallback
  // wave. Values mirror `SWORDMASTER[1]` in Rust; only their paint is TS.
  skill_slash_scatter: { projectileType: 'slash_wave', count: 3, spreadRadians: 0.7, delayMs: 0, speed: 20, range: 320, colors: ['#A855F7'], size: 16, piercing: true },
  skill_blade_storm: { projectileType: 'slash_wave', count: 12, spreadRadians: Math.PI * 2, delayMs: 0, speed: 18, range: 520, colors: ['#F8FAFC'], size: 18, piercing: true },
  skill_meteor_rain: { projectileType: 'magic_orb', count: 24, spreadRadians: 1.1, delayMs: 35, speed: 16, range: 700, colors: ['#FB7185'], size: 14 },
  skill_hellhounds: { projectileType: 'magic_orb', count: 8, spreadRadians: Math.PI * 2, delayMs: 0, speed: 30, range: 600, colors: ['#22D3EE'], size: 10, piercing: true },
};

// Visual only. Values follow the Rust `basic_attack` module, but do not
// choose damage, collision or cooldown; those remain server-owned.
const PRIMARY_WEAPON_BURSTS: Record<string, VisualBurst> = {
  katana: { projectileType: 'slash_wave', count: 1, spreadRadians: 0, delayMs: 0, speed: 14, range: 190, colors: ['#F8FAFC'], size: 16, piercing: true },
  sledgehammer: { projectileType: 'slash_wave', count: 1, spreadRadians: 0, delayMs: 0, speed: 14, range: 190, colors: ['#F8FAFC'], size: 16, piercing: true },
  scythe: { projectileType: 'slash_wave', count: 3, spreadRadians: 0.9, delayMs: 0, speed: 10, range: 180, colors: ['#84CC16'], size: 26, piercing: true },
  greatsword: { projectileType: 'slash_wave', count: 1, spreadRadians: 0, delayMs: 0, speed: 14, range: 190, colors: ['#F8FAFC'], size: 16, piercing: true },
  staff: { projectileType: 'magic_orb', count: 1, spreadRadians: 0, delayMs: 0, speed: 18, range: 1_050, colors: ['#A78BFA'], size: 8 },
  wand: { projectileType: 'magic_orb', count: 1, spreadRadians: 0, delayMs: 0, speed: 18, range: 1_050, colors: ['#A78BFA'], size: 8 },
  grimoire: { projectileType: 'magic_orb', count: 1, spreadRadians: 0, delayMs: 0, speed: 18, range: 1_050, colors: ['#A78BFA'], size: 8 },
  totem: { projectileType: 'magic_orb', count: 1, spreadRadians: 0, delayMs: 0, speed: 18, range: 1_050, colors: ['#A78BFA'], size: 8 },
  shotgun: { projectileType: 'bullet', count: 6, spreadRadians: 0.42, delayMs: 0, speed: 22, range: 680, colors: ['#FDE047'], size: 4.5 },
  cheytac: { projectileType: 'bullet', count: 1, spreadRadians: 0, delayMs: 0, speed: 38, range: 2_200, colors: ['#E2E8F0'], size: 6, piercing: true },
  default: { projectileType: 'bullet', count: 1, spreadRadians: 0, delayMs: 0, speed: 24, range: 1_500, colors: ['#38BDF8'], size: 5 },
};

function createBurstVfx(
  id: string,
  burst: VisualBurst,
  player: Player,
  targetX: number,
  targetY: number,
  now: number,
): CombatVisualProjectile[] {
  const aimAngle = Math.atan2(targetY - player.y, targetX - player.x);
  return Array.from({ length: burst.count }, (_, index) => {
    const offset = burst.count === 1
      ? 0
      : (index / (burst.count - 1) - 0.5) * burst.spreadRadians;
    const angle = aimAngle + offset;
    const startsAt = now + index * burst.delayMs;
    return {
      startsAt,
      expiresAt: startsAt + (burst.range / (burst.speed * 60)) * 1000,
      projectile: {
        id: `vfx_${id}_${Math.round(now)}_${index}`,
        ownerId: player.id,
        type: burst.projectileType,
        x: player.x + Math.cos(angle) * 22,
        y: player.y + Math.sin(angle) * 22,
        vx: Math.cos(angle) * burst.speed,
        vy: Math.sin(angle) * burst.speed,
        damage: 0,
        range: burst.range,
        distanceTraveled: 0,
        color: burst.colors[index % burst.colors.length],
        size: burst.size,
        piercing: burst.piercing,
        isCrit: id !== 'skill_gatling_burst',
      },
    };
  });
}

export function createSharedSkillVfx(
  skillId: string,
  player: Player,
  targetX: number,
  targetY: number,
  now: number,
) {
  const burst = SHARED_SKILL_BURSTS[skillId];
  return burst ? createBurstVfx(skillId, burst, player, targetX, targetY, now) : [];
}

export function createSharedPrimaryVfx(
  player: Player,
  weapon: string | undefined,
  targetX: number,
  targetY: number,
  now: number,
  launchOffsetY: number,
) {
  const burst = PRIMARY_WEAPON_BURSTS[weapon ?? 'default'] ?? PRIMARY_WEAPON_BURSTS.default;
  return createBurstVfx(`primary_${weapon ?? 'default'}`, burst, player, targetX, targetY, now)
    .map((effect) => ({
      ...effect,
      projectile: { ...effect.projectile, y: effect.projectile.y + launchOffsetY },
    }));
}
