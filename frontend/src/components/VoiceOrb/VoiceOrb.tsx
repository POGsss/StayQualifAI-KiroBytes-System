/**
 * VoiceOrb — a halftone concentric-ring sphere visualizer for the Interview
 * voice mode. Purely decorative supplementary visual (Requirement 12).
 *
 * Rendering algorithm (Canvas 2D + inline 4-D simplex noise, no libraries):
 *  • 46 latitude rings; dot count per ring ∝ circumference (sin φ)
 *  • Ring stagger ri × 0.31 rad → interlocked halftone mesh, no vertical seams
 *  • Dual light source (top-left primary + right secondary) → diagonal crease
 *  • Depth-scaled dot size/alpha; depth-sorted back-to-front each frame
 *  • 4-D simplex noise displaces each dot radially → organic morphing
 *  • Idle amplitude is never zero → the orb always gently "breathes"
 *  • Speaking / listening ramp the morph amplitude + shimmer speed up
 *
 * Design constraints (Requirements 12.1, 12.2):
 *  - `aria-hidden="true"` — never exposed to assistive technology.
 *  - `pointer-events-none` — never intercepts clicks or keyboard events; it is
 *    not an interactive control and contains no focusable elements.
 *  - The whole render path is guarded: a missing 2D context, missing
 *    `requestAnimationFrame`, or any thrown error silently suppresses the orb
 *    (returns a static, harmless container) without affecting any answer-input
 *    control. The interview is always completable without it.
 *
 * Browser-native only — no new runtime dependency (Requirement 11.2).
 */

import { type JSX, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 4-D simplex noise (Gustavson, public domain, inlined — no npm package)
// ─────────────────────────────────────────────────────────────────────────────

const _perm = new Uint8Array(512);
const _g4 = [
  [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
  [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
  [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
  [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
  [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
  [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
  [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
  [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0],
];

(function buildPerm(): void {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 31337;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255]!;
})();

function d4(g: number[], x: number, y: number, z: number, w: number): number {
  return g[0]! * x + g[1]! * y + g[2]! * z + g[3]! * w;
}

function noise4(x: number, y: number, z: number, w: number): number {
  const F4 = (Math.sqrt(5) - 1) / 4;
  const G4 = (5 - Math.sqrt(5)) / 20;
  const s = (x + y + z + w) * F4;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const l = Math.floor(w + s);
  const tc = (i + j + k + l) * G4;
  const x0 = x - i + tc;
  const y0 = y - j + tc;
  const z0 = z - k + tc;
  const w0 = w - l + tc;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let rw = 0;
  if (x0 > y0) rx++; else ry++;
  if (x0 > z0) rx++; else rz++;
  if (x0 > w0) rx++; else rw++;
  if (y0 > z0) ry++; else rz++;
  if (y0 > w0) ry++; else rw++;
  if (z0 > w0) rz++; else rw++;
  const i1 = rx >= 3 ? 1 : 0;
  const j1 = ry >= 3 ? 1 : 0;
  const k1 = rz >= 3 ? 1 : 0;
  const l1 = rw >= 3 ? 1 : 0;
  const i2 = rx >= 2 ? 1 : 0;
  const j2 = ry >= 2 ? 1 : 0;
  const k2 = rz >= 2 ? 1 : 0;
  const l2 = rw >= 2 ? 1 : 0;
  const i3 = rx >= 1 ? 1 : 0;
  const j3 = ry >= 1 ? 1 : 0;
  const k3 = rz >= 1 ? 1 : 0;
  const l3 = rw >= 1 ? 1 : 0;
  const x1 = x0 - i1 + G4;
  const y1 = y0 - j1 + G4;
  const z1 = z0 - k1 + G4;
  const w1 = w0 - l1 + G4;
  const x2 = x0 - i2 + 2 * G4;
  const y2 = y0 - j2 + 2 * G4;
  const z2 = z0 - k2 + 2 * G4;
  const w2 = w0 - l2 + 2 * G4;
  const x3 = x0 - i3 + 3 * G4;
  const y3 = y0 - j3 + 3 * G4;
  const z3 = z0 - k3 + 3 * G4;
  const w3 = w0 - l3 + 3 * G4;
  const x4 = x0 - 1 + 4 * G4;
  const y4 = y0 - 1 + 4 * G4;
  const z4 = z0 - 1 + 4 * G4;
  const w4 = w0 - 1 + 4 * G4;
  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  const ll = l & 255;
  const gi0 = _perm[ii + _perm[jj + _perm[kk + _perm[ll]!]!]!]! % 32;
  const gi1 = _perm[ii + i1 + _perm[jj + j1 + _perm[kk + k1 + _perm[ll + l1]!]!]!]! % 32;
  const gi2 = _perm[ii + i2 + _perm[jj + j2 + _perm[kk + k2 + _perm[ll + l2]!]!]!]! % 32;
  const gi3 = _perm[ii + i3 + _perm[jj + j3 + _perm[kk + k3 + _perm[ll + l3]!]!]!]! % 32;
  const gi4 = _perm[ii + 1 + _perm[jj + 1 + _perm[kk + 1 + _perm[ll + 1]!]!]!]! % 32;
  let n = 0;
  let tN = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
  if (tN > 0) { tN *= tN; n += tN * tN * d4(_g4[gi0]!, x0, y0, z0, w0); }
  tN = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
  if (tN > 0) { tN *= tN; n += tN * tN * d4(_g4[gi1]!, x1, y1, z1, w1); }
  tN = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
  if (tN > 0) { tN *= tN; n += tN * tN * d4(_g4[gi2]!, x2, y2, z2, w2); }
  tN = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
  if (tN > 0) { tN *= tN; n += tN * tN * d4(_g4[gi3]!, x3, y3, z3, w3); }
  tN = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
  if (tN > 0) { tN *= tN; n += tN * tN * d4(_g4[gi4]!, x4, y4, z4, w4); }
  return 27 * n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function norm3(v: [number, number, number]): [number, number, number] {
  const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

const N_RINGS = 46;
const DOT_DENSITY = 7.4;
const STAGGER = 0.31;
const NOISE_SCALE = 1.8;
const SR_FRAC = 0.52;
const BASE_DOT = 4.2;

// Dual light source directions (unit vectors, z+ toward viewer)
const L1 = norm3([-0.45, 0.75, 0.55]); // primary: top-left → diagonal bright crease
const L2 = norm3([0.72, 0.12, 0.38]); // secondary: right → prevents total shadow

const AMBIENT = 0.13;
const L1_STR = 0.72;
const L2_STR = 0.26;

const IDLE_NOISE_AMP = 0.055; // orb always breathes
const ACTIVE_NOISE_AMP = 0.3; // max morph amplitude (speaking / listening)
const IDLE_SPEED = 0.006;
const ACTIVE_SPEED = 0.022;

const DEFAULT_DOT_COLOR = '#9b5de5'; // StayQualifAI brand purple

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface IVoiceOrbProps {
  /**
   * Generic "is the orb energised" flag (back-compat). When true the orb
   * morphs and pulses; when false it gently breathes. `isAISpeaking` /
   * `isUserSpeaking` take precedence when provided (Req 12.1, 12.2).
   */
  isActive: boolean;
  /** AI is reading the question aloud — drives the active animation. */
  isAISpeaking?: boolean;
  /** User is dictating an answer — drives the active animation. */
  isUserSpeaking?: boolean;
  /** An answer is being processed — drives a slow pulsing "thinking" motion. */
  isLoading?: boolean;
  /** Rendered CSS size (square) in px. Default 260. */
  size?: number;
  /** Lit dot colour. Default brand purple `#9b5de5`. */
  dotColor?: string;
  /**
   * Optional Web Audio `AnalyserNode`. When supplied the orb reacts to the
   * live FFT waveform; otherwise it uses a synthetic envelope driven by the
   * active state. Either way it never blocks input (Req 12.1).
   */
  analyserNode?: AnalyserNode | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audio-reactive (or state-reactive) decorative orb. Renders a transparent
 * canvas so the surrounding panel shows through. Always safe to mount: every
 * failure path degrades to a harmless, non-interactive container.
 */
export function VoiceOrb({
  isActive,
  isAISpeaking = false,
  isUserSpeaking = false,
  isLoading = false,
  size = 260,
  dotColor = DEFAULT_DOT_COLOR,
  analyserNode = null,
}: IVoiceOrbProps): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live-state refs so the rAF loop reads fresh values without re-subscribing.
  const activeRef = useRef(false);
  const loadingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fftBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  activeRef.current = Boolean(isActive) || isAISpeaking || isUserSpeaking;
  loadingRef.current = isLoading;
  analyserRef.current = analyserNode;

  useEffect(() => {
    fftBufRef.current = analyserNode
      ? new Uint8Array(analyserNode.frequencyBinCount)
      : null;
  }, [analyserNode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    if (typeof window === 'undefined') return;
    if (typeof window.requestAnimationFrame !== 'function') return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    // jsdom and locked-down environments return null — suppress silently.
    if (ctx === null) return;

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const dpr = window.devicePixelRatio || 1;
    const px = Math.max(1, Math.round(size * dpr));
    canvas.width = px;
    canvas.height = px;

    const half = px / 2;
    const cx = half;
    const cy = half;
    const SR = half * SR_FRAC;

    const [lr, lg, lb] = hexToRgb(dotColor);
    const shR = Math.round(lr * 0.1);
    const shG = Math.round(lg * 0.1);
    const shB = Math.round(lb * 0.1);

    let time = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothTreble = 0;
    let smoothAmp = IDLE_NOISE_AMP;
    let smoothSpd = IDLE_SPEED;
    let raf = 0;

    type Dot = { sx: number; sy: number; r: number; alpha: number; brightness: number; z: number };
    const dotList: Dot[] = [];

    const render = (): void => {
      raf = window.requestAnimationFrame(render);

      const active = activeRef.current;
      const loading = loadingRef.current;
      const an = analyserRef.current;

      let rawBass = 0;
      let rawMid = 0;
      let rawTreble = 0;

      if (an !== null && fftBufRef.current !== null) {
        // FFT-driven reactivity (when an AnalyserNode is wired in).
        an.getByteFrequencyData(fftBufRef.current);
        const buf = fftBufRef.current;
        let bS = 0;
        for (let kk = 2; kk <= 10; kk++) bS += buf[kk] ?? 0;
        rawBass = Math.min(1, (bS / (9 * 255)) * 5.0);
        let mS = 0;
        for (let kk = 11; kk <= 40; kk++) mS += buf[kk] ?? 0;
        rawMid = Math.min(1, (mS / (30 * 255)) * 4.5);
        let tS = 0;
        for (let kk = 41; kk <= 100; kk++) tS += buf[kk] ?? 0;
        rawTreble = Math.min(1, (tS / (60 * 255)) * 3.5);
      } else if (active && !reduceMotion) {
        // Synthetic lively envelope when no analyser is present.
        const tt = time;
        rawMid = Math.min(
          1,
          0.4 + 0.42 * Math.abs(0.6 * Math.sin(tt * 3.1) + 0.4 * Math.sin(tt * 7.3 + 1.7)),
        );
        rawBass = Math.min(1, 0.3 + 0.32 * Math.abs(Math.sin(tt * 1.7 + 0.5)));
        rawTreble = Math.min(1, 0.34 + 0.34 * Math.abs(Math.sin(tt * 5.2 + 2.1)));
      }

      // Attack fast, release slow.
      smoothBass += (rawBass - smoothBass) * (rawBass > smoothBass ? 0.3 : 0.06);
      smoothMid += (rawMid - smoothMid) * (rawMid > smoothMid ? 0.4 : 0.1);
      smoothTreble += (rawTreble - smoothTreble) * (rawTreble > smoothTreble ? 0.55 : 0.12);

      const targetAmp = loading
        ? IDLE_NOISE_AMP + 0.04 * Math.abs(Math.sin(time * 1.2))
        : IDLE_NOISE_AMP + smoothMid * (ACTIVE_NOISE_AMP - IDLE_NOISE_AMP);
      smoothAmp += (targetAmp - smoothAmp) * (targetAmp > smoothAmp ? 0.12 : 0.03);

      const targetSpd = reduceMotion
        ? IDLE_SPEED * 0.35
        : loading
          ? IDLE_SPEED * 0.8
          : IDLE_SPEED
            + smoothTreble * (ACTIVE_SPEED - IDLE_SPEED) * 0.55
            + smoothMid * (ACTIVE_SPEED - IDLE_SPEED) * 0.45;
      smoothSpd += (targetSpd - smoothSpd) * 0.07;
      time += smoothSpd;
      const t = time;

      const radiusScale = 1 + smoothBass * 0.1;

      ctx!.clearRect(0, 0, px, px);
      dotList.length = 0;

      for (let ri = 0; ri < N_RINGS; ri++) {
        const phi = ((ri + 0.5) / N_RINGS) * Math.PI;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const nDots = Math.max(1, Math.round(DOT_DENSITY * TAU * sinPhi));

        for (let di = 0; di < nDots; di++) {
          const theta = (di / nDots) * TAU + ri * STAGGER;
          const nx = sinPhi * Math.cos(theta);
          const ny = cosPhi;
          const nz = sinPhi * Math.sin(theta);

          const nv = noise4(nx * NOISE_SCALE + t, ny * NOISE_SCALE, nz * NOISE_SCALE, t * 0.4);
          const rDist = radiusScale * Math.max(0.88, 1 + smoothAmp * nv);

          const x3 = nx * SR * rDist;
          const y3 = ny * SR * rDist;
          const z3 = nz * SR * rDist;

          const sx = cx + x3;
          const sy = cy - y3;

          const d1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]);
          const d2 = Math.max(0, nx * L2[0] + ny * L2[1] + nz * L2[2]);
          const brightness = Math.min(1, AMBIENT + d1 * L1_STR + d2 * L2_STR);

          const depth = (nz + 1) / 2;
          const dotR = dpr * BASE_DOT * (0.15 + 0.85 * depth) * (0.55 + 0.45 * brightness);
          if (dotR < 0.35 * dpr) continue;

          const alpha = (0.18 + 0.82 * depth) * (0.28 + 0.72 * brightness);
          dotList.push({ sx, sy, r: dotR, alpha, brightness, z: z3 });
        }
      }

      dotList.sort((a, b) => a.z - b.z);

      for (const d of dotList) {
        const b = d.brightness;
        const cr = Math.round(shR + (lr - shR) * b);
        const cg = Math.round(shG + (lg - shG) * b);
        const cbl = Math.round(shB + (lb - shB) * b);
        ctx!.globalAlpha = Math.min(1, Math.max(0, d.alpha));
        ctx!.fillStyle = `rgb(${cr},${cg},${cbl})`;
        ctx!.beginPath();
        ctx!.arc(d.sx, d.sy, d.r, 0, TAU);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    };

    raf = window.requestAnimationFrame(render);
    return (): void => {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [size, dotColor]);

  try {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none flex select-none items-center justify-center"
        style={{ width: size, height: size }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size, display: 'block', background: 'transparent' }}
        />
      </div>
    );
  } catch {
    // Suppress any render failure — the orb is optional and decorative (Req 12.2).
    return null;
  }
}
