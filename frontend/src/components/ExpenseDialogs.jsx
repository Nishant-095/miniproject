import { useEffect, useRef, useState } from "react";
import { Receipt, SlidersHorizontal, X } from "lucide-react";
import sendAction from "../services/server.js";
import {
  categories,
  paymentMethods,
  amountInput,
  currentMonth,
  localToday,
  monthName,
  isValidAmount,
} from "../utils/expenses.js";
function DialogFrame({
  title,
  intro,
  icon: Icon,
  busy,
  onClose,
  children,
  wide = false,
}) {
  // Displays an accessible expense dialog.
  const dialog = useRef(null);
  useEffect(() => {
    // Opens the dialog and manages its lifecycle.
    dialog.current.showModal();
    dialog.current.querySelector("input")?.focus();
  }, []);
  return (
    <dialog
      className={`task-dialog expense-dialog ${wide ? "budget-dialog" : ""}`}
      ref={dialog}
      aria-labelledby="expense-dialog-title"
      onCancel={(event) => {
        // Closes the dialog when allowed.
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="task-dialog-heading">
        <span className="tool-icon orange">
          <Icon size={21} />
        </span>
        <button
          className="icon-action"
          aria-label="Close expense dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="expense-dialog-title">{title}</h2>
      <p className="task-dialog-intro">{intro}</p>
      {children}
    </dialog>
  );
}
export function ExpenseForm({ expense, month, onClose, onSaved }) {
  // Displays the expense add or edit form.
  const [form, setForm] = useState({
    amount: expense?.amount || "",
    category: expense?.category || "Food",
    date:
      expense?.date ||
      (month === currentMonth() ? localToday() : `${month}-01`),
    note: expense?.note || "",
    paymentMethod: expense?.paymentMethod || "upi",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (event) =>
    // Updates the changed form fields.
    setForm((previous) =>
      // Updates the changed form field.
      ({
        ...previous,
        [event.target.name]: event.target.value,
      }),
    );
  async function save(event) {
    // Validates and saves the submitted values.
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!isValidAmount(values.amount)) {
      setError(
        "Enter an amount above zero with at most two decimal places (maximum INR 1,00,00,000).",
      );
      return;
    }
    if (values.note.trim().split(/\r?\n/).length > 8) {
      setError("Keep the note to eight lines or fewer.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (expense)
        await sendAction("updateExpense", {
          id: expense._id,
          ...values,
        });
      else await sendAction("createExpense", values);
      onSaved(
        expense ? "Expense updated." : "Expense added.",
        values.date.slice(0, 7),
      );
    } catch (err) {
      setError(
        err.message || "Could not save the expense. Check your connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogFrame
      title={expense ? "Edit expense" : "A little spend, noted."}
      intro="Keep the details. See the bigger picture."
      icon={Receipt}
      busy={busy}
      onClose={onClose}
    >
      <form className="task-form" onSubmit={save}>
        <div className="task-form-row">
          <label>
            Amount (INR) *
            <input
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              required
              maxLength={12}
              value={form.amount}
              onChange={change}
              disabled={busy}
            />
          </label>
          <label>
            Category
            <select
              name="category"
              value={form.category}
              onChange={change}
              disabled={busy}
            >
              {categories.map((category) => (
                // Builds a value for each item.
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="task-form-row">
          <label>
            Date *
            <input
              type="date"
              name="date"
              required
              min="2000-01-01"
              max="2099-12-31"
              value={form.date}
              onInput={change}
              onChange={change}
              disabled={busy}
            />
          </label>
          <label>
            Payment method
            <select
              name="paymentMethod"
              value={form.paymentMethod}
              onChange={change}
              disabled={busy}
            >
              {paymentMethods.map(([value, label]) => (
                // Builds a value for each item.
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Note
          <textarea
            name="note"
            rows={3}
            maxLength={300}
            value={form.note}
            onChange={change}
            placeholder="What was it for? (optional)"
            disabled={busy}
          />
          <small>
            Up to 300 characters and eight lines. The date stays in the month
            you choose.
          </small>
        </label>
        {error && (
          <p role="alert" className="task-error">
            {error}
          </p>
        )}
        <div className="task-form-actions">
          <button
            className="button button-outline"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : expense ? "Save changes" : "Add expense"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
export function BudgetForm({ budget, month, onClose, onSaved }) {
  // Displays the monthly budget form.
  const [overall, setOverall] = useState(amountInput(budget.overallPaise));
  const [limits, setLimits] = useState(
    Object.fromEntries(
      categories.map((category) =>
        // Builds a value for each item.
        [
          category,
          amountInput(
            budget.categories.find(
              (row) =>
                // Checks which items match the condition.
                row.category === category,
            )?.limitPaise,
          ),
        ],
      ),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event) {
    // Validates and saves the submitted values.
    event.preventDefault();
    const entries = Object.fromEntries(new FormData(event.currentTarget));
    const rows = categories
      .filter(
        (category) =>
          // Checks which items match the condition.
          entries[category].trim() !== "",
      )
      .map((category) =>
        // Builds a value for each item.
        ({
          category,
          amount: entries[category].trim(),
        }),
      );
    if (
      (entries.overall.trim() !== "" &&
        !isValidAmount(entries.overall, true)) ||
      rows.some(
        (row) =>
          // Checks which items match the condition.
          !isValidAmount(row.amount, true),
      )
    ) {
      setError(
        "Use amounts from zero to INR 1,00,00,000 with at most two decimal places. Leave a field blank to remove that limit.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendAction("saveBudget", {
        month,
        overall: entries.overall.trim() === "" ? null : entries.overall.trim(),
        categories: rows,
      });
      onSaved("Your monthly plan is saved.");
    } catch (err) {
      setError(err.message || "Could not save your budget.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogFrame
      title="Give your month a plan."
      intro={monthName(month)}
      icon={SlidersHorizontal}
      busy={busy}
      onClose={onClose}
      wide
    >
      <form className="task-form" onSubmit={save}>
        <label>
          Overall monthly budget (INR)
          <input
            name="overall"
            inputMode="decimal"
            value={overall}
            onChange={(event) =>
              // Updates the selected value.
              setOverall(event.target.value)
            }
            placeholder="No overall limit"
            disabled={busy}
            maxLength={12}
          />
          <small>
            Leave blank for no limit. Zero is a real zero-spend budget.
          </small>
        </label>
        <div className="budget-form-heading">
          <h3>Category budgets</h3>
          <p>Optional limits, checked independently of the overall budget.</p>
        </div>
        <div className="budget-form-grid">
          {categories.map((category) => (
            // Builds a value for each item.
            <label key={category}>
              {category} (INR)
              <input
                name={category}
                inputMode="decimal"
                placeholder="No limit"
                value={limits[category]}
                onChange={(event) =>
                  // Updates the selected value.
                  setLimits((previous) =>
                    // Updates the selected value.
                    ({
                      ...previous,
                      [category]: event.target.value,
                    }),
                  )
                }
                maxLength={12}
                disabled={busy}
              />
            </label>
          ))}
        </div>
        <p className="budget-form-note">
          Amber at 80% used. Red when spending exceeds the limit. Clear a field
          and save to remove its limit. This plan applies only to{" "}
          {monthName(month)}.
        </p>
        {error && (
          <p className="task-error" role="alert">
            {error}
          </p>
        )}
        <div className="task-form-actions">
          <button
            className="button button-outline"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save budget"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
