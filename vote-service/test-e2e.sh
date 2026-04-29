#!/usr/bin/env bash
# ── Vote Service End-to-End Test Script ──────────────────────────────────────
# Usage: ./test-e2e.sh [BASE_URL] [SUBMISSION_ID]
#
# BASE_URL      - vote service HTTP URL (direct port 8081, or BFF /api)
# SUBMISSION_ID - an existing PENDING submission UUID to vote on.
#                 If not given, voting tests are skipped.
#                 Run salary-service first to create one, then pass its ID here.
#
# Prerequisites: curl, jq
# Examples:
#   Direct:   ./test-e2e.sh http://localhost:18085 <submission-uuid>
#   Via BFF:  ./test-e2e.sh http://localhost/api   <submission-uuid>
#   (BFF mode requires a valid JWT in BFF_TOKEN env var for vote tests)

set -euo pipefail

BASE_URL="${1:-http://localhost:8081}"
SUBMISSION_ID="${2:-}"
BFF_TOKEN="${BFF_TOKEN:-}"
PASS=0
FAIL=0

green() { echo -e "\033[32m$*\033[0m"; }
red()   { echo -e "\033[31m$*\033[0m"; }
blue()  { echo -e "\033[34m$*\033[0m"; }
yellow(){ echo -e "\033[33m$*\033[0m"; }

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

# Detect if we're hitting BFF or direct vote service
IS_BFF=false
if echo "$BASE_URL" | grep -q "/api"; then
  IS_BFF=true
fi

# ── 1. Vote on a Submission (direct mode) ────────────────────────────────────

if [ -z "$SUBMISSION_ID" ]; then
  yellow "\n=== Voting tests SKIPPED — no SUBMISSION_ID provided ==="
  yellow "  Re-run with: ./test-e2e.sh $BASE_URL <submission-uuid>"
  yellow "  Tip: run salary-service/test-e2e.sh first, grab the id from output"
else
  blue "\n=== 1. POST /vote/$SUBMISSION_ID — upvote (user 1) ==="

  if [ "$IS_BFF" = "true" ]; then
    # BFF mode: requires Bearer JWT, passes user_id via x-user-id header internally
    if [ -z "$BFF_TOKEN" ]; then
      yellow "  SKIPPED — set BFF_TOKEN env var to test via BFF"
    else
      RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/vote/$SUBMISSION_ID" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $BFF_TOKEN" \
        -d '{"type":"up"}')
      HTTP_CODE=$(echo "$RESPONSE" | tail -1)
      BODY=$(echo "$RESPONSE" | head -1)
      assert_status "Upvote via BFF" 200 "$HTTP_CODE"
      SUCCESS=$(echo "$BODY" | jq -r '.success // empty' 2>/dev/null)
      assert_eq "success=true" "true" "$SUCCESS"
    fi
  else
    # Direct mode: pass user_id in body (BFF auth enforcement not applied)
    USER1="00000000-0000-0000-0000-000000000001"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/vote/$SUBMISSION_ID" \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"up\",\"user_id\":\"$USER1\"}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -1)
    assert_status "Upvote (user 1)" 200 "$HTTP_CODE"
    SUCCESS=$(echo "$BODY" | jq -r '.success // empty' 2>/dev/null)
    assert_eq "success=true" "true" "$SUCCESS"
    echo "  → threshold_reached: $(echo "$BODY" | jq -r '.threshold_reached')"

    blue "\n=== 1b. POST /vote/$SUBMISSION_ID — downvote (user 2) ==="

    USER2="00000000-0000-0000-0000-000000000002"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/vote/$SUBMISSION_ID" \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"down\",\"user_id\":\"$USER2\"}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -1)
    assert_status "Downvote (user 2)" 200 "$HTTP_CODE"

    blue "\n=== 1c. POST /vote/$SUBMISSION_ID — idempotent duplicate vote (user 1 again) ==="

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/vote/$SUBMISSION_ID" \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"up\",\"user_id\":\"$USER1\"}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -1)
    assert_status "Duplicate same vote is idempotent" 200 "$HTTP_CODE"
    SUCCESS=$(echo "$BODY" | jq -r '.success // empty' 2>/dev/null)
    assert_eq "success=true for idempotent duplicate" "true" "$SUCCESS"
  fi

  # ── 2. Invalid Body ───────────────────────────────────────────────────────

  blue "\n=== 2. POST /vote/$SUBMISSION_ID — missing body ==="

  if [ "$IS_BFF" = "true" ] && [ -z "$BFF_TOKEN" ]; then
    yellow "  SKIPPED — set BFF_TOKEN env var"
  else
    AUTH_HEADER=""
    if [ "$IS_BFF" = "true" ]; then
      AUTH_HEADER="-H 'Authorization: Bearer $BFF_TOKEN'"
    fi

    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/vote/$SUBMISSION_ID" \
      -H "Content-Type: application/json" \
      ${AUTH_HEADER:+"$AUTH_HEADER"} \
      -d 'not-json')
    assert_status "Invalid body → 400" 400 "$STATUS"
  fi

  # ── 3. Missing Submission ID ──────────────────────────────────────────────

  blue "\n=== 3. POST /vote/ — missing submission id ==="

  if [ "$IS_BFF" = "false" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/vote/" \
      -H "Content-Type: application/json" \
      -d '{"type":"up","user_id":"00000000-0000-0000-0000-000000000001"}')
    assert_status "Missing submission id → 400" 400 "$STATUS"
  fi
fi

# ── 4. Auth Enforcement (BFF only) ───────────────────────────────────────────

if [ "$IS_BFF" = "true" ]; then
  blue "\n=== 4. Auth enforcement (BFF) ==="

  if [ -n "$SUBMISSION_ID" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/vote/$SUBMISSION_ID" \
      -H "Content-Type: application/json" \
      -d '{"type":"up"}')
    assert_status "Vote without token → 401" 401 "$STATUS"

    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/vote/$SUBMISSION_ID" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer invalid.token" \
      -d '{"type":"up"}')
    assert_status "Vote with invalid token → 401" 401 "$STATUS"
  fi

  blue "\n=== 4b. GET /api/vote/queue — auth enforcement ==="

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/vote/queue")
  assert_status "Vote queue without token → 401" 401 "$STATUS"
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
