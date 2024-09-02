import EventEmitter from 'events';

export default class Clock extends EventEmitter {
	constructor(blocks) {
		super();
		this.init(blocks);
	}

	// Meta data for detected blocks: 'ordered' maps block heights
	// to the block's hash and timestamp, whereas 'nominal' allows
	// for lookup of a block's height given its hash. Calling this
	// function creates the initial map (overwriting any existing)
	// unless 'blocks' is provided as the initial value. Since the
	// data set can be quite large loading with init can be faster
	init(blocks) {
		this.blocks = {
			ordered: {
				/*[height]: { timestamp, height, hash }*/
			},
			nominal: {
				/*[hash]: height*/
			},
		};

		// Populate with provided blocks, if any
		if (blocks) {
			for (let n = 0; n < blocks.length; n++) {
				const parent = blocks[n - 1];
				this.insert({ ...blocks[n], parentHash: parent ? parent.hash : null });
			}
		}
	}

	// Provide interface fucntions to fetch new
	// block data from an external provider
	setProvider(provider = {}) {
		if (!provider.getHeight) {
			throw Error("Missing provider function 'getHeight'");
		}

		if (!provider.getBlock) {
			throw Error("Missing provider function 'getBlock'");
		}

		this.provider = provider;
	}

	async block(blockId) {
		// Already synced, save data for return and skip
		if (typeof blockId === 'number' && this.blocks.ordered[blockId]) {
			return { ...this.blocks.ordered[blockId], height: blockId };
		}

		if (!this.provider || !this.provider.getBlock) {
			throw Error("Missing provider 'getBlock'");
		}

		// Get the block
		const block = await this.provider.getBlock(blockId);

		if (!block) {
			throw Error(`Failed to get block ${blockId}`);
		}

		// Insert block data
		this.insert(block);

		// Report synchronization progress
		const iso = new Date(block.timestamp * 1000).toISOString();
		console.log(`Synchronized block ${block.height} @ ${iso}`);

		// Fire an event with the newly seen block
		this.emit('block', block);

		// Return block data
		return {
			timestamp: block.timestamp,
			height: block.height,
			hash: block.hash,
		};
	}

	// Get the hash, height, and timestamp for every block in range
	async advance(options = {}) {
		console.log('called advance', options);

		const newBlocks = {};
		let toBlock = options.toBlock;
		let fromBlock;

		// Assume all blocks in range will be synced
		let inRange = () => {
			return true;
		};

		// Start from specified block, or latest
		if (typeof toBlock === 'undefined') {
			if (!this.provider || !this.provider.getHeight) {
				throw Error("Missing provider method 'getHeight'");
			}

			toBlock = await this.provider.getHeight();
		}

		if (this.initialized) {
			if (toBlock <= this.max.height) {
				// Nothing to sync, return
				console.log('skipped clock sync');
				return;
			}

			// Start from next unsynced block
			fromBlock = this.max.height + 1;
		} else {
			// If first sync, start syncing from specified startBlock, falling back to initial toBlock
			fromBlock = typeof options.startBlock === 'undefined' ? toBlock : options.startBlock;
		}

		// If a specified subset of blocks to sync is provided
		if (typeof options.subset !== 'undefined') {
			// Return immediately if there are none
			if (options.subset.length === 0) {
				return newBlocks;
			}

			// Only sync blocks in subset range
			inRange = (n) => {
				return options.subset.indexOf(n) !== -1;
			};

			// Start iterating from minimum value of subset
			fromBlock = options.subset.sort((a, b) => {
				return a - b;
			})[0];
		}

		// Fetch block data sequentially for each block in range
		for (let n = fromBlock; n <= toBlock; n++) {
			// Not in range, skip
			if (!inRange(n)) {
				continue;
			}

			// Try to fetch block
			try {
				newBlocks[n] = await this.block(n);
			} catch (err) {
				console.log(`Stopping synchronization`, err);
				break;
			}
		}

		return newBlocks; // Return new block data
	}

	// Given hash, lookup height and timestamp
	readHash(hash, confirm) {
		const n = this.blocks.nominal[hash];
		const block = this.blocks.ordered[n];
		if (block && (!confirm || this.max.height - block.height > confirm)) {
			return { hash, height: n, timestamp: block.timestamp };
		}
	}

	// Given height, lookup hash and timestamp
	readHeight(n, confirm) {
		const block = this.blocks.ordered[n];
		if (block && (!confirm || this.max.height - block.height > confirm)) {
			return { hash: block.hash, height: n, timestamp: block.timestamp };
		}
	}

	// Given two hashes, return block height difference
	compareHash(a, b) {
		const i = this.readHash(a);
		const f = this.readHash(b);
		return typeof i === 'undefined' || typeof f === 'undefined' ? 0 : f.height - i.height;
	}

	// Add block data to in-memory mappings
	insert(block) {
		// Check that block has minimum required properties
		for (let prop of ['height', 'timestamp', 'hash']) {
			if (typeof block[prop] === 'undefined') {
				throw Error(`Block data incomplete, missing '${prop}'`);
			}
		}

		const { height, timestamp, hash, parentHash } = block;

		// Lookup the previously synced parent block, if any
		const prev = this.blocks.ordered[height - 1];

		// Throw error if discontinuity is detected - this check
		// is only applicable where parentHash is defined
		if (prev && parentHash && prev.hash !== parentHash) {
			throw Error(`Inconsistency in block data at block ${height}`);
		}

		// Save block meta in two mappings: height => (timestamp, hash)
		// and also hash => (height), allowing for quick lookup by hash
		this.blocks.nominal[hash] = height;
		this.blocks.ordered[height] = {
			timestamp: parseInt(timestamp),
			height: parseInt(height),
			hash,
		};
	}

	// Return array of blocks between specified block heights. The
	// array can be passed back to init() to repopulate block data
	list(range) {
		if (!this.initialized) {
			return [];
		}

		const _range = range || {};
		const _min = typeof _range.min !== 'undefined' ? _range.min : this.min.height;
		const _max = typeof _range.max !== 'undefined' ? _range.max : this.max.height;

		return Object.keys(this.blocks.ordered)
			.map((n) => {
				return { ...this.blocks.ordered[n], height: parseInt(n) };
			})
			.sort((a, b) => {
				return a.height - b.height;
			})
			.filter(({ height }) => {
				return height >= _min && height <= _max;
			});
	}

	get initialized() {
		// If data has been populated
		return Object.keys(this.blocks.nominal).length > 0;
	}

	get min() {
		// Return earliest synced block height
		return this.initialized
			? this.blocks.ordered[
					Object.keys(this.blocks.ordered).reduce((a, b) => {
						return parseInt(Math.min(a, b));
					})
			  ]
			: null;
	}

	get max() {
		// Return latest sycned block height
		return this.initialized
			? this.blocks.ordered[
					Object.keys(this.blocks.ordered).reduce((a, b) => {
						return parseInt(Math.max(a, b));
					})
			  ]
			: null;
	}
}
