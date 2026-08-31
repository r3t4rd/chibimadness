export type AttachPoint = { x: number; y: number };

export type WeaponAttachPoints = {
  optic: AttachPoint;
  muzzle: AttachPoint;
  underbarrel: AttachPoint;
  magazine: AttachPoint;
};

/** Local coords in drawHandsAndWeapon after ctx.translate(12, -1). */
export const WEAPON_HAND_OFFSET = { x: 12, y: -1 };

/** Inspect pose rotation used while gunsmith is open. */
export const GUNSMITH_INSPECT_AIM = -0.32;

/** Camera zoom while inspecting (worldRenderer). */
export const GUNSMITH_INSPECT_ZOOM = 5.2;

/**
 * Optic y = top of receiver / rail (optic sits on it).
 * Magazine y = magwell (top of mag, not the floorplate).
 */
export const WEAPON_ATTACH_POINTS: Record<string, WeaponAttachPoints> = {
  cheytac: { optic: { x: 8, y: -5.6 }, muzzle: { x: 42, y: -1.5 }, underbarrel: { x: 22, y: 1.2 }, magazine: { x: 2.5, y: 3.2 } },
  ak47: { optic: { x: 4, y: -5.4 }, muzzle: { x: 34, y: -1.5 }, underbarrel: { x: 16, y: 2.2 }, magazine: { x: 4, y: 2.6 } },
  mac10: { optic: { x: 6, y: -6 }, muzzle: { x: 23, y: -1 }, underbarrel: { x: 12, y: 4 }, magazine: { x: 6, y: 4 } },
  shotgun: { optic: { x: 6, y: -5 }, muzzle: { x: 20, y: -1.5 }, underbarrel: { x: 10, y: 2.5 }, magazine: { x: 2, y: 3 } },
  revolver: { optic: { x: 10, y: -6 }, muzzle: { x: 20, y: -1.5 }, underbarrel: { x: 10, y: 1.5 }, magazine: { x: 1, y: 2 } },
  pistol: { optic: { x: 5, y: -4.5 }, muzzle: { x: 17, y: -1.5 }, underbarrel: { x: 7, y: 2.5 }, magazine: { x: 2.5, y: 2 } },
};

export function gunsmithAttachScreenOffset(
  gunType: string,
  slot: keyof WeaponAttachPoints,
  facing: 'left' | 'right' = 'right',
): { x: number; y: number } {
  const pts = WEAPON_ATTACH_POINTS[gunType] || WEAPON_ATTACH_POINTS.pistol;
  const { x: ax, y: ay } = pts[slot];
  const c = Math.cos(GUNSMITH_INSPECT_AIM);
  const s = Math.sin(GUNSMITH_INSPECT_AIM);
  const wx = WEAPON_HAND_OFFSET.x + ax * c - ay * s;
  const wy = WEAPON_HAND_OFFSET.y + ax * s + ay * c;
  const flip = facing === 'left' ? -1 : 1;
  return {
    x: wx * GUNSMITH_INSPECT_ZOOM * flip,
    y: wy * GUNSMITH_INSPECT_ZOOM,
  };
}
