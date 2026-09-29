import type { NodeId, Track } from '../core/model';
import type { DropTarget } from '../core/ops';

export type SelectMode = 'replace' | 'toggle';

export interface PointerLike {
  pointerType: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export function selectMode(_e: PointerLike): SelectMode {
  throw new Error('not implemented');
}

export function insertTarget(_track: Track, _selection: ReadonlySet<NodeId>): DropTarget {
  throw new Error('not implemented');
}

export function canGroup(_track: Track, _selection: ReadonlySet<NodeId>): boolean {
  throw new Error('not implemented');
}

export function selectedGroupIds(_track: Track, _selection: ReadonlySet<NodeId>): NodeId[] {
  throw new Error('not implemented');
}

export function ungroupAll(_track: Track, _ids: readonly NodeId[]): { track: Track; childIds: NodeId[] } {
  throw new Error('not implemented');
}

export function allMuted(_track: Track, _selection: ReadonlySet<NodeId>): boolean {
  throw new Error('not implemented');
}
