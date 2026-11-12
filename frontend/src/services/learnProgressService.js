import { SIGNS } from '../data/signLibrary.js';
import { RECENT_LIMIT } from '../lib/learnProgress.js';

// One row per user and sign. Row level security in supabase/migrations limits each user to their own rows.
export const LEARN_PROGRESS_TABLE = 'learn_progress';

// Builds one row for every known sign, so a sign that was un-favourited is written back as false.
export function buildProgressRows(completedIds, state, signs = SIGNS) {
  const ids = [...new Set([...signs.map((sign) => sign.id), ...state.favourites, ...state.recent.map((item) => item.id)])];
  const completed = new Set(completedIds);
  const lastPracticed = new Map(state.recent.map((item) => [item.id, item.at]));
  return ids.map((id) => ({
    sign_id: id,
    completed: completed.has(id),
    favourite: state.favourites.includes(id),
    last_practised_at: lastPracticed.has(id) ? new Date(lastPracticed.get(id)).toISOString() : null,
  }));
}

export function rowsToProgress(rows) {
  const recent = rows
    .filter((row) => row.last_practised_at)
    .map((row) => ({ id: row.sign_id, at: Date.parse(row.last_practised_at) }))
    .filter((item) => !Number.isNaN(item.at))
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_LIMIT);
  return {
    completedIds: rows.filter((row) => row.completed).map((row) => row.sign_id),
    state: {
      favourites: rows.filter((row) => row.favourite).map((row) => row.sign_id),
      recent,
    },
  };
}

export async function fetchRemoteRows(client, userId) {
  const { data, error } = await client
    .from(LEARN_PROGRESS_TABLE)
    .select('sign_id, completed, favourite, last_practised_at')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertRemoteRows(client, userId, rows) {
  if (rows.length === 0) return;
  const updatedAt = new Date().toISOString();
  const payload = rows.map((row) => ({ user_id: userId, ...row, updated_at: updatedAt }));
  const { error } = await client.from(LEARN_PROGRESS_TABLE).upsert(payload, { onConflict: 'user_id,sign_id' });
  if (error) throw error;
}
