/**
 * Strict mode: errors plugins report to `onError` (a failing hook, a redirect loop) fail the
 * test, instead of being logged while it passes. Every operation of a test app or worker
 * rejects with the errors reported since the last one checked.
 */
import type { App } from '@xcwds/core';
import { onTestFinished } from 'vitest';

export class ErrorTrap {
	/** Every error reported to `onError`, in order. */
	readonly errors: unknown[] = [];
	#checked = 0;
	readonly #strict: boolean;

	constructor(strict: boolean) {
		this.#strict = strict;
	}

	/** Collects `app`'s reports (as its first `onError` hook); logs them when not strict. */
	watch(app: App): void {
		app.addHook('onError', (error) => {
			this.errors.push(error);
			if (!this.#strict) app.log.error(error);
		});
	}

	/** Throws what was reported since the last check (strict mode only). */
	check(): void {
		const fresh = this.errors.slice(this.#checked);
		this.#checked = this.errors.length;
		if (!this.#strict || fresh.length === 0) return;
		if (fresh.length === 1) throw fresh[0];
		throw new AggregateError(fresh, `${fresh.length} errors were reported to onError.`);
	}

	/** Runs `fn`, then checks (also when `fn` throws). */
	async run<T>(fn: () => Promise<T>): Promise<T> {
		let result: T;
		try {
			result = await fn();
		} catch (error) {
			// A reported error usually caused the failure: say that one.
			this.check();
			throw error;
		}
		this.check();
		return result;
	}
}

/** Closes the app when the current test finishes, so a failing test can't leak fake timers. */
export function closeAfterTest(close: () => Promise<void>): void {
	try {
		onTestFinished(() => close());
	} catch {
		// Not inside a test (e.g. `beforeAll`): closing is up to the caller.
	}
}
