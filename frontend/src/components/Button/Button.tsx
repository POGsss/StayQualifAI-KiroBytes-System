/**
 * Button — shared call-to-action button.
 *
 * Mirrors the landing page "Dashboard" / "Get Started" / "Learn More" buttons
 * (see `pages/Landing/LandingPage.tsx`): a `rounded-[10px]` shape, `text-xs`
 * medium weight, Bauhaus-ink fill (or outline), and the same focus ring. Use
 * this everywhere a primary/secondary action button is needed so the styling
 * stays consistent with the marketing surface.
 *
 * Variants:
 *   - `primary`  — solid Bauhaus-ink fill, white text (default).
 *   - `outline`  — 2px Bauhaus-ink border, ink text, inverts on hover.
 *   - `subtle`   — light neutral fill for low-emphasis actions.
 *
 * Named exports only. No `any`.
 */

import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'outline' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface IButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis of the button. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Padding scale. `sm` for dense tables/lists, `md` for header CTA, `lg` for hero CTAs. */
  size?: ButtonSize;
  /** Stretch the button to fill its container's inline size. */
  fullWidth?: boolean;
  children: ReactNode;
}

/** Shared shape, type ramp, focus ring, and disabled treatment. */
const BASE_CLASS =
  'inline-flex items-center justify-center rounded-[10px] text-sm font-medium ' +
  'transition-colors focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-bauhaus-blue/50 focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Uniform button heights across the app: `md` (the default) matches the shared
 * form-field height (`h-11`, 44px) so buttons and inputs line up in toolbars;
 * `lg` is reserved for the marketing hero CTAs.
 */
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-11 px-5',
  lg: 'h-14 px-10',
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-bauhaus-ink text-white hover:bg-bauhaus-ink/90',
  outline:
    'border-2 border-bauhaus-ink text-bauhaus-ink hover:bg-bauhaus-ink hover:text-white',
  subtle: 'bg-canvas text-ink hover:bg-gray-200',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  className = '',
  children,
  ...rest
}: IButtonProps): JSX.Element {
  const classes = [
    BASE_CLASS,
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter((part) => part.length > 0)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
