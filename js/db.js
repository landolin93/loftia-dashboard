// Everything that talks to Supabase.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function check({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ── sign-in ──
export async function session() { return (await sb.auth.getSession()).data.session; }
export function onAuth(fn) { sb.auth.onAuthStateChange((_e, s) => fn(s)); }
export async function sendSignInLink(email) {
  const redirect = location.origin + location.pathname;
  check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }));
}
export async function signOut() { await sb.auth.signOut(); }

// ── load everything ──
export async function loadAll() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [req, inv, comp, finds] = await Promise.all([
    sb.from('app_data').select('data').eq('id', 'requests').maybeSingle(),
    sb.from('inventory').select('item_key, have').limit(5000),
    sb.from('completions').select('day, bin, item_key, removed, requested').limit(5000),
    sb.from('finds').select('id, ts, item_key, qty').gte('ts', start.toISOString()).order('id', { ascending: false }).limit(50),
  ]);
  return { requests: check(req)?.data || null, inventory: check(inv), completions: check(comp), finds: check(finds) };
}

// ── changes (each one is all-or-nothing on the server) ──
export async function setInventory(rows, replace = false) {
  check(await sb.rpc('set_inventory', { p_rows: rows, p_replace: replace }));
}
export async function completeBin(day, bin, items) { check(await sb.rpc('complete_bin', { p_day: day, p_bin: bin, p_items: items })); }
export async function undoBin(day, bin) { check(await sb.rpc('undo_bin', { p_day: day, p_bin: bin })); }
export async function logFind(itemKey, qty) { return check(await sb.rpc('log_find', { p_item_key: itemKey, p_qty: qty })); }
export async function undoFind(id) { check(await sb.rpc('undo_find', { p_id: id })); }
export async function makeBackup(label) { return check(await sb.rpc('make_backup', { p_label: label })); }
export async function listBackups() {
  return check(await sb.from('backups').select('id, created_at, label').order('created_at', { ascending: false }).limit(30));
}
export async function addBackup(label, data) {
  return check(await sb.from('backups').insert({ label, data }).select('id').single()).id;
}
export async function restoreBackup(id) { check(await sb.rpc('restore_backup', { p_id: id })); }

// ── Update requests (runs the server function that reads loftiacodex.com) ──
export async function runUpdate(today, knownDishes) {
  const { data, error } = await sb.functions.invoke('update-requests', { body: { today, known_dishes: knownDishes } });
  if (error) {
    let msg = '';
    try { msg = (await error.context.json()).error; } catch { /* not JSON */ }
    if (!msg) {
      msg = /fetch|network|Failed to send/i.test(error.message || '')
        ? 'Couldn\u2019t reach your Supabase server. Check your internet connection, then try again.'
        : (error.message || 'The update failed.');
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data.data;
}
