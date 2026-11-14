import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const protect = asyncHandler(async (req, res, next) => {
  // Verifies the token and loads its account.
  const parts = (req.headers.authorization || "").split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return res.status(401).json({
      message: "Please sign in to continue.",
    });
  }
  let payload;
  try {
    payload = jwt.verify(parts[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({
      message: "Your session expired. Please sign in again.",
    });
  }
  if (
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !mongoose.isObjectIdOrHexString(payload.sub)
  ) {
    return res.status(401).json({
      message: "Invalid session. Please sign in again.",
    });
  }
  // Database failures are server errors, not invalid sessions.
  const user = await User.findById(payload.sub);
  if (!user)
    return res.status(401).json({
      message: "This account no longer exists.",
    });
  req.user = user;
  next();
});
