const DEFAULT_MESSAGE = 'Loading...';
const MINIMUM_VISIBLE_MS = 450;

export class LoadingTracker {
  constructor({
    onChange = () => {},
    now = () => Date.now(),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer),
    minimumVisibleMs = MINIMUM_VISIBLE_MS,
  } = {}) {
    this.onChange = onChange;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.minimumVisibleMs = minimumVisibleMs;
    this.activities = new Map();
    this.nextId = 1;
    this.visibleSince = 0;
    this.hideTimer = null;
  }

  begin(message = DEFAULT_MESSAGE) {
    if (this.hideTimer) {
      this.cancel(this.hideTimer);
      this.hideTimer = null;
    }
    const id = this.nextId++;
    this.activities.set(id, String(message || DEFAULT_MESSAGE));
    if (this.activities.size === 1) this.visibleSince = this.now();
    this.publish();
    return id;
  }

  update(id, message) {
    if (!this.activities.has(id)) return false;
    this.activities.set(id, String(message || DEFAULT_MESSAGE));
    this.publish();
    return true;
  }

  finish(id) {
    if (!this.activities.delete(id)) return false;
    if (this.activities.size) {
      this.publish();
      return true;
    }

    const remaining = Math.max(0, this.minimumVisibleMs - (this.now() - this.visibleSince));
    if (!remaining) {
      this.publish();
      return true;
    }
    this.hideTimer = this.schedule(() => {
      this.hideTimer = null;
      if (!this.activities.size) this.publish();
    }, remaining);
    return true;
  }

  publish() {
    const messages = [...this.activities.values()];
    this.onChange({
      active: messages.length > 0,
      count: messages.length,
      message: messages.at(-1) ?? DEFAULT_MESSAGE,
    });
  }
}

let globalTracker = null;

function renderGlobalLoading(documentRef, snapshot) {
  const indicator = documentRef?.getElementById?.('global-loading');
  const text = documentRef?.getElementById?.('global-loading-text');
  if (!indicator || !text) return;
  text.textContent = snapshot.message;
  indicator.hidden = !snapshot.active;
  indicator.classList.toggle('global-loading--active', snapshot.active);
  indicator.setAttribute('aria-busy', String(snapshot.active));
}

export function initializeGlobalLoading(documentRef = globalThis.document) {
  if (!globalTracker) {
    globalTracker = new LoadingTracker({
      onChange: (snapshot) => renderGlobalLoading(documentRef, snapshot),
    });
  }
  return globalTracker;
}

export function startLoading(message) {
  return initializeGlobalLoading().begin(message);
}

export function updateLoading(id, message) {
  return initializeGlobalLoading().update(id, message);
}

export function finishLoading(id) {
  return initializeGlobalLoading().finish(id);
}

export async function withLoading(message, work) {
  const id = startLoading(message);
  try {
    return await work();
  } finally {
    finishLoading(id);
  }
}
