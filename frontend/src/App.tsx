import { Link, Route, Routes } from "react-router-dom";

import { DashboardPage } from "./pages/DashboardPage";
import { PrintersPage } from "./pages/PrintersPage";

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local printer diagnostics</p>
          <h1>TempWatch</h1>
          <p className="lede">
            Manual thermal recording, saved sessions, and focused troubleshooting for Moonraker/Klipper printers.
          </p>
        </div>

        <nav>
          <Link to="/">Overview</Link>
          <Link to="/printers">Printers</Link>
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/printers" element={<PrintersPage />} />
        </Routes>
      </main>
    </div>
  );
}
