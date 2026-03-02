#!/usr/bin/env bash
# ── Identity Service End-to-End Test Script ─────────────────────────────────
# Demonstrates the full auth workflow required by the assignment spec.
# Usage: ./test-e2e.sh [BASE_URL]
#
# Prerequisites: curl, jq
# Example: ./test-e2e.sh http://localhost:8080
#          ./test-e2e.sh https://your-aks-ip/auth

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
PASS=0
FAIL=0

# Unique email per run to avoid conflicts
TIMESTAMP=$(date +%s)
TEST_EMAIL="testuser_${TIMESTAMP}@example.com"
TEST_PASSWORD="TestPass99"

# ── Helpers ───────────────────────────────────────────────────────────────────

green() { echo -e "\033[32m$*\033[0m"; }
red()   { echo -e "\033[31m$*\033[0m"; }
blue()  { echo -e "\033[34m$*\033[0m"; }

assert_status() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    green "  ✓ $test_name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "  ✗ $test_name — expected HTTP $expected, got HTTP $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_field() {
  local test_name="$1"
  local value="$2"
  if [ -n "$value" ] && [ "$value" != "null" ]; then
    green "  ✓ $test_name present"
    PASS=$((PASS + 1))
  else
    red "  ✗ $test_name missing or null"
    FAIL=$((FAIL + 1))
  fi
}

# ── 0. Health Check ───────────────────────────────────────────────────────────

blue "\n=== 0. Health Probes ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/live")
assert_status "GET /health/live" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/ready")
assert_status "GET /health/ready" 200 "$STATUS"

# ── 1. Signup ─────────────────────────────────────────────────────────────────

blue "\n=== 1. POST /auth/signup ==="

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
USER_ID=$(echo "$BODY" | jq -r '.user_id // empty' 2>/dev/null)

assert_status "Signup new user" 201 "$HTTP_CODE"
assert_field "user_id in response" "$USER_ID"
echo "  → user_id: $USER_ID"

# ── 1b. Duplicate Signup ──────────────────────────────────────────────────────

blue "\n=== 1b. POST /auth/signup (duplicate) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
assert_status "Duplicate signup → 409 Conflict" 409 "$STATUS"

# ── 1c. Invalid Email Validation ──────────────────────────────────────────────

blue "\n=== 1c. POST /auth/signup (invalid email) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bad","email":"not-an-email","password":"ValidPass99"}')
assert_status "Invalid email → 400 Bad Request" 400 "$STATUS"

# ── 1d. Weak Password Validation ─────────────────────────────────────────────

blue "\n=== 1d. POST /auth/signup (weak password) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Weak\",\"email\":\"weak_${TIMESTAMP}@example.com\",\"password\":\"short\"}")
assert_status "Weak password → 400 Bad Request" 400 "$STATUS"

# ── 2. Login ──────────────────────────────────────────────────────────────────

blue "\n=== 2. POST /auth/login ==="

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
ACCESS_TOKEN=$(echo "$BODY" | jq -r '.access_token // empty' 2>/dev/null)
REFRESH_TOKEN=$(echo "$BODY" | jq -r '.refresh_token // empty' 2>/dev/null)
EXPIRES_AT=$(echo "$BODY" | jq -r '.expires_at // empty' 2>/dev/null)

assert_status "Login with correct credentials" 200 "$HTTP_CODE"
assert_field "access_token" "$ACCESS_TOKEN"
assert_field "refresh_token" "$REFRESH_TOKEN"
assert_field "expires_at" "$EXPIRES_AT"
echo "  → access_token: ${ACCESS_TOKEN:0:40}..."
echo "  → expires_at: $EXPIRES_AT"

# ── 2b. Wrong Password ────────────────────────────────────────────────────────

blue "\n=== 2b. POST /auth/login (wrong password) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"WrongPass99\"}")
assert_status "Wrong password → 401 Unauthorized" 401 "$STATUS"

# ── 3. Validate Token ─────────────────────────────────────────────────────────

blue "\n=== 3. GET /auth/validate ==="

RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/auth/validate" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
RETURNED_ID=$(echo "$BODY" | jq -r '.user_id // empty' 2>/dev/null)

assert_status "Validate valid token" 200 "$HTTP_CODE"
assert_field "user_id in validate response" "$RETURNED_ID"

if [ "$RETURNED_ID" = "$USER_ID" ]; then
  green "  ✓ user_id matches signup response"
  PASS=$((PASS + 1))
else
  red "  ✗ user_id mismatch: expected $USER_ID, got $RETURNED_ID"
  FAIL=$((FAIL + 1))
fi

# ── 3b. Invalid Token ─────────────────────────────────────────────────────────

blue "\n=== 3b. GET /auth/validate (invalid token) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/auth/validate" \
  -H "Authorization: Bearer invalid.token.here")
assert_status "Invalid token → 401 Unauthorized" 401 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/auth/validate")
assert_status "Missing Authorization header → 401" 401 "$STATUS"

# ── 4. Refresh Token ──────────────────────────────────────────────────────────

blue "\n=== 4. POST /auth/refresh ==="

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
NEW_ACCESS=$(echo "$BODY" | jq -r '.access_token // empty' 2>/dev/null)
NEW_REFRESH=$(echo "$BODY" | jq -r '.refresh_token // empty' 2>/dev/null)

assert_status "Token refresh" 200 "$HTTP_CODE"
assert_field "new access_token" "$NEW_ACCESS"
assert_field "new refresh_token" "$NEW_REFRESH"

if [ "$NEW_ACCESS" != "$ACCESS_TOKEN" ]; then
  green "  ✓ New access_token differs from old (token rotation working)"
  PASS=$((PASS + 1))
else
  red "  ✗ access_token unchanged after refresh"
  FAIL=$((FAIL + 1))
fi

# ── 4b. Reuse old refresh token (should fail) ────────────────────────────────

blue "\n=== 4b. POST /auth/refresh (reuse old token — should fail) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}")
assert_status "Old refresh token revoked → 401" 401 "$STATUS"

# ── 5. Logout ─────────────────────────────────────────────────────────────────

blue "\n=== 5. POST /auth/logout ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$NEW_REFRESH\"}")
assert_status "Logout (revoke refresh token)" 204 "$STATUS"

# ── 5b. Verify token revoked after logout ────────────────────────────────────

blue "\n=== 5b. POST /auth/refresh after logout (should fail) ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$NEW_REFRESH\"}")
assert_status "Refresh after logout → 401" 401 "$STATUS"

# ── 6. Security Headers ───────────────────────────────────────────────────────

blue "\n=== 6. Security Headers ==="

HEADERS=$(curl -s -I "$BASE_URL/health/live")

check_header() {
  local header="$1"
  if echo "$HEADERS" | grep -qi "$header"; then
    green "  ✓ $header present"
    PASS=$((PASS + 1))
  else
    red "  ✗ $header missing"
    FAIL=$((FAIL + 1))
  fi
}

check_header "X-Content-Type-Options"
check_header "X-Frame-Options"
check_header "Strict-Transport-Security"
check_header "Content-Security-Policy"

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
