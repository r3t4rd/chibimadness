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
      {/* 1. Borderless Floating Messages Feed (Transparent background, high readability) */}
      <div className="max-h-48 overflow-y-auto space-y-1 p-1 mb-2 scrollbar-none flex flex-col justify-end">
        {chatMessages.slice(-10).map((msg) => (
          <div
            key={msg.id}
            className="text-xs leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
          >
            <span className="font-bold text-sky-400 mr-1.5">
              [{msg.senderName}]:
            </span>
            <span className="text-white/95 font-sans font-medium">{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 2. Floating Emote Popover Menu (Right above the input bar) */}
      <AnimatePresence>
        {showEmotePicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            className="pointer-events-auto mb-2 p-2 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 shadow-2xl grid grid-cols-5 gap-1.5"
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
                className="text-xl hover:scale-125 active:scale-95 transition-transform p-1.5 rounded-xl bg-white/5 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                {emo}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Sleek Minimalist Input Bar (Only input + Emote menu toggle + Send button) */}
      <form
        onSubmit={handleSend}
        className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-lg"
      >
        <input
          type="text"
          value={inputText}
          maxLength={80}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Press Enter to chat..."
          className="flex-1 bg-transparent px-3.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none font-sans"
        />

        {/* Emote Popover Menu Button */}
        <button
          type="button"
          onClick={() => setShowEmotePicker((p) => !p)}
          className={`p-1.5 rounded-full transition-all cursor-pointer ${
            showEmotePicker
              ? 'bg-amber-400 text-slate-950 scale-105'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
          title="Emotes Menu"
        >
          <Smile size={16} />
        </button>

        {/* Send Button */}
        <button
          type="submit"
          className="p-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center"
          title="Send message"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
};

