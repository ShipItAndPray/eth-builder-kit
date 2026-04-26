#!/usr/bin/env node
/**
 * frame-tx CLI.
 *
 *   frame-tx encode <tx.json>          → prints hex
 *   frame-tx decode <hex>              → prints JSON
 *   frame-tx simulate <tx.json>        → prints simulation result
 *   frame-tx gas <tx.json>             → prints intrinsic + total gas
 */

import { readFileSync } from "node:fs";
import {
  bigIntToBytes,
  bytesToHex,
  decodeFrameTx,
  encodeFrameTxHex,
  hexToBytes,
  intrinsicGas,
  simulate,
  totalGasLimit,
} from "./index.js";
import type { Frame, FrameTx } from "./types.js";

function parseTxJson(path: string): FrameTx {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    chainId: BigInt(raw.chainId),
    nonce: BigInt(raw.nonce),
    sender: hexToBytes(raw.sender),
    frames: (raw.frames as any[]).map<Frame>((f) => ({
      mode: Number(f.mode ?? 0),
      flags: Number(f.flags ?? 0),
      target: hexToBytes(f.target ?? "0x"),
      gasLimit: BigInt(f.gasLimit ?? 0),
      value: BigInt(f.value ?? 0),
      data: hexToBytes(f.data ?? "0x"),
    })),
    maxPriorityFeePerGas: BigInt(raw.maxPriorityFeePerGas ?? 0),
    maxFeePerGas: BigInt(raw.maxFeePerGas ?? 0),
    maxFeePerBlobGas: BigInt(raw.maxFeePerBlobGas ?? 0),
    blobVersionedHashes: (raw.blobVersionedHashes ?? []).map((h: string) => hexToBytes(h)),
  };
}

function txToJson(tx: FrameTx) {
  return {
    chainId: tx.chainId.toString(),
    nonce: tx.nonce.toString(),
    sender: bytesToHex(tx.sender),
    frames: tx.frames.map((f) => ({
      mode: f.mode,
      flags: f.flags,
      target: bytesToHex(f.target),
      gasLimit: f.gasLimit.toString(),
      value: f.value.toString(),
      data: bytesToHex(f.data),
    })),
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString(),
    maxFeePerGas: tx.maxFeePerGas.toString(),
    maxFeePerBlobGas: tx.maxFeePerBlobGas.toString(),
    blobVersionedHashes: tx.blobVersionedHashes.map(bytesToHex),
  };
}

const [, , cmd, arg] = process.argv;
function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

switch (cmd) {
  case "encode": {
    if (!arg) fail("usage: frame-tx encode <tx.json>");
    const tx = parseTxJson(arg);
    console.log(encodeFrameTxHex(tx));
    break;
  }
  case "decode": {
    if (!arg) fail("usage: frame-tx decode <hex>");
    const tx = decodeFrameTx(arg);
    console.log(JSON.stringify(txToJson(tx), null, 2));
    break;
  }
  case "gas": {
    if (!arg) fail("usage: frame-tx gas <tx.json>");
    const tx = parseTxJson(arg);
    console.log(JSON.stringify({ intrinsic: intrinsicGas(tx).toString(), total: totalGasLimit(tx).toString() }, null, 2));
    break;
  }
  case "simulate": {
    if (!arg) fail("usage: frame-tx simulate <tx.json>");
    const tx = parseTxJson(arg);
    const r = simulate(tx);
    console.log(JSON.stringify({
      txHash: bytesToHex(r.txHash),
      totalGasUsed: r.totalGasUsed.toString(),
      refund: r.refund.toString(),
      reverted: r.reverted,
      frames: r.frames.map((f) => ({
        index: f.index,
        status: f.status,
        gasUsed: f.gasUsed.toString(),
        returnData: bytesToHex(f.returnData),
        error: f.error,
      })),
    }, null, 2));
    break;
  }
  default:
    console.error("commands: encode | decode | gas | simulate");
    process.exit(2);
}

void bigIntToBytes; // silence unused-import warning if cli grows
