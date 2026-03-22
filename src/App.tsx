import "./App.css";

function App() {
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="hero-tag">Secretariat / Desktop</p>
        <h1>Blue Focus Timeboard</h1>
        <p className="hero-lead">
          Multi-project time management for creators who run several tracks at once.
        </p>
      </header>

      <section className="panel-grid">
        <article className="panel panel-primary">
          <h2>Now Working</h2>
          <p className="project-name">Game Project</p>
          <p className="time">00:00:00</p>
          <button className="btn-main" type="button">
            Start Session
          </button>
        </article>

        <article className="panel">
          <h2>This Week</h2>
          <ul className="metric-list">
            <li>
              <span>Music</span>
              <strong>5h / 10h (50%)</strong>
            </li>
            <li>
              <span>Learning</span>
              <strong>3h / 8h (37%)</strong>
            </li>
            <li>
              <span>Side Job A</span>
              <strong>6h / 6h (100%)</strong>
            </li>
          </ul>
        </article>

        <article className="panel panel-wide">
          <h2>Next Action Memo</h2>
          <p>
            Side Job A: Prepare draft for Monday client sync and summarize unresolved tasks.
          </p>
        </article>
      </section>
    </main>
  );
}

export default App;
