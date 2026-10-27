import { io } from 'socket.io-client';

export const SERVER = import.meta.env.VITE_SERVER_URL || ''; // empty = same origin (Vite proxy)
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function getGuestId() {
  let id = localStorage.getItem('workwe_guest');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('workwe_guest', id);
  }
  return id;
}

export const getToken = () => localStorage.getItem('workwe_token');
export const setToken = (t) => (t ? localStorage.setItem('workwe_token', t) : localStorage.removeItem('workwe_token'));

export const connectSocket = () => io(SERVER || undefined, { auth: { token: getToken(), guestId: getGuestId() } });

export async function googleLogin(credential) {
  const r = await fetch(`${SERVER}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Sign-in failed');
  return r.json();
}

export async function fetchMe() {
  const t = getToken();
  if (!t) return null;
  const r = await fetch(`${SERVER}/api/me`, { headers: { Authorization: `Bearer ${t}` } });
  return (await r.json()).user;
}
