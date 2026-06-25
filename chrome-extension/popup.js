const STORAGE_KEY = "apiNetworkLogs";

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text || "";
}

function setRecordCount(n) {
  const el = document.getElementById("recordCount");
  if (el) el.textContent = typeof n === "number" ? String(n) : "0";
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function getLogs() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const logs = result[STORAGE_KEY];
  return Array.isArray(logs) ? logs : [];
}

// Build the HTML report as a downloadable file.
async function buildReportFile() {
  const logs = await getLogs();
  const full = buildFullExport(logs);
  const filename = `rep-pulse-${stamp()}.html`;
  const blob = new Blob([full.html], { type: "text/html;charset=utf-8" });
  const calls = full.summary?.totalCalls ?? 0;
  return { blob, filename, calls };
}

async function refreshRecordCount() {
  try {
    const logs = await getLogs();
    setRecordCount(logs.length);
  } catch {
    setRecordCount(0);
  }
}

document.getElementById("downloadFull").addEventListener("click", async () => {
  setStatus("");
  try {
    const { blob, filename, calls } = await buildReportFile();
    downloadBlob(filename, blob);
    setStatus(calls > 0 ? `Saved ${calls} calls.` : "Saved (no calls yet).");
    await refreshRecordCount();
  } catch {
    setStatus("Export failed.");
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  setStatus("");
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    setStatus("Logs cleared.");
    await refreshRecordCount();
  } catch {
    setStatus("Clear failed.");
  }
});

document.addEventListener("DOMContentLoaded", refreshRecordCount);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    refreshRecordCount();
  }
});
