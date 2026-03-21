export function DashboardPage() {
  return (
    <section>
      <h2>Foundation status</h2>
      <p>
        The initial TempWatch shell is in place. Next steps are printer profile management, session lifecycle controls,
        and Moonraker-backed live data collection.
      </p>
      <div className="panel-grid">
        <article className="panel">
          <h3>Current focus</h3>
          <p>Backend configuration, SQLite bootstrap, and printer/session domain modeling.</p>
        </article>
        <article className="panel">
          <h3>Planned diagnostics</h3>
          <p>Heat-up analysis, cooling impact checks, heater power diagnostics, and PID guidance.</p>
        </article>
      </div>
    </section>
  );
}
