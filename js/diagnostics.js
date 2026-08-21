export const DIAGNOSTICS_STORAGE_KEY = 'wormhole_diagnostics_v1';
export const MAX_DIAGNOSTIC_ENTRIES = 150;

const SENSITIVE_KEY = /(access.?token|refresh.?token|authorization|client.?secret|code.?verifier|oauth.?state|chat.?message|message.?text)/i;
const SECRET_VALUE = /(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi;
const SECRET_PARAM = /([?&](?:access_token|refresh_token|token|code|state|code_verifier|client_secret)=)[^&#\s]*/gi;

export function sanitizeDiagnosticText(value) {
  return String(value ?? '')
    .replace(SECRET_VALUE, '$1[REDACTED]')
    .replace(SECRET_PARAM, '$1[REDACTED]')
    .replace(/([#?]).*$/u, '$1[REDACTED]')
    .slice(0, 500);
}

export function sanitizeDiagnosticValue(value, depth = 0) {
  if (depth > 3) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeDiagnosticText(value);
  if (value instanceof Error) {
    return { name: sanitizeDiagnosticText(value.name), message: sanitizeDiagnosticText(value.message) };
  }
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeDiagnosticValue(item, depth + 1),
    ]));
  }
  return sanitizeDiagnosticText(value);
}

export function getCoarseEnvironment(navigatorRef = globalThis.navigator) {
  const ua = String(navigatorRef?.userAgent ?? '');
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const os = /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS/iPadOS'
      : /Windows/.test(ua) ? 'Windows'
        : /Mac OS/.test(ua) ? 'macOS'
          : /Linux/.test(ua) ? 'Linux' : 'Other';
  return { browser, os, online: navigatorRef?.onLine !== false };
}

export class DiagnosticsLog {
  constructor({
    version,
    storage = globalThis.localStorage,
    canPersist = () => false,
    navigatorRef = globalThis.navigator,
    maxEntries = MAX_DIAGNOSTIC_ENTRIES,
    now = () => new Date().toISOString(),
  } = {}) {
    this.version = version ?? 'unknown';
    this.storage = storage;
    this.canPersist = canPersist;
    this.navigatorRef = navigatorRef;
    this.maxEntries = maxEntries;
    this.now = now;
    this.contextProvider = () => ({});
    this.items = this.canPersist() ? this._read() : [];
  }

  _read() {
    try {
      const saved = JSON.parse(this.storage?.getItem(DIAGNOSTICS_STORAGE_KEY) ?? '[]');
      return Array.isArray(saved) ? saved.slice(-this.maxEntries) : [];
    } catch {
      return [];
    }
  }

  _persist() {
    try {
      if (this.canPersist()) this.storage?.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(this.items));
      else this.storage?.removeItem(DIAGNOSTICS_STORAGE_KEY);
    } catch {
      // Diagnostics must never break the app when storage is unavailable.
    }
  }

  setContextProvider(provider) {
    this.contextProvider = typeof provider === 'function' ? provider : () => ({});
  }

  setPersistenceEnabled(enabled) {
    if (enabled) {
      const saved = this._read();
      this.items = [...saved, ...this.items].slice(-this.maxEntries);
    }
    this._persist();
  }

  record({ level = 'error', area = 'runtime', message = 'Unknown error', details = {} } = {}) {
    const entry = sanitizeDiagnosticValue({
      timestamp: this.now(),
      level,
      area,
      message,
      details,
      context: this.contextProvider(),
    });
    this.items.push(entry);
    this.items = this.items.slice(-this.maxEntries);
    this._persist();
    return entry;
  }

  entries() {
    return typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(this.items)
      : JSON.parse(JSON.stringify(this.items));
  }

  clear() {
    this.items = [];
    try { this.storage?.removeItem(DIAGNOSTICS_STORAGE_KEY); } catch { /* ignore */ }
  }

  buildReport() {
    return {
      app: 'Wormhole Networking Tool',
      version: this.version,
      generatedAt: this.now(),
      environment: getCoarseEnvironment(this.navigatorRef),
      privacy: 'Tokens, OAuth values, query strings, chat messages, and channel identities are not intentionally collected.',
      entries: this.entries(),
    };
  }

  toJson() {
    return JSON.stringify(this.buildReport(), null, 2);
  }

  toText() {
    const report = this.buildReport();
    const lines = [
      'Wormhole Networking Tool - Error Log',
      `Version: Alpha-${report.version}`,
      `Generated: ${report.generatedAt}`,
      `Environment: ${report.environment.browser} on ${report.environment.os}; ${report.environment.online ? 'online' : 'offline'}`,
      '',
      'Privacy: Tokens, OAuth values, URL queries, chat messages, and channel identities are excluded.',
      'Support: Post this file in the #bug-reports channel in the Wormhole Discord.',
      '',
      `Events: ${report.entries.length}`,
    ];
    for (const entry of report.entries) {
      lines.push(
        '',
        `[${entry.timestamp}] ${String(entry.level).toUpperCase()} - ${entry.area}`,
        `Message: ${entry.message}`,
        `Context: ${JSON.stringify(entry.context)}`,
        `Details: ${JSON.stringify(entry.details)}`
      );
    }
    return lines.join('\n');
  }

  installGlobalHandlers(windowRef = globalThis.window) {
    const onError = (event) => this.record({
      area: 'browser',
      message: event?.message || event?.error?.message || 'Unhandled browser error',
      details: { error: event?.error },
    });
    const onRejection = (event) => this.record({
      area: 'promise',
      message: event?.reason?.message || 'Unhandled promise rejection',
      details: { reason: event?.reason },
    });
    windowRef?.addEventListener?.('error', onError);
    windowRef?.addEventListener?.('unhandledrejection', onRejection);
    return () => {
      windowRef?.removeEventListener?.('error', onError);
      windowRef?.removeEventListener?.('unhandledrejection', onRejection);
    };
  }
}
