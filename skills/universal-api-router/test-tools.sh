#!/bin/bash
# NanoClaw Tool Integration Test Suite
# Usage: ./test-tools.sh

echo "🧪 NanoClaw Tool Integration Test"
echo "=================================="
echo ""

# Test 1: Web Search
echo "📍 Test 1: Web Search"
venv/bin/python router.py tool web_search "latest AI news" 2>&1 | head -20
echo ""

# Test 2: Read File (test with router.py itself)
echo "📍 Test 2: Read File"
venv/bin/python router.py tool read_file "{\"path\":\"router.py\"}" 2>&1 | head -10
echo ""

# Test 3: List Files
echo "📍 Test 3: List Files"
venv/bin/python router.py tool list_files "{\"path\":\".\",\"pattern\":\"*.py\"}" 2>&1
echo ""

echo "✅ Test suite completed"
