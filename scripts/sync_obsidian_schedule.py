import sqlite3
import re
import os
import hashlib
from datetime import datetime

OBSIDIAN_SCHEDULE_PATH = os.environ.get(
    "OBSIDIAN_SCHEDULE_PATH",
    os.path.join(os.path.dirname(__file__), "..", "Obsidian", "Nano_Memories", "SCHEDULE.md")
)
DB_PATH = os.environ.get(
    "NANOCLAW_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "store", "messages.db")
)
DEFAULT_CHAT_JID = "8227006739"  # Love_papa
DEFAULT_GROUP = "main"

def parse_schedule_md():
    tasks = []
    if not os.path.exists(OBSIDIAN_SCHEDULE_PATH):
        print(f"Schedule file not found: {OBSIDIAN_SCHEDULE_PATH}")
        return tasks

    with open(OBSIDIAN_SCHEDULE_PATH, 'r') as f:
        for line in f:
            line = line.strip()
            # Match pattern: - `cron | prompt`
            match = re.match(r'- `(.*)`', line)
            if match:
                content = match.group(1)
                parts = [p.strip() for p in content.split('|')]
                
                if len(parts) >= 2:
                    cron_expr = parts[0]
                    prompt = parts[-1] 
                    
                    tasks.append({
                        'cron': cron_expr,
                        'prompt': prompt,
                        'raw': content
                    })
    return tasks

def sync_db(tasks):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print(f"Found {len(tasks)} tasks in Markdown.")
    
    active_ids = []

    for task in tasks:
        # Generate stable ID
        task_id = hashlib.md5(f"{task['cron']}:{task['prompt']}".encode()).hexdigest()
        active_ids.append(task_id)
        
        # Check if exists
        cursor.execute("SELECT id FROM scheduled_tasks WHERE id = ?", (task_id,))
        exists = cursor.fetchone()
        
        now = datetime.now().isoformat()
        
        if not exists:
            print(f"Creating task: {task['prompt']} ({task['cron']})")
            try:
                cursor.execute("""
                    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (task_id, DEFAULT_GROUP, DEFAULT_CHAT_JID, task['prompt'], 'cron', task['cron'], 'isolated', 'active', now))
            except sqlite3.OperationalError as e:
                print(f"Error inserting task: {e}")
                pass
        else:
            # Update active status if needed
            cursor.execute("UPDATE scheduled_tasks SET status = 'active' WHERE id = ?", (task_id,))

    if active_ids:
        placeholders = ','.join(['?'] * len(active_ids))
        cursor.execute(f"UPDATE scheduled_tasks SET status = 'inactive' WHERE id NOT IN ({placeholders}) AND status = 'active'", active_ids)
        if cursor.rowcount > 0:
            print(f"Deactivated {cursor.rowcount} tasks not in Markdown.")
    else:
        cursor.execute("UPDATE scheduled_tasks SET status = 'inactive' WHERE status = 'active'")
        if cursor.rowcount > 0:
            print(f"Deactivated {cursor.rowcount} tasks (Markdown is empty).")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    tasks = parse_schedule_md()
    sync_db(tasks)
