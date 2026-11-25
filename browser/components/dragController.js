/** Pointer intent is independent of the visual joystick and the game grid. */
export function createDragController({ repeatMs = 120, deadzone = 5, turnDistance = 6, radius = 26, } = {}) {
    let pointerId = null;
    let direction = null;
    let anchor = { x: 0, y: 0 };
    let point = { x: 0, y: 0 };
    let candidate = null;
    let candidateStart = { x: 0, y: 0 };
    // Keep the cooldown across quick release/repress gestures as well.
    let lastEmit = -Infinity;
    const classify = (dx, dy) => {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        if (ax > ay * 1.2)
            return dx > 0 ? 'right' : 'left';
        if (ay > ax * 1.2)
            return dy > 0 ? 'down' : 'up';
        // Modest axis hysteresis prevents diagonal noise from alternating lanes.
        if (direction === 'left' || direction === 'right')
            return dx > 0 ? 'right' : 'left';
        if (direction === 'up' || direction === 'down')
            return dy > 0 ? 'down' : 'up';
        return ax >= ay ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
    };
    const progress = (next, dx, dy) => next === 'right' ? dx : next === 'left' ? -dx : next === 'down' ? dy : -dy;
    return {
        isActive() { return pointerId !== null; },
        begin(id, x, y) {
            if (pointerId !== null)
                return false;
            pointerId = id;
            point = { x, y };
            anchor = { x, y };
            candidateStart = { x, y };
            direction = null;
            candidate = null;
            return true;
        },
        move(id, x, y) {
            if (pointerId !== id)
                return;
            const dx = x - point.x, dy = y - point.y;
            const previous = point;
            point = { x, y };
            if (!direction) {
                if (Math.hypot(x - anchor.x, y - anchor.y) >= deadzone) {
                    direction = classify(x - anchor.x, y - anchor.y);
                }
            }
            else if (dx !== 0 || dy !== 0) {
                const next = classify(dx, dy);
                if (next === direction) {
                    candidate = null;
                }
                else {
                    if (candidate !== next) {
                        candidate = next;
                        candidateStart = previous;
                    }
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
        tick(now) {
            if (pointerId === null || !direction || !Number.isFinite(now) || now - lastEmit < repeatMs)
                return null;
            // A dropped frame yields one hop, never a backlog or a burst.
            lastEmit = now;
            return direction;
        },
        end(id) {
            if (pointerId === null || (id !== undefined && id !== pointerId))
                return false;
            pointerId = null;
            direction = null;
            candidate = null;
            return true;
        },
        snapshot() {
            return { pointerId, direction, anchor: { ...anchor }, offset: { x: point.x - anchor.x, y: point.y - anchor.y } };
        },
    };
}
/** Exponential damping has the same settling time at 30, 60 or 120 fps. */
export function dampingAlpha(deltaSeconds, sharpness) {
    return 1 - Math.exp(-Math.max(0, deltaSeconds) * sharpness);
}
