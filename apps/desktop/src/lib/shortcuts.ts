import { useEffect, useRef } from 'react';

export type ShortcutDef = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** When true, runs even if focus is in input/textarea */
  allowInInput?: boolean;
  handler: (e: KeyboardEvent) => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useShortcuts(shortcuts: ShortcutDef[], enabled = true) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      for (const s of ref.current) {
        const keyMatch =
          e.key === s.key || e.key.toLowerCase() === s.key.toLowerCase();
        if (!keyMatch) continue;
        if (!!s.ctrl !== (e.ctrlKey || e.metaKey)) continue;
        if (!!s.shift !== e.shiftKey) continue;
        if (!!s.alt !== e.altKey) continue;
        if (!s.allowInInput && isTypingTarget(e.target)) continue;
        e.preventDefault();
        s.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export const CASH_SHORTCUT_HELP = [
  { keys: 'F2', desc: 'Aba Comprar Material' },
  { keys: 'F4', desc: 'Aba Gasto' },
  { keys: 'F6', desc: 'Aba Peguei emprestado' },
  {
    keys: '0–9 / A–Z',
    desc: 'Selecionar material pelo atalho cadastrado (fora dos campos)',
  },
  { keys: '↑ ↓', desc: 'Navegar nos itens da compra' },
  {
    keys: 'Enter',
    desc: 'Fora do campo: foca o valor do item · no valor: confirma e libera atalhos',
  },
  { keys: 'F7', desc: 'Ir para Pago total' },
  { keys: 'F10', desc: 'Abrir / ir para os itens da compra' },
  { keys: 'Del', desc: 'Excluir o item selecionado nos itens' },
  { keys: 'F5 / Ctrl+Enter', desc: 'Finalizar formulário' },
  { keys: 'F8', desc: 'Abrir fechamento do caixa' },
  { keys: 'F9', desc: 'Adicionar trocado ao caixa aberto' },
  { keys: 'F11', desc: 'Tela cheia (Esc sai)' },
  { keys: 'Ctrl+/', desc: 'Mostrar atalhos' },
  { keys: 'Esc', desc: 'Fechar ajuda / cancelar / sair da tela cheia' },
];
