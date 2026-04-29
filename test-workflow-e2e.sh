#!/usr/bin/env bash
# ── Full End-to-End Workflow Test ─────────────────────────────────────────────
# Proves the complete assignment workflow:
#   submission (PENDING) → voting → approval (APPROVED) → search → stats
#
# This script directly maps to the coursework marking criteria:
#   "Evidence must show a salary submission being stored as PENDING, a user
#    successfully signing up/logging in and receiving a token/session, a vote
#    being recorded, the submission becoming APPROVED once the threshold is
#    reached, the approved salary appearing in search results, and the stats
#    output updating based on approved salaries."
#
# Usage: ./test-workflow-e2e.sh [AUTH_URL] [BFF_URL]
#
# AUTH_URL  - identity service URL  (default: http://localhost/auth)
# BFF_URL   - BFF API base URL      (default: http://localhost/api)
#
# Prerequisites: curl, jq
# Example (local k8s via ingress):
#   ./test-workflow-e2e.sh http://localhost/auth http://localhost/api

set -euo pipefail

AUTH_URL="${1:-http://localhost/auth}"
BFF_URL="${2:-http://localhost/api}"
PASS=0
FAIL=0

TIMESTAMP=$(date +%s)

green() { echo -e "\033[32m$*\033[0m"; }
red()   { echo -e "\033[31m$*\033[0m"; }
blue()  { echo -e "\033[34m$*\033[0m"; }
bold()  { echo -e "\033[1m$*\033[0m"; }

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

bold "\n╔══════════════════════════════════════════════════════════════╗"
bold   "║  watup.lk — Full Workflow End-to-End Test                    ║"
bold   "║  submission → voting → approval → search → stats             ║"
bold   "╚══════════════════════════════════════════════════════════════╝"
echo   "  AUTH_URL : $AUTH_URL"
echo   "  BFF_URL  : $BFF_URL"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Sign up 5 users (approval threshold = 5 upvotes)
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 1: Create 5 users (one per upvote needed to reach threshold) ═══"

declare -a TOKENS
for i in 1 2 3 4 5; do
  EMAIL="voter${i}_${TIMESTAMP}@example.com"

  curl -s -o /dev/null -X POST "$AUTH_URL/signup" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Voter $i\",\"email\":\"$EMAIL\",\"password\":\"TestPass99\"}"

  RESPONSE=$(curl -s -X POST "$AUTH_URL/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"TestPass99\"}")

  TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty' 2>/dev/null)

  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    TOKENS[$i]="$TOKEN"
    green "  ✓ User $i signed up and logged in"
    PASS=$((PASS + 1))
  else
    red "  ✗ User $i signup/login failed"
    FAIL=$((FAIL + 1))
    TOKENS[$i]=""
  fi
done

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Submit salary (no login required — anonymous submission)
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 2: Submit salary anonymously (no auth required) ═══"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BFF_URL/salary" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "Software Engineer",
    "company": "TechCorp LK",
    "country": "LK",
    "city": "Colombo",
    "monthly_salary_lkr": 175000,
    "currency": "LKR",
    "years_of_experience": 4,
    "experience_level": "mid",
    "work_type": "hybrid",
    "anonymize": false
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
SUBMISSION_ID=$(echo "$BODY" | jq -r '.id // empty' 2>/dev/null)
INITIAL_STATUS=$(echo "$BODY" | jq -r '.status // empty' 2>/dev/null)

assert_status "Salary submission (no auth)" 201 "$HTTP_CODE"
assert_field "submission id" "$SUBMISSION_ID"
assert_eq "submission starts as PENDING" "PENDING" "$INITIAL_STATUS"

echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │ Submission ID : $SUBMISSION_ID"
echo "  │ Role          : Software Engineer"
echo "  │ Company       : TechCorp LK"
echo "  │ Salary (LKR)  : 175,000"
echo "  │ Status        : $INITIAL_STATUS"
echo "  └─────────────────────────────────────────────────────────┘"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Verify submission appears in search as PENDING
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 3: Search confirms submission is PENDING ═══"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/search?status=PENDING")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "Search PENDING submissions" 200 "$HTTP_CODE"

FOUND=$(echo "$BODY" | jq --arg id "$SUBMISSION_ID" \
  '[.results[] | select(.id == $id)] | length' 2>/dev/null || echo "0")

if [ "$FOUND" -gt 0 ]; then
  green "  ✓ Submission $SUBMISSION_ID found in PENDING results"
  PASS=$((PASS + 1))
else
  red "  ✗ Submission not found in PENDING search results"
  FAIL=$((FAIL + 1))
fi

TOTAL_PENDING=$(echo "$BODY" | jq '.pagination.total' 2>/dev/null || echo "?")
echo "  → Total PENDING submissions in system: $TOTAL_PENDING"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4 — Cast 5 upvotes (each from a different authenticated user)
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 4: Cast 5 upvotes (login required for voting) ═══"

if [ -z "$SUBMISSION_ID" ] || [ "$SUBMISSION_ID" = "null" ]; then
  red "  SKIPPED — no submission ID from step 2"
  FAIL=$((FAIL + 1))
else
  THRESHOLD_REACHED="false"
  for i in 1 2 3 4 5; do
    TOKEN="${TOKENS[$i]:-}"
    if [ -z "$TOKEN" ]; then
      red "  ✗ No token for user $i — skipping vote"
      FAIL=$((FAIL + 1))
      continue
    fi

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BFF_URL/vote/$SUBMISSION_ID" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"type":"up"}')

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -1)
    REACHED=$(echo "$BODY" | jq -r '.threshold_reached // false' 2>/dev/null)

    assert_status "User $i upvotes submission" 200 "$HTTP_CODE"

    if [ "$REACHED" = "true" ]; then
      THRESHOLD_REACHED="true"
      green "  ✓ Approval threshold reached after vote $i!"
    fi
  done

  assert_eq "Threshold reached after 5 votes" "true" "$THRESHOLD_REACHED"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Verify submission is now APPROVED in search
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 5: Search confirms submission is now APPROVED ═══"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/search?status=APPROVED")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "Search APPROVED submissions" 200 "$HTTP_CODE"

FOUND=$(echo "$BODY" | jq --arg id "$SUBMISSION_ID" \
  '[.results[] | select(.id == $id)] | length' 2>/dev/null || echo "0")

if [ "$FOUND" -gt 0 ]; then
  green "  ✓ Submission $SUBMISSION_ID found in APPROVED results"
  PASS=$((PASS + 1))
  APPROVED_ENTRY=$(echo "$BODY" | jq --arg id "$SUBMISSION_ID" \
    '.results[] | select(.id == $id)' 2>/dev/null)
  echo "  → upvotes:   $(echo "$APPROVED_ENTRY" | jq '.upvotes')"
  echo "  → status:    $(echo "$APPROVED_ENTRY" | jq -r '.status')"
  echo "  → role:      $(echo "$APPROVED_ENTRY" | jq -r '.role')"
else
  red "  ✗ Submission not found in APPROVED results after reaching threshold"
  FAIL=$((FAIL + 1))
fi

# Confirm it no longer appears as PENDING
RESPONSE=$(curl -s "$BFF_URL/search?status=PENDING")
STILL_PENDING=$(echo "$RESPONSE" | jq --arg id "$SUBMISSION_ID" \
  '[.results[] | select(.id == $id)] | length' 2>/dev/null || echo "0")

if [ "$STILL_PENDING" -eq 0 ]; then
  green "  ✓ Submission no longer in PENDING results"
  PASS=$((PASS + 1))
else
  red "  ✗ Submission still appears as PENDING (should be APPROVED)"
  FAIL=$((FAIL + 1))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Stats reflect the approved salary
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 6: Stats update based on approved salary ═══"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/stats?country=LK&role=Software+Engineer")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "GET /api/stats after approval" 200 "$HTTP_CODE"

COUNT=$(echo "$BODY" | jq 'length' 2>/dev/null || echo "0")
if [ "$COUNT" -gt 0 ]; then
  ENTRY=$(echo "$BODY" | jq '.[0]' 2>/dev/null)
  MEDIAN=$(echo "$ENTRY" | jq '.medianSalaryLKR' 2>/dev/null || echo "null")
  AVG=$(echo "$ENTRY"    | jq '.averageSalaryLKR' 2>/dev/null || echo "null")
  TOTAL=$(echo "$ENTRY"  | jq '.count' 2>/dev/null || echo "null")
  assert_field "stats median salary" "$MEDIAN"
  assert_field "stats average salary" "$AVG"
  assert_field "stats entry count" "$TOTAL"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │ Stats for Software Engineer in LK                       │"
  echo "  │ Count          : $TOTAL"
  echo "  │ Average (LKR)  : $AVG"
  echo "  │ Median  (LKR)  : $MEDIAN"
  echo "  │ P25     (LKR)  : $(echo "$ENTRY" | jq '.p25SalaryLKR')"
  echo "  │ P75     (LKR)  : $(echo "$ENTRY" | jq '.p75SalaryLKR')"
  echo "  └─────────────────────────────────────────────────────────┘"
else
  red "  ✗ Stats returned empty — approved salary not reflected yet"
  FAIL=$((FAIL + 1))
fi

blue "\n═══ STEP 6b: Analytics endpoint reflects approved data ═══"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BFF_URL/analytics?country=LK")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "GET /api/analytics after approval" 200 "$HTTP_CODE"

APPROVED_COUNT=$(echo "$BODY" | jq '.approvedEntries' 2>/dev/null || echo "null")
assert_field "approvedEntries in analytics" "$APPROVED_COUNT"

if [ "$APPROVED_COUNT" != "null" ] && [ "$APPROVED_COUNT" -gt 0 ] 2>/dev/null; then
  green "  ✓ approvedEntries = $APPROVED_COUNT (reflects approved salary)"
  PASS=$((PASS + 1))
else
  red "  ✗ approvedEntries = $APPROVED_COUNT — expected > 0"
  FAIL=$((FAIL + 1))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Privacy: anonymized submission hides company
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 7: Privacy — anonymized submission hides company ═══"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BFF_URL/salary" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "Data Scientist",
    "company": "PrivateCorp",
    "country": "LK",
    "monthly_salary_lkr": 220000,
    "anonymize": true
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

assert_status "Anonymized salary submission" 201 "$HTTP_CODE"

COMPANY=$(echo "$BODY" | jq -r '.company' 2>/dev/null)
ANON=$(echo "$BODY" | jq -r '.anonymized' 2>/dev/null)

assert_eq "company is null when anonymized" "null" "$COMPANY"
assert_eq "anonymized flag is true" "true" "$ANON"
echo "  → Company hidden: $COMPANY  |  anonymized: $ANON"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 8 — Identity separation: user email NOT in salary records
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ STEP 8: Privacy — user email not stored in salary records ═══"

RESPONSE=$(curl -s "$BFF_URL/search?limit=10")
EMAIL_LEAK=$(echo "$RESPONSE" | jq '[.results[] | select(has("email"))] | length' 2>/dev/null || echo "0")

if [ "$EMAIL_LEAK" -eq 0 ]; then
  green "  ✓ No email field in any salary search result (identity separated)"
  PASS=$((PASS + 1))
else
  red "  ✗ Email field found in salary records — privacy violation!"
  FAIL=$((FAIL + 1))
fi

USER_ID_LEAK=$(echo "$RESPONSE" | jq '[.results[] | select(has("user_id"))] | length' 2>/dev/null || echo "0")
if [ "$USER_ID_LEAK" -eq 0 ]; then
  green "  ✓ No user_id field in salary search results (PII separated)"
  PASS=$((PASS + 1))
else
  red "  ✗ user_id found in salary records — identity linkage!"
  FAIL=$((FAIL + 1))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════

blue "\n═══ Workflow Summary ═══"
echo ""
echo "  Step 1  — 5 users signed up and logged in"
echo "  Step 2  — Salary submitted anonymously → PENDING"
echo "  Step 3  — Submission visible in PENDING search results"
echo "  Step 4  — 5 authenticated users cast upvotes"
echo "  Step 5  — Submission promoted to APPROVED after threshold"
echo "  Step 6  — Stats + analytics reflect the approved salary"
echo "  Step 7  — Anonymized submission hides company name"
echo "  Step 8  — User email/id not stored in salary records"
echo ""

blue "=== Test Summary ==="
echo "  Tests passed: $PASS"
echo "  Tests failed: $FAIL"
echo "  Total:        $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
  red "\nSome tests FAILED."
  exit 1
else
  green "\nAll tests PASSED — full workflow verified."
  exit 0
fi
