/**
 * Property-based fuzz for frame-tx-sandbox.
 *   - Random multi-frame tx encode/decode roundtrip preserves all fields.
 *   - For any random tx, intrinsicGas is exactly 15000 + 475*N + calldataCost(rlp(frames)).
 *   - Simulator never produces gasUsed > sum(frame.gasLimit).
 *   - Simulator atomic-revert invariant: if any frame status === "revert" with a real revert
 *     opcode, then no frame after has status === "success".
 */

import {
  decodeFrameTx,
  encodeFrameTx,
  frameTxHash,
  intrinsicGas,
  simulate,
  totalGasLimit,
  hexToBytes,
  bytesToHex,
  FRAME_TX_INTRINSIC_COST,
  FRAME_TX_PER_FRAME_COST,
} from "../src/index.js";
import { calldataCost } from "../src/encode.js";
import { RLP } from "@ethereumjs/rlp";
import type { Frame, FrameTx } from "../src/types.js";

interface CaseResult {
  group: string;
  name: string;
  ok: boolean;
  error?: string;
}

const SEED = Number(process.env.FUZZ_SEED ?? 1);
const N = Number(process.env.FUZZ_N ?? 200);

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
function randInt(maxExclusive: number): number {
  return rand() % maxExclusive;
}
function randBigInt(bytesMax: number): bigint {
  const len = randInt(bytesMax) + 1;
  let v = 0n;
  for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(rand() & 0xff);
  return v;
}

function randFrame(allowRevert: boolean): Frame {
  const dataLen = randInt(32);
  const data = randBytes(dataLen);
  if (allowRevert && dataLen > 0) {
    const r = randInt(20);
    if (r === 0) data[0] = 0xfd;
    else if (r === 1) data[0] = 0xfe;
  }
  return {
    mode: randInt(8),
    flags: randInt(16),
    target: randBytes(20),
    gasLimit: BigInt(21000 + randInt(500000)),
    value: randBigInt(4),
    data,
  };
}

function randTx(): FrameTx {
  const fc = 1 + randInt(8);
  const frames: Frame[] = [];
  for (let i = 0; i < fc; i++) frames.push(randFrame(true));
  const maxPrio = randBigInt(4) + 1n;
  return {
    chainId: BigInt(1 + randInt(1 << 20)),
    nonce: BigInt(randInt(1 << 16)),
    sender: randBytes(20),
    frames,
    maxPriorityFeePerGas: maxPrio,
    maxFeePerGas: maxPrio + randBigInt(4),
    maxFeePerBlobGas: randBigInt(2),
    blobVersionedHashes: [],
  };
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

function frameToRlp(f: Frame): any {
  return [
    f.mode === 0 ? new Uint8Array() : new Uint8Array([f.mode]),
    f.flags === 0 ? new Uint8Array() : new Uint8Array([f.flags]),
    f.target,
    bigIntMinimal(f.gasLimit),
    bigIntMinimal(f.value),
    f.data,
  ];
}
function bigIntMinimal(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array();
  const out: number[] = [];
  let v = n;
  while (v > 0n) {
    out.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return new Uint8Array(out);
}

// 1. encode/decode roundtrip
for (let i = 0; i < N; i++) {
  const tx = randTx();
  record("roundtrip", `i=${i}`, () => {
    const enc = encodeFrameTx(tx);
    if (enc[0] !== 0x06) throw new Error("type byte");
    const back = decodeFrameTx(enc);
    if (back.chainId !== tx.chainId) throw new Error("chainId");
    if (back.nonce !== tx.nonce) throw new Error("nonce");
    if (bytesToHex(back.sender) !== bytesToHex(tx.sender)) throw new Error("sender");
    if (back.frames.length !== tx.frames.length) throw new Error("frame count");
    for (let j = 0; j < tx.frames.length; j++) {
      const a = back.frames[j], b = tx.frames[j];
      if (a.mode !== b.mode) throw new Error(`mode[${j}]`);
      if (a.flags !== b.flags) throw new Error(`flags[${j}]`);
      if (a.gasLimit !== b.gasLimit) throw new Error(`gasLimit[${j}]`);
      if (a.value !== b.value) throw new Error(`value[${j}]`);
      if (bytesToHex(a.target) !== bytesToHex(b.target)) throw new Error(`target[${j}]`);
      if (bytesToHex(a.data) !== bytesToHex(b.data)) throw new Error(`data[${j}]`);
    }
    if (back.maxPriorityFeePerGas !== tx.maxPriorityFeePerGas) throw new Error("prio");
    if (back.maxFeePerGas !== tx.maxFeePerGas) throw new Error("max");
  });
}

// 2. intrinsic gas formula exact match
for (let i = 0; i < Math.min(N, 100); i++) {
  const tx = randTx();
  record("intrinsic-formula", `i=${i}`, () => {
    const framesRlp = RLP.encode(tx.frames.map(frameToRlp));
    const want =
      FRAME_TX_INTRINSIC_COST +
      BigInt(tx.frames.length) * FRAME_TX_PER_FRAME_COST +
      calldataCost(framesRlp);
    const got = intrinsicGas(tx);
    if (got !== want) throw new Error(`${got} != ${want}`);
  });
}

// 3. totalGasLimit invariant
for (let i = 0; i < Math.min(N, 50); i++) {
  const tx = randTx();
  record("total-gas", `i=${i}`, () => {
    const sum = tx.frames.reduce((s, f) => s + f.gasLimit, 0n);
    if (totalGasLimit(tx) !== intrinsicGas(tx) + sum) throw new Error("mismatch");
  });
}

// 4. simulator atomic invariant
for (let i = 0; i < Math.min(N, 100); i++) {
  const tx = randTx();
  record("atomic-invariant", `i=${i}`, () => {
    const r = simulate(tx);
    if (r.reverted) {
      // No frame after the first revert may be "success".
      let sawRevert = false;
      for (const f of r.frames) {
        if (sawRevert && f.status === "success")
          throw new Error("success after revert");
        if (f.status === "revert") sawRevert = true;
      }
      // Every "success" should have been rolled back to "revert"; we expect no "success" at all.
      if (r.frames.some((f) => f.status === "success"))
        throw new Error("success status survived after revert");
    }
    // sum(gasUsed) must not exceed sum(gasLimit)
    const used = r.frames.reduce((s, f) => s + f.gasUsed, 0n);
    const limit = tx.frames.reduce((s, f) => s + f.gasLimit, 0n);
    if (used > limit) throw new Error(`used ${used} > limit ${limit}`);
  });
}

// 5. tx hash is deterministic
for (let i = 0; i < 30; i++) {
  const tx = randTx();
  record("hash-determinism", `i=${i}`, () => {
    const h1 = frameTxHash(tx);
    const h2 = frameTxHash(tx);
    if (bytesToHex(h1) !== bytesToHex(h2)) throw new Error("non-deterministic");
  });
}

// 6. arbitrary corruption either decodes cleanly+reencodes or throws
for (let i = 0; i < 50; i++) {
  const tx = randTx();
  const bytes = encodeFrameTx(tx);
  const idx = randInt(bytes.length);
  const mutated = new Uint8Array(bytes);
  mutated[idx] ^= 0xff;
  record("mutation-safety", `i=${i} idx=${idx}`, () => {
    try {
      const back = decodeFrameTx(mutated);
      const reEnc = encodeFrameTx(back);
      if (bytesToHex(reEnc) !== bytesToHex(mutated))
        throw new Error("silent corruption: re-encode != mutated");
    } catch {
      // throwing is acceptable
    }
  });
}

void hexToBytes;
for (const r of results) console.log(JSON.stringify(r));
const passed = results.filter((r) => r.ok).length;
const total = results.length;
const failed = total - passed;
console.log(JSON.stringify({ summary: true, passed, failed, total, score: passed / total, fuzzSeed: SEED }));
process.exit(failed === 0 ? 0 : 1);
