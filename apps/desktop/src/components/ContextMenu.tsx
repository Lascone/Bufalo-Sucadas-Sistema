import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type MenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
} | null;

export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null);

  const open = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const openAt = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    setMenu({ x, y, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, open, openAt, close, setMenu };
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const maxX = typeof window !== 'undefined' ? window.innerWidth - 200 : menu.x;
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 8 : menu.y;
  const left = Math.min(menu.x, maxX);
  const top = Math.min(menu.y, maxY);

  return createPortal(
    <div
      role="menu"
      className="fixed z-[9999] min-w-[11rem] rounded-lg border border-white/15 bg-ink-800 py-1 shadow-panel"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={`block w-full px-3 py-2 text-left text-sm disabled:opacity-40 ${
            item.danger
              ? 'text-red-300 hover:bg-red-950/50'
              : 'text-ink-50 hover:bg-white/10'
          }`}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function ContextMenuTarget({
  children,
  className = '',
  items,
}: {
  children: ReactNode;
  className?: string;
  items: ContextMenuItem[];
}) {
  const { menu, open, close } = useContextMenu();
  return (
    <>
      <div className={className} onContextMenu={(e) => open(e, items)}>
        {children}
      </div>
      <ContextMenu menu={menu} onClose={close} />
    </>
  );
}
