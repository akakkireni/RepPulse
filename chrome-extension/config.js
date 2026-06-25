// Hosts whose API calls we log: the Reputation app on ANY environment, on ANY path.
// Env can be a hyphen suffix or a sub-label, in any combination:
//   app.reputation.com, app-qa.reputation.com, app.qa.reputation.com,
//   app-dev.reputation.com, app.staging.eu.reputation.com, ...
var LOGGED_HOST_REGEX = /^app(?:-[a-z0-9-]+)?(?:\.[a-z0-9-]+)*\.reputation\.com$/i;

// webRequest match pattern (coarse). Match patterns can't express the regex
// above, so we allow any reputation.com subdomain here and gate precisely by the
// tab's URL via isLoggedPageUrl() before anything is persisted.
var LOGGED_URL_PATTERN = "https://*.reputation.com/*";

// Shown in the popup / report so it's clear what gets logged.
var LOGGED_PAGE_LABEL =
  "https://app.reputation.com/* — any path, any env (e.g. app.qa.reputation.com)";

function isLoggedHostname(hostname) {
  return typeof hostname === "string" && LOGGED_HOST_REGEX.test(hostname);
}

// True when a tab URL is an app page we should log (any path on an app.<env> host).
function isLoggedPageUrl(urlString) {
  try {
    var u = new URL(urlString);
    return u.protocol === "https:" && isLoggedHostname(u.hostname);
  } catch (e) {
    return false;
  }
}
