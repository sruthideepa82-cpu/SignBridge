import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConversationPanel from './ConversationPanel.jsx';
import { CAPTION_PHASE, PROVIDER } from '../../lib/captionPhase.js';

vi.mock('../../hooks/useSpeechRecognition.js', () => ({
  default: () => ({ supported: true, status: 'idle', interim: '', error: '', start: vi.fn(), stop: vi.fn() }),
}));

function captionsWith(overrides = {}) {
  return {
    phase: CAPTION_PHASE.IDLE,
    provider: PROVIDER.GEMINI,
    draft: '',
    setDraft: vi.fn(),
    interimText: '',
    interrupted: false,
    interruptedEntries: [],
    language: 'auto',
    setLanguage: vi.fn(() => true),
    error: null,
    sendError: '',
    notice: '',
    micActive: false,
    userPaused: false,
    autoPaused: false,
    sessionBusy: false,
    canStart: true,
    canPause: false,
    canResume: false,
    canStop: false,
    fallbackOffered: false,
    fallbackActive: false,
    browserSupported: true,
    fallbackLanguage: 'en-IN',
    fallbackAutoLanguage: true,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),
    send: vi.fn(() => true),
    startFallback: vi.fn(),
    ...overrides,
  };
}

function renderPanel(captions) {
  return render(
    <ConversationPanel
      conversation={null}
      largeText={false}
      onSendReply={vi.fn()}
      recognitionProps={{}}
      history={{ entries: [], clear: vi.fn() }}
      landmarks={[]}
      cameraLive={false}
      recognition={null}
      recognitionError={null}
      captions={captions}
    />,
  );
}

describe('ConversationPanel microphone ownership', () => {
  it('locks the composer voice button while the captions session owns the microphone', () => {
    renderPanel(captionsWith({ sessionBusy: true, micActive: true }));

    expect(screen.getByRole('button', { name: 'Voice input' })).toBeDisabled();
    expect(screen.getByText('Stop live captions to use voice input here.')).toBeInTheDocument();
  });

  it('restores the composer voice button when the captions session is stopped', () => {
    renderPanel(captionsWith({ sessionBusy: false }));

    expect(screen.getByRole('button', { name: 'Voice input' })).toBeEnabled();
    expect(screen.queryByText('Stop live captions to use voice input here.')).not.toBeInTheDocument();
  });

  it('keeps the captions panel on the Conversation tab, above the composer', () => {
    renderPanel(captionsWith());

    const captionsHeading = screen.getByText('Speech to text');
    const composerInput = screen.getByRole('textbox', { name: 'Message' });
    expect(captionsHeading.compareDocumentPosition(composerInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
