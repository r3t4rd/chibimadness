import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, Item, ChatMessage } from './types/game';
import { useGameEngine } from './game/useGameEngine';
import {
  advanceCanvasCamera,
  drawWorldInput,
  getNativeMonsterSpriteFrame,
  getNativePlayerSpriteFrame,
  screenToWorld,
  type WorldRenderInput,
} from './game/worldRenderer';
import { perfMonitor, type CanvasProbeMode } from './game/performanceMonitor';
import {
  createWebglHordeMobRenderer,
  type WebglHordeMobRenderer,
  type WebglStaticWorldView,
} from './game/webglHordeMobRenderer';
import { DebugOverlay } from './components/DebugOverlay';
import { sound } from './game/audioEngine';
import { CharacterCreator } from './components/CharacterCreator';
import { HUD } from './components/HUD';
import { InventoryModal } from './components/InventoryModal';
import { CraftingModal } from './components/CraftingModal';
import { ShopModal } from './components/ShopModal';
import { DialogueModal } from './components/DialogueModal';
import { SkillTreeModal } from './components/SkillTreeModal';
import { WorldMapModal } from './components/WorldMapModal';
import { LevelUpModal } from './components/LevelUpModal';
import { GunsmithModal } from './components/GunsmithModal';
import { ChatAndEmotes } from './components/ChatAndEmotes';
import { SettingsModal } from './components/SettingsModal';

import { BossBar } from './components/BossBar';
import { MobileControls } from './components/MobileControls';
import { CLASS_DEFAULTS } from './game/constants';
import {
  getContentBuildInfo,
  isNativeWorldRendererEnabled,
  isNativeWorldRendererReady,
  net,
  sendNativeDynamicRenderScene,
  sendNativeStaticRenderScene,
  sendNativeWorldRenderFrame,
  subscribeContentBuildInfo,
  subscribeNativeWorldRenderer,
} from './game/multiplayerClient';

const FALLBACK_PLAYER: Player = {
  id: 'default',
  name: 'Hero',
  characterClass: 'gunslinger',
  chibi: {
    hairStyle: 'bob',
    hairColor: '#F6D268',
    earType: 'cat',
    earColor: '#2B272C',
    haloType: 'star',
    haloColor: '#E65D8C',
    coatColor: '#FFFFFF',
    skirtColor: '#3A3640',
    eyeType: 'cat_w',
    ribbonColor: '#E65D8C',
  },
  x: 650,
  y: 750,
  vx: 0,
  vy: 0,
  facing: 'right',
  state: 'idle',
  stats: { level: 1, exp: 0, maxExp: 100, hp: 300, maxHp: 300, mp: 100, maxMp: 100, atk: 20, def: 10, speed: 4.5, critRate: 10, statPoints: 0, str: 5, agi: 5, int: 5, vit: 5 },
  stamina: 100,
  maxStamina: 100,
  isSprinting: false,
  jumpZ: 0,
  jumpVz: 0,
  isJumping: false,
  bhopStreak: 0,
  bhopTimer: 0,
  bhopSpeedMult: 1,
  gold: 150,
  inventory: [],
  equipment: { weapon: null, headwear: null, outfit: null, vehicle: null, accessory: null },
  skills: CLASS_DEFAULTS.gunslinger.starterSkills,
  activeVehicleId: null,
  isRiding: false,
  spawnBounce: 1,
  attackTimer: 0,
  dodgeTimer: 0,
  combo: 0,
  lastAttackTime: 0,
  activeQuests: {},
  completedQuestIds: [],
  currentZone: 'cyber_city',
  activeBuffs: [],
  evolutions: {},
  pendingEvolutionPicks: 0,
};

export function App() {
  const [createdPlayer, setCreatedPlayer] = useState<Player | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [contentBuild, setContentBuild] = useState(getContentBuildInfo);
  const [nativeWorldRendererRequested, setNativeWorldRendererRequested] = useState(isNativeWorldRendererEnabled);
  const [nativeWorldRendererReady, setNativeWorldRendererReady] = useState(isNativeWorldRendererReady);
  const [canvasProbeMode, setCanvasProbeMode] = useState<CanvasProbeMode>('normal');
  const canvasProbeModeRef = useRef<CanvasProbeMode>(canvasProbeMode);
  const [dynamicRasterScale, setDynamicRasterScale] = useState(1);
  const dynamicRasterScaleRef = useRef(dynamicRasterScale);
  const [webglHordeMobBodies, setWebglHordeMobBodies] = useState(true);
  const webglHordeMobBodiesRef = useRef(webglHordeMobBodies);
  const [staticWorldLayerEnabled, setStaticWorldLayerEnabled] = useState(true);
  const staticWorldLayerEnabledRef = useRef(staticWorldLayerEnabled);
  // Canvas remains enabled until every actor state and combat effect has a
  // visual-equivalent GPU path. F7 is deliberately diagnostic only: turning
  // it off also removes Canvas fallback actors and is not a valid gameplay
  // rendering mode yet.
  const [dynamicCanvasLayerEnabled, setDynamicCanvasLayerEnabled] = useState(true);
  const dynamicCanvasLayerEnabledRef = useRef(dynamicCanvasLayerEnabled);
  const [forceStaticCanvas, setForceStaticCanvas] = useState(false);
  const forceStaticCanvasRef = useRef(forceStaticCanvas);
  const nativeWorldRenderer = nativeWorldRendererRequested && nativeWorldRendererReady;

  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastNativeSceneAt = useRef(0);
  const sceneWorkerRef = useRef<Worker | null>(null);
  const sceneCompileInFlightRef = useRef(false);
  const pendingSceneInputRef = useRef<{
    input: WorldRenderInput;
    staticOnly: boolean;
    camera: { x: number; y: number; zoom: number };
  } | null>(null);
  const nextSceneJobIdRef = useRef(1);

  useEffect(() => {
    canvasProbeModeRef.current = canvasProbeMode;
  }, [canvasProbeMode]);

  useEffect(() => {
    dynamicRasterScaleRef.current = dynamicRasterScale;
  }, [dynamicRasterScale]);

  useEffect(() => {
    webglHordeMobBodiesRef.current = webglHordeMobBodies;
  }, [webglHordeMobBodies]);

  useEffect(() => {
    staticWorldLayerEnabledRef.current = staticWorldLayerEnabled;
  }, [staticWorldLayerEnabled]);

  useEffect(() => {
    dynamicCanvasLayerEnabledRef.current = dynamicCanvasLayerEnabled;
  }, [dynamicCanvasLayerEnabled]);

  useEffect(() => {
    forceStaticCanvasRef.current = forceStaticCanvas;
  }, [forceStaticCanvas]);

  // Initialize game engine with created player or fallback
  const engine = useGameEngine(createdPlayer || FALLBACK_PLAYER);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  // Listen to incoming chat from WebSocket
  useEffect(() => {
    const unsub = net.subscribe((type: string, data: any) => {
      if (type === 'init_world' && data.recentChat) {
        setChatLog(data.recentChat);
      } else if (type === 'chat_message') {
        setChatLog((prev) => [...prev.slice(-30), data.message]);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const syncRendererState = () => {
      setContentBuild(getContentBuildInfo());
      setNativeWorldRendererRequested(isNativeWorldRendererEnabled());
      setNativeWorldRendererReady(isNativeWorldRendererReady());
    };
    syncRendererState();
    const unsubscribeContent = subscribeContentBuildInfo(syncRendererState);
    const unsubscribeRenderer = subscribeNativeWorldRenderer(syncRendererState);
    return () => {
      unsubscribeContent();
      unsubscribeRenderer();
    };
  }, []);

  useEffect(() => {
    // `body` used to carry an opaque Tailwind background for the Canvas2D
    // game. Once WGPU has acknowledged its first frame, leaving that class
    // in place visually covers the native surface even though it is drawing.
    document.documentElement.classList.toggle('native-world', nativeWorldRenderer);
    document.body.classList.toggle('bg-transparent', nativeWorldRenderer);
    document.body.classList.toggle('bg-slate-950', !nativeWorldRenderer);
  }, [nativeWorldRenderer]);

  useEffect(() => {
    const cycleDynamicRasterScale = (event: KeyboardEvent) => {
      if (event.code !== 'F9' || event.repeat) return;
      event.preventDefault();
      setDynamicRasterScale((current) => current === 1 ? 0.75 : current === 0.75 ? 0.5 : 1);
    };
    window.addEventListener('keydown', cycleDynamicRasterScale);
    return () => window.removeEventListener('keydown', cycleDynamicRasterScale);
  }, []);

  useEffect(() => {
    const toggleWebglHordeMobBodies = (event: KeyboardEvent) => {
      if (event.code !== 'F10' || event.repeat || nativeWorldRenderer) return;
      event.preventDefault();
      setWebglHordeMobBodies((enabled) => !enabled);
    };
    window.addEventListener('keydown', toggleWebglHordeMobBodies);
    return () => window.removeEventListener('keydown', toggleWebglHordeMobBodies);
  }, [nativeWorldRenderer]);

  useEffect(() => {
    const toggleWebViewLayer = (event: KeyboardEvent) => {
      if (event.repeat || nativeWorldRenderer) return;
      if (event.code === 'F5') {
        event.preventDefault();
        setForceStaticCanvas((enabled) => !enabled);
      } else if (event.code === 'F6') {
        event.preventDefault();
        setStaticWorldLayerEnabled((enabled) => !enabled);
      } else if (event.code === 'F7') {
        event.preventDefault();
        setDynamicCanvasLayerEnabled((enabled) => !enabled);
      }
    };
    window.addEventListener('keydown', toggleWebViewLayer);
    return () => window.removeEventListener('keydown', toggleWebViewLayer);
  }, [nativeWorldRenderer]);

  useEffect(() => {
    const nextMode: Record<CanvasProbeMode, CanvasProbeMode> = {
      normal: 'static-only',
      'static-only': 'dynamic-only',
      'dynamic-only': 'webgl-atlas-only',
      'webgl-atlas-only': 'present-only',
      'present-only': 'raf-only',
      'raf-only': 'normal',
    };
    const cycleCanvasProbe = (event: KeyboardEvent) => {
      if (event.code !== 'F8' || event.repeat || nativeWorldRenderer) return;
      event.preventDefault();
      setCanvasProbeMode((currentMode) => {
        const next = nextMode[currentMode];
        perfMonitor.setCanvasProbeMode(next);
        return next;
      });
    };
    window.addEventListener('keydown', cycleCanvasProbe);
    return () => window.removeEventListener('keydown', cycleCanvasProbe);
  }, [nativeWorldRenderer]);

  // Scene compilation is intentionally outside the WebView's animation
  // thread. A complete Canvas display-list is expensive to construct; doing
  // it in requestAnimationFrame made the HUD/input loop fall to ~27 FPS even
  // while the native WGPU surface was presenting at 240 FPS.
  useEffect(() => {
    if (!nativeWorldRendererRequested || typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('./game/renderScene.worker.ts', import.meta.url), { type: 'module' });
    sceneWorkerRef.current = worker;
    const submit = (job: NonNullable<typeof pendingSceneInputRef.current>) => {
      sceneCompileInFlightRef.current = true;
      worker.postMessage({ id: nextSceneJobIdRef.current++, ...job });
    };
    worker.onmessage = (event: MessageEvent<{
      id: number;
      staticScene?: unknown;
      dynamicScene?: unknown;
      error?: string;
    }>) => {
      sceneCompileInFlightRef.current = false;
      if (event.data.staticScene) {
        sendNativeStaticRenderScene(
          event.data.staticScene as Parameters<typeof sendNativeStaticRenderScene>[0]
        );
      }
      if (event.data.dynamicScene) {
        sendNativeDynamicRenderScene(
          event.data.dynamicScene as Parameters<typeof sendNativeDynamicRenderScene>[0]
        );
      }
      const pending = pendingSceneInputRef.current;
      pendingSceneInputRef.current = null;
      // Keep one latest input while compilation runs, but always present the
      // completed scene first. Dropping each finished result when a newer
      // snapshot exists leaves WGPU rapidly repainting an old world.
      if (pending) submit(pending);
    };
    return () => {
      worker.terminate();
      if (sceneWorkerRef.current === worker) sceneWorkerRef.current = null;
      sceneCompileInFlightRef.current = false;
      pendingSceneInputRef.current = null;
    };
  }, [nativeWorldRendererRequested]);

  // Main Canvas Render Loop
  useEffect(() => {
    let animationId: number;
    let lastRenderedAt: number | null = null;
    const canvas = canvasRef.current;
    const staticCanvas = staticCanvasRef.current;
    const webglCanvas = webglCanvasRef.current;
    if (!createdPlayer || !canvas) return;

    // Canvas dynamic presentation remains the visual-completeness path. On
    // WebView2 its ImageBitmap -> drawImage present is a pacing suspect; F7
    // disables it only for diagnostics, never as the default game mode.
    let dynamicCanvasWorker: Worker | null = null;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    let webglHordeMobRenderer: WebglHordeMobRenderer | null = webglCanvas
      ? createWebglHordeMobRenderer(webglCanvas)
      : null;
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
      try {
        dynamicCanvasWorker = new Worker(new URL('./game/dynamicCanvas.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        dynamicCanvasWorker = null;
      }
    }
    const staticCtx = nativeWorldRenderer ? null : staticCanvas?.getContext('2d', { alpha: false }) ?? null;
    if (!nativeWorldRenderer && (!staticCanvas || !staticCtx)) return;
    const staticCacheCanvas = document.createElement('canvas');
    const staticCacheCtx = nativeWorldRenderer ? null : staticCacheCanvas.getContext('2d', { alpha: false });
    if (!nativeWorldRenderer && !staticCacheCtx) return;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;
    const staticCacheMargin = 320;
    type StaticCache = {
      camera: { x: number; y: number; zoom: number };
      revision: string;
      width: number;
      height: number;
      image: CanvasImageSource;
    };
    type StaticCacheBuild = {
      input: WorldRenderInput;
      camera: { x: number; y: number; zoom: number };
      revision: string;
    };
    let staticCache: StaticCache | null = null;
    let uploadedStaticCache: StaticCache | null = null;
    let webglStaticWorldView: WebglStaticWorldView | undefined;
    let staticCacheWorker: Worker | null = null;
    let staticCacheBuildInFlight = false;
    let pendingStaticCacheBuild: StaticCacheBuild | null = null;
    let nextStaticCacheBuildId = 1;
    type DynamicRender = {
      input: WorldRenderInput;
      camera: { x: number; y: number; zoom: number };
      webglHordeMobBodies: boolean;
      nativeSpriteBodies: boolean;
    };
    let dynamicRenderInFlight = false;
    let pendingDynamicRender: DynamicRender | null = null;
    let nextDynamicRenderId = 1;
    let dynamicRenderStartedAt: number | null = null;
    let dynamicFrame: {
      image: ImageBitmap;
      width: number;
      height: number;
      camera: { x: number; y: number; zoom: number };
      webglHordeMobBodies: boolean;
      nativeSpriteBodies: boolean;
    } | null = null;
    let lastProbeMode = canvasProbeModeRef.current;
    let lastLayerConfiguration = '';
    // When every mutable pixel belongs to a native sprite, leaving even a
    // transparent ImageBitmap canvas above WGPU makes WebView2 composite the
    // whole window at rAF cadence. Sleep that overlay until an effect or an
    // unsupported actor actually needs it again.
    let nativeCanvasOverlaySleeping = false;

    const releaseStaticCacheImage = (image: CanvasImageSource) => {
      if ('close' in image && typeof image.close === 'function') {
        image.close();
      }
    };
    const replaceDynamicFrame = (
      nextFrame: ImageBitmap,
      width: number,
      height: number,
      camera: { x: number; y: number; zoom: number },
      webglHordeMobBodies: boolean,
      nativeSpriteBodies: boolean,
    ) => {
      if (dynamicFrame && dynamicFrame.image !== nextFrame) dynamicFrame.image.close();
      dynamicFrame = { image: nextFrame, width, height, camera, webglHordeMobBodies, nativeSpriteBodies };
    };
    const clearDynamicFrame = () => {
      if (dynamicFrame) dynamicFrame.image.close();
      dynamicFrame = null;
    };
    const replaceStaticCache = (nextCache: StaticCache) => {
      if (staticCache && staticCache.image !== nextCache.image) {
        releaseStaticCacheImage(staticCache.image);
      }
      staticCache = nextCache;
    };
    const renderStaticCacheOnMainThread = (build: StaticCacheBuild) => {
      if (!staticCacheCtx) return;
      staticCacheCanvas.width = build.input.canvasWidth;
      staticCacheCanvas.height = build.input.canvasHeight;
      staticCacheCtx.clearRect(0, 0, build.input.canvasWidth, build.input.canvasHeight);
      drawWorldInput(staticCacheCtx, build.input, { layer: 'static', camera: build.camera });
      replaceStaticCache({
        camera: { ...build.camera },
        revision: build.revision,
        width: build.input.canvasWidth,
        height: build.input.canvasHeight,
        image: staticCacheCanvas,
      });
    };
    const startStaticCacheBuild = (build: StaticCacheBuild) => {
      if (!staticCacheWorker) return;
      staticCacheBuildInFlight = true;
      try {
        staticCacheWorker.postMessage({ id: nextStaticCacheBuildId++, ...build });
      } catch {
        staticCacheBuildInFlight = false;
        staticCacheWorker.terminate();
        staticCacheWorker = null;
      }
    };
    const queueStaticCacheBuild = (build: StaticCacheBuild) => {
      if (!staticCacheWorker) return false;
      if (staticCacheBuildInFlight) {
        // Never queue stale camera frames. The newest cache is the only one
        // that can still cover the viewport when the worker becomes free.
        pendingStaticCacheBuild = build;
      } else {
        startStaticCacheBuild(build);
      }
      return true;
    };

    const startDynamicRender = (renderInput: DynamicRender) => {
      if (!dynamicCanvasWorker) return false;
      dynamicRenderInFlight = true;
      dynamicRenderStartedAt = performance.now();
      try {
        dynamicCanvasWorker.postMessage({ type: 'render', id: nextDynamicRenderId++, ...renderInput });
        return true;
      } catch {
        dynamicRenderInFlight = false;
        dynamicRenderStartedAt = null;
        dynamicCanvasWorker.terminate();
        dynamicCanvasWorker = null;
        return false;
      }
    };
    const queueDynamicRender = (renderInput: DynamicRender) => {
      if (!dynamicCanvasWorker) return false;
      if (dynamicRenderInFlight) {
        // Rendering old actors after a dense scene changes is worse than
        // skipping one presentation: retain exactly one newest snapshot.
        pendingDynamicRender = renderInput;
      } else {
        return startDynamicRender(renderInput);
      }
      return true;
    };

    if (dynamicCanvasWorker) {
      dynamicCanvasWorker.onmessage = (event: MessageEvent<{
        id?: number;
        error?: string;
        image?: ImageBitmap;
        width?: number;
        height?: number;
        camera?: { x: number; y: number; zoom: number };
        webglHordeMobBodies?: boolean;
        nativeSpriteBodies?: boolean;
      }>) => {
        if (event.data.error) {
          dynamicRenderInFlight = false;
          dynamicRenderStartedAt = null;
          pendingDynamicRender = null;
          dynamicCanvasWorker?.terminate();
          dynamicCanvasWorker = null;
          return;
        }
        if (event.data.id === undefined) return;
        if (event.data.image && event.data.width && event.data.height && event.data.camera) {
          if (nativeCanvasOverlaySleeping) {
            event.data.image.close();
          } else {
            replaceDynamicFrame(
              event.data.image,
              event.data.width,
              event.data.height,
              event.data.camera,
              event.data.webglHordeMobBodies === true,
              event.data.nativeSpriteBodies === true,
            );
          }
        }
        if (dynamicRenderStartedAt !== null) {
          perfMonitor.recordOffscreenDynamicFrame(performance.now() - dynamicRenderStartedAt);
        }
        dynamicRenderStartedAt = null;
        dynamicRenderInFlight = false;
        const pending = pendingDynamicRender;
        pendingDynamicRender = null;
        if (pending) startDynamicRender(pending);
      };
      dynamicCanvasWorker.onerror = () => {
        dynamicRenderInFlight = false;
        dynamicRenderStartedAt = null;
        pendingDynamicRender = null;
        dynamicCanvasWorker?.terminate();
        dynamicCanvasWorker = null;
      };
    }

    if (!nativeWorldRenderer && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
      try {
        staticCacheWorker = new Worker(
          new URL('./game/staticCanvasCache.worker.ts', import.meta.url),
          { type: 'module' },
        );
        staticCacheWorker.onmessage = (event: MessageEvent<{
          camera: { x: number; y: number; zoom: number };
          revision: string;
          width: number;
          height: number;
          image?: ImageBitmap;
          error?: string;
        }>) => {
          staticCacheBuildInFlight = false;
          if (event.data.image) {
            replaceStaticCache({
              camera: event.data.camera,
              revision: event.data.revision,
              width: event.data.width,
              height: event.data.height,
              image: event.data.image,
            });
          } else if (event.data.error) {
            staticCacheWorker?.terminate();
            staticCacheWorker = null;
          }
          const pending = pendingStaticCacheBuild;
          pendingStaticCacheBuild = null;
          if (pending && staticCacheWorker) startStaticCacheBuild(pending);
        };
        staticCacheWorker.onerror = () => {
          staticCacheBuildInFlight = false;
          staticCacheWorker?.terminate();
          staticCacheWorker = null;
        };
      } catch {
        // The synchronous HTMLCanvasElement cache below is the compatibility
        // path for runtimes that cannot start module workers.
        staticCacheWorker = null;
      }
    }

    // Responsive Canvas Resize Observer
    const handleResize = () => {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      if (canvas) {
        canvas.width = viewportWidth;
        canvas.height = viewportHeight;
      }
      if (webglCanvas) {
        webglCanvas.width = viewportWidth;
        webglCanvas.height = viewportHeight;
      }
      if (staticCanvas) {
        staticCanvas.width = viewportWidth;
        staticCanvas.height = viewportHeight;
      }
      staticCache = null;
      uploadedStaticCache = null;
      webglStaticWorldView = undefined;
      if (staticCanvas) staticCanvas.style.visibility = 'visible';
      webglHordeMobRenderer?.clear();
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const renderWebglHordeMobBodies = (
      input: WorldRenderInput,
      camera: { x: number; y: number; zoom: number },
    ) => {
      if (!webglHordeMobRenderer) {
        return false;
      }
      try {
        if (!webglHordeMobRenderer.isAvailable) {
          webglHordeMobRenderer.destroy();
          webglHordeMobRenderer = null;
          return false;
        }
        const drawActors = webglHordeMobBodiesRef.current;
        if (drawActors || webglStaticWorldView) {
          webglHordeMobRenderer.render(
            input.monsters,
            input.localPlayer,
            camera,
            input.players,
            input.projectiles,
            input.particles,
            webglStaticWorldView,
            drawActors,
          );
          return drawActors;
        }
        webglHordeMobRenderer.clear();
        return false;
      } catch {
        // Context loss or an implementation-specific WebView GL failure must
        // never hide a monster. The next Canvas worker frame owns every body.
        webglHordeMobRenderer.destroy();
        webglHordeMobRenderer = null;
        return false;
      }
    };

    const presentStaticWorld = (
      worldInput: WorldRenderInput,
      camera: { x: number; y: number; zoom: number },
    ) => {
      webglStaticWorldView = undefined;
      if (nativeWorldRenderer || !staticCanvas || !staticCtx || !staticCacheCtx) return false;
      if (!staticWorldLayerEnabledRef.current) {
        staticCanvas.style.visibility = 'hidden';
        return false;
      }
      const resourceRevision = worldInput.resourceNodes
        .map((node) => `${node.id}:${node.hp > 0 ? 1 : 0}`)
        .join(',');
      const staticRevision = [
        worldInput.localPlayer.currentZone,
        worldInput.localPlayer.interiorBuildingId ?? '',
        worldInput.localPlayer.interiorFloor ?? 0,
        Math.floor((worldInput.gameTimePhase ?? 0.35) * 12),
        resourceRevision,
      ].join('|');
      const cacheShiftX = staticCache
        ? Math.abs(camera.x - staticCache.camera.x) * staticCache.camera.zoom
        : Infinity;
      const cacheShiftY = staticCache
        ? Math.abs(camera.y - staticCache.camera.y) * staticCache.camera.zoom
        : Infinity;
      const cacheNeedsRefresh = !staticCache
        || staticCache.revision !== staticRevision
        || cacheShiftX > staticCacheMargin * 0.45
        || cacheShiftY > staticCacheMargin * 0.45
        || Math.abs(camera.zoom - staticCache.camera.zoom) > 0.025;

      if (cacheNeedsRefresh) {
        const cacheWidth = viewportWidth + staticCacheMargin * 2;
        const cacheHeight = viewportHeight + staticCacheMargin * 2;
        const build: StaticCacheBuild = {
          input: { ...worldInput, canvasWidth: cacheWidth, canvasHeight: cacheHeight },
          camera: { ...camera },
          revision: staticRevision,
        };
        if (!staticCache || !queueStaticCacheBuild(build)) renderStaticCacheOnMainThread(build);
      }
      if (!staticCache) return false;

      const sourceWidth = viewportWidth * staticCache.camera.zoom / camera.zoom;
      const sourceHeight = viewportHeight * staticCache.camera.zoom / camera.zoom;
      const rawSourceX = (staticCache.width - sourceWidth) / 2
        + (camera.x - staticCache.camera.x) * staticCache.camera.zoom;
      const rawSourceY = (staticCache.height - sourceHeight) / 2
        + (camera.y - staticCache.camera.y) * staticCache.camera.zoom;
      const sourceX = Math.max(0, Math.min(staticCache.width - sourceWidth, rawSourceX));
      const sourceY = Math.max(0, Math.min(staticCache.height - sourceHeight, rawSourceY));
      const canUseWebgl = !forceStaticCanvasRef.current && webglHordeMobRenderer?.isAvailable;
      if (canUseWebgl && webglHordeMobRenderer) {
        if (uploadedStaticCache !== staticCache) {
          uploadedStaticCache = webglHordeMobRenderer.uploadStaticWorld(staticCache.image) ? staticCache : null;
        }
        if (uploadedStaticCache === staticCache) {
          webglStaticWorldView = {
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            textureWidth: staticCache.width,
            textureHeight: staticCache.height,
          };
          staticCanvas.style.visibility = 'hidden';
          return true;
        }
      }

      staticCanvas.style.visibility = 'visible';
      staticCtx.clearRect(0, 0, viewportWidth, viewportHeight);
      staticCtx.drawImage(
        staticCache.image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        viewportWidth,
        viewportHeight,
      );
      return false;
    };

    const render = (time: number) => {
      const callbackStartedAt = performance.now();
      const frameIntervalMs = lastRenderedAt === null ? 1000 / 60 : time - lastRenderedAt;
      lastRenderedAt = time;
      const timeInSeconds = (time % 10000000) / 1000;
      const curEngine = engineRef.current;
      // Native retains the map as a GPU texture. Dynamic actors stay on Canvas.
      const buildWorldRenderInput = (): WorldRenderInput => ({
        canvasWidth: viewportWidth,
        canvasHeight: viewportHeight,
        localPlayer: curEngine.player,
        players: curEngine.remotePlayers,
        monsters: curEngine.monsters,
        resourceNodes: curEngine.resourceNodes,
        dropItems: curEngine.dropItems,
        projectiles: curEngine.projectiles,
        particles: curEngine.particles,
        damagePopups: curEngine.damagePopups,
        screenShake: curEngine.screenShake,
        groundDecals: curEngine.groundDecals,
        time: timeInSeconds,
        introCinematic: curEngine.introCinematic,
        worldPois: curEngine.worldPois,
        cars: curEngine.cars,
        summons: curEngine.summons,
        gameTimePhase: curEngine.gameTimePhase,
      });
      const buildStaticWorldRenderInput = (): WorldRenderInput => ({
        canvasWidth: viewportWidth,
        canvasHeight: viewportHeight,
        localPlayer: curEngine.player,
        players: {},
        monsters: [],
        resourceNodes: curEngine.resourceNodes,
        dropItems: [],
        projectiles: [],
        particles: [],
        damagePopups: [],
        groundDecals: [],
        time: timeInSeconds,
        worldPois: curEngine.worldPois,
        cars: [],
        summons: [],
        gameTimePhase: curEngine.gameTimePhase,
      });
      const camera = advanceCanvasCamera(
        curEngine.player,
        timeInSeconds,
        curEngine.screenShake,
        curEngine.introCinematic,
      );
      if (nativeWorldRendererRequested) {
        // Native owns retained map geometry. Never send a combat display-list
        // across the WebView bridge — that clone is the long-task stutter.
        const nativeSceneIntervalMs = 1000 / 15;
        perfMonitor.recordNativeSceneTargetHz(15);
        if (time - lastNativeSceneAt.current >= nativeSceneIntervalMs) {
          lastNativeSceneAt.current = time;
          const sceneJob = { input: buildStaticWorldRenderInput(), staticOnly: true, camera };
          if (sceneCompileInFlightRef.current) {
            pendingSceneInputRef.current = sceneJob;
          } else {
            const worker = sceneWorkerRef.current;
            if (worker) {
              sceneCompileInFlightRef.current = true;
              worker.postMessage({ id: nextSceneJobIdRef.current++, ...sceneJob });
            }
          }
        }
        if (nativeWorldRenderer) {
          const nativeMonsterSprites = curEngine.monsters.flatMap((monster) => {
            const spriteKey = getNativeMonsterSpriteFrame(monster);
            if (!spriteKey) return [];
            return [{
              id: monster.id,
              kind: 'monster',
              faction: monster.faction ?? '',
              x: monster.x,
              y: monster.y,
              size: monster.hordeKind ? (monster.isBoss ? 44 : 30) : (monster.isBoss ? 58 : 42),
              color: [1, 1, 1, 1] as [number, number, number, number],
              velocityX: 0,
              velocityY: 0,
              hasVelocity: false,
              hpRatio: monster.maxHp > 0 ? monster.hp / monster.maxHp : 0,
              facingLeft: monster.facing === 'left',
              layer: Math.round(monster.y),
              weaponType: monster.weaponType,
              hasShield: monster.hasShield,
              spriteKey,
            }];
          });
          const nativePlayerSprites = (Object.values(curEngine.remotePlayers) as Player[])
            .concat(curEngine.remotePlayers[curEngine.player.id] ? [] : [curEngine.player])
            .flatMap((player) => {
              const spriteKey = getNativePlayerSpriteFrame(player);
              if (!spriteKey) return [];
              return [{
                id: player.id,
                kind: 'player',
                faction: '',
                x: player.x,
                y: player.y,
                size: 48,
                color: [1, 1, 1, 1] as [number, number, number, number],
                velocityX: player.vx ?? 0,
                velocityY: player.vy ?? 0,
                hasVelocity: true,
                hpRatio: player.stats.maxHp > 0 ? player.stats.hp / player.stats.maxHp : 0,
                facingLeft: player.facing === 'left',
                layer: Math.round(player.y),
                weaponType: player.equipment.weapon?.gunType,
                chibi: player.chibi,
                animation: {
                  state: player.state,
                  isSprinting: player.isSprinting,
                  jumpZ: player.jumpZ,
                  spawnBounce: player.spawnBounce,
                  attackTimer: player.attackTimer,
                  dodgeTimer: player.dodgeTimer,
                },
                spriteKey,
              }];
            });
          sendNativeWorldRenderFrame({
            cameraX: camera.x,
            cameraY: camera.y,
            zoom: camera.zoom,
            viewportWidth,
            viewportHeight,
            timeSeconds: timeInSeconds,
            theme: curEngine.player.currentZone,
            entities: [...nativeMonsterSprites, ...nativePlayerSprites],
          });
        }
      }

      const drawStart = performance.now();
      const activeCanvasProbeMode = canvasProbeModeRef.current;
      const probeModeChanged = activeCanvasProbeMode !== lastProbeMode;
      const layerConfiguration = [
        staticWorldLayerEnabledRef.current ? 1 : 0,
        dynamicCanvasLayerEnabledRef.current ? 1 : 0,
        forceStaticCanvasRef.current ? 1 : 0,
      ].join('');
      const layerConfigurationChanged = layerConfiguration !== lastLayerConfiguration;
      if (layerConfigurationChanged) {
        if (!dynamicCanvasLayerEnabledRef.current) {
          dynamicCanvasWorker?.postMessage({ type: 'clear' });
          clearDynamicFrame();
          ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        }
        if (!staticWorldLayerEnabledRef.current && staticCanvas) staticCanvas.style.visibility = 'hidden';
        lastLayerConfiguration = layerConfiguration;
      }
      if (probeModeChanged) {
        if (activeCanvasProbeMode !== 'normal' && activeCanvasProbeMode !== 'dynamic-only') {
          dynamicCanvasWorker?.postMessage({ type: 'clear' });
        }
        if (activeCanvasProbeMode !== 'normal' && staticCanvas) staticCanvas.style.visibility = 'visible';
        lastProbeMode = activeCanvasProbeMode;
      }
      if (activeCanvasProbeMode !== 'normal' && activeCanvasProbeMode !== 'dynamic-only') {
        webglHordeMobRenderer?.clear();
      }
      const presentDynamicOverlay = (worldInput: WorldRenderInput) => {
        // Native owns its generated atlas bodies. Do not leave a WebGL canvas
        // sandwiched between WGPU and the UI: it would duplicate work and
        // produce two independently paced actor layers.
        const nativeSpriteBodies = nativeWorldRenderer;
        const webglBodiesActive = nativeSpriteBodies
          ? false
          : renderWebglHordeMobBodies(worldInput, camera);
        if (!dynamicCanvasLayerEnabledRef.current) return webglBodiesActive;
        const allNativeActors = nativeSpriteBodies
          // A dying enemy still has a Canvas ragdoll / death effect, so do
          // not sleep the overlay merely because its state is already dead.
          && worldInput.monsters.every((monster) => getNativeMonsterSpriteFrame(monster) !== null)
          && [...Object.values(worldInput.players), worldInput.localPlayer]
            .filter((player): player is Player => Boolean(player))
            .every((player) => getNativePlayerSpriteFrame(player) !== null);
        const noCanvasEffects = worldInput.dropItems.length === 0
          && worldInput.projectiles.length === 0
          && worldInput.particles.length === 0
          && worldInput.damagePopups.length === 0
          && worldInput.groundDecals.length === 0
          && worldInput.cars.length === 0
          && worldInput.summons.length === 0
          && (!worldInput.introCinematic || worldInput.introCinematic.phase === 'none' || worldInput.introCinematic.phase === 'complete');
        if (allNativeActors && noCanvasEffects) {
          if (!nativeCanvasOverlaySleeping) {
            nativeCanvasOverlaySleeping = true;
            pendingDynamicRender = null;
            clearDynamicFrame();
            ctx.clearRect(0, 0, viewportWidth, viewportHeight);
          }
          return webglBodiesActive;
        }
        nativeCanvasOverlaySleeping = false;
        const rasterScale = nativeWorldRenderer ? 1 : dynamicRasterScaleRef.current;
        const workerInput = rasterScale === 1
          ? worldInput
          : {
            ...worldInput,
            canvasWidth: Math.max(1, Math.round(viewportWidth * rasterScale)),
            canvasHeight: Math.max(1, Math.round(viewportHeight * rasterScale)),
          };
        const workerCamera = rasterScale === 1 ? camera : { ...camera, zoom: camera.zoom * rasterScale };
        const workerQueued = queueDynamicRender({
          input: workerInput,
          camera: workerCamera,
          webglHordeMobBodies: webglBodiesActive,
          nativeSpriteBodies,
        });
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        if (
          dynamicFrame
          && dynamicFrame.webglHordeMobBodies === webglBodiesActive
          && dynamicFrame.nativeSpriteBodies === nativeSpriteBodies
        ) {
          // A worker frame was painted against its own camera. Reproject it
          // while the next frame is in flight, otherwise actors visibly lag
          // behind the camera at the worker cadence.
          const sourceZoom = Math.max(0.01, dynamicFrame.camera.zoom);
          const scale = camera.zoom / sourceZoom;
          ctx.save();
          ctx.translate(
            viewportWidth / 2 + (dynamicFrame.camera.x - camera.x) * camera.zoom,
            viewportHeight / 2 + (dynamicFrame.camera.y - camera.y) * camera.zoom,
          );
          ctx.scale(scale, scale);
          ctx.drawImage(
            dynamicFrame.image,
            -dynamicFrame.width / 2,
            -dynamicFrame.height / 2,
          );
          ctx.restore();
        } else if (!nativeWorldRenderer || !workerQueued) {
          // Native already shows the map. Skip a main-thread chibi paint while
          // the overlay worker warms up — that paint is the freeze we removed.
          drawWorldInput(ctx, worldInput, {
            layer: 'dynamic',
            camera,
            skipWebglHordeMobBodies: webglBodiesActive,
            skipWebglPlayerBodies: webglBodiesActive,
            skipWebglProjectiles: webglBodiesActive,
            skipWebglParticles: webglBodiesActive,
            skipNativeSpriteBodies: nativeSpriteBodies,
          });
        }
      };
      if (nativeWorldRenderer || activeCanvasProbeMode === 'normal') {
        const worldInput = buildWorldRenderInput();
        if (!nativeWorldRenderer) presentStaticWorld(worldInput, camera);
        presentDynamicOverlay(worldInput);
      } else if (!nativeWorldRenderer && staticCtx && activeCanvasProbeMode === 'static-only') {
        // Terrain, buildings and world dressing. This is the candidate for a
        // retained/tiled Canvas cache if it is the pacing bottleneck.
        staticCtx.clearRect(0, 0, viewportWidth, viewportHeight);
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        drawWorldInput(staticCtx, buildWorldRenderInput(), { layer: 'static', camera });
      } else if (!nativeWorldRenderer && staticCtx && activeCanvasProbeMode === 'dynamic-only') {
        // Actors and screen-space effects, deliberately without static world
        // geometry. Clear first so dynamic pixels do not accumulate between
        // diagnostic frames.
        staticCtx.clearRect(0, 0, viewportWidth, viewportHeight);
        presentDynamicOverlay(buildWorldRenderInput());
      } else if (!nativeWorldRenderer && activeCanvasProbeMode === 'webgl-atlas-only') {
        if (probeModeChanged) ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        const webglBodiesActive = renderWebglHordeMobBodies(buildWorldRenderInput(), camera);
        if (webglBodiesActive && webglHordeMobRenderer?.lastDrawnMobCount === 0) {
          webglHordeMobRenderer.renderCalibrationGrid();
        }
      } else if (!nativeWorldRenderer && staticCtx && activeCanvasProbeMode === 'present-only') {
        // Exercise the Canvas2D presentation path without constructing the
        // game's display list. The slate page background stays visible.
        staticCtx.clearRect(0, 0, viewportWidth, viewportHeight);
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
      }
      // raf-only intentionally performs no Canvas calls. It isolates WebView
      // scheduling from Canvas command submission and compositing.
      perfMonitor.setExtras({
        monsters: curEngine.monsters.filter((m) => m.state !== 'dead').length,
        particles: curEngine.particles.length,
        projectiles: curEngine.projectiles.length,
        zoom: camera.zoom,
        canvasW: viewportWidth,
        canvasH: viewportHeight,
        dynamicRasterScale: dynamicRasterScaleRef.current,
        webglHordeMobBodies: webglHordeMobBodiesRef.current && webglHordeMobRenderer !== null,
        webglMonsterBodies: webglHordeMobRenderer?.lastDrawnMonsterCount ?? 0,
        staticWorldLayerEnabled: staticWorldLayerEnabledRef.current,
        dynamicCanvasLayerEnabled: dynamicCanvasLayerEnabledRef.current,
        forceStaticCanvas: forceStaticCanvasRef.current,
        webglStaticWorldActive: webglStaticWorldView !== undefined,
      });
      const callbackFinishedAt = performance.now();
      perfMonitor.recordCanvasWebViewFrame(
        frameIntervalMs,
        callbackStartedAt,
        drawStart,
        callbackFinishedAt,
      );
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      dynamicCanvasWorker?.terminate();
      staticCacheWorker?.terminate();
      dynamicFrame?.image.close();
      webglHordeMobRenderer?.destroy();
      if (staticCache) releaseStaticCacheImage(staticCache.image);
    };
  }, [createdPlayer, nativeWorldRenderer, nativeWorldRendererRequested]);

  // Listen for Hold [C] to open Gunsmith Weapon Customization & RMB release
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'KeyC' &&
        !e.repeat &&
        engine.activeModal === 'none' &&
        engine.player.characterClass === 'gunslinger'
      ) {
        engine.setIsModdingWeapon(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyC') {
        engine.setIsModdingWeapon(false);
      }
    };
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        engine.setIsAiming(false);
      }
      if (e.button === 0) {
        engine.setFireHeld(false);
      }
    };
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    const handleWindowBlur = () => {
      engine.setIsAiming(false);
      engine.setFireHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('contextmenu', handleGlobalContextMenu);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('contextmenu', handleGlobalContextMenu);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [engine.activeModal, engine.setIsModdingWeapon, engine.setIsAiming]);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sound.setMuted(next);
  };

  const handleBuyItem = (item: Item) => {
    engine.handleBuyItem(item);
  };

  const handleSellItem = (item: Item) => {
    engine.handleSellItem(item);
  };

  const handleInteract = () => {
    engine.handleInteract();
  };

  const handleWorldPointerDown = (e: React.MouseEvent<HTMLElement>) => {
    if (engine.introCinematic.phase !== 'none' && engine.introCinematic.phase !== 'complete') {
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
      engine.setIsAiming(true);
      return;
    }
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const targetWorldPos = screenToWorld(
      e.clientX - rect.left,
      e.clientY - rect.top,
      window.innerWidth,
      window.innerHeight,
    );
    engine.setFireHeld(true);
    engine.handleAttack(targetWorldPos.x, targetWorldPos.y);
  };

  const handleWorldPointerUp = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button === 2) {
      e.preventDefault();
      engine.setIsAiming(false);
    }
    if (e.button === 0) engine.setFireHeld(false);
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden select-none ${nativeWorldRenderer ? 'bg-transparent' : 'bg-slate-950'}`}>
      {/* 1. Character Creation Screen if not yet spawned */}
      {!createdPlayer ? (
        <CharacterCreator
          onStartGame={(p) => {
            setCreatedPlayer(p);
          }}
        />
      ) : (
        <>
          {/* Native owns the retained map. Dynamic canvas stays a transparent
              overlay so chibis never cross the command-list bridge. WebGL atlas
              quads sit between the two for eligible horde bodies. */}
          <canvas
            ref={staticCanvasRef}
            aria-hidden="true"
            className={`absolute inset-0 block w-full h-full pointer-events-none ${nativeWorldRenderer ? 'hidden' : ''}`}
          />
          <canvas
            ref={webglCanvasRef}
            aria-hidden="true"
            className="absolute inset-0 block w-full h-full pointer-events-none"
          />
          <canvas
            ref={canvasRef}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={handleWorldPointerDown}
            onMouseUp={handleWorldPointerUp}
            className="absolute inset-0 block w-full h-full cursor-crosshair bg-transparent"
          />

          {/* 3. Floating In-Game Toast Notifications */}
          <AnimatePresence>
            {engine.toastNotification && (
              <motion.div
                key={engine.toastNotification.id}
                initial={{ opacity: 0, y: -30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/70 border border-white/20 px-4 py-2 rounded-2xl shadow-xl backdrop-blur-md pointer-events-none"
              >
                <span className="text-xl drop-shadow-xs">{engine.toastNotification.icon}</span>
                <div>
                  <h4 className="font-mono font-bold text-white text-xs tracking-wide">
                    {engine.toastNotification.title}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-300">{engine.toastNotification.message}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {engine.worldFade > 0.01 && (
            <div
              className="fixed inset-0 z-[90] bg-black pointer-events-none"
              style={{ opacity: engine.worldFade }}
            />
          )}
          {(engine.hordeRun?.riftWarp ?? 0) > 0.02 && (
            <div
              className="fixed inset-0 z-[88] pointer-events-none"
              style={{
                opacity: engine.hordeRun!.riftWarp * 0.85,
                background: `radial-gradient(circle at 50% 45%, ${engine.hordeRun?.bossRift?.tint ?? '#22D3EE'}55, #000000ee 70%)`,
              }}
            />
          )}

          {/* Hide HUD and UI overlays during Cinematic Sequence */}
          {engine.introCinematic.phase === 'none' || engine.introCinematic.phase === 'complete' ? (
            <>
              {/* 4. Top World Boss HP Bar */}
              <BossBar boss={engine.currentBoss} />

              {/* 5. Main Game HUD */}
              <HUD
                player={engine.player}
                gameTimePhase={engine.gameTimePhase}
                nearbyNpcName={engine.nearbyInteractable?.name}
                onOpenModal={engine.setActiveModal}
                onUseSkill={engine.handleUseSkill}
                onSwitchWeapon={engine.handleSwitchWeapon}
                onReload={engine.handleReload}
                onToggleVehicle={engine.handleToggleVehicle}
                onJump={engine.handleJump}
                onAttack={engine.handleAttack}
                isMuted={isMuted}
                onToggleMute={handleToggleMute}
                onlineCount={Object.keys(engine.remotePlayers).length + 1}
                onOpenGunsmith={() => engine.setIsModdingWeapon((prev) => !prev)}
                hordeRun={engine.hordeRun}
                onExtractHorde={engine.handleExtractHorde}
              />

              <DebugOverlay nativeWorldActive={nativeWorldRenderer} />

              {/* 6. In-Game Chat & Emote Wheel */}
              <ChatAndEmotes
                chatMessages={chatLog}
                onSendMessage={engine.handleSendChat}
                onSendEmote={engine.handleSendEmote}
              />

              {/* 7. Mobile Touch Controls */}
              <MobileControls
                onJoystickMove={(vec) => {
                  engine.joystickVectorRef.current = vec;
                }}
                onAttack={() => {
                  engine.setFireHeld(true);
                  engine.handleAttack();
                }}
                onAttackHoldEnd={() => engine.setFireHeld(false)}
                onJump={engine.handleJump}
                onToggleSprint={() => {
                  engine.joystickSprintRef.current = true;
                  setTimeout(() => {
                    engine.joystickSprintRef.current = false;
                  }, 150);
                }}
                isSprinting={engine.player.isSprinting}
                onToggleAim={() => engine.setIsAiming(!engine.isAiming)}
                isAiming={engine.isAiming}
                onToggleInspect={
                  engine.player.characterClass === 'gunslinger'
                    ? () => engine.setIsModdingWeapon(!engine.isModdingWeapon)
                    : undefined
                }
                isInspecting={engine.isModdingWeapon}
                onUseSkill={engine.handleUseSkill}
                onToggleVehicle={engine.handleToggleVehicle}
                onInteract={handleInteract}
                hasInteractable={!!engine.nearbyInteractable}
              />

              {contentBuild.version && contentBuild.source && (
                <div
                  title={contentBuild.source === 'patch'
                    ? 'Патч скачан и проверен по manifest и SHA-256.'
                    : 'Запущена встроенная версия: обновление пока не было загружено.'}
                  className="fixed bottom-3 right-4 z-40 hidden sm:flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 font-mono text-[10px] text-slate-200 shadow-lg backdrop-blur-md pointer-events-none select-none"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${contentBuild.source === 'patch' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : 'bg-amber-300'}`} />
                  <span className={contentBuild.source === 'patch' ? 'text-emerald-200' : 'text-amber-200'}>
                    {contentBuild.source === 'patch' ? 'PATCH VERIFIED' : 'EMBEDDED'}
                  </span>
                  <span className="text-white/45">·</span>
                  <span>{contentBuild.version}</span>
                </div>
              )}
            </>
          ) : null}

          {/* 8. Interactive Modals */}
          {engine.activeModal === 'inventory' && (
            <InventoryModal
              player={engine.player}
              onClose={() => engine.setActiveModal('none')}
              onEquipItem={engine.handleEquipItem}
              onUseItem={engine.handleUseItem}
            />
          )}

          {engine.activeModal === 'craft' && (
            <CraftingModal
              player={engine.player}
              onClose={() => engine.setActiveModal('none')}
              onCraftItem={engine.handleCraftItem}
            />
          )}

          {engine.activeModal === 'shop' && engine.activeNpc && (
            <ShopModal
              player={engine.player}
              npc={engine.activeNpc}
              onClose={() => engine.setActiveModal('none')}
              onBuyItem={handleBuyItem}
              onSellItem={handleSellItem}
            />
          )}

          {engine.activeModal === 'dialogue' && engine.activeNpc && (
            <DialogueModal
              npc={engine.activeNpc}
              player={engine.player}
              onClose={() => engine.setActiveModal('none')}
              onOpenShop={() => engine.setActiveModal('shop')}
              onOpenCraft={() => engine.setActiveModal('craft')}
              onAcceptQuest={(qid) => {
                engine.handleAcceptQuest(qid);
              }}
              onCompleteQuest={engine.completeQuest}
              onEnterHorde={engine.handleEnterHorde}
            />
          )}

          {engine.activeModal === 'skills' && (
            <SkillTreeModal
              player={engine.player}
              onClose={() => engine.setActiveModal('none')}
              onAllocateStat={engine.handleAllocateStat}
            />
          )}

          {engine.levelUpOffer &&
            (engine.player.pendingEvolutionPicks ?? 0) > 0 &&
            (engine.introCinematic.phase === 'none' || engine.introCinematic.phase === 'complete') && (
            <LevelUpModal
              player={engine.player}
              offers={engine.levelUpOffer}
              pending={engine.player.pendingEvolutionPicks ?? 0}
              onPick={engine.handlePickEvolution}
            />
          )}

          {engine.activeModal === 'map' && (
            <WorldMapModal
              player={engine.player}
              onClose={() => engine.setActiveModal('none')}
              onTeleport={(x, y, zoneName) => {
                engine.handleTeleport(x, y, zoneName);
                engine.setActiveModal('none');
              }}
            />
          )}

          {engine.activeModal === 'settings' && (
            <SettingsModal
              player={engine.player}
              onClose={() => engine.setActiveModal('none')}
              onLogout={() => {
                setCreatedPlayer(null);
                engine.setActiveModal('none');
              }}
              onRespawn={() => {
                engine.handleRespawn();
                engine.setActiveModal('none');
              }}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
            />
          )}

          {/* 9. Real-Time Gunsmith Weapon Modding (Hold [C]) */}
          <GunsmithModal
            player={engine.player}
            isOpen={engine.isModdingWeapon && engine.player.characterClass === 'gunslinger'}
            onEquipAttachment={engine.handleEquipAttachment}
          />
        </>
      )}
    </div>
  );
}

export default App;
