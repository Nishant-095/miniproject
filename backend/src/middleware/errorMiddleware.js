export function notFound(req, res, next) {
  // Reports an unknown server path.
  const error = new Error(`Route not found: ${req.method} ${req.path}`);
  error.status = 404;
  next(error);
}
export function errorHandler(error, _req, res, next) {
  // Returns safe and readable server errors.
  if (res.destroyed) return;
  if (res.headersSent) return next(error);
  if (error.code === 11000) {
    return res.status(409).json({
      message: "An account with this email already exists.",
    });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({
      message: "Please check your input and try again.",
    });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "The request body must contain valid JSON.",
    });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      message: "The request is too large.",
    });
  }
  const status = error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status >= 500) console.error("Server error:", error.message);
  res.status(status).json({
    message:
      status >= 500
        ? "The server could not complete your request. Please try again."
        : error.message,
  });
}
