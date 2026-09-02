import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { SellPage } from './pages/SellPage';
import { CashOpsPage } from './pages/CashOpsPage';
import { PatioPage } from './pages/PatioPage';
import { FinancePage } from './pages/FinancePage';
import { SyncCenterPage } from './pages/SyncCenterPage';
import { ConflictsPage } from './pages/ConflictsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="contatos" element={<ContactsPage />} />
        <Route path="materiais" element={<MaterialsPage />} />
        <Route path="caixa" element={<CashOpsPage />} />
        <Route path="compras" element={<Navigate to="/caixa" replace />} />
        <Route path="receber" element={<Navigate to="/caixa" replace />} />
        <Route path="vendas" element={<SellPage />} />
        <Route path="vender" element={<Navigate to="/vendas" replace />} />
        <Route path="patio" element={<PatioPage />} />
        <Route path="estoque" element={<Navigate to="/patio" replace />} />
        <Route path="financeiro" element={<FinancePage />} />
        <Route path="sincronizacao" element={<SyncCenterPage />} />
        <Route path="conflitos" element={<ConflictsPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
