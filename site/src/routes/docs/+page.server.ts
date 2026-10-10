import { loadIndex } from '$lib/server/load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ pages: loadIndex('/docs') });
