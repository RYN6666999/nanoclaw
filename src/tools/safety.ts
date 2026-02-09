/**
 * Safety — block truly destructive bash commands.
 * Philosophy: only block irreversible/catastrophic operations.
 * Normal dev operations (write, edit, kill, restart) are fine.
 */

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[^\s]*r|-[^\s]*f|--recursive)/,   // rm -r, rm -rf, rm -fr
  /\brm\s+-[^\s]*\s+\//,                        // rm anything at root
  /\b(reboot|shutdown|halt|poweroff)\b/,         // system shutdown
  /\bgit\s+push\s+--force/,                      // force push
  /\bgit\s+reset\s+--hard/,                      // hard reset
  /\b(mkfs|fdisk|dd\s+if=)/,                     // disk operations
  /\b(drop\s+table|truncate\s+table)/i,          // SQL destruction
  /:()\s*\{/,                                     // fork bomb
];

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(command));
}
