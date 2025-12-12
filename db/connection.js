const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || process.env.DB_HOST_SUPABASE,
  port: process.env.DB_PORT || process.env.DB_PORT_SUPABASE,
  user: process.env.DB_USER || process.env.DB_USER_SUPABASE, 
  password: process.env.DB_PASSWORD || process.env.DB_PASSWORD_SUPABASE,
  database: process.env.DB_NAME || process.env.DB_NAME_SUPABASE,
});

pool.on("connect", () => console.log("✅ Connected to the database"));
pool.on("error", (err) => console.error("❌ Database error:", err));

module.exports = pool;
