import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE_OPTIONS, paginate } from '../js/pagination.js';

test('page size choices run from 12 through 100', () => {
  assert.deepEqual(PAGE_SIZE_OPTIONS, [12, 24, 36, 48, 60, 72, 84, 96, 100]);
});

test('pagination returns the requested page and global item range', () => {
  const result = paginate(Array.from({ length: 53 }, (_, i) => i + 1), 3, 12);
  assert.equal(result.pageCount, 5);
  assert.equal(result.startIndex, 24);
  assert.equal(result.endIndex, 36);
  assert.deepEqual(result.items, Array.from({ length: 12 }, (_, i) => i + 25));
});

test('pagination clamps invalid pages and unsupported limits', () => {
  const result = paginate([1, 2, 3], 99, 25);
  assert.equal(result.pageSize, 12);
  assert.equal(result.page, 1);
  assert.deepEqual(result.items, [1, 2, 3]);
});
