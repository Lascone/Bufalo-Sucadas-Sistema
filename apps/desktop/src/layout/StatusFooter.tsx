import { useEffect, useState } from 'react';

import { Minus, Plus } from 'lucide-react';

import { useAppStore } from '../stores/app-store';

import { getOperator } from '../lib/operators';

import {

  UI_SCALE_MAX,

  UI_SCALE_MIN,

  UI_SCALE_STEP,

  formatUiScalePct,

  getAppliedScale,

  nudgeUiScale,

  setUiScaleMode,

  subscribeUiScale,

} from '../lib/ui-scale';

import { getSettings } from '../lib/settings';



export function StatusFooter() {

  const appInfo = useAppStore((s) => s.appInfo);

  const sync = useAppStore((s) => s.sync);
  const syncBusy = useAppStore((s) => s.syncBusy);
  const syncProgress = useAppStore((s) => s.syncProgress);
  const session = useAppStore((s) => s.session);
  const clearOperator = useAppStore((s) => s.clearOperator);

  const op = getOperator(session.operatorId);



  const [scale, setScale] = useState(() => getAppliedScale());

  const [mode, setMode] = useState(() => getSettings()['ui.scaleMode']);



  useEffect(() => {

    return subscribeUiScale((s, m) => {

      setScale(s);

      setMode(m);

    });

  }, []);



  const label =

    mode === 'auto'

      ? `Auto ${formatUiScalePct(scale)}`

      : formatUiScalePct(scale);



  return (

    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 bg-ink-950/90 px-4 py-2.5 text-xs text-ink-200 backdrop-blur">

      <span className="inline-flex items-center gap-2">

        {op && (

          <img

            src={op.avatar}

            alt=""

            className="h-5 w-5 rounded-full object-cover ring-1 ring-white/20"

          />

        )}

        UsuÃ¡rio: <strong className="text-ink-50">{session.username || 'â€”'}</strong>

        <button

          type="button"

          className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-ink-300 hover:border-brand-400/40 hover:text-ink-50"

          onClick={() => clearOperator()}

          title="Voltar Ã  tela de escolha de usuÃ¡rio"

        >

          Trocar

        </button>

      </span>

      <span>Filial: {session.branchName}</span>

      <span>Dispositivo: {session.deviceName}</span>

      <span

        className={

          sync.online ? 'text-moss-400' : sync.online === false ? 'text-brand-400' : ''

        }

      >

        {sync.online === null ? 'ConexÃ£o: â€”' : sync.online ? 'Online' : 'Offline'}

      </span>

      <span>Pendentes: {sync.pendingCount}</span>
      {syncBusy && (
        <span className="font-medium text-brand-400">
          {syncProgress?.label ?? 'Syncâ€¦'}
          {syncProgress && syncProgress.total > 0
            ? ` ${Math.round((syncProgress.done / Math.max(1, syncProgress.total)) * 100)}%`
            : ''}
        </span>
      )}

      <span
        className="inline-flex items-center gap-1 rounded border border-white/10 bg-ink-900/60 px-1 py-0.5"
        title="Escala da tela â€” menor em monitores pequenos para nÃ£o esconder botÃµes"
      >

        <button

          type="button"

          className="rounded p-0.5 text-ink-300 hover:bg-white/10 hover:text-ink-50 disabled:opacity-40"

          disabled={scale <= UI_SCALE_MIN + 0.001}

          onClick={() => void nudgeUiScale(-UI_SCALE_STEP)}

          aria-label="Diminuir escala"

        >

          <Minus className="h-3.5 w-3.5" />

        </button>

        <button

          type="button"

          className="min-w-[4.5rem] px-1 text-center font-medium text-ink-50 hover:text-brand-300"

          title={

            mode === 'auto'

              ? 'Clique para fixar escala manual'

              : 'Clique para voltar ao ajuste automÃ¡tico'

          }

          onClick={() =>

            void setUiScaleMode(mode === 'auto' ? 'manual' : 'auto')

          }

        >

          {label}

        </button>

        <button

          type="button"

          className="rounded p-0.5 text-ink-300 hover:bg-white/10 hover:text-ink-50 disabled:opacity-40"

          disabled={scale >= UI_SCALE_MAX - 0.001}

          onClick={() => void nudgeUiScale(UI_SCALE_STEP)}

          aria-label="Aumentar escala"

        >

          <Plus className="h-3.5 w-3.5" />

        </button>

      </span>



      <span className="ml-auto text-ink-300">v{appInfo?.version ?? '0.1.0'}</span>

    </footer>

  );

}


