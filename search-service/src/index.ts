import express from 'express';
import searchRouter from './routes/search';
import pool from './db/postgres';

const app  = express();
const PORT = process.env.PORT ?? '8080';

app.use(express.json());

// CORS — allow BFF (and local dev) to call this service
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.get('/health/live',  (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use('/search', searchRouter);

app.listen(PORT, () => {
  console.log(`search-service listening on :${PORT}`);
});
