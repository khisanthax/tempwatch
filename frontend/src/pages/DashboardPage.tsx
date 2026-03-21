export function DashboardPage() {
  return (
    <section>
      <h2>Foundation status</h2>
      <p>
        TempWatch now supports printer profiles, manual recording sessions, Moonraker connection checks, and persisted
        temperature snapshot capture. The next step is turning those snapshots into richer live session workflows and
        comparison tooling.
      </p>
      <div className="panel-grid">
        <article className="panel">
          <h3>Current focus</h3>
          <p>Session UI, sample visibility, and the transition from manual snapshots to continuous collection.</p>
        </article>
        <article className="panel">
          <h3>Planned diagnostics</h3>
          <p>Heat-up analysis, cooling impact checks, heater power diagnostics, and PID guidance.</p>
        </article>
      </div>
    </section>
  );
}
