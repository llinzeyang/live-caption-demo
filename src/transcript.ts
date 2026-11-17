import { langLabel } from "./languages";
import type { CaptionCue } from "./providers/types";

/** 保留一定數量的錄音記錄，避免長時間使用耗盡瀏覽器記憶體。 */
const MAX_RECORDS = 120;

type TranscriptEntry = {
  article: HTMLElement;
  sourceLangEl: HTMLElement;
  sourceTextEl: HTMLElement;
  targetLangEl: HTMLElement;
  targetTextEl: HTMLElement;
  stateEl: HTMLElement;
  sourceText: string;
  translatedText: string;
  isFinal: boolean;
};

/**
 * 管理即時雙語逐句記錄。
 * 同一句的 interim 結果會在原位更新，final 結果則留在列表中。
 */
export class TranscriptFeed {
  private readonly listEl: HTMLElement;
  private readonly emptyEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly viewportEl: HTMLElement;
  private readonly entries: TranscriptEntry[] = [];
  private activeEntry: TranscriptEntry | null = null;
  private sourceLanguage = "auto";
  private targetLanguage = "zh-Hant";

  constructor(
    listEl: HTMLElement,
    emptyEl: HTMLElement,
    countEl: HTMLElement,
    viewportEl: HTMLElement,
  ) {
    this.listEl = listEl;
    this.emptyEl = emptyEl;
    this.countEl = countEl;
    this.viewportEl = viewportEl;
  }

  setLanguagePair(sourceLanguage: string, targetLanguage: string): void {
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
  }

  push(cue: CaptionCue): void {
    const sourceText = cue.sourceText?.trim() ?? "";
    const translatedText = cue.text.trim();
    if (!sourceText && !translatedText) return;

    // 同一 final 偶爾可能重送；不要讓重複句子污染記錄。
    if (
      cue.isFinal &&
      this.activeEntry?.isFinal &&
      this.activeEntry.sourceText === sourceText &&
      this.activeEntry.translatedText === translatedText
    ) {
      return;
    }

    if (!this.activeEntry || this.activeEntry.isFinal) {
      this.activeEntry = this.createEntry(cue);
    }

    const entry = this.activeEntry;
    if (sourceText) {
      entry.sourceText = sourceText;
      entry.sourceTextEl.textContent = sourceText;
      entry.sourceTextEl.classList.remove("is-empty");
    } else if (!entry.sourceText) {
      entry.sourceTextEl.textContent = "正在辨識原文…";
      entry.sourceTextEl.classList.add("is-empty");
    }

    if (translatedText) {
      entry.translatedText = translatedText;
      entry.targetTextEl.textContent = translatedText;
      entry.targetTextEl.classList.remove("is-empty");
    }

    // Prefer the UI-selected source language when the user fixed one.
    // Streaming models (esp. Cloudflare Nova-3 multi) often mis-tag Mandarin as pt/nl.
    const sourceCode =
      this.sourceLanguage !== "auto"
        ? this.sourceLanguage
        : cue.sourceLang && cue.sourceLang !== "auto"
          ? cue.sourceLang
          : this.sourceLanguage;
    entry.sourceLangEl.textContent =
      sourceCode === "auto" ? "自動偵測" : langLabel(sourceCode);
    entry.targetLangEl.textContent = langLabel(cue.targetLang || this.targetLanguage);
    entry.isFinal = cue.isFinal;
    entry.article.dataset.state = cue.isFinal ? "final" : "live";
    entry.stateEl.textContent = cue.isFinal ? "完成" : "辨識中";

    this.updateVisibility();
    this.scrollToLatest(entry.article);
  }

  clear(): void {
    this.entries.length = 0;
    this.activeEntry = null;
    this.listEl.replaceChildren();
    this.updateVisibility();
  }

  private createEntry(cue: CaptionCue): TranscriptEntry {
    const article = document.createElement("article");
    article.className = "transcript-entry";
    article.dataset.state = "live";

    const meta = document.createElement("div");
    meta.className = "entry-meta";

    const time = document.createElement("time");
    time.className = "entry-time";
    time.dateTime = new Date().toISOString();
    time.textContent = new Intl.DateTimeFormat("zh-HK", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());

    const stateEl = document.createElement("span");
    stateEl.className = "entry-state";
    stateEl.textContent = "辨識中";
    meta.append(time, stateEl);

    const sourceBlock = document.createElement("div");
    sourceBlock.className = "entry-line entry-source";

    const sourceLabel = document.createElement("span");
    sourceLabel.className = "entry-label";
    const sourceLangEl = document.createElement("span");
    const initialSource =
      this.sourceLanguage !== "auto"
        ? this.sourceLanguage
        : cue.sourceLang && cue.sourceLang !== "auto"
          ? cue.sourceLang
          : "auto";
    sourceLangEl.textContent =
      initialSource === "auto" ? "自動偵測" : langLabel(initialSource);
    sourceLabel.append("原文 / ", sourceLangEl);

    const sourceTextEl = document.createElement("p");
    sourceTextEl.className = "entry-text";
    sourceTextEl.textContent = cue.sourceText?.trim() || "正在辨識原文…";
    if (!cue.sourceText?.trim()) sourceTextEl.classList.add("is-empty");
    sourceBlock.append(sourceLabel, sourceTextEl);

    const targetBlock = document.createElement("div");
    targetBlock.className = "entry-line entry-target";

    const targetLabel = document.createElement("span");
    targetLabel.className = "entry-label";
    const targetLangEl = document.createElement("span");
    targetLangEl.textContent = langLabel(cue.targetLang || this.targetLanguage);
    targetLabel.append("翻譯 / ", targetLangEl);

    const targetTextEl = document.createElement("p");
    targetTextEl.className = "entry-text";
    targetTextEl.textContent = cue.text.trim();
    targetBlock.append(targetLabel, targetTextEl);

    article.append(meta, sourceBlock, targetBlock);
    this.listEl.appendChild(article);
    this.entries.push({
      article,
      sourceLangEl,
      sourceTextEl,
      targetLangEl,
      targetTextEl,
      stateEl,
      sourceText: cue.sourceText?.trim() ?? "",
      translatedText: cue.text.trim(),
      isFinal: false,
    });

    // 控制畫面長度；已完成的舊記錄會先被移除。
    while (this.entries.length > MAX_RECORDS) {
      const oldest = this.entries.shift();
      oldest?.article.remove();
    }

    return this.entries[this.entries.length - 1]!;
  }

  private updateVisibility(): void {
    const hasEntries = this.entries.length > 0;
    this.emptyEl.hidden = hasEntries;
    this.countEl.textContent = String(this.entries.length);
  }

  private scrollToLatest(article: HTMLElement): void {
    const distanceFromBottom =
      this.viewportEl.scrollHeight -
      this.viewportEl.scrollTop -
      this.viewportEl.clientHeight;
    if (distanceFromBottom < 140) {
      this.viewportEl.scrollTo({
        top: this.viewportEl.scrollHeight,
        behavior: article.dataset.state === "final" ? "smooth" : "auto",
      });
    }
  }
}
