export type DragDirection = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };

export interface DragSnapshot {
  pointerId: number | null;
  direction: DragDirection | null;
  anchor: Point;
  offset: Point;
}

/** Pointer intent is independent of the visual joystick and the game grid. */
export function createDragController({
  repeatMs = 120,
  deadzone = 5,
  turnDistance = 6,
  radius = 26,
} = {}) {
  let pointerId: number | null = null;
  let direction: DragDirection | null = null;
  let anchor: Point = { x: 0, y: 0 };
  let point: Point = { x: 0, y: 0 };
  let candidate: DragDirection | null = null;
  let candidateStart: Point = { x: 0, y: 0 };
  // Keep the cooldown across quick release/repress gestures as well.
  let lastEmit = -Infinity;

  const classify = (dx: number, dy: number): DragDirection => {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > ay * 1.2) return dx > 0 ? 'right' : 'left';
    if (ay > ax * 1.2) return dy > 0 ? 'down' : 'up';
    // Modest axis hysteresis prevents diagonal noise from alternating lanes.
    if (direction === 'left' || direction === 'right') return dx > 0 ? 'right' : 'left';
    if (direction === 'up' || direction === 'down') return dy > 0 ? 'down' : 'up';
    return ax >= ay ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
  };
  const progress = (next: DragDirection, dx: number, dy: number) =>
    next === 'right' ? dx : next === 'left' ? -dx : next === 'down' ? dy : -dy;

  return {
    isActive(): boolean { return pointerId !== null; },
    begin(id: number, x: number, y: number): boolean {
      if (pointerId !== null) return false;
      pointerId = id;
      point = { x, y };
      anchor = { x, y };
      candidateStart = { x, y };
      direction = null;
      candidate = null;
      return true;
    },
    move(id: number, x: number, y: number): void {
      if (pointerId !== id) return;
      const dx = x - point.x, dy = y - point.y;
      const previous = point;
      point = { x, y };
      if (!direction) {
        if (Math.hypot(x - anchor.x, y - anchor.y) >= deadzone) {
          direction = classify(x - anchor.x, y - anchor.y);
        }
      } else if (dx !== 0 || dy !== 0) {
        const next = classify(dx, dy);
        if (next === direction) {
          candidate = null;
        } else {
          if (candidate !== next) { candidate = next; candidateStart = previous; }
          if (progress(next, x - candidateStart.x, y - candidateStart.y) >= turnDistance) {
            direction = next;
            candidate = null;
            // Recenter the visual stick behind this new local direction. The
            // finger never has to cross its original touch-down position.
            anchor = {
              x: x + (next === 'left' ? 12 : next === 'right' ? -12 : 0),
              y: y + (next === 'up' ? 12 : next === 'down' ? -12 : 0),
            };
          }
        }
      }
      const offsetX = x - anchor.x, offsetY = y - anchor.y;
      const length = Math.hypot(offsetX, offsetY);
      if (length > radius) {
        anchor = { x: x - offsetX * radius / length, y: y - offsetY * radius / length };
      }
    },
    tick(now: number): DragDirection | null {
      if (pointerId === null || !direction || !Number.isFinite(now) || now - lastEmit < repeatMs) return null;
      // A dropped frame yields one hop, never a backlog or a burst.
      lastEmit = now;
      return direction;
    },
    end(id?: number): boolean {
      if (pointerId === null || (id !== undefined && id !== pointerId)) return false;
      pointerId = null;
      direction = null;
      candidate = null;
      return true;
    },
    snapshot(): DragSnapshot {
      return { pointerId, direction, anchor: { ...anchor }, offset: { x: point.x - anchor.x, y: point.y - anchor.y } };
    },
  };
}

/** Exponential damping has the same settling time at 30, 60 or 120 fps. */
export function dampingAlpha(deltaSeconds: number, sharpness: number): number {
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * sharpness);
}
