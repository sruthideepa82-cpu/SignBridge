import { API_BASE_URL, apiRequest } from './apiClient.js';

export function getCameraStatus(options) {
  return apiRequest('/camera/status', options);
}

export function getHandLandmarks(options) {
  return apiRequest('/camera/landmarks', options);
}

export function startCamera() {
  return apiRequest('/camera/start', { method: 'POST' });
}

export function stopCamera() {
  return apiRequest('/camera/stop', { method: 'POST' });
}

export function buildCameraStreamUrl() {
  return `${API_BASE_URL}/camera/stream?t=${Date.now()}`;
}
