---
inclusion: fileMatch
fileMatchPattern: ['frontend/**/*.tsx', 'frontend/**/*.ts', 'frontend/**/*.css']
---

# Modern Web Standards

Apply these conventions when creating or modifying frontend code. Prefer native platform capabilities over third-party abstractions.

## CSS

- Use `@container` queries for component-level responsive layout; reserve `@media` for top-level page breakpoints only.
- Use `oklch()` color space for all programmatic color manipulation (lightness shifts, palette generation).
- Use CSS subgrid (`grid-template-columns: subgrid`) to align nested children to a parent grid track.
- Use native CSS nesting for scoped styles — do not add Sass/Less preprocessors.
- Use logical properties (`inline-size`, `margin-block`) over physical properties (`width`, `margin-top`) for layout that respects writing direction.

## Performance

- Target Interaction to Next Paint (INP) < 200 ms. Break long tasks with `scheduler.yield()` or `setTimeout(0)`.
- Defer non-critical work with `requestIdleCallback`; never block the main thread for analytics, telemetry, or lazy UI.
- Batch DOM reads before DOM writes to avoid layout thrashing.
- Lazy-load images and heavy components below the fold with `loading="lazy"` or React `lazy()`.

## Native APIs Over Libraries

- Use `<dialog>` element (with `.showModal()`) for modals — do not add third-party modal packages.
- Use the `popover` attribute for tooltips, dropdowns, and flyout menus — no JS positioning libraries.
- Use `<details>` / `<summary>` for disclosure and accordion patterns when no animation is required.
- Use the View Transitions API (`document.startViewTransition`) for page and state transitions where supported; fall back gracefully.
- Use the Clipboard API (`navigator.clipboard`) instead of deprecated `document.execCommand`.

## Accessibility

- All interactive elements must be keyboard-navigable and have visible focus indicators.
- Use semantic HTML (`<nav>`, `<main>`, `<section>`, `<article>`) before adding ARIA roles.
- Provide `aria-label` or `aria-labelledby` on icon-only buttons and non-text controls.
- Ensure color contrast meets WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text).
- Form inputs require associated `<label>` elements — never rely on placeholder text alone.

## React Patterns

- Keep components pure: derive state from props where possible, minimize `useEffect`.
- Wrap expensive computations in `useMemo`; wrap callback references in `useCallback` only when passed to memoized children.
- Prefer controlled components for form state unless performance demands uncontrolled refs.
- Co-locate component, hook, and test files; extract shared logic into `hooks/` only when reused across pages.
