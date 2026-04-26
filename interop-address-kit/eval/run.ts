/**
 * Binary pass/fail eval harness for interop-address-kit.
 * Outputs JSONL on stdout (one record per case) plus a summary line.
 * Exit code is 0 if all pass, 1 otherwise — autoresearch uses this signal.
 */

import {
  decode,
  encode,
  parseText,
  formatText,
  resolveParsed,
} from "../src/index.js";
import cases from "./cases.json" with { type: "json" };

interface CaseResult {
  group: string;
  name: string;
  ok: boolean;
  error?: string;
}

const results: CaseResult[] = [];

function record(group: string, name: string, fn: () => void) {
  try {
    fn();
    results.push({ group, name, ok: true });
  } catch (e: any) {
    results.push({ group, name, ok: false, error: String(e?.message ?? e) });
  }
}

// ---- binaryRoundtrip
for (const c of cases.binaryRoundtrip) {
  record("binaryRoundtrip", c.name, () => {
    const decoded = decode(c.hex);
    if (decoded.version !== c.version) throw new Error(`version: ${decoded.version} != ${c.version}`);
    if (decoded.chainType !== c.chainType)
      throw new Error(`chainType: ${decoded.chainType} != ${c.chainType}`);
    if (c.caip2 !== undefined && decoded.caip2 !== c.caip2)
      throw new Error(`caip2: '${decoded.caip2}' != '${c.caip2}'`);
    if (c.address !== undefined && decoded.addressString.toLowerCase() !== c.address.toLowerCase())
      throw new Error(`address: ${decoded.addressString} != ${c.address}`);
    // Re-encode and check it equals input.
    const reHex = encode({ caip2: decoded.caip2, address: decoded.addressString, chainType: decoded.chainType });
    if (reHex.toLowerCase() !== c.hex.toLowerCase())
      throw new Error(`re-encode mismatch: ${reHex} != ${c.hex}`);
  });
}

// ---- encodeFromCaip2
for (const c of cases.encodeFromCaip2) {
  record("encodeFromCaip2", c.name, () => {
    const out = encode({ caip2: c.caip2, address: c.address, chainType: (c as any).chainType });
    if (out.toLowerCase() !== c.expectedHex.toLowerCase())
      throw new Error(`encode: ${out} != ${c.expectedHex}`);
  });
}

// ---- textParse
for (const c of cases.textParse) {
  record("textParse", c.name, () => {
    const r = parseText(c.input);
    if (r.addressPart !== c.addressPart)
      throw new Error(`addressPart: ${r.addressPart} != ${c.addressPart}`);
    if (r.caip2 !== c.caip2) throw new Error(`caip2: ${r.caip2} != ${c.caip2}`);
    if (r.isEns !== c.isEns) throw new Error(`isEns: ${r.isEns} != ${c.isEns}`);
    if (!!r.checksum !== c.hasChecksum)
      throw new Error(`checksum present mismatch: ${!!r.checksum} != ${c.hasChecksum}`);
  });
}

// ---- textRoundtrip
for (const c of cases.textRoundtrip) {
  record("textRoundtrip", c.name, () => {
    const text = formatText({ caip2: c.caip2, address: c.address, humanLabel: (c as any).humanLabel });
    const parsed = parseText(text);
    if (parsed.caip2 !== c.caip2)
      throw new Error(`text parse caip2: ${parsed.caip2} != ${c.caip2}`);
    const decoded = resolveParsed(parsed);
    if (decoded.addressString.toLowerCase() !== c.address.toLowerCase())
      throw new Error(`text resolve addr: ${decoded.addressString} != ${c.address}`);
    if (decoded.caip2 !== c.caip2)
      throw new Error(`text resolve caip2: ${decoded.caip2} != ${c.caip2}`);
  });
}

// ---- negative
for (const c of cases.negative) {
  record("negative", c.name, () => {
    let threw = false;
    try {
      if ((c as any).hex) decode((c as any).hex);
      else if ((c as any).input) {
        const p = parseText((c as any).input);
        // for some negatives we need to call resolveParsed too
        resolveParsed(p);
      }
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected error, none thrown");
  });
}

for (const r of results) console.log(JSON.stringify(r));
const passed = results.filter((r) => r.ok).length;
const total = results.length;
const failed = total - passed;
console.log(JSON.stringify({ summary: true, passed, failed, total, score: passed / total }));
process.exit(failed === 0 ? 0 : 1);
