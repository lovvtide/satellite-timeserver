import 'dotenv/config';

import Clock from './lib/clock.js';
import NostrInterface from './lib/nostr-interface.js';
import BlockProvider from './lib/block-provider.js';

const start = async () => {
	// Check to prevent accidental syncing all the way from genesis block
	// If you actually want to do that, you can pass "0" explicitly
	if (typeof process.env.INTIAL_BLOCK_HEIGHT === 'undefined') {
		throw Error(`Must specify 'INTIAL_BLOCK_HEIGHT' as env var`);
	}

	const clock = new Clock();
	const provider = new BlockProvider();
	const nostrInterface = new NostrInterface({
		relays: process.env.BROADCAST_RELAYS ? process.env.BROADCAST_RELAYS.split(',') : [],
	});

	// Clock accepts any provider that implements
	// 'getHeight' and 'getBlock' methods
	clock.setProvider(provider);

	clock.on('block', (block) => {
		nostrInterface.handleBlock(block);
	});

	// TODO
	// Ask external relays for block metadata events signed by this
	// timeserver's secret key to avoid synchronizing duplicates
	// await nostrInterface.restorePrevious

	// Poll the remote provider (once per minute by default) to check for new blocks.
	// When a new block is detected, fire the 'block' event, passing it to the nostr
	// interface to be composed and broadcasted to configured relays

	await clock.advance({
		startBlock: parseInt(process.env.INTIAL_BLOCK_HEIGHT),
	});

	setInterval(
		async () => {
			await clock.advance({
				startBlock: parseInt(process.env.INTIAL_BLOCK_HEIGHT),
			});
		},
		process.env.SYNC_INTERVAL_SECONDS ? parseInt(process.env.SYNC_INTERVAL_SECONDS) * 1000 : 60000
	);
};

start();
