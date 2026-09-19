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

const allowedSymbols = (process.env.ALLOWED_SYMBOLS || "XAU/USD,XAG/USD,BTC/USD,EUR/USD,GBP/USD,USOIL")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);

const defaultInstruments = [
  { symbol: "XAU/USD", displayName: "Gold / US Dollar", category: "metals", enabled: true, tradeEnabled: true },
  { symbol: "XAG/USD", displayName: "Silver / US Dollar", category: "metals", enabled: true, tradeEnabled: true },
  { symbol: "BTC/USD", displayName: "Bitcoin / US Dollar", category: "crypto", enabled: true, tradeEnabled: true },
  { symbol: "EUR/USD", displayName: "Euro / US Dollar", category: "forex", enabled: true, tradeEnabled: false },
  { symbol: "GBP/USD", displayName: "British Pound / US Dollar", category: "forex", enabled: true, tradeEnabled: false },
  { symbol: "USOIL", displayName: "Crude Oil WTI", category: "commodities", enabled: true, tradeEnabled: true },
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

async function createUser({ email, password, name, role = "user", referredBy = null }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  if (pool) {
    const rows = await query(
      `INSERT INTO users (email, password_hash, name, role, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [email, passwordHash, name, role, referralCode, referredBy],
    );
    return normalizeUser(rows[0]);
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    name,
    role,
    referralCode,
    referredBy,
    kycStatus: "pending",
    balance: 0,
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

async function listInstruments({ tradeOnly = false } = {}) {
  if (pool) {
    const rows = await query(
      `SELECT * FROM instruments
       WHERE enabled = true ${tradeOnly ? "AND trade_enabled = true" : ""}
       ORDER BY category, symbol`,
    );
    return rows.map(normalizeInstrument);
  }
  return memory.instruments.filter((instrument) => instrument.enabled && (!tradeOnly || instrument.tradeEnabled));
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
    for (const instrument of defaultInstruments) await upsertInstrument(instrument);
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

app.get("/api/markets/quotes", async (request, response) => {
  const requestedSymbols = String(request.query.symbols || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const tradableSymbols = new Set((await listInstruments({ tradeOnly: true })).map((instrument) => instrument.symbol));
  const symbols = requestedSymbols.filter((symbol) => tradableSymbols.has(symbol));
  if (!symbols.length) return response.status(400).json({ error: "No allowed symbols requested" });

  const provider = process.env.MARKET_DATA_PROVIDER || "mock";
  const key = process.env.MARKET_DATA_API_KEY;
  if (provider === "twelvedata" && key) {
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbols.join(","));
    url.searchParams.set("apikey", key);
    const upstream = await fetch(url);
    const data = await upstream.json();
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
