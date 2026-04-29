#!/usr/bin/env bash
# ── Salary Service End-to-End Test Script ────────────────────────────────────
# Usage: ./test-e2e.sh [BASE_URL] [HEALTH_URL]
#
# BASE_URL    - salary service public URL (via BFF /api/salary or direct)
# HEALTH_URL  - direct service URL for health probes (k8s-internal)
#               Defaults to BASE_URL.
#
# Prerequisites: curl, jq
# Examples:
#   Direct:      ./test-e2e.sh http://localhost:18082
#   Via BFF:     ./test-e2e.sh http://localhost/api/salary http://localhost:18082

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

# ── 1. Submit Salary (no auth required) ──────────────────────────────────────

blue "\n=== 1. POST /salary — valid submission ==="

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/salary" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "Software Engineer",
    "company": "TestCorp",
    "country": "LK",
    "city": "Colombo",
    "monthly_salary_lkr": 150000,
    "currency": "LKR",
    "years_of_experience": 3,
    "experience_level": "mid",
    "work_type": "remote",
    "anonymize": false
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
SUBMISSION_ID=$(echo "$BODY" | jq -r '.id // empty' 2>/dev/null)
STATUS_FIELD=$(echo "$BODY" | jq -r '.status // empty' 2>/dev/null)

assert_status "Submit salary" 201 "$HTTP_CODE"
assert_field "submission id" "$SUBMISSION_ID"
assert_eq "submission status is PENDING" "PENDING" "$STATUS_FIELD"
echo "  → id: $SUBMISSION_ID"
echo "  → status: $STATUS_FIELD"

# ── 1b. Submit with anonymize=true ───────────────────────────────────────────

blue "\n=== 1b. POST /salary — anonymized submission ==="

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/salary" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "DevOps Engineer",
    "company": "SecretCorp",
    "country": "LK",
    "monthly_salary_lkr": 200000,
    "anonymize": true
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
COMPANY=$(echo "$BODY" | jq -r '.company' 2>/dev/null)
ANON=$(echo "$BODY" | jq -r '.anonymized' 2>/dev/null)

assert_status "Anonymized submission" 201 "$HTTP_CODE"
assert_eq "company hidden (null) when anonymized" "null" "$COMPANY"
assert_eq "anonymized flag is true" "true" "$ANON"

# ── 1c. Validation: missing role ──────────────────────────────────────────────

blue "\n=== 1c. POST /salary — missing role ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/salary" \
  -H "Content-Type: application/json" \
  -d '{"monthly_salary_lkr": 100000}')
assert_status "Missing role → 400" 400 "$STATUS"

# ── 1d. Validation: non-positive salary ───────────────────────────────────────

blue "\n=== 1d. POST /salary — zero salary ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/salary" \
  -H "Content-Type: application/json" \
  -d '{"role": "Engineer", "monthly_salary_lkr": 0}')
assert_status "Zero salary → 400" 400 "$STATUS"

# ── 1e. Validation: invalid JSON body ─────────────────────────────────────────

blue "\n=== 1e. POST /salary — invalid JSON ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/salary" \
  -H "Content-Type: application/json" \
  -d 'not-json')
assert_status "Invalid JSON → 400" 400 "$STATUS"

# ── 2. List Approved Submissions ─────────────────────────────────────────────

blue "\n=== 2. GET /salary — list approved ==="

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/salary")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "List approved submissions" 200 "$HTTP_CODE"
IS_ARRAY=$(echo "$BODY" | jq -e '. | type == "array"' >/dev/null 2>&1 && echo "true" || echo "false")
assert_eq "Response is a JSON array" "true" "$IS_ARRAY"

# ── 2b. List with filters ─────────────────────────────────────────────────────

blue "\n=== 2b. GET /salary — filtered by role ==="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/salary?role=Software+Engineer")
assert_status "Filter by role" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/salary?country=LK&experience_level=mid")
assert_status "Filter by country + experience_level" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/salary?work_type=remote&currency=LKR")
assert_status "Filter by work_type + currency" 200 "$STATUS"

# ── 3. Currency + Country defaults ───────────────────────────────────────────

blue "\n=== 3. POST /salary — currency and country default to LKR/LK ==="

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/salary" \
  -H "Content-Type: application/json" \
  -d '{"role": "QA Engineer", "monthly_salary_lkr": 80000}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
CURRENCY=$(echo "$BODY" | jq -r '.currency // empty' 2>/dev/null)
COUNTRY=$(echo "$BODY" | jq -r '.country // empty' 2>/dev/null)

assert_status "Defaults submission" 201 "$HTTP_CODE"
assert_eq "currency defaults to LKR" "LKR" "$CURRENCY"
assert_eq "country defaults to LK" "LK" "$COUNTRY"

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
