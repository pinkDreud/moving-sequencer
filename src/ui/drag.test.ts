import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGesture, type PointerLike } from './drag';

const at = (x: number, y: number, pointerType = 'mouse', pointerId = 1): PointerLike => ({
  pointerId,
  pointerType,
  clientX: x,
  clientY: y,
});

function setup() {
  const calls: string[] = [];
  const gesture = createGesture<string>({
    onStart: (payload, p) => calls.push(`start ${payload} ${p.x},${p.y}`),
    onMove: (p) => calls.push(`move ${p.x},${p.y}`),
    onDrop: (p) => calls.push(`drop ${p.x},${p.y}`),
    onCancel: () => calls.push('cancel'),
  });
  return { gesture, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('mouse / pen', () => {
  it('starts dragging after 6px of movement, then moves and drops', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0), 'A');
    gesture.move(at(3, 3));
    expect(gesture.dragging).toBe(false);
    gesture.move(at(7, 0));
    expect(gesture.dragging).toBe(true);
    gesture.move(at(20, 5));
    gesture.up(at(30, 5));
    expect(calls).toEqual(['start A 7,0', 'move 7,0', 'move 20,5', 'drop 30,5']);
    expect(gesture.dragging).toBe(false);
  });

  it('a click without movement never drags and its click is not consumed', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0), 'A');
    gesture.up(at(1, 1));
    expect(calls).toEqual([]);
    expect(gesture.consumeClick()).toBe(false);
  });

  it('the click that follows a drop is consumed once', () => {
    const { gesture } = setup();
    gesture.down(at(0, 0), 'A');
    gesture.move(at(10, 0));
    gesture.up(at(10, 0));
    expect(gesture.consumeClick()).toBe(true);
    expect(gesture.consumeClick()).toBe(false);
  });

  it('pen behaves like mouse', () => {
    const { gesture } = setup();
    gesture.down(at(0, 0, 'pen'), 'A');
    gesture.move(at(10, 0, 'pen'));
    expect(gesture.dragging).toBe(true);
  });

  it('ignores events from other pointers', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0, 'mouse', 1), 'A');
    gesture.move(at(50, 0, 'mouse', 2));
    expect(gesture.dragging).toBe(false);
    gesture.move(at(10, 0, 'mouse', 1));
    gesture.up(at(10, 0, 'mouse', 2));
    expect(gesture.dragging).toBe(true);
    expect(calls).toEqual(['start A 10,0', 'move 10,0']);
  });
});

describe('touch', () => {
  it('a long press picks up, then movement drags', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0, 'touch'), 'A');
    gesture.move(at(3, 3, 'touch'));
    vi.advanceTimersByTime(299);
    expect(gesture.dragging).toBe(false);
    vi.advanceTimersByTime(1);
    expect(gesture.dragging).toBe(true);
    gesture.move(at(40, 3, 'touch'));
    gesture.up(at(40, 3, 'touch'));
    expect(calls).toEqual(['start A 3,3', 'move 40,3', 'drop 40,3']);
  });

  it('moving more than 8px before the long press is a scroll, not a drag', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0, 'touch'), 'A');
    gesture.move(at(0, 12, 'touch'));
    vi.advanceTimersByTime(1000);
    expect(gesture.dragging).toBe(false);
    expect(calls).toEqual([]);
  });

  it('a quick tap is not a drag and its click is not consumed', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0, 'touch'), 'A');
    vi.advanceTimersByTime(100);
    gesture.up(at(0, 0, 'touch'));
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
    expect(gesture.consumeClick()).toBe(false);
  });

  it('a long press released without moving still drops (and consumes the click)', () => {
    const { gesture, calls } = setup();
    gesture.down(at(5, 5, 'touch'), 'A');
    vi.advanceTimersByTime(300);
    gesture.up(at(5, 5, 'touch'));
    expect(calls).toEqual(['start A 5,5', 'drop 5,5']);
    expect(gesture.consumeClick()).toBe(true);
  });
});

describe('cancel', () => {
  it('cancel while dragging calls onCancel and ends the drag', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0), 'A');
    gesture.move(at(10, 0));
    gesture.cancel();
    gesture.up(at(10, 0));
    expect(calls).toEqual(['start A 10,0', 'move 10,0', 'cancel']);
    expect(gesture.dragging).toBe(false);
  });

  it('cancel while pending stops the long-press timer silently', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0, 'touch'), 'A');
    gesture.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
  });

  it('a new down while dragging cancels the previous drag first', () => {
    const { gesture, calls } = setup();
    gesture.down(at(0, 0), 'A');
    gesture.move(at(10, 0));
    gesture.down(at(0, 0), 'B');
    expect(calls).toEqual(['start A 10,0', 'move 10,0', 'cancel']);
    expect(gesture.dragging).toBe(false);
  });
});
