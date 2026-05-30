#!/usr/bin/env tsx
/**
 * Mosaic Research Agent
 *
 * Reusable script for deep, high-quality research using Grok (xAI).
 * Designed to be called both locally and from GitHub Actions.
 *
 * Usage examples:
 *   npx tsx scripts/research-agent.ts "Veal Parm in the Capital District"
 *   npx tsx scripts/research-agent.ts "Best bagel shops in Albany area" --limit 12 --model=grok-4.20-0309-non-reasoning
 *   npx tsx scripts/research-agent.ts "Italian restaurants in Troy" --location="Troy, NY" --model=grok-4.20-multi-agent-0309
 */

import fs from 'fs';
import path from 'path';

const API_KEY = process.env.XAI_API_KEY || process.env.XAI_KEY || (fs.existsSync('.xai-key') ? fs.readFileSync('.xai-key', 'utf8').trim() : '');
const API_BASE = 'https://api.x.ai/v1';

// Support CLI overrides: --model=xxx and --location="Targeted area"
const modelArg = process.argv.find(a => a.startsWith('--model='));
const locationArg = process.argv.find(a => a.startsWith('--location='));
const batchArg = process.argv.find(a => a.startsWith('--batch-id='));
const outDirArg = process.argv.find(a => a.startsWith('--out-dir='));
const outFileArg = process.argv.find(a => a.startsWith('--out-file='));

const MODEL = modelArg ? modelArg.split('=')[1] : (process.env.XAI_RESEARCH_MODEL || 'grok-4.3');
const DEFAULT_LOCATION = locationArg ? locationArg.split('=')[1] : 'Capital District (Albany, Saratoga, Troy, Schenectady, NY area)';
const BATCH_ID = batchArg ? batchArg.split('=')[1] : undefined;

if (!API_KEY) {
  console.error('ERROR: XAI_API_KEY not set and .xai-key file not found.');
  process.exit(1);
}

interface Evidence {
  type: 'menu' | 'review' | 'photo' | 'article' | 'interview' | 'other';
  source: string;
  detail?: string;
  url?: string;
  date?: string;
}

interface KnowledgeEntry {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    region?: string;
    country: string;
    lat: number;
    lng: number;
  };
  description: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: Evidence[];
  tags: string[];
  attributes?: Record<string, any>;
}

interface ResearchResult {
  topic: string;
  entries: KnowledgeEntry[];
  meta: {
    model: string;
    timestamp: string;
    passes: number;
    notes: string;
  };
}

async function callGrok(messages: any[], temperature = 0.7, maxTokens = 4000, tools?: any[]) {
  const body: any = {
    model: MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  // If the model wants to use a tool (e.g. X search), we can surface it for now
  const msg = data.choices[0].message;
  if (msg.tool_calls) {
    console.log('Model requested tool calls (X/web search):', JSON.stringify(msg.tool_calls, null, 2));
    // In a future iteration we would execute the tools and continue the conversation
  }

  return msg.content || JSON.stringify(msg.tool_calls || {});
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function researchTopic(topic: string, options: { limit?: number; locationFocus?: string } = {}): Promise<ResearchResult> {
  const { limit = 10, locationFocus = DEFAULT_LOCATION } = options;

  console.log(`\n🔍 Starting deep research on: "${topic}"`);
  console.log(`   Location focus: ${locationFocus}`);
  console.log(`   Using model: ${MODEL}\n`);

  // Pass 1: Discovery of promising real candidates
  const system1 = `You are an elite research agent for Mosaic — a platform that creates exceptionally high-quality, evidence-based, location-accurate knowledge maps. Everything must remain 100% static and real.

## Goal
Find real, verifiable places worth deep investigation for the given topic and location focus.

## Strict Constraints
- Only include real places that actually exist.
- Never fabricate names, addresses, or evidence.
- Prioritize locations with multiple independent sources of confirmation.
- If evidence is weak or conflicting, do not promote the place.
- Stay strictly within the specified location focus.

## Process (Follow Exactly)
Step 1: Brainstorm 15–25 real candidate places based on your knowledge of local sources, reviews, and coverage.
Step 2: Filter ruthlessly to only the strongest, most promising candidates that have verifiable evidence.
Step 3: For each remaining candidate, write a short "why_promising" note that references specific sources or types of coverage.

Begin now. Start with Step 1.

## Deliverable
Return ONLY valid JSON in this exact shape (no extra text):

{
  "candidates": [
    {
      "name": "Exact real name",
      "city": "City",
      "address": "Full street address if known",
      "why_promising": "1-2 sentence justification referencing real sources or coverage"
    }
  ]
}`;

  const user1 = `Topic: ${topic}
Location focus: ${locationFocus}
Target: Find ${limit + 6} promising real candidates worth deep investigation.`;

  const raw1 = await callGrok([
    { role: 'system', content: system1 },
    { role: 'user', content: user1 }
  ], 0.8, 3000);

  let candidates: any[] = [];
  try {
    const parsed = JSON.parse(raw1.replace(/```json|```/g, '').trim());
    candidates = parsed.candidates || [];
  } catch (e) {
    console.warn('Pass 1 parse issue, retrying with stricter prompt...');
    // fallback retry logic could go here
  }

  console.log(`Pass 1 complete: ${candidates.length} candidates identified.`);

  // Pass 2: Deep research + production-grade structured entries
  const system2 = `You are producing production-grade data for Mosaic, a 100% static public knowledge map platform. Data quality is everything.

## Goal
Turn the most promising candidates into a small set of exceptionally high-quality, fully evidenced KnowledgeEntry objects.

## Strict Constraints (Non-Negotiable)
- Every single fact must be real and defensible.
- Never invent addresses, coordinates, history, or evidence.
- For coordinates: You MUST output real, accurate latitude and longitude that matches the real-world street address. Use your knowledge of geography. When in doubt, be conservative and use a verified city-center coordinate rather than hallucinating a wrong spot on the map. Bad coordinates are a hard failure.
- Only use "high" confidence when you have strong, multi-source confirmation.
- If you cannot find solid evidence for a place, drop it rather than weaken the map.
- Keep descriptions factual and evocative — no marketing language.
- All locations must be inside the given location focus.

## X (Twitter) Historical Data — MANDATORY
- You have access to historical X posts via your tools and knowledge.
- For every promising place, actively search/retrieve recent and historical posts (especially 2022–2026) from real customers mentioning the specific food item.
- Prioritize posts that include photos of the actual dish (not the building).
- In evidence, cite real X posts with @username and approximate date when they provide authentic photos or strong confirmation.
- Generate photo search queries that work well on X as well as Instagram/Google.

## Photo Rules (Critical — Non-Negotiable, Product-Centered Only)
- For EVERY kept entry you MUST produce 2–4 high-quality photoBriefs.
- Photos MUST be tightly cropped on the actual food/product (the scoop, the cone with specific toppings, the plated dish, the sundae, the variant).
- Hard reject any brief that would lead to storefront, parking lot, exterior, or generic shop photos.
- Strongly prefer briefs that target recent real customer photos on X (Twitter).
- For each brief, provide:
  - Extremely specific searchQuery (optimized for X + Google/Instagram)
  - expectedVisual (precise description of what must be visible)
  - priority
  - suggestedSource (e.g. "X post by @username from summer 2024 showing the exact flavor")

## Required Process (Follow in Strict Order)
Step 1: Deep verification of each candidate using local sources, reviews, and X posts.
Step 2: Keep only places with strong multi-source evidence (X posts count heavily for recency and authenticity).
Step 3: Write tight factual description.
Step 4: Assign honest confidence.
Step 5: Explicit X + Photo Research Pass: For every entry, research and output 2–4 photoBriefs that heavily leverage recent X posts with real photos of the product.
Step 6: Format exactly as specified.

Begin now. Start with Step 1.

## Deliverable
Return ONLY a valid JSON array of KnowledgeEntry objects using this exact interface (no extra text or explanations):

interface KnowledgeEntry {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    region?: string;
    country: string;
    lat: number;
    lng: number;
  };
  description: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: Array<{
    type: 'article' | 'review' | 'menu' | 'other';
    source: string;
    detail?: string;
    date?: string;
  }>;
  tags: string[];
  attributes?: Record<string, any>;

  // Photos — Must be product-centered only
  photos?: Array<{
    url: string;                    // Filled later during ingest
    caption: string;
    credit?: string;
    type?: 'product' | 'variant' | 'detail';
  }>;

  // Photo research briefs (used by sourcing tools)
  photoBriefs?: Array<{
    searchQuery: string;            // Very specific Google/Instagram search
    expectedVisual: string;         // What the photo should clearly show
    priority: 'high' | 'medium';
    suggestedSource?: string;       // e.g. "Restaurant Instagram @lombardosalbany, March 2024 post"
  }>;
}`;

  const user2 = `Research topic: ${topic}
Location focus: ${locationFocus}

Deep research the following candidates and turn the best ${limit} into properly structured entries:

${candidates.map((c, i) => `${i+1}. ${c.name} — ${c.city} (${c.why_promising})`).join('\n')}

Produce the final JSON array now.`;

  const raw2 = await callGrok([
    { role: 'system', content: system2 },
    { role: 'user', content: user2 }
  ], 0.6, 4500);

  let entries: KnowledgeEntry[] = [];
  try {
    const cleaned = raw2.replace(/```json|```/g, '').trim();
    entries = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse structured output from Grok. Raw response:');
    console.error(raw2);
    throw e;
  }

  console.log(`Pass 2 complete: ${entries.length} structured entries generated.`);

  // Pass 3: Light validation + cleanup (we can add more sophisticated critique later)
  const finalEntries = entries.slice(0, limit).map((entry, index) => ({
    ...entry,
    id: entry.id || `${slugify(topic).slice(0, 3)}-${String(index + 1).padStart(3, '0')}`,
  }));

  return {
    topic,
    batchId: BATCH_ID,
    entries: finalEntries,
    meta: {
      model: MODEL,
      timestamp: new Date().toISOString(),
      passes: 3,
      notes: `Real Grok research run. ${finalEntries.length} entries produced.`,
    }
  };
}

async function main() {
  const topic = process.argv[2] || 'Veal Parm in the Capital District';
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '8');

  const result = await researchTopic(topic, { limit });

  const outDir = outDirArg ? path.resolve(outDirArg.split('=')[1]) : path.join(process.cwd(), 'data', 'research-runs');
  fs.mkdirSync(outDir, { recursive: true });

  const safeSlug = slugify(topic);
  const outFile = outFileArg ? path.resolve(outFileArg.split('=')[1]) : path.join(outDir, `${safeSlug}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(`\n✅ Research complete.`);
  console.log(`   Saved to: ${outFile}`);
  console.log(`   Entries: ${result.entries.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
