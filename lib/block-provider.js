import axios from 'axios';

// TODO make endpoint configurable

// TODO allow multiple failover endpoints should compare
// results and return value based on plurality of results

export default class BlockProvider {
	constructor() {
		this.endpoint = `https://mempool.space/api`;
	}

	// Fetch current block height
	async getHeight() {
		const resp = await axios.get(`${this.endpoint}/blocks/tip/height`);
		return resp.data;
	}

	// Fetch block by height (number) or hash (string)
	async getBlock(id) {
		console.log('id', id);
		let resp, data;

		if (typeof id === 'number') {
			resp = await axios.get(`${this.endpoint}/v1/blocks/${id}`);
			for (let item of resp.data) {
				if (item.height === id) {
					data = item;
					break;
				}
			}
		} else if (typeof id === 'string') {
			resp = await axios.get(`${this.endpoint}/block/${id}`);
			data = resp.data;
		} else {
			throw Error('Must specify block by height or hash');
		}

		if (!data) {
			throw Error('Failed get block');
		}

		return {
			hash: data.id,
			height: data.height,
			timestamp: data.timestamp,
		};
	}
}
