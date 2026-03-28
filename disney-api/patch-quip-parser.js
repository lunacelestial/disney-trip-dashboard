#!/usr/bin/env node
// patch-fallback-quips.js
// Rewrites _buildFallbackQuips() with punchier, more specific quip copy
// Run from disney-api/ directory: node patch-fallback-quips.js

const fs   = require("fs");
const path = require("path");

const TARGET = path.join(__dirname, "server.js");

if (!fs.existsSync(TARGET)) {
  console.error("❌  server.js not found. Run this from the disney-api/ directory.");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

const OLD = `function _buildFallbackQuips(ride) {
  const quips = [];
  const delta = ride.wait_delta;
  if (delta >= 15)          quips.push(\`\${delta} minutes shorter than usual right now\`);
  else if (delta > 0)       quips.push(\`Shorter wait than normal today\`);
  else if (ride.live_wait <= 15) quips.push(\`Only \${ride.live_wait} minutes — basically a walk-on\`);
  else                      quips.push(\`\${ride.live_wait} min wait — worth it\`);
  if (ride.indoor === 1)    quips.push("Beat the Florida heat inside");
  if (ride.is_favorite)     quips.push("One of your personal favorites");
  if (ride.lightning_lane === "individual") quips.push("Usually needs LL — now it doesn't");
  if (ride.intensity === "extreme")         quips.push("The big one — go now");
  while (quips.length < 3)  quips.push("Great time to head over");
  return quips.slice(0, 3);
}`;

const NEW = `function _buildFallbackQuips(ride) {
  const quips = [];
  const delta    = ride.wait_delta;
  const wait     = ride.live_wait;
  const name     = ride.attraction_name || "this one";

  // ── Line 1: wait-time hook ────────────────────────────────
  if (delta >= 30)          quips.push(\`\${delta} min shorter than usual — rare window\`);
  else if (delta >= 15)     quips.push(\`Wait is \${delta} min below average right now\`);
  else if (delta > 0)       quips.push(\`Shorter than normal — good time to go\`);
  else if (wait !== null && wait <= 10)  quips.push(\`\${wait} min wait — practically a walk-on\`);
  else if (wait !== null && wait <= 20)  quips.push(\`Only \${wait} minutes — well worth it\`);
  else if (wait !== null && wait <= 40)  quips.push(\`\${wait} min wait — about average for this one\`);
  else if (wait !== null)   quips.push(\`Long line but one of the park's best\`);
  else                      quips.push(\`One of the top picks in this park\`);

  // ── Line 2: ride character / context ─────────────────────
  if (ride.is_favorite)                             quips.push(\`A personal favorite — you rated it highly\`);
  else if (ride.lightning_lane === "individual")    quips.push(\`Skips the LL line — saves you real money\`);
  else if (ride.lightning_lane === "standard")      quips.push(\`Grab a Lightning Lane if the line climbs\`);
  else if (ride.intensity === "extreme")            quips.push(\`The park's biggest thrill — don't leave without it\`);
  else if (ride.intensity === "high")               quips.push(\`High energy — great for the whole crew\`);
  else if (ride.type === "dark")                    quips.push(\`Classic dark ride — a Disney staple\`);
  else if (ride.type === "family")                  quips.push(\`Everyone in the group can ride this one\`);
  else if (ride.type === "show")                    quips.push(\`Great chance to sit down and recharge\`);
  else                                              quips.push(\`A crowd favorite in this area of the park\`);

  // ── Line 3: environment / timing tip ─────────────────────
  if (ride.indoor === 1 && ride.prefer_indoor)      quips.push(\`Air-conditioned — perfect break from the heat\`);
  else if (ride.indoor === 1)                       quips.push(\`Fully indoors — cool and comfortable\`);
  else if (ride.height_req && ride.height_req >= 48) quips.push(\`Height req: \${ride.height_req}" — thrill seekers only\`);
  else if (ride.height_req && ride.height_req >= 40) quips.push(\`\${ride.height_req}" height req — most of the crew qualifies\`);
  else if (delta < 0 && Math.abs(delta) >= 10)     quips.push(\`Busier than usual — go early or late in the day\`);
  else                                              quips.push(\`Scores well for this time of day\`);

  return quips.slice(0, 3);
}`;

if (!src.includes(OLD)) {
  console.error("❌  Target function not found — may already be patched, or file has changed.");
  console.error("    Search for '_buildFallbackQuips' in server.js manually.");
  process.exit(1);
}

fs.writeFileSync(TARGET, src.replace(OLD, NEW));
console.log("✅  Patched _buildFallbackQuips with improved quip copy.");
console.log("    Rebuild required: docker compose build --no-cache disney-api && docker compose up -d");