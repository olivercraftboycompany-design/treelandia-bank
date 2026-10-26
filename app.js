const API = "https://bankoftreelandia.sites.tab.bot/api";
const BANK_NAME = "Bank of Treelandia";
const SYMBOL = "P$";
const TOKEN_KEY = "treelandia.token";

const app = document.getElementById("app");
let token = localStorage.getItem(TOKEN_KEY);
let user = null;
let flash = null;
let pendingSend = null;
let loginStep = null;

class Safe {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escape(value) {
  if (value == null || value === false) return "";
  if (Array.isArray(value)) return value.map(escape).join("");
  if (value instanceof Safe) return value.value;
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => (out += escape(value) + strings[i + 1]));
  return new Safe(out);
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/>',
  send: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  request: '<path d="M17 7 7 17"/><path d="M16 17H7V8"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  loans: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  inflation: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
  fingerprint:
    '<path d="M12 11v3"/><path d="M8.5 9.5a3.5 3.5 0 0 1 7 0V14a7 7 0 0 1-1 3.6"/><path d="M5.5 8a7 7 0 0 1 13 0c.3 1 .5 2 .5 3v3"/><path d="M5 12v2a7 7 0 0 0 .8 3.3"/><path d="M8.5 13.5v.5a3.5 3.5 0 0 0 .5 1.8"/>',
};

function icon(name) {
  return new Safe(
    `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`,
  );
}

function money(cents, signed = false) {
  const abs = Math.abs(cents);
  const text = `${SYMBOL}${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  if (cents < 0) return `\u2212${text}`;
  if (signed && cents > 0) return `+${text}`;
  return text;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function time(seconds, withTime = false) {
  const date = new Date(seconds * 1000);
  return html`<time datetime="${date.toISOString()}">${(withTime ? dateTimeFormat : dateFormat).format(date)}</time>`;
}

class ApiError extends Error {
  constructor(status, message, errors = {}) {
    super(message ?? "Something went wrong. Please try again.");
    this.status = status;
    this.errors = errors;
  }
}

async function api(path, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(API + path, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Can't reach the bank right now. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    forgetSession();
    go("/login");
    throw new ApiError(401, "Your session expired. Sign in again.");
  }
  if (!res.ok) {
    const errors = data.errors || {};
    throw new ApiError(res.status, data.error || (Object.keys(errors).length ? "" : null), errors);
  }
  return data;
}

function saveSession(data) {
  token = data.token;
  user = data.user;
  localStorage.setItem(TOKEN_KEY, token);
}

function forgetSession() {
  token = null;
  user = null;
  pendingSend = null;
  localStorage.removeItem(TOKEN_KEY);
}

function go(path) {
  if (location.hash === `#${path}`) route();
  else location.hash = path;
}

function currentRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(query) };
}

function alert(message, tone = "error") {
  if (!message) return "";
  return html`<div class="alert alert-${tone}" role="${tone === "error" ? "alert" : "status"}">${message}</div>`;
}

function field({ label, name, type = "text", value = "", error, autocomplete, inputmode, required = true, prefix, maxlength }) {
  const id = `field-${name}`;
  const input = html`<input id="${id}" name="${name}" type="${type}" value="${value}"${autocomplete ? html` autocomplete="${autocomplete}"` : ""}${
    inputmode ? html` inputmode="${inputmode}"` : ""
  }${maxlength ? html` maxlength="${maxlength}"` : ""}${required ? html` required` : ""}${error ? html` aria-invalid="true"` : ""}>`;
  return html`<div class="field${error ? " has-error" : ""}">
    <label for="${id}">${label}</label>
    ${prefix ? html`<div class="input-prefix"><span>${prefix}</span>${input}</div>` : input}
    ${error ? html`<p class="field-error">${error}</p>` : ""}
  </div>`;
}

const NAV = [
  { href: "/", label: "Home", icon: "home", section: "account" },
  { href: "/send", label: "Send", icon: "send", section: "send" },
  { href: "/request", label: "Request", icon: "request", section: "request" },
  { href: "/requests", label: "Requests", icon: "inbox", section: "requests" },
  { href: "/people", label: "People", icon: "search", section: "people" },
  { href: "/loans", label: "Loans", icon: "loans", section: "loans" },
  { href: "/inflation", label: "Inflation", icon: "inflation", section: "inflation" },
];

function publicPage(body) {
  document.body.className = "public";
  app.innerHTML = html`<main class="public-main">
    <a class="wordmark wordmark-dark" href="#/login">${BANK_NAME}</a>
    ${body}
  </main>`;
  focusFirstError();
}

function bankPage(section, body, title) {
  document.body.className = "bank";
  document.title = title ? `${title} - ${BANK_NAME}` : BANK_NAME;
  const badge = user?.pendingRequests > 0 ? html`<span class="badge">${user.pendingRequests}</span>` : "";
  const link = (item, className) => html`<a class="${className}${item.section === section ? " is-active" : ""}" href="#${item.href}"${
    item.section === section ? html` aria-current="page"` : ""
  }>${icon(item.icon)}<span>${item.label}</span>${item.section === "requests" ? badge : ""}</a>`;
  const message = flash;
  flash = null;

  app.innerHTML = html`<header class="topbar">
      <div class="wrap topbar-inner">
        <a class="wordmark" href="#/">${BANK_NAME}</a>
        <nav class="topnav" aria-label="Main">
          ${NAV.map((item) => link(item, "topnav-link"))}
          <a class="topnav-link${section === "settings" ? " is-active" : ""}" href="#/settings">${icon("settings")}<span>Settings</span></a>
        </nav>
        <a class="topbar-settings${section === "settings" ? " is-active" : ""}" href="#/settings" aria-label="Settings">${icon("settings")}</a>
      </div>
    </header>
    <main class="wrap main">
      ${alert(message, "success")}
      ${body}
    </main>
    <nav class="tabbar" aria-label="Main">
      ${NAV.map((item) => link(item, "tabbar-link"))}
    </nav>`;
  focusFirstError();
}

function focusFirstError() {
  enhancePasswords();
  app.querySelector("[aria-invalid=true]")?.focus();
}

const EYE =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.4 3.3"/><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/></svg>';

function enhancePasswords() {
  for (const input of app.querySelectorAll('input[type="password"]')) {
    const wrap = document.createElement("div");
    wrap.className = "password-wrap";
    input.replaceWith(wrap);
    wrap.append(input);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "reveal";
    const set = (shown) => {
      input.type = shown ? "text" : "password";
      toggle.innerHTML = shown ? EYE_OFF : EYE;
      toggle.setAttribute("aria-label", shown ? "Hide password" : "Show password");
      toggle.setAttribute("aria-pressed", String(shown));
    };
    toggle.addEventListener("click", () => {
      set(input.type === "password");
      input.focus();
    });
    input.form?.addEventListener("submit", () => set(false));
    set(false);
    wrap.append(toggle);
  }
}

function errorPage(section, error) {
  bankPage(section, html`<section class="panel empty-state"><h1>${error.message}</h1><p><a href="#/">Go to your account</a></p></section>`);
}

function loginView({ values = {}, error } = {}) {
  document.title = `Sign in - ${BANK_NAME}`;
  publicPage(html`<section class="auth-card">
    <h1>Sign in</h1>
    ${alert(error)}
    <form data-action="login" novalidate>
      ${field({ label: "Username or email", name: "login", value: values.login, autocomplete: "username" })}
      ${field({ label: "Password", name: "password", type: "password", autocomplete: "current-password" })}
      <button class="button button-primary button-block" type="submit">Sign in</button>
      <p class="auth-help">Lost your password? Email us at <a href="mailto:olivercraftboycompany@gmail.com">olivercraftboycompany@gmail.com</a></p>
    </form>
    ${
      passkeysSupported
        ? html`<button class="button button-block button-icon passkey-signin" type="button" data-passkey-login>${icon("fingerprint")}<span>Sign in with fingerprint</span></button>`
        : ""
    }
    <p class="auth-switch">New to ${BANK_NAME}? <a href="#/signup">Open an account</a></p>
  </section>`);
}

const passkeysSupported = Boolean(window.PublicKeyCredential && navigator.credentials);
const b64 = {
  encode: (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
};

async function passkeySignIn(button) {
  button.disabled = true;
  try {
    const options = await api("/login/passkey/options", {});
    const credential = await navigator.credentials.get({ publicKey: { ...options, challenge: b64.decode(options.challenge) } });
    afterLogin(
      await api("/login/passkey", {
        id: credential.id,
        clientDataJSON: b64.encode(credential.response.clientDataJSON),
        authenticatorData: b64.encode(credential.response.authenticatorData),
        signature: b64.encode(credential.response.signature),
      }),
    );
  } catch (err) {
    button.disabled = false;
    if (err.name === "NotAllowedError" || err.name === "AbortError") return;
    loginView({ error: err.message || "That passkey didn't work." });
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-passkey-login]");
  if (button) passkeySignIn(button);
});

const LOAN_STATUS = { pending: "Pending", active: "Active", repaid: "Repaid", denied: "Denied", overdue: "Overdue" };

function loanBadge(loan) {
  return html`<span class="status status-loan-${loan.status}">${LOAN_STATUS[loan.status]}</span>`;
}

function amountValue(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

async function loansPage({ errors = {}, values = {}, repayErrors = {} } = {}) {
  const data = await api("/loans");
  const loan = data.loan;
  const overdue = loan?.status === "overdue";
  const open = loan && (loan.status === "active" || overdue);
  bankPage(
    "loans",
    html`<h1 class="page-title">Loans</h1>
    ${
      loan
        ? html`<section class="panel${overdue ? " panel-overdue" : ""}">
            <header class="panel-head"><h2>Current loan</h2>${loanBadge(loan)}</header>
            <dl class="details">
              <div><dt>Amount</dt><dd>${money(loan.amount)}</dd></div>
              <div><dt>Total owed</dt><dd>${money(loan.owed)}</dd></div>
              ${
                open
                  ? html`<div><dt>Paid</dt><dd>${money(loan.repaid)}</dd></div>
                    <div><dt>Left to pay</dt><dd class="strong">${money(loan.remaining)}</dd></div>
                    <div><dt>Due</dt><dd class="${overdue ? "text-red" : ""}">${time(loan.dueAt)}</dd></div>`
                  : ""
              }
              <div><dt>Reason</dt><dd>${loan.reason}</dd></div>
            </dl>
          </section>
          ${
            open
              ? html`<section class="panel panel-form">
                  <header class="panel-head"><h2>Repay</h2></header>
                  <form data-action="loan-repay" novalidate>
                    ${field({ label: "Amount", name: "amount", value: values.repay ?? amountValue(Math.min(loan.remaining, data.balance) || loan.remaining), prefix: SYMBOL, inputmode: "decimal", autocomplete: "off", error: repayErrors.amount })}
                    <button class="button button-primary" type="submit">Pay</button>
                  </form>
                </section>`
              : ""
          }`
        : html`<section class="panel panel-form">
            <header class="panel-head"><h2>Request a loan</h2><span class="muted">Limit ${money(data.limit)}</span></header>
            ${
              data.limit > 0
                ? html`<form data-action="loan-request" novalidate>
                    ${field({ label: "Amount", name: "amount", value: values.amount, prefix: SYMBOL, inputmode: "decimal", autocomplete: "off", error: errors.amount })}
                    ${field({ label: "Reason", name: "reason", value: values.reason, maxlength: 200, autocomplete: "off", error: errors.reason })}
                    <dl class="details details-flush">
                      <div><dt>Interest</dt><dd>${Math.round(data.rate * 100)}%</dd></div>
                      <div><dt>Term</dt><dd>${data.termDays} days</dd></div>
                    </dl>
                    <button class="button button-primary" type="submit">Request</button>
                  </form>`
                : html`<p class="empty">Loans aren't available for your account.</p>`
            }
          </section>`
    }
    ${
      data.history.length
        ? html`<section class="panel">
            <header class="panel-head"><h2>History</h2></header>
            <ul class="list">
              ${data.history.map(
                (l) => html`<li class="row">
                  <div class="row-main"><span class="row-title">${money(l.amount)}</span><span class="row-sub">${time(l.requestedAt)} \u00b7 ${l.reason}</span></div>
                  ${loanBadge(l)}
                </li>`,
              )}
            </ul>
          </section>`
        : ""
    }`,
    "Loans",
  );
}

function formatRate(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  const fixed = Math.abs(value) < 0.005 ? "0.00" : value.toFixed(2);
  return `${value > 0.005 ? "+" : ""}${fixed}%`;
}

function supplyChart(days) {
  const width = 320;
  const height = 140;
  const pad = { top: 10, right: 8, bottom: 18, left: 8 };
  const max = Math.max(...days.map((d) => d.supply), 1);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (days.length === 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  let points = days.map((d, i) => `${x(i).toFixed(1)},${y(d.supply).toFixed(1)}`);
  if (days.length === 1) points = [`${pad.left},${y(days[0].supply).toFixed(1)}`, `${width - pad.right},${y(days[0].supply).toFixed(1)}`];
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const gy = (pad.top + innerH * f).toFixed(1);
    return `<line x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}"/>`;
  });
  const label = (s) => s.slice(5).replace("-", "/");
  return new Safe(
    `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Money supply"><g class="chart-grid">${grid.join("")}</g><polyline class="chart-line" points="${points.join(" ")}"/><text class="chart-label" x="${pad.left}" y="${height - 4}">${label(days[0].day)}</text><text class="chart-label" x="${width - pad.right}" y="${height - 4}" text-anchor="end">${label(days.at(-1).day)}</text></svg>`,
  );
}

async function inflationPage() {
  const data = await api("/inflation");
  bankPage(
    "inflation",
    html`<h1 class="page-title">Inflation</h1>
    <div class="stats">
      <div class="stat"><span class="stat-label">Money supply</span><span class="stat-value">${money(data.supply)}</span></div>
      <div class="stat"><span class="stat-label">In circulation</span><span class="stat-value">${money(data.circulation)}</span></div>
      <div class="stat"><span class="stat-label">7 days</span><span class="stat-value">${formatRate(data.week)}</span></div>
      <div class="stat"><span class="stat-label">30 days</span><span class="stat-value">${formatRate(data.month)}</span></div>
      <div class="stat"><span class="stat-label">Since start</span><span class="stat-value">${formatRate(data.start)}</span></div>
    </div>
    <section class="panel">
      <header class="panel-head"><h2>Money supply</h2></header>
      ${data.days.length ? html`<div class="chart-wrap">${supplyChart(data.days)}</div>` : html`<p class="empty">No data yet.</p>`}
    </section>`,
    "Inflation",
  );
}

function codeView({ error } = {}) {
  if (!loginStep) return go("/login");
  document.title = `Verification code - ${BANK_NAME}`;
  publicPage(html`<section class="auth-card">
    <h1>Verification code</h1>
    ${alert(error)}
    <form data-action="code" novalidate>
      ${field({ label: "Code", name: "code", autocomplete: "one-time-code", maxlength: 12 })}
      <button class="button button-primary button-block" type="submit">Continue</button>
    </form>
    <p class="auth-switch"><a href="#/login">Back to sign in</a></p>
  </section>`);
}

function newPasswordView({ errors = {}, error } = {}) {
  if (!loginStep) return go("/login");
  document.title = `Choose a new password - ${BANK_NAME}`;
  publicPage(html`<section class="auth-card">
    <h1>Choose a new password</h1>
    ${alert(error)}
    <form data-action="new-password" novalidate>
      ${field({ label: "New password", name: "password", type: "password", autocomplete: "new-password", error: errors.password })}
      ${field({ label: "Confirm new password", name: "confirm", type: "password", autocomplete: "new-password", error: errors.confirm })}
      <button class="button button-primary button-block" type="submit">Save password</button>
    </form>
  </section>`);
}

const STEP_ROUTES = { code: "/login/code", password: "/login/new-password" };

function afterLogin(data) {
  if (data.step) {
    loginStep = { challenge: data.challenge };
    return go(STEP_ROUTES[data.step]);
  }
  loginStep = null;
  saveSession(data);
  go("/");
}

function signupView({ values = {}, errors = {}, error } = {}) {
  document.title = `Open an account - ${BANK_NAME}`;
  publicPage(html`<section class="auth-card">
    <h1>Open an account</h1>
    ${alert(error)}
    <form data-action="signup" novalidate>
      ${field({ label: "Username", name: "username", value: values.username, autocomplete: "username", maxlength: 20, error: errors.username })}
      ${field({ label: "Email", name: "email", type: "email", value: values.email, autocomplete: "email", error: errors.email })}
      ${field({ label: "Password", name: "password", type: "password", autocomplete: "new-password", error: errors.password })}
      ${field({ label: "Confirm password", name: "confirm", type: "password", autocomplete: "new-password", error: errors.confirm })}
      <button class="button button-primary button-block" type="submit">Create account</button>
    </form>
    <p class="auth-switch">Already have an account? <a href="#/login">Sign in</a></p>
  </section>`);
}

function activityList(transactions) {
  if (!transactions.length) return html`<p class="empty">No transactions yet.</p>`;
  return html`<ul class="list">${transactions.map(
    (tx) => html`<li>
      <a class="row" href="#/activity/${tx.ref}">
        <div class="row-main">
          <span class="row-title">${tx.title}</span>
          <span class="row-sub">${tx.memo || tx.label}</span>
        </div>
        <div class="row-end">
          <span class="amount${tx.amount > 0 ? " amount-in" : ""}">${money(tx.amount, true)}</span>
          <span class="row-sub">${time(tx.createdAt)}${tx.reversed ? " \u00b7 Reversed" : ""}</span>
        </div>
      </a>
    </li>`,
  )}</ul>`;
}

function requestRow(request, incoming) {
  return html`<li class="row">
    <div class="row-main">
      <span class="row-title">${incoming ? request.requester : request.payer}</span>
      <span class="row-sub">${request.memo || "Payment request"} \u00b7 ${time(request.createdAt)}</span>
    </div>
    <div class="row-end">
      <span class="amount">${money(request.amount)}</span>
      <div class="row-actions">
        ${
          incoming
            ? html`<a class="button button-primary button-small" href="#/requests/${request.id}">Pay</a>
              <form data-action="decline" data-id="${request.id}"><button class="button button-small" type="submit">Decline</button></form>`
            : html`<form data-action="cancel" data-id="${request.id}"><button class="button button-small" type="submit">Cancel</button></form>`
        }
      </div>
    </div>
  </li>`;
}

async function accountPage() {
  const data = await api("/me");
  user = data.user;
  bankPage(
    "account",
    html`<section class="balance-card">
      <span class="balance-label">Available balance</span>
      <span class="balance-amount">${money(user.balance)}</span>
      <span class="balance-owner">${user.username}</span>
      <div class="balance-actions">
        <a class="button button-light" href="#/send">${icon("send")}Send</a>
        <a class="button button-outline-light" href="#/request">${icon("request")}Request</a>
      </div>
    </section>
    ${user.status === "frozen" ? alert("Your account is frozen. Sending and paying are disabled.") : ""}
    ${
      data.incoming.length
        ? html`<section class="panel">
          <header class="panel-head"><h2>Requests for you</h2><a href="#/requests">View all</a></header>
          <ul class="list">${data.incoming.map((r) => requestRow(r, true))}</ul>
        </section>`
        : ""
    }
    <section class="panel">
      <header class="panel-head"><h2>Recent activity</h2><a href="#/activity">View all</a></header>
      ${activityList(data.recent)}
    </section>`,
    "Account",
  );
}

async function activityPage({ query }) {
  const before = Number(query.get("before")) || null;
  const data = await api(`/activity${before ? `?before=${before}` : ""}`);
  bankPage(
    "account",
    html`<h1 class="page-title">Activity</h1>
    <section class="panel">
      ${activityList(data.transactions)}
      ${
        before || data.nextBefore
          ? html`<nav class="pager">
            ${before ? html`<a href="#/activity">Newest</a>` : html`<span></span>`}
            ${data.nextBefore ? html`<a href="#/activity?before=${data.nextBefore}">Older</a>` : ""}
          </nav>`
          : ""
      }
    </section>`,
    "Activity",
  );
}

async function receiptPage({ params }) {
  let tx;
  try {
    ({ transaction: tx } = await api(`/activity/${encodeURIComponent(params[0])}`));
  } catch (err) {
    if (err.status === 404) return errorPage("account", new Error("Page not found"));
    throw err;
  }
  bankPage(
    "account",
    html`<a class="back" href="#/activity">Activity</a>
    <section class="panel receipt">
      <span class="receipt-label">${tx.label}</span>
      <span class="receipt-amount${tx.amount > 0 ? " amount-in" : ""}">${money(tx.amount, true)}</span>
      ${tx.reversed ? html`<span class="status status-muted">Reversed</span>` : ""}
      <dl class="details">
        <div><dt>From</dt><dd>${tx.from}</dd></div>
        <div><dt>To</dt><dd>${tx.to}</dd></div>
        ${tx.memo ? html`<div><dt>Note</dt><dd>${tx.memo}</dd></div>` : ""}
        ${tx.originalRef ? html`<div><dt>Reverses</dt><dd><a href="#/activity/${tx.originalRef}">${tx.originalRef}</a></dd></div>` : ""}
        <div><dt>Date</dt><dd>${time(tx.createdAt, true)}</dd></div>
        <div><dt>Reference</dt><dd class="mono">${tx.ref}</dd></div>
      </dl>
    </section>`,
    "Transaction",
  );
}

function sendPage({ query, values, errors = {}, error } = {}) {
  values ??= { to: query?.get("to") || "", amount: query?.get("amount") || "", memo: query?.get("memo") || "" };
  bankPage(
    "send",
    html`<h1 class="page-title">Send money</h1>
    <section class="panel panel-form">
      ${alert(error)}
      <form data-action="send" novalidate>
        ${field({ label: "To", name: "to", value: values.to, prefix: "@", autocomplete: "off", maxlength: 21, error: errors.to })}
        ${field({ label: "Amount", name: "amount", value: values.amount, prefix: SYMBOL, inputmode: "decimal", autocomplete: "off", error: errors.amount })}
        ${field({ label: "Note", name: "memo", value: values.memo, required: false, maxlength: 140, autocomplete: "off", error: errors.memo })}
        <button class="button button-primary button-block" type="submit">Continue</button>
      </form>
    </section>`,
    "Send money",
  );
}

function reviewPage() {
  if (!pendingSend) return go("/send");
  const p = pendingSend;
  const edit = new URLSearchParams({ to: p.to, amount: p.amountInput, memo: p.memo || "" });
  bankPage(
    "send",
    html`<h1 class="page-title">Review payment</h1>
    <section class="panel panel-form">
      <dl class="details details-review">
        <div><dt>To</dt><dd>${p.to}</dd></div>
        <div><dt>Amount</dt><dd class="strong">${money(p.amount)}</dd></div>
        ${p.memo ? html`<div><dt>Note</dt><dd>${p.memo}</dd></div>` : ""}
      </dl>
      <form data-action="confirm-send">
        <button class="button button-primary button-block" type="submit">Send ${money(p.amount)}</button>
      </form>
      <a class="button button-block" href="#/send?${edit}">Edit</a>
    </section>`,
    "Review payment",
  );
}

function requestPage({ query, values, errors = {}, error } = {}) {
  values ??= { from: query?.get("from") || "" };
  bankPage(
    "request",
    html`<h1 class="page-title">Request money</h1>
    <section class="panel panel-form">
      ${alert(error)}
      <form data-action="request" novalidate>
        ${field({ label: "From", name: "from", value: values.from, prefix: "@", autocomplete: "off", maxlength: 21, error: errors.from })}
        ${field({ label: "Amount", name: "amount", value: values.amount, prefix: SYMBOL, inputmode: "decimal", autocomplete: "off", error: errors.amount })}
        ${field({ label: "Note", name: "memo", value: values.memo, required: false, maxlength: 140, autocomplete: "off", error: errors.memo })}
        <button class="button button-primary button-block" type="submit">Send request</button>
      </form>
    </section>`,
    "Request money",
  );
}

const REQUEST_STATUS = { paid: "Paid", declined: "Declined", cancelled: "Cancelled" };

async function requestsPage() {
  const [data, me] = await Promise.all([api("/requests"), api("/me")]);
  user = me.user;
  bankPage(
    "requests",
    html`<h1 class="page-title">Requests</h1>
    <section class="panel">
      <header class="panel-head"><h2>Waiting for you</h2></header>
      ${data.incoming.length ? html`<ul class="list">${data.incoming.map((r) => requestRow(r, true))}</ul>` : html`<p class="empty">No requests.</p>`}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Sent by you</h2><a href="#/request">New request</a></header>
      ${data.outgoing.length ? html`<ul class="list">${data.outgoing.map((r) => requestRow(r, false))}</ul>` : html`<p class="empty">No open requests.</p>`}
    </section>
    ${
      data.history.length
        ? html`<section class="panel">
          <header class="panel-head"><h2>History</h2></header>
          <ul class="list">
            ${data.history.map(
              (r) => html`<li class="row">
                <div class="row-main">
                  <span class="row-title">${r.incoming ? `${r.requester} requested` : `Requested from ${r.payer}`}</span>
                  <span class="row-sub">${r.memo || "Payment request"} \u00b7 ${time(r.resolvedAt || r.createdAt)}</span>
                </div>
                <div class="row-end">
                  <span class="amount">${money(r.amount)}</span>
                  <span class="status status-${r.status}">${REQUEST_STATUS[r.status]}</span>
                </div>
              </li>`,
            )}
          </ul>
        </section>`
        : ""
    }`,
    "Requests",
  );
}

async function payRequestPage({ params, error }) {
  let request;
  try {
    ({ request } = await api(`/requests/${encodeURIComponent(params[0])}`));
  } catch (err) {
    if (err.status !== 404) throw err;
    flash = err.message;
    return go("/requests");
  }
  bankPage(
    "requests",
    html`<a class="back" href="#/requests">Requests</a>
    <h1 class="page-title">Pay request</h1>
    <section class="panel panel-form">
      ${alert(error)}
      <dl class="details details-review">
        <div><dt>To</dt><dd>${request.requester}</dd></div>
        <div><dt>Amount</dt><dd class="strong">${money(request.amount)}</dd></div>
        ${request.memo ? html`<div><dt>Note</dt><dd>${request.memo}</dd></div>` : ""}
        <div><dt>Requested</dt><dd>${time(request.createdAt, true)}</dd></div>
      </dl>
      <form data-action="pay" data-id="${request.id}">
        <button class="button button-primary button-block" type="submit">Pay ${money(request.amount)}</button>
      </form>
      <form data-action="decline" data-id="${request.id}">
        <button class="button button-block" type="submit">Decline</button>
      </form>
    </section>`,
    "Pay request",
  );
}

async function peoplePage({ query: params }) {
  const q = params.get("q") || "";
  const data = q ? await api(`/people?q=${encodeURIComponent(q)}`) : { query: "", results: [] };
  bankPage(
    "people",
    html`<h1 class="page-title">People</h1>
    <form class="search" data-action="search" role="search">
      <label class="visually-hidden" for="people-q">Username</label>
      <div class="input-prefix"><span>@</span><input id="people-q" name="q" type="search" value="${data.query}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Username"></div>
      <button class="button button-primary" type="submit">Search</button>
    </form>
    ${
      data.query
        ? html`<section class="panel">
          ${
            data.results.length
              ? html`<ul class="list">${data.results.map(
                  (person) => html`<li><a class="row" href="#/people/${person.username}">
                    <div class="row-main"><span class="row-title">${person.username}</span><span class="row-sub">Member since ${time(person.createdAt)}</span></div>
                    <span class="row-chevron">${icon("chevron")}</span>
                  </a></li>`,
                )}</ul>`
              : html`<p class="empty">No accounts found.</p>`
          }
        </section>`
        : ""
    }`,
    "People",
  );
}

async function personPage({ params }) {
  let person;
  try {
    person = await api(`/people/${encodeURIComponent(params[0])}`);
  } catch (err) {
    if (err.status === 404) return errorPage("people", new Error("Page not found"));
    throw err;
  }
  bankPage(
    "people",
    html`<a class="back" href="#/people">People</a>
    <section class="panel profile">
      <span class="avatar" aria-hidden="true">${person.username.slice(0, 1).toUpperCase()}</span>
      <h1>${person.username}</h1>
      <p class="row-sub">Member since ${time(person.createdAt)}</p>
      ${
        person.isSelf
          ? ""
          : html`<div class="profile-actions">
            <a class="button button-primary" href="#/send?to=${encodeURIComponent(person.username)}">Send</a>
            <a class="button" href="#/request?from=${encodeURIComponent(person.username)}">Request</a>
          </div>`
      }
    </section>`,
    person.username,
  );
}

const SHIELD =
  '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>';

function twoStepPanel(state, errors = {}) {
  return html`<section class="panel panel-form" id="two-step">
    <header class="panel-head"><h2>Two-step verification</h2><span class="badge${state.enabled ? " badge-on" : ""}">${state.enabled ? "On" : "Off"}</span></header>
    ${
      state.enabled
        ? html`<dl class="details">
            <div><dt>Backup codes left</dt><dd>${state.backupCodesLeft}</dd></div>
          </dl>
          <form data-action="two-step-off" novalidate>
            ${field({ label: "Current password", name: "password", type: "password", autocomplete: "current-password", error: errors.password })}
            ${field({ label: "Code", name: "code", autocomplete: "one-time-code", maxlength: 12, error: errors.code })}
            <button class="button" type="submit">Turn off</button>
          </form>`
        : html`<a class="button button-primary button-icon" href="#/settings/two-step">${new Safe(SHIELD)}<span>Set up</span></a>`
    }
  </section>`;
}

function formatKey(secret) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

let twoStepSetup = null;

async function twoStepSetupPage({ errors = {} } = {}) {
  if (!twoStepSetup) {
    try {
      twoStepSetup = await api("/settings/two-step/setup", {});
    } catch (err) {
      if (err.status === 409) return go("/settings");
      throw err;
    }
  }
  bankPage(
    "settings",
    html`<h1 class="page-title">Two-step verification</h1>
    <section class="panel panel-form two-step-setup">
      <div class="qr-frame">${new Safe(twoStepSetup.qr)}</div>
      <dl class="details">
        <div><dt>Key</dt><dd class="mono secret">${formatKey(twoStepSetup.secret)}</dd></div>
      </dl>
      <form data-action="two-step-on" novalidate>
        ${field({ label: "6-digit code", name: "code", autocomplete: "one-time-code", inputmode: "numeric", maxlength: 6, error: errors.code })}
        <button class="button button-primary" type="submit">Turn on</button>
        <a class="button" href="#/settings">Cancel</a>
      </form>
    </section>`,
    "Two-step verification",
  );
}

function backupCodesPage(codes) {
  bankPage(
    "settings",
    html`<h1 class="page-title">Backup codes</h1>
    <section class="panel panel-form">
      <ol class="backup-codes mono">${codes.map((c) => html`<li>${c}</li>`)}</ol>
      <a class="button button-primary" href="#/settings">Done</a>
    </section>`,
    "Backup codes",
  );
}

async function settingsPage({ emailErrors = {}, passwordErrors = {}, emailValue, twoStepErrors } = {}) {
  if (!user) user = (await api("/me")).user;
  const twoStep = await api("/settings/two-step");
  bankPage(
    "settings",
    html`<h1 class="page-title">Settings</h1>
    <section class="panel">
      <header class="panel-head"><h2>Account</h2></header>
      <dl class="details">
        <div><dt>Username</dt><dd>${user.username}</dd></div>
        <div><dt>Email</dt><dd>${user.email}</dd></div>
        <div><dt>Member since</dt><dd>${time(user.createdAt)}</dd></div>
      </dl>
    </section>
    <section class="panel panel-form">
      <header class="panel-head"><h2>Change email</h2></header>
      <form data-action="email" novalidate>
        ${field({ label: "New email", name: "email", type: "email", value: emailValue, autocomplete: "email", error: emailErrors.email })}
        ${field({ label: "Current password", name: "password", type: "password", autocomplete: "current-password", error: emailErrors.password })}
        <button class="button button-primary" type="submit">Update email</button>
      </form>
    </section>
    <section class="panel panel-form">
      <header class="panel-head"><h2>Change password</h2></header>
      <form data-action="password" novalidate>
        ${field({ label: "Current password", name: "current", type: "password", autocomplete: "current-password", error: passwordErrors.current })}
        ${field({ label: "New password", name: "password", type: "password", autocomplete: "new-password", error: passwordErrors.password })}
        ${field({ label: "Confirm new password", name: "confirm", type: "password", autocomplete: "new-password", error: passwordErrors.confirm })}
        <button class="button button-primary" type="submit">Update password</button>
      </form>
    </section>
    ${twoStepPanel(twoStep, twoStepErrors)}
    <form class="signout" data-action="logout">
      <button class="button button-block" type="submit">Sign out</button>
    </form>`,
    "Settings",
  );
}

const ROUTES = [
  [/^\/login$/, loginView, "public"],
  [/^\/signup$/, signupView, "public"],
  [/^\/login\/code$/, codeView, "public"],
  [/^\/login\/new-password$/, newPasswordView, "public"],
  [/^\/$/, accountPage],
  [/^\/activity$/, activityPage],
  [/^\/activity\/([\w-]+)$/, receiptPage],
  [/^\/send$/, sendPage],
  [/^\/send\/review$/, reviewPage],
  [/^\/request$/, requestPage],
  [/^\/requests$/, requestsPage],
  [/^\/requests\/(\d+)$/, payRequestPage],
  [/^\/people$/, peoplePage],
  [/^\/people\/([^/]+)$/, personPage],
  [/^\/settings$/, settingsPage],
  [/^\/settings\/two-step$/, twoStepSetupPage],
  [/^\/loans$/, loansPage],
  [/^\/inflation$/, inflationPage],
];

async function route() {
  const { path, query } = currentRoute();
  const found = ROUTES.find(([pattern]) => pattern.test(path));
  if (!found) return go(token ? "/" : "/login");

  const [pattern, view, access] = found;
  if (access === "public" && token) return go("/");
  if (access !== "public" && !token) return go("/login");

  const params = path.match(pattern).slice(1).map(decodeURIComponent);
  try {
    await view({ query, params });
  } catch (err) {
    if (err.status !== 401) errorPage(null, err);
  }
  window.scrollTo(0, 0);
}

function formValues(form) {
  return Object.fromEntries(new FormData(form));
}

const ACTIONS = {
  async login(form) {
    const values = formValues(form);
    try {
      afterLogin(await api("/login", values));
    } catch (err) {
      loginView({ values, error: err.message });
    }
  },

  async code(form) {
    const values = formValues(form);
    try {
      afterLogin(await api("/login/code", { challenge: loginStep?.challenge, code: values.code }));
    } catch (err) {
      if (err.status === 401 && /expired/i.test(err.message)) {
        loginStep = null;
        return loginView({ error: err.message });
      }
      codeView({ error: err.message });
    }
  },

  async "new-password"(form) {
    const values = formValues(form);
    try {
      afterLogin(await api("/login/password", { challenge: loginStep?.challenge, ...values }));
    } catch (err) {
      if (err.status === 401) {
        loginStep = null;
        return loginView({ error: err.message });
      }
      newPasswordView({ errors: err.errors, error: err.message });
    }
  },

  async "two-step-on"(form) {
    try {
      const result = await api("/settings/two-step/enable", formValues(form));
      twoStepSetup = null;
      backupCodesPage(result.backupCodes);
    } catch (err) {
      if (err.status === 401) return;
      twoStepSetupPage({ errors: err.errors });
    }
  },

  async "two-step-off"(form) {
    if (!window.confirm("Turn off two-step verification?")) return;
    try {
      await api("/settings/two-step/disable", formValues(form));
      flash = "Two-step verification turned off.";
      settingsPage();
    } catch (err) {
      if (err.status === 401) return;
      settingsPage({ twoStepErrors: err.errors });
    }
  },

  async signup(form) {
    const values = formValues(form);
    try {
      saveSession(await api("/signup", values));
      go("/");
    } catch (err) {
      signupView({ values, errors: err.errors, error: err.message });
    }
  },

  async logout() {
    await api("/logout", {}).catch(() => {});
    forgetSession();
    go("/login");
  },

  async send(form) {
    const values = formValues(form);
    try {
      pendingSend = await api("/send/review", values);
      go("/send/review");
    } catch (err) {
      if (err.status === 401) return;
      sendPage({ values, errors: err.errors, error: err.message });
    }
  },

  async "confirm-send"() {
    const p = pendingSend;
    try {
      const result = await api("/send", { to: p.to, amount: p.amountInput, memo: p.memo || "", key: p.key });
      pendingSend = null;
      go(result.ref ? `/activity/${result.ref}` : "/activity");
    } catch (err) {
      if (err.status === 401) return;
      pendingSend = null;
      sendPage({ values: { to: p.to, amount: p.amountInput, memo: p.memo }, errors: err.errors, error: err.message });
    }
  },

  async request(form) {
    const values = formValues(form);
    try {
      const result = await api("/request", values);
      flash = `Request sent to ${result.to}.`;
      go("/requests");
    } catch (err) {
      if (err.status === 401) return;
      requestPage({ values, errors: err.errors, error: err.message });
    }
  },

  async pay(form) {
    try {
      const result = await api(`/requests/${form.dataset.id}/pay`, {});
      go(`/activity/${result.ref}`);
    } catch (err) {
      if (err.status === 401) return;
      if (err.status === 404) {
        flash = err.message;
        return go("/requests");
      }
      payRequestPage({ params: [form.dataset.id], error: err.message });
    }
  },

  async decline(form) {
    await closeRequest(form.dataset.id, "decline", "Request declined.");
  },

  async cancel(form) {
    await closeRequest(form.dataset.id, "cancel", "Request cancelled.");
  },

  search(form) {
    const q = formValues(form).q.trim();
    go(q ? `/people?q=${encodeURIComponent(q)}` : "/people");
  },

  async email(form) {
    const values = formValues(form);
    try {
      const result = await api("/settings/email", values);
      user.email = result.email;
      flash = "Email updated.";
      settingsPage();
    } catch (err) {
      if (err.status === 401) return;
      settingsPage({ emailErrors: err.errors, emailValue: values.email });
    }
  },

  async "loan-request"(form) {
    const values = formValues(form);
    try {
      await api("/loans", values);
      flash = "Loan requested.";
      loansPage();
    } catch (err) {
      if (err.status === 401) return;
      loansPage({ errors: err.errors, values });
    }
  },

  async "loan-repay"(form) {
    const values = formValues(form);
    if (!window.confirm("Make this loan payment?")) return;
    try {
      await api("/loans/repay", values);
      flash = "Payment made.";
      user = null;
      loansPage();
    } catch (err) {
      if (err.status === 401) return;
      loansPage({ repayErrors: err.errors, values: { repay: values.amount } });
    }
  },

  async password(form) {
    try {
      await api("/settings/password", formValues(form));
      flash = "Password updated. Other devices have been signed out.";
      settingsPage();
    } catch (err) {
      if (err.status === 401) return;
      settingsPage({ passwordErrors: err.errors });
    }
  },
};

async function closeRequest(id, action, message) {
  try {
    await api(`/requests/${id}/${action}`, {});
    flash = message;
  } catch (err) {
    if (err.status === 401) return;
    flash = err.message;
  }
  if (currentRoute().path === "/requests") route();
  else go("/requests");
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  const action = ACTIONS[form.dataset.action];
  if (!action) return;
  event.preventDefault();
  if (form.dataset.submitting) return;
  form.dataset.submitting = "true";
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  try {
    await action(form);
  } finally {
    delete form.dataset.submitting;
    if (button) button.disabled = false;
  }
});

window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
  });
}
