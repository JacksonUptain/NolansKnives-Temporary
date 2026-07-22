#!/bin/bash

# Firebase Environment Test Script
# Run this after deploying to verify all systems are working

echo "======================================"
echo "Firebase Test Environment Validation"
echo "======================================"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
    exit 1
fi

echo "✅ Firebase CLI found"
echo ""

# Get project ID
echo "Checking project configuration..."
PROJECT_ID=$(firebase use 2>/dev/null | grep "Active Project:" | sed 's/Active Project: //' | tr -d '()')

if [ -z "$PROJECT_ID" ]; then
    echo "❌ No Firebase project configured. Run: firebase init"
    exit 1
fi

echo "✅ Project: $PROJECT_ID"
echo ""

# Test database rules deployment status
echo "Testing database rules..."
firebase database:get --shallow / --project="$PROJECT_ID" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Database accessible"
else
    echo "❌ Database access failed. Check rules are published."
fi

echo ""
echo "Testing Cloud Functions..."

# Check if functions are deployed
FUNCTIONS=$(firebase functions:list --project="$PROJECT_ID" 2>/dev/null | grep -c "testEnvironment")
if [ "$FUNCTIONS" -gt 0 ]; then
    echo "✅ Cloud Functions deployed"
else
    echo "⚠️  testEnvironment function not found. Deploy with: firebase deploy --only functions"
fi

echo ""
echo "Testing Firebase configuration..."

if [ -f "src/pages/firebase.js" ]; then
    # Check if apiKey is set
    if grep -q "AIzaSy" "src/pages/firebase.js"; then
        echo "✅ Firebase config found"
    else
        echo "❌ Firebase config appears incomplete"
    fi
else
    echo "❌ Firebase config file not found at src/pages/firebase.js"
fi

echo ""
echo "Testing database rules file..."

if [ -f "firebase-rules.json" ]; then
    # Check for new collections
    if grep -q "customRequests" firebase-rules.json; then
        echo "✅ Database rules include customRequests"
    else
        echo "⚠️  Database rules missing customRequests collection"
    fi

    if grep -q "quotes" firebase-rules.json; then
        echo "✅ Database rules include quotes"
    else
        echo "⚠️  Database rules missing quotes collection"
    fi

    if grep -q "notificationEvents" firebase-rules.json; then
        echo "✅ Database rules include notificationEvents"
    else
        echo "⚠️  Database rules missing notificationEvents collection"
    fi
else
    echo "❌ firebase-rules.json not found"
fi

echo ""
echo "Testing Cloud Functions code..."

if [ -f "functions/index.js" ]; then
    if grep -q "verifyUserRole" functions/index.js; then
        echo "✅ Role verification logic found"
    else
        echo "⚠️  Role verification logic not found"
    fi

    if grep -q "sendEmail" functions/index.js; then
        echo "✅ Email function logic found"
    else
        echo "⚠️  Email function logic not found"
    fi

    if grep -q "testEnvironment" functions/index.js; then
        echo "✅ Test environment function found"
    else
        echo "⚠️  Test environment function not found"
    fi
else
    echo "❌ functions/index.js not found"
fi

echo ""
echo "======================================"
echo "Manual Steps to Complete Setup:"
echo "======================================"
echo ""
echo "1. Apply Database Rules:"
echo "   - Go to Firebase Console → Realtime Database → Rules"
echo "   - Copy content from firebase-rules.json"
echo "   - Click 'Publish'"
echo ""
echo "2. Apply Storage Rules:"
echo "   - Go to Firebase Console → Cloud Storage → Rules"
echo "   - Copy content from storage-rules.json"
echo "   - Click 'Publish'"
echo ""
echo "3. Deploy Cloud Functions:"
echo "   firebase deploy --only functions"
echo ""
echo "4. Verify User Profiles:"
echo "   - Go to Firebase Console → Realtime Database → data → users"
echo "   - Each user should have: role, status, email, displayName"
echo ""
echo "5. Test Endpoint:"
echo "   - Open browser console and run:"
echo "   - Call testEnvironment() Cloud Function"
echo "   - Should return: { authenticated: true, canReadDatabase: true, ... }"
echo ""
echo "======================================"
echo "Test Environment Validation Complete"
echo "======================================"
