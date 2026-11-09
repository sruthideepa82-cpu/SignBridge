import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './test/renderWithRouter.jsx';

describe('SignBridge routes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  });

  it('renders the landing page hero with primary and secondary calls to action', () => {
    renderApp('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Breaking Barriers. Connecting People.' }),
    ).toBeInTheDocument();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(within(hero).getByRole('link', { name: /start communicating/i })).toHaveAttribute(
      'href',
      '/translator',
    );
    expect(within(hero).getByRole('link', { name: /explore learning/i })).toHaveAttribute(
      'href',
      '/learn',
    );
  });

  it('lists every landing page feature', () => {
    renderApp('/');

    const features = document.getElementById('features');
    expect(within(features).getByText('Real-Time Sign Recognition')).toBeInTheDocument();
    expect(within(features).getByText('Sign-to-Text Translation')).toBeInTheDocument();
    expect(within(features).getByText('Text-to-Speech')).toBeInTheDocument();
    expect(within(features).getByText('Interactive Learning')).toBeInTheDocument();
  });

  it('shows the translator headline with an idle camera and the processing modes', () => {
    renderApp('/translator');

    expect(screen.getByRole('heading', { level: 1, name: 'Sign to Voice' })).toBeInTheDocument();
    expect(screen.getByText('Camera is off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Camera' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop Camera' })).toBeDisabled();

    const modes = screen.getByRole('radiogroup', { name: 'Processing mode' });
    expect(within(modes).getByRole('radio', { name: /Hand Tracking/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(modes).getByRole('radio', { name: /Emotion Detection/ })).toBeDisabled();
    expect(within(modes).getByRole('radio', { name: /LLM Interpretation/ })).toBeDisabled();
    expect(within(modes).getByRole('radio', { name: /Voice Output/ })).toBeEnabled();
  });

  it('switches the processing mode when an enabled mode is chosen', () => {
    renderApp('/translator');

    const modes = screen.getByRole('radiogroup', { name: 'Processing mode' });
    fireEvent.click(within(modes).getByRole('radio', { name: /Voice Output/ }));

    expect(within(modes).getByRole('radio', { name: /Voice Output/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(modes).getByRole('radio', { name: /Hand Tracking/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the application shell instead of the public navigation on app routes', () => {
    renderApp('/translator');

    expect(screen.getByRole('navigation', { name: 'Main application navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('shows the learning module as under development', () => {
    renderApp('/learn');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Interactive sign-language learning' }),
    ).toBeInTheDocument();
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
