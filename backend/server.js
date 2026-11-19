import "dotenv/config";
import mongoose from "mongoose";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { startBudgetAlertScheduler } from "./src/services/budgetAlertService.js";
import { startReminderScheduler } from "./src/services/reminderService.js";
const port = Number(process.env.PORT || 5000);
async function startServer() {
  // Checks settings and starts the database and server.
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a number between 1 and 65535.");
  }
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.includes("replace-with")
  ) {
    throw new Error(
      "Set JWT_SECRET in backend/.env to a random secret of at least 32 characters.",
    );
  }
  await connectDB();
  const stopReminders = startReminderScheduler();
  const stopBudgetAlerts = startBudgetAlertScheduler();
  const server = app.listen(port, () => {
    // Prints the running server address.
    console.log(`UtilityHub server: http://localhost:${port}/server`);
  });
  server.on("error", async (error) => {
    // Handles error events.
    console.error("Could not start the API:", error.message);
    stopReminders();
    stopBudgetAlerts();
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  function shutdown() {
    // Stops the server, schedulers, and database connection.
    stopReminders();
    stopBudgetAlerts();
    server.close(async () => {
      // Disconnects MongoDB before exiting.
      await mongoose.disconnect();
      process.exit(0);
    });
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
startServer().catch(async (error) => {
  // Handles a failed operation.
  console.error("Startup failed:", error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
