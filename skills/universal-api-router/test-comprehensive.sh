#!/bin/bash
echo "🔍 Comprehensive API Router Test Suite"
echo "========================================"
echo ""
echo "📋 Environment Check"
echo "-------------------"
source venv/bin/activate 2>/dev/null
python -c "
import sys
import os
print(f'Python: {sys.version}')
print(f'Working dir: {os.getcwd()}')
print(f'.env loaded: {'yes' if os.getenv(\"DEEPSEEK_API_KEY\") else 'no'})'
" 2>&1
echo ""

echo "🧪 Test 1: Basic Chat Functionality"
echo "-----------------------------------"
echo "Testing DeepSeek..."
python router.py chat "Please respond with 'DEEPSEEK_OK' if you receive this." --provider deepseek 2>&1 | tail -5
echo ""

echo "Testing Gemini..."
python router.py chat "Please respond with 'GEMINI_OK' if you receive this." --provider gemini 2>&1 | tail -5
echo ""

echo "🧪 Test 2: Tool Execution"
echo "-------------------------"
echo "Testing web_search..."
python router.py tool web_search '{"query":"test"}' 2>&1 | head -3
echo ""

echo "Testing read_file..."
python router.py tool read_file '{"path":"router.py"}' 2>&1 | head -3
echo ""

echo "🧪 Test 3: Error Handling"
echo "-------------------------"
echo "Testing invalid provider..."
python router.py chat "test" --provider invalidprovider123 2>&1 | head -2
echo ""

echo "Testing missing API key simulation..."
TEMP_KEY=$(echo $DEEPSEEK_API_KEY)
unset DEEPSEEK_API_KEY
python -c "
import router
r = router.ApiRouter()
result = r.chat('test', provider='deepseek')
print('Result:', 'ERROR' if 'Error' in result else 'OK')
" 2>&1 | head -2
export DEEPSEEK_API_KEY="$TEMP_KEY"
echo ""

echo "🧪 Test 4: Telegram Function (Dry Run)"
echo "--------------------------------------"
python -c "
import router
r = router.ApiRouter()
print('Telegram bot tokens available:')
print(f'  asis: {'yes' if r.keys['tg_asis'] else 'no'})
print(f'  love_papa: {'yes' if r.keys['tg_love_papa'] else 'no'})
" 2>&1
echo ""

echo "🧪 Test 5: Search Function"
echo "-------------------------"
python router.py search "test query" 2>&1 | head -3
echo ""

echo "✅ Test Suite Complete"
echo "======================"
