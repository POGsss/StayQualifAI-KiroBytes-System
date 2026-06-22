import { Outlet } from 'react-router-dom';
import type { JSX } from 'react';

/**
 * InterviewPage — layout shell for the Interview module.
 *
 * The feature navigation (Simulator / Sessions / STAR) now lives in the global
 * top bar (see `App.tsx`), rendered per active module. This shell only hosts the
 * active sub-page through React Router's `<Outlet>`.
 */
export function InterviewPage(): JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl bg-surface p-6 shadow-panel">
        <Outlet />
      </div>
    </section>
  );
}
