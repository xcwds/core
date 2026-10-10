import { loadPage } from '$lib/server/load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadPage(`/reference/${params.name}`);
