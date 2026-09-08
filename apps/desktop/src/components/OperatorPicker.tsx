import { useState } from 'react';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (op: Operator) => {
    // Bloqueia cliques repetidos "sem parar" para não disparar chamadas concorrentes
    if (selectedId) return;
    setSelectedId(op.id);
    onSelect(op);
  };

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
        {ops.map((op) => {
          const isThisSelected = selectedId === op.id;
          const isOtherSelected = selectedId !== null && !isThisSelected;
          return (
            <button
              key={op.id}
              type="button"
              disabled={selectedId !== null}
              onClick={() => handleSelect(op)}
              className={cn(
                'group flex flex-col items-center gap-3 rounded-2xl border p-5 transition',
                compact ? 'w-36 p-3' : 'w-44',
                isThisSelected
                  ? 'border-brand-400 bg-brand-500/20 ring-2 ring-brand-400 shadow-[0_0_20px_rgba(245,124,0,0.5)] scale-105'
                  : isOtherSelected
                    ? 'border-white/5 bg-ink-950/40 opacity-35 cursor-not-allowed'
                    : 'border-white/10 bg-ink-900/70 hover:border-brand-400/50 hover:bg-ink-800/90 hover:shadow-panel active:scale-95',
              )}
            >
              <img
                src={op.avatar}
                alt={op.name}
                className={cn(
                  'rounded-full object-cover ring-2 transition',
                  compact ? 'h-20 w-20' : 'h-28 w-28',
                  isThisSelected
                    ? 'ring-brand-400'
                    : 'ring-white/15 group-hover:ring-brand-400/60',
                )}
              />
              <span
                className={cn(
                  'font-semibold text-ink-50',
                  compact ? 'text-base' : 'text-lg',
                )}
              >
                {op.name}
                {isThisSelected && (
                  <span className="block text-xs font-normal text-brand-300 animate-pulse">
                    Entrando…
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
