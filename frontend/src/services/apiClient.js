export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// The Vite dev proxy answers with one of these, and no JSON body, when the backend is not running.
const PROXY_UNREACHABLE_STATUSES = [502, 503, 504];

export class ApiError extends Error {
  constructor(message, { status = null, code = 'unknown_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest(path, { method = 'GET', signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(
      'Cannot reach the SignBridge backend. Make sure it is running on port 8000.',
      { code: 'network_error' },
    );
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    if (payload === null && PROXY_UNREACHABLE_STATUSES.includes(response.status)) {
      throw new ApiError(
        'Cannot reach the SignBridge backend. Make sure it is running on port 8000.',
        { status: response.status, code: 'network_error' },
      );
    }
    throw new ApiError(
      payload?.error?.message ?? payload?.detail ?? `Request failed with status ${response.status}.`,
      { status: response.status, code: payload?.error?.code ?? `http_${response.status}` },
    );
  }

  return payload;
}
