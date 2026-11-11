import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderWithRouter.jsx';
import { CONVERSATIONS_KEY } from '../lib/conversationStore.js';
import { FAVOURITES_KEY } from '../lib/phraseFavourites.js';
import { PROGRESS_KEY } from '../hooks/usePracticeProgress.js';

const STORE = {
  conversations: [
    {
      id: 'older',
      title: 'Pharmacy question',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      favourite: false,
      messages: [{ id: 'm1', speaker: 'deaf', source: 'sign', text: 'Medicine', at: 1700000000000, saved: true, edited: false }],
    },
    {
      id: 'newer',
      title: 'Team meeting',
      createdAt: 1800000000000,
      updatedAt: 1800000000000,
      favourite: true,
      messages: [{ id: 'm2', speaker: 'hearing', source: 'speech', text: 'Agenda please', at: 1800000000000, saved: false, edited: false }],
    },
  ],
  activeId: null,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  window.localStorage.clear();
  window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(STORE));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function openRowMenu(title) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${title}` }));
}

describe('History', () => {
  it('lists conversations and filters to favourites', () => {
    renderApp('/history');

    const list = screen.getByRole('list', { name: 'Conversation history' });
    expect(within(list).getByText('Team meeting')).toBeInTheDocument();
    expect(within(list).getByText('Pharmacy question')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), { target: { value: 'favourites' } });
    expect(within(list).queryByText('Pharmacy question')).not.toBeInTheDocument();
    expect(within(list).getByText('Team meeting')).toBeInTheDocument();
  });

  it('searches titles and message text', () => {
    renderApp('/history');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search history' }), { target: { value: 'agenda' } });

    const list = screen.getByRole('list', { name: 'Conversation history' });
    expect(within(list).getByText('Team meeting')).toBeInTheDocument();
    expect(within(list).queryByText('Pharmacy question')).not.toBeInTheDocument();
  });

  it('filters by date range', () => {
    renderApp('/history');

    fireEvent.change(screen.getByRole('combobox', { name: 'Date range' }), { target: { value: '7' } });

    const list = screen.getByRole('list', { name: 'Conversation history' });
    expect(within(list).queryByText('Pharmacy question')).not.toBeInTheDocument();
  });

  it('reopens a conversation on its own page', () => {
    renderApp('/history');

    openRowMenu('Team meeting');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reopen' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Team meeting' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY)).activeId).toBe('newer');
  });

  it('asks before deleting a conversation and removes it only after confirming', () => {
    renderApp('/history');

    openRowMenu('Pharmacy question');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this conversation?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Pharmacy question' })).toBeInTheDocument();

    openRowMenu('Pharmacy question');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete conversation' }));
    expect(screen.queryByRole('button', { name: 'Pharmacy question' })).not.toBeInTheDocument();
  });

  it('lists saved messages in their own tab', () => {
    renderApp('/history');

    fireEvent.click(screen.getByRole('tab', { name: /Saved messages/ }));

    expect(screen.getByRole('list', { name: 'Saved messages' })).toHaveTextContent('Medicine');
  });

  it('explains when there is no conversation history yet', () => {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify({ conversations: [], activeId: null }));
    renderApp('/history');

    expect(screen.getByText('No conversation history yet')).toBeInTheDocument();
  });
});

describe('Settings', () => {
  it('shows what is stored in this browser', () => {
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify([{ text: 'Hello', custom: false }]));
    renderApp('/settings');

    expect(screen.getByText('Saved phrases').nextSibling).toHaveTextContent('1');
  });

  it('erases local data only after confirmation', () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(['C']));
    renderApp('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Erase all local data' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Erase everything' }));

    expect(window.localStorage.getItem(CONVERSATIONS_KEY)).toBeNull();
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('All conversations');
  });

  it('applies the text size from the settings page', () => {
    renderApp('/settings');

    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));

    expect(document.documentElement.style.fontSize).toBe('115%');
  });
});

describe('Help', () => {
  it('explains how to start and what the pilot cannot do, and links to the other tools', () => {
    renderApp('/help');

    expect(screen.getByRole('heading', { level: 1, name: 'Help & Support' })).toBeInTheDocument();
    expect(screen.getByText(/does not translate full sentences/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ISL Dictionary/ })).toHaveAttribute('href', '/learn/dictionary');
  });
});
