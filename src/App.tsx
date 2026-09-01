import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, Item, ChatMessage } from './types/game';
import { useGameEngine } from './game/useGameEngine';
import { drawWorldInput, screenToWorld, getCameraState, updateNativeCamera, type WorldRenderInput } from './game/worldRenderer';
import { perfMonitor, type CanvasProbeMode } from './game/performanceMonitor';
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
  const nativeWorldRenderer = nativeWorldRendererRequested && nativeWorldRendererReady;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastNativeSceneAt = useRef(0);
  const sceneWorkerRef = useRef<Worker | null>(null);
  const sceneCompileInFlightRef = useRef(false);
  const pendingSceneInputRef = useRef<{
    input: WorldRenderInput;
    camera: { x: number; y: number; zoom: number };
  } | null>(null);
  const nextSceneJobIdRef = useRef(1);

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
    const nextMode: Record<CanvasProbeMode, CanvasProbeMode> = {
      normal: 'static-only',
      'static-only': 'dynamic-only',
      'dynamic-only': 'present-only',
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
    if (!createdPlayer || (!nativeWorldRenderer && !canvas)) return;

    const ctx = nativeWorldRenderer ? null : canvas?.getContext('2d');
    if (!nativeWorldRenderer && !ctx) return;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    // Responsive Canvas Resize Observer
    const handleResize = () => {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      if (canvas) {
        canvas.width = viewportWidth;
        canvas.height = viewportHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const render = (time: number) => {
      const callbackStartedAt = performance.now();
      const frameIntervalMs = lastRenderedAt === null ? 1000 / 60 : time - lastRenderedAt;
      lastRenderedAt = time;
      const timeInSeconds = (time % 10000000) / 1000;
      const curEngine = engineRef.current;
      // Canvas keeps the complete presentation input. Native mode splits it
      // into a cached static map pass and a realtime dynamic display list.
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
      if (nativeWorldRendererRequested) {
        const camera = updateNativeCamera(curEngine.player, time);
        const denseNativeScene = curEngine.monsters.length >= 20
          || curEngine.particles.length >= 48
          || curEngine.projectiles.length >= 16;
        const nativeSceneTargetHz = denseNativeScene ? 60 : 120;
        const nativeSceneIntervalMs = 1000 / nativeSceneTargetHz;
        perfMonitor.recordNativeSceneTargetHz(nativeSceneTargetHz);
        if (time - lastNativeSceneAt.current >= nativeSceneIntervalMs) {
          lastNativeSceneAt.current = time;
          const sceneJob = { input: buildWorldRenderInput(), camera };
          if (sceneCompileInFlightRef.current) {
            // Keep at most one newest snapshot; a queue would recreate the
            // same long-task backlog after a dense horde arrives.
            pendingSceneInputRef.current = sceneJob;
          } else {
            const worker = sceneWorkerRef.current;
            if (worker) {
              sceneCompileInFlightRef.current = true;
              worker.postMessage({ id: nextSceneJobIdRef.current++, ...sceneJob });
            }
          }
        }
        perfMonitor.setExtras({
          monsters: curEngine.monsters.filter((monster) => monster.state !== 'dead').length,
          particles: curEngine.particles.length,
          projectiles: curEngine.projectiles.length,
          zoom: camera.zoom,
          canvasW: viewportWidth,
          canvasH: viewportHeight,
        });
        if (nativeWorldRenderer) {
          perfMonitor.recordDraw(0);
          perfMonitor.recordFrame(frameIntervalMs);
          animationId = requestAnimationFrame(render);
          return;
        }
      }

      perfMonitor.setExtras({
        monsters: curEngine.monsters.filter((m) => m.state !== 'dead').length,
        particles: curEngine.particles.length,
        projectiles: curEngine.projectiles.length,
        zoom: getCameraState().zoom,
        canvasW: viewportWidth,
        canvasH: viewportHeight,
      });

      const drawStart = performance.now();
      if (canvasProbeMode === 'normal') {
        drawWorldInput(ctx, buildWorldRenderInput());
      } else if (canvasProbeMode === 'static-only') {
        // Terrain, buildings and world dressing. This is the candidate for a
        // retained/tiled Canvas cache if it is the pacing bottleneck.
        drawWorldInput(ctx, buildWorldRenderInput(), { layer: 'static' });
      } else if (canvasProbeMode === 'dynamic-only') {
        // Actors and screen-space effects, deliberately without static world
        // geometry. Clear first so dynamic pixels do not accumulate between
        // diagnostic frames.
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        drawWorldInput(ctx, buildWorldRenderInput(), { layer: 'dynamic' });
      } else if (canvasProbeMode === 'present-only') {
        // Exercise the Canvas2D presentation path without constructing the
        // game's display list. The slate page background stays visible.
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
      }
      // raf-only intentionally performs no Canvas calls. It isolates WebView
      // scheduling from Canvas command submission and compositing.
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
    };
  }, [createdPlayer, canvasProbeMode, nativeWorldRenderer, nativeWorldRendererRequested]);

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
          {/* Native mode deliberately has no Canvas element: the transparent
              WebView only owns input/HUD, while Rust owns every world pixel. */}
          {nativeWorldRenderer ? (
            <div
              aria-label="Game world input"
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={handleWorldPointerDown}
              onMouseUp={handleWorldPointerUp}
              className="absolute inset-0 cursor-crosshair"
            />
          ) : (
            <canvas
              ref={canvasRef}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={handleWorldPointerDown}
              onMouseUp={handleWorldPointerUp}
              className="absolute inset-0 block w-full h-full cursor-crosshair"
            />
          )}

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
