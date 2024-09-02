import { finalizeEvent } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools';

export default class NostrInterface {
	constructor({ relays }) {
		this.relays = relays || [];
		this.signingKey = process.env.SIGNING_SECRET_KEY;
		this.alreadyBroadcasted = new Set();
		this.broadcastQueue = new Map();
	}

	// Optional method to pull in block events that have already been
	// broadcast to avoid sending duplicates - it won't matter since
	// the timestamp is deterministic and thus the id will be the same,
	// but this is just for the sake of effeciency when restarting
	async restorePrevious() {
		const pubkey = Buffer.from(this.signingKey, 'hex').toString('hex');

		for (let url of this.relays) {
			const relay = new Relay(url);

			try {
				await relay.connect();

				await relay.subscribe(
					[
						{
							kinds: [2121],
							authors: [pubkey],
						},
					],
					{
						onevent: (event) => {
							this.alreadyBroadcasted.add(event.id);
						},
						oneose: () => {
							relay.close();
						},
					}
				);
			} catch (err) {}
		}
	}

	handleBlock(block) {
		const event = this.composeEvent(block);

		if (this.broadcastQueue.has(event.id) || this.alreadyBroadcasted.has(event.id)) {
			console.log(`Skipping already queued block height ${block.height}`);
			return;
		}

		// Put the signed event into the broadcast queue with a
		// unique item for each relay
		for (let url of this.relays) {
			this.broadcastQueue.set(`${event.id}:${url}`, event);
		}

		// Debounce broadcasts on 10 second interval
		if (!this.broadcastPending) {
			this.broadcastPending = true;
			setTimeout(() => {
				console.log('broadcasting events in 10 seconds');
				this.broadcastEvents();
				this.broadcastPending = false;
			}, 10000);
		}
	}

	composeEvent(data) {
		if (!this.signingKey) {
			console.warn(`Need to set 'SIGNING_SECRET_KEY' as an env var to sign block metadata events`);
			return;
		}

		const event = finalizeEvent(
			{
				kind: 2121,
				created_at: data.timestamp, // Note that timestamp of the event is taken from the block
				content: '',
				tags: [
					['hash', data.hash],
					['height', String(data.height)],
				],
			},
			this.signingKey
		);

		return event;
	}

	// Send event to configured relays
	async broadcastEvents() {
		if (this.relays.length === 0) {
			console.warn(`Need to set 'BROADCAST_RELAYS' as an env var to publish events`);
			return;
		}

		if (this.broadcastQueue.size === 0) {
			console.log('No events to broadcast');
			return;
		}

		// Connect to each relay and publish the event(s),
		// that have not been published yet to that relay,
		// then disconnect - since blocks only occur
		// every ten minutes on average, this is better
		// than trying to maintain a connection
		for (let url of this.relays) {
			const relay = await Relay.connect(url);

			for (let [idtuple, event] of this.broadcastQueue) {
				try {
					await relay.publish(event);
					this.alreadyBroadcasted.add(event.id);
					this.broadcastQueue.delete(idtuple);
					console.log(`published event ${event.id} to relay ${url}`);
				} catch (err) {
					console.log(`Failed to publish to relay ${url}`, err);
				}
			}

			relay.close();
		}
	}
}
