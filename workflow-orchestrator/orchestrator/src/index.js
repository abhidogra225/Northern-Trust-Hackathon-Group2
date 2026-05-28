require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const { pool, connect } = require('./db/index');
const workflowRoutes = require('./routes/workflowRoutes');

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
  try {
    console.log('Applying DB schema (if needed)');
    await pool.query(sql);
    console.log('Schema applied');
  } catch (err) {
    // Schema already exists on restarts (enums/tables created previously)
    if (err.code === '42710' || err.code === '42P07') {
      console.log('Schema already present, skipping');
      return;
    }
    console.error('Error applying schema:', err.message);
    throw err;
  }
}

async function start() {
  const PORT = process.env.PORT || 3000;
  try {
    await connect();
    console.log('Connected to DB');
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
