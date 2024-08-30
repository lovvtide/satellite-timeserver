# satellite-timeserver

Satellite timeserver listens for new blocks and broadcasts the block metadata (`hash`, `height`, and `timestamp`) on nostr.

### Why?

Because by using hashes to refer to moments in time, we give people a way to prove an upper bound on the real age of their signed event.

Blocks created by bitcoin miners are:

1. Regular (on average)
2. Effectively unpredictable
3. Globally observable

Thus, including the hash of a block in a signed nostr event proves that the event is _at least_ as recent as the block whose hash it includes. This is useful because it allows for an objective and provable notion of recency, regardless of what the `created_at` value of an event is.

### Contrast with Open Timestamps

[OpenTimestamp's](https://opentimestamps.org/) stated purpose is to "prove that some data existed prior to some point in time"

In contrast, the purpose of satellite-timeserver is the opposite: to allow users to sign events such that an outside observer can be certain that the signature did NOT exist prior to some point in time.

### Applications

One use case is giving someone a straightforward way to prove that they are in possession of a private key.

A less obvious but potentially very powerful use case relates to the governance of [NIP-29](https://github.com/nostr-protocol/nips/blob/master/29.md) groups, specifically with regard to forking of communities (more on this soon, I'm still working on it)

### Quickstart

`node index.js`

Don't forget to specify `INITIAL_BLOCK_HEIGHT` in a `.env` file unless you want to sync the whole blockchain.

If you want to sign and broadcast events you'll also need to set a value for `SIGNING_SECRET_KEY` and `BROADCAST_RELAYS` (comma separated urls). If you don't set these, blocks will still sync but you'll just get a warning that events cannot be signed and/or broadcast.
