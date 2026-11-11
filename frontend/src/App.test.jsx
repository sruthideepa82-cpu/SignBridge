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
    expect(within(hero).getByRole('link', { name: /start communicating/i })).toHaveAttribute('href', '/live');
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
    renderApp('/live');

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
    renderApp('/live');

    fireEvent.click(screen.getByRole('button', { name: 'Emergency' }));
    fireEvent.click(screen.getByRole('button', { name: 'I need help now.' }));

    const transcript = screen.getByRole('list', { name: 'Conversation' });
    expect(within(transcript).getByText('I need help now.')).toBeInTheDocument();
    expect(within(transcript).getByText('Deaf participant', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows the application shell instead of the public navigation on app routes', () => {
    renderApp('/live');

    expect(screen.getByRole('navigation', { name: 'Main application navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('shows the learning module as under development', () => {
    renderApp('/learn');

    expect(screen.getByRole('heading', { level: 1, name: 'Interactive sign-language learning' })).toBeInTheDocument();
    expect(screen.getByText('Finger spelling')).toBeInTheDocument();
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
