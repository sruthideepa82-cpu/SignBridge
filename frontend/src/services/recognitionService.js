import { apiRequest } from './apiClient.js';

export function getRecognition(options) {
  return apiRequest('/recognition/latest', options);
}

export function getSequenceRecognition(options) {
  return apiRequest('/recognition/sequence', options);
}

export function getPhraseRecognition({ phrase, ...options } = {}) {
  const query = phrase ? `?phrase=${encodeURIComponent(phrase)}` : '';
  return apiRequest(`/recognition/phrase/latest${query}`, options);
}

export function getPhraseModel(options) {
  return apiRequest('/recognition/phrase/model', options);
}
