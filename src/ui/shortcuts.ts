export type Shortcut = 'delete' | 'mute' | 'group' | 'ungroup' | 'clear';

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

export function shortcutFor(_e: KeyLike): Shortcut | null {
  throw new Error('not implemented');
}
