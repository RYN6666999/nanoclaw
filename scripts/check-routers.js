
import fs from 'fs';
import path from 'path';

function loadDotEnv(envPath) {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0,i).trim();
    const v = t.slice(i+1).trim();
    env[k] = v;
  }
  return env;
}

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');
const dotenv = loadDotEnv(envPath);

function get(key) {
  return process.env[key] || dotenv[key] || '';
}

console.log('--- Router / Backend Config Check ---');
console.log('.env present:', fs.existsSync(envPath));
console.log('OPENROUTER_API_KEY set:', !!get('OPENROUTER_API_KEY'));
console.log('OPENROUTER_MODEL:', get('OPENROUTER_MODEL') || 'opencode/glm-5-free');
console.log('GOOGLE_API_KEY (Gemini) set:', !!get('GOOGLE_API_KEY'));
console.log('GEMINI_MODEL:', get('GEMINI_MODEL') || 'gemini-2.5-flash-lite');
console.log('GEMINI_AUTO_THRESHOLD:', get('GEMINI_AUTO_THRESHOLD') || '50000');
console.log('ASSISTANT_NAME:', get('ASSISTANT_NAME') || 'Andy');
console.log('ROUTER_CONFIG file present (searching repo):');

function findRouterConfig(dir) {
  const results = [];
  function walk(d) {
    const list = fs.readdirSync(d, { withFileTypes: true });
    for (const it of list) {
      const p = path.join(d, it.name);
      if (it.isDirectory()) {
        if (it.name === 'node_modules' || it.name.startsWith('.')) continue;
        walk(p);
      } else {
        if (it.name === 'router-config.json') results.push(p);
      }
    }
  }
  try { walk(dir); } catch (e) {}
  return results;
}

const found = findRouterConfig(projectRoot);
console.log(found.length ? found.join('\n') : 'none');

console.log('\nSuggestions:');
console.log('- If auto-routing not working, ensure the relevant API keys are set in .env or environment: OPENROUTER_API_KEY, GOOGLE_API_KEY.');
console.log('- Restart NanoClaw process after updating env.');
console.log('- To override router behavior, create router-config.json in obsidian memory folder.');

process.exit(0);
