import { NavLink, Route, Routes } from "react-router-dom";

import { DashboardPage } from "./pages/DashboardPage";
import { PrintersPage } from "./pages/PrintersPage";
import { SessionsPage } from "./pages/SessionsPage";

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
          <NavLink className={({ isActive }) => (isActive ? "active" : undefined)} to="/" end>
            Overview
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "active" : undefined)} to="/printers">
            Printers
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? "active" : undefined)} to="/sessions">
            Sessions
          </NavLink>
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/printers" element={<PrintersPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
        </Routes>
      </main>
    </div>
  );
}
