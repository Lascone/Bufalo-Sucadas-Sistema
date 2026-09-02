import { OperatorPicker } from '../components/OperatorPicker';
import { useAppStore } from '../stores/app-store';
import type { Operator } from '../lib/operators';

export function LoginScreen() {
  const setOperator = useAppStore((s) => s.setOperator);

  const onSelect = (op: Operator) => {
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
