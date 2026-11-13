import { getSupabaseClient } from '../lib/supabaseClient.js';

// Saves a completed sign translation for a signed-in user. Only the recognised words, the translated text, the
// time and the recognition scores are stored. No camera frames or landmarks are sent.
export const SIGN_TRANSLATIONS_TABLE = 'sign_translations';

export async function saveSignTranslation(message, recognition) {
  const client = await getSupabaseClient();
  if (!client) return { saved: false, reason: 'not_configured' };

  try {
    const { data } = await client.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return { saved: false, reason: 'signed_out' };

    const { error } = await client.from(SIGN_TRANSLATIONS_TABLE).insert({
      user_id: userId,
      signs: message.glosses,
      text: message.text,
      recognition,
      created_at: new Date(message.createdAt).toISOString(),
    });
    if (error) return { saved: false, reason: 'failed' };
    return { saved: true, reason: null };
  } catch {
    return { saved: false, reason: 'failed' };
  }
}
