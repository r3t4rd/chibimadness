import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Smile } from 'lucide-react';
import { ChatMessage } from '../types/game';
import { sound } from '../game/audioEngine';

interface ChatAndEmotesProps {
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSendEmote: (emoji: string) => void;
}

const EMOTES = ['💖', '✨', '👋', '😎', '⚔️', '🔥', '🌸', '💤', '🎉', '🍵', '💀', '🛡️', '💥', '🔫', '🎯'];

export const ChatAndEmotes: React.FC<ChatAndEmotesProps> = ({ chatMessages, onSendMessage, onSendEmote }) => {
  const [inputText, setInputText] = useState<string>('');
  const [showEmotePicker, setShowEmotePicker] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    sound.playPickup();
  };

  return (
    <div className="fixed bottom-3 left-4 z-40 w-72 sm:w-88 pointer-events-none select-none font-mono">
      {/* 1. Ripped Manga Paper Sheet Messages Feed (Вырванный кусок листа) */}
      <div
        style={{
          clipPath: 'polygon(0 8px, 8% 2px, 16% 9px, 25% 1px, 33% 8px, 42% 3px, 50% 10px, 58% 2px, 67% 9px, 75% 1px, 83% 8px, 92% 3px, 100% 9px, 100% 100%, 0 100%)',
        }}
        className="bg-zinc-950/92 backdrop-blur-md border-b-2 border-red-600 p-3 pt-4 mb-2 shadow-[0_8px_30px_rgba(0,0,0,0.85)] max-h-48 overflow-y-auto space-y-1.5 scrollbar-none flex flex-col justify-end"
      >
        <div className="text-[9px] font-black tracking-widest text-red-500 uppercase border-b border-red-900/50 pb-1 mb-1 flex items-center justify-between">
          <span>// COMBAT_COMMS</span>
          <span className="text-zinc-500">MANGA_PAGE_01</span>
        </div>
        {chatMessages.slice(-10).map((msg) => (
          <div
            key={msg.id}
            className="text-xs leading-snug drop-shadow-xs"
          >
            <span className="font-black text-red-400 mr-1.5 uppercase tracking-tighter">
              [{msg.senderName}]:
            </span>
            <span className="text-zinc-100 font-sans font-medium">{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 2. Floating Emote Popover Menu */}
      <AnimatePresence>
        {showEmotePicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            className="pointer-events-auto mb-2 p-2 rounded-xl bg-zinc-950/95 backdrop-blur-md border border-red-600/40 shadow-2xl grid grid-cols-5 gap-1.5 -skew-x-6"
          >
            {EMOTES.map((emo) => (
              <button
                key={emo}
                type="button"
                onClick={() => {
                  onSendEmote(emo);
                  setShowEmotePicker(false);
                  sound.playSpawnBounce();
                }}
                className="text-xl hover:scale-125 active:scale-95 transition-transform p-1.5 rounded-lg bg-zinc-900 hover:bg-red-600/30 flex items-center justify-center cursor-pointer"
              >
                <span className="skew-x-6">{emo}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Persona 5 Skewed Input Bar */}
      <form
        onSubmit={handleSend}
        className="pointer-events-auto flex items-center gap-1.5 p-1 bg-zinc-950/95 backdrop-blur-md border-b-2 border-red-600 shadow-xl -skew-x-6"
      >
        <input
          type="text"
          value={inputText}
          maxLength={80}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type transmission..."
          className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none font-sans skew-x-6"
        />

        {/* Emote Popover Menu Button */}
        <button
          type="button"
          onClick={() => setShowEmotePicker((p) => !p)}
          className={`p-1.5 rounded-lg transition-all cursor-pointer skew-x-6 ${
            showEmotePicker
              ? 'bg-red-600 text-white scale-105'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
          title="Emotes Menu"
        >
          <Smile size={16} />
        </button>

        {/* Send Button */}
        <button
          type="submit"
          className="p-1.5 px-3 rounded-lg bg-gradient-to-tr from-red-600 to-rose-600 text-white font-black text-xs tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center skew-x-6 shadow-md"
          title="Send message"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
};

