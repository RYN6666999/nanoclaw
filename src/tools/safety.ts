/**
 * Safety — only block operations that destroy SYSTEM files.
 * Everything else is allowed: git push, kill, rm project files, etc.
 * The ONLY red line: deleting/overwriting system paths.
 */

const SYSTEM_PATHS = [
  '/usr', '/bin', '/sbin', '/etc', '/System', '/Library',
  '/var', '/opt', '/boot', '/dev', '/proc', '/sys',
];

const SYSTEM_PATH_REGEX = new RegExp(
  `\\brm\\s+[^|;]*(?:${SYSTEM_PATHS.map((p) => p.replace('/', '\\/')).join('|')})`,
);

// Fork bomb and disk format — always block
const ALWAYS_BLOCK = [
  /:()\s*\{/,                    // fork bomb
  /\b(mkfs|fdisk)\b/,           // disk format
  /\bdd\s+if=.*of=\/dev/,       // dd to device
];

export function isDangerousCommand(command: string): boolean {
  // Block: rm on system paths
  if (SYSTEM_PATH_REGEX.test(command)) return true;
  // Block: fork bomb, disk format
  return ALWAYS_BLOCK.some((p) => p.test(command));
}
