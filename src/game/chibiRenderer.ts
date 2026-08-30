import { ChibiConfig, Player, Monster } from '../types/game';

/**
 * Procedural Vector Chibi Character Renderer
 * High-definition Anime / Kivotos style vector chibi renderer with:
 * - 12 expressive hair styles
 * - 10 cute anime eye & face types with customizable eye colors and skin tones
 * - 8 animal ear / horn / cyber antenna accessories
 * - 10 glowing levitating halo variations
 * - 7 unique detailed cyber & academy outfits
 * - Bhop air height, squash & stretch, waddle physics, speed particle trails
 * - Crystal clear overhead HUD with player nickname & stamina
 */
export function drawChibiCharacter(
  ctx: CanvasRenderingContext2D,
  player: Player,
  timeInSeconds: number,
  isShadow: boolean = true
) {
  const time = timeInSeconds;
  const {
    x,
    y,
    facing,
    state,
    chibi,
    isRiding,
    activeVehicleId,
    spawnBounce = 1,
    attackTimer = 0,
    dodgeTimer = 0,
    jumpZ = 0,
    bhopStreak = 0,
    isSprinting = false,
  } = player;

  ctx.save();
  ctx.translate(x, y);

  // Vertical jump offset from ground (bhop / jumping)
  const jumpOffsetY = -jumpZ;

  // 1. Draw Drop Shadow (shrinks when player jumps high in the air)
  if (isShadow) {
    ctx.save();
    const shadowScale = Math.max(0.35, 1 - jumpZ / 140);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.25 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(0, 18, 20 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Draw Speed Ghost Silhouette Afterimages & Running Dust
  if (bhopStreak > 1 || (isSprinting && (player.vx !== 0 || player.vy !== 0))) {
    ctx.save();
    const trailCount = isSprinting ? 3 : 2;
    const baseColor = bhopStreak >= 4 ? '#FDE047' : '#38BDF8';
    
    // Ghost silhouette copies trailing behind
    for (let i = 1; i <= trailCount; i++) {
      const trailAlpha = 0.35 / i;
      const offsetX = (facing === 'left' ? 1 : -1) * (i * 14);
      const offsetYTrail = jumpOffsetY + i * 2;
      
      ctx.save();
      ctx.translate(offsetX, offsetYTrail);
      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = baseColor;
      // Ghost silhouette body
      ctx.beginPath();
      ctx.ellipse(0, -6, 12, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ghost silhouette head
      ctx.beginPath();
      ctx.arc(0, -22, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Footstep speed spark dust
    ctx.fillStyle = baseColor;
    for (let i = 0; i < 2; i++) {
      const px = (facing === 'left' ? 1 : -1) * (14 + i * 12) + (Math.sin(time * 20 + i) * 4);
      const py = 12 + Math.cos(time * 20 + i) * 3;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Spawn bounce squash & stretch effect (0 -> 1)
  let scaleX = facing === 'left' ? -1 : 1;
  let scaleY = 1;
  let offsetY = jumpOffsetY;

  if (spawnBounce < 1) {
    const t = spawnBounce;
    const bounce = Math.sin(t * Math.PI * 3.5) * (1 - t) * 0.45;
    scaleY = 1 + bounce;
    scaleX = (facing === 'left' ? -1 : 1) * (1 - bounce * 0.8);
    offsetY += -Math.abs(Math.sin(t * Math.PI)) * 40 * (1 - t);
  }

  // Waddle & run cycle when walking / riding
  const isMoving = state === 'walk' || (isRiding && (player.vx !== 0 || player.vy !== 0));
  const waddleSpeed = isRiding ? 14 : isSprinting ? 16 : 11;
  const waddle = isMoving && jumpZ <= 2 ? Math.sin(time * waddleSpeed) : 0;
  const bobY = isMoving && jumpZ <= 2 ? Math.abs(Math.sin(time * waddleSpeed)) * 4 : Math.sin(time * 2) * 1.5;
  const runTilt = isMoving && jumpZ <= 2 ? (isSprinting ? 0.16 : 0.08) : 0;
  const bodyRot = isMoving ? waddle * 0.1 + runTilt : 0;

  // Dodge roll rotation
  if (dodgeTimer > 0) {
    ctx.rotate((1 - dodgeTimer / 0.3) * Math.PI * 2 * (facing === 'left' ? -1 : 1));
  }

  // Attack lunge
  if (attackTimer > 0) {
    offsetY += Math.sin((1 - attackTimer / 0.25) * Math.PI) * -6;
  }

  // 3. Draw Vehicle (if riding and under character)
  if (isRiding && activeVehicleId) {
    drawVehicleUnder(ctx, activeVehicleId, time, facing, jumpOffsetY);
  }

  // Apply scales and offsets
  ctx.scale(scaleX, scaleY);
  ctx.translate(0, offsetY - bobY);
  ctx.rotate(bodyRot);

  // 4. Draw Character Back Hair / Ribbons
  drawBackHair(ctx, chibi);

  // 5. Draw Body & Outfit
  drawBody(ctx, chibi, isMoving, waddle, isRiding);

  // 6. Draw Head, Face & Ears
  const isDead = player.stats ? player.stats.hp <= 0 : false;
  drawHeadAndFace(ctx, chibi, time, isDead);

  // 7. Draw Floating Levitating Halo
  drawFloatingHalo(ctx, chibi, time);

  // 8. Draw Hands & Weapon
  drawHandsAndWeapon(ctx, player, time, attackTimer);

  ctx.restore();

  // 9. Overhead UI (Health bar, Stamina bar, Name tag, Emotes, Chat bubble, Bhop combo)
  ctx.save();
  ctx.translate(x, y + offsetY - bobY);
  drawOverheadHUD(ctx, player, time);
  ctx.restore();
}

function drawBackHair(ctx: CanvasRenderingContext2D, chibi: ChibiConfig) {
  ctx.save();
  ctx.fillStyle = chibi.hairColor || '#F6D268';
  ctx.strokeStyle = '#1E1B18';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const style = chibi.hairStyle || 'bob';

  if (style === 'twintails') {
    // Left & Right twintails
    ctx.beginPath();
    ctx.ellipse(-22, -10, 8, 20, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(22, -10, 8, 20, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair Ribbons
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-18, -20, 5, 0, Math.PI * 2);
    ctx.arc(18, -20, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'ponytail') {
    ctx.beginPath();
    ctx.ellipse(20, -18, 9, 24, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Ribbon
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(16, -26, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'side_ponytail') {
    ctx.beginPath();
    ctx.ellipse(-20, -12, 10, 26, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-16, -22, 5.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'wavy' || style === 'long_flowing') {
    ctx.beginPath();
    ctx.ellipse(0, -6, 26, style === 'long_flowing' ? 32 : 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'cyber_buns') {
    // Dual Space Buns
    ctx.beginPath();
    ctx.arc(-22, -26, 9, 0, Math.PI * 2);
    ctx.arc(22, -26, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chibi.ribbonColor || '#38BDF8';
    ctx.beginPath();
    ctx.arc(-22, -26, 4, 0, Math.PI * 2);
    ctx.arc(22, -26, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'braids') {
    // Left Braid
    ctx.beginPath();
    ctx.ellipse(-20, -4, 7, 18, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Right Braid
    ctx.beginPath();
    ctx.ellipse(20, -4, 7, 18, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-20, 10, 4, 0, Math.PI * 2);
    ctx.arc(20, 10, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'hime_cut') {
    // Long straight back hair
    ctx.beginPath();
    ctx.rect(-24, -20, 48, 38);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  chibi: ChibiConfig,
  isMoving: boolean,
  waddle: number,
  isRiding: boolean
) {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1E1B18';
  ctx.lineJoin = 'round';

  const skin = chibi.skinTone || '#FFE4D6';
  const outfit = chibi.outfitType || 'academy_blazer';
  const coatCol = chibi.coatColor || '#FFFFFF';
  const accentCol = chibi.accentColor || chibi.ribbonColor || '#38BDF8';
  const skirtCol = chibi.skirtColor || '#3A3640';

  // 1. Feet / Legs
  ctx.fillStyle = '#2B272C'; // Dark tights/shoes
  const leftLegOffset = isMoving ? waddle * 6 : 0;
  const rightLegOffset = isMoving ? -waddle * 6 : 0;

  if (isRiding) {
    // Tucked legs for riding
    ctx.beginPath();
    ctx.roundRect(-10, 8, 8, 10, 4);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(2, 8, 8, 10, 4);
    ctx.fill();
    ctx.stroke();
  } else {
    // Left foot
    ctx.beginPath();
    ctx.roundRect(-11 + leftLegOffset, 7, 8, 11, 4);
    ctx.fill();
    ctx.stroke();

    // Right foot
    ctx.beginPath();
    ctx.roundRect(3 + rightLegOffset, 7, 8, 11, 4);
    ctx.fill();
    ctx.stroke();
  }

  // 2. Outfit Base & Skirt / Pants
  if (outfit === 'tactical_shinobi') {
    // Tactical dark leggings / shorts
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.roundRect(-15, 2, 30, 10, 3);
    ctx.fill();
    ctx.stroke();

    // Tactical belts & straps
    ctx.fillStyle = accentCol;
    ctx.fillRect(-14, 5, 28, 2.5);
  } else if (outfit === 'kimono_yukata') {
    // Flowing kimono skirt
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(18, 0);
    ctx.lineTo(20, 12);
    ctx.lineTo(-20, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Large Obi sash
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.roundRect(-16, -1, 32, 6, 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Standard pleated skirt / shorts
    ctx.fillStyle = skirtCol;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(16, 2);
    ctx.lineTo(18, 11);
    ctx.lineTo(-18, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Skirt pleat lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.lineTo(-7, 11);
    ctx.moveTo(6, 2);
    ctx.lineTo(7, 11);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
  }

  // 3. Torso / Inner Shirt
  if (outfit === 'cyber_hoodie') {
    // Cozy Oversized Hoodie
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-16, -13, 32, 18, 6);
    ctx.fill();
    ctx.stroke();

    // Front kangaroo pocket & cyber neon stripe
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.roundRect(-10, -2, 20, 6, 2);
    ctx.fill();
    ctx.stroke();

    // Hoodie strings
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-5, -8, 2, 7);
    ctx.fillRect(3, -8, 2, 7);
  } else if (outfit === 'maid_idol') {
    // Frilly maid dress & corset
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 16, 4);
    ctx.fill();
    ctx.stroke();

    // White apron bib & ruffle
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(8, -12);
    ctx.lineTo(6, 2);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Neck Ribbon
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.arc(0, -9, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'magic_robe') {
    // Arcane Robe
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-15, -13, 30, 18, 5);
    ctx.fill();
    ctx.stroke();

    // Gold trim border
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(-13, -12, 26, 2);
    ctx.fillRect(-1, -12, 2, 16);

    // Glowing core amulet
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.arc(0, -5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'streetwear') {
    // Urban jacket with graphic tee
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Graphic Star on shirt
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.arc(0, -4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Open jacket flaps
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(-19, 6);
    ctx.lineTo(-8, 6);
    ctx.lineTo(-7, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(14, -12);
    ctx.lineTo(19, 6);
    ctx.lineTo(8, 6);
    ctx.lineTo(7, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Academy Blazer (Classic Kivotos School Uniform)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Necktie / Ribbon
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(3, -2);
    ctx.lineTo(0, 3);
    ctx.lineTo(-3, -2);
    ctx.closePath();
    ctx.fill();

    // Coat flaps
    ctx.fillStyle = coatCol;
    // Left flap
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.lineTo(-19, 9);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-7, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right flap
    ctx.beginPath();
    ctx.moveTo(14, -10);
    ctx.lineTo(19, 9);
    ctx.lineTo(8, 9);
    ctx.lineTo(7, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lapel color
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.lineTo(-18, -4);
    ctx.lineTo(-9, -2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(14, -10);
    ctx.lineTo(18, -4);
    ctx.lineTo(9, -2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawHeadAndFace(
  ctx: CanvasRenderingContext2D,
  chibi: ChibiConfig,
  time: number,
  isDead: boolean
) {
  ctx.save();
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#1A1816';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const headY = -24;
  const earCol = chibi.earColor || '#2B272C';
  const innerEarCol = chibi.innerEarColor || '#F472B6';
  const eyeCol = chibi.eyeColor || '#38BDF8';
  const skinTone = chibi.skinTone || '#FFE4D6';

  // 1. Ears & Headgear
  const earType = chibi.earType || 'cat';

  if (earType === 'cat' || earType === 'fox') {
    ctx.fillStyle = earCol;
    // Left ear
    ctx.beginPath();
    ctx.moveTo(-22, headY - 10);
    ctx.lineTo(-30, headY - (earType === 'fox' ? 38 : 32));
    ctx.lineTo(-10, headY - 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner pink fluff left
    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.moveTo(-20, headY - 14);
    ctx.lineTo(-27, headY - (earType === 'fox' ? 32 : 28));
    ctx.lineTo(-13, headY - 22);
    ctx.closePath();
    ctx.fill();

    // Right ear
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.moveTo(22, headY - 10);
    ctx.lineTo(30, headY - (earType === 'fox' ? 38 : 32));
    ctx.lineTo(10, headY - 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner pink fluff right
    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.moveTo(20, headY - 14);
    ctx.lineTo(27, headY - (earType === 'fox' ? 32 : 28));
    ctx.lineTo(13, headY - 22);
    ctx.closePath();
    ctx.fill();
  } else if (earType === 'bunny') {
    ctx.fillStyle = earCol;
    // Tall bunny ears
    ctx.beginPath();
    ctx.ellipse(-14, headY - 36, 7, 22, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(14, headY - 36, 7, 22, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner pink
    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.ellipse(-14, headY - 36, 4, 15, -0.15, 0, Math.PI * 2);
    ctx.ellipse(14, headY - 36, 4, 15, 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else if (earType === 'bear') {
    // Round Teddy Ears
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.arc(-22, headY - 22, 10, 0, Math.PI * 2);
    ctx.arc(22, headY - 22, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.arc(-22, headY - 22, 5, 0, Math.PI * 2);
    ctx.arc(22, headY - 22, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (earType === 'elf') {
    // Pointy Elf Ears
    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.moveTo(-25, headY + 2);
    ctx.lineTo(-38, headY - 2);
    ctx.lineTo(-24, headY + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(25, headY + 2);
    ctx.lineTo(38, headY - 2);
    ctx.lineTo(24, headY + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (earType === 'cyber_antennas') {
    // Sleek Cyber Tech Fins
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.moveTo(-24, headY - 8);
    ctx.lineTo(-36, headY - 28);
    ctx.lineTo(-22, headY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(24, headY - 8);
    ctx.lineTo(36, headY - 28);
    ctx.lineTo(22, headY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing LED tip
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-34, headY - 27, 4, 4);
    ctx.fillRect(30, headY - 27, 4, 4);
  } else if (earType === 'horns') {
    // Curved Demon/Dragon Horns
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.moveTo(-20, headY - 14);
    ctx.quadraticCurveTo(-34, headY - 32, -26, headY - 40);
    ctx.quadraticCurveTo(-20, headY - 30, -12, headY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(20, headY - 14);
    ctx.quadraticCurveTo(34, headY - 32, 26, headY - 40);
    ctx.quadraticCurveTo(20, headY - 30, 12, headY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 2. Head Shape (Round, chubby squishy cheeks)
  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.moveTo(-25, headY + 2);
  ctx.bezierCurveTo(-28, headY + 16, -14, headY + 24, 0, headY + 24);
  ctx.bezierCurveTo(14, headY + 24, 28, headY + 16, 25, headY + 2);
  ctx.bezierCurveTo(28, headY - 18, -28, headY - 18, -25, headY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Hair (Front bangs & Side locks for various styles)
  ctx.fillStyle = chibi.hairColor || '#F6D268';
  const hairStyle = chibi.hairStyle || 'bob';

  ctx.beginPath();
  if (hairStyle === 'spiky') {
    // Spiky anime hair
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-30, headY + 6);
    ctx.lineTo(-22, headY + 2);
    ctx.lineTo(-15, headY + 12);
    ctx.lineTo(-8, headY);
    ctx.lineTo(0, headY + 14);
    ctx.lineTo(8, headY);
    ctx.lineTo(15, headY + 12);
    ctx.lineTo(22, headY + 2);
    ctx.lineTo(30, headY + 6);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (hairStyle === 'wolf_cut' || hairStyle === 'short_messy') {
    // Layered Shaggy bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-29, headY + 10);
    ctx.lineTo(-20, headY + 5);
    ctx.lineTo(-12, headY + 14);
    ctx.lineTo(-4, headY + 3);
    ctx.lineTo(4, headY + 14);
    ctx.lineTo(12, headY + 3);
    ctx.lineTo(20, headY + 12);
    ctx.lineTo(29, headY + 8);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (hairStyle === 'hime_cut') {
    // Straight blunt bangs with sharp side locks
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 16);
    ctx.lineTo(-20, headY + 16);
    ctx.lineTo(-20, headY + 4);
    ctx.lineTo(20, headY + 4);
    ctx.lineTo(20, headY + 16);
    ctx.lineTo(27, headY + 16);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else {
    // Classic cute soft bangs with side curls
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 8);
    ctx.lineTo(-21, headY + 12);
    ctx.lineTo(-18, headY - 2);
    ctx.lineTo(-8, headY + 6);
    ctx.lineTo(0, headY - 3);
    ctx.lineTo(8, headY + 6);
    ctx.lineTo(18, headY - 2);
    ctx.lineTo(21, headY + 12);
    ctx.lineTo(28, headY + 8);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cute hair clip / ribbon on side
  ctx.fillStyle = chibi.ribbonColor || '#F472B6';
  ctx.beginPath();
  ctx.arc(-19, headY + 2, 4, 0, Math.PI * 2);
  ctx.arc(-14, headY + 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // 4. Blushing Pink Cheeks
  ctx.fillStyle = 'rgba(244, 114, 182, 0.48)';
  ctx.beginPath();
  ctx.ellipse(-15, headY + 11, 4.5, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(15, headY + 11, 4.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5. Eyes & Expression
  const eyeType = chibi.eyeType || 'cat_w';
  const isBlinking =
    !isDead && Math.floor(time * 1.6) % 6 === 0 && (time * 8) % 1 > 0.72;

  ctx.fillStyle = '#1A1816';

  if (isDead) {
    // X_X eyes
    ctx.beginPath();
    ctx.moveTo(-14, headY + 2);
    ctx.lineTo(-8, headY + 8);
    ctx.moveTo(-8, headY + 2);
    ctx.lineTo(-14, headY + 8);

    ctx.moveTo(8, headY + 2);
    ctx.lineTo(14, headY + 8);
    ctx.moveTo(14, headY + 2);
    ctx.lineTo(8, headY + 8);
    ctx.stroke();
  } else if (isBlinking || eyeType === 'happy') {
    // ^ ^ Happy curved eyes
    ctx.beginPath();
    ctx.arc(-11, headY + 7, 4.5, Math.PI, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(11, headY + 7, 4.5, Math.PI, 0);
    ctx.stroke();
  } else if (eyeType === 'wink') {
    // Left eye open, right eye winking
    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.ellipse(-11, headY + 6, 3.8, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A1816';
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-12, headY + 4, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Right wink
    ctx.beginPath();
    ctx.arc(11, headY + 7, 4.5, Math.PI, 0);
    ctx.stroke();
  } else if (eyeType === 'sparkle') {
    // Big Star-Filled Sparkle Eyes
    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.ellipse(-11, headY + 5.5, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(11, headY + 5.5, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Star highlights
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-12, headY + 3.5, 2, 0, Math.PI * 2);
    ctx.arc(-9.5, headY + 7.5, 1.2, 0, Math.PI * 2);
    ctx.arc(10, headY + 3.5, 2, 0, Math.PI * 2);
    ctx.arc(12.5, headY + 7.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'smug') {
    // Confident Smug > v < eyes
    ctx.beginPath();
    ctx.moveTo(-15, headY + 4);
    ctx.lineTo(-7, headY + 8);
    ctx.moveTo(15, headY + 4);
    ctx.lineTo(7, headY + 8);
    ctx.stroke();
  } else if (eyeType === 'sleepy') {
    // Relaxed Comfy Eyes
    ctx.beginPath();
    ctx.arc(-11, headY + 8, 4, 0.2, Math.PI - 0.2);
    ctx.arc(11, headY + 8, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (eyeType === 'glasses') {
    // Eyes with stylish round glasses
    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.ellipse(-11, headY + 5.5, 3.5, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(11, headY + 5.5, 3.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Round frames
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 6.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 6, 6.5, 0, Math.PI * 2);
    ctx.moveTo(-4.5, headY + 6);
    ctx.lineTo(4.5, headY + 6);
    ctx.stroke();
  } else if (eyeType === 'dot') {
    // Minimalist Kawaii Dot Eyes
    ctx.fillStyle = '#1A1816';
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 2.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'determined') {
    // Sharp Anime Eyes
    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.ellipse(-11, headY + 6, 3.8, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(11, headY + 6, 3.8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sharp Brow Line
    ctx.strokeStyle = '#1A1816';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 2);
    ctx.lineTo(-7, headY + 4);
    ctx.moveTo(16, headY + 2);
    ctx.lineTo(7, headY + 4);
    ctx.stroke();

    // Highlight
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-12, headY + 4.5, 1.5, 0, Math.PI * 2);
    ctx.arc(10, headY + 4.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Signature Blue Archive / Momoi Cat-W Meme Eyes (:3)
    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.ellipse(-11, headY + 5.5, 3.5, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(11, headY + 5.5, 3.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 2.2, 0, Math.PI * 2);
    ctx.arc(11, headY + 6, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // White eye reflections
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-12.5, headY + 3.5, 1.6, 0, Math.PI * 2);
    ctx.arc(9.5, headY + 3.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 6. Cute Chibi Cat Mouth ':3' / 'w' / Smile
  ctx.strokeStyle = '#1A1816';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (eyeType === 'smug') {
    // Side Smirk
    ctx.arc(2, headY + 12, 4, 0.2, Math.PI * 0.85);
  } else if (eyeType === 'happy') {
    // Open Happy Smile
    ctx.arc(0, headY + 12, 3.5, 0.1, Math.PI - 0.1);
  } else {
    // Signature :3 W double curve
    ctx.arc(-3, headY + 12, 3, 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3, headY + 12, 3, 0.1, Math.PI * 0.9);
  }
  ctx.stroke();

  ctx.restore();
}

function drawFloatingHalo(ctx: CanvasRenderingContext2D, chibi: ChibiConfig, time: number) {
  const haloType = chibi.haloType || 'star';
  if (haloType === 'none') return;

  ctx.save();
  const haloBob = Math.sin(time * 2.5) * 3;
  ctx.translate(0, -66 + haloBob);

  ctx.strokeStyle = chibi.haloColor || '#E65D8C';
  ctx.fillStyle = chibi.haloColor || '#E65D8C';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = chibi.haloColor || '#E65D8C';
  ctx.shadowBlur = 10;

  if (haloType === 'star') {
    // 4-Point Star Halo
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(4, -4);
    ctx.lineTo(12, 0);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 12);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (haloType === 'circle') {
    // Glowing Ring Halo with orbiting node
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2);
    ctx.stroke();

    const orbitAngle = time * 3;
    const ox = Math.cos(orbitAngle) * 18;
    const oy = Math.sin(orbitAngle) * 7;
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (haloType === 'winged') {
    // Angelic Winged Halo
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Left Wing
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.quadraticCurveTo(-26, -10, -22, 6);
    ctx.stroke();

    // Right Wing
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.quadraticCurveTo(26, -10, 22, 6);
    ctx.stroke();
  } else if (haloType === 'crown') {
    // Royal Crown Halo
    ctx.beginPath();
    ctx.moveTo(-16, 4);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-7, -2);
    ctx.lineTo(0, -12);
    ctx.lineTo(7, -2);
    ctx.lineTo(14, -8);
    ctx.lineTo(16, 4);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  } else if (haloType === 'cross') {
    // Cross Halo
    ctx.beginPath();
    ctx.rect(-3, -12, 6, 24);
    ctx.rect(-12, -3, 24, 6);
    ctx.fill();
    ctx.stroke();
  } else if (haloType === 'cyber_hex') {
    // Holographic Hexagon
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + time;
      const hx = Math.cos(angle) * 16;
      const hy = Math.sin(angle) * 7;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (haloType === 'heart') {
    // Floating Heart Halo
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-8, -8, -14, 0, 0, 12);
    ctx.bezierCurveTo(14, 0, 8, -8, 0, 4);
    ctx.fill();
    ctx.stroke();
  } else if (haloType === 'neon_rings') {
    // Gyroscopic Dual Rings
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 6, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 6, -0.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHandsAndWeapon(
  ctx: CanvasRenderingContext2D,
  player: Player,
  time: number,
  attackTimer: number
) {
  const equipment = player.equipment || { weapon: null, headwear: null, outfit: null, vehicle: null, accessory: null };
  const characterClass = player.characterClass || 'gunslinger';
  const weapon = equipment.weapon;

  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1E1B18';
  ctx.fillStyle = player.chibi?.skinTone || '#FFE4D6';

  const isSword = weapon?.id?.includes('katana') || characterClass === 'swordmaster';
  const isGun = weapon?.type === 'weapon' && !isSword;

  if (attackTimer > 0) {
    const attackProgress = 1 - attackTimer / 0.25;

    if (isSword) {
      // Katana Slash Arc
      ctx.save();
      ctx.translate(12, -2);
      ctx.rotate(Math.PI * (attackProgress * 1.5 - 0.4));

      // Blade
      ctx.fillStyle = '#38BDF8';
      ctx.strokeStyle = '#0F172A';
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(34, -2);
      ctx.lineTo(36, 2);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Hilt
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-6, -3, 6, 6);
      ctx.restore();
    } else {
      // Blaster Recoil
      ctx.save();
      ctx.translate(14, -4);
      ctx.rotate(-0.35 * (1 - attackProgress));

      // Blaster Gun
      ctx.fillStyle = '#F472B6';
      ctx.fillRect(0, -3, 16, 7);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(4, 2, 5, 8);
      ctx.restore();
    }
  }

  // Draw cute chibi hands
  ctx.beginPath();
  ctx.arc(-11, 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(11, 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawVehicleUnder(
  ctx: CanvasRenderingContext2D,
  vehicleId: string,
  time: number,
  facing: 'left' | 'right',
  jumpOffsetY: number
) {
  ctx.save();
  ctx.translate(0, 14 + jumpOffsetY);

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1E1B18';

  if (vehicleId.includes('skateboard') || vehicleId.includes('hoverboard')) {
    // Neon Cyber Skateboard / Hoverboard
    const isHover = vehicleId.includes('hoverboard');
    ctx.fillStyle = isHover ? '#38BDF8' : '#EC4899';
    ctx.beginPath();
    ctx.roundRect(-28, isHover ? -2 : 0, 56, 8, 4);
    ctx.fill();
    ctx.stroke();

    if (!isHover) {
      // Skateboard Wheels
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(-18, 9, 4.5, 0, Math.PI * 2);
      ctx.arc(18, 9, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Glowing Hover Emitter
      ctx.fillStyle = '#67E8F9';
      ctx.fillRect(-22, 6, 44, 3);
    }
  } else if (vehicleId.includes('scooter') || vehicleId.includes('bike')) {
    // Moped / Cyber Bike Chassis
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.moveTo(-24, 8);
    ctx.lineTo(26, 8);
    ctx.lineTo(18, 16);
    ctx.lineTo(-20, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wheels
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(-18, 16, 7, 0, Math.PI * 2);
    ctx.arc(20, 16, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawOverheadHUD(ctx: CanvasRenderingContext2D, player: Player, time: number) {
  const { name, stats, stamina, maxStamina, isSprinting, emote, chatMessage, chatTimer, bhopStreak } = player;

  const curHp = stats?.hp ?? (player as any).hp ?? 100;
  const curMaxHp = stats?.maxHp ?? (player as any).maxHp ?? 100;
  const curLevel = stats?.level ?? (player as any).level ?? 1;

  // 1. Health Bar
  const hpRatio = Math.max(0, Math.min(1, curHp / curMaxHp));
  const barW = 48;
  const barH = 5;
  const barY = -76;

  // Health bar backdrop
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2, 3);
  ctx.fill();

  ctx.fillStyle = hpRatio > 0.5 ? '#10B981' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
  ctx.beginPath();
  ctx.roundRect(-barW / 2, barY, barW * hpRatio, barH, 2);
  ctx.fill();

  // 2. Mini Stamina Bar (shown if sprinting or stamina not full)
  const currentStamina = stamina !== undefined ? stamina : 100;
  const totalStamina = maxStamina || 100;
  if (currentStamina < totalStamina || isSprinting) {
    const staRatio = Math.max(0, Math.min(1, currentStamina / totalStamina));
    const staY = barY + 7;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.roundRect(-barW / 2 - 1, staY - 1, barW + 2, 3.5, 2);
    ctx.fill();

    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.roundRect(-barW / 2, staY, barW * staRatio, 2.5, 1.5);
    ctx.fill();
  }

  // 3. Name & Level Tag (Liquid Glass aesthetic)
  ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lvlText = `Lv.${curLevel}`;
  const nameText = `${name || 'Hero'}`;
  const lvlWidth = ctx.measureText(lvlText).width;
  const nameWidth = ctx.measureText(nameText).width;
  const totalWidth = lvlWidth + nameWidth + 18;
  const pillY = barY - 13;

  // Liquid Glass Pill background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-totalWidth / 2, pillY - 9, totalWidth, 18, 9);
  ctx.fill();
  ctx.stroke();

  // Draw Level Badge & Name Tag
  ctx.fillStyle = '#FDE047';
  ctx.fillText(lvlText, -totalWidth / 2 + lvlWidth / 2 + 7, pillY);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(nameText, totalWidth / 2 - nameWidth / 2 - 7, pillY);

  // 4. Bhop Combo Badge Floating Above Name
  if (bhopStreak && bhopStreak >= 2) {
    const bhopY = pillY - 18;
    const bhopText = `⚡ BHOP x${bhopStreak} (+${Math.min(75, bhopStreak * 12)}% SPD)`;
    ctx.font = '900 10px system-ui, -apple-system, sans-serif';
    const bhopW = ctx.measureText(bhopText).width + 12;

    ctx.fillStyle = bhopStreak >= 4 ? '#EAB308' : '#0284C7';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-bhopW / 2, bhopY - 8, bhopW, 16, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(bhopText, 0, bhopY);
  }

  // 5. Emote Bubble
  if (emote) {
    const emoteBob = Math.sin(time * 4) * 3;
    ctx.save();
    ctx.translate(0, barY - 32 + emoteBob);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-16, -16, 32, 28, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emote, 0, -2);
    ctx.restore();
  }

  // 6. Chat Speech Bubble
  if (chatMessage && chatTimer && chatTimer > 0) {
    ctx.save();
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    const textMetrics = ctx.measureText(chatMessage);
    const bubbleW = Math.min(220, textMetrics.width + 16);
    const bubbleH = 24;
    const bubbleY = barY - 36;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-bubbleW / 2, bubbleY - bubbleH, bubbleW, bubbleH, 6);
    ctx.fill();
    ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(-4, bubbleY);
    ctx.lineTo(0, bubbleY + 6);
    ctx.lineTo(4, bubbleY);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chatMessage, 0, bubbleY - bubbleH / 2);
    ctx.restore();
  }
}

/**
 * Procedural Humanoid Enemy / Bandit / Target Dummy Renderer
 * Full physics reaction: head tilt from bullet trajectory, hit flash, weapon handling
 */
export function drawHumanoidEnemy(
  ctx: CanvasRenderingContext2D,
  monster: Monster,
  time: number
) {
  const {
    isBoss,
    type,
    name,
    hp,
    maxHp,
    headTilt = 0,
    hitFlash = 0,
    attackCooldown = 0,
    weaponType = 'pistol',
    humanChibi,
  } = monster;

  const isDead = hp <= 0;
  const isBossBandit = type === 'bandit_boss' || isBoss;
  const isDummy = type === 'human_target';

  ctx.save();

  // 1. Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 16, isBossBandit ? 34 : 20, isBossBandit ? 12 : 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hit flash white/red outline effect
  const isFlashing = hitFlash > 0;
  const flashColor = '#FFFFFF';

  // Breathing / Aiming bob
  const bobY = Math.sin(time * 3 + (monster.spawnX || 0)) * 2;
  ctx.translate(0, bobY);

  if (isFlashing) {
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 14;
  }

  if (humanChibi) {
    // Render full styled Chibi Cadet / Bandit with unique hairstyle & halo!
    const enemyPlayer: Player = {
      id: monster.id,
      name: monster.name,
      characterClass: 'gunslinger',
      chibi: humanChibi,
      x: 0,
      y: 0,
      vx: monster.knockbackX || 0,
      vy: 0,
      facing: monster.targetPlayerId ? 'left' : 'right',
      state: isDead ? 'dead' : monster.state === 'chase' ? 'walk' : 'idle',
      stats: { level: 1, exp: 0, maxExp: 100, hp: monster.hp, maxHp: monster.maxHp, mp: 100, maxMp: 100, atk: monster.atk, def: monster.def, speed: monster.speed, critRate: 10, statPoints: 0, str: 5, agi: 5, int: 5, vit: 5 },
      stamina: 100,
      maxStamina: 100,
      isSprinting: false,
      jumpZ: 0,
      jumpVz: 0,
      isJumping: false,
      bhopStreak: 0,
      bhopTimer: 0,
      bhopSpeedMult: 1,
      gold: 0,
      inventory: [],
      equipment: { weapon: null, headwear: null, outfit: null, vehicle: null, accessory: null },
      skills: [],
      activeVehicleId: null,
      isRiding: false,
      spawnBounce: 1,
      attackTimer: monster.attackCooldown > 1.2 ? 0.3 : 0,
      dodgeTimer: monster.dodgeTimer || 0,
      combo: 0,
      lastAttackTime: 0,
      activeQuests: {},
      completedQuestIds: [],
      currentZone: monster.zone,
      activeBuffs: [],
    };

    drawChibiCharacter(ctx, enemyPlayer, time, isDead);

    // Draw weapon in hand
    ctx.save();
    const isAttacking = monster.attackCooldown > 1.0;
    ctx.translate(14, -2);
    ctx.rotate(isAttacking ? -0.35 : 0.1);

    if (monster.type === 'boss_welder' || weaponType === 'sledgehammer') {
      // GIANT INDUSTRIAL SLEDGEHAMMER
      ctx.fillStyle = '#78716C';
      ctx.strokeStyle = '#1C1917';
      ctx.lineWidth = 2.5;
      // Long reinforced shaft
      ctx.fillRect(-2, -32, 5, 42);
      ctx.strokeRect(-2, -32, 5, 42);
      // Massive steel sledge head
      ctx.fillStyle = '#292524';
      ctx.fillRect(-12, -44, 24, 15);
      ctx.strokeRect(-12, -44, 24, 15);
      // Glowing welded orange core
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(-8, -40, 16, 7);
      if (isAttacking) {
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(0, -42, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (weaponType === 'cheytac') {
      // CHEYTAC M200 INTERVENTION SNIPER RIFLE
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2;
      // Long barrel & muzzle brake
      ctx.fillRect(-4, -4, 32, 5);
      ctx.strokeRect(-4, -4, 32, 5);
      // Heavy sniper scope
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(4, -10, 14, 5);
      ctx.strokeRect(4, -10, 14, 5);
      // Stock
      ctx.fillStyle = '#334155';
      ctx.fillRect(-10, -2, 7, 7);
      if (isAttacking) {
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(32, -1.5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (weaponType === 'ak47') {
      // AK-47 KALASHNIKOV ASSAULT RIFLE
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      // Receiver & barrel
      ctx.fillRect(-2, -3, 24, 5);
      ctx.strokeRect(-2, -3, 24, 5);
      // Curved banana magazine
      ctx.fillStyle = '#78350F';
      ctx.beginPath();
      ctx.ellipse(8, 6, 4, 7, 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Wooden stock
      ctx.fillStyle = '#92400E';
      ctx.fillRect(-8, -1, 7, 6);
      if (isAttacking) {
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(24, -0.5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (weaponType === 'mac10') {
      // MAC-10 MICRO SMG
      ctx.fillStyle = '#18181B';
      ctx.strokeStyle = '#09090B';
      ctx.lineWidth = 1.8;
      // Box receiver
      ctx.fillRect(0, -5, 14, 8);
      ctx.strokeRect(0, -5, 14, 8);
      // Long stick magazine in grip
      ctx.fillStyle = '#27272A';
      ctx.fillRect(4, 3, 3, 10);
      if (isAttacking) {
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.arc(16, -1, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (weaponType === 'bat') {
      // Spiked Baseball Bat / Cyber Club
      ctx.fillStyle = '#92400E';
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 2;
      // Bat handle
      ctx.fillRect(-2, -18, 4, 22);
      ctx.strokeRect(-2, -18, 4, 22);
      // Bat top barrel
      ctx.fillStyle = '#B45309';
      ctx.fillRect(-4, -28, 8, 12);
      ctx.strokeRect(-4, -28, 8, 12);
      // Spikes
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-6, -26, 2, 2);
      ctx.fillRect(4, -24, 2, 2);
      ctx.fillRect(-6, -20, 2, 2);
    } else if (weaponType === 'shotgun') {
      // Heavy Double-Barrel Shotgun
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.fillRect(0, -5, 22, 6);
      ctx.strokeRect(0, -5, 22, 6);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-6, -2, 8, 8);
      if (isAttacking) {
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.arc(26, -2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (weaponType === 'revolver') {
      // .44 Heavy Revolver
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.fillRect(0, -4, 16, 6);
      ctx.strokeRect(0, -4, 16, 6);
      // Revolver cylinder
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(2, -6, 6, 8);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(0, 2, 4, 6);
      if (isAttacking) {
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.arc(20, -1, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (weaponType === 'staff') {
      // Magic Cyber Staff
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -28);
      ctx.stroke();
      ctx.fillStyle = '#C084FC';
      ctx.shadowColor = '#C084FC';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, -32, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (weaponType === 'baton') {
      // Tactical Police Nightstick / Stun Baton
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.8;
      ctx.fillRect(-2, -18, 4, 24);
      ctx.strokeRect(-2, -18, 4, 24);
      // Side handle
      ctx.fillRect(2, -6, 8, 4);
      if (isAttacking) {
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(0, -20, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (weaponType === 'molotov') {
      // Burning Hellfire Molotov Bottle
      ctx.fillStyle = '#166534';
      ctx.strokeStyle = '#14532D';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-3, -12, 6, 14);
      // Burning rag fuse
      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.arc(0, -15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(0, -17, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Revolver / Handgun
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.6;
      ctx.fillRect(0, -3, 14, 5);
      ctx.fillRect(2, 2, 3, 5);
      ctx.strokeRect(0, -3, 14, 5);
      if (isAttacking) {
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.arc(18, -1, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  } else {
    // Default fallback bandit silhouette
    // 2. Legs / Boots
    ctx.fillStyle = isDummy ? '#78716C' : isBossBandit ? '#1E1B4B' : '#1E293B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.roundRect(-10, 6, 8, 12, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(2, 6, 8, 12, 3);
    ctx.fill();
    ctx.stroke();

    // 3. Torso / Coat
    ctx.fillStyle = isFlashing ? flashColor : isBossBandit ? '#991B1B' : '#475569';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 20, 6);
    ctx.fill();
    ctx.stroke();

    // Academy Training Cadet Badge / Belt
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(-4, -6, 8, 8);
    ctx.strokeRect(-4, -6, 8, 8);

    // 4. Head with Physics Head Tilt
    ctx.save();
    ctx.translate(0, -18);
    ctx.rotate(headTilt);
    ctx.fillStyle = isFlashing ? flashColor : '#FFE4D6';
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -6, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isBossBandit ? '#312E81' : '#334155';
    ctx.beginPath();
    ctx.arc(0, -10, 16, Math.PI * 0.8, Math.PI * 2.2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isBossBandit ? '#F59E0B' : '#EF4444';
    ctx.beginPath();
    ctx.ellipse(-7, -8, 3, 2, 0.2, 0, Math.PI * 2);
    ctx.ellipse(7, -8, 3, 2, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. Weapon in Hand for classic cadet
    ctx.save();
    const isAttacking = attackCooldown > 1.0;
    ctx.translate(14, -2);
    ctx.rotate(isAttacking ? -0.35 : 0.1);

    if (weaponType === 'bat') {
      ctx.fillStyle = '#92400E';
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 2;
      ctx.fillRect(-2, -18, 4, 22);
      ctx.strokeRect(-2, -18, 4, 22);
      ctx.fillStyle = '#B45309';
      ctx.fillRect(-4, -28, 8, 12);
      ctx.strokeRect(-4, -28, 8, 12);
    } else if (weaponType === 'staff') {
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -28);
      ctx.stroke();
      ctx.fillStyle = '#C084FC';
      ctx.beginPath();
      ctx.arc(0, -32, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.6;
      ctx.fillRect(0, -3, 14, 5);
      ctx.fillRect(2, 2, 3, 5);
      ctx.strokeRect(0, -3, 14, 5);
    }
    ctx.restore();
  }

  // 6. Overhead Health Bar & Name
  const barW = isBossBandit ? 90 : 44;
  const barH = isBossBandit ? 8 : 5;
  const barY = isBossBandit ? -65 : -46;
  const hpRatio = Math.max(0, hp / maxHp);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = isBossBandit ? '#EF4444' : isDummy ? '#F59E0B' : '#38BDF8';
  ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);

  // Name Tag
  ctx.font = isBossBandit ? '900 13px Fredoka, sans-serif' : 'bold 11px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isBossBandit ? '#FCA5A5' : isDummy ? '#FEF08A' : '#FFFFFF';
  ctx.fillText(name, 0, barY - 6);

  ctx.restore();
}
