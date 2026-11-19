import { downloadFile } from "../utils/download.js";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Pencil,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from "lucide-react";
import sendAction from "../services/server.js";
import { useToast } from "../context/ToastContext.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
import { ExpenseForm, BudgetForm } from "../components/ExpenseDialogs.jsx";
import ExpenseCharts from "../components/ExpenseCharts.jsx";
import {
  budgetPercent,
  categoryColors,
  currentMonth,
  expenseDate,
  exportError,
  money,
  monthName,
  paymentMethods,
} from "../utils/expenses.js";
function BudgetBar({ row }) {
  // Displays spending against one budget limit.
  const label = row.scope === "overall" ? "Overall budget" : row.scope;
  return (
    <div className="expense-budget-row">
      <div>
        <b>{label}</b>
        <span>
          {money(row.spentPaise)} <small>/ {money(row.limitPaise)}</small>
        </span>
      </div>
      <div
        className={`expense-budget-track ${row.level || ""}`}
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(
          budgetPercent(row.spentPaise, row.limitPaise),
        )}
        aria-valuetext={`${money(row.spentPaise)} spent of ${money(row.limitPaise)}`}
      >
        <span
          style={{
            width: `${budgetPercent(row.spentPaise, row.limitPaise)}%`,
          }}
        />
      </div>
      <p>
        {row.spentPaise > row.limitPaise
          ? `${money(row.spentPaise - row.limitPaise)} over budget`
          : `${money(row.limitPaise - row.spentPaise)} remaining`}
      </p>
    </div>
  );
}
export default function Expenses() {
  // Displays monthly expenses, budgets, and exports.
  usePageTitle("Monthly expenses");
  const notify = useToast();
  const [month, setMonth] = useState(currentMonth);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState({
    month: "",
    expenses: [],
    pagination: {
      total: 0,
      pages: 1,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState("");
  const exportController = useRef(null);
  const selected = summary?.month === month ? summary : null;
  const visible = list.month === month ? list.expenses : [];
  const topCategory = selected?.categories.reduce((top, row) =>
    !top || row.totalPaise > top.totalPaise ? row : top, null);
  const refresh = () =>
    // Requests a fresh copy of saved records.
    setRevision(
      (value) =>
        // Increments the refresh counter.
        value + 1,
    );
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const controller = new AbortController();
    let busy = false;
    async function load(first = false) {
      // Loads the latest data for this page.
      if (busy) return;
      busy = true;
      if (first) setLoading(true);
      try {
        const [totals, rows] = await Promise.all([
          sendAction(
            "expenseSummary",
            {
              month,
            },
            {
              signal: controller.signal,
            },
          ),
          sendAction(
            "listExpenses",
            {
              month,
              page,
              limit: 20,
            },
            {
              signal: controller.signal,
            },
          ),
        ]);
        if (controller.signal.aborted) return;
        setSummary(totals.data);
        setList(rows.data);
        setError("");
        if (page > rows.data.pagination.pages)
          setPage(rows.data.pagination.pages);
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err.message ||
              "Could not load your expenses. Check your connection and try again.",
          );
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load(true);
    const poll = () =>
      // Checks for updated records without overlapping requests.
      load();
    const timer = setInterval(poll, 60000);
    window.addEventListener("focus", poll);
    return () => {
      // Cancels pending work and releases resources.
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [month, page, revision]);
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    setExporting("");
    return () =>
      // Runs the returned operation when called.
      exportController.current?.abort();
  }, [month]);
  function changeMonth(value) {
    // Switches the selected expense month.
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonth(value);
    setPage(1);
    setDeleteId(null);
    setError("");
  }
  function saved(message, savedMonth) {
    // Refreshes the page after a saved change.
    setEditor(null);
    setBudgetOpen(false);
    setDeleteId(null);
    if (savedMonth && savedMonth !== month) changeMonth(savedMonth);
    else refresh();
    notify(message);
  }
  async function remove(expense) {
    // Removes the selected item.
    setDeleting(true);
    try {
      await sendAction("deleteExpense", {
        id: expense._id,
      });
      setDeleteId(null);
      notify("Expense deleted.");
      refresh();
    } catch (err) {
      notify(err.message || "Could not delete the expense.");
    } finally {
      setDeleting(false);
    }
  }
  async function exportMonth(format) {
    // Downloads the selected month's expense report.
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(format);
    try {
      const { data } = await sendAction(
        "exportExpenses",
        {
          month,
          format,
        },
        {
          responseType: "blob",
          timeout: 60000,
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      downloadFile(data, `utilityhub-expenses-${month}.${format}`);
      notify(`${format.toUpperCase()} export is ready.`);
    } catch (err) {
      if (!controller.signal.aborted) notify(await exportError(err));
    } finally {
      if (!controller.signal.aborted) setExporting("");
    }
  }
  return (
    <section className="expenses-page shell">
      <Link to="/dashboard" className="task-back">
        <ArrowLeft size={14} />
        Back to dashboard
      </Link>
      <div className="expenses-heading">
        <div>
          <h1>Expenses</h1>
          <p>Log your spending and keep your monthly budget in view.</p>
        </div>
        <div className="expense-heading-actions">
          <label className="expense-month-picker">
            <CalendarDays size={16} />
            <input
              type="month"
              aria-label="Expense month"
              min="2000-01"
              max="2099-12"
              value={month}
              onChange={(event) =>
                // Updates the selected value.
                changeMonth(event.target.value)
              }
              onInput={(event) =>
                // Switches the selected expense month.
                changeMonth(event.target.value)
              }
            />
          </label>
          <button
            className="button"
            onClick={() =>
              // Opens the form for a new item.
              setEditor({
                expense: null,
              })
            }
          >
            <Plus size={16} />
            Add expense
          </button>
        </div>
      </div>
      <div className="expense-month-heading">
        <span>{monthName(month)}</span>
        <small>All amounts in INR · Private to your account</small>
      </div>
      {error && (
        <p className="task-error" role="alert">
          {error} <button onClick={refresh}>Retry</button>
        </p>
      )}
      <div className="expense-stat-grid">
        <article>
          <span className="stat-icon purple">
            <Wallet size={21} />
          </span>
          <small>Spent this month</small>
          <b>{selected ? money(selected.totalPaise) : "—"}</b>
          <p>
            {selected
              ? `${selected.count} recorded expenses`
              : "Loading this month…"}
          </p>
        </article>
        <article
          className={`expense-remaining ${selected?.remainingPaise < 0 ? "expense-negative" : ""}`}
        >
          <span className="stat-icon green">
            <Receipt size={21} />
          </span>
          <small>Budget left</small>
          <b>
            {selected?.remainingPaise === null || !selected
              ? "—"
              : money(selected.remainingPaise)}
          </b>
          <p>
            {!selected
              ? "Loading your budget…"
              : selected.remainingPaise < 0
              ? "Over the monthly limit"
              : selected.remainingPaise === null
                ? "Set a budget to see what’s left"
                : `of ${money(selected?.budget.overallPaise || 0)} monthly budget`}
          </p>
        </article>
        <article>
          <span className="stat-icon orange"><Receipt size={21} /></span>
          <small>Top category</small>
          <b>{selected ? topCategory?.category || "No expenses yet" : "—"}</b>
          <p>{topCategory ? `${money(topCategory.totalPaise)} this month` : "Your most used category appears here"}</p>
        </article>
      </div>
      {selected?.alerts.length > 0 && (
        <div className="expense-alerts" aria-label="Budget alerts">
          {selected.alerts.map((alert) => (
            // Builds a value for each item.
            <div
              key={`${alert.scope}-${alert.level}`}
              className={`expense-budget-alert ${alert.level}`}
              role={alert.level === "exceeded" ? "alert" : "status"}
            >
              <CircleAlert size={20} />
              <div>
                <b>
                  {alert.scope === "overall"
                    ? "Monthly budget"
                    : `${alert.scope} budget`}{" "}
                  {alert.level === "exceeded"
                    ? "exceeded"
                    : "is at least 80% used"}
                </b>
                <p>
                  {money(alert.spentPaise)} spent of {money(alert.limitPaise)}
                  {alert.level === "exceeded"
                    ? ` · ${money(alert.spentPaise - alert.limitPaise)} over`
                    : ""}
                </p>
              </div>
              <span>
                <BellRing size={12} />
                {!selected.schedulerEnabled
                  ? "Email scheduler off"
                  : !selected.emailConfigured
                    ? "Email setup needed"
                    : alert.emailStatus === "sent"
                      ? "Email sent"
                      : "Email queued"}
              </span>
            </div>
          ))}
        </div>
      )}
      {selected ? (
        <ExpenseCharts summary={selected} />
      ) : (
        <div className="expense-overview-loading" role="status">
          {error
            ? "Your monthly overview is unavailable."
            : "Loading your monthly overview…"}
        </div>
      )}
      <section className="expense-budget-panel">
        <div className="expense-section-heading">
          <div>
            <h2>Monthly budgets</h2>
            <p>Monthly and category budgets · {monthName(month)}</p>
          </div>
          <button
            className="button button-outline button-small"
            disabled={!selected}
            onClick={() =>
              // Opens the monthly budget editor.
              setBudgetOpen(true)
            }
          >
            <SlidersHorizontal size={14} />
            Set budget
          </button>
        </div>
        {selected?.progress.length ? (
          <div className="expense-budget-grid">
            {selected.progress.map((row) => (
              // Builds a value for each item.
              <BudgetBar row={row} key={row.scope} />
            ))}
          </div>
        ) : (
          <p className="expense-budget-empty">
            {selected
              ? "No limits set for this month. Set an overall budget, category budgets, or both."
              : "Loading your budget…"}
          </p>
        )}
        <p className="expense-budget-note">
          <BellRing size={13} />
          Budget alerts appear at 80% and when you go over your limit. Email reminders need an internet connection and a configured email service.
        </p>
      </section>
      <section className="expense-transactions" aria-label="Monthly expenses">
        <div className="expense-section-heading">
          <div>
            <h2>Recent expenses</h2>
            <p>
              {monthName(month)} · {selected?.count ?? "—"} expenses
            </p>
          </div>
          <div className="expense-export-actions">
            {["csv", "pdf"].map((format) => (
              // Builds a value for each item.
              <button
                disabled={!selected || Boolean(exporting)}
                key={format}
                onClick={() =>
                  // Downloads the selected month's expense report.
                  exportMonth(format)
                }
                aria-label={`Export ${format.toUpperCase()}`}
              >
                <ArrowDownToLine size={14} />
                {exporting === format ? "Preparing…" : format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="task-empty" role="status">
            <span className="spinner" />
            Loading your expenses…
          </div>
        ) : error ? (
          <div className="task-empty">
            Your list is unavailable. Use Retry above.
          </div>
        ) : !visible.length ? (
          <div className="task-empty">
            <span className="empty-task-icon">
              <Receipt size={30} />
            </span>
            <h2>A fresh page for your month</h2>
            <p>Add your first expense. Even the little ones count.</p>
            <button
              className="button button-outline button-small"
              onClick={() =>
                // Opens the form for a new item.
                setEditor({
                  expense: null,
                })
              }
            >
              <Plus size={14} />
              Add an expense
            </button>
          </div>
        ) : (
          <>
            <div className="expense-table-heading" aria-hidden="true">
              <span>Date</span>
              <span>Expense</span>
              <span>Payment</span>
              <span>Amount</span>
              <span />
            </div>
            <ul className="expense-list">
              {visible.map((expense) => (
                // Builds a value for each item.
                <li className="expense-row" key={expense._id}>
                  <time dateTime={expense.date}>
                    {expenseDate(expense.date)}
                  </time>
                  <div className="expense-description">
                    <b>
                      <i
                        style={{
                          background: categoryColors[expense.category],
                        }}
                      />
                      {expense.category}
                    </b>
                    {expense.note && <p>{expense.note}</p>}
                    {deleteId === expense._id && (
                      <div className="task-delete-confirm">
                        <span>Delete this expense permanently?</span>
                        <button
                          disabled={deleting}
                          onClick={() =>
                            // Removes the selected item.
                            remove(expense)
                          }
                        >
                          Yes, delete
                        </button>
                        <button
                          disabled={deleting}
                          onClick={() =>
                            // Shows or hides the delete confirmation.
                            setDeleteId(null)
                          }
                        >
                          Keep expense
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="expense-payment">
                    {
                      paymentMethods.find(
                        ([value]) =>
                          // Checks which items match the condition.
                          value === expense.paymentMethod,
                      )?.[1]
                    }
                  </span>
                  <strong>{money(expense.amountPaise)}</strong>
                  <div className="task-actions">
                    <button
                      className="icon-action"
                      aria-label={`Edit ${expense.category} expense on ${expense.date}`}
                      disabled={deleting}
                      onClick={() =>
                        // Opens the selected item for editing.
                        setEditor({
                          expense,
                        })
                      }
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-action danger-action"
                      aria-label={`Delete ${expense.category} expense on ${expense.date}`}
                      disabled={deleting}
                      onClick={() =>
                        // Shows or hides the delete confirmation.
                        setDeleteId(
                          deleteId === expense._id ? null : expense._id,
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="task-pagination">
          <span>{selected?.count ?? 0} expenses this month</span>
          <div>
            <button
              aria-label="Previous expense page"
              disabled={loading || page <= 1}
              onClick={() =>
                // Moves to the previous results page.
                setPage(
                  (value) =>
                    // Moves to the previous results page.
                    value - 1,
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {list.month === month ? list.pagination.pages : 1}
            </span>
            <button
              aria-label="Next expense page"
              disabled={
                loading || list.month !== month || page >= list.pagination.pages
              }
              onClick={() =>
                // Moves to the next results page.
                setPage(
                  (value) =>
                    // Moves to the next results page.
                    value + 1,
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <p className="task-private-note">
        Your overview includes the whole selected month. Exports include all
        entries, across every page.
      </p>
      {editor && (
        <ExpenseForm
          expense={editor.expense}
          month={month}
          onClose={() =>
            // Closes the item editor.
            setEditor(null)
          }
          onSaved={saved}
        />
      )}
      {budgetOpen && selected && (
        <BudgetForm
          budget={selected.budget}
          month={month}
          onClose={() =>
            // Closes the monthly budget editor.
            setBudgetOpen(false)
          }
          onSaved={saved}
        />
      )}
    </section>
  );
}
