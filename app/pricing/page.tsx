import type { Metadata } from "next";

import { PricingDesk } from "../pricing-desk";

export const metadata: Metadata = {
  title: "引擎價格對比 · Live Caption",
};

export default function PricingPage() {
  return (
    <PricingDesk>
      <div id="app">
        <header className="toolbar pricing-toolbar">
          <div className="brand" aria-label="Live Caption Desk">
            <span className="brand-mark">LC</span>
            <span className="brand-copy">
              <strong>Live Caption</strong>
              <small>Engine pricing</small>
            </span>
          </div>
          <div className="actions">
            <a className="nav-link" href="/">
              字幕桌面
            </a>
          </div>
        </header>

        <main className="pricing-main">
          <section className="pricing-hero">
            <h1>四引擎價格對比</h1>
            <p>
              依本 demo 實際管線估算「直播字幕 + 翻譯」公開牌價（USD）。可調整時數與每小時字元量，即時比較預估總成本。
            </p>
          </section>

          <section className="pricing-assumptions" aria-labelledby="assumptionsTitle">
            <h2 id="assumptionsTitle">統一假設</h2>
            <ul id="assumptionsList" />
          </section>

          <section className="pricing-calc" aria-labelledby="calcTitle">
            <h2 id="calcTitle">成本估算</h2>
            <div className="calc-controls">
              <label className="calc-field">
                <span>連續聆聽時數</span>
                <input
                  id="hoursRange"
                  type="range"
                  min={0.5}
                  max={40}
                  step={0.5}
                  defaultValue={1}
                />
                <span id="hoursValue" className="calc-value">
                  1 h
                </span>
              </label>
              <label className="calc-field">
                <span>每小時轉錄字元</span>
                <input
                  id="charsRange"
                  type="range"
                  min={2000}
                  max={40000}
                  step={1000}
                  defaultValue={10000}
                />
                <span id="charsValue" className="calc-value">
                  10,000 chars/h
                </span>
              </label>
            </div>
            <ol id="rankList" className="rank-list" />
          </section>

          <section aria-labelledby="tableTitle">
            <h2 id="tableTitle" className="visually-hidden">
              牌價明細
            </h2>
            <div className="pricing-table-wrap">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>引擎</th>
                    <th>組成</th>
                    <th>單位牌價</th>
                    <th>估每小時</th>
                    <th>免費額度／備註</th>
                    <th>官方</th>
                  </tr>
                </thead>
                <tbody id="pricingTableBody" />
              </table>
            </div>
          </section>

          <p className="pricing-footnote">
            價格會變動，請以官方頁面為準。Enterprise／承諾用量、區域與加購功能未計入。主比較列不套用免費額度，以免扭曲對比。
          </p>
        </main>
      </div>
    </PricingDesk>
  );
}
