# SeMeow Channel Reading Implementation Plan

**Status**: Ready to execute
**Task**: Enable SeMeow bot to read Telegram channel messages
**Root Cause**: Telegram bot requires specific permissions and settings before receiving messages

## Progress Check

**已完成 ✅**:
- `config.ts`: `SE_MEOW_BOX_CHANNEL_ID` defined
- `telegram.ts`: `getMessagesSince` and `storeTelegramMessage` implemented
- `Conversations/current/channel-setup.md`: Progress recorded

**待完成 📝**:
- Privacy mode disabled on SeMeow bot
- TELEGRAM_BOT_TOKEN set in `.env`
- Bot added to target channel with read permissions
- Test verification

## Implementation Plan

### Phase 1: Telegram Server Configuration (Critical)
**Action**: Bot must be able to receive messages from channel

1. **Disable Privacy Mode**
   ```bash
   /setprivacy
   Select: @ryanplus_bot (SeMeow)
   Change: disable
   ```
   *If script needed: Create `scripts/privacy-toggle.sh` to automate this*

2. **Add Bot to Channel**
   ```bash
   # Using channel admin
   /joinchannel [channel_username]
   ```
   *Or: Channel admin adds bot to members list*

3. **Grant Read Permissions**
   - Channel admin sets bot with "Can read messages" permission
   - Or: Bot is added as a member (can receive messages)

### Phase 2: Environment Setup
**Action**: Bot needs valid token to operate

1. **Get Token from BotFather**
   ```bash
   # Start conversation with @BotFather
   /newbot -> create new bot
   Copy: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

2. **Add to `.env`**
   ```bash
   echo "TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz" >> .env
   ```
   *Or: Add to `config.ts` if no `.env` exists*

### Phase 3: Code Verification
**Action**: Ensure code is ready to process incoming messages

1. **Verify Channel ID**
   ```bash
   # Get channel ID from Telegram
   /getchannelid [channel_username]
   ```
   *Check: `SE_MEOW_BOX_CHANNEL_ID` matches expected value*

2. **Check Message Handler**
   ```bash
   grep -n "channelId === SE_MEOW_BOX_CHANNEL_ID" src/telegram.ts
   ```
   *If missing, add in `messageHandler` function*

### Phase 4: Test & Validate
**Action**: Verify end-to-end functionality

1. **Send Test Message**
   ```bash
   # In target channel
   Test: "Hello SeMeow, this is a test message"
   ```

2. **Check Logs**
   ```bash
   tail -20 /tmp/nanoclaw-semew-*.log
   ```
   *Expected: `[SE_MEOW] Received message from channel`*

3. **Verify Storage**
   ```bash
   sqlite3 src/database.sqlite "SELECT COUNT(*) FROM messages WHERE source='telegram';"
   ```
   *Expected: > 0 after test*

## Success Criteria

- [ ] Bot receives messages from target channel
- [ ] Messages are stored in SQLite database
- [ ] No error logs related to privacy or token
- [ ] Test message appears in logs

## Notes

- Privacy mode must be disabled BEFORE bot joins channel for changes to take effect
- If bot is already in channel, it must leave and re-join after privacy change
- Channel username must be in the format `@channelname` or numeric ID
- No code changes needed if `telegram.ts` already has channel filtering logic
