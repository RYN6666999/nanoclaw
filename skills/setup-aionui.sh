#!/bin/bash
# NanoClaw + Aionui Integration Setup Script
# Run this to complete the integration

echo "🚀 NanoClaw + Aionui Integration Setup"
echo "========================================"
echo ""

# Step 1: Check Aionui installation
AIONUI_SKILLS="/Users/ryan/Library/Application Support/AionUi/config/skills"
if [ ! -d "$AIONUI_SKILLS" ]; then
    echo "❌ Error: Aionui skills directory not found at $AIONUI_SKILLS"
    exit 1
fi
echo "✅ Aionui skills directory found"

# Step 2: Copy skill files
echo "📦 Copying NanoClaw skill files..."
cp /Users/ryan/nanoclaw/skills/nanoclaw-tools-aionui.md "$AIONUI_SKILLS/nanoclaw-tools.md"
cp /Users/ryan/nanoclaw/skills/nanoclaw_aionui.py "$AIONUI_SKILLS/nanoclaw_aionui.py"
chmod +x "$AIONUI_SKILLS/nanoclaw_aionui.py"
echo "✅ Skill files copied"

# Step 3: Verify tool runner
TOOL_RUNNER="/Users/ryan/nanoclaw/dist/tool-runner.mjs"
if [ ! -f "$TOOL_RUNNER" ]; then
    echo "⚠️  Tool runner not found, building..."
    cd /Users/ryan/nanoclaw
    npx esbuild src/tools/tool-runner.ts --bundle --platform=node --format=esm --outfile=dist/tool-runner.mjs --external:pino --external:pino-pretty
    echo "✅ Tool runner built"
else
    echo "✅ Tool runner exists"
fi

# Step 4: Test integration
echo ""
echo "🧪 Testing integration..."
cd /Users/ryan/nanoclaw/skills
python3 nanoclaw_aionui.py search "test query" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Integration test passed"
else
    echo "⚠️  Integration test failed (this might be normal if APIs are rate-limited)"
fi

# Step 5: Create quick reference
echo ""
echo "📚 Creating quick reference..."
cat > "$AIONUI_SKILLS/NANOCLAW_QUICKREF.txt" << 'EOF'
NanoClaw Tools - Quick Reference
=================================

Usage in Aionui Python:
-----------------------
from nanoclaw_aionui import nanoclaw_tool, web_search, read_file, obsidian_note

# Web Search
result = web_search("AI news")

# File Operations
content = read_file("/path/to/file.txt")
list_files("/Users/ryan/Documents", "*.md")

# Obsidian
obsidian_note("Title", "# Content")

# Image Generation
generate_image("A beautiful sunset")

Available Tools:
----------------
- web_search: Multi-source web search
- read_file: Read file contents
- write_file: Write to file
- edit_file: Edit file content
- list_files: List directory files
- grep_search: Search in files
- obsidian_note: Create Obsidian note
- generate_image: AI image generation
- bash_exec: Execute shell commands

Full documentation: See nanoclaw-tools.md
EOF
echo "✅ Quick reference created"

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Restart Aionui to load the new skill"
echo "2. In Aionui, try: from nanoclaw_aionui import web_search"
echo "3. Test: web_search('latest AI news')"
echo ""
echo "Documentation: $AIONUI_SKILLS/nanoclaw-tools.md"
echo "Quick Ref: $AIONUI_SKILLS/NANOCLAW_QUICKREF.txt"
