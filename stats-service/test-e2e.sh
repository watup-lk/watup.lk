#!/usr/bin/env bash
# ── Stats Service End-to-End Test Script ─────────────────────────────────────
# Usage: ./test-e2e.sh [BASE_URL] [HEALTH_URL]
#
# BASE_URL    - stats service URL (via BFF /api or direct)
# HEALTH_URL  - direct service URL for health probes (k8s-internal)
#
# Prerequisites: curl, jq
# Examples:
#   Direct:      ./test-e2e.sh http://localhost:18084
#   Via BFF:     ./test-e2e.sh http://localhost/api http://localhost:18084

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
HEALTH_URL="${2:-$BASE_URL}"
PASS=0
FAIL=0

green() { echo -e "\033[32m$*\033[0m"; }
red()   { echo -e "\033[31m$*\033[0m"; }
blue()  { echo -e "\033[34m$*\033[0m"; }

assert_status() {
  local test_name="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    green "  ✓ $test_name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "  ✗ $test_name — expected HTTP $expected, got HTTP $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_field() {
  local test_name="$1" value="$2"
  if [ -n "$value" ] && [ "$value" != "null" ]; then
    green "  ✓ $test_name present"
    PASS=$((PASS + 1))
  else
    red "  ✗ $test_name missing or null"
    FAIL=$((FAIL + 1))
  fi
}

assert_eq() {
  local test_name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    green "  ✓ $test_name"
    PASS=$((PASS + 1))
  else
    red "  ✗ $test_name — expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

# ── 0. Health Probes ──────────────────────────────────────────────────────────

blue "\n=== 0. Health Probes (direct: $HEALTH_URL) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL/health/live")
assert_status "GET /health/live" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL/health/ready")
assert_status "GET /health/ready" 200 "$STATUS"

# ── 1. Stats Endpoint ─────────────────────────────────────────────────────────

blue "\n=== 1. GET /stats — no filters ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/stats")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "GET /stats" 200 "$HTTP_CODE"
IS_ARRAY=$(echo "$BODY" | jq -e '. | type == "array"' 2>/dev/null && echo "true" || echo "false")
assert_eq "Response is a JSON array" "true" "$IS_ARRAY"

COUNT=$(echo "$BODY" | jq 'length' 2>/dev/null || echo "0")
echo "  → ${COUNT} role group(s) returned"

if [ "$COUNT" -gt 0 ]; then
  FIRST=$(echo "$BODY" | jq '.[0]' 2>/dev/null)
  assert_field "role field"             "$(echo "$FIRST" | jq -r '.role // empty')"
  assert_field "averageSalaryLKR field" "$(echo "$FIRST" | jq '.averageSalaryLKR // empty')"
  assert_field "medianSalaryLKR field"  "$(echo "$FIRST" | jq '.medianSalaryLKR // empty')"
  assert_field "p25SalaryLKR field"     "$(echo "$FIRST" | jq '.p25SalaryLKR // empty')"
  assert_field "p75SalaryLKR field"     "$(echo "$FIRST" | jq '.p75SalaryLKR // empty')"
  assert_field "count field"            "$(echo "$FIRST" | jq '.count // empty')"
  echo "  → role=$(echo "$FIRST" | jq -r '.role') median=$(echo "$FIRST" | jq '.medianSalaryLKR') count=$(echo "$FIRST" | jq '.count')"
else
  green "  ✓ No approved entries yet — run workflow test to populate"
  PASS=$((PASS + 1))
fi

# ── 2. Stats with Filters ─────────────────────────────────────────────────────

blue "\n=== 2. GET /stats — with country filter ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/stats?country=LK")
assert_status "GET /stats?country=LK" 200 "$STATUS"

blue "\n=== 2b. GET /stats — with role filter ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/stats?role=Software+Engineer")
assert_status "GET /stats?role=Software+Engineer" 200 "$STATUS"

blue "\n=== 2c. GET /stats — country + role combined ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/stats?country=LK&role=Software+Engineer")
assert_status "GET /stats?country=LK&role=Software+Engineer" 200 "$STATUS"

# ── 3. Analytics Endpoint ─────────────────────────────────────────────────────

blue "\n=== 3. GET /analytics — full analytics payload ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/analytics")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "GET /analytics" 200 "$HTTP_CODE"

assert_field "medianSalaryLKR"  "$(echo "$BODY" | jq '.medianSalaryLKR // empty')"
assert_field "p25SalaryLKR"     "$(echo "$BODY" | jq '.p25SalaryLKR // empty')"
assert_field "p75SalaryLKR"     "$(echo "$BODY" | jq '.p75SalaryLKR // empty')"
assert_field "approvedEntries"  "$(echo "$BODY" | jq '.approvedEntries // empty')"
assert_field "byRole array"     "$(echo "$BODY" | jq '.byRole // empty')"
assert_field "byCompany array"  "$(echo "$BODY" | jq '.byCompany // empty')"
assert_field "trend array"      "$(echo "$BODY" | jq '.trend // empty')"
assert_field "byExperience array" "$(echo "$BODY" | jq '.byExperience // empty')"

TREND_LENGTH=$(echo "$BODY" | jq '.trend | length' 2>/dev/null || echo "0")
assert_eq "trend has 12 months" "12" "$TREND_LENGTH"

echo "  → approvedEntries: $(echo "$BODY" | jq '.approvedEntries')"
echo "  → medianSalaryLKR: $(echo "$BODY" | jq '.medianSalaryLKR')"

# ── 4. Analytics with Filters ─────────────────────────────────────────────────

blue "\n=== 4. GET /analytics — with filters ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/analytics?country=LK")
assert_status "GET /analytics?country=LK" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/analytics?role=Software+Engineer")
assert_status "GET /analytics?role=Software+Engineer" 200 "$STATUS"

CURRENT_YEAR=$(date +%Y)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/analytics?year=${CURRENT_YEAR}")
assert_status "GET /analytics?year=${CURRENT_YEAR}" 200 "$STATUS"

# ── Summary ───────────────────────────────────────────────────────────────────

blue "\n=== Test Summary ==="
echo "  Tests passed: $PASS"
echo "  Tests failed: $FAIL"
echo "  Total:        $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
  red "\nSome tests FAILED."
  exit 1
else
  green "\nAll tests PASSED."
  exit 0
fi
