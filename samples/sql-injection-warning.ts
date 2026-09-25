/**
 * Sample intentionally vulnerable to SQL injection for CodeQL / Bugbot demos.
 * Not for production use.
 *
 * CodeQL's js/sql-injection only alerts when a *remote* source (e.g. req.query)
 * flows into a known SQL sink (e.g. pg.Client#query). A plain function parameter
 * is not treated as a remote source, so scanners skip it.
 */

import express from "express";
import pg from "pg";

const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.get("/orders/:orderId", async (req, res) => {
  // BAD: user-controlled value concatenated into SQL
  const sql = `SELECT * FROM orders WHERE id = '${req.params.orderId}'`;
  const result = await pool.query(sql);
  res.json(result.rows);
});

app.get("/orders", async (req, res) => {
  // BAD: query-string input concatenated into SQL
  const sql = `SELECT * FROM orders WHERE customer_name = '${req.query.customerName}' ORDER BY created_at DESC`;
  const result = await pool.query(sql);
  res.json(result.rows);
});

export { app };
