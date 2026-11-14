import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCheck,
  CircleCheck,
  Clock3,
  LockKeyhole,
  Plus,
  StickyNote,
  Wallet,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { tools } from "../utils/tools.js";
import { formatTaskDate, isOverdue, todayBounds } from "../utils/taskDates.js";
import sendAction from "../services/server.js";
import { currentMonth, money } from "../utils/expenses.js";
import usePageTitle from "../hooks/usePageTitle.js";
const activityLabels = {
  task_created: "Task added",
  task_updated: "Task updated",
  task_completed: "Task completed",
  task_reopened: "Task reopened",
  task_deleted: "Task deleted",
  expense_created: "Expense added",
  expense_updated: "Expense updated",
  expense_deleted: "Expense deleted",
  note_created: "Note added",
  note_updated: "Note updated",
  note_deleted: "Note deleted",
};
export default function Dashboard() {
  // Displays tasks, spending, notes, and activity.
  usePageTitle("Your dashboard");
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [spending, setSpending] = useState(null);
  const [notes, setNotes] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const controller = new AbortController();
    let busy = false;
    async function load() {
      // Loads the latest data for this page.
      if (busy) return;
      busy = true;
      try {
        const [tasks, thoughts, activity, expenses] = await Promise.all([
          sendAction("todayTasks", todayBounds(), {
            signal: controller.signal,
          }),
          sendAction(
            "listNotes",
            {},
            {
              signal: controller.signal,
            },
          ),
          sendAction(
            "recentActivity",
            {},
            {
              signal: controller.signal,
            },
          ),
          sendAction(
            "expenseSummary",
            {
              month: currentMonth(),
            },
            {
              signal: controller.signal,
            },
          ),
        ]);
        if (!controller.signal.aborted) {
          setSummary(tasks.data);
          setNotes(thoughts.data);
          setSpending(expenses.data);
          setActivities(activity.data.activities);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError("Could not load your dashboard. Check your connection.");
      } finally {
        busy = false;
      }
    }
    void load();
    const timer = setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => {
      // Cancels pending work and releases resources.
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [revision]);
  const joined = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(user.createdAt));
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return (
    <section className="dashboard-page shell">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL WORKSPACE</div>
          <h1>
            Hello, {user.name.split(" ")[0]}
            <span className="brand-accent">.</span>
          </h1>
          <p>A home for your everyday. Let’s make it yours.</p>
        </div>
        <span className="today-date">
          <Clock3 size={16} />
          {today}
        </span>
      </div>
      <div className="account-banner">
        <CircleCheck size={22} />
        <div>
          <b>Your day, a little more organised.</b>
          <p>
            Keep your tasks close and let reminders take care of the deadlines.
          </p>
        </div>
        <Link to="/tasks" className="ready-badge">
          Open my tasks →
        </Link>
      </div>
      {error && (
        <p className="task-error" role="alert">
          {error}{" "}
          <button
            onClick={() =>
              // Requests fresh server data.
              setRevision(
                (n) =>
                  // Increments the refresh counter.
                  n + 1,
              )
            }
          >
            Retry
          </button>
        </p>
      )}
      <div className="dashboard-grid">
        <article className="module-card">
          <div className="flex items-center justify-between">
            <span className="tool-icon green">
              <CheckCheck size={22} />
            </span>
            <span className="tool-status available-tag">Live</span>
          </div>
          <h2>Today’s tasks</h2>
          <div className="dashboard-task-numbers">
            <b>
              {summary ? summary.dueToday : "—"}
              <span>due today</span>
            </b>
            <b>
              {summary ? summary.completedToday : "—"}
              <span>completed today</span>
            </b>
          </div>
          <p>
            {summary?.overdue
              ? `${summary.overdue} overdue ${summary.overdue === 1 ? "task needs" : "tasks need"} a little attention.`
              : summary
                ? "A fresh day to make a little progress."
                : "Loading your plans…"}
          </p>
          <Link className="text-link" to="/tasks">
            Manage tasks <ArrowRight size={15} />
          </Link>
        </article>
        <article className="module-card">
          <div className="flex items-center justify-between">
            <span className="tool-icon orange">
              <Wallet size={22} />
            </span>
            <span className="tool-status available-tag">Live</span>
          </div>
          <h2>Monthly spending</h2>
          <div className="dashboard-spending-number">
            {spending ? money(spending.totalPaise) : "—"}
            <small>
              {spending
                ? `${spending.count} expenses this month`
                : "Loading your spending…"}
            </small>
          </div>
          <p
            className={
              spending?.alerts.length ? "dashboard-expense-warning" : ""
            }
          >
            {spending?.remainingPaise === null
              ? "Set a monthly budget to track what’s left."
              : spending
                ? spending.remainingPaise < 0
                  ? `${money(-spending.remainingPaise)} over your monthly budget.`
                  : `${money(spending.remainingPaise)} remaining in your budget.`
                : "Your spending summary will appear here."}
          </p>
          <Link className="text-link" to="/expenses">
            Manage expenses <ArrowRight size={15} />
          </Link>
        </article>
        <article className="module-card">
          <div className="flex items-center justify-between">
            <span className="tool-icon purple">
              <StickyNote size={22} />
            </span>
            <span className="tool-status available-tag">Live</span>
          </div>
          <h2>Your quick notes</h2>
          <div className="dashboard-spending-number">
            {notes ? notes.total : "—"}
            <small>
              {notes
                ? `${notes.pinned} pinned for later`
                : "Loading your notes…"}
            </small>
          </div>
          <p>
            {notes?.notes[0]?.title ||
              "A handy place for thoughts you want to keep."}
          </p>
          <Link className="text-link" to="/notes">
            Open your notes <ArrowRight size={15} />
          </Link>
        </article>
      </div>
      <section className="panel today-tasks-panel">
        <div className="panel-heading">
          <h2>On your list today</h2>
          <Link to="/tasks" className="text-link">
            All tasks <ArrowRight size={14} />
          </Link>
        </div>
        {!summary ? (
          <p className="muted text-sm">
            {error
              ? "Your task summary is unavailable."
              : "Loading today’s tasks…"}
          </p>
        ) : summary.tasks.length ? (
          <ul className="dashboard-today-list">
            {summary.tasks.map((task) => (
              // Builds a value for each item.
              <li key={task._id}>
                <span className={`priority-dot ${task.priority}`} />
                <Link to={`/tasks?task=${task._id}`}>
                  {task.title}
                  <span>{task.category}</span>
                </Link>
                <time
                  className={isOverdue(task) ? "task-overdue" : ""}
                  dateTime={task.dueAt}
                >
                  {formatTaskDate(task.dueAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dashboard-today-empty">
            <CheckCheck size={23} />
            <div>
              <b>No pending deadlines today</b>
              <p>
                You have a little breathing room. Plan your next small step.
              </p>
            </div>
            <Link to="/tasks" className="text-link">
              <Plus size={14} />
              Add a task
            </Link>
          </div>
        )}
        {summary?.dueToday > 8 && (
          <Link to="/tasks" className="text-link">
            View all {summary.dueToday} tasks due today <ArrowRight size={14} />
          </Link>
        )}
      </section>
      <div className="dashboard-bottom">
        <article className="panel">
          <div className="panel-heading">
            <h2>Recent activity</h2>
            <span className="muted text-xs">Your workspace</span>
          </div>
          <div className="activity-list">
            {activities.map((item) => (
              // Builds a value for each item.
              <div className="activity-item" key={item._id}>
                <span className="activity-icon">
                  <CheckCheck size={17} />
                </span>
                <div>
                  <b>{activityLabels[item.action]}</b>
                  <p>{item.title}</p>
                </div>
                <time dateTime={item.createdAt}>
                  {formatTaskDate(item.createdAt)}
                </time>
              </div>
            ))}
            <div className="activity-item">
              <span className="activity-icon">
                <CircleCheck size={19} />
              </span>
              <div>
                <b>Account created</b>
                <p>Your UtilityHub workspace is ready.</p>
              </div>
              <time dateTime={user.createdAt}>{joined}</time>
            </div>
          </div>
        </article>
        <aside className="panel">
          <div className="panel-heading">
            <h2>Your account</h2>
            <LockKeyhole size={17} />
          </div>
          <dl className="account-details">
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{joined}</dd>
            </div>
          </dl>
          <p className="panel-note">
            Tasks, expenses, notes, and reminders are private to your account.
            Email reminders use this email address.
          </p>
        </aside>
      </div>
      <div className="dashboard-shortcuts">
        <h2>Explore the toolkit</h2>
        <div>
          {tools.slice(0, 2).map((tool) => (
            // Builds a value for each item.
            <Link key={tool.id} to={tool.path}>
              {tool.title}
              <ArrowRight size={15} />
            </Link>
          ))}
          <Link to="/#tools">
            Browse all tools <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
