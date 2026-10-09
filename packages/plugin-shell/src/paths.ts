import { resolve } from '$app/paths';

/**
 * An app path (without the base path) as a link. App paths have no params, so they resolve like
 * any route; the cast is because a package can't see the app's route types.
 */
export const href = resolve as unknown as (path: string) => string;
