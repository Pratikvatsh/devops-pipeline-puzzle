/**
 * Game persistence layer.
 *
 * Production: Supabase PostgreSQL (the `games` table from supabase/schema.sql).
 * Local fallback: an in-memory store, used ONLY when USE_MEMORY_STORE=true or
 * when Supabase is not configured outside production. It lets you try the game
 * (and run the tests) before setting up Supabase. Data is lost on restart.
 *
 * Every store exposes the same four functions:
 *   createGame(row) -> row
 *   findGame(id) -> row | null
 *   updateGame(id, patch, expected) -> updated row | null
 *        `expected` is a set of column values that must still match. This is
 *        how we stop double submissions and races from awarding points twice.
 *   listLeaderboard(limit) -> rows
 */
const crypto = require('crypto');
const { getSupabaseClient, isSupabaseConfigured } = require('./supabase');
const { DatabaseError } = require('../utils/httpError');

const TABLE = 'games';

// ---------- Supabase store ----------

async function runQuery(query) {
  let result;
  try {
    result = await query;
  } catch (err) {
    throw new DatabaseError(err);
  }
  if (result.error) throw new DatabaseError(result.error);
  return result.data;
}

const supabaseStore = {
  name: 'supabase',

  async createGame(row) {
    return runQuery(getSupabaseClient().from(TABLE).insert(row).select().single());
  },

  async findGame(id) {
    return runQuery(getSupabaseClient().from(TABLE).select('*').eq('id', id).maybeSingle());
  },

  async updateGame(id, patch, expected = {}) {
    let query = getSupabaseClient()
      .from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    for (const [column, value] of Object.entries(expected)) {
      query = query.eq(column, value);
    }
    const rows = await runQuery(query.select());
    return rows && rows.length ? rows[0] : null;
  },

  async listLeaderboard(limit) {
    return runQuery(
      getSupabaseClient()
        .from(TABLE)
        .select('player_name,total_score,percentage,completed_at')
        .eq('completed', true)
        .order('total_score', { ascending: false })
        .order('completed_at', { ascending: true })
        .limit(limit)
    );
  }
};

// ---------- In-memory store (local development / tests only) ----------

const memoryRows = new Map();
const clone = (value) => (value === null || value === undefined ? value : structuredClone(value));

const memoryStore = {
  name: 'memory',

  async createGame(row) {
    const now = new Date().toISOString();
    const stored = { id: crypto.randomUUID(), started_at: now, updated_at: now, completed_at: null, ...clone(row) };
    memoryRows.set(stored.id, stored);
    return clone(stored);
  },

  async findGame(id) {
    return clone(memoryRows.get(id) || null);
  },

  async updateGame(id, patch, expected = {}) {
    const row = memoryRows.get(id);
    if (!row) return null;
    const matches = Object.entries(expected).every(([column, value]) => row[column] === value);
    if (!matches) return null;
    Object.assign(row, clone(patch), { updated_at: new Date().toISOString() });
    return clone(row);
  },

  async listLeaderboard(limit) {
    return [...memoryRows.values()]
      .filter((row) => row.completed)
      .sort((a, b) => b.total_score - a.total_score || a.completed_at.localeCompare(b.completed_at))
      .slice(0, limit)
      .map(({ player_name, total_score, percentage, completed_at }) => ({ player_name, total_score, percentage, completed_at }));
  }
};

// ---------- Unavailable store (production without credentials) ----------

const unavailable = async () => {
  throw new DatabaseError(new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).'));
};
const unconfiguredStore = {
  name: 'unconfigured',
  createGame: unavailable,
  findGame: unavailable,
  updateGame: unavailable,
  listLeaderboard: unavailable
};

function chooseStore() {
  if (process.env.USE_MEMORY_STORE === 'true') {
    console.warn('[store] USE_MEMORY_STORE=true: using a temporary in-memory store. Data is lost on restart.');
    return memoryStore;
  }
  if (isSupabaseConfigured()) return supabaseStore;
  if (process.env.NODE_ENV === 'production') {
    console.error('[store] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. Game API calls will fail until they are set.');
    return unconfiguredStore;
  }
  console.warn('[store] Supabase is not configured. Falling back to a temporary in-memory store for local development.');
  return memoryStore;
}

const store = chooseStore();

module.exports = {
  storeName: store.name,
  createGame: (row) => store.createGame(row),
  findGame: (id) => store.findGame(id),
  updateGame: (id, patch, expected) => store.updateGame(id, patch, expected),
  listLeaderboard: (limit) => store.listLeaderboard(limit)
};
