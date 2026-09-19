const homeView = document.querySelector("#homeView");
const loginView = document.querySelector("#loginView");
const registerView = document.querySelector("#registerView");
const appView = document.querySelector("#appView");
const sectionTitle = document.querySelector("#sectionTitle");
const navItems = [...document.querySelectorAll(".nav-item")];
const sections = [...document.querySelectorAll(".view-section")];

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
  navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.section === id));
  sections.forEach((section) => section.classList.toggle("is-active", section.id === id));
  if (sectionTitle) {
    sectionTitle.textContent = getNavLabel(navItems.find((item) => item.dataset.section === id)) || "Home";
  }
  drawCharts();
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

function enterWorkspace() {
  homeView.classList.add("is-hidden");
  loginView.classList.add("is-hidden");
  registerView.classList.add("is-hidden");
  appView.classList.remove("is-hidden");
  drawCharts();
  updateDashboardTime();
}

function updateDashboardTime() {
  const time = document.querySelector("#dashboardTime");
  if (!time) return;
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  enterWorkspace();
});

document.querySelector("#signOut").addEventListener("click", () => {
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
  try {
    await navigator.clipboard.writeText("42686700");
    button.textContent = "✓ Copied";
  } catch {
    button.textContent = "42686700";
  }
  setTimeout(() => {
    button.textContent = "▣ Copy";
  }, 1200);
});

const invitedFriends = [
  { name: "harsha.trader@gmail.com", date: "Joined Jul 07, 2026", status: "Active", initial: "H", positive: true },
  { name: "kkollu99@gmail.com", date: "Joined Sep 16, 2026", status: "Verified", initial: "K", positive: true },
  { name: "sai.capital@gmail.com", date: "Invite sent", status: "Pending", initial: "S" },
  { name: "arjun.metals@gmail.com", date: "Joined Sep 18, 2026", status: "Active", initial: "A", positive: true },
  { name: "meera.trade@gmail.com", date: "Joined Sep 19, 2026", status: "Verified", initial: "M", positive: true },
  { name: "vijayfx@gmail.com", date: "Invite sent", status: "Pending", initial: "V" },
  { name: "neha.capital@gmail.com", date: "Joined Sep 20, 2026", status: "Active", initial: "N", positive: true },
  { name: "rohit.gold@gmail.com", date: "Invite opened", status: "Pending", initial: "R" },
  { name: "diya.market@gmail.com", date: "Joined Sep 20, 2026", status: "Verified", initial: "D", positive: true },
];

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

document.querySelector("#registerForm").addEventListener("submit", (event) => {
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
  users = [
    {
      name: String(email).split("@")[0] || "New Client",
      email,
      tier: data.get("referral") ? "Referred" : "Standard",
      status: "Active",
      exposure: "$0",
    },
    ...users,
  ];
  renderUsers();
  event.target.reset();
  enterWorkspace();
});

navItems.forEach((item) => item.addEventListener("click", () => moveSection(item.dataset.section)));

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

document.querySelectorAll(".instrument-row button").forEach((button) => {
  button.addEventListener("click", () => {
    moveSection("trade");
    button.textContent = "Opening";
    window.setTimeout(() => {
      button.textContent = "Trade";
    }, 900);
  });
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

document.querySelectorAll(".watch-row").forEach((row) => {
  row.addEventListener("click", () => {
    document.querySelectorAll(".watch-row").forEach((item) => item.classList.toggle("is-selected", item === row));
  });
});

document.querySelectorAll(".timeframes button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".timeframes button").forEach((item) => item.classList.toggle("is-active", item === button));
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
    balance: "389201.37",
  },
  futures: {
    note: "Futures order · BTCUSD perpetual",
    multiplier: "500",
    lot: "1 Lots = 1 BTCUSD Perp",
    fee: "0.128000",
    margin: "12.800000",
    balance: "389201.37",
  },
};

function renderTradeTicket() {
  const ticket = tradeTicketCopy[tradeTicketState.kind];
  const isPending = tradeTicketState.mode === "pending";

  document.querySelector("#ticketKindNote").textContent = ticket.note;
  document.querySelector("#ticketMultiplier").textContent = ticket.multiplier;
  document.querySelector("#ticketLotValue").textContent = ticket.lot;
  document.querySelector("#ticketFeeValue").textContent = ticket.fee;
  document.querySelector("#ticketMarginValue").textContent = ticket.margin;
  document.querySelector("#ticketBalanceValue").textContent = ticket.balance;
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

renderTradeTicket();

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

seedMetalData();
renderTickers();
renderBook();
renderActivity();
renderTeam();
renderUsers();
renderChat();
drawCharts();
setInterval(tickMarkets, 1500);
setInterval(updateDashboardTime, 1000);
