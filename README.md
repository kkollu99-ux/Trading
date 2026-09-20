# FXCC Capitals Trading Platform

Frontend design is complete and backend development has started. The project now runs as a Node/Express app that serves the completed FXCC frontend and exposes APIs for user management, online service chat, deposits, withdrawals, KYC, and admin-controlled tradable instruments.

## Current Features

- FXCC-inspired public home page
- FXCC-inspired sign-in screen
- FXCC-inspired register screen with password confirmation
- FXCC-inspired client dashboard after login
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
admin@fxcc.capital / Admin@12345
support@fxcc.capital / Support@12345
```

Without `DATABASE_URL`, the backend uses in-memory data so development starts immediately. On Railway, attach PostgreSQL and set `DATABASE_URL` for persistence.

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

## Railway

The app is Railway-ready through `package.json` and `railway.json`.

Suggested Railway resources:

- Web service: this repository
- PostgreSQL database: for users, referrals, KYC, service requests, chat, instruments
- Persistent/object storage later: for KYC/payment screenshots, if image uploads should survive redeploys

Required Railway variables:

```text
JWT_SECRET=<strong random secret>
DATABASE_URL=<Railway Postgres URL>
MARKET_DATA_PROVIDER=twelvedata
MARKET_DATA_API_KEY=<provider key>
ALLOWED_SYMBOLS=XAU/USD,XAG/USD,BTC/USD,EUR/USD,GBP/USD,USOIL
```

The backend also accepts `TWELVEDATA_API_KEY`, `TWELVEDATAAPI`, or `twelvedataAPI` as aliases for the Twelve Data key.
