import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './apiClient.js';
import {
  STUDIO_CLIENT_HEADER,
  STUDIO_CLIENT_VALUE,
  checkRecording,
  getStudioStatus,
  registerParticipant,
  studioRequest,
} from './studioService.js';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function stubFetch(response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('studio service', () => {
  it('sends the Studio client header to the studio routes', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { participant_collection: 'disabled' }));
    await getStudioStatus();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/studio\/status$/);
    expect(init.headers[STUDIO_CLIENT_HEADER]).toBe(STUDIO_CLIENT_VALUE);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('sends a JSON body with the content type for writes', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { participant_code: 'P001' }));
    await registerParticipant('P001');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ participant_code: 'P001' });
  });

  it('turns the backend error payload into an ApiError with its code and message', async () => {
    stubFetch(jsonResponse(409, { error: { code: 'studio_conflict', message: 'This participant code is already registered.' } }));
    const error = await registerParticipant('P001').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('studio_conflict');
    expect(error.status).toBe(409);
    expect(error.message).toBe('This participant code is already registered.');
  });

  it('reports a forbidden response rather than treating it as success', async () => {
    stubFetch(jsonResponse(403, { error: { code: 'studio_forbidden', message: 'Local only.' } }));
    await expect(studioRequest('/status')).rejects.toMatchObject({ code: 'studio_forbidden' });
  });

  it('reports a network failure as network_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(studioRequest('/status')).rejects.toMatchObject({ code: 'network_error' });
  });

  it('sends the phrase check exactly as the operator filled it in', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { eligible: false, reasons: [], recording_enabled: false }));
    await checkRecording({ participant_code: null, consent_ref: null, phrase_id: 'DYN-01' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ participant_code: null, consent_ref: null, phrase_id: 'DYN-01' });
  });
});
