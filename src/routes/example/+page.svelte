<script lang="ts" context="module">
	import type { Nip07 } from 'nostr-typedef';

	declare global {
		interface Window {
			nostr: Nip07.Nostr;
		}
	}
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SimplePool, nip98, type Event, sortEvents } from 'nostr-tools';
	import { page } from '$app/stores';

	const privateNoteKind = 20001;
	const relays: string[] = [
		'wss://nos.lol/',
		'wss://relay.nostr.wirednet.jp/',
		'wss://nostr-relay.nokotaro.com'
	];

	const pool = new SimplePool();

	type Id = string;
	type Pubkey = string;
	type Content = string;

	let nip96Info: { api_url: string };
	let pubkey: string | undefined;
	let kind3Event: Event | undefined;
	let content = '';
	let events: Event[] = [];
	let contents = new Map<Id, Content>();
	let kind0Events = new Map<Pubkey, Event>();

	$: followees = kind3Event?.tags
		.filter(([tagName, pubkey]) => tagName === 'p' && pubkey !== undefined)
		.map(([, pubkey]) => pubkey);
	$: ready = content !== '' && followees !== undefined;

	$: if (pubkey !== undefined) {
		fetchFollowees(pubkey);
		subscribePrivateNotes(pubkey);
	}

	onMount(async () => {
		const { readyNostr } = await import('nip07-awaiter');
		await readyNostr;
		pubkey = await window.nostr.getPublicKey();

		const response = await fetch(`${$page.url.origin}/.well-known/nostr/nip96.json`);
		nip96Info = await response.json();
	});

	onDestroy(() => {
		pool.close(relays);
	});

	async function fetchFollowees(pubkey: string): Promise<void> {
		console.log('[fetch followees]', pubkey);
		const events = await pool.querySync(relays, { kinds: [3], authors: [pubkey] });
		kind3Event = sortEvents(events).at(0);
		console.log('[kind 3]', kind3Event);
	}

	function subscribePrivateNotes(pubkey: string): void {
		console.debug('[subscribe private notes]');
		pool.subscribeMany(
			relays,
			[
				{
					kinds: [privateNoteKind],
					'#p': [pubkey],
					since: Math.floor(Date.now() / 1000) - 24 * 60 * 60
				}
			],
			{
				onevent(event) {
					console.log('[private note]', event);
					events.unshift(event);
					events = events;
					fetchContent(event).then((content) => {
						if (content !== undefined) {
							contents.set(event.id, content);
							contents = contents;
						}
					});
					if (!kind0Events.has(event.pubkey)) {
						fetchMetadataEvent(event.pubkey).then((event) => {
							if (event !== undefined) {
								kind0Events.set(event.pubkey, event);
								kind0Events = kind0Events;
							}
						});
					}
				}
			}
		);
	}

	async function fetchContent(event: Event): Promise<string | undefined> {
		console.log('[fetch content]', event);
		const url = event.tags.find(([tagName]) => tagName === 'file')?.at(1);
		if (url === undefined) {
			console.warn('[invalid event]', event);
			return undefined;
		}

		const method = 'GET';
		const token = await nip98.getToken(url, method, (event) => window.nostr.signEvent(event), true);
		console.log('[token]', token);

		const response = await fetch(url, {
			method,
			headers: {
				Authorization: token
			}
		});
		if (!response.ok) {
			console.warn('[content not found]', await response.text());
			return undefined;
		}
		return await response.text();
	}

	async function fetchMetadataEvent(pubkey: string): Promise<Event | undefined> {
		const events = await pool.querySync(relays, { kinds: [0], authors: [pubkey], limit: 1 });
		return sortEvents(events).at(0);
	}

	async function send() {
		console.log('[send]', content);

		if (nip96Info === undefined || followees === undefined) {
			console.error('[logic error]');
			return;
		}

		const uploadUrl = nip96Info.api_url;
		const method = 'POST';
		const token = await nip98.getToken(
			uploadUrl,
			method,
			(event) => window.nostr.signEvent(event),
			true
		);
		console.log('[token]', token);

		const response = await fetch('/contents', {
			method,
			headers: {
				Authorization: token
			},
			body: JSON.stringify({
				file: content,
				permission: {
					pubkeys: followees
				}
			})
		});
		if (!response.ok) {
			console.error('[send failed]', await response.text());
			return;
		}
		const data = await response.json();
		console.log('[uploaded]', data);

		const url: string = data.nip94_event.tags
			.find(([tagName]: [string]) => tagName === 'url')
			.at(1);

		const event = await window.nostr.signEvent({
			kind: privateNoteKind,
			content: '',
			tags: [['file', url], ...followees.map((pubkey) => ['p', pubkey])],
			created_at: Math.floor(Date.now() / 1000)
		});

		await pool.publish(relays, event);
		content = '';
	}
</script>

<h1>Client Example</h1>

<form on:submit|preventDefault={send}>
	<textarea bind:value={content}></textarea>
	<input type="submit" value="Send" disabled={!ready} />
</form>

<p>Publish to {followees?.length ?? '?'} followees.</p>

<ul>
	{#each events as event}
		{@const metadataEvent = kind0Events.get(event.pubkey)}
		<li>
			{#if metadataEvent !== undefined}
				{@const metadata = JSON.parse(metadataEvent.content)}
				<div>@{metadata.display_name ? metadata.display_name : metadata.name}</div>
			{:else}
				<div>{event.pubkey}</div>
			{/if}
			<div>{contents.get(event.id) ?? '-'}</div>
		</li>
	{/each}
</ul>

<style>
	textarea {
		width: 100%;
		min-height: 10rem;
	}
</style>
