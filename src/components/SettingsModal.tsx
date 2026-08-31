import React from 'react';
import { motion } from 'motion/react';
import { X, Volume2, VolumeX, RefreshCw, LogOut, XCircle } from 'lucide-react';
import { Player } from '../types/game';

interface SettingsModalProps {
  player: Player;
  onClose: () => void;
  onLogout: () => void;
  onRespawn: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  player,
  onClose,
  onLogout,
  onRespawn,
  isMuted,
  onToggleMute,
}) => {
  const handleExitGame = () => {
    window.close();
    // Fallback if browser security blocks window.close()
    setTimeout(() => {
      window.location.href = 'about:blank';
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, rotate: -1.5 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        className="w-full max-w-md bg-white/45 backdrop-blur-2xl border-2 border-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.35)] p-6 sm:p-8 flex flex-col gap-5 relative ring-1 ring-black/5"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-2xl bg-white/70 hover:bg-white/90 border border-white text-gray-700 hover:text-gray-900 shadow-xs transition-all cursor-pointer"
          title="Close [ESC]"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="text-center mt-2">
          <h2 className="font-['Fredoka'] text-3xl font-black text-gray-900 tracking-tight flex items-center justify-center gap-2">
            ⚙️ Settings
          </h2>
          <p className="text-xs text-gray-600 font-bold mt-1">
            ChibiVerse • {player.name} (Lv. {player.stats.level} {player.characterClass.toUpperCase()})
          </p>
        </div>

        <div className="h-px bg-black/5 my-1" />

        {/* Settings Content Area */}
        <div className="flex flex-col gap-3">
          {/* Resume button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              clipPath: 'polygon(0% 2px, 98% 0%, 100% 90%, 95% 100%, 0% 95%)',
            }}
            className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-mono text-sm font-black shadow-md border-2 border-emerald-600 transition-all hover:scale-102 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            ▶️ Resume Game
          </button>

          {/* Audio Setting Toggle Button */}
          <button
            type="button"
            onClick={onToggleMute}
            style={{
              clipPath: 'polygon(1% 0%, 99% 2px, 98% 95%, 93% 98%, 0% 92%)',
            }}
            className="w-full py-3 px-4 rounded-xl bg-white/80 hover:bg-white border-2 border-zinc-300 text-gray-800 font-mono text-sm font-black shadow-xs transition-all hover:scale-102 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            {isMuted ? (
              <>
                <VolumeX size={16} className="text-rose-500 animate-pulse" />
                <span>Sound: MUTED</span>
              </>
            ) : (
              <>
                <Volume2 size={16} className="text-emerald-500" />
                <span>Sound: ACTIVE</span>
              </>
            )}
          </button>

          {/* Respawn Button */}
          <button
            type="button"
            onClick={onRespawn}
            style={{
              clipPath: 'polygon(2% 1px, 98% 0%, 100% 93%, 94% 97%, 1% 94%)',
            }}
            className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-mono text-sm font-black shadow-md border-2 border-amber-600 transition-all hover:scale-102 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} />
            <span>Respawn at Campsite</span>
          </button>

          {/* Logout to Character Selector */}
          <button
            type="button"
            onClick={onLogout}
            style={{
              clipPath: 'polygon(0% 3px, 97% 1px, 99% 92%, 93% 98%, 1% 93%)',
            }}
            className="w-full py-3 px-4 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-mono text-sm font-black shadow-md border-2 border-rose-600 transition-all hover:scale-102 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            <span>Character Selection</span>
          </button>

          {/* Exit Game */}
          <button
            type="button"
            onClick={handleExitGame}
            style={{
              clipPath: 'polygon(2% 0%, 99% 2px, 97% 95%, 92% 100%, 0% 94%)',
            }}
            className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-sm font-black shadow-md border-2 border-zinc-950 transition-all hover:scale-102 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <XCircle size={16} />
            <span>Exit Game</span>
          </button>
        </div>

        <div className="text-[10px] text-center text-gray-500 font-mono tracking-tight font-medium mt-1">
          Press [ESC] at any time to return to the game.
        </div>
      </motion.div>
    </div>
  );
};
