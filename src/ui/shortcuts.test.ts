import { describe, expect, it } from 'vitest';
import { shortcutFor, type KeyLike } from './shortcuts';

const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  target: document.body,
  ...extra,
});

describe('shortcutFor', () => {
  it('maps Delete and Backspace to empty, and with Shift to remove', () => {
    expect(shortcutFor(key('Delete'))).toBe('empty');
    expect(shortcutFor(key('Backspace'))).toBe('empty');
    expect(shortcutFor(key('Delete', { shiftKey: true }))).toBe('remove');
    expect(shortcutFor(key('Backspace', { shiftKey: true }))).toBe('remove');
  });

  it('maps Insert and I to insert', () => {
    expect(shortcutFor(key('Insert'))).toBe('insert');
    expect(shortcutFor(key('i'))).toBe('insert');
    expect(shortcutFor(key('I'))).toBe('insert');
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
    editable.setAttribute('contenteditable', 'true'); // jsdom does not reflect the property
    expect(shortcutFor(key('m', { target: editable }))).toBeNull();
  });

  it('ignores auto-repeat, so holding M does not flip mute on and off', () => {
    expect(shortcutFor(key('m', { repeat: true }))).toBeNull();
  });

  it('works when focus is on a button', () => {
    expect(shortcutFor(key('Delete', { target: document.createElement('button') }))).toBe('empty');
  });
});
