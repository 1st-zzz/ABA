"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  Download,
  History,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  Tags,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SiteOption = {
  id: number;
  code: string;
  label: string;
};

type MonthlyRow = {
  month: string;
  hasData: boolean;
  weeks: number;
  dateMax: string;
  monthEndRank: number | null;
  avgRank: number | null;
  rankChangeVsPrevObserved: number | null;
  rankMoMImprovementPct: number | null;
  direction: string;
};

type TermSummary = {
  searchWords: string;
  rowCount: number;
  latestRank: number | null;
  latestDate?: string;
  latestSource?: string;
  bestRank: number | null;
  bestRankDate?: string;
  bestRankSource?: string;
};

type KeywordRun = {
  meta: {
    siteCode: string;
    searchWords: string;
    rootQuery: string;
    rootLimit: number;
    startDate: string;
    endDate: string;
    generatedAt: string;
  };
  current: {
    exactItems: Record<string, unknown>[];
    latestMain: Record<string, unknown> | null;
  };
  root: {
    items: Record<string, unknown>[];
  };
  history: {
    rows: Record<string, unknown>[];
    monthly: MonthlyRow[];
    termSummaries: TermSummary[];
    coverage: {
      firstDataMonth: string;
      lastDataMonth: string;
      monthsChecked: number;
      monthsWithData: number;
      missingAfterStart: string[];
    };
  };
};

type RecentRun = {
  key: string;
  searchWords: string;
  rootQuery: string;
  platformSiteId: number;
  siteCode: string;
  startDate: string;
  endDate: string;
  rootLimit: number;
  createdAt: string;
  currentRank: number | null;
  historyRows: number;
};

const initialSites: SiteOption[] = [
  { id: 1286, code: "US", label: "美国站" },
  { id: 1287, code: "CA", label: "加拿大站" },
  { id: 1288, code: "MX", label: "墨西哥站" },
  { id: 1290, code: "GB", label: "英国站" },
  { id: 1289, code: "DE", label: "德国站" },
  { id: 1292, code: "IT", label: "意大利站" },
  { id: 1293, code: "ES", label: "西班牙站" },
  { id: 1294, code: "TR", label: "土耳其站" },
  { id: 1295, code: "SE", label: "瑞典站" },
];
const storageKey = "aba-public-runs";
const defaultEndDate = new Date().toISOString().slice(0, 10);
const defaultStartDate = "2026-01-01";
const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  return Number.isFinite(number) ? numberFormat.format(number) : String(value);
}

function formatCompact(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  return Number.isFinite(number) ? compactFormat.format(number) : String(value);
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function directionLabel(value: string) {
  if (value === "improved") return "改善";
  if (value === "declined") return "下滑";
  if (value === "flat") return "持平";
  if (value === "no_data") return "无数据";
  return "-";
}

function rankTone(direction: string) {
  if (direction === "improved") return "tone-good";
  if (direction === "declined") return "tone-bad";
  if (direction === "no_data") return "tone-muted";
  return "tone-neutral";
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows?.length) return "";
  const keys = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const escapeCell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => escapeCell(row[key])).join(",")),
  ].join("\n");
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function RankTrend({ rows }: { rows: MonthlyRow[] }) {
  const data = rows.filter((row) => row.hasData && row.monthEndRank);
  if (data.length < 2) {
    return (
      <div className="empty-plot">
        <BarChart3 size={26} />
        <span>历史点不足</span>
      </div>
    );
  }

  const width = 820;
  const height = 300;
  const pad = { top: 34, right: 42, bottom: 52, left: 64 };
  const ranks = data.map((row) => Number(row.monthEndRank));
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const rankSpan = Math.max(maxRank - minRank, 1);
  const xStep = (width - pad.left - pad.right) / Math.max(data.length - 1, 1);
  const yFor = (rank: number) =>
    pad.top + ((rank - minRank) / rankSpan) * (height - pad.top - pad.bottom);
  const points = data.map((row, index) => ({
    x: pad.left + index * xStep,
    y: yFor(Number(row.monthEndRank)),
    row,
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <svg className="rank-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="月度 ABA 排名趋势">
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} className="axis" />
      <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} className="axis" />
      {[0.25, 0.5, 0.75].map((ratio) => {
        const y = pad.top + ratio * (height - pad.top - pad.bottom);
        return <line key={ratio} x1={pad.left} y1={y} x2={width - pad.right} y2={y} className="grid-line" />;
      })}
      <text x={pad.left} y={22} className="axis-label">排名更靠前</text>
      <text x={pad.left} y={height - 14} className="axis-label">月份</text>
      <path d={path} className="rank-line" />
      {points.map((point) => (
        <g key={point.row.month}>
          <circle cx={point.x} cy={point.y} r="5" className="rank-dot" />
          <text x={point.x} y={point.y - 13} textAnchor="middle" className="point-label">
            {formatNumber(point.row.monthEndRank)}
          </text>
          <text x={point.x} y={height - 24} textAnchor="middle" className="month-label">
            {point.row.month.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <section className={`metric-card ${tone}`}>
      <div className="metric-icon"><Icon size={18} /></div>
      <div className="metric-copy">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        {sub ? <div className="metric-sub">{sub}</div> : null}
      </div>
    </section>
  );
}

export default function Home() {
  const [sites, setSites] = useState<SiteOption[]>(initialSites);
  const [library, setLibrary] = useState<RecentRun[]>([]);
  const [form, setForm] = useState({
    searchWords: "fairy lights",
    rootQuery: "fairy light",
    platformSiteId: 1286,
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    rootLimit: 20,
  });
  const [result, setResult] = useState<KeywordRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sites")
      .then((response) => response.json())
      .then((payload: { sites?: SiteOption[] }) => setSites(payload.sites || initialSites))
      .catch(() => {});

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setLibrary(JSON.parse(saved));
    } catch {
      setLibrary([]);
    }
  }, []);

  function saveRecent(data: KeywordRun) {
    const exactCurrent = data.current.exactItems[0] || {};
    const currentRank = toNumber(exactCurrent.searchRank) ?? toNumber(data.current.latestMain?.searchRankInt);
    const run: RecentRun = {
      key: `${Date.now()}-${data.meta.searchWords}`,
      searchWords: data.meta.searchWords,
      rootQuery: data.meta.rootQuery,
      platformSiteId: form.platformSiteId,
      siteCode: data.meta.siteCode,
      startDate: data.meta.startDate,
      endDate: data.meta.endDate,
      rootLimit: data.meta.rootLimit,
      createdAt: data.meta.generatedAt,
      currentRank,
      historyRows: data.history.rows.length,
    };

    setLibrary((current) => {
      const next = [
        run,
        ...current.filter((item) =>
          `${item.searchWords}-${item.siteCode}-${item.startDate}-${item.endDate}` !==
          `${run.searchWords}-${run.siteCode}-${run.startDate}-${run.endDate}`,
        ),
      ].slice(0, 8);

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}

      return next;
    });
  }

  async function runSearch() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "查询失败");
      setResult(payload.data);
      saveRecent(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }

  function fillRecent(run: RecentRun) {
    setForm({
      searchWords: run.searchWords,
      rootQuery: run.rootQuery,
      platformSiteId: run.platformSiteId,
      startDate: run.startDate,
      endDate: run.endDate,
      rootLimit: run.rootLimit,
    });
  }

  const exactCurrent = result?.current.exactItems?.[0] || null;
  const latestMain = result?.current.latestMain || null;
  const monthly = result?.history.monthly || [];
  const termSummaries = result?.history.termSummaries || [];
  const rootItems = result?.root.items || [];
  const missingMonths = result?.history.coverage.missingAfterStart || [];
  const bestTerm = termSummaries[0];
  const latestMonth = useMemo(() => [...monthly].reverse().find((row) => row.hasData), [monthly]);
  const currentRank = exactCurrent?.searchRank || latestMain?.searchRankInt;

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div>
            <p className="eyebrow">ABA DataHub</p>
            <h1>ABA 词库看板</h1>
            <p className="brand-sub">快速查看关键词排名、词根拓展、历史趋势和数据缺口。</p>
          </div>
        </div>
        <div className="topbar-actions">
          {result ? <span className="status-pill fresh">已生成</span> : <span className="status-pill">待查询</span>}
          <button className="secondary-button" disabled={!result} onClick={() => downloadJson("aba-keyword-run.json", result)}>
            <Download size={16} />
            JSON
          </button>
          <button className="secondary-button" disabled={!result} onClick={() => downloadCsv("aba-monthly-summary.csv", monthly as unknown as Record<string, unknown>[])}>
            <Download size={16} />
            CSV
          </button>
        </div>
      </header>

      <section className="query-panel">
        <div className="query-copy">
          <h2>查询条件</h2>
          <p>ABA 历史接口按收敛条件查询，拓展数量建议先控制在 20 以内。</p>
        </div>
        <div className="query-grid">
          <label className="field keyword-field">
            <span>核心关键词</span>
            <input
              value={form.searchWords}
              onChange={(event) => setForm({ ...form, searchWords: event.target.value })}
              placeholder="fairy lights"
            />
          </label>
          <label className="field">
            <span>词根拓展</span>
            <input
              value={form.rootQuery}
              onChange={(event) => setForm({ ...form, rootQuery: event.target.value })}
              placeholder="fairy light"
            />
          </label>
          <label className="field">
            <span>站点</span>
            <select
              value={form.platformSiteId}
              onChange={(event) => setForm({ ...form, platformSiteId: Number(event.target.value) })}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.label}</option>
              ))}
            </select>
          </label>
          <label className="field small-field">
            <span>拓展数量</span>
            <input
              type="number"
              min="1"
              max="50"
              value={form.rootLimit}
              onChange={(event) => setForm({ ...form, rootLimit: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>起始日期</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
          </label>
          <label className="field">
            <span>结束日期</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
          </label>
          <div className="query-actions">
            <button className="primary-button" onClick={runSearch} disabled={loading}>
              {loading ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
              <span>{loading ? "查询中" : "查询"}</span>
            </button>
            <button className="icon-button" onClick={runSearch} disabled={loading} title="重新拉取 MCP 数据" aria-label="重新拉取 MCP 数据">
              <RefreshCcw size={17} />
            </button>
          </div>
        </div>
        {error ? <div className="error-box"><AlertTriangle size={16} />{error}</div> : null}
      </section>

      {library.length ? (
        <section className="recent-strip" aria-label="最近查询">
          <div className="recent-title">
            <History size={16} />
            <span>最近查询</span>
          </div>
          <div className="recent-list">
            {library.map((run) => (
              <button key={run.key} onClick={() => fillRecent(run)} className="recent-chip">
                <strong>{run.searchWords}</strong>
                <span>{run.siteCode} · 排名 {formatNumber(run.currentRank)} · {run.historyRows} 条</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!result ? (
        <section className="empty-state">
          <Database size={40} />
          <div>
            <h2>输入关键词后生成看板</h2>
            <p>系统会自动拉取 exact 当前数据、词根拓展、历史排名、月度环比和缺失月份。</p>
          </div>
        </section>
      ) : (
        <>
          <section className="summary-bar">
            <div>
              <p className="eyebrow">{result.meta.siteCode} · ABA 关键词洞察</p>
              <h2>{result.meta.searchWords}</h2>
            </div>
            <div className="summary-meta">
              <span><Clock3 size={14} />{result.meta.startDate} 至 {result.meta.endDate}</span>
              <span><Activity size={14} />最近历史月：{latestMonth?.month || "-"}</span>
            </div>
          </section>

          <section className="metric-grid">
            <MetricCard
              icon={TrendingUp}
              label="当前 ABA 排名"
              value={formatNumber(currentRank)}
              sub={String(exactCurrent?.dataTime || latestMain?.date || "最新可用数据")}
              tone="blue"
            />
            <MetricCard
              icon={Tags}
              label="拓展词数量"
              value={formatNumber(rootItems.length)}
              sub={`${result.meta.rootQuery} · 上限 ${result.meta.rootLimit}`}
              tone="gold"
            />
            <MetricCard
              icon={CalendarDays}
              label="历史覆盖"
              value={`${result.history.coverage.monthsWithData}/${result.history.coverage.monthsChecked}`}
              sub={`${result.history.coverage.firstDataMonth || "-"} 至 ${result.history.coverage.lastDataMonth || "-"}`}
              tone="olive"
            />
            <MetricCard
              icon={TrendingDown}
              label="最优拓展词"
              value={bestTerm?.searchWords || "-"}
              sub={bestTerm?.bestRank ? `最好排名 ${formatNumber(bestTerm.bestRank)}` : ""}
              tone="rose"
            />
          </section>

          <section className="analysis-grid">
            <section className="surface trend-surface">
              <div className="section-heading between">
                <div>
                  <h2>月度排名趋势</h2>
                  <p>按每月最后一个历史周点计算，排名数值越小越好。</p>
                </div>
                <span className="small-badge">{latestMonth?.month || "暂无历史"}</span>
              </div>
              <RankTrend rows={monthly} />
            </section>

            <section className="surface coverage-surface">
              <div className="section-heading">
                <AlertTriangle size={17} />
                <h2>覆盖情况</h2>
              </div>
              <div className="coverage-score">
                <strong>{result.history.coverage.monthsWithData}</strong>
                <span>/ {result.history.coverage.monthsChecked} 个月有数据</span>
              </div>
              <div className="coverage-meta">
                <span>起始月份</span>
                <strong>{result.history.coverage.firstDataMonth || "-"}</strong>
                <span>最近月份</span>
                <strong>{result.history.coverage.lastDataMonth || "-"}</strong>
                <span>历史行数</span>
                <strong>{formatNumber(result.history.rows.length)}</strong>
              </div>
              <div className="coverage-list">
                {missingMonths.length ? missingMonths.map((month) => (
                  <span key={month} className="gap-pill">{month}</span>
                )) : <span className="ok-pill">起始月份后无缺口</span>}
              </div>
            </section>
          </section>

          <section className="surface table-surface">
            <div className="section-heading between">
              <div>
                <h2>逐月检查</h2>
                <p>展示每月最新周点，以及相对上一个有数据月份的排名变化。</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>月份</th>
                    <th>周数</th>
                    <th>数据日期</th>
                    <th>月末排名</th>
                    <th>平均排名</th>
                    <th>排名变化</th>
                    <th>环比</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{row.weeks}</td>
                      <td>{row.dateMax || "-"}</td>
                      <td>{formatNumber(row.monthEndRank)}</td>
                      <td>{formatNumber(row.avgRank)}</td>
                      <td>{formatNumber(row.rankChangeVsPrevObserved)}</td>
                      <td>{row.rankMoMImprovementPct === null ? "-" : `${row.rankMoMImprovementPct}%`}</td>
                      <td><span className={`tone-pill ${rankTone(row.direction)}`}>{directionLabel(row.direction)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="detail-grid">
            <section className="surface table-surface">
              <div className="section-heading">
                <Tags size={17} />
                <h2>词根拓展</h2>
              </div>
              <div className="table-scroll compact">
                <table>
                  <thead>
                    <tr>
                      <th>关键词</th>
                      <th>排名</th>
                      <th>搜索量</th>
                      <th>数据日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rootItems.slice(0, 18).map((item) => (
                      <tr key={`${item.id}-${item.searchWords}`}>
                        <td>{String(item.searchWords || "-")}</td>
                        <td>{formatNumber(item.searchRank)}</td>
                        <td>{formatCompact(item.searches)}</td>
                        <td>{String(item.dataTime || "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="surface table-surface">
              <div className="section-heading">
                <BarChart3 size={17} />
                <h2>历史词表现</h2>
              </div>
              <div className="table-scroll compact">
                <table>
                  <thead>
                    <tr>
                      <th>关键词</th>
                      <th>历史行数</th>
                      <th>最新排名</th>
                      <th>最好排名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termSummaries.slice(0, 18).map((item) => (
                      <tr key={item.searchWords}>
                        <td>{item.searchWords}</td>
                        <td>{item.rowCount}</td>
                        <td>
                          <span className="stacked-cell">
                            <strong>{formatNumber(item.latestRank)}</strong>
                            <small>{item.latestDate || "-"}</small>
                          </span>
                        </td>
                        <td>
                          <span className="stacked-cell">
                            <strong>{formatNumber(item.bestRank)}</strong>
                            <small>{item.bestRankDate || "-"}</small>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </>
      )}
    </main>
  );
}
