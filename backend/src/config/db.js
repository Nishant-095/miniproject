import mongoose from "mongoose";
import Note from "../models/Note.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import Expense from "../models/Expense.js";
import Budget from "../models/Budget.js";
import BudgetAlert from "../models/BudgetAlert.js";
import Activity from "../models/Activity.js";
export default async function connectDB() {
  // Connects MongoDB and prepares model indexes.
  if (!process.env.MONGO_URI) throw new Error("Set MONGO_URI in backend/.env.");
  mongoose.set("strictQuery", true);
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([
    User.init(),
    Note.init(),
    Task.init(),
    Notification.init(),
    Activity.init(),
    Expense.init(),
    Budget.init(),
    BudgetAlert.init(),
  ]);
  console.log("MongoDB connected.");
}
