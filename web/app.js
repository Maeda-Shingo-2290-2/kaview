const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat("ja-JP");
const pct = new Intl.NumberFormat("ja-JP", {
  style: "percent",
  maximumFractionDigits: 1,
});

const state = {
  groupBy: "day",
};

const controls = {
  fromDate: document.querySelector("#fromDate"),
  toDate: document.querySelector("#toDate"),
  query: document.querySelector("#query"),
  account: document.querySelector("#account"),
  marginType: document.querySelector("#marginType"),
  transactionType: document.querySelector("#transactionType"),
  plType: document.querySelector("#plType"),
};

function formatYen(value) {
  if (value === null || value === undefined) return "--";
  return yen.format(Math.round(value));
}

function formatNumber(value) {
  if (value === null || value === undefined) return "--";
  return num.format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined) return "--";
  return pct.format(value);
}

function plClass(value) {
  if (value > 0) return "profit";
  if (value < 0) return "loss";
  return "";
}

function apiUrl(path, extra = {}) {
  const params = new URLSearchParams();
  const filters = currentFilters();
  Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function currentFilters() {
  return {
    from: controls.fromDate.value,
    to: controls.toDate.value,
    q: controls.query.value.trim(),
    account: controls.account.value,
    margin_type: controls.marginType.value,
    transaction_type: controls.transactionType.value,
    pl_type: controls.plType.value,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function fillSelect(select, values, allLabel) {
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = allLabel;
  select.append(all);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

async function initFilters() {
  const data = await fetchJson("/api/filters");
  controls.fromDate.min = data.date_range.min;
  controls.fromDate.max = data.date_range.max;
  controls.toDate.min = data.date_range.min;
  controls.toDate.max = data.date_range.max;
  fillSelect(controls.account, data.accounts, "全口座");
  fillSelect(controls.marginType, data.margin_types, "全区分");
  fillSelect(controls.transactionType, data.transaction_types, "全取引");
}

function renderMetrics(summary) {
  document.querySelector("#headerTotal").textContent = formatYen(summary.total_realized_pl_yen);
  document.querySelector("#headerTotal").className = `header-total ${plClass(summary.total_realized_pl_yen)}`;
  document.querySelector("#periodLabel").textContent =
    summary.from_date && summary.to_date ? `${summary.from_date} から ${summary.to_date}` : "該当データなし";

  const metrics = [
    ["実現損益", formatYen(summary.total_realized_pl_yen), summary.total_realized_pl_yen],
    ["取引件数", `${formatNumber(summary.trade_count)}件`],
    ["勝率", formatPercent(summary.win_rate)],
    ["勝ち / 負け", `${formatNumber(summary.win_count)} / ${formatNumber(summary.loss_count)}`],
    ["平均損益", formatYen(summary.average_pl_yen), summary.average_pl_yen],
    ["Profit Factor", summary.profit_factor === null ? "--" : summary.profit_factor.toFixed(2)],
    ["利益合計", formatYen(summary.gross_profit_yen), summary.gross_profit_yen],
    ["損失合計", formatYen(summary.gross_loss_yen), summary.gross_loss_yen],
    ["平均利益", formatYen(summary.average_win_yen), summary.average_win_yen],
    ["平均損失", formatYen(summary.average_loss_yen), summary.average_loss_yen],
    ["最大利益", formatYen(summary.max_win_yen), summary.max_win_yen],
    ["最大損失", formatYen(summary.max_loss_yen), summary.max_loss_yen],
  ];

  document.querySelector("#metrics").innerHTML = metrics
    .map(([label, value, raw]) => `
      <div class="metric">
        <span>${label}</span>
        <strong class="${plClass(raw)}">${value}</strong>
      </div>
    `)
    .join("");
}

function chartBounds(values) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
}

function renderLineChart(target, items) {
  const el = document.querySelector(target);
  if (!items.length) {
    el.innerHTML = '<div class="muted">データがありません</div>';
    return;
  }
  const width = 900;
  const height = 300;
  const pad = { top: 18, right: 20, bottom: 36, left: 78 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = items.map((item) => item.cumulative_realized_pl_yen);
  const bounds = chartBounds(values);
  const x = (index) => pad.left + (items.length === 1 ? plotW / 2 : (index / (items.length - 1)) * plotW);
  const y = (value) => pad.top + ((bounds.max - value) / (bounds.max - bounds.min)) * plotH;
  const points = items.map((item, index) => `${x(index)},${y(item.cumulative_realized_pl_yen)}`).join(" ");
  const ticks = [bounds.max, (bounds.max + bounds.min) / 2, bounds.min];

  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="累積実現損益チャート">
      ${ticks.map((tick) => `
        <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
        <text class="chart-label" x="8" y="${y(tick) + 4}">${formatCompact(tick)}</text>
      `).join("")}
      <line class="axis" x1="${pad.left}" x2="${width - pad.right}" y1="${y(0)}" y2="${y(0)}"></line>
      <polyline class="line-profit" points="${points}"></polyline>
      ${labelTicks(items, x, height, pad.bottom)}
    </svg>
  `;
}

function renderBarChart(target, items) {
  const el = document.querySelector(target);
  if (!items.length) {
    el.innerHTML = '<div class="muted">データがありません</div>';
    return;
  }
  const width = 900;
  const height = 300;
  const pad = { top: 18, right: 20, bottom: 36, left: 78 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = items.map((item) => item.realized_pl_yen);
  const bounds = chartBounds(values);
  const y = (value) => pad.top + ((bounds.max - value) / (bounds.max - bounds.min)) * plotH;
  const zeroY = y(0);
  const gap = 2;
  const barW = Math.max(2, plotW / items.length - gap);
  const ticks = [bounds.max, (bounds.max + bounds.min) / 2, bounds.min];

  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="期間別実現損益チャート">
      ${ticks.map((tick) => `
        <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
        <text class="chart-label" x="8" y="${y(tick) + 4}">${formatCompact(tick)}</text>
      `).join("")}
      <line class="axis" x1="${pad.left}" x2="${width - pad.right}" y1="${zeroY}" y2="${zeroY}"></line>
      ${items.map((item, index) => {
        const barX = pad.left + index * (plotW / items.length);
        const valueY = y(item.realized_pl_yen);
        const barY = Math.min(valueY, zeroY);
        const barH = Math.max(1, Math.abs(zeroY - valueY));
        return `<rect class="${item.realized_pl_yen >= 0 ? "bar-profit" : "bar-loss"}" x="${barX}" y="${barY}" width="${barW}" height="${barH}"><title>${item.period}: ${formatYen(item.realized_pl_yen)}</title></rect>`;
      }).join("")}
      ${labelTicks(items, (index) => pad.left + index * (plotW / Math.max(items.length - 1, 1)), height, pad.bottom)}
    </svg>
  `;
}

function labelTicks(items, x, height, bottomPad) {
  const maxLabels = 6;
  const step = Math.max(1, Math.ceil(items.length / maxLabels));
  return items
    .map((item, index) => {
      if (index % step !== 0 && index !== items.length - 1) return "";
      return `<text class="chart-label" x="${x(index)}" y="${height - bottomPad + 24}" text-anchor="middle">${item.period}</text>`;
    })
    .join("");
}

function formatCompact(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

function securityName(item) {
  return `<div><strong>${item.security_code}</strong> ${item.security_name}</div>`;
}

function renderSecurityRanking(selector, items) {
  document.querySelector(selector).innerHTML = items
    .map((item) => `
      <tr>
        <td>${securityName(item)}</td>
        <td class="number">${formatNumber(item.trade_count)}</td>
        <td class="number ${plClass(item.total_realized_pl_yen)}">${formatYen(item.total_realized_pl_yen)}</td>
      </tr>
    `)
    .join("");
}

function renderSecurityTable(data) {
  document.querySelector("#securityCount").textContent = `${formatNumber(data.total)}銘柄`;
  document.querySelector("#securityRows").innerHTML = data.items
    .map((item) => `
      <tr>
        <td>${item.security_code}</td>
        <td>${item.security_name}</td>
        <td class="number">${formatNumber(item.trade_count)}</td>
        <td class="number">${formatPercent(item.win_rate)}</td>
        <td class="number ${plClass(item.average_pl_yen)}">${formatYen(item.average_pl_yen)}</td>
        <td class="number ${plClass(item.total_realized_pl_yen)}">${formatYen(item.total_realized_pl_yen)}</td>
      </tr>
    `)
    .join("");
}

function renderTrades(data) {
  document.querySelector("#tradeCount").textContent = `${formatNumber(data.total)}件中 ${formatNumber(data.items.length)}件表示`;
  document.querySelector("#tradeRows").innerHTML = data.items
    .map((item) => `
      <tr>
        <td>${item.execution_date}</td>
        <td>${item.security_code}</td>
        <td>${item.security_name}</td>
        <td>${item.account}</td>
        <td>${item.margin_type}</td>
        <td>${item.transaction_type}</td>
        <td class="number">${formatNumber(item.quantity_shares)}</td>
        <td class="number">${formatNumber(item.sale_settlement_unit_price_yen)}</td>
        <td class="number ${plClass(item.realized_pl_yen)}">${formatYen(item.realized_pl_yen)}</td>
      </tr>
    `)
    .join("");
}

async function refresh() {
  const [summary, timeseries, securities, top, worst, trades] = await Promise.all([
    fetchJson(apiUrl("/api/summary")),
    fetchJson(apiUrl("/api/pl/timeseries", { group_by: state.groupBy })),
    fetchJson(apiUrl("/api/pl/by-security", { sort: "total_realized_pl_yen", order: "desc", limit: 100 })),
    fetchJson(apiUrl("/api/pl/by-security", { sort: "total_realized_pl_yen", order: "desc", limit: 5 })),
    fetchJson(apiUrl("/api/pl/by-security", { sort: "total_realized_pl_yen", order: "asc", limit: 5 })),
    fetchJson(apiUrl("/api/trades", { sort: "execution_date", order: "desc", limit: 100 })),
  ]);

  renderMetrics(summary);
  renderLineChart("#cumulativeChart", timeseries.items);
  renderBarChart("#barChart", timeseries.items);
  renderSecurityTable(securities);
  renderSecurityRanking("#topSecurities", top.items);
  renderSecurityRanking("#worstSecurities", worst.items);
  renderTrades(trades);
}

document.querySelector("#applyFilters").addEventListener("click", refresh);
document.querySelector("#resetFilters").addEventListener("click", () => {
  Object.values(controls).forEach((control) => {
    control.value = "";
  });
  refresh();
});

Object.values(controls).forEach((control) => {
  control.addEventListener("keydown", (event) => {
    if (event.key === "Enter") refresh();
  });
});

document.querySelectorAll(".period-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".period-button").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.groupBy = button.dataset.groupBy;
    refresh();
  });
});

initFilters()
  .then(refresh)
  .catch((error) => {
    document.querySelector("main").insertAdjacentHTML(
      "afterbegin",
      `<div class="panel loss">読み込みに失敗しました: ${error.message}</div>`,
    );
  });
