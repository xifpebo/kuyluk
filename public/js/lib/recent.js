/** Recently viewed products (ids only, newest first, kept in localStorage). */
import { storage } from './dom.js';

const KEY = 'sb.recent';
const MAX = 16;
const store = storage('local');

export function list() {
  try {
    const ids = JSON.parse(store?.getItem(KEY) || '[]');
    return Array.isArray(ids) ? ids.filter((id) => /^[a-f0-9]{24}$/.test(id)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function add(id) {
  const ids = [id, ...list().filter((item) => item !== id)].slice(0, MAX);
  try {
    store?.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function clear() {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
