export type Shortcut = 'delete' | 'mute' | 'group' | 'ungroup' | 'clear';

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

const TEXT_FIELDS = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';

/** Editing shortcut for a keydown, or null. Keys typed into text fields or held with Ctrl/Cmd/Alt are left alone. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
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
