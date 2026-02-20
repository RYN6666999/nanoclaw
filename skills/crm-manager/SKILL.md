---
name: crm-manager
version: 1.0.0
description: |
  Manages client relationships in Obsidian.
  Provides structured access to client notes in the `Clients/` directory.
  Identify client names, update statuses, and log interaction history from Telegram/WhatsApp.
  Keywords: "add client", "crm", "customer", "interaction log", "contact info", "client status".
---

# CRM Manager

## Core Functions

This skill enables the agent to act as a CRM assistant by managing files in the Obsidian vault at:
`/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/Clients/`

### 1. Identify Client Context
When a user mentions a person or company, check if a corresponding file exists in `Clients/`.

### 2. Create New Client
If a new client is identified:
1. Read `/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/Clients/_Template.md`.
2. Replace placeholders `{{name}}`, `{{contact}}`, `{{date}}`, `{{summary}}`.
3. Save to `Clients/[Client Name].md`.

### 3. Log Interaction
When a significant conversation occurs:
1. Locate the client file.
2. Find the `## 💬 Interaction History` section.
3. Append a new H3 entry with the current date and summary.

### 4. Update Status
Clients have a status tag (e.g., `#Lead`, `#Prospect`, `#Active`, `#Closed`).
Update the frontmatter or header area accordingly.

## Template Guide
Use the `_Template.md` for consistency.

## Example Interaction
User: "我今天跟王小明開會，他對我們的方案很有興趣。"
AI Action:
- Find `王小明.md`.
- If not found, create it using template.
- Log: `### 2026-02-08 - Meeting Summary | 他對方案有興趣 ...`
