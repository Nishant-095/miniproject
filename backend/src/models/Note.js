import mongoose from "mongoose";
const noteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    content: {
      type: String,
      trim: true,
      required: true,
      maxlength: 5000,
    },
    color: {
      type: String,
      enum: ["yellow", "pink", "blue", "green", "purple"],
      default: "yellow",
    },
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);
noteSchema.index({
  user: 1,
  pinned: -1,
  updatedAt: -1,
});
export default mongoose.model("Note", noteSchema);
