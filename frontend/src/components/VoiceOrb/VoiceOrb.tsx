import type { JSX } from 'react';

export interface IVoiceOrbProps {
  /** Whether the orb should animate as active/recording (Req 12.1, 12.2). */
  isActive: boolean;
}

/**
 * Purely decorative audio-reactive visualizer overlay.
 *
 * Design constraints (Requirements 12.1, 12.2):
 * - `aria-hidden="true"` — never exposes itself to assistive technology.
 * - `pointer-events-none` — never intercepts clicks or keyboard events.
 * - The entire render is wrapped in a try/catch so any init or render failure
 *   silently suppresses the orb (returns null) without affecting any
 *   answer-input control.
 */
export function VoiceOrb({ isActive }: IVoiceOrbProps): JSX.Element | null {
  try {
    return (
      <div
        aria-hidden="true"
        className={[
          'pointer-events-none',
          'absolute inset-0 flex items-center justify-center',
          'transition-opacity duration-300',
          isActive ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        {/* Outer glow ring */}
        <div
          className={[
            'absolute h-32 w-32 rounded-full',
            'bg-[#9b5de5]/10',
            isActive ? 'animate-ping' : '',
          ].join(' ')}
        />

        {/* Inner pulsing orb */}
        <div
          className={[
            'h-24 w-24 rounded-full',
            'bg-[#9b5de5]/20',
            isActive ? 'animate-pulse' : '',
          ].join(' ')}
        />
      </div>
    );
  } catch {
    // Suppress any render/init failure — the orb is optional and decorative.
    // Answer-input controls are never affected (Req 12.2).
    return null;
  }
}
