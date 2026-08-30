import { Monster, DropItem, ResourceNode, NPC, Projectile, DamagePopup, VisualParticle, Player, GroundDecal, InteractiveObject } from '../types/game';
import { drawChibiCharacter, drawHumanoidEnemy } from './chibiRenderer';
import { WORLD_WIDTH, WORLD_HEIGHT, ZONES, NPCS_DATABASE, OBSTACLES, INITIAL_INTERACTIVE_OBJECTS } from './constants';

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
  // Screen shake offset calculation
  let shakeX = 0;
  let shakeY = 0;
  if (screenShake.duration > 0 && screenShake.intensity > 0) {
    shakeX = (Math.random() - 0.5) * screenShake.intensity * 2;
    shakeY = (Math.random() - 0.5) * screenShake.intensity * 2;
  }

  const camera = {
    x: localPlayer.x + shakeX,
    y: localPlayer.y + shakeY,
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

  // Apply Camera translation
  ctx.save();
  ctx.translate(canvasWidth / 2 - camera.x, canvasHeight / 2 - camera.y);

  // 1. Draw World Background & Terrain (Forest, Campsite, Rocky Canyon, Mountain Summit)
  drawTerrain(ctx, camera, canvasWidth, canvasHeight, time);

  // 2. Draw Forest Campsite Tents, Campfires, Cliffs, Watchtowers, and Mountain Features
  drawEnvironmentDecor(ctx, camera, canvasWidth, canvasHeight, time);

  // 2.2. Draw Interactive Objects (Red Explosive Barrels & Crates)
  drawInteractiveObjects(ctx, interactiveObjects, time);

  // 2.5. Draw Ground Decals (Blood splatters, bullet impacts, scorch marks)
  drawGroundDecals(ctx, groundDecals);

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
  allPlayers.sort((a, b) => a.y - b.y);

  for (const p of allPlayers) {
    drawChibiCharacter(ctx, p, time);
  }

  // 9. Draw Projectiles (Bullets, Lasers, Shotgun pellets, Slash waves)
  drawProjectiles(ctx, projectiles);

  // 10. Draw Visual Particles (Cherry petals, Sparks, Smoke)
  drawParticles(ctx, particles);

  // 11. Draw Damage Popups
  drawDamagePopups(ctx, damagePopups);

  ctx.restore(); // restore camera

  // 12. Draw Atmospheric Ambient Lighting / Campfire Warmth Overlay
  drawAtmosphericOverlay(ctx, canvasWidth, canvasHeight, camera, time);

  ctx.restore();
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

function drawGroundDecals(ctx: CanvasRenderingContext2D, groundDecals: GroundDecal[]) {
  groundDecals.forEach((decal) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, decal.alpha * (decal.life / decal.maxLife));
    ctx.fillStyle = decal.color;

    ctx.beginPath();
    ctx.ellipse(decal.x, decal.y, decal.radius, decal.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < (decal.splatterCount || 2); i++) {
      const angle = (i * Math.PI * 2) / (decal.splatterCount || 2);
      const dist = decal.radius * 1.2;
      ctx.beginPath();
      ctx.arc(decal.x + Math.cos(angle) * dist, decal.y + Math.sin(angle) * dist, decal.radius * 0.28, 0, Math.PI * 2);
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
    if (m.hp <= 0) return;

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
      const hpRatio = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-22, -32, 44, 6);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(-22, -32, 44 * hpRatio, 6);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.name, 0, -38);
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

    if (p.type === 'laser' || p.range > 2000) {
      // CheyTac / Laser Piercing Needle Bullet
      ctx.fillStyle = p.color || '#E0E7FF';
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 12;
      ctx.fillRect(-18, -2, 36, 4);
    } else if (p.type === 'slash_wave') {
      ctx.strokeStyle = p.color || '#38BDF8';
      ctx.lineWidth = 4;
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
      // Standard / Heavy Bullet tracer
      ctx.fillStyle = p.color || '#FDE047';
      ctx.fillRect(-10, -2, 20, 4);
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
    ctx.font = dp.isCrit ? '900 16px Fredoka, sans-serif' : 'bold 12px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = dp.color;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(dp.text, dp.x, dp.y);
    ctx.restore();
  });
}

function drawAtmosphericOverlay(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  camera: { x: number; y: number },
  time: number
) {
  // Vignette dark edges for cinematic atmosphere
  const vignette = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.35, vw / 2, vh / 2, vw * 0.75);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, vw, vh);
}
