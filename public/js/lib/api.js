/**
 * Fetch wrapper: same-origin cookies, CSRF header on writes (with a single
 * transparent retry when the token has rotated), language header and
 * localized error objects.
 */
import { lang, t } from './i18n.js';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || t('common.errorGeneric'));
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code || (status ? 'error' : 'network');
    this.fields = body?.error?.fields || null;
    this.details = body?.error?.details || null;
  }
}

let session = null;
let sessionPromise = null;

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Lang': lang, ...headers },
    signal
  };
  if (body instanceof Blob) {
    options.body = body;
    options.headers['Content-Type'] = body.type || 'application/octet-stream';
  } else if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers['Content-Type'] = 'application/json';
  }
  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, { error: { code: 'network', message: t('errors.network') } });
  }
  let data = null;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    data = await response.json().catch(() => null);
  }
  if (response.status !== 401) document.dispatchEvent(new CustomEvent('api:activity'));
  if (!response.ok) {
    const error = new ApiError(response.status, data);
    if (response.status === 401) document.dispatchEvent(new CustomEvent('session:unauthorized', { detail: error }));
    throw error;
  }
  return data;
}

export function getSession(force = false) {
  if (!force && session) return Promise.resolve(session);
  if (!force && sessionPromise) return sessionPromise;
  sessionPromise = request('/api/auth/session')
    .then((payload) => {
      session = payload;
      document.dispatchEvent(new CustomEvent('session:change', { detail: session }));
      return session;
    })
    .finally(() => {
      sessionPromise = null;
    });
  return sessionPromise;
}

/** Merge a login/logout response (which carries a rotated CSRF token). */
export function applySession(payload) {
  session = { ...(session || {}), ...payload };
  if (payload.user === null) {
    session.permissions = [];
    session.isStaff = false;
    session.mustChangePassword = false;
    session.session = null;
  }
  document.dispatchEvent(new CustomEvent('session:change', { detail: session }));
  return session;
}

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return request(path, { ...options, method });
  const current = await getSession();
  const send = (token) =>
    request(path, { ...options, method, headers: { ...(options.headers || {}), 'X-CSRF-Token': token || '' } });
  try {
    return await send(current.csrfToken);
  } catch (error) {
    if (error.status === 403 && error.code === 'csrf_failed') {
      const fresh = await getSession(true);
      return send(fresh.csrfToken);
    }
    throw error;
  }
}

export function can(permission) {
  return Boolean(session?.permissions?.includes(permission));
}

export async function logout() {
  const result = await api('/api/auth/logout', { method: 'POST' });
  applySession({ user: null, csrfToken: result.csrfToken });
  return result;
}
