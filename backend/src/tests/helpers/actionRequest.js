// Test-only client for the same POST action format used by React.
export function actionRequest(base, action, { body, headers = {} } = {}) {
  const name = typeof action === "string" ? action : action.action;
  let fields = typeof action === "string" ? {} : action.fields;
  if (body !== undefined) {
    fields =
      body && typeof body === "object" && !Array.isArray(body)
        ? { ...fields, ...body }
        : body;
  }
  return fetch(`${base}?action=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof fields === "string" ? fields : JSON.stringify(fields),
  });
}
