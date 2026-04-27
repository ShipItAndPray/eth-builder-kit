# eth-builder-kit

🚀 **[Live demo →](https://shipitandpray.github.io/eth-builder-kit/)**

Two reference implementations of in-flight Ethereum standards, built and hardened via Karpathy-style autoresearch (run evals → identify failures → mutate one thing → keep wins → loop).

## Packages

| Package | Spec | Status | Tests |
|---|---|---|---|
| [`interop-address-kit`](./interop-address-kit) | ERC-7930 (binary) + ERC-7828 (text) | Draft, 2026-04 | 2,471 / 2,471 |
| [`frame-tx-sandbox`](./frame-tx-sandbox)        | EIP-8141 Frame Transactions          | Draft, 2026-04 | 3,797 / 3,797 |

## What's in each

**interop-address-kit** — encode/decode chain-aware addresses on the wire,
parse and format the human-readable `<address>@<chain>[#<checksum>]` form,
verify checksums. CASA profiles for `eip155` (EVM) and `solana`.

**frame-tx-sandbox** — encode/decode/validate EIP-8141 transactions (type
`0x06`), compute intrinsic gas exactly per spec formula, and simulate frame
execution with atomic-revert semantics. Pluggable backend interface so you
can swap in `@ethereumjs/evm` for real execution.

## How they were built

1. **Fetch the spec** — pulled the actual ERC-7930 / ERC-7828 / EIP-8141 text
   from `eips.ethereum.org`. Verified test vectors arithmetically before
   writing code.
2. **Implement v0** — minimal correct implementation, no premature
   abstraction.
3. **Write binary evals** — pass/fail harness with the spec's own test
   vectors plus property tests.
4. **Run, fix, commit** — every iteration writes a JSONL line to
   `.iter-log.jsonl`. Code mutations only happen when the eval signals a
   real bug (most early failures were bugs in the test cases, not the code —
   exactly what autoresearch is supposed to surface).
5. **Add fuzz** — property-based testing with deterministic seeds. Multi-seed
   runs guard against the eval being too narrow.
6. **Stop at convergence** — both packages reach 100% pass on every seed.

## Running everything

```bash
( cd interop-address-kit && npm install && bash eval/autoresearch.sh )
( cd frame-tx-sandbox    && npm install && bash eval/autoresearch.sh )
```

Each driver exits 0 only if every spec test and every fuzz case passes.
Wrap them in your favourite outer loop (cron, CI, a code-mutation autoresearch
script) — the binary signal is exactly what those loops need.

## Caveats — read this

Both specs are still **Draft**. Pin a commit, expect drift. In particular:

- ERC-7828's checksum pre-image isn't pinned in the public draft; we use
  `keccak256(canonical-binary)[:4]` and document the choice.
- EIP-8141 has no formal test vectors and no reference implementation, so
  our wire format follows the published field list verbatim and our
  simulator implements the documented atomic-revert semantics — but the
  draft can shift.
- ENS resolution (`on.eth` ENSIP-24) is exposed as a parsed name string only;
  resolution requires an Ethereum RPC and is the caller's job.

## License

MIT
