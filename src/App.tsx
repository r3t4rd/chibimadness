import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, Item, ChatMessage } from './types/game';
import { useGameEngine } from './game/useGameEngine';
import { drawWorldInput, screenToWorld, getCameraState, updateNativeCamera } from './game/worldRenderer';
import { perfMonitor } from './game/performanceMonitor';
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

function hexColor(color: string | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
  const match = color?.match(/^#([0-9a-f]{6})$/i);
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255, 1];
}

/**
 * Native rendering deliberately consumes the same visual recipe as the Canvas
 * renderer. Do not reduce a player to a faction colour here: cosmetics are
 * part of the game state and native parity depends on carrying them across the
 * bridge intact.
 */
function nativeChibiRecipe(player: Player) {
  const chibi = player.chibi;
  return {
    hairStyle: chibi.hairStyle,
    frontHairStyle: chibi.frontHairStyle,
    backHairStyle: chibi.backHairStyle,
    hairColor: chibi.hairColor,
    skinTone: chibi.skinTone,
    eyeColor: chibi.eyeColor,
    eyeType: chibi.eyeType,
    earType: chibi.earType,
    earColor: chibi.earColor,
    innerEarColor: chibi.innerEarColor,
    haloType: chibi.haloType,
    haloColor: chibi.haloColor,
    outfitType: chibi.outfitType,
    coatColor: chibi.coatColor,
    skirtColor: chibi.skirtColor,
    accentColor: chibi.accentColor,
    ribbonColor: chibi.ribbonColor,
    hatType: chibi.hatType,
    hatColor: chibi.hatColor,
    wingType: chibi.wingType,
    wingColor: chibi.wingColor,
  };
}

function nativeAnimationRecipe(player: Player) {
  return {
    state: player.state,
    isSprinting: player.isSprinting,
    jumpZ: player.jumpZ,
    spawnBounce: player.spawnBounce,
    attackTimer: player.attackTimer,
    dodgeTimer: player.dodgeTimer,
  };
}

function nativeMonsterColor(faction: string | undefined): [number, number, number, number] {
  if (faction === 'police') return [0.12, 0.75, 1, 1];
  if (faction === 'punk_demon') return [1, 0.2, 0.32, 1];
  if (faction === 'bandit') return [1, 0.6, 0.12, 1];
  return [0.75, 0.2, 0.9, 1];
}

function nativeResourceColor(type: string): [number, number, number, number] {
  if (type === 'iron_ore') return [0.48, 0.58, 0.7, 1];
  if (type === 'lumite_crystal') return [0.55, 0.25, 1, 1];
  if (type === 'star_flower') return [1, 0.76, 0.18, 1];
  return [0.12, 0.52, 0.28, 1];
}

function nativePoiColor(type: string): [number, number, number, number] {
  if (type === 'fire_hydrant') return [1, 0.18, 0.22, 1];
  if (type === 'vending_machine') return [0.08, 0.66, 1, 1];
  if (type === 'steam_geyser') return [0.72, 0.86, 0.96, 1];
  return [1, 0.68, 0.12, 1];
}

export function App() {
  const [createdPlayer, setCreatedPlayer] = useState<Player | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [contentBuild, setContentBuild] = useState(getContentBuildInfo);
  const [nativeWorldRendererRequested, setNativeWorldRendererRequested] = useState(isNativeWorldRendererEnabled);
  const [nativeWorldRendererReady, setNativeWorldRendererReady] = useState(isNativeWorldRendererReady);
  const nativeWorldRenderer = nativeWorldRendererRequested && nativeWorldRendererReady;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastNativeFrameAt = useRef(0);

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
      const frameIntervalMs = lastRenderedAt === null ? 1000 / 60 : time - lastRenderedAt;
      lastRenderedAt = time;
      const timeInSeconds = (time % 10000000) / 1000;
      const curEngine = engineRef.current;
      // A single complete input is shared by the Canvas source backend and
      // the recorded RenderScene path.  Do not rebuild a reduced visual
      // entity protocol here: that was the reason native mode diverged.
      const worldRenderInput = {
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
      };
      if (nativeWorldRendererRequested) {
        const camera = updateNativeCamera(curEngine.player, time);
        const nativeViewPadding = 180;
        const nativeHalfWidth = viewportWidth / camera.zoom / 2 + nativeViewPadding;
        const nativeHalfHeight = viewportHeight / camera.zoom / 2 + nativeViewPadding;
        const inNativeView = (x: number, y: number, size = 0) => (
          Math.abs(x - camera.x) <= nativeHalfWidth + size
          && Math.abs(y - camera.y) <= nativeHalfHeight + size
        );
        const entities = [
          {
            id: curEngine.player.id,
            kind: 'player',
            faction: '',
            x: curEngine.player.x,
            y: curEngine.player.y,
            size: 38,
            color: [0.1, 0.9, 1, 1] as [number, number, number, number],
            velocityX: curEngine.player.vx,
            velocityY: curEngine.player.vy,
            hasVelocity: true,
            hpRatio: curEngine.player.stats.maxHp > 0 ? curEngine.player.stats.hp / curEngine.player.stats.maxHp : 1,
            facingLeft: curEngine.player.facing === 'left',
            layer: 20,
            chibi: nativeChibiRecipe(curEngine.player),
            animation: nativeAnimationRecipe(curEngine.player),
          },
          ...(Object.values(curEngine.remotePlayers) as Player[])
            .filter((player) => inNativeView(player.x, player.y, 48))
            .map((player) => ({
            id: player.id,
            kind: 'player',
            faction: '',
            x: player.x,
            y: player.y,
            size: 34,
            color: [0.35, 0.65, 1, 1] as [number, number, number, number],
            velocityX: player.vx,
            velocityY: player.vy,
            hasVelocity: true,
            hpRatio: player.stats.maxHp > 0 ? player.stats.hp / player.stats.maxHp : 1,
            facingLeft: player.facing === 'left',
            layer: 18,
            chibi: nativeChibiRecipe(player),
            animation: nativeAnimationRecipe(player),
          })),
          ...curEngine.monsters
            .filter((monster) => monster.state !== 'dead' && monster.hp > 0 && inNativeView(monster.x, monster.y, 90))
            .map((monster) => ({
              id: monster.id,
              kind: 'monster',
              faction: monster.faction || '',
              x: monster.x,
              y: monster.y - (monster.jumpZ || 0),
              size: monster.isBoss ? 70 : monster.isJuggernaut ? 52 : 34,
              color: nativeMonsterColor(monster.faction),
              velocityX: 0,
              velocityY: 0,
              hasVelocity: false,
              hpRatio: monster.maxHp > 0 ? monster.hp / monster.maxHp : 1,
              facingLeft: monster.facing === 'left',
              layer: 10,
            })),
          ...curEngine.projectiles.filter((projectile) => inNativeView(projectile.x, projectile.y, 48)).map((projectile) => ({
            id: projectile.id,
            kind: 'projectile',
            faction: projectile.faction || '',
            x: projectile.x,
            y: projectile.y + (projectile.visualOffsetY || 0),
            size: Math.max(4, projectile.size * 1.8),
            color: hexColor(projectile.color, [1, 0.9, 0.2, 1]),
            velocityX: projectile.vx,
            velocityY: projectile.vy,
            hasVelocity: true,
            hpRatio: 1,
            facingLeft: projectile.vx < 0,
            layer: 30,
            projectileType: projectile.type,
            projectileRange: projectile.range,
            tracerLength: projectile.tracerLength,
            tracerWidth: projectile.tracerWidth,
            distanceTraveled: projectile.distanceTraveled,
          })),
          ...curEngine.resourceNodes
            .filter((node) => node.hp > 0 && inNativeView(node.x, node.y, 80))
            .map((node) => ({
              id: `resource:${node.id}`,
              kind: 'resource',
              faction: '',
              x: node.x,
              y: node.y,
              size: Math.max(34, 52 * (node.scale || 1)),
              color: nativeResourceColor(node.type),
              velocityX: 0,
              velocityY: 0,
              hasVelocity: false,
              hpRatio: node.maxHp > 0 ? node.hp / node.maxHp : 1,
              facingLeft: false,
              layer: 7,
            })),
          ...curEngine.dropItems.filter((drop) => inNativeView(drop.x, drop.y, 28)).map((drop) => ({
            id: `drop:${drop.id}`,
            kind: 'pickup',
            faction: '',
            x: drop.x,
            y: drop.y - drop.bounceOffset,
            size: drop.isXpGem ? 14 : 20,
            color: drop.isXpGem ? [0.32, 1, 0.74, 1] as [number, number, number, number] : [1, 0.72, 0.16, 1] as [number, number, number, number],
            velocityX: drop.vx || 0,
            velocityY: drop.vy || 0,
            hasVelocity: Boolean(drop.vx || drop.vy),
            hpRatio: 1,
            facingLeft: false,
            layer: 14,
          })),
          ...curEngine.cars.filter((car) => inNativeView(car.x, car.y, 160)).map((car) => ({
            id: `car:${car.id}`,
            kind: 'vehicle',
            faction: car.type === 'police_car' ? 'police' : 'punk_demon',
            x: car.x,
            y: car.y,
            size: Math.max(car.width, car.height),
            color: car.type === 'police_car' ? [0.08, 0.68, 1, 1] as [number, number, number, number] : [1, 0.14, 0.35, 1] as [number, number, number, number],
            velocityX: car.vx,
            velocityY: car.vy,
            hasVelocity: true,
            hpRatio: car.maxHp > 0 ? car.hp / car.maxHp : 1,
            facingLeft: car.facing === 'left',
            layer: 16,
          })),
          ...curEngine.worldPois.filter((poi) => inNativeView(poi.x, poi.y, 80)).map((poi) => ({
            id: `poi:${poi.id}`,
            kind: 'poi',
            faction: '',
            x: poi.x,
            y: poi.y,
            size: Math.max(20, poi.radius || Math.max(poi.width || 0, poi.height || 0) || 28),
            color: nativePoiColor(poi.type),
            velocityX: 0,
            velocityY: 0,
            hasVelocity: false,
            hpRatio: 1,
            facingLeft: false,
            layer: 8,
          })),
        ].slice(0, 128);
        if (time - lastNativeFrameAt.current >= 1000 / 30) {
          lastNativeFrameAt.current = time;
          sendNativeWorldRenderFrame({
            cameraX: camera.x,
            cameraY: camera.y,
            zoom: camera.zoom,
            viewportWidth,
            viewportHeight,
            timeSeconds: timeInSeconds,
            theme: curEngine.player.currentZone,
            entities,
          });
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
      drawWorldInput(ctx, worldRenderInput);
      perfMonitor.recordDraw(performance.now() - drawStart);
      perfMonitor.recordFrame(frameIntervalMs);
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
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

              <DebugOverlay />

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
