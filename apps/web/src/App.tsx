import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ScanPage } from './pages/ScanPage';
import { ResultPage } from './pages/ResultPage';
import { MonitorPage } from './pages/MonitorPage';
import { SettingsPage } from './pages/SettingsPage';
import { HistoryPage } from './pages/HistoryPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { ComparePage } from './pages/ComparePage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ScanPage />} />
        <Route path="/scan/:address" element={<ResultPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
