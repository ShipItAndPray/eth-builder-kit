import { RLP } from "@ethereumjs/rlp";
import { keccak_256 } from "@noble/hashes/sha3";

import {
  FRAME_TX_INTRINSIC_COST,
  FRAME_TX_PER_FRAME_COST,
  FRAME_TX_TYPE,
  type Frame,
  type FrameTx,
} from "./types.js";
import { bigIntToBytes, bytesToBigInt, bytesToHex, concatBytes, hexToBytes, type Hex } from "./hex.js";

type RLPInput = Parameters<typeof RLP.encode>[0];

function frameToRLPInput(f: Frame): RLPInput {
  return [
    bigIntToBytes(BigInt(f.mode)),
    bigIntToBytes(BigInt(f.flags)),
    f.target,
    bigIntToBytes(f.gasLimit),
    bigIntToBytes(f.value),
    f.data,
  ];
}

function frameFromRLP(items: RLPInput): Frame {
  const arr = items as Uint8Array[];
  if (!Array.isArray(arr) || arr.length !== 6)
    throw new Error(`frame must be 6 items, got ${(arr as any)?.length}`);
  return {
    mode: Number(bytesToBigInt(arr[0])),
    flags: Number(bytesToBigInt(arr[1])),
    target: arr[2],
    gasLimit: bytesToBigInt(arr[3]),
    value: bytesToBigInt(arr[4]),
    data: arr[5],
  };
}

export function encodeFrameTx(tx: FrameTx): Uint8Array {
  const payload: RLPInput = [
    bigIntToBytes(tx.chainId),
    bigIntToBytes(tx.nonce),
    tx.sender,
    tx.frames.map(frameToRLPInput),
    bigIntToBytes(tx.maxPriorityFeePerGas),
    bigIntToBytes(tx.maxFeePerGas),
    bigIntToBytes(tx.maxFeePerBlobGas),
    tx.blobVersionedHashes,
  ];
  const rlp = RLP.encode(payload);
  return concatBytes(new Uint8Array([FRAME_TX_TYPE]), rlp);
}

export function encodeFrameTxHex(tx: FrameTx): Hex {
  return bytesToHex(encodeFrameTx(tx));
}

export function decodeFrameTx(input: Uint8Array | string): FrameTx {
  const bytes = typeof input === "string" ? hexToBytes(input) : input;
  if (bytes.length === 0) throw new Error("empty input");
  if (bytes[0] !== FRAME_TX_TYPE)
    throw new Error(`expected tx type 0x06, got 0x${bytes[0].toString(16).padStart(2, "0")}`);
  const decoded = RLP.decode(bytes.subarray(1)) as RLPInput;
  if (!Array.isArray(decoded) || decoded.length !== 8)
    throw new Error(`payload must have 8 fields, got ${(decoded as any)?.length}`);
  const [chainId, nonce, sender, framesRaw, maxPrio, maxFee, maxBlobFee, blobHashes] =
    decoded as Uint8Array[] & RLPInput[];
  const frames = (framesRaw as unknown as RLPInput[]).map(frameFromRLP);
  return {
    chainId: bytesToBigInt(chainId as Uint8Array),
    nonce: bytesToBigInt(nonce as Uint8Array),
    sender: sender as Uint8Array,
    frames,
    maxPriorityFeePerGas: bytesToBigInt(maxPrio as Uint8Array),
    maxFeePerGas: bytesToBigInt(maxFee as Uint8Array),
    maxFeePerBlobGas: bytesToBigInt(maxBlobFee as Uint8Array),
    blobVersionedHashes: blobHashes as unknown as Uint8Array[],
  };
}

export function frameTxHash(tx: FrameTx): Uint8Array {
  return keccak_256(encodeFrameTx(tx));
}

/**
 * EIP-2028 calldata cost: 4 gas per zero byte, 16 gas per non-zero byte.
 * Applied to RLP(frames) per the EIP-8141 gas formula.
 */
export function calldataCost(bytes: Uint8Array): bigint {
  let cost = 0n;
  for (const b of bytes) cost += b === 0 ? 4n : 16n;
  return cost;
}

export function intrinsicGas(tx: FrameTx): bigint {
  const framesRlp = RLP.encode(tx.frames.map(frameToRLPInput));
  return (
    FRAME_TX_INTRINSIC_COST +
    BigInt(tx.frames.length) * FRAME_TX_PER_FRAME_COST +
    calldataCost(framesRlp)
  );
}

/** Total gas limit for the tx: intrinsic + sum(frame.gasLimit). */
export function totalGasLimit(tx: FrameTx): bigint {
  let s = intrinsicGas(tx);
  for (const f of tx.frames) s += f.gasLimit;
  return s;
}
