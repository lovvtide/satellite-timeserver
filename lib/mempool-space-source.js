import axios from 'axios';

export default class MempoolSpaceSource {
	constructor(endpoint = 'https://mempool.space/api') {
		this.endpoint = endpoint;
		this.label = 'mempool.space';
	}

	// Fetch current block height
	async getHeight() {
		const resp = await axios.get(`${this.endpoint}/blocks/tip/height`);
		return resp.data;
	}

	async getBlock(id) {
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
			throw new Error('Must specify block by height or hash');
		}

		if (!data) {
			throw new Error('Failed to get block');
		}

		return {
			hash: data.id,
			height: data.height,
			timestamp: data.timestamp,
		};
	}
}
