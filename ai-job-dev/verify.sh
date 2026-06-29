#!/usr/bin/env bash
set -u

# ai-job 二次开发接口回归脚本
# 前置：后端已启动并监听 http://127.0.0.1:9100

BASE="${BASE:-http://127.0.0.1:9100}"
PASS=0
FAIL=0

pass() {
  echo "PASS $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL $1"
  if [ "${2:-}" != "" ]; then
    echo "     $2"
  fi
  FAIL=$((FAIL + 1))
}

check_http_200() {
  local name="$1"
  local url="$2"
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>&1)"
  if [ "$status" = "200" ]; then
    pass "$name"
  else
    fail "$name" "expected HTTP 200, got: $status"
  fi
}

check_no_5001() {
  local name="$1"
  local path="$2"
  local body
  local response
  local status
  response="$(curl -s -X POST "$BASE$path" -H 'Content-Type: application/json' -d '{}' -w '\n%{http_code}' 2>&1)"
  status="$(printf '%s' "$response" | tail -n 1)"
  body="$(printf '%s' "$response" | sed '$d')"
  if [ "$status" = "000" ]; then
    fail "$name" "backend unavailable for $path"
  elif echo "$body" | grep -q '"code":5001'; then
    fail "$name" "returned product authorization code 5001: $body"
  else
    pass "$name"
  fi
}

check_absent_in_files() {
  local name="$1"
  local pattern="$2"
  shift 2
  local matches
  matches="$(grep -RIn "$pattern" "$@" 2>/dev/null || true)"
  if [ "$matches" = "" ]; then
    pass "$name"
  else
    fail "$name" "$matches"
  fi
}

check_http_200 "backend reachable" "$BASE/"
check_no_5001 "AI seat endpoint has no 5001" "/api/job/seeker/cloned/ask"
check_no_5001 "AI config save has no 5001" "/api/user/ai/config/save"
check_absent_in_files "legacy server address removed" "43\\.138\\.246\\.37" ai-job-hunting-ui/src ai-job-hunting.user.js
check_absent_in_files "payment QR field removed from userscript" "qrCodeBase64" ai-job-hunting.user.js

echo "---"
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
