// Developer-only tools (dataset collection) are hidden unless VITE_SIGNBRIDGE_DEVELOPER_TOOLS is 'true' at build or
// dev-server start. Read on each call so tests can change it. The API routes are gated separately on the backend.
export function developerToolsEnabled(env = import.meta.env) {
  return env.VITE_SIGNBRIDGE_DEVELOPER_TOOLS === 'true';
}
