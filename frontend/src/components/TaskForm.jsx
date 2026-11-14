import { useEffect, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import sendAction from "../services/server.js";
import { dueInputToIso, toLocalDateTimeInput } from "../utils/taskDates.js";
export default function TaskForm({ task, onClose, onSaved }) {
  // Displays the task add or edit form.
  const dialog = useRef(null);
  const [form, setForm] = useState({
    title: task?.title || "",
    description: task?.description || "",
    priority: task?.priority || "medium",
    category: task?.category || "General",
    dueAt: toLocalDateTimeInput(task?.dueAt),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // Opens the dialog and manages its lifecycle.
    dialog.current?.showModal();
    dialog.current?.querySelector("input[name=title]")?.focus();
  }, []);
  const change = (event) =>
    // Updates the changed form fields.
    setForm((old) =>
      // Updates the changed form field.
      ({
        ...old,
        [event.target.name]: event.target.value,
      }),
    );
  async function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (saving) return;
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.title.trim()) {
      setError("Please enter a task title.");
      return;
    }
    let payload;
    try {
      payload = {
        ...values,
        dueAt: dueInputToIso(values.dueAt, task?.dueAt),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    } catch (err) {
      setError(err.message);
      return;
    }
    setSaving(true);
    try {
      if (task)
        await sendAction("updateTask", {
          id: task._id,
          ...payload,
        });
      else await sendAction("createTask", payload);
      onSaved(task ? "Task updated." : "Task added.");
    } catch (err) {
      setError(
        err.message ||
          "Could not save the task. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      className="task-dialog"
      ref={dialog}
      aria-labelledby="task-form-title"
      onCancel={(event) => {
        // Closes the dialog when allowed.
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="task-dialog-heading">
        <span className="tool-icon green">
          <CalendarClock size={22} />
        </span>
        <button
          className="icon-action"
          aria-label="Close task form"
          disabled={saving}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <h2 id="task-form-title">
        {task ? "Edit task" : "Make a little progress"}
      </h2>
      <p className="task-dialog-intro">
        {task
          ? "Update the details and keep your plan on track."
          : "A small plan today makes tomorrow easier."}
      </p>
      <form onSubmit={submit} className="task-form">
        <label>
          Title *
          <input
            autoFocus
            name="title"
            value={form.title}
            onChange={change}
            required
            maxLength={120}
            placeholder="What needs to get done?"
            disabled={saving}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={change}
            maxLength={2000}
            rows={3}
            placeholder="Add a few details (optional)"
            disabled={saving}
          />
        </label>
        <div className="task-form-row">
          <label>
            Priority
            <select
              name="priority"
              value={form.priority}
              onChange={change}
              disabled={saving}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Category
            <input
              name="category"
              value={form.category}
              onChange={change}
              maxLength={40}
              placeholder="General"
              disabled={saving}
            />
          </label>
        </div>
        <label>
          Due date & time
          <input
            type="datetime-local"
            name="dueAt"
            value={form.dueAt}
            onChange={change}
            onInput={change}
            min="2000-01-01T00:00"
            max="9999-12-31T23:59"
            disabled={saving}
          />
          <small>
            Optional · Uses your local timezone (
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
            ). Clear the field for no deadline.
          </small>
        </label>
        {error && (
          <p className="task-error" role="alert">
            {error}
          </p>
        )}
        <div className="task-form-actions">
          <button
            className="button button-outline"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button className="button" disabled={saving}>
            {saving ? "Saving…" : task ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
