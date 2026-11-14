import { checkId } from "../utils/taskValidation.js";
import Note from "../models/Note.js";
import Activity from "../models/Activity.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
function noteValues(body, partial = false) {
  // Validates editable sticky-note fields.
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw httpError(400, "Send note fields as a JSON object.");
  const fields = ["title", "content", "color", "pinned"];
  if (
    Object.keys(body).some(
      (key) =>
        // Checks which items match the condition.
        !fields.includes(key),
    )
  )
    throw httpError(400, "Use title, content, color, and pinned only.");
  if (partial && !Object.keys(body).length)
    throw httpError(400, "Send at least one note field.");
  const values = {};
  for (const [key, max] of [
    ["title", 100],
    ["content", 5000],
  ]) {
    if (body[key] === undefined && partial) continue;
    const value = body[key] ?? (key === "title" ? "" : null);
    if (
      typeof value !== "string" ||
      value.trim().length > max ||
      (key === "content" && !value.trim())
    )
      throw httpError(
        400,
        `${key === "title" ? "Title" : "Content"} must be text, ${key === "content" ? "1–" : "up to "}${max} characters.`,
      );
    values[key] = value.trim();
  }
  if (body.color !== undefined) {
    if (!["yellow", "pink", "blue", "green", "purple"].includes(body.color))
      throw httpError(400, "Choose a supported note color.");
    values.color = body.color;
  }
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean")
      throw httpError(400, "Pinned must be true or false.");
    values.pinned = body.pinned;
  }
  return values;
}
async function activity(user, action, note) {
  // Records a note change in account activity.
  await Activity.create({
    user,
    action,
    title: note.title || note.content.slice(0, 100),
  }).catch(() => {
    // Handles a failed operation.
  });
}
export const listNotes = asyncHandler(async (req, res) => {
  // Lists and searches the account's pinned-first notes.
  const page = Number(req.body.page || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw httpError(400, "Choose a valid page.");
  const q = req.body.q || "";
  if (typeof q !== "string" || q.length > 100)
    throw httpError(400, "Search must be 100 characters or fewer.");
  const filter = {
    user: req.user._id,
  };
  if (q.trim()) {
    const regex = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      {
        title: {
          $regex: regex,
          $options: "i",
        },
      },
      {
        content: {
          $regex: regex,
          $options: "i",
        },
      },
    ];
  }
  const [notes, total, pinned] = await Promise.all([
    Note.find(filter)
      .sort({
        pinned: -1,
        updatedAt: -1,
        _id: -1,
      })
      .skip((page - 1) * 24)
      .limit(24)
      .select("-__v"),
    Note.countDocuments(filter),
    Note.countDocuments({
      user: req.user._id,
      pinned: true,
    }),
  ]);
  res.json({
    notes,
    total,
    pinned,
    page,
    pages: Math.max(1, Math.ceil(total / 24)),
  });
});
export const createNote = asyncHandler(async (req, res) => {
  // Validates and saves a private note.
  const { offlineId, ...body } = req.body;
  if (offlineId) {
    checkId(offlineId);
    const existing = await Note.findOne({ _id: offlineId, user: req.user._id });
    if (existing) return res.json({ note: existing });
  }
  const note = await Note.create({
    ...noteValues(body),
    ...(offlineId ? { _id: offlineId } : {}),
    user: req.user._id,
  });
  await activity(req.user._id, "note_created", note);
  res.status(201).json({
    note,
  });
});
export const updateNote = asyncHandler(async (req, res) => {
  // Updates a private note or its pin state.
  checkId(req.body.id);
  const { id, ...fields } = req.body;
  const note = await Note.findOneAndUpdate(
    {
      _id: req.body.id,
      user: req.user._id,
    },
    {
      $set: noteValues(fields, true),
    },
    {
      new: true,
      runValidators: true,
    },
  );
  if (!note) throw httpError(404, "Note not found.");
  await activity(req.user._id, "note_updated", note);
  res.json({
    note,
  });
});
export const deleteNote = asyncHandler(async (req, res) => {
  // Deletes a note belonging to this account.
  checkId(req.body.id);
  const note = await Note.findOneAndDelete({
    _id: req.body.id,
    user: req.user._id,
  });
  if (!note) throw httpError(404, "Note not found.");
  await activity(req.user._id, "note_deleted", note);
  res.json({
    message: "Note deleted.",
  });
});
