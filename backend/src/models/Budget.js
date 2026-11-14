import mongoose from "mongoose";
import {
  EXPENSE_CATEGORIES,
  MAX_AMOUNT_PAISE,
} from "../config/expenseConfig.js";
const categoryBudget = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      required: true,
    },
    limitPaise: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_AMOUNT_PAISE,
      validate: Number.isSafeInteger,
    },
  },
  {
    _id: false,
  },
);
const budgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    month: {
      type: String,
      required: true,
      match: /^20\d{2}-(0[1-9]|1[0-2])$/,
    },
    overallPaise: {
      type: Number,
      min: 0,
      max: MAX_AMOUNT_PAISE,
      default: null,
      validate: (value) =>
        // Accepts whole paise or an unset limit.
        value === null || Number.isSafeInteger(value),
    },
    categories: {
      type: [categoryBudget],
      default: [],
    },
    revision: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);
budgetSchema.index(
  {
    user: 1,
    month: 1,
  },
  {
    unique: true,
  },
);
export default mongoose.model("Budget", budgetSchema);
