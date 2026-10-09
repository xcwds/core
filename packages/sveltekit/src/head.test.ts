import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { allowScript, headScript, injectHead, scriptHash } from './head.js';

describe('the pre-paint script', () => {
	it('wraps each snippet in its own try and keeps </script> out', () => {
		expect(headScript(['a()', ' ', 'b("</script>")'])).toBe(
			'try{a()}catch(e){}try{b("<\\/script>")}catch(e){}'
		);
		expect(headScript([])).toBe('');
	});

	it('hashes like the browser does', async () => {
		const expected = createHash('sha256').update('try{a()}catch(e){}').digest('base64');
		expect(await scriptHash('try{a()}catch(e){}')).toBe(`'sha256-${expected}'`);
	});
});

describe('allowScript', () => {
	const hash = "'sha256-abc'";

	it('adds the hash to script-src once', () => {
		const policy = "default-src 'self'; script-src 'self' 'sha256-kit'; style-src 'self'";
		const next = allowScript(policy, hash);
		expect(next).toBe(
			"default-src 'self'; script-src 'self' 'sha256-kit' 'sha256-abc'; style-src 'self'"
		);
		expect(allowScript(next, hash)).toBe(next);
	});

	it('copies default-src when there is no script-src', () => {
		expect(allowScript("default-src 'self'", hash)).toBe(
			"default-src 'self'; script-src 'self' 'sha256-abc'"
		);
	});

	it("leaves policies alone that allow inline scripts or don't restrict them", () => {
		expect(allowScript("script-src 'self' 'unsafe-inline'", hash)).toBe(
			"script-src 'self' 'unsafe-inline'"
		);
		expect(allowScript("style-src 'self'", hash)).toBe("style-src 'self'");
		expect(allowScript("script-src 'unsafe-inline' 'sha256-kit'", hash)).toContain(hash);
	});
});

describe('injectHead', () => {
	const csp = `<meta http-equiv="content-security-policy" content="script-src 'self'">`;

	it('fills the placeholder and allows the script in the CSP meta', () => {
		const html = `<head>${csp}%xcwds.head%</head>`;
		expect(injectHead(html, '<script>x</script>', "'sha256-x'")).toBe(
			`<head><meta http-equiv="content-security-policy" content="script-src 'self' 'sha256-x'"><script>x</script></head>`
		);
	});

	it('goes before </head> without a placeholder, and skips other chunks', () => {
		expect(injectHead('<head></head>', '<link>', null)).toBe('<head><link>\n</head>');
		expect(injectHead('<body>', '<link>', null)).toBe('<body>');
	});

	it('inserts $ patterns literally', () => {
		expect(injectHead('%xcwds.head%', "$&$'", null)).toBe("$&$'");
	});
});
