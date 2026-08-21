import test from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../js/app/logger.js';

test('logger exposes centralized production log methods', () => {
  for (const level of ['debug', 'info', 'warn', 'error']) assert.equal(typeof logger[level], 'function');
});
