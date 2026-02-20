/**
 * Web Search Tool — Multi-source unified search
 * Supports: Brave Search API, DuckDuckGo, Grok Search
 * Auto-selects best source + cleans & deduplicates results
 */
import type { Tool } from './index.js';
import { searchDeduplicator } from '../request-dedup.js';


interface SearchResult {
  title: string;
  url?: string;
  snippet: string;
  source: 'duckduckgo' | 'brave' | 'grok';
}

interface MergedResult {
  title: string;
  url?: string;
  snippet: string;
  sources: Set<string>;
  confidence: number; // 0-1: higher if verified across sources
}

/** DuckDuckGo HTML scraper (free, always available) */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NanoClaw/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const results: SearchResult[] = [];
    const regex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && results.length < 5) {
      const url = match[1].trim();
      const title = match[2].trim();
      const snippet = match[3]
        .replace(/<\/?b>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .trim();
      if (title && snippet) results.push({ title, url, snippet, source: 'duckduckgo' });
    }
    return results;
  } catch {
    return [];
  }
}

/** Brave Search API (premium quality) */
async function searchBrave(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.search.brave.com/res/v1/web/search', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as any;
    const results: SearchResult[] = [];
    const resultsWeb = data.web || [];
    for (const r of resultsWeb.slice(0, 5)) {
      if (r.title && r.description) {
        results.push({
          title: r.title,
          url: r.url,
          snippet: r.description,
          source: 'brave',
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Grok Search via OpenRouter (fast, real-time aware) */
async function searchGrok(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.SEARCH_MODEL || 'x-ai/grok-2',
        messages: [
          {
            role: 'system',
            content: `You are a search expert. When searching, prioritize:
1. Accuracy and factuality (verify with multiple sources)
2. Recency (latest information, especially for news/tech)
3. Authority (official sources, recognized experts)
4. Completeness (include key context and details)

Return ONLY valid JSON, no other text.`,
          },
          {
            role: 'user',
            content: `Search query: "${query}"

Find the 5 most accurate, recent, and authoritative results. For each result:
- title: Clear, specific headline
- url: Official or high-authority source URL
- snippet: 1-2 sentences with key facts, numbers, dates

Return as JSON array: [{"title":"...","url":"...","snippet":"..."},...]`,
          },
        ],
        max_tokens: 800,
        temperature: 0.3, // Lower temperature for factuality
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from Grok response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const results: SearchResult[] = [];

    if (Array.isArray(parsed)) {
      for (const item of parsed.slice(0, 5)) {
        if (item.title && item.snippet) {
          results.push({
            title: item.title,
            url: item.url,
            snippet: item.snippet,
            source: 'grok',
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

/** Merge results across sources with cross-validation */
function mergeResults(
  grokResults: SearchResult[],
  braveResults: SearchResult[],
  ddgResults: SearchResult[],
): MergedResult[] {
  const map = new Map<string, MergedResult>();

  // Normalize title key for matching (case-insensitive, remove punctuation)
  const normalizeKey = (title: string): string =>
    title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();

  // Add results from all sources
  const allResults = [
    ...grokResults.map((r) => ({ ...r, source: 'grok' as const })),
    ...braveResults.map((r) => ({ ...r, source: 'brave' as const })),
    ...ddgResults.map((r) => ({ ...r, source: 'duckduckgo' as const })),
  ];

  for (const result of allResults) {
    const key = normalizeKey(result.title);
    const existing = map.get(key);

    if (existing) {
      // Cross-verification: same info from multiple sources increases confidence
      existing.sources.add(result.source);
      existing.confidence = Math.min(1, existing.confidence + 0.2); // +0.2 per source
      // Keep longer/more detailed snippet
      if (result.snippet.length > existing.snippet.length) {
        existing.snippet = result.snippet;
      }
      // Prefer URL if not already set
      if (!existing.url && result.url) {
        existing.url = result.url;
      }
    } else {
      // New result
      map.set(key, {
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        sources: new Set([result.source]),
        confidence: 0.3, // Start low, increase with cross-verification
      });
    }
  }

  // Sort by confidence (cross-verification) + recency (Grok/Brave first)
  const merged = Array.from(map.values()).sort((a, b) => {
    const confDiff = b.confidence - a.confidence;
    if (confDiff !== 0) return confDiff;

    // Tiebreaker: prefer Grok (real-time) over Brave over DDG
    const sourceScore = (sources: Set<string>) => {
      let score = 0;
      if (sources.has('grok')) score += 3;
      if (sources.has('brave')) score += 2;
      if (sources.has('duckduckgo')) score += 1;
      return score;
    };

    return sourceScore(b.sources) - sourceScore(a.sources);
  });

  return merged;
}

/** Format merged results with confidence badges */
function formatResults(merged: MergedResult[], originalQuery: string): string {
  const output = merged
    .slice(0, 5)
    .map((r, i) => {
      // Detailed summary (expand from 280 to 400+ chars for fuller context)
      const snippet = r.snippet
        .replace(/\n+/g, ' ')
        .substring(0, 400)
        .trim();

      // Confidence badge based on cross-verification
      let badge = '❓';
      if (r.confidence >= 0.7) badge = '✅'; // Verified across sources
      else if (r.confidence >= 0.5) badge = '⚡'; // Good confidence
      else badge = '📌'; // Single source

      // Source tags
      const srcTags = Array.from(r.sources)
        .map((s) => (s === 'grok' ? '🧠' : s === 'brave' ? '⭐' : '🔍'))
        .join('');

      // URL always required (fallback: use title as reference if no URL available)
      const urlLine = r.url
        ? `🔗 ${r.url}`
        : `📌 (No URL available - ${Array.from(r.sources).join(', ')})`;

      return `${i + 1}. ${badge} ${r.title} ${srcTags}\n\n${snippet}\n\n${urlLine}`;
    })
    .join('\n\n───\n\n');

  // Append comprehensive search links for further exploration
  const searchLinks = `\n\n${'═'.repeat(60)}\n📍 完整搜尋結果請查看:\n\n🧠 Grok (X AI Search)\nhttps://x.com/search?q=${encodeURIComponent(originalQuery)}\n\n⭐ Brave Search\nhttps://search.brave.com/search?q=${encodeURIComponent(originalQuery)}\n\n🔍 DuckDuckGo\nhttps://html.duckduckgo.com/html/?q=${encodeURIComponent(originalQuery)}`;

  return (output || 'No results found') + searchLinks;
}

async function handler(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || '').trim();
  if (!query) return 'Error: query is required';

  return searchDeduplicator.execute(query, async () => {
    try {
      // Parallel queries from all sources
      const [grokResults, braveResults, ddgResults] = await Promise.all([
        searchGrok(query),
        searchBrave(query),
        searchDuckDuckGo(query),
      ]);

      // Merge + cross-validate + deduplicate across sources (using your mergeResults logic)
      const merged = mergeResults(grokResults, braveResults, ddgResults);

      if (merged.length === 0) return `No results found for: ${query}`;
      return formatResults(merged, query);
    } catch (err) {
      return `Search error: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
}

export const webSearch: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web with cross-source validation. Queries Grok (real-time), Brave API, and DuckDuckGo in parallel. Merges & deduplicates results by cross-verification. Returns top 5 with confidence badges (✅ verified, ⚡ good, 📌 single source) and source tags (🧠 Grok, ⭐ Brave, 🔍 DuckDuckGo). Includes clickable search links at the end for further exploration.',
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
