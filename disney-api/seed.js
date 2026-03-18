#!/usr/bin/env node
// ============================================================
// Seed venues into the Disney API
// Run: node seed.js <admin-token>
// Get your admin token by logging in via the API first.
// ============================================================

const fs = require("fs");
const path = require("path");

const API_BASE = process.env.API_URL || "http://localhost:3001";
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.log("Usage: node seed.js <admin-token>");
  console.log("");
  console.log("To get an admin token, first add your email to the users table,");
  console.log("then call: curl -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"your@email.com\"}'");
  console.log("Copy the token from the response.");
  process.exit(1);
}

async function seed() {
  const venues = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-venues.json"), "utf8"));
  console.log(`📋 Seeding ${venues.length} venues...`);

  const res = await fetch(`${API_BASE}/api/admin/venues/seed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(venues),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`✅ Done! Added ${result.added} new venues (${result.total} total in database).`);
}

seed().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});