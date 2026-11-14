// Forward rejected controller promises to Express's error middleware.
export const asyncHandler =
  (controller) =>
  // Forwards rejected requests to Express error handling.
  (req, res, next) => {
    // Forwards rejected requests to Express error handling.
    Promise.resolve(controller(req, res, next)).catch(next);
  };
