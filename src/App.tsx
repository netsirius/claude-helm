import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import VpsManager from "./pages/VpsManager";
import Agents from "./pages/Agents";
import LiveMonitor from "./pages/LiveMonitor";
import Extensions from "./pages/Extensions";
import Pipelines from "./pages/Pipelines";
import ActivityLog from "./pages/ActivityLog";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vps" element={<VpsManager />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/monitor" element={<LiveMonitor />} />
          <Route path="/extensions" element={<Extensions />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
