#!/bin/bash

echo "=== API Equipment Logs Test ==="

# Get captcha
CAPTCHA=$(curl -s "http://localhost:3000/api/auth/captcha")
CAPTCHA_ID=$(echo $CAPTCHA | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
QUESTION=$(echo $CAPTCHA | grep -o '"question":"[^"]*"' | cut -d'"' -f4)
echo "Captcha: $QUESTION (ID: $CAPTCHA_ID)"

# Calculate answer
ANSWER=$(echo "$QUESTION" | sed 's/ + /+/g; s/ = ?//g' | bc)
echo "Answer: $ANSWER"

# Login
TOKEN=$(curl -s -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\",\"captchaId\":\"$CAPTCHA_ID\",\"captchaAnswer\":$ANSWER}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo -e "\n=== TEST 1: Valid request with limit=100 ==="
curl -s "http://localhost:3000/api/equipment/logs?limit=100" \
  -H "Authorization: Bearer $TOKEN" | head -c 200

echo -e "\n\n=== TEST 2: Valid request with all parameters ==="
curl -s "http://localhost:3000/api/equipment/logs?equipmentId=1&source=snmp&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN" | head -c 200

echo -e "\n\n=== TEST 3: Invalid limit (string) - Should return 400 ==="
curl -s -w "\nHTTP Status: %{http_code}\n" "http://localhost:3000/api/equipment/logs?limit=invalid" \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n=== TEST 4: Limit too high (>1000) - Should return 400 ==="
curl -s -w "\nHTTP Status: %{http_code}\n" "http://localhost:3000/api/equipment/logs?limit=5000" \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n=== TEST 5: Invalid equipmentId (string) - Should return 400 ==="
curl -s -w "\nHTTP Status: %{http_code}\n" "http://localhost:3000/api/equipment/logs?equipmentId=abc" \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n=== TEST 6: Negative page - Should return 400 ==="
curl -s -w "\nHTTP Status: %{http_code}\n" "http://localhost:3000/api/equipment/logs?page=-1" \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n=== All tests completed ==="
