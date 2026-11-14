import mongoose from "mongoose";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  MAX_AMOUNT_PAISE,
} from "../config/expenseConfig.js";
const expenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_AMOUNT_PAISE,
      validate: Number.isSafeInteger,
    },
    category: {
      type: String,
      required: true,
      enum: EXPENSE_CATEGORIES,
    },
    // A calendar date, not an instant. Month membership is independent of timezone.
    date: {
      type: String,
      required: true,
      match: /^20\d{2}-\d{2}-\d{2}$/,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "upi",
    },
  },
  {
    timestamps: true,
  },
);
expenseSchema.index({
  user: 1,
  date: -1,
  _id: -1,
});
export default mongoose.model("Expense", expenseSchema);
