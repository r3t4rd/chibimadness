import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Hammer, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { Player, CraftRecipe } from '../types/game';
import { CRAFT_RECIPES, ITEMS_DATABASE } from '../game/constants';

interface CraftingModalProps {
  player: Player;
  onClose: () => void;
  onCraftItem: (recipeId: string) => void;
}

export const CraftingModal: React.FC<CraftingModalProps> = ({ player, onClose, onCraftItem }) => {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(CRAFT_RECIPES[0].id);
  const [category, setCategory] = useState<'all' | 'weapons' | 'armor' | 'vehicles' | 'food' | 'potions'>('all');

  const selectedRecipe = CRAFT_RECIPES.find((r) => r.id === selectedRecipeId) || CRAFT_RECIPES[0];
  const resultItem = ITEMS_DATABASE[selectedRecipe.resultItemId];

  const filteredRecipes = CRAFT_RECIPES.filter((r) => category === 'all' || r.category === category);

  // Check if player has all materials
  const canCraft = selectedRecipe.materials.every((mat) => {
    const slot = player.inventory.find((s) => s.item.id === mat.itemId);
    return slot && slot.quantity >= mat.count;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl bg-white/40 backdrop-blur-2xl border-2 border-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] p-6 sm:p-8 flex flex-col md:flex-row gap-6 relative max-h-[90vh] overflow-y-auto ring-1 ring-black/5"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-2xl bg-white/60 hover:bg-white/90 border border-white text-gray-700 hover:text-gray-900 shadow-xs transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Left Column: Recipe List */}
        <div className="md:w-5/12 flex flex-col gap-3 border-b md:border-b-0 md:border-r border-black/5 pb-4 md:pb-0 md:pr-4">
          <div>
            <h2 className="font-['Fredoka'] text-2xl font-black text-gray-900 flex items-center gap-2">
              <Hammer size={22} className="text-blue-500" />
              Crafting Workshop
            </h2>
            <p className="text-xs text-gray-600 font-medium">Forge weapons, cyber gear & vehicles</p>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1 bg-white/40 p-1 rounded-2xl border border-white text-[11px]">
            {(['all', 'weapons', 'armor', 'vehicles', 'food', 'potions'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded-xl capitalize font-black transition-all cursor-pointer ${
                  category === c ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Recipes List */}
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[340px] pr-1">
            {filteredRecipes.map((r) => {
              const resItem = ITEMS_DATABASE[r.resultItemId];
              const isSelected = selectedRecipeId === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRecipeId(r.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border-2 transition-all cursor-pointer shadow-xs ${
                    isSelected
                      ? 'border-blue-500 bg-white/80 text-gray-900 shadow-md ring-2 ring-blue-500/20'
                      : 'border-white bg-white/40 text-gray-700 hover:bg-white/60'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/80 border border-white flex items-center justify-center text-2xl shadow-xs">
                    {resItem?.icon || '🔨'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black truncate text-gray-900 font-['Fredoka']">{r.name}</div>
                    <div className="text-[10px] font-bold text-gray-500 capitalize">{r.category}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Recipe Details & Materials Requirement */}
        <div className="md:w-7/12 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Target Item Banner */}
            <div className="flex items-center gap-4 bg-white/60 backdrop-blur-xl p-4 rounded-3xl border-2 border-white shadow-sm ring-1 ring-black/5">
              <div className="w-16 h-16 rounded-2xl bg-white/80 border border-white flex items-center justify-center text-4xl shadow-xs">
                {resultItem?.icon || '🔨'}
              </div>
              <div>
                <h3 className="font-['Fredoka'] text-xl font-black text-gray-900">{resultItem?.name}</h3>
                <p className="text-xs text-gray-600 mt-0.5 font-medium">{resultItem?.description}</p>
                <div className="flex gap-2.5 mt-1.5 text-[11px] font-bold">
                  {resultItem?.stats?.atk && <span className="text-pink-600">ATK +{resultItem.stats.atk}</span>}
                  {resultItem?.stats?.def && <span className="text-blue-600">DEF +{resultItem.stats.def}</span>}
                  {resultItem?.stats?.speed && <span className="text-amber-600">SPD +{resultItem.stats.speed}</span>}
                </div>
              </div>
            </div>

            {/* Required Materials Checklist */}
            <div>
              <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Required Materials</h4>
              <div className="space-y-2">
                {selectedRecipe.materials.map((mat) => {
                  const mItem = ITEMS_DATABASE[mat.itemId];
                  const inBagSlot = player.inventory.find((s) => s.item.id === mat.itemId);
                  const hasQty = inBagSlot ? inBagSlot.quantity : 0;
                  const isEnough = hasQty >= mat.count;

                  return (
                    <div
                      key={mat.itemId}
                      className="flex items-center justify-between bg-white/40 border-2 border-white px-4 py-2.5 rounded-2xl text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{mItem?.icon || '📦'}</span>
                        <span className="font-bold text-gray-800">{mItem?.name || mat.itemId}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className={isEnough ? 'text-emerald-600 font-black' : 'text-rose-600 font-black'}>
                          {hasQty} / {mat.count}
                        </span>
                        {isEnough ? (
                          <CheckCircle2 size={16} className="text-emerald-500" />
                        ) : (
                          <AlertCircle size={16} className="text-rose-500" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Craft Action Button */}
          <button
            type="button"
            disabled={!canCraft}
            onClick={() => onCraftItem(selectedRecipe.id)}
            className={`w-full mt-4 py-3.5 px-6 rounded-2xl font-['Fredoka'] font-black text-base flex items-center justify-center gap-2 transition-all cursor-pointer border-2 border-white shadow-md ${
              canCraft
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-[0_16px_32px_-8px_rgba(79,70,229,0.35)] active:scale-98'
                : 'bg-white/30 text-gray-400 border-white/40 cursor-not-allowed'
            }`}
          >
            <Sparkles size={18} />
            {canCraft ? 'FORGE ITEM NOW' : 'MISSING REQUIRED MATERIALS'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

