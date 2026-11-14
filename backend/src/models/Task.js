import mongoose from "mongoose";
const taskSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    category: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "General",
    },
    dueAt: {
      type: Date,
      default: null,
    },
    timeZone: {
      type: String,
      default: "Asia/Kolkata",
      maxlength: 100,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Rescheduling creates a new reminder. Internal fields stay out of the API.
    reminderVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    reminderQueued: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);
taskSchema.index({
  user: 1,
  completed: 1,
  dueAt: 1,
});
taskSchema.index({
  completed: 1,
  reminderQueued: 1,
  dueAt: 1,
});
export default mongoose.model("Task", taskSchema);
