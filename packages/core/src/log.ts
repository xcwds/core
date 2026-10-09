export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** The app's logger: the local console only. Nothing is ever sent anywhere. */
export type Logger = Record<Exclude<LogLevel, 'silent'>, (...args: unknown[]) => void>;

const ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

export function createLogger(level: LogLevel = 'warn', prefix = '[xcwds]'): Logger {
	const at = ORDER.indexOf(level);
	const method =
		(name: Exclude<LogLevel, 'silent'>) =>
		(...args: unknown[]) => {
			if (ORDER.indexOf(name) >= at) console[name](prefix, ...args);
		};
	return {
		debug: method('debug'),
		info: method('info'),
		warn: method('warn'),
		error: method('error')
	};
}
