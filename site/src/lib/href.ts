import { resolve } from '$app/paths';

/** A site path (without the base path) as a link, for paths that come from data. */
export const href = resolve as unknown as (path: string) => string;
