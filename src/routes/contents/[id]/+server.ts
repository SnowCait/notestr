import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nip98 } from 'nostr-tools';

type ContentRecord = { Id: string; Pubkey: string; Content: string, PermittedPubkeys: string };

export const GET: RequestHandler = async ({ url, platform, request, params }) => {
	if (platform === undefined) {
		error(500);
	}

	const token = request.headers.get('Authorization');
	if (token === null) {
		error(401);
	}
	const event = await nip98.unpackEventFromToken(token);
	console.log('[token]', token, event);
	try {
		await nip98.validateEvent(event, url.href, request.method);
	} catch (e) {
		error(401);
	}

	const result: ContentRecord | null = await platform.env.DB.prepare(
		'SELECT * FROM Contents WHERE id = ?'
	)
		.bind(params.id)
		.first();
	console.log('[select result]', result?.Id, result?.Pubkey);

	if (result === null) {
		error(404);
	}

    const permittedPubkeys = JSON.parse(result.PermittedPubkeys) as string[]
	if (!permittedPubkeys.includes(event.pubkey)) {
		error(404); // Use 404 instead of 403 not to distinguish
	}

	return new Response(result.Content, {
		headers: {
			'Content-Type': 'text/plain'
		}
	});
};
