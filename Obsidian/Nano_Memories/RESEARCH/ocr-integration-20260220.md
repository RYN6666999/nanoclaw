# OCR 整合研究工作日誌

**日期**: 2026-02-20  
**主題**: PaddleOCR-VL 視覺辨識系統優化評估  
**狀態**: ✅ 已修復 (2026-02-20 v2)

---

## 1. 研究目標

評估是否能用本地 PaddleOCR-VL 替代/增強現有 Gemini Vision 功能。

---

## 2. 研究結果

### 2.1 候選方案

| 方案                 | 參數量 | OmniDocBench 分數 | 特色                 |
| -------------------- | ------ | ----------------- | -------------------- |
| **PaddleOCR-VL-1.5** | 0.9B   | **94.5%**         | 輕量開源、文件領域強 |
| **DeepSeek-OCR2**    | 3B MoE | 91.09%            | 多模態能力強         |

### 2.2 PaddleOCR-VL 優勢

- **僅 0.9B 參數**：消費級 GPU/CPU 即可運行
- **109 種語言**：涵蓋中文、英文、日文、阿拉伯文等
- **文件理解**：表格、公式、印章、二維碼、歪斜文件
- **開源免費**：可本地部署，零 API 成本
- **全球第一**：OmniDocBench 文件解析基準冠軍

### 2.3 部署方式

```bash
# Python API (推薦)
pip install paddlepaddle paddleocr
paddleocr doc_parser -i ./image.png

# FastDeploy API 服務
python -m fastdeploy.entrypoints.openai.api_server \
    --model PaddlePaddle/PaddleOCR-VL \
    --port 8185
```

---

## 3. 整合架構設計

### 3.1 雙模式判斷

```
用戶發送圖片
    ↓
[場景判斷邏輯]
    ├─ 文件/發票/表格/文字 → PaddleOCR-VL (精準)
    └─ 場景/人物/物品 → Gemini Vision (通用)
    ↓
輸出結果
```

### 3.2 程式碼改動範圍

| 檔案                  | 改動內容                                  |
| --------------------- | ----------------------------------------- |
| `src/config.ts`       | 新增 `PADDLEOCR_API_URL` 配置             |
| `src/tools/vision.ts` | 新增 `runPaddleOCR()` 函數 + 場景判斷邏輯 |
| `src/tools/index.ts`  | 註冊新工具（如需獨立調用）                |

---

## 4. 成本分析

| 方案                | 成本      | 適合場景            |
| ------------------- | --------- | ------------------- |
| Gemini Vision       | API 計費  | 通用圖片理解        |
| PaddleOCR-VL (本地) | 硬體/電費 | 文件/發票/表格/護照 |

---

## 5. 下一步行動

- [ ] 安裝 PaddleOCR 環境
- [ ] 測試 CLI 基本功能
- [ ] 設計場景判斷 prompt
- [ ] 修改 vision.ts 實作整合
- [ ] 測試對比 Gemini vs PaddleOCR

---

## 6. 參考資源

- [PaddleOCR-VL GitHub](https://github.com/PaddlePaddle/PaddleOCR)
- [PaddleOCR-VL HuggingFace](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5)
- [FastDeploy 部署文檔](https://paddlepaddle.github.io/FastDeploy/best_practices/PaddleOCR-VL-0.9B/)

---

## 7. 實作記錄 (2026-02-20)

### 已完成

1. **環境安裝**
   - `pip install paddlepaddle paddleocr`
   - `pip install "paddlex[ocr]"` (額外依賴)

2. **程式碼改動**
   - `src/config.ts`: 新增 `PADDLEOCR_ENABLED` 和 `PADDLEOCR_API_URL`
   - `src/tools/vision.ts`: 新增 `isDocumentImage()` 判斷函數 + `runPaddleOCR()` 函數
   - 邏輯：當 prompt 包含文件關鍵字時自動使用 PaddleOCR

3. **配置**
   - `.env` 新增 `PADDLEOCR_ENABLED=true` 啟用功能

### 測試 1: 基本環境

**時間**: 2026-02-20 01:15
**結果**: ❌ 失敗
**問題**: ModuleNotFoundError: No module named 'paddleocr'
**修復**: 使用 anaconda python 路徑 (`/opt/anaconda3/bin/python`)

### 測試 2: 參數錯誤

**時間**: 2026-02-20 01:20
**結果**: ❌ 失敗
**問題**: `show_log` 參數不存在
**修復**: 移除該參數

### 測試 3: 模型下載

**時間**: 2026-02-20 01:40
**結果**: ⚠️ 部分成功
**問題**: 需要下載多個模型 (PP-OCRv5_server_det, en_PP-OCRv5_mobile_rec)
**修復**: 等待模型下載完成

### 測試 4: cls 參數過時

**時間**: 2026-02-20 01:42
**結果**: ❌ 失敗
**問題**: `cls=True` 參數已棄用
**修復**: 移除該參數

### 測試 5: OCR 卡住

**時間**: 2026-02-20 01:50
**結果**: ❌ 失敗
**問題**: PaddleOCR 執行時無回應 (可能是 macOS 環境問題)
**修復**: 待處理

### 測試 6: 根因修復 (2026-02-20 v2)

**時間**: 2026-02-20 20:15
**結果**: ✅ 成功
**根因**:
  1. 舊代碼未指定模型名稱 → 嘗試下載 `PP-OCRv5_server_rec`（未緩存，下載超時導致卡住）
  2. PaddleOCR v2 → v3 API 格式改變（返回值從 list-of-lists 改為 list-of-dicts）

**修復方案**:
  - 明確指定已緩存模型: `text_detection_model_name='PP-OCRv5_server_det'` + `text_recognition_model_name='en_PP-OCRv5_mobile_rec'`
  - 關閉不必要的模組: `use_doc_orientation_classify=False`, `use_doc_unwarping=False`
  - 更新結果解析邏輯: 支援 v3 dict 格式（`rec_texts`/`rec_scores`）+ v2 list 格式 fallback
  - Python script 改為文件方式（避免 shell 特殊字符問題）

**性能**: Init 1.8s, OCR 0.22s, 準確率 97%

---

### 迭代結論 (最終)

PaddleOCR v3 在 macOS ARM 完全可用，關鍵是指定已下載的緩存模型。

### 關鍵字判斷列表

```
文字, 文件, 發票, 收據, 表格, 護照, 證件, 身份證, 駕照, 名片, 合約, 帳單, 報表
invoice, receipt, document, text, ocr, 辨識, 識別, extract, copy, scanned, pdf, 影印
```

### 使用方式

1. 啟用：在 `.env` 設定 `PADDLEOCR_ENABLED=true`
2. 使用：傳送圖片並使用上述關鍵字，如「請辨識這張文件」

### Python 路徑

- 需使用 anaconda python: `/opt/anaconda3/bin/python`
- 路徑已寫死在 `vision.ts` 中
