const { createClient } = require('@supabase/supabase-js');

let client = null;

function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const looksLikePlaceholder = (value) => !value || value.startsWith('your_');
  return !looksLikePlaceholder(url) && !looksLikePlaceholder(key);
}

/**
 * Server-side Supabase client using the service-role key.
 * This key must NEVER be sent to the browser; only Express talks to Supabase.
 */
function getSupabaseClient() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

module.exports = { getSupabaseClient, isSupabaseConfigured };
