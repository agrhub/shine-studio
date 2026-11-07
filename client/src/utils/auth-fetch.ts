/**
 * Attaches the session token to same-origin `/api/*` requests made with the
 * native `fetch` / `XMLHttpRequest` APIs (the axios `http` client already does
 * this via an interceptor). Without it, raw calls such as uploads, music/SFX
 * search and the editor chat reach the server unauthenticated and get a 401.
 */
export const TOKEN_STORAGE_KEY = 'shine_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function isSameOriginApi(input: string | URL): boolean {
  try {
    const url = new URL(String(input), window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

let installed = false;

export function installAuthFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input;
    const token = getAuthToken();
    if (!token || !isSameOriginApi(url)) return nativeFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  const needsAuth = new WeakSet<XMLHttpRequest>();

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    if (isSameOriginApi(url)) needsAuth.add(this);
    return (nativeOpen as any).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const token = getAuthToken();
    if (token && needsAuth.has(this)) {
      try {
        this.setRequestHeader('Authorization', `Bearer ${token}`);
      } catch {
        /* header already set or request not opened */
      }
    }
    return nativeSend.call(this, body);
  };
}
