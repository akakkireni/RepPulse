const IST_TZ = "Asia/Kolkata";

function loggedOriginLabel() {
  return typeof LOGGED_PAGE_LABEL !== "undefined" ? LOGGED_PAGE_LABEL : "the host in config.js";
}

function loggedPageLabel() {
  return loggedOriginLabel();
}

function formatIST(ms) {
  const d = new Date(ms);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    fractionalSecondDigits: 3,
  }).format(d);
}

function pathnameOnly(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Which environment a host belongs to, for filtering: prod / qa / dev / staging / uat / other.
function classifyEnv(hostname) {
  const h = typeof hostname === "string" ? hostname.toLowerCase() : "";
  if (!h) return "other";
  if (/(^|[.-])qa([.-]|$)/.test(h)) return "qa";
  if (/(^|[.-])(dev|develop|development)([.-]|$)/.test(h)) return "dev";
  if (/(^|[.-])(stage|staging|stg)([.-]|$)/.test(h)) return "staging";
  if (/(^|[.-])(uat|preprod|pre-prod)([.-]|$)/.test(h)) return "uat";
  if (/\.reputation\.com$/.test(h)) return "prod"; // app.reputation.com with no env token
  return "other";
}

// A readable "URL style" bucket from the PAGE the call came from, so devs can
// filter by exactly the screen they were testing. Examples:
//   /actions/agency-tickets?ticketType=RespondToReview -> "Agency Actions · RespondToReview"
//   /reviews                                           -> "Reviews"
//   /reviews3                                          -> "reviews3"
//   /admin/agencies/1/tenants/7/settings/general       -> "Admin · Agencies"
function classifyPageArea(pageUrl) {
  let path = "";
  let qp = null;
  try {
    const u = new URL(pageUrl);
    path = u.pathname;
    qp = u.searchParams;
  } catch {
    return "other";
  }
  const p = path.replace(/\/+$/, "") || "/";
  if (/\/actions\/agency-tickets/.test(p)) {
    const tt = qp && qp.get("ticketType");
    return tt ? `Agency Actions · ${tt}` : "Agency Actions";
  }
  if (/\/actions(\/|$)/.test(p)) {
    const m = p.match(/\/actions\/([^/]+)/);
    return m ? `Actions · ${m[1]}` : "Actions";
  }
  if (/\/reviews3(\/|$)/.test(p)) return "reviews3";
  if (/\/reviews(\/|$)/.test(p)) return "Reviews";
  if (/\/admin\/agencies/.test(p)) return "Admin · Agencies";
  if (/\/admin(\/|$)/.test(p)) {
    const m = p.match(/\/admin\/([^/]+)/);
    return m ? `Admin · ${m[1]}` : "Admin";
  }
  const seg = p.split("/").filter(Boolean)[0];
  return seg || "other";
}

function ticketIdFromQueryParams(qp) {
  if (!qp || typeof qp !== "object") return "";
  const search = qp.search;
  if (typeof search !== "string") return "";
  try {
    const j = JSON.parse(search);
    const filters = j.filters;
    if (!Array.isArray(filters)) return "";
    for (const f of filters) {
      if (
        f &&
        f.name === "__note_objectID__" &&
        Array.isArray(f.values) &&
        f.values.length
      ) {
        return String(f.values[0]);
      }
    }
  } catch {}
  return "";
}

function extractIds(url) {
  let reviewId = "";
  let ticketId = "";
  try {
    const path = new URL(url).pathname;
    const rev = path.match(/\/reviews3\/([^/?]+)/);
    if (rev && rev[1] !== "responses") reviewId = rev[1];
    const tix = path.match(/\/tickets\/(\d+)(?:\/|$)/);
    if (tix) ticketId = tix[1];
  } catch {}
  return { reviewId, ticketId };
}

function classifyApi(url) {
  const path = pathnameOnly(url);
  const reviewRelated = /\/reviews3\//.test(path);
  const ticketRelated =
    /\/tickets\//.test(path) ||
    /\/tickets$/.test(path) ||
    /\/ticket-notes/.test(path) ||
    /\/tickets\/count/.test(path);
  let category = "other";
  if (reviewRelated && ticketRelated) category = "review+ticket";
  else if (reviewRelated) category = "review";
  else if (ticketRelated) category = "ticket";
  return { reviewRelated, ticketRelated, category };
}

function enrichLog(log, seq) {
  const startTime = typeof log.startTime === "number" ? log.startTime : Date.now();
  const durationMs = typeof log.durationMs === "number" ? log.durationMs : 0;
  const url = log.url || "";
  let { reviewId, ticketId } = extractIds(url);
  const qp = log.queryParams;
  const fromQuery = ticketIdFromQueryParams(qp);
  if (!ticketId && fromQuery) ticketId = fromQuery;
  const { reviewRelated, ticketRelated, category } = classifyApi(url);
  const pageUrl = log.pageUrl || "";
  const env = classifyEnv(hostOf(pageUrl) || hostOf(url));
  const area = pageUrl ? classifyPageArea(pageUrl) : "other";
  return {
    seq,
    timeIST: formatIST(startTime),
    startTimeMs: startTime,
    method: log.method || "GET",
    path: pathnameOnly(url),
    fullUrl: url,
    pageUrl,
    env,
    area,
    durationMs,
    statusCode: log.statusCode ?? "",
    reviewId,
    ticketId,
    reviewRelated,
    ticketRelated,
    category,
  };
}

function buildSummary(rows) {
  let totalDurationMs = 0;
  let reviewApiCalls = 0;
  let ticketApiCalls = 0;
  const byReviewId = {};
  const byTicketId = {};
  const byPath = {};

  for (const r of rows) {
    totalDurationMs += r.durationMs;
    if (r.reviewRelated) reviewApiCalls += 1;
    if (r.ticketRelated) ticketApiCalls += 1;

    if (!byPath[r.path]) {
      byPath[r.path] = { calls: 0, totalDurationMs: 0 };
    }
    byPath[r.path].calls += 1;
    byPath[r.path].totalDurationMs += r.durationMs;

    if (r.reviewId) {
      if (!byReviewId[r.reviewId]) {
        byReviewId[r.reviewId] = { calls: 0, totalDurationMs: 0 };
      }
      byReviewId[r.reviewId].calls += 1;
      byReviewId[r.reviewId].totalDurationMs += r.durationMs;
    }
    if (r.ticketId) {
      if (!byTicketId[r.ticketId]) {
        byTicketId[r.ticketId] = { calls: 0, totalDurationMs: 0 };
      }
      byTicketId[r.ticketId].calls += 1;
      byTicketId[r.ticketId].totalDurationMs += r.durationMs;
    }
  }

  return {
    totalCalls: rows.length,
    totalDurationMs,
    reviewApiCalls,
    ticketApiCalls,
    byReviewId,
    byTicketId,
    byPath,
  };
}

function escapeCsvCell(s) {
  const str = s == null ? "" : String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows) {
  const headers = [
    "Seq",
    "Time (IST)",
    "Env",
    "Area",
    "Method",
    "Path",
    "Page URL",
    "Duration (ms)",
    "Status",
    "Review ID",
    "Ticket ID",
    "Category",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.seq,
        r.timeIST,
        r.env,
        r.area,
        r.method,
        r.path,
        r.pageUrl,
        r.durationMs,
        r.statusCode,
        r.reviewId,
        r.ticketId,
        r.category,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

function buildReport(logs) {
  const list = Array.isArray(logs) ? logs : [];
  const rows = list.map((log, i) => enrichLog(log, i + 1));
  const summary = buildSummary(rows);
  const csv = toCsv(rows);
  const exportedAt = new Date();
  const jsonReport = {
    exportedAt: exportedAt.toISOString(),
    exportedAtIST: formatIST(exportedAt.getTime()),
    loggedOrigin: loggedOriginLabel(),
    loggedPageUrl: loggedPageLabel(),
    timeZone: IST_TZ,
    extensionVersion:
      typeof chrome !== "undefined" && chrome.runtime?.getManifest
        ? chrome.runtime.getManifest().version
        : "",
    summary,
    sequence: rows.map((r) => ({
      seq: r.seq,
      timeIST: r.timeIST,
      startTimeMs: r.startTimeMs,
      method: r.method,
      path: r.path,
      pageUrl: r.pageUrl || null,
      env: r.env,
      area: r.area,
      durationMs: r.durationMs,
      statusCode: r.statusCode,
      reviewId: r.reviewId || null,
      ticketId: r.ticketId || null,
      category: r.category,
    })),
  };
  return { rows, summary, csv, jsonReport };
}

// Group by ticketId only. Calls without their own ticketId inherit the most
// recent one (carry-forward), so a ticket's whole flow — including its review
// calls — stays in one section. Calls before any ticket get no key and land in
// the trailing "Other" group.
function applyCarryForward(rows) {
  let cfTicket = "";
  return rows.map((r) => {
    if (r.ticketId) cfTicket = r.ticketId;
    const groupTicket = cfTicket || "";
    return {
      ...r,
      groupTicket,
      groupKey: groupTicket || "__other__",
    };
  });
}

function buildTicketGroups(rows) {
  const m = {};
  for (const r of rows) {
    const k = r.groupKey;
    if (!m[k]) {
      m[k] = {
        groupTicket: r.groupTicket,
        groupKey: k,
        isOther: k === "__other__",
        calls: [],
        totalDurationMs: 0,
        msTicketOnly: 0,
        msReviewOnly: 0,
        msOverlap: 0,
        msOther: 0,
        firstStart: Infinity,
      };
    }
    const g = m[k];
    g.calls.push(r);
    g.totalDurationMs += r.durationMs;
    if (typeof r.startTimeMs === "number" && r.startTimeMs < g.firstStart) {
      g.firstStart = r.startTimeMs;
    }
    const tr = r.ticketRelated;
    const vr = r.reviewRelated;
    if (tr && vr) g.msOverlap += r.durationMs;
    else if (tr) g.msTicketOnly += r.durationMs;
    else if (vr) g.msReviewOnly += r.durationMs;
    else g.msOther += r.durationMs;
  }
  // Ticket groups first, in order of first appearance; "Other" always last.
  return Object.values(m).sort((a, b) => {
    if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
    return a.firstStart - b.firstStart;
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlDocument(full) {
  const dataForJson = { ...full };
  delete dataForJson.html;
  const rawJson = JSON.stringify(dataForJson, null, 2);
  const jsonBlock = escapeHtml(rawJson);
  const groups = full.ticketGroups || [];
  const parts = [];
  parts.push(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>API report</title>
<style>
:root {
  --indigo:#4f46e5; --indigo2:#6366f1; --indigo-d:#4338ca;
  --ink:#0f172a; --muted:#64748b; --line:#e8ebf2; --card:#ffffff;
}
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: 0; padding: 30px 26px 64px; color: var(--ink);
  background: linear-gradient(180deg, #f7f8fc 0%, #eef1f8 100%);
  min-height: 100vh; -webkit-font-smoothing: antialiased;
}
::selection { background: rgba(99,102,241,0.18); }
h1 {
  font-size: 1.5rem; font-weight: 750; letter-spacing: -0.02em; margin: 0 0 5px;
  display: flex; align-items: center; gap: 11px;
}
h1::before {
  content: ""; width: 13px; height: 13px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--indigo2), var(--indigo-d));
  box-shadow: 0 0 0 4px rgba(99,102,241,0.16);
}
.meta { font-size: 0.82rem; color: var(--muted); line-height: 1.65; margin: 0 0 20px; }

section.group {
  background: var(--card); border: 1px solid var(--line); border-radius: 16px;
  padding: 18px 18px 8px; margin: 0 0 20px;
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 14px 30px -22px rgba(15,23,42,0.30);
}
h2 {
  font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; color: #1e1b4b;
  margin: 2px 0 14px; padding-left: 13px; position: relative;
}
h2::before {
  content: ""; position: absolute; left: 0; top: 1px; bottom: 1px; width: 4px; border-radius: 3px;
  background: linear-gradient(180deg, var(--indigo2), var(--indigo-d));
}

.sum { display: grid; grid-template-columns: repeat(auto-fill, minmax(152px, 1fr)); gap: 10px; font-size: 0.78rem; margin: 0 0 16px; }
.sum div { background: linear-gradient(180deg, #fafbff, #f3f5fc); border: 1px solid #edf0f7; padding: 10px 12px; border-radius: 11px; }
.sum div:first-child { background: linear-gradient(135deg, rgba(99,102,241,0.13), rgba(67,56,202,0.10)); border-color: rgba(99,102,241,0.28); }
.sum strong { display: block; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin-bottom: 3px; }

table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.78rem; margin: 0 0 10px; }
thead th {
  background: #f3f4fb; color: #3730a3; font-weight: 650; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em;
  text-align: left; padding: 8px 10px; border-bottom: 1px solid #e3e6f0; white-space: nowrap;
}
thead th:first-child { border-top-left-radius: 10px; }
thead th:last-child { border-top-right-radius: 10px; }
tbody td { padding: 7px 10px; border-bottom: 1px solid #f0f2f7; vertical-align: top; }
tbody tr:nth-child(even) { background: #fbfcfe; }
tbody tr:hover { background: #f4f6ff; }
td:nth-child(7), td:nth-child(8) { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.72rem; color: #475569; word-break: break-all; }
th:nth-child(9), td:nth-child(9) { text-align: right; font-variant-numeric: tabular-nums; font-weight: 650; white-space: nowrap; }
td:nth-child(6) { font-weight: 600; color: #334155; }

.env-tag { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.env-prod { background: #dcfce7; color: #166534; }
.env-qa { background: #fef9c3; color: #854d0e; }
.env-dev { background: #dbeafe; color: #1e40af; }
.env-staging { background: #f3e8ff; color: #6b21a8; }
.env-uat { background: #ffedd5; color: #9a3412; }
.env-other { background: #f1f5f9; color: #475569; }

.rawbox { margin-top: 30px; }
.rawbox summary { font-size: 0.9rem; font-weight: 700; color: #1e1b4b; cursor: pointer; padding: 6px 0; }
.rawbox summary:hover { color: #4338ca; }
.rawbox[open] summary { margin-bottom: 8px; }
#rawjson {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.4;
  white-space: pre-wrap; word-break: break-all; background: #0f172a; color: #cbd5e1;
  padding: 16px; border-radius: 12px; overflow: auto; max-height: 52vh; border: 1px solid #1e293b;
}

@media (max-width: 680px) { body { padding: 18px 14px 48px; } }
</style>
</head>
<body>
<h1>API latency report</h1>
<div class="meta">Exported ${escapeHtml(full.exportedAtIST || "")}<br />Logged: ${escapeHtml(
    String(full.loggedPageUrl || full.loggedOrigin || "")
  )}<br />${full.summary?.totalCalls ?? 0} calls (each row shows the page it came from)</div>
`);

  for (const g of groups) {
    const title = g.isOther
      ? "Other (no ticket)"
      : `Ticket ${escapeHtml(g.groupTicket)}`;
    parts.push(`<section class="group">`);
    parts.push(`<h2>${title}</h2>`);
    parts.push(`<div class="sum">
<div><strong>Total</strong>${g.totalDurationMs} ms · ${g.calls.length} calls</div>
<div><strong>Review paths</strong>${g.msReviewOnly} ms</div>
<div><strong>Both</strong>${g.msOverlap} ms</div>
<div><strong>Other</strong>${g.msOther} ms</div>
</div>`);
    parts.push(
      "<table><thead><tr><th>#</th><th>Seq</th><th>Time (IST)</th><th>Env</th><th>Area</th><th>Method</th><th>Path</th><th>Page</th><th>Duration</th><th>Status</th><th>Category</th></tr></thead><tbody>"
    );
    g.calls.forEach((c, i) => {
      const env = c.env || "other";
      const area = c.area || "other";
      parts.push(
        `<tr><td>${i + 1}</td><td>${c.seq}</td><td>${escapeHtml(
          c.timeIST
        )}</td><td><span class="env-tag env-${escapeHtml(env)}">${escapeHtml(
          env
        )}</span></td><td>${escapeHtml(area)}</td><td>${escapeHtml(
          c.method
        )}</td><td>${escapeHtml(c.path)}</td><td>${escapeHtml(
          c.pageUrl || ""
        )}</td><td>${c.durationMs}</td><td>${escapeHtml(
          String(c.statusCode)
        )}</td><td>${escapeHtml(c.category)}</td></tr>`
      );
    });
    parts.push("</tbody></table>");
    parts.push(`</section>`);
  }

  parts.push(`<details class="rawbox">
<summary>Full data (JSON)</summary>
<pre id="rawjson">${jsonBlock}</pre>
</details>
</body></html>`);
  return parts.join("\n");
}

function buildFullExport(logs) {
  const list = Array.isArray(logs) ? logs : [];
  const { rows, summary, csv, jsonReport } = buildReport(list);
  const rowsWithGroup = applyCarryForward(rows);
  const ticketGroups = buildTicketGroups(rowsWithGroup);
  const sequence = rowsWithGroup.map((r) => ({
    seq: r.seq,
    timeIST: r.timeIST,
    startTimeMs: r.startTimeMs,
    method: r.method,
    path: r.path,
    pageUrl: r.pageUrl || null,
    env: r.env,
    area: r.area,
    durationMs: r.durationMs,
    statusCode: r.statusCode,
    reviewId: r.reviewId || null,
    ticketId: r.ticketId || null,
    groupTicket: r.groupTicket || null,
    groupKey: r.groupKey,
    category: r.category,
  }));
  const full = {
    ...jsonReport,
    summary,
    sequence,
    ticketGroups,
    csv,
    rawLogs: list,
    diagnostics: {
      storedEntryCount: list.length,
      ...(list.length === 0
        ? {
            hint:
              "No entries in storage. Open a tab at " +
              loggedPageLabel() +
              ", use the app, then export. Only requests from that tab page are logged.",
          }
        : {}),
    },
  };
  full.html = buildHtmlDocument(full);
  return full;
}
