import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
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
		// Get the public key used to sign previous block events from the signing key
		const pubkey = getPublicKey(Buffer.from(this.signingKey, 'hex'));

		for (let url of this.relays) {
			const relay = new Relay(url);

			// Connect to the relay and subscribe to the events
			// that have already been broadcasted recently
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
							this.alreadyBroadcasted.add(this.eventRelayRecord(event, url));
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

		// Put the signed event into the broadcast queue with a
		// unique item for each relay
		for (let url of this.relays) {
			this.broadcastQueue.set(this.eventRelayRecord(event, url), event);
		}

		// Debounce broadcasts on 5 second timeout to avoid multiple
		// reconnects to relays when batches of blocks are being synced
		clearTimeout(this._pendingBroadcast);
		this._pendingBroadcast = setTimeout(() => {
			this.broadcastEvents();
		}, 5000);
	}

	eventRelayRecord(event, url) {
		return `${event.id}->${url}`;
	}

	composeEvent(data) {
		if (!this.signingKey) {
			console.warn(`Need to set 'SIGNING_SECRET_KEY' as an env var to sign block metadata events`);
			return;
		}

		// Compose the event with the block data
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
			return;
		}

		// Connect to each relay and publish the event(s),
		// that have not been published yet to that relay,
		// then disconnect - since blocks only occur
		// every ten minutes on average, this is better
		// than trying to maintain a connection
		for (let url of this.relays) {
			let connected = false;
			let relay;

			try {
				connected = true;
				relay = await Relay.connect(url);
			} catch (err) {
				console.log('Failed to connect to relay', url);
			}

			if (!connected) {
				continue;
			}

			// Iterate over the broadcast queue and publish each event
			for (let [pending, event] of this.broadcastQueue) {
				const relayId = pending.split('->')[1];

				// If the event is not intended for this relay, skip it
				if (relayId !== url) {
					continue;
				}

				// If the event has already been broadcasted to this relay,
				// skip it
				if (this.alreadyBroadcasted.has(pending)) {
					continue;
				}

				// Try to publish each event to the relay. If it succeeds,
				// add it to the list of already broadcasted events and
				// remove it from the broadcast queue
				try {
					await relay.publish(event);
					this.alreadyBroadcasted.add(pending);
					this.broadcastQueue.delete(pending);
				} catch (err) {
					console.log(`Failed to publish to relay ${url}`, err);
				}
			}

			relay.close();
		}
	}
}
