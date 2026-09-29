export type Shortcut = 'delete' | 'mute' | 'group' | 'ungroup' | 'clear';

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

const TEXT_FIELDS = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';

/** Editing shortcut for a keydown, or null. Auto-repeat, text fields and Ctrl/Cmd/Alt combos are left alone. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.target instanceof Element && e.target.closest(TEXT_FIELDS)) return null;
  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      return 'delete';
    case 'm':
    case 'M':
      return 'mute';
    case 'g':
    case 'G':
      return e.shiftKey ? 'ungroup' : 'group';
    case 'Escape':
      return 'clear';
    default:
      return null;
  }
}
