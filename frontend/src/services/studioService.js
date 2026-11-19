// Dataset Collection Studio API client (Stage 5B). Local operator only.
//
// The shared apiClient cannot set custom headers, so this module sends the header the Studio requires itself.
// The backend refuses Studio requests without it, and browsers from other sites cannot send it (CORS).
import { API_BASE_URL, ApiError } from './apiClient.js';

export const STUDIO_CLIENT_HEADER = 'X-Studio-Client';
export const STUDIO_CLIENT_VALUE = 'studio';

export async function studioRequest(path, { method = 'GET', body, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const headers = { Accept: 'application/json', [STUDIO_CLIENT_HEADER]: STUDIO_CLIENT_VALUE };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await doFetch(`${API_BASE_URL}/studio${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the SignBridge backend. Make sure it is running on port 8000.', {
      code: 'network_error',
    });
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new ApiError(payload?.error?.message ?? payload?.detail ?? `Request failed with status ${response.status}.`, {
      status: response.status,
      code: payload?.error?.code ?? `http_${response.status}`,
    });
  }
  return payload;
}

const enc = encodeURIComponent;

export const getStudioStatus = () => studioRequest('/status');
export const getStudioDashboard = () => studioRequest('/dashboard');
export const listParticipants = () => studioRequest('/participants');
export const registerParticipant = (participantCode) =>
  studioRequest('/participants', { method: 'POST', body: { participant_code: participantCode } });
export const getParticipant = (code) => studioRequest(`/participants/${enc(code)}`);
export const listConsents = () => studioRequest('/consents');
export const recordConsent = (code, body) =>
  studioRequest(`/participants/${enc(code)}/consents`, { method: 'POST', body });
export const withdrawConsent = (code, body) =>
  studioRequest(`/participants/${enc(code)}/consents/withdraw`, { method: 'POST', body });
export const listPhrases = () => studioRequest('/phrases');
export const checkRecording = (body) => studioRequest('/recording-checks', { method: 'POST', body });
export const listSessions = () => studioRequest('/sessions');
export const listRecordings = () => studioRequest('/recordings');
export const listReviews = () => studioRequest('/reviews');
export const listDatasetVersions = () => studioRequest('/dataset-versions');
export const listAudit = (limit = 20) => studioRequest(`/audit?limit=${enc(limit)}`);
