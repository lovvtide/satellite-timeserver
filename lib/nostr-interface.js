import { finalizeEvent } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools';

export default class NostrInterface {
	constructor({ relays }) {
		this.relays = relays || [];
		this.signingKey = process.env.SIGNING_SECRET_KEY;
		this.alreadyBroadcasted = new Set();
		this.readyToBroadcast = [];

		// setInterval(() => {
		// 	const broadcasting = this.readyToBroadcast.map((event) => {
		// 		return event.id;
		// 	});

		// 	for (let event of broadcasting) {
		// 	}
		// }, 5000);
	}

	// Optional method to pull in block events that have already been
	// broadcast to avoid sending duplicates (it won't matter since)
	// the timestamp is deterministic and thus the id will be the same,
	// but this is just for the sake of effeciency when restarting
	restorePrevious() {
		// TODO pull in self-signed kind 2121
		// to populate alreadyBroadcasted
	}

	handleBlock(block) {
		if (this.alreadyBroadcasted.has(block.hash)) {
			console.log(`Skipping already broadcasted block ${block.height}`);
			return;
		}

		const event = this.composeEvent(block);

		console.log('signed event', event);

		// TODO put the signed event into the broadcast queue so the interval
		// will pick it up in a batch, we have to do it this way to avoid getting
		// rate limited by relays when synchronizing batches of blocks
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
	broadcastEvent(event) {
		if (!this.relays.length === 0) {
			console.warn(`Need to set 'BROADCAST_RELAYS' as an env var to publish events`);
			return;
		}

		// TODO
	}
}
