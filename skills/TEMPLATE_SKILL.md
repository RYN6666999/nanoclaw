# SKILL.md Standard Template

# Based on SkillKit / Awesome-agent-skills specification

# Compatible with: OpenCode, Claude Code, Cursor, Copilot, Windsurf

---

name: skill-name
version: "1.0.0"
description: |
简短描述（中文）
Short description (English)
triggers:

- "关键词1"
- "keyword1"
- "/command"
  category: core | tool | superpower
  author: nanoclaw
  compatible-agents:
- opencode
- claude-code
- cursor
- copilot
  user-invocable: true | false
  allowed-tools:
- Read
- Write
- Edit
- Bash

# Add as needed

---

# Skill 名称 / Skill Name

## 🎯 用途 / Purpose

一句话描述这个 skill 的用途。
One-line description of what this skill does.

## 🚀 使用场景 / Use Cases

| 场景 / Scenario | 示例 / Example  |
| --------------- | --------------- |
| 场景1           | "触发关键词"    |
| 场景2           | "/command 参数" |

## ⚡ 快速开始 / Quick Start

### 触发方式 / Triggers

```
"关键词1"
"keyword1"
/command
```

## 📋 执行逻辑 / Execution Logic

1. **步骤 1**: 描述
2. **步骤 2**: 描述
3. **步骤 3**: 描述

## 🔧 配置 / Configuration

### 环境变量 / Environment Variables

| 变量 / Variable | 说明 / Description | 必需 / Required |
| --------------- | ------------------ | --------------- |
| `API_KEY`       | API 密钥           | 是 / Yes        |

### 依赖 / Dependencies

```bash
# 安装依赖
npm install xxx
pip install xxx
```

## 💡 最佳实践 / Best Practices

1. 建议 1
2. 建议 2
3. 建议 3

## ❓ 常见问题 / FAQ

### Q: 问题1？

A: 答案1

### Q: 问题2？

A: 答案2

---

**Token 优化提示**: 此模板使用 YAML frontmatter 压缩元数据，正文使用结构化 Markdown，便于 Agent 快速解析。
