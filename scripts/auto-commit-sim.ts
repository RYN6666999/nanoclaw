import autoCommit from '../src/auto-commit.js';
import { AUTO_COMMIT_ENABLED } from '../src/config.js';

const apply = process.argv.includes('--apply');
const handoffs = autoCommit.loadHandoffs();
if (!handoffs.length) {
  console.error('No handoff suggestions found.');
  process.exit(1);
}

console.log(`Loaded ${handoffs.length} handoff suggestion(s)`);
const actions = autoCommit.applyHandoffs(handoffs, { apply, autoCommitEnabled: AUTO_COMMIT_ENABLED });

for (const a of actions) {
  console.log('---');
  console.log('group:', a.group);
  console.log('commit message:', a.message);
  console.log('committed:', a.committed);
}

if (!apply) console.log('(dry-run) To apply: npx tsx scripts/auto-commit-sim.ts --apply');
