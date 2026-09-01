import { Monster, DropItem, ResourceNode, NPC, Projectile, DamagePopup, VisualParticle, Player, GroundDecal, InteractiveObject, IntroCinematicState, WorldPOI, Platform, CarEntity, SummonedAlly } from '../types/game';
import { drawChibiCharacter, drawHumanoidEnemy, drawPoliceCruiser, drawCyberMuscleCar } from './chibiRenderer';
import { WORLD_WIDTH, WORLD_HEIGHT, ZONES, NPCS_DATABASE, OBSTACLES, INITIAL_INTERACTIVE_OBJECTS, PLATFORMS, WORLD_POIS } from './constants';
import { HORDE_ARENA, HORDE_FEATURES, getHordeBlindness, getHordeHazards, getHordeRiftFx, isInHordeArena, type HordeHazard } from './hordeMode';
import { drawEvolutionFx } from './evolutions';
import { clipToViewBounds, getViewBounds, isInViewBounds } from './viewCull';
import { drawWorldBuildings, drawInteriorPrompt, drawBuildingOccluders, drawInteriorActors } from './buildingRenderer';
import { occupancyMatchesObject, isInteriorWorld } from './buildings';
import { compileRenderScene, recordRenderScene, type RenderScene } from './renderScene';

type RenderSceneLayerContext = CanvasRenderingContext2D & {
  __renderSceneLayer?: (name: 'screen' | 'static' | 'dynamic') => void;
  /** Scene recorders must retain vector commands, never embed raster sprites. */
  __disableSpriteCache?: boolean;
};

function markRenderSceneLayer(ctx: CanvasRenderingContext2D, name: 'screen' | 'static' | 'dynamic') {
  (ctx as RenderSceneLayerContext).__renderSceneLayer?.(name);
}

// Persistent smoothed camera state
let smoothedCameraX = 650;
let smoothedCameraY = 750;
let smoothedZoom = 1.0;
let lastRenderTimestamp = 0;

/**
 * The complete input to the source-of-truth world paint.  Keeping this as a
 * named value means Canvas and a recorded RenderScene cannot gradually grow
 * different argument lists as the game evolves.
 */
export type WorldRenderInput = {
  canvasWidth: number;
  canvasHeight: number;
  localPlayer: Player;
  players: Record<string, Player>;
  monsters: Monster[];
  resourceNodes: ResourceNode[];
  dropItems: DropItem[];
  projectiles: Projectile[];
  particles: VisualParticle[];
  damagePopups: DamagePopup[];
  screenShake?: { intensity: number; duration: number };
  groundDecals?: GroundDecal[];
  time?: number;
  introCinematic?: IntroCinematicState;
  worldPois?: WorldPOI[];
  cars?: CarEntity[];
  summons?: SummonedAlly[];
  gameTimePhase?: number;
};

type WorldPaintLayer = 'full' | 'static' | 'dynamic';
type WorldDrawOptions = {
  layer?: WorldPaintLayer;
  /** Reuses the dynamic pass camera while compiling static invalidations. */
  camera?: { x: number; y: number; zoom: number };
  /** WebView-only hybrid path: a WebGL atlas owns eligible monster bodies. */
  skipWebglHordeMobBodies?: boolean;
  /** WebView-only hybrid path: a WebGL atlas owns eligible player bodies. */
  skipWebglPlayerBodies?: boolean;
  /** WebView-only hybrid path: WebGL owns basic bullet/tracer geometry. */
  skipWebglProjectiles?: boolean;
  /** WebView-only hybrid path: WebGL owns basic particle geometry. */
  skipWebglParticles?: boolean;
  /** Native WGPU owns the generated atlas bodies for this frame. */
  skipNativeSpriteBodies?: boolean;
};

export function getCameraState() {
  return {
    x: smoothedCameraX,
    y: smoothedCameraY,
    zoom: (!isNaN(smoothedZoom) && smoothedZoom > 0.2 && smoothedZoom < 8.0) ? smoothedZoom : 1.0,
  };
}

// Native desktop rendering still uses the JS game state as its source of
// truth. Keep camera and input transforms alive even when Canvas2D is not
// submitting the world frame.
export function updateNativeCamera(localPlayer: Player, time: number) {
  const elapsedSeconds = lastRenderTimestamp === 0
    ? 1 / 60
    : Math.min(0.1, Math.max(0, (time - lastRenderTimestamp) / 1000));
  lastRenderTimestamp = time;
  const activeGunType = localPlayer.equipment?.weapon?.gunType || 'pistol';
  const maxLookAhead = activeGunType === 'cheytac' ? 880 : activeGunType === 'ak47' ? 500 : 360;
  const lookAhead = localPlayer.isAiming && !localPlayer.isInspectingWeapon
    ? maxLookAhead
    : 0;
  const targetX = localPlayer.x + Math.cos(localPlayer.aimAngle || 0) * lookAhead;
  const targetY = localPlayer.y + Math.sin(localPlayer.aimAngle || 0) * lookAhead;
  const factor = 1 - Math.exp(-elapsedSeconds * (localPlayer.isAiming ? 6.5 : 8));
  smoothedCameraX += (targetX - smoothedCameraX) * factor;
  smoothedCameraY += (targetY - smoothedCameraY) * factor;
  const speed = Math.hypot(localPlayer.vx || 0, localPlayer.vy || 0);
  const aimZoom = localPlayer.isAiming ? (activeGunType === 'cheytac' ? 0.46 : 0.68) : 1;
  const targetZoom = localPlayer.isInspectingWeapon
    ? 5.2
    : Math.max(0.4, (1 - Math.min(0.2, (speed / 650) * 0.16)) * aimZoom);
  smoothedZoom += (targetZoom - smoothedZoom) * (1 - Math.exp(-elapsedSeconds * 6));
  return getCameraState();
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

/**
 * Advances the Canvas camera once and returns the exact transform required by
 * a renderer running outside the page's main thread. Keeping this state here
 * makes the Canvas, OffscreenCanvas and native paths share one camera model.
 */
export function advanceCanvasCamera(
  localPlayer: Player,
  time: number,
  screenShake: { intensity: number; duration: number } = { intensity: 0, duration: 0 },
  introCinematic?: IntroCinematicState,
) {
  let shakeX = 0;
  let shakeY = 0;
  if (screenShake.duration > 0 && screenShake.intensity > 0) {
    const factor = Math.min(1, screenShake.duration * 5);
    shakeX = (Math.random() - 0.5) * screenShake.intensity * 2 * factor;
    shakeY = (Math.random() - 0.5) * screenShake.intensity * 2 * factor;
  }

  const activeGunType = localPlayer?.equipment?.weapon?.gunType || 'pistol';
  const maxLookAhead =
    activeGunType === 'cheytac' ? 880 :
    activeGunType === 'ak47' ? 500 :
    activeGunType === 'revolver' ? 440 :
    activeGunType === 'pistol' ? 380 :
    activeGunType === 'shotgun' ? 360 :
    activeGunType === 'mac10' ? 360 : 280;
  const isInspecting = Boolean(localPlayer?.isInspectingWeapon);
  const aimAngle = localPlayer?.aimAngle || 0;
  let targetCamX = (localPlayer?.x ?? 650) + shakeX
    + (!isInspecting && localPlayer?.isAiming ? Math.cos(aimAngle) * maxLookAhead : isInspecting ? (localPlayer?.facing === 'left' ? -14 : 14) : 0);
  let targetCamY = (localPlayer?.y ?? 750) + shakeY
    + (isInspecting ? -3 : !isInspecting && localPlayer?.isAiming ? Math.sin(aimAngle) * maxLookAhead : 0);

  const isCinematicActive = introCinematic && introCinematic.phase !== 'none' && introCinematic.phase !== 'complete';
  if (isCinematicActive) {
    if (introCinematic.phase === 'dive') {
      targetCamX = 650 + shakeX;
      targetCamY = Math.max(350, (localPlayer?.y ?? 0) + 120) + shakeY;
    } else if (introCinematic.phase === 'impact' || introCinematic.phase === 'skid') {
      targetCamX = (localPlayer?.x ?? 650) + shakeX;
      targetCamY = 750 + shakeY;
    } else {
      targetCamX = 880 + shakeX;
      targetCamY = 745 + shakeY;
    }
  }

  const dt = (lastRenderTimestamp > 0 && time > lastRenderTimestamp) ? Math.min(0.1, time - lastRenderTimestamp) : 0.016;
  lastRenderTimestamp = time;
  const camLerpSpeed = isCinematicActive ? 12 : isInspecting ? 9 : localPlayer?.isAiming ? 6.5 : 8;
  if (isNaN(smoothedCameraX) || Math.abs(smoothedCameraX - targetCamX) > 4000) {
    smoothedCameraX = targetCamX;
    smoothedCameraY = targetCamY;
  } else {
    const factor = 1 - Math.exp(-dt * camLerpSpeed);
    smoothedCameraX += (targetCamX - smoothedCameraX) * factor;
    smoothedCameraY += (targetCamY - smoothedCameraY) * factor;
  }

  const speed = Math.hypot(localPlayer?.vx || 0, localPlayer?.vy || 0);
  let targetZoom = Math.max(0.4, (1 - Math.min(0.2, (speed / 650) * 0.16))
    * (localPlayer?.isAiming ? (activeGunType === 'cheytac' ? 0.46 : 0.68) : 1));
  if (localPlayer?.isInspectingWeapon) targetZoom = 5.2;
  if (isInHordeArena(localPlayer?.x ?? 0, localPlayer?.y ?? 0) && !localPlayer?.isInspectingWeapon) {
    targetZoom = Math.min(targetZoom, 0.72);
  }
  if (isCinematicActive) {
    if (introCinematic.phase === 'dive') targetZoom = 0.85;
    else if (introCinematic.phase === 'impact' || introCinematic.phase === 'skid') targetZoom = 0.8;
    else if (introCinematic.phase === 'dazed' || introCinematic.phase === 'brush' || introCinematic.phase === 'gun_fall_bonk') targetZoom = 1.3;
    else if (introCinematic.phase === 'pickup_ready') targetZoom = 1.15;
  }
  const zoomLerpSpeed = isCinematicActive ? 7 : localPlayer?.isInspectingWeapon ? 8 : localPlayer?.isAiming ? 5.5 : 6;
  if (isNaN(smoothedZoom) || smoothedZoom <= 0.1 || smoothedZoom > 8) {
    smoothedZoom = 1;
  } else {
    smoothedZoom += (targetZoom - smoothedZoom) * (1 - Math.exp(-0.016 * zoomLerpSpeed));
  }

  return {
    x: Math.round(smoothedCameraX),
    y: Math.round(smoothedCameraY),
    zoom: (!isNaN(smoothedZoom) && smoothedZoom > 0.2 && smoothedZoom < 8) ? smoothedZoom : 1,
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
  time: number = 0,
  introCinematic?: IntroCinematicState,
  worldPois: WorldPOI[] = WORLD_POIS,
  cars: CarEntity[] = [],
  summons: SummonedAlly[] = [],
  gameTimePhase: number = 0.35,
  options: WorldDrawOptions = {}
) {
  let camera: { x: number; y: number; zoom?: number };
  if (options.camera) {
    camera = { x: options.camera.x, y: options.camera.y };
  } else {
    camera = advanceCanvasCamera(localPlayer, time, screenShake, introCinematic);
  }

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
    time,
    introCinematic,
    worldPois,
    cars,
    summons,
    gameTimePhase,
    options.layer ?? 'full',
    options.camera?.zoom ?? camera.zoom,
    options.skipWebglHordeMobBodies ?? false,
    options.skipWebglPlayerBodies ?? false,
    options.skipWebglProjectiles ?? false,
    options.skipWebglParticles ?? false,
    options.skipNativeSpriteBodies ?? false,
  );
}

export function drawWorldInput(
  ctx: CanvasRenderingContext2D,
  input: WorldRenderInput,
  options: WorldDrawOptions = {}
) {
  drawWorld(
    ctx,
    input.canvasWidth,
    input.canvasHeight,
    input.localPlayer,
    input.players,
    input.monsters,
    input.resourceNodes,
    input.dropItems,
    input.projectiles,
    input.particles,
    input.damagePopups,
    input.screenShake,
    input.groundDecals,
    input.time,
    input.introCinematic,
    input.worldPois,
    input.cars,
    input.summons,
    input.gameTimePhase,
    options
  );
}

/**
 * Executes the *existing* Canvas paint and captures the same operations as a
 * backend-neutral display list.  This must be used only by the native scene
 * pipeline: ordinary Canvas rendering calls `drawWorldInput` directly and
 * does not pay proxy/serialization overhead.
 */
export function recordWorldScene(
  ctx: CanvasRenderingContext2D,
  input: WorldRenderInput
): RenderScene {
  const recorded = recordRenderScene(
    ctx,
    {
      viewport: { width: input.canvasWidth, height: input.canvasHeight },
      camera: getCameraState(),
      timeSeconds: input.time ?? 0,
    },
    (sceneContext) => drawWorldInput(sceneContext, input)
  );
  // `drawWorld` performs camera smoothing before issuing world commands.
  // Store that final transform, not the value from the preceding frame.
  recorded.scene.camera = getCameraState();
  return recorded.scene;
}

/**
 * Native scene compiler. It runs the exact source draw order but does not
 * paint to Canvas, so it avoids the duplicate CPU raster pass that a
 * record-and-forward approach would impose on every WGPU frame.
 */
export function compileWorldScene(
  measurementContext: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  input: WorldRenderInput
): RenderScene {
  const compiled = compileRenderScene(
    measurementContext,
    {
      viewport: { width: input.canvasWidth, height: input.canvasHeight },
      camera: getCameraState(),
      timeSeconds: input.time ?? 0,
    },
    (sceneContext) => drawWorldInput(sceneContext, input)
  );
  compiled.scene.camera = getCameraState();
  return compiled.scene;
}

/**
 * Realtime compiler: skips terrain, buildings and all retained world props.
 * This is the only source renderer work done at the dynamic cadence.
 */
export function compileDynamicWorldScene(
  measurementContext: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  input: WorldRenderInput,
  camera: { x: number; y: number; zoom: number }
): RenderScene {
  const compiled = compileRenderScene(
    measurementContext,
    {
      viewport: { width: input.canvasWidth, height: input.canvasHeight },
      camera,
      timeSeconds: input.time ?? 0,
    },
    (sceneContext) => drawWorldInput(sceneContext, input, { layer: 'dynamic', camera })
  );
  compiled.scene.camera = camera;
  return compiled.scene;
}

/**
 * Static compilation runs only when the camera crosses a retained-world tile
 * or the viewport/POIs change. It reuses the already-smoothed camera from the
 * dynamic pass and therefore never advances gameplay camera state a second
 * time.
 */
export function compileStaticWorldScene(
  measurementContext: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  input: WorldRenderInput,
  camera: { x: number; y: number; zoom: number }
): RenderScene {
  const compiled = compileRenderScene(
    measurementContext,
    {
      viewport: { width: input.canvasWidth, height: input.canvasHeight },
      camera,
      timeSeconds: input.time ?? 0,
    },
    (sceneContext) => drawWorldInput(sceneContext, input, { layer: 'static', camera })
  );
  compiled.scene.camera = camera;
  return compiled.scene;
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
  time: number = 0,
  introCinematic?: IntroCinematicState,
  worldPois: WorldPOI[] = WORLD_POIS,
  cars: CarEntity[] = [],
  summons: SummonedAlly[] = [],
  gameTimePhase: number = 0.35,
  layer: WorldPaintLayer = 'full',
  fixedZoom?: number,
  skipWebglHordeMobBodies = false,
  skipWebglPlayerBodies = false,
  skipWebglProjectiles = false,
  skipWebglParticles = false,
  skipNativeSpriteBodies = false,
) {
  const renderStatic = layer !== 'dynamic';
  const renderDynamic = layer !== 'static';
  ctx.save();
  // Clear screen — tinted by time of day
  if (renderStatic) {
    markRenderSceneLayer(ctx, 'screen');
    ctx.fillStyle = getSkyClearColor(gameTimePhase);
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // Buttery-Smooth Dynamic Camera Zoom
  const dt = 0.016;
  const vx = (localPlayer && typeof localPlayer.vx === 'number' && !isNaN(localPlayer.vx)) ? localPlayer.vx : 0;
  const vy = (localPlayer && typeof localPlayer.vy === 'number' && !isNaN(localPlayer.vy)) ? localPlayer.vy : 0;
  const currentSpeed = Math.sqrt(vx * vx + vy * vy) || 0;
  
  const activeGunType = localPlayer?.equipment?.weapon?.gunType || 'pistol';
  let safeZoom = fixedZoom;
  if (safeZoom === undefined) {
    // CheyTac sniper zooms out the farthest for massive battlefield awareness!
    const aimZoomFactor = localPlayer?.isAiming ? (activeGunType === 'cheytac' ? 0.46 : 0.68) : 1.0;
    let targetZoom = Math.max(0.40, (1.0 - Math.min(0.20, (currentSpeed / 650) * 0.16)) * aimZoomFactor);
    if (localPlayer?.isInspectingWeapon) {
      targetZoom = 5.2;
    }
    if (isInHordeArena(localPlayer?.x ?? 0, localPlayer?.y ?? 0) && !localPlayer?.isInspectingWeapon) {
      targetZoom = Math.min(targetZoom, 0.72);
    }
    if (introCinematic && introCinematic.phase !== 'none' && introCinematic.phase !== 'complete') {
      const phase = introCinematic.phase;
      if (phase === 'dive') targetZoom = 0.85;
      else if (phase === 'impact' || phase === 'skid') targetZoom = 0.80;
      else if (phase === 'dazed' || phase === 'brush' || phase === 'gun_fall_bonk') targetZoom = 1.30;
      else if (phase === 'pickup_ready') targetZoom = 1.15;
    }
    const zoomLerpSpeed = (introCinematic && introCinematic.phase !== 'none' && introCinematic.phase !== 'complete') ? 7.0 : localPlayer?.isInspectingWeapon ? 8.0 : localPlayer?.isAiming ? 5.5 : 6.0;
    if (isNaN(smoothedZoom) || typeof smoothedZoom !== 'number' || smoothedZoom <= 0.1 || smoothedZoom > 8) {
      smoothedZoom = 1.0;
    } else {
      smoothedZoom += (targetZoom - smoothedZoom) * (1 - Math.exp(-dt * zoomLerpSpeed));
    }
    safeZoom = (!isNaN(smoothedZoom) && smoothedZoom > 0.2 && smoothedZoom < 8.0) ? smoothedZoom : 1.0;
  }

  const resolvedZoom = safeZoom ?? 1.0;

  // Apply Camera translation & dynamic smooth zoom (centered on canvas)
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(resolvedZoom, resolvedZoom);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  ctx.translate(Math.round(canvasWidth / 2 - camera.x), Math.round(canvasHeight / 2 - camera.y));
  // Everything before the next marker is level geometry. It can be retained
  // by WGPU and moved through a camera uniform instead of crossing the
  // WebView bridge every simulation update.
  if (renderStatic) markRenderSceneLayer(ctx, 'static');

  const playerX = localPlayer?.x ?? 0;
  const playerY = localPlayer?.y ?? 0;

  const occupancy = {
    buildingId: localPlayer.interiorBuildingId ?? null,
    floor: localPlayer.interiorFloor ?? 0,
  };
  const indoors = !!(occupancy.buildingId || (isInteriorWorld(localPlayer.x) && !isInHordeArena(playerX, playerY)));
  const inHorde = isInHordeArena(playerX, playerY);
  const blindness = getHordeBlindness();
  const blinded = inHorde && blindness.active && blindness.remaining > 0;
  const viewBounds = getViewBounds(camera.x, camera.y, canvasWidth, canvasHeight, resolvedZoom);
  const skipViewCull = indoors;
  const inView = (x: number, y: number) => skipViewCull || isInViewBounds(x, y, viewBounds);

  ctx.save();
  if (!skipViewCull) {
    clipToViewBounds(ctx, viewBounds);
  }

  if (renderStatic && !indoors) {
    if (inHorde) {
      if (blinded) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(viewBounds.minX, viewBounds.minY, viewBounds.maxX - viewBounds.minX, viewBounds.maxY - viewBounds.minY);
      } else {
        drawHordeArena(ctx, camera, canvasWidth, canvasHeight, time, viewBounds);
      }
    } else {
      drawTerrain(ctx, camera, canvasWidth, canvasHeight, time);
      drawPlatformsAndBridges(ctx, camera, time);
    }
  }

  if (renderStatic && !inHorde) {
    drawWorldBuildings(ctx, localPlayer, occupancy, time);
  }

  if (renderStatic && !indoors && !inHorde) {
    drawWorldPois(ctx, worldPois.filter((p) => inView(p.x, p.y)), localPlayer, time);
    drawEnvironmentDecor(ctx, camera, canvasWidth, canvasHeight, time);
  }

  // These entities are world dressing rather than combat state. Keeping them
  // in the retained texture prevents a crowded town from becoming an
  // accidental per-frame mesh, while their actual mutable actors remain in
  // the dynamic pass below.
  if (renderStatic) {
    drawInteractiveObjects(
      ctx,
      indoors ? interactiveObjects : interactiveObjects.filter((o) => inView(o.x, o.y)),
      time,
      occupancy
    );
    if (!indoors && !inHorde) {
      drawUrbanAtmosphereAndNeons(ctx, camera, canvasWidth, canvasHeight, time);
      drawResourceNodes(ctx, resourceNodes.filter((n) => inView(n.x, n.y)), time);
      drawNPCs(ctx, npcs.filter((n) => inView(n.x, n.y)), time);
      drawGiantAncientTreesAndCanopies(ctx, localPlayer, time);
    }
  }

  if (!renderDynamic) {
    // Static-only compilation stops before every mutable/animated object.
    ctx.restore(); // view clip
    ctx.restore(); // world transform
    ctx.restore(); // canvas state
    return;
  }

  // From here on objects can be destroyed, animated or change with combat.
  // Keep one unconditional boundary so interiors do not accidentally freeze
  // their actors in the retained static layer.
  markRenderSceneLayer(ctx, 'dynamic');

  if (!indoors) {
    // Cars are simulation actors: their positions change every tick. They
    // must not invalidate the retained terrain texture on every movement.
    drawWorldCars(ctx, cars.filter((c) => inView(c.x + 50, c.y + 24)), localPlayer, time);
    drawGroundDecals(
      ctx,
      blinded ? [] : (inHorde ? groundDecals.filter((d) => inView(d.x, d.y)) : groundDecals.filter((d) => inView(d.x, d.y))),
      time
    );
    if (!inHorde) {
    }
    drawDropItems(ctx, dropItems.filter((d) => inView(d.x, d.y) && (!blinded || d.isXpGem)), time);
    if (!inHorde) {
    }
    const visibleMonsters = monsters.filter((m) => {
      if (m.state === 'dead' || !inView(m.x, m.y)) return false;
      if (!blinded) return true;
      if (m.id === blindness.casterId) return true;
      if ((m.hitFlash || 0) > 0) return true;
      if (m.battleBark && m.battleBark.timer > 0) return true;
      return false;
    });
    if (!blinded) {
      drawMonsterTelegraphs(ctx, visibleMonsters, time);
    }
    drawHordeHazards(ctx, getHordeHazards().filter((h) => inView(h.x, h.y)), time);
    drawMonsters(ctx, visibleMonsters, time, skipWebglHordeMobBodies, skipNativeSpriteBodies);
    if (blinded) {
      drawBlindScreams(ctx, monsters.filter((m) => m.battleBark && m.battleBark.timer > 0 && inView(m.x, m.y)), time);
    }
    if (!blinded) drawSummons(ctx, summons.filter((s) => inView(s.x, s.y)), time);
  } else {
    drawDropItems(ctx, dropItems, time);
  }

  // 8. Draw Remote & Local Players (Z-sorted by Y position)
  const allPlayers = Object.values(players);
  if (!players[localPlayer.id]) {
    allPlayers.push(localPlayer);
  }
  allPlayers.sort((a, b) => (a.y || 0) - (b.y || 0));

  for (const p of allPlayers) {
    if (p.id === localPlayer.id || inView(p.x, p.y)) {
      if (p.id === localPlayer.id) drawEvolutionFx(ctx, p, time, inHorde);
      
      const isOmni = (p.omnislashStrikesLeft ?? 0) > 0;
      const isDashSlashing = (p.dashSlashTimer ?? 0) > 0;

      const useWebglPlayerBody = skipWebglPlayerBodies && getWebglPlayerAtlasKey(p) !== null;
      const useNativeSpriteBody = skipNativeSpriteBodies && getNativePlayerSpriteFrame(p) !== null;
      if (useWebglPlayerBody || useNativeSpriteBody) continue;
      if (isOmni) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        drawChibiCharacter(ctx, p, time);
        ctx.restore();
      } else if (isDashSlashing) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        drawChibiCharacter(ctx, p, time);
        ctx.restore();
      } else {
        drawChibiCharacter(ctx, p, time);
      }
    }
  }
  if (!inHorde) {
    drawBuildingOccluders(ctx, localPlayer, occupancy, time);
    drawInteriorActors(ctx, occupancy, time);
    drawInteriorPrompt(ctx, localPlayer, occupancy);
  }

  // 8.2. Draw Falling / Ground Weapon during Intro Cinematic
  drawFallingCinematicWeapon(ctx, localPlayer, introCinematic, time);

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
  const visProj = projectiles.filter((p) => inView(p.x, p.y));
  drawProjectiles(ctx, skipWebglProjectiles ? visProj.filter((p) => !isWebglProjectile(p)) : visProj);
  const visibleParticles = particles.filter((p) => inView(p.x, p.y));
  drawParticles(ctx, skipWebglParticles ? visibleParticles.filter((p) => !isWebglParticle(p)) : visibleParticles);
  drawDamagePopups(ctx, damagePopups.filter((p) => inView(p.x, p.y)));

  ctx.restore();

  ctx.restore(); // restore camera & zoom

  // The remaining effects are viewport-relative. Native keeps them separate
  // from the camera-relative combat mesh so a delayed mesh build cannot make
  // the entire world appear frozen.
  markRenderSceneLayer(ctx, 'screen');

  if (renderDynamic) {
    // 12. Day/night ambient tint
    if (!inHorde) {
      drawDayNightOverlay(ctx, canvasWidth, canvasHeight, gameTimePhase);
    }

    // 13. Draw Atmospheric Ambient Lighting & Low HP Blood Heartbeat Overlay
    drawAtmosphericOverlay(ctx, canvasWidth, canvasHeight, camera, localPlayer, time);
    if (blinded) {
      ctx.fillStyle = 'rgba(232, 121, 249, 0.8)';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VISION NULL — HUNT THE SCREAM', canvasWidth / 2, canvasHeight * 0.16);
    }

    // 14. Draw Fullscreen Tactical Sniper HUD Scope Overlay (when aiming with CheyTac or Firearms)
    if (localPlayer.isAiming) {
      drawTacticalAimOverlay(ctx, canvasWidth, canvasHeight, localPlayer, activeGunType, laserHitDistance, lockedMonster, time);
    }

    // 15. Draw Cinematic Re-Entry Speed Lines, Black Fade, Letterbox & Tech HUD Overlays
    drawCinematicOverlays(ctx, canvasWidth, canvasHeight, introCinematic, localPlayer, time);
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
    } else if (d.type === 'ice_trail') {
      ctx.fillStyle = 'rgba(186, 230, 253, 0.42)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, rad, Math.max(0.5, rad * 0.65), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-rad * 0.3, -rad * 0.1, 3.2, 0, Math.PI * 2);
      ctx.arc(rad * 0.25, rad * 0.15, 2.2, 0, Math.PI * 2);
      ctx.arc(-rad * 0.05, rad * 0.25, 2.8, 0, Math.PI * 2);
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
  // =========================================================
  // 1. FOREST & SURVIVOR CAMPSITE (Top-Left: 0,0 to 2000, 1600)
  // =========================================================
  ctx.fillStyle = '#162C1E'; // Rich forest pine green
  ctx.fillRect(0, 0, 2000, 1600);

  // Wildflower dots and grass tufts across forest floor
  ctx.fillStyle = '#1F3F2B';
  for (let i = 0; i < 40; i++) {
    const gx = ((i * 197) % 1900) + 50;
    const gy = ((i * 349) % 1500) + 50;
    ctx.beginPath();
    ctx.arc(gx, gy, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Campsite Dirt & Gravel Clearing
  ctx.fillStyle = '#30261A'; // Earthen camp floor
  ctx.beginPath();
  ctx.ellipse(680, 650, 480, 340, 0, 0, Math.PI * 2);
  ctx.fill();

  // Campsite Outer Gravel Fringe
  ctx.strokeStyle = '#271F15';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.ellipse(680, 650, 490, 350, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Dirt paths connecting tents
  ctx.strokeStyle = '#3F3223';
  ctx.lineWidth = 42;
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

  // =========================================================
  // 2. DENSE ANCIENT REDWOOD & PINE FOREST (Bottom-Left: 0, 1600 to 2600, 3200)
  // =========================================================
  ctx.fillStyle = '#0E1F14'; // Deep mossy ancient woods
  ctx.fillRect(0, 1600, 2600, 1600);

  // Organic moss & clover patches
  ctx.fillStyle = '#142E1E';
  for (let i = 0; i < 35; i++) {
    const mx = ((i * 283) % 2500) + 50;
    const my = 1650 + ((i * 199) % 1400);
    ctx.beginPath();
    ctx.ellipse(mx, my, 45 + (i % 25), 25 + (i % 15), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------
  // 2.1. FOREST CRYSTAL STREAM / WINDING RIVER (Flows across deep forest)
  // ---------------------------------------------------------
  ctx.save();
  // River Sand & Pebble Banks
  ctx.strokeStyle = '#2B3B28';
  ctx.lineWidth = 110;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 1950);
  ctx.quadraticCurveTo(550, 2050, 950, 2150);
  ctx.quadraticCurveTo(1450, 2250, 1900, 2600);
  ctx.quadraticCurveTo(2250, 2850, 2600, 3100);
  ctx.stroke();

  // Main Translucent Azure Water Body
  const riverGrad = ctx.createLinearGradient(0, 1950, 2600, 3100);
  riverGrad.addColorStop(0, '#0284C7');
  riverGrad.addColorStop(0.5, '#0EA5E9');
  riverGrad.addColorStop(1, '#0369A1');
  ctx.strokeStyle = riverGrad;
  ctx.lineWidth = 75;
  ctx.beginPath();
  ctx.moveTo(0, 1950);
  ctx.quadraticCurveTo(550, 2050, 950, 2150);
  ctx.quadraticCurveTo(1450, 2250, 1900, 2600);
  ctx.quadraticCurveTo(2250, 2850, 2600, 3100);
  ctx.stroke();

  // Animated Water Flow Streaks along the river curve
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)';
  ctx.lineWidth = 3;
  const riverSegments = [
    { p0: { x: 0, y: 1950 }, p1: { x: 550, y: 2050 }, p2: { x: 950, y: 2150 } },
    { p0: { x: 950, y: 2150 }, p1: { x: 1450, y: 2250 }, p2: { x: 1900, y: 2600 } },
    { p0: { x: 1900, y: 2600 }, p1: { x: 2250, y: 2850 }, p2: { x: 2600, y: 3100 } },
  ];
  const sampleRiverPoint = (t: number) => {
    const segCount = riverSegments.length;
    const scaled = Math.min(0.9999, Math.max(0, t)) * segCount;
    const idx = Math.min(segCount - 1, Math.floor(scaled));
    const lt = scaled - idx;
    const seg = riverSegments[idx];
    const x = (1 - lt) ** 2 * seg.p0.x + 2 * (1 - lt) * lt * seg.p1.x + lt ** 2 * seg.p2.x;
    const y = (1 - lt) ** 2 * seg.p0.y + 2 * (1 - lt) * lt * seg.p1.y + lt ** 2 * seg.p2.y;
    const tx = 2 * (1 - lt) * (seg.p1.x - seg.p0.x) + 2 * lt * (seg.p2.x - seg.p1.x);
    const ty = 2 * (1 - lt) * (seg.p1.y - seg.p0.y) + 2 * lt * (seg.p2.y - seg.p1.y);
    const angle = Math.atan2(ty, tx);
    return { x, y, angle };
  };

  for (let s = 0; s < 10; s++) {
    const offsetT = (time * 0.14 + s * 0.09) % 1.0;
    const pt = sampleRiverPoint(offsetT);
    const waveLen = 30;
    const perp = Math.sin(time * 5.5 + s) * 5;
    const cosA = Math.cos(pt.angle);
    const sinA = Math.sin(pt.angle);
    const perpX = -sinA;
    const perpY = cosA;
    ctx.beginPath();
    ctx.moveTo(pt.x - cosA * waveLen, pt.y - sinA * waveLen);
    ctx.quadraticCurveTo(
      pt.x + perpX * perp,
      pt.y + perpY * perp,
      pt.x + cosA * waveLen,
      pt.y + sinA * waveLen
    );
    ctx.stroke();
  }

  // Stepping Stones across the stream (Walkable natural crossings)
  const stones = [
    { x: 920, y: 2130, r: 16 },
    { x: 950, y: 2150, r: 18 },
    { x: 980, y: 2170, r: 15 },
    { x: 1870, y: 2580, r: 16 },
    { x: 1900, y: 2605, r: 18 },
    { x: 1930, y: 2630, r: 15 },
  ];
  stones.forEach((st) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(st.x, st.y + 6, st.r, st.r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Moss top on stone
    ctx.fillStyle = '#15803D';
    ctx.beginPath();
    ctx.arc(st.x, st.y - st.r * 0.3, st.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // =========================================================
  // 3. MOUNTAIN FOOTHILLS & ROCKY CANYON PASS (Top-Right: 1800,0 to 5300, 1600)
  // =========================================================
  // Low Canyon Gorge Floor (The deep chasm bed below cliffs and bridges)
  ctx.fillStyle = '#261F1A'; // Deep shadowy gorge rock
  ctx.fillRect(1800, 0, 3500, 1600);

  // Gorge Scree & Sand Valley
  ctx.fillStyle = '#3D2F24';
  ctx.beginPath();
  ctx.moveTo(1900, 480);
  ctx.lineTo(5200, 460);
  ctx.lineTo(5200, 1140);
  ctx.lineTo(1900, 1100);
  ctx.closePath();
  ctx.fill();

  // Dry cracked gorge earth fissures
  ctx.strokeStyle = 'rgba(15, 10, 8, 0.55)';
  ctx.lineWidth = 2;
  for (let f = 0; f < 16; f++) {
    const fx = 2100 + ((f * 193) % 2900);
    const fy = 550 + ((f * 97) % 480);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 25, fy + 12);
    ctx.lineTo(fx + 45, fy + 6);
    ctx.stroke();
  }

  // Abandoned Minecart Railway Tracks running through the gorge
  ctx.save();
  ctx.strokeStyle = '#451A03'; // Wooden Ties
  ctx.lineWidth = 6;
  for (let rx = 2000; rx < 5000; rx += 28) {
    ctx.beginPath();
    ctx.moveTo(rx, 810);
    ctx.lineTo(rx, 850);
    ctx.stroke();
  }
  // Iron Steel Rails
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(2000, 818);
  ctx.lineTo(5000, 818);
  ctx.moveTo(2000, 842);
  ctx.lineTo(5000, 842);
  ctx.stroke();
  ctx.restore();

  // =========================================================
  // 4. HIGH ROCK SUMMIT & WELDER'S ARENA (Bottom-Right: 2600, 1600 to 5300, 3100)
  // =========================================================
  ctx.fillStyle = '#1A1820'; // Volcanic basalt rock ground
  ctx.fillRect(2600, 1600, 2700, 1500);

  // Summit Arena Plateau Ground
  ctx.fillStyle = '#2A2430';
  ctx.beginPath();
  ctx.roundRect(2850, 1800, 1750, 1200, 50);
  ctx.fill();

  // Welder Industrial Scrap Ground Trim
  ctx.strokeStyle = 'rgba(234, 88, 12, 0.2)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2950, 1880, 1550, 1020);

  // =========================================================
  // 5. BOTTOM WARZONE: POLICE SWAT PRECINCT (Y >= 3100, Left)
  // =========================================================
  ctx.fillStyle = '#0B132B'; // Heavy dark tactical police asphalt
  ctx.fillRect(0, 3100, 2500, 1300);

  // Concrete Paved Sidewalks with Beveled Curbs
  ctx.fillStyle = '#1E293B';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 3;
  // North Sidewalk
  ctx.fillRect(250, 3180, 2100, 50);
  ctx.strokeRect(250, 3180, 2100, 50);
  // South Sidewalk
  ctx.fillRect(250, 3720, 2100, 50);
  ctx.strokeRect(250, 3720, 2100, 50);

  // Sidewalk Concrete Slabs Tile Joints
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
  ctx.lineWidth = 1.5;
  for (let sx = 290; sx < 2350; sx += 60) {
    ctx.beginPath();
    ctx.moveTo(sx, 3180);
    ctx.lineTo(sx, 3230);
    ctx.moveTo(sx, 3720);
    ctx.lineTo(sx, 3770);
    ctx.stroke();
  }

  // Police Precinct Tactical Perimeter Marking
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 6;
  ctx.strokeRect(380, 3200, 2050, 1050);

  // Police Helipad H Circle (x: 1200, y: 3750)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(1200, 3750, 110, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.font = '900 58px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POLICE', 1200, 3750);

  // Sewer Manhole Covers with Animated Rising Steam Plumes
  const manholes = [
    { x: 650, y: 3450 },
    { x: 1450, y: 3500 },
    { x: 3350, y: 3450 },
    { x: 4150, y: 3500 },
  ];
  manholes.forEach((mh) => {
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(mh.x, mh.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ribbed Grate Pattern
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mh.x - 14, mh.y);
    ctx.lineTo(mh.x + 14, mh.y);
    ctx.moveTo(mh.x, mh.y - 14);
    ctx.lineTo(mh.x, mh.y + 14);
    ctx.stroke();

    // Billowing Steam from Manhole
    for (let st = 0; st < 3; st++) {
      const sProg = ((time * 0.8 + st * 0.33) % 1.0);
      const sAlpha = (1 - sProg) * 0.4;
      ctx.fillStyle = `rgba(224, 242, 254, ${sAlpha})`;
      ctx.beginPath();
      ctx.arc(mh.x + Math.sin(time * 3 + st) * 6, mh.y - sProg * 45, 8 + sProg * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // =========================================================
  // 6. BOTTOM WARZONE: DEMON PUNK SYNDICATE (Y >= 3100, Right)
  // =========================================================
  ctx.fillStyle = '#141115'; // Dark scorched asphalt & industrial grime
  ctx.fillRect(2500, 3100, 2900, 1300);

  // Punk Alley Battered Sidewalks
  ctx.fillStyle = '#1C1917';
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 3;
  ctx.fillRect(2600, 3180, 2300, 48);
  ctx.strokeRect(2600, 3180, 2300, 48);
  ctx.fillRect(2600, 3720, 2300, 48);
  ctx.strokeRect(2600, 3720, 2300, 48);

  // Toxic Neon Paint Slicks on Asphalt
  ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
  ctx.beginPath();
  ctx.ellipse(3400, 3500, 180, 70, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(168, 85, 247, 0.08)';
  ctx.beginPath();
  ctx.ellipse(4300, 3520, 220, 80, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Anarchy Pit Red Border & Hazard Trim
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(2600, 3200, 2600, 1050);

  // Large Red Anarchy Symbol (x: 4000, y: 3750)
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(4000, 3750, 130, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
  ctx.font = '900 72px Fredoka, sans-serif';
  ctx.fillText('ANARCHY', 4000, 3750);

  // =========================================================
  // 7. WARZONE FRONTLINE BOULEVARD (Central Highway Avenue)
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

  // White Crosswalk Zebra Stripes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let y = 3300; y < 4300; y += 180) {
    for (let x = 2220; x < 2880; x += 45) {
      ctx.fillRect(x, y, 25, 60);
    }
  }

  drawBiomeSeams(ctx);
  drawCrucibleGateCircle(ctx, time);
}

function drawBlendX(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  left: string,
  right: string
) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, left);
  g.addColorStop(0.45, left);
  g.addColorStop(0.55, right);
  g.addColorStop(1, right);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawBlendY(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  top: string,
  bot: string
) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, top);
  g.addColorStop(0.45, top);
  g.addColorStop(0.55, bot);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawSeamBlotches(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colorA: string,
  colorB: string,
  count: number
) {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const jitter = ((i * 73) % 17) - 8;
    const x = x0 + (x1 - x0) * t + jitter * 4;
    const y = y0 + (y1 - y0) * t + ((i * 41) % 13) * 3;
    const rx = 55 + (i % 5) * 18;
    const ry = 32 + (i % 4) * 12;
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (i % 7) * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBiomeSeams(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const camp = '#162C1E';
  const forest = '#0E1F14';
  const canyon = '#261F1A';
  const summit = '#1A1820';
  const police = '#0B132B';
  const punk = '#141115';
  const warzone = '#09090B';

  // Forest camp ↔ rocky canyon (x ~ 1800)
  drawBlendX(ctx, 1620, 0, 420, 1600, camp, canyon);
  drawSeamBlotches(ctx, 1700, 120, 1980, 1500, camp, canyon, 14);

  // Camp ↔ dense forest (y ~ 1600)
  drawBlendY(ctx, 0, 1420, 2000, 380, camp, forest);
  drawSeamBlotches(ctx, 80, 1500, 1900, 1720, camp, forest, 12);

  // Canyon ↔ welder summit (y ~ 1600)
  drawBlendY(ctx, 1800, 1420, 3500, 380, canyon, summit);
  drawSeamBlotches(ctx, 1900, 1480, 5100, 1740, canyon, summit, 16);

  // Dense forest ↔ summit (x ~ 2600)
  drawBlendX(ctx, 2410, 1600, 400, 1500, forest, summit);
  drawSeamBlotches(ctx, 2480, 1680, 2740, 3000, forest, summit, 14);

  // Wilderness ↔ metro/punk city (y ~ 3100)
  drawBlendY(ctx, 0, 2920, 2500, 400, forest, police);
  drawBlendY(ctx, 2500, 2920, 2900, 400, summit, punk);
  drawSeamBlotches(ctx, 80, 3000, 2400, 3220, forest, police, 12);
  drawSeamBlotches(ctx, 2600, 3000, 5100, 3220, summit, punk, 12);

  // Police ↔ frontline ↔ punk
  drawBlendX(ctx, 1980, 3100, 320, 1300, police, warzone);
  drawBlendX(ctx, 2760, 3100, 320, 1300, warzone, punk);
  drawSeamBlotches(ctx, 2080, 3180, 2280, 4250, police, warzone, 10);
  drawSeamBlotches(ctx, 2820, 3180, 3040, 4250, warzone, punk, 10);

  ctx.restore();
}

function drawCrucibleGateCircle(ctx: CanvasRenderingContext2D, time: number) {
  const gx = 980;
  const gy = 620;
  ctx.save();
  const pulse = 0.35 + Math.sin(time * 2.4) * 0.12;
  const glow = ctx.createRadialGradient(gx, gy, 8, gx, gy, 90);
  glow.addColorStop(0, `rgba(168, 85, 247, ${pulse})`);
  glow.addColorStop(0.55, `rgba(91, 33, 182, ${pulse * 0.45})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(gx, gy, 90, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(196, 181, 253, ${0.55 + pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(gx, gy, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(gx, gy, 22, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(167, 139, 250, 0.7)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) {
    const a = time * 0.6 + (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(gx + Math.cos(a) * 18, gy + Math.sin(a) * 18);
    ctx.lineTo(gx + Math.cos(a) * 42, gy + Math.sin(a) * 42);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHordeArena(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  vw: number,
  vh: number,
  time: number,
  view?: { minX: number; maxX: number; minY: number; maxY: number }
) {
  const { minX, minY, maxX, maxY, cx, cy } = HORDE_ARENA;
  const vis = view ?? {
    minX: camera.x - vw,
    maxX: camera.x + vw,
    minY: camera.y - vh,
    maxY: camera.y + vh,
  };
  if (vis.maxX < minX - 80 || vis.minX > maxX + 80 || vis.maxY < minY - 80 || vis.minY > maxY + 80) return;

  const x0 = Math.max(minX, vis.minX - 40);
  const y0 = Math.max(minY, vis.minY - 40);
  const x1 = Math.min(maxX, vis.maxX + 40);
  const y1 = Math.min(maxY, vis.maxY + 40);
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return;

  ctx.save();
  ctx.fillStyle = '#05070C';
  ctx.fillRect(x0, y0, bw, bh);

  // Circuit floor grid
  const tile = 72;
  const gx0 = Math.floor(x0 / tile) * tile;
  const gy0 = Math.floor(y0 / tile) * tile;
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = gx0; gx <= x1; gx += tile) {
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx, y1);
  }
  for (let gy = gy0; gy <= y1; gy += tile) {
    ctx.moveTo(x0, gy);
    ctx.lineTo(x1, gy);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let gx = gx0; gx <= x1; gx += tile * 4) {
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx, y1);
  }
  for (let gy = gy0; gy <= y1; gy += tile * 4) {
    ctx.moveTo(x0, gy);
    ctx.lineTo(x1, gy);
  }
  ctx.stroke();

  // Spawn plaza
  if (cx > vis.minX - 400 && cx < vis.maxX + 400 && cy > vis.minY - 400 && cy < vis.maxY + 400) {
    const pulse = 0.28 + Math.sin(time * 1.8) * 0.1;
    const plaza = ctx.createRadialGradient(cx, cy, 40, cx, cy, 480);
    plaza.addColorStop(0, `rgba(34, 211, 238, ${0.16 + pulse})`);
    plaza.addColorStop(0.45, 'rgba(14, 116, 144, 0.12)');
    plaza.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = plaza;
    ctx.beginPath();
    ctx.arc(cx, cy, 480, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(103, 232, 249, ${0.35 + pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 210, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232, 121, 249, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(cx, cy, 268, time * 0.15, time * 0.15 + Math.PI * 1.6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(165, 243, 252, 0.55)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SECTOR 0xNULL  ·  EXTRACT [T]', cx, cy - 228);
  }

  for (const f of HORDE_FEATURES) {
    if (f.x < vis.minX - f.r - 40 || f.x > vis.maxX + f.r + 40 || f.y < vis.minY - f.r - 40 || f.y > vis.maxY + f.r + 40) continue;

    if (f.kind === 'void') {
      const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
      g.addColorStop(0, '#02010A');
      g.addColorStop(0.55, '#0B0618');
      g.addColorStop(0.82, 'rgba(88, 28, 135, 0.55)');
      g.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(167, 139, 250, ${0.45 + Math.sin(time * 2 + f.seed) * 0.2})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r - 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(196, 181, 253, 0.55)';
      for (let i = 0; i < 5; i++) {
        const a = time * 0.6 + i * 1.1 + f.seed;
        const rr = f.r * (0.15 + (i % 3) * 0.12);
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.55, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (f.kind === 'leak') {
      const pulse = 0.35 + Math.sin(time * 4 + f.seed) * 0.2;
      ctx.fillStyle = `rgba(34, 211, 238, ${0.12 + pulse * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(103, 232, 249, ${0.4 + pulse})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.25 + pulse})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const rise = ((time * 40 + i * 18 + f.seed * 9) % 70);
        ctx.beginPath();
        ctx.moveTo(f.x - 6 + i * 4, f.y - rise);
        ctx.lineTo(f.x - 6 + i * 4, f.y - rise - 12);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(165, 243, 252, ${0.45 + pulse})`;
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('0x' + ((f.seed * 13) % 255).toString(16).toUpperCase(), f.x, f.y + 4);
    } else {
      const w = f.r * 1.6;
      const h = f.r * 2.2;
      ctx.fillStyle = '#0B1220';
      ctx.strokeStyle = '#155E75';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(f.x - w / 2, f.y - h, w, h, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#164E63';
      ctx.fillRect(f.x - w / 2 + 3, f.y - h + 4, w - 6, 5);
      for (let row = 0; row < 5; row++) {
        const on = ((Math.floor(time * 6) + f.seed + row) % 3) !== 0;
        ctx.fillStyle = on ? (row % 2 === 0 ? '#22D3EE' : '#4ADE80') : '#1E293B';
        ctx.fillRect(f.x - w / 2 + 5, f.y - h + 14 + row * 7, 4, 4);
        ctx.fillStyle = on && row % 2 === 1 ? '#F472B6' : '#334155';
        ctx.fillRect(f.x + w / 2 - 10, f.y - h + 14 + row * 7, 4, 4);
      }
      ctx.fillStyle = 'rgba(8, 47, 73, 0.55)';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y + 4, w * 0.55, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Floating data motes
  ctx.fillStyle = '#67E8F9';
  for (let i = 0; i < 18; i++) {
    const ex = vis.minX + ((i * 211 + time * 28) % Math.max(80, vis.maxX - vis.minX));
    const ey = vis.minY + ((i * 157 + Math.sin(time * 1.3 + i) * 30) % Math.max(80, vis.maxY - vis.minY));
    ctx.globalAlpha = 0.18 + Math.sin(time * 3 + i) * 0.12;
    ctx.beginPath();
    ctx.arc(ex, ey, i % 4 === 0 ? 2.6 : 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Corrupt static blotches
  ctx.fillStyle = 'rgba(192, 38, 211, 0.05)';
  for (let i = 0; i < 6; i++) {
    const bx = vis.minX + ((i * 373 + Math.floor(time * 2) * 17) % Math.max(40, vis.maxX - vis.minX));
    const by = vis.minY + ((i * 197) % Math.max(40, vis.maxY - vis.minY));
    ctx.fillRect(bx, by, 48 + (i % 3) * 20, 8);
  }

  const rift = getHordeRiftFx();
  if (rift.active && rift.cx > vis.minX - rift.r && rift.cx < vis.maxX + rift.r && rift.cy > vis.minY - rift.r && rift.cy < vis.maxY + rift.r) {
    const pulse = 0.35 + Math.sin(time * 2.4) * 0.12;
    const g = ctx.createRadialGradient(rift.cx, rift.cy, rift.r * 0.2, rift.cx, rift.cy, rift.r);
    g.addColorStop(0, `${rift.tint}33`);
    g.addColorStop(0.55, `${rift.tint}18`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(rift.cx, rift.cy, rift.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rift.tint;
    ctx.globalAlpha = 0.45 + pulse;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(rift.cx, rift.cy, rift.r - 6, time * 0.2, time * 0.2 + Math.PI * 1.85);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + rift.warp * 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rift.cx, rift.cy, rift.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHordeHazards(ctx: CanvasRenderingContext2D, hazards: HordeHazard[], time: number) {
  hazards.forEach((h) => {
    const charging = h.telegraph > 0;
    const tProg = charging ? 1 - h.telegraph / h.telegraphMax : 1;
    const aProg = charging ? 0 : 1 - h.active / h.activeMax;
    ctx.save();
    if (h.type === 'meteor' || h.type === 'void_burst') {
      ctx.strokeStyle = charging ? `rgba(251, 113, 133, ${0.35 + tProg * 0.5})` : `rgba(255,255,255,${0.8})`;
      ctx.fillStyle = charging ? `rgba(244, 63, 94, ${0.08 + tProg * 0.12})` : `rgba(251, 113, 133, ${0.45})`;
      ctx.lineWidth = charging ? 2 : 5;
      ctx.setLineDash(charging ? [8, 7] : []);
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      const shadow = h.radius * (1 - tProg);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(h.x, h.y, Math.max(8, shadow), 0, Math.PI * 2);
      ctx.stroke();
      if (!charging) {
        ctx.fillStyle = '#FB7185';
        ctx.beginPath();
        ctx.arc(h.x, h.y - (1 - aProg) * 80, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (h.type === 'beam') {
      const x2 = h.x + Math.cos(h.angle) * h.length;
      const y2 = h.y + Math.sin(h.angle) * h.length;
      ctx.strokeStyle = charging ? `rgba(34, 211, 238, ${0.3 + tProg * 0.5})` : '#ECFEFF';
      ctx.lineWidth = charging ? 2 + tProg * 3 : 18;
      ctx.shadowColor = '#22D3EE';
      ctx.shadowBlur = charging ? 8 : 24;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (charging) {
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (h.type === 'cross') {
      const drawArm = (ang: number) => {
        const hLen = h.length / 2;
        ctx.beginPath();
        ctx.moveTo(h.x + Math.cos(ang) * -hLen, h.y + Math.sin(ang) * -hLen);
        ctx.lineTo(h.x + Math.cos(ang) * hLen, h.y + Math.sin(ang) * hLen);
        ctx.stroke();
      };
      ctx.strokeStyle = charging ? `rgba(103, 232, 249, ${0.35 + tProg * 0.5})` : '#FFFFFF';
      ctx.lineWidth = charging ? 2.4 : 16;
      ctx.shadowColor = '#67E8F9';
      ctx.shadowBlur = charging ? 6 : 20;
      drawArm(h.angle);
      drawArm(h.angle + Math.PI / 2);
    } else if (h.type === 'ring') {
      const ringR = charging ? 40 : 40 + h.radius * aProg;
      ctx.strokeStyle = charging ? `rgba(167, 139, 250, ${0.4 + tProg * 0.4})` : '#EDE9FE';
      ctx.lineWidth = charging ? 2 : 10;
      ctx.shadowColor = '#A78BFA';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(h.x, h.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      if (charging) {
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  });
}

function drawBlindScreams(ctx: CanvasRenderingContext2D, monsters: Monster[], time: number) {
  monsters.forEach((m) => {
    const bark = m.battleBark;
    if (!bark) return;
    const life = Math.max(0.15, bark.timer);
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.8, life)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 18 + (1 - Math.min(1, life)) * 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#F5F5F5';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bark.text, m.x, m.y - 36);
    ctx.restore();
  });
}

// =========================================================
// ELEVATED PLATFORMS, CLIFF FACES, RAMPS & SUSPENSION BRIDGES
// =========================================================
function drawPlatformsAndBridges(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  time: number
) {
  // 1. Canyon Plateaus & Natural Stone Ramps
  drawTerracottaPlateau(ctx, 2280, 120, 1550, 360, 140, 'North Eagle Cliff');
  drawTerracottaPlateau(ctx, 2280, 1080, 1600, 460, 140, 'South Redrock Plateau');
  drawNaturalStoneRamp(ctx, 2120, 260, 170, 140, 'up_x', 'North Ascent Ramp');
  drawNaturalStoneRamp(ctx, 3850, 1140, 170, 140, 'down_x', 'South Descent Ramp');
  drawNaturalStoneRamp(ctx, 2650, 2280, 220, 140, 'up_x', 'Summit Ascent Ramp');

  // 2. Suspension Rope Bridges Over Chasm
  drawSuspensionBridge(ctx, 2680, 490, 130, 600, 'Skyview Rope Bridge', time);
  drawSuspensionBridge(ctx, 3420, 490, 130, 600, 'Eagle Ridge Rope Bridge', time);

  // 3. Ranger Treehouse High Stilt Platform (elev: 90px)
  drawRangerTreehousePlatform(ctx, 450, 2150, 240, 190, 90, time);

  drawElevatedMonorail(ctx, 300, 3950, 1750, 90, 110, time);
  drawMetroSkybridge(ctx, 880, 3360, 180, 75, 210, time);
  drawPunkSteamPipe(ctx, time);
}

function drawPunkSteamPipe(ctx: CanvasRenderingContext2D, _time: number) {
  const px = 3650;
  const py = 3360;
  const pw = 200;
  const ph = 75;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(px + 30, py + 80, pw, ph, 6);
  ctx.fill();
  ctx.fillStyle = '#451A03';
  ctx.strokeStyle = '#EA580C';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  ctx.arc(px + 50, py + ph / 2, 10, 0, Math.PI * 2);
  ctx.arc(px + pw - 50, py + ph / 2, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FACC15';
  ctx.font = 'bold 8px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔥 STEAM PIPE CATWALK', px + pw / 2, py + ph / 2 + 3);
  ctx.restore();
}

function drawPoliceHQSkyscraperRoof(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  elev: number,
  time: number
) {
  ctx.save();
  // Huge Building Drop Shadow (200px offset onto street level!)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x + 25, y + h + 10, w - 10, 60, 8);
  ctx.fill();

  // Skyscraper Vertical Glass & Concrete Facade (Front drop edge)
  const facadeGrad = ctx.createLinearGradient(x, y + h, x, y + h + 55);
  facadeGrad.addColorStop(0, '#0F172A');
  facadeGrad.addColorStop(0.5, '#1E293B');
  facadeGrad.addColorStop(1, '#0B0F19');
  ctx.fillStyle = facadeGrad;
  ctx.beginPath();
  ctx.roundRect(x, y + h, w, 55, [0, 0, 8, 8]);
  ctx.fill();

  // Facade Glass Window Rows
  ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
  for (let wx = x + 25; wx < x + w - 25; wx += 45) {
    ctx.fillRect(wx, y + h + 10, 24, 32);
  }

  // Rooftop Ground Surface (Walkable at elevation 200px)
  const roofGrad = ctx.createLinearGradient(x, y, x, y + h);
  roofGrad.addColorStop(0, '#1E293B');
  roofGrad.addColorStop(1, '#334155');
  ctx.fillStyle = roofGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();

  // Perimeter Ledge Railing & Blue Neon Trim
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Rooftop Helipad Circle & "H"
  const hx = x + w / 2;
  const hy = y + h / 2;
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(hx, hy, 75, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#FACC15';
  ctx.font = '900 64px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', hx, hy);

  // Rooftop Antenna Mast & Satellite Dish with Flashing Beacon
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 40, y + 40);
  ctx.lineTo(x + 40, y - 35);
  ctx.stroke();

  const beaconBlink = Math.sin(time * 10) > 0;
  ctx.fillStyle = beaconBlink ? '#EF4444' : '#7F1D1D';
  ctx.beginPath();
  ctx.arc(x + 40, y - 35, 6, 0, Math.PI * 2);
  ctx.fill();

  // Fire Escape Metal Stairs / Ladder (Access from street to roof)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x - 45, y + h - 85, 40, 90);
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 45, y + h - 85, 40, 90);
  for (let fy = y + h - 80; fy < y + h; fy += 14) {
    ctx.beginPath();
    ctx.moveTo(x - 45, fy);
    ctx.lineTo(x - 5, fy);
    ctx.stroke();
  }

  // Roof Name Tag Plaque
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + 20, y + 15, 140, 22, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 9px Fredoka, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🏢 POLICE HQ ROOFTOP (200m)', x + 26, y + 29);

  ctx.restore();
}

function drawCyberNoodlePlazaRoof(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  elev: number,
  time: number
) {
  ctx.save();
  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x + 25, y + h + 10, w - 10, 55, 8);
  ctx.fill();

  // Building Facade
  ctx.fillStyle = '#1C1917';
  ctx.beginPath();
  ctx.roundRect(x, y + h, w, 50, [0, 0, 8, 8]);
  ctx.fill();

  // Roof Ground Surface (Walkable at elevation 180px)
  ctx.fillStyle = '#292524';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();

  // Neon Red & Yellow Edge Trim
  ctx.strokeStyle = '#F97316';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Rooftop Industrial Air Conditioners & Rotating Fan Blades
  const acList = [
    { ax: x + 60, ay: y + 70 },
    { ax: x + 160, ay: y + 70 },
  ];
  acList.forEach((ac) => {
    ctx.fillStyle = '#44403C';
    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 2;
    ctx.fillRect(ac.ax - 28, ac.ay - 24, 56, 48);
    ctx.strokeRect(ac.ax - 28, ac.ay - 24, 56, 48);

    // Rotating Fan
    ctx.strokeStyle = '#78716C';
    ctx.lineWidth = 3;
    const fAngle = time * 8;
    ctx.beginPath();
    ctx.arc(ac.ax, ac.ay, 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ac.ax - Math.cos(fAngle) * 14, ac.ay - Math.sin(fAngle) * 14);
    ctx.lineTo(ac.ax + Math.cos(fAngle) * 14, ac.ay + Math.sin(fAngle) * 14);
    ctx.moveTo(ac.ax - Math.sin(fAngle) * 14, ac.ay + Math.cos(fAngle) * 14);
    ctx.lineTo(ac.ax + Math.sin(fAngle) * 14, ac.ay - Math.cos(fAngle) * 14);
    ctx.stroke();
  });

  // Illuminated Rooftop Glass Skylight
  ctx.fillStyle = 'rgba(249, 115, 22, 0.35)';
  ctx.strokeStyle = '#F97316';
  ctx.lineWidth = 2;
  ctx.fillRect(x + 260, y + 60, 140, 80);
  ctx.strokeRect(x + 260, y + 60, 140, 80);

  // Roof Name Tag Plaque
  ctx.fillStyle = 'rgba(28, 25, 23, 0.9)';
  ctx.strokeStyle = '#F97316';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + w - 160, y + 15, 140, 22, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FB923C';
  ctx.font = 'bold 9px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🍜 NOODLE ROOFTOP (180m)', x + w - 90, y + 29);

  ctx.restore();
}

function drawMetroSkybridge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  elev: number,
  time: number
) {
  ctx.save();
  // Drop Shadow cast 180px onto the avenue below!
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x + 35, y + 80, w, h, 6);
  ctx.fill();

  // Heavy Steel Support Beams & Truss
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x + w, y + 10);
  ctx.moveTo(x, y + h - 10);
  ctx.lineTo(x + w, y + h - 10);
  ctx.stroke();

  // Glass Enclosed Catwalk Floor (Elevation 180px)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(x, y, w, h);

  // Cyan Reinforced Safety Rails
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);

  // Glass Cross Ribs
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 2;
  for (let bx = x + 25; bx < x + w; bx += 35) {
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx, y + h);
    ctx.stroke();
  }

  // Center Badge
  ctx.fillStyle = '#0F172A';
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 50, y + h / 2 - 10, 100, 20, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 8px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌉 METRO SKYBRIDGE', x + w / 2, y + h / 2 + 4);

  ctx.restore();
}

function drawElevatedMonorail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  elev: number,
  time: number
) {
  ctx.save();
  // Drop Shadow cast 110px onto street
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x + 25, y + 45, w, h);

  // Concrete Support Pillars along the track
  for (let px = x + 100; px < x + w; px += 280) {
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.fillRect(px - 18, y + h, 36, 45);
    ctx.strokeRect(px - 18, y + h, 36, 45);
  }

  // Main Concrete Monorail Track Bed (Walkable at elevation 110px)
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();

  // Steel Center Guide Rail with Blue Neon Status Line
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(x, y + h / 2 - 4, w, 8);

  // ---------------------------------------------------------
  // CRASHED FUTURISTIC METRO TRAIN CARRIAGE (x: 1050, y: 3930, w: 320, h: 110)
  // ---------------------------------------------------------
  const tx = 1050;
  const ty = 3930;
  const tw = 320;
  const th = 110;

  // Train Car Streamlined Hull
  ctx.fillStyle = '#0F172A';
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 14);
  ctx.fill();
  ctx.stroke();

  // Train Emergency Interior Flickering Blue Light
  const trainFlicker = Math.sin(time * 12) > -0.3;
  ctx.fillStyle = trainFlicker ? 'rgba(56, 189, 248, 0.35)' : 'rgba(15, 23, 42, 0.8)';
  for (let wx = tx + 35; wx < tx + tw - 35; wx += 45) {
    ctx.fillRect(wx, ty + 20, 30, th - 40);
  }

  // Fallen Steel Girder Ramp (Access from ground up to 110px)
  ctx.fillStyle = '#475569';
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(280, 3930 + 100);
  ctx.lineTo(420, 3930);
  ctx.lineTo(420, 3930 + 90);
  ctx.lineTo(280, 3930 + 100);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Train Logo Tag
  ctx.fillStyle = '#38BDF8';
  ctx.font = '900 12px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🚆 METRO LINE 07 [OFFLINE]', tx + tw / 2, ty + th / 2 + 4);

  ctx.restore();
}

function drawPunkWarehouseRooftops(
  ctx: CanvasRenderingContext2D,
  time: number
) {
  ctx.save();
  // Rooftop A (x: 3150, y: 3240, w: 500, h: 340, elev: 190px)
  drawCorrugatedPunkRoof(ctx, 3150, 3240, 500, 340, '⚡ GANG WAREHOUSE A');

  // Rooftop B (x: 3850, y: 3240, w: 480, h: 340, elev: 190px)
  drawCorrugatedPunkRoof(ctx, 3850, 3240, 480, 340, '👑 ANARCHY TOWER B');

  // Overhead Industrial Steam Pipe Skybridge (x: 3650, y: 3360, w: 200, h: 75, elev: 190px)
  const px = 3650;
  const py = 3360;
  const pw = 200;
  const ph = 75;

  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(px + 30, py + 80, pw, ph, 6);
  ctx.fill();

  // Massive Industrial Pipe Structure (Walkable catwalk at 190px)
  ctx.fillStyle = '#451A03';
  ctx.strokeStyle = '#EA580C';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 6);
  ctx.fill();
  ctx.stroke();

  // Steam Release Valves
  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  ctx.arc(px + 50, py + ph / 2, 10, 0, Math.PI * 2);
  ctx.arc(px + pw - 50, py + ph / 2, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FACC15';
  ctx.font = 'bold 8px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔥 STEAM PIPE CATWALK', px + pw / 2, py + ph / 2 + 3);

  // Punk Scaffolding Ladder Ramp
  ctx.fillStyle = '#27272A';
  ctx.fillRect(3100, 3480, 55, 95);
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 2;
  ctx.strokeRect(3100, 3480, 55, 95);
  for (let sy = 3490; sy < 3570; sy += 15) {
    ctx.beginPath();
    ctx.moveTo(3100, sy);
    ctx.lineTo(3155, sy);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCorrugatedPunkRoof(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string
) {
  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x + 25, y + h + 10, w - 10, 55, 8);
  ctx.fill();

  // Building Facade
  ctx.fillStyle = '#18181B';
  ctx.beginPath();
  ctx.roundRect(x, y + h, w, 50, [0, 0, 8, 8]);
  ctx.fill();

  // Corrugated Metal Roof Surface
  ctx.fillStyle = '#27272A';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();

  // Corrugated Sheet Lines & Red Rust Stains
  ctx.strokeStyle = '#3F3F46';
  ctx.lineWidth = 2;
  for (let rx = x + 15; rx < x + w; rx += 20) {
    ctx.beginPath();
    ctx.moveTo(rx, y + 4);
    ctx.lineTo(rx, y + h - 4);
    ctx.stroke();
  }

  // Red Neon Hazard Trim
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

  // Roof Name Tag Plaque
  ctx.fillStyle = 'rgba(24, 24, 27, 0.9)';
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + 20, y + 15, 150, 22, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#F87171';
  ctx.font = 'bold 9px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, x + 95, y + 29);
}

// =========================================================
// HOSTINGOVAYA MULTI-FLOOR DATA CENTER & QUANTUM ROOFTOP
// =========================================================
function drawHostingovayaDataCenter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number
) {
  ctx.save();

  // 1. Massive Ground Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.roundRect(x + 25, y + h + 15, w - 10, 65, 12);
  ctx.fill();

  // 2. Multi-Storey Reinforced Glass & Steel Building Facade
  const facadeGrad = ctx.createLinearGradient(x, y + h, x, y + h + 60);
  facadeGrad.addColorStop(0, '#0F172A');
  facadeGrad.addColorStop(1, '#020617');
  ctx.fillStyle = facadeGrad;
  ctx.beginPath();
  ctx.roundRect(x, y + h, w, 60, [0, 0, 10, 10]);
  ctx.fill();

  // Server Room Window Grids (illuminated with cool blue server rack LEDs inside)
  for (let wx = x + 30; wx < x + w - 30; wx += 45) {
    const blink = Math.sin(time * 6 + wx) > 0;
    ctx.fillStyle = blink ? 'rgba(56, 189, 248, 0.4)' : 'rgba(14, 165, 233, 0.15)';
    ctx.fillRect(wx, y + h + 15, 30, 30);
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, y + h + 15, 30, 30);
  }

  // 3. Multi-Floor Composite Surface (Walkable from 0px up to 210px via stairs)
  const floorGrad = ctx.createLinearGradient(x, y, x, y + h);
  floorGrad.addColorStop(0, '#0B0F19');
  floorGrad.addColorStop(0.5, '#0F172A');
  floorGrad.addColorStop(1, '#1E293B');
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();

  // High-Tech Cyber Grid Floor Tiles
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
  ctx.lineWidth = 1.5;
  for (let gx = x; gx <= x + w; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y; gy <= y + h; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  // 4. Glowing Cyan Liquid Nitrogen Cooling Conduits (Running along sides)
  const coolantPulse = (Math.sin(time * 8) + 1) * 0.5;
  ctx.strokeStyle = '#06B6D4';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#06B6D4';
  ctx.shadowBlur = 12;
  // Left conduit
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 20);
  ctx.lineTo(x + 20, y + h - 20);
  ctx.stroke();
  // Right conduit
  ctx.beginPath();
  ctx.moveTo(x + w - 20, y + 20);
  ctx.lineTo(x + w - 20, y + h - 20);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Coolant Flow Bubbles
  ctx.fillStyle = '#E0F2FE';
  for (let b = 0; b < 6; b++) {
    const bubbleY = y + 30 + ((time * 60 + b * 60) % (h - 60));
    ctx.beginPath();
    ctx.arc(x + 20, bubbleY, 3, 0, Math.PI * 2);
    ctx.arc(x + w - 20, bubbleY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Floor 1 Security Laser Scanners / Checkpoint Turnstiles (Bottom area)
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#EF4444';
  ctx.shadowBlur = 8;
  const laserSweep = Math.sin(time * 5) * 40;
  ctx.beginPath();
  ctx.moveTo(x + 100, y + h - 60 + laserSweep);
  ctx.lineTo(x + w - 100, y + h - 60 + laserSweep);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Turnstiles Base
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 2;
  ctx.fillRect(x + 160, y + h - 45, 30, 25);
  ctx.strokeRect(x + 160, y + h - 45, 30, 25);
  ctx.fillRect(x + w - 190, y + h - 45, 30, 25);
  ctx.strokeRect(x + w - 190, y + h - 45, 30, 25);

  // 6. Floor Access Staircases (Connecting F1 -> F2 -> F3 -> F4)
  const stairConfigs = [
    { sx: x - 45, sy: y + 220, label: 'STAIRS F1-F2 (+70px)' },
    { sx: x + w + 5, sy: y + 220, label: 'STAIRS F2-F3 (+140px)' },
    { sx: x - 45, sy: y + 40, label: 'STAIRS F3-F4 (+210px)' },
  ];
  stairConfigs.forEach((st) => {
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.fillRect(st.sx, st.sy, 40, 85);
    ctx.strokeRect(st.sx, st.sy, 40, 85);
    for (let sy = st.sy + 10; sy < st.sy + 80; sy += 12) {
      ctx.beginPath();
      ctx.moveTo(st.sx, sy);
      ctx.lineTo(st.sx + 40, sy);
      ctx.stroke();
    }
  });

  // 7. Rotating Emergency Red Alarm Sirens on Building Corners
  const sirenAngle = time * 12;
  const corners = [
    { cx: x + 15, cy: y + 15 },
    { cx: x + w - 15, cy: y + 15 },
    { cx: x + 15, cy: y + h - 15 },
    { cx: x + w - 15, cy: y + h - 15 },
  ];
  corners.forEach((c) => {
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, 7, 0, Math.PI * 2);
    ctx.fill();

    // Strobe beam
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.moveTo(c.cx, c.cy);
    ctx.arc(c.cx, c.cy, 35, sirenAngle, sirenAngle + 0.8);
    ctx.closePath();
    ctx.fill();
  });

  // 8. Rooftop Neon Billboard Tag
  ctx.fillStyle = 'rgba(11, 15, 25, 0.95)';
  ctx.strokeStyle = '#0EA5E9';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#0EA5E9';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 160, y + 12, 320, 26, 6);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#38BDF8';
  ctx.font = '900 11px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🖥️ HOSTINGOVAYA: DATA CENTER (FLOORS 1-4) 🖥️', x + w / 2, y + 29);

  ctx.restore();
}

function drawTerracottaPlateau(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  elevationZ: number,
  label: string
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x + 12, y + h + 8, w - 10, 40, 8);
  ctx.fill();

  const cliffHeight = Math.min(55, elevationZ * 0.4);
  const strataGrad = ctx.createLinearGradient(x, y + h, x, y + h + cliffHeight);
  strataGrad.addColorStop(0, '#5C2410');
  strataGrad.addColorStop(0.35, '#853216');
  strataGrad.addColorStop(0.7, '#A34220');
  strataGrad.addColorStop(1, '#431407');
  ctx.fillStyle = strataGrad;
  ctx.beginPath();
  ctx.roundRect(x, y + h, w, cliffHeight, [0, 0, 8, 8]);
  ctx.fill();

  ctx.strokeStyle = 'rgba(20, 8, 4, 0.45)';
  ctx.lineWidth = 2;
  for (let i = 40; i < w - 40; i += 75) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + 10, y + h + cliffHeight);
    ctx.stroke();
  }

  const topGrad = ctx.createLinearGradient(x, y, x, y + h);
  topGrad.addColorStop(0, '#6C3822');
  topGrad.addColorStop(1, '#82442B');
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();

  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function drawNaturalStoneRamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: 'up_x' | 'down_x' | 'up_y' | 'down_y',
  label: string
) {
  ctx.save();
  ctx.fillStyle = '#4E3524';
  ctx.strokeStyle = '#291D13';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 2;
  const numSteps = 7;
  for (let s = 1; s < numSteps; s++) {
    const sx = x + (w / numSteps) * s;
    ctx.beginPath();
    ctx.moveTo(sx, y + 4);
    ctx.lineTo(sx, y + h - 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSuspensionBridge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  time: number
) {
  ctx.save();
  const shadowOffsetX = 35;
  const shadowOffsetY = 65;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x + shadowOffsetX, y + shadowOffsetY, w, h, 8);
  ctx.fill();

  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 3;
  ctx.fillRect(x - 8, y - 10, 24, 28);
  ctx.strokeRect(x - 8, y - 10, 24, 28);
  ctx.fillRect(x + w - 16, y - 10, 24, 28);
  ctx.strokeRect(x + w - 16, y - 10, 24, 28);
  ctx.fillRect(x - 8, y + h - 18, 24, 28);
  ctx.strokeRect(x - 8, y + h - 18, 24, 28);
  ctx.fillRect(x + w - 16, y + h - 18, 24, 28);
  ctx.strokeRect(x + w - 16, y + h - 18, 24, 28);

  const sway = Math.sin(time * 2.5 + x) * 2;
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 4, y);
  ctx.quadraticCurveTo(x - 4 + sway, y + h / 2, x + 4, y + h);
  ctx.moveTo(x + w - 4, y);
  ctx.quadraticCurveTo(x + w + 4 + sway, y + h / 2, x + w - 4, y + h);
  ctx.stroke();

  const plankSpacing = 16;
  ctx.strokeStyle = '#1C1917';
  ctx.lineWidth = 1.5;
  for (let py = y; py < y + h; py += plankSpacing) {
    const isSpecial = Math.floor(py / plankSpacing) % 4 === 0;
    ctx.fillStyle = isSpecial ? '#78350F' : '#92400E';
    ctx.fillRect(x + 2, py, w - 4, 13);
    ctx.strokeRect(x + 2, py, w - 4, 13);
  }

  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + 3, y + h);
  ctx.moveTo(x + w - 3, y);
  ctx.lineTo(x + w - 3, y + h);
  ctx.stroke();

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 55, y + h / 2 - 12, 110, 24, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FDE047';
  ctx.font = 'bold 9px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🌉 ${name}`, x + w / 2, y + h / 2 + 4);

  ctx.restore();
}

function drawRangerTreehousePlatform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  elev: number,
  time: number
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.roundRect(x + 20, y + 45, w, h, 12);
  ctx.fill();

  ctx.strokeStyle = '#451A03';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + h);
  ctx.lineTo(x + 20, y + h + 50);
  ctx.moveTo(x + w - 20, y + h);
  ctx.lineTo(x + w - 20, y + h + 50);
  ctx.stroke();

  ctx.fillStyle = '#78350F';
  ctx.strokeStyle = '#271003';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#92400E';
  ctx.fillRect(x - 25, y + h - 60, 22, 70);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#34D399';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 60, y + 15, 120, 22, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 9px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("🏡 RANGER'S TREEHOUSE", x + w / 2, y + 30);

  ctx.restore();
}

// =========================================================
// WORLD POINTS OF INTEREST (SHRINES, GEYSERS, SHROOMS, VENDING, HYDRANTS)
// =========================================================
function drawWorldPois(
  ctx: CanvasRenderingContext2D,
  pois: WorldPOI[],
  player: Player,
  time: number
) {
  pois.forEach((poi) => {
    const occ = { buildingId: player.interiorBuildingId ?? null, floor: player.interiorFloor ?? 0 };
    if ((poi.elevationZ ?? 0) > 40 && !occupancyMatchesObject(occ, poi)) {
      return;
    }
    ctx.save();
    ctx.translate(poi.x, poi.y);

    // 1. Ancient Wind Spirit Shrine
    if (poi.type === 'spirit_shrine') {
      const pulse = Math.sin(time * 3) * 0.15 + 0.35;
      ctx.fillStyle = `rgba(45, 212, 191, ${pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(0, 15, 55, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#2DD4BF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 15, 50, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-22, -45, 44, 70, 6);
      ctx.fill();
      ctx.stroke();

      const bob = Math.sin(time * 4) * 6;
      ctx.fillStyle = '#A5F3FC';
      ctx.strokeStyle = '#0891B2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -65 + bob);
      ctx.lineTo(10, -52 + bob);
      ctx.lineTo(0, -39 + bob);
      ctx.lineTo(-10, -52 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#2DD4BF';
      ctx.font = 'bold 10px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎐 SPIRIT SHRINE (+SPEED)', 0, -78 + bob);
    }
    // 2. Bouncy Bioluminescent Mushrooms
    else if (poi.type === 'bouncy_mushroom') {
      const shroomBounce = Math.sin(time * 5 + poi.x) * 3;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 12, 26, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-8, -10, 16, 22);

      ctx.fillStyle = '#10B981';
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#34D399';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(0, -18 + shroomBounce, 34, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#34D399';
      ctx.font = 'bold 9px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍄 BOUNCY SHROOM', 0, -42 + shroomBounce);
    }
    // 3. Volcanic High-Pressure Steam Geysers
    else if (poi.type === 'steam_geyser') {
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.ellipse(0, 6, 32, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.ellipse(0, 6, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      for (let p = 0; p < 4; p++) {
        const steamProgress = ((time * 1.5 + p * 0.25) % 1.0);
        const sy = 6 - steamProgress * 85;
        const sRad = 10 + steamProgress * 22;
        const sAlpha = (1 - steamProgress) * 0.6;
        ctx.fillStyle = `rgba(224, 242, 254, ${sAlpha})`;
        ctx.beginPath();
        ctx.arc(Math.sin(time * 8 + p) * 8, sy, sRad, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 9px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💨 STEAM GEYSER', 0, -85);
    }
    // 4. Interactive Cyber Vending Machine (Soda & Stims)
    else if (poi.type === 'vending_machine') {
      // Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Machine Body
      const isPunk = poi.id.includes('punk');
      ctx.fillStyle = isPunk ? '#7F1D1D' : '#0369A1';
      ctx.strokeStyle = isPunk ? '#EF4444' : '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-18, -35, 36, 48, 6);
      ctx.fill();
      ctx.stroke();

      // Glowing Glass Front with Soda Cans
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-14, -30, 28, 22);

      // Mini Soda Cans inside
      ctx.fillStyle = isPunk ? '#F59E0B' : '#38BDF8';
      ctx.fillRect(-10, -26, 6, 8);
      ctx.fillRect(-2, -26, 6, 8);
      ctx.fillRect(6, -26, 6, 8);

      // Dispenser Slot at bottom
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-12, -4, 24, 8);

      // Top Neon Banner
      ctx.fillStyle = isPunk ? '#EF4444' : '#38BDF8';
      ctx.font = 'bold 8px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isPunk ? '⚡ ENERGY' : '🥤 CYBER COLA', 0, -42);
    }
    // 5. High-Pressure Street Fire Hydrant (Shoots water geyser!)
    else if (poi.type === 'fire_hydrant') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Red Fire Hydrant Body
      ctx.fillStyle = '#DC2626';
      ctx.strokeStyle = '#7F1D1D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-10, -18, 20, 26, 4);
      ctx.fill();
      ctx.stroke();

      // Silver Cap & Side Nozzles
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.arc(0, -18, 6, 0, Math.PI * 2);
      ctx.fillRect(-14, -10, 28, 5);
      ctx.fill();

      // Roaring Water Splash Particles / Fountain
      ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
      for (let w = 0; w < 3; w++) {
        const wy = -18 - ((time * 40 + w * 20) % 60);
        ctx.beginPath();
        ctx.arc(Math.sin(time * 10 + w) * 6, wy, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 8px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚰 HYDRANT (LAUNCH)', 0, -32);
    }
    // 6. Minecart
    else if (poi.type === 'minecart_cart') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 28, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(-16, 10, 8, 0, Math.PI * 2);
      ctx.arc(16, 10, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = poi.isLooted ? '#451A03' : '#78350F';
      ctx.strokeStyle = '#1C1917';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-22, -14, 44, 22, 4);
      ctx.fill();
      ctx.stroke();

      if (!poi.isLooted) {
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(-8, -14, 6, 0, Math.PI * 2);
        ctx.arc(4, -16, 7, 0, Math.PI * 2);
        ctx.arc(12, -13, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = poi.isLooted ? '#94A3B8' : '#FACC15';
      ctx.font = 'bold 9px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(poi.isLooted ? '⛏️ EMPTY MINECART' : '⛏️ GOLD MINECART', 0, -26);
    }
    // 7. Treasure Chests & Rooftop Lockers
    else if (poi.type === 'treehouse_cache' || poi.type === 'treasure_chest') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 10, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = poi.isLooted ? '#334155' : '#1E293B';
      ctx.strokeStyle = poi.isLooted ? '#64748B' : '#F59E0B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-16, -12, 32, 22, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = poi.isLooted ? '#64748B' : '#FDE047';
      ctx.fillRect(-4, -4, 8, 8);

      ctx.fillStyle = poi.isLooted ? '#94A3B8' : '#FDE047';
      ctx.font = 'bold 9px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(poi.isLooted ? '📦 LOOTED VAULT' : `🎁 ${poi.name}`, 0, -20);
    }

    ctx.restore();
  });
}

function drawEnvironmentDecor(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  vw: number,
  vh: number,
  time: number
) {
  // 1. Forest Tents & Gear
  drawCanvasTent(ctx, 580, 480, 140, 110, '#334155', '#1E293B', '#F59E0B', 'COMMAND HQ', time);
  drawCanvasTent(ctx, 860, 480, 130, 100, '#451A03', '#271003', '#EA580C', 'ARMORY & WORKSHOP', time);
  drawCanvasTent(ctx, 420, 720, 120, 95, '#064E3B', '#022C22', '#10B981', 'FIELD KITCHEN', time);
  drawCanvasTent(ctx, 920, 740, 115, 90, '#1E3A8A', '#0F172A', '#38BDF8', 'SCOUT POST', time);

  drawSupplyCrates(ctx, 820, 560);
  drawSupplyCrates(ctx, 380, 780);
  drawSupplyCrates(ctx, 970, 780);

  drawWatchtower(ctx, 220, 450, time);
  drawWatchtower(ctx, 1180, 450, time);
  drawWatchtower(ctx, 1750, 620, time);

  // Campsite Fences & Forest Logs
  drawWoodenFence(ctx, 320, 360, 180, 18);
  drawWoodenFence(ctx, 740, 360, 180, 18);
  drawWoodenFence(ctx, 320, 380, 18, 260);

  drawFallenMossyLog(ctx, 1020, 1780, 140, 32);
  drawFallenMossyLog(ctx, 1380, 2320, 160, 34);
  drawFallenMossyLog(ctx, 720, 2560, 150, 32);
  drawFallenMossyLog(ctx, 1840, 1820, 130, 32);

  // Central Campfire
  const fireX = 680;
  const fireY = 640;
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

  ctx.fillStyle = '#7F1D1D';
  ctx.beginPath();
  ctx.ellipse(fireX, fireY, 24, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#451A03';
  ctx.fillRect(fireX - 16, fireY - 6, 32, 8);

  const flameH = 22 + Math.sin(time * 15) * 6;
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.moveTo(fireX - 14, fireY + 4);
  ctx.quadraticCurveTo(fireX - 5, fireY - flameH * 0.7, fireX, fireY - flameH);
  ctx.quadraticCurveTo(fireX + 5, fireY - flameH * 0.7, fireX + 14, fireY + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.moveTo(fireX - 7, fireY + 2);
  ctx.quadraticCurveTo(fireX, fireY - flameH * 0.7, fireX + 7, fireY + 2);
  ctx.closePath();
  ctx.fill();

  const fireGlow = ctx.createRadialGradient(fireX, fireY, 10, fireX, fireY, 140);
  fireGlow.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
  fireGlow.addColorStop(0.5, 'rgba(234, 88, 12, 0.15)');
  fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fireGlow;
  ctx.beginPath();
  ctx.arc(fireX, fireY, 140, 0, Math.PI * 2);
  ctx.fill();

  drawLogBench(ctx, fireX - 75, fireY, 'vertical');
  drawLogBench(ctx, fireX + 75, fireY, 'vertical');
  drawLogBench(ctx, fireX, fireY + 55, 'horizontal');

  // Granite Boulders
  drawGraniteBoulder(ctx, 260, 380, 38);
  drawGraniteBoulder(ctx, 1250, 420, 46);
  drawGraniteBoulder(ctx, 1520, 920, 50);
  drawGraniteBoulder(ctx, 480, 1950, 42);
  drawGraniteBoulder(ctx, 1450, 2450, 55);
  drawGraniteBoulder(ctx, 3350, 2150, 44);
  drawGraniteBoulder(ctx, 4050, 2450, 46);

  // =========================================================
  // URBAN VEHICLES, DUMPSTERS & TIRE BARRICADES
  // =========================================================
  // Police Cruiser Squad Cars (x: 740, y: 3640 and x: 1620, y: 3640)
  drawPoliceCruiser(ctx, 740, 3640, time);
  drawPoliceCruiser(ctx, 1620, 3640, time);

  // Cyber Gang Muscle Cars (x: 3550, y: 3670 and x: 4400, y: 3670)
  drawCyberMuscleCar(ctx, 3550, 3670, time);
  drawCyberMuscleCar(ctx, 4400, 3670, time);

  // City Heavy Dumpsters (x: 1520, y: 3580 and x: 3750, y: 3600)
  drawCityDumpster(ctx, 1520, 3580);
  drawCityDumpster(ctx, 3750, 3600);

  // Spiked Tire Barricades (x: 3000, y: 3600 and x: 4150, y: 3600)
  drawSpikedTireBarricade(ctx, 3000, 3600);
  drawSpikedTireBarricade(ctx, 4150, 3600);

  // Warzone Police Barricades & Jersey Barriers
  ctx.save();
  ctx.fillStyle = '#1E3A8A';
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.fillRect(1700, 3180, 220, 20);
  ctx.strokeRect(1700, 3180, 220, 20);

  const beaconColor = Math.sin(time * 12) > 0 ? '#38BDF8' : '#EF4444';
  ctx.fillStyle = beaconColor;
  ctx.shadowColor = beaconColor;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(1715, 3180, 8, 0, Math.PI * 2);
  ctx.arc(1905, 3180, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#64748B';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  const barrierYList = [3350, 3650, 3950, 4200];
  barrierYList.forEach((by) => {
    ctx.fillRect(2340, by, 60, 16);
    ctx.strokeRect(2340, by, 60, 16);
    ctx.fillRect(2640, by, 60, 16);
    ctx.strokeRect(2640, by, 60, 16);
  });
  ctx.restore();
}

export function drawWorldCars(ctx: CanvasRenderingContext2D, cars: CarEntity[], localPlayer: Player, time: number) {
  cars.forEach((car) => {
    if (car.state === 'player_driven') return;
    
    ctx.save();
    ctx.translate(car.x, car.y);
    if (car.facing === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }
    if (car.type === 'police_car') {
      drawPoliceCruiser(ctx, 0, 0, time);
    } else {
      drawCyberMuscleCar(ctx, 0, 0, time);
    }
    ctx.restore();

    // Check distance to player
    const dx = localPlayer.x - (car.x + 50);
    const dy = localPlayer.y - (car.y + 24);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 100 && (car.state === 'empty' || car.state === 'unloading')) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = car.type === 'police_car' ? '#38BDF8' : '#EA580C';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(car.x + 10, car.y - 28, 80, 20, 5);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('[V] HIJACK', car.x + 50, car.y - 18);
      ctx.restore();
    }
  });
}

function drawCityDumpster(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 8, 68, 44, 4);
  ctx.fill();

  ctx.fillStyle = '#065F46';
  ctx.strokeStyle = '#022C22';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x, y, 68, 44, 4);
  ctx.fill();
  ctx.stroke();

  // Slanted Black Lid
  ctx.fillStyle = '#18181B';
  ctx.fillRect(x + 2, y + 2, 64, 16);

  ctx.restore();
}

function drawSpikedTireBarricade(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(x + 4, y + 6, 120, 30);

  // Stack of 5 Tires with Red Warning Trim
  for (let tx = x; tx < x + 120; tx += 24) {
    ctx.fillStyle = '#18181B';
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx + 12, y + 15, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#3F3F46';
    ctx.beginPath();
    ctx.arc(tx + 12, y + 15, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =========================================================
// URBAN NEON BILLBOARDS, STREET LIGHTS, OVERHEAD WIRES & GRAFFITI
// =========================================================
function drawUrbanAtmosphereAndNeons(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  vw: number,
  vh: number,
  time: number
) {
  if (camera.y < 2900) return; // Only render in urban zone

  ctx.save();

  // 1. NEON BILLBOARDS
  // 1.1. «HOT NOODLES 🍜» Neon Sign (above Noodle Plaza Roof at x: 1200, y: 3200)
  drawNeonSign(ctx, 1280, 3210, '🍜 CYBER NOODLES 🍜', '#F59E0B', '#EF4444', time);

  // 1.2. «POLICE HQ SWAT 🛡️» Neon Sign (above Police HQ Roof at x: 650, y: 3200)
  drawNeonSign(ctx, 650, 3210, '🛡️ POLICE DEPT SWAT 🛡️', '#38BDF8', '#1E40AF', time);

  // 1.3. «BAR 2088 🍸» Neon Sign (at x: 1950, y: 3200)
  drawNeonSign(ctx, 1950, 3210, '🍸 BAR 2088 🍸', '#E879F9', '#9333EA', time);

  // 1.4. «CYBER AMMO & GUNS 💥» Neon Sign (at x: 1450, y: 3680)
  drawNeonSign(ctx, 1450, 3680, '💥 CYBER AMMO & GUNS 💥', '#4ADE80', '#15803D', time);

  // 1.5. «HELLFIRE ANARCHY ⚡» Neon Sign (above Punk Tower at x: 4090, y: 3200)
  drawNeonSign(ctx, 4090, 3210, '⚡ HELLFIRE ANARCHY ⚡', '#EF4444', '#7F1D1D', time);

  // 2. STREET LAMP POSTS WITH LIGHTING CONES
  const lamps = [
    { x: 500, y: 3560 },
    { x: 1200, y: 3560 },
    { x: 1900, y: 3560 },
    { x: 3200, y: 3560 },
    { x: 3900, y: 3560 },
    { x: 4600, y: 3560 },
  ];
  lamps.forEach((lamp) => {
    // Lamp Light Cone projected onto street
    const lampGlow = ctx.createRadialGradient(lamp.x, lamp.y + 40, 10, lamp.x, lamp.y + 40, 140);
    lampGlow.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
    lampGlow.addColorStop(0.6, 'rgba(254, 240, 138, 0.08)');
    lampGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y + 40, 140, 0, Math.PI * 2);
    ctx.fill();

    // Steel Lamp Post
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(lamp.x, lamp.y + 20);
    ctx.lineTo(lamp.x, lamp.y - 45);
    ctx.lineTo(lamp.x + 20, lamp.y - 45);
    ctx.stroke();

    // Glowing Lantern Bulb
    ctx.fillStyle = '#FEF08A';
    ctx.shadowColor = '#FEF08A';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(lamp.x + 20, lamp.y - 42, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // 3. OVERHEAD FESTOON LIGHT WIRES STRUNG ACROSS STREETS
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(420, 3240);
  ctx.quadraticCurveTo(800, 3320, 1060, 3240);
  ctx.moveTo(3150, 3240);
  ctx.quadraticCurveTo(3500, 3320, 3850, 3240);
  ctx.stroke();

  // Hanging Colored Festoon Bulbs
  for (let i = 1; i <= 6; i++) {
    const bulbT = i / 7;
    // Metro string
    const bx1 = 420 + (1060 - 420) * bulbT;
    const by1 = 3240 + Math.sin(bulbT * Math.PI) * 80;
    ctx.fillStyle = i % 2 === 0 ? '#38BDF8' : '#F59E0B';
    ctx.beginPath();
    ctx.arc(bx1, by1, 4, 0, Math.PI * 2);
    ctx.fill();

    // Punk string
    const bx2 = 3150 + (3850 - 3150) * bulbT;
    const by2 = 3240 + Math.sin(bulbT * Math.PI) * 80;
    ctx.fillStyle = i % 2 === 0 ? '#EF4444' : '#A855F7';
    ctx.beginPath();
    ctx.arc(bx2, by2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. WALL GRAFFITI TAGS
  drawGraffitiTag(ctx, 3200, 3600, 'CYBER REBEL', '#EF4444');
  drawGraffitiTag(ctx, 3650, 3620, 'MADNESS 2088', '#A855F7');
  drawGraffitiTag(ctx, 4250, 3600, 'ACAB 💀', '#F59E0B');

  ctx.restore();
}

function drawNeonSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  bgGlow: string,
  time: number
) {
  ctx.save();
  const flicker = Math.sin(time * 18 + x) > -0.92 ? 1.0 : 0.25;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 110, y - 18, 220, 36, 6);
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = bgGlow;
  ctx.shadowBlur = 18 * flicker;
  ctx.fillStyle = color;
  ctx.font = '900 13px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawGraffitiTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = '900 16px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// =========================================================
// GIANT ANCIENT REDWOOD TREES & DYNAMIC TRANSPARENT CANOPIES
// =========================================================
const GIANT_TREES = [
  { x: 350, y: 1850, size: 1.15 },
  { x: 650, y: 2450, size: 1.25 },
  { x: 1150, y: 2100, size: 1.35 },
  { x: 1550, y: 2800, size: 1.2 },
  { x: 2100, y: 1950, size: 1.3 },
  { x: 2450, y: 2550, size: 1.1 },
  { x: 450, y: 2150, size: 1.4 }, // Treehouse Giant Tree
];

function drawGiantAncientTreesAndCanopies(
  ctx: CanvasRenderingContext2D,
  player: Player,
  time: number
) {
  GIANT_TREES.forEach((tree) => {
    const pDist = Math.hypot(player.x - tree.x, player.y - tree.y);
    // Smooth dynamic transparency when player walks under canopy
    const isPlayerUnderneath = pDist < 240;
    const targetAlpha = isPlayerUnderneath ? 0.35 : 0.95;

    ctx.save();
    ctx.translate(tree.x, tree.y);
    const s = tree.size;

    // 1. Massive Ground Root Buttresses
    ctx.fillStyle = '#271003';
    ctx.beginPath();
    ctx.moveTo(-35 * s, 25 * s);
    ctx.quadraticCurveTo(-60 * s, 45 * s, -80 * s, 60 * s);
    ctx.quadraticCurveTo(0, 40 * s, 80 * s, 60 * s);
    ctx.quadraticCurveTo(60 * s, 45 * s, 35 * s, 25 * s);
    ctx.closePath();
    ctx.fill();

    // 2. Giant Redwood Trunk
    ctx.fillStyle = '#451A03';
    ctx.strokeStyle = '#1C0D02';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-28 * s, -120 * s, 56 * s, 150 * s, 12);
    ctx.fill();
    ctx.stroke();

    // Trunk Bark Grooves
    ctx.strokeStyle = '#271003';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-12 * s, -110 * s);
    ctx.lineTo(-12 * s, 20 * s);
    ctx.moveTo(10 * s, -110 * s);
    ctx.lineTo(10 * s, 20 * s);
    ctx.stroke();

    // 3. Multi-Tier Lush Evergreen Canopy (Overhead Foreground Layer)
    ctx.globalAlpha = targetAlpha;

    // Outer Canopy Dropshadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.arc(0, -90 * s, 130 * s, 0, Math.PI * 2);
    ctx.fill();

    // Tier 1: Dark Forest Green Base
    ctx.fillStyle = '#064E3B';
    ctx.strokeStyle = '#022C22';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -110 * s, 120 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tier 2: Emerald Green Middle Foliage
    ctx.fillStyle = '#047857';
    ctx.beginPath();
    ctx.arc(-25 * s, -135 * s, 80 * s, 0, Math.PI * 2);
    ctx.arc(25 * s, -135 * s, 80 * s, 0, Math.PI * 2);
    ctx.arc(0, -165 * s, 75 * s, 0, Math.PI * 2);
    ctx.fill();

    // Tier 3: Bright Pine Highlight Top Leaves
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(-10 * s, -150 * s, 55 * s, 0, Math.PI * 2);
    ctx.arc(15 * s, -170 * s, 45 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });
}

function drawForestGodRaysAndSpores(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  vw: number,
  vh: number,
  time: number
) {
  // Only render sun rays when camera is inside forest region (x < 2600, y < 3100)
  if (camera.x > 2600 || camera.y > 3100) return;

  ctx.save();
  // 1. Diagonal Sun God Rays
  ctx.fillStyle = 'rgba(254, 240, 138, 0.045)';
  const rayOffsets = [200, 600, 1050, 1550, 2050];
  rayOffsets.forEach((rx, idx) => {
    const rayPulse = Math.sin(time * 1.2 + idx) * 0.015 + 0.035;
    ctx.fillStyle = `rgba(254, 240, 138, ${rayPulse})`;
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx + 160, 0);
    ctx.lineTo(rx - 300, 3100);
    ctx.lineTo(rx - 460, 3100);
    ctx.closePath();
    ctx.fill();
  });

  // 2. Floating Golden & Cyan Forest Spores / Fireflies
  for (let sp = 0; sp < 25; sp++) {
    const sx = ((sp * 277 + time * 18) % 2500);
    const sy = 1600 + ((sp * 193 + Math.sin(time * 2 + sp) * 40) % 1400);
    const sAlpha = Math.sin(time * 3 + sp) * 0.35 + 0.45;
    ctx.fillStyle = sp % 2 === 0 ? `rgba(254, 240, 138, ${sAlpha})` : `rgba(52, 211, 153, ${sAlpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
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

function drawWoodenFence(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(x, y + h - 2, w, 2);

  // Wood colors
  const woodColor = '#78350F'; 
  const strokeColor = '#451A03';
  ctx.fillStyle = woodColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;

  if (w > h) {
    // Horizontal fence rails
    ctx.fillRect(x, y + 4, w, 3);
    ctx.strokeRect(x, y + 4, w, 3);
    ctx.fillRect(x, y + h - 7, w, 3);
    ctx.strokeRect(x, y + h - 7, w, 3);

    // Vertical slats
    const slatWidth = 6;
    const interval = 20;
    const slatCount = Math.max(2, Math.floor(w / interval));
    const step = (w - slatWidth) / (slatCount - 1);
    for (let i = 0; i < slatCount; i++) {
      const sx = x + i * step;
      ctx.fillStyle = woodColor;
      ctx.fillRect(sx, y, slatWidth, h);
      ctx.strokeRect(sx, y, slatWidth, h);
    }
  } else {
    // Vertical fence rails (side view or vertically aligned)
    ctx.fillRect(x + 4, y, 3, h);
    ctx.strokeRect(x + 4, y, 3, h);
    ctx.fillRect(x + w - 7, y, 3, h);
    ctx.strokeRect(x + w - 7, y, 3, h);

    // Horizontal slats
    const slatHeight = 6;
    const interval = 20;
    const slatCount = Math.max(2, Math.floor(h / interval));
    const step = (h - slatHeight) / (slatCount - 1);
    for (let i = 0; i < slatCount; i++) {
      const sy = y + i * step;
      ctx.fillStyle = woodColor;
      ctx.fillRect(x, sy, w, slatHeight);
      ctx.strokeRect(x, sy, w, slatHeight);
    }
  }
  ctx.restore();
}

function drawFallenMossyLog(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h, w / 2, h / 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Log bark
  const barkColor = '#5B3926';
  const strokeColor = '#321D12';
  ctx.fillStyle = barkColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  ctx.stroke();

  // Wood rings on left end
  ctx.fillStyle = '#854D0E';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + h / 2, 3, h / 2 - 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Moss patches on top
  ctx.fillStyle = '#166534'; // Forest green moss
  ctx.beginPath();
  ctx.arc(x + w * 0.22, y + 2, h / 2, 0, Math.PI, true);
  ctx.arc(x + w * 0.35, y + 1, h / 2.8, 0, Math.PI, true);
  ctx.arc(x + w * 0.65, y + 2, h / 2.2, 0, Math.PI, true);
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

function drawDecorativeBirchTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 24, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pale white trunk
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x - 5, y - 6, 10, 30, 3);
  ctx.fill();
  ctx.stroke();

  // Dark horizontal bark stripes
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const stripeYs = [y + 2, y + 8, y + 14, y + 19];
  stripeYs.forEach((sy, i) => {
    ctx.beginPath();
    ctx.moveTo(x - 4 + (i % 2) * 1.5, sy);
    ctx.lineTo(x + 3 + (i % 2 === 0 ? 1 : -1), sy + 0.5);
    ctx.stroke();
  });

  // Bright lime layered canopy
  const leafLayers = [
    { y: y - 8, rx: 22, ry: 14, color: '#4D7C0F' },
    { y: y - 22, rx: 18, ry: 13, color: '#65A30D' },
    { y: y - 34, rx: 14, ry: 11, color: '#84CC16' },
    { y: y - 44, rx: 9, ry: 8, color: '#A3E635' },
  ];
  leafLayers.forEach((layer) => {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.ellipse(x, layer.y, layer.rx, layer.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawDecorativeOakTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 32, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thick dark-brown trunk
  ctx.fillStyle = '#3F2A14';
  ctx.strokeStyle = '#1C140A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 8, 16, 32, 4);
  ctx.fill();
  ctx.stroke();

  // Cloud-like green leaf clusters
  const clusters: { dx: number; dy: number; r: number; color: string }[] = [
    { dx: -16, dy: -18, r: 16, color: '#14532D' },
    { dx: 16, dy: -16, r: 15, color: '#166534' },
    { dx: 0, dy: -28, r: 18, color: '#15803D' },
    { dx: -10, dy: -36, r: 13, color: '#16A34A' },
    { dx: 12, dy: -38, r: 14, color: '#22C55E' },
    { dx: 0, dy: -46, r: 12, color: '#4ADE80' },
  ];
  clusters.forEach((c) => {
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x + c.dx, y + c.dy, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawDecorativeAutumnTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 26, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dark-grey trunk
  ctx.fillStyle = '#3F3F46';
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 6, 12, 30, 3);
  ctx.fill();
  ctx.stroke();

  // Vibrant red, orange, and yellow autumn foliage
  const clusters: { dx: number; dy: number; r: number; color: string }[] = [
    { dx: -14, dy: -16, r: 14, color: '#B91C1C' },
    { dx: 14, dy: -14, r: 13, color: '#C2410C' },
    { dx: 0, dy: -26, r: 16, color: '#EA580C' },
    { dx: -10, dy: -36, r: 12, color: '#F59E0B' },
    { dx: 11, dy: -38, r: 12, color: '#FBBF24' },
    { dx: 0, dy: -46, r: 10, color: '#FDE047' },
  ];
  clusters.forEach((c) => {
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x + c.dx, y + c.dy, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

// ==========================================
// 4. INTERACTIVE OBJECTS (BARRELS, SERVER RACKS, QUANTUM CORE)
// ==========================================
function drawInteractiveObjects(
  ctx: CanvasRenderingContext2D,
  objects: InteractiveObject[],
  time: number,
  occupancy?: { buildingId: string | null; floor: number }
) {
  objects.forEach((obj) => {
    if (obj.hp <= 0) return;
    if (occupancy && (obj.buildingId || obj.rackLevel) && !occupancyMatchesObject(occupancy, obj)) return;

    ctx.save();
    ctx.translate(obj.x, obj.y);

    // =========================================================
    // A. HOSTINGOVAYA SMASHABLE SERVER RACK CABINET
    // =========================================================
    if (obj.type === 'server_rack') {
      // Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 18, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Main Server Cabinet Body (Black matte metal)
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-16, -34, 32, 50, 4);
      ctx.fill();
      ctx.stroke();

      // 4 Server Blades with Status LED Arrays
      for (let s = 0; s < 4; s++) {
        const sy = -30 + s * 11;
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(-13, sy, 26, 9);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(-13, sy, 26, 9);

        // Blinking Server Activity LEDs
        const isDamaged = obj.hp < obj.maxHp;
        const ledBlink = Math.sin(time * 10 + s * 2 + obj.x) > 0;
        
        if (isDamaged && Math.random() < 0.35) {
          // Warning Red / Orange Blink
          ctx.fillStyle = ledBlink ? '#EF4444' : '#F59E0B';
        } else {
          // Normal Green / Cyan Blink
          ctx.fillStyle = s % 2 === 0 ? (ledBlink ? '#10B981' : '#059669') : (ledBlink ? '#38BDF8' : '#0284C7');
        }

        ctx.beginPath();
        ctx.arc(-8, sy + 4.5, 2, 0, Math.PI * 2);
        ctx.arc(-2, sy + 4.5, 2, 0, Math.PI * 2);
        ctx.fill();

        // Server Blade Ventilation Grille
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        for (let gx = 4; gx <= 10; gx += 3) {
          ctx.beginPath();
          ctx.moveTo(gx, sy + 2);
          ctx.lineTo(gx, sy + 7);
          ctx.stroke();
        }
      }

      // Top Glass Door Tint & Reflection
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(-14, -32, 28, 46);

      // Damaged Sparks & Smoke
      if (obj.hp < obj.maxHp) {
        const sparkTime = Math.sin(time * 25);
        if (sparkTime > 0.4) {
          ctx.fillStyle = '#FACC15';
          ctx.beginPath();
          ctx.arc(4, -36, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Mini HP Bar above rack
        const hpPct = obj.hp / obj.maxHp;
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-15, -42, 30, 5);
        ctx.fillStyle = hpPct > 0.5 ? '#10B981' : hpPct > 0.25 ? '#F59E0B' : '#EF4444';
        ctx.fillRect(-15, -42, 30 * hpPct, 5);
      }

      // Name Tag Plaque
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 8px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🖥️ ${obj.name?.split(' ')[0] || 'SERVER'}`, 0, -46);

      ctx.restore();
      return;
    }

    // =========================================================
    // B. QUANTUM CORE SUPERCOMPUTER (FLOOR 4 ROOFTOP BOSS UNIT)
    // =========================================================
    if (obj.type === 'quantum_core') {
      // Large Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.ellipse(0, 24, 38, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Octagonal Cryogenic Base
      ctx.fillStyle = '#020617';
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#06B6D4';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.roundRect(-32, -45, 64, 68, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Rotating Holographic Quantum Containment Rings
      const ringRot = time * 3;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -12, 28, 12, ringRot, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
      ctx.beginPath();
      ctx.ellipse(0, -12, 28, 12, -ringRot, 0, Math.PI * 2);
      ctx.stroke();

      // Floating Glowing Quantum Processor Cube in Center
      const cubeBob = Math.sin(time * 5) * 4;
      ctx.fillStyle = '#38BDF8';
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 12;
      ctx.fillRect(-12, -24 + cubeBob, 24, 24);
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-12, -24 + cubeBob, 24, 24);

      // Core HP Bar with Boss style gradient
      const hpPct = obj.hp / obj.maxHp;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-28, -58, 56, 7);
      ctx.fillStyle = hpPct > 0.5 ? '#06B6D4' : hpPct > 0.25 ? '#F59E0B' : '#EF4444';
      ctx.fillRect(-28, -58, 56 * hpPct, 7);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1;
      ctx.strokeRect(-28, -58, 56, 7);

      // Title Tag
      ctx.fillStyle = '#E0F2FE';
      ctx.font = '900 9px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑 QUANTUM SUPERCORE', 0, -64);

      ctx.restore();
      return;
    }

    // =========================================================
    // C. STANDARD RED EXPLOSIVE BARREL
    // =========================================================
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
      const treeScale = node.scale || 1;
      ctx.save();
      ctx.scale(treeScale, treeScale);
      const treeKind = node.treeType || 'pine';
      if (treeKind === 'birch') drawDecorativeBirchTree(ctx, 0, 0);
      else if (treeKind === 'oak') drawDecorativeOakTree(ctx, 0, 0);
      else if (treeKind === 'autumn') drawDecorativeAutumnTree(ctx, 0, 0);
      else drawDecorativePineTree(ctx, 0, 0);
      ctx.restore();
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

    if (node.type !== 'tree') {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.name, 0, -42);
    }

    ctx.restore();
  });
}

function drawDropItems(ctx: CanvasRenderingContext2D, dropItems: DropItem[], time: number) {
  dropItems.forEach((drop) => {
    const bounce = Math.abs(Math.sin(time * 4 + drop.x)) * 8;
    ctx.save();
    ctx.translate(drop.x, drop.y - bounce);

    if (drop.isXpGem) {
      const pulse = 0.55 + Math.sin(time * 7 + drop.x) * 0.2;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
      g.addColorStop(0, `rgba(253, 224, 71, ${pulse})`);
      g.addColorStop(0.45, `rgba(250, 204, 21, ${pulse * 0.7})`);
      g.addColorStop(1, 'rgba(234, 179, 8, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

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

const hordeSpriteCache = new Map<string, OffscreenCanvas>();
const CACHEABLE_HORDE_KINDS = new Set([
  'mite', 'shade', 'raider', 'shotgun', 'bomber', 'dasher', 'sniper',
  'splitter', 'boss_titan', 'boss_storm',
]);

const HORDE_ATLAS_SPRITES = [
  { kind: 'mite', boss: false, color: '#22D3EE' },
  { kind: 'shade', boss: false, color: '#6D28D9' },
  { kind: 'raider', boss: false, color: '#64748B' },
  { kind: 'shotgun', boss: false, color: '#F59E0B' },
  { kind: 'bomber', boss: false, color: '#F97316' },
  { kind: 'dasher', boss: false, color: '#F43F5E' },
  { kind: 'sniper', boss: false, color: '#EF4444' },
  { kind: 'splitter', boss: false, color: '#E879F9' },
  { kind: 'boss_titan', boss: true, color: '#334155' },
  { kind: 'boss_storm', boss: true, color: '#C026D3' },
] as const;

export type HordeMobAtlasSprite = (typeof HORDE_ATLAS_SPRITES)[number];

/** Runtime atlas source. The established vector body remains authoritative. */
export function getHordeMobAtlasSprites(): readonly HordeMobAtlasSprite[] {
  return HORDE_ATLAS_SPRITES;
}

export function drawHordeMobAtlasSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HordeMobAtlasSprite,
) {
  drawCachedHordeMobBody(ctx, sprite.kind, sprite.boss, sprite.color);
}

/** Hit flashes are a shader tint, so combat never evicts horde bodies from the GPU atlas. */
export function getWebglHordeMobAtlasKey(monster: Monster): string | null {
  const kind = monster.hordeKind;
  if (!kind || !CACHEABLE_HORDE_KINDS.has(kind)) return null;
  const boss = Boolean(monster.isBoss);
  const sprite = HORDE_ATLAS_SPRITES.find((candidate) => candidate.kind === kind && candidate.boss === boss);
  return sprite ? `${sprite.kind}:${sprite.boss ? 1 : 0}` : null;
}

/**
 * First WebGL production set: static horde bodies and ordinary idle humanoid
 * enemies. Anything with a visible transient transform stays on Canvas so
 * the atlas can never freeze a hit reaction, jump, dash or death animation.
 */
export function getWebglMonsterAtlasKey(monster: Monster): string | null {
  const hordeKey = getWebglHordeMobAtlasKey(monster);
  if (hordeKey) return `horde:${hordeKey}`;
  if (
    monster.hordeKind ||
    monster.type === 'forest_wolf' ||
    monster.hp <= 0 ||
    (monster.hitFlash || 0) > 0 ||
    (monster.jumpZ || 0) > 0 ||
    (monster.dodgeTimer || 0) > 0 ||
    monster.isCharging ||
    monster.isPinned ||
    monster.isJuggernaut ||
    monster.humanChibi ||
    (monster.attackCooldown || 0) > 1
  ) return null;
  return `humanoid:${monster.type}:${monster.weaponType ?? 'pistol'}:${monster.isBoss ? 1 : 0}:${monster.faction ?? 'none'}`;
}

const NATIVE_FACTION_SPRITES = new Set([
  'police_cop_officer', 'police_cop_swat', 'police_cop_enforcer', 'police_cop_marksman',
  'punk_punk_grunt', 'punk_punk_anarchist', 'punk_punk_molotov',
  'bandit_bandit_grunt', 'bandit_bandit_scout', 'bandit_bandit_gunner',
  'bandit_bandit_shotgunner', 'bandit_bandit_sniper', 'bandit_bandit_brawler',
  'cadet_cadet_bat', 'cadet_cadet_gunner', 'cadet_cadet_mage', 'cadet_human_target',
]);

const NATIVE_BOSS_SPRITES: Record<string, string> = {
  boss_welder: 'boss_boss_welder',
  boss_outlaw_viktor: 'boss_boss_outlaw_viktor',
  bandit_boss: 'boss_boss_bandit_warlord',
  cop_juggernaut: 'boss_boss_police_juggernaut',
  punk_juggernaut: 'boss_boss_punk_juggernaut',
};

/**
 * Native actor sprites deliberately stay selected through combat state.
 *
 * The atlas cells are generated from the source Canvas routines, so a
 * cooldown, a charged shot, or a `humanChibi` descriptor is not a different
 * body asset. Treating those flags as a Canvas fallback made every crowded
 * firefight re-rasterize the complete WebView layer and capped the picture at
 * the browser rAF cadence. Transient muzzle flashes, telegraphs and damage
 * effects remain an overlay; the actor body itself is always a sprite.
 */
export function getNativeMonsterSpriteFrame(monster: Monster): string | null {
  if (monster.hp <= 0) return null;
  const horde = getWebglHordeMobAtlasKey(monster);
  if (horde) {
    const [kind, boss] = horde.split(':');
    return `horde_${kind}${boss === '1' ? '_boss' : ''}`;
  }
  const bossFrame = NATIVE_BOSS_SPRITES[monster.type];
  if (bossFrame) return bossFrame;
  if (
    monster.hordeKind
    || monster.type === 'forest_wolf'
  ) return null;
  const faction = monster.faction === 'punk_demon' ? 'punk' : monster.faction;
  const frame = `${faction}_${monster.type}`;
  return NATIVE_FACTION_SPRITES.has(frame) ? frame : null;
}

/** Full-frame Miku is generated from the exact character-creator recipe. */
export function getNativePlayerSpriteFrame(player: Player): string | null {
  const chibi = player.chibi;
  if (
    player.state === 'dead'
    || player.isRiding
    || player.activeVehicleId
    || player.emote
    || (player.chatTimer ?? 0) > 0
    || player.isReloading
    || (player.dodgeTimer ?? 0) > 0
    || (player.jumpZ ?? 0) > 0
    || (player.omnislashStrikesLeft ?? 0) > 0
    || (player.dashSlashTimer ?? 0) > 0
    || (player.bhopStreak ?? 0) >= 2
    || (player.coolStreak ?? 0) >= 2
    || player.attackTimer > 0
    || !chibi
  ) return null;
  const isMiku = chibi.frontHairStyle === 'miku_fringe'
    && chibi.backHairStyle === 'miku_twintails'
    && chibi.hairColor.toUpperCase() === '#06B6D4'
    && chibi.hatType === 'headphones'
    && chibi.outfitType === 'idol_stage';
  if (!isMiku) return null;
  const weapon = player.equipment.weapon?.gunType ?? 'pistol';
  return `character_hatsune_miku_${weapon}`;
}

/**
 * Runtime visual key for procedural players. Position and combat state are
 * intentionally excluded: moving a player must never allocate a new raster.
 */
export function getWebglPlayerAtlasKey(player: Player): string | null {
  if (
    player.state === 'dead' ||
    player.isRiding ||
    player.activeVehicleId ||
    player.emote ||
    (player.chatTimer ?? 0) > 0 ||
    player.isReloading ||
    (player.dodgeTimer ?? 0) > 0 ||
    (player.jumpZ ?? 0) > 0 ||
    (player.omnislashStrikesLeft ?? 0) > 0 ||
    (player.dashSlashTimer ?? 0) > 0 ||
    (player.bhopStreak ?? 0) >= 2 ||
    (player.coolStreak ?? 0) >= 2 ||
    (player.skateTrickTimer ?? 0) > 0
  ) return null;
  return `player:${JSON.stringify(player.chibi)}:${player.equipment.weapon?.id ?? 'none'}:${player.equipment.outfit?.id ?? 'none'}:${player.equipment.headwear?.id ?? 'none'}:${player.state}:${player.isAiming ? 1 : 0}:${player.isReloading ? 1 : 0}:${player.attackTimer > 0 ? 1 : 0}`;
}

/** Invoked only while a new runtime atlas slot is created, never per frame. */
export function drawWebglMonsterAtlasSprite(ctx: CanvasRenderingContext2D, monster: Monster) {
  if (monster.hordeKind) {
    const key = getWebglHordeMobAtlasKey(monster);
    const sprite = key
      ? HORDE_ATLAS_SPRITES.find((candidate) => `${candidate.kind}:${candidate.boss ? 1 : 0}` === key)
      : undefined;
    if (sprite) drawHordeMobAtlasSprite(ctx, sprite);
    return;
  }
  drawHumanoidEnemy(ctx, monster, 0, { bodyOnly: true });
}

/** Invoked only while a player visual enters the runtime atlas. */
export function drawWebglPlayerAtlasSprite(ctx: CanvasRenderingContext2D, player: Player) {
  drawChibiCharacter(
    ctx,
    {
      ...player,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      previewOffsetX: 0,
      previewOffsetY: 0,
      spawnBounce: 1,
      jumpZ: 0,
      jumpVz: 0,
      isJumping: false,
      bhopStreak: 0,
      isSprinting: false,
      dodgeTimer: 0,
      attackTimer: 0,
      cinematicPose: 'none',
    },
    0,
    true,
    { bodyOnly: true },
  );
}

function drawWebglHumanoidHealthBar(ctx: CanvasRenderingContext2D, monster: Monster) {
  if (monster.hp <= 0) return;
  const isBossBandit = monster.type === 'bandit_boss' || Boolean(monster.isBoss);
  const isDummy = monster.type === 'human_target';
  const barW = isBossBandit ? 90 : 44;
  const barH = isBossBandit ? 8 : 5;
  const barY = isBossBandit ? -65 : -46;
  const hpRatio = Math.max(0, monster.hp / monster.maxHp);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = isBossBandit ? '#EF4444' : isDummy ? '#F59E0B' : '#38BDF8';
  ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
}

function drawCachedHordeMobBody(
  ctx: CanvasRenderingContext2D,
  kind: string,
  boss: boolean,
  color: string,
) {
  if (kind === 'mite') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ECFEFF';
    ctx.fillRect(-3, -2, 2, 2);
    ctx.fillRect(2, -2, 2, 2);
  } else if (kind === 'shade') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.quadraticCurveTo(-18, -8, 0, -16);
    ctx.quadraticCurveTo(18, -8, 14, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F472B6';
    ctx.beginPath();
    ctx.arc(5, -6, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'bomber') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-14, -10, 28, 24, 8);
    ctx.fill();
    ctx.fillStyle = '#1C1917';
    ctx.beginPath();
    ctx.arc(0, -4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(0, -4, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-14, -16, 28, 32, boss ? 6 : 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = kind === 'sniper' ? '#FECACA' : '#E2E8F0';
    ctx.beginPath();
    ctx.arc(8, -10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kind === 'dasher' ? '#F43F5E' : '#22D3EE';
    ctx.beginPath();
    ctx.arc(11, -11, 2, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'shotgun') {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(10, -2, 16, 4);
    }
    if (kind === 'splitter') {
      ctx.strokeStyle = '#F5D0FE';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-18, -20, 36, 40);
      ctx.setLineDash([]);
    }
  }
}

function getCachedHordeMobSprite(kind: string, boss: boolean, color: string) {
  if (typeof OffscreenCanvas === 'undefined' || !CACHEABLE_HORDE_KINDS.has(kind)) return null;
  const key = `${kind}:${boss ? 1 : 0}:${color}`;
  const cached = hordeSpriteCache.get(key);
  if (cached) return cached;

  const sprite = new OffscreenCanvas(72, 72);
  const spriteContext = sprite.getContext('2d');
  if (!spriteContext) return null;
  spriteContext.translate(36, 36);
  drawCachedHordeMobBody(spriteContext as unknown as CanvasRenderingContext2D, kind, boss, color);
  hordeSpriteCache.set(key, sprite);
  return sprite;
}

function drawHordeMob(
  ctx: CanvasRenderingContext2D,
  m: Monster,
  time: number,
  skipWebglHordeMobBody = false,
) {
  const kind = m.hordeKind || 'shade';
  const flash = (m.hitFlash || 0) > 0;
  const boss = !!m.isBoss;
  const s = boss ? 1.55 : kind === 'mite' ? 0.55 : kind === 'blindcaster' ? 1.15 : 1;
  const palette: Record<string, string> = {
    shade: '#6D28D9',
    mite: '#22D3EE',
    raider: '#64748B',
    laser: '#22D3EE',
    shotgun: '#F59E0B',
    bomber: '#F97316',
    skycaller: '#A78BFA',
    dasher: '#F43F5E',
    sniper: '#EF4444',
    orbiter: '#34D399',
    splitter: '#E879F9',
    blindcaster: '#111827',
    boss_titan: '#334155',
    boss_beam: '#0891B2',
    boss_skyfall: '#FB7185',
    boss_void: '#1E1B4B',
    boss_storm: '#C026D3',
  };
  const col = flash ? '#FFFFFF' : (palette[kind] || '#7C3AED');

  ctx.save();
  ctx.scale(m.facing === 'left' ? -s : s, s);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const atlasOwnedByWebgl = skipWebglHordeMobBody && getWebglHordeMobAtlasKey(m) !== null;
  const cachedSprite = !atlasOwnedByWebgl && !flash && !(ctx as RenderSceneLayerContext).__disableSpriteCache
    ? getCachedHordeMobSprite(kind, boss, col)
    : null;
  if (atlasOwnedByWebgl) {
    // The transparent WebGL layer draws just this body. Leave the Canvas
    // shadow and status UI below/above it in their established draw order.
  } else if (cachedSprite) {
    ctx.drawImage(cachedSprite, -36, -36);
  } else if (kind === 'mite') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ECFEFF';
    ctx.fillRect(-3, -2, 2, 2);
    ctx.fillRect(2, -2, 2, 2);
  } else if (kind === 'shade') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.quadraticCurveTo(-18, -8, 0, -16);
    ctx.quadraticCurveTo(18, -8, 14, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F472B6';
    ctx.beginPath();
    ctx.arc(5, -6, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'orbiter') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -4, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ECFDF5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -4, 22, 10, time * 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'blindcaster' || kind === 'boss_void') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-16, -18, 32, 36, 8);
    ctx.fill();
    ctx.strokeStyle = '#E879F9';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.arc(-6, -8, 3.5, 0, Math.PI * 2);
    ctx.arc(6, -8, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(232, 121, 249, ${0.5 + Math.sin(time * 6) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -4, 22 + Math.sin(time * 4) * 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'laser' || kind === 'boss_beam') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-10, -22, 20, 40, 4);
    ctx.fill();
    ctx.fillStyle = '#ECFEFF';
    ctx.shadowColor = '#22D3EE';
    ctx.shadowBlur = 12;
    ctx.fillRect(-2, -18, 4, 28);
    ctx.shadowBlur = 0;
  } else if (kind === 'skycaller' || kind === 'boss_skyfall') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -6, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -6, 20, time, time + Math.PI * 1.4);
    ctx.stroke();
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(5, -16);
    ctx.lineTo(-5, -16);
    ctx.fill();
  } else if (kind === 'bomber') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-14, -10, 28, 24, 8);
    ctx.fill();
    ctx.fillStyle = '#1C1917';
    ctx.beginPath();
    ctx.arc(0, -4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(0, -4, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-14, -16, 28, 32, boss ? 6 : 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = kind === 'sniper' ? '#FECACA' : '#E2E8F0';
    ctx.beginPath();
    ctx.arc(8, -10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kind === 'dasher' ? '#F43F5E' : '#22D3EE';
    ctx.beginPath();
    ctx.arc(11, -11, 2, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'shotgun') {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(10, -2, 16, 4);
    }
    if (kind === 'splitter') {
      ctx.strokeStyle = '#F5D0FE';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-18, -20, 36, 40);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();

  if (m.hp > 0) {
    const hpRatio = Math.max(0, m.hp / m.maxHp);
    const barW = boss ? 54 : 36;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-barW / 2, boss ? -48 : -34, barW, 5);
    ctx.fillStyle = boss ? '#F43F5E' : '#22D3EE';
    ctx.fillRect(-barW / 2, boss ? -48 : -34, barW * hpRatio, 5);
  }

  const blind = getHordeBlindness();
  if (blind.active && blind.casterId === m.id) {
    ctx.strokeStyle = `rgba(232, 121, 249, ${0.55 + Math.sin(time * 8) * 0.35})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -8, 28 + Math.sin(time * 5) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawMonsters(
  ctx: CanvasRenderingContext2D,
  monsters: Monster[],
  time: number,
  skipWebglHordeMobBodies = false,
  skipNativeSpriteBodies = false,
) {
  monsters.forEach((m) => {
    // Render living monsters and dead monsters during their ragdoll fall
    if (m.hp <= 0 && (m.deathProgress === undefined || m.deathProgress >= 1.0)) return;
    // Stable bodies and their HP bars are emitted by the WebGL actor pass.
    // Transient states deliberately fall through to Canvas for visual parity.
    if (
      (skipWebglHordeMobBodies && getWebglMonsterAtlasKey(m) !== null)
      || (skipNativeSpriteBodies && getNativeMonsterSpriteFrame(m) !== null)
    ) return;

    ctx.save();
    ctx.translate(m.x, m.y);

    if (m.hordeKind) {
      drawHordeMob(ctx, m, time, skipWebglHordeMobBodies);
    } else if (m.type === 'forest_wolf') {
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
      }
    } else {
      // Draw Humanoid Bandits, Outlaws, and "Iron Mask" Sledge Boss
      if (skipWebglHordeMobBodies && getWebglMonsterAtlasKey(m) !== null) {
        drawWebglHumanoidHealthBar(ctx, m);
      } else {
        drawHumanoidEnemy(ctx, m, time);
      }
    }

    ctx.restore();
  });
}

function drawSummons(ctx: CanvasRenderingContext2D, summons: SummonedAlly[], time: number) {
  summons.forEach((ally) => {
    ctx.save();
    ctx.translate(ally.x, ally.y);
    ctx.scale(ally.facing === 'left' ? -ally.scale : ally.scale, ally.scale);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ally.kind === 'golem') {
      ctx.fillStyle = '#57534E';
      ctx.strokeStyle = '#1C1917';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(-22, -28, 44, 48, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#78716C';
      ctx.fillRect(-16, -40, 32, 16);
      ctx.strokeRect(-16, -40, 32, 16);
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(-7, -34, 3, 0, Math.PI * 2);
      ctx.arc(7, -34, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (ally.kind === 'totem') {
      ctx.fillStyle = '#4C1D95';
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-10, 16);
      ctx.lineTo(-6, -42);
      ctx.lineTo(6, -42);
      ctx.lineTo(10, 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#C084FC';
      ctx.shadowColor = '#C084FC';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-6, -42);
      ctx.lineTo(0, -56);
      ctx.lineTo(6, -42);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#D8B4FE';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-3, -24);
      ctx.lineTo(3, -24);
      ctx.moveTo(0, -32);
      ctx.lineTo(0, -16);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#7F1D1D';
      ctx.strokeStyle = '#450A0A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-16, -8, 32, 18, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1C1917';
      ctx.beginPath();
      ctx.arc(12, -10, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#F97316';
      ctx.shadowColor = '#F97316';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(15, -12, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      const earX = 8;
      ctx.fillStyle = '#450A0A';
      ctx.beginPath();
      ctx.moveTo(earX, -16);
      ctx.lineTo(earX + 4, -26);
      ctx.lineTo(earX + 8, -14);
      ctx.fill();
    }

    ctx.restore();
    const hpRatio = Math.max(0, ally.hp / ally.maxHp);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(ally.x - 16, ally.y - 28 * ally.scale - 8, 32, 4);
    ctx.fillStyle = ally.kind === 'golem' ? '#A8A29E' : '#F97316';
    ctx.fillRect(ally.x - 16, ally.y - 28 * ally.scale - 8, 32 * hpRatio, 4);
  });
}

/** Basic repeated trails are visually represented by the GPU soft-sprite pass. */
export function isWebglProjectile(projectile: Projectile) {
  return projectile.type === 'bullet' || projectile.type === 'enemy_bullet';
}

/** Keep smoke, casings and rings on Canvas until their dedicated GPU variants land. */
export function isWebglParticle(particle: VisualParticle) {
  return particle.shape === 'circle' || particle.shape === 'spark';
}

function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]) {
  projectiles.forEach((p) => {
    ctx.save();
    // Launch effects from an elevated muzzle, then smoothly converge with the
    // authoritative ground-plane trajectory used for collision detection.
    const launchOffset = (p.visualOffsetY ?? 0) * Math.max(0, 1 - p.distanceTraveled / 260);
    ctx.translate(p.x, p.y + launchOffset);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);

    if (p.type === 'laser' || p.range > 1800) {
      const trailLength = p.tracerLength ?? 72;
      const width = p.tracerWidth ?? 4.8;
      const grad = ctx.createLinearGradient(-trailLength, 0, 10, 0);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.7, p.color || '#38BDF8');
      grad.addColorStop(1, '#FFFFFF');
      ctx.strokeStyle = grad;
      ctx.lineWidth = width;
      ctx.shadowColor = p.color || '#38BDF8';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(-trailLength, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(12, 0, Math.max(3, (p.size || 8) * 0.45), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'slash_wave') {
      ctx.strokeStyle = p.color || '#38BDF8';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = p.color || '#38BDF8';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, p.size || 16, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
    } else if (p.type === 'magic_orb' || p.type === 'fireball') {
      const r = p.size || 8;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
      g.addColorStop(0, '#FFF7ED');
      g.addColorStop(0.45, p.color || '#F97316');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.shadowColor = p.color || '#F97316';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'meteor' || p.type === 'boss_meteor') {
      ctx.fillStyle = '#1C1917';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size || 16, (p.size || 16) * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FB7185';
      ctx.shadowColor = '#F97316';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(-p.size, 0);
      ctx.lineTo(-p.size * 2.4, -6);
      ctx.lineTo(-p.size * 2.4, 6);
      ctx.fill();
    } else if (p.type === 'thrown_knife') {
      ctx.fillStyle = '#E2E8F0';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -3.5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-6, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.type === 'spinning_blade') {
      ctx.rotate(p.distanceTraveled * 0.18);
      ctx.fillStyle = '#CBD5E1';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = i % 2 === 0 ? (p.size || 18) : (p.size || 18) * 0.45;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.type === 'falling_sword') {
      ctx.fillStyle = '#E0F2FE';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-2.5, -18, 5, 28);
      ctx.strokeRect(-2.5, -18, 5, 28);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-6, 8, 12, 3);
    } else if (p.type === 'lightning_bolt') {
      ctx.strokeStyle = p.color || '#22D3EE';
      ctx.lineWidth = p.size || 4.5;
      ctx.shadowColor = p.color || '#22D3EE';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      let curX = 0;
      let curY = -300;
      ctx.moveTo(curX, curY);
      const segments = 6;
      const stepY = 300 / segments;
      for (let i = 1; i < segments; i++) {
        curX += (Math.random() - 0.5) * 24;
        curY += stepY;
        ctx.lineTo(curX, curY);
      }
      ctx.lineTo(0, 0);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = (p.size || 4.5) * 0.45;
      ctx.beginPath();
      curX = 0;
      curY = -300;
      ctx.moveTo(curX, curY);
      for (let i = 1; i < segments; i++) {
        curX += (Math.random() - 0.5) * 24;
        curY += stepY;
        ctx.lineTo(curX, curY);
      }
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (p.type === 'void_singularity') {
      const r = p.size || 24;
      const animTime = Date.now() / 1000;
      ctx.strokeStyle = '#7C3AED';
      ctx.lineWidth = 3.0;
      ctx.shadowColor = '#C084FC';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, r + Math.sin(animTime * 10) * 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(124, 58, 237, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#F472B6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      const trailLength = p.tracerLength ?? 18;
      const width = p.tracerWidth ?? 2.0;
      const grad = ctx.createLinearGradient(-trailLength, 0, 6, 0);
      grad.addColorStop(0, 'rgba(251, 191, 36, 0)');
      grad.addColorStop(0.6, p.color || '#FDE047');
      grad.addColorStop(1, '#FFFFFF');
      ctx.strokeStyle = grad;
      ctx.lineWidth = width;
      ctx.shadowColor = p.color || '#FDE047';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(-trailLength, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(6, 0, Math.max(1.1, (p.size || 4) * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: VisualParticle[]) {
  particles.forEach((pt) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.alpha);
    if (pt.shape === 'casing') {
      const ang = Math.atan2(pt.vy, pt.vx);
      ctx.translate(pt.x, pt.y);
      ctx.rotate(ang + pt.life * 10);
      ctx.fillStyle = pt.color;
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(-pt.size * 0.35, -pt.size, pt.size * 0.7, pt.size * 2, 1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-pt.size * 0.35, -pt.size, pt.size * 0.7, pt.size * 0.45);
    } else if (pt.shape === 'spark') {
      const ang = Math.atan2(pt.vy, pt.vx);
      const len = pt.size * 3.4;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = Math.max(0.7, pt.size * 0.42);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x - Math.cos(ang) * len, pt.y - Math.sin(ang) * len);
      ctx.stroke();
      ctx.fillStyle = '#FFFBEB';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.5, pt.size * 0.32), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawDamagePopups(ctx: CanvasRenderingContext2D, damagePopups: DamagePopup[]) {
  damagePopups.forEach((dp) => {
    ctx.save();
    const progress = 1 - dp.life / dp.maxLife;
    const isMangaSound = dp.type === 'manga' || ['POW!', 'ПИХ!', 'ПАХ!', 'BANG!', 'RATATA!', 'BOOM!', 'PEW!', 'БДЫЩ!', 'БАБАХ!', 'ТЫДЫЩ!', 'БАНГ!', 'КРАШ!', 'ВЖУХ!', 'ТРА-ТА!', 'ТА-ТА!', 'ПАХ-ПАХ!'].some(w => dp.text === w || dp.text === `${w}!`);
    const isBark = dp.type === 'bark';

    const scale = isBark
      ? (dp.scale || 1)
      : isMangaSound
        ? (dp.scale || 0.82) * (0.85 + Math.sin(Math.min(progress * 3, Math.PI / 2)) * 0.25) * (1 - progress * 0.15)
        : (dp.scale || 1.0) * (1 + Math.sin(progress * Math.PI) * 0.25);
    const alpha = Math.max(0, dp.life / dp.maxLife);

    ctx.translate(dp.x, dp.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    if (isBark) {
      ctx.font = '900 11px Fredoka, sans-serif';
      const textMetrics = ctx.measureText(dp.text);
      const bubbleW = Math.max(72, textMetrics.width + 20);
      const bubbleH = 24;
      const bubbleY = -bubbleH;

      ctx.fillStyle = '#FEF08A';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(-bubbleW / 2, bubbleY, bubbleW, bubbleH, 8);
      ctx.fill();
      ctx.stroke();

      // Downward speech-bubble tail (stays at the scream origin)
      ctx.beginPath();
      ctx.moveTo(-5, bubbleY + bubbleH);
      ctx.lineTo(0, bubbleY + bubbleH + 8);
      ctx.lineTo(5, bubbleY + bubbleH);
      ctx.closePath();
      ctx.fillStyle = '#FEF08A';
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dp.text, 0, bubbleY + bubbleH / 2);
    } else if (isMangaSound) {
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

function getSkyClearColor(phase: number): string {
  const hour = (phase % 1) * 24;
  if (hour >= 6 && hour < 18) return '#0D141C';
  if (hour >= 18 && hour < 20) return '#14101A';
  if (hour >= 5 && hour < 6) return '#120F18';
  return '#060810';
}

function drawDayNightOverlay(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  phase: number
) {
  if (vw <= 0 || vh <= 0) return;
  const hour = (phase % 1) * 24;

  let tint = 'rgba(0, 0, 0, 0)';
  if (hour >= 20 || hour < 5) {
    const nightStrength = hour >= 20 ? Math.min(1, (hour - 20) / 3) : Math.max(0, (5 - hour) / 3);
    tint = `rgba(8, 12, 36, ${0.12 + nightStrength * 0.42})`;
  } else if (hour >= 5 && hour < 7) {
    const dawn = (hour - 5) / 2;
    tint = `rgba(251, 146, 60, ${0.28 - dawn * 0.2})`;
  } else if (hour >= 17 && hour < 20) {
    const dusk = (hour - 17) / 3;
    tint = `rgba(236, 72, 153, ${0.08 + dusk * 0.22})`;
  }

  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, vw, vh);

  // Moon or sun hint in sky corner
  const isNight = hour >= 20 || hour < 6;
  const orbX = vw * 0.82;
  const orbY = vh * (isNight ? 0.14 : 0.1);
  const orbGrad = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, isNight ? 28 : 36);
  if (isNight) {
    orbGrad.addColorStop(0, 'rgba(226, 232, 240, 0.55)');
    orbGrad.addColorStop(1, 'rgba(226, 232, 240, 0)');
  } else {
    orbGrad.addColorStop(0, 'rgba(253, 224, 71, 0.45)');
    orbGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
  }
  ctx.fillStyle = orbGrad;
  ctx.beginPath();
  ctx.arc(orbX, orbY, isNight ? 28 : 36, 0, Math.PI * 2);
  ctx.fill();
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

/** Resolve which weapon silhouette to show during the intro cinematic */
function resolveCinematicGunType(player: Player): string {
  const weapon = player.equipment?.weapon;
  if (weapon?.gunType) return weapon.gunType;
  if (weapon?.id?.includes('katana')) return 'katana';
  if (weapon?.id?.includes('staff')) return 'staff';
  const cls = player.characterClass || 'gunslinger';
  if (cls === 'swordmaster') return 'katana';
  if (cls === 'cybermage') return 'staff';
  return 'pistol';
}

/** Draw a weapon sprite for the falling cinematic (top-down / side view) */
function drawCinematicWeaponSprite(
  ctx: CanvasRenderingContext2D,
  gunType: string,
  accentColor: string,
  time: number
) {
  if (gunType === 'katana') {
    ctx.fillStyle = '#E0F2FE';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-18, -3);
    ctx.lineTo(18, -1);
    ctx.quadraticCurveTo(24, 0, 18, 3);
    ctx.lineTo(-18, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 1);
    ctx.stroke();
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-20, -5, 4, 10);
    ctx.strokeRect(-20, -5, 4, 10);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-28, -2.5, 8, 5);
    ctx.strokeRect(-28, -2.5, 8, 5);
  } else if (gunType === 'staff' || gunType === 'wand') {
    ctx.fillStyle = '#78350F';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-20, -2.5, 36, 5);
    ctx.strokeRect(-20, -2.5, 36, 5);
    ctx.fillStyle = gunType === 'wand' ? '#FDE047' : '#F97316';
    ctx.shadowColor = gunType === 'wand' ? '#FDE047' : '#F97316';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(18, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (gunType === 'grimoire') {
    ctx.fillStyle = '#4C1D95';
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-10, -12, 20, 24);
    ctx.strokeRect(-10, -12, 20, 24);
    ctx.fillStyle = '#F97316';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('*', -3, 4);
  } else if (gunType === 'sledgehammer') {
    ctx.fillStyle = '#64748B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-18, -2, 30, 4);
    ctx.strokeRect(-18, -2, 30, 4);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(10, -10, 14, 20);
    ctx.strokeRect(10, -10, 14, 20);
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(13, -6, 8, 12);
  } else if (gunType === 'greatsword') {
    ctx.fillStyle = '#94A3B8';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, -4);
    ctx.lineTo(22, -2);
    ctx.lineTo(26, 0);
    ctx.lineTo(22, 3);
    ctx.lineTo(-14, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-22, -5, 10, 11);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-12, -6, 4, 13);
  } else if (gunType === 'scythe') {
    ctx.fillStyle = '#44403C';
    ctx.fillRect(-16, -2, 32, 4);
    ctx.strokeRect(-16, -2, 32, 4);
    ctx.fillStyle = '#A3E635';
    ctx.strokeStyle = '#365314';
    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.quadraticCurveTo(30, -18, 10, -14);
    ctx.quadraticCurveTo(24, -4, 14, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Default: pistol / firearm silhouette
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-10, -3, 20, 6);
    ctx.strokeRect(-10, -3, 20, 6);
    ctx.fillStyle = '#475569';
    ctx.fillRect(8, -2, 8, 4);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6, 2, 5, 8);
    ctx.fillStyle = accentColor;
    ctx.fillRect(-6, -2, 12, 1.5);
    ctx.fillStyle = '#FEF08A';
    ctx.globalAlpha = 0.7 + Math.sin(time * 8) * 0.3;
    ctx.beginPath();
    ctx.arc(12, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw the falling weapon / weapon on ground during intro cinematic */
function drawFallingCinematicWeapon(
  ctx: CanvasRenderingContext2D,
  player: Player,
  introCinematic: IntroCinematicState | undefined,
  time: number
) {
  if (!introCinematic || (introCinematic.phase !== 'gun_fall_bonk' && introCinematic.phase !== 'pickup_ready')) {
    return;
  }

  const phase = introCinematic.phase;
  const timer = introCinematic.timer;

  let wx = 880;
  let wy = 750;
  let rot = 0;
  let scale = 1.0;
  let alpha = 1.0;

  if (phase === 'gun_fall_bonk') {
    if (timer < 0.8) {
      // Falling from sky to head (y from 450 to 715)
      const prog = timer / 0.8;
      wx = 880;
      wy = 450 + prog * 265;
      rot = time * 20;
      // Motion blur trails
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx, wy - 30);
      ctx.lineTo(wx, wy);
      ctx.stroke();
      ctx.restore();
    } else {
      // Bonked! Bouncing from head to ground
      const bounceProg = Math.min(1, (timer - 0.8) / 0.8);
      wx = 880 + bounceProg * 22;
      const arcHeight = Math.sin(bounceProg * Math.PI) * 28;
      wy = 715 - arcHeight + bounceProg * 40; // lands at ~755
      rot = 0.8 + bounceProg * 5;
    }
  } else if (phase === 'pickup_ready') {
    if (timer >= 0.7) {
      // Picked up by player
      return;
    }
    // Resting on ground waiting to be picked up
    wx = 902;
    wy = 755;
    rot = 0.35;
    // Glowing item pickup ring
    ctx.save();
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + Math.sin(time * 6) * 0.3;
    ctx.beginPath();
    ctx.ellipse(wx, wy + 4, 16 + Math.sin(time * 4) * 3, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw class-specific weapon on ground / in air
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  const gunType = resolveCinematicGunType(player);
  const accentColor = player?.chibi?.accentColor || '#EF4444';
  drawCinematicWeaponSprite(ctx, gunType, accentColor, time);

  ctx.restore();
}

/** Draw Screen-Space Overlays: Fade-in, Speed lines, Letterbox Bars, Tech HUD during intro cinematic */
function drawCinematicOverlays(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  introCinematic: IntroCinematicState | undefined,
  localPlayer: Player,
  time: number
) {
  if (!introCinematic || introCinematic.phase === 'none' || introCinematic.phase === 'complete') {
    return;
  }

  const phase = introCinematic.phase;
  const timer = introCinematic.timer;

  // 1. Initial Black Fade In
  if (phase === 'black_fade_in') {
    const fadeAlpha = Math.max(0, 1 - timer / 0.4);
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.restore();
  }

  // 2. Supersonic Re-Entry Speed Lines & Thermal Glow during Dive
  if (phase === 'dive') {
    ctx.save();
    // Thermal atmospheric vignette
    const grad = ctx.createRadialGradient(canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.3, canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.9);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
    grad.addColorStop(0.7, 'rgba(245, 158, 11, 0.15)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Speed lines streaking down
    ctx.lineWidth = 2;
    for (let i = 0; i < 28; i++) {
      const sx = (i * 73 + time * 600) % canvasWidth;
      const sy = ((i * 127 + time * 1400) % (canvasHeight + 400)) - 200;
      const len = 120 + (i % 5) * 60;
      const alpha = 0.3 + (i % 4) * 0.18;
      ctx.strokeStyle = i % 3 === 0 ? `rgba(253, 224, 71, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 15, sy + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Cinematic Widescreen Letterbox Bars & Cyberpunk HUD Tech Decor
  const barHeight = 48;
  ctx.save();
  // Top Black Bar
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, canvasWidth, barHeight);
  // Bottom Black Bar
  ctx.fillRect(0, canvasHeight - barHeight, canvasWidth, barHeight);

  // Top Neon Tech Line
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, barHeight);
  ctx.lineTo(canvasWidth, barHeight);
  ctx.stroke();

  // Bottom Neon Tech Line
  ctx.strokeStyle = '#38BDF8';
  ctx.beginPath();
  ctx.moveTo(0, canvasHeight - barHeight);
  ctx.lineTo(canvasWidth, canvasHeight - barHeight);
  ctx.stroke();

  // Tech Text - Top Left
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#F87171';
  ctx.textAlign = 'left';
  ctx.fillText(`⚡ ORBITAL RE-ENTRY // PHASE: ${phase.toUpperCase()}`, 20, 28);

  // Tech Text - Top Right
  ctx.fillStyle = '#38BDF8';
  ctx.textAlign = 'right';
  ctx.fillText(`OPERATOR: ${(localPlayer?.name || 'HERO').toUpperCase()} // ARCHETYPE//07`, canvasWidth - 20, 28);

  ctx.restore();
}
