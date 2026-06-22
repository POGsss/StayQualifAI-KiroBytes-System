import { Outlet } from 'react-router-dom';
import type { JSX } from 'react';

/**
 * ResumePage — layout shell for the Resume module.
 *
 * The feature navigation (Scanner / Builder / Versions) now lives in the global
 * top bar (see `App.tsx`), rendered per active module. This shell only hosts the
 * active sub-page through React Router's `<Outlet>`.
 *
 * The shell no longer wraps the outlet in a single white panel — each sub-page
 * owns its own panel composition. The Scanner renders a multi-panel Bauhaus
 * dashboard (KPI cards + preview + upload/AI review) directly on the canvas,
 * while Builder/Versions supply their own `surface` panel wrapper.
 */
export function ResumePage(): JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <Outlet />
    </section>
  );
}
