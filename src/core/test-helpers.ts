// Test-only builders for tracks. Not imported by app code.
import { group, square, type SeqNode, type Track } from './model';

/** Recursively freezes a value so any mutation by the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Builds a frozen track from a compact spec: `'A G[B C] D'` = square A, group G with squares B and C, square D.
 * Squares get sound `kick` and are unmuted.
 */
export function parseTrack(spec: string, id = 't'): Track {
  const stack: { id: string; children: SeqNode[] }[] = [{ id: '', children: [] }];
  const top = () => stack[stack.length - 1] as { id: string; children: SeqNode[] };
  for (const token of spec.match(/\w+\[|\]|\w+/g) ?? []) {
    if (token.endsWith('[')) stack.push({ id: token.slice(0, -1), children: [] });
    else if (token === ']') {
      const done = stack.pop();
      if (!done || stack.length === 0) throw new Error(`unbalanced spec: ${spec}`);
      top().children.push(group(done.id, done.children));
    } else top().children.push(square(token, 'kick'));
  }
  if (stack.length !== 1) throw new Error(`unbalanced spec: ${spec}`);
  return deepFreeze({ id, nodes: top().children });
}

/** Inverse of `parseTrack` (structure only): `'A G[B C] D'`. */
export function shape(track: Track | SeqNode[]): string {
  const nodes = Array.isArray(track) ? track : track.nodes;
  return nodes.map((n) => (n.kind === 'group' ? `${n.id}[${shape(n.children)}]` : n.id)).join(' ');
}
