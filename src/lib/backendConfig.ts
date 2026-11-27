const rawBackendUrl = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');

export const BACKEND_HTTP_BASE = rawBackendUrl;

export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return BACKEND_HTTP_BASE ? `${BACKEND_HTTP_BASE}${cleanPath}` : cleanPath;
}

export function buildWsUrl(path: string, params?: Record<string, string | undefined>): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) query.set(k, v);
    });
  }
  const qs = query.toString() ? `?${query.toString()}` : '';

  if (BACKEND_HTTP_BASE) {
    const wsBase = BACKEND_HTTP_BASE.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
    return `${wsBase}${cleanPath}${qs}`;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${cleanPath}${qs}`;
  }

  return `ws://127.0.0.1:8787${cleanPath}${qs}`;
}
