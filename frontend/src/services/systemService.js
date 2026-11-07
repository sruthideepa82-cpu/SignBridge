import { apiRequest } from './apiClient.js';

export function getHealth(options) {
  return apiRequest('/health', options);
}
