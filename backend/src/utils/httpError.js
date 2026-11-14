export function httpError(status, message) {
  // Creates an error with an HTTP status.
  return Object.assign(new Error(message), {
    status,
  });
}
