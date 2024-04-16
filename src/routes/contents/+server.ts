import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nip98 } from 'nostr-tools';

export const POST: RequestHandler = async ({ url, platform, request }) => {
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

	const { file: content, permission } = await request.json();
	const { pubkeys }: { pubkeys: string[] } = permission;
	console.log('[request]', content, permission);

	const uuid = crypto.randomUUID();
	const info = await platform.env.DB.prepare('INSERT INTO Contents VALUES (?, ?, ?, ?)')
		.bind(uuid, event.pubkey, content, JSON.stringify(pubkeys))
		.run();
	console.log('[insert info]', info);
	const response = {
		status: 'success',
		nip94_event: {
			content: '',
			tags: [['url', `${url.origin}/contents/${uuid}`]]
		}
	};
	return new Response(JSON.stringify(response));
};
