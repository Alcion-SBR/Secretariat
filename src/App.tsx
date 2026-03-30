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
  color: string;
  description?: string | null;
  details?: string | null;
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

type ScheduleDetailSelection =
  | { kind: "event"; source: "calendar" | "weekly"; event: CalendarEvent }
  | { kind: "session"; source: "weekly"; session: TimerSession };

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
const secondsToHoursLabel = (seconds: number) => `${(seconds / 3600).toFixed(1)}h`;
const secondsToMinutesLabel = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))}分`;
const unixToHm = (unixSeconds: number) => {
  const d = new Date(unixSeconds * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const unixToMinuteOfDay = (unixSeconds: number) => {
  const d = new Date(unixSeconds * 1000);
  return d.getHours() * 60 + d.getMinutes();
};
const ymdToLabel = (ymd: number) => {
  const raw = String(ymd);
  if (raw.length !== 8) {
    return raw;
  }
  return `${Number(raw.slice(4, 6))}/${Number(raw.slice(6, 8))}`;
};
const ARCHIVE_STORAGE_KEY = "secretariat-archives";
const TREE_ORDER_STORAGE_KEY = "secretariat-tree-order";

type TreeOrderState = {
  projects: string[];
  folders: Record<string, string[]>;
};

type TreeDragPayload =
  | { kind: "project"; projectId: string }
  | { kind: "folder"; projectId: string; folderId: string; parentFolderId: string | null };

const mergeOrderedIds = (savedIds: string[], actualIds: string[]) => {
  const actualSet = new Set(actualIds);
  const kept = savedIds.filter((id) => actualSet.has(id));
  const keptSet = new Set(kept);
  const appended = actualIds.filter((id) => !keptSet.has(id));
  return [...kept, ...appended];
};

const moveBefore = (ids: string[], movingId: string, targetId: string) => {
  if (movingId === targetId) {
    return ids;
  }
  const next = ids.filter((id) => id !== movingId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) {
    return next;
  }
  next.splice(targetIndex, 0, movingId);
  return next;
};

const moveAfter = (ids: string[], movingId: string, targetId: string) => {
  if (movingId === targetId) {
    return ids;
  }
  const next = ids.filter((id) => id !== movingId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) {
    return next;
  }
  next.splice(targetIndex + 1, 0, movingId);
  return next;
};

const getFolderOrderKey = (projectId: string, parentFolderId: string | null) =>
  `${projectId}::${parentFolderId ?? "root"}`;

const loadTreeOrderState = (): TreeOrderState => {
  try {
    const raw = window.localStorage.getItem(TREE_ORDER_STORAGE_KEY);
    if (!raw) {
      return { projects: [], folders: {} };
    }
    const parsed = JSON.parse(raw) as { projects?: string[]; folders?: Record<string, string[]> };
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      folders:
        parsed.folders && typeof parsed.folders === "object"
          ? Object.fromEntries(
              Object.entries(parsed.folders).map(([key, ids]) => [
                key,
                Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
              ]),
            )
          : {},
    };
  } catch {
    return { projects: [], folders: {} };
  }
};
const loadArchiveState = () => {
  try {
    const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) {
      return { projects: [] as string[], folders: [] as string[], tasks: [] as string[] };
    }
    const parsed = JSON.parse(raw) as { projects?: string[]; folders?: string[]; tasks?: string[] };
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return { projects: [] as string[], folders: [] as string[], tasks: [] as string[] };
  }
};
const getSessionDurationSeconds = (session: TimerSession) => {
  if (typeof session.duration === "number" && session.duration > 0) {
    return session.duration;
  }
  if (typeof session.end_time === "number") {
    return Math.max(0, session.end_time - session.start_time);
  }
  return 0;
};

const getTimelineBlockStyle = (
  startMinute: number,
  endMinute: number,
  timelineStartMinute: number,
  timelineEndMinute: number,
) => {
  const totalMinutes = Math.max(1, timelineEndMinute - timelineStartMinute);
  const safeStart = clamp(startMinute, timelineStartMinute, timelineEndMinute - 15);
  const safeEnd = clamp(Math.max(endMinute, safeStart + 15), timelineStartMinute + 15, timelineEndMinute);
  const top = ((safeStart - timelineStartMinute) / totalMinutes) * 100;
  const height = Math.max(((safeEnd - safeStart) / totalMinutes) * 100, 2.8);

  return {
    top: `${top}%`,
    height: `${height}%`,
  };
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
  const [isTreeReorderMode, setIsTreeReorderMode] = useState(false);

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
  const [newFolderColor, setNewFolderColor] = useState("#2f80cc");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [newFolderDetails, setNewFolderDetails] = useState("");
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
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskColor, setEditTaskColor] = useState("#2f80cc");
  const [editTaskOverview, setEditTaskOverview] = useState("");
  const [editTaskDetails, setEditTaskDetails] = useState("");
  const [editTaskLinks, setEditTaskLinks] = useState<LinkInput[]>(emptyLinks);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedScheduleDetail, setSelectedScheduleDetail] = useState<ScheduleDetailSelection | null>(null);
  const [selectedScheduleTask, setSelectedScheduleTask] = useState<Task | null>(null);
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
  const [weeklyCalendarEvents, setWeeklyCalendarEvents] = useState<CalendarEvent[]>([]);
  const [weeklyGoalType, setWeeklyGoalType] = useState<"project" | "task">("project");
  const [weeklyProjectId, setWeeklyProjectId] = useState("");
  const [weeklyTaskId, setWeeklyTaskId] = useState("");
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(5);
  const [calendarActualByDate, setCalendarActualByDate] = useState<Record<number, number>>({});
  const [weeklyActualByDate, setWeeklyActualByDate] = useState<Record<number, number>>({});
  const [weeklySessionsByDate, setWeeklySessionsByDate] = useState<Record<number, TimerSession[]>>({});
  const [weeklyActualTotalSeconds, setWeeklyActualTotalSeconds] = useState(0);
  const [taskRecentSessions, setTaskRecentSessions] = useState<TimerSession[]>([]);
  const [showArchivedEntities, setShowArchivedEntities] = useState(false);
  const [archivedProjectIds, setArchivedProjectIds] = useState<string[]>([]);
  const [archivedFolderIds, setArchivedFolderIds] = useState<string[]>([]);
  const [archivedTaskIds, setArchivedTaskIds] = useState<string[]>([]);
  const [projectOrderIds, setProjectOrderIds] = useState<string[]>([]);
  const [folderOrderByParent, setFolderOrderByParent] = useState<Record<string, string[]>>({});
  const [pointerDragPayload, setPointerDragPayload] = useState<TreeDragPayload | null>(null);
  const [editingWeeklyGoalId, setEditingWeeklyGoalId] = useState<string>("");
  const [editingWeeklyGoalTarget, setEditingWeeklyGoalTarget] = useState(1);

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

  const knownTasksById = useMemo(() => {
    const taskMap = new Map<string, Task>();
    [...projectTasks, ...tasks].forEach((task) => {
      if (!taskMap.has(task.id)) {
        taskMap.set(task.id, task);
      }
    });
    return taskMap;
  }, [projectTasks, tasks]);

  const archivedProjectSet = useMemo(() => new Set(archivedProjectIds), [archivedProjectIds]);
  const archivedFolderSet = useMemo(() => new Set(archivedFolderIds), [archivedFolderIds]);
  const archivedTaskSet = useMemo(() => new Set(archivedTaskIds), [archivedTaskIds]);

  const visibleProjects = useMemo(
    () => (showArchivedEntities ? projects : projects.filter((project) => !archivedProjectSet.has(project.id))),
    [projects, showArchivedEntities, archivedProjectSet],
  );

  const orderedVisibleProjects = useMemo(() => {
    const mergedOrder = mergeOrderedIds(projectOrderIds, visibleProjects.map((project) => project.id));
    const projectById = new Map(visibleProjects.map((project) => [project.id, project]));
    return mergedOrder.map((id) => projectById.get(id)).filter((project): project is Project => !!project);
  }, [visibleProjects, projectOrderIds]);

  const visibleFolders = useMemo(
    () => (showArchivedEntities ? folders : folders.filter((folder) => !archivedFolderSet.has(folder.id))),
    [folders, showArchivedEntities, archivedFolderSet],
  );

  const visibleProjectTasks = useMemo(
    () => (showArchivedEntities ? projectTasks : projectTasks.filter((task) => !archivedTaskSet.has(task.id))),
    [projectTasks, showArchivedEntities, archivedTaskSet],
  );

  const selectedFolderTasks = useMemo(
    () => visibleProjectTasks.filter((task) => task.folder_id === selectedFolderId),
    [visibleProjectTasks, selectedFolderId],
  );

  const hasNoTaskInFolder = selectedFolderId && selectedFolderTasks.length === 0;

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

  const loadWeeklyCalendarEvents = async () => {
    const startDate = dateToYmdNumber(weekDays[0]);
    const endDate = dateToYmdNumber(weekDays[6]);
    try {
      const response = await invoke<ApiResponse<CalendarEvent[]>>("list_calendar_events_in_range", {
        startDate,
        endDate,
      });
      if (!response.success) {
        setWeeklyCalendarEvents([]);
        return;
      }
      setWeeklyCalendarEvents(response.data ?? []);
    } catch {
      setWeeklyCalendarEvents([]);
    }
  };

  const loadTimerSummaryByDates = async (dates: number[]) => {
    const nextByDate: Record<number, number> = {};
    const nextSessionsByDate: Record<number, TimerSession[]> = {};
    let total = 0;

    try {
      const responses = await Promise.all(
        dates.map((date) => invoke<ApiResponse<TimerSession[]>>("list_timer_sessions_by_date", { date })),
      );

      responses.forEach((response, index) => {
        if (!response.success) {
          return;
        }
        const date = dates[index];
        const sessions = (response.data ?? []).filter((session) => getSessionDurationSeconds(session) > 0);
        const seconds = sessions.reduce((sum, session) => sum + getSessionDurationSeconds(session), 0);
        nextByDate[date] = seconds;
        nextSessionsByDate[date] = sessions;
        total += seconds;
      });

      return { byDate: nextByDate, sessionsByDate: nextSessionsByDate, total };
    } catch {
      setErrorMessage("作業記録の取得に失敗しました。");
      return null;
    }
  };

  const loadCalendarActualForMonth = async (baseMonth: Date) => {
    const lastDate = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 0).getDate();
    const dates = Array.from({ length: lastDate }, (_, i) => {
      const d = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), i + 1);
      return dateToYmdNumber(d);
    });
    const summary = await loadTimerSummaryByDates(dates);
    if (!summary) {
      return;
    }
    setCalendarActualByDate(summary.byDate);
  };

  const loadWeeklyActualForRange = async () => {
    const dates = weekDays.map((day) => dateToYmdNumber(day));
    const summary = await loadTimerSummaryByDates(dates);
    if (!summary) {
      return;
    }
    setWeeklyActualByDate(summary.byDate);
    setWeeklySessionsByDate(summary.sessionsByDate);
    setWeeklyActualTotalSeconds(summary.total);
  };

  const loadRecentTaskSessions = async (taskId: string) => {
    if (!taskId) {
      setTaskRecentSessions([]);
      return;
    }

    try {
      const response = await invoke<ApiResponse<TimerSession[]>>("list_timer_sessions_by_task", { taskId });
      if (!response.success) {
        setTaskRecentSessions([]);
        return;
      }
      const sessions = (response.data ?? []).filter((s) => getSessionDurationSeconds(s) > 0);
      setTaskRecentSessions(sessions.slice(0, 5));
    } catch {
      setTaskRecentSessions([]);
    }
  };

  useEffect(() => {
    void loadProjects();
    const archived = loadArchiveState();
    const treeOrder = loadTreeOrderState();
    setArchivedProjectIds(archived.projects);
    setArchivedFolderIds(archived.folders);
    setArchivedTaskIds(archived.tasks);
    setProjectOrderIds(treeOrder.projects);
    setFolderOrderByParent(treeOrder.folders);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      ARCHIVE_STORAGE_KEY,
      JSON.stringify({
        projects: archivedProjectIds,
        folders: archivedFolderIds,
        tasks: archivedTaskIds,
      }),
    );
  }, [archivedProjectIds, archivedFolderIds, archivedTaskIds]);

  useEffect(() => {
    window.localStorage.setItem(
      TREE_ORDER_STORAGE_KEY,
      JSON.stringify({
        projects: projectOrderIds,
        folders: folderOrderByParent,
      }),
    );
  }, [projectOrderIds, folderOrderByParent]);

  useEffect(() => {
    setProjectOrderIds((prev) => mergeOrderedIds(prev, projects.map((project) => project.id)));
  }, [projects]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    const groupedByParent = new Map<string, string[]>();
    folders.forEach((folder) => {
      const key = getFolderOrderKey(folder.project_id, folder.parent_folder_id ?? null);
      const list = groupedByParent.get(key) ?? [];
      list.push(folder.id);
      groupedByParent.set(key, list);
    });

    setFolderOrderByParent((prev) => {
      const next: Record<string, string[]> = { ...prev };
      const projectPrefix = `${selectedProjectId}::`;

      Object.keys(next).forEach((key) => {
        if (key.startsWith(projectPrefix) && !groupedByParent.has(key)) {
          delete next[key];
        }
      });

      groupedByParent.forEach((folderIds, key) => {
        next[key] = mergeOrderedIds(next[key] ?? [], folderIds);
      });

      return next;
    });
  }, [folders, selectedProjectId]);

  useEffect(() => {
    void loadFolders(selectedProjectId);
    void loadProjectTasks(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    void loadTasksByFolder(selectedFolderId);
    setNewFolderParentId(selectedFolderId);
  }, [selectedFolderId]);

  useEffect(() => {
    setIsEditingProject(false);
  }, [selectedProjectId]);

  useEffect(() => {
    setIsEditingTask(false);
  }, [selectedTaskId]);

  useEffect(() => {
    if (showArchivedEntities) {
      return;
    }
    if (selectedTaskId && archivedTaskSet.has(selectedTaskId)) {
      setSelectedTaskId("");
    }
    if (selectedFolderId && archivedFolderSet.has(selectedFolderId)) {
      setSelectedFolderId("");
    }
    if (selectedProjectId && archivedProjectSet.has(selectedProjectId)) {
      setSelectedProjectId("");
    }
  }, [
    showArchivedEntities,
    selectedTaskId,
    selectedFolderId,
    selectedProjectId,
    archivedTaskSet,
    archivedFolderSet,
    archivedProjectSet,
  ]);

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
      void loadCalendarActualForMonth(currentMonth);
    }
  }, [activeView, currentMonth]);

  useEffect(() => {
    if (activeView === "weekly") {
      void loadWeeklyGoals(weekStartYmd);
      void loadWeeklyCalendarEvents();
      void loadWeeklyActualForRange();
    }
  }, [activeView, weekStartYmd, weekDays]);

  useEffect(() => {
    void loadRecentTaskSessions(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedScheduleDetail) {
      setSelectedScheduleTask(null);
      return;
    }

    const taskId = selectedScheduleDetail.kind === "event"
      ? selectedScheduleDetail.event.task_id ?? ""
      : selectedScheduleDetail.session.task_id;

    if (!taskId) {
      setSelectedScheduleTask(null);
      return;
    }

    const existingTask = knownTasksById.get(taskId);
    if (existingTask) {
      setSelectedScheduleTask(existingTask);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await invoke<ApiResponse<Task>>("get_task", { id: taskId });
        if (!cancelled && response.success) {
          setSelectedScheduleTask(response.data ?? null);
        }
      } catch {
        if (!cancelled) {
          setSelectedScheduleTask(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedScheduleDetail, knownTasksById]);

  useEffect(() => {
    if (!selectedScheduleDetail) {
      return;
    }

    if (selectedScheduleDetail.kind === "event" && selectedScheduleDetail.source === "calendar") {
      if (!calendarEvents.some((event) => event.id === selectedScheduleDetail.event.id)) {
        setSelectedScheduleDetail(null);
      }
      return;
    }

    if (selectedScheduleDetail.kind === "event" && selectedScheduleDetail.source === "weekly") {
      if (!weeklyCalendarEvents.some((event) => event.id === selectedScheduleDetail.event.id)) {
        setSelectedScheduleDetail(null);
      }
      return;
    }

    if (selectedScheduleDetail.kind === "session") {
      const weeklySessionIds = Object.values(weeklySessionsByDate).flat().map((session) => session.id);
      if (!weeklySessionIds.includes(selectedScheduleDetail.session.id)) {
        setSelectedScheduleDetail(null);
      }
    }
  }, [selectedScheduleDetail, calendarEvents, weeklyCalendarEvents, weeklySessionsByDate]);

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
        color: newFolderColor,
        parentFolderId: newFolderParentId || null,
        description: newFolderDescription.trim() || null,
        details: newFolderDetails.trim() || null,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "フォルダ作成に失敗しました。");
        return;
      }
      setNewFolderName("");
      setNewFolderColor("#2f80cc");
      setNewFolderDescription("");
      setNewFolderDetails("");
      setNewFolderParentId("");
      await loadFolders(selectedProjectId);
    } catch {
      setErrorMessage("フォルダ作成に失敗しました。");
    }
  };

  const ensureProjectRootFolder = async (projectId: string) => {
    const existingRoot = visibleFolders.find(
      (folder) => folder.project_id === projectId && !folder.parent_folder_id && folder.name === "プロジェクト直下",
    );
    if (existingRoot) {
      return existingRoot.id;
    }

    const response = await invoke<ApiResponse<Folder>>("create_folder", {
      projectId,
      name: "プロジェクト直下",
      color: selectedProject?.color ?? "#2f80cc",
      parentFolderId: null,
      description: "フォルダを指定しないタスクの保存先",
      details: null,
    });

    if (!response.success || !response.data) {
      setErrorMessage(response.message ?? "プロジェクト直下フォルダの作成に失敗しました。");
      return "";
    }

    await loadFolders(projectId);
    return response.data.id;
  };

  const handleCreateTask = async (explicitFolderId?: string) => {
    let folderId = explicitFolderId || selectedFolderId;
    if (!folderId && selectedProjectId) {
      folderId = await ensureProjectRootFolder(selectedProjectId);
    }
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

  const getChildFolders = (projectId: string, parentFolderId: string | null) => {
    const siblings = visibleFolders.filter(
      (folder) =>
        folder.project_id === projectId &&
        (parentFolderId ? folder.parent_folder_id === parentFolderId : !folder.parent_folder_id),
    );

    const orderedIds = folderOrderByParent[getFolderOrderKey(projectId, parentFolderId)] ?? [];
    const mergedOrder = mergeOrderedIds(orderedIds, siblings.map((folder) => folder.id));
    const folderById = new Map(siblings.map((folder) => [folder.id, folder]));
    return mergedOrder.map((id) => folderById.get(id)).filter((folder): folder is Folder => !!folder);
  };

  const getTasksForFolder = (folderId: string) => visibleProjectTasks.filter((task) => task.folder_id === folderId);

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

  const startPointerDrag = (event: React.MouseEvent<HTMLElement>, payload: TreeDragPayload) => {
    if (!isTreeReorderMode || event.button !== 0) {
      return;
    }
    event.preventDefault();
    setPointerDragPayload(payload);
  };

  const handleProjectPointerMove = (event: React.MouseEvent<HTMLButtonElement>, targetProjectId: string) => {
    if (!isTreeReorderMode || !pointerDragPayload || pointerDragPayload.kind !== "project") {
      return;
    }
    if (pointerDragPayload.projectId === targetProjectId) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const shouldInsertAfter = event.clientY >= rect.top + rect.height / 2;

    setProjectOrderIds((prev) => {
      const base = mergeOrderedIds(prev, projects.map((project) => project.id));
      return shouldInsertAfter
        ? moveAfter(base, pointerDragPayload.projectId, targetProjectId)
        : moveBefore(base, pointerDragPayload.projectId, targetProjectId);
    });
  };

  const handleFolderPointerMove = (event: React.MouseEvent<HTMLButtonElement>, targetFolder: Folder) => {
    if (!isTreeReorderMode || !pointerDragPayload || pointerDragPayload.kind !== "folder") {
      return;
    }
    const targetParentFolderId = targetFolder.parent_folder_id ?? null;
    if (
      pointerDragPayload.folderId === targetFolder.id ||
      pointerDragPayload.projectId !== targetFolder.project_id ||
      pointerDragPayload.parentFolderId !== targetParentFolderId
    ) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const shouldInsertAfter = event.clientY >= rect.top + rect.height / 2;

    const key = getFolderOrderKey(targetFolder.project_id, targetParentFolderId);
    const siblingIds = visibleFolders
      .filter(
        (folder) =>
          folder.project_id === targetFolder.project_id &&
          (targetParentFolderId ? folder.parent_folder_id === targetParentFolderId : !folder.parent_folder_id),
      )
      .map((folder) => folder.id);

    setFolderOrderByParent((prev) => {
      const base = mergeOrderedIds(prev[key] ?? [], siblingIds);
      const next = shouldInsertAfter
        ? moveAfter(base, pointerDragPayload.folderId, targetFolder.id)
        : moveBefore(base, pointerDragPayload.folderId, targetFolder.id);
      return { ...prev, [key]: next };
    });
  };

  useEffect(() => {
    if (!pointerDragPayload) {
      return;
    }
    const stop = () => setPointerDragPayload(null);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [pointerDragPayload]);

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

  const toEditLinks = (raw: string | null | undefined) => {
    const existing = formatLinks(raw).slice(0, 4).map((link) => ({
      label: link.display_name,
      url: link.url,
    }));
    while (existing.length < 4) {
      existing.push({ label: "", url: "" });
    }
    return existing;
  };

  const toRelatedLinksJson = (links: LinkInput[]) => {
    const validLinks = links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.url.length > 0)
      .slice(0, 4)
      .map((link) => ({
        type: link.url.startsWith("http") ? "URL" : "FilePath",
        url: link.url,
        display_name: link.label || link.url,
      }));
    return validLinks.length > 0 ? JSON.stringify(validLinks) : null;
  };

  const startEditingTask = (task: Task) => {
    setEditTaskName(task.name);
    setEditTaskColor(task.color);
    setEditTaskOverview(task.overview ?? "");
    setEditTaskDetails(task.details ?? "");
    setEditTaskLinks(toEditLinks(task.related_links));
    setIsEditingTask(true);
  };

  const handleEditTaskLinkChange = (index: number, key: keyof LinkInput, value: string) => {
    setEditTaskLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const handleUpdateTask = async () => {
    if (!selectedTaskId || !editTaskName.trim()) {
      return;
    }
    if (editTaskOverview.trim().length > 140) {
      setErrorMessage("概要は140文字以内で入力してください。");
      return;
    }
    try {
      const response = await invoke<ApiResponse<Task>>("update_task", {
        id: selectedTaskId,
        name: editTaskName.trim(),
        color: editTaskColor,
        overview: editTaskOverview.trim() || null,
        details: editTaskDetails.trim() || null,
        relatedLinks: toRelatedLinksJson(editTaskLinks),
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "タスク更新に失敗しました。");
        return;
      }
      setIsEditingTask(false);
      if (selectedFolderId) {
        await loadTasksByFolder(selectedFolderId);
      }
      await loadProjectTasks(selectedProjectId);
    } catch {
      setErrorMessage("タスク更新に失敗しました。");
    }
  };

  const handleArchiveProject = () => {
    if (!selectedProjectId) {
      return;
    }
    const ok = window.confirm("このプロジェクトをアーカイブします。よろしいですか？");
    if (!ok) {
      return;
    }
    setArchivedProjectIds((prev) => (prev.includes(selectedProjectId) ? prev : [...prev, selectedProjectId]));
    setSelectedProjectId("");
    setSelectedFolderId("");
    setSelectedTaskId("");
  };

  const handleUnarchiveProject = () => {
    if (!selectedProjectId) {
      return;
    }
    setArchivedProjectIds((prev) => prev.filter((id) => id !== selectedProjectId));
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) {
      return;
    }
    const ok = window.confirm("このプロジェクトを削除します。よろしいですか？");
    if (!ok) {
      return;
    }
    try {
      const response = await invoke<ApiResponse<Project>>("delete_project", { id: selectedProjectId });
      if (!response.success) {
        setErrorMessage(response.message ?? "プロジェクト削除に失敗しました。");
        return;
      }
      setArchivedProjectIds((prev) => prev.filter((id) => id !== selectedProjectId));
      clearDetailSelection();
      await loadProjects();
    } catch {
      setErrorMessage("プロジェクト削除に失敗しました。");
    }
  };

  const handleArchiveFolder = () => {
    if (!selectedFolderId) {
      return;
    }
    const ok = window.confirm("このフォルダをアーカイブします。よろしいですか？");
    if (!ok) {
      return;
    }
    setArchivedFolderIds((prev) => (prev.includes(selectedFolderId) ? prev : [...prev, selectedFolderId]));
    setSelectedFolderId("");
    setSelectedTaskId("");
  };

  const handleUnarchiveFolder = () => {
    if (!selectedFolderId) {
      return;
    }
    setArchivedFolderIds((prev) => prev.filter((id) => id !== selectedFolderId));
  };

  const handleDeleteFolder = async () => {
    if (!selectedFolderId) {
      return;
    }
    const ok = window.confirm("このフォルダを削除します。よろしいですか？");
    if (!ok) {
      return;
    }
    try {
      const response = await invoke<ApiResponse<Folder>>("delete_folder", { id: selectedFolderId });
      if (!response.success) {
        setErrorMessage(response.message ?? "フォルダ削除に失敗しました。");
        return;
      }
      setArchivedFolderIds((prev) => prev.filter((id) => id !== selectedFolderId));
      setSelectedFolderId("");
      setSelectedTaskId("");
      await loadFolders(selectedProjectId);
      await loadProjectTasks(selectedProjectId);
    } catch {
      setErrorMessage("フォルダ削除に失敗しました。");
    }
  };

  const handleArchiveTask = () => {
    if (!selectedTaskId) {
      return;
    }
    const ok = window.confirm("このタスクをアーカイブします。よろしいですか？");
    if (!ok) {
      return;
    }
    setArchivedTaskIds((prev) => (prev.includes(selectedTaskId) ? prev : [...prev, selectedTaskId]));
    setSelectedTaskId("");
    setIsEditingTask(false);
  };

  const handleUnarchiveTask = () => {
    if (!selectedTaskId) {
      return;
    }
    setArchivedTaskIds((prev) => prev.filter((id) => id !== selectedTaskId));
  };

  const handleDeleteTask = async () => {
    if (!selectedTaskId) {
      return;
    }
    const ok = window.confirm("このタスクを削除します。よろしいですか？");
    if (!ok) {
      return;
    }
    try {
      const response = await invoke<ApiResponse<Task>>("delete_task", { id: selectedTaskId });
      if (!response.success) {
        setErrorMessage(response.message ?? "タスク削除に失敗しました。");
        return;
      }
      setArchivedTaskIds((prev) => prev.filter((id) => id !== selectedTaskId));
      setSelectedTaskId("");
      setIsEditingTask(false);
      if (selectedFolderId) {
        await loadTasksByFolder(selectedFolderId);
      }
      await loadProjectTasks(selectedProjectId);
    } catch {
      setErrorMessage("タスク削除に失敗しました。");
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

  const startEditingWeeklyGoal = (goal: WeeklyGoal) => {
    setEditingWeeklyGoalId(goal.id);
    setEditingWeeklyGoalTarget(goal.target_hours);
  };

  const handleUpdateWeeklyGoal = async (goal: WeeklyGoal) => {
    if (!editingWeeklyGoalId) {
      return;
    }
    if (editingWeeklyGoalTarget <= 0) {
      setErrorMessage("目標時間は1時間以上で入力してください。");
      return;
    }
    try {
      const response = await invoke<ApiResponse<WeeklyGoal>>("update_weekly_goal", {
        id: goal.id,
        targetHours: editingWeeklyGoalTarget,
        actualHours: goal.actual_hours,
      });
      if (!response.success) {
        setErrorMessage(response.message ?? "週目標の更新に失敗しました。");
        return;
      }
      setEditingWeeklyGoalId("");
      await loadWeeklyGoals(weekStartYmd);
    } catch {
      setErrorMessage("週目標の更新に失敗しました。");
    }
  };

  const handleDeleteWeeklyGoal = async (goalId: string) => {
    const ok = window.confirm("この週目標を削除します。よろしいですか？");
    if (!ok) {
      return;
    }
    try {
      const response = await invoke<ApiResponse<WeeklyGoal>>("delete_weekly_goal", { id: goalId });
      if (!response.success) {
        setErrorMessage(response.message ?? "週目標の削除に失敗しました。");
        return;
      }
      if (editingWeeklyGoalId === goalId) {
        setEditingWeeklyGoalId("");
      }
      await loadWeeklyGoals(weekStartYmd);
    } catch {
      setErrorMessage("週目標の削除に失敗しました。");
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
      await loadRecentTaskSessions(selectedTaskId);
      if (activeView === "calendar") {
        await loadCalendarActualForMonth(currentMonth);
      }
      if (activeView === "weekly") {
        await loadWeeklyGoals(weekStartYmd);
        await loadWeeklyActualForRange();
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
        <div className="panel-head-row">
          <h2>プロジェクト構造</h2>
          <div className="panel-head-actions">
            <label className="toggle-inline">
              <input
                type="checkbox"
                checked={isTreeReorderMode}
                onChange={(e) => setIsTreeReorderMode(e.target.checked)}
              />
              並び替えモード
            </label>
            <label className="toggle-inline">
              <input
                type="checkbox"
                checked={showArchivedEntities}
                onChange={(e) => setShowArchivedEntities(e.target.checked)}
              />
              アーカイブ表示
            </label>
          </div>
        </div>
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
          {orderedVisibleProjects.map((project) => {
            const projectExpanded = expandedProjects[project.id] ?? project.id === selectedProjectId;
            const projectFolderRoots = project.id === selectedProjectId ? getChildFolders(project.id, null) : [];

            const renderFolderNode = (folder: Folder, depth: number): React.ReactNode => {
              const childFolders = getChildFolders(folder.project_id, folder.id);
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
                      className={`${folder.id === selectedFolderId && !selectedTaskId ? "tree-node is-active" : "tree-node"}${isTreeReorderMode ? " is-reorder-enabled" : ""}${pointerDragPayload?.kind === "folder" && pointerDragPayload.folderId === folder.id ? " is-dragging" : ""}`}
                      onMouseDown={(event) =>
                        startPointerDrag(event, {
                          kind: "folder",
                          projectId: folder.project_id,
                          folderId: folder.id,
                          parentFolderId: folder.parent_folder_id ?? null,
                        })
                      }
                      onMouseMove={(event) => handleFolderPointerMove(event, folder)}
                      onClick={() => selectFolderNode(folder.id, folder.project_id)}
                    >
                      <span className="tree-node-main">
                        <span className="folder-icon" style={{ color: folder.color }} aria-hidden="true" />
                        {folder.name}
                      </span>
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
                    className={`${project.id === selectedProjectId && !selectedFolderId && !selectedTaskId ? "tree-node is-active" : "tree-node"}${isTreeReorderMode ? " is-reorder-enabled" : ""}${pointerDragPayload?.kind === "project" && pointerDragPayload.projectId === project.id ? " is-dragging" : ""}`}
                    onMouseDown={(event) => startPointerDrag(event, { kind: "project", projectId: project.id })}
                    onMouseMove={(event) => handleProjectPointerMove(event, project.id)}
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
                <div className="entity-actions">
                  {!archivedProjectSet.has(selectedProject.id) && (
                    <button type="button" className="btn-archive" onClick={handleArchiveProject}>
                      アーカイブ
                    </button>
                  )}
                  {archivedProjectSet.has(selectedProject.id) && (
                    <button type="button" className="btn-archive" onClick={handleUnarchiveProject}>
                      アーカイブ解除
                    </button>
                  )}
                  <button type="button" className="btn-danger" onClick={() => { void handleDeleteProject(); }}>
                    削除
                  </button>
                </div>
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
              <div className="task-form-grid">
                <input
                  placeholder="フォルダ名"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                />
                <label className="color-input">
                  色
                  <input
                    type="color"
                    value={newFolderColor}
                    onChange={(event) => setNewFolderColor(event.target.value)}
                  />
                </label>
                <textarea
                  placeholder="概要（140文字以内）"
                  maxLength={140}
                  value={newFolderDescription}
                  onChange={(event) => setNewFolderDescription(event.target.value)}
                />
                <textarea
                  placeholder="詳細（文字数制限なし）"
                  value={newFolderDetails}
                  onChange={(event) => setNewFolderDetails(event.target.value)}
                />
                <select value={newFolderParentId} onChange={(event) => setNewFolderParentId(event.target.value)}>
                  <option value="">ルート（プロジェクト直下）</option>
                  {visibleFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-main" onClick={handleCreateFolder}>
                  フォルダ追加
                </button>
              </div>
            )}

            {projectCreateKind === "task" && (
              <div className="task-form-grid">
                <select value={projectTaskFolderId} onChange={(event) => setProjectTaskFolderId(event.target.value)}>
                  <option value="">プロジェクト直下（フォルダ未指定）</option>
                  {visibleFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="タスク名"
                  value={newTaskName}
                  onChange={(event) => setNewTaskName(event.target.value)}
                />
                <label className="color-input">
                  色
                  <input
                    type="color"
                    value={newTaskColor}
                    onChange={(event) => setNewTaskColor(event.target.value)}
                  />
                </label>
                <textarea
                  placeholder="概要（140文字以内）"
                  maxLength={140}
                  value={newTaskOverview}
                  onChange={(event) => setNewTaskOverview(event.target.value)}
                />
                <textarea
                  placeholder="詳細（文字数制限なし）"
                  value={newTaskDetails}
                  onChange={(event) => setNewTaskDetails(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-main"
                  onClick={() => {
                    void handleCreateTask(projectTaskFolderId || undefined);
                  }}
                >
                  タスク追加
                </button>
                {visibleFolders.length === 0 && <p className="empty-note">フォルダ未作成でも「プロジェクト直下」に追加できます。</p>}
              </div>
            )}
          </div>
        )}

        {selectedFolder && !selectedTask && (
          <div className="detail-stack">
            <div className="task-detail">
              <h3>
                <span className="color-dot" style={{ backgroundColor: selectedFolder.color }} />
                {selectedFolder.name}
              </h3>
              {selectedFolder.description && <p>{selectedFolder.description}</p>}
              <p>
                <strong>所属プロジェクト:</strong> {selectedProject?.name ?? "-"}
              </p>
              <p>
                <strong>タスク数:</strong> {selectedFolderTasks.length}
              </p>
              {selectedFolder.details && (
                <p style={{ whiteSpace: "pre-wrap" }}>{selectedFolder.details}</p>
              )}
              <div className="entity-actions">
                {!archivedFolderSet.has(selectedFolder.id) && (
                  <button type="button" className="btn-archive" onClick={handleArchiveFolder}>
                    アーカイブ
                  </button>
                )}
                {archivedFolderSet.has(selectedFolder.id) && (
                  <button type="button" className="btn-archive" onClick={handleUnarchiveFolder}>
                    アーカイブ解除
                  </button>
                )}
                <button type="button" className="btn-danger" onClick={() => { void handleDeleteFolder(); }}>
                  削除
                </button>
              </div>
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
              {!isEditingTask ? (
                <>
                  <div className="detail-view-head">
                    <h3>{selectedTask.name}</h3>
                    <button type="button" className="btn-edit" onClick={() => startEditingTask(selectedTask)}>
                      編集
                    </button>
                  </div>
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

                  <div className="entity-actions">
                    {!archivedTaskSet.has(selectedTask.id) && (
                      <button type="button" className="btn-archive" onClick={handleArchiveTask}>
                        アーカイブ
                      </button>
                    )}
                    {archivedTaskSet.has(selectedTask.id) && (
                      <button type="button" className="btn-archive" onClick={handleUnarchiveTask}>
                        アーカイブ解除
                      </button>
                    )}
                    <button type="button" className="btn-danger" onClick={() => { void handleDeleteTask(); }}>
                      削除
                    </button>
                  </div>

                  <div className="task-session-block">
                    <strong>直近の記録</strong>
                    <ul className="task-session-list">
                      {taskRecentSessions.map((session) => (
                        <li key={session.id}>
                          <span>{ymdToLabel(session.date)} {unixToHm(session.start_time)} - {session.end_time ? unixToHm(session.end_time) : "--:--"}</span>
                          <strong>{secondsToMinutesLabel(getSessionDurationSeconds(session))}</strong>
                        </li>
                      ))}
                      {taskRecentSessions.length === 0 && <li>記録はまだありません。</li>}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="task-form-grid">
                  <label className="form-label">タスク名
                    <input value={editTaskName} onChange={(e) => setEditTaskName(e.target.value)} />
                  </label>
                  <label className="color-input">色
                    <input type="color" value={editTaskColor} onChange={(e) => setEditTaskColor(e.target.value)} />
                  </label>
                  <label className="form-label">概要（140文字以内）
                    <input maxLength={140} value={editTaskOverview} onChange={(e) => setEditTaskOverview(e.target.value)} />
                  </label>
                  <label className="form-label">詳細
                    <textarea value={editTaskDetails} onChange={(e) => setEditTaskDetails(e.target.value)} />
                  </label>
                  <div className="links-block">
                    <p>関連リンク（最大4件）</p>
                    {editTaskLinks.map((link, index) => (
                      <div className="link-row" key={`edit-link-${index}`}>
                        <input
                          placeholder="表示名"
                          value={link.label}
                          onChange={(event) => handleEditTaskLinkChange(index, "label", event.target.value)}
                        />
                        <input
                          placeholder="URL または パス"
                          value={link.url}
                          onChange={(event) => handleEditTaskLinkChange(index, "url", event.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="edit-actions">
                    <button type="button" onClick={() => setIsEditingTask(false)}>キャンセル</button>
                    <button type="button" className="btn-main" onClick={handleUpdateTask}>保存</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </article>
      )}
    </section>
  );

  const renderCalendarView = () => (
    <section className={selectedScheduleDetail?.source === "calendar" ? "calendar-wrap has-detail" : "calendar-wrap"}>
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
            const dayEvents = calendarEvents
              .filter((ev) => ev.date === ymd)
              .sort((a, b) => a.start_minute - b.start_minute);
            const dayActualSeconds = calendarActualByDate[ymd] ?? 0;
            const inCurrentMonth = date.getMonth() === currentMonth.getMonth();
            return (
              <div
                key={ymd}
                className={inCurrentMonth ? (dayEvents.length > 0 ? "calendar-cell is-clickable" : "calendar-cell") : "calendar-cell is-outside"}
                onClick={() => {
                  if (dayEvents.length === 0) {
                    return;
                  }
                  setSelectedScheduleDetail({ kind: "event", source: "calendar", event: dayEvents[0] });
                }}
              >
                <div className="calendar-day">{date.getDate()}</div>
                {dayActualSeconds > 0 && <p className="calendar-actual">実績 {secondsToHoursLabel(dayActualSeconds)}</p>}
                <ul className="calendar-events-list">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        title={ev.note || ""}
                        className={selectedScheduleDetail?.kind === "event" && selectedScheduleDetail.event.id === ev.id ? "calendar-event-button is-selected" : "calendar-event-button"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedScheduleDetail({ kind: "event", source: "calendar", event: ev });
                        }}
                      >
                        {minuteToLabel(ev.start_minute)} - {ev.title}
                      </button>
                    </li>
                  ))}
                  {dayEvents.length > 3 && (
                    <li>
                      <button
                        type="button"
                        className="calendar-event-button calendar-event-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedScheduleDetail({ kind: "event", source: "calendar", event: dayEvents[3] });
                        }}
                      >
                        +{dayEvents.length - 3}件
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </article>

      {selectedScheduleDetail?.source === "calendar" && (
        <article className="panel schedule-detail-panel">
          {renderScheduleInspector()}
        </article>
      )}
    </section>
  );

  const renderScheduleInspectorEmpty = (message: string) => (
    <div className="schedule-detail-empty">
      <h3>詳細</h3>
      <p>{message}</p>
    </div>
  );

  const renderScheduleInspector = () => {
    if (!selectedScheduleDetail) {
      return renderScheduleInspectorEmpty("イベントまたは記録を選択してください。");
    }

    const isEvent = selectedScheduleDetail.kind === "event";
    const label = isEvent ? "予定" : "成果記録";
    const taskName = selectedScheduleTask?.name ?? (isEvent ? (selectedScheduleDetail.event.task_id ? "読み込み中または未取得" : "タスク未指定") : "関連タスク");

    return (
      <div className="schedule-detail-card">
        <div className="detail-panel-head">
          <div>
            <h2>{label}の詳細</h2>
            <p className="schedule-detail-meta">{selectedScheduleDetail.source === "calendar" ? "月間カレンダー" : "週間タイムライン"}</p>
          </div>
          <button type="button" className="detail-panel-close" onClick={() => setSelectedScheduleDetail(null)}>
            閉じる
          </button>
        </div>

        {isEvent ? (
          <div className="schedule-detail-body">
            <span className="schedule-detail-badge is-plan">予定</span>
            <h3>{selectedScheduleDetail.event.title}</h3>
            <dl className="schedule-detail-list">
              <div>
                <dt>日付</dt>
                <dd>{ymdToLabel(selectedScheduleDetail.event.date)}</dd>
              </div>
              <div>
                <dt>時間</dt>
                <dd>{minuteToLabel(selectedScheduleDetail.event.start_minute)} - {minuteToLabel(selectedScheduleDetail.event.end_minute)}</dd>
              </div>
              <div>
                <dt>タスク</dt>
                <dd>{taskName}</dd>
              </div>
              <div>
                <dt>メモ</dt>
                <dd>{selectedScheduleDetail.event.note || "-"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="schedule-detail-body">
            <span className="schedule-detail-badge is-record">成果記録</span>
            <h3>{selectedScheduleTask?.name ?? "作業記録"}</h3>
            <dl className="schedule-detail-list">
              <div>
                <dt>日付</dt>
                <dd>{ymdToLabel(selectedScheduleDetail.session.date)}</dd>
              </div>
              <div>
                <dt>時間</dt>
                <dd>{unixToHm(selectedScheduleDetail.session.start_time)} - {selectedScheduleDetail.session.end_time ? unixToHm(selectedScheduleDetail.session.end_time) : "--:--"}</dd>
              </div>
              <div>
                <dt>実績</dt>
                <dd>{secondsToMinutesLabel(getSessionDurationSeconds(selectedScheduleDetail.session))}</dd>
              </div>
              <div>
                <dt>タスク</dt>
                <dd>{selectedScheduleTask?.name ?? selectedScheduleDetail.session.task_id}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    );
  };

  const renderWeeklyView = () => (
    <section className="weekly-wrap">
      <article className="panel weekly-panel">
        <div className="calendar-head">
          <div>
            <h2>週予定・週目標</h2>
            <p className="weekly-actual-summary">今週実績: {secondsToHoursLabel(weeklyActualTotalSeconds)}</p>
          </div>
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

        <div className="weekly-goal-strip">
          <strong>今週の目標</strong>
          <div className="weekly-goal-strip-list">
            {weeklyGoals.map((goal) => {
              const project = projects.find((item) => item.id === goal.project_id);
              const task = projectTasks.find((item) => item.id === goal.task_id);
              return (
                <span key={goal.id} className={goal.task_id ? "weekly-goal-chip is-task" : "weekly-goal-chip is-project"}>
                  {task?.name ?? project?.name ?? "未分類"} {goal.target_hours}h
                </span>
              );
            })}
            {weeklyGoals.length === 0 && <span className="weekly-goal-strip-empty">週目標なし</span>}
          </div>
        </div>

        <div className="weekly-board-scroll">
          <div className="weekly-board weekly-board-timeline">
            <div className="weekly-corner-cell">時間軸</div>
            {weekDays.map((d) => {
              const ymd = dateToYmdNumber(d);
              const dayActualSeconds = weeklyActualByDate[ymd] ?? 0;
              return (
                <div key={`head-${ymd}`} className="weekly-day-head-cell">
                  <p className={d.getDay() === 6 ? "weekly-day-title is-sat" : d.getDay() === 0 ? "weekly-day-title is-sun" : "weekly-day-title"}>
                    {d.getMonth() + 1}/{d.getDate()} ({["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})
                  </p>
                  <div className="weekly-day-head-meta">
                    <span className="weekly-day-badge is-actual">実績 {secondsToHoursLabel(dayActualSeconds)}</span>
                    <span className="weekly-day-badge is-plan">予定 {(weeklyCalendarEvents.filter((event) => event.date === ymd)).length}件</span>
                  </div>
                </div>
              );
            })}

            <div className="weekly-time-column">
              {Array.from({ length: 16 }, (_, index) => 7 + index).map((hour) => (
                <div key={`hour-${hour}`} className="weekly-time-label">
                  {pad2(hour)}:00
                </div>
              ))}
            </div>

            {weekDays.map((d) => {
              const ymd = dateToYmdNumber(d);
              const dayEvents = weeklyCalendarEvents
                .filter((event) => event.date === ymd)
                .sort((a, b) => a.start_minute - b.start_minute);
              const daySessions = (weeklySessionsByDate[ymd] ?? []).sort((a, b) => a.start_time - b.start_time);

              return (
                <div key={ymd} className="weekly-day-column">
                  <div className="weekly-day-timeline-grid">
                    {Array.from({ length: 16 }, (_, index) => (
                      <div key={`${ymd}-line-${index}`} className="weekly-hour-line" />
                    ))}
                  </div>

                  {dayEvents.map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      className={selectedScheduleDetail?.kind === "event" && selectedScheduleDetail.event.id === event.id ? "weekly-timeline-item is-plan is-selected" : "weekly-timeline-item is-plan"}
                      style={getTimelineBlockStyle(event.start_minute, event.end_minute, 7 * 60, 23 * 60)}
                      title={`${minuteToLabel(event.start_minute)} - ${minuteToLabel(event.end_minute)} ${event.title}`}
                      onClick={() => setSelectedScheduleDetail({ kind: "event", source: "weekly", event })}
                    >
                      <span className="weekly-timeline-time">{minuteToLabel(event.start_minute)} - {minuteToLabel(event.end_minute)}</span>
                      <strong>{event.title}</strong>
                    </button>
                  ))}

                  {daySessions.map((session) => {
                    const startMinute = unixToMinuteOfDay(session.start_time);
                    const endMinute = session.end_time
                      ? unixToMinuteOfDay(session.end_time)
                      : startMinute + Math.round(getSessionDurationSeconds(session) / 60);

                    return (
                      <button
                        type="button"
                        key={session.id}
                        className={selectedScheduleDetail?.kind === "session" && selectedScheduleDetail.session.id === session.id ? "weekly-timeline-item is-record is-selected" : "weekly-timeline-item is-record"}
                        style={getTimelineBlockStyle(startMinute, endMinute, 7 * 60, 23 * 60)}
                        title={`${unixToHm(session.start_time)} - ${session.end_time ? unixToHm(session.end_time) : "--:--"}`}
                        onClick={() => setSelectedScheduleDetail({ kind: "session", source: "weekly", session })}
                      >
                        <span className="weekly-timeline-time">
                          {unixToHm(session.start_time)} - {session.end_time ? unixToHm(session.end_time) : "--:--"}
                        </span>
                        <strong>{secondsToMinutesLabel(getSessionDurationSeconds(session))}</strong>
                      </button>
                    );
                  })}

                  {dayEvents.length === 0 && daySessions.length === 0 && <p className="weekly-day-empty">予定も記録もありません</p>}
                </div>
              );
            })}
          </div>
        </div>
      </article>

      <article className="panel weekly-form-panel">
        {selectedScheduleDetail?.source === "weekly" && renderScheduleInspector()}

        <h2>週目標追加</h2>
        <div className="task-form-grid">
          <select value={weeklyGoalType} onChange={(e) => setWeeklyGoalType(e.target.value as "project" | "task")}>
            <option value="project">プロジェクト目標</option>
            <option value="task">タスク目標</option>
          </select>

          <select value={weeklyProjectId} onChange={(e) => setWeeklyProjectId(e.target.value)}>
            <option value="">プロジェクト選択</option>
            {visibleProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {weeklyGoalType === "task" && (
            <select value={weeklyTaskId} onChange={(e) => setWeeklyTaskId(e.target.value)}>
              <option value="">タスク選択</option>
              {visibleProjectTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          )}

          <label className="form-label">
            目標時間（h）
            <input
              type="number"
              min={1}
              step={0.5}
              value={weeklyTargetHours}
              onChange={(e) => setWeeklyTargetHours(Number(e.target.value) || 1)}
            />
          </label>

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
                  {editingWeeklyGoalId === goal.id ? (
                    <div className="weekly-goal-editor">
                      <label>
                        目標
                        <input
                          type="number"
                          min={1}
                          step={0.5}
                          value={editingWeeklyGoalTarget}
                          onChange={(e) => setEditingWeeklyGoalTarget(Number(e.target.value) || 1)}
                        />
                      </label>
                      <p>実績 {goal.actual_hours}h</p>
                    </div>
                  ) : (
                    <p>
                      目標 {goal.target_hours}h / 実績 {goal.actual_hours}h
                    </p>
                  )}
                </div>
                <div className="weekly-goal-actions">
                  {task && (
                    <button type="button" onClick={() => setTimerTargetTask(task)}>
                      タイマー開始
                    </button>
                  )}
                  {editingWeeklyGoalId !== goal.id && (
                    <button type="button" onClick={() => startEditingWeeklyGoal(goal)}>
                      編集
                    </button>
                  )}
                  {editingWeeklyGoalId === goal.id && (
                    <button type="button" onClick={() => { void handleUpdateWeeklyGoal(goal); }}>
                      保存
                    </button>
                  )}
                  {editingWeeklyGoalId === goal.id && (
                    <button type="button" onClick={() => setEditingWeeklyGoalId("")}>キャンセル</button>
                  )}
                  <button type="button" className="btn-danger" onClick={() => { void handleDeleteWeeklyGoal(goal.id); }}>
                    削除
                  </button>
                </div>
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
