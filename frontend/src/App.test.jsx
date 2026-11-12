import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './test/renderWithRouter.jsx';

describe('SignBridge routes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    window.localStorage.clear();
  });

  it('renders the landing page hero with primary and secondary calls to action', () => {
    renderApp('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Breaking Barriers. Connecting People.' }),
    ).toBeInTheDocument();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(within(hero).getByRole('link', { name: /start communicating/i })).toHaveAttribute('href', '/workspace/live-studio');
    expect(within(hero).getByRole('link', { name: /explore learning/i })).toHaveAttribute('href', '/learn');
  });

  it('lists every landing page feature', () => {
    renderApp('/');

    const features = document.getElementById('features');
    expect(within(features).getByText('Real-Time Sign Recognition')).toBeInTheDocument();
    expect(within(features).getByText('Sign-to-Text Translation')).toBeInTheDocument();
    expect(within(features).getByText('Text-to-Speech')).toBeInTheDocument();
    expect(within(features).getByText('Interactive Learning')).toBeInTheDocument();
  });

  it('shows Live Studio with an idle camera and its controls', () => {
    renderApp('/workspace/live-studio');

    expect(screen.getByRole('heading', { level: 1, name: 'Live Studio' })).toBeInTheDocument();
    expect(screen.getByText('Camera is off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Camera' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pause recognition' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop session' })).toBeDisabled();
  });

  it('keeps the old translator link working by opening Live Studio', () => {
    renderApp('/translator');

    expect(screen.getByRole('heading', { level: 1, name: 'Live Studio' })).toBeInTheDocument();
  });

  it('sends an emergency phrase from Live Studio into the conversation in one tap', () => {
    renderApp('/workspace/live-studio');

    fireEvent.click(screen.getByRole('button', { name: 'Emergency' }));
    fireEvent.click(screen.getByRole('button', { name: 'I need help now.' }));

    const transcript = screen.getByRole('list', { name: 'Conversation' });
    expect(within(transcript).getByText('I need help now.')).toBeInTheDocument();
    expect(within(transcript).getByText('Deaf participant', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows the application shell instead of the public navigation on app routes', () => {
    renderApp('/workspace/live-studio');

    expect(screen.getByRole('navigation', { name: 'Main application navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('shows the learning module as under development', () => {
    renderApp('/learn');

    expect(screen.getByRole('heading', { level: 1, name: 'Interactive sign-language learning' })).toBeInTheDocument();
    expect(screen.getByText('Finger spelling')).toBeInTheDocument();
  });

  it('keeps the old /live link working by redirecting to the workspace route', () => {
    renderApp('/live');

    expect(screen.getByRole('heading', { level: 1, name: 'Live Studio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Live Studio', current: 'page' })).toHaveAttribute('href', '/workspace/live-studio');
  });

  it('renders no public website content inside the workspace', () => {
    renderApp('/workspace/live-studio');

    expect(screen.queryByRole('heading', { name: 'Breaking Barriers. Connecting People.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByText('Start Communicating')).not.toBeInTheDocument();
  });

  it('does not request camera permission or start the camera until Start Camera is pressed', () => {
    renderApp('/workspace/live-studio');

    expect(fetch.mock.calls.some(([url]) => String(url).includes('/camera/start'))).toBe(false);
    expect(screen.getByText('Camera is off')).toBeInTheDocument();
  });

  it('explains when the webcam access is blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (String(url).includes('/camera/start')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                running: false,
                last_error: 'The webcam opened but did not deliver any frames. Camera access may be blocked by privacy settings.',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.reject(new TypeError('Failed to fetch'));
      }),
    );
    renderApp('/workspace/live-studio');

    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Camera access is blocked');
  });

  it('shows a not-found page for unknown routes', () => {
    renderApp('/does-not-exist');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows the navigation bar with the SignBridge logo link', () => {
    renderApp('/');

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'SignBridge home' })).toBeInTheDocument();
  });
});
