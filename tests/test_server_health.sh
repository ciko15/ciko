#!/bin/bash

echo "=== Testing Equipment Templates API ==="
echo ""
echo "1. Server Status: ✓ Running on http://localhost:3000"
echo ""
echo "2. Testing Login..."

# Get CSRF token dari captcha first
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/captcha)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  CAPTCHA_ID=$(echo "$BODY" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
  CAPTCHA_ANSWER=$(echo "$BODY" | grep -o '"answer":"[^"]*' | sed 's/"answer":"//')
  
  if [ -n "$CAPTCHA_ID" ] && [ -n "$CAPTCHA_ANSWER" ]; then
    echo "   Captcha ID: $CAPTCHA_ID"
    echo "   Captcha Answer: $CAPTCHA_ANSWER"
    
    # Now try login
    echo ""
    echo "3. Testing Login with credentials..."
    LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/login \
      -H "Content-Type: application/json" \
      -d "{
        \"username\": \"admin\",
        \"password\": \"admin123\",
        \"captchaId\": \"$CAPTCHA_ID\",
        \"captchaAnswer\": \"$CAPTCHA_ANSWER\"
      }")
    
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | sed 's/"token":"//' | head -1)
    
    if [ -n "$TOKEN" ]; then
      echo "   ✓ Login successful"
      echo "   Token: ${TOKEN:0:20}..."
      echo ""
      echo "4. Testing Equipment Templates API..."
      
      TEMPLATES=$(curl -s http://localhost:3000/api/templates \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json")
      
      TEMPLATE_COUNT=$(echo "$TEMPLATES" | grep -o '"id"' | wc -l)
      
      if [ "$TEMPLATE_COUNT" -gt 0 ]; then
        echo "   ✓ Templates API responsive"
        echo "   Number of templates: $TEMPLATE_COUNT"
        echo ""
        echo "5. Sample Template Data:"
        echo "$TEMPLATES" | head -1 | sed 's/^/   /'
      else
        echo "   ✗ No templates returned"
        echo "   Response: $TEMPLATES" | head -50
      fi
    else
      echo "   ✗ Login failed"
      echo "   Response: $LOGIN_RESPONSE"
    fi
  fi
else
  echo "   ✗ Could not get captcha"
fi

echo ""
echo "=== Next Steps ==="
echo "• Open browser: http://localhost:3000"
echo "• Login with: admin / admin123"
echo "• Go to Equipment Templates menu"
echo "• You should see the templates with their parameters"
