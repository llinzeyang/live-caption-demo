import {
  DEFAULT_CHARS_PER_HOUR,
  DEFAULT_HOURS,
  ENGINES,
  PRICING_AS_OF,
  estimateCost,
  formatUsd,
} from "./data";

export function bootstrapPricingDesk(): void {
  const bootFlag = globalThis as typeof globalThis & {
    __liveCaptionPricingBoot?: boolean;
  };
  if (bootFlag.__liveCaptionPricingBoot) return;
  bootFlag.__liveCaptionPricingBoot = true;

  const assumptionsList =
    document.querySelector<HTMLUListElement>("#assumptionsList")!;
  const hoursRange = document.querySelector<HTMLInputElement>("#hoursRange")!;
  const charsRange = document.querySelector<HTMLInputElement>("#charsRange")!;
  const hoursValue = document.querySelector<HTMLElement>("#hoursValue")!;
  const charsValue = document.querySelector<HTMLElement>("#charsValue")!;
  const rankList = document.querySelector<HTMLOListElement>("#rankList")!;
  const tableBody =
    document.querySelector<HTMLTableSectionElement>("#pricingTableBody")!;

  function renderAssumptions(): void {
    const items = [
      `資料日期：${PRICING_AS_OF}（公開 list／PAYG，USD）`,
      "場景：連續聆聽、1 個目標語",
      `預設轉錄量：每小時 ${DEFAULT_CHARS_PER_HOUR.toLocaleString()} 字元（Azure 文件常見舉例）`,
      "主比較列不計免費額度；Azure 一站式已含翻譯，其餘為 STT + MT 加總（含 Cloudflare Workers AI）",
    ];
    assumptionsList.innerHTML = items.map((t) => `<li>${t}</li>`).join("");
  }

  function renderTable(hours: number, charsPerHour: number): void {
    tableBody.innerHTML = ENGINES.map((engine) => {
      const est = estimateCost(engine, 1, charsPerHour);
      const scenario = estimateCost(engine, hours, charsPerHour);
      return `<tr>
      <td>
        <div class="engine-name">${engine.name}</div>
        <div class="muted">${engine.notes}</div>
      </td>
      <td>${engine.composition}</td>
      <td><code>${engine.unitLabel}</code></td>
      <td>
        <strong>${formatUsd(est.totalUsd)}</strong>
        <div class="muted">目前場景 ${formatUsd(scenario.totalUsd)}</div>
      </td>
      <td class="muted">${engine.freeTierNote}</td>
      <td><a href="${engine.docsUrl}" target="_blank" rel="noreferrer">Pricing</a></td>
    </tr>`;
    }).join("");
  }

  function renderRank(hours: number, charsPerHour: number): void {
    const ranked = ENGINES.map((engine) => ({
      engine,
      est: estimateCost(engine, hours, charsPerHour),
    })).sort((a, b) => a.est.totalUsd - b.est.totalUsd);

    rankList.innerHTML = ranked
      .map((row, index) => {
        const parts =
          row.est.mtUsd > 0
            ? `STT ${formatUsd(row.est.sttUsd)} + MT ${formatUsd(row.est.mtUsd)}`
            : `含翻譯 ${formatUsd(row.est.sttUsd)}`;
        return `<li data-rank="${index + 1}">
        <span class="rank-name">${index + 1}. ${row.engine.name}
          <span class="muted"> · ${parts}</span>
        </span>
        <span class="rank-total">${formatUsd(row.est.totalUsd)}</span>
      </li>`;
      })
      .join("");
  }

  function sync(): void {
    const hours = Number(hoursRange.value) || DEFAULT_HOURS;
    const charsPerHour = Number(charsRange.value) || DEFAULT_CHARS_PER_HOUR;
    hoursValue.textContent = `${hours} h`;
    charsValue.textContent = `${charsPerHour.toLocaleString()} chars/h`;
    renderRank(hours, charsPerHour);
    renderTable(hours, charsPerHour);
  }

  hoursRange.value = String(DEFAULT_HOURS);
  charsRange.value = String(DEFAULT_CHARS_PER_HOUR);
  hoursRange.addEventListener("input", sync);
  charsRange.addEventListener("input", sync);

  renderAssumptions();
  sync();
}
