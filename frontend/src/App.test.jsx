import { screen, within } from '@testing-library/react';
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

  it('shows the translator as under development with an idle camera placeholder', () => {
    renderApp('/translator');

    expect(screen.getByRole('heading', { level: 1, name: 'Sign-to-text translator' })).toBeInTheDocument();
    expect(screen.getAllByText('Under development').length).toBeGreaterThan(0);
    expect(screen.getByText('Camera is off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Camera' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop Camera' })).toBeDisabled();
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
