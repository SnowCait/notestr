import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const nip96 = {
		api_url: `${url.origin}/contents`,
		content_types: ['text/plain'],
		plans: {
			free: {
				is_nip98_required: true
			}
		}
	};
	return new Response(JSON.stringify(nip96, null, 2));
};
