/**
 * A plugin package's API, read from its TypeScript source (no type checker, just the syntax):
 * its options type, and what it adds to `App` (decorators), `Settings` and `Hooks` with
 * `declare module '@xcwds/core'`. Doc comments come along, so the source stays the one place
 * they're written.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { ROOT } from './pages.js';

export type Member = {
	name: string;
	/** The type as written, on one line. */
	type: string;
	optional: boolean;
	/** The doc comment, as Markdown. */
	doc: string;
	/** The members of the type, when it is an object type the package defines. */
	members?: Member[];
};

export type Api = {
	/** The options the factory takes (`TimersOptions`), if the package has any. */
	options?: { name: string; members: Member[] };
	/** Decorators: `app.<name>`. */
	app: Member[];
	settings: Member[];
	hooks: Member[];
};

const oneLine = (s: string) =>
	s.replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')').trim();

function docOf(node: ts.Node): string {
	const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
	return docs
		.map((d) => ts.getTextOfJSDocComment(d.comment) ?? '')
		.join('\n\n')
		.trim();
}

function sourceFiles(dir: string): ts.SourceFile[] {
	return readdirSync(dir, { recursive: true, encoding: 'utf8' })
		.filter((f) => /\.ts$/.test(f) && !/\.(test|spec|d)\.ts$/.test(f))
		.sort()
		.map((f) =>
			ts.createSourceFile(f, readFileSync(join(dir, f), 'utf8'), ts.ScriptTarget.Latest, true)
		);
}

/** Object types the package defines, by name, to expand members whose type is one of them. */
function objectTypes(files: ts.SourceFile[]): Map<string, ts.NodeArray<ts.TypeElement>> {
	const types = new Map<string, ts.NodeArray<ts.TypeElement>>();
	for (const sf of files)
		for (const statement of sf.statements) {
			if (ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type))
				types.set(statement.name.text, statement.type.members);
			else if (ts.isInterfaceDeclaration(statement))
				types.set(statement.name.text, statement.members);
		}
	return types;
}

function members(
	list: ts.NodeArray<ts.TypeElement>,
	sf: ts.SourceFile,
	types: Map<string, ts.NodeArray<ts.TypeElement>>,
	depth = 0
): Member[] {
	const out: Member[] = [];
	for (const m of list) {
		if (!m.name || !(ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) continue;
		const name = m.name.text;
		let type: string;
		if (ts.isMethodSignature(m)) {
			const params = m.parameters.map((p) => p.getText(sf)).join(', ');
			type = `(${params}) => ${m.type ? m.type.getText(sf) : 'void'}`;
		} else if (ts.isPropertySignature(m)) {
			type = m.type ? m.type.getText(sf) : 'unknown';
		} else continue;
		const member: Member = {
			name,
			type: oneLine(type),
			optional: Boolean(m.questionToken),
			doc: docOf(m)
		};
		// `AppTimers`, `Tool[]`, `AppTimers | undefined`: list that type's members too, once.
		const ref = /^([A-Z]\w*)(\[\])?( \| undefined)?$/.exec(member.type)?.[1];
		const inner = ref ? types.get(ref) : undefined;
		const literal = ts.isPropertySignature(m) && m.type && ts.isTypeLiteralNode(m.type);
		if (depth === 0 && (inner || literal)) {
			const nested = literal ? (m.type as ts.TypeLiteralNode).members : inner!;
			member.members = members(nested, nested[0]?.getSourceFile() ?? sf, types, depth + 1);
			if (literal) member.type = 'object';
		}
		out.push(member);
	}
	return out;
}

/** The API of `packages/<name>` (or any package folder, relative to the repository). */
export function apiOf(dir: string): Api {
	const files = sourceFiles(join(ROOT, dir, 'src'));
	const types = objectTypes(files);
	const api: Api = { app: [], settings: [], hooks: [] };
	for (const sf of files) {
		for (const statement of sf.statements) {
			const options =
				sf.fileName === 'options.ts' &&
				ts.isTypeAliasDeclaration(statement) &&
				/^(?!Resolved)\w+Options$/.test(statement.name.text) &&
				statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (options && ts.isTypeLiteralNode(statement.type))
				api.options = {
					name: statement.name.text,
					members: members(statement.type.members, sf, types)
				};
			if (
				ts.isModuleDeclaration(statement) &&
				ts.isStringLiteral(statement.name) &&
				statement.name.text === '@xcwds/core' &&
				statement.body &&
				ts.isModuleBlock(statement.body)
			)
				for (const decl of statement.body.statements) {
					if (!ts.isInterfaceDeclaration(decl)) continue;
					const list = { App: api.app, Settings: api.settings, Hooks: api.hooks }[decl.name.text];
					list?.push(...members(decl.members, sf, types));
				}
		}
	}
	return api;
}
