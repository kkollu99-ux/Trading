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
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 4173);
const jwtSecret = process.env.JWT_SECRET || "dev-only-secret-change-me";
const rootDir = __dirname;
const uploadDir = path.join(rootDir, "uploads");
// Changes every deploy (the whole process restarts), so a long-lived
// browser tab can tell its own already-loaded code apart from whatever the
// server is serving now - see the client's startVersionCheck().
const buildId = String(Date.now());

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
  orders: [],
  ledger: [],
  kycSubmissions: [],
  bankAccounts: [],
  auditLogs: [],
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
    marginUsed: Number(row.margin_used ?? row.marginUsed ?? 0),
    preferences: row.preferences || {},
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

// `client` lets a caller run this inside an existing transaction (see
// withUserLock) instead of a fresh pool connection.
async function query(text, params = [], client = null) {
  const runner = client || pool;
  if (!runner) return null;
  const result = await runner.query(text, params);
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
    marginUsed: 0,
    preferences: {},
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
  return patch;
}

function validateManagedUserPatch(patch) {
  if (patch.name !== undefined && !patch.name) return "Name is required";
  if (patch.role !== undefined && !["admin", "user"].includes(patch.role)) return "Invalid role";
  if (patch.status !== undefined && !["active", "pending", "suspended"].includes(patch.status)) return "Invalid status";
  if (patch.kycStatus !== undefined && !["pending", "verified", "rejected"].includes(patch.kycStatus)) return "Invalid KYC status";
  return null;
}

// Handles name/role/status/kycStatus only - never balance. Balance only ever
// moves through withUserLock + a ledger entry (deposit, withdrawal, order
// margin/P&L), so every change is atomic, audited, and race-safe. This blind
// COALESCE overwrite would bypass all of that.
async function updateUser(id, patch) {
  if (pool) {
    const rows = await query(
      `UPDATE users
       SET name = COALESCE($2, name),
           role = COALESCE($3, role),
           status = COALESCE($4, status),
           kyc_status = COALESCE($5, kyc_status)
       WHERE id = $1
       RETURNING *`,
      [id, patch.name ?? null, patch.role ?? null, patch.status ?? null, patch.kycStatus ?? null],
    );
    return normalizeUser(rows[0]);
  }

  const user = memory.users.find((item) => item.id === id);
  if (!user) return null;
  Object.assign(user, patch);
  return user;
}

// Shallow-merges `patch` into the user's stored preferences (jsonb || jsonb
// in Postgres, Object.assign in memory mode) rather than replacing the
// whole blob, so a client only ever needs to send the keys it's changing -
// e.g. just { displayCurrency: "EUR" } - without first reading back and
// resending every other preference already set.
async function updateUserPreferences(id, patch) {
  if (pool) {
    const rows = await query(
      `UPDATE users SET preferences = preferences || $2::jsonb WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(patch)],
    );
    return normalizeUser(rows[0]);
  }
  const user = memory.users.find((item) => item.id === id);
  if (!user) return null;
  user.preferences = { ...(user.preferences || {}), ...patch };
  return user;
}

// Runs `fn(user, client)` with the user's row locked for the duration of a
// single DB transaction (Postgres: SELECT ... FOR UPDATE inside BEGIN/COMMIT),
// so a deposit, an order open, and an order close can never race each other
// into an inconsistent balance. In memory mode there's no real concurrency
// (Node is single-threaded and fn never awaits between reading and writing
// the user object), so it just runs fn directly against the live record.
// fn should return { error, status } to abort/rollback, or its own result.
async function withUserLock(userId, fn) {
  if (!pool) {
    const user = memory.users.find((item) => item.id === userId);
    if (!user) return { error: "User not found", status: 404 };
    return fn({ ...user }, null);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return { error: "User not found", status: 404 };
    }
    const result = await fn(normalizeUser(rows[0]), client);
    if (result.error) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function setUserWallet(userId, { balance, marginUsed }, client = null) {
  if (pool) {
    await query(
      "UPDATE users SET balance = COALESCE($2, balance), margin_used = COALESCE($3, margin_used) WHERE id = $1",
      [userId, balance ?? null, marginUsed ?? null],
      client,
    );
    return;
  }
  const user = memory.users.find((item) => item.id === userId);
  if (!user) return;
  if (balance !== undefined) user.balance = balance;
  if (marginUsed !== undefined) user.marginUsed = marginUsed;
}

async function insertLedgerEntry({ userId, type, amount, balanceBefore, balanceAfter, referenceId = null, createdBy = null }, client = null) {
  if (pool) {
    const rows = await query(
      `INSERT INTO ledger (user_id, type, amount, balance_before, balance_after, reference_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, type, amount, balanceBefore, balanceAfter, referenceId, createdBy],
      client,
    );
    return rows[0];
  }
  const entry = {
    id: crypto.randomUUID(),
    user_id: userId,
    type,
    amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    reference_id: referenceId,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  memory.ledger.push(entry);
  return entry;
}

async function listLedgerEntries(userId) {
  if (pool) {
    return query("SELECT * FROM ledger WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
  }
  return memory.ledger.filter((entry) => entry.user_id === userId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function normalizeAuditLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    action: row.action,
    actorId: row.actor_id ?? row.actorId ?? null,
    actorLabel: row.actor_label ?? row.actorLabel ?? null,
    targetLabel: row.target_label ?? row.targetLabel ?? null,
    details: row.details ?? null,
    createdAt: row.created_at || row.createdAt,
  };
}

// The single write path for the admin audit trail - every call site below
// just describes what happened (category/action/actor/target/details) and
// this takes care of persisting it consistently across the pool/memory
// split. Never awaited by its caller's response path in a way that could
// fail the request: logging a mistake shouldn't block the action itself,
// so callers fire this after the real work has already succeeded.
async function logEvent({ category, action, actorId = null, actorLabel = null, targetLabel = null, details = null }) {
  try {
    if (pool) {
      await query(
        `INSERT INTO audit_logs (category, action, actor_id, actor_label, target_label, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [category, action, actorId, actorLabel, targetLabel, details ? JSON.stringify(details) : null],
      );
      return;
    }
    memory.auditLogs.push({
      id: crypto.randomUUID(),
      category,
      action,
      actor_id: actorId,
      actor_label: actorLabel,
      target_label: targetLabel,
      details: details ?? null,
      created_at: new Date().toISOString(),
    });
    // Unbounded growth would eventually eat the whole process's memory on a
    // long-lived in-memory deployment - keep only the most recent slice,
    // same tradeoff the live price-tick buffers elsewhere already make.
    if (memory.auditLogs.length > 5000) memory.auditLogs = memory.auditLogs.slice(-5000);
  } catch (error) {
    console.warn("logEvent failed:", error.message);
  }
}

async function listAuditLogs({ category, limit = 100 } = {}) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  if (pool) {
    const rows = await query(
      `SELECT * FROM audit_logs WHERE ($1::text IS NULL OR category = $1) ORDER BY created_at DESC LIMIT $2`,
      [category || null, cappedLimit],
    );
    return rows.map(normalizeAuditLog);
  }
  return memory.auditLogs
    .filter((entry) => !category || entry.category === category)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, cappedLimit)
    .map(normalizeAuditLog);
}

async function recordDeposit({ userId, amount, createdBy }) {
  return withUserLock(userId, async (user, client) => {
    if (user.kycStatus !== "verified") return { error: "User must complete KYC verification before deposits", status: 403 };
    const balanceBefore = user.balance;
    const balanceAfter = Math.round((balanceBefore + amount) * 100) / 100;
    await setUserWallet(userId, { balance: balanceAfter }, client);
    const ledgerEntry = await insertLedgerEntry({ userId, type: "deposit", amount, balanceBefore, balanceAfter, createdBy }, client);
    return { user: { ...user, balance: balanceAfter }, ledgerEntry };
  });
}

async function recordWithdrawal({ userId, amount, createdBy }) {
  return withUserLock(userId, async (user, client) => {
    if (user.kycStatus !== "verified") return { error: "User must complete KYC verification before withdrawals", status: 403 };
    if (user.balance < amount) return { error: "Insufficient balance", status: 400 };
    const balanceBefore = user.balance;
    const balanceAfter = Math.round((balanceBefore - amount) * 100) / 100;
    await setUserWallet(userId, { balance: balanceAfter }, client);
    const ledgerEntry = await insertLedgerEntry({ userId, type: "withdrawal", amount: -amount, balanceBefore, balanceAfter, createdBy }, client);
    return { user: { ...user, balance: balanceAfter }, ledgerEntry };
  });
}

async function createKycSubmission({ userId, documentType, fullName, documentNumber, address, documentImageUrl }) {
  if (pool) {
    const rows = await query(
      `INSERT INTO kyc_submissions (user_id, document_type, full_name, document_number, address, document_image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, documentType, fullName, documentNumber, address, documentImageUrl],
    );
    return rows[0];
  }
  const submission = {
    id: crypto.randomUUID(),
    user_id: userId,
    document_type: documentType,
    full_name: fullName,
    document_number: documentNumber,
    address,
    document_image_url: documentImageUrl,
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    submitted_at: new Date().toISOString(),
  };
  memory.kycSubmissions.push(submission);
  return submission;
}

async function findLatestKycSubmission(userId) {
  if (pool) {
    const rows = await query("SELECT * FROM kyc_submissions WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1", [userId]);
    return rows[0] || null;
  }
  return (
    memory.kycSubmissions
      .filter((item) => item.user_id === userId)
      .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))[0] || null
  );
}

// Keeps the latest submission's own status in sync whenever admin sets
// users.kyc_status via the review action, so the submission record (what the
// admin actually looked at) always matches the outcome.
async function syncLatestKycSubmissionStatus(userId, status, reviewedBy) {
  const latest = await findLatestKycSubmission(userId);
  if (!latest) return null;
  if (pool) {
    const rows = await query(
      "UPDATE kyc_submissions SET status = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1 RETURNING *",
      [latest.id, status, reviewedBy],
    );
    return rows[0] || null;
  }
  latest.status = status;
  latest.reviewed_by = reviewedBy;
  latest.reviewed_at = new Date().toISOString();
  return latest;
}

async function upsertBankAccount({ userId, bankName, accountHolder, accountNumber, ifscSwift }) {
  if (pool) {
    const rows = await query(
      `INSERT INTO bank_accounts (user_id, bank_name, account_holder, account_number, ifsc_swift, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET bank_name = EXCLUDED.bank_name, account_holder = EXCLUDED.account_holder,
           account_number = EXCLUDED.account_number, ifsc_swift = EXCLUDED.ifsc_swift, updated_at = NOW()
       RETURNING *`,
      [userId, bankName, accountHolder, accountNumber, ifscSwift || null],
    );
    return rows[0];
  }
  const existing = memory.bankAccounts.find((item) => item.user_id === userId);
  const record = {
    user_id: userId,
    bank_name: bankName,
    account_holder: accountHolder,
    account_number: accountNumber,
    ifsc_swift: ifscSwift || null,
    updated_at: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, record);
  else memory.bankAccounts.push(record);
  return record;
}

async function findBankAccount(userId) {
  if (pool) {
    const rows = await query("SELECT * FROM bank_accounts WHERE user_id = $1", [userId]);
    return rows[0] || null;
  }
  return memory.bankAccounts.find((item) => item.user_id === userId) || null;
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
  const now = new Date().toISOString();
  const request = {
    id: crypto.randomUUID(),
    user_id: userId,
    type,
    amount: amount || null,
    status: "pending",
    note: note || null,
    attachment_url: attachmentUrl || null,
    created_at: now,
    last_message_at: now,
  };
  memory.serviceRequests.push(request);
  return request;
}

async function listServiceRequests(user) {
  if (pool) {
    const rows =
      user.role === "user"
        ? await query("SELECT * FROM service_requests WHERE user_id = $1 ORDER BY last_message_at DESC", [user.id])
        : await query("SELECT * FROM service_requests ORDER BY last_message_at DESC");
    return rows;
  }
  return memory.serviceRequests.filter((request) => user.role !== "user" || request.user_id === user.id);
}

async function findServiceRequestById(id) {
  if (pool) {
    const rows = await query("SELECT * FROM service_requests WHERE id = $1", [id]);
    return rows[0] || null;
  }
  return memory.serviceRequests.find((request) => request.id === id) || null;
}

async function updateServiceRequestStatus(id, status) {
  if (pool) {
    const rows = await query("UPDATE service_requests SET status = $2 WHERE id = $1 RETURNING *", [id, status]);
    return rows[0] || null;
  }
  const request = memory.serviceRequests.find((item) => item.id === id);
  if (!request) return null;
  request.status = status;
  return request;
}

async function createChatMessage({ requestId, senderId, body, attachmentUrl }) {
  if (pool) {
    const rows = await query(
      `INSERT INTO chat_messages (request_id, sender_id, body, attachment_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [requestId, senderId, body, attachmentUrl || null],
    );
    // Keeps the admin inbox sorted by whichever conversation actually has
    // fresh activity, instead of by whenever the thread was first created -
    // a reply landing in an old thread previously never moved it back to
    // the top, so a brand-new message could sit buried under hours-old rows.
    await query(`UPDATE service_requests SET last_message_at = $2 WHERE id = $1`, [requestId, rows[0].created_at]);
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
  const request = memory.serviceRequests.find((item) => item.id === requestId);
  if (request) request.last_message_at = message.created_at;
  return message;
}

async function listChatMessages(requestId) {
  if (pool) {
    return query("SELECT * FROM chat_messages WHERE request_id = $1 ORDER BY created_at ASC", [requestId]);
  }
  return memory.chatMessages.filter((message) => message.request_id === requestId);
}

async function createOrder({ userId, symbol, direction, lots, multiplier, entryPrice, marginHeld, fee, stopLoss = null, takeProfit = null }, client = null) {
  if (pool) {
    const rows = await query(
      `INSERT INTO orders (user_id, symbol, direction, lots, multiplier, entry_price, margin_held, fee, stop_loss_amount, take_profit_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, symbol, direction, lots, multiplier, entryPrice, marginHeld, fee, stopLoss, takeProfit],
      client,
    );
    return rows[0];
  }
  const order = {
    id: crypto.randomUUID(),
    user_id: userId,
    symbol,
    direction,
    lots,
    multiplier,
    entry_price: entryPrice,
    exit_price: null,
    margin_held: marginHeld,
    fee,
    stop_loss_amount: stopLoss,
    take_profit_amount: takeProfit,
    realized_pnl: null,
    status: "open",
    opened_at: new Date().toISOString(),
    closed_at: null,
  };
  memory.orders.push(order);
  return order;
}

async function listOrders(userId, status) {
  if (pool) {
    const rows = status
      ? await query("SELECT * FROM orders WHERE user_id = $1 AND status = $2 ORDER BY opened_at DESC", [userId, status])
      : await query("SELECT * FROM orders WHERE user_id = $1 ORDER BY opened_at DESC", [userId]);
    return rows;
  }
  return memory.orders
    .filter((order) => order.user_id === userId && (!status || order.status === status))
    .sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
}

async function findOrderById(id) {
  if (pool) {
    const rows = await query("SELECT * FROM orders WHERE id = $1", [id]);
    return rows[0] || null;
  }
  return memory.orders.find((order) => order.id === id) || null;
}

async function listOpenOrdersWithThresholds() {
  if (pool) {
    return query("SELECT * FROM orders WHERE status = 'open' AND (stop_loss_amount IS NOT NULL OR take_profit_amount IS NOT NULL)");
  }
  return memory.orders.filter((order) => order.status === "open" && (order.stop_loss_amount != null || order.take_profit_amount != null));
}

// Conditioned on status = 'open' so two concurrent closers (a manual close
// racing the SL/TP monitor, say) can't both succeed - the loser's UPDATE
// matches zero rows and gets null back instead of double-crediting the wallet.
async function closeOrderRecord(id, { exitPrice, realizedPnl }, client = null) {
  if (pool) {
    const rows = await query(
      `UPDATE orders SET status = 'closed', exit_price = $2, realized_pnl = $3, closed_at = NOW() WHERE id = $1 AND status = 'open' RETURNING *`,
      [id, exitPrice, realizedPnl],
      client,
    );
    return rows[0] || null;
  }
  const order = memory.orders.find((item) => item.id === id && item.status === "open");
  if (!order) return null;
  order.status = "closed";
  order.exit_price = exitPrice;
  order.realized_pnl = realizedPnl;
  order.closed_at = new Date().toISOString();
  return order;
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
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS margin_used NUMERIC(14, 2) NOT NULL DEFAULT 0`);
    // Per-account UI preferences (display currency, sidebar collapsed state,
    // etc.) - a single JSONB blob rather than one column per setting, so a
    // new preference never needs its own migration. Previously only
    // persisted in localStorage, which is per-browser: it survived a
    // refresh but not switching devices or a fresh login on a shared
    // machine, since logging out clears auth state but was never meant to
    // (and doesn't) touch other browsers' localStorage at all.
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stop_loss_amount NUMERIC(14, 2)`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS take_profit_amount NUMERIC(14, 2)`);
    // Lets the admin inbox sort by whichever conversation is actually
    // active, not by whenever the thread happened to be first created.
    // createChatMessage keeps this current going forward; this recompute is
    // what backfills it correctly for rows that already existed before this
    // column did (ADD COLUMN's own DEFAULT NOW() would otherwise leave them
    // all pinned to today, the migration's run time, not their real history)
    // - always recomputed from the actual message history rather than a
    // one-time guess, so it's exactly as correct whether this is the first
    // boot after the migration or the thousandth.
    await query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await query(`
      UPDATE service_requests sr
      SET last_message_at = COALESCE((SELECT MAX(cm.created_at) FROM chat_messages cm WHERE cm.request_id = sr.id), sr.created_at)
    `);
    // "support" used to have no matching request type, so that chat topic
    // never created a real row - it just looked like a working chat while
    // silently never reaching admin. CREATE TABLE IF NOT EXISTS above won't
    // touch an already-existing table's CHECK constraint, so it needs its
    // own migration here.
    await query(`ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_type_check`);
    await query(`ALTER TABLE service_requests ADD CONSTRAINT service_requests_type_check CHECK (type IN ('deposit', 'withdrawal', 'kyc', 'support'))`);
    // The "team" role is gone - admin now handles everything, including
    // Online Service chat, so the placeholder support@fxcc.capital account
    // (never actually used to log in or send a message - confirmed before
    // removing it) goes too. Deleting it before narrowing the CHECK
    // constraint below means that constraint is never violated by a row
    // already sitting in the table.
    await query(`DELETE FROM users WHERE email = 'support@fxcc.capital' AND role = 'team'`);
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'))`);
    for (const instrument of defaultInstruments) await seedInstrument(instrument);
  }

  if (!(await findUserByEmail("admin@fxcc.capital"))) {
    await createUser({ email: "admin@fxcc.capital", password: "Admin@12345", name: "FXCC Admin", role: "admin" });
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, database: pool ? "postgres" : "memory", buildId });
});

// Email OTP verification, gating registration. otpStore is in-memory and
// intentionally not persisted — codes are short-lived (10 min) and losing a
// pending one on a redeploy just means the user asks for a fresh one, same
// as it expiring naturally.
const otpStore = new Map(); // email -> { code, expiresAt, attempts, verified }
const otpExpiryMs = 10 * 60 * 1000;
const otpMaxAttempts = 5;

// Railway (and most PaaS free/hobby tiers) block outbound SMTP entirely to
// prevent spam abuse - see https://docs.railway.com/networking/outbound-networking.
// Their own recommendation, Resend's HTTPS API, isn't subject to that block
// since it's just a regular HTTPS request, so it's tried first; SMTP (e.g. for
// a Pro-plan host, or local dev against a real mail server) is a fallback for
// anyone who's set it up instead, and logging the code server-side is the
// last resort so the flow is still fully testable with neither configured.
const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailTransport = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Some hosts (Railway included) only have IPv4 egress, but SMTP hosts
      // like Gmail's resolve an IPv6 address first - without forcing IPv4
      // here the connection attempt fails with ENETUNREACH before it ever
      // gets to the TLS/auth handshake.
      family: 4,
    })
  : null;

async function sendEmailViaResend({ to, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: emailFrom, to: [to], subject, text, html }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `Resend API error (${response.status})`);
}
// Table-based layout with everything inlined - email clients (Outlook and
// Gmail's own clipping/sanitizing especially) don't reliably support
// external/embedded <style> blocks, flexbox, grid, or CSS variables, so this
// deliberately doesn't reuse the app's own stylesheet or brand-mark markup.
function otpEmailTemplate(code) {
  const subject = "Your FXCC Capitals verification code";
  const text = `Your FXCC Capitals verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can safely ignore this email.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#05080f; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05080f; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background:#0c1424; border:1px solid #1c2434; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0;">
                <span style="display:inline-block; font-size:20px; font-weight:900; letter-spacing:0.06em; color:#ffb000;">FXCC</span>
                <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#7b879d; margin-top:2px;">A Broker On Your Side</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px; color:#e4e9f1; font-size:16px; font-weight:700;">
                Verify your email address
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px; color:#a7b0c0; font-size:14px; line-height:1.6;">
                Enter this code to finish creating your FXCC Capitals account. It expires in 10 minutes.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 28px;">
                <div style="display:inline-block; background:#131722; border:1px solid #ffb000; border-radius:8px; padding:16px 28px; font-size:32px; font-weight:900; letter-spacing:0.35em; color:#ffb000;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px; color:#7b879d; font-size:12px; line-height:1.6; border-top:1px solid #1c2434; padding-top:20px;">
                If you didn't request this code, you can safely ignore this email — no account will be created without it.
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px; background:#080c14; color:#4b5568; font-size:11px; text-align:center;">
                © ${new Date().getFullYear()} FXCC Capitals. This is an automated message — please don't reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}

async function sendOtpEmail(email, code) {
  const { subject, text, html } = otpEmailTemplate(code);
  if (resendApiKey) {
    await sendEmailViaResend({ to: email, subject, text, html });
    return {};
  }
  if (mailTransport) {
    await mailTransport.sendMail({ from: emailFrom, to: email, subject, text, html });
    return {};
  }
  console.log(`[dev] OTP for ${email}: ${code}`);
  return { devOtp: code };
}

app.post("/api/auth/send-otp", async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid email address" });
  if (await findUserByEmail(email)) return response.status(409).json({ error: "Email already registered" });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(email, { code, expiresAt: Date.now() + otpExpiryMs, attempts: 0, verified: false });

  try {
    const extra = await sendOtpEmail(email, code);
    response.json({ sent: true, ...extra });
  } catch (error) {
    otpStore.delete(email);
    console.warn("Failed to send OTP email:", error.message);
    response.status(502).json({ error: "Could not send verification email. Try again shortly." });
  }
});

app.post("/api/auth/verify-otp", (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const code = String(request.body.otp || "").trim();
  const entry = otpStore.get(email);
  if (!entry) return response.status(400).json({ error: "Request a verification code first" });
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email);
    return response.status(400).json({ error: "Code expired — request a new one" });
  }
  if (entry.attempts >= otpMaxAttempts) {
    otpStore.delete(email);
    return response.status(429).json({ error: "Too many attempts — request a new code" });
  }
  entry.attempts += 1;
  if (code !== entry.code) return response.status(400).json({ error: "Incorrect code" });
  entry.verified = true;
  response.json({ verified: true });
});

app.post("/api/auth/register", async (request, response) => {
  const { email, password, name, referralCode } = request.body;
  if (!email || !password) return response.status(400).json({ error: "Email and password are required" });
  if (await findUserByEmail(email)) return response.status(409).json({ error: "Email already registered" });
  const otpEntry = otpStore.get(String(email).trim().toLowerCase());
  if (!otpEntry?.verified) return response.status(400).json({ error: "Please verify your email before registering" });
  const user = await createUser({ email, password, name: name || email.split("@")[0], referredBy: referralCode || null });
  otpStore.delete(String(email).trim().toLowerCase());
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

// Only a fixed, known set of UI-preference keys - an open-ended merge here
// would let a client stash arbitrary data on every user row.
const allowedPreferenceKeys = ["displayCurrency", "sidebarCollapsed"];

app.patch("/api/me/preferences", requireAuth, attachUser, async (request, response) => {
  const patch = {};
  for (const key of allowedPreferenceKeys) {
    if (Object.prototype.hasOwnProperty.call(request.body, key)) patch[key] = request.body[key];
  }
  if (!Object.keys(patch).length) return response.status(400).json({ error: "No recognized preference keys in body" });
  const user = await updateUserPreferences(request.user.id, patch);
  response.json({ user: publicUser(user) });
});

app.get("/api/admin/users", requireAuth, attachUser, requireRole("admin"), async (_request, response) => {
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

  // New accounts always start at a zero balance - funding only ever happens
  // through the audited deposit endpoint below, never as a raw create-time value.
  const user = await createUser({
    email,
    password,
    name: patch.name,
    role: patch.role || "user",
    status: patch.status || "active",
    kycStatus: patch.kycStatus || "pending",
    balance: 0,
  });
  logEvent({
    category: "admin",
    action: "user.created",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: user.email,
    details: { role: user.role, status: user.status },
  });
  response.status(201).json({ user: publicUser(user), temporaryPassword: password });
});

app.patch("/api/admin/users/:id", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const patch = normalizeManagedUserPatch(request.body);
  const validationError = validateManagedUserPatch(patch);
  if (validationError) return response.status(400).json({ error: validationError });

  const user = await updateUser(request.params.id, patch);
  if (!user) return response.status(404).json({ error: "User not found" });
  if (patch.kycStatus !== undefined) await syncLatestKycSubmissionStatus(user.id, patch.kycStatus, request.user.id);
  // Unlike deposit/withdraw (which already broadcast user.balance), this was
  // the one path that changed a user's own account - name, role, status, or
  // KYC - with nothing telling their already-open session about it. It just
  // sat stale (e.g. a Profile page still showing "Pending" after admin set
  // it to Verified) until they logged out and back in.
  broadcast({ type: "user.updated", userId: user.id, user: publicUser(user) });
  logEvent({
    category: "admin",
    action: "user.updated",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: user.email,
    details: patch,
  });
  response.json({ user: publicUser(user) });
});

// Deposits and withdrawals are the only way a user's balance moves outside of
// their own order activity, and both require the target account to have
// completed KYC. Every call writes a ledger entry (audit trail) atomically
// alongside the balance change via withUserLock/recordDeposit/recordWithdrawal.
app.post("/api/admin/users/:id/deposit", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const amount = Math.round(Number(request.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return response.status(400).json({ error: "Invalid amount" });

  const result = await recordDeposit({ userId: request.params.id, amount, createdBy: request.user.id });
  if (result.error) return response.status(result.status || 400).json({ error: result.error });

  broadcast({ type: "user.balance", userId: result.user.id, balance: result.user.balance });
  logEvent({
    category: "admin",
    action: "user.deposit",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: result.user.email,
    details: { amount, balanceAfter: result.user.balance },
  });
  response.json({ user: publicUser(result.user), ledgerEntry: result.ledgerEntry });
});

app.post("/api/admin/users/:id/withdraw", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const amount = Math.round(Number(request.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return response.status(400).json({ error: "Invalid amount" });

  const result = await recordWithdrawal({ userId: request.params.id, amount, createdBy: request.user.id });
  if (result.error) return response.status(result.status || 400).json({ error: result.error });

  broadcast({ type: "user.balance", userId: result.user.id, balance: result.user.balance });
  logEvent({
    category: "admin",
    action: "user.withdraw",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: result.user.email,
    details: { amount, balanceAfter: result.user.balance },
  });
  response.json({ user: publicUser(result.user), ledgerEntry: result.ledgerEntry });
});

app.get("/api/admin/users/:id/ledger", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const entries = await listLedgerEntries(request.params.id);
  response.json({ entries });
});

const kycDocumentTypes = ["passport", "id_card", "drivers_license"];

app.post("/api/kyc/submit", requireAuth, attachUser, upload.single("document"), async (request, response) => {
  const documentType = String(request.body.documentType || "").toLowerCase();
  const fullName = String(request.body.fullName || "").trim();
  const documentNumber = String(request.body.documentNumber || "").trim();
  const address = String(request.body.address || "").trim();

  if (!kycDocumentTypes.includes(documentType)) return response.status(400).json({ error: "Invalid document type" });
  if (!fullName || !documentNumber || !address) return response.status(400).json({ error: "Full name, document number, and address are required" });
  if (!request.file) return response.status(400).json({ error: "A document image is required" });

  const documentImageUrl = `/uploads/${request.file.filename}`;
  const submission = await createKycSubmission({ userId: request.user.id, documentType, fullName, documentNumber, address, documentImageUrl });
  // Any new submission needs fresh review, even if a prior one was rejected.
  const user = await updateUser(request.user.id, { kycStatus: "pending" });
  response.status(201).json({ submission, user: publicUser(user) });
});

app.get("/api/kyc/me", requireAuth, attachUser, async (request, response) => {
  const submission = await findLatestKycSubmission(request.user.id);
  response.json({ submission });
});

app.get("/api/admin/users/:id/kyc", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const submission = await findLatestKycSubmission(request.params.id);
  response.json({ submission });
});

app.post("/api/bank-details", requireAuth, attachUser, async (request, response) => {
  const bankName = String(request.body.bankName || "").trim();
  const accountHolder = String(request.body.accountHolder || "").trim();
  const accountNumber = String(request.body.accountNumber || "").trim();
  const ifscSwift = String(request.body.ifscSwift || "").trim();
  if (!bankName || !accountHolder || !accountNumber) {
    return response.status(400).json({ error: "Bank name, account holder, and account number are required" });
  }
  const account = await upsertBankAccount({ userId: request.user.id, bankName, accountHolder, accountNumber, ifscSwift });
  response.json({ account });
});

app.get("/api/bank-details/me", requireAuth, attachUser, async (request, response) => {
  const account = await findBankAccount(request.user.id);
  response.json({ account });
});

app.get("/api/admin/users/:id/bank-details", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const account = await findBankAccount(request.params.id);
  response.json({ account });
});

app.get("/api/admin/users/:id/orders", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const orders = await listOrders(request.params.id);
  const enriched = orders.map((order) => {
    if (order.status !== "open") return order;
    const currentPrice = getCurrentPrice(order.symbol);
    return { ...order, current_price: currentPrice, floating_pnl: floatingPnl(order, currentPrice) };
  });
  response.json({ orders: enriched });
});

app.post("/api/auth/change-password", requireAuth, attachUser, async (request, response) => {
  const currentPassword = String(request.body.currentPassword || "");
  const newPassword = String(request.body.newPassword || "");
  if (newPassword.length < 6) return response.status(400).json({ error: "New password must be at least 6 characters" });
  if (!(await bcrypt.compare(currentPassword, request.user.passwordHash))) {
    return response.status(401).json({ error: "Current password is incorrect" });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  if (pool) {
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [request.user.id, passwordHash]);
  } else {
    const user = memory.users.find((item) => item.id === request.user.id);
    if (user) user.passwordHash = passwordHash;
  }
  response.json({ ok: true });
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

app.get("/api/admin/instruments", requireAuth, attachUser, requireRole("admin"), async (_request, response) => {
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
  logEvent({
    category: "admin",
    action: "instrument.updated",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: instrument.symbol,
    details: { enabled: instrument.enabled, tradeEnabled: instrument.tradeEnabled, category: instrument.category },
  });
  response.status(201).json({ instrument });
});

app.get("/api/admin/logs", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const category = ["order", "chart", "admin"].includes(request.query.category) ? request.query.category : null;
  const logs = await listAuditLogs({ category, limit: request.query.limit });
  response.json({ logs });
});

// ---------- Local price engine ----------
// Every price in this app - quotes, order fills, SL/TP, the chart's candles
// and an admin simulation's moves - comes from one place: a per-symbol series
// of fixed 5-second OHLC bars kept in memory here (priceSeries). There is no
// external market-data provider. Quotes read the series' last close, the
// chart reads the series itself, and a running simulation records its ticks
// into that very same series, so the simulated part of a chart is simply the
// next bars of one continuous history - same time axis, same price scale -
// rather than a second data source stitched on in the browser.
const marketStatusBySymbol = new Map();
// Symbols that get a price-tick broadcast every few seconds even with no
// simulation running (see tickSyntheticQuotes). Every other symbol still
// moves - its series is advanced on demand whenever something reads it.
const quoteLiveSymbols = (process.env.MARKET_DATA_LIVE_SYMBOLS || "XAU/USD")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);

// Approximate real-world price levels (demo only, never refreshed) so each
// product's synthetic price starts somewhere recognizable.
const referencePrices = {
  "XAU/USD": 4521.75, "XAG/USD": 52.4, "BTC/USD": 112000, "ETH/USD": 4200, "XRP/USD": 2.75,
  "SOL/USDC": 210, "BNB/USD": 1050, "EUR/USD": 1.165, "GBP/USD": 1.338, "AUD/USD": 0.655,
  "NZD/USD": 0.577, "USD/JPY": 148.5, "USD/CHF": 0.798, "USD/CAD": 1.392, "AUD/JPY": 97.3,
  "AUD/CAD": 0.912, "EUR/JPY": 173, "AUD/NZD": 1.135, "AUD/CHF": 0.523, "GBP/JPY": 198.7,
  "EUR/AUD": 1.779, "CAD/JPY": 106.7, "EUR/CAD": 1.622, "GBP/AUD": 2.043, "CHF/JPY": 186.1,
  "EUR/CHF": 0.93, "GBP/CAD": 1.862, "NZD/CHF": 0.46, "GBP/NZD": 2.319, "EUR/GBP": 0.871,
  "NZD/JPY": 85.7, "GBP/CHF": 1.068, "CAD/CHF": 0.573, "EUR/NZD": 2.019, USOIL: 62.4,
  UKOIL: 66.1, NATGAS: 3.3, AAPL: 256, TSLA: 438, GOOGL: 246, MSFT: 517,
};

// Typical size of one 5-second move as a fraction of price, by category.
const seriesVolatilityByCategory = {
  crypto: 0.00025,
  metals: 0.00012,
  commodities: 0.00015,
  stocks: 0.00012,
  forex: 0.00005,
};
const instrumentCategoryBySymbol = new Map(defaultInstruments.map((instrument) => [instrument.symbol, instrument.category]));

const seriesBucketMs = 5000;
const seriesMaxBars = 2880; // 4 hours of 5-second bars
const seriesSeedBars = 720; // 1 hour of history generated the first time a symbol is used
const seriesChartBars = 1440; // the last 2 hours, as served to the chart
const priceSeries = new Map(); // symbol -> { bars: [{ t, open, high, low, close, volume, simulated }], sigma, volLevel, anchor }

function seriesBucket(ms) {
  return Math.floor(ms / seriesBucketMs) * seriesBucketMs;
}

function gaussian() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// Where a symbol's series starts the first time this process uses it: the
// last price persisted before a restart (see persistSeriesSnapshots) when it
// was saved in the current snapshot format and sits in a plausible band
// around the reference level, otherwise the reference level.
function seedBasisPrice(symbol) {
  const reference = referencePrices[symbol];
  const saved = candleSnapshotStore.get(symbol)?.candles;
  const persisted = Number(saved?.version === seriesSnapshotVersion ? saved.candles?.at(-1)?.close : NaN);
  if (Number.isFinite(persisted) && persisted > 0 && (!reference || (persisted > reference / 3 && persisted < reference * 3))) {
    return persisted;
  }
  if (reference) return reference;
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 50 + (seed % 200);
}

// One step of the synthetic walk: a volatility-clustered random shock plus a
// gentle pull toward a slowly wandering anchor, so prices meander like a
// market without drifting off without bound. fraction is how much of one
// 5-second bar this step represents (a 2.5s tick is half a bar).
function syntheticStep(series, price, fraction = 1) {
  series.volLevel = Math.max(0.5, Math.min(2.2, series.volLevel * (1 + (Math.random() - 0.5) * 0.12)));
  series.anchor = Math.max(0.00001, series.anchor * (1 + series.sigma * 0.25 * gaussian() * Math.sqrt(fraction)));
  const pull = (series.anchor - price) * 0.015 * fraction;
  const shock = price * series.sigma * series.volLevel * gaussian() * Math.sqrt(fraction);
  return Math.max(0.00001, price + pull + shock);
}

function generatedBar(series, t, open) {
  const close = syntheticStep(series, open);
  const wick = open * series.sigma * series.volLevel * 0.5;
  return {
    t,
    open,
    close,
    high: Math.max(open, close) + Math.abs(gaussian()) * wick,
    low: Math.max(0.00001, Math.min(open, close) - Math.abs(gaussian()) * wick),
    volume: 20 + Math.random() * 60 * series.volLevel,
    simulated: false,
  };
}

// Multiplies the whole series' prices by factor - used to rebase a product's
// history onto an admin-given simulation start price, so the chart's history
// ends exactly where the simulation begins. Multiplicative (not additive) so
// the history keeps the same percentage moves at the new level.
function scaleSeries(series, factor) {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
  for (const bar of series.bars) {
    bar.open *= factor;
    bar.high *= factor;
    bar.low *= factor;
    bar.close *= factor;
  }
  series.anchor *= factor;
}

const seriesMatchFullBars = 360; // the last 30 minutes take the full adjustment
const seriesMatchRampBars = 360; // the 30 minutes before that blend into it
const seriesMatchMaxFactor = 100;

// Scales the size of each recent bar's move (never its direction or shape) so
// the typical move matches targetPercent. Prices are rebuilt backward from the
// last close, so that close - where a simulation is about to start - stays
// exactly put and every bar still opens at the previous close; older bars
// blend in over a ramp and the oldest simply shift with them, so there's no
// seam anywhere. Only ever makes a series livelier, and leaves bars from an
// earlier simulation as they were.
function matchHistoryVolatility(series, targetPercent) {
  const bars = series.bars;
  const recent = bars.slice(-seriesMatchFullBars).filter((bar) => !bar.simulated);
  if (recent.length < 10 || !(targetPercent > 0)) return;
  const meanAbsPercent = (recent.reduce((sum, bar) => sum + Math.abs(bar.close / bar.open - 1), 0) / recent.length) * 100;
  if (!(meanAbsPercent > 0) || meanAbsPercent >= targetPercent * 0.5) return;
  const factor = Math.min(seriesMatchMaxFactor, targetPercent / meanAbsPercent);
  let close = bars.at(-1).close;
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const bar = bars[index];
    const fromEnd = bars.length - 1 - index;
    const weight = bar.simulated ? 0 : fromEnd < seriesMatchFullBars ? 1 : Math.max(0, 1 - (fromEnd - seriesMatchFullBars) / seriesMatchRampBars);
    const scale = 1 + (factor - 1) * weight;
    const bodyMove = Math.max(-0.5, (bar.close / bar.open - 1) * scale);
    const wickUp = (bar.high / Math.max(bar.open, bar.close) - 1) * scale;
    const wickDown = Math.max(-0.5, (bar.low / Math.min(bar.open, bar.close) - 1) * scale);
    const open = close / (1 + bodyMove);
    bar.open = open;
    bar.close = close;
    bar.high = Math.max(open, close) * (1 + wickUp);
    bar.low = Math.max(0.00001, Math.min(open, close) * (1 + wickDown));
    close = open;
  }
}

function trimSeries(series) {
  if (series.bars.length > seriesMaxBars) series.bars.splice(0, series.bars.length - seriesMaxBars);
}

function getSeries(symbol) {
  const existing = priceSeries.get(symbol);
  if (existing) return existing;
  const basis = seedBasisPrice(symbol);
  const series = {
    bars: [],
    sigma: seriesVolatilityByCategory[instrumentCategoryBySymbol.get(symbol)] || 0.0001,
    volLevel: 1,
    anchor: basis,
  };
  const lastBucket = seriesBucket(Date.now()) - seriesBucketMs;
  let price = basis;
  for (let index = seriesSeedBars - 1; index >= 0; index -= 1) {
    const bar = generatedBar(series, lastBucket - index * seriesBucketMs, price);
    series.bars.push(bar);
    price = bar.close;
  }
  // The walk wanders off basis; rescale so the history ends exactly on it.
  scaleSeries(series, basis / price);
  series.anchor = basis;
  priceSeries.set(symbol, series);
  return series;
}

// Brings a series up to the present: every whole 5-second bucket that went
// by with no tick recorded gets a generated bar continuing from the last
// close, so quotes keep moving and the chart never has a hole. While a
// simulation owns the symbol its ticks drive the series, so a missed bucket
// (an event-loop hiccup) is filled flat at the last price instead of with
// unrelated random movement.
function advanceSeries(symbol, series, nowMs = Date.now()) {
  const currentBucket = seriesBucket(nowMs);
  const missing = Math.floor((currentBucket - series.bars.at(-1).t) / seriesBucketMs) - 1;
  if (missing <= 0) return;
  const simulating = priceSimulations.has(symbol);
  const fill = Math.min(missing, seriesMaxBars);
  for (let t = currentBucket - fill * seriesBucketMs; t < currentBucket; t += seriesBucketMs) {
    const lastClose = series.bars.at(-1).close;
    series.bars.push(
      simulating
        ? { t, open: lastClose, high: lastClose, low: lastClose, close: lastClose, volume: 0, simulated: true }
        : generatedBar(series, t, lastClose),
    );
  }
  trimSeries(series);
}

// Records one price into the symbol's series at time ms: extends the bar for
// that 5-second bucket if it's already open, otherwise opens the next bar at
// the previous bar's close - so consecutive candles always join up.
function recordSeriesTick(symbol, price, ms, simulated) {
  const series = getSeries(symbol);
  advanceSeries(symbol, series, ms);
  const t = seriesBucket(ms);
  const last = series.bars.at(-1);
  if (last.t === t) {
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
    last.volume += 10 + Math.random() * 30;
    if (simulated) last.simulated = true;
  } else if (t > last.t) {
    series.bars.push({
      t,
      open: last.close,
      high: Math.max(last.close, price),
      low: Math.min(last.close, price),
      close: price,
      volume: 10 + Math.random() * 30,
      simulated: Boolean(simulated),
    });
    trimSeries(series);
  }
}

function roundPrice(value) {
  return Number(value.toPrecision(10));
}

function serializeBars(bars) {
  return bars.map((bar) => ({
    time: new Date(bar.t).toISOString(),
    open: roundPrice(bar.open),
    high: roundPrice(bar.high),
    low: roundPrice(bar.low),
    close: roundPrice(bar.close),
    volume: Math.round(bar.volume),
    simulated: Boolean(bar.simulated),
  }));
}

// Aggregates the 5-second bars into bucketMs-wide candles (open/close from
// the first/last bar, high/low across all of them, volume summed).
function resampleBars(bars, bucketMs) {
  const candles = [];
  for (const bar of bars) {
    const t = Math.floor(bar.t / bucketMs) * bucketMs;
    const last = candles.at(-1);
    if (last && last.t === t) {
      last.high = Math.max(last.high, bar.high);
      last.low = Math.min(last.low, bar.low);
      last.close = bar.close;
      last.volume += bar.volume;
      last.simulated = last.simulated || bar.simulated;
    } else {
      candles.push({ ...bar, t });
    }
  }
  return serializeBars(candles);
}

const syntheticQuoteTickIntervalMs = Number(process.env.SYNTHETIC_QUOTE_TICK_INTERVAL_MS || 2500);

function tickSyntheticQuotes() {
  const now = Date.now();
  for (const symbol of quoteLiveSymbols) {
    if (priceSimulations.has(symbol)) continue;
    const series = getSeries(symbol);
    advanceSeries(symbol, series, now);
    const price = roundPrice(syntheticStep(series, series.bars.at(-1).close, syntheticQuoteTickIntervalMs / seriesBucketMs));
    recordSeriesTick(symbol, price, now, false);
    broadcast({ type: "price-tick", symbol, price, source: "poll", timestamp: new Date(now).toISOString() });
    if (marketStatusBySymbol.get(symbol) !== true) {
      marketStatusBySymbol.set(symbol, true);
      broadcast({ type: "market-status", symbol, isOpen: true });
    }
  }
}

// Lets the client show account balances, P&L, and instrument prices in a
// currency other than USD - purely a display conversion (everything stays
// stored and computed in USD; see /api/markets/fx-rate for how the client
// gets this rate). These are fixed approximations (roughly early-2026
// rates) rather than polled from a live source - exchange rates don't move
// fast enough in a demo app to need anything tighter, and it removes a
// whole category of external dependency for a number that's only ever
// cosmetic here.
const supportedDisplayCurrencies = [
  "INR", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "SGD", "HKD",
  "NZD", "AED", "SAR", "ZAR", "SEK", "NOK", "DKK", "MXN", "BRL", "RUB",
  "KRW", "THB", "IDR", "MYR", "PHP", "TRY", "PLN",
];
const fxRateFallbacks = {
  INR: 83.5, EUR: 0.92, GBP: 0.79, JPY: 149, AUD: 1.52, CAD: 1.36,
  CHF: 0.88, CNY: 7.24, SGD: 1.34, HKD: 7.82, NZD: 1.64, AED: 3.67,
  SAR: 3.75, ZAR: 18.7, SEK: 10.4, NOK: 10.6, DKK: 6.86, MXN: 17.1,
  BRL: 4.97, RUB: 92, KRW: 1330, THB: 35.8, IDR: 15600, MYR: 4.68,
  PHP: 56.4, TRY: 32.1, PLN: 4.0,
};

// Persists each product's recent price history (resampled to 1-minute
// candles) so a restart or redeploy resumes every product at the price it
// was at, rather than jumping back to its reference level - see
// seedBasisPrice. candleSnapshotStore is the in-memory copy of what's saved.
const candleSnapshotStore = new Map(); // symbol -> { candles: { version, candles }, updatedAt }
const seriesPersistIntervalMs = 2 * 60 * 1000;
// Bumped whenever saved prices can't be trusted as a starting point anymore.
// Version 2: prices saved before then include levels derived from a hash of
// the product's name (e.g. Silver ~$156) rather than its reference level.
const seriesSnapshotVersion = 2;

async function loadCandleSnapshotsFromDb() {
  if (!pool) return;
  try {
    const rows = await query("SELECT symbol, candles, updated_at FROM candle_snapshots");
    for (const row of rows) {
      candleSnapshotStore.set(row.symbol, { candles: row.candles, updatedAt: row.updated_at });
    }
  } catch (error) {
    console.warn("Loading candle snapshots failed:", error.message);
  }
}

async function saveCandleSnapshot(symbol, candles) {
  const snapshot = { version: seriesSnapshotVersion, candles };
  candleSnapshotStore.set(symbol, { candles: snapshot, updatedAt: new Date().toISOString() });
  if (!pool) return;
  await query(
    `INSERT INTO candle_snapshots (symbol, candles, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (symbol) DO UPDATE SET candles = EXCLUDED.candles, updated_at = NOW()`,
    [symbol, JSON.stringify(snapshot)],
  );
}

async function persistSeriesSnapshots() {
  for (const [symbol, series] of priceSeries) {
    try {
      await saveCandleSnapshot(symbol, resampleBars(series.bars, 60000).slice(-240));
    } catch (error) {
      console.warn(`Saving price history failed for ${symbol}:`, error.message);
    }
  }
}

// The shape a simulation's noise is drawn from: the %-change from one
// 5-second bar's close to the next across this product's own recent
// (non-simulated) history. Normalized to unit average magnitude - what's kept
// is the relative mix of small and large moves and how often one goes against
// the last; meanAbsPercent carries the actual size, which the tick loop
// rescales from one bar to one tick.
function buildVolatilityTemplate(symbol) {
  const history = getSeries(symbol).bars.filter((bar) => !bar.simulated).slice(-720);
  if (history.length < 5) return null;
  const changes = [];
  for (let i = 1; i < history.length; i += 1) {
    const prevClose = history[i - 1].close;
    if (!Number.isFinite(prevClose) || prevClose <= 0) continue;
    const change = ((history[i].close - prevClose) / prevClose) * 100;
    if (Number.isFinite(change)) changes.push(change);
  }
  if (!changes.length) return null;
  const meanAbs = changes.reduce((sum, change) => sum + Math.abs(change), 0) / changes.length;
  if (!(meanAbs > 0)) return null;
  return { shape: changes.map((change) => change / meanAbs), meanAbsPercent: meanAbs };
}

// Standard forex/CFD convention: 1 lot = 100 units of the instrument. Margin
// required = (lots * unitsPerLot * price) / multiplier (multiplier acting as
// leverage, e.g. 100 = 1:100), plus a small handling fee on top of margin.
const orderUnitsPerLot = 100;
const orderFeeRate = 0.001;

// The one price every calculation uses (order entry, floating P&L, SL/TP,
// close P&L, quotes): a running simulation's price if there is one, otherwise
// the last close of this product's own price series, advanced to now.
function getCurrentPrice(symbol) {
  const simulation = priceSimulations.get(symbol);
  if (simulation) return simulation.price;
  const series = getSeries(symbol);
  advanceSeries(symbol, series);
  return series.bars.at(-1).close;
}

// ---------- Admin price simulation (demo/testing only) ----------
// Lets admin/team force a symbol's price to trend steadily up or down, so
// margin/floating-P&L/SL-TP calculations can be exercised deterministically
// instead of waiting on real market movement or random mock drift. Checked
// first in getCurrentPrice above, so it's the single choke point every
// calculation (order entry, floating P&L, SL/TP sweep, close P&L) already
// goes through - no other code path needs to know simulation exists.
const priceSimulations = new Map();
const priceSimulationTickMs = 1500;
const priceSimulationDefaultStepPercent = 0.08;
const priceSimulationMaxDurationMs = 60 * 60 * 1000; // 1h safety cap - this is a demo/testing tool, never leave one running unbounded by accident

// A duration turns this into a "run for N seconds against simulated moves,
// then hand off to the real-time feed" test: admin picks how long, an order
// gets placed while it's active, and once the timer fires this reverts to
// whatever getCurrentPrice would normally return (real feed or mock drift)
// with no gap - the same clean handoff stopPriceSimulation always did, just
// on a timer instead of a manual click.
// Resolves whatever target the request gave (an absolute price, or a
// percent move computed off the symbol's current price) down to one
// absolute targetPrice, or null if neither was given - so the rest of the
// simulation code only ever deals with one shape regardless of which the
// admin picked.
// basePriceOverride lets the caller pin the "current price" this resolves
// a %-target against to an admin-given startPrice instead of the real
// getCurrentPrice(symbol) - see startPrice on startPriceSimulation below.
function resolveSimulationTarget(symbol, direction, body, basePriceOverride = null) {
  const targetPriceRaw = Number(body.targetPrice);
  if (Number.isFinite(targetPriceRaw) && targetPriceRaw > 0) return targetPriceRaw;

  const targetPercentRaw = Number(body.targetPercent);
  if (Number.isFinite(targetPercentRaw) && targetPercentRaw > 0) {
    const basePrice = Number.isFinite(basePriceOverride) && basePriceOverride > 0 ? basePriceOverride : getCurrentPrice(symbol);
    const multiplier = direction === "up" ? 1 + targetPercentRaw / 100 : 1 - targetPercentRaw / 100;
    return Number((basePrice * multiplier).toFixed(6));
  }
  return null;
}

// A target only makes sense on the correct side of the current price - an
// "up to $X" that's already below the current price, or a "down to $X"
// already above it, would either never fire or fire instantly, neither of
// which is what the admin meant. basePriceOverride mirrors the one above,
// so a custom startPrice is validated against itself, not the real price.
function validateSimulationTarget(symbol, direction, targetPrice, basePriceOverride = null) {
  if (targetPrice == null) return null;
  const basePrice = Number.isFinite(basePriceOverride) && basePriceOverride > 0 ? basePriceOverride : getCurrentPrice(symbol);
  if (direction === "up" && targetPrice <= basePrice) return "Target must be above the current price for an upward simulation";
  if (direction === "down" && targetPrice >= basePrice) return "Target must be below the current price for a downward simulation";
  return null;
}

// startPrice lets admin pin exactly what price this symbol's simulation
// opens at (e.g. seeding a product that has no realistic price yet, or
// deliberately gapping it to a specific level) instead of always continuing
// from whatever getCurrentPrice(symbol) happens to be right now.
function startPriceSimulation(symbol, direction, stepPercent, startedBy, durationMs, targetPrice = null, startPrice = null) {
  const existing = priceSimulations.get(symbol);
  if (existing?.timer) clearTimeout(existing.timer);
  cancelScheduledSimulation(symbol); // a manual/auto trigger supersedes any pending scheduled window

  // The simulation opens exactly at the series' last close, so its first
  // simulated candle continues straight on from the history before it. An
  // admin-given startPrice rebases that history onto the new level first,
  // rather than leaving the simulation to jump away from it.
  const series = getSeries(symbol);
  // Includes the bucket in progress right now, so the simulation's first
  // ticks extend that candle instead of a flat filler candle appearing at
  // the handoff.
  advanceSeries(symbol, series, Date.now() + seriesBucketMs);
  if (Number.isFinite(startPrice) && startPrice > 0) scaleSeries(series, startPrice / series.bars.at(-1).close);
  const basePrice = series.bars.at(-1).close;
  const clampedDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? Math.min(durationMs, priceSimulationMaxDurationMs) : null;
  const expiresAt = clampedDurationMs ? new Date(Date.now() + clampedDurationMs).toISOString() : null;
  const resolvedStepPercent = Number.isFinite(stepPercent) && stepPercent > 0 ? stepPercent : priceSimulationDefaultStepPercent;
  const resolvedTargetPrice = Number.isFinite(targetPrice) && targetPrice > 0 ? targetPrice : null;

  // How many ticks this run is expected to take, used below to spread the
  // move toward targetPrice/duration evenly across that many ticks instead
  // of compounding stepPercent of the current (ever-growing) price every
  // tick, which blows up exponentially on any longer-running simulation -
  // that's what was turning a "nudge the price up" demo into a 20%+ move
  // and wildly inflated floating/realized P&L. A duration (when given)
  // always wins the pacing: "1 hour, target +1%" must take the full hour to
  // get there, not race to the target in the first handful of ticks just
  // because stepPercent-paced ticks would cover 1% quickly. Only a target
  // with NO duration falls back to pacing itself off stepPercent, since
  // then there's no time budget to spread across - it just goes until it
  // arrives.
  let totalTicksEstimate = null;
  if (clampedDurationMs) {
    totalTicksEstimate = Math.max(10, Math.round(clampedDurationMs / priceSimulationTickMs));
  } else if (resolvedTargetPrice != null) {
    const totalPercent = Math.abs(((resolvedTargetPrice - basePrice) / basePrice) * 100);
    totalTicksEstimate = Math.max(10, Math.round(totalPercent / resolvedStepPercent));
  }

  // A simulation moving much faster than this product's (synthetic) history
  // would draw candles many times taller than every candle before it,
  // flattening that history into a line along the bottom of the chart. Bring
  // the recent history up to a comparable candle size first - done before the
  // volatility template below is built, so the simulation's own noise is
  // shaped from that same history and candles match across the handoff.
  const perTickPercent =
    resolvedTargetPrice != null && totalTicksEstimate
      ? Math.abs(((resolvedTargetPrice - basePrice) / basePrice) * 100) / totalTicksEstimate
      : resolvedStepPercent;
  matchHistoryVolatility(series, perTickPercent * (seriesBucketMs / priceSimulationTickMs) * 0.6);

  const simulation = {
    direction,
    stepPercent: resolvedStepPercent,
    price: basePrice,
    // The noise-free glide path: drifts deterministically toward
    // targetPrice/duration with no randomness at all, so it always lands on
    // target reliably regardless of how large the noise below is. price
    // (what every other part of the app actually reads/trades against) is
    // this plus a fresh, non-cumulative wiggle each tick - see the tick loop.
    // Keeping them separate is what lets noise be big enough to look like
    // genuine up/down candles without risking a long random walk ever
    // drifting the real path away from where it's supposed to end up.
    trendPrice: basePrice,
    basePrice,
    targetPrice: resolvedTargetPrice,
    totalTicksEstimate,
    ticksElapsed: 0,
    // Current "how busy does the market feel" multiplier on noise intensity
    // - see the tick loop, where it does a slow random walk of its own. A
    // fixed noise width every tick makes every candle statistically the
    // same size (which is what "candles are all the same length" was
    // pointing at); real markets alternate between calm and busy stretches,
    // which is what this reproduces.
    volatilityLevel: 1,
    // Whether this run is time-bounded: when it is, reaching targetPrice
    // early (a lucky run of noise) does NOT end the run - it keeps gliding/
    // hovering near the target for whatever time is left, and the duration
    // timer below is what actually ends it. Without a duration, the target
    // is the only stop condition there is.
    hasDuration: Boolean(clampedDurationMs),
    // A snapshot of this symbol's real recent %-change-per-bar shape (see
    // buildVolatilityTemplate) - replayed as noise on top of the steady
    // drift below so the simulated candles vary in size and occasionally
    // move against the trend, like real candles, instead of a perfectly
    // uniform one-directional staircase.
    volatilityTemplate: buildVolatilityTemplate(symbol),
    startedBy,
    startedAt: new Date().toISOString(),
    expiresAt,
    timer: null,
  };
  if (clampedDurationMs) {
    simulation.timer = setTimeout(() => {
      stopPriceSimulation(symbol);
      logEvent({
        category: "chart",
        action: "simulation.expired",
        actorLabel: "system (duration elapsed)",
        targetLabel: symbol,
        details: { direction, price: simulation.price },
      });
    }, clampedDurationMs);
  }
  priceSimulations.set(symbol, simulation);
  broadcast({ type: "simulation-status", symbol, active: true, direction, expiresAt, targetPrice: simulation.targetPrice, startPrice: simulation.basePrice });
}

function stopPriceSimulation(symbol) {
  const existing = priceSimulations.get(symbol);
  if (existing?.timer) clearTimeout(existing.timer);
  const existed = priceSimulations.delete(symbol);
  if (existed) broadcast({ type: "simulation-status", symbol, active: false });
  return existed;
}

// Scheduled simulation window: admin picks an absolute from/to time (today,
// computed client-side in their own timezone into ISO timestamps) instead of
// "start now for N minutes" - real-time/mock drives the price right up until
// fromTime, the simulation runs from fromTime to toTime, then it hands back
// off automatically, same as the duration-based auto-revert above. This is
// the "not yet started" half; once fromTime arrives it becomes an ordinary
// entry in priceSimulations (via startPriceSimulation, given the window's
// length as its duration) and stops being tracked here.
const scheduledSimulations = new Map();

function cancelScheduledSimulation(symbol) {
  const scheduled = scheduledSimulations.get(symbol);
  if (scheduled?.startTimer) clearTimeout(scheduled.startTimer);
  const existed = scheduledSimulations.delete(symbol);
  if (existed) broadcast({ type: "simulation-scheduled", symbol, active: false });
  return existed;
}

function schedulePriceSimulation(symbol, direction, stepPercent, fromISO, toISO, startedBy, targetPrice = null, startPrice = null) {
  cancelScheduledSimulation(symbol);
  const fromMs = new Date(fromISO).getTime();
  const toMs = new Date(toISO).getTime();
  const now = Date.now();

  if (fromMs <= now) {
    // The window's start has already arrived (e.g. admin picked "from" a
    // minute in the past) - just start right away for whatever's left of it.
    startPriceSimulation(symbol, direction, stepPercent, startedBy, toMs - now, targetPrice, startPrice);
    return { scheduled: false, active: true };
  }

  const startTimer = setTimeout(() => {
    scheduledSimulations.delete(symbol);
    startPriceSimulation(symbol, direction, stepPercent, startedBy, toMs - Date.now(), targetPrice, startPrice);
  }, fromMs - now);

  scheduledSimulations.set(symbol, { direction, stepPercent, fromISO, toISO, startedBy, startTimer, targetPrice, startPrice });
  broadcast({ type: "simulation-scheduled", symbol, active: true, direction, fromISO, toISO, targetPrice, startPrice });
  return { scheduled: true, active: false };
}

setInterval(() => {
  for (const [symbol, simulation] of priceSimulations) {
    const dirSign = simulation.direction === "up" ? 1 : -1;
    simulation.ticksElapsed += 1;

    // Glide path: aim at whatever's left of the distance to target over
    // whatever's left of the planned run, recomputed from the current TREND
    // price every tick (not just the plan made at the start, and not the
    // noisy displayed price - see trendPrice above). Without a target, this
    // is just the plain steady drift as before.
    const ticksLeft = simulation.totalTicksEstimate
      ? Math.max(1, simulation.totalTicksEstimate - simulation.ticksElapsed)
      : null;
    const driftPercent =
      simulation.targetPrice != null && ticksLeft
        ? (((simulation.targetPrice - simulation.trendPrice) / simulation.basePrice) * 100) / ticksLeft
        : simulation.stepPercent * dirSign;
    simulation.trendPrice = Math.max(0.00001, simulation.trendPrice + simulation.basePrice * (driftPercent / 100));

    // Natural-looking noise, shaped by this symbol's own recent real
    // volatility (or a flat random fallback when none is stored yet) and
    // scaled off the admin's chosen stepPercent - the "how lively should
    // this look" dial - rather than the glide path's own pace, which can be
    // tiny for a long, modest run (e.g. 1 hour for just +1%) and would
    // otherwise flatten candles into a barely-moving staircase right when
    // they're supposed to look like a real market swinging up and down.
    // Applied as a fresh offset onto trendPrice each tick (not added onto
    // the running price - see trendPrice above) so cranking this up for
    // visibly bigger swings never risks a long random walk drifting the
    // real path away from target; it only ever changes how far the
    // DISPLAYED price wiggles around a plan that still lands exactly where
    // it's supposed to. Clamped so one outlier historical bar can't
    // dominate a single tick.
    // Slow mean-reverting random walk on the intensity itself (±9%/tick,
    // bounded to 0.25x-3.5x) - this is what turns "every candle drawn from
    // the same fixed-width distribution" (statistically same-sized, however
    // random each individual draw is) into visible stretches of calm
    // followed by bursts of bigger moves, the way a real chart actually
    // looks.
    simulation.volatilityLevel = Math.max(0.25, Math.min(3.5, simulation.volatilityLevel * (1 + (Math.random() - 0.5) * 0.18)));

    const template = simulation.volatilityTemplate;
    // Sized from the instrument's own real volatility (template.meanAbsPercent
    // - the real 1-minute bars' average |% change|), scaled down by
    // sqrt(tick duration / 60s) for a fair fraction of that over one tick
    // (variance scales with time for a random walk, so standard deviation -
    // and therefore a representative move size - scales with its square
    // root) - not from stepPercent, which is also the "how fast should the
    // overall trend move" dial (bigger for a large target reached quickly).
    // Reusing stepPercent uncapped to size per-tick noise too (tried
    // previously, then capped at a flat 0.4% - still arbitrary) meant
    // candles came out a size with no relationship to how this specific
    // instrument's real history actually moves, however that cap was tuned -
    // reported as simulated candles still looking oversized next to real
    // ones despite the cap. Falls back to the old stepPercent-based sizing
    // (now genuinely a last resort, capped at 0.4%) only when there's no
    // real history to scale from at all.
    const realTickFraction = Math.sqrt(priceSimulationTickMs / seriesBucketMs);
    const baseNoiseIntensity = template
      ? Math.max(template.meanAbsPercent * realTickFraction, 0.003)
      : Math.min(Math.max(simulation.stepPercent * 3.5, 0.03), 0.4);
    // Floored against this tick's own drift magnitude (always, even at
    // volatilityLevel's calm end - a calm-phase floor scaled down WITH
    // volatilityLevel could still end up smaller than drift) so noise can
    // always plausibly outweigh the deterministic step and pull a tick
    // below the previous one, regardless of how quiet this instrument's
    // real volatility is. Without it, a calm real instrument's own
    // noiseIntensity can end up smaller than the glide path's per-tick
    // drift, so every tick's price moves in lockstep with the trend and
    // the chart reads as a near-monotonic staircase in one color - the
    // exact candle-realism problem volatility texture exists to prevent,
    // reappearing now that noise is correctly sized to match a real (but
    // quiet) instrument instead of an arbitrary constant.
    const driftMagnitude = Math.abs(driftPercent);
    const noiseIntensity = Math.max(baseNoiseIntensity * simulation.volatilityLevel, driftMagnitude * 2.5);
    const rawNoisePercent = template
      ? template.shape[Math.floor(Math.random() * template.shape.length)] * noiseIntensity
      : (Math.random() * 2 - 1) * noiseIntensity;
    const noiseCap = noiseIntensity * 3;
    const noisePercent = Math.max(-noiseCap, Math.min(noiseCap, rawNoisePercent));
    simulation.price = Math.max(0.00001, Number((simulation.trendPrice * (1 + noisePercent / 100)).toFixed(6)));

    // Without a duration, the target is the only stop condition there is -
    // checked against the noise-free trend (so a lucky/unlucky noise tick
    // can't trigger or delay the stop) and snapped to it exactly. With a
    // duration, the target is just where the glide path aims; reaching it
    // early doesn't end the run - it keeps gliding/hovering near the target
    // for whatever time's left, and the expiry timer set in
    // startPriceSimulation is what actually ends it, so "1 hour, target
    // +1%" really runs the full hour instead of finishing in the first few
    // ticks.
    const targetReached =
      !simulation.hasDuration &&
      simulation.targetPrice != null &&
      (simulation.direction === "up" ? simulation.trendPrice >= simulation.targetPrice : simulation.trendPrice <= simulation.targetPrice);
    if (targetReached) {
      simulation.trendPrice = simulation.targetPrice;
      simulation.price = simulation.targetPrice;
    }

    // Recorded into the product's own price series (the same one its history
    // and quotes come from) before broadcasting, with the same timestamp the
    // broadcast carries - so a chart loaded now and a chart that has been
    // applying these ticks live bucket them into identical candles. Once the
    // simulation ends the series simply carries on from its last price.
    const tickMs = Date.now();
    recordSeriesTick(symbol, simulation.price, tickMs, true);
    broadcast({ type: "price-tick", symbol, price: simulation.price, source: "simulation", timestamp: new Date(tickMs).toISOString() });
    if (targetReached) {
      stopPriceSimulation(symbol);
      logEvent({
        category: "chart",
        action: "simulation.target_reached",
        actorLabel: "system (target reached)",
        targetLabel: symbol,
        details: { direction: simulation.direction, price: simulation.price, targetPrice: simulation.targetPrice },
      });
    }
  }
}, priceSimulationTickMs);

app.post("/api/admin/price-simulation", requireAuth, attachUser, requireRole("admin"), (request, response) => {
  const symbol = String(request.body.symbol || "").trim().toUpperCase();
  const direction = String(request.body.direction || "").toLowerCase();
  const stepPercent = Number(request.body.stepPercent);
  const durationSeconds = Number(request.body.durationSeconds);
  const startPriceRaw = Number(request.body.startPrice);
  const startPrice = Number.isFinite(startPriceRaw) && startPriceRaw > 0 ? startPriceRaw : null;
  if (!symbol) return response.status(400).json({ error: "Symbol is required" });
  if (!["up", "down"].includes(direction)) return response.status(400).json({ error: "Direction must be up or down" });

  const targetPrice = resolveSimulationTarget(symbol, direction, request.body, startPrice);
  const targetError = validateSimulationTarget(symbol, direction, targetPrice, startPrice);
  if (targetError) return response.status(400).json({ error: targetError });

  const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : null;
  startPriceSimulation(symbol, direction, stepPercent, request.user.id, durationMs, targetPrice, startPrice);
  const simulation = priceSimulations.get(symbol);
  logEvent({
    category: "chart",
    action: "simulation.started",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: symbol,
    details: { direction, stepPercent, durationSeconds: durationSeconds || null, targetPrice: simulation?.targetPrice || null, startPrice: simulation?.basePrice || null },
  });
  response.json({
    symbol,
    direction,
    active: true,
    expiresAt: simulation?.expiresAt || null,
    targetPrice: simulation?.targetPrice || null,
    startPrice: simulation?.basePrice || null,
  });
});

app.post("/api/admin/price-simulation/stop", requireAuth, attachUser, requireRole("admin"), (request, response) => {
  const symbol = String(request.body.symbol || "").trim().toUpperCase();
  if (!symbol) return response.status(400).json({ error: "Symbol is required" });
  stopPriceSimulation(symbol);
  logEvent({
    category: "chart",
    action: "simulation.stopped",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: symbol,
  });
  response.json({ symbol, active: false });
});

app.get("/api/admin/price-simulation", requireAuth, attachUser, requireRole("admin"), (_request, response) => {
  const simulations = [...priceSimulations.entries()].map(([symbol, simulation]) => ({
    symbol,
    direction: simulation.direction,
    price: simulation.price,
    startedAt: simulation.startedAt,
    expiresAt: simulation.expiresAt,
    targetPrice: simulation.targetPrice,
    startPrice: simulation.basePrice,
  }));
  response.json({ simulations });
});

// Same info as above but for a single symbol and open to any authenticated
// user, not just admin/team - the Trade page badge needs this for a client
// that opens the page (or switches symbol) after a simulation already
// started, since the WS broadcast that would normally carry direction/
// expiresAt already went out before they connected. The price itself is
// already public via the ordinary price-tick broadcast; this just exposes
// the same simulation metadata admin already sees, read-only.
app.get("/api/price-simulation-status", requireAuth, attachUser, (request, response) => {
  const symbol = String(request.query.symbol || "").trim().toUpperCase();
  const simulation = priceSimulations.get(symbol);
  if (!simulation) return response.json({ active: false });
  response.json({
    active: true,
    direction: simulation.direction,
    expiresAt: simulation.expiresAt,
    targetPrice: simulation.targetPrice,
    startPrice: simulation.basePrice,
    price: simulation.price,
  });
});

// A per-symbol opt-in: once enabled, placing a buy order on that symbol
// auto-starts an UP simulation (the favorable direction for a buy) and a
// sell auto-starts a DOWN simulation (favorable for a sell) - see
// maybeAutoStartSimulation, called from POST /api/orders. Lets admin/team
// watch a fresh test order's P&L move without clicking Up/Down themselves
// every time; the manual controls above still work independently on top.
const autoSimulationConfig = new Map();

function maybeAutoStartSimulation(symbol, orderDirection) {
  const config = autoSimulationConfig.get(symbol);
  if (!config) return;
  const simDirection = orderDirection === "buy" ? "up" : "down";
  const durationMs = Number.isFinite(config.durationSeconds) && config.durationSeconds > 0 ? config.durationSeconds * 1000 : null;
  startPriceSimulation(symbol, simDirection, config.stepPercent, "auto-order", durationMs);
}

app.post("/api/admin/price-simulation/auto", requireAuth, attachUser, requireRole("admin"), (request, response) => {
  const symbol = String(request.body.symbol || "").trim().toUpperCase();
  const enabled = Boolean(request.body.enabled);
  if (!symbol) return response.status(400).json({ error: "Symbol is required" });

  if (enabled) {
    const stepPercent = Number(request.body.stepPercent);
    const durationSeconds = Number(request.body.durationSeconds);
    autoSimulationConfig.set(symbol, {
      stepPercent: Number.isFinite(stepPercent) && stepPercent > 0 ? stepPercent : priceSimulationDefaultStepPercent,
      durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    });
  } else {
    autoSimulationConfig.delete(symbol);
  }
  broadcast({ type: "auto-simulation-status", symbol, enabled });
  logEvent({
    category: "chart",
    action: "simulation.auto_toggled",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: symbol,
    details: { enabled },
  });
  response.json({ symbol, enabled });
});

app.get("/api/admin/price-simulation/auto", requireAuth, attachUser, requireRole("admin"), (_request, response) => {
  const autoSymbols = [...autoSimulationConfig.keys()];
  response.json({ autoSymbols });
});

app.post("/api/admin/price-simulation/schedule", requireAuth, attachUser, requireRole("admin"), (request, response) => {
  const symbol = String(request.body.symbol || "").trim().toUpperCase();
  const direction = String(request.body.direction || "").toLowerCase();
  const stepPercent = Number(request.body.stepPercent);
  const from = String(request.body.from || "");
  const to = String(request.body.to || "");
  const startPriceRaw = Number(request.body.startPrice);
  const startPrice = Number.isFinite(startPriceRaw) && startPriceRaw > 0 ? startPriceRaw : null;
  if (!symbol) return response.status(400).json({ error: "Symbol is required" });
  if (!["up", "down"].includes(direction)) return response.status(400).json({ error: "Direction must be up or down" });

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return response.status(400).json({ error: "Invalid from/to time" });
  if (toMs <= fromMs) return response.status(400).json({ error: "To time must be after From time" });
  if (toMs <= Date.now()) return response.status(400).json({ error: "To time must be in the future" });
  if (toMs - fromMs > priceSimulationMaxDurationMs) return response.status(400).json({ error: "Window can be at most 1 hour" });

  const targetPrice = resolveSimulationTarget(symbol, direction, request.body, startPrice);
  const targetError = validateSimulationTarget(symbol, direction, targetPrice, startPrice);
  if (targetError) return response.status(400).json({ error: targetError });

  const result = schedulePriceSimulation(
    symbol,
    direction,
    Number.isFinite(stepPercent) && stepPercent > 0 ? stepPercent : priceSimulationDefaultStepPercent,
    from,
    to,
    request.user.id,
    targetPrice,
    startPrice
  );
  logEvent({
    category: "chart",
    action: "simulation.scheduled",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: symbol,
    details: { direction, stepPercent, from, to, targetPrice, startPrice },
  });
  response.json({ symbol, direction, targetPrice, startPrice, ...result });
});

app.post("/api/admin/price-simulation/schedule/cancel", requireAuth, attachUser, requireRole("admin"), (request, response) => {
  const symbol = String(request.body.symbol || "").trim().toUpperCase();
  if (!symbol) return response.status(400).json({ error: "Symbol is required" });
  cancelScheduledSimulation(symbol);
  logEvent({
    category: "chart",
    action: "simulation.schedule_cancelled",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: symbol,
  });
  response.json({ symbol, active: false });
});

app.get("/api/admin/price-simulation/schedule", requireAuth, attachUser, requireRole("admin"), (_request, response) => {
  const scheduled = [...scheduledSimulations.entries()].map(([symbol, s]) => ({
    symbol,
    direction: s.direction,
    fromISO: s.fromISO,
    toISO: s.toISO,
    targetPrice: s.targetPrice,
    startPrice: s.startPrice,
  }));
  response.json({ scheduled });
});

function floatingPnl(order, currentPrice) {
  const directionSign = order.direction === "buy" ? 1 : -1;
  return Math.round(directionSign * (currentPrice - Number(order.entry_price)) * Number(order.lots) * orderUnitsPerLot * 100) / 100;
}

app.post("/api/orders", requireAuth, attachUser, async (request, response) => {
  const symbol = String(request.body.symbol || "").trim().toUpperCase();
  const direction = String(request.body.side || request.body.direction || "").toLowerCase();
  const lots = Number(request.body.lots);
  const multiplier = Number(request.body.multiplier) || 100;
  // Auto-close thresholds are a floating-P&L dollar amount, not a price level
  // (e.g. stopLoss: 5 closes the position the instant it's down $5) - 0/unset
  // means that side isn't armed, since a $0 stop-loss would fire immediately.
  const stopLossRaw = Number(request.body.stopLoss);
  const takeProfitRaw = Number(request.body.takeProfit);
  const stopLoss = Number.isFinite(stopLossRaw) && stopLossRaw > 0 ? Math.round(stopLossRaw * 100) / 100 : null;
  const takeProfit = Number.isFinite(takeProfitRaw) && takeProfitRaw > 0 ? Math.round(takeProfitRaw * 100) / 100 : null;

  if (!["buy", "sell"].includes(direction)) return response.status(400).json({ error: "Invalid direction" });
  if (!Number.isFinite(lots) || lots < 0.01 || lots > 100) return response.status(400).json({ error: "Invalid lot size" });
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1000) return response.status(400).json({ error: "Invalid multiplier" });

  const tradableSymbols = new Set((await listInstruments({ tradeOnly: true })).map((instrument) => instrument.symbol));
  if (!tradableSymbols.has(symbol)) return response.status(400).json({ error: "Symbol is not tradable" });

  // Server computes, client displays: price/margin/fee are recomputed here
  // from the live feed, never taken from the request body.
  const price = getCurrentPrice(symbol);
  if (!Number.isFinite(price) || price <= 0) return response.status(503).json({ error: "Price unavailable, try again shortly" });

  const notional = lots * orderUnitsPerLot * price;
  const margin = Math.round((notional / multiplier) * 100) / 100;
  const fee = Math.round(margin * orderFeeRate * 100) / 100;

  const result = await withUserLock(request.user.id, async (user, client) => {
    if (user.balance < margin + fee) return { error: "Insufficient balance", status: 400 };

    const balanceBeforeMargin = user.balance;
    const afterMargin = Math.round((balanceBeforeMargin - margin) * 100) / 100;
    const afterFee = Math.round((afterMargin - fee) * 100) / 100;
    const marginUsedAfter = Math.round((user.marginUsed + margin) * 100) / 100;

    await setUserWallet(user.id, { balance: afterFee, marginUsed: marginUsedAfter }, client);
    const order = await createOrder({ userId: user.id, symbol, direction, lots, multiplier, entryPrice: price, marginHeld: margin, fee, stopLoss, takeProfit }, client);
    await insertLedgerEntry({ userId: user.id, type: "margin_hold", amount: -margin, balanceBefore: balanceBeforeMargin, balanceAfter: afterMargin, referenceId: order.id, createdBy: user.id }, client);
    if (fee > 0) {
      await insertLedgerEntry({ userId: user.id, type: "fee", amount: -fee, balanceBefore: afterMargin, balanceAfter: afterFee, referenceId: order.id, createdBy: user.id }, client);
    }
    return { order, balance: afterFee };
  });

  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  broadcast({ type: "order.update", order: result.order, userId: request.user.id, balance: result.balance });
  maybeAutoStartSimulation(symbol, direction);
  logEvent({
    category: "order",
    action: "order.placed",
    actorId: request.user.id,
    actorLabel: request.user.email,
    targetLabel: symbol,
    details: { orderId: result.order.id, direction, lots, multiplier, entryPrice: price },
  });
  response.status(201).json({ order: result.order, balance: result.balance });
});

app.get("/api/orders", requireAuth, attachUser, async (request, response) => {
  const status = ["open", "closed"].includes(request.query.status) ? request.query.status : undefined;
  const orders = await listOrders(request.user.id, status);
  // Floating P&L is computed fresh on every read, never persisted per tick.
  const enriched = orders.map((order) => {
    if (order.status !== "open") return order;
    const currentPrice = getCurrentPrice(order.symbol);
    return { ...order, current_price: currentPrice, floating_pnl: floatingPnl(order, currentPrice) };
  });
  response.json({ orders: enriched });
});

// Shared by the manual close endpoint and the SL/TP monitor below, so both
// paths get the same locked-transaction/ledger guarantees. closedBy is the
// acting user's id, or null for a system-triggered (SL/TP) close.
async function closeOrder(order, { closedBy, reason = null }) {
  const exitPrice = getCurrentPrice(order.symbol);
  const realizedPnl = floatingPnl(order, exitPrice);
  const marginHeld = Number(order.margin_held);

  const result = await withUserLock(order.user_id, async (user, client) => {
    // Closing the order row first (conditioned on status='open') means a
    // second closer for the same order - a manual close racing this exact
    // SL/TP sweep - finds it already closed and bails before touching the
    // wallet, instead of double-crediting margin/P&L.
    const closedOrder = await closeOrderRecord(order.id, { exitPrice, realizedPnl }, client);
    if (!closedOrder) return { error: "Order already closed", status: 409 };

    const balanceBeforeRelease = user.balance;
    const afterRelease = Math.round((balanceBeforeRelease + marginHeld) * 100) / 100;
    const afterPnl = Math.round((afterRelease + realizedPnl) * 100) / 100;
    const marginUsedAfter = Math.max(0, Math.round((user.marginUsed - marginHeld) * 100) / 100);

    await setUserWallet(user.id, { balance: afterPnl, marginUsed: marginUsedAfter }, client);
    await insertLedgerEntry({ userId: user.id, type: "margin_release", amount: marginHeld, balanceBefore: balanceBeforeRelease, balanceAfter: afterRelease, referenceId: order.id, createdBy: closedBy }, client);
    await insertLedgerEntry({ userId: user.id, type: "trade_pnl", amount: realizedPnl, balanceBefore: afterRelease, balanceAfter: afterPnl, referenceId: order.id, createdBy: closedBy }, client);
    return { order: closedOrder, balance: afterPnl };
  });

  if (!result.error) {
    broadcast({ type: "order.update", order: result.order, userId: order.user_id, balance: result.balance, closedBy, reason });
    const actor = closedBy ? await findUserById(closedBy) : null;
    logEvent({
      category: "order",
      action: "order.closed",
      actorId: closedBy,
      actorLabel: actor ? actor.email : reason ? `system (${reason})` : "system",
      targetLabel: order.symbol,
      details: { orderId: order.id, pnl: realizedPnl, reason: reason || "manual" },
    });
  }
  return { ...result, pnl: result.error ? null : realizedPnl };
}

app.post("/api/orders/:id/close", requireAuth, attachUser, async (request, response) => {
  const order = await findOrderById(request.params.id);
  if (!order) return response.status(404).json({ error: "Order not found" });
  if (order.user_id !== request.user.id && request.user.role !== "admin") {
    return response.status(403).json({ error: "Forbidden" });
  }
  if (order.status !== "open") return response.status(400).json({ error: "Order already closed" });

  const result = await closeOrder(order, { closedBy: request.user.id });
  if (result.error) return response.status(result.status || 400).json({ error: result.error });
  response.json({ order: result.order, balance: result.balance, pnl: result.pnl });
});

// Sweeps every open order that has a stop-loss or take-profit armed and
// closes anything whose floating P&L has crossed its threshold. Runs on a
// plain timer against getCurrentPrice() (cheap in-memory reads off the
// existing quote store/poller), independent of any single user's requests -
// so a threshold fires even if that user's browser is closed.
const stopLossTakeProfitIntervalMs = Number(process.env.SL_TP_CHECK_INTERVAL_MS || 3000);

async function checkStopLossTakeProfit() {
  const candidates = await listOpenOrdersWithThresholds();
  for (const order of candidates) {
    const currentPrice = getCurrentPrice(order.symbol);
    const pnl = floatingPnl(order, currentPrice);
    const stopLoss = order.stop_loss_amount != null ? Number(order.stop_loss_amount) : null;
    const takeProfit = order.take_profit_amount != null ? Number(order.take_profit_amount) : null;
    const hitStopLoss = stopLoss != null && pnl <= -stopLoss;
    const hitTakeProfit = takeProfit != null && pnl >= takeProfit;
    if (!hitStopLoss && !hitTakeProfit) continue;
    try {
      await closeOrder(order, { closedBy: null, reason: hitStopLoss ? "stop_loss" : "take_profit" });
    } catch (error) {
      console.warn(`SL/TP auto-close failed for order ${order.id}:`, error.message);
    }
  }
}

setInterval(() => {
  checkStopLossTakeProfit().catch((error) => console.warn("SL/TP sweep failed:", error.message));
}, stopLossTakeProfitIntervalMs);

app.get("/api/markets/quotes", async (request, response) => {
  const requestedSymbols = String(request.query.symbols || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const tradableSymbols = new Set((await listInstruments({ tradeOnly: true })).map((instrument) => instrument.symbol));
  const symbols = requestedSymbols.filter((symbol) => tradableSymbols.has(symbol));
  if (!symbols.length) return response.status(400).json({ error: "No allowed symbols requested" });

  // Same getCurrentPrice() every order and simulation uses, so the price a
  // client displays is always the price it would trade at. percent_change is
  // measured across the product's own held history (up to the last 4 hours).
  const data = {};
  const timestamp = new Date().toISOString();
  for (const symbol of symbols) {
    const price = roundPrice(getCurrentPrice(symbol));
    const firstClose = getSeries(symbol).bars[0].close;
    data[symbol] = {
      symbol,
      price,
      close: price,
      percent_change: Number((((price - firstClose) / firstClose) * 100).toFixed(2)),
      is_market_open: true,
      simulated: priceSimulations.has(symbol),
      timestamp,
    };
  }
  response.json({ provider: "synthetic", symbols, data });
});

// Backs the display-currency picker - a pure USD-to-<currency> conversion
// rate for the client to multiply its (always USD-denominated internally)
// balances, P&L, and prices by. Fixed approximations rather than live rates
// - see fxRateFallbacks above.
app.get("/api/markets/fx-rate", (request, response) => {
  const currency = String(request.query.currency || "").toUpperCase();
  if (currency === "USD") {
    return response.json({ currency: "USD", rate: 1, isLive: true, at: new Date().toISOString() });
  }
  if (!supportedDisplayCurrencies.includes(currency)) {
    return response.status(400).json({ error: "Unsupported currency" });
  }
  response.json({ currency, rate: fxRateFallbacks[currency], isLive: false, at: new Date().toISOString() });
});

// Candles resampled from a product's price series into whatever interval a
// range maps to. The series holds the last 4 hours, so wider ranges return
// however many candles those 4 hours make rather than inventing older data.
const candleRangeMinutes = {
  "1M": 1, "5M": 5, "15M": 15, "30M": 30, "1H": 60, "1D": 1440,
  "5D": 60, "1MO": 1440, "5MO": 1440, "1Y": 10080, ALL: 43200,
};
const candleRangeErrorMessage = `Invalid range. Use ${Object.keys(candleRangeMinutes).join(", ")}.`;

function intervalMinutesForSpan(days) {
  if (days <= 7) return 60;
  if (days <= 90) return 1440;
  if (days <= 730) return 10080;
  return 43200;
}

async function isKnownInstrument(symbol) {
  return (await listInstruments({})).some((instrument) => instrument.symbol === symbol);
}

app.get("/api/markets/candles", async (request, response) => {
  const symbol = String(request.query.symbol || "").trim().toUpperCase();
  const startParam = String(request.query.start || "").trim();
  const endParam = String(request.query.end || "").trim();
  const isCustomRange = Boolean(startParam && endParam);

  let range;
  let bucketMinutes;

  if (isCustomRange) {
    const startDate = new Date(`${startParam}T00:00:00Z`);
    const endDate = new Date(`${endParam}T23:59:59Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
      return response.status(400).json({ error: "Invalid date range. Use start/end as YYYY-MM-DD with start before end." });
    }
    range = "CUSTOM";
    bucketMinutes = intervalMinutesForSpan((endDate - startDate) / 86400000);
  } else {
    range = String(request.query.range || "1H").trim().toUpperCase();
    bucketMinutes = candleRangeMinutes[range];
    if (!bucketMinutes) return response.status(400).json({ error: candleRangeErrorMessage });
  }

  if (!(await isKnownInstrument(symbol))) return response.status(400).json({ error: "Unknown symbol" });
  const series = getSeries(symbol);
  advanceSeries(symbol, series);
  response.json({ symbol, range, candles: resampleBars(series.bars, bucketMinutes * 60000), source: "series" });
});

// The product's full price series at its native 5-second resolution - what
// the Trade page chart draws while a simulation is running. Simulated bars
// are flagged, so the chart can mark where the simulation took over; because
// simulation ticks are recorded here as they happen, loading this at any
// point (a refresh, switching tabs or products and back) returns the same
// continuous chart the live view had been building.
app.get("/api/markets/series", async (request, response) => {
  const symbol = String(request.query.symbol || "").trim().toUpperCase();
  if (!(await isKnownInstrument(symbol))) return response.status(400).json({ error: "Unknown symbol" });
  const series = getSeries(symbol);
  advanceSeries(symbol, series);
  response.json({ symbol, bucketMs: seriesBucketMs, bars: serializeBars(series.bars.slice(-seriesChartBars)) });
});

app.post("/api/service-requests", requireAuth, attachUser, upload.single("attachment"), async (request, response) => {
  const { type, amount, note } = request.body;
  if (!["deposit", "withdrawal", "kyc", "support"].includes(type)) return response.status(400).json({ error: "Invalid request type" });
  const attachmentUrl = request.file ? `/uploads/${request.file.filename}` : null;
  const serviceRequest = await createServiceRequest({ userId: request.user.id, type, amount, note, attachmentUrl });
  response.status(201).json({ serviceRequest });
});

app.get("/api/service-requests", requireAuth, attachUser, async (request, response) => {
  response.json({ serviceRequests: await listServiceRequests(request.user) });
});

app.patch("/api/service-requests/:id", requireAuth, attachUser, requireRole("admin"), async (request, response) => {
  const status = String(request.body.status || "").toLowerCase();
  if (!["pending", "approved", "rejected", "resolved"].includes(status)) {
    return response.status(400).json({ error: "Invalid status" });
  }
  const serviceRequest = await updateServiceRequestStatus(request.params.id, status);
  if (!serviceRequest) return response.status(404).json({ error: "Service request not found" });
  broadcast({ type: "service-request.status", serviceRequest });
  response.json({ serviceRequest });
});

// Both message endpoints below previously had no ownership check at all - any
// authenticated user could read or post into any OTHER user's request thread
// just by guessing/incrementing an id. Team/admin legitimately need access to
// every thread (that's the inbox), but a plain "user" role only ever gets
// their own.
async function requireRequestAccess(request, response, next) {
  const serviceRequest = await findServiceRequestById(request.params.id);
  if (!serviceRequest) return response.status(404).json({ error: "Service request not found" });
  if (request.user.role === "user" && serviceRequest.user_id !== request.user.id) {
    return response.status(403).json({ error: "Forbidden" });
  }
  request.serviceRequest = serviceRequest;
  return next();
}

app.get("/api/service-requests/:id/messages", requireAuth, attachUser, requireRequestAccess, async (request, response) => {
  response.json({ messages: await listChatMessages(request.params.id) });
});

app.post(
  "/api/service-requests/:id/messages",
  requireAuth,
  attachUser,
  requireRequestAccess,
  upload.single("attachment"),
  async (request, response) => {
    const attachmentUrl = request.file ? `/uploads/${request.file.filename}` : null;
    const message = await createChatMessage({
      requestId: request.params.id,
      senderId: request.user.id,
      body: request.body.body || "",
      attachmentUrl,
    });
    broadcast({ type: "chat.message", message });
    response.status(201).json({ message });
  },
);

// Browser console logs vanish the moment the tab closes, so the client posts
// here whenever something it can't recover from happens on its own (right
// now: a chat message that truly couldn't be sent) - landing in the normal
// server logs is the only way to see what actually went wrong for a real
// user after the fact, since this app has no error-tracking service wired
// up. Deliberately not behind requireAuth: a broken/expired token can BE the
// failure being reported, and that's exactly the case we most need visible.
app.post("/api/client-error", (request, response) => {
  const body = request.body || {};
  const clip = (value, max) => (typeof value === "string" ? value.slice(0, max) : value);
  console.error(
    "[client-error]",
    JSON.stringify({
      context: clip(body.context, 100) || "unknown",
      message: clip(body.message, 500) || "",
      status: Number.isFinite(body.status) ? body.status : null,
      path: clip(body.path, 200) || null,
      method: clip(body.method, 10) || null,
      email: clip(body.email, 200) || null,
      detail: clip(JSON.stringify(body.detail || {}), 1000),
    }),
  );
  response.status(204).end();
});

// Explicit allowlist, not express.static(rootDir): the project root this
// runs from also holds server.js, package.json, package-lock.json, and
// db/schema.sql alongside the actual public frontend files - a blanket
// static mount served every one of those to anyone who asked, including
// the full backend source (with the seeded admin credentials baked into
// seedDefaults) and the database schema. These three are the entire public
// surface (confirmed against what index.html/app.js/styles.css actually
// reference) - /uploads already has its own dedicated static mount above.
app.get("/app.js", (_request, response) => response.sendFile(path.join(rootDir, "app.js")));
app.get("/styles.css", (_request, response) => response.sendFile(path.join(rootDir, "styles.css")));
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
  // A freshly-connected client would otherwise wait up to the next
  // tickSyntheticQuotes cycle for its first market-status update, so hand
  // it whatever's already known now.
  for (const [symbol, isOpen] of marketStatusBySymbol.entries()) {
    socket.send(JSON.stringify({ type: "market-status", symbol, isOpen }));
  }
});

seedDefaults()
  .then(async () => {
    // Loaded before anything prices a product, so every series resumes from
    // where it was before this restart (see seedBasisPrice).
    await loadCandleSnapshotsFromDb();
    server.listen(port, () => {
      console.log(`FXCC platform running on http://127.0.0.1:${port}`);
    });
    tickSyntheticQuotes();
    setInterval(tickSyntheticQuotes, syntheticQuoteTickIntervalMs);
    setInterval(() => {
      persistSeriesSnapshots().catch((error) => console.warn("Persisting price history failed:", error.message));
    }, seriesPersistIntervalMs);
  })
  .catch((error) => {
    console.error("Failed to start FXCC platform", error);
    process.exit(1);
  });
