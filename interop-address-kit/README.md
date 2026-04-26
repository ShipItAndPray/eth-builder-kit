# interop-address-kit

TypeScript reference implementation of:

- **ERC-7930** — Interoperable Addresses (binary)
- **ERC-7828** — Interoperable Names (text)

> Status: ERC-7930 and ERC-7828 are both **Draft**. This library tracks the
> draft as of 2026-04-26. Spec drift is expected; pin a version.

## Quick start

```ts
import { encode, decode, parseText, formatText, resolveParsed } from "interop-address-kit";

// Encode an EVM address on Polygon.
const hex = encode({
  caip2: "eip155:137",
  address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
});
// => 0x0001000001 89 14 d8da6bf26964af9d7eed9e03e53415d37aa96045

// Decode and read the structured form.
const dec = decode(hex);
// dec.caip2 === "eip155:137"
// dec.addressString === "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"

// Format the canonical ERC-7828 text form (with checksum).
const text = formatText({ caip2: "eip155:1", address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045" });
// => "0xd8da6bf26964af9d7eed9e03e53415d37aa96045@eip155:1#XXXXXXXX"

// Or use a human-readable label.
const friendly = formatText({
  caip2: "eip155:137",
  address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
  humanLabel: "polygon",
});

// Parse and verify.
const parsed = parseText(text);
const decoded = resolveParsed(parsed); // throws if checksum fails
```

## What's implemented

- ERC-7930 binary encoder + decoder, fully roundtrip-verified against the
  four spec test vectors.
- ERC-7828 text grammar `<address>@<chain>[#<checksum>]` with optional
  human chain labels (`ethereum`, `polygon`, `optimism`, `arbitrum`, `base`,
  `solana`, `sepolia`, `mainnet`, `bsc`).
- CASA profiles: `eip155` (EVM, ChainType `0x0000`), `solana` (ChainType `0x0002`).
- Checksum: keccak256(canonical-binary)[:4] as 8 uppercase hex characters.
  See `src/checksum.ts` for caveats on spec ambiguity.

## What's NOT implemented (yet)

- ENS resolution (`on.eth` ENSIP-24). Library exposes the parsed ENS name
  string; resolution requires an Ethereum RPC and is the caller's job.
- Bitcoin (`bip122`) and Cosmos (`cosmos`) profiles — stubs only.
- Custom `chainTypeId` extensions.

## Testing

```bash
npm install
npm test                    # vitest (unit)
npx tsx eval/run.ts         # spec-vector eval (binary pass/fail)
npx tsx eval/fuzz.ts        # property-based fuzz (default 200 cases)
bash eval/autoresearch.sh   # full multi-seed harness with logging
```

The autoresearch driver runs every spec vector + fuzz across five seeds (≈ 2,500 cases). Exits `0` only if all pass.

## How this was built

This kit was developed via Karpathy-style autoresearch: each iteration runs the
full eval, identifies failures, fixes one thing at a time, commits, repeats.
See `.iter-log.jsonl` for the run-by-run history. Current status:

- 21/21 spec test vectors
- 2,450/2,450 fuzz cases across 5 seeds
- Score: 1.000000

## License

MIT
