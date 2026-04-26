/**
 * CASA ChainType registry (subset).
 *
 * ERC-7930 §"ChainType" defers to CAIP-350 namespace profiles for the exact
 * semantics of ChainReference and Address per chain type. We only encode here
 * the ChainType *identifiers* required for the namespaces we support.
 *
 * Confirmed by ERC-7930 test vectors:
 *   0x0000 — EVM (eip155 namespace)
 *   0x0002 — Solana
 *
 * Other namespaces are listed for forward-compatibility but their exact
 * (chainRef, address) layout MUST follow the corresponding CAIP-350 profile
 * before being used in production.
 */

export type CaipNamespace = "eip155" | "solana" | "bip122" | "cosmos";

export interface ChainTypeProfile {
  namespace: CaipNamespace | string;
  chainTypeId: number; // 16-bit value used in ERC-7930 ChainType field
  /** Encode CAIP-2 chain reference string into bytes per CAIP-350 profile. */
  encodeChainRef: (ref: string) => Uint8Array;
  /** Decode the bytes back to CAIP-2 chain reference string. */
  decodeChainRef: (bytes: Uint8Array) => string;
  /** Encode account address (string in canonical chain form) to bytes. */
  encodeAddress: (addr: string) => Uint8Array;
  /** Decode address bytes back to canonical chain string form. */
  decodeAddress: (bytes: Uint8Array) => string;
}

import { hexToBytes, bytesToHex } from "./hex.js";
import { base58Decode, base58Encode } from "./base58.js";

/** EIP-155 (EVM): chain reference is a decimal chain id encoded as minimal big-endian unsigned bytes. */
function encodeEvmChainRef(ref: string): Uint8Array {
  const id = BigInt(ref);
  if (id < 0n) throw new Error("eip155 chain id must be non-negative");
  if (id === 0n) return new Uint8Array([0]);
  // minimal big-endian
  const out: number[] = [];
  let v = id;
  while (v > 0n) {
    out.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return new Uint8Array(out);
}
function decodeEvmChainRef(bytes: Uint8Array): string {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v.toString();
}

const EVM: ChainTypeProfile = {
  namespace: "eip155",
  chainTypeId: 0x0000,
  encodeChainRef: encodeEvmChainRef,
  decodeChainRef: decodeEvmChainRef,
  encodeAddress: (addr: string) => {
    const bytes = hexToBytes(addr);
    if (bytes.length !== 20) throw new Error(`evm address must be 20 bytes, got ${bytes.length}`);
    return bytes;
  },
  decodeAddress: (bytes: Uint8Array) => bytesToHex(bytes),
};

const SOLANA: ChainTypeProfile = {
  namespace: "solana",
  chainTypeId: 0x0002,
  encodeChainRef: (ref: string) => {
    // Solana chain ref is the genesis block hash (base58, 32 bytes).
    const b = base58Decode(ref);
    if (b.length !== 32) throw new Error(`solana chain ref must be 32 bytes, got ${b.length}`);
    return b;
  },
  decodeChainRef: (bytes: Uint8Array) => base58Encode(bytes),
  encodeAddress: (addr: string) => {
    const b = base58Decode(addr);
    if (b.length !== 32) throw new Error(`solana address must be 32 bytes, got ${b.length}`);
    return b;
  },
  decodeAddress: (bytes: Uint8Array) => base58Encode(bytes),
};

export const PROFILES_BY_ID: Record<number, ChainTypeProfile> = {
  0x0000: EVM,
  0x0002: SOLANA,
};

export const PROFILES_BY_NAMESPACE: Record<string, ChainTypeProfile> = {
  eip155: EVM,
  solana: SOLANA,
};

/** Look up a profile by ChainType id, throwing if unknown. */
export function profileForId(id: number): ChainTypeProfile {
  const p = PROFILES_BY_ID[id];
  if (!p) throw new Error(`unknown ChainType id: 0x${id.toString(16).padStart(4, "0")}`);
  return p;
}

/** Look up a profile by CAIP-2 namespace string, throwing if unknown. */
export function profileForNamespace(ns: string): ChainTypeProfile {
  const p = PROFILES_BY_NAMESPACE[ns];
  if (!p) throw new Error(`unsupported CAIP namespace: ${ns}`);
  return p;
}

/**
 * Map a human-readable chain label (e.g. "ethereum", "bitcoin", "solana")
 * to a CAIP-2 chain id. Only the most common are pinned; production
 * implementations should resolve via on.eth ENSIP-24 instead.
 */
export const HUMAN_CHAIN_LABELS: Record<string, string> = {
  ethereum: "eip155:1",
  mainnet: "eip155:1",
  sepolia: "eip155:11155111",
  optimism: "eip155:10",
  base: "eip155:8453",
  arbitrum: "eip155:42161",
  polygon: "eip155:137",
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc6wjsXaJqY", // Solana mainnet beta genesis hash (base58)
};
