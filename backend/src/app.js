import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { handleAction } from "./controllers/serverActions.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Allows requests only from configured frontend origins.
      const allowed = (process.env.CLIENT_URL || "http://localhost:5173")
        .split(",")
        .map((url) =>
          // Builds a value for each item.
          url.trim(),
        );
      if (!origin || allowed.includes(origin)) return callback(null, true);
      const error = new Error(
        "This website is not allowed to access the server.",
      );
      error.status = 403;
      callback(error);
    },
    methods: ["POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: [
      "Content-Disposition",
      "X-Original-Size",
      "X-Compressed-Size",
      "X-Saved-Percent",
      "X-Compression-Result",
      "X-Output-Size",
      "X-Image-Width",
      "X-Image-Height",
    ],
  }),
);
const normalFields = express.json({
  limit: "100kb",
});
const textFields = express.json({
  limit: "512kb",
});
app.use(
  "/server",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message: "Too many requests. Please try again in 15 minutes.",
    },
  }),
);
app.post(
  "/server",
  (req, res, next) => {
    // Chooses the JSON size limit for this action.
    const parse = req.query.action === "textToPdf" ? textFields : normalFields;
    parse(req, res, next);
  },
  handleAction,
);
app.use(notFound);
app.use(errorHandler);
export default app;
