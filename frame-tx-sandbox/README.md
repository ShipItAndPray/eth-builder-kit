# frame-tx-sandbox

Local sandbox for **EIP-8141 Frame Transactions**. Encoder, decoder, validator, and atomic-revert simulator for the new `0x06` transaction type.

> Status: EIP-8141 is **Draft**. Wire format and semantics may change. This sandbox tracks the draft as of 2026-04-26.

## What it does

- Encode/decode the full Frame Transaction wire format (RLP, type-prefixed `0x06`).
- Validate structural invariants (sender length, frame count, fee ordering, blob hash size, …).
- Compute intrinsic gas exactly per the spec formula:
  `intrinsic = 15000 + 475·N + calldataCost(rlp(frames))`.
- Simulate execution with EIP-8141 atomic-revert semantics: if any frame reverts, all preceding frames are rolled back and all subsequent frames are skipped.
- Pluggable backend interface — drop in `@ethereumjs/evm` or anvil to replace the deterministic mock.

## CLI

```bash
npm install
npm run build
node dist/cli.js encode  tx.json   # → 0x06... hex
node dist/cli.js decode  0x06...   # → JSON
node dist/cli.js gas     tx.json   # → { intrinsic, total }
node dist/cli.js simulate tx.json  # → simulation result with per-frame status
```

`tx.json` shape:

```json
{
  "chainId": "1",
  "nonce": "7",
  "sender": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
  "frames": [
    { "target": "0x1111…1111", "gasLimit": "100000", "value": "0",    "data": "0xcafe" },
    { "target": "0x2222…2222", "gasLimit": "80000",  "value": "1000", "data": "0xbeef" }
  ],
  "maxPriorityFeePerGas": "1000000000",
  "maxFeePerGas": "20000000000",
  "maxFeePerBlobGas": "0",
  "blobVersionedHashes": []
}
```

## Library API

```ts
import {
  encodeFrameTx, decodeFrameTx, frameTxHash,
  intrinsicGas, totalGasLimit,
  validateTx,
  simulate, MockBackend,
} from "frame-tx-sandbox";

// Build a tx, encode it, decode it back.
const enc = encodeFrameTx(tx);
const back = decodeFrameTx(enc);

// Compute gas.
const intrin = intrinsicGas(tx);
const total  = totalGasLimit(tx); // intrinsic + sum(frame.gasLimit)

// Simulate with atomic-revert semantics.
const r = simulate(tx);
// r.reverted, r.totalGasUsed, r.refund, r.frames[i].{status, gasUsed, returnData, error}
```

## Plugging in a real EVM

```ts
import { simulate, type ExecBackend } from "frame-tx-sandbox";

class EthereumJsBackend implements ExecBackend {
  snapshot()   { return this.vm.stateManager.checkpoint(); }
  revertTo(s)  { return this.vm.stateManager.revert(); }
  execFrame(tx, frame, idx) {
    // call into @ethereumjs/evm or hardhat
  }
}
const r = simulate(tx, new EthereumJsBackend());
```

## What's NOT implemented

- Frame introspection opcodes (spec mentions new opcodes for frames to read each
  other's parameters — still draft).
- Custom validation logic per spec (account-defined ECDSA replacements).
- Real EVM execution — only the deterministic mock backend is shipped.
- Fee deduction / nonce increment side-effects (not the simulator's job).
- Sponsored-fee semantics (`flags` bit 0) — flags are preserved verbatim, not enforced.

## Testing

```bash
npx tsx eval/run.ts          # 17 spec-property tests
npx tsx eval/fuzz.ts         # property-based fuzz (default 200 cases per seed)
bash eval/autoresearch.sh    # full multi-seed harness with logging
```

Current status:

- 17/17 spec tests
- 3,780/3,780 fuzz cases across 6 seeds
- Score: 1.000000

`autoresearch.sh` writes one JSON line per run to `.iter-log.jsonl` and exits non-zero on any failure — wrap it in a CI loop or a code-mutation outer loop.

## License

MIT
