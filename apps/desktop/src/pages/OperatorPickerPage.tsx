import { useEffect, useState } from 'react';
import { PrimaryButton } from '../components/Page';
import { listActivePartners } from '../lib/settings';
import { partnerInitials, resolvePartnerPhotoSrc } from '../lib/partner-photos';
import { useAppStore } from '../stores/app-store';

function PartnerAvatar({ name }: { name: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void resolvePartnerPhotoSrc(name).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [name]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-14 w-14 rounded-full border-2 border-brand-500/50 object-cover"
      />
    );
  }

  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-brand-500/50 bg-ink-800 text-lg font-bold text-brand-300">
      {partnerInitials(name)}
    </span>
  );
}

export function OperatorPickerPage() {
  const selectOperator = useAppStore((s) => s.selectOperator);
  const partners = listActivePartners();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-panel">
        <h1 className="font-display text-3xl text-brand-400">BÚFALO SUCATAS</h1>
        <p className="mt-2 text-sm text-ink-300">Quem está operando agora?</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {partners.map((name) => (
            <button
              key={name}
              type="button"
              className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-ink-950/60 px-4 py-5 transition hover:border-brand-500/50 hover:bg-ink-900"
              onClick={() => selectOperator(name)}
            >
              <PartnerAvatar name={name} />
              <span className="text-lg font-semibold text-ink-50">{name}</span>
            </button>
          ))}
        </div>

        {partners.length === 0 && (
          <p className="mt-4 text-sm text-brand-300">
            Nenhum recebedor configurado. Adicione em Configurações → Recebedores.
          </p>
        )}
      </div>
    </div>
  );
}
