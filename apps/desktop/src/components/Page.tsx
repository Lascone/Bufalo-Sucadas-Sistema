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
        <h1 className="font-display text-4xl tracking-wide text-ink-50 drop-shadow-sm">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-base text-ink-200">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}

export function PlaceholderCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-ink-800/90 p-5 text-ink-50 shadow-panel backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-lg border border-white/15 bg-ink-900/60 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-400/50 hover:bg-ink-700 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm text-ink-200">
      <span className="mb-1 block font-medium text-ink-100">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  'mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2.5 text-ink-50 placeholder:text-ink-300 focus:border-brand-400';
