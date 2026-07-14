import {
  type ReportFilterState,
  monthStartIsoDate,
  todayIsoDate,
} from '../lib/reports';
import { GhostButton, fieldClass } from './Page';

export function ReportFilters({
  filter,
  onChange,
  availableDays,
}: {
  filter: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  availableDays: string[];
}) {
  const set = (patch: Partial<ReportFilterState>) =>
    onChange({ ...filter, ...patch });

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-ink-900/30 p-2.5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={`rounded px-2.5 py-1 text-xs font-medium ${
            filter.mode === 'range'
              ? 'bg-brand-500 text-ink-950'
              : 'border border-white/15 text-ink-300'
          }`}
          onClick={() => set({ mode: 'range' })}
        >
          Período
        </button>
        <button
          type="button"
          className={`rounded px-2.5 py-1 text-xs font-medium ${
            filter.mode === 'days'
              ? 'bg-brand-500 text-ink-950'
              : 'border border-white/15 text-ink-300'
          }`}
          onClick={() => set({ mode: 'days' })}
        >
          Dias marcados
        </button>
        <GhostButton
          className="!py-1 text-xs"
          onClick={() => {
            const t = todayIsoDate();
            onChange({ mode: 'range', from: t, to: t, selectedDays: [] });
          }}
        >
          Hoje
        </GhostButton>
        <GhostButton
          className="!py-1 text-xs"
          onClick={() => {
            onChange({
              mode: 'range',
              from: monthStartIsoDate(),
              to: todayIsoDate(),
              selectedDays: [],
            });
          }}
        >
          Este mês
        </GhostButton>
        <GhostButton
          className="!py-1 text-xs"
          onClick={() =>
            onChange({
              mode: 'range',
              from: '',
              to: '',
              selectedDays: [],
            })
          }
        >
          Limpar
        </GhostButton>
      </div>

      {filter.mode === 'range' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-300">
            De
            <input
              type="date"
              className={`${fieldClass} !mt-0.5 !py-1`}
              value={filter.from}
              onChange={(e) => set({ from: e.target.value })}
            />
          </label>
          <label className="text-xs text-ink-300">
            Até
            <input
              type="date"
              className={`${fieldClass} !mt-0.5 !py-1`}
              value={filter.to}
              onChange={(e) => set({ to: e.target.value })}
            />
          </label>
        </div>
      ) : (
        <div className="max-h-28 overflow-auto">
          {availableDays.length === 0 ? (
            <p className="text-xs text-ink-400">Sem dias com lançamentos.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availableDays.map((d) => {
                const on = filter.selectedDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const next = on
                        ? filter.selectedDays.filter((x) => x !== d)
                        : [...filter.selectedDays, d];
                      set({ selectedDays: next });
                    }}
                    className={`rounded border px-2 py-1 text-xs ${
                      on
                        ? 'border-brand-500 bg-brand-500/20 text-brand-300'
                        : 'border-white/10 text-ink-300'
                    }`}
                  >
                    {d.split('-').reverse().join('/')}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
