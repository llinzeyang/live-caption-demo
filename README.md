# live-caption-demo

瀏覽器即時翻譯字幕 Demo：只授權麥克風，不使用相機；說話內容會以原文與翻譯的逐句記錄呈現。

- **供應商**（UI 可切換）：
  - Azure Speech Translation
  - Google Speech-to-Text + Translation
  - Deepgram + DeepL（STT + DeepL；無 DeepL 時可回退 Google Translate）
  - AssemblyAI + DeepL（同上）
- **可擴展**：`CaptionProvider` 介面 + 註冊表
- **部署**：Next.js App Router + Vercel Route Handler / WebSocket（`upgradeWebSocket`）

預設語言：**韓語 (ko-KR) → 繁體中文 (zh-Hant)**。

## 準備環境變數

```bash
cp .env.example .env
```

只開一個供應商也可以；未設定的那個在 UI 選取時會報錯，不影響另一個。

### Azure

1. 在 [Azure Portal](https://portal.azure.com/) 建立 **Speech** 資源
2. 「金鑰和端點」複製金鑰與區域（例如 `eastasia`）

```env
AZURE_SPEECH_KEY=你的金鑰
AZURE_SPEECH_REGION=eastasia
```

瀏覽器只拿短時效 token（`GET /api/providers/azure/token`），金鑰不進前端。

### Google

1. 建立 [GCP 專案](https://console.cloud.google.com/)（新帳號常有試用額度；開通通常仍要綁卡）
2. 啟用 **Cloud Speech-to-Text API** 與 **Cloud Translation API**
3. 建立服務帳號，授與可呼叫上述 API 的權限，下載 JSON 金鑰
4. 填入：

```env
GOOGLE_CLOUD_PROJECT=你的專案ID
# 本機開發可用檔案路徑：
GOOGLE_APPLICATION_CREDENTIALS=C:\絕對路徑\service-account.json
# 部署到 Vercel 時改用整段 JSON（一行）：
# GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Google 路徑會把麥克風 PCM 經 WebSocket（`/api/providers/google/stream`）中繼到 Speech V2 串流，再呼叫 Translation（interim 約 300ms 防抖）。

### Deepgram

1. 註冊 [Deepgram Console](https://console.deepgram.com/)，建立 API Key（常有免費額度）
2. 翻譯後端二選一：
   - **DeepL**（建議）：[DeepL API](https://www.deepl.com/pro-api) 免費版金鑰通常以 `:fx` 結尾
   - 或沿用上面的 **Google Cloud Translation**（`GOOGLE_*`）

```env
DEEPGRAM_API_KEY=你的_deepgram_金鑰
DEEPL_API_KEY=你的_deepl_金鑰:fx
```

音訊經 `/api/providers/deepgram/stream` 中繼到 Deepgram Live Listen；金鑰不進瀏覽器。

### AssemblyAI

1. 註冊 [AssemblyAI Dashboard](https://www.assemblyai.com/dashboard)，複製 API Key
2. 翻譯後端與 Deepgram 相同（`DEEPL_API_KEY` 或 `GOOGLE_*`）

```env
ASSEMBLYAI_API_KEY=你的_assemblyai_金鑰
```

音訊經 `/api/providers/assemblyai/stream` 中繼到 AssemblyAI Streaming v3（預設 `universal-3-6-pro`，支援中文等 32 語；勿用 `universal-streaming-multilingual`，該模型不含中文）；金鑰不進瀏覽器。

## 啟動（本機）

### 建議（Windows 最穩）：Next + 本機 WS 代理

`next dev` **不支援** `upgradeWebSocket`。本機請另開 WS 代理（不依賴 `vercel dev` 的 symlink）：

```bash
npm install
# .env 加上（本機開發用；部署 Vercel 時不要設）：
# NEXT_PUBLIC_WS_ORIGIN=ws://localhost:3001

npm run dev:full
# 等同同時跑：next dev（:3000）+ ws-dev-server（:3001）
```

打開 http://localhost:3000 → 選擇供應商 →「開始聆聽」。

### 可選：`vercel dev`

需 CLI ≥ 54.14.2，且 **Windows 常需開啟「開發人員模式」**（才能建 symlink），否則會出現 `EPERM: symlink`。

```bash
npm run dev:vercel
```

此時可去掉 `NEXT_PUBLIC_WS_ORIGIN`，WS 與頁面同網域。

## 部署到 Vercel

1. 將專案推到 GitHub / GitLab / Bitbucket
2. 在 [vercel.com](https://vercel.com) Import 專案（Framework：Next.js）
3. 在 Project Settings → Environment Variables 填入與 `.env.example` 對應的金鑰  
   - Google 請用 `GOOGLE_SERVICE_ACCOUNT_JSON`（整段 JSON），勿依賴本機檔案路徑
4. Deploy

Vercel WebSocket 連線會在 Function `maxDuration`（Hobby 預設約 300 秒）到達時關閉；前端會自動退避重連。主動按「停止」不會重連。

## 如何新增供應商

1. 新增 `src/providers/<id>/`，實作 [`CaptionProvider`](src/providers/types.ts)
2. 憑證／串流代理加在 [`app/api/`](app/api/) 或 [`server/`](server/)，並更新 `.env.example`
3. 在 [`src/providers/index.ts`](src/providers/index.ts) 的 `bootstrapProviders()` 註冊
4. 語言映射放在該供應商目錄（參考 `azure/lang.ts`、`google/lang.ts`、`deepgram/lang.ts`、`assemblyai/lang.ts`）

`main.ts` / `session.ts` 不應依賴特定供應商 SDK。

## 腳本

| 指令 | 說明 |
|------|------|
| `npm run dev:full` | Next（:3000）+ 本機 WS 代理（:3001）；Windows 建議用這個 |
| `npm run dev` | 僅 Next.js（頁面 / Azure token / TTS） |
| `npm run dev:ws` | 僅本機 WS 代理（需 `.env` 設 `NEXT_PUBLIC_WS_ORIGIN`） |
| `npm run dev:vercel` | `vercel dev`（需 symlink 權限；Windows 常失敗） |
| `npm run build` | 生產建置 |
| `npm run start` | 本機跑 production build |
