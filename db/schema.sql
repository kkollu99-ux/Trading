CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'team', 'user')),
  status TEXT NOT NULL DEFAULT 'active',
  referral_code TEXT UNIQUE NOT NULL,
  referred_by TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'pending',
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  margin_used NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  trade_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'kyc')),
  amount NUMERIC(14, 2),
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  attachment_url TEXT,
  assigned_team_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES service_requests(id),
  sender_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  lots NUMERIC(10, 2) NOT NULL,
  multiplier NUMERIC(10, 2) NOT NULL,
  entry_price NUMERIC(18, 6) NOT NULL,
  exit_price NUMERIC(18, 6),
  margin_held NUMERIC(14, 2) NOT NULL,
  fee NUMERIC(14, 2) NOT NULL,
  realized_pnl NUMERIC(14, 2),
  -- Auto-close thresholds, in floating P&L dollars (not a price level): the
  -- position is closed the moment floating P&L reaches -stop_loss_amount or
  -- +take_profit_amount. NULL means that side is not armed.
  stop_loss_amount NUMERIC(14, 2),
  take_profit_amount NUMERIC(14, 2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('pending', 'open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Append-only audit trail of every balance-changing event. Nothing ever
-- mutates a row here; a deposit, a margin hold/release, and trade P&L each
-- get their own entry, so wallet history is always reconstructable.
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'margin_hold', 'margin_release', 'trade_pnl', 'fee')),
  amount NUMERIC(14, 2) NOT NULL,
  balance_before NUMERIC(14, 2) NOT NULL,
  balance_after NUMERIC(14, 2) NOT NULL,
  reference_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per KYC submission attempt (a user can resubmit after a rejection),
-- so admin review always sees exactly what the user actually typed/uploaded -
-- users.kyc_status stays the current summary flag, kept in sync on review.
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('passport', 'id_card', 'drivers_license')),
  full_name TEXT NOT NULL,
  document_number TEXT NOT NULL,
  address TEXT NOT NULL,
  document_image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One bank account on file per user (upsert-on-submit, not a history log).
CREATE TABLE IF NOT EXISTS bank_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  bank_name TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc_swift TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_request_id ON chat_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user_id ON kyc_submissions(user_id);
