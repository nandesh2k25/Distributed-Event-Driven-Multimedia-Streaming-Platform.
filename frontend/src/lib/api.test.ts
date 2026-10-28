import { describe, expect, it } from 'vitest';
import { moveItem } from './api';

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('moves an item up and down without mutating the input', () => {
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  it('clamps the target and ignores invalid sources', () => {
    expect(moveItem(list, 1, -5)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveItem(list, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(list, 9, 0)).toEqual(list);
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});
