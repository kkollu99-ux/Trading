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
  document.querySelectorAll('[data-section="users"]').forEach((item) => {
    item.hidden = !allowed;
    item.classList.toggle("is-hidden", !allowed);
  });
  document.querySelector("#users")?.classList.toggle("is-role-hidden", !allowed);
  document.querySelector(".managed-form-card")?.classList.toggle("is-hidden", allowed && !editable);
  document.querySelector(".managed-instrument-card")?.classList.toggle("is-hidden", !allowed);

  if (!allowed) {
    managedUsers = [];
    managedInstruments = [];
    renderManagedUsers();
    renderManagedInstruments();
    if (document.querySelector("#users")?.classList.contains("is-active")) moveSection("dashboard");
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
  if (id === "users" && !canManageUsers()) id = "dashboard";
  navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.section === id));
  sections.forEach((section) => section.classList.toggle("is-active", section.id === id));
  if (id === "dashboard") {
    renderDashboardGreeting();
  } else if (sectionTitle) {
    sectionTitle.textContent = getNavLabel(navItems.find((item) => item.dataset.section === id)) || "Home";
  }
  if (id === "users" && canManageUsers()) {
    loadManagedUsers();
    loadManagedInstruments();
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
  const fallbackUser = { role: "user", name: String(email).split("@")[0] || "New Client", email };

  try {
    const response = await fetch(`${apiBase}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: fallbackUser.name,
        referralCode: data.get("referral") || null,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Registration failed");
    event.target.reset();
    enterWorkspace(result);
  } catch (requestError) {
    users = [
      {
        name: fallbackUser.name,
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

function openProcessChat(topicName = "deposit") {
  if (!processChatWindow) return;
  const topic = processChatTopics[topicName] || processChatTopics.deposit;
  const shouldAddTopicMessage = currentProcessChatTopic !== topicName || processChatWindow.classList.contains("is-hidden");
  currentProcessChatTopic = topicName;
  processChatTitle.textContent = topic.title;
  processChatSubtitle.textContent = topic.subtitle;
  processChatWindow.classList.remove("is-hidden");
  processChatLauncher?.classList.add("is-hidden");
  if (shouldAddTopicMessage) appendProcessChatMessage(topic.message);
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

document.querySelector("#processChatForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = processChatInput?.value.trim();
  if (!message) return;
  appendProcessChatMessage(message, { self: true });
  processChatInput.value = "";
});

document.querySelector("#processChatImageInput")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const imageUrl = URL.createObjectURL(file);
  appendProcessChatMessage(`Uploaded image: ${file.name}`, { self: true, imageSrc: imageUrl, imageAlt: file.name });
  event.target.value = "";
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
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
};

const tradeChartState = {
  symbol: "BTCUSD",
  category: "Crypto",
  price: 63971.14,
  changePercent: -21.03,
  timeframe: "M1",
  candles: [],
  tick: 0,
};

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
  return { symbol, category, price, changePercent };
}

function buildTradeCandles({ symbol, price, timeframe }) {
  const seed = hashSymbol(symbol) + timeframeMinutes[timeframe] * 13;
  const spread = Math.max(price * (0.00055 + timeframeMinutes[timeframe] / 900000), 0.006);
  let close = price - Math.sin(seed) * spread * 7;

  return Array.from({ length: 74 }, (_, index) => {
    const wave = Math.sin((index + seed) / 5.7) * spread * 2.4;
    const pressure = Math.cos((index + seed) / 9.1) * spread * 1.8;
    const open = close;
    close = Math.max(0.00001, open + wave + pressure + (index > 55 ? -spread * 0.42 : 0));
    const high = Math.max(open, close) + spread * (1.3 + Math.abs(Math.sin(index + seed)));
    const low = Math.min(open, close) - spread * (1.1 + Math.abs(Math.cos(index + seed)));
    const volume = 28 + Math.abs(Math.sin(index / 3 + seed)) * 70 + (index > 68 ? 65 : 0);
    return { open, high, low: Math.max(0.00001, low), close, volume };
  });
}

function setTradeText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function syncTradeTerminal() {
  const latest = tradeChartState.candles.at(-1);
  if (!latest) return;
  const bid = latest.close - Math.max(latest.close * 0.00000016, 0.01);
  const ask = latest.close + Math.max(latest.close * 0.00000016, 0.01);
  const move = latest.close - tradeChartState.price;
  const moveText = `${move >= 0 ? "+" : ""}${formatTradeNumber(move)} (${tradeChartState.changePercent >= 0 ? "+" : ""}${tradeChartState.changePercent.toFixed(3)}%)`;

  setTradeText("#tradeSymbolName", tradeChartState.symbol);
  setTradeText("#tradeSymbolCategory", tradeChartState.category[0] + tradeChartState.category.slice(1).toLowerCase());
  setTradeText("#tradeSymbolPrice", formatTradeNumber(latest.close));
  setTradeText("#tradeSymbolChange", moveText);
  setTradeText("#tradeOpenValue", formatTradeNumber(latest.open));
  setTradeText("#tradeHighValue", formatTradeNumber(latest.high));
  setTradeText("#tradeLowValue", formatTradeNumber(latest.low));
  setTradeText("#tradeCloseValue", formatTradeNumber(latest.close));
  setTradeText("#tradeBidValue", formatTradeNumber(bid));
  setTradeText("#tradeAskValue", formatTradeNumber(ask));
  setTradeText("#tradeSpreadValue", formatTradeNumber(ask - bid));
  setTradeText("#tradePriceMarker", formatTradeNumber(latest.close));
  setTradeText("#tradeTimeframeLabel", tradeChartState.timeframe);
  document.querySelector("#tradeSymbolChange")?.classList.toggle("positive", tradeChartState.changePercent >= 0);
  document.querySelector("#tradeSymbolChange")?.classList.toggle("danger-text", tradeChartState.changePercent < 0);
}

function renderPriceScale(values) {
  const scale = document.querySelector("#tradePriceScale");
  if (!scale || !values.length) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  scale.innerHTML = Array.from({ length: 6 }, (_, index) => {
    const value = max - ((max - min) / 5) * index;
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

  const candles = tradeChartState.candles.slice(-62);
  const chart = { left: 12, top: 18, right: 64, bottom: 66 };
  const width = rect.width - chart.left - chart.right;
  const height = rect.height - chart.top - chart.bottom;
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  const volumeMax = Math.max(...candles.map((candle) => candle.volume));
  const candleStep = width / candles.length;
  const candleWidth = Math.max(4, Math.min(12, candleStep * 0.58));
  const yFor = (value) => chart.top + ((max - value) / range) * height;

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
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#ffb000";
  ctx.beginPath();
  ctx.moveTo(chart.left, priceY);
  ctx.lineTo(rect.width - chart.right + 8, priceY);
  ctx.stroke();
  ctx.setLineDash([]);

  renderPriceScale([min, max]);
  syncTradeTerminal();
}

function selectTradeSymbol(row) {
  Object.assign(tradeChartState, readTradeRow(row));
  tradeChartState.candles = buildTradeCandles(tradeChartState);
  document.querySelectorAll(".watch-row").forEach((item) => item.classList.toggle("is-selected", item === row));
  renderTradeCandles();
  renderTradeTicket();
}

document.querySelector("#tradeWatchTable")?.addEventListener("click", (event) => {
  const row = event.target.closest(".watch-row");
  if (!row) return;
  selectTradeSymbol(row);
});

document.querySelectorAll(".timeframes button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".timeframes button").forEach((item) => item.classList.toggle("is-active", item === button));
    tradeChartState.timeframe = button.dataset.timeframe || button.textContent.trim();
    tradeChartState.candles = buildTradeCandles(tradeChartState);
    renderTradeCandles();
  });
});

const tradeTicketState = {
  kind: "spot",
  mode: "market",
};

const tradeTicketCopy = {
  spot: {
    note: "Spot order · BTCUSD settlement",
    multiplier: "100",
    lot: "1 Lots = 1 BTCUSD",
    fee: "0.064000",
    margin: "6.400000",
  },
  futures: {
    note: "Futures order · BTCUSD perpetual",
    multiplier: "500",
    lot: "1 Lots = 1 BTCUSD Perp",
    fee: "0.128000",
    margin: "12.800000",
  },
};

function renderTradeTicket() {
  const ticket = tradeTicketCopy[tradeTicketState.kind];
  const isPending = tradeTicketState.mode === "pending";
  const settlement = tradeTicketState.kind === "spot" ? "settlement" : "perpetual";
  const symbol = tradeChartState.symbol;

  document.querySelector("#ticketKindNote").textContent = `${tradeTicketState.kind === "spot" ? "Spot" : "Futures"} order · ${symbol} ${settlement}`;
  document.querySelector("#ticketMultiplier").textContent = ticket.multiplier;
  document.querySelector("#ticketLotValue").textContent = `1 Lots = 1 ${symbol}${tradeTicketState.kind === "futures" ? " Perp" : ""}`;
  document.querySelector("#ticketFeeValue").textContent = ticket.fee;
  document.querySelector("#ticketMarginValue").textContent = ticket.margin;
  document.querySelector("#ticketBalanceValue").textContent = Number(currentSession?.user?.balance || 0).toFixed(2);
  document.querySelector("#ticketModeTitle").textContent = isPending ? "Pending Orders" : "Market Price";
  document.querySelector("#pendingOrderFields").classList.toggle("is-hidden", !isPending);
  document.querySelector("#buyOrderButton").textContent = isPending ? "Place Buy" : "Buy";
  document.querySelector("#sellOrderButton").textContent = isPending ? "Place Sell" : "Sell";
}

document.querySelectorAll("[data-ticket-kind]").forEach((button) => {
  button.addEventListener("click", () => {
    tradeTicketState.kind = button.dataset.ticketKind;
    document.querySelectorAll("[data-ticket-kind]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderTradeTicket();
  });
});

document.querySelectorAll("[data-order-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    tradeTicketState.mode = button.dataset.orderMode;
    document.querySelectorAll("[data-order-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderTradeTicket();
  });
});

function tickTradeCandles() {
  if (!tradeChartState.candles.length) return;
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
    tradeChartState.candles.push({
      open,
      high: open + scale * 1.8,
      low: Math.max(0.00001, open - scale * 1.6),
      close: Math.max(0.00001, open + (Math.random() - 0.52) * scale * 2.4),
      volume: 34 + Math.random() * 55,
    });
    tradeChartState.candles = tradeChartState.candles.slice(-84);
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
  } catch {
    clearSession();
  }
  updateRoleAccess();
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
