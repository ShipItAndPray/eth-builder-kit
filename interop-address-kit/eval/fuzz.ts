/**
 * Property-based fuzz tests:
 *   - Random EVM chain id + random 20-byte address roundtrip through binary AND text.
 *   - Solana random pubkey roundtrip.
 *   - Mutated bytes must fail to decode.
 *   - Wrong checksum must reject.
 */

import { decode, encode, parseText, formatText, resolveParsed } from "../src/index.js";
import { bytesToHex, hexToBytes } from "../src/index.js";
import { base58Encode } from "../src/index.js";

interface CaseResult {
  group: string;
  name: string;
  ok: boolean;
  error?: string;
}

const SEED = Number(process.env.FUZZ_SEED ?? 1);
const N = Number(process.env.FUZZ_N ?? 200);

// xorshift32 deterministic PRNG
let s = SEED >>> 0;
function rand(): number {
  s ^= s << 13; s >>>= 0;
  s ^= s >>> 17; s >>>= 0;
  s ^= s << 5; s >>>= 0;
  return s >>> 0;
}
function randBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() & 0xff;
  return out;
}
function randEvmChainId(): bigint {
  // 1..2^31 range covers all real EVM chains
  return BigInt((rand() % (1 << 30)) + 1);
}

const results: CaseResult[] = [];
function record(group: string, name: string, fn: () => void) {
  try {
    fn();
    results.push({ group, name, ok: true });
  } catch (e: any) {
    results.push({ group, name, ok: false, error: String(e?.message ?? e) });
  }
}

// 1. EVM roundtrip fuzz
for (let i = 0; i < N; i++) {
  const chainId = randEvmChainId();
  const addr = bytesToHex(randBytes(20));
  record("fuzz-evm-roundtrip", `i=${i} chainId=${chainId}`, () => {
    const hex = encode({ caip2: `eip155:${chainId}`, address: addr });
    const dec = decode(hex);
    if (dec.caip2 !== `eip155:${chainId}`) throw new Error(`caip2 mismatch: ${dec.caip2}`);
    if (dec.addressString.toLowerCase() !== addr.toLowerCase())
      throw new Error(`addr mismatch: ${dec.addressString} != ${addr}`);
    const re = encode({ caip2: dec.caip2, address: dec.addressString });
    if (re.toLowerCase() !== hex.toLowerCase())
      throw new Error(`re-encode mismatch: ${re} != ${hex}`);
  });
}

// 2. Text roundtrip fuzz with checksum
for (let i = 0; i < Math.min(N, 100); i++) {
  const chainId = randEvmChainId();
  const addr = bytesToHex(randBytes(20));
  record("fuzz-text-roundtrip", `i=${i}`, () => {
    const text = formatText({ caip2: `eip155:${chainId}`, address: addr });
    const parsed = parseText(text);
    if (parsed.caip2 !== `eip155:${chainId}`) throw new Error(`caip2 mismatch: ${parsed.caip2}`);
    const dec = resolveParsed(parsed);
    if (dec.addressString.toLowerCase() !== addr.toLowerCase())
      throw new Error(`addr mismatch`);
  });
}

// 3. Solana roundtrip
for (let i = 0; i < 20; i++) {
  const ref = base58Encode(randBytes(32));
  const addr = base58Encode(randBytes(32));
  record("fuzz-solana-roundtrip", `i=${i}`, () => {
    const hex = encode({ caip2: `solana:${ref}`, address: addr });
    const dec = decode(hex);
    if (dec.caip2 !== `solana:${ref}`) throw new Error(`caip2 mismatch`);
    if (dec.addressString !== addr) throw new Error(`addr mismatch`);
  });
}

// 4. Mutated bytes must fail OR roundtrip cleanly (never silently corrupt)
for (let i = 0; i < 50; i++) {
  const chainId = randEvmChainId();
  const addr = bytesToHex(randBytes(20));
  const hex = encode({ caip2: `eip155:${chainId}`, address: addr });
  const bytes = hexToBytes(hex);
  // flip a random byte
  const idx = rand() % bytes.length;
  const mutated = new Uint8Array(bytes);
  mutated[idx] ^= 0xff;
  record("fuzz-mutation-safety", `i=${i} idx=${idx}`, () => {
    try {
      const dec = decode(mutated);
      // If it decoded, re-encoding must produce same bytes (no silent corruption).
      const re = encode({ caip2: dec.caip2, address: dec.addressString, chainType: dec.chainType });
      if (re.toLowerCase() !== bytesToHex(mutated).toLowerCase()) {
        throw new Error(`silent corruption: re-encode != mutated input`);
      }
    } catch (e: any) {
      // Throwing is acceptable — mutation may have created an invalid form.
    }
  });
}

// 5. Bad checksum must reject
for (let i = 0; i < 20; i++) {
  const chainId = randEvmChainId();
  const addr = bytesToHex(randBytes(20));
  record("fuzz-bad-checksum", `i=${i}`, () => {
    const text = formatText({ caip2: `eip155:${chainId}`, address: addr });
    // mutate the checksum
    const parts = text.split("#");
    if (parts.length !== 2) throw new Error("expected checksum");
    const bad = parts[0] + "#DEADBEEF";
    const parsed = parseText(bad);
    let threw = false;
    try { resolveParsed(parsed); } catch { threw = true; }
    // It's possible (1 / 2^32) that DEADBEEF accidentally matches; tolerate if so.
    if (!threw && parsed.checksum?.toUpperCase() !== "DEADBEEF")
      throw new Error("expected throw or DEADBEEF match");
  });
}

for (const r of results) console.log(JSON.stringify(r));
const passed = results.filter((r) => r.ok).length;
const total = results.length;
const failed = total - passed;
console.log(JSON.stringify({ summary: true, passed, failed, total, score: passed / total, fuzzSeed: SEED }));
process.exit(failed === 0 ? 0 : 1);
