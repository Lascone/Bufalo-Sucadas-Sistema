import { listOperators, type Operator } from '../lib/operators';
import { cn } from '../lib/utils';

type Props = {
  onSelect: (op: Operator) => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

/** Windows-style user picker (no password). */
export function OperatorPicker({
  onSelect,
  title = 'Quem está usando?',
  subtitle = 'Clique no seu perfil para entrar — sem senha.',
  compact = false,
}: Props) {
  const ops = listOperators();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        compact ? 'p-4' : 'h-full min-h-0 overflow-auto px-6 py-12',
      )}
      style={
        compact
          ? undefined
          : {
              background:
                'radial-gradient(ellipse at 30% 20%, #1a3d2a 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, #2a2010 0%, transparent 45%), #0b0b0b',
            }
      }
    >
      {!compact && (
        <img
          src="./logo.png"
          alt="Búfalo Sucatas"
          className="mb-8 max-h-28 w-auto object-contain drop-shadow-xl"
        />
      )}
      <h1
        className={cn(
          'font-display tracking-wide text-brand-400',
          compact ? 'text-2xl' : 'text-5xl',
        )}
      >
        {title}
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-ink-300">{subtitle}</p>

      <div
        className={cn(
          'mt-8 flex flex-wrap justify-center gap-6',
          compact && 'mt-4 gap-4',
        )}
      >
        {ops.map((op) => (
          <button
            key={op.id}
            type="button"
            onClick={() => onSelect(op)}
            className={cn(
              'group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/70 p-5 transition hover:border-brand-400/50 hover:bg-ink-800/90 hover:shadow-panel',
              compact ? 'w-36 p-3' : 'w-44',
            )}
          >
            <img
              src={op.avatar}
              alt={op.name}
              className={cn(
                'rounded-full object-cover ring-2 ring-white/15 transition group-hover:ring-brand-400/60',
                compact ? 'h-20 w-20' : 'h-28 w-28',
              )}
            />
            <span
              className={cn(
                'font-semibold text-ink-50',
                compact ? 'text-base' : 'text-lg',
              )}
            >
              {op.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
