import { API_BASE_URL, apiRequest } from './apiClient.js';

// Developer-only routes. The server returns 404 unless SIGNBRIDGE_DEVELOPER_TOOLS_ENABLED is set.
export function getDatasetStatus(options) {
  return apiRequest('/dataset/status', options);
}

export function saveDatasetClip(payload) {
  return apiRequest('/dataset/clips', { method: 'POST', body: payload });
}

export function datasetExportUrl(format) {
  return `${API_BASE_URL}/dataset/export?format=${format}`;
}
