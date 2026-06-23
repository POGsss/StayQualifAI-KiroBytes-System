import type { JSX } from 'react';

/**
 * Bauhaus visual primitives for the redesigned StayQualifAI marketing surface.
 *
 * Imagery is loaded from `public/assets/` (see public/assets/README.md) so the
 * brand logo and decorative shapes can be swapped by simply replacing the files
 * — no code change required. Paths resolve at the site root because Vite serves
 * `public/` verbatim. Decorative shapes use empty `alt` text so assistive tech
 * skips them. Named exports only.
 */

/** Public asset paths — swap the files to restyle without touching code. */
export const ASSETS = {
  logo: '/assets/logo.svg',
  heroShapeOne: '/assets/hero-shape-1.svg',
  heroShapeTwo: '/assets/hero-shape-2.svg',
  loginShape: '/assets/login-shape.svg',
} as const;

/** Brand logo image (custom asset). Decorative when paired with the wordmark. */
export function BrandLogo({ className }: { className?: string }): JSX.Element {
  return (
    <img
      src={ASSETS.logo}
      alt=""
      className={`h-9 w-auto object-contain ${className ?? ''}`}
    />
  );
}

/** "StayQualifAI" wordmark with the brand colour split (Stay/Qualif/AI). */
export function BauhausWordmark({
  className,
}: {
  className?: string;
}): JSX.Element {
  return (
    <span
      className={`whitespace-nowrap text-xl font-extrabold tracking-tight ${className ?? ''}`}
    >
      <span className="text-bauhaus-blue">Stay</span>
      <span className="text-bauhaus-red">Qualif</span>
      <span className="text-bauhaus-ink">AI</span>
    </span>
  );
}

/** Logo image + wordmark lockup used in the header and login dialog. */
export function BauhausBrand({
  className,
  wordmarkClassName,
}: {
  className?: string;
  /** Extra classes for the wordmark (e.g. to hide it on small screens). */
  wordmarkClassName?: string;
}): JSX.Element {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <BrandLogo />
      <BauhausWordmark className={wordmarkClassName ?? ''} />
    </div>
  );
}

/** Decorative image — hero, left cluster (Figma "Shape 1"). */
export function BauhausShapeOne({
  className,
}: {
  className?: string;
}): JSX.Element {
  return (
    <img
      src={ASSETS.heroShapeOne}
      alt=""
      className={`w-full max-w-[520px] object-contain ${className ?? ''}`}
    />
  );
}

/** Decorative image — hero, right cluster (Figma "Shape 2"). */
export function BauhausShapeTwo({
  className,
}: {
  className?: string;
}): JSX.Element {
  return (
    <img
      src={ASSETS.heroShapeTwo}
      alt=""
      className={`w-full max-w-[520px] object-contain ${className ?? ''}`}
    />
  );
}

/** Decorative image — login dialog right panel (Figma "Shape 3"). */
export function BauhausShapeThree({
  className,
}: {
  className?: string;
}): JSX.Element {
  return (
    <img
      src={ASSETS.loginShape}
      alt=""
      className={`h-[420px] w-[280px] object-contain ${className ?? ''}`}
    />
  );
}

/** Multicolour Google "G" mark (inline SVG — no external/expiring asset). */
export function GoogleIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className={`h-3.5 w-3.5 ${className ?? ''}`}
    >
      <path
        fill="#ffc107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#ff3d00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4caf50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976d2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
