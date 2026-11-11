import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderWithRouter.jsx';
import { CONVERSATIONS_KEY } from '../lib/conversationStore.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dataset Collector', () => {
  it('explains why recording and training are disabled', () => {
    renderApp('/contribute/collector');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Recording and training are disabled');
    expect(status).toHaveTextContent('No class is verified');
    expect(status).toHaveTextContent('consent has not been recorded');
  });

  it('disables recording, deletion and every signer and metadata field', () => {
    renderApp('/contribute/collector');

    expect(screen.getByRole('button', { name: /Record/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Delete selected recording/ })).toBeDisabled();
    expect(screen.getByLabelText('Signer ID')).toBeDisabled();
    expect(screen.getByLabelText('Hand used')).toBeDisabled();
    expect(screen.getByLabelText('Lighting')).toBeDisabled();
    expect(screen.getByLabelText('Notes')).toBeDisabled();
  });

  it('shows dataset statistics that are real: nothing verified and nothing recorded', () => {
    renderApp('/contribute/collector');

    expect(screen.getByText('Verified classes').closest('div')).toHaveTextContent('Verified classes0');
    expect(screen.getByText('Samples recorded').closest('div')).toHaveTextContent('Samples recorded0');
    expect(screen.getByText('Dataset completion').closest('div')).toHaveTextContent('0%');
  });

  it('lets the user choose any letter and shows its status, marking J and Z as temporal', () => {
    renderApp('/contribute/collector');

    fireEvent.click(screen.getByRole('button', { name: 'J, temporal, unverified' }));
    expect(screen.getByRole('heading', { name: 'Letter J' })).toBeInTheDocument();
    expect(screen.getByText('Temporal (moving sign)')).toBeInTheDocument();
    expect(screen.getByText('Excluded: temporal, later phase')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A, static, unverified' }));
    expect(screen.getByRole('heading', { name: 'Letter A' })).toBeInTheDocument();
    expect(screen.getByText('Blocked: unverified')).toBeInTheDocument();
  });
});

describe('Fingerspelling builder', () => {
  it('builds HELLO from simulated letters, labels them, and refuses to send them', () => {
    renderApp('/fingerspelling');

    fireEvent.click(screen.getByRole('button', { name: 'Play HELLO' }));

    expect(screen.getByTestId('builder-text')).toHaveTextContent('HELLO');
    expect(screen.getByText('Contains simulated letters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to conversation' })).toBeDisabled();
    expect(screen.getByText(/Simulated letters cannot be sent/)).toBeInTheDocument();
  });

  it('types a word on the keyboard, confirms it, and sends it as typed text', () => {
    renderApp('/fingerspelling');

    ['h', 'i'].forEach((key) => fireEvent.keyDown(window, { key }));
    expect(screen.getByTestId('builder-text')).toHaveTextContent('HI');
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Send to conversation' }));

    const stored = JSON.parse(window.localStorage.getItem(CONVERSATIONS_KEY));
    expect(stored.conversations[0].messages[0]).toMatchObject({ text: 'HI', source: 'typed', speaker: 'deaf' });
    expect(screen.getByTestId('builder-text')).toHaveTextContent('Start typing a letter');
  });

  it('completes a word with a suggestion from the built-in list', () => {
    renderApp('/fingerspelling');

    ['h', 'e', 'l'].forEach((key) => fireEvent.keyDown(window, { key }));
    const suggestions = screen.getByRole('list', { name: 'Word suggestions' });
    fireEvent.click(within(suggestions).getByRole('button', { name: 'HELP' }));

    expect(screen.getByTestId('builder-text')).toHaveTextContent('HELP');
  });

  it('undoes the last letter with Ctrl+Z and backspaces with the Backspace key', () => {
    renderApp('/fingerspelling');

    ['c', 'a', 't'].forEach((key) => fireEvent.keyDown(window, { key }));
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('builder-text')).toHaveTextContent('CA');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('builder-text')).toHaveTextContent('CAT');
  });

  it('corrects a letter by selecting it and pressing the right key', () => {
    renderApp('/fingerspelling');

    ['h', 'a', 't'].forEach((key) => fireEvent.keyDown(window, { key }));
    fireEvent.click(screen.getByRole('button', { name: 'Letter A, Typed. Select to correct.' }));
    fireEvent.keyDown(window, { key: 'o' });

    expect(screen.getByTestId('builder-text')).toHaveTextContent('HOT');
  });

  it('says plainly that no trained model is loaded', () => {
    renderApp('/fingerspelling');

    expect(screen.getByRole('note')).toHaveTextContent('No trained alphabet model is loaded');
  });
});
