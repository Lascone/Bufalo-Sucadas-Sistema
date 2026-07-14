import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-brand-900 dark:text-brand-50">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-steel-700 dark:text-steel-100/80">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}

export function PlaceholderCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-steel-400/30 bg-white/80 p-5 shadow-sm dark:bg-steel-900/60">
      {children}
    </div>
  );
}
