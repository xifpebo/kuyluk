/**
 * Quote-request list ("cart"). Stored per browser in localStorage; the
 * server recomputes every price when the request is submitted.
 */
import { storage } from './dom.js';

const KEY = 'bb.quote.v1';
const MAX_ITEMS = 100;
const store = storage();
let memory = [];

function valid(item) {
  return (
    item &&
    typeof item.id === 'string' &&
    /^[a-f0-9]{24}$/.test(item.id) &&
    Number.isFinite(item.qty) &&
    item.qty > 0 &&
    item.qty <= 1e6
  );
}

function read() {
  if (!store) return memory;
  try {
    const parsed = JSON.parse(store.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(valid).slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function write(items) {
  memory = items;
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage full or blocked: keep in memory */
    }
  }
  document.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
}

const round = (qty) => Math.round(qty * 1000) / 1000;

export function getItems() {
  return read();
}

export function getQty(id) {
  return read().find((item) => item.id === id)?.qty || 0;
}

export function count() {
  return read().length;
}

export function setQty(id, qty) {
  const items = read();
  const index = items.findIndex((item) => item.id === id);
  if (!(qty > 0)) {
    if (index >= 0) items.splice(index, 1);
  } else if (index >= 0) {
    items[index] = { id, qty: round(qty) };
  } else if (items.length < MAX_ITEMS) {
    items.push({ id, qty: round(qty) });
  }
  write(items);
}

export function add(id, qty) {
  setQty(id, getQty(id) + qty);
}

export function remove(id) {
  setQty(id, 0);
}

export function removeMany(ids) {
  const drop = new Set(ids);
  write(read().filter((item) => !drop.has(item.id)));
}

export function clear() {
  write([]);
}

window.addEventListener('storage', (event) => {
  if (event.key === KEY) document.dispatchEvent(new CustomEvent('cart:change', { detail: read() }));
});
