/**
 * Anime Image Search Tool - Search images from Danbooru
 */
import fs from "fs";
import path from "path";
import type { Tool } from "./index.js";

const DANBOORU_API = "https://danbooru.donmai.us";
const OUTPUT_DIR = process.env.NANOCLAW_IMAGE_DIR || "/tmp/nanoclaw-images";

interface DanbooruPost {
  id: number;
  file_url: string;
  tag_string: string;
  rating: string;
  source: string;
  width: number;
  height: number;
}

async function handler(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || "");
  const limit = Number(args.limit) || 5;

  if (!query) {
    return "Error: query is required";
  }

  // Convert Chinese keywords to English
  const keywords = convertKeywords(query);

  // Search Danbooru
  const posts = await searchDanbooru(keywords, limit);

  if (posts.length === 0) {
    return `找不到符合 "${query}" 的圖片`;
  }

  // Format results
  const results = posts.map((post, idx) => {
    const tags = post.tag_string.split(" ").slice(0, 10).join(", ");
    const rating =
      post.rating === "s"
        ? "✅ safe"
        : post.rating === "q"
          ? "⚠️ questionable"
          : "❌ explicit";
    return `${idx + 1}. [${rating}] ${post.width}x${post.height}\n   Tags: ${tags}\n   URL: ${post.file_url}`;
  });

  return `找到 ${posts.length} 張圖片：\n\n${results.join("\n\n")}\n\n📝 發送圖片編號或「1」選擇第一張進行 img2img`;
}

function convertKeywords(query: string): string {
  const mapping: Record<string, string> = {
    貓娘: "catgirl",
    貓耳: "cat_ears",
    巨乳: "large_breasts",
    黑絲: "black_thighhighs",
    銀髮: "silver_hair",
    蘿莉: "loli",
    濕身: "wet_clothes",
    泳裝: "swimsuit",
    制服: "uniform",
    女僕: "maid",
    狐狸: "fox_girl",
    狐狸耳: "fox_ears",
    尾巴: "tail",
    乳牛: "cow_ears",
    天使: "angel",
    惡魔: "devil",
    精靈: "elf",
  };

  let keywords = query;
  for (const [cn, en] of Object.entries(mapping)) {
    keywords = keywords.replace(new RegExp(cn, "gi"), en);
  }

  // Add anime style tag
  return `${keywords} 1girl`;
}

async function searchDanbooru(
  keywords: string,
  limit: number,
): Promise<DanbooruPost[]> {
  try {
    const url = `${DANBOORU_API}/posts.json?tags=${encodeURIComponent(keywords)}&limit=${limit}&json=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "NanoClaw/1.0 (Telegram Bot)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Danbooru API error: ${response.status}`);
    }

    const data = (await response.json()) as DanbooruPost[];

    // Filter to only safe and questionable (exclude explicit)
    return data.filter((p) => p.rating !== "e").slice(0, limit);
  } catch (err) {
    throw new Error(
      `搜尋失敗: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export const searchAnimeImage: Tool = {
  definition: {
    type: "function",
    function: {
      name: "search_anime_image",
      description:
        "Search anime-style reference images from Danbooru. Returns list of image URLs with tags.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'Search query in Chinese or English (e.g., "catgirl", "巨乳貓娘")',
          },
          limit: {
            type: "number",
            description: "Number of results to return (default: 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  handler,
};
