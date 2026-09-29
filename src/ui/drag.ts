import type { Point } from '../core/dropTarget';

/** The subset of PointerEvent the gesture needs (easy to fake in tests). */
export interface PointerLike {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  /** Buttons held; 0 on a mouse/pen move means the pointerup was lost. */
  buttons?: number;
  /** Alt/Option held (a drop from the prep area moves instead of copying). */
  altKey?: boolean;
}

export interface Modifiers {
  altKey: boolean;
}

export interface GestureCallbacks<T> {
  onStart(payload: T, p: Point): void;
  onMove(p: Point, mods: Modifiers): void;
  onDrop(p: Point, mods: Modifiers): void;
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
  /** Escape, blur, or a `pointercancel` (pass it, so other pointers' cancels are ignored). */
  cancel(e?: Pick<PointerLike, 'pointerId'>): void;
  readonly dragging: boolean;
  /**
   * Any pointerdown on the page (capture phase). The click that belongs to a drop always comes before the next
   * press, so this ends the swallow: a drop whose click never arrived (touch, release elsewhere) can't eat a later one.
   * (A timer can't do this: Chrome runs queued input before `setTimeout(0)` callbacks.)
   */
  pressedAnywhere(): void;
  /**
   * True for the click the browser dispatches right after a drop (or after releasing an aborted drag): it must
   * not change the selection. Keyboard clicks are never swallowed.
   */
  consumeClick(fromKeyboard?: boolean): boolean;
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
  | { kind: 'dragging'; id: number; touch: boolean }
  /** Cancelled while the button/finger is still down: its release must not act as a click. */
  | { kind: 'aborted'; id: number };

const pointOf = (e: PointerLike): Point => ({ x: e.clientX, y: e.clientY });
const modsOf = (e: PointerLike): Modifiers => ({ altKey: e.altKey ?? false });
const far = (a: Point, b: Point, limit: number) => Math.hypot(a.x - b.x, a.y - b.y) > limit;

/**
 * Pointer gesture state machine: mouse/pen drag after a small movement; touch drags only after a long
 * press, so a quick swipe still scrolls and a tap still selects. One pointer at a time.
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

  function cancel(e?: Pick<PointerLike, 'pointerId'>): void {
    if (state.kind === 'idle' || (e && e.pointerId !== state.id)) return;
    if (state.kind === 'dragging') {
      state = { kind: 'aborted', id: state.id };
      cb.onCancel();
    } else if (state.kind === 'pending') reset();
  }

  function begin(p: Point): void {
    if (state.kind !== 'pending') return;
    const { id, touch, payload } = state;
    clearTimeout(state.timer);
    state = { kind: 'dragging', id, touch };
    cb.onStart(payload, p);
  }

  return {
    down(e, payload) {
      // Another finger while one is active is ignored; the same pointer again means its pointerup was lost.
      if (state.kind !== 'idle' && e.pointerId !== state.id) return;
      cancel();
      reset();
      swallowClick = false;
      const touch = e.pointerType === 'touch';
      const start = pointOf(e);
      const pending: State<T> = { kind: 'pending', id: e.pointerId, touch, start, last: start, payload };
      if (touch) pending.timer = setTimeout(() => begin(pending.last), longPressMs);
      state = pending;
    },
    move(e) {
      if (state.kind === 'idle' || state.kind === 'aborted' || e.pointerId !== state.id) return;
      const p = pointOf(e);
      if (state.kind === 'dragging') {
        if (!state.touch && e.buttons === 0) return cancel();
        return cb.onMove(p, modsOf(e));
      }
      state.last = p;
      if (state.touch) {
        if (far(p, state.start, touchSlop)) reset();
      } else if (far(p, state.start, mouseThreshold)) {
        begin(p);
        cb.onMove(p, modsOf(e));
      }
    },
    up(e) {
      if (state.kind === 'idle' || e.pointerId !== state.id) return;
      if (state.kind === 'dragging') {
        state = { kind: 'idle' };
        swallowClick = true;
        cb.onDrop(pointOf(e), modsOf(e));
      } else if (state.kind === 'aborted') {
        state = { kind: 'idle' };
        swallowClick = true;
      } else reset();
    },
    cancel,
    pressedAnywhere() {
      swallowClick = false;
    },
    get dragging() {
      return state.kind === 'dragging';
    },
    consumeClick(fromKeyboard = false) {
      if (fromKeyboard || !swallowClick) return false;
      swallowClick = false;
      return true;
    },
  };
}
