import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type Project = {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  details?: string | null;
};

type Folder = {
  id: string;
  project_id: string;
  parent_folder_id?: string | null;
  name: string;
};

type Task = {
  id: string;
  folder_id: string;
  name: string;
  color: string;
  overview?: string | null;
  details?: string | null;
  related_links?: string | null;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

type LinkInput = {
  label: string;
  url: string;
};

const emptyLinks: LinkInput[] = Array.from({ length: 4 }, () => ({ label: "", url: "" }));

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#2f80cc");

  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState("");

  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskColor, setNewTaskColor] = useState("#2f80cc");
  const [newTaskOverview, setNewTaskOverview] = useState("");
  const [newTaskDetails, setNewTaskDetails] = useState("");
  const [newTaskLinks, setNewTaskLinks] = useState<LinkInput[]>(emptyLinks);
  const [timerTargetTask, setTimerTargetTask] = useState<Task | null>(null);
  const [timerMinutes, setTimerMinutes] = useState(25);

  const closeMenu = () => setMenuOpen(false);
  const appWindow = getCurrentWindow();

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const selectedFolderTasks = useMemo(
    () => tasks.filter((task) => task.folder_id === selectedFolderId),
    [tasks, selectedFolderId],
  );

  const hasNoTaskInFolder = selectedFolderId && selectedFolderTasks.length === 0;

  const formatLinks = (raw: string | null | undefined) => {
    if (!raw) {
      return [] as Array<{ display_name: string; url: string }>;
    }
    try {
      const parsed = JSON.parse(raw) as Array<{ display_name?: string; url?: string }>;
      return parsed
        .filter((item) => typeof item.url === "string" && item.url.trim().length > 0)
        .map((item) => ({
          display_name: item.display_name?.trim() || "リンク",
          url: item.url!.trim(),
        }));
    } catch {
      return [];
    }
  };

  const loadProjects = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await invoke<ApiResponse<Project[]>>("list_projects");
      if (!response.success) {
        setErrorMessage(response.message ?? "プロジェクト一覧の取得に失敗しました。");
        return;
      }
      const nextProjects = response.data ?? [];
      setProjects(nextProjects);
      if (!selectedProjectId && nextProjects.length > 0) {
        setSelectedProjectId(nextProjects[0].id);
      }
      if (selectedProjectId && !nextProjects.some((project) => project.id === selectedProjectId)) {
        setSelectedProjectId(nextProjects[0]?.id ?? "");
      }
    } catch {
      setErrorMessage("Tauri実行環境でアプリを起動するとデータを取得できます。");
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async (projectId: string) => {
    if (!projectId) {
      setFolders([]);
      return;
    }
    try {
      const response = await invoke<ApiResponse<Folder[]>>("list_folders_by_project", {
        projectId,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "フォルダ一覧の取得に失敗しました。");
        return;
      }
      const nextFolders = response.data ?? [];
      setFolders(nextFolders);
      if (!nextFolders.some((folder) => folder.id === selectedFolderId)) {
        setSelectedFolderId(nextFolders[0]?.id ?? "");
      }
    } catch {
      setErrorMessage("フォルダ一覧の取得に失敗しました。");
    }
  };

  const loadTasks = async (folderId: string) => {
    if (!folderId) {
      setTasks([]);
      return;
    }
    try {
      const response = await invoke<ApiResponse<Task[]>>("list_tasks_by_folder", {
        folderId,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "タスク一覧の取得に失敗しました。");
        return;
      }
      const nextTasks = response.data ?? [];
      setTasks(nextTasks);
      if (!nextTasks.some((task) => task.id === selectedTaskId)) {
        setSelectedTaskId(nextTasks[0]?.id ?? "");
      }
    } catch {
      setErrorMessage("タスク一覧の取得に失敗しました。");
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    void loadFolders(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    void loadTasks(selectedFolderId);
  }, [selectedFolderId]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      return;
    }
    try {
      const response = await invoke<ApiResponse<Project>>("create_project", {
        name: newProjectName.trim(),
        color: newProjectColor,
        description: null,
        details: null,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "プロジェクト作成に失敗しました。");
        return;
      }
      setNewProjectName("");
      await loadProjects();
    } catch {
      setErrorMessage("プロジェクト作成に失敗しました。");
    }
  };

  const handleCreateFolder = async () => {
    if (!selectedProjectId || !newFolderName.trim()) {
      return;
    }
    try {
      const response = await invoke<ApiResponse<Folder>>("create_folder", {
        projectId: selectedProjectId,
        name: newFolderName.trim(),
        parentFolderId: newFolderParentId || null,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "フォルダ作成に失敗しました。");
        return;
      }
      setNewFolderName("");
      setNewFolderParentId("");
      await loadFolders(selectedProjectId);
    } catch {
      setErrorMessage("フォルダ作成に失敗しました。");
    }
  };

  const handleCreateTask = async () => {
    if (!selectedFolderId || !newTaskName.trim()) {
      return;
    }

    const validLinks = newTaskLinks
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.url.length > 0)
      .slice(0, 4)
      .map((link) => ({
        type: link.url.startsWith("http") ? "URL" : "FilePath",
        url: link.url,
        display_name: link.label || link.url,
      }));

    const overview = newTaskOverview.trim();
    if (overview.length > 140) {
      setErrorMessage("概要は140文字以内で入力してください。");
      return;
    }

    try {
      const response = await invoke<ApiResponse<Task>>("create_task", {
        folderId: selectedFolderId,
        name: newTaskName.trim(),
        color: newTaskColor,
        overview: overview || null,
        details: newTaskDetails.trim() || null,
        relatedLinks: validLinks.length > 0 ? JSON.stringify(validLinks) : null,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "タスク作成に失敗しました。");
        return;
      }
      setNewTaskName("");
      setNewTaskColor("#2f80cc");
      setNewTaskOverview("");
      setNewTaskDetails("");
      setNewTaskLinks(emptyLinks);
      await loadTasks(selectedFolderId);
    } catch {
      setErrorMessage("タスク作成に失敗しました。");
    }
  };

  const handleLinkChange = (index: number, key: keyof LinkInput, value: string) => {
    setNewTaskLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

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
          <p className="hero-tag">Secretariat / Project Explorer</p>
          <h1>プロジェクト・フォルダ・タスク管理</h1>
          <p className="hero-lead">フォルダは空でも作成可能。空フォルダは「タスク0件」として扱います。</p>
        </header>

        {errorMessage && <p className="error-banner">{errorMessage}</p>}

        <section className="workbench-grid">
          <article className="panel explorer-panel">
            <h2>プロジェクト</h2>
            <div className="inline-form">
              <input
                placeholder="新規プロジェクト名"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
              />
              <input type="color" value={newProjectColor} onChange={(event) => setNewProjectColor(event.target.value)} />
              <button type="button" onClick={handleCreateProject}>
                追加
              </button>
            </div>
            <ul className="tree-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={project.id === selectedProjectId ? "row-btn is-active" : "row-btn"}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <span className="color-dot" style={{ backgroundColor: project.color }} />
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
            {!loading && projects.length === 0 && <p className="empty-note">まだプロジェクトがありません。</p>}
          </article>

          <article className="panel explorer-panel">
            <h2>フォルダ {selectedProject ? `(${selectedProject.name})` : ""}</h2>
            <div className="inline-form">
              <input
                placeholder="新規フォルダ名"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                disabled={!selectedProjectId}
              />
              <select
                value={newFolderParentId}
                onChange={(event) => setNewFolderParentId(event.target.value)}
                disabled={!selectedProjectId}
              >
                <option value="">ルート</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleCreateFolder} disabled={!selectedProjectId}>
                追加
              </button>
            </div>
            <ul className="tree-list">
              {folders.map((folder) => {
                const taskCount = tasks.filter((task) => task.folder_id === folder.id).length;
                return (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className={folder.id === selectedFolderId ? "row-btn is-active" : "row-btn"}
                      onClick={() => setSelectedFolderId(folder.id)}
                    >
                      <span>[F] {folder.name}</span>
                      <small>{taskCount}件</small>
                    </button>
                  </li>
                );
              })}
            </ul>
            {selectedProjectId && folders.length === 0 && <p className="empty-note">フォルダがありません。</p>}
          </article>

          <article className="panel task-panel">
            <h2>タスク {selectedFolder ? `(${selectedFolder.name})` : ""}</h2>
            <div className="task-form-grid">
              <input
                placeholder="タスク名"
                value={newTaskName}
                onChange={(event) => setNewTaskName(event.target.value)}
                disabled={!selectedFolderId}
              />
              <label className="color-input">
                色
                <input
                  type="color"
                  value={newTaskColor}
                  onChange={(event) => setNewTaskColor(event.target.value)}
                  disabled={!selectedFolderId}
                />
              </label>
              <textarea
                placeholder="概要（140文字以内）"
                maxLength={140}
                value={newTaskOverview}
                onChange={(event) => setNewTaskOverview(event.target.value)}
                disabled={!selectedFolderId}
              />
              <textarea
                placeholder="詳細（文字数制限なし）"
                value={newTaskDetails}
                onChange={(event) => setNewTaskDetails(event.target.value)}
                disabled={!selectedFolderId}
              />
              <div className="links-block">
                <p>関連リンク（最大4件）</p>
                {newTaskLinks.map((link, index) => (
                  <div className="link-row" key={`new-link-${index}`}>
                    <input
                      placeholder="表示名"
                      value={link.label}
                      onChange={(event) => handleLinkChange(index, "label", event.target.value)}
                      disabled={!selectedFolderId}
                    />
                    <input
                      placeholder="URL または パス"
                      value={link.url}
                      onChange={(event) => handleLinkChange(index, "url", event.target.value)}
                      disabled={!selectedFolderId}
                    />
                  </div>
                ))}
              </div>
              <button type="button" className="btn-main" onClick={handleCreateTask} disabled={!selectedFolderId}>
                タスク追加
              </button>
            </div>

            <ul className="tree-list task-list">
              {selectedFolderTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    className={task.id === selectedTaskId ? "row-btn is-active" : "row-btn"}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <span className="color-dot" style={{ backgroundColor: task.color }} />
                    {task.name}
                  </button>
                </li>
              ))}
            </ul>

            {hasNoTaskInFolder && <p className="empty-note">タスク0件</p>}

            {selectedTask && (
              <div className="task-detail">
                <h3>{selectedTask.name}</h3>
                <p><strong>プロジェクト名:</strong> {selectedProject?.name ?? "-"}</p>
                <p><strong>色:</strong> <span className="color-dot" style={{ backgroundColor: selectedTask.color }} /> {selectedTask.color}</p>
                <p><strong>概要:</strong> {selectedTask.overview || "-"}</p>
                <p><strong>詳細:</strong> {selectedTask.details || "-"}</p>
                <div>
                  <strong>関連リンク:</strong>
                  <ul className="link-list">
                    {formatLinks(selectedTask.related_links).map((link, index) => (
                      <li key={`${selectedTask.id}-link-${index}`}>
                        <a href={link.url} target="_blank" rel="noreferrer">
                          {link.display_name}
                        </a>
                      </li>
                    ))}
                    {formatLinks(selectedTask.related_links).length === 0 && <li>-</li>}
                  </ul>
                </div>
                <button type="button" className="btn-main" onClick={() => setTimerTargetTask(selectedTask)}>
                  タイマー開始
                </button>
              </div>
            )}
          </article>
        </section>

        {timerTargetTask && (
          <section className="timer-modal">
            <div className="timer-card">
              <h3>タイマー設定</h3>
              <p>対象タスク: {timerTargetTask.name}</p>
              <label>
                分数
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={timerMinutes}
                  onChange={(event) => setTimerMinutes(Number(event.target.value) || 25)}
                />
              </label>
              <div className="timer-actions">
                <button type="button" onClick={() => setTimerTargetTask(null)}>
                  閉じる
                </button>
                <button type="button" className="btn-main" onClick={() => setTimerTargetTask(null)}>
                  開始（次実装）
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
