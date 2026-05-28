# How to Run the E-Commerce Workflow Orchestrator (Step by Step)

## Quick start (one command)

```bash
cd workflow-orchestrator

# 1) Start Docker Desktop first (macOS), then:
docker compose up -d db

# 2) Install dependencies once (first time only)
./scripts/install-deps.sh

# 3) Start everything
./start-all.sh
```

Open:
- Frontend: http://localhost:5173
- API: http://localhost:3000/api/workflows

Press `Ctrl+C` in the terminal running `start-all.sh` to stop all services.

---

## Full manual setup (recommended for first run)

### Step 0 — Prerequisites

- Node.js 18+
- Docker Desktop (for PostgreSQL) **or** local PostgreSQL on port `5432`
- Terminal (macOS/Linux)

### Step 1 — Go to project folder

```bash
cd /Users/abhidogra/Desktop/Northern-Trust-Hackathon-Group2/workflow-orchestrator
```

### Step 2 — Start PostgreSQL

**Option A: Docker (recommended)**

```bash
# Make sure Docker Desktop is running
docker compose up -d db
```

**Option B: Local PostgreSQL**

```bash
# Create database
createdb orders_db

# Apply schema
psql -U postgres -d orders_db -f orchestrator/src/db/schema.sql
```

### Step 3 — Install dependencies (first time only)

```bash
cd orchestrator && npm install && cd ..
cd frontend && npm install && cd ..
cd services/payment-service && npm install && cd ../..
cd services/inventory-service && npm install && cd ../..
cd services/shipping-service && npm install && cd ../..
cd services/notification-service && npm install && cd ../..
```

### Step 4 — Configure orchestrator environment

```bash
cd orchestrator
cp .env.example .env
```

Ensure `.env` contains:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/orders_db
NODE_ENV=development
```

### Step 5 — Start mock services (4 terminals, or background)

```bash
# Terminal 1
cd services/payment-service && PORT=4001 npm start

# Terminal 2
cd services/inventory-service && PORT=4002 npm start

# Terminal 3
cd services/shipping-service && PORT=4003 npm start

# Terminal 4
cd services/notification-service && PORT=4004 npm start
```

### Step 6 — Start orchestrator

```bash
cd orchestrator
npm start
```

You should see:
- `Connected to DB`
- `Orchestrator listening on port 3000`

### Step 7 — Start frontend

```bash
cd frontend
npm run dev
```

Open: http://localhost:5173

### Step 8 — Run API test script (optional)

```bash
cd orchestrator/src/utils
node testRun.js
```

---

## Service ports

| Service | Port | Health check |
|---|---:|---|
| Orchestrator API | 3000 | http://localhost:3000/api/workflows |
| Frontend | 5173 | http://localhost:5173 |
| Payment | 4001 | http://localhost:4001/health |
| Inventory | 4002 | http://localhost:4002/health |
| Shipping | 4003 | http://localhost:4003/health |
| Notification | 4004 | http://localhost:4004/health |
| PostgreSQL | 5432 | `docker compose ps` |

---

## Troubleshooting

1. **`PostgreSQL is not reachable`**
   - Start Docker Desktop
   - Run: `docker compose up -d db`

2. **`Failed to start orchestrator` / DB connection error**
   - Verify `.env` `DATABASE_URL`
   - Confirm DB is up: `docker compose ps`

3. **Workflow tasks fail immediately**
   - Ensure all 4 mock services are running on ports `4001-4004`
   - Check orchestrator logs for HTTP errors

4. **Frontend shows API errors**
   - Confirm orchestrator is running on port `3000`
   - Refresh after services are fully started
