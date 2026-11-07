/** Escapes a value for safe interpolation into HTML text or attribute context. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serializes a value for embedding inside an inline <script> block.
 * JSON.stringify alone does not escape `</script>` or U+2028/2029.
 */
export function toScriptJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Origins an OAuth popup may hand its result (tokens, account info) to.
 * Never use '*' — any page that opened the popup would receive the token.
 * Includes the popup's own origin, configured CORS_ORIGINS and, in development,
 * the Vite dev server (which proxies /api with changeOrigin).
 */
function trustedOpenerOrigins(): string[] {
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }
  return origins;
}

/** Inline JS that posts `messageExpr` to window.opener, restricted to trusted origins. */
export function openerPostMessageJs(messageExpr: string): string {
  return `[window.location.origin].concat(${toScriptJson(trustedOpenerOrigins())}).forEach(function (o) { try { window.opener.postMessage(${messageExpr}, o); } catch (e) {} });`;
}
