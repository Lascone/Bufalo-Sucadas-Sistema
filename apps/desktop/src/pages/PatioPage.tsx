import { PageHeader, PlaceholderCard } from '../components/Page';
import {
  getPatioBalances,
  listPatioMovements,
} from '../lib/patio';
import { getMaterial } from '../lib/materials';
import { MaterialThumb } from '../components/MaterialThumb';

function money(n: number) {
  return `R$ ${n.toFixed(2)}`;
}

export function PatioPage() {
  const balances = getPatioBalances();
  const recent = listPatioMovements(30);

  return (
    <div>
      <PageHeader
        title="Pátio"
        subtitle="Estoque acumulativo: entra por compra no caixa, sai por venda. Pode ficar dias ou meses. Lucro só na venda (custo médio)."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">Saldo por material</h2>
          {balances.length === 0 ? (
            <p className="mt-3 text-sm text-ink-300">
              Pátio vazio. Compre sucata no Caixa para entrar material.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {balances.map((b) => {
                const mat = getMaterial(b.materialId);
                return (
                  <li
                    key={b.materialId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <MaterialThumb material={mat} />
                      <div>
                        <div className="font-medium text-ink-50">{b.materialName}</div>
                        <div className="text-xs text-ink-300">
                          Custo médio {money(b.avgCost)}/kg
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-ink-50">{b.weight.toFixed(3)} kg</div>
                      <div className="text-xs text-ink-300">
                        {money(b.stockValue)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </PlaceholderCard>

        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">Movimentos recentes</h2>
          <ul className="mt-3 max-h-[28rem] space-y-1 overflow-auto text-sm">
            {recent.map((m) => (
              <li key={m.id} className="border-b border-white/10 py-1.5 text-ink-200">
                <span className={m.kind === 'IN' ? 'text-moss-400' : 'text-brand-400'}>
                  {m.kind === 'IN' ? 'ENTRADA' : 'SAÍDA'}
                </span>{' '}
                · {m.materialName} · {m.weight} kg · {money(m.unitCost)}/kg ·{' '}
                {new Date(m.at).toLocaleString('pt-BR')}
              </li>
            ))}
            {recent.length === 0 && (
              <li className="text-ink-300">Sem movimentação ainda.</li>
            )}
          </ul>
        </PlaceholderCard>
      </div>
    </div>
  );
}
