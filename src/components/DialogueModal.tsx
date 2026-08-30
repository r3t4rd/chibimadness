import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, MessageSquare, Award, ArrowRight, CheckCircle } from 'lucide-react';
import { NPC, Player } from '../types/game';
import { drawChibiCharacter } from '../game/chibiRenderer';
import { QUESTS_DATABASE } from '../game/constants';
import { sound } from '../game/audioEngine';

interface DialogueModalProps {
  npc: NPC;
  player: Player;
  onClose: () => void;
  onOpenShop: () => void;
  onOpenCraft: () => void;
  onAcceptQuest: (questId: string) => void;
  onCompleteQuest: (questId: string) => void;
}

export const DialogueModal: React.FC<DialogueModalProps> = ({
  npc,
  player,
  onClose,
  onOpenShop,
  onOpenCraft,
  onAcceptQuest,
  onCompleteQuest,
}) => {
  const [currentText, setCurrentText] = useState<string>(npc.dialogue.greeting);
  const [typedText, setTypedText] = useState<string>('');
  const [showQuests, setShowQuests] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // VN text typing effect
  useEffect(() => {
    setTypedText('');
    let i = 0;
    const interval = setInterval(() => {
      if (i < currentText.length) {
        setTypedText(currentText.substring(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 20);

    return () => clearInterval(interval);
  }, [currentText]);

  // NPC Chibi Canvas Render
  useEffect(() => {
    let frameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fakePlayer: Player = {
      id: npc.id,
      name: npc.name,
      characterClass: 'gunslinger',
      chibi: npc.avatarChibi,
      x: 75,
      y: 95,
      vx: 0,
      vy: 0,
      facing: 'right',
      state: 'idle',
      stats: { level: 99, exp: 0, maxExp: 100, hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, atk: 50, def: 50, speed: 4, critRate: 10, statPoints: 0, str: 10, agi: 10, int: 10, vit: 10 },
      stamina: 100,
      maxStamina: 100,
      isSprinting: false,
      jumpZ: 0,
      jumpVz: 0,
      isJumping: false,
      bhopStreak: 0,
      bhopTimer: 0,
      bhopSpeedMult: 1.0,
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
      currentZone: 'cyber_city',
      activeBuffs: [],
    };

    let start = performance.now();
    const render = (time: number) => {
      const elapsed = (time - start) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawChibiCharacter(ctx, fakePlayer, elapsed, false);
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [npc]);

  const availableQuests = (npc.questIds || [])
    .map((qid) => QUESTS_DATABASE[qid])
    .filter((q) => !!q);

  return (
    <div className="fixed inset-x-4 bottom-6 z-50 flex justify-center pointer-events-none font-sans">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto w-full max-w-3xl bg-white/40 backdrop-blur-2xl border-2 border-white rounded-[36px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] p-6 flex flex-col md:flex-row gap-5 relative ring-1 ring-black/5"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-2xl bg-white/60 hover:bg-white/90 border border-white text-gray-700 hover:text-gray-900 shadow-xs transition-all cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* NPC Avatar Portrait */}
        <div className="flex flex-col items-center justify-center bg-white/45 border-2 border-white rounded-3xl p-3 w-36 self-center md:self-auto shrink-0 shadow-xs">
          <canvas ref={canvasRef} width={150} height={150} className="w-[120px] h-[120px]" />
          <div className="text-center mt-1">
            <h4 className="font-['Fredoka'] text-sm font-black text-gray-900">{npc.name}</h4>
            <span className="text-[10px] text-blue-600 font-black uppercase tracking-wider">{npc.title}</span>
          </div>
        </div>

        {/* Dialogue Text & Action Branches */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-pink-600 text-xs font-black font-['Fredoka'] uppercase tracking-wider mb-1.5">
              <MessageSquare size={14} />
              Dialogue
            </div>

            {/* Typed dialogue text */}
            <p className="text-sm font-medium text-gray-800 min-h-[55px] leading-relaxed bg-white/60 backdrop-blur-md p-3.5 rounded-2xl border border-white shadow-inner">
              {typedText}
            </p>
          </div>

          {/* Quests View or Options */}
          {showQuests ? (
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs font-black text-amber-700 border-b border-black/5 pb-1">
                <span>Available Quests</span>
                <button
                  type="button"
                  onClick={() => setShowQuests(false)}
                  className="text-gray-600 hover:text-gray-900 text-[11px] font-bold cursor-pointer"
                >
                  ← Back to Options
                </button>
              </div>

              {availableQuests.map((q) => {
                const questProgress = player.activeQuests[q.id];
                const isCompleted = questProgress?.status === 'completed';
                const isTurnedIn = questProgress?.status === 'turned_in' || player.completedQuestIds.includes(q.id);
                const isActive = questProgress?.status === 'active';

                return (
                  <div
                    key={q.id}
                    className="flex items-center justify-between bg-white/50 p-3 rounded-2xl border border-white text-xs shadow-xs"
                  >
                    <div>
                      <div className="font-['Fredoka'] font-black text-gray-900 flex items-center gap-1.5">
                        <Award size={14} className="text-amber-500" />
                        {q.title}
                      </div>
                      <p className="text-[11px] text-gray-600 mt-0.5 font-medium">{q.description}</p>
                      <div className="text-[10px] text-emerald-600 font-bold font-mono mt-0.5">
                        Reward: +{q.rewardExp} EXP | 🪙 +{q.rewardGold} Gold
                      </div>
                    </div>

                    <div>
                      {isTurnedIn ? (
                        <span className="text-[11px] font-bold text-gray-400">Completed ✔</span>
                      ) : isCompleted ? (
                        <button
                          type="button"
                          onClick={() => {
                            onCompleteQuest(q.id);
                            sound.playLevelUp();
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-['Fredoka'] font-black text-xs shadow-sm transition-all cursor-pointer active:scale-95"
                        >
                          Turn In!
                        </button>
                      ) : isActive ? (
                        <span className="text-[11px] font-bold text-amber-600">In Progress...</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onAcceptQuest(q.id);
                            sound.playPickup();
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-['Fredoka'] font-black text-xs shadow-sm transition-all cursor-pointer active:scale-95"
                        >
                          Accept
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-3.5">
              {npc.dialogue.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    sound.playPickup();
                    if (opt.action === 'open_shop') onOpenShop();
                    else if (opt.action === 'open_craft') onOpenCraft();
                    else if (opt.action === 'open_quests') setShowQuests(true);
                    else if (opt.action === 'heal') {
                      if (opt.dialogueText) setCurrentText(opt.dialogueText);
                    } else if (opt.dialogueText) {
                      setCurrentText(opt.dialogueText);
                    } else {
                      onClose();
                    }
                  }}
                  className="px-4 py-2 rounded-2xl bg-white/60 hover:bg-white/90 border border-white text-xs font-['Fredoka'] font-black text-gray-800 hover:text-gray-900 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <ArrowRight size={13} className="text-pink-500" />
                  {opt.text}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
