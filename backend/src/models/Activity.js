import mongoose from "mongoose";
const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    action: {
      type: String,
      enum: [
        "task_created",
        "task_updated",
        "task_completed",
        "task_reopened",
        "task_deleted",
        "expense_created",
        "expense_updated",
        "expense_deleted",
        "note_created",
        "note_updated",
        "note_deleted",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 120,
    },
  },
  {
    timestamps: true,
  },
);
activitySchema.index({
  user: 1,
  createdAt: -1,
});
export default mongoose.model("Activity", activitySchema);
