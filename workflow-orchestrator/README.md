# E-Commerce Workflow Orchestrator

This project demonstrates an end-to-end workflow orchestration system for e-commerce order processing.  
It includes a React dashboard, a Node.js orchestrator, and four mock downstream services (payment, inventory, shipping, notification).  
You can start workflows, monitor live task state, and control workflow execution through REST APIs.

## Architecture

```text
+-------------------+         +------------------------+
|   React Frontend  |  HTTP   |     Orchestrator       |
|   localhost:5173  +-------->+   localhost:3000/api   |
+-------------------+         +-----------+------------+
                                          |
                                          | HTTP Task Calls
         +-------------------+------------+--------------+-------------------+
         |                   |                           |                   |
+--------v--------+ +--------v---------+      +----------v-------+ +---------v--------+
| Payment Service | | Inventory Service |      | Shipping Service | | Notification Svc |
| localhost:4001  | | localhost:4002    |      | localhost:4003   | | localhost:4004   |
+-----------------+ +-------------------+      +------------------+ +------------------+
```

## Prerequisites

- Node.js 18+
- PostgreSQL
- Docker (optional, for containerized startup)

## Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd workflow-orchestrator
   ```

2. **Install dependencies**
   ```bash
   # orchestrator
   cd orchestrator && npm install && cd ..

   # frontend
   cd frontend && npm install && cd ..

   # services umbrella (for concurrently script)
   cd services && npm install && cd ..

   # individual services
   cd services/payment-service && npm install && cd ../..
   cd services/inventory-service && npm install && cd ../..
   cd services/shipping-service && npm install && cd ../..
   cd services/notification-service && npm install && cd ../..
   ```

3. **Setup PostgreSQL and run schema**
   - Create a DB named `orders_db` (or your preferred name).
   - Run:
   ```bash
   psql -U postgres -d orders_db -f orchestrator/src/db/schema.sql
   ```

4. **Configure environment**
   ```bash
   cd orchestrator
   cp .env.example .env
   ```
   Fill `.env` with your local values, for example:
   - `PORT=3000`
   - `DATABASE_URL=postgres://postgres:postgres@localhost:5432/orders_db`
   - `NODE_ENV=development`

5. **Start all services**
   In separate terminals:
   ```bash
   # payment
   cd services/payment-service && npm start

   # inventory
   cd services/inventory-service && npm start

   # shipping
   cd services/shipping-service && npm start

   # notification
   cd services/notification-service && npm start

   # orchestrator
   cd orchestrator && npm start

   # frontend
   cd frontend && npm run dev
   ```

6. **Open frontend**
   - [http://localhost:5173](http://localhost:5173)

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/workflows/start` | POST | Start a new workflow instance |
| `/api/workflows` | GET | List workflow instances with pagination/filter |
| `/api/workflows/:id` | GET | Get one workflow with all task instances |
| `/api/workflows/:id/pause` | POST | Pause a running workflow |
| `/api/workflows/:id/resume` | POST | Resume a paused workflow |
| `/api/workflows/:id/terminate` | POST | Manually terminate workflow (mark failed) |
| `/api/tasks/:taskId/retry` | POST | Retry a failed task instance |
| `/api/workflows/:id/logs` | GET | Fetch task log-style status/output timeline |

## How To Run Tests

From the orchestrator utils folder:

```bash
cd orchestrator/src/utils
node testRun.js
```

What `testRun.js` does:
- Runs a **success scenario** with normal card data.
- Runs a **failure scenario** with card number ending in `0000`.
- Polls workflow status every second and prints a live task status table.
- Prints final summary (total time, completed tasks, failed tasks).

## Known Limitations / Future Improvements

- Current task parallelism visualization in UI is heuristic-based, not dependency-graph aware.
- Workflow definition execution assumes HTTP tasks and has limited task-type extensibility.
- Retry behavior and failure branching can be improved with richer state-machine semantics.
- Test runner is console-based and not integrated into automated CI yet.
- No auth/rate-limiting is enabled on API endpoints (recommended for production).
