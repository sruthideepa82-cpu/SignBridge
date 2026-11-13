import { apiRequest } from './apiClient.js';

export function getRecognition(options) {
  return apiRequest('/recognition/latest', options);
}

export function getSequenceRecognition(options) {
  return apiRequest('/recognition/sequence', options);
}
