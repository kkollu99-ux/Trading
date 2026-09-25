require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 4173);
const jwtSecret = process.env.JWT_SECRET || "dev-only-secret-change-me";
const rootDir = __dirname;
const uploadDir = path.join(rootDir, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_request, file, done) => {
      const ext = path.extname(file.originalname).toLowerCase();
      done(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_request, file, done) => {
    done(null, file.mimetype.startsWith("image/"));
  },
});

const defaultAllowedSymbols = [
  "XAU/USD", "XAG/USD", "BTC/USD", "EUR/USD", "GBP/USD", "USOIL",
  "AUD/JPY", "AUD/CAD", "EUR/JPY", "AUD/NZD", "AUD/CHF", "USD/JPY", "AUD/USD", "GBP/JPY", "EUR/AUD",
  "CAD/JPY", "EUR/CAD", "GBP/AUD", "CHF/JPY", "EUR/CHF", "GBP/CAD", "NZD/USD", "NZD/CHF", "GBP/NZD",
  "USD/CHF", "USD/CAD", "EUR/GBP", "NZD/JPY", "GBP/CHF", "CAD/CHF", "EUR/NZD",
  "XRP/USD", "ETH/USD", "SOL/USDC", "BNB/USD",
  "AAPL", "TSLA", "GOOGL", "MSFT",
  "UKOIL", "NATGAS",
].join(",");

const allowedSymbols = (process.env.ALLOWED_SYMBOLS || defaultAllowedSymbols)
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);

const marketDataApiKey =
  process.env.MARKET_DATA_API_KEY ||
  process.env.TWELVEDATA_API_KEY ||
  process.env.TWELVEDATAAPI ||
  process.env.twelvedataAPI ||
  "";

const defaultInstruments = [
  { symbol: "XAU/USD", displayName: "Gold / US Dollar", category: "metals", enabled: true, tradeEnabled: true },
  { symbol: "XAG/USD", displayName: "Silver / US Dollar", category: "metals", enabled: true, tradeEnabled: true },
  { symbol: "BTC/USD", displayName: "Bitcoin / US Dollar", category: "crypto", enabled: true, tradeEnabled: true },
  { symbol: "EUR/USD", displayName: "Euro / US Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "GBP/USD", displayName: "British Pound / US Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "USOIL", displayName: "Crude Oil WTI", category: "commodities", enabled: true, tradeEnabled: true },
  { symbol: "AUD/JPY", displayName: "Australian Dollar / Japanese Yen", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "AUD/CAD", displayName: "Australian Dollar / Canadian Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "EUR/JPY", displayName: "Euro / Japanese Yen", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "AUD/NZD", displayName: "Australian Dollar / New Zealand Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "AUD/CHF", displayName: "Australian Dollar / Swiss Franc", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "USD/JPY", displayName: "US Dollar / Japanese Yen", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "AUD/USD", displayName: "Australian Dollar / US Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "GBP/JPY", displayName: "British Pound / Japanese Yen", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "EUR/AUD", displayName: "Euro / Australian Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "CAD/JPY", displayName: "Canadian Dollar / Japanese Yen", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "EUR/CAD", displayName: "Euro / Canadian Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "GBP/AUD", displayName: "British Pound / Australian Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "CHF/JPY", displayName: "Swiss Franc / Japanese Yen", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "EUR/CHF", displayName: "Euro / Swiss Franc", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "GBP/CAD", displayName: "British Pound / Canadian Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "NZD/USD", displayName: "New Zealand Dollar / US Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "NZD/CHF", displayName: "New Zealand Dollar / Swiss Franc", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "GBP/NZD", displayName: "British Pound / New Zealand Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "USD/CHF", displayName: "US Dollar / Swiss Franc", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "USD/CAD", displayName: "US Dollar / Canadian Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "EUR/GBP", displayName: "Euro / British Pound", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "NZD/JPY", displayName: "New Zealand Dollar / Japanese Yen", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "GBP/CHF", displayName: "British Pound / Swiss Franc", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "CAD/CHF", displayName: "Canadian Dollar / Swiss Franc", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "EUR/NZD", displayName: "Euro / New Zealand Dollar", category: "forex", enabled: true, tradeEnabled: true },
  { symbol: "XRP/USD", displayName: "XRP / US Dollar", category: "crypto", enabled: true, tradeEnabled: true },
  { symbol: "ETH/USD", displayName: "Ethereum / US Dollar", category: "crypto", enabled: true, tradeEnabled: true },
  { symbol: "SOL/USDC", displayName: "Solana / USD Coin", category: "crypto", enabled: true, tradeEnabled: true },
  { symbol: "BNB/USD", displayName: "BNB / US Dollar", category: "crypto", enabled: true, tradeEnabled: true },
  { symbol: "AAPL", displayName: "Apple Inc.", category: "stocks", enabled: true, tradeEnabled: true },
  { symbol: "TSLA", displayName: "Tesla Inc.", category: "stocks", enabled: true, tradeEnabled: true },
  { symbol: "GOOGL", displayName: "Alphabet Inc.", category: "stocks", enabled: true, tradeEnabled: true },
  { symbol: "MSFT", displayName: "Microsoft Corporation", category: "stocks", enabled: true, tradeEnabled: true },
  { symbol: "UKOIL", displayName: "Crude Oil Brent", category: "commodities", enabled: true, tradeEnabled: true },
  { symbol: "NATGAS", displayName: "Natural Gas", category: "commodities", enabled: true, tradeEnabled: true },
].filter((instrument) => allowedSymbols.includes(instrument.symbol));

const memory = {
  users: [],
  instruments: defaultInstruments.map((instrument) => ({ id: crypto.randomUUID(), ...instrument })),
  serviceRequests: [],
  chatMessages: [],
};

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("railway.internal") ? false : { rejectUnauthorized: false },
  });
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: "7d" });
}

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status || "active",
    referralCode: row.referral_code || row.referralCode,
    referredBy: row.referred_by || row.referredBy,
    kycStatus: row.kyc_status || row.kycStatus,
    balance: Number(row.balance || 0),
    passwordHash: row.password_hash || row.passwordHash,
    createdAt: row.created_at || row.createdAt,
  };
}

function normalizeInstrument(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    displayName: row.display_name || row.displayName,
    category: row.category,
    enabled: Boolean(row.enabled),
    tradeEnabled: Boolean(row.trade_enabled ?? row.tradeEnabled),
  };
}

async function query(text, params = []) {
  if (!pool) return null;
  const result = await pool.query(text, params);
  return result.rows;
}

async function findUserByEmail(email) {
  if (pool) {
    const rows = await query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [email]);
    return normalizeUser(rows[0]);
  }
  return memory.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findUserById(id) {
  if (pool) {
    const rows = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
    return normalizeUser(rows[0]);
  }
  return memory.users.find((user) => user.id === id) || null;
}

async function createUser({ email, password, name, role = "user", referredBy = null, kycStatus = "pending", balance = 0, status = "active" }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  if (pool) {
    const rows = await query(
      `INSERT INTO users (email, password_hash, name, role, status, referral_code, referred_by, kyc_status, balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [email, passwordHash, name, role, status, referralCode, referredBy, kycStatus, balance],
    );
    return normalizeUser(rows[0]);
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    name,
    role,
    status,
    referralCode,
    referredBy,
    kycStatus,
    balance,
    createdAt: new Date().toISOString(),
  };
  memory.users.push(user);
  return user;
}

async function listUsers() {
  if (pool) {
    const rows = await query("SELECT * FROM users ORDER BY created_at DESC");
    return rows.map(normalizeUser);
  }
  return [...memory.users].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function listInvites(user) {
  if (pool) {
    const rows = await query("SELECT * FROM users WHERE referred_by = $1 ORDER BY created_at DESC", [user.referralCode]);
    return rows.map(normalizeUser);
  }
  return memory.users.filter((item) => item.referredBy === user.referralCode);
}

function normalizeManagedUserPatch(body) {
  const patch = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.role !== undefined) patch.role = String(body.role).toLowerCase();
  if (body.status !== undefined) patch.status = String(body.status).toLowerCase();
  if (body.kycStatus !== undefined) patch.kycStatus = String(body.kycStatus).toLowerCase();
  if (body.balance !== undefined) patch.balance = Number(body.balance);
  return patch;
}

function validateManagedUserPatch(patch) {
  if (patch.name !== undefined && !patch.name) return "Name is required";
  if (patch.role !== undefined && !["admin", "team", "user"].includes(patch.role)) return "Invalid role";
  if (patch.status !== undefined && !["active", "pending", "suspended"].includes(patch.status)) return "Invalid status";
  if (patch.kycStatus !== undefined && !["pending", "verified", "rejected"].includes(patch.kycStatus)) return "Invalid KYC status";
  if (patch.balance !== undefined && (!Number.isFinite(patch.balance) || patch.balance < 0)) return "Invalid balance";
  return null;
}

async function updateUser(id, patch) {
  if (pool) {
    const rows = await query(
      `UPDATE users
       SET name = COALESCE($2, name),
           role = COALESCE($3, role),
           status = COALESCE($4, status),
           kyc_status = COALESCE($5, kyc_status),
           balance = COALESCE($6, balance)
       WHERE id = $1
       RETURNING *`,
      [id, patch.name ?? null, patch.role ?? null, patch.status ?? null, patch.kycStatus ?? null, patch.balance ?? null],
    );
    return normalizeUser(rows[0]);
  }

  const user = memory.users.find((item) => item.id === id);
  if (!user) return null;
  Object.assign(user, patch);
  return user;
}

async function listInstruments({ tradeOnly = false, includeDisabled = false } = {}) {
  if (pool) {
    const rows = await query(
      `SELECT * FROM instruments
       WHERE ${includeDisabled ? "true" : "enabled = true"} ${tradeOnly ? "AND trade_enabled = true" : ""}
       ORDER BY category, symbol`,
    );
    return rows.map(normalizeInstrument);
  }
  return memory.instruments.filter((instrument) => (includeDisabled || instrument.enabled) && (!tradeOnly || instrument.tradeEnabled));
}

async function upsertInstrument(instrument) {
  if (pool) {
    const rows = await query(
      `INSERT INTO instruments (symbol, display_name, category, enabled, trade_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (symbol) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           category = EXCLUDED.category,
           enabled = EXCLUDED.enabled,
           trade_enabled = EXCLUDED.trade_enabled
       RETURNING *`,
      [instrument.symbol, instrument.displayName, instrument.category, instrument.enabled, instrument.tradeEnabled],
    );
    return normalizeInstrument(rows[0]);
  }
  const existing = memory.instruments.find((item) => item.symbol === instrument.symbol);
  if (existing) Object.assign(existing, instrument);
  else memory.instruments.push({ id: crypto.randomUUID(), ...instrument });
  return existing || memory.instruments.at(-1);
}

async function seedInstrument(instrument) {
  if (pool) {
    const rows = await query(
      `INSERT INTO instruments (symbol, display_name, category, enabled, trade_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (symbol) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           category = EXCLUDED.category
       RETURNING *`,
      [instrument.symbol, instrument.displayName, instrument.category, instrument.enabled, instrument.tradeEnabled],
    );
    return normalizeInstrument(rows[0]);
  }
  const existing = memory.instruments.find((item) => item.symbol === instrument.symbol);
  if (existing) {
    existing.displayName = instrument.displayName;
    existing.category = instrument.category;
    return existing;
  }
  memory.instruments.push({ id: crypto.randomUUID(), ...instrument });
  return memory.instruments.at(-1);
}

async function createServiceRequest({ userId, type, amount, note, attachmentUrl }) {
  if (pool) {
    const rows = await query(
      `INSERT INTO service_requests (user_id, type, amount, note, attachment_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, amount || null, note || null, attachmentUrl || null],
    );
    return rows[0];
  }
  const request = {
    id: crypto.randomUUID(),
    user_id: userId,
    type,
    amount: amount || null,
    status: "pending",
    note: note || null,
    attachment_url: attachmentUrl || null,
    created_at: new Date().toISOString(),
  };
  memory.serviceRequests.push(request);
  return request;
}

async function listServiceRequests(user) {
  if (pool) {
    const rows =
      user.role === "user"
        ? await query("SELECT * FROM service_requests WHERE user_id = $1 ORDER BY created_at DESC", [user.id])
        : await query("SELECT * FROM service_requests ORDER BY created_at DESC");
    return rows;
  }
  return memory.serviceRequests.filter((request) => user.role !== "user" || request.user_id === user.id);
}

async function createChatMessage({ requestId, senderId, body, attachmentUrl }) {
  if (pool) {
    const rows = await query(
      `INSERT INTO chat_messages (request_id, sender_id, body, attachment_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [requestId, senderId, body, attachmentUrl || null],
    );
    return rows[0];
  }
  const message = {
    id: crypto.randomUUID(),
    request_id: requestId,
    sender_id: senderId,
    body,
    attachment_url: attachmentUrl || null,
    created_at: new Date().toISOString(),
  };
  memory.chatMessages.push(message);
  return message;
}

async function listChatMessages(requestId) {
  if (pool) {
    return query("SELECT * FROM chat_messages WHERE request_id = $1 ORDER BY created_at ASC", [requestId]);
  }
  return memory.chatMessages.filter((message) => message.request_id === requestId);
}

function requireAuth(request, response, next) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return response.status(401).json({ error: "Missing auth token" });
  try {
    request.auth = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return response.status(401).json({ error: "Invalid auth token" });
  }
}

async function attachUser(request, response, next) {
  const user = await findUserById(request.auth.sub);
  if (!user) return response.status(401).json({ error: "User not found" });
  request.user = user;
  return next();
}

function requireRole(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user.role)) return response.status(403).json({ error: "Forbidden" });
    return next();
  };
}

async function seedDefaults() {
  if (pool) {
    await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    const schemaPath = path.join(rootDir, "db", "schema.sql");
    await query(fs.readFileSync(schemaPath, "utf8"));
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
    for (const instrument of defaultInstruments) await seedInstrument(instrument);
  }

  if (!(await findUserByEmail("admin@fxcc.capital"))) {
    await createUser({ email: "admin@fxcc.capital", password: "Admin@12345", name: "FXCC Admin", role: "admin" });
  }
  if (!(await findUserByEmail("support@fxcc.capital"))) {
    await createUser({ email: "support@fxcc.capital", password: "Support@12345", name: "Online Service", role: "team" });
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, database: pool ? "postgres" : "memory" });
});

app.post("/api/auth/register", async (request, response) => {
  const { email, password, name, referralCode } = request.body;
  if (!email || !password) return response.status(400).json({ error: "Email and password are required" });
  if (await findUserByEmail(email)) return response.status(409).json({ error: "Email already registered" });
  const user = await createUser({ email, password, name: name || email.split("@")[0], referredBy: referralCode || null });
  response.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body;
  const user = await findUserByEmail(email || "");
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return response.status(401).json({ error: "Invalid email or password" });
  }
  response.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/me", requireAuth, attachUser, (request, response) => {
  response.json({ user: publicUser(request.user) });
});

app.get("/api/admin/users", requireAuth, attachUser, requireRole("admin", "team"), async (_request, response) => {
  const users = await listUsers();
  response.json({ users: users.map(publicUser) });
});

app.post("/api/admin/users", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const password = String(request.body.password || "Client@12345");
  const patch = normalizeManagedUserPatch(request.body);
  const validationError = validateManagedUserPatch(patch);
  if (!email || !patch.name) return response.status(400).json({ error: "Name and email are required" });
  if (password.length < 6) return response.status(400).json({ error: "Password must be at least 6 characters" });
  if (validationError) return response.status(400).json({ error: validationError });
  if (await findUserByEmail(email)) return response.status(409).json({ error: "Email already registered" });

  const user = await createUser({
    email,
    password,
    name: patch.name,
    role: patch.role || "user",
    status: patch.status || "active",
    kycStatus: patch.kycStatus || "pending",
    balance: patch.balance || 0,
  });
  response.status(201).json({ user: publicUser(user), temporaryPassword: password });
});

app.patch("/api/admin/users/:id", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const patch = normalizeManagedUserPatch(request.body);
  const validationError = validateManagedUserPatch(patch);
  if (validationError) return response.status(400).json({ error: validationError });

  const user = await updateUser(request.params.id, patch);
  if (!user) return response.status(404).json({ error: "User not found" });
  response.json({ user: publicUser(user) });
});

app.get("/api/referrals", requireAuth, attachUser, async (request, response) => {
  const invited = await listInvites(request.user);
  response.json({ invited: invited.map(publicUser) });
});

app.get("/api/instruments", async (_request, response) => {
  response.json({ instruments: await listInstruments() });
});

app.get("/api/tradable-instruments", async (_request, response) => {
  response.json({ instruments: await listInstruments({ tradeOnly: true }) });
});

app.get("/api/admin/instruments", requireAuth, attachUser, requireRole("admin", "team"), async (_request, response) => {
  response.json({ instruments: await listInstruments({ includeDisabled: true }) });
});

app.post("/api/admin/instruments", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const { symbol, displayName, category, enabled = true, tradeEnabled = true } = request.body;
  if (!symbol || !displayName || !category) return response.status(400).json({ error: "symbol, displayName, and category are required" });
  const instrument = await upsertInstrument({
    symbol: String(symbol).toUpperCase(),
    displayName,
    category,
    enabled: Boolean(enabled),
    tradeEnabled: Boolean(tradeEnabled),
  });
  response.status(201).json({ instrument });
});

const quoteCacheTtlMs = 4000;
const quoteCache = new Map();

app.get("/api/markets/quotes", async (request, response) => {
  const requestedSymbols = String(request.query.symbols || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const tradableSymbols = new Set((await listInstruments({ tradeOnly: true })).map((instrument) => instrument.symbol));
  const symbols = requestedSymbols.filter((symbol) => tradableSymbols.has(symbol));
  if (!symbols.length) return response.status(400).json({ error: "No allowed symbols requested" });

  const provider = process.env.MARKET_DATA_PROVIDER || "mock";
  const key = marketDataApiKey;
  if (provider === "twelvedata" && key) {
    const cacheKey = [...symbols].sort().join(",");
    const cached = quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.at < quoteCacheTtlMs) {
      return response.json({ provider, symbols, data: cached.data, cached: true });
    }

    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbols.join(","));
    url.searchParams.set("apikey", key);
    const upstream = await fetch(url);
    const data = await upstream.json();
    quoteCache.set(cacheKey, { data, at: Date.now() });
    return response.json({ provider, symbols, data });
  }

  const data = Object.fromEntries(
    symbols.map((symbol, index) => [
      symbol,
      {
        symbol,
        price: Number((100 + index * 17 + Math.random() * 4).toFixed(2)),
        changePercent: Number(((Math.random() - 0.5) * 2).toFixed(2)),
        timestamp: new Date().toISOString(),
        simulated: true,
      },
    ]),
  );
  response.json({ provider: "mock", symbols, data });
});

app.post("/api/service-requests", requireAuth, attachUser, upload.single("attachment"), async (request, response) => {
  const { type, amount, note } = request.body;
  if (!["deposit", "withdrawal", "kyc"].includes(type)) return response.status(400).json({ error: "Invalid request type" });
  const attachmentUrl = request.file ? `/uploads/${request.file.filename}` : null;
  const serviceRequest = await createServiceRequest({ userId: request.user.id, type, amount, note, attachmentUrl });
  response.status(201).json({ serviceRequest });
});

app.get("/api/service-requests", requireAuth, attachUser, async (request, response) => {
  response.json({ serviceRequests: await listServiceRequests(request.user) });
});

app.get("/api/service-requests/:id/messages", requireAuth, attachUser, async (request, response) => {
  response.json({ messages: await listChatMessages(request.params.id) });
});

app.post("/api/service-requests/:id/messages", requireAuth, attachUser, upload.single("attachment"), async (request, response) => {
  const attachmentUrl = request.file ? `/uploads/${request.file.filename}` : null;
  const message = await createChatMessage({
    requestId: request.params.id,
    senderId: request.user.id,
    body: request.body.body || "",
    attachmentUrl,
  });
  broadcast({ type: "chat.message", message });
  response.status(201).json({ message });
});

app.use(express.static(rootDir));
app.get("*", (_request, response) => {
  response.sendFile(path.join(rootDir, "index.html"));
});

const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(message);
  });
}

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "connected", message: "FXCC realtime channel connected" }));
});

seedDefaults()
  .then(() => {
    server.listen(port, () => {
      console.log(`FXCC platform running on http://127.0.0.1:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start FXCC platform", error);
    process.exit(1);
  });
