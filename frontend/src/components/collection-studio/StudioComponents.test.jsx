import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/apiClient.js';
import * as studio from '../../services/studioService.js';
import PhraseCatalogPanel from './PhraseCatalogPanel.jsx';
import ParticipantsPanel from './ParticipantsPanel.jsx';
import StudioListPanel from './StudioListPanel.jsx';
import StudioShell, { collectionBanner } from './StudioShell.jsx';

vi.mock('../../services/studioService.js', () => ({
  getStudioStatus: vi.fn(),
  getStudioDashboard: vi.fn(),
  listAudit: vi.fn(),
  listPhrases: vi.fn(),
  checkRecording: vi.fn(),
  listParticipants: vi.fn(),
  getParticipant: vi.fn(),
  registerParticipant: vi.fn(),
  recordConsent: vi.fn(),
  withdrawConsent: vi.fn(),
  listConsents: vi.fn(),
  listSessions: vi.fn(),
  listRecordings: vi.fn(),
  listReviews: vi.fn(),
  listDatasetVersions: vi.fn(),
}));

const DISABLED = { participant_collection: 'disabled', recording_enabled: false, recording_flag: 'SIGNBRIDGE_STUDIO_RECORDING_ENABLED', binding: '127.0.0.1 only', schema_version: 1, message: 'x' };
const PHRASES = [
  { phrase_id: 'DYN-01', label: 'again', verified: false, recording_blocked: true, blocked_reason: 'Unverified: no qualified reviewer has verified this label.' },
  { phrase_id: 'DYN-02', label: 'agree', verified: false, recording_blocked: true, blocked_reason: 'Unverified: no qualified reviewer has verified this label.' },
];

beforeEach(() => {
  vi.clearAllMocks();
  studio.getStudioStatus.mockResolvedValue(DISABLED);
  studio.listPhrases.mockResolvedValue(PHRASES);
  studio.listParticipants.mockResolvedValue([]);
  studio.listSessions.mockResolvedValue([]);
});

describe('collection banner', () => {
  it('shows disabled while the status is unknown, unavailable or disabled', () => {
    expect(collectionBanner(null, '').title).toBe('Checking collection status…');
    expect(collectionBanner(null, 'Cannot reach').title).toBe('PARTICIPANT COLLECTION DISABLED');
    expect(collectionBanner(DISABLED, '').title).toBe('PARTICIPANT COLLECTION DISABLED');
  });

  it('warns only when the flag is on, and still says gates apply', () => {
    const banner = collectionBanner({ ...DISABLED, participant_collection: 'enabled' }, '');
    expect(banner.tone).toBe('warning');
    expect(banner.text).toContain('still needs every gate condition');
  });
});

describe('StudioShell', () => {
  it('shows PARTICIPANT COLLECTION DISABLED from the backend status', async () => {
    render(<MemoryRouter><StudioShell><p>content</p></StudioShell></MemoryRouter>);
    expect(await screen.findByText('PARTICIPANT COLLECTION DISABLED')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('names every section in the navigation', async () => {
    render(<MemoryRouter><StudioShell><p /></StudioShell></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Dataset Collection Studio' });
    for (const label of ['Dashboard', 'Participants', 'Consent records', 'Phrase catalogue', 'Recording sessions',
      'Dataset browser', 'Review queue', 'Quality reports', 'Dataset versions', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});

describe('PhraseCatalogPanel', () => {
  it('shows every phrase as blocked with its reason', async () => {
    render(<PhraseCatalogPanel />);
    expect((await screen.findAllByText('Recording blocked')).length).toBe(2);
    expect(screen.getAllByText(/no qualified reviewer has verified/).length).toBeGreaterThan(0);
  });

  it('shows the server reasons when a check is refused, and never reports a recording', async () => {
    studio.checkRecording.mockResolvedValue({
      eligible: false,
      reasons: [{ code: 'phrase_unverified', message: "'again' is blocked." }, { code: 'recording_disabled', message: 'Disabled.' }],
      recording_enabled: false,
    });
    render(<PhraseCatalogPanel />);
    await screen.findAllByText('Recording blocked');
    fireEvent.change(screen.getByLabelText('Phrase'), { target: { value: 'DYN-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Recording is blocked.')).toBeInTheDocument();
    expect(screen.getByText("'again' is blocked.")).toBeInTheDocument();
    expect(screen.getByText('Disabled.')).toBeInTheDocument();
    expect(screen.getByText(/This check does not create a recording/)).toBeInTheDocument();
  });
});

describe('StudioListPanel', () => {
  it('shows an honest empty state, not placeholder rows', async () => {
    render(<StudioListPanel title="Sessions" loader={studio.listSessions} columns={[{ key: 'session_id', label: 'Session' }]}
      emptyTitle="No recording sessions" emptyText="None exist." />);
    expect(await screen.findByText('No recording sessions')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a load error instead of an empty table', async () => {
    studio.listSessions.mockRejectedValue(new ApiError('Cannot reach the SignBridge backend.', { code: 'network_error' }));
    render(<StudioListPanel title="Sessions" loader={studio.listSessions} columns={[{ key: 'session_id', label: 'Session' }]}
      emptyTitle="No recording sessions" emptyText="None exist." />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the SignBridge backend.');
    expect(screen.queryByText('No recording sessions')).toBeNull();
  });
});

describe('ParticipantsPanel', () => {
  it('shows the server refusal for a duplicate participant rather than hiding it', async () => {
    studio.registerParticipant.mockRejectedValue(new ApiError('This participant code is already registered.', { code: 'studio_conflict', status: 409 }));
    render(<ParticipantsPanel />);
    fireEvent.change(await screen.findByLabelText('Participant code'), { target: { value: 'P001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('already registered'));
  });

  it('shows a clear empty state for participants', async () => {
    render(<ParticipantsPanel />);
    expect(await screen.findByText('No participants yet')).toBeInTheDocument();
  });
});
