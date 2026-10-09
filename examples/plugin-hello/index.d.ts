import type { Descriptor, Plugin } from '@xcwds/core';
import '@xcwds/sveltekit';

export type HelloOptions = { greeting?: string };

declare const hello: (options?: HelloOptions) => Descriptor<HelloOptions>;
export default hello;
export declare const build: Plugin<HelloOptions>;
