/**
 * Web Search Tool — uses DuckDuckGo HTML search (no API key needed)
 */
import type { Tool } from './index.js';

async function handler(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || '');
  if (!query) return 'Error: query is required';

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NanoClaw/1.0 (search tool)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return `Search failed: HTTP ${res.status}`;

    const html = await res.text();

    // Extract result snippets from DDG HTML
    const results: string[] = [];
    const regex = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && results.length < 5) {
      const title = match[1].trim();
      const snippet = match[2].replace(/<\/?b>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").trim();
      results.push(`${title}\n${snippet}`);
    }

    if (results.length === 0) return `No results found for: ${query}`;
    return results.join('\n\n');
  } catch (err) {
    return `Search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const webSearch: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Returns top 5 results with titles and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },
  },
  handler,
};
