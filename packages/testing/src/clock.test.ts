import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOW, fakeClock } from './clock.js';

afterEach(() => void vi.useRealTimers());

describe('fakeClock', () => {
	it('starts at a fixed time and fakes Date once installed', () => {
		const clock = fakeClock();
		expect(clock.now()).toBe(DEFAULT_NOW);
		expect(() => clock.jump(1)).toThrow(/Install/);
		clock.install();
		expect(Date.now()).toBe(DEFAULT_NOW);
		expect(new Date().toISOString()).toBe('2026-01-01T09:00:00.000Z');
		clock.uninstall();
		expect(clock.installed).toBe(false);
	});

	it('runs timers due on the way when advancing', async () => {
		const clock = fakeClock(new Date('2026-05-01T00:00:00Z'));
		clock.install();
		const fired: number[] = [];
		setTimeout(() => fired.push(Date.now()), 1000);
		await clock.advance(999);
		expect(fired).toEqual([]);
		await clock.advance(1);
		expect(fired).toEqual([Date.parse('2026-05-01T00:00:01Z')]);
		clock.uninstall();
	});

	it('jumps like a phone waking up: wall time moves, timers keep their remaining delay', async () => {
		const clock = fakeClock();
		clock.install();
		const end = Date.now() + 60_000;
		let rang = false;
		const tick = () => {
			if (Date.now() >= end) rang = true;
			else setTimeout(tick, 1000);
		};
		setTimeout(tick, 1000);
		clock.jump(10 * 60_000);
		expect(rang).toBe(false);
		expect(Date.now() - end).toBe(9 * 60_000);
		await clock.flush();
		expect(rang).toBe(false);
		// The next tick sees the end time has passed.
		await clock.advance(1000);
		expect(rang).toBe(true);
		clock.uninstall();
	});

	it('runs timers that are due on flush', async () => {
		const clock = fakeClock();
		clock.install();
		let ran = false;
		setTimeout(() => (ran = true));
		await clock.flush();
		expect(ran).toBe(true);
		clock.uninstall();
	});

	it('keeps its time across reinstalls', async () => {
		const clock = fakeClock(0);
		clock.install();
		await clock.advance(5000);
		clock.uninstall();
		expect(clock.now()).toBe(5000);
		expect(Date.now()).toBeGreaterThan(5000);
		clock.install();
		expect(Date.now()).toBe(5000);
		clock.uninstall();
	});
});
