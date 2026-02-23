module.exports = {
  apps: [{
    name: 'nanoclaw-hermes',
    script: './node_modules/.bin/tsx',
    args: 'src/index.ts',
    cwd: '/Users/ryan/nanoclaw',
    instances: 1,
    exec_mode: 'fork',       // 必須 fork，不能 cluster（TG polling 不能多進程）
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
      ASSISTANT_NAME: '赫爾密斯',
      ENV_FILE: '.env.hermes',
      OBSIDIAN_MEMORY_DIR_NAME: 'hermes_memories',
      MAIN_GROUP_FOLDER: 'main',
    },
    error_file: '/tmp/nanoclaw-hermes-error.log',
    out_file: '/tmp/nanoclaw-hermes-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    // 重啟策略
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 3000,
    // 健康檢查
    listen_timeout: 10000,
    kill_timeout: 5000
  }]
}
