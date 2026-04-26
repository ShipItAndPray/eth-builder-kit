import {
  decodeFrameTx,
  encodeFrameTx,
  encodeFrameTxHex,
  frameTxHash,
  intrinsicGas,
  simulate,
  totalGasLimit,
  validateTx,
  hexToBytes,
  bytesToHex,
  FRAME_TX_TYPE,
  FRAME_TX_INTRINSIC_COST,
  FRAME_TX_PER_FRAME_COST,
} from "../src/index.js";
import type { Frame, FrameTx } from "../src/types.js";

interface CaseResult {
  group: string;
  name: string;
  ok: boolean;
  error?: string;
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

function addr(seed: number): Uint8Array {
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i++) out[i] = (seed * 31 + i * 7) & 0xff;
  return out;
}
const SENDER = addr(1);
const TARGET = addr(2);

function frame(over: Partial<Frame> = {}): Frame {
  return {
    mode: 0,
    flags: 0,
    target: TARGET,
    gasLimit: BigInt(1e5),
    value: 0n,
    data: hexToBytes("0xcafe"),
    ...over,
  };
}
function makeTx(frames: Frame[], over: Partial<FrameTx> = {}): FrameTx {
  return {
    chainId: 1n,
    nonce: 0n,
    sender: SENDER,
    frames,
    maxPriorityFeePerGas: BigInt(1e9),
    maxFeePerGas: BigInt(2e10),
    maxFeePerBlobGas: 0n,
    blobVersionedHashes: [],
    ...over,
  };
}

record("wire", "tx type byte is 0x06", () => {
  const enc = encodeFrameTx(makeTx([frame()]));
  if (enc[0] !== FRAME_TX_TYPE) throw new Error(`got 0x${enc[0].toString(16)}`);
});

record("wire", "encode then decode roundtrip (single frame)", () => {
  const tx = makeTx([frame()]);
  const back = decodeFrameTx(encodeFrameTx(tx));
  if (back.chainId !== tx.chainId) throw new Error("chainId");
  if (back.frames.length !== 1) throw new Error("frame count");
  if (back.frames[0].mode !== tx.frames[0].mode) throw new Error("mode");
  if (bytesToHex(back.frames[0].target) !== bytesToHex(tx.frames[0].target)) throw new Error("target");
  if (back.frames[0].gasLimit !== tx.frames[0].gasLimit) throw new Error("gasLimit");
  if (bytesToHex(back.frames[0].data) !== bytesToHex(tx.frames[0].data)) throw new Error("data");
});

record("wire", "encode then decode roundtrip (5 frames)", () => {
  const fs = [
    frame({ data: hexToBytes("0x01") }),
    frame({ data: hexToBytes("0x0203") }),
    frame({ data: hexToBytes("0x") }),
    frame({ value: 1234n }),
    frame({ flags: 1, mode: 1 }),
  ];
  const tx = makeTx(fs, { nonce: 99n });
  const back = decodeFrameTx(encodeFrameTx(tx));
  if (back.frames.length !== 5) throw new Error("count");
  for (let i = 0; i < 5; i++) {
    if (back.frames[i].mode !== fs[i].mode) throw new Error(`mode[${i}]`);
    if (back.frames[i].flags !== fs[i].flags) throw new Error(`flags[${i}]`);
    if (back.frames[i].gasLimit !== fs[i].gasLimit) throw new Error(`gas[${i}]`);
    if (back.frames[i].value !== fs[i].value) throw new Error(`value[${i}]`);
    if (bytesToHex(back.frames[i].data) !== bytesToHex(fs[i].data)) throw new Error(`data[${i}]`);
  }
});

record("wire", "decode rejects wrong tx type", () => {
  let threw = false;
  try { decodeFrameTx(new Uint8Array([0x02, 0xc0])); } catch { threw = true; }
  if (!threw) throw new Error("expected throw");
});

record("gas", "intrinsic >= 15000 + 475 for 1-frame tx", () => {
  const tx = makeTx([frame()]);
  const got = intrinsicGas(tx);
  if (got < FRAME_TX_INTRINSIC_COST + FRAME_TX_PER_FRAME_COST) throw new Error(`low: ${got}`);
});

record("gas", "intrinsic scales with frame count", () => {
  const i1 = intrinsicGas(makeTx([frame()]));
  const i3 = intrinsicGas(makeTx([frame(), frame(), frame()]));
  if (i3 - i1 < 2n * FRAME_TX_PER_FRAME_COST)
    throw new Error(`expected i3-i1 >= ${2n * FRAME_TX_PER_FRAME_COST}, got ${i3 - i1}`);
});

record("gas", "totalGasLimit equals intrinsic plus sum of frame gas limits", () => {
  const a = BigInt(5e4);
  const b = BigInt(7e4);
  const tx = makeTx([frame({ gasLimit: a }), frame({ gasLimit: b })]);
  const total = totalGasLimit(tx);
  const expected = intrinsicGas(tx) + a + b;
  if (total !== expected) throw new Error(`${total} != ${expected}`);
});

record("validate", "rejects empty frame list", () => {
  let threw = false;
  try { validateTx(makeTx([])); } catch { threw = true; }
  if (!threw) throw new Error("expected throw");
});

record("validate", "rejects bad sender length", () => {
  const tx = makeTx([frame()]);
  (tx as any).sender = new Uint8Array(19);
  let threw = false; try { validateTx(tx); } catch { threw = true; }
  if (!threw) throw new Error("expected throw");
});

record("validate", "rejects maxFeePerGas < maxPriorityFeePerGas", () => {
  const tx = makeTx([frame()], { maxFeePerGas: 1n, maxPriorityFeePerGas: 2n });
  let threw = false; try { validateTx(tx); } catch { threw = true; }
  if (!threw) throw new Error("expected throw");
});

record("validate", "rejects bad blob hash length", () => {
  const tx = makeTx([frame()], { blobVersionedHashes: [new Uint8Array(31)] });
  let threw = false; try { validateTx(tx); } catch { threw = true; }
  if (!threw) throw new Error("expected throw");
});

record("sim", "all frames succeed", () => {
  const tx = makeTx([frame(), frame(), frame()]);
  const r = simulate(tx);
  if (r.reverted) throw new Error("should not revert");
  if (r.frames.some((f) => f.status !== "success")) throw new Error("not all success");
  if (r.frames.length !== 3) throw new Error("frame count");
});

record("sim", "revert in middle frame: preceding rolled back, subsequent skipped", () => {
  const tx = makeTx([
    frame({ data: hexToBytes("0xaa") }),
    frame({ data: hexToBytes("0xfd") }),
    frame({ data: hexToBytes("0xbb") }),
  ]);
  const r = simulate(tx);
  if (!r.reverted) throw new Error("should revert");
  if (r.frames[0].status !== "revert") throw new Error(`frame 0 should be revert, got ${r.frames[0].status}`);
  if (r.frames[1].status !== "revert") throw new Error("frame 1 should be revert");
  if (r.frames[2].status !== "skipped") throw new Error("frame 2 should be skipped");
});

record("sim", "single-frame success refund equals gasLimit minus gasUsed", () => {
  const limit = BigInt(1e5);
  const tx = makeTx([frame({ gasLimit: limit, data: hexToBytes("0xab") })]);
  const r = simulate(tx);
  const used = r.frames[0].gasUsed;
  const expectedRefund = limit - used;
  if (r.refund !== expectedRefund) throw new Error(`refund: ${r.refund} != ${expectedRefund}`);
});

record("sim", "INVALID opcode reverts", () => {
  const tx = makeTx([frame({ data: hexToBytes("0xfe") })]);
  const r = simulate(tx);
  if (!r.reverted) throw new Error("should revert");
});

record("sim", "tx hash is deterministic", () => {
  const tx = makeTx([frame()]);
  const h1 = frameTxHash(tx);
  const h2 = frameTxHash(tx);
  if (bytesToHex(h1) !== bytesToHex(h2)) throw new Error("non-deterministic hash");
  if (h1.length !== 32) throw new Error("hash should be 32 bytes");
});

record("hex", "encodeFrameTxHex starts with 0x06", () => {
  const hex = encodeFrameTxHex(makeTx([frame()]));
  if (!hex.startsWith("0x06")) throw new Error(`got ${hex.slice(0, 6)}`);
});

for (const r of results) console.log(JSON.stringify(r));
const passed = results.filter((r) => r.ok).length;
const total = results.length;
const failed = total - passed;
console.log(JSON.stringify({ summary: true, passed, failed, total, score: passed / total }));
process.exit(failed === 0 ? 0 : 1);
