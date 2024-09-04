import axios from 'axios';

export default class BlockProvider {
	constructor() {
		this.dataSources = [];
	}

	// Add a new data source to the list
	addDataSource(source) {
		this.dataSources.push(source);
	}

	// Helper function to handle timeouts
	timeoutRequest(promise, timeout) {
		return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))]);
	}

	// Helper function to get majority consensus
	getMajorityConsensus(results, keyExtractor) {
		const validResults = results.filter((result) => result !== null);

		if (validResults.length > 0) {
			const counts = validResults.reduce((acc, result) => {
				const key = keyExtractor(result);
				acc[key] = (acc[key] || 0) + 1;
				return acc;
			}, {});

			const [majorityKey, count] = Object.entries(counts).reduce((a, b) => (a[1] > b[1] ? a : b));

			if (count > validResults.length / 2) {
				return validResults.find((result) => keyExtractor(result) === majorityKey);
			}
		}

		return null;
	}

	// Get block height that majority of data sources agree on
	async getHeight() {
		const dataSourceTimeout = process.env.DATA_SOURCE_TIMEOUT_MS || 10000;

		// Fetch height from each data source
		const requests = this.dataSources.map((source) =>
			this.timeoutRequest(source.getHeight(), dataSourceTimeout).catch((error) => {
				console.warn(`${source.label || 'unknown data source'} failed to fetch height`, error.message);
				return null;
			})
		);

		// Wait for all requests to complete or timeout
		const results = await Promise.all(requests);
		const majorityHeight = this.getMajorityConsensus(results, (height) => parseInt(height));

		return majorityHeight ? parseInt(majorityHeight) : null;
	}

	// Get a new block that majority of data sources agree on
	async getBlock(blockId) {
		const dataSourceTimeout = process.env.DATA_SOURCE_TIMEOUT_MS || 10000;

		// Fetch latest block from each data source
		const requests = this.dataSources.map((source) =>
			this.timeoutRequest(source.getLatestBlock(), dataSourceTimeout).catch((error) => {
				console.warn(`${source.label || 'unknown data source'} failed to fetch latest block`, error.message);
				return null;
			})
		);

		// Wait for all requests to complete or timeout
		const results = await Promise.all(requests);
		return this.getMajorityConsensus(results, (block) => block.hash);
	}
}
