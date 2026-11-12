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
    for (const label of ['Overview', 'Live Studio', 'Conversations', 'Quick Phrases', 'Learn Signs', 'History', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Profile' })).toBeInTheDocument();
  });

  it('marks the current page as active in the sidebar', () => {
    renderApp('/live');

    const nav = screen.getByRole('navigation', { name: 'Main application navigation' });
    expect(within(nav).getByRole('link', { name: 'Live Studio' })).toHaveClass('text-app-text');
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveClass('text-app-text');
  });

  it('shows the current section and page in the breadcrumb', () => {
    renderApp('/phrases');

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Workspace')).toBeInTheDocument();
    expect(within(crumbs).getByText('Quick Phrases', { selector: '[aria-current="page"]' })).toBeInTheDocument();
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

  it('finds pages that are not in the sidebar, such as Voice to Text', () => {
    renderApp('/dashboard');

    fireEvent.change(screen.getByRole('combobox', { name: 'Search pages' }), { target: { value: 'voice' } });

    expect(screen.getByRole('option', { name: /Voice to Text/ })).toBeInTheDocument();
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
    expect(within(drawer).getByRole('link', { name: 'Live Studio' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
  });

  it('shows the backend as unreachable when the health check fails', async () => {
    renderApp('/dashboard');

    expect((await screen.findAllByText('Backend unreachable')).length).toBeGreaterThan(0);
  });
});
