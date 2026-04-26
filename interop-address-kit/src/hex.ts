export type Hex = `0x${string}`;

export function isHex(s: string): s is Hex {
  return /^0x[0-9a-fA-F]*$/.test(s);
}

export function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (s.length % 2 !== 0) throw new Error(`hex has odd length: ${hex}`);
  if (!/^[0-9a-fA-F]*$/.test(s)) throw new Error(`invalid hex: ${hex}`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): Hex {
  let s = "0x";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s as Hex;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function u16BE(n: number): Uint8Array {
  if (n < 0 || n > 0xffff || !Number.isInteger(n))
    throw new Error(`u16 out of range: ${n}`);
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}

export function readU16BE(b: Uint8Array, off: number): number {
  if (off + 2 > b.length) throw new Error("readU16BE: out of bounds");
  return (b[off] << 8) | b[off + 1];
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
