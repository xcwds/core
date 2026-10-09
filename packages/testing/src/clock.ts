/**
 * A fake wall clock for unit tests, on Vitest's fake timers: `Date.now()`, `new Date()` and
 * timers all follow it. Apps count timers against wall-clock end times, because a sleeping
 * phone stops timers but not the wall clock; `jump()` simulates that: the time moves on, and
 * each pending timer still waits for the rest of its delay.
 */
import { vi } from 'vitest';

export type FakeClock = {
	/** The fake time, in ms since the epoch. */
	now(): number;
	/** Moves time forward, running every timer due on the way (and awaiting their promises). */
	advance(ms: number): Promise<void>;
	/** Moves the wall clock forward without running timers, like a phone waking from sleep. */
	jump(ms: number): void;
	/** Runs timers that are due now. */
	flush(): Promise<void>;
	/** Fakes `Date` and timers from now on (`buildTestApp` does this). */
	install(): void;
	/** Puts the real clock and timers back. */
	uninstall(): void;
	readonly installed: boolean;
};

/** 2026-01-01T09:00:00Z, so tests don't depend on when they run. */
export const DEFAULT_NOW = Date.UTC(2026, 0, 1, 9);

export function fakeClock(start: number | Date = DEFAULT_NOW): FakeClock {
	let installed = false;
	/** The time while not installed: the start, then wherever the fake clock was left. */
	let resting = typeof start === 'number' ? start : start.getTime();
	const check = () => {
		if (!installed) throw new Error('Install the fake clock first (buildTestApp does).');
	};
	return {
		now: () => (installed ? Date.now() : resting),
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
			if (installed) return;
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
			installed = true;
		},
		uninstall() {
			if (!installed) return;
			resting = Date.now();
			vi.useRealTimers();
			installed = false;
		},
		get installed() {
			return installed;
		}
	};
}
