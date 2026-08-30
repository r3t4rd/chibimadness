import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Shield, Sparkles } from 'lucide-react';
import { Player, Item, ItemRarity } from '../types/game';

interface InventoryModalProps {
  player: Player;
  onClose: () => void;
  onEquipItem: (item: Item) => void;
  onUseItem: (item: Item) => void;
}

const RARITY_BORDER: Record<ItemRarity, string> = {
  common: 'border-white/80 bg-white/40',
  uncommon: 'border-emerald-300 bg-emerald-50/60',
  rare: 'border-blue-300 bg-blue-50/60',
  epic: 'border-purple-300 bg-purple-50/60',
  legendary: 'border-amber-300 bg-amber-50/60',
  mythic: 'border-rose-300 bg-rose-50/60',
};

const RARITY_TEXT: Record<ItemRarity, string> = {
  common: 'text-gray-700',
  uncommon: 'text-emerald-600',
  rare: 'text-blue-600',
  epic: 'text-purple-600',
  legendary: 'text-amber-600',
  mythic: 'text-rose-600',
};

export const InventoryModal: React.FC<InventoryModalProps> = ({
  player,
  onClose,
  onEquipItem,
  onUseItem,
}) => {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [tab, setTab] = useState<'all' | 'equipment' | 'consumable' | 'material'>('all');

  const { inventory = [], equipment = { weapon: null, headwear: null, outfit: null, vehicle: null, accessory: null }, stats } = player;

  const filteredSlots = inventory.filter((slot) => {
    if (tab === 'all') return true;
    if (tab === 'equipment') return ['weapon', 'headwear', 'outfit', 'vehicle'].includes(slot.item.type);
    return slot.item.type === tab;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl bg-white/40 backdrop-blur-2xl border-2 border-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] p-6 sm:p-8 flex flex-col md:flex-row gap-6 relative max-h-[90vh] overflow-y-auto ring-1 ring-black/5"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-2xl bg-white/60 hover:bg-white/90 border border-white text-gray-700 hover:text-gray-900 shadow-xs transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Left Column: Equipment Slots & Stats */}
        <div className="md:w-5/12 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-black/5 pb-4 md:pb-0 md:pr-4">
          <div>
            <h2 className="font-['Fredoka'] text-2xl font-black text-gray-900 flex items-center gap-2">
              <Shield size={22} className="text-pink-500" />
              Equipped Gear
            </h2>
            <p className="text-xs text-gray-600 font-medium">Current battle equipment & attributes</p>
          </div>

          {/* Paperdoll Equipment Slots */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { slotName: 'Weapon', item: equipment.weapon, icon: '🗡️' },
              { slotName: 'Head / Halo', item: equipment.headwear, icon: '👑' },
              { slotName: 'Outfit / Coat', item: equipment.outfit, icon: '🧥' },
              { slotName: 'Vehicle / Mount', item: equipment.vehicle, icon: '🛹' },
            ].map((s, idx) => (
              <div
                key={idx}
                onClick={() => s.item && setSelectedItem(s.item)}
                className={`flex items-center gap-2.5 p-2.5 rounded-2xl border-2 transition-all cursor-pointer shadow-xs ${
                  s.item ? RARITY_BORDER[s.item.rarity] : 'border-white bg-white/30 hover:bg-white/50'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-white/60 border border-white flex items-center justify-center text-xl shadow-xs">
                  {s.item ? s.item.icon : s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black text-gray-500 uppercase tracking-tight">{s.slotName}</div>
                  <div className={`text-xs font-black truncate ${s.item ? RARITY_TEXT[s.item.rarity] : 'text-gray-400'}`}>
                    {s.item ? s.item.name : 'Empty Slot'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total Combat Stats Overview */}
          <div className="bg-white/40 border-2 border-white rounded-3xl p-3.5 space-y-2 text-xs shadow-xs">
            <div className="font-['Fredoka'] font-black text-gray-900 border-b border-black/5 pb-1.5 flex justify-between">
              <span>Player Attributes</span>
              <span className="text-blue-600 font-mono font-black">Level {stats.level}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-gray-700 font-medium">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Attack:</span>
                <span className="font-black text-pink-600">{stats.atk}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Defense:</span>
                <span className="font-black text-blue-600">{stats.def}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Max HP:</span>
                <span className="font-black text-emerald-600">{stats.maxHp}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Max MP:</span>
                <span className="font-black text-cyan-600">{stats.maxMp}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Speed:</span>
                <span className="font-black text-amber-600">{(stats.speed * (player.isRiding ? 1.8 : 1)).toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Crit Rate:</span>
                <span className="font-black text-purple-600">{stats.critRate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Inventory Bag Slots & Item Details */}
        <div className="md:w-7/12 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-black/5">
              <h2 className="font-['Fredoka'] text-2xl font-black text-gray-900">Backpack Inventory</h2>
              {/* Category Tabs */}
              <div className="flex gap-1 bg-white/40 p-1 rounded-2xl border border-white text-xs">
                {(['all', 'equipment', 'consumable', 'material'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`px-3 py-1 rounded-xl capitalize font-black transition-all cursor-pointer ${
                      tab === t ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Inventory Slot Grid (5x4) */}
            <div className="grid grid-cols-5 gap-2.5 mt-3.5 min-h-[220px]">
              {Array.from({ length: 20 }).map((_, idx) => {
                const slot = filteredSlots[idx];
                return (
                  <div
                    key={idx}
                    onClick={() => slot && setSelectedItem(slot.item)}
                    className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-1 transition-all cursor-pointer shadow-xs ${
                      slot
                        ? `${RARITY_BORDER[slot.item.rarity]} hover:scale-105 shadow-sm`
                        : 'border-white/60 bg-white/25 hover:bg-white/40'
                    } ${selectedItem?.id === slot?.item.id ? 'ring-2 ring-blue-500 scale-102' : ''}`}
                  >
                    {slot ? (
                      <>
                        <span className="text-2xl drop-shadow-xs">{slot.item.icon}</span>
                        {slot.quantity > 1 && (
                          <span className="absolute bottom-1 right-1 text-[10px] font-black bg-gray-900 text-white px-1.5 py-0.2 rounded-md font-mono">
                            x{slot.quantity}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400/60 text-xs font-mono font-bold">{idx + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Item Detail Card & Action */}
          {selectedItem && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-3xl bg-white/60 backdrop-blur-xl border-2 border-white flex items-center justify-between gap-4 shadow-sm ring-1 ring-black/5"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/80 border border-white flex items-center justify-center text-3xl shadow-xs">
                  {selectedItem.icon}
                </div>
                <div>
                  <h4 className={`font-['Fredoka'] font-black text-base ${RARITY_TEXT[selectedItem.rarity]}`}>{selectedItem.name}</h4>
                  <p className="text-xs text-gray-600 line-clamp-1 font-medium">{selectedItem.description}</p>
                  {/* Stats list */}
                  <div className="flex gap-3 text-[11px] font-bold mt-1">
                    {selectedItem.stats?.atk && <span className="text-pink-600">ATK +{selectedItem.stats.atk}</span>}
                    {selectedItem.stats?.def && <span className="text-blue-600">DEF +{selectedItem.stats.def}</span>}
                    {selectedItem.stats?.speed && <span className="text-amber-600">SPD +{selectedItem.stats.speed}</span>}
                    {selectedItem.healHp && <span className="text-emerald-600">Heal {selectedItem.healHp} HP</span>}
                  </div>
                </div>
              </div>

              <div>
                {['weapon', 'headwear', 'outfit', 'vehicle'].includes(selectedItem.type) ? (
                  <button
                    type="button"
                    onClick={() => {
                      onEquipItem(selectedItem);
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-['Fredoka'] font-bold text-xs shadow-md border border-white/50 transition-all cursor-pointer active:scale-95"
                  >
                    Equip
                  </button>
                ) : selectedItem.type === 'consumable' ? (
                  <button
                    type="button"
                    onClick={() => {
                      onUseItem(selectedItem);
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-['Fredoka'] font-bold text-xs shadow-md border border-white/50 transition-all cursor-pointer active:scale-95"
                  >
                    Use
                  </button>
                ) : null}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

