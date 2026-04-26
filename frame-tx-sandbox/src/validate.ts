import type { Frame, FrameTx } from "./types.js";

const MAX_GAS_PER_FRAME = 30_000_000n;
const MAX_FRAMES_PER_TX = 256; // sanity cap; spec doesn't pin a value yet

export function validateFrame(f: Frame, idx: number): void {
  if (f.mode < 0 || f.mode > 0xff) throw new Error(`frame[${idx}].mode out of range`);
  if (f.flags < 0 || f.flags > 0xffff) throw new Error(`frame[${idx}].flags out of range`);
  if (!(f.target instanceof Uint8Array))
    throw new Error(`frame[${idx}].target must be Uint8Array`);
  if (f.target.length !== 0 && f.target.length !== 20)
    throw new Error(`frame[${idx}].target must be 0 or 20 bytes, got ${f.target.length}`);
  if (f.gasLimit < 0n) throw new Error(`frame[${idx}].gasLimit negative`);
  if (f.gasLimit > MAX_GAS_PER_FRAME)
    throw new Error(`frame[${idx}].gasLimit exceeds ${MAX_GAS_PER_FRAME}`);
  if (f.value < 0n) throw new Error(`frame[${idx}].value negative`);
  if (!(f.data instanceof Uint8Array)) throw new Error(`frame[${idx}].data must be Uint8Array`);
}

export function validateTx(tx: FrameTx): void {
  if (tx.chainId <= 0n) throw new Error("chainId must be positive");
  if (tx.nonce < 0n) throw new Error("nonce negative");
  if (tx.sender.length !== 20) throw new Error(`sender must be 20 bytes, got ${tx.sender.length}`);
  if (tx.frames.length === 0) throw new Error("at least 1 frame required");
  if (tx.frames.length > MAX_FRAMES_PER_TX)
    throw new Error(`too many frames: ${tx.frames.length} > ${MAX_FRAMES_PER_TX}`);
  if (tx.maxPriorityFeePerGas < 0n) throw new Error("maxPriorityFeePerGas negative");
  if (tx.maxFeePerGas < tx.maxPriorityFeePerGas)
    throw new Error("maxFeePerGas must be >= maxPriorityFeePerGas");
  if (tx.maxFeePerBlobGas < 0n) throw new Error("maxFeePerBlobGas negative");
  for (const h of tx.blobVersionedHashes) {
    if (h.length !== 32) throw new Error(`blob hash must be 32 bytes, got ${h.length}`);
  }
  tx.frames.forEach(validateFrame);
}
