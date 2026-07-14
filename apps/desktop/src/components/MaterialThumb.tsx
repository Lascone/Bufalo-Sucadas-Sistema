import { useEffect, useState } from 'react';
import {
  materialVisualSync,
  resolveMaterialPhotoSrc,
  type MaterialRecord,
} from '../lib/materials';
import { cn } from '../lib/utils';

/** Circular photo or Lucide icon for materials. */
export function MaterialThumb({
  material,
  className,
  iconClassName,
}: {
  material?: Pick<MaterialRecord, 'id' | 'icon' | 'photoPath'> | null;
  className?: string;
  iconClassName?: string;
}) {
  const sync = materialVisualSync(material);
  const [src, setSrc] = useState<string | null>(
    sync.kind === 'img' ? sync.src : null,
  );

  useEffect(() => {
    let cancelled = false;
    const initial = materialVisualSync(material);
    if (initial.kind === 'img') {
      setSrc(initial.src);
      return;
    }
    setSrc(null);
    if (material?.photoPath) {
      void resolveMaterialPhotoSrc(material).then((url) => {
        if (!cancelled && url) setSrc(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [material?.id, material?.photoPath, material?.icon]);

  const Icon = sync.Icon;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(
          'h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/15',
          className,
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900/60 text-brand-400 ring-1 ring-white/10',
        className,
      )}
    >
      <Icon className={cn('h-4 w-4', iconClassName)} />
    </span>
  );
}
