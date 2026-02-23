module.exports = {
  apps: [{
    name: 'nanoclaw-semeow',
    script: '/Users/ryan/nanoclaw/node_modules/.bin/tsx',
    args: 'src/index.ts',
    cwd: '/Users/ryan/nanoclaw',
    instances: 1,
    exec_mode: 'fork',       // 必須 fork，不能 cluster（TG polling 不能多進程）
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    // env 區塊在 fork mode 下完整傳入
    env: {
      NODE_ENV: 'production',
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
      ENV_FILE: '/Users/ryan/nanoclaw/.env.semeow',
      ASSISTANT_NAME: '瑟喵',
      OBSIDIAN_MEMORY_DIR_NAME: 'semeow_memories',
      MAIN_GROUP_FOLDER: 'semeow',
    },
    error_file: '/tmp/nanoclaw-semeow-error.log',
    out_file: '/tmp/nanoclaw-semeow-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 3000,
    listen_timeout: 10000,
    kill_timeout: 5000
  }]
}
