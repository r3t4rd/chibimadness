import { Monster, DropItem, ResourceNode, NPC, Projectile, DamagePopup, VisualParticle, Player, GroundDecal, InteractiveObject } from '../types/game';
import { drawChibiCharacter, drawHumanoidEnemy } from './chibiRenderer';
import { WORLD_WIDTH, WORLD_HEIGHT, ZONES, NPCS_DATABASE, OBSTACLES, INITIAL_INTERACTIVE_OBJECTS } from './constants';

// Persistent smoothed camera state
let smoothedCameraX = 650;
let smoothedCameraY = 750;
let smoothedZoom = 1.0;
let lastRenderTimestamp = 0;

export function getCameraState() {
  return {
    x: smoothedCameraX,
    y: smoothedCameraY,
    zoom: (!isNaN(smoothedZoom) && smoothedZoom > 0.2 && smoothedZoom < 8.0) ? smoothedZoom : 1.0,
  };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const zoom = (!isNaN(smoothedZoom) && smoothedZoom > 0.2 && smoothedZoom < 8.0) ? smoothedZoom : 1.0;
  return {
    x: smoothedCameraX + (screenX - canvasWidth / 2) / zoom,
    y: smoothedCameraY + (screenY - canvasHeight / 2) / zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const zoom = (!isNaN(smoothedZoom) && smoothedZoom > 0.2 && smoothedZoom < 8.0) ? smoothedZoom : 1.0;
  return {
    x: canvasWidth / 2 + (worldX - smoothedCameraX) * zoom,
    y: canvasHeight / 2 + (worldY - smoothedCameraY) * zoom,
  };
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  localPlayer: Player,
  players: Record<string, Player>,
  monsters: Monster[],
  resourceNodes: ResourceNode[],
  dropItems: DropItem[],
  projectiles: Projectile[],
  particles: VisualParticle[],
  damagePopups: DamagePopup[],
  screenShake: { intensity: number; duration: number } = { intensity: 0, duration: 0 },
  groundDecals: GroundDecal[] = [],
  time: number = 0
) {
  // Screen shake offset calculation with smooth decay
  let shakeX = 0;
  let shakeY = 0;
  if (screenShake.duration > 0 && screenShake.intensity > 0) {
    const factor = Math.min(1, screenShake.duration * 5);
    shakeX = (Math.random() - 0.5) * screenShake.intensity * 2 * factor;
    shakeY = (Math.random() - 0.5) * screenShake.intensity * 2 * factor;
  }

  // Calculate Weapon-Specific Look-Ahead offset
  const activeGunType = localPlayer?.equipment?.weapon?.gunType || 'pistol';
  const maxLookAhead =
    activeGunType === 'cheytac' ? 880 :
    activeGunType === 'ak47' ? 500 :
    activeGunType === 'revolver' ? 440 :
    activeGunType === 'pistol' ? 380 :
    activeGunType === 'shotgun' ? 360 :
    activeGunType === 'mac10' ? 360 : 280;

  const aimAngle = localPlayer?.aimAngle || 0;
  const isInspecting = !!localPlayer?.isInspectingWeapon;
  const targetLookAheadX = (!isInspecting && localPlayer?.isAiming) ? Math.cos(aimAngle) * maxLookAhead : 0;
  const targetLookAheadY = (!isInspecting && localPlayer?.isAiming) ? Math.sin(aimAngle) * maxLookAhead : 0;

  const inspectOffsetX = (localPlayer?.facing === 'left' ? -14 : 14);
  const inspectOffsetY = -3;

  const targetCamX = (localPlayer?.x ?? 650) + shakeX + (isInspecting ? inspectOffsetX : targetLookAheadX);
  const targetCamY = (localPlayer?.y ?? 750) + shakeY + (isInspecting ? inspectOffsetY : targetLookAheadY);

  const dt = (lastRenderTimestamp > 0 && time > lastRenderTimestamp) ? Math.min(0.1, (time - lastRenderTimestamp)) : 0.016;
  lastRenderTimestamp = time;

  // Exponential framerate-independent lerp for smooth camera look-ahead
  const camLerpSpeed = isInspecting ? 9.0 : localPlayer?.isAiming ? 6.5 : 8.0;
  if (isNaN(smoothedCameraX) || Math.abs(smoothedCameraX - targetCamX) > 4000) {
    smoothedCameraX = targetCamX;
    smoothedCameraY = targetCamY;
  } else {
    smoothedCameraX += (targetCamX - smoothedCameraX) * (1 - Math.exp(-dt * camLerpSpeed));
    smoothedCameraY += (targetCamY - smoothedCameraY) * (1 - Math.exp(-dt * camLerpSpeed));
  }

  const camera = {
    x: Math.round(smoothedCameraX),
    y: Math.round(smoothedCameraY),
  };

  const npcs = Object.values(NPCS_DATABASE);

  renderWorld(
    ctx,
    canvasWidth,
    canvasHeight,
    camera,
    localPlayer,
    players,
    monsters,
    dropItems,
    resourceNodes,
    npcs,
    projectiles,
    damagePopups,
    particles,
    groundDecals,
    INITIAL_INTERACTIVE_OBJECTS,
    time
  );
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  camera: { x: number; y: number },
  localPlayer: Player,
  players: Record<string, Player>,
  monsters: Monster[],
  dropItems: DropItem[],
  resourceNodes: ResourceNode[],
  npcs: NPC[],
  projectiles: Projectile[],
  damagePopups: DamagePopup[],
  particles: VisualParticle[],
  groundDecals: GroundDecal[] = [],
  interactiveObjects: InteractiveObject[] = INITIAL_INTERACTIVE_OBJECTS,
  time: number = 0
) {
  ctx.save();
  // Clear screen
  ctx.fillStyle = '#0D141C';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Buttery-Smooth Dynamic Camera Zoom
  const dt = 0.016;
  const vx = (localPlayer && typeof localPlayer.vx === 'number' && !isNaN(localPlayer.vx)) ? localPlayer.vx : 0;
  const vy = (localPlayer && typeof localPlayer.vy === 'number' && !isNaN(localPlayer.vy)) ? localPlayer.vy : 0;
  const currentSpeed = Math.sqrt(vx * vx + vy * vy) || 0;
  
  const activeGunType = localPlayer?.equipment?.weapon?.gunType || 'pistol';
  // CheyTac sniper zooms out the farthest for massive battlefield awareness!
  const aimZoomFactor = localPlayer?.isAiming ? (activeGunType === 'cheytac' ? 0.46 : 0.68) : 1.0;
  let targetZoom = Math.max(0.40, (1.0 - Math.min(0.20, (currentSpeed / 650) * 0.16)) * aimZoomFactor);
  if (localPlayer?.isInspectingWeapon) {
    targetZoom = 5.2;
  }
  const zoomLerpSpeed = localPlayer?.isInspectingWeapon ? 8.0 : localPlayer?.isAiming ? 5.5 : 6.0;

  if (isNaN(smoothedZoom) || typeof smoothedZoom !== 'number' || smoothedZoom <= 0.1 || smoothedZoom > 8) {
    smoothedZoom = 1.0;
  } else {
    smoothedZoom += (targetZoom - smoothedZoom) * (1 - Math.exp(-dt * zoomLerpSpeed));
  }
  const safeZoom = (!isNaN(smoothedZoom) && smoothedZoom > 0.2 && smoothedZoom < 8.0) ? smoothedZoom : 1.0;

  // Apply Camera translation & dynamic smooth zoom (centered on canvas)
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(safeZoom, safeZoom);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  ctx.translate(Math.round(canvasWidth / 2 - camera.x), Math.round(canvasHeight / 2 - camera.y));

  // 1. Draw World Background & Terrain (Forest, Campsite, Rocky Canyon, Mountain Summit)
  drawTerrain(ctx, camera, canvasWidth, canvasHeight, time);

  // 2. Draw Forest Campsite Tents, Campfires, Cliffs, Watchtowers, and Mountain Features
  drawEnvironmentDecor(ctx, camera, canvasWidth, canvasHeight, time);

  // 2.2. Draw Interactive Objects (Red Explosive Barrels & Crates)
  drawInteractiveObjects(ctx, interactiveObjects, time);

  // 2.5. Draw Ground Decals (Blood splatters, Molotov fire pools, bullet impacts)
  drawGroundDecals(ctx, groundDecals, time);

  // 2.8. Draw Volumetric Ground Mist & Fog Layer
  drawAtmosphericFog(ctx, camera, canvasWidth, canvasHeight, time);

  // 3. Draw Resource Gathering Nodes (Dense Pine Trees, Iron Ore Crags, Lumite Clusters)
  drawResourceNodes(ctx, resourceNodes, time);

  // 4. Draw Drop Items on ground with pulsing bounce
  drawDropItems(ctx, dropItems, time);

  // 5. Draw NPC Characters (Sitting on logs and standing by tents)
  drawNPCs(ctx, npcs, time);

  // 6. Draw Monster / Boss Telegraphed Attack Zones
  drawMonsterTelegraphs(ctx, monsters, time);

  // 7. Draw Monsters & World Bosses (The Welder Boss, Viktor, Outlaws)
  drawMonsters(ctx, monsters, time);

  // 8. Draw Remote & Local Players (Z-sorted by Y position)
  const allPlayers = Object.values(players);
  if (!players[localPlayer.id]) {
    allPlayers.push(localPlayer);
  }
  allPlayers.sort((a, b) => (a.y || 0) - (b.y || 0));

  for (const p of allPlayers) {
    drawChibiCharacter(ctx, p, time);
  }

  // 8.5. Draw Tactical Laser Sight Beam (CheyTac Sniper or Laser Underbarrel Attachment)
  let lockedMonster: Monster | null = null;
  let laserHitDistance = 2600;

  if (localPlayer.isAiming && (activeGunType === 'cheytac' || localPlayer.weaponAttachments?.underbarrel?.id === 'under_laser')) {
    const aimAngle = localPlayer.aimAngle || 0;
    const aimDirX = Math.cos(aimAngle);
    const aimDirY = Math.sin(aimAngle);
    const muzzleX = localPlayer.x + aimDirX * 36;
    const muzzleY = localPlayer.y + aimDirY * 36 - 2;
    const maxLaserRange = 2600;
    laserHitDistance = maxLaserRange;

    // Raycast against solid obstacles
    for (const obs of OBSTACLES) {
      if (obs.shape === 'circle' && obs.radius) {
        const ox = obs.x;
        const oy = obs.y;
        const r = obs.radius;
        // Ray to circle distance check
        const toCircleX = ox - muzzleX;
        const toCircleY = oy - muzzleY;
        const projLen = toCircleX * aimDirX + toCircleY * aimDirY;
        if (projLen > 0 && projLen < laserHitDistance) {
          const perpDistSq = (toCircleX * toCircleX + toCircleY * toCircleY) - (projLen * projLen);
          if (perpDistSq < r * r) {
            const hitDist = projLen - Math.sqrt(Math.max(0, r * r - perpDistSq));
            if (hitDist > 0 && hitDist < laserHitDistance) {
              laserHitDistance = hitDist;
            }
          }
        }
      } else {
        // AABB Box Raycast
        const minX = obs.x;
        const maxX = obs.x + obs.width;
        const minY = obs.y;
        const maxY = obs.y + obs.height;

        let tmin = 0;
        let tmax = laserHitDistance;

        if (Math.abs(aimDirX) > 0.0001) {
          const t1 = (minX - muzzleX) / aimDirX;
          const t2 = (maxX - muzzleX) / aimDirX;
          tmin = Math.max(tmin, Math.min(t1, t2));
          tmax = Math.min(tmax, Math.max(t1, t2));
        }
        if (Math.abs(aimDirY) > 0.0001) {
          const t1 = (minY - muzzleY) / aimDirY;
          const t2 = (maxY - muzzleY) / aimDirY;
          tmin = Math.max(tmin, Math.min(t1, t2));
          tmax = Math.min(tmax, Math.max(t1, t2));
        }

        if (tmax >= tmin && tmin > 0 && tmin < laserHitDistance) {
          laserHitDistance = tmin;
        }
      }
    }

    // Raycast against living monsters
    for (const m of monsters) {
      if (m.hp <= 0 || m.state === 'dead') continue;
      const mRad = m.isBoss || m.isJuggernaut ? 52 : 30;
      const toMonX = m.x - muzzleX;
      const toMonY = m.y - muzzleY;
      const projLen = toMonX * aimDirX + toMonY * aimDirY;
      if (projLen > 0 && projLen < laserHitDistance) {
        const perpDistSq = (toMonX * toMonX + toMonY * toMonY) - (projLen * projLen);
        if (perpDistSq < mRad * mRad) {
          const hitDist = projLen - Math.sqrt(Math.max(0, mRad * mRad - perpDistSq));
          if (hitDist > 0 && hitDist < laserHitDistance) {
            laserHitDistance = hitDist;
            lockedMonster = m;
          }
        }
      }
    }

    const endX = muzzleX + aimDirX * laserHitDistance;
    const endY = muzzleY + aimDirY * laserHitDistance;

    ctx.save();
    // 1. Broad outer atmospheric red/cyan aura
    ctx.strokeStyle = activeGunType === 'cheytac' ? 'rgba(239, 68, 68, 0.28)' : 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(muzzleX, muzzleY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 2. Glowing high-intensity neon laser beam
    ctx.strokeStyle = activeGunType === 'cheytac' ? '#EF4444' : '#38BDF8';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = activeGunType === 'cheytac' ? '#EF4444' : '#38BDF8';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(muzzleX, muzzleY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 3. Ultra-bright razor-sharp core beam
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(muzzleX, muzzleY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. Muzzle Flare pulse at rifle barrel tip
    const flareSize = Math.sin(time * 25) * 2 + 7;
    ctx.fillStyle = activeGunType === 'cheytac' ? '#FCA5A5' : '#BAE6FD';
    ctx.beginPath();
    ctx.arc(muzzleX, muzzleY, flareSize, 0, Math.PI * 2);
    ctx.fill();

    // 5. Impact Point with Pulsing Ring and Sparks
    const dotPulse = Math.sin(time * 18) * 2 + 5.5;
    ctx.fillStyle = activeGunType === 'cheytac' ? '#FCA5A5' : '#BAE6FD';
    ctx.beginPath();
    ctx.arc(endX, endY, dotPulse, 0, Math.PI * 2);
    ctx.fill();

    // Impact ring ripple
    ctx.strokeStyle = activeGunType === 'cheytac' ? 'rgba(239, 68, 68, 0.65)' : 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(endX, endY, dotPulse * 1.8, 0, Math.PI * 2);
    ctx.stroke();

    // 6. Tactical Lock-on bracket on targeted Monster
    if (lockedMonster) {
      const lm = lockedMonster as Monster;
      const boxSize = lm.isBoss || lm.isJuggernaut ? 65 : 36;
      const cornerLen = 10;

      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 10;

      // Top-Left corner
      ctx.beginPath();
      ctx.moveTo(lm.x - boxSize, lm.y - boxSize + cornerLen);
      ctx.lineTo(lm.x - boxSize, lm.y - boxSize);
      ctx.lineTo(lm.x - boxSize + cornerLen, lm.y - boxSize);
      ctx.stroke();

      // Top-Right corner
      ctx.beginPath();
      ctx.moveTo(lm.x + boxSize - cornerLen, lm.y - boxSize);
      ctx.lineTo(lm.x + boxSize, lm.y - boxSize);
      ctx.lineTo(lm.x + boxSize, lm.y - boxSize + cornerLen);
      ctx.stroke();

      // Bottom-Left corner
      ctx.beginPath();
      ctx.moveTo(lm.x - boxSize, lm.y + boxSize - cornerLen);
      ctx.lineTo(lm.x - boxSize, lm.y + boxSize);
      ctx.lineTo(lm.x - boxSize + cornerLen, lm.y + boxSize);
      ctx.stroke();

      // Bottom-Right corner
      ctx.beginPath();
      ctx.moveTo(lm.x + boxSize - cornerLen, lm.y + boxSize);
      ctx.lineTo(lm.x + boxSize, lm.y + boxSize);
      ctx.lineTo(lm.x + boxSize, lm.y + boxSize - cornerLen);
      ctx.stroke();

      // Text Lock-On Badge
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(lm.x - 70, lm.y - boxSize - 26, 140, 20);
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(lm.x - 70, lm.y - boxSize - 26, 140, 20);

      ctx.fillStyle = '#F87171';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🎯 LOCK [${Math.round(laserHitDistance / 4)}m] ${Math.round(lm.hp)}HP`, lm.x, lm.y - boxSize - 12);
    }

    ctx.restore();
  }

  // 9. Draw Projectiles (Bullets, Lasers, Shotgun pellets, Slash waves)
  drawProjectiles(ctx, projectiles);

  // 10. Draw Visual Particles (Cherry petals, Sparks, Smoke)
  drawParticles(ctx, particles);

  // 11. Draw Damage Popups
  drawDamagePopups(ctx, damagePopups);

  ctx.restore(); // restore camera & zoom

  // 12. Draw Atmospheric Rain Streaks & Ground Splash Ripples
  drawRainAndSplashes(ctx, canvasWidth, canvasHeight, camera, time);

  // 13. Draw Atmospheric Ambient Lighting & Low HP Blood Heartbeat Overlay
  drawAtmosphericOverlay(ctx, canvasWidth, canvasHeight, camera, localPlayer, time);

  // 14. Draw Fullscreen Tactical Sniper HUD Scope Overlay (when aiming with CheyTac or Firearms)
  if (localPlayer.isAiming) {
    drawTacticalAimOverlay(ctx, canvasWidth, canvasHeight, localPlayer, activeGunType, laserHitDistance, lockedMonster, time);
  }

  ctx.restore();
}

function drawGroundDecals(ctx: CanvasRenderingContext2D, decals: GroundDecal[], time: number = 0) {
  if (!decals || !Array.isArray(decals)) return;
  decals.forEach((d) => {
    if (!d || d.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, d.alpha));
    ctx.translate(d.x || 0, d.y || 0);

    const rad = Math.max(1, d.radius || 10);
    if (d.type === 'fire_pool') {
      // Burning Hellfire Molotov Fire Pool
      ctx.fillStyle = 'rgba(234, 88, 12, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rad, Math.max(0.5, rad * 0.65), 0, 0, Math.PI * 2);
      ctx.fill();

      // Flickering inner fire core
      const flameBob = Math.sin(time * 12 + (d.x || 0)) * 4;
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      const innerRadX = Math.max(1, (rad * 0.65) + flameBob);
      const innerRadY = Math.max(0.5, (rad * 0.4) + flameBob * 0.5);
      ctx.ellipse(0, 0, innerRadX, innerRadY, 0, 0, Math.PI * 2);
      ctx.fill();

      // Center white-yellow spark
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Blood splatters and scorch marks
      ctx.fillStyle = d.color || '#991B1B';
      ctx.beginPath();
      ctx.ellipse(0, 0, rad, Math.max(0.5, rad * 0.6), 0, 0, Math.PI * 2);
      ctx.fill();

      // Splatter droplets
      const count = d.splatterCount || 3;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const dist = rad * (1.2 + Math.sin(i * 3) * 0.4);
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * (dist * 0.6), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  });
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  vw: number,
  vh: number,
  time: number
) {
  // 1. Forest & Survivor Campsite (Top-Left: 0,0 to 2000, 1600)
  ctx.fillStyle = '#162C1E'; // Rich forest pine green
  ctx.fillRect(0, 0, 2000, 1600);

  // Campsite Dirt & Gravel Clearing
  ctx.fillStyle = '#30261A'; // Earthen camp floor
  ctx.beginPath();
  ctx.ellipse(680, 650, 480, 340, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dirt paths connecting tents
  ctx.strokeStyle = '#3F3223';
  ctx.lineWidth = 40;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(350, 750);
  ctx.quadraticCurveTo(680, 650, 1000, 750);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(680, 480);
  ctx.lineTo(680, 850);
  ctx.stroke();

  // Path leading East into the Mountain Canyon
  ctx.strokeStyle = '#383025';
  ctx.lineWidth = 55;
  ctx.beginPath();
  ctx.moveTo(1100, 700);
  ctx.bezierCurveTo(1600, 720, 1800, 750, 2400, 800);
  ctx.stroke();

  // 2. Dense Emerald Forest (Bottom-Left: 0, 1600 to 2600, 3200)
  ctx.fillStyle = '#112217'; // Deep shadow woods
  ctx.fillRect(0, 1600, 2600, 1600);

  // 3. Mountain Foothills & Rocky Canyon Pass (Top-Right: 1800,0 to 4800, 1600)
  ctx.fillStyle = '#26242E'; // Dark Slate Mountain Rock
  ctx.fillRect(1800, 0, 3000, 1600);

  // Canyon Valley Sand & Scree Path
  ctx.fillStyle = '#3B332B';
  ctx.beginPath();
  ctx.moveTo(1900, 650);
  ctx.lineTo(4700, 550);
  ctx.lineTo(4700, 1150);
  ctx.lineTo(1900, 950);
  ctx.closePath();
  ctx.fill();

  // 4. High Rock Summit & Welder's Furnace Arena (Bottom-Right: 2600, 1600 to 4800, 3200)
  ctx.fillStyle = '#1F1D26'; // Volcanic / Mountain basalt rock
  ctx.fillRect(2600, 1600, 2200, 1600);

  // Summit Arena Plateau Ground
  ctx.fillStyle = '#2E2833';
  ctx.beginPath();
  ctx.roundRect(2900, 1850, 1600, 1100, 60);
  ctx.fill();

  // Welder Industrial Scrap Ground Trim
  ctx.strokeStyle = 'rgba(234, 88, 12, 0.15)';
  ctx.lineWidth = 4;
  ctx.strokeRect(3000, 1950, 1400, 900);

  // =========================================================
  // 5. BOTTOM WARZONE: POLICE SWAT PRECINCT & TACTICAL ASPHALT (Y >= 3100, Left)
  // =========================================================
  ctx.fillStyle = '#0B132B'; // Heavy dark tactical police asphalt
  ctx.fillRect(0, 3100, 2500, 1300);

  // Police Precinct Perimeter Border & Blue Tactical Marking
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(400, 3200, 2000, 1050);

  // Police Helipad H Circle (x: 1200, y: 3750)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(1200, 3750, 120, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.font = '900 64px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POLICE', 1200, 3750);

  // =========================================================
  // 6. BOTTOM WARZONE: DEMON PUNK SYNDICATE ANARCHY PIT (Y >= 3100, Right)
  // =========================================================
  ctx.fillStyle = '#141115'; // Dark scorched asphalt & industrial grime
  ctx.fillRect(2500, 3100, 2900, 1300);

  // Anarchy Pit Red Border & Hazard Trim
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(2600, 3200, 2600, 1050);

  // Large Red Anarchy Symbol (x: 4000, y: 3750)
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(4000, 3750, 130, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.font = '900 72px Fredoka, sans-serif';
  ctx.fillText('ANARCHY', 4000, 3750);

  // =========================================================
  // 7. WARZONE FRONTLINE BOULEVARD (Central Highway Avenue: x: 2200-2900, y: 3100-4400)
  // =========================================================
  ctx.fillStyle = '#09090B'; // Deep highway black asphalt
  ctx.fillRect(2150, 3100, 800, 1300);

  // Double Yellow Solid Highway Dividing Lines
  ctx.strokeStyle = '#EAB308';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2545, 3100);
  ctx.lineTo(2545, 4400);
  ctx.moveTo(2555, 3100);
  ctx.lineTo(2555, 4400);
  ctx.stroke();

  // White Crosswalk Zebra Stripes across the frontline
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let y = 3300; y < 4300; y += 180) {
    for (let x = 2220; x < 2880; x += 45) {
      ctx.fillRect(x, y, 25, 60);
    }
  }

  // Subtle organic texture grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
  ctx.lineWidth = 1;
  const gridSize = 120;
  const startX = Math.max(0, Math.floor((camera.x - vw / 2) / gridSize) * gridSize);
  const endX = Math.min(WORLD_WIDTH, Math.ceil((camera.x + vw / 2) / gridSize) * gridSize);
  const startY = Math.max(0, Math.floor((camera.y - vh / 2) / gridSize) * gridSize);
  const endY = Math.min(WORLD_HEIGHT, Math.ceil((camera.y + vh / 2) / gridSize) * gridSize);

  for (let x = startX; x <= endX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }
  for (let y = startY; y <= endY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }
}

function drawEnvironmentDecor(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  vw: number,
  vh: number,
  time: number
) {
  // ==========================================
  // 1. FOREST CAMPSITE TENTS & EXPEDITION GEAR
  // ==========================================

  // TENT 1: Main Command / HQ Canvas Tent (x: 580, y: 480, w: 140, h: 110)
  drawCanvasTent(ctx, 580, 480, 140, 110, '#334155', '#1E293B', '#F59E0B', 'COMMAND HQ', time);

  // TENT 2: Armory & Forge Tent (x: 860, y: 480, w: 130, h: 100)
  drawCanvasTent(ctx, 860, 480, 130, 100, '#451A03', '#271003', '#EA580C', 'ARMORY & WORKSHOP', time);

  // TENT 3: Kitchen & Rations Tent (x: 420, y: 720, w: 120, h: 95)
  drawCanvasTent(ctx, 420, 720, 120, 95, '#064E3B', '#022C22', '#10B981', 'FIELD KITCHEN', time);

  // TENT 4: Scout & Recon Tent (x: 920, y: 740, w: 115, h: 90)
  drawCanvasTent(ctx, 920, 740, 115, 90, '#1E3A8A', '#0F172A', '#38BDF8', 'SCOUT POST', time);

  // Campsite Wooden Weapon Racks & Supply Crates
  drawSupplyCrates(ctx, 820, 560);
  drawSupplyCrates(ctx, 380, 780);
  drawSupplyCrates(ctx, 970, 780);

  // Campsite Watchtowers
  drawWatchtower(ctx, 220, 450, time);
  drawWatchtower(ctx, 1180, 450, time);
  drawWatchtower(ctx, 1750, 620, time); // Canyon overlook tower

  // ==========================================
  // 2. CENTRAL ROARING CAMPFIRE & LOG BENCHES
  // ==========================================
  const fireX = 680;
  const fireY = 640;

  // Outer Stone Fire Ring
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(fireX, fireY + 12, 45, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#57534E';
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    const rx = fireX + Math.cos(angle) * 32;
    const ry = fireY + Math.sin(angle) * 22;
    ctx.beginPath();
    ctx.arc(rx, ry, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Hot Burning Charcoal Pit
  ctx.fillStyle = '#7F1D1D';
  ctx.beginPath();
  ctx.ellipse(fireX, fireY, 24, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Burning Wood Logs in Fire Pit
  ctx.fillStyle = '#451A03';
  ctx.strokeStyle = '#1C1917';
  ctx.lineWidth = 2;
  ctx.fillRect(fireX - 16, fireY - 6, 32, 8);
  ctx.strokeRect(fireX - 16, fireY - 6, 32, 8);

  // Animated Fire Flames & Rising Sparks
  const flameH = 22 + Math.sin(time * 15) * 6;
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.moveTo(fireX - 14, fireY + 4);
  ctx.quadraticCurveTo(fireX - 5, fireY - flameH * 0.7, fireX, fireY - flameH);
  ctx.quadraticCurveTo(fireX + 5, fireY - flameH * 0.7, fireX + 14, fireY + 4);
  ctx.closePath();
  ctx.fill();

  // Inner White-Yellow Flame Core
  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.moveTo(fireX - 7, fireY + 2);
  ctx.quadraticCurveTo(fireX, fireY - flameH * 0.7, fireX + 7, fireY + 2);
  ctx.closePath();
  ctx.fill();

  // Warm Campfire Golden Glow Radiance
  const fireGlow = ctx.createRadialGradient(fireX, fireY, 10, fireX, fireY, 140);
  fireGlow.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
  fireGlow.addColorStop(0.5, 'rgba(234, 88, 12, 0.15)');
  fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fireGlow;
  ctx.beginPath();
  ctx.arc(fireX, fireY, 140, 0, Math.PI * 2);
  ctx.fill();

  // Flying Fire Embers
  ctx.fillStyle = '#FDE047';
  for (let i = 0; i < 4; i++) {
    const emberX = fireX + Math.sin(time * 8 + i * 2) * 16;
    const emberY = fireY - 14 - ((time * 30 + i * 20) % 50);
    ctx.beginPath();
    ctx.arc(emberX, emberY, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wooden Log Benches around Campfire (where NPCs sit / rest)
  drawLogBench(ctx, fireX - 75, fireY, 'vertical');
  drawLogBench(ctx, fireX + 75, fireY, 'vertical');
  drawLogBench(ctx, fireX, fireY + 55, 'horizontal');

  // ==========================================
  // 3. MOUNTAIN & CANYON CLIFFS & BOULDERS
  // ==========================================
  // North Canyon Cliffs
  drawCliffFormation(ctx, 2400, 250, 450, 80);
  drawCliffFormation(ctx, 3100, 280, 520, 85);
  // Mid Canyon Wall
  drawCliffFormation(ctx, 2850, 720, 80, 420);
  // South Canyon Ridge
  drawCliffFormation(ctx, 3350, 1250, 620, 90);

  // Summit Arena Plateau Ridges
  drawCliffFormation(ctx, 2900, 1800, 90, 500);
  drawCliffFormation(ctx, 4350, 1750, 90, 600);
  drawCliffFormation(ctx, 3100, 2920, 1150, 95);

  // Scattered Natural Mountain Boulders
  drawGraniteBoulder(ctx, 260, 380, 38);
  drawGraniteBoulder(ctx, 1250, 420, 46);
  drawGraniteBoulder(ctx, 1520, 920, 50);
  drawGraniteBoulder(ctx, 480, 1950, 42);
  drawGraniteBoulder(ctx, 1450, 2450, 55);
  drawGraniteBoulder(ctx, 3350, 2150, 44);
  drawGraniteBoulder(ctx, 4050, 2450, 46);

  // Pine Trees along mountain ridges
  for (let x = 1900; x < 4600; x += 320) {
    drawDecorativePineTree(ctx, x, 220 + Math.sin(x) * 40);
    drawDecorativePineTree(ctx, x + 60, 1350 + Math.cos(x) * 40);
  }

  // =========================================================
  // 4. BOTTOM WARZONE BARRICADES, SANDBAGS & BURNING DRUMS (Y >= 3100)
  // =========================================================
  // SWAT Police Checkpoint Guardrails & Flashing Beacons
  ctx.save();
  ctx.fillStyle = '#1E3A8A';
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;

  // Police Precinct North Gate Barricade
  ctx.fillRect(1700, 3180, 220, 20);
  ctx.strokeRect(1700, 3180, 220, 20);
  // Flashing Blue / Red Emergency Beacons
  const beaconColor = Math.sin(time * 12) > 0 ? '#38BDF8' : '#EF4444';
  ctx.fillStyle = beaconColor;
  ctx.shadowColor = beaconColor;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(1715, 3180, 8, 0, Math.PI * 2);
  ctx.arc(1905, 3180, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Concrete Jersey Barriers along Frontline Boulevard
  ctx.fillStyle = '#64748B';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  const barrierYList = [3350, 3650, 3950, 4200];
  barrierYList.forEach((by) => {
    // West Barrier
    ctx.fillRect(2340, by, 60, 16);
    ctx.strokeRect(2340, by, 60, 16);
    // East Barrier
    ctx.fillRect(2640, by, 60, 16);
    ctx.strokeRect(2640, by, 60, 16);
  });

  // Punk Syndicate Burning Trash Oil Drums (x: 3200, 3600, 4200)
  const drumList = [
    { x: 3100, y: 3450 },
    { x: 3450, y: 3850 },
    { x: 3900, y: 3500 },
    { x: 4200, y: 4050 },
  ];
  drumList.forEach((drum) => {
    // Metal barrel body
    ctx.fillStyle = '#27272A';
    ctx.strokeStyle = '#09090B';
    ctx.lineWidth = 2;
    ctx.fillRect(drum.x - 14, drum.y - 18, 28, 36);
    ctx.strokeRect(drum.x - 14, drum.y - 18, 28, 36);

    // Rib rings
    ctx.beginPath();
    ctx.moveTo(drum.x - 14, drum.y - 6);
    ctx.lineTo(drum.x + 14, drum.y - 6);
    ctx.moveTo(drum.x - 14, drum.y + 6);
    ctx.lineTo(drum.x + 14, drum.y + 6);
    ctx.stroke();

    // Raging Hellfire Flames shooting out of the drum
    const dFlameH = 24 + Math.sin(time * 18 + drum.x) * 8;
    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.moveTo(drum.x - 12, drum.y - 18);
    ctx.quadraticCurveTo(drum.x - 4, drum.y - 18 - dFlameH * 0.7, drum.x, drum.y - 18 - dFlameH);
    ctx.quadraticCurveTo(drum.x + 4, drum.y - 18 - dFlameH * 0.7, drum.x + 12, drum.y - 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.moveTo(drum.x - 6, drum.y - 18);
    ctx.quadraticCurveTo(drum.x, drum.y - 18 - dFlameH * 0.7, drum.x, drum.y - 18 - dFlameH * 0.75);
    ctx.quadraticCurveTo(drum.x, drum.y - 18 - dFlameH * 0.7, drum.x + 6, drum.y - 18);
    ctx.closePath();
    ctx.fill();
  });

  ctx.restore();
}

function drawCanvasTent(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  roofColor: string,
  shadowColor: string,
  accentColor: string,
  title: string,
  time: number
) {
  ctx.save();
  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 10, w / 2 + 15, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Guy Ropes & Wooden Stakes
  ctx.strokeStyle = '#A8A29E';
  ctx.lineWidth = 1.5;
  // Left Guy Ropes
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 20);
  ctx.lineTo(x - 22, y + h + 8);
  ctx.moveTo(x + w * 0.3, y);
  ctx.lineTo(x - 18, y + h + 8);
  // Right Guy Ropes
  ctx.moveTo(x + w - 10, y + 20);
  ctx.lineTo(x + w + 22, y + h + 8);
  ctx.moveTo(x + w * 0.7, y);
  ctx.lineTo(x + w + 18, y + h + 8);
  ctx.stroke();

  // Wooden Pegs
  ctx.fillStyle = '#78350F';
  ctx.fillRect(x - 24, y + h + 4, 4, 8);
  ctx.fillRect(x + w + 20, y + h + 4, 4, 8);

  // Left Shaded Roof Side
  ctx.fillStyle = shadowColor;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h - 15);
  ctx.lineTo(x + 20, y + h);
  ctx.closePath();
  ctx.fill();

  // Right Lit Roof Side
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h - 15);
  ctx.lineTo(x + w - 20, y + h);
  ctx.closePath();
  ctx.fill();

  // Main Tent Opening (Cloth Flap Drawn Back)
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 10);
  ctx.lineTo(x + w * 0.25, y + h);
  ctx.lineTo(x + w * 0.75, y + h);
  ctx.closePath();
  ctx.fill();

  // Warm Cozy Interior Lantern Light inside Tent
  const tentLight = ctx.createRadialGradient(x + w / 2, y + h - 20, 5, x + w / 2, y + h - 20, 50);
  tentLight.addColorStop(0, 'rgba(254, 240, 138, 0.8)');
  tentLight.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = tentLight;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h - 20, 50, 0, Math.PI * 2);
  ctx.fill();

  // Hanging Lantern in Tent Peak
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 8);
  ctx.lineTo(x + w / 2, y + 25);
  ctx.stroke();
  ctx.fillStyle = '#FDE047';
  ctx.fillRect(x + w / 2 - 4, y + 25, 8, 10);

  // Front Wooden Ridge Pole
  ctx.strokeStyle = '#78350F';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.stroke();

  // Tent Title Plaque above entrance
  ctx.fillStyle = '#1C1917';
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 45, y + 38, 90, 18, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 9px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, x + w / 2, y + 50);

  ctx.restore();
}

function drawSupplyCrates(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = '#78350F';
  ctx.strokeStyle = '#451A03';
  ctx.lineWidth = 2;

  // Base crate
  ctx.fillRect(x, y, 32, 28);
  ctx.strokeRect(x, y, 32, 28);
  // Diagonal cross brace
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 32, y + 28);
  ctx.moveTo(x + 32, y);
  ctx.lineTo(x, y + 28);
  ctx.stroke();

  // Stacked small crate
  ctx.fillStyle = '#92400E';
  ctx.fillRect(x + 18, y - 20, 24, 20);
  ctx.strokeRect(x + 18, y - 20, 24, 20);
  ctx.restore();
}

function drawWatchtower(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  // Tower 4 wooden stilts
  ctx.strokeStyle = '#451A03';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y + 70);
  ctx.lineTo(x + 10, y);
  ctx.moveTo(x + 50, y + 70);
  ctx.lineTo(x + 40, y);
  ctx.stroke();

  // X-bracing
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 60);
  ctx.lineTo(x + 48, y + 15);
  ctx.moveTo(x + 48, y + 60);
  ctx.lineTo(x + 2, y + 15);
  ctx.stroke();

  // Platform
  ctx.fillStyle = '#78350F';
  ctx.fillRect(x - 5, y - 8, 60, 12);
  ctx.strokeRect(x - 5, y - 8, 60, 12);

  // Roof canopy
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 12);
  ctx.lineTo(x + 25, y - 36);
  ctx.lineTo(x + 60, y - 12);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawLogBench(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 'horizontal' | 'vertical') {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  if (dir === 'horizontal') {
    ctx.ellipse(x, y + 6, 45, 10, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(x, y + 6, 12, 35, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.fillStyle = '#5A3825';
  ctx.strokeStyle = '#382214';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (dir === 'horizontal') {
    ctx.roundRect(x - 40, y - 8, 80, 16, 6);
  } else {
    ctx.roundRect(x - 8, y - 30, 16, 60, 6);
  }
  ctx.fill();
  ctx.stroke();

  // Tree rings on end
  ctx.fillStyle = '#854D0E';
  ctx.beginPath();
  if (dir === 'horizontal') {
    ctx.ellipse(x - 38, y, 4, 7, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(x, y - 28, 7, 4, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

function drawCliffFormation(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(x + 8, y + 8, w, h);

  // Cliff Front Rock Face
  ctx.fillStyle = '#1E1D24';
  ctx.strokeStyle = '#0F0E12';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  // Top Rock Ledge Highlight
  ctx.fillStyle = '#3A3845';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, w - 4, 18, 4);
  ctx.fill();

  // Rock Strata & Cracks
  ctx.strokeStyle = '#121117';
  ctx.lineWidth = 2;
  for (let i = 25; i < w - 25; i += 60) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + 18);
    ctx.lineTo(x + i + 8, y + h - 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGraniteBoulder(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save();
  // Boulder Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.6, radius * 1.1, radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main Boulder Body
  ctx.fillStyle = '#474554';
  ctx.strokeStyle = '#23222B';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Light Highlight
  ctx.fillStyle = '#656375';
  ctx.beginPath();
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Moss Patch on Top
  ctx.fillStyle = '#22543D';
  ctx.beginPath();
  ctx.arc(x, y - radius * 0.6, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawDecorativePineTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  // Tree Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 28, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tree Trunk
  ctx.fillStyle = '#451A03';
  ctx.fillRect(x - 5, y, 10, 24);

  // 3-Tier Pine Foliage
  ctx.fillStyle = '#064E3B';
  ctx.strokeStyle = '#022C22';
  ctx.lineWidth = 2;

  // Bottom Tier
  ctx.beginPath();
  ctx.moveTo(x - 26, y + 6);
  ctx.lineTo(x, y - 20);
  ctx.lineTo(x + 26, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Middle Tier
  ctx.fillStyle = '#047857';
  ctx.beginPath();
  ctx.moveTo(x - 22, y - 10);
  ctx.lineTo(x, y - 36);
  ctx.lineTo(x + 22, y - 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Top Tier
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 26);
  ctx.lineTo(x, y - 52);
  ctx.lineTo(x + 16, y - 26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// ==========================================
// 4. INTERACTIVE OBJECTS (RED EXPLOSIVE BARRELS)
// ==========================================
function drawInteractiveObjects(
  ctx: CanvasRenderingContext2D,
  objects: InteractiveObject[],
  time: number
) {
  objects.forEach((obj) => {
    if (obj.hp <= 0) return;

    ctx.save();
    ctx.translate(obj.x, obj.y);

    // Drop Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Red Steel Explosive Barrel Body
    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#7F1D1D';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-14, -20, 28, 36, 4);
    ctx.fill();
    ctx.stroke();

    // Metallic reinforcement rings
    ctx.fillStyle = '#991B1B';
    ctx.fillRect(-14, -12, 28, 4);
    ctx.fillRect(-14, 4, 28, 4);

    // Top Barrel Lid Rim
    ctx.fillStyle = '#B91C1C';
    ctx.beginPath();
    ctx.ellipse(0, -20, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hazard Symbol / Flame Graphic on Barrel Front
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(5, 4);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1C1917';
    ctx.font = '900 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TNT', 0, 3);

    // If damaged, flash glowing spark
    if (obj.hp < obj.maxHp) {
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(0, -22, 4 + Math.sin(time * 20) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });
}

function drawResourceNodes(ctx: CanvasRenderingContext2D, nodes: ResourceNode[], time: number) {
  nodes.forEach((node) => {
    if (node.hp <= 0) return;

    ctx.save();
    ctx.translate(node.x, node.y);

    if (node.type === 'tree') {
      drawDecorativePineTree(ctx, 0, 0);
    } else if (node.type === 'iron_ore') {
      drawGraniteBoulder(ctx, 0, 0, 32);
      // Iron Ore Vein Glint
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(4, -6, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Lumite Crystal Cluster
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#67E8F9';
      ctx.strokeStyle = '#0891B2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(14, 8);
      ctx.lineTo(-14, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#A5F3FC';
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(2, 6);
      ctx.lineTo(-18, 6);
      ctx.closePath();
      ctx.fill();
    }

    // Name tag
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.name, 0, -42);

    ctx.restore();
  });
}

function drawDropItems(ctx: CanvasRenderingContext2D, dropItems: DropItem[], time: number) {
  dropItems.forEach((drop) => {
    const bounce = Math.abs(Math.sin(time * 4 + drop.x)) * 8;
    ctx.save();
    ctx.translate(drop.x, drop.y - bounce);

    // Drop Item Glow Pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-24, -14, 48, 28, 14);
    ctx.fill();
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(drop.item.icon || '📦', 0, 5);

    ctx.restore();
  });
}

function drawNPCs(ctx: CanvasRenderingContext2D, npcs: NPC[], time: number) {
  npcs.forEach((npc) => {
    ctx.save();
    ctx.translate(npc.x, npc.y);

    const dummyPlayer: Player = {
      id: npc.id,
      name: npc.name,
      characterClass: 'gunslinger',
      chibi: npc.avatarChibi,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 'right',
      state: 'idle',
      stats: { level: 1, exp: 0, maxExp: 100, hp: 100, maxHp: 100, mp: 100, maxMp: 100, atk: 10, def: 10, speed: 4, critRate: 5, statPoints: 0, str: 5, agi: 5, int: 5, vit: 5 },
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
      attackTimer: 0,
      dodgeTimer: 0,
      combo: 0,
      lastAttackTime: 0,
      activeQuests: {},
      completedQuestIds: [],
      currentZone: 'forest_camp',
      activeBuffs: [],
    };

    drawChibiCharacter(ctx, dummyPlayer, time, true);

    // Floating Interaction Badge
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.roundRect(-22, -62, 44, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('[E] TALK', 0, -51);

    ctx.restore();
  });
}

function drawMonsterTelegraphs(ctx: CanvasRenderingContext2D, monsters: Monster[], time: number) {
  monsters.forEach((m) => {
    // 1. Outlaw Sniper Targeting Laser Sight
    if (m.sniperLaser && m.sniperLaser.active && m.state !== 'dead') {
      const { angle, length, chargeProgress } = m.sniperLaser;
      const startX = m.x;
      const startY = m.y - 2;
      const endX = startX + Math.cos(angle) * length;
      const endY = startY + Math.sin(angle) * length;

      ctx.save();
      // Glowing Neon Laser Beam
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + chargeProgress * 0.55})`;
      ctx.lineWidth = 1.2 + chargeProgress * 1.6;
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 8 + chargeProgress * 10;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Inner white laser core when near charge completion
      if (chargeProgress > 0.6) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }

      // Targeting Reticle on Player
      const reticleRadius = 24 * (1 - chargeProgress * 0.6);
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(endX, endY, reticleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshair Ticks
      ctx.beginPath();
      ctx.moveTo(endX - reticleRadius - 4, endY);
      ctx.lineTo(endX - reticleRadius + 4, endY);
      ctx.moveTo(endX + reticleRadius - 4, endY);
      ctx.lineTo(endX + reticleRadius + 4, endY);
      ctx.moveTo(endX, endY - reticleRadius - 4);
      ctx.lineTo(endX, endY - reticleRadius + 4);
      ctx.moveTo(endX, endY + reticleRadius - 4);
      ctx.lineTo(endX, endY + reticleRadius + 4);
      ctx.stroke();

      ctx.restore();
    }

    if (m.hp <= 0 || !m.telegraphedAttack) return;
    const t = m.telegraphedAttack;

    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 3;

    if (t.type === 'circle' || t.type === 'slam') {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Expanding Shockwave ring
      const progress = Math.min(1, (Date.now() - t.startTime) / t.duration);
      ctx.strokeStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius * progress, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawMonsters(ctx: CanvasRenderingContext2D, monsters: Monster[], time: number) {
  monsters.forEach((m) => {
    // Render living monsters and dead monsters during their ragdoll fall
    if (m.hp <= 0 && (m.deathProgress === undefined || m.deathProgress >= 1.0)) return;

    ctx.save();
    ctx.translate(m.x, m.y);

    if (m.type === 'forest_wolf') {
      // Draw Forest Feral Wolf
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-20, -12, 40, 24, 8);
      ctx.fill();
      ctx.stroke();

      // Wolf Head & Glowing Red Eyes
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(14, -8, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(18, -10, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Overhead HP Bar
      if (m.hp > 0) {
        const hpRatio = Math.max(0, m.hp / m.maxHp);
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-22, -32, 44, 6);
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(-22, -32, 44 * hpRatio, 6);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, 0, -38);
      }
    } else {
      // Draw Humanoid Bandits, Outlaws, and "Iron Mask" Sledge Boss
      drawHumanoidEnemy(ctx, m, time);
    }

    ctx.restore();
  });
}

function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]) {
  projectiles.forEach((p) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);

    if (p.type === 'laser' || p.range > 1800) {
      // CheyTac / Laser Piercing Hyper-Velocity Bullet Tracer
      // 1. Aerodynamic Luminous Speed Trail
      const trailLength = 38;
      const grad = ctx.createLinearGradient(-trailLength, 0, 8, 0);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.7, p.color || '#38BDF8');
      grad.addColorStop(1, '#FFFFFF');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = p.color || '#38BDF8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-trailLength, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();

      // 2. White hot needle point
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(8, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'slash_wave') {
      ctx.strokeStyle = p.color || '#38BDF8';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, p.size || 16, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
    } else if (p.type === 'magic_orb') {
      ctx.fillStyle = p.color || '#C084FC';
      ctx.shadowColor = '#C084FC';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, p.size || 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Sleek Ballistic Bullet Tracer with luminous glow
      const trailLength = 18;
      const grad = ctx.createLinearGradient(-trailLength, 0, 6, 0);
      grad.addColorStop(0, 'rgba(251, 191, 36, 0)');
      grad.addColorStop(0.6, p.color || '#FDE047');
      grad.addColorStop(1, '#FFFFFF');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.0;
      ctx.shadowColor = p.color || '#FDE047';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(-trailLength, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();

      // Sharp luminous head
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(6, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: VisualParticle[]) {
  particles.forEach((pt) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.alpha);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawDamagePopups(ctx: CanvasRenderingContext2D, damagePopups: DamagePopup[]) {
  damagePopups.forEach((dp) => {
    ctx.save();
    const progress = 1 - dp.life / dp.maxLife;
    const isMangaSound = dp.type === 'manga' || ['POW!', 'ПИХ!', 'ПАХ!', 'BANG!', 'RATATA!', 'BOOM!', 'PEW!', 'БДЫЩ!', 'БАБАХ!', 'ТЫДЫЩ!', 'БАНГ!', 'КРАШ!', 'ВЖУХ!', 'ТРА-ТА!', 'ТА-ТА!', 'ПАХ-ПАХ!'].some(w => dp.text === w || dp.text === `${w}!`);

    const scale = isMangaSound
      ? (dp.scale || 0.82) * (0.85 + Math.sin(Math.min(progress * 3, Math.PI / 2)) * 0.25) * (1 - progress * 0.15)
      : (dp.scale || 1.0) * (1 + Math.sin(progress * Math.PI) * 0.25);
    const alpha = Math.max(0, dp.life / dp.maxLife);

    ctx.translate(dp.x, dp.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    if (isMangaSound) {
      // Dynamic manga tilt
      const baseRot = dp.rotation !== undefined ? dp.rotation : -0.12;
      ctx.rotate(baseRot + Math.sin(progress * 5) * 0.05);

      // Measure text for dynamic starburst bounds
      ctx.font = '900 12px Fredoka, Impact, sans-serif';
      const textMetrics = ctx.measureText(dp.text);
      const textWidth = textMetrics.width;

      const outerRx = Math.max(13, textWidth * 0.58 + 4);
      const outerRy = 10.5;
      const innerRx = outerRx * 0.55;
      const innerRy = outerRy * 0.55;

      // Starburst comic shape background
      ctx.fillStyle = '#09090B';
      ctx.strokeStyle = dp.color || '#FACC15';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      const points = 8;
      for (let i = 0; i < points * 2; i++) {
        const isOuter = i % 2 === 0;
        const rx = isOuter ? outerRx : innerRx;
        const ry = isOuter ? outerRy : innerRy;
        const angle = (i * Math.PI) / points;
        const bx = Math.cos(angle) * rx;
        const by = Math.sin(angle) * ry;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Bold Comic Text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.8;
      ctx.strokeText(dp.text, 0, 0);

      ctx.fillStyle = dp.color || '#FACC15';
      ctx.shadowColor = dp.color || '#FACC15';
      ctx.shadowBlur = 6;
      ctx.fillText(dp.text, 0, 0);
      ctx.shadowBlur = 0;
    } else if (dp.type === 'headshot') {
      // Comic Book HEADSHOT! Typography
      ctx.font = '900 18px Fredoka, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 4.5;
      ctx.strokeText(dp.text, 0, 0);

      ctx.fillStyle = '#EF4444';
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 8;
      ctx.fillText(dp.text, 0, 0);
    } else if (dp.type === 'dodge') {
      // Neon Cyan DODGE! Popup
      ctx.font = '900 16px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 4;
      ctx.strokeText(dp.text, 0, 0);

      ctx.fillStyle = '#38BDF8';
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 10;
      ctx.fillText(dp.text, 0, 0);
    } else if (dp.isCrit) {
      // Golden CRIT! Popup
      ctx.font = '900 17px Fredoka, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 4;
      ctx.strokeText(dp.text, 0, 0);

      ctx.fillStyle = '#FACC15';
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 8;
      ctx.fillText(dp.text, 0, 0);
    } else {
      // Standard Crisp Damage Popup
      ctx.font = 'bold 13px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(dp.text, 0, 0);

      ctx.fillStyle = dp.color;
      ctx.fillText(dp.text, 0, 0);
    }
    ctx.restore();
  });
}

function drawAtmosphericOverlay(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  camera: { x: number; y: number },
  localPlayer: Player,
  time: number
) {
  if (vw <= 0 || vh <= 0) return;

  // 1. Standard cinematic dark vignette edges
  const vignette = ctx.createRadialGradient(vw / 2, vh / 2, Math.max(10, vw * 0.35), vw / 2, vh / 2, Math.max(20, vw * 0.75));
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, vw, vh);

  // 2. LOW HP BLOOD PULSE VIGNETTE (Pulsating crimson edges when HP < 35%)
  const curHp = localPlayer?.stats?.hp ?? (localPlayer as any)?.hp ?? 100;
  const curMaxHp = localPlayer?.stats?.maxHp ?? (localPlayer as any)?.maxHp ?? 100;
  const hpRatio = Math.max(0, Math.min(1, curHp / curMaxHp));

  if (hpRatio < 0.35) {
    const pulse = Math.sin(time * 8) * 0.22 + 0.55;
    const bloodIntensity = (1 - hpRatio / 0.35) * pulse;

    const bloodVignette = ctx.createRadialGradient(vw / 2, vh / 2, Math.max(10, vw * 0.18), vw / 2, vh / 2, Math.max(20, vw * 0.65));
    bloodVignette.addColorStop(0, 'rgba(153, 27, 27, 0)');
    bloodVignette.addColorStop(0.7, `rgba(185, 28, 28, ${0.4 * bloodIntensity})`);
    bloodVignette.addColorStop(1, `rgba(127, 29, 29, ${0.85 * bloodIntensity})`);

    ctx.fillStyle = bloodVignette;
    ctx.fillRect(0, 0, vw, vh);
  }
}

function drawAtmosphericFog(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  vw: number,
  vh: number,
  time: number
) {
  // Drifting volumetric mist clouds in world space around camera
  const fogCount = 6;
  for (let i = 0; i < fogCount; i++) {
    const speed = 12 + i * 5;
    const fogX = (camera.x || 0) + (((time * speed + i * 400) % (vw * 1.5 + 400)) - (vw * 0.75 + 200));
    const fogY = (camera.y || 0) + (((i * 220 + Math.sin(time * 0.5 + i) * 60) % (vh * 1.5 + 400)) - (vh * 0.75 + 200));
    const fogRadius = 180 + (i % 3) * 50;
    const fogAlpha = Math.max(0.01, 0.04 + Math.sin(time * 1.5 + i) * 0.012);

    if (fogRadius > 20) {
      const grad = ctx.createRadialGradient(fogX, fogY, 20, fogX, fogY, fogRadius);
      grad.addColorStop(0, `rgba(186, 230, 253, ${fogAlpha * 1.5})`);
      grad.addColorStop(0.6, `rgba(148, 163, 184, ${fogAlpha})`);
      grad.addColorStop(1, 'rgba(148, 163, 184, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fogX, fogY, fogRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRainAndSplashes(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  camera: { x: number; y: number },
  time: number
) {
  ctx.save();
  // Cinematic dark rain ambient tone
  ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
  ctx.fillRect(0, 0, vw, vh);

  // Slanted rain streaks
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.38)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();

  const numDrops = 90;
  for (let i = 0; i < numDrops; i++) {
    const seed = i * 137.5;
    const speed = 750 + (i % 5) * 80;
    const rawX = (seed * 9.1 + (camera.x * 0.3) + time * 140) % (vw + 200) - 100;
    const rawY = (seed * 17.3 + (time * speed) + (camera.y * 0.3)) % (vh + 150) - 50;

    const length = 18 + (i % 4) * 6;
    ctx.moveTo(rawX, rawY);
    ctx.lineTo(rawX - 5, rawY + length);

    // Ground splash ripples (guaranteed positive radius)
    if (rawY > vh - 180 && i % 4 === 0) {
      const splashProgress = Math.max(0.05, Math.min(1, (rawY - (vh - 180)) / 180));
      const splashRadius = Math.max(1, splashProgress * 12);
      ctx.ellipse(rawX, rawY + length, splashRadius, Math.max(0.5, splashRadius * 0.4), 0, 0, Math.PI * 2);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawTacticalAimOverlay(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  player: Player,
  activeGunType: string,
  hitDistance: number = 2600,
  lockedMonster: Monster | null = null,
  time: number = 0
) {
  if (vw <= 0 || vh <= 0) return;

  ctx.save();

  const centerX = vw / 2;
  const centerY = vh / 2;

  if (activeGunType === 'cheytac') {
    // ==========================================
    // 1. CHEYTAC M200 TACTICAL SNIPER SCOPE HUD
    // ==========================================
    // Outer darkened scope vignette
    const scopeGrad = ctx.createRadialGradient(centerX, centerY, Math.min(vw, vh) * 0.28, centerX, centerY, Math.min(vw, vh) * 0.65);
    scopeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    scopeGrad.addColorStop(0.75, 'rgba(3, 7, 18, 0.45)');
    scopeGrad.addColorStop(1, 'rgba(2, 6, 23, 0.85)');
    ctx.fillStyle = scopeGrad;
    ctx.fillRect(0, 0, vw, vh);

    // Subtle tactical grid scanlines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < vh; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(vw, y);
      ctx.stroke();
    }

    // Outer Scope Ring
    const scopeRadius = Math.min(vw, vh) * 0.42;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, scopeRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Outer Range Ticks
    const numTicks = 36;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < numTicks; i++) {
      const angle = (i * Math.PI * 2) / numTicks;
      const isMajor = i % 9 === 0;
      const tickLen = isMajor ? 14 : 7;
      const r1 = scopeRadius;
      const r2 = scopeRadius - tickLen;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * r1, centerY + Math.sin(angle) * r1);
      ctx.lineTo(centerX + Math.cos(angle) * r2, centerY + Math.sin(angle) * r2);
      ctx.stroke();
    }

    // Rotating Precision Mil-Ring
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 80, time * 0.4, time * 0.4 + Math.PI * 1.5);
    ctx.stroke();

    // Central Mil-Dot Crosshairs (Red/Cyan Tactical Style)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 6;

    // Horizontal crosshair line
    ctx.beginPath();
    ctx.moveTo(centerX - 180, centerY);
    ctx.lineTo(centerX - 12, centerY);
    ctx.moveTo(centerX + 12, centerY);
    ctx.lineTo(centerX + 180, centerY);
    ctx.stroke();

    // Vertical crosshair line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 180);
    ctx.lineTo(centerX, centerY - 12);
    ctx.moveTo(centerX, centerY + 12);
    ctx.lineTo(centerX, centerY + 180);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Mil-Dots on reticle
    ctx.fillStyle = '#EF4444';
    for (let d = 25; d <= 160; d += 25) {
      // Horizontal dots
      ctx.beginPath();
      ctx.arc(centerX - d, centerY, 1.8, 0, Math.PI * 2);
      ctx.arc(centerX + d, centerY, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // Elevation drop sub-ticks
      ctx.beginPath();
      ctx.arc(centerX, centerY + d, 1.8, 0, Math.PI * 2);
      ctx.arc(centerX, centerY - d, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center precision aiming pip
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Telemetry Corner Data Display
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(centerX - 190, centerY + scopeRadius - 48, 380, 36);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(centerX - 190, centerY + scopeRadius - 48, 380, 36);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#38BDF8';
    const distMeters = Math.round(hitDistance / 4.5);
    const ammoCount = player.ammo !== undefined ? player.ammo : 5;
    ctx.fillText(`CHEYTAC M200 .408 INTERVENTION // MAG: [${ammoCount}/5] // RNG: ${distMeters}m`, centerX, centerY + scopeRadius - 34);
    
    if (lockedMonster) {
      ctx.fillStyle = '#EF4444';
      ctx.fillText(`[ TARGET LOCK: ${(lockedMonster as Monster).name.toUpperCase()} - ${Math.round((lockedMonster as Monster).hp)} HP ]`, centerX, centerY + scopeRadius - 20);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`// OPTIC: 16X BALLISTIC SCOPE // READY TO ENGAGE`, centerX, centerY + scopeRadius - 20);
    }
  } else {
    // ==========================================
    // 2. STANDARD TACTICAL FIREARM AIM RETICLE
    // ==========================================
    // Tactical screen corner brackets
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    const bracketSize = 25;
    const padding = 35;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(padding, padding + bracketSize);
    ctx.lineTo(padding, padding);
    ctx.lineTo(padding + bracketSize, padding);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(vw - padding - bracketSize, padding);
    ctx.lineTo(vw - padding, padding);
    ctx.lineTo(vw - padding, padding + bracketSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(padding, vh - padding - bracketSize);
    ctx.lineTo(padding, vh - padding);
    ctx.lineTo(padding + bracketSize, vh - padding);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(vw - padding - bracketSize, vh - padding);
    ctx.lineTo(vw - padding, vh - padding);
    ctx.lineTo(vw - padding, vh - padding - bracketSize);
    ctx.stroke();

    // Central Tactical Reticle
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 6;

    // 4 Corner Chevrons around center
    const retRad = 24;
    const armLen = 10;
    // Left
    ctx.beginPath();
    ctx.moveTo(centerX - retRad - armLen, centerY);
    ctx.lineTo(centerX - retRad, centerY);
    ctx.stroke();
    // Right
    ctx.beginPath();
    ctx.moveTo(centerX + retRad, centerY);
    ctx.lineTo(centerX + retRad + armLen, centerY);
    ctx.stroke();
    // Top
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - retRad - armLen);
    ctx.lineTo(centerX, centerY - retRad);
    ctx.stroke();
    // Bottom
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + retRad);
    ctx.lineTo(centerX, centerY + retRad + armLen);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center Aim Dot
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Small Tactical Tag below reticle
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`AIM [${activeGunType.toUpperCase()}]`, centerX, centerY + retRad + 22);
  }

  ctx.restore();
}
