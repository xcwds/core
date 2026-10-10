/** Argument parsing and the package manager, shared by both commands. */
import { spawnSync } from 'node:child_process';
import type { PackageManager } from './generate.js';

export type Args = { positional: string[]; flags: Map<string, string | true> };

/** `--name X`, `--name=X` and bare `--yes` flags, plus positional arguments. */
export function parseArgs(argv: readonly string[], booleans: readonly string[]): Args {
	const positional: string[] = [];
	const flags = new Map<string, string | true>();
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (!arg.startsWith('-')) {
			positional.push(arg);
			continue;
		}
		const [rawName, inline] = arg.replace(/^-+/, '').split(/=(.*)/s);
		const name = rawName === 'y' ? 'yes' : rawName === 'h' ? 'help' : rawName!;
		if (inline !== undefined) flags.set(name, inline);
		else if (booleans.includes(name)) flags.set(name, true);
		else {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith('-')) throw new Error(`--${name} needs a value.`);
			flags.set(name, value);
			i++;
		}
	}
	return { positional, flags };
}

/** The package manager that ran this command (`npm create` or `pnpm create`), and its version. */
export function detectPackageManager(agent = process.env.npm_config_user_agent ?? ''): {
	name: PackageManager;
	version?: string;
} {
	const match = /^(pnpm|npm|yarn|bun)\/(\S+)/.exec(agent);
	if (match?.[1] === 'pnpm') return { name: 'pnpm', version: `pnpm@${match[2]}` };
	// Yarn and Bun get the npm setup, which they can run too.
	return { name: match ? 'npm' : 'pnpm' };
}

/** Runs `pm install` in `cwd`; returns whether it worked. */
export function install(pm: PackageManager, cwd: string): boolean {
	const result = spawnSync(pm, ['install'], {
		cwd,
		stdio: 'inherit',
		shell: process.platform === 'win32'
	});
	return result.status === 0;
}
