import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListTodo,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import sendAction from "../services/server.js";
import { useToast } from "../context/ToastContext.jsx";
import { useNotifications } from "../context/NotificationContext.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
import TaskForm from "../components/TaskForm.jsx";
import ReminderSettings from "../components/ReminderSettings.jsx";
import { formatTaskDate, isOverdue } from "../utils/taskDates.js";
const filters = [
  ["all", "All tasks"],
  ["pending", "Pending"],
  ["completed", "Completed"],
  ["overdue", "Overdue"],
];
export default function Tasks() {
  // Displays task search, filters, and reminders.
  usePageTitle("Tasks & reminders");
  const notify = useToast();
  const { refresh: refreshNotifications } = useNotifications();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({
    tasks: [],
    counts: {},
    pagination: {
      pages: 1,
      total: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const requestId = useRef(0);
  const refresh = useCallback(
    () =>
      // Requests a fresh copy of saved records.
      setRevision(
        (n) =>
          // Increments the refresh counter.
          n + 1,
      ),
    [],
  );
  const taskId = params.get("task");
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const timer = setTimeout(() => {
      // Runs this step after a short delay.
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () =>
      // Stops the timer when no longer needed.
      clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const controller = new AbortController();
    let busy = false;
    const id = ++requestId.current;
    async function load(first = false) {
      // Loads the latest data for this page.
      if (busy) return;
      busy = true;
      if (first) setLoading(true);
      try {
        const result = await sendAction(
          "listTasks",
          {
            status,
            q: query,
            page,
            limit: 20,
          },
          {
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted || id !== requestId.current) return;
        setData(result.data);
        setError("");
        if (page > result.data.pagination.pages)
          setPage(result.data.pagination.pages);
      } catch (err) {
        if (!controller.signal.aborted && id === requestId.current)
          setError(
            err.message ||
              "Could not load tasks. Check your connection and try again.",
          );
      } finally {
        busy = false;
        if (!controller.signal.aborted && id === requestId.current)
          setLoading(false);
      }
    }
    void load(true);
    const timer = setInterval(load, 30000);
    return () => {
      // Cancels pending work and releases resources.
      controller.abort();
      clearInterval(timer);
    };
  }, [status, query, page, revision]);
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    if (!taskId) return;
    const controller = new AbortController();
    sendAction(
      "getTask",
      {
        id: taskId,
      },
      {
        signal: controller.signal,
      },
    )
      .then(({ data: result }) =>
        // Handles the completed operation.
        setEditor({
          task: result.task,
        }),
      )
      .catch((err) => {
        // Handles a failed operation.
        if (!controller.signal.aborted)
          notify(err.message || "Could not open this task.");
      });
    return () =>
      // Cancels pending work and releases resources.
      controller.abort();
  }, [taskId, notify]);
  function closeEditor() {
    // Closes the task editor and clears its link.
    setEditor(null);
    if (taskId)
      setParams(
        {},
        {
          replace: true,
        },
      );
  }
  function saved(message) {
    // Refreshes the page after a saved change.
    closeEditor();
    notify(message);
    refresh();
    refreshNotifications();
  }
  async function toggleTask(task) {
    // Completes or reopens the selected task.
    setBusyId(task._id);
    try {
      await sendAction("updateTask", {
        id: task._id,
        completed: !task.completed,
      });
      notify(
        task.completed ? "Task reopened." : "One more thing done. Nice work!",
      );
      refresh();
      refreshNotifications();
    } catch (err) {
      notify(err.message || "Could not update the task.");
    } finally {
      setBusyId(null);
    }
  }
  async function removeTask(task) {
    // Deletes the selected task and refreshes reminders.
    setBusyId(task._id);
    try {
      await sendAction("deleteTask", {
        id: task._id,
      });
      setDeleteId(null);
      notify("Task deleted.");
      refresh();
      refreshNotifications();
    } catch (err) {
      notify(err.message || "Could not delete the task.");
    } finally {
      setBusyId(null);
    }
  }
  return (
    <section className="tasks-page shell">
      <Link to="/dashboard" className="task-back">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>
      <div className="tasks-heading">
        <div>
          <h1>Tasks & reminders</h1>
          <p>Plan your day, track progress, and keep your deadlines close.</p>
        </div>
        <button
          className="button"
          onClick={() =>
            // Opens the form for a new item.
            setEditor({
              task: null,
            })
          }
        >
          <Plus size={18} /> Add task
        </button>
      </div>
      <div className="task-stats" aria-label="Task summary">
        <div>
          <span className="stat-icon purple">
            <ListTodo size={20} />
          </span>
          <div>
            <b>{data.counts.all ?? "—"}</b>
            <span>Total tasks</span>
          </div>
        </div>
        <div>
          <span className="stat-icon blue">
            <Circle size={20} />
          </span>
          <div>
            <b>{data.counts.pending ?? "—"}</b>
            <span>To get done</span>
          </div>
        </div>
        <div>
          <span className="stat-icon green">
            <CheckCheck size={20} />
          </span>
          <div>
            <b>{data.counts.completed ?? "—"}</b>
            <span>Completed</span>
          </div>
        </div>
        <div>
          <span className="stat-icon orange">
            <CalendarClock size={20} />
          </span>
          <div>
            <b>{data.counts.overdue ?? "—"}</b>
            <span>Overdue</span>
          </div>
        </div>
      </div>
      <section className="task-board" aria-label="Your task list">
        <div className="task-progress-summary">
          <h2>Your progress</h2>
          <div className="task-progress-line">
            <progress aria-label="Completed tasks" value={data.counts.completed || 0} max={data.counts.all || 1} />
            <span>{data.counts.completed ?? "—"} of {data.counts.all ?? "—"} done</span>
          </div>
        </div>
        <div className="task-toolbar">
          <div className="task-tabs" aria-label="Filter tasks">
            {filters.map(([value, label]) => (
              // Builds a value for each item.
              <button
                key={value}
                aria-pressed={status === value}
                onClick={() => {
                  // Applies the task filter and resets pagination.
                  setStatus(value);
                  setPage(1);
                  setDeleteId(null);
                }}
              >
                {label}
                <span>{data.counts[value] ?? "—"}</span>
              </button>
            ))}
          </div>
          <div className="task-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Search tasks"
              placeholder="Search your tasks…"
              maxLength={100}
              value={search}
              onChange={(event) =>
                // Updates the selected value.
                setSearch(event.target.value)
              }
            />
            {search && (
              <button
                aria-label="Clear task search"
                onClick={() =>
                  // Clears the search text.
                  setSearch("")
                }
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="task-error task-load-error" role="alert">
            {error} <button onClick={refresh}>Retry</button>
          </p>
        )}
        {loading ? (
          <div className="task-empty" role="status">
            <span className="spinner" />
            Loading your tasks…
          </div>
        ) : error ? null : data.tasks.length === 0 ? (
          <div className="task-empty">
            <span className="empty-task-icon">
              <CheckCheck size={33} />
            </span>
            <h2>
              {query
                ? "Nothing matched your search"
                : status === "all"
                  ? "Make room for your first task"
                  : "A clear list, a clear mind"}
            </h2>
            <p>
              {query
                ? "Try a different title, description, or category."
                : status === "all"
                  ? "Add a small to-do and take it one step at a time."
                  : "No tasks in this view. Your other plans are a tab away."}
            </p>
            {status === "all" && !query && (
              <button
                className="button button-outline button-small"
                onClick={() =>
                  // Opens the form for a new item.
                  setEditor({
                    task: null,
                  })
                }
              >
                <Plus size={15} /> Create your first task
              </button>
            )}
          </div>
        ) : (
          <ul className="task-list">
            {data.tasks.map((task) => (
              // Builds a value for each item.
              <li
                className={`task-row ${task.completed ? "is-complete" : ""}`}
                key={task._id}
              >
                <button
                  className="task-check"
                  aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
                  aria-pressed={task.completed}
                  disabled={busyId !== null}
                  onClick={() =>
                    // Completes or reopens the selected task.
                    toggleTask(task)
                  }
                >
                  {task.completed && <Check size={15} />}
                </button>
                <div className="task-content">
                  <div className="task-title-line">
                    <h2>{task.title}</h2>
                    <span className={`priority-pill ${task.priority}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="task-description">{task.description}</p>
                  )}
                  <div className="task-meta">
                    <span className="task-category">{task.category}</span>
                    <time
                      className={isOverdue(task) ? "task-overdue" : ""}
                      dateTime={task.dueAt || undefined}
                    >
                      <CalendarClock size={12} />
                      {formatTaskDate(task.dueAt)}
                      {isOverdue(task) ? " · Overdue" : ""}
                    </time>
                  </div>
                  {deleteId === task._id && (
                    <div className="task-delete-confirm">
                      <span>Delete this task permanently?</span>
                      <button
                        disabled={busyId !== null}
                        onClick={() =>
                          // Deletes the selected task and refreshes reminders.
                          removeTask(task)
                        }
                      >
                        Yes, delete
                      </button>
                      <button
                        disabled={busyId !== null}
                        onClick={() =>
                          // Shows or hides the delete confirmation.
                          setDeleteId(null)
                        }
                      >
                        Keep task
                      </button>
                    </div>
                  )}
                </div>
                <div className="task-actions">
                  <button
                    className="icon-action"
                    aria-label={`Edit ${task.title}`}
                    disabled={busyId !== null}
                    onClick={() =>
                      // Opens the selected item for editing.
                      setEditor({
                        task,
                      })
                    }
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-action danger-action"
                    aria-label={`Delete ${task.title}`}
                    disabled={busyId !== null}
                    onClick={() =>
                      // Shows or hides the delete confirmation.
                      setDeleteId(deleteId === task._id ? null : task._id)
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="task-pagination">
          <span>
            {data.pagination.total}{" "}
            {data.pagination.total === 1 ? "task" : "tasks"} in this view
          </span>
          <div>
            <button
              aria-label="Previous task page"
              disabled={loading || page <= 1}
              onClick={() =>
                // Moves to the previous results page.
                setPage(
                  (n) =>
                    // Moves to the previous results page.
                    n - 1,
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {data.pagination.pages}
            </span>
            <button
              aria-label="Next task page"
              disabled={loading || page >= data.pagination.pages}
              onClick={() =>
                // Moves to the next results page.
                setPage(
                  (n) =>
                    // Moves to the next results page.
                    n + 1,
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <ReminderSettings />
      <p className="task-private-note">
        <RotateCcw size={12} />
        Your list refreshes every 30 seconds. Tasks and reminders are visible
        only to you.
      </p>
      {editor && (
        <TaskForm
          key={editor.task?._id || "new"}
          task={editor.task}
          onClose={closeEditor}
          onSaved={saved}
        />
      )}
    </section>
  );
}
