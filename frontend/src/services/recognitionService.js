import { apiRequest } from './apiClient.js';

export function getRecognition(options) {
  return apiRequest('/recognition/latest', options);
}
