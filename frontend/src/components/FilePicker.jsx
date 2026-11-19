import { useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  FolderOpen,
  X,
} from "lucide-react";
import {
  formatBytes,
  MAX_BATCH_SIZE,
  MAX_FILE_SIZE,
  uploadSizeError,
} from "../utils/files.js";
export default function FilePicker({
  files,
  onChange,
  onError,
  extensions,
  multiple = false,
  reorder = false,
  disabled = false,
}) {
  // Displays file selection and ordering controls.
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [dragId, setDragId] = useState(null);
  function selectFiles(picked) {
    // Validates and selects the chosen files.
    if (disabled || !picked.length) return;
    const next = [
      ...(multiple ? files : []),
      ...picked.map((file) =>
        // Builds a value for each item.
        ({
          id: crypto.randomUUID(),
          file,
        }),
      ),
    ];
    if (next.length > (multiple ? 10 : 1))
      return onError(
        multiple ? "Choose at most 10 files." : "Choose one file.",
      );
    if (
      next.some(
        ({ file }) =>
          // Checks which items match the condition.
          !extensions.includes(file.name.split(".").pop().toLowerCase()),
      )
    ) {
      return onError(`Choose ${extensions.join(", ").toUpperCase()} files.`);
    }
    if (
      next.some(
        ({ file }) =>
          // Checks which items match the condition.
          file.size === 0,
      )
    )
      return onError("Empty files cannot be processed.");
    const sizeError = uploadSizeError(
      next.map(
        ({ file }) =>
          // Builds a value for each item.
          file,
      ),
    );
    if (sizeError) return onError(sizeError);
    onChange(next);
  }
  function move(from, to) {
    // Moves a selected file to another position.
    if (
      disabled ||
      from < 0 ||
      from >= files.length ||
      from === to ||
      to < 0 ||
      to >= files.length
    )
      return;
    const next = [...files];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  }
  return (
    <div className="upload-control">
      <label
        htmlFor={id}
        className={`upload-zone ${dragging ? "upload-over" : ""} ${disabled ? "upload-disabled" : ""}`}
        onDragOver={(event) => {
          // Marks a valid file-drag target.
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() =>
          // Ends the file-drag highlight.
          setDragging(false)
        }
        onDrop={(event) => {
          // Selects dropped files after validation.
          event.preventDefault();
          setDragging(false);
          selectFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="upload-symbol">
          <FolderOpen size={27} />
        </span>
        <b>
          {files.length && multiple
            ? "Add more files"
            : `Choose ${multiple ? "files" : "a file"}`}
          <span> or drop {multiple ? "them" : "it"} here</span>
        </b>
        <small>
          {extensions.join(" / ").toUpperCase()} · Up to{" "}
          {MAX_FILE_SIZE / 1024 / 1024} MB per file
          {multiple
            ? ` · 10 files, ${MAX_BATCH_SIZE / 1024 / 1024} MB total`
            : ""}
        </small>
        <input
          id={id}
          type="file"
          className="sr-only"
          aria-label={multiple ? "Choose files" : "Choose a file"}
          accept={extensions
            .map(
              (ext) =>
                // Builds a value for each item.
                `.${ext}`,
            )
            .join(",")}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            // Updates the selected value.
            selectFiles(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <ol
          className="uploaded-files"
          aria-label={reorder ? "File order" : "Selected files"}
        >
          {files.map((item, index) => (
            // Builds a value for each item.
            <li
              key={item.id}
              className={dragId === item.id ? "file-dragging" : ""}
              draggable={reorder && !disabled}
              onDragStart={(event) => {
                // Stores the dragged file's position.
                setDragId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragEnd={() =>
                // Clears the dragged file selection.
                setDragId(null)
              }
              onDragOver={(event) => {
                // Allows dropping a file into this position.
                if (reorder) event.preventDefault();
              }}
              onDrop={(event) => {
                // Moves the dropped file into order.
                event.preventDefault();
                if (reorder)
                  move(
                    files.findIndex(
                      (file) =>
                        // Checks which items match the condition.
                        file.id === event.dataTransfer.getData("text/plain"),
                    ),
                    index,
                  );
                setDragId(null);
              }}
            >
              {reorder ? (
                <GripVertical
                  size={15}
                  className="file-grip"
                  aria-hidden="true"
                />
              ) : (
                <FileText size={18} className="file-grip" aria-hidden="true" />
              )}
              {reorder && <span className="file-number">{index + 1}</span>}
              <div className="file-name">
                <b>{item.file.name}</b>
                <small>{formatBytes(item.file.size)}</small>
              </div>
              <div className="file-actions">
                {reorder && (
                  <>
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      aria-label={`Move file ${index + 1} up`}
                      onClick={() =>
                        // Moves a selected file to another position.
                        move(index, index - 1)
                      }
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === files.length - 1}
                      aria-label={`Move file ${index + 1} down`}
                      onClick={() =>
                        // Moves a selected file to another position.
                        move(index, index + 1)
                      }
                    >
                      <ArrowDown size={14} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove file ${index + 1}`}
                  onClick={() =>
                    // Removes this selected upload.
                    onChange(
                      files.filter(
                        (file) =>
                          // Checks which items match the condition.
                          file.id !== item.id,
                      ),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {reorder && files.length > 1 && (
        <p className="upload-order-note">
          Drag the rows to reorder. The arrow buttons also work on mobile and
          with a keyboard.
        </p>
      )}
    </div>
  );
}
