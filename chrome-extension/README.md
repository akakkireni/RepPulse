# Rep Pulse — API Latency Logger

A small Chrome extension that records **every API call the Reputation app makes while you use it**, with exact millisecond timing, and saves it as **one shareable HTML report**.

> **TL;DR** — Instead of recording a screen video of "it felt slow," click **Download report** and send the `.html`. It shows exactly which API call was slow, how many ms, on which environment, grouped per ticket.

---

## Why use this instead of a latency video

A video shows *that* something was slow. This report shows the **numbers**:

- **Which** API call (method + path)
- **How long** it took (milliseconds)
- **Which environment** (prod / qa / dev)
- **Which page / ticket type** (e.g. Agency Actions · RespondToReview)
- **Which ticket** the calls belong to, grouped together

## What it measures (for the devs)

- **Level:** browser / client side — the latency the user's browser actually experiences, **not** server internals.
- **How:** Chrome's `webRequest` API observes each network request from request-sent to response-complete.
- **Metric:** end-to-end wall-clock duration per API call in ms (network + server time, as seen by the client). Great for spotting which call is slow; it's not a micro-benchmark.
- **Not** node / server instrumentation — no DB timings, no code profiling, no APM spans.
- **Captured per call:** full URL, method, HTTP status, start/end time, duration. **Not captured:** response bodies, request payloads, headers.

---

## Install (one time, ~1 minute)

You'll receive a **zip file**. Then:

1. **Unzip** it → you get a folder named `chrome-extension`.
2. Open Chrome → **`chrome://extensions`**.
3. Turn on **Developer mode** (toggle, top-right).
4. Click **Load unpacked** → select the **`chrome-extension`** folder (the one with `manifest.json`).
5. Pin the **Rep Pulse** icon (puzzle-piece 🧩 → Pin).

> *Developer mode is required because this is an internal tool, not a Chrome Web Store app. All data stays on your computer — nothing is uploaded. If your Chrome is managed by IT policy and blocks unpacked extensions, ask IT to allowlist it.*

---

## How to capture latency

1. Open the Reputation app page you want to measure. **Any environment and any page works** — `app.reputation.com`, `app-qa.reputation.com`, `app.qa.reputation.com`, etc.
2. *(Recommended)* Click **Rep Pulse → Clear logs** to start clean.
3. **Use the app normally** — open the ticket, respond to the review, etc. Every API call is recorded automatically.
4. Click **Rep Pulse → Download report**. A file `rep-pulse-<date-time>.html` is saved.
5. **Share that `.html` file** with the dev team — attach it in email or drop it in Slack.

---

## The popup — what each option does

| Option | What it does |
|---|---|
| **Calls captured** | Live count of API calls recorded so far. |
| **Download report** | Saves the full report as one `.html` file. |
| **Clear logs** | Erases recorded calls. Use it before starting a new test. |

---

## Reading the report

Open the downloaded `.html` in any browser. It's **plain HTML + CSS (no scripts)**, so it's safe to email and opens anywhere.

- **Header** — when it was exported and the total number of calls.
- **Ticket sections** — **one section per ticket** (e.g. *Ticket 77889547*) showing that ticket's **entire flow**: every call with time, env, area, method, path, page, **duration (ms)**, status, and category. Each section has a quick summary (total ms, plus review-path / overlap / other time).
- **Other (no ticket)** — calls not tied to any ticket (like initial page loads), always shown **last**.
- **Full data (JSON)** — at the very bottom, click to expand. Select all and copy if a dev wants the raw data.
- **Tip:** use your browser's **Find** (Ctrl/Cmd + F) to jump to a URL, ticket, or env.

### What "Env" and "Area" mean

- **Env** is read from the website address: `app.reputation.com` → **prod**, `app-qa` / `app.qa` → **qa**, `app-dev` / `app.dev` → **dev**, and so on.
- **Area** is the screen you were on. For Agency Actions it includes the ticket type, so *RespondToReview* and *PostReviewResponse* are separate.

---

## Sharing back with the dev team (copy-paste template)

> **Latency capture** — env: qa, page: Agency Actions · RespondToReview.
> Ticket 77889547 took ~6.4s across 11 calls (slowest: /api/tenants/234450 at 915 ms).
> Report attached — open the .html in a browser.

---

## Privacy & safety

- Everything is stored **locally in your browser** until you click *Download report*. **Nothing is sent anywhere.**
- Only API calls from **Reputation app tabs** are recorded. **Response bodies are never captured** — only URL, method, status, and timing.
- The downloaded report is **static HTML/CSS with no JavaScript** — nothing executes when you open it.

See [SECURITY.md](SECURITY.md) for the full security posture (permissions, data handling, threat model).

---

## Troubleshooting

- **"Calls captured: 0"** — Make sure you're on a Reputation app page (address starts with `app…reputation.com`) and that you *used* the app after installing. Reload the page and try again.
- **Don't see the icon** — Click the puzzle-piece 🧩 in Chrome's toolbar and pin **Rep Pulse**.
- **A new environment records nothing** — The address must look like `app-<env>.reputation.com` or `app.<env>.reputation.com`. If your env uses a different host, tell the dev team and they'll add it.
- **Updated to a new version** — On `chrome://extensions`, click **Reload** on the Rep Pulse card (or remove the old one and **Load unpacked** the new folder).
