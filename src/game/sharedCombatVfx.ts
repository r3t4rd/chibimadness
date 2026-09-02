import type { Player, Projectile } from '../types/game';

export type CombatVisualProjectile = {
  projectile: Projectile;
  startsAt: number;
  expiresAt: number;
};

type VisualBurst = {
  count: number;
  spreadRadians: number;
  delayMs: number;
  speed: number;
  range: number;
  color: string;
  size: number;
  piercing?: boolean;
};

// Presentation-only counterparts to the Rust `abilities` module. They give
// input feedback immediately; authoritative hit detection and server snapshots
// are intentionally not derived from this table.
const SHARED_SKILL_BURSTS: Record<string, VisualBurst> = {
  skill_gatling_burst: { count: 12, spreadRadians: 0.16, delayMs: 45, speed: 24, range: 1_400, color: '#F472B6', size: 5 },
  skill_bullet_fan: { count: 9, spreadRadians: 70 * Math.PI / 180, delayMs: 0, speed: 22, range: 1_300, color: '#38BDF8', size: 6, piercing: true },
  skill_aerial_aimbot: { count: 6, spreadRadians: 1.25, delayMs: 50, speed: 24, range: 1_600, color: '#FDE047', size: 6, piercing: true },
};

export function createSharedSkillVfx(
  skillId: string,
  player: Player,
  targetX: number,
  targetY: number,
  now: number,
): CombatVisualProjectile[] {
  const burst = SHARED_SKILL_BURSTS[skillId];
  if (!burst) return [];

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
        id: `vfx_${skillId}_${Math.round(now)}_${index}`,
        ownerId: player.id,
        type: 'bullet',
        x: player.x + Math.cos(angle) * 22,
        y: player.y + Math.sin(angle) * 22,
        vx: Math.cos(angle) * burst.speed,
        vy: Math.sin(angle) * burst.speed,
        damage: 0,
        range: burst.range,
        distanceTraveled: 0,
        color: burst.color,
        size: burst.size,
        piercing: burst.piercing,
        isCrit: skillId !== 'skill_gatling_burst',
      },
    };
  });
}
