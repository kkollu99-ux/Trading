const homeView = document.querySelector("#homeView");
const loginView = document.querySelector("#loginView");
const registerView = document.querySelector("#registerView");
const appView = document.querySelector("#appView");
const sectionTitle = document.querySelector("#sectionTitle");
const navItems = [...document.querySelectorAll(".nav-item")];
const sections = [...document.querySelectorAll(".view-section")];
const apiBase = "";
let currentSession = null;

function canManageUsers() {
  return ["admin", "team"].includes(currentSession?.user?.role);
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function currentDisplayName() {
  const user = currentSession?.user;
  return user?.name || user?.email?.split("@")[0] || "Guest";
}

function formatKycStatus(status) {
  const value = String(status || "pending").toLowerCase();
  if (value === "verified") return { text: "Verified ✓", className: "positive" };
  if (value === "rejected") return { text: "Rejected ✕", className: "danger-text" };
  return { text: "Pending", className: "gold-text" };
}

async function authFetch(path) {
  if (!currentSession?.token) return null;
  try {
    const response = await fetch(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${currentSession.token}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function renderDashboardGreeting() {
  if (!sectionTitle) return;
  sectionTitle.innerHTML = `${getGreeting()}, <strong>${escapeHtml(currentDisplayName())}</strong> 👋`;
}

function renderAccountSummary() {
  const user = currentSession?.user;
  const balance = Number(user?.balance || 0);
  const uid = user?.referralCode || user?.id || "—";
  const name = currentDisplayName();

  const dateLabel = document.querySelector("#dashboardDateLabel");
  if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const uidPill = document.querySelector("#dashboardUid");
  if (uidPill) uidPill.textContent = uid;

  const avatar = document.querySelector("#dashboardAvatar");
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase() || "?";

  const balanceValue = document.querySelector("#dashboardBalance");
  if (balanceValue) balanceValue.textContent = formatCurrency(balance);

  const equityValue = document.querySelector("#dashboardEquity");
  if (equityValue) equityValue.textContent = formatCurrency(balance);

  const marginValue = document.querySelector("#dashboardAvailableMargin");
  if (marginValue) marginValue.textContent = formatCurrency(balance);

  const marginUsedValue = document.querySelector("#dashboardMarginUsed");
  if (marginUsedValue) marginUsedValue.textContent = formatCurrency(0);

  const pnlValue = document.querySelector("#dashboardPnl");
  if (pnlValue) pnlValue.textContent = `${formatCurrency(0)} (0.00%)`;

  const walletButton = document.querySelector("#walletBalance");
  if (walletButton) walletButton.textContent = `▣ ${formatCurrency(balance)}`;

  const fullNameValue = document.querySelector("#profileFullName");
  if (fullNameValue) fullNameValue.innerHTML = user?.name ? escapeHtml(user.name) : "<em>Not set</em>";

  const emailValue = document.querySelector("#profileEmail");
  if (emailValue) emailValue.textContent = user?.email || "—";

  const accountIdValue = document.querySelector("#profileAccountId");
  if (accountIdValue) accountIdValue.textContent = uid;

  const referralCodeValue = document.querySelector("#profileReferralCode");
  if (referralCodeValue) referralCodeValue.textContent = uid;

  const profileBalanceValue = document.querySelector("#profileBalance");
  if (profileBalanceValue) profileBalanceValue.textContent = formatCurrency(balance);

  const kyc = formatKycStatus(user?.kycStatus);
  const kycStatusValue = document.querySelector("#profileKycStatus");
  if (kycStatusValue) {
    kycStatusValue.textContent = kyc.text;
    kycStatusValue.className = kyc.className;
  }
  const kycBadgeValue = document.querySelector("#profileKycBadge");
  if (kycBadgeValue) kycBadgeValue.textContent = kyc.text;

  if (document.querySelector("#dashboard")?.classList.contains("is-active")) {
    renderDashboardGreeting();
  }
  if (document.querySelector("#ticketBalanceValue")) renderTradeTicket();

  loadInvitedFriends();
  loadTransactionHistory();
}

async function loadInvitedFriends() {
  const result = await authFetch("/api/referrals");
  invitedFriends = (result?.invited || []).map((invited) => {
    const name = invited.name || invited.email || "Client";
    const verified = invited.kycStatus === "verified";
    return {
      name,
      date: invited.createdAt
        ? `Joined ${new Date(invited.createdAt).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" })}`
        : "Joined",
      status: verified ? "Verified" : invited.status === "active" ? "Active" : "Pending",
      initial: name.charAt(0).toUpperCase() || "?",
      positive: verified || invited.status === "active",
    };
  });
  invitedFriendsPage = 1;
  renderInvitedFriends();
}

async function loadTransactionHistory() {
  const container = document.querySelector("#transactionHistoryList");
  if (!container) return;

  const result = await authFetch("/api/service-requests");
  const transactions = (result?.serviceRequests || [])
    .filter((item) => item.type === "deposit" || item.type === "withdrawal")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!transactions.length) {
    container.innerHTML = '<div class="transaction-empty-state">No transactions yet.</div>';
    return;
  }

  container.innerHTML = transactions
    .map((item) => {
      const isWithdrawal = item.type === "withdrawal";
      const date = item.created_at ? new Date(item.created_at).toLocaleDateString() : "";
      return `<div class="transaction-row${isWithdrawal ? " is-debit" : ""}"><span>${isWithdrawal ? "↑" : "↓"}</span><div><strong>${escapeHtml(item.type)}</strong><small>${escapeHtml(date)}</small></div><em>${isWithdrawal ? "-" : "+"}${formatCurrency(item.amount)}<small>${escapeHtml(item.status)}</small></em></div>`;
    })
    .join("");
}

function canEditManagedUsers() {
  return currentSession?.user?.role === "admin";
}

function saveSession(session) {
  currentSession = session;
  if (session?.token) localStorage.setItem("fxccAuthToken", session.token);
  if (session?.user) localStorage.setItem("fxccUser", JSON.stringify(session.user));
  updateRoleAccess();
}

function clearSession() {
  currentSession = null;
  localStorage.removeItem("fxccAuthToken");
  localStorage.removeItem("fxccUser");
  localStorage.removeItem("fxccAdminToken");
  updateRoleAccess();
}

function updateRoleAccess() {
  renderAccountSummary();
  const allowed = canManageUsers();
  const editable = canEditManagedUsers();
  document.querySelectorAll('[data-section="users"], [data-section="products"], [data-section="requests"]').forEach((item) => {
    item.hidden = !allowed;
    item.classList.toggle("is-hidden", !allowed);
  });
  document.querySelector("#users")?.classList.toggle("is-role-hidden", !allowed);
  document.querySelector("#products")?.classList.toggle("is-role-hidden", !allowed);
  document.querySelector(".managed-form-card")?.classList.toggle("is-hidden", allowed && !editable);
  document.querySelector(".managed-instrument-card")?.classList.toggle("is-hidden", !allowed);

  if (!allowed) {
    managedUsers = [];
    managedInstruments = [];
    renderManagedUsers();
    renderManagedInstruments();
    if (document.querySelector("#users")?.classList.contains("is-active")) moveSection("dashboard");
    if (document.querySelector("#products")?.classList.contains("is-active")) moveSection("dashboard");
    if (document.querySelector("#requests")?.classList.contains("is-active")) moveSection("dashboard");
  }
}

const metals = {
  gold: { label: "Gold", symbol: "XAU/USD", price: 3672.4, spread: 0.26, color: "#ffb000", data: [] },
  silver: { label: "Silver", symbol: "XAG/USD", price: 42.18, spread: 0.04, color: "#9fb4ca", data: [] },
  platinum: { label: "Platinum", symbol: "XPT/USD", price: 1396.6, spread: 0.32, color: "#00c785", data: [] },
  palladium: { label: "Palladium", symbol: "XPD/USD", price: 1188.9, spread: 0.41, color: "#e83d30", data: [] },
};

let activeMetal = "gold";
let volatilityBoost = 1;

const team = [
  { name: "Maya Shah", role: "Head Dealer", status: "Online" },
  { name: "Omar Reed", role: "Risk Analyst", status: "Reviewing" },
  { name: "Elena Cruz", role: "Client Success", status: "Online" },
  { name: "Niko Tan", role: "Execution Trader", status: "Away" },
];

let users = [
  { name: "Ari Weston", email: "ari@client.com", tier: "VIP", status: "Active", exposure: "$42,800" },
  { name: "Priya Kapoor", email: "priya@metals.io", tier: "Pro", status: "Active", exposure: "$18,220" },
  { name: "Jon Miller", email: "jon@hedge.co", tier: "Standard", status: "Pending", exposure: "$6,910" },
  { name: "Lina Park", email: "lina@funds.com", tier: "VIP", status: "Active", exposure: "$73,450" },
];

const messages = [
  { author: "Maya", body: "Gold liquidity is strongest around 3670. Keep VIP fills under 2 lots.", self: false },
  { author: "Risk", body: "Margin alerts cleared. Silver exposure can reopen for approved users.", self: false },
  { author: "You", body: "Copy. Watching XAU pullback before next desk signal.", self: true },
];

function seedMetalData() {
  Object.values(metals).forEach((metal) => {
    metal.data = Array.from({ length: 72 }, (_, index) => {
      const drift = Math.sin(index / 7) * metal.spread * 5;
      const noise = (Math.random() - 0.5) * metal.spread * 18;
      return metal.price + drift + noise;
    });
    metal.price = metal.data.at(-1);
  });
}

function getNavLabel(item) {
  return item?.dataset.label || item?.querySelector(".nav-label")?.textContent || item?.querySelector("span:last-child")?.textContent;
}

function moveSection(id) {
  if ((id === "users" || id === "products" || id === "requests") && !canManageUsers()) id = "dashboard";
  navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.section === id));
  sections.forEach((section) => section.classList.toggle("is-active", section.id === id));
  if (id === "dashboard") {
    renderDashboardGreeting();
  } else if (sectionTitle) {
    sectionTitle.textContent = getNavLabel(navItems.find((item) => item.dataset.section === id)) || "Home";
  }
  if (id === "users" && canManageUsers()) {
    loadManagedUsers();
  }
  if (id === "products" && canManageUsers()) {
    loadManagedInstruments();
  }
  if (id === "requests" && canManageUsers()) {
    loadServiceRequestsInbox();
  }
  if (id === "profile") {
    loadTransactionHistory();
  }
  if (id === "markets") {
    refreshMarketsQuotes();
  }
  drawCharts();
  renderTradeCandles();
}

function formatPrice(metal) {
  return metal.price > 100 ? metal.price.toFixed(2) : metal.price.toFixed(3);
}

function tickMarkets() {
  Object.values(metals).forEach((metal) => {
    const last = metal.data.at(-1);
    const wave = Math.sin(Date.now() / 1400 + metal.price) * metal.spread * 3;
    const random = (Math.random() - 0.48) * metal.spread * 10 * volatilityBoost;
    const next = Math.max(0.01, last + wave + random);
    metal.data.push(next);
    metal.data = metal.data.slice(-90);
    metal.price = next;
  });
  volatilityBoost = Math.max(1, volatilityBoost * 0.94);
  renderTickers();
  renderBook();
  drawCharts();
}

function drawChart(canvas, metalKey = activeMetal, showAll = false) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#071a2f");
  gradient.addColorStop(1, "#060b14");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(141, 163, 191, 0.13)";
  ctx.lineWidth = 1;
  for (let x = 70; x < width; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 22);
    ctx.lineTo(x, height - 34);
    ctx.stroke();
  }
  for (let y = 38; y < height - 30; y += 48) {
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(width - 24, y);
    ctx.stroke();
  }

  const series = showAll ? Object.entries(metals) : [[metalKey, metals[metalKey]]];
  const values = series.flatMap(([, metal]) => metal.data);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  series.forEach(([, metal]) => {
    ctx.beginPath();
    metal.data.forEach((value, index) => {
      const x = 46 + (index / (metal.data.length - 1)) * (width - 76);
      const y = height - 38 - ((value - min) / range) * (height - 76);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = metal.color;
    ctx.lineWidth = showAll ? 2 : 3;
    ctx.shadowColor = metal.color;
    ctx.shadowBlur = showAll ? 8 : 16;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (!showAll) {
      const lastX = width - 30;
      const lastY = height - 38 - ((metal.data.at(-1) - min) / range) * (height - 76);
      ctx.fillStyle = metal.color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = "rgba(244, 248, 255, 0.92)";
  ctx.font = "700 18px Inter, sans-serif";
  ctx.fillText(showAll ? "Metals Composite" : metals[metalKey].symbol, 26, 34);
  ctx.fillStyle = "rgba(141, 163, 191, 0.9)";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillText(`${min.toFixed(2)} low`, 26, height - 18);
  ctx.fillText(`${max.toFixed(2)} high`, width - 112, 34);
}

function drawCharts() {
  drawChart(document.querySelector("#tradeChart"), activeMetal, false);
  drawChart(document.querySelector("#wideChart"), activeMetal, true);
}

function renderTickers() {
  const row = document.querySelector("#tickerRow");
  if (!row) return;
  row.innerHTML = Object.values(metals)
    .map((metal) => {
      const change = metal.data.at(-1) - metal.data.at(-8);
      return `
        <div class="ticker">
          <span>${metal.symbol}</span>
          <strong>${formatPrice(metal)}</strong>
          <small class="${change >= 0 ? "positive" : ""}">${change >= 0 ? "+" : ""}${change.toFixed(2)}</small>
        </div>
      `;
    })
    .join("");
}

function renderBook() {
  const grid = document.querySelector("#bookGrid");
  if (!grid) return;
  grid.innerHTML = Object.values(metals)
    .map((metal) => {
      const bid = metal.price - metal.spread;
      const ask = metal.price + metal.spread;
      return `
        <div class="book-card">
          <span>${metal.label} spread</span>
          <strong>${bid.toFixed(2)} / ${ask.toFixed(2)}</strong>
          <small>${(metal.spread * 100).toFixed(0)} point desk spread</small>
        </div>
      `;
    })
    .join("");
}

function renderActivity() {
  const feed = document.querySelector("#activityFeed");
  if (feed) {
  const events = [
    ["Gold order routed", "Maya filled 1.2 lots XAU/USD"],
    ["Client verified", "Priya Kapoor upgraded to Pro"],
    ["Risk check passed", "Silver exposure below threshold"],
    ["Admin update", "Two-factor login remains active"],
  ];
  feed.innerHTML = events
    .map(([title, detail]) => `<div class="activity-item"><div><strong>${title}</strong><small>${detail}</small></div><span>now</span></div>`)
    .join("");
  }

  const auditList = document.querySelector("#auditList");
  if (auditList) {
    auditList.innerHTML = [
    ["Role changed", "Omar Reed received risk approval rights"],
    ["User locked", "Jon Miller account pending documents"],
    ["Policy updated", "Trade approvals required over $50k"],
  ]
    .map(([title, detail]) => `<div class="activity-item"><div><strong>${title}</strong><small>${detail}</small></div><span>audit</span></div>`)
    .join("");
  }
}

function renderTeam() {
  const teamList = document.querySelector("#teamList");
  const permissionList = document.querySelector("#permissionList");
  if (!teamList || !permissionList) return;

  teamList.innerHTML = team
    .map(
      (member, index) => `
        <div class="person-card">
          <div><strong>${member.name}</strong><small>${member.role} · ${member.status}</small></div>
          <button class="danger-button" data-team="${index}" type="button">Remove</button>
        </div>
      `,
    )
    .join("");

  permissionList.innerHTML = team
    .map(
      (member, index) => `
        <label>
          <span>${member.role}</span>
          <select data-permission="${index}">
            <option>Admin</option>
            <option ${index > 0 ? "selected" : ""}>Dealer</option>
            <option>Read only</option>
          </select>
        </label>
      `,
    )
    .join("");
}

function renderUsers() {
  const userTable = document.querySelector("#userTable");
  if (!userTable) return;

  userTable.innerHTML = users
    .map(
      (user, index) => `
        <tr>
          <td><strong>${user.name}</strong></td>
          <td>${user.email}</td>
          <td>${user.tier}</td>
          <td><span class="status-pill">${user.status}</span></td>
          <td>${user.exposure}</td>
          <td><button class="danger-button" data-user="${index}" type="button">Suspend</button></td>
        </tr>
      `,
    )
    .join("");
}

function renderChat() {
  const chat = document.querySelector("#chatMessages");
  if (!chat) return;
  chat.innerHTML = messages
    .map(
      (message) => `
        <div class="message ${message.self ? "self" : ""}">
          <strong>${message.author}</strong>
          <div>${message.body}</div>
          <small>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
        </div>
      `,
    )
    .join("");
  chat.scrollTop = chat.scrollHeight;
}

function showAuthView(view) {
  homeView.classList.add("is-hidden");
  appView.classList.add("is-hidden");
  loginView.classList.add("is-hidden");
  registerView.classList.add("is-hidden");
  view.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHomeView() {
  appView.classList.add("is-hidden");
  loginView.classList.add("is-hidden");
  registerView.classList.add("is-hidden");
  homeView.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function enterWorkspace(session = null) {
  if (session) saveSession(session);
  else if (!currentSession) saveSession({ token: null, user: { role: "user", name: "Demo Client", email: "demo@fxcc.capital", balance: 10000 } });
  homeView.classList.add("is-hidden");
  loginView.classList.add("is-hidden");
  registerView.classList.add("is-hidden");
  appView.classList.remove("is-hidden");
  updateRoleAccess();
  drawCharts();
  updateDashboardTime();
}

function updateDashboardTime() {
  const time = document.querySelector("#dashboardTime");
  if (!time) return;
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    const response = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Invalid email or password");
    enterWorkspace(result);
  } catch (error) {
    enterWorkspace({ token: null, user: { role: "user", name: data.email?.split("@")[0] || "Client", email: data.email } });
  }
});

document.querySelector("#signOut").addEventListener("click", () => {
  clearSession();
  showHomeView();
});

document.querySelector("#openRegister").addEventListener("click", () => {
  showAuthView(registerView);
});

document.querySelector("#openLogin").addEventListener("click", () => {
  showAuthView(loginView);
});

document.querySelector("#registerBackHome").addEventListener("click", () => {
  showHomeView();
});

document.querySelector("#loginBackHome").addEventListener("click", () => {
  showHomeView();
});

document.querySelector("#refreshDashboard").addEventListener("click", () => {
  volatilityBoost = 3;
  tickMarkets();
  updateDashboardTime();
});

document.querySelector("#copyReferralCode")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const code = currentSession?.user?.referralCode || document.querySelector("#dashboardUid")?.textContent || "";
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = "✓ Copied";
  } catch {
    button.textContent = code;
  }
  setTimeout(() => {
    button.textContent = "▣ Copy";
  }, 1200);
});

let invitedFriends = [];

const invitedFriendsPageSize = 4;
let invitedFriendsPage = 1;

function renderInvitedFriends() {
  const list = document.querySelector("#invitedFriendsList");
  const total = document.querySelector("#invitedFriendsTotal");
  const summary = document.querySelector("#invitedFriendsPageSummary");
  const pageNumber = document.querySelector("#invitedFriendsPageNumber");
  const prevButton = document.querySelector("#prevInvitedFriendsPage");
  const nextButton = document.querySelector("#nextInvitedFriendsPage");
  if (!list) return;

  const totalPages = Math.max(1, Math.ceil(invitedFriends.length / invitedFriendsPageSize));
  invitedFriendsPage = Math.min(Math.max(invitedFriendsPage, 1), totalPages);
  const start = (invitedFriendsPage - 1) * invitedFriendsPageSize;
  const pageItems = invitedFriends.slice(start, start + invitedFriendsPageSize);

  list.innerHTML = pageItems
    .map((friend) => `<div class="invited-friend-row"><span>${friend.initial}</span><div><strong>${friend.name}</strong><small>${friend.date}</small></div><em${friend.positive ? ' class="positive"' : ""}>${friend.status}</em></div>`)
    .join("");

  if (total) total.textContent = String(invitedFriends.length);
  if (summary) summary.textContent = `Showing ${start + 1}-${start + pageItems.length} of ${invitedFriends.length} referrals`;
  if (pageNumber) pageNumber.textContent = `Page ${invitedFriendsPage} / ${totalPages}`;
  if (prevButton) prevButton.disabled = invitedFriendsPage === 1;
  if (nextButton) nextButton.disabled = invitedFriendsPage === totalPages;
}

function openInvitedFriendsModal() {
  renderInvitedFriends();
  document.querySelector("#invitedFriendsModal")?.classList.remove("is-hidden");
}

document.querySelector("#openInvitedFriendsModal")?.addEventListener("click", openInvitedFriendsModal);
document.querySelector("#closeInvitedFriendsModal")?.addEventListener("click", () => {
  document.querySelector("#invitedFriendsModal")?.classList.add("is-hidden");
});
document.querySelector("#invitedFriendsModal")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.classList.add("is-hidden");
});
document.querySelector("#prevInvitedFriendsPage")?.addEventListener("click", () => {
  invitedFriendsPage -= 1;
  renderInvitedFriends();
});
document.querySelector("#nextInvitedFriendsPage")?.addEventListener("click", () => {
  invitedFriendsPage += 1;
  renderInvitedFriends();
});
renderInvitedFriends();

document.querySelectorAll("#homeLogin, #heroPlatform, #ctaSignin").forEach((button) => {
  button.addEventListener("click", () => showAuthView(loginView));
});

document.querySelectorAll("#homeOpenAccount, #heroStart, #trustOpen, #ctaCreate, #homeMarkets button").forEach((button) => {
  button.addEventListener("click", () => showAuthView(registerView));
});

document.querySelectorAll("#heroDemo, #ctaDemo").forEach((button) => {
  button.addEventListener("click", () => enterWorkspace());
});

document.querySelectorAll(".ghost-icon").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.closest(".password-line")?.querySelector("input");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    button.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
  });
});

// Email OTP verification, gating the Register button until the code the
// user typed is confirmed against the one just emailed to them.
(function setupRegisterOtp() {
  const form = document.querySelector("#registerForm");
  const emailInput = form?.querySelector('input[name="email"]');
  const otpInput = document.querySelector("#registerOtpInput");
  const sendButton = document.querySelector("#sendOtpButton");
  const submitButton = document.querySelector("#registerSubmitButton");
  const statusEl = document.querySelector("#otpStatus");
  if (!form || !emailInput || !otpInput || !sendButton || !submitButton) return;

  let verified = false;
  let cooldownTimer = null;

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", kind === "error");
    statusEl.classList.toggle("is-success", kind === "success");
  }

  function setVerified(value) {
    verified = value;
    submitButton.disabled = !value;
    submitButton.title = value ? "" : "Verify your email first";
  }

  function resetVerification() {
    if (!verified && !otpInput.value) return;
    setVerified(false);
    otpInput.value = "";
    setStatus("");
  }

  emailInput.addEventListener("input", resetVerification);

  sendButton.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) return setStatus("Enter your email address first.", "error");
    setVerified(false);
    sendButton.disabled = true;
    setStatus("Sending code…");
    try {
      const response = await fetch(`${apiBase}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send verification code");
      setStatus(result.devOtp ? `Dev mode — OTP: ${result.devOtp}` : "Code sent — check your email.", "success");
      otpInput.focus();
      let seconds = 30;
      sendButton.textContent = `Resend (${seconds}s)`;
      cooldownTimer = window.setInterval(() => {
        seconds -= 1;
        if (seconds <= 0) {
          window.clearInterval(cooldownTimer);
          sendButton.textContent = "Send";
          sendButton.disabled = false;
        } else {
          sendButton.textContent = `Resend (${seconds}s)`;
        }
      }, 1000);
    } catch (error) {
      setStatus(error.message, "error");
      sendButton.disabled = false;
    }
  });

  otpInput.addEventListener("input", async () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
    if (otpInput.value.length !== 6) {
      if (verified) setVerified(false);
      return;
    }
    const email = emailInput.value.trim();
    setStatus("Verifying…");
    try {
      const response = await fetch(`${apiBase}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpInput.value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.verified) throw new Error(result.error || "Incorrect code");
      setVerified(true);
      setStatus("Email verified ✓", "success");
    } catch (error) {
      setVerified(false);
      setStatus(error.message, "error");
    }
  });
})();

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const password = data.get("password");
  const confirmPassword = data.get("confirmPassword");
  const error = document.querySelector("#registerError");

  if (password !== confirmPassword) {
    error.textContent = "Passwords do not match. Please re-enter them.";
    return;
  }

  error.textContent = "";
  const email = data.get("email");
  const name = String(email).split("@")[0] || "New Client";

  try {
    const response = await fetch(`${apiBase}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name,
        referralCode: data.get("referral") || null,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      // A real validation error (unverified email, duplicate account, etc.) —
      // show it and stop, rather than silently logging the user into a fake
      // local session as if registration had actually succeeded.
      error.textContent = result.error || "Registration failed";
      return;
    }
    event.target.reset();
    document.querySelector("#registerSubmitButton").disabled = true;
    enterWorkspace(result);
  } catch (requestError) {
    // A genuine network failure (server unreachable) — fall back to a local
    // demo session so the UI doesn't just dead-end, matching this app's
    // existing offline-friendly behavior elsewhere.
    const fallbackUser = { role: "user", name, email };
    users = [
      {
        name,
        email,
        tier: data.get("referral") ? "Referred" : "Standard",
        status: "Active",
        exposure: "$0",
      },
      ...users,
    ];
    renderUsers();
    event.target.reset();
    enterWorkspace({ token: null, user: fallbackUser });
  }
});

navItems.forEach((item) => item.addEventListener("click", () => moveSection(item.dataset.section)));

let marketsInstruments = [];

const marketsRowContainers = {
  forex: "#marketsForexRows",
  crypto: "#marketsCryptoRows",
  stocks: "#marketsStocksRows",
  commodities: "#marketsCommoditiesRows",
};

const marketsCountEls = {
  forex: "#marketsForexCount",
  crypto: "#marketsCryptoCount",
  stocks: "#marketsStocksCount",
  commodities: "#marketsCommoditiesCount",
};

function renderMarketInstrumentRow(instrument, quotes) {
  const fallback = instrumentFallbacks[instrument.symbol] || { price: 100, changePercent: 0.1 };
  const quote = getQuotePayload(quotes, instrument.symbol);
  const price = quotePrice(quote, fallback.price);
  const changePercent = quoteChange(quote, fallback.changePercent);
  const trendClass = changePercent >= 0 ? "up" : "down";
  const arrow = changePercent >= 0 ? "↗" : "↘";
  const symbol = compactSymbol(instrument.symbol);
  const group = categoryFilter(instrument.category);
  return `<div class="instrument-row" data-category="${group}" data-symbol="${escapeHtml(`${symbol} ${instrument.displayName}`)}"><div><strong>${escapeHtml(symbol)}</strong><small>${escapeHtml(instrument.displayName)}</small></div><em>${formatTradeNumber(price)} <b class="${trendClass}">${arrow} ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%</b></em><button type="button">Trade</button></div>`;
}

function renderMarketsList(instruments, quotes = {}) {
  const groups = { forex: [], crypto: [], stocks: [], commodities: [] };
  instruments.forEach((instrument) => {
    const group = categoryFilter(instrument.category);
    (groups[group] || groups.commodities).push(instrument);
  });

  Object.entries(marketsRowContainers).forEach(([group, selector]) => {
    const container = document.querySelector(selector);
    if (!container) return;
    const rows = groups[group];
    container.innerHTML = rows.length
      ? rows.map((instrument) => renderMarketInstrumentRow(instrument, quotes)).join("")
      : '<div class="watch-empty-state">No markets enabled by admin.</div>';
    const countEl = document.querySelector(marketsCountEls[group]);
    if (countEl) countEl.textContent = String(rows.length);
  });

  const totalEl = document.querySelector("#marketsInstrumentCount");
  if (totalEl) totalEl.textContent = `${instruments.length} instruments`;

  filterMarkets();
}

async function loadMarketsInstruments() {
  try {
    const response = await fetch(`${apiBase}/api/instruments`);
    const data = await response.json().catch(() => ({}));
    marketsInstruments = data.instruments || [];
  } catch {
    marketsInstruments = [];
  }
  const quotes = await fetchTradeQuotes(marketsInstruments);
  renderMarketsList(marketsInstruments, quotes);
}

async function refreshMarketsQuotes() {
  if (!marketsInstruments.length) return;
  if (!document.querySelector("#markets")?.classList.contains("is-active")) return;
  const quotes = await fetchTradeQuotes(marketsInstruments);
  renderMarketsList(marketsInstruments, quotes);
}

function filterMarkets() {
  const search = document.querySelector("#marketSearch")?.value.toLowerCase().trim() || "";
  const activeFilter = document.querySelector(".market-filter-tabs button.is-active")?.dataset.filter || "all";

  document.querySelectorAll(".instrument-row").forEach((row) => {
    const matchesCategory = activeFilter === "all" || row.dataset.category === activeFilter;
    const matchesSearch = !search || row.dataset.symbol.toLowerCase().includes(search);
    row.classList.toggle("is-filtered-out", !matchesCategory || !matchesSearch);
  });

  document.querySelectorAll(".instrument-group").forEach((group) => {
    const visibleRows = [...group.querySelectorAll(".instrument-row")].some((row) => !row.classList.contains("is-filtered-out"));
    group.classList.toggle("is-hidden-by-filter", !visibleRows);
  });
}

document.querySelector("#marketSearch")?.addEventListener("input", filterMarkets);

document.querySelectorAll(".market-filter-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".market-filter-tabs button").forEach((item) => item.classList.toggle("is-active", item === button));
    filterMarkets();
  });
});

document.querySelector(".markets-page")?.addEventListener("click", (event) => {
  const button = event.target.closest(".instrument-row button");
  if (!button) return;
  moveSection("trade");
  button.textContent = "Opening";
  window.setTimeout(() => {
    button.textContent = "Trade";
  }, 900);
});

document.querySelector("#openTradeTerminal")?.addEventListener("click", () => {
  moveSection("trade");
});

const ordersTabSummary = {
  positions: "<strong>0</strong> positions — open trades",
  pending: "<strong>0</strong> pending orders — waiting for trigger",
  history: "<strong>20</strong> orders — tap any row to expand",
};

document.querySelectorAll("[data-orders-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const activeTab = button.dataset.ordersTab;
    document.querySelectorAll("[data-orders-tab]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    document.querySelectorAll("[data-orders-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.ordersPanel === activeTab);
    });
    const summary = document.querySelector("#ordersTabSummary");
    if (summary) summary.innerHTML = ordersTabSummary[activeTab] || ordersTabSummary.history;
  });
});

const processChatWindow = document.querySelector("#processChatWindow");
const processChatMessages = document.querySelector("#processChatMessages");
const processChatTitle = document.querySelector("#processChatTitle");
const processChatSubtitle = document.querySelector("#processChatSubtitle");
const processChatInput = document.querySelector("#processChatInput");
const processChatLauncher = document.querySelector("#processChatLauncher");
const chatHistoryPreview = document.querySelector(".chat-history-row small");
let currentProcessChatTopic = "";

const processChatTopics = {
  support: {
    title: "FXCC Support",
    subtitle: "Online · Typically replies in minutes",
    message: "Hello! You are now connected to FXCC Capitals Support. Please type a message to begin.",
  },
  deposit: {
    title: "Deposit Support",
    subtitle: "Upload receipt or payment screenshot",
    message: "Deposit request selected. Please send the amount, payment method, and upload your payment proof image.",
  },
  withdrawal: {
    title: "Withdrawal Support",
    subtitle: "Confirm wallet or bank details in chat",
    message: "Withdrawal request selected. Please send the amount and account details. Support will verify it here.",
  },
  verification: {
    title: "Verification Support",
    subtitle: "Upload KYC document image",
    message: "Verification request selected. Please upload your identity or address document image for review.",
  },
};

// Deposit/withdrawal/verification chats are backed by real service-request
// threads (persisted, visible to admin/team in the Requests inbox); "support"
// has no matching request type in the schema, so it stays the local-only
// cosmetic chat it always was, same as for anyone without a real session.
const chatTopicToRequestType = { deposit: "deposit", withdrawal: "withdrawal", verification: "kyc" };
let activeServiceRequestId = null;

async function authRequest(path, options = {}) {
  if (!currentSession?.token) throw new Error("Not signed in");
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${currentSession.token}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadOrCreateServiceRequestChat(type, introMessage) {
  processChatMessages.innerHTML = "";
  try {
    const existing = await authFetch("/api/service-requests");
    let serviceRequest = (existing?.serviceRequests || []).find((item) => item.type === type && item.status === "pending");
    if (!serviceRequest) {
      const created = await authRequest("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      serviceRequest = created.serviceRequest;
    }
    activeServiceRequestId = serviceRequest.id;
    appendProcessChatMessage(introMessage);
    const history = await authFetch(`/api/service-requests/${serviceRequest.id}/messages`);
    (history?.messages || []).forEach((message) => {
      appendProcessChatMessage(message.body, {
        self: message.sender_id === currentSession.user.id,
        imageSrc: message.attachment_url ? `${apiBase}${message.attachment_url}` : undefined,
      });
    });
  } catch {
    activeServiceRequestId = null;
    appendProcessChatMessage(introMessage);
  }
}

function applyIncomingChatMessage(message) {
  if (!message || message.request_id !== activeServiceRequestId) return;
  if (message.sender_id === currentSession?.user?.id) return; // already shown when we sent it
  appendProcessChatMessage(message.body, {
    imageSrc: message.attachment_url ? `${apiBase}${message.attachment_url}` : undefined,
  });
}

function applyIncomingRequestStatus(serviceRequest) {
  if (!serviceRequest || serviceRequest.user_id !== currentSession?.user?.id) return;
  if (document.querySelector("#profile")?.classList.contains("is-active")) loadTransactionHistory();
}

function appendProcessChatMessage(message, options = {}) {
  if (!processChatMessages) return;
  const bubble = document.createElement("div");
  bubble.className = `support-bubble${options.self ? " self" : ""}`;

  if (!options.self) {
    const icon = document.createElement("span");
    icon.textContent = "☏";
    bubble.append(icon);
  }

  const content = document.createElement("p");
  content.textContent = message;
  if (options.imageSrc) {
    const image = document.createElement("img");
    image.src = options.imageSrc;
    image.alt = options.imageAlt || "Uploaded image";
    content.append(image);
  }
  bubble.append(content);
  processChatMessages.append(bubble);
  processChatMessages.scrollTop = processChatMessages.scrollHeight;
  if (chatHistoryPreview) chatHistoryPreview.textContent = message;
}

async function openProcessChat(topicName = "deposit") {
  if (!processChatWindow) return;
  const topic = processChatTopics[topicName] || processChatTopics.deposit;
  const shouldAddTopicMessage = currentProcessChatTopic !== topicName || processChatWindow.classList.contains("is-hidden");
  currentProcessChatTopic = topicName;
  processChatTitle.textContent = topic.title;
  processChatSubtitle.textContent = topic.subtitle;
  processChatWindow.classList.remove("is-hidden");
  processChatLauncher?.classList.add("is-hidden");

  const requestType = chatTopicToRequestType[topicName];
  if (requestType && currentSession?.token) {
    await loadOrCreateServiceRequestChat(requestType, topic.message);
  } else {
    activeServiceRequestId = null;
    if (shouldAddTopicMessage) appendProcessChatMessage(topic.message);
  }
  processChatInput?.focus();
}

document.querySelectorAll("[data-chat-topic]").forEach((button) => {
  button.addEventListener("click", () => {
    openProcessChat(button.dataset.chatTopic);
  });
});

document.querySelector("#closeProcessChat")?.addEventListener("click", () => {
  processChatWindow?.classList.add("is-hidden");
  processChatLauncher?.classList.add("is-hidden");
});

document.querySelector("#minimizeProcessChat")?.addEventListener("click", () => {
  processChatWindow?.classList.add("is-hidden");
  processChatLauncher?.classList.remove("is-hidden");
});

processChatLauncher?.addEventListener("click", () => {
  processChatWindow?.classList.remove("is-hidden");
  processChatLauncher.classList.add("is-hidden");
  processChatInput?.focus();
});

document.querySelector("#openSupportChat")?.addEventListener("click", () => {
  openProcessChat("support");
});

document.querySelector("#processChatForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = processChatInput?.value.trim();
  if (!message) return;
  processChatInput.value = "";
  appendProcessChatMessage(message, { self: true });
  if (activeServiceRequestId && currentSession?.token) {
    try {
      await authRequest(`/api/service-requests/${activeServiceRequestId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });
    } catch {
      appendProcessChatMessage("Message failed to send — please try again.");
    }
  }
});

document.querySelector("#processChatImageInput")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = "";
  const imageUrl = URL.createObjectURL(file);
  const caption = `Uploaded image: ${file.name}`;
  appendProcessChatMessage(caption, { self: true, imageSrc: imageUrl, imageAlt: file.name });
  if (activeServiceRequestId && currentSession?.token) {
    try {
      const formData = new FormData();
      formData.append("attachment", file);
      formData.append("body", caption);
      await authRequest(`/api/service-requests/${activeServiceRequestId}/messages`, { method: "POST", body: formData });
    } catch {
      appendProcessChatMessage("Image upload failed — please try again.");
    }
  }
});

function filterWatchlist() {
  const search = document.querySelector("#watchSearch")?.value.toLowerCase().trim() || "";
  const activeFilter = document.querySelector(".watch-tabs button.is-active")?.dataset.watchFilter || "crypto";

  document.querySelectorAll(".watch-row").forEach((row) => {
    const matchesFilter = activeFilter === "all" || row.dataset.watchCategory === activeFilter;
    const matchesSearch = !search || row.dataset.watchSymbol.toLowerCase().includes(search);
    row.classList.toggle("is-filtered-out", !matchesFilter || !matchesSearch);
  });
}

document.querySelector("#watchSearch")?.addEventListener("input", filterWatchlist);

document.querySelectorAll(".watch-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".watch-tabs button").forEach((item) => item.classList.toggle("is-active", item === button));
    filterWatchlist();
  });
});

const instrumentFallbacks = {
  "XAU/USD": { price: 4521.75, changePercent: 3.61 },
  "XAG/USD": { price: 30.52, changePercent: 0.06 },
  "BTC/USD": { price: 63971.13, changePercent: -21.03 },
  "EUR/USD": { price: 1.0902, changePercent: 0.53 },
  "GBP/USD": { price: 1.40467, changePercent: 10.43 },
  USOIL: { price: 82.32, changePercent: -0.09 },
};

let tradeInstruments = [];
let managedInstruments = [];

function compactSymbol(symbol) {
  return String(symbol || "").replace("/", "");
}

function displayCategory(category) {
  const normalized = String(category || "markets").toLowerCase();
  if (normalized === "metals") return "CMD";
  if (normalized === "commodities") return "CMD";
  if (normalized === "crypto") return "CRYPTO";
  if (normalized === "forex") return "FX";
  return normalized.toUpperCase();
}

function categoryFilter(category) {
  const normalized = String(category || "commodities").toLowerCase();
  return normalized === "metals" ? "commodities" : normalized;
}

function getQuotePayload(data, symbol) {
  if (!data) return null;
  if (data[symbol]) return data[symbol];
  const compact = compactSymbol(symbol);
  return data[compact] || data;
}

function quotePrice(quote, fallback) {
  const value = quote?.price ?? quote?.close ?? quote?.bid ?? quote?.previous_close ?? fallback;
  return Number(value) || fallback;
}

function quoteChange(quote, fallback) {
  const value = quote?.percent_change ?? quote?.changePercent ?? quote?.change_percent ?? fallback;
  return Number(value) || fallback;
}

async function fetchTradeQuotes(instruments) {
  const symbols = instruments.map((instrument) => instrument.symbol).filter(Boolean);
  if (!symbols.length) return {};
  try {
    const response = await fetch(`${apiBase}/api/markets/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
    const payload = await response.json().catch(() => ({}));
    return payload.data || {};
  } catch {
    return {};
  }
}

function renderTradeWatchlist(instruments, quotes = {}) {
  const table = document.querySelector("#tradeWatchTable");
  const count = document.querySelector("#tradeWatchCount");
  if (!table) return;

  const head = `<div class="watch-head"><span>Symbol</span><span>Bid</span><span>Chg%</span></div>`;
  if (!instruments.length) {
    table.innerHTML = `${head}<div class="watch-empty-state">No markets enabled by admin.</div>`;
    if (count) count.textContent = "0 instruments";
    tradeChartState.candles = [];
    renderTradeCandles();
    return;
  }

  table.innerHTML = head + instruments
    .map((instrument, index) => {
      const fallback = instrumentFallbacks[instrument.symbol] || { price: 100 + index * 11, changePercent: 0.1 };
      const quote = getQuotePayload(quotes, instrument.symbol);
      const price = quotePrice(quote, fallback.price);
      const changePercent = quoteChange(quote, fallback.changePercent);
      const trendClass = changePercent >= 0 ? "up" : "down";
      const symbol = compactSymbol(instrument.symbol);
      const selected = symbol === tradeChartState.symbol || (!tradeChartState.symbol && index === 0);
      return `<button class="watch-row ${selected ? "is-selected" : ""}" type="button" data-watch-category="${categoryFilter(instrument.category)}" data-watch-symbol="${symbol} ${displayCategory(instrument.category)}" data-api-symbol="${instrument.symbol}">
        <span><strong>${symbol}</strong><small>${displayCategory(instrument.category)}</small></span>
        <em>${formatTradeNumber(price)}</em>
        <b class="${trendClass}">${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%</b>
      </button>`;
    })
    .join("");

  if (count) count.textContent = `${instruments.length} instruments`;
  filterWatchlist();

  const selectedRow = table.querySelector(".watch-row.is-selected") || table.querySelector(".watch-row");
  if (selectedRow) selectTradeSymbol(selectedRow);
}

async function loadTradeInstruments() {
  try {
    const response = await fetch(`${apiBase}/api/tradable-instruments`);
    const data = await response.json().catch(() => ({}));
    tradeInstruments = data.instruments || [];
    const quotes = await fetchTradeQuotes(tradeInstruments);
    renderTradeWatchlist(tradeInstruments, quotes);
  } catch {
    renderTradeWatchlist([]);
  }
}

const timeframeMinutes = {
  "1M": 1,
  "5M": 5,
  "15M": 15,
  "30M": 30,
  "1H": 60,
  "1D": 1440,
  "5D": 60,
  "1MO": 1440,
  "5MO": 1440,
  "1Y": 1440 * 7,
  ALL: 1440 * 30,
  CUSTOM: 1440,
};

const liveCandleSymbols = new Set(["XAU/USD"]);

const defaultTradeViewCount = 62;
const minTradeViewCount = 12;
const tradeChartMargins = { left: 12, top: 18, right: 64, bottom: 66 };

const tradeChartState = {
  symbol: "XAUUSD",
  category: "CMD",
  apiSymbol: "XAU/USD",
  price: 4521.75,
  changePercent: 3.61,
  timeframe: "1H",
  candles: [],
  tick: 0,
  isLiveChart: false,
  viewCount: defaultTradeViewCount,
  viewOffset: 0,
  liveBid: null,
  liveAsk: null,
  slideAnim: null,
  hover: null,
  logScale: false,
  manualPriceRange: null,
  customRange: null, // { start, end } ISO dates — set when the calendar picker is applied
};

function resetTradeChartView() {
  tradeChartState.viewCount = Math.min(defaultTradeViewCount, tradeChartState.candles.length) || defaultTradeViewCount;
  tradeChartState.viewOffset = 0;
  tradeChartState.manualPriceRange = null;
}

function formatTradeNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1000) return number.toFixed(2);
  if (number >= 10) return number.toFixed(3);
  return number.toFixed(5);
}

function hashSymbol(symbol) {
  return [...symbol].reduce((total, letter) => total + letter.charCodeAt(0), 0);
}

function readTradeRow(row) {
  const symbol = row.querySelector("strong")?.textContent.trim() || "BTCUSD";
  const category = row.querySelector("small")?.textContent.trim() || "Crypto";
  const price = Number(row.querySelector("em")?.textContent.replace(/,/g, "")) || tradeChartState.price;
  const changePercent = Number(row.querySelector("b")?.textContent.replace("%", "")) || 0;
  const apiSymbol = row.dataset.apiSymbol || symbol;
  return { symbol, category, price, changePercent, apiSymbol };
}

function buildTradeCandles({ symbol, price, timeframe }) {
  const seed = hashSymbol(symbol) + timeframeMinutes[timeframe] * 13;
  const spread = Math.max(price * (0.00055 + timeframeMinutes[timeframe] / 900000), 0.006);
  const stepMs = (timeframeMinutes[timeframe] || 60) * 60000;
  const now = Date.now();
  let close = price - Math.sin(seed) * spread * 7;

  return Array.from({ length: 74 }, (_, index) => {
    const wave = Math.sin((index + seed) / 5.7) * spread * 2.4;
    const pressure = Math.cos((index + seed) / 9.1) * spread * 1.8;
    const open = close;
    close = Math.max(0.00001, open + wave + pressure + (index > 55 ? -spread * 0.42 : 0));
    const high = Math.max(open, close) + spread * (1.3 + Math.abs(Math.sin(index + seed)));
    const low = Math.min(open, close) - spread * (1.1 + Math.abs(Math.cos(index + seed)));
    const volume = 28 + Math.abs(Math.sin(index / 3 + seed)) * 70 + (index > 68 ? 65 : 0);
    const time = new Date(now - (73 - index) * stepMs).toISOString();
    return { time, open, high, low: Math.max(0.00001, low), close, volume };
  });
}

function formatChartTime(timeStr, timeframe) {
  if (!timeStr) return "";
  const hasTimeOfDay = timeStr.includes(":");
  const isoLike = hasTimeOfDay ? timeStr.replace(" ", "T") : `${timeStr}T00:00:00`;
  const withZone = /[zZ]|[+-]\d\d:\d\d$/.test(isoLike) ? isoLike : `${isoLike}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return timeStr;
  if (!hasTimeOfDay || timeframe === "1D") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderTimeScale(candles) {
  const container = document.querySelector(".chart-times");
  if (!container || !candles.length) return;
  const labelCount = Math.min(7, candles.length);
  const step = (candles.length - 1) / Math.max(1, labelCount - 1);
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const candle = candles[Math.round(index * step)];
    return formatChartTime(candle?.time, tradeChartState.timeframe);
  });
  container.innerHTML = labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("");
}

function setTradeText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function getLiveBidAsk(latest) {
  const bid = tradeChartState.liveBid ?? latest.close - Math.max(latest.close * 0.00000016, 0.01);
  const ask = tradeChartState.liveAsk ?? latest.close + Math.max(latest.close * 0.00000016, 0.01);
  return { bid, ask };
}

function syncTradeTerminal(ohlcCandle) {
  const latest = tradeChartState.candles.at(-1);
  if (!latest) return;
  const ohlc = ohlcCandle || latest;
  const { bid, ask } = getLiveBidAsk(latest);
  const move = latest.close - tradeChartState.price;
  const moveText = `${move >= 0 ? "+" : ""}${formatTradeNumber(move)} (${tradeChartState.changePercent >= 0 ? "+" : ""}${tradeChartState.changePercent.toFixed(3)}%)`;

  setTradeText("#tradeSymbolName", tradeChartState.symbol);
  setTradeText("#tradeSymbolCategory", tradeChartState.category[0] + tradeChartState.category.slice(1).toLowerCase());
  setTradeText("#tradeSymbolPrice", formatTradeNumber(latest.close));
  setTradeText("#tradeSymbolChange", moveText);
  setTradeText("#ticketSymbolName", tradeChartState.symbol);
  setTradeText("#ticketSymbolPrice", formatTradeNumber(latest.close));
  // The O/H/L/C readout follows whatever candle is under the cursor (hover
  // inspection); everything else (price, bid/ask, spread) always reflects the
  // true live candle regardless of what's being hovered.
  setTradeText("#tradeOpenValue", formatTradeNumber(ohlc.open));
  setTradeText("#tradeHighValue", formatTradeNumber(ohlc.high));
  setTradeText("#tradeLowValue", formatTradeNumber(ohlc.low));
  setTradeText("#tradeCloseValue", formatTradeNumber(ohlc.close));
  setTradeText("#tradeBidValue", formatTradeNumber(bid));
  setTradeText("#tradeAskValue", formatTradeNumber(ask));
  setTradeText("#tradeSpreadValue", formatTradeNumber(ask - bid));
  setTradeText("#tradePriceMarker", formatTradeNumber(latest.close));
  setTradeText("#tradeTimeframeLabel", tradeChartState.timeframe);
  document.querySelector("#tradeSymbolChange")?.classList.toggle("positive", tradeChartState.changePercent >= 0);
  document.querySelector("#tradeSymbolChange")?.classList.toggle("danger-text", tradeChartState.changePercent < 0);
}

function renderPriceScale(values, isLog) {
  const scale = document.querySelector("#tradePriceScale");
  if (!scale || !values.length) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // The scale's tick labels lean on the flex container's own even visual
  // spacing (space-between), so ticks just need their VALUES interpolated
  // to match whichever scale is active: equal price steps for linear, equal
  // log steps (so each tick represents the same % move) for log.
  const canLog = isLog && min > 0;
  const logMin = canLog ? Math.log(min) : 0;
  const logMax = canLog ? Math.log(max) : 0;
  scale.innerHTML = Array.from({ length: 6 }, (_, index) => {
    const value = canLog
      ? Math.exp(logMax - ((logMax - logMin) / 5) * index)
      : max - ((max - min) / 5) * index;
    return `<span>${formatTradeNumber(value)}</span>`;
  }).join("");
}

function renderTradeCandles() {
  const canvas = document.querySelector("#tradeCandleCanvas");
  if (!canvas || !tradeChartState.candles.length) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const total = tradeChartState.candles.length;
  const viewCount = Math.max(minTradeViewCount, Math.min(tradeChartState.viewCount || defaultTradeViewCount, total));
  const maxOffset = Math.max(0, total - viewCount);
  const viewOffset = Math.max(0, Math.min(tradeChartState.viewOffset || 0, maxOffset));
  tradeChartState.viewCount = viewCount;
  tradeChartState.viewOffset = viewOffset;
  const viewEnd = total - viewOffset;
  const candles = tradeChartState.candles.slice(Math.max(0, viewEnd - viewCount), viewEnd);
  const chart = tradeChartMargins;
  const width = rect.width - chart.left - chart.right;
  const height = rect.height - chart.top - chart.bottom;
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  // Auto-scale by default (fits the visible candles' high/low), but a manual
  // drag/scroll on the price axis (see setupPriceAxisInteractions) overrides
  // this with a fixed range until the user double-clicks it or the view resets.
  const autoMax = Math.max(...highs);
  const autoMin = Math.min(...lows);
  const max = tradeChartState.manualPriceRange?.max ?? autoMax;
  const min = tradeChartState.manualPriceRange?.min ?? autoMin;
  const range = max - min || 1;
  const volumeMax = Math.max(...candles.map((candle) => candle.volume));
  const candleStep = width / candles.length;
  const candleWidth = Math.max(4, Math.min(12, candleStep * 0.58));
  // Log mode maps price through log() before the linear pixel interpolation,
  // so equal on-screen distances represent equal percentage moves instead of
  // equal absolute ones. Falls back to linear if min isn't positive (log of
  // zero/negative is undefined) — shouldn't happen for real prices, but a
  // synthetic/demo symbol could theoretically dip there.
  const isLog = tradeChartState.logScale && min > 0;
  const logMin = isLog ? Math.log(min) : 0;
  const logMax = isLog ? Math.log(max) : 0;
  const logRange = logMax - logMin || 1;
  const yFor = (value) => {
    if (isLog) return chart.top + ((logMax - Math.log(Math.max(value, 1e-9))) / logRange) * height;
    return chart.top + ((max - value) / range) * height;
  };
  const priceForY = (y) => {
    const ratio = (y - chart.top) / height;
    return isLog ? Math.exp(logMax - ratio * logRange) : max - ratio * range;
  };

  // A newly opened candle (real tick crossing a timeframe bucket, or the
  // synthetic demo tick) starts one full candle-width off to the right and
  // eases back to its resting position, so the whole plot visibly scrolls
  // left to make room for it instead of just popping into place.
  let slideOffsetPx = 0;
  if (tradeChartState.slideAnim) {
    const { startTime, duration } = tradeChartState.slideAnim;
    const progress = Math.min(1, (performance.now() - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    slideOffsetPx = (1 - eased) * candleStep;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(chart.left, 0, width, rect.height);
  ctx.clip();
  ctx.translate(slideOffsetPx, 0);

  ctx.strokeStyle = "rgba(42, 46, 57, 0.82)";
  ctx.lineWidth = 1;
  for (let x = chart.left; x <= rect.width - chart.right; x += Math.max(68, candleStep * 8)) {
    ctx.beginPath();
    ctx.moveTo(x, chart.top);
    ctx.lineTo(x, rect.height - chart.bottom + 38);
    ctx.stroke();
  }
  for (let i = 0; i <= 5; i += 1) {
    const y = chart.top + (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(chart.left, y);
    ctx.lineTo(rect.width - chart.right + 8, y);
    ctx.stroke();
  }

  candles.forEach((candle, index) => {
    const x = chart.left + index * candleStep + candleStep / 2;
    const isUp = candle.close >= candle.open;
    const color = isUp ? "#25b15f" : "#e83d30";
    const wickTop = yFor(candle.high);
    const wickBottom = yFor(candle.low);
    const bodyTop = yFor(Math.max(candle.open, candle.close));
    const bodyBottom = yFor(Math.min(candle.open, candle.close));
    const bodyHeight = Math.max(2, bodyBottom - bodyTop);

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, wickTop);
    ctx.lineTo(x, wickBottom);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);

    const volumeHeight = (candle.volume / volumeMax) * 38;
    ctx.globalAlpha = 0.42;
    ctx.fillRect(x - candleWidth / 2, rect.height - 30 - volumeHeight, candleWidth, volumeHeight);
    ctx.globalAlpha = 1;
  });

  const latest = candles.at(-1);
  const priceY = yFor(latest.close);
  const priceMarker = document.querySelector("#tradePriceMarker");
  if (priceMarker) priceMarker.style.top = `${Math.max(chart.top, Math.min(chart.top + height, priceY))}px`;

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#ffb000";
  ctx.beginPath();
  ctx.moveTo(chart.left, priceY);
  ctx.lineTo(rect.width - chart.right + 8, priceY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crosshair: hovering a candle shows its own OHLC in the readout above
  // (instead of the live candle's) and draws a vertical line through it plus
  // a horizontal line at the cursor's price, with small value tags on each
  // axis — the "inspect a historical bar" behavior real terminal charts have.
  let hoverCandle = null;
  let hoverPriceLabel = null;
  const hover = tradeChartState.hover;
  if (hover && candles.length) {
    const hoverIndex = Math.max(0, Math.min(candles.length - 1, hover.index));
    hoverCandle = candles[hoverIndex];
    const hoverX = chart.left + hoverIndex * candleStep + candleStep / 2;
    const hoverY = Math.max(chart.top, Math.min(chart.top + height, hover.y));

    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hoverX, chart.top);
    ctx.lineTo(hoverX, rect.height - chart.bottom + 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chart.left, hoverY);
    ctx.lineTo(rect.width - chart.right + 8, hoverY);
    ctx.stroke();
    ctx.setLineDash([]);

    hoverPriceLabel = { y: hoverY, text: formatTradeNumber(priceForY(hoverY)) };

    const timeLabel = formatChartTime(hoverCandle.time, tradeChartState.timeframe);
    if (timeLabel) {
      ctx.font = "11px sans-serif";
      const timeLabelWidth = ctx.measureText(timeLabel).width + 10;
      const timeLabelX = Math.min(Math.max(chart.left, hoverX - timeLabelWidth / 2), rect.width - chart.right - timeLabelWidth);
      ctx.fillStyle = "#3a4152";
      ctx.fillRect(timeLabelX, rect.height - chart.bottom + 40, timeLabelWidth, 18);
      ctx.fillStyle = "#e6e9ef";
      ctx.fillText(timeLabel, timeLabelX + 5, rect.height - chart.bottom + 49);
    }
  }

  ctx.restore();

  // The hover price tag lives on the right axis, outside the clipped plot
  // area drawn above, so it's drawn after restore() in unclipped coordinates
  // (otherwise it'd fall past the clip boundary and never actually paint).
  if (hoverPriceLabel) {
    ctx.font = "11px sans-serif";
    const labelWidth = ctx.measureText(hoverPriceLabel.text).width + 10;
    ctx.fillStyle = "#3a4152";
    ctx.fillRect(rect.width - chart.right + 8, hoverPriceLabel.y - 9, labelWidth, 18);
    ctx.fillStyle = "#e6e9ef";
    ctx.textBaseline = "middle";
    ctx.fillText(hoverPriceLabel.text, rect.width - chart.right + 13, hoverPriceLabel.y);
    ctx.textBaseline = "alphabetic";
  }

  renderPriceScale([min, max], isLog);
  renderTimeScale(candles);
  syncTradeTerminal(hoverCandle);

  if (tradeChartState.slideAnim) {
    const finished = performance.now() - tradeChartState.slideAnim.startTime >= tradeChartState.slideAnim.duration;
    if (finished) {
      tradeChartState.slideAnim = null;
    } else {
      requestAnimationFrame(renderTradeCandles);
    }
  }
}

let candleRequestToken = 0;

async function loadRealCandles(symbol, range, customRange) {
  const token = ++candleRequestToken;
  try {
    const params = new URLSearchParams({ symbol });
    if (customRange?.start && customRange?.end) {
      params.set("start", customRange.start);
      params.set("end", customRange.end);
    } else {
      params.set("range", range);
    }
    const response = await fetch(`${apiBase}/api/markets/candles?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (token !== candleRequestToken) return false;
    if (!response.ok || !payload.candles?.length) return false;
    tradeChartState.candles = payload.candles.map((candle) => ({
      time: candle.time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume || 0),
    }));
    return true;
  } catch {
    return false;
  }
}

function setStreamStatus(state) {
  const dot = document.querySelector("#tradeStreamStatus");
  if (!dot) return;
  dot.classList.remove("is-live", "is-polling", "is-offline", "is-closed");
  if (state === "live") {
    dot.classList.add("is-live");
    dot.title = "Live price stream connected";
  } else if (state === "polling") {
    dot.classList.add("is-polling");
    dot.title = "Polling for price updates";
  } else if (state === "closed") {
    dot.classList.add("is-closed");
    dot.title = "Market closed — showing last traded price";
  } else if (state === "offline") {
    dot.classList.add("is-offline");
    dot.title = "Live feed disconnected";
  } else {
    dot.title = "Connecting…";
  }
}

// Server-pushed { type: "market-status" } messages, keyed by symbol - a closed
// market just goes quiet (no more ticks), which on its own is indistinguishable
// from a stalled feed, so this is tracked separately from the tick-driven status.
const marketOpenBySymbol = new Map();

function applyMarketStatus(payload) {
  if (!payload.symbol) return;
  marketOpenBySymbol.set(payload.symbol, payload.isOpen);
  if (payload.symbol === tradeChartState.apiSymbol && tradeChartState.isLiveChart) {
    setStreamStatus(payload.isOpen ? "live" : "closed");
  }
}

async function loadChartForCurrentSymbol() {
  tradeChartState.liveBid = null;
  tradeChartState.liveAsk = null;
  tradeChartState.slideAnim = null;
  tradeChartState.hover = null;
  const isLive = liveCandleSymbols.has(tradeChartState.apiSymbol);
  if (!isLive) setStreamStatus(null);
  if (isLive) {
    const loadingToken = candleRequestToken;
    const ok = await loadRealCandles(tradeChartState.apiSymbol, tradeChartState.timeframe, tradeChartState.customRange);
    if (ok) {
      tradeChartState.isLiveChart = true;
      resetTradeChartView();
      renderTradeCandles();
      if (marketOpenBySymbol.get(tradeChartState.apiSymbol) === false) setStreamStatus("closed");
      return;
    }
    if (loadingToken !== candleRequestToken) return;
  }
  tradeChartState.isLiveChart = false;
  tradeChartState.candles = buildTradeCandles(tradeChartState);
  resetTradeChartView();
  renderTradeCandles();
}

function selectTradeSymbol(row) {
  Object.assign(tradeChartState, readTradeRow(row));
  document.querySelectorAll(".watch-row").forEach((item) => item.classList.toggle("is-selected", item === row));
  loadChartForCurrentSymbol();
  renderTradeTicket();
}

document.querySelector("#tradeWatchTable")?.addEventListener("click", (event) => {
  const row = event.target.closest(".watch-row");
  if (!row) return;
  selectTradeSymbol(row);
});

function toggleTradePanel(panel, button, collapsedGlyph, expandedGlyph, label) {
  const terminal = document.querySelector(".trade-terminal");
  if (!terminal) return;
  const cssClass = panel === "watch" ? "is-watch-collapsed" : "is-ticket-collapsed";
  const collapsed = terminal.classList.toggle(cssClass);
  if (button) {
    button.textContent = collapsed ? expandedGlyph : collapsedGlyph;
    button.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} ${label}`);
  }
  window.setTimeout(renderTradeCandles, 300);
}

document.querySelector("#toggleWatchPanel")?.addEventListener("click", (event) => {
  toggleTradePanel("watch", event.currentTarget, "‹", "›", "market watch");
});

document.querySelector("#toggleOrderTicket")?.addEventListener("click", (event) => {
  toggleTradePanel("ticket", event.currentTarget, "›", "‹", "order ticket");
});

document.querySelectorAll(".timeframes button[data-timeframe]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".timeframes button[data-timeframe]").forEach((item) => item.classList.toggle("is-active", item === button));
    tradeChartState.timeframe = button.dataset.timeframe;
    tradeChartState.customRange = null;
    loadChartForCurrentSymbol();
  });
});

// Calendar date-range picker: lets the user view candles for an arbitrary
// [start, end] window instead of one of the fixed canned ranges above.
(function setupCalendarPopover() {
  const toggle = document.querySelector("#tradeCalendarToggle");
  const popover = document.querySelector("#tradeCalendarPopover");
  const startInput = document.querySelector("#tradeCalendarStart");
  const endInput = document.querySelector("#tradeCalendarEnd");
  const errorEl = document.querySelector("#tradeCalendarError");
  const applyButton = document.querySelector("#tradeCalendarApply");
  const cancelButton = document.querySelector("#tradeCalendarCancel");
  if (!toggle || !popover) return;

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.classList.toggle("is-hidden", !message);
  }
  function closePopover() {
    popover.classList.add("is-hidden");
    toggle.setAttribute("aria-expanded", "false");
  }
  function openPopover() {
    popover.classList.remove("is-hidden");
    toggle.setAttribute("aria-expanded", "true");
    showError(null);
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (popover.classList.contains("is-hidden")) openPopover();
    else closePopover();
  });
  cancelButton?.addEventListener("click", closePopover);
  popover.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => {
    if (!popover.classList.contains("is-hidden")) closePopover();
  });

  applyButton?.addEventListener("click", () => {
    const start = startInput?.value;
    const end = endInput?.value;
    if (!start || !end) return showError("Pick both a start and end date.");
    if (new Date(`${start}T00:00:00Z`) >= new Date(`${end}T00:00:00Z`)) {
      return showError("Start date must be before the end date.");
    }
    showError(null);
    document.querySelectorAll(".timeframes button[data-timeframe]").forEach((item) => item.classList.remove("is-active"));
    tradeChartState.timeframe = "CUSTOM";
    tradeChartState.customRange = { start, end };
    loadChartForCurrentSymbol();
    closePopover();
  });
})();

function zoomTradeChart(factor, anchorRatio = 0.5) {
  const total = tradeChartState.candles.length;
  if (!total) return;
  const currentCount = tradeChartState.viewCount || defaultTradeViewCount;
  const currentEnd = total - (tradeChartState.viewOffset || 0);
  const anchorIndex = currentEnd - currentCount * (1 - anchorRatio);
  const newCount = Math.max(minTradeViewCount, Math.min(total, Math.round(currentCount * factor)));
  const newEnd = Math.max(newCount, Math.min(total, Math.round(anchorIndex + newCount * (1 - anchorRatio))));
  tradeChartState.viewCount = newCount;
  tradeChartState.viewOffset = Math.max(0, Math.min(total - newCount, total - newEnd));
  renderTradeCandles();
}

function panTradeChart(candleDelta) {
  const total = tradeChartState.candles.length;
  const viewCount = tradeChartState.viewCount || defaultTradeViewCount;
  const maxOffset = Math.max(0, total - viewCount);
  tradeChartState.viewOffset = Math.max(0, Math.min(maxOffset, (tradeChartState.viewOffset || 0) + candleDelta));
  renderTradeCandles();
}

let tradeRenderQueued = false;
function scheduleTradeRender() {
  if (tradeRenderQueued) return;
  tradeRenderQueued = true;
  requestAnimationFrame(() => {
    tradeRenderQueued = false;
    renderTradeCandles();
  });
}

function bucketStartMs(timeMs, timeframe) {
  const stepMs = (timeframeMinutes[timeframe] || 60) * 60000;
  return Math.floor(timeMs / stepMs) * stepMs;
}

// Ticks arrive from the server over /ws (either true Twelve Data stream pushes or
// its safe-interval fallback poll — applyLiveTick doesn't care which). Each tick
// either mutates the still-forming candle or, once its timestamp crosses into the
// next timeframe bucket, opens a new one — mirroring how the real exchange candle
// would form instead of waiting for the next full REST refresh.
function applyLiveTick(tick) {
  if (!tick.symbol || tick.symbol !== tradeChartState.apiSymbol) return;
  if (!tradeChartState.isLiveChart || !tradeChartState.candles.length) return;
  if (!document.querySelector("#trade")?.classList.contains("is-active")) return;

  const price = Number(tick.price);
  if (!Number.isFinite(price)) return;

  // A stray tick around the open/close boundary shouldn't flip the dot back
  // to live/polling if the market's already known closed for this symbol.
  const isMarketClosed = marketOpenBySymbol.get(tick.symbol) === false;
  setStreamStatus(isMarketClosed ? "closed" : tick.source === "stream" ? "live" : "polling");
  if (typeof tick.bid === "number") tradeChartState.liveBid = tick.bid;
  if (typeof tick.ask === "number") tradeChartState.liveAsk = tick.ask;

  const candles = tradeChartState.candles;
  const last = candles.at(-1);
  const tickMs = tick.timestamp ? new Date(tick.timestamp).getTime() : Date.now();
  const bucketMs = bucketStartMs(tickMs, tradeChartState.timeframe);
  const lastBucketMs = bucketStartMs(new Date(last.time).getTime(), tradeChartState.timeframe);
  // viewOffset === 0 means the view is already pinned to the newest candle — keep
  // it pinned so the chart keeps scrolling forward as new candles land. A user who
  // has panned back into history (viewOffset > 0) keeps their place instead.
  const isFollowingLive = (tradeChartState.viewOffset || 0) === 0;

  if (bucketMs > lastBucketMs) {
    candles.push({
      time: new Date(bucketMs).toISOString(),
      open: last.close,
      high: Math.max(last.close, price),
      low: Math.min(last.close, price),
      close: price,
      volume: 0,
    });
    const maxCandles = 600;
    if (candles.length > maxCandles) candles.splice(0, candles.length - maxCandles);
    if (isFollowingLive) {
      tradeChartState.viewOffset = 0;
      tradeChartState.slideAnim = { startTime: performance.now(), duration: 260 };
    }
  } else {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
  }

  scheduleTradeRender();
}

let priceStreamSocket = null;
let priceStreamReconnectMs = 2000;
const priceStreamMaxReconnectMs = 20000;

function connectPriceStream() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  try {
    priceStreamSocket = new WebSocket(`${protocol}//${location.host}/ws`);
  } catch {
    scheduleStreamReconnect();
    return;
  }

  priceStreamSocket.addEventListener("open", () => {
    priceStreamReconnectMs = 2000;
  });

  priceStreamSocket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === "price-tick") applyLiveTick(payload);
    else if (payload.type === "market-status") applyMarketStatus(payload);
    else if (payload.type === "chat.message") {
      applyIncomingChatMessage(payload.message);
      applyIncomingRequestMessageForAdmin(payload.message);
    } else if (payload.type === "service-request.status") applyIncomingRequestStatus(payload.serviceRequest);
  });

  priceStreamSocket.addEventListener("close", () => {
    if (tradeChartState.isLiveChart) setStreamStatus("offline");
    scheduleStreamReconnect();
  });

  priceStreamSocket.addEventListener("error", () => {
    priceStreamSocket?.close();
  });
}

function scheduleStreamReconnect() {
  window.setTimeout(connectPriceStream, priceStreamReconnectMs);
  priceStreamReconnectMs = Math.min(priceStreamMaxReconnectMs, priceStreamReconnectMs * 1.6);
}

connectPriceStream();

(function setupTradeChartInteractions() {
  const canvas = document.querySelector("#tradeCandleCanvas");
  const chartContainer = document.querySelector(".candlestick-chart");
  if (!canvas) return;

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchorRatio = rect.width ? 1 - (event.clientX - rect.left) / rect.width : 0.5;
      zoomTradeChart(event.deltaY > 0 ? 1.15 : 1 / 1.15, anchorRatio);
    },
    { passive: false },
  );

  let drag = null;

  // Hovering near the chart's left/right edge keeps revealing older/newer
  // candles for as long as the cursor stays there, like map-style edge
  // scrolling — a repeating nudge rather than a one-shot jump.
  const edgeScrollZonePx = 36;
  const edgeScrollIntervalMs = 90;
  let edgeScrollTimer = null;
  let edgeScrollDirection = 0;

  const stopEdgeScroll = () => {
    if (edgeScrollTimer) window.clearInterval(edgeScrollTimer);
    edgeScrollTimer = null;
    edgeScrollDirection = 0;
  };
  const startEdgeScroll = (direction) => {
    if (edgeScrollDirection === direction) return;
    stopEdgeScroll();
    edgeScrollDirection = direction;
    edgeScrollTimer = window.setInterval(() => panTradeChart(direction), edgeScrollIntervalMs);
  };

  const beginDrag = (clientX) => {
    stopEdgeScroll();
    drag = { startX: clientX, startOffset: tradeChartState.viewOffset || 0 };
    canvas.classList.add("is-panning");
  };
  const continueDrag = (clientX) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const viewCount = tradeChartState.viewCount || defaultTradeViewCount;
    const candleStep = rect.width / viewCount;
    if (!candleStep) return;
    const deltaCandles = Math.round((clientX - drag.startX) / candleStep);
    const total = tradeChartState.candles.length;
    const maxOffset = Math.max(0, total - viewCount);
    tradeChartState.viewOffset = Math.max(0, Math.min(maxOffset, drag.startOffset + deltaCandles));
    renderTradeCandles();
  };
  const endDrag = () => {
    drag = null;
    canvas.classList.remove("is-panning");
  };

  canvas.addEventListener("mousedown", (event) => beginDrag(event.clientX));
  window.addEventListener("mousemove", (event) => continueDrag(event.clientX));
  window.addEventListener("mouseup", endDrag);

  // Crosshair hover: only while not actively dragging/panning, so the two
  // don't fight over what the cursor means. Bound to the chart CONTAINER
  // rather than the canvas itself: the price marker and bid/ask float badges
  // are separate elements stacked on top of the canvas near the right edge,
  // and since a covered element never receives mouse events for the pixels
  // another element sits on top of, a canvas-only listener would go dead in
  // that whole column. mousemove bubbles, so listening on the container
  // still gets every move regardless of which child is directly underneath.
  (chartContainer || canvas).addEventListener("mousemove", (event) => {
    if (drag) return;
    const rect = canvas.getBoundingClientRect();
    const viewCount = tradeChartState.viewCount || defaultTradeViewCount;
    const width = rect.width - tradeChartMargins.left - tradeChartMargins.right;
    const candleStep = width / viewCount;
    if (!candleStep) return;
    const relX = event.clientX - rect.left;
    const relY = event.clientY - rect.top;
    const index = Math.round((relX - tradeChartMargins.left - candleStep / 2) / candleStep);
    tradeChartState.hover = { index, y: relY };
    scheduleTradeRender();

    const plotLeft = tradeChartMargins.left;
    const plotRight = rect.width - tradeChartMargins.right;
    if (relX <= plotLeft + edgeScrollZonePx) {
      startEdgeScroll(1); // near the left edge: reveal older candles
    } else if (relX >= plotRight - edgeScrollZonePx) {
      startEdgeScroll(-1); // near the right edge: reveal newer/live candles
    } else {
      stopEdgeScroll();
    }
  });
  (chartContainer || canvas).addEventListener("mouseleave", () => {
    stopEdgeScroll();
    if (!tradeChartState.hover) return;
    tradeChartState.hover = null;
    scheduleTradeRender();
  });

  canvas.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 1) beginDrag(event.touches[0].clientX);
    },
    { passive: true },
  );
  canvas.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length === 1) {
        continueDrag(event.touches[0].clientX);
      } else if (event.touches.length === 2) {
        const [a, b] = event.touches;
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (drag?.pinchDistance) {
          zoomTradeChart(drag.pinchDistance / distance);
        }
        drag = { pinchDistance: distance };
      }
    },
    { passive: true },
  );
  canvas.addEventListener("touchend", endDrag);

  canvas.addEventListener("dblclick", () => {
    resetTradeChartView();
    renderTradeCandles();
  });

  document.querySelector("#chartZoomIn")?.addEventListener("click", () => zoomTradeChart(1 / 1.3));
  document.querySelector("#chartZoomOut")?.addEventListener("click", () => zoomTradeChart(1.3));
  document.querySelector("#chartZoomReset")?.addEventListener("click", () => {
    resetTradeChartView();
    renderTradeCandles();
  });

  const logToggle = document.querySelector("#chartLogToggle");
  logToggle?.addEventListener("click", () => {
    tradeChartState.logScale = !tradeChartState.logScale;
    logToggle.classList.toggle("is-active", tradeChartState.logScale);
    logToggle.setAttribute("aria-pressed", String(tradeChartState.logScale));
    renderTradeCandles();
  });
})();

// Dragging or scrolling on the price axis itself manually overrides the
// otherwise-always-auto-scaled price range, mirroring how TradingView's own
// price scale works: drag to zoom the visible range, scroll to pan it in
// fixed $5 steps, double-click to hand control back to auto-scale.
(function setupPriceAxisInteractions() {
  const scale = document.querySelector("#tradePriceScale");
  if (!scale) return;

  function visiblePriceRange() {
    const total = tradeChartState.candles.length;
    if (!total) return null;
    const viewCount = Math.min(tradeChartState.viewCount || defaultTradeViewCount, total);
    const viewOffset = Math.min(tradeChartState.viewOffset || 0, Math.max(0, total - viewCount));
    const viewEnd = total - viewOffset;
    const visible = tradeChartState.candles.slice(Math.max(0, viewEnd - viewCount), viewEnd);
    return {
      max: Math.max(...visible.map((candle) => candle.high)),
      min: Math.min(...visible.map((candle) => candle.low)),
    };
  }

  function currentRange() {
    return tradeChartState.manualPriceRange || visiblePriceRange();
  }

  let dragStartY = null;
  let dragStartRange = null;

  scale.addEventListener("mousedown", (event) => {
    const range = currentRange();
    if (!range) return;
    dragStartY = event.clientY;
    dragStartRange = range;
    scale.classList.add("is-dragging");
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (dragStartY === null || !dragStartRange) return;
    const rect = scale.getBoundingClientRect();
    if (!rect.height) return;
    const deltaY = event.clientY - dragStartY;
    // Dragging down stretches the range (zoom out), dragging up compresses it
    // (zoom in), anchored on the range's center so the mid price stays put.
    const factor = Math.exp(deltaY / rect.height);
    const span = Math.max(1e-6, dragStartRange.max - dragStartRange.min);
    const center = (dragStartRange.max + dragStartRange.min) / 2;
    const newSpan = Math.max(span * 0.1, Math.min(span * 8, span * factor));
    tradeChartState.manualPriceRange = { min: center - newSpan / 2, max: center + newSpan / 2 };
    renderTradeCandles();
  });

  window.addEventListener("mouseup", () => {
    dragStartY = null;
    dragStartRange = null;
    scale.classList.remove("is-dragging");
  });

  scale.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const range = currentRange();
      if (!range) return;
      const step = event.deltaY > 0 ? -5 : 5;
      tradeChartState.manualPriceRange = { min: range.min + step, max: range.max + step };
      renderTradeCandles();
    },
    { passive: false },
  );

  scale.addEventListener("dblclick", () => {
    tradeChartState.manualPriceRange = null;
    renderTradeCandles();
  });
})();

const tradeTicketCopy = {
  multiplier: "100",
  fee: "0.064000",
  margin: "6.400000",
};

function renderTradeTicket() {
  const symbol = tradeChartState.symbol;

  document.querySelector("#ticketKindNote").textContent = `Spot order · ${symbol} settlement`;
  document.querySelector("#ticketMultiplier").textContent = tradeTicketCopy.multiplier;
  document.querySelector("#ticketLotValue").textContent = `1 Lots = 1 ${symbol}`;
  document.querySelector("#ticketFeeValue").textContent = tradeTicketCopy.fee;
  document.querySelector("#ticketMarginValue").textContent = tradeTicketCopy.margin;
  document.querySelector("#ticketBalanceValue").textContent = Number(currentSession?.user?.balance || 0).toFixed(2);
}

document.querySelectorAll("[data-risk-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const isOn = !button.classList.contains("is-on");
    button.classList.toggle("is-on", isOn);
    button.setAttribute("aria-pressed", String(isOn));
    document.querySelector(`[data-risk-stepper="${button.dataset.riskToggle}"]`)?.classList.toggle("is-enabled", isOn);
  });
});

document.querySelectorAll("[data-risk-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.riskStep;
    const valueEl = document.querySelector(`[data-risk-value="${key}"]`);
    if (!valueEl) return;
    const next = Math.max(0, Number(valueEl.textContent) + Number(button.dataset.riskDir));
    valueEl.textContent = next % 1 === 0 ? String(next) : next.toFixed(2);
  });
});

document.querySelector("#lotsIncrease")?.addEventListener("click", () => {
  const valueEl = document.querySelector("#ticketLotsValue");
  valueEl.textContent = (Number(valueEl.textContent) + 0.01).toFixed(2);
});

document.querySelector("#lotsDecrease")?.addEventListener("click", () => {
  const valueEl = document.querySelector("#ticketLotsValue");
  valueEl.textContent = Math.max(0.01, Number(valueEl.textContent) - 0.01).toFixed(2);
});

async function tickLiveCandle() {
  if (!document.querySelector("#trade")?.classList.contains("is-active")) return;
  const quotes = await fetchTradeQuotes([{ symbol: tradeChartState.apiSymbol }]);
  const quote = getQuotePayload(quotes, tradeChartState.apiSymbol);
  const price = quotePrice(quote, 0);
  if (!price) return;
  const last = tradeChartState.candles.at(-1);
  if (!last) return;
  last.close = price;
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
  setStreamStatus("polling");
  renderTradeCandles();
}

let liveCandleRefreshTick = 0;

function isPriceStreamOpen() {
  return Boolean(priceStreamSocket && priceStreamSocket.readyState === WebSocket.OPEN);
}

function tickTradeCandles() {
  if (!tradeChartState.candles.length) return;
  if (tradeChartState.isLiveChart) {
    // When our own /ws connection is up, the server pushes price ticks (real
    // stream or its own safe-interval fallback poll) straight to applyLiveTick,
    // so this REST-based tick would just be a redundant, credit-spending
    // duplicate. Only fall back to it if that channel is actually down.
    if (!isPriceStreamOpen()) tickLiveCandle();
    liveCandleRefreshTick += 1;
    if (liveCandleRefreshTick % 40 === 0 && document.querySelector("#trade")?.classList.contains("is-active")) {
      loadRealCandles(tradeChartState.apiSymbol, tradeChartState.timeframe, tradeChartState.customRange).then((ok) => {
        if (ok) renderTradeCandles();
      });
    }
    return;
  }
  const last = tradeChartState.candles.at(-1);
  const scale = Math.max(last.close * 0.00032, 0.004);
  const delta = Math.sin(Date.now() / 1800 + hashSymbol(tradeChartState.symbol)) * scale + (Math.random() - 0.48) * scale;
  last.close = Math.max(0.00001, last.close + delta);
  last.high = Math.max(last.high, last.close + Math.abs(delta) * 0.8);
  last.low = Math.min(last.low, last.close - Math.abs(delta) * 0.8);
  last.volume = Math.min(180, last.volume + Math.abs(delta / scale) * 9);
  tradeChartState.tick += 1;

  if (tradeChartState.tick % 8 === 0) {
    const open = last.close;
    const wasFollowingLive = (tradeChartState.viewOffset || 0) === 0;
    tradeChartState.candles.push({
      time: new Date().toISOString(),
      open,
      high: open + scale * 1.8,
      low: Math.max(0.00001, open - scale * 1.6),
      close: Math.max(0.00001, open + (Math.random() - 0.52) * scale * 2.4),
      volume: 34 + Math.random() * 55,
    });
    tradeChartState.candles = tradeChartState.candles.slice(-84);
    if (wasFollowingLive) tradeChartState.slideAnim = { startTime: performance.now(), duration: 260 };
  }

  renderTradeCandles();
}

tradeChartState.candles = buildTradeCandles(tradeChartState);
renderTradeTicket();
renderTradeCandles();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setManagedMessage(message, type = "") {
  const element = document.querySelector("#managedUserMessage");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-success", type === "success");
  element.classList.toggle("is-error", type === "error");
}

async function adminFetch(path, options = {}) {
  if (!canManageUsers() || !currentSession?.token) throw new Error("Admin or team access required");
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentSession.token}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    clearSession();
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

let managedUsers = [];

function renderManagedUsers() {
  const table = document.querySelector("#managedUserTable");
  if (!table) return;
  const query = document.querySelector("#managedUserSearch")?.value.toLowerCase().trim() || "";
  const visibleUsers = managedUsers.filter((user) => {
    return [user.name, user.email, user.role, user.status, user.kycStatus].some((value) => String(value || "").toLowerCase().includes(query));
  });

  setTradeText("#managedTotalUsers", String(managedUsers.length));
  setTradeText("#managedVerifiedUsers", String(managedUsers.filter((user) => user.kycStatus === "verified").length));
  setTradeText("#managedPendingUsers", String(managedUsers.filter((user) => user.kycStatus === "pending").length));

  if (!visibleUsers.length) {
    table.innerHTML = `<tr><td colspan="6">No users found.</td></tr>`;
    return;
  }

  table.innerHTML = visibleUsers.map((user) => {
    const statusClass = user.status === "suspended" ? "is-suspended" : user.status === "pending" ? "is-pending" : "";
    const kycClass = user.kycStatus === "rejected" ? "is-rejected" : user.kycStatus === "pending" ? "is-pending" : "";
    const disabled = canEditManagedUsers() ? "" : "disabled";
    const actionCell = canEditManagedUsers() ? `<button class="managed-save-button" type="button" data-managed-user="${escapeHtml(user.id)}">Save</button>` : `<span class="status-pill">view only</span>`;
    return `
      <tr data-managed-user-row="${escapeHtml(user.id)}">
        <td><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></td>
        <td>
          <select data-user-field="role" ${disabled}>
            <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
            <option value="team" ${user.role === "team" ? "selected" : ""}>Team</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </td>
        <td>
          <select data-user-field="status" ${disabled}>
            <option value="active" ${user.status === "active" ? "selected" : ""}>Active</option>
            <option value="pending" ${user.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="suspended" ${user.status === "suspended" ? "selected" : ""}>Suspended</option>
          </select>
          <span class="status-pill ${statusClass}">${escapeHtml(user.status || "active")}</span>
        </td>
        <td>
          <select data-user-field="kycStatus" ${disabled}>
            <option value="pending" ${user.kycStatus === "pending" ? "selected" : ""}>Pending</option>
            <option value="verified" ${user.kycStatus === "verified" ? "selected" : ""}>Verified</option>
            <option value="rejected" ${user.kycStatus === "rejected" ? "selected" : ""}>Rejected</option>
          </select>
          <span class="status-pill ${kycClass}">${escapeHtml(user.kycStatus || "pending")}</span>
        </td>
        <td><input data-user-field="balance" type="number" min="0" step="0.01" value="${Number(user.balance || 0).toFixed(2)}" ${disabled} /></td>
        <td>${actionCell}</td>
      </tr>`;
  }).join("");
}

function renderManagedInstruments() {
  const list = document.querySelector("#managedInstrumentList");
  if (!list) return;

  if (!managedInstruments.length) {
    list.innerHTML = `<div class="instrument-control-row"><span>No configured instruments.</span></div>`;
    return;
  }

  list.innerHTML = managedInstruments
    .map((instrument) => {
      const disabled = canEditManagedUsers() ? "" : "disabled";
      const symbol = compactSymbol(instrument.symbol);
      return `<div class="instrument-control-row" data-instrument="${escapeHtml(instrument.id)}">
        <div>
          <strong>${escapeHtml(symbol)}</strong>
          <small>${escapeHtml(instrument.displayName)} · ${escapeHtml(displayCategory(instrument.category))}</small>
        </div>
        <label><input type="checkbox" data-instrument-trade="${escapeHtml(instrument.id)}" ${instrument.tradeEnabled ? "checked" : ""} ${disabled} /> Trade</label>
      </div>`;
    })
    .join("");
}

async function loadManagedUsers() {
  if (!document.querySelector("#managedUserTable")) return;
  if (!canManageUsers()) {
    managedUsers = [];
    renderManagedUsers();
    return;
  }
  try {
    const data = await adminFetch("/api/admin/users");
    managedUsers = data.users || [];
    renderManagedUsers();
    setManagedMessage("User list synced.", "success");
  } catch (error) {
    setManagedMessage(error.message, "error");
  }
}

async function loadManagedInstruments() {
  if (!document.querySelector("#managedInstrumentList")) return;
  if (!canManageUsers()) {
    managedInstruments = [];
    renderManagedInstruments();
    return;
  }
  try {
    const data = await adminFetch("/api/admin/instruments");
    managedInstruments = data.instruments || [];
    renderManagedInstruments();
  } catch (error) {
    const list = document.querySelector("#managedInstrumentList");
    if (list) list.innerHTML = `<div class="instrument-control-row"><span>${escapeHtml(error.message)}</span></div>`;
  }
}

document.querySelector("#managedUserSearch")?.addEventListener("input", renderManagedUsers);
document.querySelector("#refreshManagedUsers")?.addEventListener("click", loadManagedUsers);
document.querySelector("#refreshManagedInstruments")?.addEventListener("click", loadManagedInstruments);

// Admin/team "Requests" inbox: the real client-facing chat (see
// loadOrCreateServiceRequestChat above) persists to the same service_requests/
// chat_messages tables this reads, so a client's deposit/withdrawal/KYC
// message shows up here live via the same "chat.message" WS broadcast.
let serviceRequests = [];
let activeRequestDetailId = null;

function findManagedUserById(id) {
  return managedUsers.find((user) => user.id === id) || null;
}

function renderRequestsTable() {
  const table = document.querySelector("#requestsTable");
  if (!table) return;
  if (!serviceRequests.length) {
    table.innerHTML = '<tr><td colspan="5">No service requests yet.</td></tr>';
    return;
  }
  table.innerHTML = serviceRequests
    .map((item) => {
      const client = findManagedUserById(item.user_id);
      const clientLabel = client ? client.name || client.email : item.user_id;
      const date = item.created_at ? new Date(item.created_at).toLocaleString() : "";
      const isSelected = item.id === activeRequestDetailId;
      return `<tr class="${isSelected ? "is-selected-request" : ""}">
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(clientLabel)}</td>
        <td>${escapeHtml(item.type)}</td>
        <td><span class="status-pill">${escapeHtml(item.status)}</span></td>
        <td><button type="button" class="secondary-action compact-action open-request-btn" data-request-id="${item.id}">View</button></td>
      </tr>`;
    })
    .join("");
}

async function loadServiceRequestsInbox() {
  const table = document.querySelector("#requestsTable");
  if (!table || !canManageUsers()) return;
  try {
    if (!managedUsers.length) {
      const usersData = await adminFetch("/api/admin/users");
      managedUsers = usersData.users || [];
    }
    const data = await adminFetch("/api/service-requests");
    serviceRequests = (data.serviceRequests || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderRequestsTable();
  } catch (error) {
    table.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

function appendRequestDetailMessage(message) {
  const messagesEl = document.querySelector("#requestDetailMessages");
  if (!messagesEl) return;
  const isSelf = message.sender_id === currentSession?.user?.id;
  const bubble = document.createElement("div");
  bubble.className = `support-bubble${isSelf ? " self" : ""}`;
  const content = document.createElement("p");
  content.textContent = message.body;
  if (message.attachment_url) {
    const image = document.createElement("img");
    image.src = `${apiBase}${message.attachment_url}`;
    image.alt = "Attachment";
    content.append(image);
  }
  bubble.append(content);
  messagesEl.append(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function updateRequestStatus(item, status) {
  try {
    await adminFetch(`/api/service-requests/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    item.status = status;
    renderRequestsTable();
    if (activeRequestDetailId === item.id) openRequestDetail(item.id);
  } catch (error) {
    setManagedMessage(error.message, "error");
  }
}

async function approveOrRejectKyc(item, kycStatus) {
  try {
    await adminFetch(`/api/admin/users/${item.user_id}`, { method: "PATCH", body: JSON.stringify({ kycStatus }) });
    await updateRequestStatus(item, "resolved");
    const client = findManagedUserById(item.user_id);
    if (client) client.kycStatus = kycStatus;
    renderManagedUsers();
  } catch (error) {
    setManagedMessage(error.message, "error");
  }
}

async function openRequestDetail(id) {
  activeRequestDetailId = id;
  renderRequestsTable();
  const card = document.querySelector("#requestDetailCard");
  const messagesEl = document.querySelector("#requestDetailMessages");
  const titleEl = document.querySelector("#requestDetailTitle");
  const subtitleEl = document.querySelector("#requestDetailSubtitle");
  const actionsEl = document.querySelector("#requestDetailActions");
  const item = serviceRequests.find((request) => request.id === id);
  if (!card || !messagesEl || !item) return;
  card.hidden = false;

  const client = findManagedUserById(item.user_id);
  titleEl.textContent = `${item.type.toUpperCase()} · ${client ? client.name || client.email : item.user_id}`;
  const details = [`Status: ${item.status}`];
  if (item.amount) details.push(`Amount: ${formatCurrency(item.amount)}`);
  if (item.note) details.push(item.note);
  subtitleEl.textContent = details.join(" · ");

  actionsEl.innerHTML = "";
  if (item.type === "kyc" && currentSession?.user?.role === "admin") {
    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "approve-btn";
    approveBtn.textContent = "Approve KYC";
    approveBtn.addEventListener("click", () => approveOrRejectKyc(item, "verified"));
    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "reject-btn";
    rejectBtn.textContent = "Reject KYC";
    rejectBtn.addEventListener("click", () => approveOrRejectKyc(item, "rejected"));
    actionsEl.append(approveBtn, rejectBtn);
  }
  if (item.status !== "resolved") {
    const resolveBtn = document.createElement("button");
    resolveBtn.type = "button";
    resolveBtn.className = "resolve-btn";
    resolveBtn.textContent = "Mark Resolved";
    resolveBtn.addEventListener("click", () => updateRequestStatus(item, "resolved"));
    actionsEl.append(resolveBtn);
  }

  messagesEl.innerHTML = "";
  try {
    const data = await adminFetch(`/api/service-requests/${id}/messages`);
    (data.messages || []).forEach(appendRequestDetailMessage);
  } catch (error) {
    messagesEl.innerHTML = `<div class="support-bubble"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

document.querySelector("#refreshServiceRequests")?.addEventListener("click", loadServiceRequestsInbox);

document.querySelector("#requestsTable")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-request-id]");
  if (button) openRequestDetail(button.dataset.requestId);
});

document.querySelector("#requestDetailForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#requestDetailInput");
  const body = input?.value.trim();
  if (!body || !activeRequestDetailId) return;
  input.value = "";
  try {
    const data = await adminFetch(`/api/service-requests/${activeRequestDetailId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    appendRequestDetailMessage(data.message);
  } catch (error) {
    setManagedMessage(error.message, "error");
  }
});

// Live updates in the open thread when a client (or another team member)
// sends a message, without needing to reopen the detail panel.
function applyIncomingRequestMessageForAdmin(message) {
  if (!message || message.request_id !== activeRequestDetailId) return;
  if (message.sender_id === currentSession?.user?.id) return; // already shown when we sent it
  appendRequestDetailMessage(message);
}

document.querySelector("#managedUserForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEditManagedUsers()) {
    setManagedMessage("Only admin can create users.", "error");
    return;
  }
  const data = Object.fromEntries(new FormData(event.target).entries());
  data.balance = Number(data.balance || 0);
  try {
    const result = await adminFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
    managedUsers = [result.user, ...managedUsers];
    event.target.reset();
    event.target.elements.password.value = "Client@12345";
    event.target.elements.balance.value = "0";
    renderManagedUsers();
    setManagedMessage(`Created ${result.user.email}. Temporary password: ${result.temporaryPassword}`, "success");
  } catch (error) {
    setManagedMessage(error.message, "error");
  }
});

document.querySelector("#managedUserTable")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-managed-user]");
  if (!button) return;
  if (!canEditManagedUsers()) {
    setManagedMessage("Only admin can update users.", "error");
    return;
  }
  const row = button.closest("[data-managed-user-row]");
  const id = button.dataset.managedUser;
  const patch = Object.fromEntries([...row.querySelectorAll("[data-user-field]")].map((input) => [input.dataset.userField, input.value]));
  patch.balance = Number(patch.balance || 0);

  try {
    const result = await adminFetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    managedUsers = managedUsers.map((user) => (user.id === id ? result.user : user));
    renderManagedUsers();
    setManagedMessage(`Updated ${result.user.email}.`, "success");
  } catch (error) {
    setManagedMessage(error.message, "error");
  }
});

document.querySelector("#managedInstrumentList")?.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-instrument-trade]");
  if (!input) return;
  if (!canEditManagedUsers()) {
    input.checked = !input.checked;
    setManagedMessage("Only admin can change trade controls.", "error");
    return;
  }

  const instrument = managedInstruments.find((item) => item.id === input.dataset.instrumentTrade);
  if (!instrument) return;
  const nextInstrument = { ...instrument, tradeEnabled: input.checked };
  try {
    const result = await adminFetch("/api/admin/instruments", {
      method: "POST",
      body: JSON.stringify(nextInstrument),
    });
    managedInstruments = managedInstruments.map((item) => (item.id === instrument.id ? result.instrument : item));
    renderManagedInstruments();
    await loadTradeInstruments();
    setManagedMessage(`${compactSymbol(result.instrument.symbol)} trade access ${result.instrument.tradeEnabled ? "enabled" : "disabled"}.`, "success");
  } catch (error) {
    input.checked = instrument.tradeEnabled;
    setManagedMessage(error.message, "error");
  }
});

document.querySelectorAll("[data-metal]").forEach((button) => {
  button.addEventListener("click", () => {
    activeMetal = button.dataset.metal;
    document.querySelectorAll("[data-metal]").forEach((item) => item.classList.toggle("is-active", item === button));
    drawCharts();
  });
});

document.querySelector("#shockMarket")?.addEventListener("click", () => {
  volatilityBoost = 6;
});

document.querySelector("#teamForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  team.push({ name: data.get("name"), role: data.get("role"), status: "Online" });
  event.target.reset();
  renderTeam();
});

document.querySelector("#teamList")?.addEventListener("click", (event) => {
  const index = event.target.dataset.team;
  if (index !== undefined) {
    team.splice(Number(index), 1);
    renderTeam();
  }
});

document.querySelector("#userForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  users = [
    { name: data.get("name"), email: data.get("email"), tier: "Standard", status: "Active", exposure: "$0" },
    ...users,
  ];
  event.target.reset();
  renderUsers();
});

document.querySelector("#userTable")?.addEventListener("click", (event) => {
  const index = event.target.dataset.user;
  if (index !== undefined) {
    users[index].status = users[index].status === "Suspended" ? "Active" : "Suspended";
    renderUsers();
  }
});

document.querySelector("#chatForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  messages.push({ author: "You", body: data.get("message"), self: true });
  event.target.reset();
  renderChat();
});

document.querySelector("#globalSearch")?.addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  document.querySelectorAll(".person-card, tbody tr, .activity-item, .message").forEach((node) => {
    node.style.display = node.textContent.toLowerCase().includes(query) ? "" : "none";
  });
});

function hydrateSession() {
  const token = localStorage.getItem("fxccAuthToken");
  const userJson = localStorage.getItem("fxccUser");
  if (!token || !userJson) {
    updateRoleAccess();
    return;
  }
  try {
    currentSession = { token, user: JSON.parse(userJson) };
    enterWorkspace();
  } catch {
    clearSession();
    updateRoleAccess();
  }
}

seedMetalData();
hydrateSession();
renderTickers();
renderBook();
renderActivity();
renderTeam();
renderUsers();
renderChat();
drawCharts();
renderTradeCandles();
loadTradeInstruments();
loadMarketsInstruments();
loadManagedUsers();
loadManagedInstruments();
setInterval(tickMarkets, 1500);
setInterval(refreshMarketsQuotes, 7000);
setInterval(tickTradeCandles, 1500);
setInterval(updateDashboardTime, 1000);
