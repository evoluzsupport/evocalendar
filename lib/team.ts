import { decrypt, encrypt } from './crypto';
import { CalEvent, fetchEvents } from './events';
import { SHARE_USER, slimAccounts } from './share';
import { Account, Share, User, listOwnedShares, patchShare } from './store';

// Free-mail domains can never be shared as "everyone in the organisation".
const PUBLIC_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.in', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'zohomail.com', 'zohomail.in', 'zoho.in']);
export const isPublicDomain = (d: string) => PUBLIC_DOMAINS.has(d.toLowerCase());
export const domainOf = (email: string) => (email.split('@')[1] || '').toLowerCase();

/** Seals the chosen accounts so the server can read them later on behalf of recipients (AES-256-GCM, same key as sessions). */
export const sealAccounts = (accounts: Account[]) => encrypt(JSON.stringify(slimAccounts(accounts)));
export function openAccounts(s: Share): Account[] {
  try { return (JSON.parse(decrypt(s.accounts_enc)) as Account[]).map(a => ({ ...a, user_id: SHARE_USER })); } catch { return []; }
}

/**
 * Refreshes the stored credentials of every share an owner has, from the accounts they still have connected.
 * An account the owner disconnected is dropped from the share, so it stops being exposed.
 */
export async function syncOwnedShares(owner: User, accounts: Account[]) {
  for (const s of await listOwnedShares(owner.id)) {
    const ids = new Set(openAccounts(s).map(a => a.id));
    const keep = accounts.filter(a => ids.has(a.id));
    await patchShare(owner.id, s.id, { accounts_enc: sealAccounts(keep), owner_name: owner.name || owner.email });
  }
}

/** Events of one shared calendar, as the recipient may see them (never account emails or tokens; in busy mode no titles either). */
export async function eventsForShare(s: Share, from: Date, to: Date): Promise<{ events: CalEvent[]; error?: string }> {
  const accounts = openAccounts(s);
  const label = s.owner_name || s.owner_email;
  if (!accounts.length) return { events: [], error: `${label}: nothing is shared any more` };
  const r = await fetchEvents(accounts, from, to);
  const busy = s.permission === 'busy';
  const events = r.events.map((e): CalEvent => ({
    id: `${s.id}:${e.id}`, provider: 'shared', accountEmail: '', allDay: e.allDay, start: e.start, end: e.end,
    title: busy ? 'Busy' : e.title, location: busy ? undefined : e.location,
    calendarId: s.id, calendarName: label, busy,
  }));
  return { events, error: r.errors.length ? `${label}: some accounts could not sync` : undefined };
}
