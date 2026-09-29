import type { Point } from '../core/dropTarget';

/** The subset of PointerEvent the gesture needs (easy to fake in tests). */
export interface PointerLike {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}

export interface GestureCallbacks<T> {
  onStart(payload: T, p: Point): void;
  onMove(p: Point): void;
  onDrop(p: Point): void;
  onCancel(): void;
}

export interface GestureOptions {
  /** Mouse/pen: movement (px) before a press becomes a drag. */
  mouseThreshold?: number;
  /** Touch: hold time (ms) before a press picks up. */
  longPressMs?: number;
  /** Touch: movement (px) before the long press that turns the press into a scroll. */
  touchSlop?: number;
}

export interface Gesture<T> {
  down(e: PointerLike, payload: T): void;
  move(e: PointerLike): void;
  up(e: PointerLike): void;
  /** Escape / pointercancel / lost capture. */
  cancel(): void;
  readonly dragging: boolean;
  /** True once after a drop: the browser's click that follows pointerup must not change the selection. */
  consumeClick(): boolean;
}

type State<T> =
  | { kind: 'idle' }
  | {
      kind: 'pending';
      id: number;
      touch: boolean;
      start: Point;
      last: Point;
      payload: T;
      timer?: ReturnType<typeof setTimeout>;
    }
  | { kind: 'dragging'; id: number };

const pointOf = (e: PointerLike): Point => ({ x: e.clientX, y: e.clientY });
const far = (a: Point, b: Point, limit: number) => Math.hypot(a.x - b.x, a.y - b.y) > limit;

/**
 * Pointer gesture state machine: mouse/pen drag after a small movement; touch drags only after a long
 * press, so a quick swipe still scrolls and a tap still selects.
 */
export function createGesture<T>(
  cb: GestureCallbacks<T>,
  { mouseThreshold = 6, longPressMs = 300, touchSlop = 8 }: GestureOptions = {},
): Gesture<T> {
  let state: State<T> = { kind: 'idle' };
  let swallowClick = false;

  function reset(): void {
    if (state.kind === 'pending') clearTimeout(state.timer);
    state = { kind: 'idle' };
  }

  function cancel(): void {
    if (state.kind === 'dragging') {
      state = { kind: 'idle' };
      cb.onCancel();
    } else reset();
  }

  function begin(p: Point): void {
    if (state.kind !== 'pending') return;
    const { id, payload } = state;
    clearTimeout(state.timer);
    state = { kind: 'dragging', id };
    cb.onStart(payload, p);
  }

  return {
    down(e, payload) {
      cancel();
      swallowClick = false;
      const touch = e.pointerType === 'touch';
      const start = pointOf(e);
      const pending: State<T> = { kind: 'pending', id: e.pointerId, touch, start, last: start, payload };
      if (touch) pending.timer = setTimeout(() => begin(pending.last), longPressMs);
      state = pending;
    },
    move(e) {
      if (state.kind === 'idle' || e.pointerId !== state.id) return;
      const p = pointOf(e);
      if (state.kind === 'dragging') return cb.onMove(p);
      state.last = p;
      if (state.touch) {
        if (far(p, state.start, touchSlop)) reset();
      } else if (far(p, state.start, mouseThreshold)) {
        begin(p);
        cb.onMove(p);
      }
    },
    up(e) {
      if (state.kind === 'idle' || e.pointerId !== state.id) return;
      if (state.kind === 'dragging') {
        state = { kind: 'idle' };
        swallowClick = true;
        cb.onDrop(pointOf(e));
      } else reset();
    },
    cancel,
    get dragging() {
      return state.kind === 'dragging';
    },
    consumeClick() {
      const swallow = swallowClick;
      swallowClick = false;
      return swallow;
    },
  };
}
