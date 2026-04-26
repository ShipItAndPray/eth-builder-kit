/**
 * EIP-8141 Frame Transactions — types.
 *
 * Wire format (per the current draft, 2026-04):
 *   tx_type = 0x06
 *   payload = RLP([
 *     chain_id,
 *     nonce,
 *     sender,
 *     frames,                     // list of frames, see Frame below
 *     max_priority_fee_per_gas,
 *     max_fee_per_gas,
 *     max_fee_per_blob_gas,
 *     blob_versioned_hashes,      // list of 32-byte blob hashes
 *   ])
 *
 *   frame = RLP([mode, flags, target, gas_limit, value, data])
 *
 *  - intrinsic gas      = 15000
 *  - per-frame gas      = 475
 *  - calldata cost      = standard EIP-2028 over RLP(frames)
 *
 *  Atomic revert: if any frame reverts, all preceding frames in the batch
 *  also revert and all subsequent frames are skipped.
 *
 * Status: Draft — fields and semantics may change. Pin a version.
 */

export const FRAME_TX_TYPE = 0x06;
export const FRAME_TX_INTRINSIC_COST = 15000n;
export const FRAME_TX_PER_FRAME_COST = 475n;

/** A single frame inside a Frame Transaction. */
export interface Frame {
  /** Execution mode (interpretation per spec). 0 = call, 1 = delegatecall (placeholder). */
  mode: number;
  /** Flag bitfield. Bit 0 = sponsored fee, bit 1 = sender-only revert (placeholder). */
  flags: number;
  /** Target address (20 bytes) or empty for contract creation. */
  target: Uint8Array;
  /** Gas limit allocated to this frame. */
  gasLimit: bigint;
  /** Value in wei attached to the frame's call. */
  value: bigint;
  /** Calldata or init code. */
  data: Uint8Array;
}

/** A complete Frame Transaction. */
export interface FrameTx {
  chainId: bigint;
  nonce: bigint;
  sender: Uint8Array;
  frames: Frame[];
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  maxFeePerBlobGas: bigint;
  blobVersionedHashes: Uint8Array[];
}

/** Result of executing a single frame inside the simulator. */
export interface FrameResult {
  index: number;
  status: "success" | "revert" | "skipped";
  gasUsed: bigint;
  returnData: Uint8Array;
  error?: string;
}

export interface SimulationResult {
  txHash: Uint8Array;
  totalGasUsed: bigint;
  refund: bigint;
  reverted: boolean;
  frames: FrameResult[];
}
