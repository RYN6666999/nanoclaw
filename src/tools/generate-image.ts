/**
 * Image Generation Tool — uses HuggingFace Inference API (FLUX.1-schnell)
 * Falls back to Draw Things local API if available.
 * Returns a special marker [IMAGE:/path/to/file.png] for Telegram to send as photo.
 */
import fs from 'fs';
import path from 'path';

import type { Tool } from './index.js';

// Qwen-Image: 中文支援優秀, Z-Image-Turbo: 雙語支援, Hyper-SD: 強大
const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/Qwen/Qwen-Image';
const DRAW_THINGS_URL = 'http://127.0.0.1:7860';
const OUTPUT_DIR = process.env.NANOCLAW_IMAGE_DIR || '/tmp/nanoclaw-images';
const TIMEOUT = 120000; // 2 minutes

async function handler(args: Record<string, unknown>): Promise<string> {
  const prompt = String(args.prompt || '');
  if (!prompt) return 'Error: prompt is required';

  const width = Number(args.width) || 1024;
  const height = Number(args.height) || 1024;
  const seed = args.seed ? Number(args.seed) : Math.floor(Math.random() * 2147483647);

  // Check if this is img2img (has image parameter)
  const initImage = args.image as string | undefined;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = `gen-${Date.now()}.png`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  // Try Draw Things local API first (free, no limits, uncensored)
  try {
    // img2img if initImage provided, otherwise txt2img
    const dtResult = initImage
      ? await tryDrawThingsImg2Img(initImage, prompt, width, height, seed, outputPath)
      : await tryDrawThings(prompt, width, height, seed, outputPath);
    if (dtResult) return dtResult;
  } catch {
    // Fall through to HF API
  }

  // Fallback: HuggingFace Inference API
  try {
    return await tryHuggingFace(prompt, width, height, outputPath);
  } catch (err) {
    return `生圖失敗: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function tryDrawThings(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  outputPath: string,
): Promise<string | null> {
  // Check if Draw Things API is running (root endpoint always responds)
  const healthCheck = await fetch(`${DRAW_THINGS_URL}/`, {
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);

  if (!healthCheck?.ok) return null;

  // Draw Things API (A1111-compatible txt2img)
  const response = await fetch(`${DRAW_THINGS_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      width,
      height,
      seed,
      steps: 28,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      loras: [],
      controls: [],
      model: 'realistic_vision_v6.0_f16.ckpt',
      override_settings: {
        sd_model_checkpoint: 'realistic_vision_v6.0_f16.ckpt',
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { images?: string[] };
  if (!data.images?.[0]) return null;

  // Save base64 image
  const buffer = Buffer.from(data.images[0], 'base64');
  fs.writeFileSync(outputPath, buffer);

  return `[IMAGE:${outputPath}]\n生成完成 (Draw Things 本地, seed: ${seed})`;
}

async function tryHuggingFace(
  prompt: string,
  width: number,
  height: number,
  outputPath: string,
): Promise<string> {
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`;
  }

  const response = await fetch(HF_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inputs: prompt,
      parameters: { width, height },
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HuggingFace API ${response.status}: ${errText}`);
  }

  // Response is raw image bytes
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  return `[IMAGE:${outputPath}]\n生成完成 (Qwen-Image)`;
}

// ==================== img2img Support ====================

async function tryDrawThingsImg2Img(
  initImageBase64: string,
  prompt: string,
  width: number,
  height: number,
  seed: number,
  outputPath: string,
): Promise<string | null> {
  // Check if Draw Things API is running
  const healthCheck = await fetch(`${DRAW_THINGS_URL}/`, {
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);

  if (!healthCheck?.ok) return null;

  // Draw Things API img2img
  const response = await fetch(`${DRAW_THINGS_URL}/sdapi/v1/img2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      init_images: [initImageBase64],
      prompt,
      denoising_strength: 0.45,
      width,
      height,
      seed,
      steps: 28,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { images?: string[] };
  if (!data.images?.[0]) return null;

  // Save base64 image
  const buffer = Buffer.from(data.images[0], 'base64');
  fs.writeFileSync(outputPath, buffer);

  return `[IMAGE:${outputPath}]\n生成完成 (Draw Things img2img, seed: ${seed})`;
}

export const generateImage: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image from text prompt (txt2img) or from reference image (img2img). For img2img, provide base64 image in the image parameter.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Image generation prompt in English (e.g. "a beautiful catgirl, anime style")',
          },
          image: {
            type: 'string',
            description: 'Optional: base64 encoded reference image for img2img. If provided, will generate based on this image.',
          },
          width: {
            type: 'number',
            description: 'Image width in pixels (default: 1024)',
          },
          height: {
            type: 'number',
            description: 'Image height in pixels (default: 1024)',
          },
          seed: {
            type: 'number',
            description: 'Random seed for reproducibility (optional)',
          },
        },
        required: ['prompt'],
      },
    },
  },
  handler,
};
