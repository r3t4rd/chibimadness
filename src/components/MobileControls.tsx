import React, { useRef, useState } from 'react';
import { Sword, Zap, Footprints } from 'lucide-react';

interface MobileControlsProps {
  onJoystickMove: (vector: { x: number; y: number }) => void;
  onAttack: () => void;
  onJump?: () => void;
  onToggleSprint?: () => void;
  isSprinting?: boolean;
  onUseSkill: (idx: number) => void;
  onToggleVehicle: () => void;
  onInteract: () => void;
  hasInteractable: boolean;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  onJoystickMove,
  onAttack,
  onJump,
  onToggleSprint,
  isSprinting = false,
  onInteract,
  hasInteractable,
}) => {
  const [, setJoystickActive] = useState(false);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const touchIdRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    setJoystickActive(true);
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setJoystickActive(false);
        setKnobPos({ x: 0, y: 0 });
        onJoystickMove({ x: 0, y: 0 });
        break;
      }
    }
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const maxRadius = rect.width / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobPos({ x: dx, y: dy });
    onJoystickMove({ x: dx / maxRadius, y: dy / maxRadius });
  };

  return (
    <div className="md:hidden pointer-events-none fixed inset-0 z-40 select-none">
      {/* Left Virtual Joystick in Liquid Glass */}
      <div
        ref={joystickBaseRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="pointer-events-auto absolute bottom-6 left-6 w-32 h-32 rounded-full bg-slate-900/60 backdrop-blur-2xl border-2 border-white/30 flex items-center justify-center shadow-[0_16px_36px_-8px_rgba(0,0,0,0.4)] ring-1 ring-white/10"
      >
        <div
          style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-400 via-indigo-500 to-pink-500 border-2 border-white shadow-lg pointer-events-none"
        />
      </div>

      {/* Right Action Buttons in Liquid Glass */}
      <div className="pointer-events-auto absolute bottom-6 right-6 flex flex-col items-end gap-3">
        {/* Interact Prompt Button */}
        {hasInteractable && (
          <button
            type="button"
            onClick={onInteract}
            className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-500 border-2 border-white text-white font-['Fredoka'] font-black text-xs shadow-lg flex items-center justify-center animate-bounce cursor-pointer"
          >
            TALK [E]
          </button>
        )}

        <div className="flex items-center gap-2.5">
          {/* Sprint Toggle Button */}
          {onToggleSprint && (
            <button
              type="button"
              onClick={onToggleSprint}
              className={`w-13 h-13 rounded-2xl border-2 font-bold text-xs shadow-lg flex flex-col items-center justify-center active:scale-90 transition-transform cursor-pointer ${
                isSprinting
                  ? 'bg-amber-400 text-slate-950 border-white ring-2 ring-amber-400 animate-pulse'
                  : 'bg-slate-900/70 text-white border-white/30'
              }`}
            >
              <Zap size={20} />
              <span className="text-[8px] uppercase">Sprint</span>
            </button>
          )}

          {/* Jump / Bhop Button */}
          {onJump && (
            <button
              type="button"
              onClick={onJump}
              className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-400 to-blue-600 border-2 border-white text-white font-bold text-xs shadow-lg flex flex-col items-center justify-center active:scale-90 transition-transform cursor-pointer"
            >
              <Footprints size={22} />
              <span className="text-[8px] uppercase">Jump</span>
            </button>
          )}

          {/* Main Attack Button */}
          <button
            type="button"
            onClick={onAttack}
            className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500 via-pink-500 to-red-600 border-2 border-white text-white font-bold text-sm shadow-xl flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
          >
            <Sword size={28} />
          </button>
        </div>
      </div>
    </div>
  );
};
