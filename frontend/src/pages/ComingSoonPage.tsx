import type { JSX } from 'react';

/**
 * ComingSoonPage — placeholder for modules that are not yet implemented.
 *
 * Modules are shipped one at a time. Resume is live; Interview, Job Search, and
 * Upskilling render this placeholder until their features are built.
 */

interface ComingSoonPageProps {
  title: string;
  description: string;
}

export function ComingSoonPage({ title, description }: ComingSoonPageProps): JSX.Element {
  return (
    <section
      aria-labelledby="coming-soon-heading"
      className="rounded-2xl bg-surface p-10 text-center shadow-panel"
    >
      <span className="inline-flex items-center rounded-full bg-accent-yellow px-3 py-1 text-xs font-semibold text-ink">
        Coming soon
      </span>
      <h2 id="coming-soon-heading" className="mt-4 text-xl font-semibold text-ink">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">{description}</p>
    </section>
  );
}
