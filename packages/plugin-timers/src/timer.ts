/**
 * One countdown as plain data, ported from xcwds.github.io's `Timer` class. It tracks a
 * wall-clock end time (`endsAt`) instead of counting ticks, so it stays correct when a phone
 * throttles or suspends the tab, and a reload resumes it from what was saved. Every function
 * takes `now` and returns a new state, so tests run on a fake clock.
 */

export type TimerState = {
	/** What `reset()` goes back to, in ms. */
	duration: number;
	/** When it reaches zero (ms since the epoch) while running; null while paused. */
	endsAt: number | null;
	/** What's left while paused, in ms. */
	pausedRemaining: number;
};

export const MINUTE = 60_000;
/** The longest timer: 7 days. */
export const MAX_DURATION = 7 * 24 * 60 * MINUTE;

/** A new timer of `duration` ms, paused. */
export const timer = (duration: number): TimerState => ({
	duration,
	endsAt: null,
	pausedRemaining: duration
});

export const running = (t: TimerState) => t.endsAt !== null;

/** Signed remaining time in ms; negative once the timer has run over. */
export const remaining = (t: TimerState, now: number) =>
	t.endsAt === null ? t.pausedRemaining : t.endsAt - now;

/** Running and at or past zero: the alarm should ring. */
export const ringing = (t: TimerState, now: number) => running(t) && remaining(t, now) <= 0;

export const start = (t: TimerState, now: number): TimerState =>
	running(t) ? t : { ...t, endsAt: now + t.pausedRemaining };

/** Pauses; a timer that has run over pauses at zero, so it rings again once resumed. */
export const pause = (t: TimerState, now: number): TimerState =>
	running(t) ? { ...t, endsAt: null, pausedRemaining: Math.max(0, remaining(t, now)) } : t;

export const reset = (t: TimerState, duration = t.duration): TimerState => timer(duration);

/**
 * Adds (or with a negative value, removes) time from this run without dropping below zero
 * remaining. On a finished timer, adding time snoozes it: it rings again `ms` from now, however
 * long it has run over. `duration` (what `reset()` goes back to) is left alone.
 */
export function add(t: TimerState, ms: number, now: number): TimerState {
	const left = ms > 0 ? Math.max(0, remaining(t, now)) : remaining(t, now);
	const next = Math.min(MAX_DURATION, Math.max(0, left + ms));
	return running(t) ? { ...t, endsAt: now + next } : { ...t, pausedRemaining: next };
}

const isTime = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

/** Validates a saved timer state. */
export function parseTimer(v: unknown): TimerState | undefined {
	if (typeof v !== 'object' || v === null) return undefined;
	const { duration, endsAt, pausedRemaining } = v as Record<string, unknown>;
	if (!isTime(duration, MAX_DURATION) || !isTime(pausedRemaining, MAX_DURATION)) return undefined;
	if (endsAt !== null && !isTime(endsAt)) return undefined;
	return { duration, endsAt, pausedRemaining };
}

/** Formats milliseconds as m:ss (or h:mm:ss), rounding up so 0:00 only shows when done. */
export function formatDuration(ms: number): string {
	const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const ss = String(seconds).padStart(2, '0');
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
	return `${minutes}:${ss}`;
}
