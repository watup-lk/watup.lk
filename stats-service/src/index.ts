import express from 'express';
import { statsRouter, analyticsRouter } from './routes/stats';
import pool from './db/postgres';

const app  = express();
const PORT = process.env.PORT ?? '8080';

app.use(express.json());

// CORS — allow BFF to call this service
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use('/stats',     statsRouter);
app.use('/analytics', analyticsRouter);

app.listen(PORT, () => {
  console.log(`stats-service listening on :${PORT}`);
});
