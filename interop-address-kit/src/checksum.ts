/**
 * ERC-7828 §Checksum.
 *
 * The current draft pins the checksum as the first 4 bytes of keccak256(canonical-binary)
 * displayed as 8 uppercase hex characters. Until the spec hardens, this implementation:
 *   - computes the checksum from the canonical ERC-7930 binary form
 *   - uses keccak256 (Ethereum's hash) over the binary bytes
 *   - returns 8 uppercase hex characters
 *
 * Verification accepts uppercase or lowercase 8-hex-char checksums.
 *
 * NOTE [LOW confidence]: the exact pre-image of the checksum hash is not
 * pinned in the public ERC-7828 draft. We document our choice and provide
 * a hook (`computeChecksum`) callers may override.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { hexToBytes } from "./hex.js";

const keccak256 = (b: Uint8Array): Uint8Array => keccak_256(b);

export function computeChecksum(binaryHex: string): string {
  const b = hexToBytes(binaryHex);
  const h = keccak256(b);
  let out = "";
  for (let i = 0; i < 4; i++) out += h[i].toString(16).padStart(2, "0");
  return out.toUpperCase();
}

export function isValidChecksumString(s: string): boolean {
  return /^[0-9a-fA-F]{8}$/.test(s);
}
