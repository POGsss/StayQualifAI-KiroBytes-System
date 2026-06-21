import 'react';

/**
 * Minimal JSX typing for the native HTML Popover API.
 *
 * `@types/react` 18.3.x does not declare the lowercase `popover` attribute, so
 * applying it to the native popover panel (used by `ProfileControl`) under
 * TypeScript strict mode requires this augmentation. The camelCase
 * `popoverTarget` / `popoverTargetAction` props are intentionally NOT declared:
 * React 18 does not recognize them and drops them from the DOM, so the popover
 * is toggled imperatively via `HTMLElement.togglePopover()` instead.
 *
 * The `togglePopover` / `showPopover` / `hidePopover` methods and the
 * `ToggleEvent` type are provided by TypeScript's bundled `lib.dom.d.ts`
 * (TS ≥ 5.2), so no additional `HTMLElement` augmentation is needed.
 *
 * No `any` is introduced — the attribute is precisely typed.
 */
declare module 'react' {
  interface HTMLAttributes<T> {
    /** Designates an element as a popover (`"auto"` or `"manual"`). */
    popover?: 'auto' | 'manual' | '' | undefined;
  }
}
