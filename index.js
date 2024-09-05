import 'dotenv/config';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

import Clock from './lib/clock.js';
import NostrInterface from './lib/nostr-interface.js';
import BlockProvider from './lib/block-provider.js';
import MempoolSpaceSource from './lib/mempool-space-source.js';

global.WebSocket = WebSocket;
useWebSocketImplementation(WebSocket);

const start = async () => {
	// Check to prevent accidental syncing all the way from genesis block
	// If you actually want to do that, you can pass "0" explicitly
	if (typeof process.env.INITIAL_BLOCK_HEIGHT === 'undefined') {
		throw Error(`Must specify 'INITIAL_BLOCK_HEIGHT' as env var`);
	}

	const clock = new Clock();
	const provider = new BlockProvider();

	provider.addDataSource(new MempoolSpaceSource());

	const nostrInterface = new NostrInterface({
		relays: process.env.BROADCAST_RELAYS ? process.env.BROADCAST_RELAYS.split(',') : [],
	});

	// Clock accepts any provider that implements
	// 'getHeight' and 'getBlock' methods
	clock.setProvider(provider);

	clock.on('block', (block) => {
		nostrInterface.handleBlock(block);
	});

	await nostrInterface.restorePrevious();

	let startBlock;

	// If no initial block height is specified, use the current height of the block provider
	if (typeof process.env.INITIAL_BLOCK_HEIGHT === 'undefined') {
		startBlock = await provider.getHeight();
	} else if (typeof process.env.INITIAL_BLOCK_HEIGHT !== 'undefined') {
		startBlock = parseInt(process.env.INITIAL_BLOCK_HEIGHT);
	}

	if (typeof startBlock === 'undefined') {
		throw Error('Failed to determine starting block height');
	}

	await clock.advance({ startBlock });

	// Poll the remote provider(s) (once per minute by default) to check for new blocks.
	// When a new block is detected, fire the 'block' event, passing it to the nostr
	// interface to be composed and broadcasted to configured relays
	setInterval(
		async () => {
			await clock.advance({ startBlock });
		},
		process.env.SYNC_INTERVAL_SECONDS ? parseInt(process.env.SYNC_INTERVAL_SECONDS) * 1000 : 60000
	);
};

start();
