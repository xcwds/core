import type { Descriptor, Plugin } from '@xcwds/core';

export type PagesOptions = {
	pages: { path: string; title: string; emoji?: string; parent?: string }[];
};

declare const pages: (options: PagesOptions) => Descriptor<PagesOptions>;
export default pages;
export declare const build: Plugin<PagesOptions>;
