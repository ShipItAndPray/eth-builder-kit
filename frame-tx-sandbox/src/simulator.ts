/**
 * Frame Transaction simulator.
 *
 * This is NOT a full EVM. It interprets each frame against a pluggable backend
 * that reports per-call gas usage and revert status. It enforces EIP-8141's
 * atomic-revert semantics: if any frame reverts, ALL preceding frames are
 * rolled back and ALL subsequent frames are skipped.
 *
 * For real EVM execution, plug in an `execFrame` backend that calls into
 * @ethereumjs/evm or anvil. The default backend below is a deterministic
 * mock that lets us property-test the orchestration logic in isolation.
 */

import { encodeFrameTx, frameTxHash, intrinsicGas, totalGasLimit } from "./encode.js";
import type { Frame, FrameResult, FrameTx, SimulationResult } from "./types.js";
import { validateTx } from "./validate.js";

export interface ExecBackend {
  /** Snapshot the state and return an opaque handle. */
  snapshot(): unknown;
  /** Restore state to a prior snapshot. */
  revertTo(snapshot: unknown): void;
  /** Execute a single frame. Must respect gasLimit. */
  execFrame(
    tx: FrameTx,
    frame: Frame,
    frameIndex: number,
  ): { gasUsed: bigint; reverted: boolean; returnData: Uint8Array; error?: string };
}

/**
 * Default mock backend: deterministic, useful for tests.
 *
 * Behavior:
 *   - empty data    => success, gasUsed = base 21k clipped to gasLimit
 *   - data starts 0xfd => REVERT opcode, gasUsed = gasLimit (consumes all)
 *   - data starts 0xfe => INVALID opcode, gasUsed = gasLimit
 *   - otherwise     => success, gasUsed = min(gasLimit, base + 200 * dataLen)
 */
export class MockBackend implements ExecBackend {
  private state = new Map<string, Uint8Array>();
  private snapshots: Array<Map<string, Uint8Array>> = [];

  snapshot(): unknown {
    this.snapshots.push(new Map(this.state));
    return this.snapshots.length - 1;
  }
  revertTo(handle: unknown): void {
    const idx = handle as number;
    if (idx < 0 || idx >= this.snapshots.length) throw new Error("bad snapshot");
    this.state = new Map(this.snapshots[idx]);
    this.snapshots.length = idx;
  }
  execFrame(_tx: FrameTx, frame: Frame): {
    gasUsed: bigint;
    reverted: boolean;
    returnData: Uint8Array;
    error?: string;
  } {
    const base = 21000n;
    if (frame.data.length === 0) {
      return { gasUsed: base < frame.gasLimit ? base : frame.gasLimit, reverted: false, returnData: new Uint8Array() };
    }
    const op = frame.data[0];
    if (op === 0xfd) {
      return {
        gasUsed: frame.gasLimit,
        reverted: true,
        returnData: frame.data.subarray(1),
        error: "REVERT",
      };
    }
    if (op === 0xfe) {
      return { gasUsed: frame.gasLimit, reverted: true, returnData: new Uint8Array(), error: "INVALID" };
    }
    const want = base + BigInt(frame.data.length) * 200n;
    const used = want < frame.gasLimit ? want : frame.gasLimit;
    return { gasUsed: used, reverted: false, returnData: frame.data };
  }
}

export function simulate(tx: FrameTx, backend: ExecBackend = new MockBackend()): SimulationResult {
  validateTx(tx);
  const txHash = frameTxHash(tx);

  let cumulative = intrinsicGas(tx);
  const totalLimit = totalGasLimit(tx);
  const results: FrameResult[] = [];
  const snap = backend.snapshot();
  let reverted = false;

  for (let i = 0; i < tx.frames.length; i++) {
    if (reverted) {
      results.push({ index: i, status: "skipped", gasUsed: 0n, returnData: new Uint8Array() });
      continue;
    }
    const f = tx.frames[i];
    if (cumulative + f.gasLimit > totalLimit) {
      // shouldn't happen if accounting is correct, but guard anyway
      reverted = true;
      results.push({
        index: i,
        status: "revert",
        gasUsed: 0n,
        returnData: new Uint8Array(),
        error: "out of gas at frame boundary",
      });
      continue;
    }
    const r = backend.execFrame(tx, f, i);
    cumulative += r.gasUsed;
    results.push({
      index: i,
      status: r.reverted ? "revert" : "success",
      gasUsed: r.gasUsed,
      returnData: r.returnData,
      error: r.error,
    });
    if (r.reverted) {
      reverted = true;
    }
  }

  if (reverted) {
    backend.revertTo(snap);
    // mark every successful frame as reverted (preceded a failure)
    let firstRevertIdx = results.findIndex((r) => r.status === "revert");
    if (firstRevertIdx < 0) firstRevertIdx = results.length;
    for (let j = 0; j < firstRevertIdx; j++) {
      if (results[j].status === "success") {
        results[j] = {
          ...results[j],
          status: "revert",
          error: "rolled back due to later frame revert",
        };
      }
    }
  }

  // refund: per spec, refund = sum(frame.gasLimit) - total_gas_used
  // (intrinsic + per-frame fees are NOT refundable)
  const sumFrameLimits = tx.frames.reduce((s, f) => s + f.gasLimit, 0n);
  const frameGasUsed = results.reduce((s, r) => s + r.gasUsed, 0n);
  const refund = sumFrameLimits - frameGasUsed;
  const totalGasUsed = cumulative;

  return { txHash, totalGasUsed, refund, reverted, frames: results };
}

export { encodeFrameTx, frameTxHash, intrinsicGas, totalGasLimit };
