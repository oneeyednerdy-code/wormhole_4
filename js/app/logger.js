const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 99 });

function configuredLevel() {
  try {
    const requested = globalThis.localStorage?.getItem('wormhole_log_level')?.toLowerCase();
    return Object.hasOwn(LEVELS, requested) ? requested : 'warn';
  } catch {
    return 'warn';
  }
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[configuredLevel()];
}

export const logger = Object.freeze({
  debug(...args) { if (shouldLog('debug')) console.debug(...args); },
  info(...args) { if (shouldLog('info')) console.info(...args); },
  warn(...args) { if (shouldLog('warn')) console.warn(...args); },
  error(...args) { if (shouldLog('error')) console.error(...args); },
});
