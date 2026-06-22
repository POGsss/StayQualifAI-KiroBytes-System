import { Outlet } from 'react-router-dom';
import type { JSX } from 'react';

/**
 * InterviewPage — layout shell for the Interview module.
 *
 * The feature navigation (Simulator / Sessions / STAR) now lives in the global
 * top bar (see `App.tsx`), rendered per active module. This shell only hosts the
 * active sub-page through React Router's `<Outlet>`.
 *
 * Like the Resume shell, it no longer wraps the outlet in a single white panel —
 * each sub-page owns its own panel composition (the Simulator renders the
 * multi-card Bauhaus interview dashboard directly on the canvas).
 */
export function InterviewPage(): JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <Outlet />
    </section>
  );
}
