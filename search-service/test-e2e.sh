#!/usr/bin/env bash
# ── Search Service End-to-End Test Script ────────────────────────────────────
# Usage: ./test-e2e.sh [BASE_URL] [HEALTH_URL]
#
# BASE_URL    - search service URL (via BFF /api/search or direct)
# HEALTH_URL  - direct service URL for health probes (k8s-internal)
#
# Prerequisites: curl, jq
# Examples:
#   Direct:      ./test-e2e.sh http://localhost:18083
#   Via BFF:     ./test-e2e.sh http://localhost/api/search http://localhost:18083

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

# ── 1. Basic Search ───────────────────────────────────────────────────────────

blue "\n=== 1. GET /search — basic (no filters) ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/search")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

RESULTS=$(echo "$BODY" | jq -r '.results // empty' 2>/dev/null)
PAGINATION=$(echo "$BODY" | jq -r '.pagination // empty' 2>/dev/null)

assert_status "Basic search" 200 "$HTTP_CODE"
assert_field "results array" "$RESULTS"
assert_field "pagination object" "$PAGINATION"

TOTAL=$(echo "$BODY" | jq -r '.pagination.total // empty' 2>/dev/null)
PAGE=$(echo "$BODY" | jq -r '.pagination.page // empty' 2>/dev/null)
LIMIT=$(echo "$BODY" | jq -r '.pagination.limit // empty' 2>/dev/null)

assert_field "pagination.total" "$TOTAL"
assert_field "pagination.page" "$PAGE"
assert_field "pagination.limit" "$LIMIT"
echo "  → total: $TOTAL  page: $PAGE  limit: $LIMIT"

# ── 2. Status Filter ──────────────────────────────────────────────────────────

blue "\n=== 2. GET /search?status=APPROVED ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/search?status=APPROVED")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "Filter by APPROVED status" 200 "$HTTP_CODE"

# Verify all returned entries are APPROVED
COUNT=$(echo "$BODY" | jq '[.results[] | select(.status != "APPROVED")] | length' 2>/dev/null || echo "0")
assert_eq "All results have APPROVED status" "0" "$COUNT"

blue "\n=== 2b. GET /search?status=PENDING ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/search?status=PENDING")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "Filter by PENDING status" 200 "$HTTP_CODE"

COUNT=$(echo "$BODY" | jq '[.results[] | select(.status != "PENDING")] | length' 2>/dev/null || echo "0")
assert_eq "All results have PENDING status" "0" "$COUNT"

# ── 3. Field Filters ──────────────────────────────────────────────────────────

blue "\n=== 3. GET /search — field filters ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search?role=Software+Engineer")
assert_status "Filter by role" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search?country=LK")
assert_status "Filter by country" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search?company=Google")
assert_status "Filter by company" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search?experience_level=senior")
assert_status "Filter by experience_level" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search?query=engineer")
assert_status "Free-text query" 200 "$STATUS"

# ── 4. Pagination ─────────────────────────────────────────────────────────────

blue "\n=== 4. GET /search — pagination ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/search?page=1&limit=5")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "Paginated search (page=1 limit=5)" 200 "$HTTP_CODE"

RETURNED=$(echo "$BODY" | jq '.results | length' 2>/dev/null || echo "-1")
if [ "$RETURNED" -le 5 ] 2>/dev/null; then
  green "  ✓ Result count ($RETURNED) respects limit of 5"
  PASS=$((PASS + 1))
else
  red "  ✗ Result count ($RETURNED) exceeds limit of 5"
  FAIL=$((FAIL + 1))
fi

RESP_LIMIT=$(echo "$BODY" | jq -r '.pagination.limit // empty' 2>/dev/null)
assert_eq "pagination.limit reflects request" "5" "$RESP_LIMIT"

RESP_PAGE=$(echo "$BODY" | jq -r '.pagination.page // empty' 2>/dev/null)
assert_eq "pagination.page reflects request" "1" "$RESP_PAGE"

# ── 4b. Limit clamped to 100 ─────────────────────────────────────────────────

blue "\n=== 4b. GET /search?limit=999 — clamped to 100 ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/search?limit=999")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Over-limit request clamped" 200 "$HTTP_CODE"

CLAMPED=$(echo "$BODY" | jq -r '.pagination.limit // empty' 2>/dev/null)
if [ "$CLAMPED" -le 100 ] 2>/dev/null; then
  green "  ✓ Limit clamped to $CLAMPED (≤ 100)"
  PASS=$((PASS + 1))
else
  red "  ✗ Limit not clamped: $CLAMPED"
  FAIL=$((FAIL + 1))
fi

# ── 5. Result Shape ───────────────────────────────────────────────────────────

blue "\n=== 5. Result shape validation ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/search?limit=1")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Fetch single result for shape check" 200 "$HTTP_CODE"

RESULT_COUNT=$(echo "$BODY" | jq '.results | length' 2>/dev/null || echo "0")

if [ "$RESULT_COUNT" -gt 0 ]; then
  FIRST=$(echo "$BODY" | jq '.results[0]' 2>/dev/null)
  assert_field "id field"     "$(echo "$FIRST" | jq -r '.id // empty')"
  assert_field "role field"   "$(echo "$FIRST" | jq -r '.role // empty')"
  assert_field "status field" "$(echo "$FIRST" | jq -r '.status // empty')"
  assert_field "upvotes field" "$(echo "$FIRST" | jq '.upvotes // empty')"
  echo "  → Sample: role=$(echo "$FIRST" | jq -r '.role') status=$(echo "$FIRST" | jq -r '.status') upvotes=$(echo "$FIRST" | jq '.upvotes')"
else
  green "  ✓ No results in DB yet — shape check skipped (run workflow test to populate)"
  PASS=$((PASS + 1))
fi

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
