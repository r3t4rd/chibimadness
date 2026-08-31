import React from 'react';
import { motion } from 'motion/react';
import { X, TreePine, Building2, Skull, Sparkles } from 'lucide-react';
import { Player } from '../types/game';
import { WORLD_WIDTH, WORLD_HEIGHT, NPCS_DATABASE, INITIAL_MONSTERS } from '../game/constants';
import { isInHordeArena } from '../game/hordeMode';
import { getBuilding } from '../game/buildings';

interface WorldMapModalProps {
  player: Player;
  onClose: () => void;
  onTeleport?: (x: number, y: number, zoneName: string) => void;
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({ player, onClose, onTeleport }) => {
  const mapAnchor = player.interiorBuildingId ? getBuilding(player.interiorBuildingId)?.streetSpawn : undefined;
  const mapX = mapAnchor?.x ?? player.x;
  const mapY = mapAnchor?.y ?? player.y;
  const pRatioX = (mapX / WORLD_WIDTH) * 100;
  const pRatioY = (mapY / WORLD_HEIGHT) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl bg-white/40 backdrop-blur-2xl border-2 border-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] p-6 sm:p-8 relative flex flex-col max-h-[90vh] overflow-y-auto ring-1 ring-black/5"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-2xl bg-white/60 hover:bg-white/90 border border-white text-gray-700 hover:text-gray-900 shadow-xs transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="pb-3 border-b border-black/5">
          <h2 className="font-['Fredoka'] text-2xl font-black text-gray-900 flex items-center gap-2">
            <TreePine size={22} className="text-emerald-500" />
            Tactical World Map
          </h2>
          <p className="text-xs text-gray-600 font-medium">
            Forest Campsite, Mountain Foothills, Outlaw Canyon & Welder's Summit • <span className="text-pink-600 font-black">Click a zone to Fast Travel! 🚀</span>
            {isInHordeArena(player.x, player.y) && (
              <span className="text-cyan-600 font-black"> • You are in Nullspace — extract with [T] or fast travel out</span>
            )}
          </p>
        </div>

        <div className="relative w-full aspect-[16/10] bg-[#1a222d] rounded-[28px] border-2 border-white/20 mt-4 overflow-hidden shadow-inner text-white">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
            <button
              onClick={() => onTeleport?.(650, 750, 'Survivor Forest Campsite')}
              className="text-left border-r border-b border-white/10 bg-emerald-950/40 hover:bg-emerald-900/50 p-4 relative transition-colors duration-150 group cursor-pointer focus:outline-none"
            >
              <span className="flex items-center gap-1.5 text-xs font-black text-emerald-400 font-['Fredoka']">
                <TreePine size={16} />
                Survivor Forest Campsite
              </span>
              <span className="text-[10px] text-slate-400 font-semibold block">Tents • Campfire • Blacksmith • Supply Hub</span>
              <span className="absolute bottom-2 right-3 text-[9px] text-emerald-400/0 group-hover:text-emerald-400/80 transition-colors font-bold uppercase tracking-wider">Fast Travel 🚀</span>
            </button>

            <button
              onClick={() => onTeleport?.(2150, 750, 'Outlaw Canyon Pass')}
              className="text-left border-b border-white/10 bg-slate-900/60 hover:bg-slate-800/70 p-4 relative transition-colors duration-150 group cursor-pointer focus:outline-none"
            >
              <span className="flex items-center gap-1.5 text-xs font-black text-amber-400 font-['Fredoka']">
                <Building2 size={16} />
                Outlaw Canyon Pass
              </span>
              <span className="text-[10px] text-slate-400 font-semibold block">Cliffs • Bandits • Dead-Eye Viktor</span>
              <span className="absolute bottom-2 right-3 text-[9px] text-amber-400/0 group-hover:text-amber-400/80 transition-colors font-bold uppercase tracking-wider">Fast Travel 🚀</span>
            </button>

            <button
              onClick={() => onTeleport?.(650, 1900, 'Emerald Timberland')}
              className="text-left border-r border-white/10 bg-emerald-950/60 hover:bg-emerald-900/70 p-4 relative transition-colors duration-150 group cursor-pointer focus:outline-none"
            >
              <span className="flex items-center gap-1.5 text-xs font-black text-teal-400 font-['Fredoka']">
                <Sparkles size={16} />
                Emerald Timberland
              </span>
              <span className="text-[10px] text-slate-400 font-semibold block">Pine Logging • Wild Wolves • Iron Ore</span>
              <span className="absolute bottom-2 right-3 text-[9px] text-teal-400/0 group-hover:text-teal-400/80 transition-colors font-bold uppercase tracking-wider">Fast Travel 🚀</span>
            </button>

            <button
              onClick={() => onTeleport?.(2850, 2000, "The Welder's Furnace Summit")}
              className="text-left bg-rose-950/50 hover:bg-rose-900/60 p-4 relative transition-colors duration-150 group cursor-pointer focus:outline-none"
            >
              <span className="flex items-center gap-1.5 text-xs font-black text-rose-400 font-['Fredoka']">
                <Skull size={16} />
                The Welder's Furnace Summit
              </span>
              <span className="text-[10px] text-slate-400 font-semibold block">Boss Arena • "Iron Mask" Sledge • Basalt Plateau</span>
              <span className="absolute bottom-2 right-3 text-[9px] text-rose-400/0 group-hover:text-rose-400/80 transition-colors font-bold uppercase tracking-wider">Fast Travel 🚀</span>
            </button>
          </div>

          {Object.values(NPCS_DATABASE).map((npc) => {
            const rx = (npc.x / WORLD_WIDTH) * 100;
            const ry = (npc.y / WORLD_HEIGHT) * 100;
            return (
              <div
                key={npc.id}
                style={{ left: `${rx}%`, top: `${ry}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group pointer-events-auto cursor-pointer"
              >
                <div className="w-6 h-6 rounded-full bg-amber-400 text-white flex items-center justify-center text-[11px] shadow-md border-2 border-white">
                  👤
                </div>
                <span className="opacity-0 group-hover:opacity-100 text-[10px] font-black bg-white/90 text-amber-800 border border-white px-2 py-0.5 rounded-full shadow-md whitespace-nowrap transition-opacity mt-1">
                  {npc.name}
                </span>
              </div>
            );
          })}

          {INITIAL_MONSTERS.filter((m) => m.isBoss).map((boss) => {
            const bx = (boss.spawnX / WORLD_WIDTH) * 100;
            const by = (boss.spawnY / WORLD_HEIGHT) * 100;
            return (
              <div
                key={boss.id}
                style={{ left: `${bx}%`, top: `${by}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group pointer-events-auto cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-sm shadow-md border-2 border-white animate-pulse">
                  👑
                </div>
                <span className="text-[10px] font-black bg-rose-500 text-white border border-white px-2.5 py-0.5 rounded-full shadow whitespace-nowrap mt-1">
                  {boss.name}
                </span>
              </div>
            );
          })}

          {!isInHordeArena(player.x, player.y) ? (
          <div
            style={{ left: `${pRatioX}%`, top: `${pRatioY}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-10"
          >
            <div className="relative">
              <span className="absolute -inset-2 rounded-full bg-pink-400/40 animate-ping" />
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-amber-400 border-2 border-white shadow-xl flex items-center justify-center text-sm font-bold text-white">
                ⭐
              </div>
            </div>
            <span className="text-[10px] font-['Fredoka'] font-black bg-white/90 text-pink-600 px-2.5 py-0.5 rounded-full shadow-md border border-white mt-1 whitespace-nowrap">
              You ({player.name})
            </span>
          </div>
          ) : (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="px-4 py-2 rounded-2xl bg-cyan-950/90 border border-cyan-400 text-cyan-100 font-['Fredoka'] font-black text-sm shadow-xl">
                IN NULLSPACE
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-xs font-semibold text-gray-700 bg-white/40 p-3.5 rounded-2xl border border-white">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-amber-400 border border-white" /> You</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 border border-white" /> NPC Vendor/Quest</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 border border-white" /> World Boss</span>
          </div>
          <span className="font-mono text-gray-500 font-bold">World Bounds: 3200 x 2400 px</span>
        </div>
      </motion.div>
    </div>
  );
};
