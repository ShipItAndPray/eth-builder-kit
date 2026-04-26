/**
 * ERC-7828 text format.
 *
 * Grammar (per draft):
 *   <interoperable-name> ::= <address> "@" <chain> [ "#" <checksum> ]
 *
 *   <address>  := raw chain-native address  | <ens-name>
 *   <chain>    := <caip-2>                  | <human-label>
 *   <caip-2>   := namespace ":" reference   (contains ":")
 *   <checksum> := 8 hex characters (case-insensitive)
 *
 * Examples:
 *   0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7@eip155:1#80B12379
 *   alice.eth@ethereum
 *   wallet.ensdao.eth@ethereum
 */

import { decode, encode, type InteropDecoded } from "./binary.js";
import {
  HUMAN_CHAIN_LABELS,
  PROFILES_BY_NAMESPACE,
  profileForNamespace,
} from "./chain-types.js";
import { computeChecksum, isValidChecksumString } from "./checksum.js";

export interface TextParseResult {
  /** Raw address part exactly as it appeared (could be ENS name). */
  addressPart: string;
  /** True if addressPart looks like an ENS name (contains a dot, no 0x). */
  isEns: boolean;
  /** Chain identifier as it appeared (CAIP-2 or human label). */
  chainPart: string;
  /** Resolved CAIP-2 if chainPart was a known human label, else echo of CAIP-2. */
  caip2: string;
  /** Optional checksum string from the input (uppercase). May be undefined. */
  checksum?: string;
}

const NAME_RE = /^([^@]+)@([^#]+)(?:#([0-9a-fA-F]{8}))?$/;

export function parseText(s: string): TextParseResult {
  const m = s.match(NAME_RE);
  if (!m) throw new Error(`invalid ERC-7828 address: ${s}`);
  const [, addressPart, chainPartRaw, checksum] = m;
  const chainPart = chainPartRaw.trim();
  const caip2 = chainPart.includes(":")
    ? chainPart
    : HUMAN_CHAIN_LABELS[chainPart.toLowerCase()] ??
      (() => {
        throw new Error(`unknown human chain label: ${chainPart}`);
      })();
  const isEns = !addressPart.startsWith("0x") && addressPart.includes(".");
  return {
    addressPart,
    isEns,
    chainPart,
    caip2,
    checksum: checksum ? checksum.toUpperCase() : undefined,
  };
}

/**
 * Encode a CAIP-2 + raw address pair into ERC-7828 text form, with checksum.
 * Does not perform ENS reverse resolution; pass the raw chain-native address.
 */
export function formatText(args: {
  caip2: string;
  address: string;
  /** Optional human chain label preference (e.g. "ethereum" instead of "eip155:1"). */
  humanLabel?: string;
  /** If true, append #<checksum>; default true. */
  withChecksum?: boolean;
}): string {
  const colon = args.caip2.indexOf(":");
  if (colon < 0) throw new Error(`invalid CAIP-2: ${args.caip2}`);
  const ns = args.caip2.slice(0, colon);
  if (!PROFILES_BY_NAMESPACE[ns]) {
    throw new Error(`unsupported CAIP namespace: ${ns}`);
  }
  const chainPart = args.humanLabel ?? args.caip2;
  const base = `${args.address}@${chainPart}`;
  if (args.withChecksum === false) return base;

  // Checksum is computed over the canonical binary form regardless of
  // whether the text uses a human label.
  const binaryHex = encode({ caip2: args.caip2, address: args.address });
  const cs = computeChecksum(binaryHex);
  return `${base}#${cs}`;
}

/** Resolve a parsed text address into the binary-decoded form. ENS names cannot be resolved here. */
export function resolveParsed(parsed: TextParseResult): InteropDecoded {
  if (parsed.isEns) {
    throw new Error(
      `address part is an ENS name (${parsed.addressPart}); resolve via ENSIP-24 then call resolveParsed again with the resolved 0x… address`,
    );
  }
  const binaryHex = encode({ caip2: parsed.caip2, address: parsed.addressPart });
  if (parsed.checksum) {
    const expected = computeChecksum(binaryHex);
    if (expected.toUpperCase() !== parsed.checksum.toUpperCase()) {
      throw new Error(`checksum mismatch: expected ${expected}, got ${parsed.checksum}`);
    }
  }
  return decode(binaryHex);
}

export { isValidChecksumString };
