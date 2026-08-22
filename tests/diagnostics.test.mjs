import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAGNOSTICS_STORAGE_KEY,
  DiagnosticsLog,
  sanitizeDiagnosticValue,
} from '../js/diagnostics.js';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

test('diagnostics redact credentials, OAuth values, queries, and sensitive fields', () => {
  const value = sanitizeDiagnosticValue({
    message: 'Bearer secret-token https://example.test/path?access_token=secret#state=secret',
    accessToken: 'secret-token',
    chatMessage: 'private chat',
  });
  const json = JSON.stringify(value);
  assert.doesNotMatch(json, /secret-token|private chat|state=secret/);
  assert.match(json, /REDACTED/);
});

test('diagnostics are capped and stay in memory without storage consent', () => {
  const storage = new MemoryStorage();
  const log = new DiagnosticsLog({ version: '0.0.88', storage, maxEntries: 2, canPersist: () => false });
  log.record({ message: 'one' });
  log.record({ message: 'two' });
  log.record({ message: 'three' });
  assert.deepEqual(log.entries().map((entry) => entry.message), ['two', 'three']);
  assert.equal(storage.getItem(DIAGNOSTICS_STORAGE_KEY), null);
});

test('diagnostics persist only when allowed and clear cleanly', () => {
  const storage = new MemoryStorage();
  let allowed = true;
  const log = new DiagnosticsLog({ version: '0.0.88', storage, canPersist: () => allowed });
  log.record({ area: 'twitch-api', message: 'Request failed', details: { endpoint: '/api/twitch/helix/users', status: 500 } });
  assert.ok(storage.getItem(DIAGNOSTICS_STORAGE_KEY));
  const restored = new DiagnosticsLog({ version: '0.0.88', storage, canPersist: () => allowed });
  assert.equal(restored.entries().length, 1);
  allowed = false;
  restored.setPersistenceEnabled(false);
  assert.equal(storage.getItem(DIAGNOSTICS_STORAGE_KEY), null);
  restored.clear();
  assert.equal(restored.entries().length, 0);
});

test('reports contain coarse environment data but not the raw user agent', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/125.0 identifying-detail';
  const log = new DiagnosticsLog({
    version: '0.0.88',
    storage: new MemoryStorage(),
    canPersist: () => false,
    navigatorRef: { userAgent: ua, onLine: true },
  });
  const report = log.buildReport();
  assert.deepEqual(report.environment, { browser: 'Chrome', os: 'Windows', online: true });
  assert.doesNotMatch(JSON.stringify(report), /identifying-detail/);
});

test('plain-text error logs include Discord support directions and no raw credentials', () => {
  const log = new DiagnosticsLog({ version: '0.0.88', storage: new MemoryStorage(), canPersist: () => false });
  log.record({ message: 'Bearer secret-value failed' });
  const text = log.toText();
  assert.match(text, /#bug-reports channel in the Wormhole Discord/);
  assert.match(text, /Wormhole Networking Tool - Error Log/);
  assert.match(text, /Version: Alpha-0\.0\.88/);
  assert.doesNotMatch(text, /secret-value/);
});
