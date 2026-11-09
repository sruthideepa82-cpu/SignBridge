import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/renderWithRouter.jsx';

describe('application shell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    window.localStorage.clear();
    document.documentElement.style.fontSize = '';
  });

  it('lists every navigation section and item in the sidebar', () => {
    renderApp('/dashboard');

    const nav = screen.getByRole('navigation', { name: 'Main application navigation' });
    for (const label of [
      'Overview',
      'Sign to Voice',
      'Voice to Text',
      'Quick Connect',
      'Conversation Space',
      'ISL Dictionary',
      'Guided Learning',
      'Practice Lab',
      'Dataset Contribution',
      'Community & Feedback',
      'Help & Support',
      'Accessibility',
      'Settings',
    ]) {
      expect(within(nav).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(nav).getByText('Communicate')).toBeInTheDocument();
    expect(within(nav).getByText('Learn')).toBeInTheDocument();
    expect(within(nav).getByText('Contribute')).toBeInTheDocument();
  });

  it('marks the current page as active in the sidebar', () => {
    renderApp('/voice-to-text');

    const nav = screen.getByRole('navigation', { name: 'Main application navigation' });
    expect(within(nav).getByRole('link', { name: 'Voice to Text' })).toHaveClass('text-lime-signal');
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveClass('text-lime-signal');
  });

  it('shows the current section and page in the breadcrumb', () => {
    renderApp('/quick-connect');

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Communicate')).toBeInTheDocument();
    expect(within(crumbs).getByText('Quick Connect', { selector: '[aria-current="page"]' })).toBeInTheDocument();
  });

  it('filters pages in the command search and opens the chosen page with the keyboard', async () => {
    renderApp('/dashboard');

    const search = screen.getByRole('combobox', { name: 'Search pages' });
    fireEvent.change(search, { target: { value: 'dict' } });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('ISL Dictionary');

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(await screen.findByRole('heading', { level: 1, name: 'ISL Dictionary' })).toBeInTheDocument();
  });

  it('reports when no page matches the search', () => {
    renderApp('/dashboard');

    fireEvent.change(screen.getByRole('combobox', { name: 'Search pages' }), { target: { value: 'zzz' } });

    expect(screen.getByText('No matching pages')).toBeInTheDocument();
  });

  it('shows an honest empty notifications state', () => {
    renderApp('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('applies the chosen text size and remembers it', () => {
    renderApp('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Accessibility options' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Extra large' }));

    expect(document.documentElement.style.fontSize).toBe('130%');
    expect(window.localStorage.getItem('signbridge.textScale')).toBe('xlarge');
  });

  it('closes an open menu with the Escape key', () => {
    renderApp('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
  });

  it('offers a navigation drawer on small screens', () => {
    renderApp('/dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByRole('link', { name: 'Sign to Voice' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
  });

  it('shows the backend as unreachable when the health check fails', async () => {
    renderApp('/dashboard');

    expect(await screen.findByText('Backend unreachable')).toBeInTheDocument();
  });
});
