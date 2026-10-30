# FXCM Capitals Trading Platform

Frontend design is complete and backend development has started. The project now runs as a Node/Express app that serves the completed FXCM frontend and exposes APIs for user management, online service chat, deposits, withdrawals, KYC, and admin-controlled tradable instruments.

## Current Features

- FXCM-inspired public home page
- FXCM-inspired sign-in screen
- FXCM-inspired register screen with password confirmation
- FXCM-inspired client dashboard after login
- Trade/quotes page with searchable market instruments and category filters
- Dedicated trade terminal with market watch, candlestick chart, and order ticket
- Online service chat popup with image uploads
- Profile referral/invited friends modal with pagination
- Backend auth endpoints with admin/team/user roles
- Backend service request APIs for deposit, withdrawal, and KYC flows
- Backend chat message APIs with image attachment support
- Backend instrument allowlist APIs so admins decide what users can trade
- Market quotes endpoint that only returns allowed/tradable symbols

## Recommended Market API

Use **Twelve Data** first for the market feed because it supports forex, crypto, stocks, commodities, REST JSON, and WebSocket-style realtime data from one provider. The backend never exposes the provider key to the browser. Admins manage the allowed/tradable symbols, and the frontend asks this backend only for approved symbols.

Other useful providers:

- **Finnhub**: good stocks/forex/crypto coverage.
- **EODHD**: broad market data and realtime WebSocket feeds.
- **Metals-API**: focused precious-metals pricing.

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://127.0.0.1:4173
```

Default seeded accounts:

```text
admin@fxcaptialmarket.online / Admin@12345 (only created on a brand-new, empty database)
(no separate support login; admins handle Online Service)
```

Without `DATABASE_URL`, the backend uses in-memory data so development starts immediately. On Render, create a PostgreSQL database and set `DATABASE_URL` for persistence.

## Backend API Surface

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/admin/users`
- `GET /api/referrals`
- `GET /api/instruments`
- `GET /api/tradable-instruments`
- `POST /api/admin/instruments`
- `GET /api/markets/quotes?symbols=XAU/USD,BTC/USD`
- `POST /api/service-requests`
- `GET /api/service-requests`
- `GET /api/service-requests/:id/messages`
- `POST /api/service-requests/:id/messages`
- `WS /ws`

## Render

The app runs on Render as a Node web service (`render.yaml` describes the whole setup).

- **Web service:** this repository, branch `main`, build `npm install`, start `npm start`, health check path `/api/health`. Use a paid plan (Starter or above) so it stays awake: the free plan sleeps after 15 minutes idle, which stops live quotes, WebSockets and running simulations.
- **PostgreSQL:** create a Render Postgres in the same region and set the service's `DATABASE_URL` to its **Internal Database URL**. The schema is applied automatically on start.
- **Persistent disk:** mount a disk at `/var/data` and set `UPLOAD_DIR=/var/data/uploads`, otherwise KYC documents and chat images are lost on every deploy.
- **Custom domain:** service -> Settings -> Custom Domains -> add `www.fxcaptialmarket.online` and `fxcaptialmarket.online`, then add the DNS records Render shows (CNAME `www` -> the service's `onrender.com` address; ALIAS/ANAME or A `216.24.57.1` for the bare domain). Render issues the HTTPS certificate and redirects between the two names automatically.

Required variables:

```text
JWT_SECRET=<strong random secret>
DATABASE_URL=<Render Postgres Internal Database URL>
UPLOAD_DIR=/var/data/uploads
RESEND_API_KEY=<Resend key>
EMAIL_FROM=FXCM Capitals <no-reply@fxcaptialmarket.online>
ALLOWED_SYMBOLS=XAU/USD,XAG/USD,BTC/USD,EUR/USD,GBP/USD,USOIL
```

Charts are generated locally; only each product's latest real price is fetched, and the server steers that product's chart onto it:

- Crypto: Coinbase public spot prices (no key)
- Stocks: Finnhub - set `FINNHUB_API_KEY`
- Gold, silver, oil: Twelve Data - set `MARKET_DATA_API_KEY`
- Forex: ECB reference rates via Frankfurter (no key, daily)

Without a key (or if a source is down) that product keeps its generated price.

## Accounts

- **Email verification:** sign-up needs a 6-digit code emailed to the address, and **Forgot Password?** emails a code to choose a new password. Codes last 10 minutes, allow 5 tries, and can be requested once a minute per address. Set `RESEND_API_KEY` and `EMAIL_FROM` (or SMTP) in production; without a provider a deployed server refuses to send codes instead of returning them. Locally, with nothing set, the code is shown on screen for testing.
- **Demo accounts:** **Try Demo** creates a real practice account with 10,000 virtual USD that trades like any client's, with no deposit, withdrawal, KYC, bank or password screens. They are hidden from the admin Users list and cleared after 14 days.

A simulation chart also shows each product's real last week, in 1-minute candles (5s, 1M, 5M, 15M, 1H, 4H and 1D views), fetched at startup and topped up every 5 minutes, held in memory only:

- Crypto: Coinbase public candles (no key)
- Everything else: Yahoo Finance chart data (no key, unofficial; commodities use their futures)

If history can't be fetched, that product's chart falls back to a generated hour. Set `MARKET_HISTORY=off` to skip fetching it.
