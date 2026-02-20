import {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  PADDLEOCR_ENABLED,
  PADDLEOCR_API_URL,
} from '../config.js';
import type { Tool } from './index.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const pendingImages: Map<string, { base64: string; mimeType: string }> =
  new Map();

export function storePendingImage(
  id: string,
  base64: string,
  mimeType: string,
): void {
  pendingImages.set(id, { base64, mimeType });
  setTimeout(() => pendingImages.delete(id), 5 * 60 * 1000);
}

export function consumePendingImage(
  id: string,
): { base64: string; mimeType: string } | undefined {
  const img = pendingImages.get(id);
  if (img) pendingImages.delete(id);
  return img;
}

export function hasPendingImage(id: string): boolean {
  return pendingImages.has(id);
}

const DOC_KEYWORDS = [
  '文字',
  '文件',
  '發票',
  '收據',
  '表格',
  '護照',
  '證件',
  '身份證',
  '駕照',
  '名片',
  '合約',
  '帳單',
  '報表',
  'invoice',
  'receipt',
  'document',
  'text',
  'ocr',
  '辨識',
  '識別',
  'extract',
  'copy',
  'scanned',
  'pdf',
  '影印',
];

export function isDocumentImage(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return DOC_KEYWORDS.some((kw) => lowerPrompt.includes(kw.toLowerCase()));
}

const PADDLE_PYTHON = '/opt/anaconda3/bin/python';
const PADDLE_SCRIPT = `
import os, sys, json, time
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'
os.environ['OMP_NUM_THREADS'] = '1'

import io
sys.stderr = io.StringIO()

from paddleocr import PaddleOCR

# Use explicitly cached models — no download triggered
ocr = PaddleOCR(
    text_detection_model_name='PP-OCRv5_server_det',
    text_recognition_model_name='PP-OCRv5_server_rec',
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)

img_path = sys.argv[1]
result = ocr.ocr(img_path)

texts = []
# PaddleOCR v3 API: result is list of dicts with rec_texts + rec_scores
if result and isinstance(result, list):
    for item in result:
        if isinstance(item, dict):
            for text, score in zip(item.get('rec_texts', []), item.get('rec_scores', [1.0])):
                if score >= 0.4 and text.strip():
                    texts.append(text.strip())
        elif isinstance(item, list):
            # Fallback: v2 format
            for line in item:
                if line and len(line) >= 2 and line[1]:
                    texts.append(str(line[1][0]))

print('\\n'.join(texts) if texts else '[No text detected]')
`;

export async function runPaddleOCR(imageData: {
  base64: string;
  mimeType: string;
}): Promise<string> {
  const tempDir = os.tmpdir();
  const ext = imageData.mimeType.includes('png') ? 'png' : 'jpg';
  const tempPath = path.join(tempDir, `ocr_${Date.now()}.${ext}`);
  const scriptPath = path.join(tempDir, `paddle_ocr_${Date.now()}.py`);

  fs.writeFileSync(tempPath, Buffer.from(imageData.base64, 'base64'));
  fs.writeFileSync(scriptPath, PADDLE_SCRIPT);

  return new Promise((resolve) => {
    const python = spawn(PADDLE_PYTHON, [scriptPath, tempPath], {
      timeout: 60000,
      env: { ...process.env, PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True', OMP_NUM_THREADS: '1' },
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (d) => { stdout += d.toString(); });
    python.stderr.on('data', (d) => { stderr += d.toString(); });

    python.on('close', (code) => {
      try { fs.unlinkSync(tempPath); } catch {}
      try { fs.unlinkSync(scriptPath); } catch {}

      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        const err = stderr.replace(/\x1B\[[0-9;]*m/g, '').split('\n').find(l => l.includes('Error') || l.includes('error')) || '';
        resolve(`[PaddleOCR failed: ${err || 'exit ' + code}]`);
      }
    });

    python.on('error', (err) => {
      try { fs.unlinkSync(tempPath); } catch {}
      try { fs.unlinkSync(scriptPath); } catch {}
      resolve(`[PaddleOCR unavailable: ${err.message}]`);
    });
  });
}

async function handler(args: Record<string, unknown>): Promise<string> {
  const imageId = String(args.image_id || '');
  const customPrompt = String(
    args.prompt || '描述這張圖片，包括主要內容、場景、細節和氛圍',
  );

  if (!imageId) {
    return '錯誤：需要 image_id 參數';
  }

  const imageData = consumePendingImage(imageId);
  if (!imageData) {
    return '錯誤：找不到待分析的圖片（可能已過期）。請重新發送圖片。';
  }

  if (PADDLEOCR_ENABLED && isDocumentImage(customPrompt)) {
    const ocrResult = await runPaddleOCR(imageData);
    if (!ocrResult.startsWith('[')) {
      return `📄 OCR 辨識結果 (PaddleOCR)：\n${ocrResult}`;
    }
    // PaddleOCR failed — fall through to Gemini Vision
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: imageData.mimeType,
                    data: imageData.base64,
                  },
                },
                { text: customPrompt },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return `Vision API 錯誤: ${response.status} ${errText}`;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const description = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!description) {
      return '無法分析這張圖片';
    }

    return description;
  } catch (err) {
    return `Vision 分析失敗: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const visionTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'analyze_image',
      description:
        '分析用戶發送的圖片。當用戶發送圖片並詢問相關問題時，調用此工具獲取圖片描述。返回圖片的詳細描述，包括內容、場景、物體、文字、氛圍等。',
      parameters: {
        type: 'object',
        properties: {
          image_id: {
            type: 'string',
            description: '圖片 ID（系統提供）',
          },
          prompt: {
            type: 'string',
            description:
              '自定義分析提示詞，例如「描述圖中的文字」「這是什麼物體？」（可選，默認為通用描述）',
          },
        },
        required: ['image_id'],
      },
    },
  },
  handler,
};
