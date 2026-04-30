import { useEffect, useMemo, useRef, useState } from "react";

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

function toDateInputValue(date) {
  return date.toLocaleDateString("sv-SE");
}

function createDefaultFilters() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    from: toDateInputValue(startOfMonth),
    to: toDateInputValue(today),
    q: "",
    account: "",
    margin_type: "",
    transaction_type: "",
    pl_type: "",
  };
}

function createCurrentMonthRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    year: today.getFullYear(),
    monthIndex: today.getMonth(),
    monthLabel: `${today.getFullYear()}年${today.getMonth() + 1}月`,
    from: toDateInputValue(start),
    to: toDateInputValue(end),
  };
}

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

function formatCompact(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

function chartBounds(values) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
}

function apiUrl(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function MetricCard({ label, value, tone }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function EmptyChart({ message = "データがありません" }) {
  return <div className="muted chart-empty">{message}</div>;
}

function CombinedChart({ items }) {
  if (!items.length) return <EmptyChart />;
  const width = 900;
  const height = 300;
  const pad = { top: 18, right: 20, bottom: 36, left: 78 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const periodValues = items.map((item) => item.realized_pl_yen);
  const cumulativeValues = items.map((item) => item.cumulative_realized_pl_yen);
  const periodBounds = chartBounds(periodValues);
  const cumulativeBounds = chartBounds(cumulativeValues);
  const x = (index) =>
    pad.left + (items.length === 1 ? plotW / 2 : (index / (items.length - 1)) * plotW);
  const yBar = (value) => pad.top + ((periodBounds.max - value) / (periodBounds.max - periodBounds.min)) * plotH;
  const yLine = (value) =>
    pad.top + ((cumulativeBounds.max - value) / (cumulativeBounds.max - cumulativeBounds.min)) * plotH;
  const zeroY = yBar(0);
  const barW = Math.max(2, plotW / items.length - 2);
  const points = items.map((item, index) => `${x(index)},${yLine(item.cumulative_realized_pl_yen)}`).join(" ");
  const leftTicks = [periodBounds.max, (periodBounds.max + periodBounds.min) / 2, periodBounds.min];
  const rightTicks = [cumulativeBounds.max, (cumulativeBounds.max + cumulativeBounds.min) / 2, cumulativeBounds.min];
  const step = Math.max(1, Math.ceil(items.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="実現損益推移チャート">
      {leftTicks.map((tick) => (
        <g key={`left-${tick}`}>
          <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={yBar(tick)} y2={yBar(tick)} />
          <text className="chart-label" x="8" y={yBar(tick) + 4}>
            {formatCompact(tick)}
          </text>
        </g>
      ))}
      {rightTicks.map((tick) => (
        <text key={`right-${tick}`} className="chart-label" x={width - pad.right + 6} y={yLine(tick) + 4}>
          {formatCompact(tick)}
        </text>
      ))}
      <line className="axis" x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} />
      {items.map((item, index) => {
        const barX = pad.left + index * (plotW / items.length);
        const valueY = yBar(item.realized_pl_yen);
        const barY = Math.min(valueY, zeroY);
        const barH = Math.max(1, Math.abs(zeroY - valueY));
        return (
          <rect
            key={`${item.period}-${index}`}
            className={item.realized_pl_yen >= 0 ? "bar-profit" : "bar-loss"}
            x={barX}
            y={barY}
            width={barW}
            height={barH}
          >
            <title>
              {item.period}: {formatYen(item.realized_pl_yen)} / 累積 {formatYen(item.cumulative_realized_pl_yen)}
            </title>
          </rect>
        );
      })}
      <polyline className="line-profit" points={points} />
      {items.map((item, index) => {
        if (index % step !== 0 && index !== items.length - 1) return null;
        return (
          <text
            key={item.period}
            className="chart-label"
            x={x(index)}
            y={height - pad.bottom + 24}
            textAnchor="middle"
          >
            {item.period}
          </text>
        );
      })}
    </svg>
  );
}

function MonthCalendar({ monthRange, items }) {
  const firstDay = new Date(monthRange.year, monthRange.monthIndex, 1);
  const lastDay = new Date(monthRange.year, monthRange.monthIndex + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const itemMap = new Map(items.map((item) => [item.period, item]));
  const cells = [];

  for (let index = 0; index < startWeekday; index += 1) {
    cells.push({ kind: "blank", key: `blank-${index}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = toDateInputValue(new Date(monthRange.year, monthRange.monthIndex, day));
    const item = itemMap.get(date);
    cells.push({
      kind: "day",
      key: date,
      day,
      realizedPl: item?.realized_pl_yen ?? null,
      tradeCount: item?.trade_count ?? 0,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ kind: "blank", key: `tail-${cells.length}` });
  }

  return (
    <div className="calendar">
      <div className="calendar-weekdays">
        {["日", "月", "火", "水", "木", "金", "土"].map((label) => (
          <div key={label} className="calendar-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((cell) =>
          cell.kind === "blank" ? (
            <div key={cell.key} className="calendar-cell blank" />
          ) : (
            <div key={cell.key} className={`calendar-cell ${plClass(cell.realizedPl)}`}>
              <div className="calendar-day">{cell.day}</div>
              <div className="calendar-value">{cell.realizedPl === null ? "--" : formatYen(cell.realizedPl)}</div>
              <div className="calendar-count">{cell.tradeCount ? `${cell.tradeCount}件` : ""}</div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function SecurityRanking({ items }) {
  return (
    <tbody>
      {items.map((item) => (
        <tr key={`${item.security_code}-${item.security_name}`}>
          <td>
            <div>
              <strong>{item.security_code}</strong> {item.security_name}
            </div>
          </td>
          <td className="number">{formatNumber(item.trade_count)}</td>
          <td className={`number ${plClass(item.total_realized_pl_yen)}`}>{formatYen(item.total_realized_pl_yen)}</td>
        </tr>
      ))}
    </tbody>
  );
}

export default function App() {
  const defaultFilters = useMemo(() => createDefaultFilters(), []);
  const currentMonthRange = useMemo(() => createCurrentMonthRange(), []);
  const fileInputRef = useRef(null);
  const [filtersMeta, setFiltersMeta] = useState(null);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);
  const [groupBy, setGroupBy] = useState("day");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importState, setImportState] = useState({
    status: "idle",
    message: "CSVをドラッグ＆ドロップ、またはファイル選択で最新データを再取込します。",
    detail: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [calendarSeries, setCalendarSeries] = useState([]);
  const [securityTable, setSecurityTable] = useState({ items: [], total: 0 });
  const [topSecurities, setTopSecurities] = useState([]);
  const [worstSecurities, setWorstSecurities] = useState([]);
  const [trades, setTrades] = useState({ items: [], total: 0 });

  useEffect(() => {
    fetchJson("/api/filters")
      .then((data) => {
        setFiltersMeta(data);
      })
      .catch((err) => setError(err.message));
  }, [refreshNonce]);

  useEffect(() => {
    const calendarFilters = {
      q: filters.q,
      account: filters.account,
      margin_type: filters.margin_type,
      transaction_type: filters.transaction_type,
      pl_type: filters.pl_type,
      from: currentMonthRange.from,
      to: currentMonthRange.to,
      group_by: "day",
    };

    setLoading(true);
    setError("");
    Promise.all([
      fetchJson(apiUrl("/api/summary", filters)),
      fetchJson(apiUrl("/api/pl/timeseries", { ...filters, group_by: groupBy })),
      fetchJson(apiUrl("/api/pl/timeseries", calendarFilters)),
      fetchJson(apiUrl("/api/pl/by-security", {
        ...filters,
        sort: "total_realized_pl_yen",
        order: "desc",
        limit: 100,
      })),
      fetchJson(apiUrl("/api/pl/by-security", {
        ...filters,
        sort: "total_realized_pl_yen",
        order: "desc",
        limit: 5,
      })),
      fetchJson(apiUrl("/api/pl/by-security", {
        ...filters,
        sort: "total_realized_pl_yen",
        order: "asc",
        limit: 5,
      })),
      fetchJson(apiUrl("/api/trades", {
        ...filters,
        sort: "execution_date",
        order: "desc",
        limit: 100,
      })),
    ])
      .then(([summaryData, timeseriesData, calendarData, securityData, topData, worstData, tradeData]) => {
        setSummary(summaryData);
        setTimeseries(timeseriesData.items);
        setCalendarSeries(calendarData.items);
        setSecurityTable(securityData);
        setTopSecurities(topData.items);
        setWorstSecurities(worstData.items);
        setTrades(tradeData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters, groupBy, refreshNonce, currentMonthRange.from, currentMonthRange.to]);

  const metrics = useMemo(() => {
    if (!summary) return [];
    return [
      ["実現損益", formatYen(summary.total_realized_pl_yen), summary.total_realized_pl_yen],
      ["取引件数", `${formatNumber(summary.trade_count)}件`, null],
      ["勝率", formatPercent(summary.win_rate), null],
      ["勝ち / 負け", `${formatNumber(summary.win_count)} / ${formatNumber(summary.loss_count)}`, null],
      ["平均損益", formatYen(summary.average_pl_yen), summary.average_pl_yen],
      ["Profit Factor", summary.profit_factor === null ? "--" : summary.profit_factor.toFixed(2), null],
      ["利益合計", formatYen(summary.gross_profit_yen), summary.gross_profit_yen],
      ["損失合計", formatYen(summary.gross_loss_yen), summary.gross_loss_yen],
      ["平均利益", formatYen(summary.average_win_yen), summary.average_win_yen],
      ["平均損失", formatYen(summary.average_loss_yen), summary.average_loss_yen],
      ["最大利益", formatYen(summary.max_win_yen), summary.max_win_yen],
      ["最大損失", formatYen(summary.max_loss_yen), summary.max_loss_yen],
    ];
  }, [summary]);

  const onDraftChange = (key, value) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => setFilters(draftFilters);
  const resetFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
  };

  const handleImport = async (file) => {
    if (!file) return;
    setImportState({
      status: "uploading",
      message: `${file.name} を取り込み中...`,
      detail: "",
    });
    setIsImportOpen(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `${response.status} ${response.statusText}`);
      }

      setImportState({
        status: "success",
        message: `${payload.source_file} を取り込みました。`,
        detail: `${formatNumber(payload.row_count)}件 / ${payload.execution_date_min} から ${payload.execution_date_max} / ${formatYen(payload.total_realized_pl_yen)}`,
      });
      setRefreshNonce((value) => value + 1);
    } catch (err) {
      setImportState({
        status: "error",
        message: "取込に失敗しました。",
        detail: err.message,
      });
    }
  };

  const onFileInputChange = async (event) => {
    const [file] = event.target.files ?? [];
    await handleImport(file);
    event.target.value = "";
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setIsDragActive(false);
    const [file] = event.dataTransfer.files ?? [];
    await handleImport(file);
  };

  return (
    <>
      <header className="app-header">
        <div>
          <h1>kaview</h1>
          <p>
            {summary?.from_date && summary?.to_date
              ? `${summary.from_date} から ${summary.to_date}`
              : "実現損益ビューア"}
          </p>
        </div>
        <div className="header-actions">
          <section className="header-import">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={onFileInputChange}
            />
            <div
              className={`dropzone compact ${isDragActive ? "active" : ""} ${importState.status}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragActive(true);
                setIsImportOpen(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
                setIsImportOpen(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget === event.target) {
                  setIsDragActive(false);
                }
              }}
              onDrop={onDrop}
            >
              <button
                type="button"
                className="import-trigger"
                onClick={() => setIsImportOpen((value) => !value)}
              >
                データ更新
              </button>
              {isImportOpen ? (
                <div className="import-popover">
                  <strong>最新CSVをドロップ</strong>
                  <span>毎回フル再取込でDBを更新します</span>
                  <div className="dropzone-actions">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importState.status === "uploading"}
                    >
                      CSVを選択
                    </button>
                  </div>
                  <p
                    className={`import-message ${
                      importState.status === "error"
                        ? "loss"
                        : importState.status === "success"
                          ? "profit"
                          : ""
                    }`}
                  >
                    {importState.message}
                  </p>
                  {importState.detail ? <p className="muted import-detail">{importState.detail}</p> : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </header>

      <main>
        {error ? <section className="panel loss">読み込みに失敗しました: {error}</section> : null}

        <section className="filters" aria-label="フィルタ">
          <label>
            <span>開始日</span>
            <input
              type="date"
              value={draftFilters.from}
              min={filtersMeta?.date_range?.min ?? ""}
              max={filtersMeta?.date_range?.max ?? ""}
              onChange={(event) => onDraftChange("from", event.target.value)}
            />
          </label>
          <label>
            <span>終了日</span>
            <input
              type="date"
              value={draftFilters.to}
              min={filtersMeta?.date_range?.min ?? ""}
              max={filtersMeta?.date_range?.max ?? ""}
              onChange={(event) => onDraftChange("to", event.target.value)}
            />
          </label>
          <label>
            <span>銘柄</span>
            <input
              type="search"
              placeholder="コード / 銘柄名"
              value={draftFilters.q}
              onChange={(event) => onDraftChange("q", event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && applyFilters()}
            />
          </label>
          <label>
            <span>口座</span>
            <select value={draftFilters.account} onChange={(event) => onDraftChange("account", event.target.value)}>
              <option value="">全口座</option>
              {(filtersMeta?.accounts ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>信用区分</span>
            <select
              value={draftFilters.margin_type}
              onChange={(event) => onDraftChange("margin_type", event.target.value)}
            >
              <option value="">全区分</option>
              {(filtersMeta?.margin_types ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>取引</span>
            <select
              value={draftFilters.transaction_type}
              onChange={(event) => onDraftChange("transaction_type", event.target.value)}
            >
              <option value="">全取引</option>
              {(filtersMeta?.transaction_types ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>損益</span>
            <select value={draftFilters.pl_type} onChange={(event) => onDraftChange("pl_type", event.target.value)}>
              <option value="">全て</option>
              <option value="profit">利益のみ</option>
              <option value="loss">損失のみ</option>
              <option value="flat">ゼロのみ</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="button" onClick={applyFilters}>
              更新
            </button>
            <button type="button" className="secondary" onClick={resetFilters}>
              リセット
            </button>
          </div>
        </section>

        <section className="metrics">
          {metrics.map(([label, value, tone]) => (
            <MetricCard key={label} label={label} value={value} tone={plClass(tone)} />
          ))}
        </section>

        <section className="grid dashboard-grid">
          <article className="panel">
            <div className="panel-heading">
              <h2>実現損益推移</h2>
              <div className="segmented" role="group" aria-label="期間">
                <button
                  type="button"
                  className={groupBy === "day" ? "active" : ""}
                  onClick={() => setGroupBy("day")}
                >
                  日次
                </button>
                <button
                  type="button"
                  className={groupBy === "month" ? "active" : ""}
                  onClick={() => setGroupBy("month")}
                >
                  月次
                </button>
              </div>
            </div>
            <div className="chart chart-large">
              {loading ? <EmptyChart message="読み込み中..." /> : <CombinedChart items={timeseries} />}
            </div>
          </article>

          <article className="panel calendar-panel">
            <div className="panel-heading">
              <h2>{currentMonthRange.monthLabel} カレンダー</h2>
            </div>
            {loading ? <EmptyChart message="読み込み中..." /> : <MonthCalendar monthRange={currentMonthRange} items={calendarSeries} />}
          </article>
        </section>

        <section className="grid two-columns">
          <article className="panel">
            <div className="panel-heading">
              <h2>利益上位銘柄</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th className="number">取引</th>
                    <th className="number">実現損益</th>
                  </tr>
                </thead>
                <SecurityRanking items={topSecurities} />
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <h2>損失上位銘柄</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th className="number">取引</th>
                    <th className="number">実現損益</th>
                  </tr>
                </thead>
                <SecurityRanking items={worstSecurities} />
              </table>
            </div>
          </article>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>銘柄別成績</h2>
            <span className="muted">{formatNumber(securityTable.total)}銘柄</span>
          </div>
          <div className="table-wrap large">
            <table>
              <thead>
                <tr>
                  <th>コード</th>
                  <th>銘柄名</th>
                  <th className="number">取引</th>
                  <th className="number">勝率</th>
                  <th className="number">平均損益</th>
                  <th className="number">実現損益</th>
                </tr>
              </thead>
              <tbody>
                {securityTable.items.map((item) => (
                  <tr key={`${item.security_code}-${item.security_name}`}>
                    <td>{item.security_code}</td>
                    <td>{item.security_name}</td>
                    <td className="number">{formatNumber(item.trade_count)}</td>
                    <td className="number">{formatPercent(item.win_rate)}</td>
                    <td className={`number ${plClass(item.average_pl_yen)}`}>{formatYen(item.average_pl_yen)}</td>
                    <td className={`number ${plClass(item.total_realized_pl_yen)}`}>{formatYen(item.total_realized_pl_yen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>取引一覧</h2>
            <span className="muted">
              {formatNumber(trades.total)}件中 {formatNumber(trades.items.length)}件表示
            </span>
          </div>
          <div className="table-wrap large">
            <table>
              <thead>
                <tr>
                  <th>約定日</th>
                  <th>コード</th>
                  <th>銘柄名</th>
                  <th>口座</th>
                  <th>信用</th>
                  <th>取引</th>
                  <th className="number">数量</th>
                  <th className="number">単価</th>
                  <th className="number">実現損益</th>
                </tr>
              </thead>
              <tbody>
                {trades.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.execution_date}</td>
                    <td>{item.security_code}</td>
                    <td>{item.security_name}</td>
                    <td>{item.account}</td>
                    <td>{item.margin_type}</td>
                    <td>{item.transaction_type}</td>
                    <td className="number">{formatNumber(item.quantity_shares)}</td>
                    <td className="number">{formatNumber(item.sale_settlement_unit_price_yen)}</td>
                    <td className={`number ${plClass(item.realized_pl_yen)}`}>{formatYen(item.realized_pl_yen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
