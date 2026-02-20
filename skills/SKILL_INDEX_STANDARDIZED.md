# NanoClaw Skills Index (Standardized)
# Format: SkillKit / Awesome-agent-skills Specification

## 📂 目录结构 / Directory Structure

```
skills/
├── core/                    # 核心功能 Core Functions
│   ├── session-reset/       # 会话重置
│   └── planning-with-files/ # 文件规划
├── tools/                   # 工具集成 Tool Integrations
│   ├── media-downloader/    # 媒体下载
│   ├── image-generation/    # 图片生成
│   └── crm-manager/         # CRM 管理
├── superpowers/             # 高级能力 Advanced Capabilities
│   ├── test-driven-development/
│   ├── systematic-debugging/
│   └── writing-plans/
└── TEMPLATE_SKILL.md        # 标准模板
```

## 📊 Skills 清单 / Skills Inventory

### Core Skills

| Skill | Description | Triggers | Token Cost |
|-------|-------------|----------|------------|
| session-reset | 清空对话并开始新会话 | "重置对话", "new session" | Low |
| planning-with-files | Manus 风格文件规划 | 复杂任务自动触发 | Medium |
| token_minimization | Token 优化指南 | - | Low |

### Tool Skills

| Skill | Description | Triggers | Token Cost |
|-------|-------------|----------|------------|
| media-downloader | 智能媒体下载器 | "下载图片", "download media" | Medium |
| image-generation | AI 图片生成 | "/draw", "生成图片" | High |
| crm-manager | Obsidian CRM 管理 | "add client", "crm" | Low |

### Superpowers

| Skill | Description | Triggers | Token Cost |
|-------|-------------|----------|------------|
| test-driven-development | 测试驱动开发 | 实现功能前自动触发 | Medium |
| systematic-debugging | 系统化调试 | Bug 修复时触发 | Medium |
| writing-plans | 编写实现计划 | 多步骤任务前触发 | Low |

## 🔌 跨平台兼容性 / Cross-Platform Compatibility

| Skill | OpenCode | Claude | Cursor | Copilot |
|-------|----------|--------|--------|---------|
| session-reset | ✅ | ✅ | ✅ | ✅ |
| planning-with-files | ✅ | ✅ | ⚠️ | ❌ |
| media-downloader | ✅ | ✅ | ✅ | ✅ |
| image-generation | ✅ | ✅ | ✅ | ✅ |

## 📈 Token 优化统计

- **标准化前**: 平均 skill 加载 2,000-3,000 tokens
- **标准化后**: 平均 skill 加载 800-1,200 tokens
- **预期降低**: 40-50%

## 📝 标准化规范

1. **YAML Frontmatter**: 必须包含 name, description, triggers
2. **双语支持**: 中文 + 英文
3. **触发关键词**: 明确列出所有 triggers
4. **Token 标注**: 标明每个 skill 的 token 消耗等级
5. **兼容性声明**: 列出支持的 Agent 平台

---

Last Updated: 2026-02-19
