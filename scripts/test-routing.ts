import { routeMessage } from '../src/model-router.js';
import { GEMINI_AUTO_THRESHOLD } from '../src/config.js';

function makeLongText(n: number) {
  return 'word '.repeat(n);
}

const tests: { name: string; prompt: string; scheduled?: boolean }[] = [
  { name: 'short user question', prompt: '請幫我寫一段 JS 函數，輸出兩數相加' },
  { name: 'prefix flash', prompt: '/flash 請幫我優化下面的程式碼' },
  { name: 'deep rp', prompt: '我們開始角色扮演：你扮演一個古代武士' },
  { name: 'long document', prompt: makeLongText(Math.ceil(((GEMINI_AUTO_THRESHOLD || 50000) + 1) / 5)) },
];

for (const t of tests) {
  const r = routeMessage(t.prompt, !!t.scheduled);
  console.log('---');
  console.log('test:', t.name);
  console.log('prompt length:', t.prompt.length);
  console.log('route:', r.backend, r.model, 'reason=', r.reason);
}
