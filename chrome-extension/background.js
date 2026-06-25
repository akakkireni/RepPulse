importScripts("config.js");

const STORAGE_KEY = "apiNetworkLogs";
const MAX_LOGS = 1000;
const TARGET_URL_FILTER = [LOGGED_URL_PATTERN];

const STATIC_OR_ASSET_PATTERN =
  /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|css|js|mjs|cjs|map|woff2?|ttf|eot|otf|mp4|webm|mp3|wav|pdf)$/i;

let pendingByRequestId = new Map();
let persistChain = Promise.resolve();

function parseQueryParams(urlString) {
  try {
    const u = new URL(urlString);
    const params = {};
    u.searchParams.forEach((value, key) => {
      if (params[key] !== undefined) {
        const existing = params[key];
        params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        params[key] = value;
      }
    });
    return params;
  } catch {
    return {};
  }
}

function shouldRecord(details) {
  const t = details.type;
  if (t !== "xmlhttprequest" && t !== "other") return false;
  if (STATIC_OR_ASSET_PATTERN.test(details.url)) return false;
  return true;
}

function makeLogEntry({
  requestId,
  url,
  method,
  statusCode,
  startTime,
  endTime,
  error,
}) {
  const durationMs = Math.round(endTime - startTime);
  const timestamp = new Date(startTime).toISOString();
  let queryParams = {};
  try {
    queryParams = parseQueryParams(url);
  } catch {
    queryParams = {};
  }

  return {
    id: `${requestId}-${Math.round(startTime)}`,
    url,
    pageUrl: null,
    method,
    statusCode: statusCode ?? null,
    startTime,
    endTime,
    durationMs,
    timestamp,
    queryParams,
    source: "webRequest",
    ...(error ? { error } : {}),
  };
}

async function appendLog(entry) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  let logs = result[STORAGE_KEY];
  if (!Array.isArray(logs)) logs = [];

  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: logs });
}

function enqueuePersist(entry) {
  persistChain = persistChain
    .then(() => appendLog(entry))
    .catch((e) => {
      console.error("[api-network-logger] storage write failed", e);
    });
}

// Persist the entry only if the originating tab is on a logged app page (any
// path on app.<env>.reputation.com). Stamp the record with the tab's full URL
// so each call records exactly which page it came from.
function persistForTab(tabId, entry) {
  if (tabId === undefined || tabId < 0) return;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url) return;
    if (!isLoggedPageUrl(tab.url)) return;
    entry.pageUrl = tab.url;
    enqueuePersist(entry);
  });
}

const requestFilter = { urls: TARGET_URL_FILTER };

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!shouldRecord(details)) return;
    if (pendingByRequestId.has(details.requestId)) return;

    pendingByRequestId.set(details.requestId, {
      startTime: Date.now(),
      method: details.method,
      url: details.url,
    });
  },
  requestFilter,
  []
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!shouldRecord(details)) return;

    const pending = pendingByRequestId.get(details.requestId);
    pendingByRequestId.delete(details.requestId);

    const startTime = pending?.startTime ?? Date.now();
    const method = details.method || pending?.method || "GET";
    const url = details.url || pending?.url;

    const entry = makeLogEntry({
      requestId: details.requestId,
      url,
      method,
      statusCode: details.statusCode,
      startTime,
      endTime: Date.now(),
    });
    persistForTab(details.tabId, entry);
  },
  requestFilter
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!shouldRecord(details)) return;

    const pending = pendingByRequestId.get(details.requestId);
    pendingByRequestId.delete(details.requestId);

    const startTime = pending?.startTime ?? Date.now();
    const method = details.method || pending?.method || "GET";
    const url = details.url || pending?.url;

    const entry = makeLogEntry({
      requestId: details.requestId,
      url,
      method,
      statusCode: null,
      startTime,
      endTime: Date.now(),
      error: details.error,
    });
    persistForTab(details.tabId, entry);
  },
  requestFilter
);
