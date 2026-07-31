type SearchInput = {
  searchWords?: string;
  rootQuery?: string;
  platformSiteId?: number;
  startDate?: string;
  endDate?: string;
  rootLimit?: number;
};

export const runtime = "nodejs";
export const maxDuration = 60;

const siteOptions = [
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

function readToken() {
  const legacyTokenKey = ["EFFI", "SELLER_DATAHUB_TOKEN"].join("");
  const token = process.env.ABA_DATAHUB_TOKEN || process.env[legacyTokenKey];
  if (!token) {
    throw new ResponseError("服务端缺少 MCP token。", 500);
  }
  return token;
}

function mcpEndpoint() {
  const fallbackEndpoint = ["https://ai.", "effi", "seller.com/api/mcp"].join("");
  return process.env.MCP_ENDPOINT || fallbackEndpoint;
}

function normalizeKeyword(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function toInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFromRow(row: Record<string, unknown>) {
  for (const key of ["dataTime", "date", "week", "reportDate", "startDate"]) {
    const value = row[key];
    if (value) return String(value).slice(0, 10);
  }
  return "";
}

function termKey(value: unknown) {
  return normalizeKeyword(value).toLowerCase();
}

function rankFromRow(row: Record<string, unknown>) {
  return toInt(row.searchRankInt ?? row.searchRank ?? row.abaRank);
}

function withRankSnapshots(rows: Record<string, unknown>[], source: string) {
  return rows
    .map((row) => ({
      row,
      source,
      date: String(row.date || dateFromRow(row) || ""),
      rank: rankFromRow(row),
    }))
    .filter((item): item is { row: Record<string, unknown>; source: string; date: string; rank: number } =>
      item.rank !== null,
    );
}

function monthRange(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = endDate.slice(0, 7).split("-").map(Number);
  const months: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

async function callMcpTool(name: string, argumentsPayload: Record<string, unknown>, id: number) {
  const response = await fetch(mcpEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2024-11-05",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: argumentsPayload },
    }),
  });

  const text = await response.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ResponseError("MCP 返回了非 JSON 响应。", response.status || 502);
  }

  if (!response.ok || raw.error) {
    const message =
      typeof raw.error === "object" && raw.error && "message" in raw.error
        ? String((raw.error as { message?: unknown }).message)
        : `MCP 请求失败：HTTP ${response.status}`;
    throw new ResponseError(message, response.status || 502);
  }

  const result = (raw.result || {}) as {
    content?: { type?: string; text?: string }[];
    isError?: boolean;
  };
  const contentText = (result.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("");

  let parsed: unknown = null;
  if (contentText) {
    try {
      parsed = JSON.parse(contentText);
    } catch {
      parsed = { rawText: contentText };
    }
  }

  return { isError: Boolean(result.isError), parsed };
}

function itemsFromParsed(parsed: unknown) {
  const record = parsed as {
    items?: unknown;
    data?: unknown;
    rows?: unknown;
  } | null;
  const items = record?.items || record?.data || record?.rows || [];
  if (Array.isArray(items)) return items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (items && typeof items === "object") return [items as Record<string, unknown>];
  return [];
}

function enrichHistoryRows(rows: Record<string, unknown>[], queryTerm: string) {
  return rows.map((item) => {
    const date = dateFromRow(item);
    return {
      ...item,
      date,
      month: date ? date.slice(0, 7) : "",
      searchRankInt: toInt(item.searchRank ?? item.abaRank),
      searchesNumber: toNumber(item.searches),
      _queryTerm: queryTerm,
    };
  });
}

function dedupeRows(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const deduped: Record<string, unknown>[] = [];
  for (const row of rows) {
    const key = [
      row.id || row.historyId || "",
      row.searchWords || row._queryTerm || "",
      row.date || "",
      row.searchRankInt ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function summarizeMonthly(rows: Record<string, unknown>[], months: string[]) {
  const byMonth = new Map(months.map((month) => [month, [] as Record<string, unknown>[]]));
  for (const row of rows) {
    const month = String(row.month || "");
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)?.push(row);
  }

  let previousRank: number | null = null;
  let previousMonth = "";
  return months.map((month) => {
    const monthRows = [...(byMonth.get(month) || [])].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    const ranks = monthRows
      .map((row) => toInt(row.searchRankInt))
      .filter((rank): rank is number => rank !== null);
    const latest = monthRows.at(-1);
    const monthEndRank = toInt(latest?.searchRankInt);
    let rankChange: number | null = null;
    let improvementPct: number | null = null;
    let direction = monthRows.length ? "" : "no_data";

    if (previousRank !== null && monthEndRank !== null) {
      rankChange = monthEndRank - previousRank;
      improvementPct = previousRank ? ((previousRank - monthEndRank) / previousRank) * 100 : null;
      direction = rankChange < 0 ? "improved" : rankChange > 0 ? "declined" : "flat";
    }

    const row = {
      month,
      hasData: monthRows.length > 0,
      weeks: monthRows.length,
      dateMin: String(monthRows[0]?.date || ""),
      dateMax: String(latest?.date || ""),
      monthEndRank,
      avgRank: ranks.length ? Number((ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length).toFixed(2)) : null,
      bestRank: ranks.length ? Math.min(...ranks) : null,
      worstRank: ranks.length ? Math.max(...ranks) : null,
      prevObservedMonth: previousMonth,
      rankChangeVsPrevObserved: rankChange,
      rankMoMImprovementPct: improvementPct === null ? null : Number(improvementPct.toFixed(2)),
      direction,
    };

    if (monthEndRank !== null) {
      previousRank = monthEndRank;
      previousMonth = month;
    }

    return row;
  });
}

function summarizeTerms(
  historyByTerm: Map<string, Record<string, unknown>[]>,
  currentItems: Record<string, unknown>[],
) {
  const currentByTerm = new Map<string, Record<string, unknown>[]>();
  for (const item of currentItems) {
    const key = termKey(item.searchWords);
    if (!key) continue;
    if (!currentByTerm.has(key)) currentByTerm.set(key, []);
    currentByTerm.get(key)?.push(item);
  }

  const allKeys = new Set([...historyByTerm.keys()].map(termKey));
  for (const key of currentByTerm.keys()) allKeys.add(key);

  const summaries = [];
  for (const key of allKeys) {
    const historyEntry = [...historyByTerm.entries()].find(([term]) => termKey(term) === key);
    const term = historyEntry?.[0] || String(currentByTerm.get(key)?.[0]?.searchWords || "");
    const rows = historyEntry?.[1] || [];
    const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const snapshots = [
      ...withRankSnapshots(sorted, "history"),
      ...withRankSnapshots(currentByTerm.get(key) || [], "current"),
    ];
    const latest = [...snapshots].sort((a, b) =>
      b.date.localeCompare(a.date) || a.rank - b.rank,
    )[0];
    const best = [...snapshots].sort((a, b) =>
      a.rank - b.rank || b.date.localeCompare(a.date),
    )[0];
    const ranks = snapshots.map((item) => item.rank);
    const current = [...withRankSnapshots(currentByTerm.get(key) || [], "current")].sort((a, b) =>
      b.date.localeCompare(a.date) || a.rank - b.rank,
    )[0];
    summaries.push({
      searchWords: term,
      rowCount: sorted.length,
      firstDate: String(sorted[0]?.date || ""),
      latestDate: latest?.date || "",
      latestRank: latest?.rank ?? null,
      latestSource: latest?.source || "",
      currentRank: current?.rank ?? null,
      currentDate: current?.date || "",
      bestRank: best?.rank ?? null,
      bestRankDate: best?.date || "",
      bestRankSource: best?.source || "",
      worstRank: ranks.length ? Math.max(...ranks) : null,
      avgRank: ranks.length ? Number((ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length).toFixed(2)) : null,
    });
  }
  return summaries.sort((a, b) => (a.bestRank ?? 1e12) - (b.bestRank ?? 1e12));
}

async function fetchKeywordData(input: Required<SearchInput>) {
  const searchWords = normalizeKeyword(input.searchWords);
  const rootQuery = normalizeKeyword(input.rootQuery || searchWords.replace(/s$/i, ""));
  const platformSiteId = Number(input.platformSiteId || 1286);
  const site = siteOptions.find((option) => option.id === platformSiteId) || siteOptions[0];
  const rootLimit = Math.min(Math.max(Number(input.rootLimit || 20), 1), 50);
  const startDate = input.startDate || "2026-01-01";
  const endDate = input.endDate || new Date().toISOString().slice(0, 10);

  if (!searchWords) throw new ResponseError("请输入核心关键词。", 400);
  if (startDate > endDate) throw new ResponseError("起始日期不能晚于结束日期。", 400);

  const exactArgs = {
    mode: "exact",
    platformSiteId,
    searchWords,
    pageNum: 1,
    limit: 5,
    sortField: "searchRank",
    sortOrder: "asc",
  };
  const rootArgs = {
    mode: "keyword",
    platformSiteId,
    searchWords: rootQuery,
    pageNum: 1,
    limit: rootLimit,
    sortField: "searchRank",
    sortOrder: "asc",
  };

  const [exactResponse, rootResponse] = await Promise.all([
    callMcpTool("query_aba_pool", exactArgs, 1),
    callMcpTool("query_aba_pool", rootArgs, 2),
  ]);

  const exactItems = itemsFromParsed(exactResponse.parsed);
  const rootItems = itemsFromParsed(rootResponse.parsed);
  const terms: string[] = [];
  const seenTerms = new Set<string>();
  for (const term of [searchWords, ...rootItems.map((item) => normalizeKeyword(item.searchWords))]) {
    const key = term.toLowerCase();
    if (!term || seenTerms.has(key)) continue;
    seenTerms.add(key);
    terms.push(term);
  }

  const historyRows: Record<string, unknown>[] = [];
  const historyCalls = [];
  let rpcId = 100;
  for (const term of terms) {
    const historyArgs = {
      mode: "history",
      platformSiteId,
      searchWords: term,
      startDate,
      endDate,
      pageNum: 1,
      limit: 50,
    };
    try {
      const response = await callMcpTool("query_aba_pool", historyArgs, rpcId++);
      const rows = enrichHistoryRows(itemsFromParsed(response.parsed), term);
      historyRows.push(...rows);
      historyCalls.push({
        searchWords: term,
        rowCount: rows.length,
        isError: response.isError,
        args: historyArgs,
      });
    } catch (error) {
      historyCalls.push({
        searchWords: term,
        rowCount: 0,
        isError: true,
        error: error instanceof Error ? error.message : "历史数据查询失败",
        args: historyArgs,
      });
    }
  }

  const dedupedHistoryRows = dedupeRows(historyRows);
  const historyByTerm = new Map<string, Record<string, unknown>[]>();
  for (const row of dedupedHistoryRows) {
    const term = String(row.searchWords || row._queryTerm || "");
    if (!historyByTerm.has(term)) historyByTerm.set(term, []);
    historyByTerm.get(term)?.push(row);
  }

  const mainRows = dedupedHistoryRows.filter(
    (row) => String(row.searchWords || row._queryTerm).toLowerCase() === searchWords.toLowerCase(),
  );
  const months = monthRange(startDate, endDate);
  const monthly = summarizeMonthly(mainRows, months);
  const firstDataMonth = monthly.find((row) => row.hasData)?.month || "";
  const lastDataMonth = [...monthly].reverse().find((row) => row.hasData)?.month || "";
  const missingAfterStart = firstDataMonth
    ? monthly.filter((row) => row.month >= firstDataMonth && !row.hasData).map((row) => row.month)
    : [];
  const latestMain = [...mainRows].sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) || null;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      platformSiteId,
      siteCode: site.code,
      searchWords,
      rootQuery,
      rootLimit,
      startDate,
      endDate,
      termsChecked: terms.length,
      historyRows: dedupedHistoryRows.length,
    },
    current: {
      exactArgs,
      exactItems,
      latestMain,
    },
    root: {
      rootArgs,
      items: rootItems,
    },
    history: {
      calls: historyCalls,
      rows: dedupedHistoryRows,
      termSummaries: summarizeTerms(historyByTerm, [...exactItems, ...rootItems]),
      monthly,
      coverage: {
        firstDataMonth,
        lastDataMonth,
        monthsChecked: months.length,
        monthsWithData: monthly.filter((row) => row.hasData).length,
        monthsWithoutData: monthly.filter((row) => !row.hasData).length,
        missingAfterStart,
      },
    },
  };
}

class ResponseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SearchInput;
    const input = {
      searchWords: normalizeKeyword(payload.searchWords),
      rootQuery: normalizeKeyword(payload.rootQuery || payload.searchWords),
      platformSiteId: Number(payload.platformSiteId || 1286),
      startDate: payload.startDate || "2026-01-01",
      endDate: payload.endDate || new Date().toISOString().slice(0, 10),
      rootLimit: Math.min(Math.max(Number(payload.rootLimit || 20), 1), 50),
    };

    const data = await fetchKeywordData(input);
    return Response.json({ data });
  } catch (error) {
    const status = error instanceof ResponseError ? error.status : 500;
    const message = error instanceof Error ? error.message : "服务端查询失败。";
    return Response.json({ error: message }, { status });
  }
}
