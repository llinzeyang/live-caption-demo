import { CaptionDesk } from "./caption-desk";

export default function HomePage() {
  return (
    <CaptionDesk>
      <div id="app">
        <header className="toolbar">
          <div className="brand" aria-label="Live Caption Desk">
            <span className="brand-mark">LC</span>
            <span className="brand-copy">
              <strong>Live Caption</strong>
              <small>Speech translation desk</small>
            </span>
          </div>

          <div className="controls" aria-label="翻譯設定">
            <label className="field">
              <span>引擎</span>
              <select id="providerSelect" />
            </label>
            <label className="field">
              <span>原語言</span>
              <select id="sourceLang" />
            </label>
            <label className="field">
              <span>翻譯為</span>
              <select id="targetLang" />
            </label>
          </div>

          <div className="actions">
            <a className="nav-link" href="/pricing">
              價格對比
            </a>
            <button id="startBtn" type="button" className="btn primary">
              <span className="btn-icon" aria-hidden="true">
                ●
              </span>
              開始聆聽
            </button>
            <button id="stopBtn" type="button" className="btn" disabled>
              停止
            </button>
            <button id="testAudioBtn" type="button" className="btn ghost">
              測試音訊
            </button>
            <span id="statusChip" className="status-chip" data-state="idle">
              <span className="status-dot" aria-hidden="true" />
              <span id="status" aria-live="polite">
                待命
              </span>
            </span>
          </div>
        </header>

        <main className="workspace">
          <section className="session-deck" aria-labelledby="customSpeakTitle">
            <div className="deck-topline">
              <span className="eyebrow">VOICE ONLY / NO CAMERA</span>
              <span className="privacy-tag">只取麥克風</span>
            </div>

            <div
              id="micModule"
              className="mic-module"
              data-state="idle"
              aria-hidden="true"
            >
              <span className="mic-ring ring-one" />
              <span className="mic-ring ring-two" />
              <span className="mic-glow" />
              <span className="mic-core">
                <svg viewBox="0 0 24 24" role="img">
                  <path d="M12 15.25a3.25 3.25 0 0 0 3.25-3.25V6a3.25 3.25 0 1 0-6.5 0v6A3.25 3.25 0 0 0 12 15.25Zm-6-3.5a.75.75 0 0 1 1.5 0 4.5 4.5 0 0 0 9 0 .75.75 0 0 1 1.5 0 6 6 0 0 1-5.25 5.95V20h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5v-2.3A6 6 0 0 1 6 11.75Z" />
                </svg>
              </span>
            </div>

            <dl className="session-stats">
              <div>
                <dt>連線狀態</dt>
                <dd id="sessionState">待命</dd>
              </div>
              <div>
                <dt>錄音時間</dt>
                <dd id="sessionTimer">00:00</dd>
              </div>
            </dl>

            <p className="permission-note">
              <span>MIC</span>
              瀏覽器只會詢問麥克風權限
            </p>

            <div className="custom-speak" aria-labelledby="customSpeakTitle">
              <div className="custom-speak-head">
                <span className="eyebrow">CUSTOM TEXT</span>
                <h2 id="customSpeakTitle">自訂文本朗讀</h2>
              </div>
              <label className="custom-speak-field">
                <span>輸入文本（最多 500 字）</span>
                <textarea
                  id="customText"
                  rows={6}
                  maxLength={500}
                  placeholder="輸入要朗讀並交給引擎辨識的句子…"
                />
                <span className="custom-speak-hint">
                  選英／韓／日時，會先把文本譯成該語言再朗讀。
                </span>
              </label>
              <div className="custom-speak-row">
                <label className="field">
                  <span>朗讀語言</span>
                  <select id="ttsLang" />
                </label>
                <button id="speakRecognizeBtn" type="button" className="btn ghost">
                  朗讀並辨識
                </button>
              </div>
            </div>
          </section>

          <section className="transcript-deck" aria-labelledby="transcriptTitle">
            <header className="transcript-header">
              <div>
                <span className="eyebrow">LIVE TRANSCRIPT</span>
                <h2 id="transcriptTitle">雙語逐句記錄</h2>
              </div>
              <div className="transcript-tools">
                <span className="record-count">
                  <strong id="recordCount">0</strong> 則記錄
                </span>
                <button id="clearTranscriptBtn" type="button" className="text-btn">
                  清除
                </button>
              </div>
            </header>

            <div className="language-route" aria-label="翻譯方向">
              <span id="sourceRoute">自動偵測</span>
              <span className="route-line" aria-hidden="true" />
              <span className="route-arrow" aria-hidden="true">
                →
              </span>
              <span id="targetRoute">繁體中文</span>
            </div>

            <div id="transcriptViewport" className="transcript-viewport">
              <div id="emptyTranscript" className="empty-transcript">
                <span className="empty-quote" aria-hidden="true">
                  “
                </span>
                <p>
                  開始聆聽後，
                  <br />
                  原文與翻譯會依語句出現在這裡。
                </p>
                <span>沒有畫面、沒有相機，只保留聲音轉成的文字。</span>
              </div>
              <div id="transcriptList" className="transcript-list" />
            </div>
          </section>
        </main>

        <p id="error" className="error" hidden>
          {" "}
        </p>
      </div>
    </CaptionDesk>
  );
}
