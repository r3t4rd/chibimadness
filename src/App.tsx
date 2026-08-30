import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, Item, ChatMessage } from './types/game';
import { useGameEngine } from './game/useGameEngine';
import { drawWorld, screenToWorld } from './game/worldRenderer';
import { sound } from './game/audioEngine';
import { CharacterCreator } from './components/CharacterCreator';
import { HUD } from './components/HUD';
import { InventoryModal } from './components/InventoryModal';
import { CraftingModal } from './components/CraftingModal';
import { ShopModal } from './components/ShopModal';
import { DialogueModal } from './components/DialogueModal';
import { SkillTreeModal } from './components/SkillTreeModal';
import { WorldMapModal } from './components/WorldMapModal';
import { GunsmithModal } from './components/GunsmithModal';
import { ChatAndEmotes } from './components/ChatAndEmotes';
import { BossBar } from './components/BossBar';
import { MobileControls } from './components/MobileControls';
import { NPCS_DATABASE, CLASS_DEFAULTS } from './game/constants';
import { net } from './game/multiplayerClient';

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
};

export function App() {
  const [createdPlayer, setCreatedPlayer] = useState<Player | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Main Canvas Render Loop
  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas || !createdPlayer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive Canvas Resize Observer
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const render = (time: number) => {
      const timeInSeconds = (time % 10000000) / 1000;
      const curEngine = engineRef.current;
      drawWorld(
        ctx,
        canvas.width,
        canvas.height,
        curEngine.player,
        curEngine.remotePlayers,
        curEngine.monsters,
        curEngine.resourceNodes,
        curEngine.dropItems,
        curEngine.projectiles,
        curEngine.particles,
        curEngine.damagePopups,
        curEngine.screenShake,
        curEngine.groundDecals,
        timeInSeconds
      );
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [createdPlayer]);

  // Listen for Hold [C] to open Gunsmith Weapon Customization & RMB release
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' && !e.repeat && engine.activeModal === 'none') {
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
    };
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    const handleWindowBlur = () => {
      engine.setIsAiming(false);
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
    if (engine.player.gold >= item.price) {
      engine.player.gold -= item.price;
      const inv = [...engine.player.inventory];
      const existing = inv.find((s) => s.item.id === item.id);
      if (existing && item.stackable) {
        existing.quantity += 1;
      } else {
        inv.push({ slotId: Date.now(), item, quantity: 1 });
      }
      engine.player.inventory = inv;
    }
  };

  const handleSellItem = (item: Item) => {
    const sellPrice = Math.floor(item.price * 0.6) || 10;
    engine.player.gold += sellPrice;
    engine.player.inventory = engine.player.inventory
      .map((s) => (s.item.id === item.id ? { ...s, quantity: s.quantity - 1 } : s))
      .filter((s) => s.quantity > 0);
  };

  const handleInteract = () => {
    if (engine.nearbyInteractable?.type === 'npc') {
      const npc = Object.values(NPCS_DATABASE).find((n) => n.id === engine.nearbyInteractable?.id);
      if (npc) {
        engine.setActiveNpc(npc);
        engine.setActiveModal('dialogue');
      }
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* 1. Character Creation Screen if not yet spawned */}
      {!createdPlayer ? (
        <CharacterCreator
          onStartGame={(p) => {
            setCreatedPlayer(p);
          }}
        />
      ) : (
        <>
          {/* 2. Main Open World Canvas */}
          <canvas
            ref={canvasRef}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              if (e.button === 2) {
                // Right Mouse Button: Aim Mode
                e.preventDefault();
                engine.setIsAiming(true);
                return;
              }
              if (e.button === 0) {
                // Left Mouse Button: Fire Weapon accurately using world coordinates
                const rect = canvas.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const targetWorldPos = screenToWorld(screenX, screenY, canvas.width, canvas.height);
                engine.handleAttack(targetWorldPos.x, targetWorldPos.y);
              }
            }}
            onMouseUp={(e) => {
              if (e.button === 2) {
                e.preventDefault();
                engine.setIsAiming(false);
              }
            }}
            className="absolute inset-0 block w-full h-full cursor-crosshair"
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

          {/* 4. Top World Boss HP Bar */}
          <BossBar boss={engine.currentBoss} />

          {/* 5. Main Game HUD */}
          <HUD
            player={engine.player}
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
          />

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
            onAttack={engine.handleAttack}
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
            onToggleInspect={() => engine.setIsModdingWeapon(!engine.isModdingWeapon)}
            isInspecting={engine.isModdingWeapon}
            onUseSkill={engine.handleUseSkill}
            onToggleVehicle={engine.handleToggleVehicle}
            onInteract={handleInteract}
            hasInteractable={!!engine.nearbyInteractable}
          />

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
                engine.player.activeQuests[qid] = {
                  questId: qid,
                  status: 'active',
                  objectives: [
                    { type: 'kill', targetId: 'slime_blob', targetName: 'Slime Blobs', current: 0, required: 3 },
                  ],
                };
                sound.playPickup();
              }}
              onCompleteQuest={engine.completeQuest}
            />
          )}

          {engine.activeModal === 'skills' && (
            <SkillTreeModal
              player={engine.player}
              onClose={() => engine.setActiveModal('none')}
              onAllocateStat={engine.handleAllocateStat}
            />
          )}

          {engine.activeModal === 'map' && (
            <WorldMapModal player={engine.player} onClose={() => engine.setActiveModal('none')} />
          )}

          {/* 9. Real-Time Gunsmith Weapon Modding (Hold [C]) */}
          <GunsmithModal
            player={engine.player}
            isOpen={engine.isModdingWeapon}
            onEquipAttachment={engine.handleEquipAttachment}
          />
        </>
      )}
    </div>
  );
}

export default App;
