import { useEffect, useRef, useState } from "react";
import { Pin, PinOff, Plus, Search, StickyNote, Trash2, X } from "lucide-react";
import sendAction from "../services/server.js";
import { useToast } from "../context/ToastContext.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
const colors = ["yellow", "pink", "blue", "green", "purple"];
function NoteEditor({ note, close, saved }) {
  // Displays the sticky-note editor.
  const dialog = useRef(null),
    [color, setColor] = useState(note?.color || "yellow"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    // Opens the dialog and manages its lifecycle.
    const element = dialog.current;
    element.showModal();
    return () =>
      // Runs the returned operation when called.
      element.close();
  }, []);
  async function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget),
      body = {
        title: data.get("title").trim(),
        content: data.get("content").trim(),
        color,
        pinned: data.get("pinned") === "on",
      };
    if (!body.content) {
      setError("Write something in your note first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (note)
        await sendAction("updateNote", {
          id: note._id,
          ...body,
        });
      else await sendAction("createNote", body);
      saved(note ? "Note updated." : "Note saved.");
    } catch (err) {
      setError(err.message || "Could not save your note. Try again.");
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="task-dialog note-dialog"
      aria-labelledby="note-title"
      onCancel={(event) => {
        // Closes the dialog when allowed.
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <div className="task-dialog-heading">
          <h2 id="note-title">{note ? "Edit note" : "A quick thought"}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close note editor"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <p className="utility-intro">Keep it close. Come back to it later.</p>
        <fieldset disabled={busy}>
          <label className="field-label">
            Title (optional)
            <input
              name="title"
              maxLength="100"
              defaultValue={note?.title || ""}
              autoFocus
            />
          </label>
          <label className="field-label">
            Note
            <textarea
              name="content"
              required
              maxLength="5000"
              rows="7"
              defaultValue={note?.content || ""}
            />
          </label>
          <div className="note-editor-bottom">
            <div
              className="note-color-picker"
              role="group"
              aria-label="Note color"
            >
              {colors.map((value) => (
                // Builds a value for each item.
                <button
                  type="button"
                  key={value}
                  className={`color-dot note-${value}`}
                  aria-label={`${value} note`}
                  aria-pressed={color === value}
                  onClick={() =>
                    // Selects the sticky-note color.
                    setColor(value)
                  }
                >
                  {color === value ? "✓" : ""}
                </button>
              ))}
            </div>
            <label className="pin-checkbox">
              <input
                type="checkbox"
                name="pinned"
                defaultChecked={note?.pinned || false}
              />{" "}
              Pin note
            </label>
          </div>
        </fieldset>
        {error && (
          <p className="utility-error" role="alert">
            {error}
          </p>
        )}
        <div className="utility-actions dialog-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export default function Notes() {
  // Displays, searches, and manages private notes.
  usePageTitle("Sticky notes");
  const [data, setData] = useState(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [editor, setEditor] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busyId, setBusyId] = useState(null),
    [deleting, setDeleting] = useState(null);
  const notify = useToast();
  useEffect(() => {
    // Delays search until typing pauses.
    const timer = setTimeout(() => {
      // Runs this step after a short delay.
      setSearch(query);
      setPage(1);
    }, 300);
    return () =>
      // Stops the timer when no longer needed.
      clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const controller = new AbortController();
    setLoading(true);
    sendAction(
      "listNotes",
      {
        q: search,
        page,
      },
      {
        signal: controller.signal,
      },
    )
      .then(({ data: result }) => {
        // Handles the completed operation.
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
          if (page > result.pages) setPage(result.pages);
        }
      })
      .catch((err) => {
        // Handles a failed operation.
        if (!controller.signal.aborted)
          setError(
            err.message || "Could not load notes. Check your connection.",
          );
      })
      .finally(() => {
        // Releases the completed request state.
        if (!controller.signal.aborted) setLoading(false);
      });
    return () =>
      // Cancels pending work and releases resources.
      controller.abort();
  }, [search, page, revision]);
  async function change(note, remove = false) {
    // Pins, unpins, or deletes this private note.
    if (busyId) return;
    setBusyId(note._id);
    setError("");
    try {
      if (remove)
        await sendAction("deleteNote", {
          id: note._id,
        });
      else
        await sendAction("updateNote", {
          id: note._id,
          pinned: !note.pinned,
        });
      setRevision(
        (value) =>
          // Increments the refresh counter.
          value + 1,
      );
      setDeleting(null);
      notify(
        remove
          ? "Note deleted."
          : note.pinned
            ? "Note unpinned."
            : "Note pinned.",
      );
    } catch (err) {
      setError(err.message || "Could not update this note.");
    } finally {
      setBusyId(null);
    }
  }
  return (
    <section className="notes-page shell">
      <div className="notes-heading">
        <div>
          <h1>Notes</h1>
          <p>Quick thoughts, lists, and things to come back to.</p>
        </div>
        <button
          className="button"
          onClick={() =>
            // Opens the form for a new item.
            setEditor({
              note: null,
            })
          }
        >
          <Plus size={16} /> New note
        </button>
      </div>
      <div className="notes-toolbar">
        <label className="tool-search">
          <Search size={16} />
          <input
            aria-label="Search notes"
            maxLength="100"
            value={query}
            onChange={(event) =>
              // Updates the selected value.
              setQuery(event.target.value)
            }
            placeholder="Find a thought…"
          />
        </label>
        <span className="muted text-sm">
          {data
            ? `${data.total} ${search ? "matching " : ""}${data.total === 1 ? "note" : "notes"} · ${data.pinned} pinned`
            : "Your private note wall"}
        </span>
      </div>
      {error && (
        <p className="task-error" role="alert">
          {error}{" "}
          <button
            onClick={() =>
              // Requests fresh server data.
              setRevision(
                (value) =>
                  // Increments the refresh counter.
                  value + 1,
              )
            }
          >
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <div className="task-empty" role="status">
          Loading your notes…
        </div>
      ) : data?.notes.length ? (
        <div className="notes-grid">
          {data.notes.map((note) => (
            // Builds a value for each item.
            <article className={`note-card note-${note.color}`} key={note._id}>
              <div className="note-card-head">
                <span>
                  {note.pinned ? (
                    <>
                      <Pin size={13} /> Pinned
                    </>
                  ) : (
                    "A LITTLE THOUGHT"
                  )}
                </span>
                <div>
                  <button
                    aria-label={`${note.pinned ? "Unpin" : "Pin"} ${note.title || "note"}`}
                    disabled={Boolean(busyId)}
                    onClick={() =>
                      // Updates the changed form fields.
                      change(note)
                    }
                  >
                    {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </button>
                  <button
                    aria-label={`Delete ${note.title || "note"}`}
                    disabled={Boolean(busyId)}
                    onClick={() =>
                      // Shows or hides the delete confirmation.
                      setDeleting(deleting === note._id ? null : note._id)
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <button
                className="note-edit-area"
                aria-label={`Edit ${note.title || "untitled note"}`}
                onClick={() =>
                  // Opens the selected item for editing.
                  setEditor({
                    note,
                  })
                }
              >
                <h2>{note.title || "Untitled note"}</h2>
                <p>{note.content}</p>
                <small>
                  Updated{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                  }).format(new Date(note.updatedAt))}
                </small>
              </button>
              {deleting === note._id && (
                <div className="note-delete-confirm">
                  <p>Delete this note?</p>
                  <button
                    className="text-link"
                    disabled={Boolean(busyId)}
                    onClick={() =>
                      // Updates the changed form fields.
                      change(note, true)
                    }
                  >
                    {busyId ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    className="text-link"
                    disabled={Boolean(busyId)}
                    onClick={() =>
                      // Shows or hides the delete confirmation.
                      setDeleting(null)
                    }
                  >
                    Keep it
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="notes-empty">
            <StickyNote size={35} />
            <h2>
              {search
                ? "No matching thoughts"
                : "A little space for your ideas."}
            </h2>
            <p>
              {search
                ? "Try another word or clear your search."
                : "Save your first note and make this wall your own."}
            </p>
            <button
              className="button button-outline button-small"
              onClick={() =>
                // Clears search or opens a new note.
                search
                  ? setQuery("")
                  : setEditor({
                      note: null,
                    })
              }
            >
              {search ? "Clear search" : "Write a note"}
            </button>
          </div>
        )
      )}
      {data && data.pages > 1 && (
        <div className="notes-pagination">
          <button
            className="button button-outline button-small"
            disabled={page <= 1 || loading}
            onClick={() =>
              // Moves to the previous results page.
              setPage(page - 1)
            }
          >
            Previous
          </button>
          <span>
            Page {page} of {data.pages}
          </span>
          <button
            className="button button-outline button-small"
            disabled={page >= data.pages || loading}
            onClick={() =>
              // Moves to the next results page.
              setPage(page + 1)
            }
          >
            Next
          </button>
        </div>
      )}
      {editor && (
        <NoteEditor
          note={editor.note}
          close={() =>
            // Closes the item editor.
            setEditor(null)
          }
          saved={(message) => {
            // Closes the editor and refreshes saved notes.
            setEditor(null);
            setRevision(
              (value) =>
                // Increments the refresh counter.
                value + 1,
            );
            notify(message);
          }}
        />
      )}
    </section>
  );
}
