import { describe, expect, it } from 'vitest';
import { shortcutFor, type KeyLike } from './shortcuts';

const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: document.body,
  ...extra,
});

describe('shortcutFor', () => {
  it('maps Delete and Backspace to delete', () => {
    expect(shortcutFor(key('Delete'))).toBe('delete');
    expect(shortcutFor(key('Backspace'))).toBe('delete');
  });

  it('maps M to mute, G to group, Shift+G to ungroup, Escape to clear', () => {
    expect(shortcutFor(key('m'))).toBe('mute');
    expect(shortcutFor(key('M', { shiftKey: true }))).toBe('mute');
    expect(shortcutFor(key('g'))).toBe('group');
    expect(shortcutFor(key('G', { shiftKey: true }))).toBe('ungroup');
    expect(shortcutFor(key('Escape'))).toBe('clear');
  });

  it('ignores other keys', () => {
    expect(shortcutFor(key('a'))).toBeNull();
    expect(shortcutFor(key(' '))).toBeNull();
  });

  it('ignores keys held with Ctrl, Cmd or Alt so browser shortcuts keep working', () => {
    expect(shortcutFor(key('g', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key('m', { metaKey: true }))).toBeNull();
    expect(shortcutFor(key('Backspace', { altKey: true }))).toBeNull();
  });

  it('ignores keys typed in text fields', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const el = document.createElement(tag);
      expect(shortcutFor(key('Backspace', { target: el }))).toBeNull();
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(shortcutFor(key('m', { target: editable }))).toBeNull();
  });

  it('works when focus is on a button', () => {
    expect(shortcutFor(key('Delete', { target: document.createElement('button') }))).toBe('delete');
  });
});
