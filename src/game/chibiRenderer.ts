import { ChibiConfig, Player, Monster } from '../types/game';
import { WEAPON_ATTACH_POINTS } from './weaponAttachPoints';

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
  isShadow: boolean = true,
  options: { bodyOnly?: boolean; overheadOnly?: boolean } = {},
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
    elevationZ = 0,
    jumpZ = 0,
    bhopStreak = 0,
    isSprinting = false,
    skateTrick = null,
    skateTrickTimer = 0,
    skateTrickDuration = 0.5,
  } = player;

  if (options.overheadOnly) {
    ctx.save();
    ctx.translate(x, y);
    drawOverheadHUD(ctx, player, timeInSeconds);
    ctx.restore();
    return;
  }

  const skateTrickProgress =
    skateTrick && skateTrickTimer > 0 ? 1 - skateTrickTimer / Math.max(0.05, skateTrickDuration) : 1;
  const doingSkateTrick = !!(skateTrick && skateTrickTimer > 0);

  ctx.save();
  ctx.translate(x + (player.previewOffsetX ?? 0), y + (player.previewOffsetY ?? 0));

  // World elevation is physical height, while the 2D world renders cliff
  // faces with a compressed vertical projection. Using the raw value here
  // made an operator on a 200-unit roof appear ~200px away from its platform.
  const projectedElevation = Math.min(55, Math.max(0, elevationZ) * 0.4);
  const shadowOffsetY = -projectedElevation;
  const jumpOffsetY = -(projectedElevation + jumpZ);

  // 1. Draw Drop Shadow (shrinks when player jumps high in the air)
  if (isShadow) {
    ctx.save();
    ctx.translate(0, shadowOffsetY);
    const shadowScale = Math.max(0.35, 1 - jumpZ / 160);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.28 * shadowScale})`;
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

  if (spawnBounce < 1 && player.cinematicPose !== 'dive') {
    const t = spawnBounce;
    const bounce = Math.sin(t * Math.PI * 3.5) * (1 - t) * 0.45;
    scaleY = 1 + bounce;
    scaleX = (facing === 'left' ? -1 : 1) * (1 - bounce * 0.8);
    offsetY += -Math.abs(Math.sin(t * Math.PI)) * 40 * (1 - t);
  }

  // Waddle & run cycle when walking / riding
  const isMoving = state === 'walk' || (isRiding && (player.vx !== 0 || player.vy !== 0));
  const waddleSpeed = isRiding ? 14 : isSprinting ? 16 : 11;
  let waddle = isMoving && jumpZ <= 2 ? Math.sin(time * waddleSpeed) : 0;
  let bobY = isMoving && jumpZ <= 2 ? Math.abs(Math.sin(time * waddleSpeed)) * 4 : Math.sin(time * 2) * 1.5;
  const runTilt = isMoving && jumpZ <= 2 ? (isSprinting ? 0.16 : 0.08) : 0;
  let bodyRot = isMoving ? waddle * 0.1 + runTilt : 0;
  const skatingNow = isRiding && !!activeVehicleId && (activeVehicleId.includes('skateboard') || activeVehicleId.includes('hoverboard'));
  if (skatingNow && isMoving && jumpZ <= 2 && !doingSkateTrick) {
    bodyRot = (facing === 'left' ? -1 : 1) * 0.12;
    bobY = Math.abs(Math.sin(time * 18)) * 1.4;
  }

  // Cinematic pose body transforms
  const cinematicPose = player.cinematicPose;
  const isDancing = cinematicPose === 'dance';
  const isCute = cinematicPose === 'cute';
  if (isDancing) {
    waddle = Math.sin(time * 7) * 1.5;
    bobY = Math.abs(Math.sin(time * 7)) * 10;
    bodyRot = Math.sin(time * 7) * 0.18;
  } else if (isCute) {
    waddle = Math.sin(time * 9) * 0.6;
    bobY = Math.abs(Math.sin(time * 9)) * 7;
    scaleY = 1 + Math.sin(time * 11) * 0.05;
  } else if (cinematicPose === 'dive') {
    scaleX = facing === 'left' ? -1 : 1;
    scaleY = 1.0;
    bodyRot = -0.72;
    bobY = 0;
    offsetY = 0;
  } else if (cinematicPose === 'skid') {
    bodyRot = -0.35;
    offsetY += 8;
  } else if (cinematicPose === 'dazed') {
    bodyRot = Math.sin(time * 2) * 0.08;
    bobY = 0;
  } else if (cinematicPose === 'brush') {
    waddle = Math.sin(time * 6) * 0.3;
    bobY = Math.abs(Math.sin(time * 6)) * 2;
  } else if (cinematicPose === 'bonk') {
    offsetY += 4;
    bodyRot = Math.sin(time * 15) * 0.1;
  } else if (cinematicPose === 'ready') {
    bodyRot = 0;
    bobY = Math.sin(time * 2) * 1;
  } else if (cinematicPose === 'shy') {
    bodyRot = (player.eyeLookX ?? 0) > 0.4 ? -0.14 : (player.eyeLookX ?? 0) < -0.4 ? 0.14 : 0;
    bobY = 1.5;
    scaleY = 0.94;
    scaleX = (facing === 'left' ? -1 : 1) * 0.97;
  }

  if (doingSkateTrick && skatingNow) {
    if (skateTrick === 'treflip') {
      bodyRot += skateTrickProgress * Math.PI * 2;
      offsetY -= Math.sin(skateTrickProgress * Math.PI) * 10;
    } else if (skateTrick === 'kickflip' || skateTrick === 'mount_kickflip') {
      bodyRot += Math.sin(skateTrickProgress * Math.PI) * 0.55;
      offsetY -= Math.sin(skateTrickProgress * Math.PI) * 8;
    } else if (skateTrick === 'ollie') {
      bodyRot += -0.28 * Math.sin(skateTrickProgress * Math.PI);
      offsetY -= Math.sin(skateTrickProgress * Math.PI) * 6;
    }
  }

  // Dodge ground slide vs Air Dash rotation (skipped during skate tricks — board handles the flair)
  if (dodgeTimer > 0 && !skatingNow) {
    if (player.isAirDash || jumpZ > 3) {
      // AIR DASH: Forward aerodynamic dive angle with sonic rings
      const diveAngle = 0.38;
      ctx.rotate(diveAngle);
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(-16, -8, 6, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-26, -8, 4, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      // GROUND SLIDE: Low tactical combat slide with sparks & ground friction smoke
      const slideLean = -0.32;
      ctx.rotate(slideLean);
      offsetY += 9;

      ctx.save();
      // Friction slide sparks under boots
      ctx.fillStyle = '#F59E0B';
      for (let s = 0; s < 4; s++) {
        const sparkX = -12 - s * 8 + Math.sin(time * 30 + s) * 4;
        const sparkY = 12 + Math.cos(time * 30 + s) * 3;
        ctx.beginPath();
        ctx.arc(sparkX, sparkY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Ground slide friction smoke
      ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
      ctx.beginPath();
      ctx.arc(-22, 10, 8, 0, Math.PI * 2);
      ctx.arc(-32, 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Attack lunge
  if (attackTimer > 0) {
    offsetY += Math.sin((1 - attackTimer / 0.25) * Math.PI) * -6;
  }

  // 3. Draw Vehicle (if riding and under character)
  if (isRiding && activeVehicleId) {
    drawVehicleUnder(ctx, activeVehicleId, time, facing, jumpOffsetY, player);
  }

  if (player.isInspectingWeapon) {
    bobY = 0;
    bodyRot = 0;
    waddle = 0;
    scaleY = 1;
    scaleX = facing === 'left' ? -1 : 1;
  }
  ctx.translate(0, offsetY - bobY);
  ctx.rotate(bodyRot);
  ctx.scale(scaleX, scaleY);

  // 3.5 Draw Animated Floating Wings (behind back hair)
  drawWings(ctx, chibi, time);

  // 4. Draw Character Back Hair / Ribbons
  drawBackHair(ctx, chibi);

  // 5. Draw Body & Outfit
  drawBody(ctx, chibi, isMoving || isDancing || isCute, waddle, isRiding);

  // 6. Draw Head, Face & Ears
  const isDead = player.stats ? player.stats.hp <= 0 : false;
  const blushBoost = cinematicPose === 'shy' ? 0.32 : 0;
  drawHeadAndFace(ctx, chibi, time, isDead, player.eyeLookX ?? 0, player.eyeLookY ?? 0, blushBoost);

  // 7. Draw Floating Levitating Halo
  drawFloatingHalo(ctx, chibi, time);

  // 7.5 Cinematic Pose Visual Effects
  if (player.cinematicPose && player.cinematicPose !== 'none') {
    drawCinematicPoseEffects(ctx, player, time);
  }

  // 8. Draw Hands & Weapon (skip if hidden during cinematic or driving a car)
  const drivingCar = activeVehicleId === 'police_car' || activeVehicleId === 'punk_car';
  if (!player.hideWeapon && !drivingCar) {
    drawHandsAndWeapon(ctx, player, time, attackTimer);
  } else {
    // Draw empty cute chibi hands waving/dancing
    ctx.save();
    ctx.fillStyle = player.chibi?.skinTone || '#FFE4D6';
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
    if (isDancing || isCute) {
      // Joyful rhythmic waving hands during victory dance
      const leftHandX = -13 + Math.cos(time * 7) * 4;
      const leftHandY = -4 - Math.sin(time * 7) * 9;
      const rightHandX = 13 + Math.cos(time * 7 + Math.PI) * 4;
      const rightHandY = -4 - Math.sin(time * 7 + Math.PI) * 9;
      ctx.beginPath();
      ctx.arc(leftHandX, leftHandY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rightHandX, rightHandY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const handBob = Math.sin(time * 4) * 2;
      ctx.beginPath();
      ctx.arc(-12, 4 + handBob, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 4 - handBob, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();

  if (!options.bodyOnly) {
    // 9. Overhead UI (Health bar, Stamina bar, Name tag, Emotes, Chat bubble, Bhop combo)
    ctx.save();
    ctx.translate(x, y + offsetY - bobY);
    drawOverheadHUD(ctx, player, time);
    ctx.restore();
  }
}

/** Procedural cinematic pose visual effects overlay */
function drawCinematicPoseEffects(ctx: CanvasRenderingContext2D, player: Player, time: number) {
  const pose = player.cinematicPose;
  if (!pose || pose === 'none') return;

  ctx.save();

  if (pose === 'dance') {
    // Musical notes floating up
    const notes = ['\u266a', '\u266b', '\u266c', '\u2727'];
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const noteY = -40 - (time * 30 + i * 40) % 60;
      const noteX = Math.sin(time * 3 + i * 2.1) * 18;
      const alpha = Math.max(0, 1 - ((time * 30 + i * 40) % 60) / 60);
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = i % 2 === 0 ? '#FDE047' : '#F472B6';
      ctx.fillText(notes[i % notes.length], noteX, noteY);
    }
    // Sparkle particles around dancing character
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 4; i++) {
      const angle = time * 2.5 + i * (Math.PI / 2);
      const dist = 20 + Math.sin(time * 4 + i) * 5;
      const sx = Math.cos(angle) * dist;
      const sy = -15 + Math.sin(angle) * dist * 0.5;
      const sparkSize = 2 + Math.sin(time * 6 + i * 1.5) * 1.5;
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pose === 'dive') {
    // Re-entry flame trail behind the character
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 8; i++) {
      const trailY = 20 + i * 12;
      const trailX = (Math.random() - 0.5) * 10;
      const size = 6 - i * 0.5;
      ctx.fillStyle = i < 3 ? '#EF4444' : i < 5 ? '#F59E0B' : '#FDE047';
      ctx.globalAlpha = 0.6 - i * 0.07;
      ctx.beginPath();
      ctx.arc(trailX, trailY, Math.max(1, size), 0, Math.PI * 2);
      ctx.fill();
    }
    // Speed wind lines
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) {
      const lx = -15 + i * 8;
      const ly = -30 + Math.sin(time * 20 + i) * 5;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - 3, ly + 25);
      ctx.stroke();
    }
  } else if (pose === 'skid') {
    // Ground friction sparks and dust
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 6; i++) {
      const sparkX = -20 - i * 8 + Math.sin(time * 25 + i) * 4;
      const sparkY = 14 + Math.cos(time * 20 + i) * 3;
      ctx.fillStyle = i % 2 === 0 ? '#F59E0B' : '#FDE047';
      ctx.beginPath();
      ctx.arc(sparkX, sparkY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dust clouds behind
    ctx.fillStyle = 'rgba(168, 162, 158, 0.5)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-30 - i * 14, 10 + i * 2, 7 + i * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pose === 'dazed') {
    // Orbiting stars and dizzy spirals
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.9;
    const starIcons = ['\u2b50', '\ud83d\udcab', '\u2726', '\u2605'];
    for (let i = 0; i < 4; i++) {
      const angle = time * 3 + i * (Math.PI / 2);
      const orbitX = Math.cos(angle) * 20;
      const orbitY = -35 + Math.sin(angle) * 8;
      ctx.fillText(starIcons[i], orbitX, orbitY);
    }
  } else if (pose === 'brush') {
    // Dust puff particles flying off
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#A8A29E';
    for (let i = 0; i < 5; i++) {
      const puffAngle = time * 4 + i * 1.3;
      const px = Math.cos(puffAngle) * (15 + i * 4);
      const py = -5 + Math.sin(puffAngle) * 8 - i * 3;
      ctx.beginPath();
      ctx.arc(px, py, 3 + Math.sin(time * 3 + i) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pose === 'bonk') {
    // Impact starburst and pain stars
    ctx.globalAlpha = 0.9;
    const burstSize = 8 + Math.sin(time * 12) * 3;
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? burstSize : burstSize * 0.4;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, -38 + Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, -38 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#EF4444';
    ctx.textAlign = 'center';
    ctx.fillText('\ud83d\udca5', 0, -48);
  } else if (pose === 'pickup') {
    // Subtle glow around weapon on ground
    ctx.globalAlpha = 0.4 + Math.sin(time * 5) * 0.2;
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(8, 16, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (pose === 'ready') {
    // Heroic gleam flash on weapon
    ctx.globalAlpha = 0.6 + Math.sin(time * 8) * 0.3;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    const flashX = 18 + Math.sin(time * 6) * 3;
    ctx.arc(flashX, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    // Battle aura
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = player.chibi?.accentColor || '#EF4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -8, 28 + Math.sin(time * 4) * 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (pose === 'cute') {
    const hearts = ['\u2665', '\u2661', '\u2727'];
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const heartY = -36 - (time * 22 + i * 34) % 52;
      const heartX = Math.sin(time * 2.8 + i * 1.7) * 14;
      const alpha = Math.max(0, 1 - ((time * 22 + i * 34) % 52) / 52);
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = i % 2 === 0 ? '#F472B6' : '#FB7185';
      ctx.fillText(hearts[i % hearts.length], heartX, heartY);
    }
  } else if (pose === 'shy') {
    ctx.globalAlpha = 0.75 + Math.sin(time * 6) * 0.15;
    ctx.fillStyle = '#7DD3FC';
    ctx.beginPath();
    ctx.ellipse(20, -30, 2.2, 3.8, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(19.5, -31.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.55 + Math.sin(time * 4) * 0.2;
    ctx.fillStyle = '#F9A8D4';
    ctx.fillText('>.<', 0, -42);
  }

  ctx.restore();
}

function drawWings(ctx: CanvasRenderingContext2D, chibi: ChibiConfig, time: number) {
  const wingType = chibi.wingType || 'none';
  if (wingType === 'none') return;

  const wingCol = chibi.wingColor || '#FFFFFF';
  const flap = Math.sin(time * 3.5) * 0.12;

  ctx.save();
  ctx.translate(0, -6);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#1E1B18';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (wingType === 'angel_feathers') {
    // DIVINE ANGEL WINGS: Multi-tiered feathery celestial wings
    const drawWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 12, 0);
      ctx.rotate(dir * flap);

      const grad = ctx.createLinearGradient(0, -28, dir * 36, 12);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.7, wingCol);
      grad.addColorStop(1, '#FDE047');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(dir * 14, -18, dir * 28, -26, dir * 42, -18);
      ctx.bezierCurveTo(dir * 38, -6, dir * 44, 2, dir * 36, 12);
      ctx.bezierCurveTo(dir * 30, 8, dir * 28, 16, dir * 20, 18);
      ctx.bezierCurveTo(dir * 16, 12, dir * 12, 16, dir * 4, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner Feather Details
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(dir * 10, -8);
      ctx.quadraticCurveTo(dir * 24, -12, dir * 32, -8);
      ctx.moveTo(dir * 8, 0);
      ctx.quadraticCurveTo(dir * 20, 2, dir * 28, 6);
      ctx.stroke();

      ctx.restore();
    };

    drawWing(-1);
    drawWing(1);
  } else if (wingType === 'devil_bat') {
    // DEMON / SUCCUBUS BAT WINGS
    const drawBatWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 12, -2);
      ctx.rotate(dir * (flap * 1.2));

      ctx.fillStyle = wingCol || '#312E81';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.2;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dir * 18, -22);
      ctx.lineTo(dir * 42, -18);
      ctx.quadraticCurveTo(dir * 32, -6, dir * 36, 4);
      ctx.quadraticCurveTo(dir * 24, 0, dir * 26, 14);
      ctx.quadraticCurveTo(dir * 14, 6, 0, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing thumb claw
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(dir * 18, -22, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Bone struts
      ctx.strokeStyle = '#1E1B4B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dir * 18, -22);
      ctx.lineTo(dir * 36, 4);
      ctx.moveTo(dir * 18, -22);
      ctx.lineTo(dir * 26, 14);
      ctx.stroke();

      ctx.restore();
    };

    drawBatWing(-1);
    drawBatWing(1);
  } else if (wingType === 'cyber_thrusters') {
    // MECHA JET VECTOR THRUSTER WINGS
    const drawThruster = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 14, -2);
      ctx.rotate(dir * 0.2);

      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dir * 32, -16);
      ctx.lineTo(dir * 38, -10);
      ctx.lineTo(dir * 18, 12);
      ctx.lineTo(0, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Plasma Jet Exhaust Nozzle
      ctx.fillStyle = '#06B6D4';
      ctx.fillRect(dir * 14 - (dir === -1 ? 12 : 0), 4, 12, 5);

      // Cyan Glowing Energy Trail
      ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(dir * 14, 9);
      ctx.lineTo(dir * 26, 9);
      ctx.lineTo(dir * 20, 20 + Math.sin(time * 20) * 4);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    };

    drawThruster(-1);
    drawThruster(1);
  } else if (wingType === 'fairy_sparkle') {
    // TRANSLUCENT GLITTERING FAIRY WINGS
    const drawFairyWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 10, -2);
      ctx.rotate(dir * flap * 1.5);

      ctx.fillStyle = 'rgba(244, 114, 182, 0.55)';
      ctx.strokeStyle = '#F472B6';
      ctx.lineWidth = 1.8;

      ctx.beginPath();
      ctx.ellipse(dir * 22, -14, 16, 9, dir * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(192, 132, 252, 0.55)';
      ctx.strokeStyle = '#C084FC';
      ctx.beginPath();
      ctx.ellipse(dir * 16, 6, 11, 7, dir * -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(dir * 22, -14, 2, 0, Math.PI * 2);
      ctx.arc(dir * 16, 6, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    drawFairyWing(-1);
    drawFairyWing(1);
  } else if (wingType === 'dragon_drake') {
    // DRACONIC SCALED WINGS
    const drawDragonWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 12, -4);
      ctx.rotate(dir * flap);

      ctx.fillStyle = wingCol || '#DC2626';
      ctx.strokeStyle = '#7F1D1D';
      ctx.lineWidth = 2.2;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dir * 22, -26);
      ctx.lineTo(dir * 44, -14);
      ctx.quadraticCurveTo(dir * 34, -2, dir * 36, 12);
      ctx.quadraticCurveTo(dir * 22, 6, 0, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.moveTo(dir * 20, -26);
      ctx.lineTo(dir * 24, -32);
      ctx.lineTo(dir * 26, -24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    };

    drawDragonWing(-1);
    drawDragonWing(1);
  } else if (wingType === 'pixel_wings') {
    // 8-BIT RETRO PIXEL BLOCKS WINGS
    const drawPixelWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 12, -8);
      ctx.fillStyle = wingCol || '#FDE047';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;

      const pxSize = 5;
      const blocks = [
        [0, 0], [1, -1], [2, -2], [3, -2], [4, -1],
        [2, -1], [3, -1], [4, 0], [5, 0],
        [1, 0], [2, 0], [3, 0], [4, 1],
        [1, 1], [2, 1], [3, 2],
      ];

      blocks.forEach(([bx, by]) => {
        const x = dir === 1 ? bx * pxSize : -bx * pxSize - pxSize;
        const y = by * pxSize;
        ctx.fillRect(x, y, pxSize, pxSize);
        ctx.strokeRect(x, y, pxSize, pxSize);
      });

      ctx.restore();
    };

    drawPixelWing(-1);
    drawPixelWing(1);
  } else if (wingType === 'mecha_wings') {
    // MECHA GUNDAM FOLDING WINGS
    const drawMechaWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 14, -6);
      ctx.rotate(dir * flap * 0.8);

      ctx.fillStyle = wingCol || '#F8FAFC';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.0;

      // Primary wing blade
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dir * 28, -26);
      ctx.lineTo(dir * 46, -22);
      ctx.lineTo(dir * 24, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Lower secondary feather fin
      ctx.fillStyle = '#0284C7';
      ctx.beginPath();
      ctx.moveTo(dir * 10, 2);
      ctx.lineTo(dir * 38, -12);
      ctx.lineTo(dir * 42, -4);
      ctx.lineTo(dir * 16, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Neon cyan laser edge
      ctx.fillStyle = '#38BDF8';
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 8;
      ctx.fillRect(dir * 26, -24, dir * 18, 3);
      ctx.shadowBlur = 0;

      ctx.restore();
    };
    drawMechaWing(-1);
    drawMechaWing(1);
  } else if (wingType === 'phoenix_fire') {
    // PHOENIX BLAZING FIRE PLUMES
    const drawFlameWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 12, -4);
      ctx.rotate(dir * flap * 1.6);

      const fGrad = ctx.createRadialGradient(0, 0, 2, dir * 30, -10, 36);
      fGrad.addColorStop(0, '#FEF08A');
      fGrad.addColorStop(0.3, '#F97316');
      fGrad.addColorStop(0.75, wingCol || '#EF4444');
      fGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = fGrad;
      ctx.shadowColor = '#EA580C';
      ctx.shadowBlur = 14;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(dir * 18, -24 + Math.sin(time * 10) * 3, dir * 42, -18);
      ctx.quadraticCurveTo(dir * 32, -4, dir * 38, 8 + Math.cos(time * 12) * 3);
      ctx.quadraticCurveTo(dir * 22, 4, dir * 26, 18);
      ctx.quadraticCurveTo(dir * 12, 6, 0, 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    };
    drawFlameWing(-1);
    drawFlameWing(1);
  } else if (wingType === 'butterfly_prisma') {
    // PRISMATIC BUTTERFLY WINGS
    const drawPrismaWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 10, -3);
      ctx.rotate(dir * flap * 1.4);

      const bGrad = ctx.createLinearGradient(0, -28, dir * 38, 20);
      bGrad.addColorStop(0, '#A7F3D0');
      bGrad.addColorStop(0.35, '#67E8F9');
      bGrad.addColorStop(0.7, '#C084FC');
      bGrad.addColorStop(1, '#F472B6');

      ctx.fillStyle = bGrad;
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.8;

      // Top wing lobe
      ctx.beginPath();
      ctx.ellipse(dir * 24, -14, 18, 11, dir * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Bottom wing lobe
      ctx.beginPath();
      ctx.ellipse(dir * 18, 8, 13, 8, dir * -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner jewel sparkle spots
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(dir * 24, -14, 2.5, 0, Math.PI * 2);
      ctx.arc(dir * 18, 8, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };
    drawPrismaWing(-1);
    drawPrismaWing(1);
  } else if (wingType === 'crystal_shards') {
    // LEVITATING GLOWING CRYSTAL SHARDS
    const shardAngles = [-0.6, -0.25, 0.1, 0.45];
    shardAngles.forEach((baseAngle, idx) => {
      [-1, 1].forEach((dir) => {
        ctx.save();
        const dist = 32 + idx * 4;
        const ang = baseAngle * dir + Math.sin(time * 3 + idx) * 0.15;
        const cx = Math.sin(ang) * dist * dir;
        const cy = -Math.cos(ang) * (dist * 0.65) - 4;

        ctx.translate(cx, cy);
        ctx.rotate(ang + dir * 0.4);

        ctx.fillStyle = wingCol || '#38BDF8';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = wingCol || '#38BDF8';
        ctx.shadowBlur = 8;

        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore();
      });
    });
  } else if (wingType === 'shadow_tendrils') {
    // VOID SHADOW TENDRILS
    const drawTendril = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 12, 0);
      ctx.fillStyle = wingCol || '#18181B';
      ctx.shadowColor = '#7C3AED';
      ctx.shadowBlur = 12;

      for (let t = 0; t < 3; t++) {
        const wav = Math.sin(time * 4 + t * 1.5) * 4;
        ctx.beginPath();
        ctx.moveTo(0, t * 4 - 4);
        ctx.bezierCurveTo(dir * (16 + t * 4), -18 + wav, dir * (32 + t * 6), -14 - wav, dir * (42 + t * 8), -6 + wav);
        ctx.bezierCurveTo(dir * 28, 4, dir * 14, 8, 0, 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    };
    drawTendril(-1);
    drawTendril(1);
  } else if (wingType === 'bee_wings') {
    // BUZZY BEE WINGS
    const drawBeeWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 14, -4);
      const flapAngle = Math.sin(time * 12) * 0.3;
      ctx.rotate(dir * (0.4 + flapAngle));
      ctx.fillStyle = 'rgba(253, 224, 71, 0.55)';
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      // Upper wing
      ctx.beginPath();
      ctx.ellipse(dir * 12, -8, 14, 8, dir * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Lower wing
      ctx.beginPath();
      ctx.ellipse(dir * 10, 4, 10, 6, dir * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Vein lines
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(dir * 4, -8);
      ctx.lineTo(dir * 20, -10);
      ctx.moveTo(dir * 4, -6);
      ctx.lineTo(dir * 18, -4);
      ctx.stroke();
      ctx.restore();
    };
    drawBeeWing(-1);
    drawBeeWing(1);
  } else if (wingType === 'steampunk_gears') {
    // STEAMPUNK MECHANICAL GEAR WINGS
    const drawGearWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 20, -2);
      const spinAngle = time * 2 * dir;
      // Large gear
      ctx.save();
      ctx.rotate(spinAngle);
      ctx.strokeStyle = wingCol || '#78716C';
      ctx.fillStyle = 'rgba(120, 113, 108, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Gear teeth
      for (let t = 0; t < 8; t++) {
        const ang = (t * Math.PI * 2) / 8;
        ctx.fillStyle = wingCol || '#78716C';
        ctx.fillRect(Math.cos(ang) * 12 - 2, Math.sin(ang) * 12 - 2, 4, 4);
      }
      // Center hole
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Small gear
      ctx.save();
      ctx.translate(dir * 16, -12);
      ctx.rotate(-spinAngle * 1.5);
      ctx.strokeStyle = wingCol || '#78716C';
      ctx.fillStyle = 'rgba(120, 113, 108, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let t = 0; t < 6; t++) {
        const ang = (t * Math.PI * 2) / 6;
        ctx.fillStyle = wingCol || '#78716C';
        ctx.fillRect(Math.cos(ang) * 7 - 1.5, Math.sin(ang) * 7 - 1.5, 3, 3);
      }
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    };
    drawGearWing(-1);
    drawGearWing(1);
  } else if (wingType === 'ice_crystal_wings') {
    // FROZEN ICE CRYSTAL WINGS (Cirno)
    const drawIceWing = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 12, -2);
      const shimmer = Math.sin(time * 2) * 0.1;
      ctx.rotate(dir * (0.3 + shimmer));
      ctx.fillStyle = wingCol || 'rgba(103, 232, 249, 0.65)';
      ctx.strokeStyle = '#67E8F9';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#67E8F9';
      ctx.shadowBlur = 8;
      // Main crystal blade
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(dir * 8, -4);
      ctx.lineTo(dir * 22, -18);
      ctx.lineTo(dir * 28, -22);
      ctx.lineTo(dir * 24, -14);
      ctx.lineTo(dir * 14, -2);
      ctx.lineTo(dir * 10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Branch crystal 1
      ctx.beginPath();
      ctx.moveTo(dir * 10, -6);
      ctx.lineTo(dir * 18, -16);
      ctx.lineTo(dir * 14, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Branch crystal 2
      ctx.beginPath();
      ctx.moveTo(dir * 16, -10);
      ctx.lineTo(dir * 26, -12);
      ctx.lineTo(dir * 20, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Sparkle
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(dir * 18, -14, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    };
    drawIceWing(-1);
    drawIceWing(1);
  } else if (wingType === 'void_portals') {
    // SWIRLING VOID PORTAL WINGS
    const drawPortal = (dir: number) => {
      ctx.save();
      ctx.translate(dir * 24, -4);
      const spin = time * 3;
      ctx.fillStyle = wingCol || '#312E81';
      ctx.shadowColor = wingCol || '#7C3AED';
      ctx.shadowBlur = 12;
      // Outer ring
      ctx.strokeStyle = wingCol || '#7C3AED';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
      // Inner spiral
      ctx.fillStyle = 'rgba(124, 58, 237, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      // Swirling particles
      for (let p = 0; p < 5; p++) {
        const ang = spin + (p * Math.PI * 2) / 5;
        const dist = 6 + Math.sin(time * 4 + p) * 3;
        ctx.fillStyle = '#C084FC';
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * dist, Math.sin(ang) * dist, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Center void
      ctx.fillStyle = '#09090B';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    };
    drawPortal(-1);
    drawPortal(1);
  }

  ctx.restore();
}

function drawBackHair(ctx: CanvasRenderingContext2D, chibi: ChibiConfig) {
  ctx.save();
  ctx.fillStyle = chibi.hairColor || '#F6D268';
  ctx.strokeStyle = '#1E1B18';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const style = chibi.backHairStyle || chibi.hairStyle || 'bob';
  if (style === 'none_short') {
    // Short tapered nape
    ctx.beginPath();
    ctx.ellipse(0, -6, 20, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (style === 'teto_drills') {
    // KASANE TETO: Iconic Twin Spring Coils (Bouncy Spiral Springs)
    const drawSpringDrill = (startX: number, startY: number, dir: number) => {
      const coils = 6;
      for (let i = 0; i < coils; i++) {
        const cx = startX + dir * (i * 2.2);
        const cy = startY + i * 6.5;
        const rx = 10 - i * 0.7;
        const ry = 6.2 - i * 0.35;
        const rot = dir * (0.28 - i * 0.04);

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner coil spring cavity shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.55, ry * 0.5, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = chibi.hairColor || '#EF4444';
      }
    };

    // Draw left & right spring drills
    drawSpringDrill(-23, -16, -1);
    drawSpringDrill(23, -16, 1);

    // Ribbons at base of springs
    ctx.fillStyle = chibi.ribbonColor || '#F43F5E';
    ctx.beginPath();
    ctx.arc(-19, -20, 5.5, 0, Math.PI * 2);
    ctx.arc(19, -20, 5.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'miku_twintails') {
    // HATSUNE MIKU: Ultra Long Floor-Length Flowing Twin Tails
    // Left Mega Twintail
    ctx.beginPath();
    ctx.moveTo(-18, -20);
    ctx.bezierCurveTo(-38, -5, -34, 18, -26, 38);
    ctx.bezierCurveTo(-22, 44, -18, 44, -19, 36);
    ctx.bezierCurveTo(-24, 16, -20, -5, -14, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Mega Twintail
    ctx.beginPath();
    ctx.moveTo(18, -20);
    ctx.bezierCurveTo(38, -5, 34, 18, 26, 38);
    ctx.bezierCurveTo(22, 44, 18, 44, 19, 36);
    ctx.bezierCurveTo(24, 16, 20, -5, 14, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Miku Square Cyber Hair Clips (Black box with magenta/cyan border)
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = chibi.ribbonColor || '#EC4899';
    ctx.lineWidth = 1.8;
    ctx.fillRect(-24, -24, 9, 8);
    ctx.strokeRect(-24, -24, 9, 8);
    ctx.fillRect(15, -24, 9, 8);
    ctx.strokeRect(15, -24, 9, 8);
  } else if (style === 'anya_buns') {
    // ANYA FORGER: Cute Dual Back Hair Buns
    ctx.beginPath();
    ctx.ellipse(0, -6, 25, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Left and right low bun puffs
    ctx.beginPath();
    ctx.arc(-22, -18, 8, 0, Math.PI * 2);
    ctx.arc(22, -18, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'bocchi_side') {
    // BOCCHI THE ROCK: Shaggy Long Pink Hair + Low Side Tail
    ctx.beginPath();
    ctx.ellipse(0, -4, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Low drooping side strand
    ctx.beginPath();
    ctx.ellipse(-22, 12, 7, 18, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'sailor_odango') {
    // SAILOR MOON: Dual High Odango Buns + Ultra Long Flowing Tails
    // Left bun & tail
    ctx.beginPath();
    ctx.arc(-22, -26, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-22, -18);
    ctx.quadraticCurveTo(-34, 10, -25, 36);
    ctx.quadraticCurveTo(-22, 38, -20, 32);
    ctx.quadraticCurveTo(-26, 8, -17, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right bun & tail
    ctx.beginPath();
    ctx.arc(22, -26, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(22, -18);
    ctx.quadraticCurveTo(34, 10, 25, 36);
    ctx.quadraticCurveTo(22, 38, 20, 32);
    ctx.quadraticCurveTo(26, 8, 17, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red/Gold Odango Jewels
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(-22, -26, 4, 0, Math.PI * 2);
    ctx.arc(22, -26, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'gyaru_ponytail') {
    // GYARU IDOL: High Textured Flared Side Ponytail
    ctx.beginPath();
    ctx.ellipse(22, -20, 11, 26, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Star / Scrunchie
    ctx.fillStyle = chibi.ribbonColor || '#FDE047';
    ctx.beginPath();
    ctx.arc(17, -27, 6.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'cat_hood_bob') {
    // Fluffy anime bob with flared wing tips
    ctx.beginPath();
    ctx.ellipse(0, -6, 27, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'pompadour_chad') {
    // GIGA CHAD: Voluminous Ducktail Pompadour Back
    ctx.beginPath();
    ctx.ellipse(0, -18, 24, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'twintails') {
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
  } else if (style === 'ojou_drills') {
    // Twin Princess Drills (Spiral Ringlets)
    // Left drill
    ctx.beginPath();
    ctx.ellipse(-22, -16, 9, 8, -0.2, 0, Math.PI * 2);
    ctx.ellipse(-24, -6, 8, 7, -0.15, 0, Math.PI * 2);
    ctx.ellipse(-25, 4, 7, 6, -0.1, 0, Math.PI * 2);
    ctx.ellipse(-24, 13, 5.5, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(-21, 20, 4, 4.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right drill
    ctx.beginPath();
    ctx.ellipse(22, -16, 9, 8, 0.2, 0, Math.PI * 2);
    ctx.ellipse(24, -6, 8, 7, 0.15, 0, Math.PI * 2);
    ctx.ellipse(25, 4, 7, 6, 0.1, 0, Math.PI * 2);
    ctx.ellipse(24, 13, 5.5, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(21, 20, 4, 4.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ribbons
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-18, -21, 5, 0, Math.PI * 2);
    ctx.arc(18, -21, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'drill_ponytail') {
    // Single massive high spiral drill ponytail
    ctx.beginPath();
    ctx.ellipse(18, -22, 10, 9, 0.3, 0, Math.PI * 2);
    ctx.ellipse(23, -12, 9, 8, 0.35, 0, Math.PI * 2);
    ctx.ellipse(26, -2, 8, 7, 0.4, 0, Math.PI * 2);
    ctx.ellipse(28, 7, 6.5, 6, 0.4, 0, Math.PI * 2);
    ctx.ellipse(27, 15, 4.5, 5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(14, -26, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'afro') {
    // Voluminous Afro Cloud Puff
    ctx.beginPath();
    ctx.arc(-22, -28, 14, 0, Math.PI * 2);
    ctx.arc(0, -36, 16, 0, Math.PI * 2);
    ctx.arc(22, -28, 14, 0, Math.PI * 2);
    ctx.arc(-26, -14, 13, 0, Math.PI * 2);
    ctx.arc(26, -14, 13, 0, Math.PI * 2);
    ctx.arc(-18, 0, 11, 0, Math.PI * 2);
    ctx.arc(18, 0, 11, 0, Math.PI * 2);
    ctx.arc(0, -18, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'dreadlocks') {
    // Cyber Dreads with metallic beads
    const dreadCoords = [
      { x: -24, y: -4, len: 24, rot: -0.25 },
      { x: -16, y: 0, len: 26, rot: -0.1 },
      { x: 16, y: 0, len: 26, rot: 0.1 },
      { x: 24, y: -4, len: 24, rot: 0.25 },
    ];
    dreadCoords.forEach(d => {
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 4.5, d.len / 2, d.rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Metallic cyber bead
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(d.x - 3, d.y + 4, 6, 3);
      ctx.fillStyle = chibi.hairColor || '#F6D268';
    });
  } else if (style === 'low_twintails') {
    // Low Shoulder Pigtails
    ctx.beginPath();
    ctx.ellipse(-20, 2, 7, 16, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(20, 2, 7, 16, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-17, -6, 4.5, 0, Math.PI * 2);
    ctx.arc(17, -6, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'side_braid') {
    // Elegant Side Braid draped on side
    ctx.beginPath();
    ctx.ellipse(-18, -12, 8, 8, -0.2, 0, Math.PI * 2);
    ctx.ellipse(-20, -4, 7.5, 7.5, -0.15, 0, Math.PI * 2);
    ctx.ellipse(-19, 4, 7, 7, -0.1, 0, Math.PI * 2);
    ctx.ellipse(-17, 11, 6, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(-15, 17, 4, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-15, 17, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'half_updo') {
    // Long flowing back hair + High Half-Up Knot
    ctx.beginPath();
    ctx.ellipse(0, -6, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Half-up bun
    ctx.beginPath();
    ctx.arc(0, -28, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Large Bow Ribbon
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.ellipse(-8, -27, 6, 3.5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(8, -27, 6, 3.5, 0.3, 0, Math.PI * 2);
    ctx.arc(0, -27, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'topknot_samurai') {
    // High Samurai Topknot
    ctx.beginPath();
    ctx.ellipse(0, -32, 6, 12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair tie cord
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-4, -26, 8, 3.5);
  } else if (style === 'twin_buns_flowing') {
    // Flowing hair back
    ctx.beginPath();
    ctx.ellipse(0, -4, 25, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Dual Odango Buns
    ctx.beginPath();
    ctx.arc(-22, -26, 9, 0, Math.PI * 2);
    ctx.arc(22, -26, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ribbons
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-22, -26, 4, 0, Math.PI * 2);
    ctx.arc(22, -26, 4, 0, Math.PI * 2);
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
  } else if (style === 'wavy' || style === 'long_flowing' || style === 'curtain_bangs') {
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
  } else if (style === 'mushroom_bob') {
    ctx.beginPath();
    ctx.ellipse(0, -8, 27, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'goth_side_fringe' || style === 'wolf_cut') {
    ctx.beginPath();
    ctx.ellipse(-4, -6, 25, 23, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'fluffy_short' || style === 'ahoge_messy') {
    ctx.beginPath();
    ctx.ellipse(0, -10, 26, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'slicked_back' || style === 'pixie_cut') {
    ctx.beginPath();
    ctx.ellipse(0, -12, 23, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'mega_drill_buns') {
    // Twin Mega Coiled Drill Buns
    [-1, 1].forEach((dir) => {
      ctx.beginPath();
      ctx.arc(dir * 24, -28, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(dir * 24, -28, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = chibi.hairColor || '#F6D268';
    });
  } else if (style === 'super_saiyan') {
    // Spiky super saiyan upwards flaring hair
    [-24, -16, -8, 0, 8, 16, 24].forEach((x, i) => {
      const h = 32 + (3 - Math.abs(i - 3)) * 8;
      ctx.beginPath();
      ctx.moveTo(x - 6, -18);
      ctx.lineTo(x, -18 - h);
      ctx.lineTo(x + 6, -18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  } else if (style === 'rapunzel_braid') {
    // Floor length woven braid
    ctx.beginPath();
    ctx.ellipse(14, 10, 8, 30, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Little flower ties
    ctx.fillStyle = '#FDA4AF';
    ctx.beginPath();
    ctx.arc(14, 0, 3.5, 0, Math.PI * 2);
    ctx.arc(16, 18, 3.5, 0, Math.PI * 2);
    ctx.arc(18, 34, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'twin_bubble_tails') {
    // Segmented bubble pigtails
    [-1, 1].forEach((dir) => {
      [0, 14, 28].forEach((by, idx) => {
        ctx.fillStyle = chibi.hairColor || '#F6D268';
        ctx.beginPath();
        ctx.arc(dir * (22 + idx * 2), -16 + by, 7 - idx * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = chibi.ribbonColor || '#F472B6';
        ctx.fillRect(dir * (22 + idx * 2) - 4, -16 + by + 5, 8, 2.5);
      });
    });
  } else if (style === 'shaggy_mullet') {
    ctx.beginPath();
    ctx.ellipse(0, -4, 27, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Mullet bottom spikes
    [-18, -8, 0, 8, 18].forEach((mx) => {
      ctx.beginPath();
      ctx.moveTo(mx - 4, 16);
      ctx.lineTo(mx, 28);
      ctx.lineTo(mx + 4, 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  } else if (style === 'twin_drill_tails') {
    // Long elegant corkscrew curls
    [-1, 1].forEach((dir) => {
      for (let s = 0; s < 5; s++) {
        ctx.beginPath();
        ctx.ellipse(dir * (22 + s * 1.5), -14 + s * 10, 8 - s * 0.8, 6, dir * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    });
  } else if (style === 'fishtail_braid') {
    // A braided fishtail going down the back
    ctx.beginPath();
    ctx.ellipse(0, -6, 22, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for(let i=0; i<5; i++) {
        ctx.beginPath();
        ctx.moveTo(-10 + i, 8 + i*8);
        ctx.lineTo(10 - i, 12 + i*8);
        ctx.lineTo(0, 20 + i*8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
  } else if (style === 'high_bun') {
    // Neat round bun on top of head
    ctx.beginPath();
    ctx.ellipse(0, -10, 24, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -32, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'waterfall_curls') {
    // Long cascading curly hair
    ctx.beginPath();
    ctx.ellipse(0, -4, 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    [-18, -6, 6, 18].forEach(x => {
        ctx.beginPath();
        ctx.ellipse(x, 15, 8, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, 35, 6, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
  } else if (style === 'ribbon_ponytail') {
    // Ponytail tied with a ribbon bow
    ctx.beginPath();
    ctx.ellipse(0, -8, 24, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 15, 12, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.ellipse(-8, -12, 10, 6, -0.2, 0, Math.PI * 2);
    ctx.ellipse(8, -12, 10, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'asymmetric_bob') {
    // Bob haircut longer on one side
    ctx.beginPath();
    ctx.moveTo(-24, -10);
    ctx.quadraticCurveTo(0, -25, 24, -10);
    ctx.quadraticCurveTo(28, 5, 26, 15);
    ctx.lineTo(10, 12);
    ctx.lineTo(-20, 25);
    ctx.quadraticCurveTo(-26, 10, -24, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (style === 'cirno_bob') {
    // Short ice-crystal-tipped bob
    ctx.beginPath();
    ctx.ellipse(0, -8, 24, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    [-20, -10, 0, 10, 20].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x-4, 5);
        ctx.lineTo(x, 18);
        ctx.lineTo(x+4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });
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
  } else if (outfit === 'mecha_pilot') {
    // Sleek Pilot Bodysuit Leggings
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(-14, 2, 28, 9, 3);
    ctx.fill();
    ctx.stroke();

    // Glowing Neon Leg Stripes
    ctx.fillStyle = accentCol;
    ctx.fillRect(-12, 4, 10, 2);
    ctx.fillRect(2, 4, 10, 2);
  } else if (outfit === 'goth_lolita') {
    // Multi-layered Ruffled Gothic Skirt
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.moveTo(-17, 1);
    ctx.lineTo(17, 1);
    ctx.lineTo(20, 12);
    ctx.lineTo(-20, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // White Frill Hemline
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    for (let f = -18; f <= 18; f += 6) {
      ctx.arc(f, 12, 3, 0, Math.PI);
    }
    ctx.fill();
    ctx.stroke();
  } else if (outfit === 'military_officer') {
    // Sharp Officer Slacks
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(-15, 2, 30, 10, 2);
    ctx.fill();
    ctx.stroke();

    // Officer Gold Stripe
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-14, 4, 28, 2);
  } else if (outfit === 'gym_bloomer') {
    // School PE Bloomers
    ctx.fillStyle = skirtCol || '#1E3A8A';
    ctx.beginPath();
    ctx.roundRect(-14, 2, 28, 9, 4);
    ctx.fill();
    ctx.stroke();
    // White side stripe
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-13, 3, 2, 7);
    ctx.fillRect(11, 3, 2, 7);
  } else if (outfit === 'swimsuit_sailor') {
    // Sailor bikini bottoms with side bows
    ctx.fillStyle = coatCol || '#0284C7';
    ctx.beginPath();
    ctx.roundRect(-12, 3, 24, 7, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.arc(-12, 4, 2.5, 0, Math.PI * 2);
    ctx.arc(12, 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'bunny_suit') {
    // High-cut glossy corset leotard
    ctx.fillStyle = coatCol || '#0F172A';
    ctx.beginPath();
    ctx.roundRect(-13, 1, 26, 9, 3);
    ctx.fill();
    ctx.stroke();
    // Fluffy tail
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 8, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (outfit === 'shrine_miko') {
    // Traditional red pleated hakama
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(17, 0);
    ctx.lineTo(21, 12);
    ctx.lineTo(-21, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // White hakama ties
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-14, 0, 28, 2);
  } else if (outfit === 'cyber_ninja') {
    // Armored ninja leggings with glowing knee plates
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.roundRect(-14, 2, 28, 9, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accentCol;
    ctx.fillRect(-10, 4, 6, 3);
    ctx.fillRect(4, 4, 6, 3);
  } else if (outfit === 'techwear_poncho') {
    // Baggy cargo pants with straps
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.roundRect(-16, 2, 32, 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accentCol;
    ctx.fillRect(-14, 5, 28, 1.8);
  } else if (outfit === 'magical_girl') {
    // Layered star ruffled skirt
    ctx.fillStyle = coatCol || '#F472B6';
    ctx.beginPath();
    ctx.moveTo(-18, 1);
    ctx.lineTo(18, 1);
    ctx.lineTo(22, 12);
    ctx.lineTo(-22, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    for (let f = -18; f <= 18; f += 6) {
      ctx.beginPath();
      ctx.arc(f, 12, 3, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  } else if (outfit === 'kigurumi_onesie') {
    // Baggy animal pajama onesie
    ctx.fillStyle = coatCol || '#FEF08A';
    ctx.beginPath();
    ctx.roundRect(-16, 0, 32, 12, 5);
    ctx.fill();
    ctx.stroke();
  } else if (outfit === 'vampire_noble') {
    // Gothic black velvet slacks with crimson stripe
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.roundRect(-15, 2, 30, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-14, 4, 2, 7);
    ctx.fillRect(12, 4, 2, 7);
  } else if (outfit === 'combat_commando') {
    // Camo cargo pants with knee pads
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(-15, 2, 30, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-10, 4, 6, 4);
    ctx.fillRect(4, 4, 6, 4);
  } else if (outfit === 'sukeban_trench') {
    // Long pleated delinquent skirt
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(17, 0);
    ctx.lineTo(20, 13);
    ctx.lineTo(-20, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (outfit === 'work_overalls') {
    // Denim dungarees
    ctx.fillStyle = '#0284C7';
    ctx.beginPath();
    ctx.roundRect(-15, 1, 30, 11, 3);
    ctx.fill();
    ctx.stroke();
  } else if (outfit === 'sailor_uniform') {
    // Sailor pleated skirt
    ctx.fillStyle = skirtCol;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(16, 2);
    ctx.lineTo(20, 13);
    ctx.lineTo(-20, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Pleat lines
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let p = -9; p <= 9; p += 6) {
      ctx.beginPath();
      ctx.moveTo(p, 3);
      ctx.lineTo(p + (p > 0 ? 1 : -1), 13);
      ctx.stroke();
    }
    ctx.strokeStyle = '#1E1B18';
  } else if (outfit === 'nurse_outfit') {
    // White nurse skirt
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-14, 2);
    ctx.lineTo(14, 2);
    ctx.lineTo(16, 12);
    ctx.lineTo(-16, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (outfit === 'china_dress') {
    // Cheongsam side-slit skirt
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(16, 2);
    ctx.lineTo(18, 14);
    ctx.lineTo(12, 14);
    ctx.lineTo(14, 8);
    ctx.lineTo(-14, 8);
    ctx.lineTo(-18, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Gold trim
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(16, 2);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
  } else if (outfit === 'detective_coat') {
    // Long detective trench skirt
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(16, 2);
    ctx.lineTo(20, 16);
    ctx.lineTo(-20, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (outfit === 'idol_stage') {
    // Sparkly idol mini skirt
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(16, 2);
    ctx.lineTo(20, 11);
    ctx.lineTo(-20, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Frilly hem
    ctx.fillStyle = '#FFFFFF';
    for (let f = -18; f <= 18; f += 6) {
      ctx.beginPath();
      ctx.arc(f, 11, 3, Math.PI, 0);
      ctx.fill();
    }
  } else if (outfit === 'winter_coat') {
    // Warm winter pants/leggings
    ctx.fillStyle = skirtCol;
    ctx.beginPath();
    ctx.roundRect(-15, 2, 30, 12, 3);
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
  } else if (outfit === 'mecha_pilot') {
    // Futuristic Armored Bodysuit / Plugsuit
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-14, -13, 28, 17, 5);
    ctx.fill();
    ctx.stroke();

    // Chest Armor Plate
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(10, -12);
    ctx.lineTo(7, -1);
    ctx.lineTo(-7, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing Reactor Core
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.arc(0, -6, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Shoulder Armor Pads
    ctx.fillStyle = accentCol;
    ctx.fillRect(-16, -11, 4, 6);
    ctx.fillRect(12, -11, 4, 6);
  } else if (outfit === 'goth_lolita') {
    // Gothic Lolita Corset & Lace Collar
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Lace Frill Collar
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, -10, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Corset Cross Laces
    ctx.strokeStyle = accentCol;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.lineTo(5, -2);
    ctx.moveTo(5, -6);
    ctx.lineTo(-5, -2);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.5;
  } else if (outfit === 'military_officer') {
    // Formal Tactical Officer Greatcoat
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-15, -13, 30, 18, 4);
    ctx.fill();
    ctx.stroke();

    // Double-breasted Gold Buttons
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(-4, -8, 1.6, 0, Math.PI * 2);
    ctx.arc(4, -8, 1.6, 0, Math.PI * 2);
    ctx.arc(-4, -3, 1.6, 0, Math.PI * 2);
    ctx.arc(4, -3, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Shoulder Epaulettes
    ctx.fillStyle = accentCol;
    ctx.fillRect(-17, -13, 5, 4);
    ctx.fillRect(12, -13, 5, 4);

    // Collar Tie
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(2.5, -6);
    ctx.lineTo(0, -2);
    ctx.lineTo(-2.5, -6);
    ctx.closePath();
    ctx.fill();
  } else if (outfit === 'gym_bloomer') {
    // Sport PE Jersey
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 15, 3);
    ctx.fill();
    ctx.stroke();

    // Navy collar & name tag
    ctx.fillStyle = skirtCol || '#1E3A8A';
    ctx.fillRect(-8, -12, 16, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-6, -6, 12, 5);
    ctx.strokeRect(-6, -6, 12, 5);
  } else if (outfit === 'swimsuit_sailor') {
    // Bikini top & bare midriff
    ctx.fillStyle = skin;
    ctx.fillRect(-12, -12, 24, 15);

    ctx.fillStyle = coatCol || '#0284C7';
    ctx.beginPath();
    ctx.arc(-6, -6, 5.5, 0, Math.PI * 2);
    ctx.arc(6, -6, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Sailor bow
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.arc(0, -9, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'bunny_suit') {
    // Glossy bunny corset
    ctx.fillStyle = coatCol || '#0F172A';
    ctx.beginPath();
    ctx.roundRect(-13, -12, 26, 15, 3);
    ctx.fill();
    ctx.stroke();

    // White collar & bowtie
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-7, -12, 14, 4);
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, -9, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'shrine_miko') {
    // White miko kimono top
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-15, -13, 30, 15, 4);
    ctx.fill();
    ctx.stroke();

    // Red crossed collar & cords
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(0, -2);
    ctx.lineTo(10, -12);
    ctx.lineTo(0, -6);
    ctx.closePath();
    ctx.fill();
  } else if (outfit === 'cyber_ninja') {
    // Stealth Cyber Shinobi Bodysuit
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.roundRect(-14, -13, 28, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Glowing Neon V-Armor
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(0, -2);
    ctx.lineTo(10, -12);
    ctx.lineTo(6, -12);
    ctx.lineTo(0, -5);
    ctx.lineTo(-6, -12);
    ctx.closePath();
    ctx.fill();
  } else if (outfit === 'techwear_poncho') {
    // Oversized Techwear Poncho
    ctx.fillStyle = coatCol || '#18181B';
    ctx.beginPath();
    ctx.moveTo(-18, -12);
    ctx.lineTo(18, -12);
    ctx.lineTo(16, 4);
    ctx.lineTo(-16, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hanging cyber straps
    ctx.fillStyle = accentCol;
    ctx.fillRect(-10, -4, 4, 10);
    ctx.fillRect(6, -4, 4, 10);
  } else if (outfit === 'magical_girl') {
    // Magical girl bodice with large star gem
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 15, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = coatCol || '#F472B6';
    ctx.fillRect(-12, -12, 24, 4);

    // Big heart brooch
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.arc(0, -6, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'kigurumi_onesie') {
    // Cozy onesie torso with belly patch
    ctx.fillStyle = coatCol || '#FEF08A';
    ctx.beginPath();
    ctx.roundRect(-16, -13, 32, 16, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, -5, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Center buttons
    ctx.fillStyle = '#713F12';
    ctx.beginPath();
    ctx.arc(0, -8, 1.5, 0, Math.PI * 2);
    ctx.arc(0, -2, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'vampire_noble') {
    // Victorian gothic waistcoat & high collar cape
    ctx.fillStyle = '#450A0A';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 15, 3);
    ctx.fill();
    ctx.stroke();

    // Gold Chain & Ascot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, -9, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-6, -5, 12, 1.5);
  } else if (outfit === 'combat_commando') {
    // Plate carrier vest
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(-15, -13, 30, 16, 3);
    ctx.fill();
    ctx.stroke();

    // Ammo pouches
    ctx.fillStyle = accentCol;
    ctx.fillRect(-11, -6, 6, 7);
    ctx.fillRect(-3, -6, 6, 7);
    ctx.fillRect(5, -6, 6, 7);
  } else if (outfit === 'sukeban_trench') {
    // Delinquent sailor top & flapping coat
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 15, 3);
    ctx.fill();
    ctx.stroke();

    // Red scarf
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.moveTo(-6, -11);
    ctx.lineTo(6, -11);
    ctx.lineTo(0, -4);
    ctx.closePath();
    ctx.fill();
  } else if (outfit === 'work_overalls') {
    // Overalls bib over striped tee
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-13, -12, 26, 14);

    ctx.fillStyle = '#0284C7';
    ctx.beginPath();
    ctx.roundRect(-10, -8, 20, 10, 2);
    ctx.fill();
    ctx.stroke();

    // Straps & brass clips
    ctx.fillRect(-9, -12, 3, 5);
    ctx.fillRect(6, -12, 3, 5);
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(-7.5, -7, 1.5, 0, Math.PI * 2);
    ctx.arc(7.5, -7, 1.5, 0, Math.PI * 2);
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
  } else if (outfit === 'sailor_uniform') {
    // Classic Japanese sailor fuku top
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 15, 3);
    ctx.fill();
    ctx.stroke();
    // Sailor collar
    ctx.fillStyle = skirtCol;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(-18, -6);
    ctx.lineTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.lineTo(18, -6);
    ctx.lineTo(14, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // V-neck stripe
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.lineTo(0, -2);
    ctx.lineTo(14, -10);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
    // Ribbon tie
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-4, -3);
    ctx.lineTo(0, -1);
    ctx.lineTo(4, -3);
    ctx.closePath();
    ctx.fill();
  } else if (outfit === 'nurse_outfit') {
    // White nurse uniform top
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 15, 3);
    ctx.fill();
    ctx.stroke();
    // Red cross
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-2, -10, 4, 8);
    ctx.fillRect(-4, -8, 8, 4);
    // Collar
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -12);
    ctx.lineTo(0, -8);
    ctx.lineTo(6, -12);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
  } else if (outfit === 'china_dress') {
    // Cheongsam mandarin collar top
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-14, -12, 28, 15, 3);
    ctx.fill();
    ctx.stroke();
    // Mandarin collar
    ctx.beginPath();
    ctx.moveTo(-6, -12);
    ctx.lineTo(-6, -16);
    ctx.quadraticCurveTo(0, -18, 6, -16);
    ctx.lineTo(6, -12);
    ctx.fill();
    ctx.stroke();
    // Frog button closures
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(4, -8, 1.5, 0, Math.PI * 2);
    ctx.arc(4, -4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Dragon embroidery accent
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.quadraticCurveTo(-4, -10, -2, -6);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
  } else if (outfit === 'detective_coat') {
    // Detective trenchcoat
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-16, -12, 32, 16, 3);
    ctx.fill();
    ctx.stroke();
    // Lapels
    ctx.fillStyle = skirtCol;
    ctx.beginPath();
    ctx.moveTo(-6, -12);
    ctx.lineTo(-10, -4);
    ctx.lineTo(-2, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, -12);
    ctx.lineTo(10, -4);
    ctx.lineTo(2, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Belt
    ctx.fillStyle = '#78716C';
    ctx.fillRect(-14, -1, 28, 3);
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(0, 1, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (outfit === 'idol_stage') {
    // Sparkly idol stage costume
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.roundRect(-13, -12, 26, 14, 4);
    ctx.fill();
    ctx.stroke();
    // Glitter details
    ctx.fillStyle = '#FFFFFF';
    [-8, -3, 2, 7].forEach(sx => {
      [-9, -5, -1].forEach(sy => {
        if (Math.abs(sx + sy) % 3 === 0) {
          ctx.beginPath();
          ctx.arc(sx, sy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
    // Bow
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-5, -12);
    ctx.lineTo(0, -8);
    ctx.lineTo(5, -12);
    ctx.closePath();
    ctx.fill();
  } else if (outfit === 'winter_coat') {
    // Warm winter coat with fur collar
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.roundRect(-16, -12, 32, 16, 4);
    ctx.fill();
    ctx.stroke();
    // Fur collar
    ctx.fillStyle = '#E2E8F0';
    for (let f = -8; f <= 8; f += 4) {
      ctx.beginPath();
      ctx.arc(f, -12, 4, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    // Center zip
    ctx.strokeStyle = '#A1A1AA';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 2);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
    // Pockets
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.roundRect(-12, -2, 8, 4, 1);
    ctx.roundRect(4, -2, 8, 4, 1);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
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
  isDead: boolean,
  eyeLookX: number = 0,
  eyeLookY: number = 0,
  blushBoost: number = 0
) {
  ctx.save();
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#1A1816';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const headY = -24;
  const eyeCol = chibi.eyeColor || '#38BDF8';
  const skinTone = chibi.skinTone || '#FFE4D6';

  // 1. Draw Animal Ears / Horns / Head accessories
  drawEars(ctx, chibi, headY);

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

  // 3. Blushing Pink Cheeks
  const cheekAlpha = 0.48 + blushBoost;
  const cheekW = 4.5 + blushBoost * 2.5;
  const cheekH = 2.5 + blushBoost * 1.2;
  ctx.fillStyle = `rgba(244, 114, 182, ${cheekAlpha})`;
  ctx.beginPath();
  ctx.ellipse(-15, headY + 11, cheekW, cheekH, 0, 0, Math.PI * 2);
  ctx.ellipse(15, headY + 11, cheekW, cheekH, 0, 0, Math.PI * 2);
  ctx.fill();

  if (chibi.eyesOverHair) {
    // Render Front Hair Bangs and Headwear under eyes
    drawFrontHair(ctx, chibi, headY);
    drawHeadwear(ctx, chibi, headY, time);
    // Draw Eyes on TOP of Bangs (Classic Anime & VTuber style!)
    drawEyesAndMouth(ctx, chibi, headY, eyeCol, skinTone, time, isDead, eyeLookX, eyeLookY);
  } else {
    // Traditional layering: Eyes drawn first, bangs fall over eyes
    drawEyesAndMouth(ctx, chibi, headY, eyeCol, skinTone, time, isDead, eyeLookX, eyeLookY);
    drawFrontHair(ctx, chibi, headY);
    drawHeadwear(ctx, chibi, headY, time);
  }

  ctx.restore();
}

function drawEars(ctx: CanvasRenderingContext2D, chibi: ChibiConfig, headY: number) {
  const earType = chibi.earType || 'cat';
  if (earType === 'none') return;

  const earCol = chibi.earColor || '#2B272C';
  const innerEarCol = chibi.innerEarColor || '#F472B6';
  const skinTone = chibi.skinTone || '#FFE4D6';

  ctx.save();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#1A1816';

  if (earType === 'cat' || earType === 'fox' || earType === 'wolf') {
    const isWolf = earType === 'wolf';
    const isFox = earType === 'fox';
    const earH = isWolf ? 36 : isFox ? 38 : 32;

    ctx.fillStyle = earCol;
    // Left ear
    ctx.beginPath();
    ctx.moveTo(-22, headY - 10);
    ctx.lineTo(-30, headY - earH);
    if (isWolf) {
      // Wolf notched ear tip
      ctx.lineTo(-24, headY - earH + 6);
      ctx.lineTo(-22, headY - earH + 4);
    }
    ctx.lineTo(-10, headY - 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner fluff left
    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.moveTo(-20, headY - 14);
    ctx.lineTo(-27, headY - earH + 8);
    ctx.lineTo(-13, headY - 22);
    ctx.closePath();
    ctx.fill();

    // Extra inner fur tufts
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-18, headY - 16);
    ctx.lineTo(-22, headY - 22);
    ctx.lineTo(-16, headY - 20);
    ctx.closePath();
    ctx.fill();

    // Right ear
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.moveTo(22, headY - 10);
    ctx.lineTo(30, headY - earH);
    if (isWolf) {
      ctx.lineTo(24, headY - earH + 6);
      ctx.lineTo(22, headY - earH + 4);
    }
    ctx.lineTo(10, headY - 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner fluff right
    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.moveTo(20, headY - 14);
    ctx.lineTo(27, headY - earH + 8);
    ctx.lineTo(13, headY - 22);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(18, headY - 16);
    ctx.lineTo(22, headY - 22);
    ctx.lineTo(16, headY - 20);
    ctx.closePath();
    ctx.fill();
  } else if (earType === 'bunny') {
    ctx.fillStyle = earCol;
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
  } else if (earType === 'mouse') {
    // Large round anime mouse ears
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.arc(-24, headY - 22, 14, 0, Math.PI * 2);
    ctx.arc(24, headY - 22, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.arc(-24, headY - 22, 8, 0, Math.PI * 2);
    ctx.arc(24, headY - 22, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (earType === 'deer_antlers') {
    // Multi-point wooden deer antlers
    ctx.fillStyle = '#78350F';
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 2.2;
    // Left antler
    ctx.beginPath();
    ctx.moveTo(-16, headY - 14);
    ctx.lineTo(-24, headY - 36);
    ctx.lineTo(-32, headY - 30);
    ctx.moveTo(-24, headY - 36);
    ctx.lineTo(-22, headY - 48);
    ctx.lineTo(-14, headY - 42);
    ctx.stroke();

    // Right antler
    ctx.beginPath();
    ctx.moveTo(16, headY - 14);
    ctx.lineTo(24, headY - 36);
    ctx.lineTo(32, headY - 30);
    ctx.moveTo(24, headY - 36);
    ctx.lineTo(22, headY - 48);
    ctx.lineTo(14, headY - 42);
    ctx.stroke();
  } else if (earType === 'sheep_horns') {
    // Spiral ram/sheep horns
    ctx.fillStyle = earCol || '#FDE047';
    ctx.strokeStyle = '#B45309';
    ctx.beginPath();
    ctx.arc(-24, headY - 6, 12, 0.4, Math.PI * 1.8);
    ctx.arc(-24, headY - 6, 7, Math.PI * 1.8, 0.4, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(24, headY - 6, 12, Math.PI * 1.2, Math.PI * 2.6);
    ctx.arc(24, headY - 6, 7, Math.PI * 2.6, Math.PI * 1.2, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (earType === 'elf') {
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
  } else if (earType === 'dog_floppy') {
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.ellipse(-26, headY - 4, 7, 14, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(26, headY - 4, 7, 14, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = innerEarCol;
    ctx.beginPath();
    ctx.ellipse(-26, headY - 4, 4, 9, -0.2, 0, Math.PI * 2);
    ctx.ellipse(26, headY - 4, 4, 9, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (earType === 'wings_head') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-24, headY - 6);
    ctx.quadraticCurveTo(-38, headY - 20, -32, headY - 28);
    ctx.lineTo(-22, headY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(24, headY - 6);
    ctx.quadraticCurveTo(38, headY - 20, 32, headY - 28);
    ctx.lineTo(22, headY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (earType === 'devil_wings' || earType === 'devil_horns') {
    ctx.fillStyle = earCol || '#DC2626';
    ctx.beginPath();
    ctx.moveTo(-18, headY - 12);
    ctx.quadraticCurveTo(-32, headY - 28, -24, headY - 38);
    ctx.quadraticCurveTo(-18, headY - 26, -10, headY - 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(18, headY - 12);
    ctx.quadraticCurveTo(32, headY - 28, 24, headY - 38);
    ctx.quadraticCurveTo(18, headY - 26, 10, headY - 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (earType === 'cyber_antennas') {
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

    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-34, headY - 27, 4, 4);
    ctx.fillRect(30, headY - 27, 4, 4);
  } else if (earType === 'horns' || earType === 'dragon_horns') {
    ctx.fillStyle = earCol || '#F59E0B';
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
  } else if (earType === 'raccoon') {
    // TANUKI RACCOON ROUND EARS
    const drawRaccoonEar = (ex: number) => {
      ctx.fillStyle = earCol || '#78716C';
      ctx.beginPath();
      ctx.arc(ex, headY - 22, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Dark tips
      ctx.fillStyle = '#1E1B18';
      ctx.beginPath();
      ctx.arc(ex, headY - 26, 5, Math.PI, Math.PI * 2);
      ctx.fill();
      // Inner ear
      ctx.fillStyle = innerEarCol;
      ctx.beginPath();
      ctx.arc(ex, headY - 21, 4, 0, Math.PI * 2);
      ctx.fill();
    };
    drawRaccoonEar(-22);
    drawRaccoonEar(22);
  } else if (earType === 'bat') {
    // BAT WING EARS (Remilia)
    const drawBatEar = (ex: number, dir: number) => {
      ctx.fillStyle = earCol || '#4C1D95';
      ctx.beginPath();
      ctx.moveTo(ex, headY - 12);
      ctx.lineTo(ex + dir * 6, headY - 36);
      ctx.lineTo(ex + dir * 12, headY - 28);
      ctx.lineTo(ex + dir * 16, headY - 34);
      ctx.lineTo(ex + dir * 18, headY - 22);
      ctx.lineTo(ex + dir * 14, headY - 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Membrane lines
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex + dir * 4, headY - 14);
      ctx.lineTo(ex + dir * 8, headY - 32);
      ctx.moveTo(ex + dir * 8, headY - 14);
      ctx.lineTo(ex + dir * 14, headY - 30);
      ctx.stroke();
      ctx.strokeStyle = '#1E1B18';
      ctx.lineWidth = 2.2;
    };
    drawBatEar(-20, -1);
    drawBatEar(20, 1);
  } else if (earType === 'cow_horns') {
    // SHORT CURVED COW HORNS
    const drawCowHorn = (ex: number, dir: number) => {
      ctx.fillStyle = '#FEF3C7';
      ctx.beginPath();
      ctx.moveTo(ex, headY - 14);
      ctx.quadraticCurveTo(ex + dir * 14, headY - 28, ex + dir * 10, headY - 36);
      ctx.quadraticCurveTo(ex + dir * 6, headY - 30, ex, headY - 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Dark tip
      ctx.fillStyle = '#78716C';
      ctx.beginPath();
      ctx.arc(ex + dir * 10, headY - 34, 3, 0, Math.PI * 2);
      ctx.fill();
    };
    drawCowHorn(-16, -1);
    drawCowHorn(16, 1);
  } else if (earType === 'unicorn_horn') {
    // SINGLE SPIRAL UNICORN HORN
    ctx.save();
    ctx.translate(0, headY - 24);
    ctx.rotate(-0.05);
    // Horn body
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-2, -24);
    ctx.lineTo(2, -24);
    ctx.lineTo(5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Spiral lines
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.6)';
    ctx.lineWidth = 1.2;
    for (let s = 0; s < 5; s++) {
      const sy = -s * 5;
      ctx.beginPath();
      ctx.moveTo(-4 + s * 0.7, sy);
      ctx.lineTo(4 - s * 0.7, sy - 3);
      ctx.stroke();
    }
    // Sparkle tip
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#FDE047';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, -24, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.restore();
}

function drawEyesAndMouth(
  ctx: CanvasRenderingContext2D,
  chibi: ChibiConfig,
  headY: number,
  eyeCol: string,
  skinTone: string,
  time: number,
  isDead: boolean,
  globalLookX: number = 0,
  globalLookY: number = 0
) {
  const eyeType = chibi.eyeType || 'cat_w';
  const isBlinking =
    !isDead && Math.floor(time * 1.6) % 6 === 0 && (time * 8) % 1 > 0.72;

  // Helper to render a perfectly shaded 3D Anime Ball Eye
  const drawSphericalBallEye = (
    cx: number,
    cy: number,
    radius: number,
    color: string,
    lookX: number = 0,
    lookY: number = 0
  ) => {
    const totalLookX = lookX + globalLookX;
    const totalLookY = lookY + globalLookY;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1.2, 0, Math.PI * 2);
    ctx.fill();

    const irisR = radius;
    const irisGrad = ctx.createRadialGradient(
      cx + totalLookX - irisR * 0.3,
      cy + totalLookY - irisR * 0.3,
      0.5,
      cx + totalLookX,
      cy + totalLookY,
      irisR
    );
    irisGrad.addColorStop(0, '#FFFFFF');
    irisGrad.addColorStop(0.2, color);
    irisGrad.addColorStop(0.85, color);
    irisGrad.addColorStop(1, '#0F172A');

    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx + totalLookX, cy + totalLookY, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.arc(cx + totalLookX * 1.2, cy + totalLookY * 1.2, irisR * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // Ambient bounce glow
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(cx + totalLookX, cy + totalLookY + irisR * 0.35, irisR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Specular highlights
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx + totalLookX - irisR * 0.38, cy + totalLookY - irisR * 0.38, irisR * 0.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + totalLookX + irisR * 0.38, cy + totalLookY + irisR * 0.38, irisR * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Eyelash line
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy - 0.5, radius + 1.2, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();

    ctx.restore();
  };

  if (isDead || eyeType === 'dead_x') {
    // X_X Defeated / Knocked out cross eyes
    ctx.strokeStyle = '#1A1816';
    ctx.lineWidth = 2.6;
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
  } else if (isBlinking || eyeType === 'happy' || eyeType === 'sleepy_closed') {
    // ^ ^ Happy smiling curved lines
    ctx.strokeStyle = '#1A1816';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-11, headY + 7, 5, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, headY + 7, 5, Math.PI, 0);
    ctx.stroke();
  } else if (eyeType === 'anya_smug') {
    // ANYA FORGER ICONIC SMUG (𓁹‿𓁹)
    ctx.strokeStyle = '#1A1816';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(-11, headY + 1, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, headY + 1, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    drawSphericalBallEye(-11, headY + 6, 4.8, eyeCol, 0.5, 1);
    drawSphericalBallEye(11, headY + 6, 4.8, eyeCol, -0.5, 1);

    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.rect(-17, headY - 1, 34, 4);
    ctx.fill();

    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 3);
    ctx.lineTo(-6, headY + 4.5);
    ctx.moveTo(16, headY + 3);
    ctx.lineTo(6, headY + 4.5);
    ctx.stroke();
  } else if (eyeType === 'starry_tears') {
    // STARRY ANIME TEARS (🥺✨)
    drawSphericalBallEye(-11, headY + 5.5, 5.2, eyeCol, 0, -0.5);
    drawSphericalBallEye(11, headY + 5.5, 5.2, eyeCol, 0, -0.5);

    // Giant trembling sparkle tear puddles
    ctx.fillStyle = '#67E8F9';
    ctx.beginPath();
    ctx.arc(-11, headY + 9, 3, 0, Math.PI);
    ctx.arc(11, headY + 9, 3, 0, Math.PI);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-14, headY + 10, 2, 0, Math.PI * 2);
    ctx.arc(14, headY + 10, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'rage_fire') {
    // RAGE FIRE ANIME BATTLE EYES (🔥)
    drawSphericalBallEye(-11, headY + 5.5, 5.0, '#DC2626', 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.0, '#DC2626', 0, 0);

    // Burning flame particles
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 2.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 1);
    ctx.lineTo(-7, headY + 4);
    ctx.moveTo(16, headY + 1);
    ctx.lineTo(7, headY + 4);
    ctx.stroke();
  } else if (eyeType === 'derp') {
    // FUNNY DERP EYES (🤪)
    drawSphericalBallEye(-11, headY + 5.5, 4.8, eyeCol, -2, -1);
    drawSphericalBallEye(11, headY + 5.5, 5.2, eyeCol, 2, 1);
  } else if (eyeType === 'hypno_spiral') {
    // HYPNO ROTATING SPIRAL EYES (🌀)
    drawSphericalBallEye(-11, headY + 5.5, 5.2, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.2, eyeCol, 0, 0);

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 3.5, time * 5, time * 5 + Math.PI * 1.5);
    ctx.arc(11, headY + 5.5, 3.5, -time * 5, -time * 5 + Math.PI * 1.5);
    ctx.stroke();
  } else if (eyeType === 'nya_cat') {
    // KAWAII CAT SLIT EYES (🐱)
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 6, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 6, 0, Math.PI * 2);
    ctx.fill();

    // Gold/Green Cat Iris
    ctx.fillStyle = eyeCol || '#F59E0B';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 5, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 5, 0, Math.PI * 2);
    ctx.fill();

    // Vertical Cat Slit Pupil
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.ellipse(-11, headY + 5.5, 1.4, 4.2, 0, 0, Math.PI * 2);
    ctx.ellipse(11, headY + 5.5, 1.4, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-13, headY + 3.5, 1.8, 0, Math.PI * 2);
    ctx.arc(9, headY + 3.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (eyeType === 'wink_star') {
    // WINK WITH POP STAR (✨‿•)
    drawSphericalBallEye(-11, headY + 5.5, 5.2, eyeCol, 0, 0);

    // Star inside left eye
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Right wink arc
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(11, headY + 7, 5, Math.PI, 0);
    ctx.stroke();
  } else if (eyeType === 'aqua_crying') {
    drawSphericalBallEye(-11, headY + 5.5, 5.2, '#38BDF8', 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.2, '#38BDF8', 0, 0);

    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 6);
    ctx.quadraticCurveTo(-26, headY + 12, -24, headY + 22);
    ctx.quadraticCurveTo(-18, headY + 16, -14, headY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(16, headY + 6);
    ctx.quadraticCurveTo(26, headY + 12, 24, headY + 22);
    ctx.quadraticCurveTo(18, headY + 16, 14, headY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (eyeType === 'bocchi_panic') {
    const shake1 = Math.sin(time * 30) * 1.5;
    const shake2 = Math.cos(time * 30) * 1.5;
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.4;

    ctx.beginPath();
    ctx.arc(-11 + shake1, headY + 6, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-14 + shake1, headY + 6);
    ctx.lineTo(-12 + shake1, headY + 4);
    ctx.lineTo(-10 + shake1, headY + 8);
    ctx.lineTo(-8 + shake1, headY + 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(11 + shake2, headY + 6, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8 + shake2, headY + 6);
    ctx.lineTo(10 + shake2, headY + 4);
    ctx.lineTo(12 + shake2, headY + 8);
    ctx.lineTo(14 + shake2, headY + 6);
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.moveTo(18, headY - 14);
    ctx.quadraticCurveTo(24, headY - 4, 18, headY + 2);
    ctx.quadraticCurveTo(12, headY - 4, 18, headY - 14);
    ctx.fill();
  } else if (eyeType === 'sparkle_stars' || eyeType === 'sparkle') {
    drawSphericalBallEye(-11, headY + 5.5, 5.2, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.2, eyeCol, 0, 0);

    const drawStarGlint = (sx: number, sy: number) => {
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3.5);
      ctx.lineTo(sx + 1, sy - 1);
      ctx.lineTo(sx + 3.5, sy);
      ctx.lineTo(sx + 1, sy + 1);
      ctx.lineTo(sx, sy + 3.5);
      ctx.lineTo(sx - 1, sy + 1);
      ctx.lineTo(sx - 3.5, sy);
      ctx.lineTo(sx - 1, sy - 1);
      ctx.closePath();
      ctx.fill();
    };

    drawStarGlint(-11, headY + 5.5);
    drawStarGlint(11, headY + 5.5);
  } else if (eyeType === 'heart_eyes' || eyeType === 'sparkle_hearts') {
    drawSphericalBallEye(-11, headY + 5.5, 5.0, '#F43F5E', 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.0, '#F43F5E', 0, 0);

    const drawHeart = (hx: number, hy: number) => {
      ctx.fillStyle = '#FDA4AF';
      ctx.beginPath();
      ctx.moveTo(hx, hy + 3.5);
      ctx.bezierCurveTo(hx - 3.5, hy - 0.5, hx - 3.5, hy - 2, hx, hy - 0.5);
      ctx.bezierCurveTo(hx + 3.5, hy - 2, hx + 3.5, hy - 0.5, hx, hy + 3.5);
      ctx.fill();
    };
    drawHeart(-11, headY + 5.5);
    drawHeart(11, headY + 5.5);
  } else if (eyeType === 'owo') {
    drawSphericalBallEye(-11, headY + 5.5, 5.5, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.5, eyeCol, 0, 0);
  } else if (eyeType === 'pout') {
    drawSphericalBallEye(-11, headY + 5.5, 4.8, eyeCol, -1.2, -0.5);
    drawSphericalBallEye(11, headY + 5.5, 4.8, eyeCol, -1.2, -0.5);

    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 1.5);
    ctx.lineTo(-7, headY + 3.5);
    ctx.moveTo(7, headY + 3.5);
    ctx.lineTo(16, headY + 1.5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.beginPath();
    ctx.arc(-16, headY + 12, 4, 0, Math.PI * 2);
    ctx.arc(16, headY + 12, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'giga_chad') {
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-17, headY + 2);
    ctx.lineTo(-5, headY + 4);
    ctx.moveTo(17, headY + 2);
    ctx.lineTo(5, headY + 4);
    ctx.stroke();

    drawSphericalBallEye(-11, headY + 6.5, 4.2, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 6.5, 4.2, eyeCol, 0, 0);
  } else if (eyeType === 'wink') {
    drawSphericalBallEye(-11, headY + 5.5, 5.0, eyeCol, 0, 0);
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(11, headY + 7, 5, Math.PI, 0);
    ctx.stroke();
  } else if (eyeType === 'determined') {
    ctx.strokeStyle = '#1A1816';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 2);
    ctx.lineTo(-7, headY + 4);
    ctx.moveTo(16, headY + 2);
    ctx.lineTo(7, headY + 4);
    ctx.stroke();

    drawSphericalBallEye(-11, headY + 6, 4.8, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 6, 4.8, eyeCol, 0, 0);
  } else if (eyeType === 'sleepy') {
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(-11, headY + 8, 4.5, 0.2, Math.PI - 0.2);
    ctx.arc(11, headY + 8, 4.5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (eyeType === 'teary') {
    drawSphericalBallEye(-11, headY + 5.5, 5.2, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.2, eyeCol, 0, 0);

    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(-15, headY + 11, 2.5, 0, Math.PI * 2);
    ctx.arc(15, headY + 11, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'dizzy_spiral') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 5.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 6, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 4, 0, Math.PI * 1.6);
    ctx.arc(-11, headY + 6, 2, 0, Math.PI * 1.6);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(11, headY + 6, 4, 0, Math.PI * 1.6);
    ctx.arc(11, headY + 6, 2, 0, Math.PI * 1.6);
    ctx.stroke();
  } else if (eyeType === 'glasses') {
    // Lens rims behind eyes
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 7.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, headY + 6, 7.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    drawSphericalBallEye(-11, headY + 5.5, 4.8, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 4.8, eyeCol, 0, 0);

    // Bridge + temples on top
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, headY + 6);
    ctx.lineTo(4, headY + 6);
    ctx.moveTo(-18, headY + 5);
    ctx.lineTo(-16, headY + 6);
    ctx.moveTo(16, headY + 6);
    ctx.lineTo(18, headY + 5);
    ctx.stroke();
  } else if (eyeType === 'deadpan') {
    ctx.strokeStyle = '#1A1816';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 6);
    ctx.lineTo(-6, headY + 6);
    ctx.moveTo(6, headY + 6);
    ctx.lineTo(16, headY + 6);
    ctx.stroke();
  } else if (eyeType === 'dot') {
    ctx.fillStyle = '#1A1816';
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 3, 0, Math.PI * 2);
    ctx.arc(11, headY + 6, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-12, headY + 5, 1.2, 0, Math.PI * 2);
    ctx.arc(10, headY + 5, 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'waterfall_cry') {
    // ｡ﾟ(ﾟ´Д｀ﾟ)ﾟ｡ Waterfall Tears
    drawSphericalBallEye(-11, headY + 5, 4.5, '#38BDF8', 0, 0);
    drawSphericalBallEye(11, headY + 5, 4.5, '#38BDF8', 0, 0);
    // Heavy dual waterfall streams
    ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.beginPath();
    ctx.rect(-14, headY + 7, 7, 24);
    ctx.rect(8, headY + 7, 7, 24);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-10.5, headY + 18, 1.5, 0, Math.PI * 2);
    ctx.arc(11.5, headY + 18, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'smug_cat_face') {
    // (｀・ω・´) Heroic Smug Neko
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.4;
    // Eyebrows
    ctx.beginPath();
    ctx.moveTo(-16, headY + 1);
    ctx.lineTo(-6, headY + 4);
    ctx.moveTo(16, headY + 1);
    ctx.lineTo(6, headY + 4);
    ctx.stroke();
    drawSphericalBallEye(-11, headY + 6, 5.0, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 6, 5.0, eyeCol, 0, 0);
  } else if (eyeType === 'yandere_glow') {
    // Yandere Hypnotic Ring Eyes
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 6, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 6, 0, Math.PI * 2);
    ctx.fill();
    // Glowing red concentric rings
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 4.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 4.5, 0, Math.PI * 2);
    ctx.arc(-11, headY + 5.5, 2.2, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else if (eyeType === 'anime_shades') {
    // Cool Anime Sunglasses
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(-18, headY + 3);
    ctx.lineTo(-4, headY + 3);
    ctx.lineTo(-6, headY + 10);
    ctx.lineTo(-16, headY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(4, headY + 3);
    ctx.lineTo(18, headY + 3);
    ctx.lineTo(16, headY + 10);
    ctx.lineTo(6, headY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bridge & white reflection sheen
    ctx.fillRect(-5, headY + 4, 10, 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 5);
    ctx.lineTo(-6, headY + 8);
    ctx.moveTo(6, headY + 5);
    ctx.lineTo(16, headY + 8);
    ctx.stroke();
  } else if (eyeType === 'laser_eyes') {
    // Fiery anime power-up laser beams
    drawSphericalBallEye(-11, headY + 5.5, 5.0, '#EF4444', 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.0, '#EF4444', 0, 0);

    ctx.fillStyle = '#FDE047';
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 3.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Beam streaks
    ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.fillRect(-12, headY + 4.5, 24, 2);
    ctx.shadowBlur = 0;
  } else if (eyeType === 'pog_shock') {
    // (o_o) Shocked Wide Open Pog Eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 6.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Tiny black dot pupils
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 2, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'drool_sleepy') {
    // Sleepy drooling eyes
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 5, 0.2, Math.PI - 0.2);
    ctx.arc(11, headY + 6, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (eyeType === 'diamond_shoujo') {
    // Ultra Shoujo Diamond Eyes
    drawSphericalBallEye(-11, headY + 5.5, 5.5, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.5, eyeCol, 0, 0);

    const drawDiamondFacet = (dx: number, dy: number) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(dx, dy - 3);
      ctx.lineTo(dx + 2.5, dy);
      ctx.lineTo(dx, dy + 3);
      ctx.lineTo(dx - 2.5, dy);
      ctx.closePath();
      ctx.fill();
    };
    drawDiamondFacet(-11, headY + 5.5);
    drawDiamondFacet(11, headY + 5.5);
  } else if (eyeType === 'heterochromia') {
    // Two different colored eyes - left red, right blue
    drawSphericalBallEye(-11, headY + 5.5, 5.2, '#EF4444', 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.2, '#0EA5E9', 0, 0);
  } else if (eyeType === '9ball') {
    // Cirno's iconic ⑨ eyes
    ctx.fillStyle = eyeCol || '#0EA5E9';
    ctx.beginPath();
    ctx.arc(-11, headY + 5.5, 5.5, 0, Math.PI * 2);
    ctx.arc(11, headY + 5.5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // White ⑨ symbol in each eye
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⑨', -11, headY + 6);
    ctx.fillText('⑨', 11, headY + 6);
  } else if (eyeType === 'tsurime_sharp') {
    // Sharp upturned tsurime anime eyes
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.4;
    // Sharp upward angled eyelids
    ctx.beginPath();
    ctx.moveTo(-17, headY + 4);
    ctx.lineTo(-6, headY + 7);
    ctx.moveTo(17, headY + 4);
    ctx.lineTo(6, headY + 7);
    ctx.stroke();
    drawSphericalBallEye(-11, headY + 5.5, 4.8, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 4.8, eyeCol, 0, 0);
    // Sharp lower lash
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 3);
    ctx.lineTo(-18, headY + 1);
    ctx.moveTo(16, headY + 3);
    ctx.lineTo(18, headY + 1);
    ctx.stroke();
  } else if (eyeType === 'tareme_soft') {
    // Soft drooping tareme anime eyes
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.2;
    // Soft downward angled eyelids
    ctx.beginPath();
    ctx.moveTo(-16, headY + 3);
    ctx.quadraticCurveTo(-11, headY + 1, -6, headY + 4);
    ctx.moveTo(16, headY + 3);
    ctx.quadraticCurveTo(11, headY + 1, 6, headY + 4);
    ctx.stroke();
    drawSphericalBallEye(-11, headY + 6, 5.2, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 6, 5.2, eyeCol, 0, 0);
  } else if (eyeType === 'closed_smile') {
    // ^_^ gentle closed smile eyes
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-11, headY + 6, 5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, headY + 6, 5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (eyeType === 'sweat_nervous') {
    // Nervous sweatdrop eyes
    drawSphericalBallEye(-11, headY + 5.5, 4.5, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 4.5, eyeCol, 0, 0);
    // Sweatdrop
    ctx.fillStyle = '#67E8F9';
    ctx.strokeStyle = '#0EA5E9';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(18, headY - 2);
    ctx.quadraticCurveTo(22, headY + 4, 18, headY + 8);
    ctx.quadraticCurveTo(14, headY + 4, 18, headY - 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
    // Nervous brow lines
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-16, headY + 1);
    ctx.lineTo(-14, headY + 3);
    ctx.moveTo(14, headY + 1);
    ctx.lineTo(16, headY + 3);
    ctx.stroke();
  } else {
    drawSphericalBallEye(-11, headY + 5.5, 5.2, eyeCol, 0, 0);
    drawSphericalBallEye(11, headY + 5.5, 5.2, eyeCol, 0, 0);
  }

  // Mouth Expressions
  ctx.strokeStyle = '#1A1816';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (eyeType === 'anya_smug') {
    ctx.beginPath();
    ctx.arc(0, headY + 11.5, 5.5, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4.5, headY + 12);
    ctx.lineTo(6.5, headY + 10.5);
    ctx.stroke();
  } else if (eyeType === 'aqua_crying' || eyeType === 'waterfall_cry') {
    ctx.fillStyle = '#BE123C';
    ctx.beginPath();
    ctx.arc(0, headY + 13, 4.5, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (eyeType === 'bocchi_panic') {
    ctx.beginPath();
    ctx.moveTo(-5, headY + 13);
    ctx.quadraticCurveTo(-2, headY + 11, 0, headY + 13);
    ctx.quadraticCurveTo(2, headY + 15, 5, headY + 13);
    ctx.stroke();
  } else if (eyeType === 'derp') {
    // Derp wagging tongue
    ctx.fillStyle = '#FDA4AF';
    ctx.beginPath();
    ctx.ellipse(3, headY + 15, 3.5, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (eyeType === 'drool_sleepy') {
    // Drool bubble
    ctx.beginPath();
    ctx.arc(0, headY + 12, 3, 0.2, Math.PI * 0.9);
    ctx.stroke();
    ctx.fillStyle = '#67E8F9';
    ctx.beginPath();
    ctx.arc(4, headY + 15, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (eyeType === 'pog_shock') {
    // Open circular pog mouth (O)
    ctx.fillStyle = '#881337';
    ctx.beginPath();
    ctx.ellipse(0, headY + 13.5, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (eyeType === 'owo' || eyeType === 'starry_tears') {
    ctx.fillStyle = '#FDA4AF';
    ctx.beginPath();
    ctx.arc(0, headY + 13, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (eyeType === 'pout') {
    ctx.beginPath();
    ctx.arc(0, headY + 14.5, 3.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (eyeType === 'giga_chad' || eyeType === 'smug' || eyeType === 'rage_fire' || eyeType === 'smug_cat_face' || eyeType === 'anime_shades' || eyeType === 'yandere_glow') {
    ctx.beginPath();
    ctx.arc(2, headY + 12, 4, 0.2, Math.PI * 0.85);
    ctx.stroke();
  } else if (eyeType === 'happy' || eyeType === 'heart_eyes' || eyeType === 'sparkle_stars' || eyeType === 'sleepy_closed' || eyeType === 'wink_star' || eyeType === 'diamond_shoujo') {
    ctx.beginPath();
    ctx.arc(0, headY + 12, 3.8, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else if (eyeType === 'deadpan') {
    ctx.beginPath();
    ctx.moveTo(-3.5, headY + 12);
    ctx.lineTo(3.5, headY + 12);
    ctx.stroke();
  } else if (eyeType === 'teary') {
    ctx.beginPath();
    ctx.arc(0, headY + 14, 3.2, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else if (eyeType === 'closed_smile' || eyeType === 'tareme_soft') {
    // Gentle happy smile
    ctx.beginPath();
    ctx.arc(0, headY + 12, 4, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else if (eyeType === 'tsurime_sharp') {
    // Confident smirk
    ctx.beginPath();
    ctx.arc(2, headY + 12, 3.5, 0.2, Math.PI * 0.8);
    ctx.stroke();
  } else if (eyeType === '9ball') {
    // Cirno's confident grin
    ctx.fillStyle = '#FDA4AF';
    ctx.beginPath();
    ctx.arc(0, headY + 13, 4, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (eyeType === 'sweat_nervous') {
    // Nervous wavy mouth
    ctx.beginPath();
    ctx.moveTo(-5, headY + 13);
    ctx.quadraticCurveTo(-2, headY + 11, 0, headY + 13);
    ctx.quadraticCurveTo(2, headY + 15, 5, headY + 13);
    ctx.stroke();
  } else {
    // Signature :3 W double curve
    ctx.beginPath();
    ctx.arc(-3, headY + 12, 3, 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3, headY + 12, 3, 0.1, Math.PI * 0.9);
    ctx.stroke();
  }
}

function drawFrontHair(ctx: CanvasRenderingContext2D, chibi: ChibiConfig, headY: number) {
  const frontStyle = chibi.frontHairStyle || chibi.hairStyle || 'straight_bangs';
  if (frontStyle === 'none') return;

  const hairCol = chibi.hairColor || '#F6D268';
  ctx.save();
  ctx.fillStyle = chibi.hairColor || '#F6D268';
  ctx.strokeStyle = '#1E1B18';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  if (frontStyle === 'teto_arched_bangs' || frontStyle === 'teto_drills') {
    // KASANE TETO: Cute arched bangs with signature side-locks
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 12);
    ctx.lineTo(-22, headY + 16);
    ctx.lineTo(-17, headY + 4);
    ctx.lineTo(-7, headY + 8);
    ctx.lineTo(0, headY - 1);
    ctx.lineTo(7, headY + 8);
    ctx.lineTo(17, headY + 4);
    ctx.lineTo(22, headY + 16);
    ctx.lineTo(28, headY + 12);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'miku_fringe' || frontStyle === 'miku_twintails') {
    // HATSUNE MIKU: Straight anime fringe with center notch and long side-locks
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 18);
    ctx.lineTo(-21, headY + 18);
    ctx.lineTo(-19, headY + 6);
    ctx.lineTo(-5, headY + 7);
    ctx.lineTo(0, headY + 1);
    ctx.lineTo(5, headY + 7);
    ctx.lineTo(19, headY + 6);
    ctx.lineTo(21, headY + 18);
    ctx.lineTo(28, headY + 18);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'anya_horns_bangs' || frontStyle === 'anya_buns') {
    // ANYA FORGER: Cute round baby bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 8);
    ctx.lineTo(-20, headY + 11);
    ctx.lineTo(-14, headY + 2);
    ctx.lineTo(-5, headY + 7);
    ctx.lineTo(0, headY);
    ctx.lineTo(5, headY + 7);
    ctx.lineTo(14, headY + 2);
    ctx.lineTo(20, headY + 11);
    ctx.lineTo(27, headY + 8);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'bocchi_shaggy' || frontStyle === 'bocchi_side') {
    // BOCCHI THE ROCK: Shaggy messy bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-29, headY + 14);
    ctx.lineTo(-18, headY + 12);
    ctx.lineTo(-10, headY + 15);
    ctx.lineTo(-2, headY + 5);
    ctx.lineTo(8, headY + 14);
    ctx.lineTo(18, headY + 8);
    ctx.lineTo(28, headY + 12);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'sailor_crescent' || frontStyle === 'sailor_odango') {
    // SAILOR MOON: Heart-curved fringe with cute side ringlets
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 15);
    ctx.lineTo(-21, headY + 15);
    ctx.lineTo(-16, headY + 3);
    ctx.lineTo(-6, headY + 7);
    ctx.lineTo(0, headY - 2);
    ctx.lineTo(6, headY + 7);
    ctx.lineTo(16, headY + 3);
    ctx.lineTo(21, headY + 15);
    ctx.lineTo(28, headY + 15);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'side_swept' || frontStyle === 'gyaru_ponytail') {
    // GYARU IDOL: Feathered sweeping bangs with long side tendril
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-29, headY + 16);
    ctx.lineTo(-19, headY + 16);
    ctx.lineTo(-12, headY + 4);
    ctx.lineTo(2, headY + 8);
    ctx.lineTo(14, headY + 4);
    ctx.lineTo(24, headY + 10);
    ctx.lineTo(28, headY + 12);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'chad_quiff' || frontStyle === 'pompadour_chad') {
    // GIGA CHAD: Towering anime pompadour quiff
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 4);
    ctx.lineTo(-20, headY - 4);
    ctx.quadraticCurveTo(-14, headY - 32, 0, headY - 34);
    ctx.quadraticCurveTo(18, headY - 32, 22, headY - 4);
    ctx.lineTo(28, headY + 4);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'spiky_bangs' || frontStyle === 'spiky') {
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
  } else if (frontStyle === 'hime_sidelocks' || frontStyle === 'hime_cut') {
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
  } else if (frontStyle === 'curtain_bangs' || frontStyle === 'center_split') {
    // Center-parted Curtain Bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 14);
    ctx.lineTo(-18, headY + 10);
    ctx.lineTo(-5, headY - 2);
    ctx.lineTo(0, headY + 2);
    ctx.lineTo(5, headY - 2);
    ctx.lineTo(18, headY + 10);
    ctx.lineTo(28, headY + 14);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'emo_fringe' || frontStyle === 'goth_side_fringe') {
    // Asymmetrical Sweeping Emo Fringe
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-29, headY + 16);
    ctx.lineTo(-16, headY + 18);
    ctx.lineTo(8, headY + 8);
    ctx.lineTo(22, headY + 2);
    ctx.lineTo(28, headY + 10);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'blunt_fringe' || frontStyle === 'mushroom_bob') {
    // Neat Curved Bowl Fringe
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 10);
    ctx.bezierCurveTo(-14, headY + 12, 14, headY + 12, 27, headY + 10);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'short_parted') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 6);
    ctx.lineTo(-20, headY + 4);
    ctx.lineTo(-10, headY + 8);
    ctx.lineTo(-2, headY);
    ctx.lineTo(8, headY + 7);
    ctx.lineTo(18, headY + 3);
    ctx.lineTo(28, headY + 6);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'v_bangs') {
    // V-shaped Anime Bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 12);
    ctx.lineTo(-18, headY + 6);
    ctx.lineTo(0, headY + 16);
    ctx.lineTo(18, headY + 6);
    ctx.lineTo(28, headY + 12);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'messy_curly') {
    // Fluffy loose curly fringe
    ctx.moveTo(-26, headY - 6);
    ctx.quadraticCurveTo(-20, headY + 14, -14, headY + 6);
    ctx.quadraticCurveTo(-8, headY + 16, -2, headY + 8);
    ctx.quadraticCurveTo(4, headY + 15, 10, headY + 6);
    ctx.quadraticCurveTo(18, headY + 14, 26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'braided_headband') {
    // Crown braid headband
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 12);
    ctx.lineTo(-22, headY + 12);
    ctx.lineTo(-18, headY + 4);
    ctx.lineTo(18, headY + 4);
    ctx.lineTo(22, headY + 12);
    ctx.lineTo(27, headY + 12);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'feathered_bangs') {
    // Layered wispy bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-29, headY + 14);
    ctx.lineTo(-22, headY + 8);
    ctx.lineTo(-14, headY + 12);
    ctx.lineTo(-6, headY + 4);
    ctx.lineTo(2, headY + 10);
    ctx.lineTo(10, headY + 3);
    ctx.lineTo(18, headY + 11);
    ctx.lineTo(28, headY + 14);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'choppy_micro') {
    // Trendy high micro baby bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 10);
    ctx.lineTo(-20, headY + 4);
    ctx.lineTo(-12, headY + 1);
    ctx.lineTo(0, headY - 2);
    ctx.lineTo(12, headY + 1);
    ctx.lineTo(20, headY + 4);
    ctx.lineTo(28, headY + 10);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'wispy_bangs') {
    // Thin delicate wispy strands across forehead
    ctx.moveTo(-26, headY - 6);
    ctx.quadraticCurveTo(-24, headY + 2, -20, headY + 8);
    ctx.lineTo(-16, headY - 1);
    ctx.quadraticCurveTo(-12, headY + 6, -6, headY + 10);
    ctx.lineTo(-2, headY - 2);
    ctx.quadraticCurveTo(4, headY + 8, 8, headY + 12);
    ctx.lineTo(12, headY);
    ctx.quadraticCurveTo(18, headY + 6, 22, headY + 10);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'zigzag_bangs') {
    // Sharp zigzag pattern bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-24, headY + 6);
    ctx.lineTo(-18, headY - 4);
    ctx.lineTo(-12, headY + 8);
    ctx.lineTo(-6, headY - 4);
    ctx.lineTo(0, headY + 10);
    ctx.lineTo(6, headY - 4);
    ctx.lineTo(12, headY + 8);
    ctx.lineTo(18, headY - 4);
    ctx.lineTo(24, headY + 6);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'twin_antenna') {
    // Two ahoge antenna strands sticking up from parted bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-26, headY + 6);
    ctx.lineTo(-14, headY + 2);
    ctx.lineTo(-4, headY + 8);
    ctx.lineTo(4, headY + 8);
    ctx.lineTo(14, headY + 2);
    ctx.lineTo(26, headY + 6);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'thick_eyebrow_bangs') {
    // Thick heavy bangs that nearly cover the eyes
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 14);
    ctx.lineTo(-22, headY + 10);
    ctx.lineTo(-14, headY + 16);
    ctx.lineTo(-6, headY + 12);
    ctx.lineTo(0, headY + 16);
    ctx.lineTo(6, headY + 12);
    ctx.lineTo(14, headY + 16);
    ctx.lineTo(22, headY + 10);
    ctx.lineTo(28, headY + 14);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'ojou_ringlets') {
    // Elegant curling ringlet bangs on sides
    ctx.moveTo(-26, headY - 6);
    ctx.bezierCurveTo(-30, headY + 4, -28, headY + 16, -22, headY + 20);
    ctx.bezierCurveTo(-18, headY + 14, -20, headY + 6, -16, headY + 2);
    ctx.lineTo(-6, headY + 6);
    ctx.lineTo(0, headY - 2);
    ctx.lineTo(6, headY + 6);
    ctx.lineTo(16, headY + 2);
    ctx.bezierCurveTo(20, headY + 6, 18, headY + 14, 22, headY + 20);
    ctx.bezierCurveTo(28, headY + 16, 30, headY + 4, 26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'cirno_fringe') {
    // Cirno's characteristic short icy bangs
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-26, headY + 4);
    ctx.lineTo(-20, headY + 8);
    ctx.lineTo(-14, headY + 2);
    ctx.lineTo(-8, headY + 6);
    ctx.lineTo(-2, headY);
    ctx.lineTo(4, headY + 6);
    ctx.lineTo(10, headY + 2);
    ctx.lineTo(16, headY + 8);
    ctx.lineTo(22, headY + 4);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'straight_bangs_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 2);
    ctx.lineTo(-20, headY + 3);
    ctx.lineTo(-14, headY - 4);
    ctx.lineTo(-6, headY - 1);
    ctx.lineTo(0, headY - 5);
    ctx.lineTo(6, headY - 1);
    ctx.lineTo(14, headY - 4);
    ctx.lineTo(20, headY + 3);
    ctx.lineTo(27, headY + 2);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'teto_arched_bangs_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 3);
    ctx.lineTo(-22, headY + 5);
    ctx.lineTo(-17, headY - 2);
    ctx.lineTo(-7, headY + 1);
    ctx.lineTo(0, headY - 4);
    ctx.lineTo(7, headY + 1);
    ctx.lineTo(17, headY - 2);
    ctx.lineTo(22, headY + 5);
    ctx.lineTo(27, headY + 3);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'miku_fringe_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 4);
    ctx.lineTo(-21, headY + 5);
    ctx.lineTo(-19, headY - 2);
    ctx.lineTo(-5, headY + 1);
    ctx.lineTo(0, headY - 4);
    ctx.lineTo(5, headY + 1);
    ctx.lineTo(19, headY - 2);
    ctx.lineTo(21, headY + 5);
    ctx.lineTo(27, headY + 4);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'curtain_bangs_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 3);
    ctx.lineTo(-18, headY + 2);
    ctx.lineTo(-5, headY - 5);
    ctx.lineTo(0, headY - 2);
    ctx.lineTo(5, headY - 5);
    ctx.lineTo(18, headY + 2);
    ctx.lineTo(27, headY + 3);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'v_bangs_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 3);
    ctx.lineTo(-18, headY - 1);
    ctx.lineTo(0, headY + 4);
    ctx.lineTo(18, headY - 1);
    ctx.lineTo(27, headY + 3);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'blunt_fringe_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 1);
    ctx.bezierCurveTo(-14, headY + 3, 14, headY + 3, 27, headY + 1);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'wispy_bangs_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.quadraticCurveTo(-24, headY - 2, -20, headY + 2);
    ctx.lineTo(-16, headY - 4);
    ctx.quadraticCurveTo(-10, headY, -4, headY + 2);
    ctx.lineTo(-2, headY - 4);
    ctx.quadraticCurveTo(4, headY, 8, headY + 2);
    ctx.lineTo(12, headY - 4);
    ctx.quadraticCurveTo(18, headY, 22, headY + 2);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'side_swept_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 4);
    ctx.lineTo(-19, headY + 4);
    ctx.lineTo(-12, headY - 2);
    ctx.lineTo(2, headY + 1);
    ctx.lineTo(14, headY - 2);
    ctx.lineTo(22, headY + 2);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'feathered_bangs_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 4);
    ctx.lineTo(-22, headY + 1);
    ctx.lineTo(-14, headY + 3);
    ctx.lineTo(-6, headY - 2);
    ctx.lineTo(2, headY + 2);
    ctx.lineTo(10, headY - 3);
    ctx.lineTo(18, headY + 2);
    ctx.lineTo(27, headY + 4);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'hime_sidelocks_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 6);
    ctx.lineTo(-20, headY + 6);
    ctx.lineTo(-20, headY - 2);
    ctx.lineTo(20, headY - 2);
    ctx.lineTo(20, headY + 6);
    ctx.lineTo(27, headY + 6);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'sailor_crescent_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 4);
    ctx.lineTo(-21, headY + 4);
    ctx.lineTo(-16, headY - 3);
    ctx.lineTo(-6, headY + 1);
    ctx.lineTo(0, headY - 5);
    ctx.lineTo(6, headY + 1);
    ctx.lineTo(16, headY - 3);
    ctx.lineTo(21, headY + 4);
    ctx.lineTo(27, headY + 4);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'spiky_bangs_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-28, headY + 1);
    ctx.lineTo(-22, headY - 2);
    ctx.lineTo(-15, headY + 3);
    ctx.lineTo(-8, headY - 4);
    ctx.lineTo(0, headY + 2);
    ctx.lineTo(8, headY - 4);
    ctx.lineTo(15, headY + 3);
    ctx.lineTo(22, headY - 2);
    ctx.lineTo(28, headY + 1);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'emo_fringe_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 4);
    ctx.lineTo(-16, headY + 5);
    ctx.lineTo(8, headY - 1);
    ctx.lineTo(22, headY - 4);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'messy_curly_short') {
    ctx.moveTo(-26, headY - 6);
    ctx.quadraticCurveTo(-20, headY + 4, -14, headY - 1);
    ctx.quadraticCurveTo(-8, headY + 3, -2, headY);
    ctx.quadraticCurveTo(4, headY + 4, 10, headY - 1);
    ctx.quadraticCurveTo(18, headY + 3, 26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'forehead_peek') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY + 1);
    ctx.lineTo(-22, headY - 2);
    ctx.lineTo(-10, headY - 5);
    ctx.lineTo(0, headY - 7);
    ctx.lineTo(10, headY - 5);
    ctx.lineTo(22, headY - 2);
    ctx.lineTo(27, headY + 1);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'buzz_fringe') {
    ctx.moveTo(-26, headY - 6);
    ctx.lineTo(-27, headY - 2);
    ctx.bezierCurveTo(-14, headY, 14, headY, 27, headY - 2);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else if (frontStyle === 'swept_back_bangs') {
    ctx.moveTo(-26, headY - 6);
    ctx.quadraticCurveTo(-18, headY - 14, -8, headY - 12);
    ctx.lineTo(0, headY - 10);
    ctx.quadraticCurveTo(8, headY - 12, 18, headY - 14);
    ctx.lineTo(26, headY - 6);
    ctx.bezierCurveTo(22, headY - 24, -22, headY - 24, -26, headY - 6);
  } else {
    // Classic straight soft bangs
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

  // Special Hair Clip Accessories
  if (frontStyle === 'anya_horns_bangs' || frontStyle === 'anya_buns') {
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 1.8;
    // Left pyramid
    ctx.beginPath();
    ctx.moveTo(-20, headY - 14);
    ctx.lineTo(-28, headY - 26);
    ctx.lineTo(-14, headY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right pyramid
    ctx.beginPath();
    ctx.moveTo(20, headY - 14);
    ctx.lineTo(28, headY - 26);
    ctx.lineTo(14, headY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (frontStyle === 'bocchi_shaggy' || frontStyle === 'bocchi_side') {
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-24, headY - 10, 7, 7);
    ctx.strokeRect(-24, headY - 10, 7, 7);
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(-21, headY - 7, 7, 7);
    ctx.strokeRect(-21, headY - 7, 7, 7);
  } else if (frontStyle === 'twin_antenna') {
    // Draw two ahoge antenna strands
    ctx.strokeStyle = hairCol;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, headY - 22);
    ctx.quadraticCurveTo(-12, headY - 40, -6, headY - 44);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, headY - 22);
    ctx.quadraticCurveTo(12, headY - 40, 6, headY - 44);
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1E1B18';
  } else {
    // Cute side hair ribbon
    ctx.fillStyle = chibi.ribbonColor || '#F472B6';
    ctx.beginPath();
    ctx.arc(-19, headY + 2, 4, 0, Math.PI * 2);
    ctx.arc(-14, headY + 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHeadwear(ctx: CanvasRenderingContext2D, chibi: ChibiConfig, headY: number, time: number = 0) {
  const hatType = chibi.hatType || 'none';
  if (hatType === 'none') return;

  const hatCol = chibi.hatColor || '#1E293B';

  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#1E1B18';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (hatType === 'cyber_cap') {
    // TACTICAL SNAPBACK CAP
    ctx.fillStyle = hatCol;
    ctx.beginPath();
    ctx.arc(0, headY - 14, 22, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cap Visor Bill - wide flat brim
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(10, headY - 14);
    ctx.lineTo(38, headY - 12);
    ctx.quadraticCurveTo(40, headY - 9, 36, headY - 6);
    ctx.lineTo(10, headY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Visor highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(12, headY - 13);
    ctx.lineTo(34, headY - 12);
    ctx.lineTo(32, headY - 10);
    ctx.lineTo(12, headY - 11);
    ctx.closePath();
    ctx.fill();

    // Cyber LED Logo
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-6, headY - 24, 12, 5);
  } else if (hatType === 'combat_helmet') {
    // SPEC-OPS BALLISTIC HELMET
    ctx.fillStyle = hatCol || '#334155';
    ctx.beginPath();
    ctx.arc(0, headY - 10, 24, Math.PI * 0.88, Math.PI * 2.12);
    ctx.lineTo(26, headY - 2);
    ctx.lineTo(-26, headY - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing Tactical HUD Visor
    ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
    ctx.shadowColor = '#06B6D4';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(-22, headY - 2, 44, 9, 3);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Headset Comms mic
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(22, headY - 6, 7, 10);
    ctx.fillRect(20, headY + 4, 3, 8);
  } else if (hatType === 'cat_beanie') {
    // KNIT BEANIE WITH CAT EARS
    ctx.fillStyle = hatCol || '#EC4899';
    ctx.beginPath();
    ctx.arc(0, headY - 12, 23, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineTo(24, headY - 6);
    ctx.lineTo(-24, headY - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Beanie Cat Ears
    ctx.beginPath();
    ctx.moveTo(-18, headY - 28);
    ctx.lineTo(-26, headY - 40);
    ctx.lineTo(-10, headY - 33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(18, headY - 28);
    ctx.lineTo(26, headY - 40);
    ctx.lineTo(10, headY - 33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Folded Cuff Band
    ctx.fillStyle = '#F472B6';
    ctx.beginPath();
    ctx.roundRect(-26, headY - 10, 52, 8, 3);
    ctx.fill();
    ctx.stroke();
  } else if (hatType === 'witch_hat') {
    // MAGICAL WITCH HAT
    ctx.fillStyle = hatCol || '#1E1B4B';
    ctx.beginPath();
    ctx.ellipse(0, headY - 12, 34, 10, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-18, headY - 14);
    ctx.quadraticCurveTo(-14, headY - 38, -6, headY - 48);
    ctx.quadraticCurveTo(8, headY - 56, 16, headY - 44);
    ctx.quadraticCurveTo(10, headY - 32, 18, headY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#A855F7';
    ctx.fillRect(-18, headY - 19, 36, 6);
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(-5, headY - 21, 10, 10);
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(-2, headY - 18, 4, 4);
  } else if (hatType === 'maid_headdress') {
    // FRILLY MAID HEADDRESS
    ctx.fillStyle = '#FFFFFF';
    for (let f = -5; f <= 5; f++) {
      ctx.beginPath();
      ctx.arc(f * 4.5, headY - 25 + Math.abs(f) * 1.5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(-24, headY - 24, 48, 6, 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chibi.ribbonColor || '#F43F5E';
    ctx.beginPath();
    ctx.arc(-22, headY - 18, 5, 0, Math.PI * 2);
    ctx.arc(22, headY - 18, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (hatType === 'beret') {
    // TACTICAL BERET
    ctx.fillStyle = hatCol || '#991B1B';
    ctx.beginPath();
    ctx.ellipse(4, headY - 18, 25, 12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(-6, headY - 18, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (hatType === 'bunny_hood') {
    // BUNNY EAR HOODIE HOOD
    ctx.fillStyle = hatCol || '#FDF2F8';
    ctx.beginPath();
    ctx.arc(0, headY - 8, 26, Math.PI * 0.85, Math.PI * 2.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const drawBunnyEar = (bx: number, dir: number) => {
      ctx.fillStyle = hatCol || '#FDF2F8';
      ctx.beginPath();
      ctx.ellipse(bx, headY + 2, 7, 18, dir * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#F472B6';
      ctx.beginPath();
      ctx.ellipse(bx, headY + 2, 4, 13, dir * 0.25, 0, Math.PI * 2);
      ctx.fill();
    };
    drawBunnyEar(-26, -1);
    drawBunnyEar(26, 1);
  } else if (hatType === 'cyber_visor') {
    // HOLOGRAPHIC EYE SCOUTER
    ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(-22, headY + 3);
    ctx.lineTo(24, headY + 3);
    ctx.lineTo(20, headY + 11);
    ctx.lineTo(-18, headY + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-26, headY + 2, 6, 7);
  } else if (hatType === 'straw_hat') {
    // STRAW HAT
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.ellipse(0, headY - 10, 36, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, headY - 14, 18, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-18, headY - 16, 36, 5);
  } else if (hatType === 'crown_hat') {
    // ROYAL MINI GOLD CROWN
    ctx.save();
    ctx.translate(6, headY - 26);
    ctx.rotate(0.2);

    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.arc(0, 0, 10, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#B45309';
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-6, -2);
    ctx.lineTo(0, -12);
    ctx.lineTo(6, -2);
    ctx.lineTo(12, -8);
    ctx.lineTo(12, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  } else if (hatType === 'police_cap') {
    // OFFICER PEAKED CAP
    ctx.fillStyle = hatCol || '#0F172A';
    ctx.beginPath();
    ctx.moveTo(-24, headY - 12);
    ctx.lineTo(-28, headY - 26);
    ctx.lineTo(28, headY - 26);
    ctx.lineTo(24, headY - 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Flat top crown
    ctx.fillStyle = hatCol || '#0F172A';
    ctx.beginPath();
    ctx.ellipse(0, headY - 26, 28, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(0, headY - 19, 5, 0, Math.PI * 2);
    ctx.fill();

    // Patent leather peaked visor - solid and flush
    ctx.fillStyle = '#0A0A0A';
    ctx.beginPath();
    ctx.moveTo(-24, headY - 12);
    ctx.lineTo(-28, headY - 10);
    ctx.quadraticCurveTo(-30, headY - 6, -24, headY - 4);
    ctx.lineTo(24, headY - 4);
    ctx.quadraticCurveTo(30, headY - 6, 28, headY - 10);
    ctx.lineTo(24, headY - 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Visor shine
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(-20, headY - 11);
    ctx.lineTo(20, headY - 11);
    ctx.lineTo(18, headY - 8);
    ctx.lineTo(-18, headY - 8);
    ctx.closePath();
    ctx.fill();

    // Gold chinstrap detail
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-22, headY - 11);
    ctx.lineTo(22, headY - 11);
    ctx.stroke();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.4;
  } else if (hatType === 'kitsune_mask') {
    // JAPANESE KITSUNE FOX MASK (Perched diagonally on side of head)
    ctx.save();
    ctx.translate(18, headY - 14);
    ctx.rotate(0.35);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fox Mask Ears
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(-14, -18);
    ctx.lineTo(-4, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(10, -6);
    ctx.lineTo(14, -18);
    ctx.lineTo(4, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crimson Paint Markings
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.quadraticCurveTo(-4, 4, 0, 8);
    ctx.moveTo(8, -2);
    ctx.quadraticCurveTo(4, 4, 0, 8);
    ctx.stroke();

    ctx.restore();
  } else if (hatType === 'chef_toque') {
    // TALL GOURMET CHEF HAT
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.rect(-16, headY - 18, 32, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-14, headY - 26, 10, 0, Math.PI * 2);
    ctx.arc(0, headY - 32, 12, 0, Math.PI * 2);
    ctx.arc(14, headY - 26, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (hatType === 'pirate_hat') {
    // PIRATE CAPTAIN TRICORN
    ctx.fillStyle = hatCol || '#0F172A';
    ctx.beginPath();
    ctx.moveTo(-28, headY - 10);
    ctx.lineTo(-20, headY - 30);
    ctx.lineTo(0, headY - 14);
    ctx.lineTo(20, headY - 30);
    ctx.lineTo(28, headY - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gold Skull Crest
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(0, headY - 20, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (hatType === 'propeller_beanie') {
    // MEME SPINNING PROPELLER BEANIE
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, headY - 12, 22, Math.PI, Math.PI * 1.5);
    ctx.lineTo(0, headY - 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.arc(0, headY - 12, 22, Math.PI * 1.5, Math.PI * 2);
    ctx.lineTo(0, headY - 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Spinning Propeller
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(-2, headY - 38, 4, 6);
    ctx.save();
    ctx.translate(0, headY - 38);
    ctx.rotate(time * 15);
    ctx.fillStyle = '#10B981';
    ctx.fillRect(-16, -2, 32, 4);
    ctx.restore();
  } else if (hatType === 'top_hat') {
    // VICTORIAN GENTLEMAN TOP HAT
    ctx.fillStyle = hatCol || '#0F172A';
    ctx.beginPath();
    ctx.ellipse(0, headY - 12, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(-16, headY - 36, 32, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-16, headY - 16, 32, 5);
  } else if (hatType === 'cowboy_hat') {
    // WILD WEST STETSON
    ctx.fillStyle = hatCol || '#78350F';
    ctx.beginPath();
    ctx.ellipse(0, headY - 10, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(-16, headY - 26, 32, 16, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-16, headY - 14, 32, 4);
  } else if (hatType === 'shark_hood') {
    // CUTE SHARK CHOMPING HOOD
    ctx.fillStyle = '#0284C7';
    ctx.beginPath();
    ctx.arc(0, headY - 8, 27, Math.PI * 0.8, Math.PI * 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shark Fin
    ctx.beginPath();
    ctx.moveTo(0, headY - 34);
    ctx.lineTo(8, headY - 48);
    ctx.lineTo(16, headY - 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sharp White Teeth
    ctx.fillStyle = '#FFFFFF';
    for (let t = -4; t <= 4; t++) {
      ctx.beginPath();
      ctx.moveTo(t * 5, headY - 14);
      ctx.lineTo(t * 5 + 2.5, headY - 8);
      ctx.lineTo(t * 5 + 5, headY - 14);
      ctx.closePath();
      ctx.fill();
    }
  } else if (hatType === 'nvg_goggles') {
    // TRIPLE NIGHT VISION GOGGLES
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(-22, headY - 20, 44, 8, 2);
    ctx.fill();
    ctx.stroke();

    // 3 Glowing Green Lenses
    [-12, 0, 12].forEach((lx) => {
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(lx, headY - 16, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#22C55E';
      ctx.shadowColor = '#22C55E';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(lx, headY - 16, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  } else if (hatType === 'flower_crown') {
    // BLOOMING FLOWER WREATH
    const flowers = ['#F43F5E', '#FDE047', '#EC4899', '#38BDF8', '#A855F7'];
    ctx.strokeStyle = '#15803D';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, headY - 14, 24, Math.PI * 0.9, Math.PI * 2.1);
    ctx.stroke();

    flowers.forEach((fCol, i) => {
      const ang = Math.PI * 0.95 + (i * Math.PI * 1.1) / 4;
      const fx = Math.cos(ang) * 24;
      const fy = Math.sin(ang) * 24 + headY - 14;
      ctx.fillStyle = fCol;
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (hatType === 'bandana') {
    // Rebel bandana tied around head, dark colored with knot on side
    ctx.fillStyle = hatCol || '#0F172A';
    ctx.beginPath();
    ctx.arc(0, headY - 14, 25, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, headY - 14, 25, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // knot
    ctx.beginPath();
    ctx.arc(22, headY - 14, 5, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(25, headY - 12);
    ctx.lineTo(35, headY - 5);
    ctx.lineTo(30, headY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hatType === 'headphones') {
    // Over-ear headphones with cushions and headband
    ctx.strokeStyle = hatCol || '#1E293B';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, headY - 14, 26, Math.PI, 0);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1E1B18';
    
    // cushions
    [-26, 26].forEach(x => {
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.ellipse(x, headY - 8, 5, 12, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.ellipse(x, headY - 8, 2, 8, 0, 0, Math.PI*2);
        ctx.fill();
    });
  } else if (hatType === 'tiara') {
    // Elegant princess tiara with gems
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, headY - 14, 22, Math.PI*1.1, Math.PI*1.9);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1E1B18';
    
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.moveTo(-10, headY - 18);
    ctx.lineTo(-5, headY - 26);
    ctx.lineTo(0, headY - 16);
    ctx.lineTo(5, headY - 26);
    ctx.lineTo(10, headY - 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // gem
    ctx.fillStyle = '#EC4899';
    ctx.beginPath();
    ctx.arc(0, headY - 20, 3, 0, Math.PI*2);
    ctx.fill();
  } else if (hatType === 'aviator_goggles') {
    // Steampunk goggles pushed up on forehead
    ctx.fillStyle = '#78350F';
    ctx.beginPath();
    ctx.rect(-24, headY - 22, 48, 6);
    ctx.fill();
    ctx.stroke();
    
    // lenses
    [-10, 10].forEach(x => {
        ctx.fillStyle = '#B45309';
        ctx.beginPath();
        ctx.arc(x, headY - 22, 10, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(x, headY - 22, 7, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(x-2, headY - 24, 2, 0, Math.PI*2);
        ctx.fill();
    });
  } else if (hatType === 'nurse_cap') {
    // Classic white nurse cap with red cross
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-16, headY - 16);
    ctx.lineTo(-20, headY - 30);
    ctx.lineTo(20, headY - 30);
    ctx.lineTo(16, headY - 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // cross
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-2, headY - 27, 4, 8);
    ctx.fillRect(-4, headY - 25, 8, 4);
  } else if (hatType === 'military_cap') {
    // Garrison/side cap (envelope cap)
    ctx.fillStyle = hatCol || '#166534';
    ctx.beginPath();
    ctx.moveTo(-20, headY - 14);
    ctx.lineTo(-15, headY - 28);
    ctx.lineTo(0, headY - 22);
    ctx.lineTo(15, headY - 28);
    ctx.lineTo(20, headY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(-10, headY - 20, 3, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFloatingHalo(ctx: CanvasRenderingContext2D, chibi: ChibiConfig, time: number) {
  const haloType = chibi.haloType || 'star';
  if (haloType === 'none') return;

  const haloCol = chibi.haloColor || '#E65D8C';
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
  } else if (haloType === 'floral') {
    // Sakura Blossom Petal Ring Halo
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    for (let p = 0; p < 5; p++) {
      const ang = (p * Math.PI * 2) / 5 + time * 2;
      const px = Math.cos(ang) * 16;
      const py = Math.sin(ang) * 6;
      ctx.beginPath();
      ctx.ellipse(px, py, 3.5, 2, ang, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (haloType === 'shuriken') {
    // 4-Bladed Cyber Shuriken Halo
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + time * 3;
      const x1 = Math.cos(angle) * 16;
      const y1 = Math.sin(angle) * 6;
      const x2 = Math.cos(angle + 0.5) * 5;
      const y2 = Math.sin(angle + 0.5) * 2;
      if (i === 0) ctx.moveTo(x1, y1);
      else ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (haloType === 'diamond') {
    // FLOATING DIAMOND SHAPE
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Inner facet
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.stroke();
  } else if (haloType === 'infinity') {
    // INFINITY SYMBOL
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(8, -10, 18, -10, 18, 0);
    ctx.bezierCurveTo(18, 10, 8, 10, 0, 0);
    ctx.bezierCurveTo(-8, -10, -18, -10, -18, 0);
    ctx.bezierCurveTo(-18, 10, -8, 10, 0, 0);
    ctx.stroke();
    ctx.fill();
  } else if (haloType === 'saturn_rings') {
    // SATURN-LIKE TILTED RINGS
    // Planet core
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    // Tilted ring 1
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    // Tilted ring 2
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 4, -0.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (haloType === 'music_notes') {
    // ORBITING MUSIC NOTES
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let n = 0; n < 3; n++) {
      const ang = (n * Math.PI * 2) / 3 + time * 2.5;
      const nx = Math.cos(ang) * 16;
      const ny = Math.sin(ang) * 5;
      ctx.fillStyle = haloCol;
      // Note head
      ctx.beginPath();
      ctx.ellipse(nx, ny, 3, 2, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Note stem
      ctx.strokeStyle = haloCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nx + 2, ny);
      ctx.lineTo(nx + 2, ny - 6);
      ctx.stroke();
    }
  } else if (haloType === 'snowflake') {
    // CRYSTALLINE SNOWFLAKE (Cirno)
    const spokes = 6;
    for (let s = 0; s < spokes; s++) {
      const ang = (s * Math.PI * 2) / spokes + time * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const ex = Math.cos(ang) * 14;
      const ey = Math.sin(ang) * 5;
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // Branch crystals
      const mx = Math.cos(ang) * 8;
      const my = Math.sin(ang) * 3;
      const bAng1 = ang + 0.6;
      const bAng2 = ang - 0.6;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(bAng1) * 5, my + Math.sin(bAng1) * 2);
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(bAng2) * 5, my + Math.sin(bAng2) * 2);
      ctx.stroke();
    }
    // Center crystal
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * High-performance vector preview thumbnail drawing functions
 * Render crisp miniature previews for style selection squares in Character Creator
 */
export function drawFrontHairThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frontHairStyle: ChibiConfig['frontHairStyle'],
  hairColor: string,
  skinTone: string = '#FFE4D6',
  ribbonColor: string = '#F472B6'
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2 + 10);
  const scale = width / 72;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    frontHairStyle,
    backHairStyle: 'none_short',
    hairStyle: 'bob',
    hairColor,
    skinTone,
    ribbonColor,
    earType: 'none',
    earColor: '#2B272C',
    haloType: 'none',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'happy',
  };

  drawHeadAndFace(ctx, mockChibi, 0, false);
  ctx.restore();
}

export function drawBackHairThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backHairStyle: ChibiConfig['backHairStyle'],
  hairColor: string,
  skinTone: string = '#FFE4D6',
  ribbonColor: string = '#F472B6'
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2 + 10);
  const scale = width / 72;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    frontHairStyle: 'none',
    backHairStyle,
    hairStyle: 'bob',
    hairColor,
    skinTone,
    ribbonColor,
    earType: 'none',
    earColor: '#2B272C',
    haloType: 'none',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'happy',
  };

  drawBackHair(ctx, mockChibi);
  drawHeadAndFace(ctx, mockChibi, 0, false);
  ctx.restore();
}

export function drawHatThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hatType: ChibiConfig['hatType'],
  hatColor: string = '#1E293B'
) {
  ctx.clearRect(0, 0, width, height);
  if (hatType === 'none') {
    ctx.save();
    ctx.fillStyle = '#71717A';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NONE', width / 2, height / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(width / 2, height / 2 + 15);
  const scale = width / 70;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    frontHairStyle: 'straight_bangs',
    backHairStyle: 'bob',
    hairColor: '#475569',
    hatType,
    hatColor,
    skinTone: '#FFE4D6',
    ribbonColor: '#F43F5E',
    earType: 'none',
    earColor: '#2B272C',
    haloType: 'none',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'happy',
  };

  drawHeadAndFace(ctx, mockChibi, 0, false);
  ctx.restore();
}

export function drawWingThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  wingType: ChibiConfig['wingType'],
  wingColor: string = '#FFFFFF'
) {
  ctx.clearRect(0, 0, width, height);
  if (wingType === 'none') {
    ctx.save();
    ctx.fillStyle = '#71717A';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NONE', width / 2, height / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(width / 2, height / 2 + 6);
  const scale = width / 74;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    wingType,
    wingColor,
    frontHairStyle: 'none',
    backHairStyle: 'none_short',
    hairColor: '#F6D268',
    skinTone: '#FFE4D6',
    ribbonColor: '#F472B6',
    earType: 'none',
    earColor: '#2B272C',
    haloType: 'none',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'happy',
  };

  drawWings(ctx, mockChibi, 1.0);
  ctx.restore();
}

export function drawHairThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hairStyle: ChibiConfig['hairStyle'],
  hairColor: string,
  skinTone: string = '#FFE4D6',
  ribbonColor: string = '#F472B6'
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2 + 10);
  const scale = width / 72;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    hairStyle,
    hairColor,
    skinTone,
    ribbonColor,
    earType: 'none',
    earColor: '#2B272C',
    haloType: 'none',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'happy',
  };

  drawBackHair(ctx, mockChibi);
  drawHeadAndFace(ctx, mockChibi, 0, false);
  ctx.restore();
}

export function drawFaceThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  eyeType: ChibiConfig['eyeType'],
  eyeColor: string = '#38BDF8',
  skinTone: string = '#FFE4D6'
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2 + 17);
  const scale = width / 54;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    hairStyle: 'bob',
    hairColor: 'transparent',
    skinTone,
    ribbonColor: '#F472B6',
    earType: 'none',
    earColor: '#2B272C',
    haloType: 'none',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType,
    eyeColor,
  };

  // Draw cute face base
  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#1A1816';
  ctx.fillStyle = skinTone;
  const headY = -24;
  ctx.beginPath();
  ctx.moveTo(-25, headY + 2);
  ctx.bezierCurveTo(-28, headY + 16, -14, headY + 24, 0, headY + 24);
  ctx.bezierCurveTo(14, headY + 24, 28, headY + 16, 25, headY + 2);
  ctx.bezierCurveTo(28, headY - 18, -28, headY - 18, -25, headY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cheeks
  ctx.fillStyle = 'rgba(244, 114, 182, 0.48)';
  ctx.beginPath();
  ctx.ellipse(-15, headY + 11, 4.5, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(15, headY + 11, 4.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw the actual eyes & expression
  drawHeadAndFace(ctx, mockChibi, 0, false);
  ctx.restore();
  ctx.restore();
}

export function drawOutfitThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  outfitType: ChibiConfig['outfitType'],
  coatColor: string = '#FFFFFF',
  accentColor: string = '#E65D8C',
  skirtColor: string = '#3A3640',
  skinTone: string = '#FFE4D6'
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2 + 3);
  const scale = width / 52;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    hairStyle: 'bob',
    hairColor: '#F6D268',
    skinTone,
    ribbonColor: accentColor,
    earType: 'none',
    earColor: '#2B272C',
    haloType: 'none',
    haloColor: '#E65D8C',
    outfitType,
    coatColor,
    accentColor,
    skirtColor,
    eyeType: 'happy',
  };

  drawBody(ctx, mockChibi, false, 0, false);
  ctx.restore();
}

export function drawEarThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  earType: ChibiConfig['earType'],
  earColor: string = '#2B272C',
  innerEarColor: string = '#F472B6',
  skinTone: string = '#FFE4D6'
) {
  ctx.clearRect(0, 0, width, height);
  if (earType === 'none') {
    ctx.save();
    ctx.fillStyle = '#71717A';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NONE', width / 2, height / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(width / 2, height / 2 + 25);
  const scale = width / 62;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    hairStyle: 'bob',
    hairColor: '#F6D268',
    skinTone,
    ribbonColor: '#F472B6',
    earType,
    earColor,
    innerEarColor,
    haloType: 'none',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'happy',
  };

  drawHeadAndFace(ctx, mockChibi, 0, false);
  ctx.restore();
}

export function drawHaloThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  haloType: ChibiConfig['haloType'],
  haloColor: string = '#E65D8C'
) {
  ctx.clearRect(0, 0, width, height);
  if (haloType === 'none') {
    ctx.save();
    ctx.fillStyle = '#71717A';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NONE', width / 2, height / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(width / 2, height / 2);
  const scale = width / 44;
  ctx.scale(scale, scale);

  const mockChibi: ChibiConfig = {
    hairStyle: 'bob',
    hairColor: '#F6D268',
    skinTone: '#FFE4D6',
    ribbonColor: '#F472B6',
    earType: 'none',
    earColor: '#2B272C',
    haloType,
    haloColor,
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'happy',
  };

  // Render floating halo centered
  ctx.save();
  ctx.translate(0, 66);
  drawFloatingHalo(ctx, mockChibi, 1.0);
  ctx.restore();

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
  const gunType = weapon?.gunType || (weapon?.id?.includes('katana') ? 'katana' : characterClass === 'swordmaster' ? 'katana' : 'pistol');

  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#0F172A';
  ctx.fillStyle = player.chibi?.skinTone || '#FFE4D6';

  const isSword = gunType === 'katana';
  const isSledge = gunType === 'sledgehammer';
  const isKnives = gunType === 'throwing_knives';
  const isScythe = gunType === 'scythe';
  const isGreatsword = gunType === 'greatsword';
  const isStaff = gunType === 'staff';
  const isWand = gunType === 'wand';
  const isGrimoire = gunType === 'grimoire';
  const isTotem = gunType === 'totem';
  const isAttacking = attackTimer > 0;
  const swingDur = isGreatsword ? 0.65 : isScythe ? 0.48 : 0.28;
  const attackProgress = isAttacking ? Math.max(0, Math.min(1, 1 - attackTimer / swingDur)) : 0;

  // 1. MELEE WEAPONS: KATANA & SLEDGEHAMMER
  if (isSword) {
    ctx.save();
    ctx.translate(10, 0);
    const swingAngle = isAttacking ? Math.PI * (attackProgress * 1.6 - 0.5) : 0.25;
    ctx.rotate(swingAngle);

    // Katana Blade (Polished Steel with blue hamon wave)
    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(36, -1);
    ctx.quadraticCurveTo(42, 0, 36, 3);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hamon temper wave line
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(34, 1);
    ctx.stroke();

    // Golden Tsuba Guard
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-2, -5, 4, 10);
    ctx.strokeRect(-2, -5, 4, 10);

    // Wrapped Tsuka Handle
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-10, -2.5, 8, 5);
    ctx.strokeRect(-10, -2.5, 8, 5);

    // Slash Arc effect on attack
    if (isAttacking) {
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 44, -Math.PI * 0.3, Math.PI * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  } else if (isSledge) {
    ctx.save();
    ctx.translate(8, 0);
    const slamAngle = isAttacking ? Math.PI * (attackProgress * 1.4 - 0.4) : -0.2;
    ctx.rotate(slamAngle);

    // Steel handle
    ctx.fillStyle = '#64748B';
    ctx.fillRect(-12, -2, 34, 4);
    ctx.strokeRect(-12, -2, 34, 4);

    // Massive Welder Head
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(20, -12, 16, 24);
    ctx.strokeRect(20, -12, 16, 24);

    // Hazard Stripes / Welder Molten Plate
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(24, -8, 8, 16);
    ctx.restore();
  } else if (isKnives) {
    ctx.save();
    ctx.translate(10, 0);
    const toss = isAttacking ? -0.5 + attackProgress * 0.8 : 0.15;
    ctx.rotate(toss);
    ctx.fillStyle = '#CBD5E1';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(-4 + i * 5, -i * 3);
      ctx.rotate(-0.2 * i);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-4, -2.5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  } else if (isScythe) {
    ctx.save();
    ctx.translate(8, 2);
    const sweep = isAttacking ? Math.PI * (attackProgress * 1.7 - 0.55) : -0.55;
    ctx.rotate(sweep);
    ctx.fillStyle = '#44403C';
    ctx.fillRect(-8, -2, 46, 4);
    ctx.strokeRect(-8, -2, 46, 4);
    ctx.fillStyle = '#A3E635';
    ctx.strokeStyle = '#365314';
    ctx.beginPath();
    ctx.moveTo(34, -2);
    ctx.quadraticCurveTo(58, -28, 28, -22);
    ctx.quadraticCurveTo(48, -8, 34, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (isAttacking) {
      ctx.strokeStyle = '#84CC16';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#84CC16';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(10, 0, 52, -Math.PI * 0.6, Math.PI * 0.15);
      ctx.stroke();
    }
    ctx.restore();
  } else if (isGreatsword) {
    ctx.save();
    ctx.translate(6, 4);
    const slam = isAttacking ? Math.PI * (attackProgress * 1.5 - 0.7) : -0.85;
    ctx.rotate(slam);
    ctx.fillStyle = '#94A3B8';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.lineTo(72, -2);
    ctx.lineTo(76, 0);
    ctx.lineTo(72, 3);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-10, -5, 16, 11);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(2, -6, 4, 13);
    if (isAttacking) {
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#E2E8F0';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(8, 0, 70, -0.2, 0.9);
      ctx.stroke();
    }
    ctx.restore();
  } else if (isStaff || isWand || isGrimoire || isTotem) {
    ctx.save();
    ctx.translate(10, 0);
    let aimRot = 0;
    if (player.aimAngle !== undefined) {
      if (player.facing === 'left') {
        let rel = Math.PI - player.aimAngle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        aimRot = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, rel));
      } else {
        let rel = player.aimAngle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        aimRot = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, rel));
      }
    }
    ctx.rotate(aimRot);
    if (isStaff) {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-4, -2, 36, 4);
      ctx.fillStyle = '#F97316';
      ctx.shadowColor = '#F97316';
      ctx.shadowBlur = isAttacking ? 16 : 8;
      ctx.beginPath();
      ctx.arc(34, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (isWand) {
      ctx.fillStyle = '#C084FC';
      ctx.fillRect(-2, -1.5, 22, 3);
      ctx.fillStyle = '#FDE047';
      ctx.shadowColor = '#FDE047';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(22, 0, 4 + (isAttacking ? 2 : 0), 0, Math.PI * 2);
      ctx.fill();
    } else if (isGrimoire) {
      ctx.fillStyle = '#4C1D95';
      ctx.fillRect(4, -10, 16, 20);
      ctx.strokeStyle = '#F59E0B';
      ctx.strokeRect(4, -10, 16, 20);
      ctx.fillStyle = '#F97316';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText('*', 10, 2);
    } else {
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.moveTo(8, 8);
      ctx.lineTo(18, -12);
      ctx.lineTo(28, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(18, -2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // 2. FIREARMS: PISTOL, REVOLVER, MAC10, AK47, SHOTGUN, CHEYTAC
    ctx.save();
    ctx.translate(12, -1);

    // Dynamic Aim Direction Rotation (Points weapon towards mouse cursor!)
    let aimRot = 0;
    if (player.aimAngle !== undefined) {
      if (player.facing === 'left') {
        let rel = Math.PI - player.aimAngle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        aimRot = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, rel));
      } else {
        let rel = player.aimAngle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        aimRot = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, rel));
      }
    }

    // Inspect stance vs Aim stance vs Reload stance
    if (player.isInspectingWeapon) {
      aimRot = -0.32 + Math.sin(time * 2.8) * 0.06;
    } else if (player.isReloading) {
      aimRot = 0.35 + Math.sin(time * 12) * 0.08;
    }

    // Dynamic Recoil angle and slide kick
    const recoil = isAttacking ? -0.32 * Math.sin(attackProgress * Math.PI) : 0;
    ctx.rotate(aimRot + recoil);

    const reloadDur =
      gunType === 'ak47' ? 1.3 :
      gunType === 'mac10' ? 1.05 :
      gunType === 'cheytac' ? 1.8 :
      gunType === 'pistol' ? 0.85 : 1.0;
    const reloadProgress = player.isReloading
      ? Math.max(0, Math.min(1, 1 - (player.reloadTimer ?? 0) / reloadDur))
      : 0;
    let magOffY = 0;
    let magOffR = 0;
    let magAlpha = 1;
    if (player.isReloading) {
      if (reloadProgress < 0.4) {
        const p1 = reloadProgress / 0.4;
        magOffY = p1 * 16;
        magOffR = p1 * 0.45;
        magAlpha = Math.max(0, 1 - p1 * 1.4);
      } else if (reloadProgress < 0.8) {
        const p2 = (reloadProgress - 0.4) / 0.4;
        magOffY = (1 - p2) * 14;
        magOffR = 0;
        magAlpha = 1;
      }
    }

    if (gunType === 'cheytac') {
      // ==========================================
      // CHEYTAC M200 INTERVENTION (.408 SNIPER)
      // ==========================================
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(-18, -3.5, 12, 8);
      ctx.strokeRect(-18, -3.5, 12, 8);

      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-8, 2.5, 4.5, 8);
      ctx.strokeRect(-8, 2.5, 4.5, 8);

      ctx.fillStyle = '#334155';
      ctx.fillRect(-8, -4.8, 20, 8);
      ctx.strokeRect(-8, -4.8, 20, 8);

      ctx.fillStyle = '#475569';
      ctx.fillRect(-4, -6.2, 18, 1.6);
      ctx.fillStyle = '#1E293B';
      for (let i = 0; i < 6; i++) ctx.fillRect(-3 + i * 3, -6.2, 1.4, 1.6);

      ctx.fillStyle = '#334155';
      ctx.fillRect(12, -3.2, 24, 3.6);
      ctx.strokeRect(12, -3.2, 24, 3.6);

      ctx.fillStyle = '#1E293B';
      ctx.fillRect(36, -5, 6, 7.2);
      ctx.strokeRect(36, -5, 6, 7.2);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(37.5, -5, 1.2, 3);
      ctx.fillRect(39.8, -5, 1.2, 3);

      if (!player.weaponAttachments?.optic) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(4, -6.2, 2.2, 2);
        ctx.fillRect(14, -6.2, 2.2, 2);
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(2, -11, 16, 5);
        ctx.strokeRect(2, -11, 16, 5);
        ctx.fillStyle = '#38BDF8';
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 6;
        ctx.fillRect(18, -11, 2, 5);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#334155';
        ctx.fillRect(8, -12.4, 4, 1.6);
      }

      if (!player.weaponAttachments?.underbarrel) {
        ctx.fillStyle = '#64748B';
        ctx.fillRect(20, 1.2, 8, 1.6);
        ctx.fillRect(20, 2.8, 1.6, 5);
        ctx.fillRect(26.4, 2.8, 1.6, 5);
      }

      if (!player.weaponAttachments?.magazine) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0.5, 3.2, 5, 7);
        ctx.strokeRect(0.5, 3.2, 5, 7);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(0.3, 9.4, 5.4, 1.4);
      }

      if (isAttacking && attackProgress < 0.4) {
        ctx.fillStyle = '#38BDF8';
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(46, -1.5, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (gunType === 'ak47') {
      // ==========================================
      // AK-47 KALASHNIKOV (7.62MM ASSAULT RIFLE)
      // ==========================================
      ctx.fillStyle = '#B45309';
      ctx.fillRect(-16, -3, 12, 7);
      ctx.strokeRect(-16, -3, 12, 7);

      ctx.fillStyle = '#334155';
      ctx.fillRect(-5, -4.8, 16, 7.4);
      ctx.strokeRect(-5, -4.8, 16, 7.4);

      ctx.fillStyle = '#475569';
      ctx.fillRect(-3, -6, 12, 1.5);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(-2, -7.4, 3.5, 2);

      ctx.fillStyle = '#B45309';
      ctx.fillRect(10, -4, 11, 6.4);
      ctx.strokeRect(10, -4, 11, 6.4);

      ctx.fillStyle = '#1E293B';
      ctx.fillRect(10, -6.2, 13, 2);
      ctx.fillRect(21, -3, 12, 3.2);
      ctx.fillRect(31, -7.2, 2, 4.4);
      ctx.fillRect(33, -3.6, 3.2, 4);

      ctx.fillStyle = '#78350F';
      ctx.fillRect(-2, 2.4, 4.2, 7.2);
      ctx.strokeRect(-2, 2.4, 4.2, 7.2);

      if (!player.weaponAttachments?.magazine) {
        ctx.save();
        ctx.translate(4, 2.6 + magOffY);
        ctx.rotate(magOffR);
        ctx.globalAlpha = magAlpha;
        drawAkBananaMag(ctx, reloadProgress > 0.4 && reloadProgress < 0.8);
        ctx.restore();
      }

      if (isAttacking && attackProgress < 0.4) {
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(38, -1.5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (gunType === 'mac10') {
      // ==========================================
      // MAC-10 (MICRO SUBMACHINE GUN)
      // ==========================================
      ctx.fillStyle = '#18181B';
      ctx.fillRect(-3, -6, 20, 10);
      ctx.strokeRect(-3, -6, 20, 10);

      ctx.fillStyle = '#3F3F46';
      ctx.fillRect(5, -8, 6, 2.2);
      ctx.strokeRect(5, -8, 6, 2.2);

      ctx.fillStyle = '#27272A';
      ctx.fillRect(17, -3, 6, 4.2);
      ctx.strokeRect(17, -3, 6, 4.2);

      ctx.fillStyle = '#09090B';
      ctx.fillRect(4, -3.5, 6, 3.5);

      if (!player.weaponAttachments?.magazine) {
        ctx.save();
        ctx.translate(0, magOffY);
        ctx.rotate(magOffR);
        ctx.globalAlpha = magAlpha;
        ctx.fillStyle = reloadProgress > 0.4 && reloadProgress < 0.8 ? '#1E293B' : '#3F3F46';
        ctx.fillRect(4, 4, 5, 10);
        ctx.strokeRect(4, 4, 5, 10);
        ctx.fillStyle = reloadProgress > 0.4 && reloadProgress < 0.8 ? '#22C55E' : '#F59E0B';
        ctx.fillRect(4, 13, 5, 1.6);
        ctx.restore();
      }

      if (!player.weaponAttachments?.underbarrel) {
        ctx.fillStyle = '#15803D';
        ctx.fillRect(12, 4, 2.4, 6);
      }

      if (isAttacking && attackProgress < 0.5) {
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.arc(25, -1, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (gunType === 'shotgun') {
      // ==========================================
      // SAWED-OFF TRENCH SHOTGUN (12 GAUGE)
      // ==========================================
      // Heavy Dual Barrels
      ctx.fillStyle = '#334155';
      ctx.fillRect(-2, -5, 22, 7);
      ctx.strokeRect(-2, -5, 22, 7);

      // Wooden Pump Fore-end (if no underbarrel)
      if (!player.weaponAttachments?.underbarrel) {
        ctx.fillStyle = '#92400E';
        ctx.fillRect(6, -1, 9, 6);
        ctx.strokeRect(6, -1, 9, 6);
      }

      // Pistol Grip
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-6, 0, 5, 8);

      if (isAttacking && attackProgress < 0.4) {
        ctx.fillStyle = '#EA580C';
        ctx.shadowColor = '#F97316';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(24, -1.5, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (gunType === 'revolver') {
      // ==========================================
      // .44 MAGNUM / PYTHON REVOLVER
      // ==========================================
      // Heavy Stainless Vented Barrel
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(2, -4, 18, 5);
      ctx.strokeRect(2, -4, 18, 5);
      // Top Rib
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(4, -6, 15, 2);

      // Fluted Steel Cylinder
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-2, -5.5, 8, 7.5);
      ctx.strokeRect(-2, -5.5, 8, 7.5);

      // Spur Hammer
      ctx.fillStyle = '#334155';
      ctx.fillRect(-5, -6, 3, 3);

      // Rosewood Grip
      ctx.fillStyle = '#9A3412';
      ctx.fillRect(-4, 2, 5, 8);
      ctx.strokeRect(-4, 2, 5, 8);

      if (isAttacking && attackProgress < 0.4) {
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(23, -1.5, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // ==========================================
      // M1911 / TACTICAL PISTOL
      // ==========================================
      // Gunmetal Slide
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(-2, -4.5, 17, 6.5);
      ctx.strokeRect(-2, -4.5, 17, 6.5);

      // Silver Barrel Bushing
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(15, -3, 2, 4);

      // Textured Grip & Trigger Guard
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 2, 5, 7);
      ctx.strokeRect(0, 2, 5, 7);

      if (isAttacking && attackProgress < 0.4) {
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.arc(19, -1.5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // DRAW EQUIPPED WEAPON ATTACHMENTS (Muzzle, Optic, Underbarrel, Magazine)
    if (player.weaponAttachments) {
      drawWeaponAttachments(ctx, gunType, player.weaponAttachments, isAttacking, attackProgress, time, magOffY, magOffR, magAlpha);
    }

    ctx.restore();
  }

  // 3. Cute Chibi Hands Gripping Weapon
  ctx.fillStyle = player.chibi?.skinTone || '#FFE4D6';
  ctx.strokeStyle = '#1E1B18';
  ctx.lineWidth = 2.2;

  if (player.isInspectingWeapon) {
    // Both hands supporting the gun in front during inspection
    ctx.beginPath();
    ctx.arc(6, 2, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(18, 1, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Rear Hand (Grip)
    ctx.beginPath();
    ctx.arc(4, 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Forward Hand (Supporting Fore-end)
    ctx.beginPath();
    ctx.arc(14, 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawAkBananaMag(ctx: CanvasRenderingContext2D, fresh = false) {
  ctx.fillStyle = fresh ? '#1E293B' : '#9A3412';
  ctx.strokeStyle = '#451A03';
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.quadraticCurveTo(-2, 6, 5, 11);
  ctx.lineTo(1.2, 11.6);
  ctx.quadraticCurveTo(-7, 6, -4.2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fresh ? '#22C55E' : '#F59E0B';
  ctx.fillRect(0.4, 10.4, 4.4, 1.5);
}

/**
 * Procedural Vector Weapon Attachments Renderer
 * Accurately mounts Muzzle, Optic, Underbarrel, and Magazine onto any firearm
 */
function drawWeaponAttachments(
  ctx: CanvasRenderingContext2D,
  gunType: string,
  attachments: NonNullable<Player['weaponAttachments']>,
  isAttacking: boolean,
  attackProgress: number,
  time: number,
  magOffY = 0,
  magOffR = 0,
  magAlpha = 1,
) {
  const pts = WEAPON_ATTACH_POINTS[gunType] || WEAPON_ATTACH_POINTS.pistol;

  // 1. OPTIC / SIGHT ATTACHMENT
  if (attachments.optic) {
    const optId = attachments.optic.id;
    const { x, y } = pts.optic;
    ctx.save();

    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 3, y - 2, 2.2, 2.2);
    ctx.fillRect(x + 1.5, y - 2, 2.2, 2.2);

    if (optId === 'optic_holo') {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(x - 4, y - 2, 9, 2);
      ctx.fillRect(x - 3, y - 7.2, 7, 5.4);
      ctx.strokeRect(x - 3, y - 7.2, 7, 5.4);

      ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';
      ctx.fillRect(x - 1.5, y - 6.2, 4.5, 4);

      ctx.fillStyle = '#22D3EE';
      ctx.shadowColor = '#06B6D4';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(x + 0.75, y - 4.2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (optId === 'optic_acog') {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(x - 5, y - 6.8, 12, 5);
      ctx.strokeRect(x - 5, y - 6.8, 12, 5);

      ctx.fillStyle = '#0F172A';
      ctx.fillRect(x + 6, y - 7.6, 3, 6.4);
      ctx.strokeRect(x + 6, y - 7.6, 3, 6.4);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(x, y - 8.4, 2.5, 1.8);

      ctx.fillStyle = '#38BDF8';
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 6;
      ctx.fillRect(x + 8, y - 6.8, 1.5, 5);
      ctx.shadowBlur = 0;
    } else if (optId === 'optic_thermal') {
      ctx.fillStyle = '#18181B';
      ctx.fillRect(x - 4, y - 7.4, 11, 5.6);
      ctx.strokeRect(x - 4, y - 7.4, 11, 5.6);

      ctx.fillStyle = '#F59E0B';
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 7;
      ctx.fillRect(x + 6, y - 6.6, 2, 4.4);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#10B981';
      ctx.fillRect(x - 2.5, y - 6.8, 1.5, 1.5);
    }
    ctx.restore();
  }

  // 2. MUZZLE DEVICE ATTACHMENT
  if (attachments.muzzle) {
    const muzId = attachments.muzzle.id;
    const { x, y } = pts.muzzle;
    ctx.save();

    if (muzId === 'muzzle_suppressor') {
      // Ghost Silencer (Long sleek cylinder)
      ctx.fillStyle = '#18181B';
      ctx.fillRect(x, y - 3, 12, 6);
      ctx.strokeRect(x, y - 3, 12, 6);

      // Fluted knurling rings
      ctx.fillStyle = '#3F3F46';
      ctx.fillRect(x + 2, y - 3, 1.5, 6);
      ctx.fillRect(x + 8, y - 3, 1.5, 6);
      // Bore opening
      ctx.fillStyle = '#09090B';
      ctx.fillRect(x + 11, y - 1.5, 1.5, 3);
    } else if (muzId === 'muzzle_compensator') {
      // Heavy Compensator (Vented block)
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, y - 3.5, 7, 7);
      ctx.strokeRect(x, y - 3.5, 7, 7);

      // Dual top vents
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(x + 1.5, y - 3.5, 1.5, 3);
      ctx.fillRect(x + 4, y - 3.5, 1.5, 3);
    } else if (muzId === 'muzzle_brake') {
      // Molten Muzzle Brake (Spiked chambers & glow)
      ctx.fillStyle = '#334155';
      ctx.fillRect(x, y - 3.5, 8, 7);
      ctx.strokeRect(x, y - 3.5, 8, 7);

      // Glowing thermal chambers
      ctx.fillStyle = '#EA580C';
      ctx.shadowColor = '#F97316';
      ctx.shadowBlur = 6;
      ctx.fillRect(x + 1.5, y - 2.5, 2, 5);
      ctx.fillRect(x + 4.5, y - 2.5, 2, 5);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // 3. UNDERBARREL ATTACHMENT
  if (attachments.underbarrel) {
    const undId = attachments.underbarrel.id;
    const { x, y } = pts.underbarrel;
    ctx.save();

    if (undId === 'under_grip') {
      // Angled Foregrip
      ctx.fillStyle = '#18181B';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x + 4, y + 7);
      ctx.lineTo(x, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Grip friction lines
      ctx.fillStyle = '#3F3F46';
      ctx.fillRect(x + 2, y + 2, 2.5, 3);
    } else if (undId === 'under_laser') {
      // Targeting Laser Pointer
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(x - 2, y, 7, 4);
      ctx.strokeRect(x - 2, y, 7, 4);

      // Crimson Laser Diode & emitter glow
      ctx.fillStyle = '#EF4444';
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 6;
      ctx.fillRect(x + 4.5, y + 1, 1.5, 2);
      ctx.beginPath();
      ctx.arc(x + 6.5, y + 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (undId === 'under_bipod') {
      // Heavy Bipod Mount
      ctx.fillStyle = '#64748B';
      ctx.fillRect(x - 1, y, 8, 2);
      ctx.fillRect(x + 5, y + 2, 2, 5);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(x + 4, y + 6, 4, 2); // foot
    }
    ctx.restore();
  }

  // 4. MAGAZINE ATTACHMENT
  if (attachments.magazine) {
    const magId = attachments.magazine.id;
    const { x, y } = pts.magazine;
    ctx.save();
    ctx.translate(0, magOffY);
    ctx.rotate(magOffR);
    ctx.globalAlpha *= magAlpha;

    if (gunType === 'ak47' && magId !== 'mag_drum') {
      ctx.translate(x, y);
      if (magId === 'mag_extended') {
        ctx.scale(1.08, 1.22);
      } else {
        ctx.scale(1, 0.88);
      }
      drawAkBananaMag(ctx, magId === 'mag_speed');
      if (magId === 'mag_speed') {
        ctx.strokeStyle = '#06B6D4';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(2.2, 12.4, 2.2, 0, Math.PI);
        ctx.stroke();
      }
    } else if (magId === 'mag_extended') {
      const h = gunType === 'mac10' ? 12 : gunType === 'cheytac' ? 9 : 10;
      ctx.fillStyle = '#18181B';
      ctx.fillRect(x - 2.2, y, 5, h);
      ctx.strokeRect(x - 2.2, y, 5, h);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(x - 2.6, y + h - 1.4, 5.8, 1.6);
    } else if (magId === 'mag_speed') {
      const h = gunType === 'mac10' ? 9 : 6.5;
      ctx.fillStyle = '#27272A';
      ctx.fillRect(x - 2.2, y, 5, h);
      ctx.strokeRect(x - 2.2, y, 5, h);
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.4;
      ctx.shadowColor = '#06B6D4';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(x + 0.3, y + h + 1.4, 2.3, 0, Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (magId === 'mag_drum') {
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 5.2, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 5.2, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(x + 3, y + 4.2, 2, 2.2);
    }
    ctx.restore();
  }
}

function drawVehicleUnder(
  ctx: CanvasRenderingContext2D,
  vehicleId: string,
  time: number,
  facing: 'left' | 'right',
  jumpOffsetY: number,
  player?: Player
) {
  ctx.save();
  ctx.translate(0, 14 + jumpOffsetY);

  const trick = player?.skateTrick;
  const dur = player?.skateTrickDuration || 0.5;
  const timer = player?.skateTrickTimer || 0;
  const p = trick && timer > 0 ? Math.max(0, Math.min(1, 1 - timer / dur)) : 1;
  const isBoard = vehicleId.includes('skateboard') || vehicleId.includes('hoverboard');

  if (isBoard && trick && timer > 0) {
    const pop = Math.sin(p * Math.PI) * 12;
    ctx.translate(0, -pop);
    if (trick === 'ollie') {
      ctx.rotate(-0.5 * Math.sin(p * Math.PI));
    } else if (trick === 'kickflip' || trick === 'mount_kickflip') {
      ctx.scale(1, Math.cos(p * Math.PI * 2));
      ctx.rotate(0.2 * Math.sin(p * Math.PI * 2));
    } else if (trick === 'treflip') {
      ctx.rotate(p * Math.PI * 2);
      ctx.scale(1, Math.cos(p * Math.PI * 2));
    }
  }

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1E1B18';

  if (isBoard) {
    // Neon Cyber Skateboard / Hoverboard
    const isHover = vehicleId.includes('hoverboard');
    ctx.fillStyle = isHover ? '#38BDF8' : '#EC4899';
    ctx.beginPath();
    ctx.roundRect(-28, isHover ? -2 : 0, 56, 8, 4);
    ctx.fill();
    ctx.stroke();

    // Deck graphic stripe
    ctx.fillStyle = isHover ? '#E0F2FE' : '#FDE047';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-18, isHover ? 1 : 3, 36, 2);
    ctx.globalAlpha = 1;

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

    if (trick && timer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = trick === 'treflip' ? '#C084FC' : trick === 'ollie' ? '#FDE047' : '#38BDF8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 22 + Math.sin(p * Math.PI) * 8, 10, p * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const rolling = player && (Math.abs(player.vx) > 40 || Math.abs(player.vy) > 40) && (player.jumpZ ?? 0) <= 2;
    if (rolling && !isHover) {
      ctx.fillStyle = 'rgba(253, 224, 71, 0.7)';
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        ctx.arc(-24 - s * 7 + Math.sin(time * 24 + s) * 3, 8 + Math.cos(time * 20 + s) * 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
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
  } else if (vehicleId === 'police_car') {
    ctx.save();
    if (facing === 'left') {
      ctx.scale(-1, 1);
    }
    drawPoliceCruiser(ctx, -50, -34, time);
    ctx.restore();
  } else if (vehicleId === 'punk_car') {
    ctx.save();
    if (facing === 'left') {
      ctx.scale(-1, 1);
    }
    drawCyberMuscleCar(ctx, -55, -36, time);
    ctx.restore();
  }

  ctx.restore();
}

function drawOverheadHUD(ctx: CanvasRenderingContext2D, player: Player, time: number) {
  const { name, stats, stamina, maxStamina, isSprinting, emote, chatMessage, chatTimer, bhopStreak, skateTrick, skateTrickTimer, coolness, coolStreak } = player;

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

  // 4. Reloading / Bhop Combo Badge Floating Above Name
  if (player.isReloading) {
    const reloadY = pillY - 18;
    const reloadText = `🔄 RELOADING...`;
    ctx.font = '900 10px system-ui, -apple-system, sans-serif';
    const reloadW = 92;

    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-reloadW / 2, reloadY - 8, reloadW, 16, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(reloadText, 0, reloadY);
  } else if (bhopStreak && bhopStreak >= 2) {
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
  } else if (coolStreak && coolStreak >= 2) {
    const coolY = pillY - 18;
    const coolText = `🔥 COOL x${coolStreak}  ${coolness ?? 0}`;
    ctx.font = '900 10px system-ui, -apple-system, sans-serif';
    const coolW = ctx.measureText(coolText).width + 12;
    ctx.fillStyle = coolStreak >= 4 ? '#A855F7' : '#EC4899';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-coolW / 2, coolY - 8, coolW, 16, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(coolText, 0, coolY);
  }

  if (skateTrick && skateTrickTimer && skateTrickTimer > 0) {
    const trickY = pillY - (bhopStreak >= 2 || (coolStreak && coolStreak >= 2) ? 36 : 18);
    const trickNames: Record<string, string> = {
      mount_kickflip: '🛹 KICKFLIP MOUNT',
      kickflip: '🛹 KICKFLIP',
      ollie: '🛹 OLLIE',
      treflip: '🌀 TRE FLIP',
    };
    const trickText = trickNames[skateTrick] || '🛹 TRICK';
    ctx.font = '900 11px system-ui, -apple-system, sans-serif';
    const trickW = ctx.measureText(trickText).width + 14;
    ctx.fillStyle = skateTrick === 'treflip' ? '#7C3AED' : skateTrick === 'ollie' ? '#CA8A04' : '#DB2777';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(-trickW / 2, trickY - 9, trickW, 18, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(trickText, 0, trickY);
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
  time: number,
  options: { bodyOnly?: boolean } = {},
) {
  const {
    isBoss,
    type,
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
  const jumpZ = monster.jumpZ || 0;

  ctx.save();

  // 1. Drop shadow (shrinks as monster jumps into the air)
  const shadowScale = Math.max(0.35, 1 - jumpZ / 90);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 16, (isBossBandit ? 34 : 20) * shadowScale, (isBossBandit ? 12 : 8) * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Elevate in-air when jumping
  if (jumpZ > 0) {
    ctx.translate(0, -jumpZ);
  }

  // Hit flash white/red outline effect
  const isFlashing = hitFlash > 0;
  const flashColor = '#FFFFFF';

  // Breathing / Aiming bob or Death Fall
  if (isDead) {
    const dProg = Math.min(1, monster.deathProgress ?? 1);
    const fallDir = monster.deathType === 'front' ? 1 : -1;
    ctx.translate(0, dProg * 14);
    ctx.rotate(dProg * Math.PI * 0.46 * fallDir);
    ctx.globalAlpha = Math.max(0, 1 - dProg * 0.85);
  } else {
    const bobY = Math.sin(time * 3 + (monster.spawnX || 0)) * 2;
    ctx.translate(0, bobY);
  }

  // Tactical combat slide / dash tilt
  if (monster.dodgeTimer && monster.dodgeTimer > 0) {
    const tiltDir = (monster.dashVx || 0) >= 0 ? 0.3 : -0.3;
    ctx.rotate(tiltDir);
  }

  // Rushdown Charge Aura & Forward Ram Stance
  if (monster.isCharging) {
    ctx.shadowColor = monster.faction === 'police' ? '#38BDF8' : '#EA580C';
    ctx.shadowBlur = 18;
    const chargeDir = (monster.chargeVx || 0) >= 0 ? 0.25 : -0.25;
    ctx.rotate(chargeDir);
  }

  // Pinned / Stunned Shake Effect
  if (monster.isPinned && (monster.pinTimer ?? 0) > 0) {
    ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  }

  // Juggernaut heavy boss scaling
  if (monster.isJuggernaut) {
    ctx.scale(1.3, 1.3);
  }

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
      facing: monster.facing || (monster.targetPlayerId ? 'left' : 'right'),
      state: isDead ? 'dead' : monster.state === 'chase' ? 'walk' : 'idle',
      stats: { level: 1, exp: 0, maxExp: 100, hp: monster.hp, maxHp: monster.maxHp, mp: 100, maxMp: 100, atk: monster.atk, def: monster.def, speed: monster.speed, critRate: 10, statPoints: 0, str: 5, agi: 5, int: 5, vit: 5 },
      stamina: 100,
      maxStamina: 100,
      isSprinting: false,
      jumpZ: monster.jumpZ || 0,
      jumpVz: monster.jumpVz || 0,
      isJumping: monster.isJumping || false,
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

    // Atlas generation must never capture mutable player HUD from the nested
    // chibi painter. The body-only boundary is transitive.
    drawChibiCharacter(ctx, enemyPlayer, time, isDead, { bodyOnly: options.bodyOnly });

    // Render Ballistic Riot Shield in Off-Hand
    if (monster.hasShield && !isDead) {
      ctx.save();
      const isLeft = (monster.facing || 'right') === 'left';
      ctx.translate(isLeft ? 12 : -12, 0);
      ctx.fillStyle = monster.faction === 'police' ? 'rgba(30, 58, 138, 0.85)' : 'rgba(39, 39, 42, 0.9)';
      ctx.strokeStyle = monster.faction === 'police' ? '#38BDF8' : '#EF4444';
      ctx.lineWidth = 2.4;

      // Heavy curved ballistic shield plate
      ctx.beginPath();
      ctx.roundRect(-8, -26, 16, 36, 4);
      ctx.fill();
      ctx.stroke();

      // Reinforced ballistic viewing window
      ctx.fillStyle = monster.faction === 'police' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(-6, -22, 12, 7);
      ctx.strokeRect(-6, -22, 12, 7);

      // Police / Skull Emblem
      // Faction lettering is runtime UI, never part of a flippable atlas
      // cell. Otherwise it mirrors with the enemy when WGPU flips UVs.
      if (!options.bodyOnly) {
        ctx.fillStyle = monster.faction === 'police' ? '#38BDF8' : '#EF4444';
        ctx.font = '900 8px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(monster.faction === 'police' ? 'POLICE' : '⚡PUNK', 0, 0);
      }
      ctx.restore();
    }

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
      ctx.ellipse(8, 6, 4, 7, -0.4, 0, Math.PI * 2);
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

  // 6. Overhead Health Bar (nameplates and following speech bubbles removed)
  // Atlas generation keeps the vector body but leaves mutable HP in the
  // Canvas overlay, preventing a cached sprite from showing stale health.
  if (!options.bodyOnly && !isDead) {
    const barW = isBossBandit ? 90 : 44;
    const barH = isBossBandit ? 8 : 5;
    const barY = isBossBandit ? -65 : -46;
    const hpRatio = Math.max(0, hp / maxHp);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = isBossBandit ? '#EF4444' : isDummy ? '#F59E0B' : '#38BDF8';
    ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
  } else if (!options.bodyOnly) {
    // Defeated X_X Badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(-24, -20, 48, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.font = '900 10px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DEFEATED', 0, -9);
  }

  ctx.restore();
}

export function drawPoliceCruiser(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.roundRect(x - 5, y + 6, 110, 52, 10);
  ctx.fill();

  // Car Body Base
  ctx.fillStyle = '#0F172A';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, 100, 48, 8);
  ctx.fill();
  ctx.stroke();

  // White Doors & SWAT Decal
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(x + 25, y + 2, 50, 44);

  ctx.fillStyle = '#0F172A';
  ctx.font = '900 10px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SWAT', x + 50, y + 27);

  // Front / Rear Windshields
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(x + 18, y + 6, 10, 36);
  ctx.fillRect(x + 72, y + 6, 10, 36);

  // Flashing Emergency LED Lightbar on roof
  const isRed = Math.sin(time * 16) > 0;
  ctx.fillStyle = isRed ? '#EF4444' : '#0284C7';
  ctx.shadowColor = isRed ? '#EF4444' : '#38BDF8';
  ctx.shadowBlur = 12;
  ctx.fillRect(x + 44, y + 18, 12, 12);
  ctx.shadowBlur = 0;

  ctx.restore();
}

export function drawCyberMuscleCar(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x - 5, y + 6, 120, 54, 12);
  ctx.fill();

  // Widebody Muscle Car Chassis
  ctx.fillStyle = '#18181B';
  ctx.strokeStyle = '#DC2626';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, 110, 50, 8);
  ctx.fill();
  ctx.stroke();

  // Twin Racing Stripes in Neon Orange/Yellow
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x + 5, y + 16, 100, 5);
  ctx.fillRect(x + 5, y + 28, 100, 5);

  // Hood Supercharger Air Scoop
  ctx.fillStyle = '#71717A';
  ctx.fillRect(x + 18, y + 18, 20, 14);

  // Rear Racing Spoiler
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(x + 95, y + 4, 8, 42);

  ctx.restore();
}

