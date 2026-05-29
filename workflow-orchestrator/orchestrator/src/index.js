require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const { pool, connect } = require('./db/index');
const workflowRoutes = require('./routes/workflowRoutes');
const repo = require('./db/workflowRepository');
const eventBus = require('./events/eventBus');

const app = express();
app.use(cors());
app.use(express.json());

// request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// mount routes
app.use('/api', workflowRoutes);

// global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, data: {}, error: err.message || 'internal error', timestamp: new Date().toISOString() });
});

async function ensureSchema() {
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;
  const sql = fs.readFileSync(schemaPath, 'utf8');
  
  // Split SQL into statements but respect dollar-quoted blocks ($$ ... $$)
  const statements = [];
  let buffer = '';
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    const two = sql.slice(i, i + 2);
    // toggle on $$
    if (two === '$$') {
      inDollar = !inDollar;
      buffer += two;
      i++; // skip next char as we've consumed two
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && !inDollar) {
      const stmt = buffer.trim();
      if (stmt.length > 0) statements.push(stmt);
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  if (buffer.trim().length > 0) statements.push(buffer.trim());

  console.log(`Applying DB schema incrementally (${statements.length} statements)`);
  
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      // 42710: type already exists, 42P07: relation/table already exists
      if (err.code === '42710' || err.code === '42P07') {
        continue;
      }
      console.error(`Error executing schema statement: "${stmt.slice(0, 50)}..."`, err.message);
      throw err;
    }
  }
  console.log('Incremental schema migrations applied successfully');
}

async function start() {
  const PORT = process.env.PORT || 3000;
  try {
    await connect();
    console.log('Connected to DB');
    try {
      await eventBus.connect();
      console.log('Connected to Redis event bus');
    } catch (err) {
      console.warn('Could not connect to Redis event bus:', err.message || err);
    }
    // Subscribe to external events and persist them without re-publishing
    try {
      await eventBus.subscribe(async (ev) => {
        try {
          // ev expected shape: { type, workflowId, taskId, timestamp, message }
          if (ev && ev.workflowId) {
            await repo.createExternalWorkflowEvent(ev.workflowId, ev.type || 'EXTERNAL_EVENT', ev.taskId || null, ev.message ? ev.message : JSON.stringify(ev));
            console.log('Persisted external event from Redis:', ev.type, ev.workflowId, ev.taskId);
          }
        } catch (err) {
          console.warn('Error persisting external event:', err.message || err);
        }
      });
    } catch (err) {
      console.warn('Failed to subscribe to Redis event bus:', err.message || err);
    }
    await ensureSchema();

    app.listen(PORT, () => {
      console.log(`Orchestrator listening on port ${PORT}`);
      // list routes
      try {
        const routes = [];
        app._router?.stack?.forEach((middleware) => {
          if (middleware.route) {
            const methods = Object.keys(middleware.route.methods || {})
              .map((m) => m.toUpperCase())
              .join(',');
            routes.push(`${methods} ${middleware.route.path}`);
          } else if (middleware.name === 'router' && middleware.handle.stack) {
            middleware.handle.stack.forEach((handler) => {
              if (handler.route) {
                const methods = Object.keys(handler.route.methods || {})
                  .map((m) => m.toUpperCase())
                  .join(',');
                routes.push(`${methods} /api${handler.route.path}`);
              }
            });
          }
        });
        console.log('Registered routes:', routes);
      } catch (e) {
        console.log('Could not enumerate routes', e.message);
      }
    });
  } catch (err) {
    console.error('Failed to start orchestrator', err);
    process.exit(1);
  }
}

start();
