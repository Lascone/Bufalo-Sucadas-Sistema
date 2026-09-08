import { useState } from 'react';
import { OperatorPicker } from '../components/OperatorPicker';
import { useAppStore } from '../stores/app-store';
import type { Operator } from '../lib/operators';

export function LoginScreen() {
  const setOperator = useAppStore((s) => s.setOperator);
  const [chosen, setChosen] = useState(false);

  const onSelect = (op: Operator) => {
    if (chosen) return;
    setChosen(true);
    setOperator(op.id);
  };

  return (
    <div className="h-full">
      <OperatorPicker
        onSelect={onSelect}
        title="Búfalo Sucata Gestor"
        subtitle="Escolha quem está no caixa agora. Sem senha — só clicar."
      />
    </div>
  );
}
