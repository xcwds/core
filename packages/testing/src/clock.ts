/**
 * A fake wall clock for unit tests, on Vitest's fake timers: `Date.now()`, `new Date()` and
 * timers all follow it. Apps count timers against wall-clock end times, because a sleeping
 * phone stops timers but not the wall clock; `jump()` simulates that: the time moves on, and
 * each pending timer still waits for the rest of its delay.
 *
 * Vitest's fake timers are global, so one clock at a time owns them: installing a second one,
 * or one while the test faked timers itself, throws. Apps that should share a clock pass the
 * same one (`now: app.clock`); it stays installed until the last of them uninstalls it.
 */
import { vi } from 'vitest';

export type FakeClock = {
	/** The fake time, in ms since the epoch. */
	now(): number;
	/** Moves time forward, running every timer due on the way (and awaiting their promises). */
	advance(ms: number): Promise<void>;
	/**
	 * Moves the wall clock (`Date`) forward without running timers, like a phone waking from
	 * sleep. `performance.now()` doesn't move, as a monotonic clock may not.
	 */
	jump(ms: number): void;
	/** Runs timers that are due now. */
	flush(): Promise<void>;
	/**
	 * Fakes `Date`, `performance` and timers (`buildTestApp` does this). Each call needs its own
	 * `uninstall()`.
	 */
	install(): void;
	/** Undoes one `install()`; the last one puts the real clock and timers back. */
	uninstall(): void;
	readonly installed: boolean;
};

/** 2026-01-01T09:00:00Z, so tests don't depend on when they run. */
export const DEFAULT_NOW = Date.UTC(2026, 0, 1, 9);

/** The clock that faked the timers, if one did. */
let owner: FakeClock | null = null;

export function fakeClock(start: number | Date = DEFAULT_NOW): FakeClock {
	/** How many installs are still to be undone. */
	let users = 0;
	/** The time while not installed: the start, then wherever the fake clock was left. */
	let resting = typeof start === 'number' ? start : start.getTime();
	const check = () => {
		if (users === 0) throw new Error('Install the fake clock first (buildTestApp does).');
		if (owner !== clock || !vi.isFakeTimers())
			throw new Error('Something else replaced or removed the fake timers this clock installed.');
	};
	const clock: FakeClock = {
		now: () => (users > 0 && owner === clock ? Date.now() : resting),
		async advance(ms) {
			check();
			await vi.advanceTimersByTimeAsync(ms);
		},
		jump(ms) {
			check();
			vi.setSystemTime(Date.now() + ms);
		},
		async flush() {
			check();
			await vi.advanceTimersByTimeAsync(0);
		},
		install() {
			if (users > 0 && owner === clock) {
				users++;
				return;
			}
			if (vi.isFakeTimers())
				throw new Error(
					owner
						? 'Another fake clock is installed. Apps that share a clock pass the same one (`now: app.clock`), or use `openTab()`.'
						: 'The test already faked timers (vi.useFakeTimers()). Pass `now` to buildTestApp instead, or use real timers.'
				);
			vi.useFakeTimers({
				now: resting,
				toFake: [
					'Date',
					'setTimeout',
					'clearTimeout',
					'setInterval',
					'clearInterval',
					'performance'
				]
			});
			owner = clock;
			users = 1;
		},
		uninstall() {
			if (users === 0 || --users > 0) return;
			// Only put real timers back if these are still this clock's fake ones.
			if (owner === clock) {
				owner = null;
				if (vi.isFakeTimers()) {
					resting = Date.now();
					vi.useRealTimers();
				}
			}
		},
		get installed() {
			return users > 0;
		}
	};
	return clock;
}
