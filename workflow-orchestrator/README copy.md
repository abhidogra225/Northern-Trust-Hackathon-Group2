## E-Commerce Workflow Orchestrator

<img width="1536" height="1024" alt="ChatGPT Image May 29, 2026, 08_49_01 AM" src="https://github.com/user-attachments/assets/f7776880-2ce9-4219-aa21-f07a7f0a56a8" />

````md
An end-to-end distributed workflow orchestration engine designed to process, monitor, and manage complex e-commerce order lifecycles.

This system integrates a modern React dashboard, a highly resilient Node.js orchestrator, and four specialized downstream microservices:

- Payment Service
- Inventory Service
- Shipping Service
- Notification Service

The platform demonstrates workflow execution, retries, pause/resume semantics, failure recovery, and real-time workflow visualization.

---

# Tech Stack

- Node.js
- Express.js
- React.js
- PostgreSQL
- REST APIs
- Microservices Architecture

---

# Architecture Overview

The system operates on an event-driven and state-driven orchestration model.

The central orchestrator:

- Manages workflow execution state
- Coordinates downstream task execution
- Handles retries and failures
- Stores execution logs
- Enables manual intervention

```text
                  +-----------------------------------+
                  |          React Frontend           |
                  |     Interactive Visualizer        |
                  |         localhost:5173            |
                  +-----------------+-----------------+
                                    |
                                    | HTTP / REST Control
                                    v
                  +-----------------------------------+
                  |         Node.js Orchestrator      |
                  |     State Machine & DB Logger     |
                  |        localhost:3000/api         |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            | HTTP Task Execution   |                       |
            v                       v                       v

+-------------------+   +-------------------+   +-------------------+   +-------------------+
|  Payment Service  |   | Inventory Service |   |  Shipping Service |   | Notification Svc  |
|  localhost:4001   |   |  localhost:4002   |   |  localhost:4003   |   |  localhost:4004   |
+-------------------+   +-------------------+   +-------------------+   +-------------------+
```
````

---

# Core Responsibilities

## Distributed State Locking

Ensures workflow tasks execute safely without race conditions.

## Workflow Coordination

Supports sequential and parallel execution patterns.

## Failure Recovery

Provides retries, workflow pausing, resuming, and termination.

## Audit Logging

Tracks request payloads, response payloads, execution timings, and task status transitions.

## Persistent Workflow State

Stores workflow and task metadata inside PostgreSQL.

---

# Features

- Real-Time Workflow Monitoring
- Live Task Status Visualization
- Pause / Resume Workflow Execution
- Manual Workflow Termination
- Task-Level Retry Mechanism
- Workflow Timeline Logs
- Failure Simulation Support
- RESTful API Architecture
- CLI-Based Integration Testing
- Persistent Database State Management

---

# Prerequisites

Before setting up the project, ensure the following are installed:

- Node.js v18+
- PostgreSQL v14+
- Docker (Optional)

---

# Setup & Installation

## 1. Clone Repository

```bash
git clone <your-repo-url>
cd workflow-orchestrator
```

---

## 2. Install Dependencies

### Install Orchestrator Dependencies

```bash
cd orchestrator && npm install && cd ..
```

### Install Frontend Dependencies

```bash
cd frontend && npm install && cd ..
```

### Install Services Utility Dependencies

```bash
cd services && npm install && cd ..
```

### Install Individual Microservice Dependencies

```bash
cd services/payment-service && npm install && cd ../..
cd services/inventory-service && npm install && cd ../..
cd services/shipping-service && npm install && cd ../..
cd services/notification-service && npm install && cd ../..
```

---

# Database Setup

Create a PostgreSQL database named:

```text
orders_db
```

Run the schema:

```bash
psql -U postgres -d orders_db -f orchestrator/src/db/schema.sql
```

---

# Environment Variables

Generate the `.env` file:

```bash
cd orchestrator
cp .env.example .env
```

Example `.env` configuration:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/orders_db
NODE_ENV=development
```

---

# Running The Project

Start all services in separate terminals.

## Start Payment Service

```bash
cd services/payment-service && npm start
```

## Start Inventory Service

```bash
cd services/inventory-service && npm start
```

## Start Shipping Service

```bash
cd services/shipping-service && npm start
```

## Start Notification Service

```bash
cd services/notification-service && npm start
```

## Start Orchestrator

```bash
cd orchestrator && npm start
```

## Start Frontend

```bash
cd frontend && npm run dev
```

Open the frontend:

```text
http://localhost:5173
```

---

# API Reference

| Endpoint                       | Method | Description                  |
| ------------------------------ | ------ | ---------------------------- |
| `/api/workflows/start`         | POST   | Start a new workflow         |
| `/api/workflows`               | GET    | Fetch all workflow instances |
| `/api/workflows/:id`           | GET    | Fetch workflow details       |
| `/api/workflows/:id/pause`     | POST   | Pause workflow execution     |
| `/api/workflows/:id/resume`    | POST   | Resume paused workflow       |
| `/api/workflows/:id/terminate` | POST   | Terminate active workflow    |
| `/api/tasks/:taskId/retry`     | POST   | Retry failed task            |
| `/api/workflows/:id/logs`      | GET    | Fetch workflow logs          |

---

# Automated Testing

Run the integration test utility:

```bash
cd orchestrator/src/utils
node testRun.js
```

---

# Test Scenarios

## Success Scenario

Uses valid payment information.

Expected result:

- Payment succeeds
- Inventory reserves successfully
- Shipping completes
- Notification is sent

---

## Failure Scenario

Uses card number ending with:

```text
0000
```

Expected result:

- Payment fails
- Workflow halts gracefully
- Downstream tasks stop executing
- Failure state is logged

---

# What The Test Runner Displays

- Live task execution table
- Workflow status refresh every second
- Final execution summary
- Total execution duration
- Completed vs failed tasks

---

# Project Structure

```text
workflow-orchestrator/
│
├── orchestrator/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── utils/
│   │   └── db/
│
├── frontend/
│
├── services/
│   ├── payment-service/
│   ├── inventory-service/
│   ├── shipping-service/
│   └── notification-service/
│
└── README.md
```

---

# Future Improvements

## Workflow Enhancements

- DAG-based dependency execution
- Advanced branching support
- Saga rollback & compensation logic

## Infrastructure Enhancements

- Kafka / RabbitMQ support
- Docker Compose integration
- Kubernetes deployment support

## Security Enhancements

- Authentication & Authorization
- API Rate Limiting
- CORS Hardening
- RBAC (Role-Based Access Control)

```

```
