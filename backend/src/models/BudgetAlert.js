import mongoose from "mongoose";
import { EXPENSE_CATEGORIES } from "../config/expenseConfig.js";
const budgetAlertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    budget: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget",
      required: true,
    },
    month: {
      type: String,
      required: true,
    },
    revision: {
      type: Number,
      required: true,
    },
    scope: {
      type: String,
      enum: ["overall", ...EXPENSE_CATEGORIES],
      required: true,
    },
    level: {
      type: String,
      enum: ["warning", "exceeded"],
      required: true,
    },
    spentPaise: {
      type: Number,
      required: true,
    },
    limitPaise: {
      type: Number,
      required: true,
    },
    emailStatus: {
      type: String,
      enum: ["pending", "sending", "sent", "cancelled"],
      default: "pending",
    },
    emailAttempts: {
      type: Number,
      default: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },
    emailLockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    emailClaimToken: {
      type: String,
      default: "",
      select: false,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      maxlength: 300,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);
budgetAlertSchema.index(
  {
    budget: 1,
    revision: 1,
    scope: 1,
    level: 1,
  },
  {
    unique: true,
  },
);
budgetAlertSchema.index({
  user: 1,
  month: 1,
});
budgetAlertSchema.index({
  emailStatus: 1,
  nextAttemptAt: 1,
});
export default mongoose.model("BudgetAlert", budgetAlertSchema);
