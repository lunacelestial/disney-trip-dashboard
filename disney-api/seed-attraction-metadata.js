#!/usr/bin/env node
// ============================================================
// Attraction Metadata Seeder
// Seeds attraction_metadata table in disney.db with curated
// data for all 4 WDW parks. Run once (or re-run safely —
// uses INSERT OR REPLACE so duplicates are just updated).
//
// Usage:
//   node seed-attraction-metadata.js
//
// In Docker:
//   docker exec disney_api_dev node /app/seed-attraction-metadata.js
// ============================================================

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

const DATA_DIR = fs.existsSync("/data") ? "/data" : __dirname;
const DB_PATH  = path.join(DATA_DIR, "disney.db");

console.log(`📂 Opening database at: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ── Create table ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS attraction_metadata (
    attraction_name   TEXT PRIMARY KEY,
    park_id           TEXT NOT NULL,
    height_req        INTEGER,          -- inches; NULL = no requirement
    intensity         TEXT NOT NULL,    -- 'low' | 'moderate' | 'high' | 'extreme'
    indoor            INTEGER NOT NULL DEFAULT 1, -- 1=indoor/covered, 0=outdoor
    type              TEXT NOT NULL,    -- 'thrill' | 'dark' | 'family' | 'show' | 'transport' | 'water'
    lightning_lane    TEXT NOT NULL DEFAULT 'none', -- 'none' | 'standard' | 'individual'
    accessibility     TEXT DEFAULT '',  -- comma-separated notes
    description       TEXT DEFAULT '',  -- 1-2 sentences for LLM context
    updated           TEXT DEFAULT (datetime('now'))
  );
`);

const upsert = db.prepare(`
  INSERT OR REPLACE INTO attraction_metadata
    (attraction_name, park_id, height_req, intensity, indoor, type, lightning_lane, accessibility, description)
  VALUES
    (@attraction_name, @park_id, @height_req, @intensity, @indoor, @type, @lightning_lane, @accessibility, @description)
`);

// ── Park IDs (match ThemeParks.wiki / wait_snapshots) ────────
const PARKS = {
  MK: "75ea578a-adc8-4116-a54d-dccb60765ef9",
  EP: "47f90d2c-e191-4239-a466-5892ef59a88b",
  HS: "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
  AK: "1c84a229-8862-4648-9c71-378ddd2c7693",
};

// ── Seed data ─────────────────────────────────────────────────
// Fields: attraction_name (must fuzzy-match ThemeParks.wiki names),
//         park_id, height_req (inches or null), intensity,
//         indoor (1/0), type, lightning_lane, accessibility, description
const ATTRACTIONS = [

  // ══════════════════════════════════════════════════════════
  // MAGIC KINGDOM
  // ══════════════════════════════════════════════════════════

  {
    attraction_name: "Space Mountain",
    park_id: PARKS.MK,
    height_req: 44,
    intensity: "high",
    indoor: 1,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Indoor roller coaster through a darkened space-themed environment with sharp turns and sudden drops. A Magic Kingdom icon."
  },
  {
    attraction_name: "Big Thunder Mountain Railroad",
    park_id: PARKS.MK,
    height_req: 40,
    intensity: "moderate",
    indoor: 0,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Wild mine train coaster through the American Southwest desert. Fast, bumpy, and great for families ready for their first coaster."
  },
  {
    attraction_name: "Tiana's Bayou Adventure",
    park_id: PARKS.MK,
    height_req: 40,
    intensity: "moderate",
    indoor: 0,
    type: "water",
    lightning_lane: "individual",
    accessibility: "no_standing",
    description: "Log flume ride through the bayou with Princess Tiana and friends, climaxing in a five-story plunge. You will get wet."
  },
  {
    attraction_name: "TRON Lightcycle / Run",
    park_id: PARKS.MK,
    height_req: 48,
    intensity: "extreme",
    indoor: 1,
    type: "thrill",
    lightning_lane: "individual",
    accessibility: "no_standing",
    description: "Magic Kingdom's fastest coaster launches riders on lightcycle motorbikes through a neon TRON universe. High-demand must-do."
  },
  {
    attraction_name: "Seven Dwarfs Mine Train",
    park_id: PARKS.MK,
    height_req: 38,
    intensity: "moderate",
    indoor: 0,
    type: "family",
    lightning_lane: "individual",
    accessibility: "no_standing",
    description: "Gentle swinging mine train through the dwarfs' diamond mine with beautiful scenes. Perennially the longest wait in Magic Kingdom."
  },
  {
    attraction_name: "Haunted Mansion",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Beloved slow-moving dark ride through a mansion of 999 happy haunts. Spooky but not scary — a timeless classic."
  },
  {
    attraction_name: "Pirates of the Caribbean",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Classic boat ride through swashbuckling pirate scenes with two small drops. Cool, dark, and relaxing — perfect midday."
  },
  {
    attraction_name: "\"it's a small world\"",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Iconic slow boat ride through colorful scenes of singing children from around the world. Gentle and great for all ages."
  },
  {
    attraction_name: "Peter Pan's Flight",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Suspended omnimover ride soaring over London and Neverland at night. Short but magical — consistently earns a long wait."
  },
  {
    attraction_name: "The Many Adventures of Winnie the Pooh",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Gentle trackless ride through the Hundred Acre Wood. Perfect for young children and nostalgic adults."
  },
  {
    attraction_name: "Buzz Lightyear's Space Ranger Spin",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "standard",
    accessibility: "wheelchair_accessible",
    description: "Interactive dark ride where guests shoot laser cannons to score points alongside Buzz Lightyear. Competitive and fun."
  },
  {
    attraction_name: "Tomorrowland Speedway",
    park_id: PARKS.MK,
    height_req: 32,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Gas-powered cars on a guided track — kids love driving for the first time. Long waits, short ride, but a rite of passage."
  },
  {
    attraction_name: "Walt Disney World Railroad",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "transport",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Scenic steam train circling Magic Kingdom with stops at Main Street, Frontierland, and Fantasyland. Great feet-saver."
  },
  {
    attraction_name: "Jungle Cruise",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Boat tour through animatronic jungle scenes with famously corny skipper puns. A classic that's been updated with more diversity."
  },
  {
    attraction_name: "Under the Sea - Journey of the Little Mermaid",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Clamshell omnimover ride through scenes from The Little Mermaid. Cool, air-conditioned, and great for small children."
  },
  {
    attraction_name: "Dumbo the Flying Elephant",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Classic spinning elephant ride that goes up and down. Beloved by toddlers and families — includes an indoor play area."
  },
  {
    attraction_name: "Mad Tea Party",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "moderate",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Spinning teacup ride guests control themselves. Fun but can cause motion sickness — spin fast at your own risk."
  },
  {
    attraction_name: "The Barnstormer",
    park_id: PARKS.MK,
    height_req: 35,
    intensity: "low",
    indoor: 0,
    type: "thrill",
    lightning_lane: "none",
    accessibility: "no_standing",
    description: "Small, short coaster themed to Goofy's barnstorming air show. Ideal first coaster for young thrill-seekers."
  },
  {
    attraction_name: "Tomorrowland Transit Authority PeopleMover",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "transport",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Elevated slow ride through Tomorrowland with a preview of Space Mountain interior. Rarely has a wait — perfect rest break."
  },
  {
    attraction_name: "Monsters Inc. Laugh Floor",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Interactive comedy show where animated Monsters Inc. characters riff with the live audience. Clever and hilarious."
  },
  {
    attraction_name: "Walt Disney's Carousel of Progress",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Rotating theater attraction about American technological progress across the 20th century. An original Walt Disney World attraction."
  },
  {
    attraction_name: "Walt Disney's Enchanted Tiki Room",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Classic audio-animatronic show with singing birds, flowers, and tikis in an air-conditioned theater. A cool, relaxing break."
  },
  {
    attraction_name: "Mickey's PhilharMagic",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "standard",
    accessibility: "wheelchair_accessible",
    description: "4D film experience with iconic Disney song moments through Donald Duck's perspective. Air-conditioned and family-perfect."
  },
  {
    attraction_name: "The Hall of Presidents",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Audio-animatronic tribute to all U.S. Presidents. Air-conditioned theater — great midday escape with educational value."
  },
  {
    attraction_name: "Liberty Belle Riverboat",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "transport",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Large steamboat cruising the Rivers of America. Scenic and relaxing — rarely a long wait and great views."
  },
  {
    attraction_name: "The Magic Carpets of Aladdin",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Spinning aerial ride on magic carpets in Adventureland. Similar to Dumbo — gentle and great for young kids."
  },
  {
    attraction_name: "Astro Orbiter",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Elevated spinning rocket ride high above Tomorrowland. Slow-loading with nice views but can feel intense due to height and tilt."
  },
  {
    attraction_name: "Prince Charming Regal Carrousel",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Classic carousel in front of Cinderella Castle with beautifully hand-painted horses. A quick, charming ride for all ages."
  },
  {
    attraction_name: "Swiss Family Treehouse",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Walk-through attraction exploring the multi-level treehouse from Swiss Family Robinson. Self-paced with nice views."
  },
  {
    attraction_name: "Enchanted Tales with Belle",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Interactive storytelling experience in Beast's Castle where guests help retell Beauty and the Beast. Charming for young children."
  },
  {
    attraction_name: "Country Bear Musical Jamboree",
    park_id: PARKS.MK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Audio-animatronic bear show with country music performances. Recently updated with new songs — a fun, air-conditioned break."
  },

  // ══════════════════════════════════════════════════════════
  // EPCOT
  // ══════════════════════════════════════════════════════════

  {
    attraction_name: "Guardians of the Galaxy: Cosmic Rewind",
    park_id: PARKS.EP,
    height_req: 42,
    intensity: "high",
    indoor: 1,
    type: "thrill",
    lightning_lane: "individual",
    accessibility: "no_standing",
    description: "Reverse-launched indoor roller coaster set to an awesome 80s soundtrack. First reverse-launch coaster at Disney — extremely popular."
  },
  {
    attraction_name: "Test Track",
    park_id: PARKS.EP,
    height_req: 40,
    intensity: "moderate",
    indoor: 1,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Design a SimCar then test it at 65mph through temperature extremes and a banked outdoor turn. Great interactive element."
  },
  {
    attraction_name: "Soarin' Around the World",
    park_id: PARKS.EP,
    height_req: 40,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "standard",
    accessibility: "limited",
    description: "Suspended hang-gliding simulation over world landmarks with scent effects. Incredibly popular — a must-do at EPCOT."
  },
  {
    attraction_name: "Frozen Ever After",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Boat ride through Arendelle with beloved Frozen characters and songs. Consistently one of EPCOT's longest waits."
  },
  {
    attraction_name: "Remy's Ratatouille Adventure",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Trackless ride shrunk to the size of Remy scurrying through Gusteau's restaurant. Charming for all ages."
  },
  {
    attraction_name: "Mission: SPACE",
    park_id: PARKS.EP,
    height_req: 44,
    intensity: "extreme",
    indoor: 1,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Intense centrifuge simulator of a trip to Mars (Orange Mission) or milder Earth orbit (Green Mission). Not for claustrophobics."
  },
  {
    attraction_name: "Living with the Land",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "standard",
    accessibility: "wheelchair_accessible",
    description: "Gentle boat ride through working greenhouses and aquaculture labs. Educational and serene — fish served at The Garden Grill."
  },
  {
    attraction_name: "The Seas with Nemo & Friends",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "none",
    accessibility: "wheelchair_transfer",
    description: "Clamshell ride through ocean scenes with Nemo and friends above a real aquarium. Seamlessly blends animation with live sea life."
  },
  {
    attraction_name: "Spaceship Earth",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "none",
    accessibility: "wheelchair_transfer",
    description: "Slow journey through 40,000 years of human communication history inside the EPCOT geodesic sphere. A timeless icon."
  },
  {
    attraction_name: "Journey of Water, Inspired by Moana",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Walk-through water play experience inspired by Moana's connection to the ocean. Interactive water features — expect to get splashed."
  },
  {
    attraction_name: "Journey Into Imagination With Figment",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "none",
    accessibility: "wheelchair_transfer",
    description: "Dark ride through the Imagination Institute with the beloved purple dragon Figment. A cult classic with sensory surprises."
  },
  {
    attraction_name: "Gran Fiesta Tour Starring The Three Caballeros",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "none",
    accessibility: "wheelchair_transfer",
    description: "Gentle boat ride through the Mexico Pavilion pyramid with animated Three Caballeros scenes. Cool, rarely a wait, and charming."
  },
  {
    attraction_name: "The American Adventure",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Audio-animatronic stage show tracing American history hosted by Ben Franklin and Mark Twain. Impressive technology and moving."
  },
  {
    attraction_name: "Turtle Talk With Crush",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Interactive animated show where Crush from Finding Nemo talks live with the audience. Hilarious and surprisingly responsive."
  },
  {
    attraction_name: "Canada Far and Wide in Circle-Vision 360",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Standing Circle-Vision 360 film showcasing Canadian landscapes and culture. Beautiful cinematography and air-conditioned."
  },
  {
    attraction_name: "Awesome Planet",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "In-theater film about Earth's natural wonders and environmental stewardship in The Land pavilion."
  },
  {
    attraction_name: "Disney and Pixar Short Film Festival",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "4D presentation of animated Pixar shorts with in-theater effects. Air-conditioned and a good rest stop."
  },
  {
    attraction_name: "Reflections of China",
    park_id: PARKS.EP,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Circle-Vision 360 film tour of China's landscapes, cities, and culture. Standing room only but beautiful visuals."
  },

  // ══════════════════════════════════════════════════════════
  // HOLLYWOOD STUDIOS
  // ══════════════════════════════════════════════════════════

  {
    attraction_name: "Star Wars: Rise of the Resistance",
    park_id: PARKS.HS,
    height_req: 40,
    intensity: "moderate",
    indoor: 1,
    type: "dark",
    lightning_lane: "individual",
    accessibility: "no_standing",
    description: "Massive immersive experience where guests are captured by the First Order. Multi-system ride combining screens, sets, and trackless vehicles. The most impressive attraction Disney has ever built."
  },
  {
    attraction_name: "Millennium Falcon: Smugglers Run",
    park_id: PARKS.HS,
    height_req: 38,
    intensity: "moderate",
    indoor: 1,
    type: "family",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Interactive cockpit ride on the actual Millennium Falcon where guests pilot, shoot, or operate as crew. Experience varies by role — pilots have the most action."
  },
  {
    attraction_name: "Slinky Dog Dash",
    park_id: PARKS.HS,
    height_req: 38,
    intensity: "moderate",
    indoor: 0,
    type: "family",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Fun family coaster through Andy's backyard with a great launch and sweet bunny hills. Consistently one of the longest waits in the park."
  },
  {
    attraction_name: "The Twilight Zone Tower of Terror",
    park_id: PARKS.HS,
    height_req: 40,
    intensity: "extreme",
    indoor: 1,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Haunted hotel drop tower with randomized free-fall sequences inside The Hollywood Tower Hotel. Iconic thriller — dark, creepy, and thrilling."
  },
  {
    attraction_name: "Rock 'n' Roller Coaster Starring Aerosmith",
    park_id: PARKS.HS,
    height_req: 48,
    intensity: "extreme",
    indoor: 1,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Launch coaster from 0 to 57mph in 2.8 seconds with inversions set to Aerosmith's greatest hits. Disney's only inverting coaster."
  },
  {
    attraction_name: "Mickey & Minnie's Runaway Railway",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Trackless dark ride stepping into a Mickey Mouse cartoon short. First Disney ride to feature Mickey as the star — visually stunning."
  },
  {
    attraction_name: "Indiana Jones\u2122 Epic Stunt Spectacular!",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Live stunt show recreating action sequences from Raiders of the Lost Ark with guest participation. A Hollywood Studios tradition."
  },
  {
    attraction_name: "Toy Story Mania!",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "family",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "4D carnival shooting gallery ride through Toy Story mini-games. Competitive fun for all ages — scores shown at end."
  },
  {
    attraction_name: "Alien Swirling Saucers",
    park_id: PARKS.HS,
    height_req: 32,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "limited",
    description: "Spinning teacup-style ride themed to Little Green Men from Toy Story. Fun for young children, mild motion for others."
  },
  {
    attraction_name: "Star Tours \u2013 The Adventures Continue",
    park_id: PARKS.HS,
    height_req: 40,
    intensity: "moderate",
    indoor: 1,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "3D motion simulator starship ride through randomized Star Wars scenarios — over 70 possible combinations. Classic but still holds up."
  },
  {
    attraction_name: "Lightning McQueen's Racing Academy",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Screen-based show with an animatronic Lightning McQueen teaching racing skills. Short, air-conditioned, and great for Cars fans."
  },
  {
    attraction_name: "Muppet*Vision 3D",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Classic 3D film and theater effects show with all the Muppets characters. Hilarious comedy holds up decades later."
  },
  {
    attraction_name: "Beauty and the Beast \u2013 Live on Stage",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Live musical stage show retelling Beauty and the Beast with elaborate costumes and sets. A Hollywood Studios staple."
  },
  {
    attraction_name: "For the First Time in Forever: A Frozen Sing-Along Celebration",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Sing-along show retelling Frozen's story with live hosts and audience participation. Air-conditioned and fun for all ages."
  },
  {
    attraction_name: "The Little Mermaid \u2013 A Musical Adventure \u2013 New!",
    park_id: PARKS.HS,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "New live musical show featuring The Little Mermaid with puppetry and special effects."
  },

  // ══════════════════════════════════════════════════════════
  // ANIMAL KINGDOM
  // ══════════════════════════════════════════════════════════

  {
    attraction_name: "Avatar Flight of Passage",
    park_id: PARKS.AK,
    height_req: 44,
    intensity: "high",
    indoor: 1,
    type: "thrill",
    lightning_lane: "individual",
    accessibility: "no_standing",
    description: "Banshee simulator flying over Pandora in 3D with physical motion and scent. The most immersive ride Disney has ever built — worth every minute of wait."
  },
  {
    attraction_name: "Na'vi River Journey",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Gentle boat ride through bioluminescent Pandoran forest to the Shaman of Songs. Visually breathtaking, especially at night."
  },
  {
    attraction_name: "Expedition Everest - Legend of the Forbidden Mountain",
    park_id: PARKS.AK,
    height_req: 44,
    intensity: "high",
    indoor: 0,
    type: "thrill",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Roller coaster charging toward the Yeti on Mount Everest — including a backwards sequence in the dark. Animal Kingdom's marquee thrill."
  },
  {
    attraction_name: "Kilimanjaro Safaris",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "standard",
    accessibility: "wheelchair_accessible",
    description: "Open-vehicle safari through 110 acres of African savanna with real animals. Best in morning when animals are most active."
  },
  {
    attraction_name: "Kali River Rapids",
    park_id: PARKS.AK,
    height_req: 38,
    intensity: "moderate",
    indoor: 0,
    type: "water",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Circular raft ride with guaranteed splashing through Asia's logging destruction story. Wear sandals — you will get soaked."
  },
  {
    attraction_name: "Dinosaur",
    park_id: PARKS.AK,
    height_req: 40,
    intensity: "high",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Time-travel vehicle ride through the Cretaceous era dodging large dinosaurs before an asteroid strike. Dark, loud, and intense — can frighten young children."
  },
  {
    attraction_name: "DINOSAUR",
    park_id: PARKS.AK,
    height_req: 40,
    intensity: "high",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "no_standing",
    description: "Time-travel vehicle ride through the Cretaceous era dodging large dinosaurs before an asteroid strike. Dark, loud, and intense — can frighten young children."
  },
  {
    attraction_name: "Primeval Whirl",
    park_id: PARKS.AK,
    height_req: 48,
    intensity: "moderate",
    indoor: 0,
    type: "thrill",
    lightning_lane: "none",
    accessibility: "no_standing",
    description: "Spinning wild mouse coaster themed to time-traveling dinosaurs. Seasonal operation — spins can be rough for some guests."
  },
  {
    attraction_name: "Wildlife Express Train",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "transport",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Narrated train to Rafiki's Planet Watch conservation center. The only way to reach Rafiki's — not a thrill ride but an interesting journey."
  },
  {
    attraction_name: "Gorilla Falls Exploration Trail",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "family",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Self-guided walking trail through African animal habitats including gorillas, hippos, and exotic birds. Often overlooked — worth exploring."
  },
  {
    attraction_name: "It's Tough to Be a Bug!",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "moderate",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "4D bug-themed show inside the Tree of Life with sensory effects including stings, smells, and air blasts. Can frighten small children."
  },
  {
    attraction_name: "Finding Nemo: The Big Blue... and Beyond!",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Updated musical show featuring Finding Nemo characters with live performers and puppets. Replaced Finding Nemo The Musical."
  },
  {
    attraction_name: "Rivers of Light",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Nighttime water and light show on Discovery River. Seasonal — check park schedule. Spectacular when operating."
  },
  {
    attraction_name: "UP! A Great Bird Adventure",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Outdoor bird show with Dug and Russell from UP featuring real exotic birds. Educational, fun, and frequently overlooked."
  },
  {
    attraction_name: "Feathered Friends in Flight!",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 0,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Outdoor show featuring exotic birds in free flight. Fun and educational — a successor to the Flights of Wonder show."
  },
  {
    attraction_name: "Festival of the Lion King",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "show",
    lightning_lane: "none",
    accessibility: "wheelchair_accessible",
    description: "Broadway-caliber musical celebration of The Lion King with acrobatics, puppetry, and audience participation. A must-see."
  },
  {
    attraction_name: "Zootopia: Better Zoogether! - NEW!",
    park_id: PARKS.AK,
    height_req: null,
    intensity: "low",
    indoor: 1,
    type: "dark",
    lightning_lane: "standard",
    accessibility: "wheelchair_transfer",
    description: "Trackless dark ride through the world of Zootopia with Judy Hopps and Nick Wilde. Disney's newest Animal Kingdom attraction."
  },
];

// ── Run seed ──────────────────────────────────────────────────
const seedAll = db.transaction(() => {
  let inserted = 0;
  let updated  = 0;

  for (const a of ATTRACTIONS) {
    const existing = db.prepare(
      "SELECT attraction_name FROM attraction_metadata WHERE attraction_name = ?"
    ).get(a.attraction_name);

    upsert.run(a);
    if (existing) updated++;
    else inserted++;
  }

  return { inserted, updated };
});

try {
  const { inserted, updated } = seedAll();
  console.log(`✅ Seed complete: ${inserted} inserted, ${updated} updated`);
  console.log(`📊 Total attractions: ${ATTRACTIONS.length}`);

  // Quick sanity check — print count per park
  const counts = db.prepare(`
    SELECT park_id, COUNT(*) as cnt
    FROM attraction_metadata
    GROUP BY park_id
  `).all();

  const PARK_NAMES = {
    [PARKS.MK]: "Magic Kingdom",
    [PARKS.EP]: "EPCOT",
    [PARKS.HS]: "Hollywood Studios",
    [PARKS.AK]: "Animal Kingdom",
  };
  console.log("\n📍 Attractions per park:");
  counts.forEach(r => {
    console.log(`   ${PARK_NAMES[r.park_id] || r.park_id}: ${r.cnt}`);
  });

} catch (err) {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
}