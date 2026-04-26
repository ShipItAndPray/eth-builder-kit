/**
 * Minimal base58 (Bitcoin alphabet) encoder/decoder.
 * Used by the Solana CAIP-350 profile.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58n;

const ALPHABET_MAP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) ALPHABET_MAP[ALPHABET[i]] = i;

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  // Count leading zeros
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);

  let out = "";
  while (n > 0n) {
    const r = n % BASE;
    out = ALPHABET[Number(r)] + out;
    n = n / BASE;
  }
  for (let i = 0; i < zeros; i++) out = ALPHABET[0] + out;
  return out;
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array();
  let zeros = 0;
  while (zeros < str.length && str[zeros] === ALPHABET[0]) zeros++;

  let n = 0n;
  for (const c of str) {
    const v = ALPHABET_MAP[c];
    if (v === undefined) throw new Error(`invalid base58 character: ${c}`);
    n = n * BASE + BigInt(v);
  }

  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (let i = 0; i < zeros; i++) bytes.unshift(0);
  return new Uint8Array(bytes);
}
