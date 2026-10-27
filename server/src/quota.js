import { Usage } from './models.js';

export const FREE_LIMIT = Number(process.env.FREE_MATCHES_PER_DAY || 5);
const today = () => new Date().toISOString().slice(0, 10);

// Guests are tracked by both a client-generated id and their IP, so clearing
// localStorage alone doesn't reset the free matches. Signed-in users are unlimited.
export function keysFor({ user, guestId, ip }) {
  if (user) return [];
  return [guestId && `g:${guestId}`, ip && `ip:${ip}`].filter(Boolean);
}

// The IP counter is only a backstop against clearing localStorage, so it is much
// looser than the per-guest limit (offices and campuses share one IP).
const IP_FACTOR = 5;

export async function getUsed(keys) {
  if (!keys.length) return 0;
  const rows = await Usage.find({ key: { $in: keys }, day: today() }).lean();
  let used = 0;
  for (const r of rows) {
    if (r.key.startsWith('ip:')) {
      if (r.count >= FREE_LIMIT * IP_FACTOR) used = Math.max(used, FREE_LIMIT);
    } else used = Math.max(used, r.count);
  }
  return used;
}

export async function bump(keys) {
  const day = today();
  await Promise.all(
    keys.map((key) =>
      Usage.updateOne({ key, day }, { $inc: { count: 1 } }, { upsert: true })
    )
  );
}
