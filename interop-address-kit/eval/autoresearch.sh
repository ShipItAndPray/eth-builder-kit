#!/usr/bin/env bash
# autoresearch driver for interop-address-kit
# - runs eval + fuzz across N seeds
# - exits 0 if all pass, 1 if any fail (signal for an outer loop)
# - writes a one-line JSON summary to .iter-log.jsonl per invocation
set -uo pipefail

cd "$(dirname "$0")/.."
SEEDS="${SEEDS:-1 42 1337 9999 31337}"
N="${FUZZ_N:-300}"

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
total_pass=0; total_fail=0; total_total=0

# 1. spec vectors
out=$(npx tsx eval/run.ts 2>/dev/null | tail -1)
p=$(echo "$out" | sed -n 's/.*"passed":\([0-9]*\).*/\1/p')
f=$(echo "$out" | sed -n 's/.*"failed":\([0-9]*\).*/\1/p')
t=$(echo "$out" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
total_pass=$((total_pass + p)); total_fail=$((total_fail + f)); total_total=$((total_total + t))

# 2. multi-seed fuzz
for seed in $SEEDS; do
  out=$(FUZZ_SEED=$seed FUZZ_N=$N npx tsx eval/fuzz.ts 2>/dev/null | tail -1)
  p=$(echo "$out" | sed -n 's/.*"passed":\([0-9]*\).*/\1/p')
  f=$(echo "$out" | sed -n 's/.*"failed":\([0-9]*\).*/\1/p')
  t=$(echo "$out" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
  total_pass=$((total_pass + p)); total_fail=$((total_fail + f)); total_total=$((total_total + t))
done

if [ "$total_total" -eq 0 ]; then
  echo "{\"ts\":\"$ts\",\"error\":\"no eval output\"}" >> .iter-log.jsonl
  exit 1
fi

score=$(awk "BEGIN{printf \"%.6f\", $total_pass / $total_total}")
echo "{\"ts\":\"$ts\",\"passed\":$total_pass,\"failed\":$total_fail,\"total\":$total_total,\"score\":$score}" \
  | tee -a .iter-log.jsonl
[ "$total_fail" -eq 0 ]
