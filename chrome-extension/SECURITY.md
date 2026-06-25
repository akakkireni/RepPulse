# Security overview

This document summarizes the security posture of the Rep Pulse Chrome extension for review.

## What it is

A Manifest V3 Chrome extension that passively records timing metadata for network requests made by the Reputation web app, and lets the user export a static HTML report. It is an internal QA tool, loaded unpacked.

## Permissions and why each is needed

| Permission | Why |
|---|---|
| `webRequest` | Observe request start/complete events to measure per-call latency. Observation only — the extension does **not** use `webRequestBlocking` and cannot modify, redirect, or cancel any request. |
| `storage` | Persist captured timing records locally (`chrome.storage.local`) until the user exports or clears them. |
| `tabs` | Read the originating tab's URL to confirm a request came from a Reputation app page before recording it. |
| `host_permissions: https://*.reputation.com/*` | Scope observation to Reputation domains only. No other origin is touched. |

## Data handling

- **Local only.** All captured data lives in `chrome.storage.local` on the user's machine. The extension makes **no network requests of its own** — there is no telemetry, no backend, no upload, no external endpoint.
- **Minimal capture.** Per request it stores: URL, HTTP method, status code, start/end timestamps, and computed duration. It does **not** read or store request bodies, response bodies, headers, or cookies.
- **Scope gate.** A record is only persisted if the originating tab's host matches `app[-.]<env>.reputation.com` (see `config.js`, `isLoggedPageUrl`). Static assets are skipped.
- **User-controlled lifecycle.** Data is cleared by the user (Clear logs) and is capped at the most recent 1000 entries.

## No active/remote code

- **No remote code.** Nothing is fetched and executed; there is no `eval`, no `new Function`, no remotely hosted scripts. All logic ships in the package.
- **No content scripts.** The extension does not inject any script into web pages; it cannot read or alter page DOM, form fields, or app state.
- **Static export.** The downloaded HTML report contains **only HTML and CSS — no `<script>`, no inline event handlers, no `javascript:` URIs**. Opening it executes nothing. (This also means it passes email/attachment malware filters that block HTML-with-script.)
- **Output escaping.** All captured values interpolated into the report are HTML-escaped (`escapeHtml`) to prevent markup injection in the generated file.

## Threat model notes

- The most sensitive capability is reading tab URLs (`tabs`) and observing `*.reputation.com` request URLs. URLs may contain identifiers (ticket/review IDs, query params). This metadata stays local and is only surfaced when the user explicitly exports a report they then choose to share.
- The extension has no ability to exfiltrate data on its own; sharing is a deliberate user action (downloading a file).

## Files

- `manifest.json` — permissions and entry points
- `config.js` — host allowlist (`LOGGED_HOST_REGEX`, `isLoggedPageUrl`)
- `background.js` — webRequest observation + local persistence
- `popup.html` / `popup.js` — UI (Download report, Clear logs)
- `report.js` — builds the static HTML report (pure string assembly, escaped)
- `icons/` — extension icons
