/**
 * ERC-7930 binary encoding.
 *
 * Wire format:
 *   Version (2 BE) | ChainType (2 BE) | ChainRefLen (1) | ChainRef (var) | AddrLen (1) | Addr (var)
 */

import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  readU16BE,
  u16BE,
  type Hex,
} from "./hex.js";
import {
  PROFILES_BY_ID,
  profileForId,
  profileForNamespace,
  type ChainTypeProfile,
} from "./chain-types.js";

export const ERC7930_VERSION = 0x0001;

/** Decoded interoperable address with raw byte components. */
export interface InteropBinary {
  version: number;
  chainType: number;
  chainRef: Uint8Array;
  address: Uint8Array;
}

/** Higher-level decoded form, normalised through the chain-type profile. */
export interface InteropDecoded extends InteropBinary {
  /** CAIP-2 chain id, e.g. "eip155:1" or "solana:<genesis>". May be empty if no chain ref. */
  caip2: string;
  /** Canonical address string per chain (0x… for EVM, base58 for Solana). May be empty. */
  addressString: string;
  profile: ChainTypeProfile;
}

export function encodeBinary(parts: InteropBinary): Hex {
  if (parts.version > 0xffff || parts.version < 0) throw new Error("version out of range");
  if (parts.chainType > 0xffff || parts.chainType < 0) throw new Error("chainType out of range");
  if (parts.chainRef.length > 0xff) throw new Error("chainRef length exceeds 255 bytes");
  if (parts.address.length > 0xff) throw new Error("address length exceeds 255 bytes");

  return bytesToHex(
    concatBytes(
      u16BE(parts.version),
      u16BE(parts.chainType),
      new Uint8Array([parts.chainRef.length]),
      parts.chainRef,
      new Uint8Array([parts.address.length]),
      parts.address,
    ),
  );
}

export function decodeBinary(input: Hex | string | Uint8Array): InteropBinary {
  const bytes = input instanceof Uint8Array ? input : hexToBytes(input);
  if (bytes.length < 6) throw new Error("interop address too short");
  const version = readU16BE(bytes, 0);
  const chainType = readU16BE(bytes, 2);
  const chainRefLen = bytes[4];
  const chainRefStart = 5;
  const chainRefEnd = chainRefStart + chainRefLen;
  if (chainRefEnd + 1 > bytes.length) throw new Error("truncated: chainRef overruns");
  const chainRef = bytes.slice(chainRefStart, chainRefEnd);
  const addrLen = bytes[chainRefEnd];
  const addrStart = chainRefEnd + 1;
  const addrEnd = addrStart + addrLen;
  if (addrEnd > bytes.length) throw new Error("truncated: address overruns");
  if (addrEnd < bytes.length) throw new Error("trailing bytes after address");
  const address = bytes.slice(addrStart, addrEnd);
  return { version, chainType, chainRef, address };
}

/** Decode and resolve into CAIP-2 + canonical address strings. */
export function decode(input: Hex | string | Uint8Array): InteropDecoded {
  const bin = decodeBinary(input);
  if (bin.version !== ERC7930_VERSION) {
    throw new Error(`unsupported ERC-7930 version: 0x${bin.version.toString(16).padStart(4, "0")}`);
  }
  const profile = profileForId(bin.chainType);
  const chainRefStr = bin.chainRef.length === 0 ? "" : profile.decodeChainRef(bin.chainRef);
  const caip2 = chainRefStr === "" ? "" : `${profile.namespace}:${chainRefStr}`;
  const addressString = bin.address.length === 0 ? "" : profile.decodeAddress(bin.address);
  return { ...bin, caip2, addressString, profile };
}

/** Encode from CAIP-2 chain id + chain-native address string. Either may be empty. */
export function encode(input: { caip2?: string; address?: string; chainType?: number }): Hex {
  let profile: ChainTypeProfile;
  let chainRef = new Uint8Array();
  let address = new Uint8Array();

  if (input.caip2 && input.caip2.length > 0) {
    const colon = input.caip2.indexOf(":");
    if (colon < 0) throw new Error(`invalid CAIP-2: ${input.caip2}`);
    const ns = input.caip2.slice(0, colon);
    const ref = input.caip2.slice(colon + 1);
    profile = profileForNamespace(ns);
    chainRef = profile.encodeChainRef(ref);
  } else if (input.chainType !== undefined) {
    profile = profileForId(input.chainType);
  } else {
    throw new Error("encode requires caip2 or chainType");
  }

  if (input.address && input.address.length > 0) {
    address = profile.encodeAddress(input.address);
  }

  return encodeBinary({
    version: ERC7930_VERSION,
    chainType: profile.chainTypeId,
    chainRef,
    address,
  });
}
