#!/usr/bin/env bash
# ── BFF End-to-End Test Script ────────────────────────────────────────────────
# Tests the BFF as the single external entry point: routing, auth enforcement,
# and proxying to upstream services.
#
# Usage: ./test-e2e.sh [BFF_URL] [AUTH_URL] [HEALTH_URL]
#
# BFF_URL     - BFF base URL (default: http://localhost/api)
# AUTH_URL    - identity service base URL for obtaining a test JWT
#               (default: http://localhost/auth)
# HEALTH_URL  - direct BFF service URL for health probes (k8s-internal)
#               (default: http://localhost:18086)
#
# Prerequisites: curl, jq
# Example (local k8s via ingress):
#   ./test-e2e.sh http://localhost/api http://localhost/auth http://localhost:18086

set -euo pipefail

BFF_URL="${1:-http://localhost/api}"
AUTH_URL="${2:-http://localhost/auth}"
HEALTH_URL="${3:-http://localhost:18086}"
PASS=0
FAIL=0

TIMESTAMP=$(date +%s)
TEST_EMAIL="bff_test_${TIMESTAMP}@example.com"
TEST_PASSWORD="TestPass99"

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

# ── 0. Health Probes ──────────────────────────────────────────────────────────

blue "\n=== 0. Health Probes (direct: $HEALTH_URL) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL/health/live")
assert_status "GET /health/live" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL/health/ready")
assert_status "GET /health/ready" 200 "$STATUS"

# ── 1. Obtain JWT via identity service ───────────────────────────────────────

blue "\n=== 1. Obtain JWT for auth-required tests ==="

curl -s -o /dev/null -X POST "$AUTH_URL/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"BFF Tester\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

RESPONSE=$(curl -s -X POST "$AUTH_URL/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty' 2>/dev/null)

if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
  green "  ✓ JWT obtained for BFF auth tests"
  PASS=$((PASS + 1))
  echo "  → token: ${ACCESS_TOKEN:0:40}..."
else
  red "  ✗ Could not obtain JWT — auth tests will fail"
  FAIL=$((FAIL + 1))
  ACCESS_TOKEN=""
fi

# ── 2. Public Routes (no auth) ────────────────────────────────────────────────

blue "\n=== 2. Public proxy routes (no auth required) ==="

# Search
RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/search")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  green "  ✓ GET /api/search → 200 (search-service up)"
  PASS=$((PASS + 1))
elif [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
  green "  ✓ GET /api/search → $HTTP_CODE (BFF routing works, search-service not deployed)"
  PASS=$((PASS + 1))
else
  red "  ✗ GET /api/search → unexpected $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi

# Salary list
RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/salary")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
  green "  ✓ GET /api/salary → $HTTP_CODE (routing works)"
  PASS=$((PASS + 1))
else
  red "  ✗ GET /api/salary → unexpected $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi

# Stats
RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/stats")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
  green "  ✓ GET /api/stats → $HTTP_CODE (routing works)"
  PASS=$((PASS + 1))
else
  red "  ✗ GET /api/stats → unexpected $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi

# Analytics
RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/analytics")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
  green "  ✓ GET /api/analytics → $HTTP_CODE (routing works)"
  PASS=$((PASS + 1))
else
  red "  ✗ GET /api/analytics → unexpected $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi

# ── 3. Auth Enforcement ───────────────────────────────────────────────────────

blue "\n=== 3. Auth enforcement — protected routes reject unauthenticated requests ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BFF_URL/vote/00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{"type":"up"}')
assert_status "POST /api/vote/:id without token → 401" 401 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BFF_URL/vote/00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tampered.invalid.token" \
  -d '{"type":"up"}')
assert_status "POST /api/vote/:id with invalid token → 401" 401 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BFF_URL/vote/queue")
assert_status "GET /api/vote/queue without token → 401" 401 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BFF_URL/dashboard")
assert_status "GET /api/dashboard without token → 401" 401 "$STATUS"

# ── 4. Authenticated Routes ───────────────────────────────────────────────────

if [ -n "$ACCESS_TOKEN" ]; then
  blue "\n=== 4. Authenticated routes — valid JWT passes auth ==="

  # Dashboard
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/dashboard" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  if [ "$HTTP_CODE" = "200" ]; then
    assert_field "pendingSubmissions field" "$(echo "$BODY" | jq '.pendingSubmissions // empty')"
    assert_field "recentlyApproved field"   "$(echo "$BODY" | jq '.recentlyApproved // empty')"
    assert_field "avgSalaryLKR field"       "$(echo "$BODY" | jq '.avgSalaryLKR // empty')"
    echo "  → dashboard returned (avgSalaryLKR=$(echo "$BODY" | jq '.avgSalaryLKR'))"
  elif [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
    green "  ✓ GET /api/dashboard → $HTTP_CODE (auth passed, search-service not deployed)"
    PASS=$((PASS + 1))
  else
    red "  ✗ GET /api/dashboard with valid token → unexpected $HTTP_CODE"
    FAIL=$((FAIL + 1))
  fi

  # Vote queue
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/vote/queue" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
    green "  ✓ GET /api/vote/queue with valid token → $HTTP_CODE (auth passed)"
    PASS=$((PASS + 1))
  else
    red "  ✗ GET /api/vote/queue with valid token → unexpected $HTTP_CODE"
    FAIL=$((FAIL + 1))
  fi

  # Salary submission via BFF (no auth required, but routes through BFF)
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BFF_URL/salary" \
    -H "Content-Type: application/json" \
    -d '{
      "role": "BFF Test Engineer",
      "country": "LK",
      "monthly_salary_lkr": 120000
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
    green "  ✓ POST /api/salary via BFF → $HTTP_CODE"
    PASS=$((PASS + 1))
  else
    red "  ✗ POST /api/salary via BFF → unexpected $HTTP_CODE"
    FAIL=$((FAIL + 1))
  fi
fi

# ── 5. CORS Headers ───────────────────────────────────────────────────────────

blue "\n=== 5. CORS headers ==="

HEADERS=$(curl -s -I "$BFF_URL/search")

if echo "$HEADERS" | grep -qi "Access-Control-Allow-Origin"; then
  green "  ✓ Access-Control-Allow-Origin present"
  PASS=$((PASS + 1))
else
  red "  ✗ Access-Control-Allow-Origin missing"
  FAIL=$((FAIL + 1))
fi

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BFF_URL/search" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET")
assert_status "OPTIONS preflight → 204" 204 "$STATUS"

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
