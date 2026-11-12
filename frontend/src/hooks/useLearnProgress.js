import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { alphabetSignId, letterFromSignId } from '../data/signLibrary.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import {
  loadLearnState,
  mergeLearnStates,
  saveLearnState,
  withFavourite,
  withPractice,
} from '../lib/learnProgress.js';
import { buildProgressRows, fetchRemoteRows, rowsToProgress, upsertRemoteRows } from '../services/learnProgressService.js';
import usePracticeProgress from './usePracticeProgress.js';

export const SYNC_STATUS = {
  LOCAL: 'local',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  ERROR: 'error',
};

// Local storage is always updated first, so the app works offline and without an account. When a user is
// signed in, changes are also written to Supabase, and existing local progress is merged in on sign-in.
export default function useLearnProgress() {
  const { practised, toggle: toggleLetter, merge: mergeLetters } = usePracticeProgress();
  const [state, setState] = useState(() => loadLearnState());
  const [userId, setUserId] = useState(null);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.LOCAL);
  const clientRef = useRef(null);
  const latest = useRef({ practised, state, userId });
  latest.current = { practised, state, userId };

  const persist = useCallback((next) => {
    saveLearnState(next);
    setState(next);
  }, []);

  const pushAll = useCallback((completedLetters, next) => {
    const client = clientRef.current;
    const uid = latest.current.userId;
    if (!client || !uid) return;
    const completedIds = completedLetters.map(alphabetSignId);
    setSyncStatus(SYNC_STATUS.SYNCING);
    upsertRemoteRows(client, uid, buildProgressRows(completedIds, next)).then(
      () => setSyncStatus(SYNC_STATUS.SYNCED),
      () => setSyncStatus(SYNC_STATUS.ERROR),
    );
  }, []);

  useEffect(() => {
    let active = true;
    let subscription = null;
    getSupabaseClient()
      .then((client) => {
        if (!client || !active) return;
        clientRef.current = client;
        client.auth.getSession().then(({ data }) => {
          if (active) setUserId(data.session?.user.id ?? null);
        });
        subscription = client.auth.onAuthStateChange((_event, session) => {
          if (active) setUserId(session?.user.id ?? null);
        }).data.subscription;
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setSyncStatus(SYNC_STATUS.LOCAL);
      return undefined;
    }
    const client = clientRef.current;
    if (!client) return undefined;
    let active = true;
    setSyncStatus(SYNC_STATUS.SYNCING);
    fetchRemoteRows(client, userId)
      .then((rows) => {
        if (!active) return null;
        const remote = rowsToProgress(rows);
        const current = latest.current;
        const letters = [
          ...new Set([...current.practised, ...remote.completedIds.map(letterFromSignId).filter(Boolean)]),
        ];
        const merged = mergeLearnStates(current.state, remote.state);
        mergeLetters(letters);
        persist(merged);
        return upsertRemoteRows(client, userId, buildProgressRows(letters.map(alphabetSignId), merged)).then(() => {
          if (active) setSyncStatus(SYNC_STATUS.SYNCED);
        });
      })
      .catch(() => {
        if (active) setSyncStatus(SYNC_STATUS.ERROR);
      });
    return () => {
      active = false;
    };
  }, [userId, mergeLetters, persist]);

  const toggleCompleted = useCallback(
    (id) => {
      const letter = letterFromSignId(id);
      if (!letter) return;
      const current = latest.current;
      const wasDone = current.practised.includes(letter);
      const nextLetters = wasDone ? current.practised.filter((item) => item !== letter) : [...current.practised, letter];
      toggleLetter(letter);
      pushAll(nextLetters, current.state);
    },
    [toggleLetter, pushAll],
  );

  const toggleFavourite = useCallback(
    (id) => {
      const next = withFavourite(latest.current.state, id);
      persist(next);
      pushAll(latest.current.practised, next);
    },
    [persist, pushAll],
  );

  const recordPractice = useCallback(
    (id) => {
      const next = withPractice(latest.current.state, id);
      persist(next);
      pushAll(latest.current.practised, next);
    },
    [persist, pushAll],
  );

  const completedIds = useMemo(() => practised.map(alphabetSignId), [practised]);

  return {
    completedIds,
    favouriteIds: state.favourites,
    recent: state.recent,
    syncStatus,
    signedIn: userId !== null,
    toggleCompleted,
    toggleFavourite,
    recordPractice,
  };
}
