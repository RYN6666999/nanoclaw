
/**
 * CLI runner for NanoClaw tools.
 * Usage: node dist/tool-runner.mjs <tool_name> <json_arguments>
 */
import { getToolHandler } from './index.js';
import { logger } from '../logger.js';

async function main() {
    const toolName = process.argv[2];
    const argsJson = process.argv[3];

    if (!toolName) {
        console.error('Error: Tool name required');
        process.exit(1);
    }

    const handler = getToolHandler(toolName);
    if (!handler) {
        console.error(`Error: Tool '${toolName}' not found`);
        process.exit(1);
    }

    let args: Record<string, unknown> = {};
    if (argsJson) {
        try {
            args = JSON.parse(argsJson);
        } catch (e) {
            console.error('Error: Invalid JSON arguments');
            process.exit(1);
        }
    }

    try {
        const result = await handler(args);
        console.log(result);
    } catch (err) {
        console.error(`Error executing tool: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}

main().catch(console.error);
