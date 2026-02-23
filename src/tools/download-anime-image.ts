/**
 * Anime Image Download Tool - Download images with anti-hotlink handling
 */
import fs from "fs";
import path from "path";
import type { Tool } from "./index.js";

const OUTPUT_DIR = process.env.NANOCLAW_IMAGE_DIR || "/tmp/nanoclaw-images";

async function handler(args: Record<string, unknown>): Promise<string> {
  const imageUrl = String(args.url || "");

  if (!imageUrl) {
    return "Error: url is required";
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const filename = `ref-${Date.now()}.${getExtension(imageUrl)}`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  try {
    const referer = imageUrl.includes("donmai.us")
      ? "https://danbooru.donmai.us/"
      : "https://www.pixiv.net/";

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "NanoClaw/1.0 (Telegram Bot)",
        Referer: referer,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    const base64 = buffer.toString("base64");
    return `__IMAGE_BASE64__${base64}__IMAGE_PATH__${outputPath}`;
  } catch (err) {
    return `下載失敗: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function getExtension(url: string): string {
  const ext = url.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")
    ? ext || "jpg"
    : "jpg";
}

export const downloadAnimeImage: Tool = {
  definition: {
    type: "function",
    function: {
      name: "download_anime_image",
      description:
        "Download an image from URL and return base64. Handles anti-hotlinking with proper Referer headers.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Image URL to download",
          },
        },
        required: ["url"],
      },
    },
  },
  handler,
};
