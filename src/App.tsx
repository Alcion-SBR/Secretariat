import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type ViewMode = "projects" | "calendar" | "weekly";

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

type WeeklyGoal = {
  id: string;
  project_id?: string | null;
  task_id?: string | null;
  week_start: number;
  target_hours: number;
  actual_hours: number;
};

type CalendarEvent = {
  id: string;
  task_id?: string | null;
  title: string;
  date: number;
  start_minute: number;
  end_minute: number;
  note?: string | null;
};

type TimerSession = {
  id: string;
  task_id: string;
  start_time: number;
  end_time?: number | null;
  duration?: number | null;
  date: number;
  created_at: number;
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

const pad2 = (n: number) => String(n).padStart(2, "0");

const dateToYmdNumber = (date: Date) =>
  Number(`${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`);

const minuteToLabel = (minute: number) => {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${pad2(h)}:${pad2(m)}`;
};

const labelToMinute = (label: string) => {
  const [h, m] = label.split(":").map((s) => Number(s));
  return h * 60 + m;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const secToLabel = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
};

const getMonday = (base: Date) => {
  const d = new Date(base);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>("projects");

  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#2f80cc");

  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState("");
  const [projectCreateKind, setProjectCreateKind] = useState<"folder" | "task">("folder");
  const [projectTaskFolderId, setProjectTaskFolderId] = useState("");

  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskColor, setNewTaskColor] = useState("#2f80cc");
  const [newTaskOverview, setNewTaskOverview] = useState("");
  const [newTaskDetails, setNewTaskDetails] = useState("");
  const [newTaskLinks, setNewTaskLinks] = useState<LinkInput[]>(emptyLinks);

  const [timerTargetTask, setTimerTargetTask] = useState<Task | null>(null);
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timerIsRunning, setTimerIsRunning] = useState(false);
  const [timerInitialSeconds, setTimerInitialSeconds] = useState(25 * 60);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(25 * 60);
  const [timerDeadlineMs, setTimerDeadlineMs] = useState<number | null>(null);
  const [activeTimerSessionId, setActiveTimerSessionId] = useState<string>("");
  const timerCompletingRef = useRef(false);

  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectColor, setEditProjectColor] = useState("#2f80cc");
  const [editProjectDescription, setEditProjectDescription] = useState("");
  const [editProjectDetails, setEditProjectDetails] = useState("");

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventStart, setNewEventStart] = useState("09:00");
  const [newEventEnd, setNewEventEnd] = useState("10:00");
  const [newEventTaskId, setNewEventTaskId] = useState("");
  const [newEventNote, setNewEventNote] = useState("");
  const [showCalendarCreateForm, setShowCalendarCreateForm] = useState(false);
  const [calendarPopoverPosition, setCalendarPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const [calendarPopoverDrag, setCalendarPopoverDrag] = useState<{ offsetX: number; offsetY: number } | null>(null);

  const [weeklyBaseDate, setWeeklyBaseDate] = useState(getMonday(new Date()));
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[]>([]);
  const [weeklyGoalType, setWeeklyGoalType] = useState<"project" | "task">("project");
  const [weeklyProjectId, setWeeklyProjectId] = useState("");
  const [weeklyTaskId, setWeeklyTaskId] = useState("");
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(5);

  const closeMenu = () => setMenuOpen(false);
  const appWindow = getCurrentWindow();
  const calendarPanelRef = useRef<HTMLElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const selectedTask = useMemo(
    () => projectTasks.find((task) => task.id === selectedTaskId) ?? tasks.find((task) => task.id === selectedTaskId) ?? null,
    [projectTasks, tasks, selectedTaskId],
  );

  const selectedFolderTasks = useMemo(
    () => projectTasks.filter((task) => task.folder_id === selectedFolderId),
    [projectTasks, selectedFolderId],
  );

  const hasNoTaskInFolder = selectedFolderId && selectedFolderTasks.length === 0;
  const rootFolders = useMemo(
    () => folders.filter((folder) => !folder.parent_folder_id),
    [folders],
  );

  const monthLabel = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;

  const weekStartYmd = useMemo(() => dateToYmdNumber(getMonday(weeklyBaseDate)), [weeklyBaseDate]);
  const weekDays = useMemo(() => {
    const start = getMonday(weeklyBaseDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [weeklyBaseDate]);

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
      const nextSelectedProjectId = selectedProjectId && nextProjects.some((project) => project.id === selectedProjectId)
        ? selectedProjectId
        : nextProjects[0]?.id ?? "";
      setSelectedProjectId(nextSelectedProjectId);
      if (!weeklyProjectId && nextProjects.length > 0) {
        setWeeklyProjectId(nextProjects[0].id);
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
      setSelectedFolderId("");
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

  const loadTasksByFolder = async (folderId: string) => {
    if (!folderId) {
      setTasks([]);
      setSelectedTaskId("");
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

  const loadProjectTasks = async (projectId: string) => {
    if (!projectId) {
      setProjectTasks([]);
      return;
    }
    try {
      const response = await invoke<ApiResponse<Task[]>>("list_tasks_by_project", { projectId });
      if (!response.success) {
        setProjectTasks([]);
        return;
      }
      setProjectTasks(response.data ?? []);
    } catch {
      setProjectTasks([]);
    }
  };

  const loadCalendarEventsForMonth = async (baseMonth: Date) => {
    const start = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    const end = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 0);
    try {
      const response = await invoke<ApiResponse<CalendarEvent[]>>("list_calendar_events_in_range", {
        startDate: dateToYmdNumber(start),
        endDate: dateToYmdNumber(end),
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "カレンダーイベントの取得に失敗しました。");
        return;
      }
      setCalendarEvents(response.data ?? []);
    } catch {
      setErrorMessage("カレンダーイベントの取得に失敗しました。");
    }
  };

  const loadWeeklyGoals = async (weekStart: number) => {
    try {
      const response = await invoke<ApiResponse<WeeklyGoal[]>>("list_weekly_goals_by_week", {
        weekStart,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "週目標の取得に失敗しました。");
        return;
      }
      setWeeklyGoals(response.data ?? []);
    } catch {
      setErrorMessage("週目標の取得に失敗しました。");
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    void loadFolders(selectedProjectId);
    void loadProjectTasks(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    void loadTasksByFolder(selectedFolderId);
  }, [selectedFolderId]);

  useEffect(() => {
    setIsEditingProject(false);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectTaskFolderId("");
      return;
    }
    if (!folders.some((folder) => folder.id === projectTaskFolderId)) {
      setProjectTaskFolderId(folders[0]?.id ?? "");
    }
  }, [folders, projectTaskFolderId, selectedProjectId]);

  useEffect(() => {
    if (activeView === "calendar") {
      void loadCalendarEventsForMonth(currentMonth);
    }
  }, [activeView, currentMonth]);

  useEffect(() => {
    if (activeView === "weekly") {
      void loadWeeklyGoals(weekStartYmd);
    }
  }, [activeView, weekStartYmd]);

  useEffect(() => {
    const seconds = Math.max(60, (Number(timerMinutes) || 25) * 60);
    if (!timerIsRunning && !activeTimerSessionId) {
      setTimerInitialSeconds(seconds);
      setTimerRemainingSeconds(seconds);
    }
  }, [timerMinutes, timerIsRunning, activeTimerSessionId]);

  useEffect(() => {
    if (!timerIsRunning || !timerDeadlineMs) {
      return;
    }

    const tick = () => {
      const next = Math.max(0, Math.ceil((timerDeadlineMs - Date.now()) / 1000));
      setTimerRemainingSeconds(next);
      if (next === 0 && !timerCompletingRef.current) {
        timerCompletingRef.current = true;
        setTimerIsRunning(false);
        setTimerDeadlineMs(null);
        void handleFinishTimerSession(timerInitialSeconds, true);
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [timerIsRunning, timerDeadlineMs, timerInitialSeconds]);

  useEffect(() => {
    if (!showCalendarCreateForm) {
      setCalendarPopoverPosition(null);
      setCalendarPopoverDrag(null);
      return;
    }

    if (!calendarPanelRef.current || !calendarPopoverRef.current || calendarPopoverPosition) {
      return;
    }

    const panelRect = calendarPanelRef.current.getBoundingClientRect();
    const popoverRect = calendarPopoverRef.current.getBoundingClientRect();
    const defaultLeft = Math.max(16, panelRect.width - popoverRect.width - 16);

    setCalendarPopoverPosition({ left: defaultLeft, top: 74 });
  }, [showCalendarCreateForm, calendarPopoverPosition]);

  useEffect(() => {
    if (!calendarPopoverDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!calendarPanelRef.current || !calendarPopoverRef.current) {
        return;
      }

      const panelRect = calendarPanelRef.current.getBoundingClientRect();
      const popoverRect = calendarPopoverRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const minViewportTop = 44;
      const minLeft = viewportPadding - panelRect.left;
      const minTop = minViewportTop - panelRect.top;
      const maxLeft = window.innerWidth - panelRect.left - popoverRect.width - viewportPadding;
      const maxTop = window.innerHeight - panelRect.top - popoverRect.height - viewportPadding;
      const nextLeft = clamp(event.clientX - panelRect.left - calendarPopoverDrag.offsetX, minLeft, maxLeft);
      const nextTop = clamp(event.clientY - panelRect.top - calendarPopoverDrag.offsetY, minTop, maxTop);

      setCalendarPopoverPosition({ left: nextLeft, top: nextTop });
    };

    const handlePointerUp = () => {
      setCalendarPopoverDrag(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [calendarPopoverDrag]);

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

  const handleCreateTask = async (explicitFolderId?: string) => {
    const folderId = explicitFolderId || selectedFolderId;
    if (!folderId || !newTaskName.trim()) {
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
        folderId,
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
      if (selectedFolderId && selectedFolderId === folderId) {
        await loadTasksByFolder(selectedFolderId);
      }
      await loadProjectTasks(selectedProjectId);
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

  const getChildFolders = (parentFolderId: string | null) =>
    folders.filter((folder) => (parentFolderId ? folder.parent_folder_id === parentFolderId : !folder.parent_folder_id));

  const getTasksForFolder = (folderId: string) => projectTasks.filter((task) => task.folder_id === folderId);

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const selectProjectNode = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFolderId("");
    setSelectedTaskId("");
    setExpandedProjects((prev) => ({ ...prev, [projectId]: true }));
  };

  const selectFolderNode = (folderId: string, projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFolderId(folderId);
    setSelectedTaskId("");
    setExpandedProjects((prev) => ({ ...prev, [projectId]: true }));
    setExpandedFolders((prev) => ({ ...prev, [folderId]: true }));
  };

  const selectTaskNode = (taskId: string, folderId: string, projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFolderId(folderId);
    setSelectedTaskId(taskId);
    setExpandedProjects((prev) => ({ ...prev, [projectId]: true }));
    setExpandedFolders((prev) => ({ ...prev, [folderId]: true }));
  };

  const startEditingProject = (project: Project) => {
    setEditProjectName(project.name);
    setEditProjectColor(project.color);
    setEditProjectDescription(project.description ?? "");
    setEditProjectDetails(project.details ?? "");
    setIsEditingProject(true);
  };

  const handleUpdateProject = async () => {
    if (!selectedProjectId || !editProjectName.trim()) {
      return;
    }
    try {
      const response = await invoke<ApiResponse<Project>>("update_project", {
        id: selectedProjectId,
        name: editProjectName.trim(),
        color: editProjectColor,
        description: editProjectDescription.trim() || null,
        details: editProjectDetails.trim() || null,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "プロジェクトの更新に失敗しました。");
        return;
      }
      setIsEditingProject(false);
      await loadProjects();
    } catch {
      setErrorMessage("プロジェクトの更新に失敗しました。");
    }
  };

  const handleCreateCalendarEvent = async () => {
    if (!newEventTitle.trim() || !newEventDate) {
      setErrorMessage("イベントのタイトルと日付を入力してください。");
      return;
    }
    const startMinute = labelToMinute(newEventStart);
    const endMinute = labelToMinute(newEventEnd);
    if (endMinute <= startMinute) {
      setErrorMessage("終了時刻は開始時刻より後にしてください。");
      return;
    }

    const [year, month, day] = newEventDate.split("-").map((s) => Number(s));
    const dateValue = Number(`${year}${pad2(month)}${pad2(day)}`);

    try {
      const response = await invoke<ApiResponse<CalendarEvent>>("create_calendar_event", {
        taskId: newEventTaskId || null,
        title: newEventTitle.trim(),
        date: dateValue,
        startMinute,
        endMinute,
        note: newEventNote.trim() || null,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "イベント作成に失敗しました。");
        return;
      }
      setNewEventTitle("");
      setNewEventDate("");
      setNewEventStart("09:00");
      setNewEventEnd("10:00");
      setNewEventNote("");
      setNewEventTaskId("");
      setShowCalendarCreateForm(false);
      await loadCalendarEventsForMonth(currentMonth);
    } catch {
      setErrorMessage("イベント作成に失敗しました。");
    }
  };

  const handleCreateWeeklyGoal = async () => {
    if (weeklyGoalType === "project" && !weeklyProjectId) {
      setErrorMessage("プロジェクトを選択してください。");
      return;
    }
    if (weeklyGoalType === "task" && !weeklyTaskId) {
      setErrorMessage("タスクを選択してください。");
      return;
    }
    if (weeklyTargetHours <= 0) {
      setErrorMessage("目標時間は1時間以上で入力してください。");
      return;
    }

    try {
      const response = await invoke<ApiResponse<WeeklyGoal>>("create_weekly_goal", {
        projectId: weeklyGoalType === "project" ? weeklyProjectId : null,
        taskId: weeklyGoalType === "task" ? weeklyTaskId : null,
        weekStart: weekStartYmd,
        targetHours: weeklyTargetHours,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "週目標の作成に失敗しました。");
        return;
      }
      await loadWeeklyGoals(weekStartYmd);
    } catch {
      setErrorMessage("週目標の作成に失敗しました。");
    }
  };

  const getCurrentRemainingSeconds = () => {
    if (!timerIsRunning || !timerDeadlineMs) {
      return timerRemainingSeconds;
    }
    return Math.max(0, Math.ceil((timerDeadlineMs - Date.now()) / 1000));
  };

  const closeTimerModal = () => {
    setTimerIsRunning(false);
    setTimerDeadlineMs(null);
    setActiveTimerSessionId("");
    timerCompletingRef.current = false;
    setTimerTargetTask(null);
  };

  const handleStartTimer = async () => {
    if (!timerTargetTask) {
      return;
    }

    const seconds = Math.max(60, (Number(timerMinutes) || 25) * 60);
    const today = dateToYmdNumber(new Date());

    try {
      const response = await invoke<ApiResponse<TimerSession>>("create_timer_session", {
        taskId: timerTargetTask.id,
        date: today,
      });
      if (!response.success || !response.data) {
        setErrorMessage(response.message ?? "タイマー開始に失敗しました。");
        return;
      }

      setErrorMessage("");
      timerCompletingRef.current = false;
      setActiveTimerSessionId(response.data.id);
      setTimerInitialSeconds(seconds);
      setTimerRemainingSeconds(seconds);
      setTimerDeadlineMs(Date.now() + seconds * 1000);
      setTimerIsRunning(true);
    } catch {
      setErrorMessage("タイマー開始に失敗しました。");
    }
  };

  const handlePauseTimer = () => {
    if (!timerIsRunning) {
      return;
    }
    setTimerRemainingSeconds(getCurrentRemainingSeconds());
    setTimerIsRunning(false);
    setTimerDeadlineMs(null);
  };

  const handleResumeTimer = () => {
    if (timerIsRunning || !activeTimerSessionId) {
      return;
    }
    if (timerRemainingSeconds <= 0) {
      return;
    }
    setTimerDeadlineMs(Date.now() + timerRemainingSeconds * 1000);
    setTimerIsRunning(true);
  };

  const handleFinishTimerSession = async (durationSeconds: number, closeOnDone: boolean) => {
    if (!activeTimerSessionId) {
      if (closeOnDone) {
        closeTimerModal();
      }
      return;
    }

    try {
      const response = await invoke<ApiResponse<TimerSession>>("update_timer_session", {
        id: activeTimerSessionId,
        endTime: Math.floor(Date.now() / 1000),
        duration: Math.max(1, Math.floor(durationSeconds)),
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "タイマー保存に失敗しました。");
      }
    } catch {
      setErrorMessage("タイマー保存に失敗しました。");
    } finally {
      setActiveTimerSessionId("");
      timerCompletingRef.current = false;
      if (activeView === "weekly") {
        await loadWeeklyGoals(weekStartYmd);
      }
      if (closeOnDone) {
        closeTimerModal();
      }
    }
  };

  const handleStopTimer = async () => {
    if (!activeTimerSessionId) {
      closeTimerModal();
      return;
    }

    const currentRemaining = getCurrentRemainingSeconds();
    setTimerRemainingSeconds(currentRemaining);
    setTimerIsRunning(false);
    setTimerDeadlineMs(null);
    const elapsed = timerInitialSeconds - currentRemaining;
    await handleFinishTimerSession(elapsed, true);
  };

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error("minimize failed", error);
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
    } catch (error) {
      console.error("maximize toggle failed", error);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (error) {
      console.error("close failed", error);
    }
  };

  const handleStartDragging = async () => {
    try {
      await appWindow.startDragging();
    } catch (error) {
      console.error("start dragging failed", error);
    }
  };

  const handleTitlebarMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".titlebar-controls")) {
      return;
    }
    void handleStartDragging();
  };

  const handleCalendarPopoverDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    if (!calendarPopoverRef.current) {
      return;
    }

    const popoverRect = calendarPopoverRef.current.getBoundingClientRect();
    setCalendarPopoverDrag({
      offsetX: event.clientX - popoverRect.left,
      offsetY: event.clientY - popoverRect.top,
    });
    event.preventDefault();
  };

  const monthMatrix = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - offset);

    return Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 7 }, (_, col) => {
        const d = new Date(start);
        d.setDate(start.getDate() + row * 7 + col);
        return d;
      }),
    );
  }, [currentMonth]);

  const hasDetailSelected = !!(selectedProject || selectedFolder || selectedTask);

  const clearDetailSelection = () => {
    setSelectedProjectId("");
    setSelectedFolderId("");
    setSelectedTaskId("");
  };

  const renderProjectsView = () => (
    <section className={hasDetailSelected ? "project-explorer-layout has-detail" : "project-explorer-layout"}>
      <article className="panel explorer-tree-panel">
        <h2>プロジェクト構造</h2>
        <div className="inline-form compact-form">
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
        <ul className="explorer-tree">
          {projects.map((project) => {
            const projectExpanded = expandedProjects[project.id] ?? project.id === selectedProjectId;
            const projectFolderRoots = project.id === selectedProjectId ? rootFolders : [];

            const renderFolderNode = (folder: Folder, depth: number): React.ReactNode => {
              const childFolders = getChildFolders(folder.id);
              const folderTasks = getTasksForFolder(folder.id);
              const folderExpanded = expandedFolders[folder.id] ?? folder.id === selectedFolderId;

              return (
                <li key={folder.id}>
                  <div className="tree-row" style={{ paddingLeft: `${depth * 1.05}rem` }}>
                    <button
                      type="button"
                      className="tree-toggle"
                      onClick={() => toggleFolderExpanded(folder.id)}
                      aria-label={folderExpanded ? "フォルダを閉じる" : "フォルダを開く"}
                    >
                      {childFolders.length > 0 || folderTasks.length > 0 ? (folderExpanded ? "▾" : "▸") : "•"}
                    </button>
                    <button
                      type="button"
                      className={folder.id === selectedFolderId && !selectedTaskId ? "tree-node is-active" : "tree-node"}
                      onClick={() => selectFolderNode(folder.id, folder.project_id)}
                    >
                      <span>[F] {folder.name}</span>
                      <small>{folderTasks.length}件</small>
                    </button>
                  </div>
                  {folderExpanded && (childFolders.length > 0 || folderTasks.length > 0) && (
                    <ul className="explorer-tree nested-tree">
                      {childFolders.map((childFolder) => renderFolderNode(childFolder, depth + 1))}
                      {folderTasks.map((task) => (
                        <li key={task.id}>
                          <div className="tree-row" style={{ paddingLeft: `${(depth + 1) * 1.05}rem` }}>
                            <span className="tree-toggle tree-dot">•</span>
                            <button
                              type="button"
                              className={task.id === selectedTaskId ? "tree-node is-active" : "tree-node"}
                              onClick={() => selectTaskNode(task.id, folder.id, folder.project_id)}
                            >
                              <span>
                                <span className="color-dot" style={{ backgroundColor: task.color }} />
                                {task.name}
                              </span>
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            };

            return (
              <li key={project.id}>
                <div className="tree-row">
                  <button
                    type="button"
                    className="tree-toggle"
                    onClick={() => {
                      toggleProjectExpanded(project.id);
                      setSelectedProjectId(project.id);
                    }}
                    aria-label={projectExpanded ? "プロジェクトを閉じる" : "プロジェクトを開く"}
                  >
                    {projectExpanded ? "▾" : "▸"}
                  </button>
                  <button
                    type="button"
                    className={project.id === selectedProjectId && !selectedFolderId && !selectedTaskId ? "tree-node is-active" : "tree-node"}
                    onClick={() => selectProjectNode(project.id)}
                  >
                    <span>
                      <span className="color-dot" style={{ backgroundColor: project.color }} />
                      {project.name}
                    </span>
                  </button>
                </div>
                {projectExpanded && project.id === selectedProjectId && (
                  <ul className="explorer-tree nested-tree">
                    {projectFolderRoots.map((folder) => renderFolderNode(folder, 1))}
                    {projectFolderRoots.length === 0 && <li className="empty-note tree-empty">フォルダがありません。</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {!loading && projects.length === 0 && <p className="empty-note">まだプロジェクトがありません。</p>}
      </article>

      {hasDetailSelected && (
      <article className="panel explorer-detail-panel">
        <div className="detail-panel-head">
          <h2>
            {selectedTask && `タスク詳細 (${selectedTask.name})`}
            {!selectedTask && selectedFolder && `フォルダ詳細 (${selectedFolder.name})`}
            {!selectedTask && !selectedFolder && selectedProject && `プロジェクト詳細 (${selectedProject.name})`}
          </h2>
          <button type="button" className="detail-panel-close" onClick={clearDetailSelection} aria-label="閉じる">×</button>
        </div>

        {selectedProject && !selectedFolder && !selectedTask && (
          <div className="detail-stack">
            {!isEditingProject ? (
              <div className="task-detail">
                <div className="detail-view-head">
                  <h3>{selectedProject.name}</h3>
                  <button type="button" className="btn-edit" onClick={() => startEditingProject(selectedProject)}>
                    編集
                  </button>
                </div>
                <p>
                  <strong>色:</strong> <span className="color-dot" style={{ backgroundColor: selectedProject.color }} /> {selectedProject.color}
                </p>
                <p>
                  <strong>概要:</strong> {selectedProject.description || "-"}
                </p>
                <p>
                  <strong>詳細:</strong> {selectedProject.details || "-"}
                </p>
              </div>
            ) : (
              <div className="task-form-grid">
                <label className="form-label">プロジェクト名
                  <input value={editProjectName} onChange={(e) => setEditProjectName(e.target.value)} />
                </label>
                <label className="color-input">色
                  <input type="color" value={editProjectColor} onChange={(e) => setEditProjectColor(e.target.value)} />
                </label>
                <label className="form-label">概要
                  <input placeholder="概要" value={editProjectDescription} onChange={(e) => setEditProjectDescription(e.target.value)} />
                </label>
                <label className="form-label">詳細
                  <textarea placeholder="詳細" value={editProjectDetails} onChange={(e) => setEditProjectDetails(e.target.value)} />
                </label>
                <div className="edit-actions">
                  <button type="button" onClick={() => setIsEditingProject(false)}>キャンセル</button>
                  <button type="button" className="btn-main" onClick={handleUpdateProject}>保存</button>
                </div>
              </div>
            )}

            <div className="create-kind-row">
              <label>
                新規作成
                <select value={projectCreateKind} onChange={(event) => setProjectCreateKind(event.target.value as "folder" | "task")}>
                  <option value="folder">フォルダ</option>
                  <option value="task">タスク</option>
                </select>
              </label>
            </div>

            {projectCreateKind === "folder" && (
              <div className="inline-form">
                <input
                  placeholder="このプロジェクトに新規フォルダ"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                />
                <select value={newFolderParentId} onChange={(event) => setNewFolderParentId(event.target.value)}>
                  <option value="">ルート</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={handleCreateFolder}>
                  フォルダ追加
                </button>
              </div>
            )}

            {projectCreateKind === "task" && (
              <div className="task-form-grid">
                <select value={projectTaskFolderId} onChange={(event) => setProjectTaskFolderId(event.target.value)}>
                  <option value="">保存先フォルダを選択</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="タスク名"
                  value={newTaskName}
                  onChange={(event) => setNewTaskName(event.target.value)}
                  disabled={!projectTaskFolderId}
                />
                <label className="color-input">
                  色
                  <input
                    type="color"
                    value={newTaskColor}
                    onChange={(event) => setNewTaskColor(event.target.value)}
                    disabled={!projectTaskFolderId}
                  />
                </label>
                <textarea
                  placeholder="概要（140文字以内）"
                  maxLength={140}
                  value={newTaskOverview}
                  onChange={(event) => setNewTaskOverview(event.target.value)}
                  disabled={!projectTaskFolderId}
                />
                <textarea
                  placeholder="詳細（文字数制限なし）"
                  value={newTaskDetails}
                  onChange={(event) => setNewTaskDetails(event.target.value)}
                  disabled={!projectTaskFolderId}
                />
                <button
                  type="button"
                  className="btn-main"
                  onClick={() => {
                    void handleCreateTask(projectTaskFolderId);
                  }}
                  disabled={!projectTaskFolderId}
                >
                  タスク追加
                </button>
                {folders.length === 0 && <p className="empty-note">先にフォルダを作成してください。</p>}
              </div>
            )}
          </div>
        )}

        {selectedFolder && !selectedTask && (
          <div className="detail-stack">
            <div className="task-detail">
              <h3>{selectedFolder.name}</h3>
              <p>
                <strong>所属プロジェクト:</strong> {selectedProject?.name ?? "-"}
              </p>
              <p>
                <strong>タスク数:</strong> {selectedFolderTasks.length}
              </p>
            </div>

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
              <button
                type="button"
                className="btn-main"
                onClick={() => {
                  void handleCreateTask();
                }}
                disabled={!selectedFolderId}
              >
                タスク追加
              </button>
            </div>

            {hasNoTaskInFolder && <p className="empty-note">タスク0件</p>}
          </div>
        )}

        {selectedTask && (
          <div className="detail-stack">
            <div className="task-detail">
              <h3>{selectedTask.name}</h3>
              <p>
                <strong>プロジェクト名:</strong> {selectedProject?.name ?? "-"}
              </p>
              <p>
                <strong>フォルダ名:</strong> {selectedFolder?.name ?? "-"}
              </p>
              <p>
                <strong>色:</strong> <span className="color-dot" style={{ backgroundColor: selectedTask.color }} /> {selectedTask.color}
              </p>
              <p>
                <strong>概要:</strong> {selectedTask.overview || "-"}
              </p>
              <p>
                <strong>詳細:</strong> {selectedTask.details || "-"}
              </p>
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
          </div>
        )}

      </article>
      )}
    </section>
  );

  const renderCalendarView = () => (
    <section className="calendar-wrap">
      <article className="panel calendar-panel" ref={calendarPanelRef}>
        <div className="calendar-head">
          <div className="calendar-head-main">
            <h2>月間カレンダー</h2>
            <button
              type="button"
              className="calendar-create-toggle"
              onClick={() => setShowCalendarCreateForm((prev) => !prev)}
            >
              {showCalendarCreateForm ? "閉じる" : "作成"}
            </button>
          </div>
          <div className="calendar-month-nav">
            <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
              前月
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
              次月
            </button>
          </div>
        </div>

        {showCalendarCreateForm && (
          <div
            ref={calendarPopoverRef}
            className={calendarPopoverDrag ? "calendar-popover is-dragging" : "calendar-popover"}
            style={calendarPopoverPosition ?? undefined}
          >
            <div className="calendar-popover-head" onPointerDown={handleCalendarPopoverDragStart}>
              <h3>イベント追加</h3>
              <button type="button" className="calendar-popover-close" onClick={() => setShowCalendarCreateForm(false)}>
                ×
              </button>
            </div>
            <div className="task-form-grid">
              <input placeholder="タイトル" value={newEventTitle} onChange={(e) => setNewEventTitle(e.target.value)} />
              <input type="date" value={newEventDate} onChange={(e) => setNewEventDate(e.target.value)} />
              <div className="time-row">
                <input type="time" value={newEventStart} onChange={(e) => setNewEventStart(e.target.value)} />
                <input type="time" value={newEventEnd} onChange={(e) => setNewEventEnd(e.target.value)} />
              </div>
              <select value={newEventTaskId} onChange={(e) => setNewEventTaskId(e.target.value)}>
                <option value="">タスク未指定</option>
                {projectTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
              <textarea placeholder="メモ" value={newEventNote} onChange={(e) => setNewEventNote(e.target.value)} />
              <button type="button" className="btn-main" onClick={handleCreateCalendarEvent}>
                追加
              </button>
            </div>
          </div>
        )}

        <div className="calendar-grid">
          {["月", "火", "水", "木", "金", "土", "日"].map((w, index) => (
            <div
              key={w}
              className={index === 5 ? "calendar-weekday is-sat" : index === 6 ? "calendar-weekday is-sun" : "calendar-weekday"}
            >
              {w}
            </div>
          ))}
          {monthMatrix.flat().map((date) => {
            const ymd = dateToYmdNumber(date);
            const dayEvents = calendarEvents.filter((ev) => ev.date === ymd);
            const inCurrentMonth = date.getMonth() === currentMonth.getMonth();
            return (
              <div key={ymd} className={inCurrentMonth ? "calendar-cell" : "calendar-cell is-outside"}>
                <div className="calendar-day">{date.getDate()}</div>
                <ul className="calendar-events-list">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <li key={ev.id} title={ev.note || ""}>
                      {minuteToLabel(ev.start_minute)} - {ev.title}
                    </li>
                  ))}
                  {dayEvents.length > 3 && <li>+{dayEvents.length - 3}件</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );

  const renderWeeklyView = () => (
    <section className="weekly-wrap">
      <article className="panel weekly-panel">
        <div className="calendar-head">
          <h2>週予定・週目標</h2>
          <div className="calendar-month-nav">
            <button type="button" onClick={() => setWeeklyBaseDate(new Date(weeklyBaseDate.getFullYear(), weeklyBaseDate.getMonth(), weeklyBaseDate.getDate() - 7))}>
              前週
            </button>
            <strong>
              {weekDays[0].getMonth() + 1}/{weekDays[0].getDate()} - {weekDays[6].getMonth() + 1}/{weekDays[6].getDate()}
            </strong>
            <button type="button" onClick={() => setWeeklyBaseDate(new Date(weeklyBaseDate.getFullYear(), weeklyBaseDate.getMonth(), weeklyBaseDate.getDate() + 7))}>
              次週
            </button>
          </div>
        </div>

        <div className="weekly-grid">
          {weekDays.map((d) => (
            <div key={dateToYmdNumber(d)} className="weekly-day-card">
              <p className={d.getDay() === 6 ? "weekly-day-title is-sat" : d.getDay() === 0 ? "weekly-day-title is-sun" : "weekly-day-title"}>
                {d.getMonth() + 1}/{d.getDate()} ({["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})
              </p>
              <p className="weekly-day-note">計画・実行はタスク単位で管理</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel weekly-form-panel">
        <h2>週目標追加</h2>
        <div className="task-form-grid">
          <select value={weeklyGoalType} onChange={(e) => setWeeklyGoalType(e.target.value as "project" | "task")}>
            <option value="project">プロジェクト目標</option>
            <option value="task">タスク目標</option>
          </select>

          <select value={weeklyProjectId} onChange={(e) => setWeeklyProjectId(e.target.value)}>
            <option value="">プロジェクト選択</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {weeklyGoalType === "task" && (
            <select value={weeklyTaskId} onChange={(e) => setWeeklyTaskId(e.target.value)}>
              <option value="">タスク選択</option>
              {projectTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          )}

          <input
            type="number"
            min={1}
            step={0.5}
            value={weeklyTargetHours}
            onChange={(e) => setWeeklyTargetHours(Number(e.target.value) || 1)}
          />

          <button type="button" className="btn-main" onClick={handleCreateWeeklyGoal}>
            週目標を追加
          </button>
        </div>

        <h3>今週の目標一覧</h3>
        <ul className="weekly-goal-list">
          {weeklyGoals.map((goal) => {
            const project = projects.find((p) => p.id === goal.project_id);
            const task = projectTasks.find((t) => t.id === goal.task_id);
            return (
              <li key={goal.id}>
                <div>
                  <strong>{task?.name ?? project?.name ?? "未分類"}</strong>
                  <p>
                    目標 {goal.target_hours}h / 実績 {goal.actual_hours}h
                  </p>
                </div>
                {task && (
                  <button type="button" onClick={() => setTimerTargetTask(task)}>
                    タイマー開始
                  </button>
                )}
              </li>
            );
          })}
          {weeklyGoals.length === 0 && <li>この週の目標はまだありません。</li>}
        </ul>
      </article>
    </section>
  );

  return (
    <main className="app-shell">
      <div className="custom-titlebar" onMouseDown={handleTitlebarMouseDown}>
        <div className="titlebar-drag-area">
          <div className="titlebar-title">Secretariat</div>
        </div>
        <div className="titlebar-controls">
          <button type="button" className="titlebar-btn" aria-label="最小化" onClick={handleMinimize}>
            -
          </button>
          <button type="button" className="titlebar-btn" aria-label="最大化または元に戻す" onClick={handleMaximizeToggle}>
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
              <button type="button" onClick={() => { setActiveView("calendar"); closeMenu(); }}>
                カレンダー
              </button>
            </li>
            <li>
              <button type="button" onClick={() => { setActiveView("projects"); closeMenu(); }}>
                プロジェクト管理
              </button>
            </li>
            <li>
              <button type="button" onClick={() => { setActiveView("weekly"); closeMenu(); }}>
                週予定
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
        {errorMessage && <p className="error-banner">{errorMessage}</p>}

        {activeView === "projects" && renderProjectsView()}
        {activeView === "calendar" && renderCalendarView()}
        {activeView === "weekly" && renderWeeklyView()}

        {timerTargetTask && (
          <section className="timer-modal">
            <div className="timer-card">
              <h3>タイマー</h3>
              <p>対象タスク: {timerTargetTask.name}</p>
              <p className="timer-status">残り時間: {secToLabel(timerRemainingSeconds)}</p>
              <label>
                分数
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={timerMinutes}
                  onChange={(event) => setTimerMinutes(Number(event.target.value) || 25)}
                  disabled={timerIsRunning}
                />
              </label>
              {timerIsRunning && <p className="timer-note">実行中です。終了して保存を押すと記録されます。</p>}
              {!timerIsRunning && activeTimerSessionId && <p className="timer-note">一時停止中です。再開または終了して保存を選べます。</p>}
              <div className="timer-actions">
                {!timerIsRunning && !activeTimerSessionId && (
                  <>
                    <button type="button" className="timer-btn-secondary" onClick={closeTimerModal}>
                      閉じる
                    </button>
                    <button type="button" className="btn-main" onClick={() => { void handleStartTimer(); }}>
                      開始
                    </button>
                  </>
                )}
                {timerIsRunning && (
                  <>
                    <button type="button" className="timer-btn-secondary" onClick={handlePauseTimer}>
                      一時停止
                    </button>
                    <button type="button" className="timer-btn-danger" onClick={() => { void handleStopTimer(); }}>
                      終了して保存
                    </button>
                  </>
                )}
                {!timerIsRunning && !!activeTimerSessionId && (
                  <>
                    <button type="button" className="btn-main" onClick={handleResumeTimer}>
                      再開
                    </button>
                    <button type="button" className="timer-btn-danger" onClick={() => { void handleStopTimer(); }}>
                      終了して保存
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
