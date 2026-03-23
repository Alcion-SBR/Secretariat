import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const appWindow = getCurrentWindow();

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch {
      // Browser preview does not provide native window controls.
    }
  };

  const handleMaximizeToggle = async () => {
    try {
      const maximized = await appWindow.isMaximized();
      if (maximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch {
      // Browser preview does not provide native window controls.
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch {
      // Browser preview does not provide native window controls.
    }
  };

  return (
    <main className="app-shell">
      <div className="custom-titlebar" data-tauri-drag-region>
        <div className="titlebar-title" data-tauri-drag-region>
          Secretariat
        </div>
        <div className="titlebar-controls">
          <button type="button" className="titlebar-btn" aria-label="最小化" onClick={handleMinimize}>
            -
          </button>
          <button
            type="button"
            className="titlebar-btn"
            aria-label="最大化または元に戻す"
            onClick={handleMaximizeToggle}
          >
            □
          </button>
          <button type="button" className="titlebar-btn titlebar-btn-close" aria-label="閉じる" onClick={handleClose}>
            ×
          </button>
        </div>
      </div>

      <button
        className="menu-toggle"
        type="button"
        aria-label="メニューを開く"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <span />
        <span />
        <span />
      </button>

      <aside className={`side-menu ${menuOpen ? "is-open" : ""}`} aria-label="メインメニュー">
        <div className="side-menu-head">
          <p className="side-menu-title">Secretariat</p>
          <button className="menu-close" type="button" onClick={closeMenu} aria-label="メニューを閉じる">
            ×
          </button>
        </div>
        <nav>
          <ul className="menu-list">
            <li>
              <button type="button" onClick={closeMenu}>
                ダッシュボード
              </button>
            </li>
            <li>
              <button type="button" onClick={closeMenu}>
                名義管理
              </button>
            </li>
            <li>
              <button type="button" onClick={closeMenu}>
                作業記録
              </button>
            </li>
            <li>
              <button type="button" onClick={closeMenu}>
                日誌一覧
              </button>
            </li>
            <li>
              <button type="button" onClick={closeMenu}>
                設定
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <button
        type="button"
        className={`menu-overlay ${menuOpen ? "is-open" : ""}`}
        aria-label="メニューを閉じる"
        onClick={closeMenu}
      />

      <div className="content-area">
        <header className="hero">
          <p className="hero-tag">Secretariat / デスクトップ版</p>
          <h1>複数プロジェクト時間管理ボード</h1>
          <p className="hero-lead">
            複数の名義を横断して、週次目標と実績時間を見える化します。
          </p>
        </header>

        <section className="panel-grid">
          <article className="panel panel-primary">
            <h2>現在の作業</h2>
            <p className="project-name">ゲーム制作</p>
            <p className="time">00:00:00</p>
            <button className="btn-main" type="button">
              計測を開始
            </button>
          </article>

          <article className="panel">
            <h2>今週の進捗</h2>
            <ul className="metric-list">
              <li>
                <span>音楽活動</span>
                <strong>5h / 10h (50%)</strong>
              </li>
              <li>
                <span>学習</span>
                <strong>3h / 8h (37%)</strong>
              </li>
              <li>
                <span>副業A</span>
                <strong>6h / 6h (100%)</strong>
              </li>
            </ul>
          </article>

          <article className="panel panel-wide">
            <h2>次回やることメモ</h2>
            <p>
              副業A: 月曜のクライアント定例に向けてドラフトを作成し、未解決タスクを整理する。
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}

export default App;
