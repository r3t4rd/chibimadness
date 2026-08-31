import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, ShoppingBag, Coins, Sparkles } from 'lucide-react';
import { Player, NPC, Item } from '../types/game';
import { ITEMS_DATABASE } from '../game/constants';
import { sound } from '../game/audioEngine';

interface ShopModalProps {
  player: Player;
  npc: NPC;
  onClose: () => void;
  onBuyItem: (item: Item) => void;
  onSellItem: (item: Item) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ player, npc, onClose, onBuyItem, onSellItem }) => {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const shopItems = (npc.shopItemIds || []).map((id) => ITEMS_DATABASE[id]).filter((it) => !!it);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-3xl bg-gradient-to-br from-white/50 via-pink-50/35 to-amber-50/40 backdrop-blur-2xl border-2 border-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(236,72,153,0.25)] p-6 sm:p-8 relative max-h-[85vh] overflow-y-auto ring-2 ring-pink-200/40"
      >
        <div className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px] font-['Fredoka'] font-black uppercase tracking-wider shadow-md flex items-center gap-1">
          <Sparkles size={12} />
          Chibi Shop
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-2xl bg-white/70 hover:bg-white/95 border border-pink-100 text-gray-700 hover:text-pink-600 shadow-xs transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-pink-100/60 gap-3">
          <div>
            <h2 className="font-['Fredoka'] text-2xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 bg-clip-text text-transparent flex items-center gap-2">
              <ShoppingBag size={22} className="text-pink-500" />
              Магазин {npc.name}
            </h2>
            <p className="text-xs text-gray-600 font-medium">{npc.title}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-amber-50/90 px-3.5 py-1.5 rounded-2xl border border-amber-200 font-mono text-sm font-black text-amber-700 shadow-xs">
              <Coins size={16} className="text-amber-500" />
              {player.gold} Gold
            </div>

            <div className="flex bg-white/50 p-1 rounded-2xl border border-pink-100 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('buy')}
                className={`px-3 py-1 rounded-xl font-black transition-all cursor-pointer ${
                  activeTab === 'buy' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs' : 'text-gray-600 hover:text-pink-600 hover:bg-white/60'
                }`}
              >
                Купить
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sell')}
                className={`px-3 py-1 rounded-xl font-black transition-all cursor-pointer ${
                  activeTab === 'sell' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs' : 'text-gray-600 hover:text-pink-600 hover:bg-white/60'
                }`}
              >
                Продать
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'buy' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {shopItems.map((item) => {
              const canAfford = player.gold >= item.price;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white/55 border-2 border-white hover:border-pink-200/80 hover:bg-white/75 transition-all shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white/90 border border-pink-100 flex items-center justify-center text-2xl shadow-xs">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-['Fredoka'] font-black text-xs text-gray-900">{item.name}</h4>
                      <p className="text-[11px] text-gray-600 line-clamp-1 font-medium">{item.description}</p>
                      <span className="text-[11px] font-black text-amber-600 font-mono">🪙 {item.price} Gold</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => {
                      onBuyItem(item);
                      sound.playPickup();
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-['Fredoka'] font-black transition-all cursor-pointer border ${
                      canAfford
                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white border-pink-300/50 shadow-sm active:scale-95'
                        : 'bg-white/30 text-gray-400 border-white/30 cursor-not-allowed'
                    }`}
                  >
                    Купить
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {player.inventory.length === 0 ? (
              <p className="col-span-2 text-center text-sm text-gray-500 font-medium py-8">Инвентарь пуст — нечего продавать</p>
            ) : (
              player.inventory.map((slot) => {
                const sellPrice = Math.floor(slot.item.price * 0.6) || 10;
                return (
                  <div
                    key={slot.slotId}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white/55 border-2 border-white shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-white/90 border border-pink-100 flex items-center justify-center text-2xl shadow-xs">
                        {slot.item.icon}
                      </div>
                      <div>
                        <h4 className="font-['Fredoka'] font-black text-xs text-gray-900">
                          {slot.item.name} {slot.quantity > 1 && `x${slot.quantity}`}
                        </h4>
                        <span className="text-[11px] font-black text-amber-600 font-mono">🪙 +{sellPrice} Gold</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSellItem(slot.item);
                        sound.playPickup();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-xs font-['Fredoka'] font-black transition-all cursor-pointer active:scale-95 shadow-xs"
                    >
                      Продать
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
