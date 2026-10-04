/**
 * Favourite products. Stored in localStorage for everyone; when signed in
 * the list is merged with the account and kept in sync on every change.
 */
import { storage } from './dom.js';
import { api, getSession } from './api.js';

const KEY = 'sb.favorites';
const MAX = 200;
const store = storage('local');
let syncEnabled = false;

function read() {
  try {
    const list = JSON.parse(store?.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((id) => /^[a-f0-9]{24}$/.test(id)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    store?.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full or blocked */
  }
  document.dispatchEvent(new CustomEvent('favorites:change', { detail: { ids: list } }));
}

export function list() {
  return read();
}

export function has(id) {
  return read().includes(id);
}

export function count() {
  return read().length;
}

async function push(ids) {
  if (!syncEnabled) return;
  try {
    await api('/api/account/favorites', { method: 'PUT', body: { products: ids } });
  } catch {
    /* offline: localStorage stays the source of truth */
  }
}

/** Toggle and return the new state. */
export function toggle(id) {
  const ids = read();
  const index = ids.indexOf(id);
  if (index >= 0) ids.splice(index, 1);
  else ids.unshift(id);
  write(ids);
  push(ids);
  return index < 0;
}

export function remove(id) {
  const ids = read().filter((item) => item !== id);
  write(ids);
  push(ids);
}

export function clear() {
  write([]);
  push([]);
}

/** Merge local favourites with the account once a session is known. */
export async function initSync() {
  try {
    const session = await getSession();
    if (!session?.user || session.isStaff) return;
    syncEnabled = true;
    const merged = await api('/api/account/favorites', { method: 'PUT', body: { products: read(), merge: true } });
    write(merged.products);
  } catch {
    syncEnabled = false;
  }
}
