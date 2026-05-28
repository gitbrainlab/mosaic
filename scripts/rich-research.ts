#!/usr/bin/env tsx
/**
 * Rich Research Orchestrator
 *
 * Runs the research agent many times in parallel against tightly scoped sub-locations
 * using a mix of non-reasoning (good for surfacing) + strong models (good for quality).
 *
 * Goal: Get the richest possible set of real places by avoiding one giant broad query.
 *
 * Usage:
 *   npx tsx scripts/rich-research.ts --base-topic="Veal Parm in the Capital District"
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Reliable models for rich, location-targeted research
const NON_REASONING = 'grok-4.20-0309-non-reasoning';   // Fast, good at surfacing candidates when scoped tightly
const STRONG_DEFAULT = 'grok-4.3';                       // Strong general reasoning model for quality

// Default is Capital District (legacy). For multi-state work, pass --targets-file or additional locations via CLI.
const DEFAULT_TARGETS = [
  { name: 'Albany', location: 'Albany proper and surrounding neighborhoods, NY' },
  { name: 'Saratoga', location: 'Saratoga Springs and surrounding areas, NY' },
  { name: 'Troy', location: 'Troy and Rensselaer, NY' },
  { name: 'Schenectady', location: 'Schenectady, Scotia, and nearby, NY' },
];

// Example multi-state expansion targets (can be loaded from JSON for 100-batch campaigns)
const MULTI_STATE_EXAMPLE = [
  { name: 'Boston', location: 'Boston proper, Cambridge, and immediate suburbs, MA' },
  { name: 'Western MA', location: 'Berkshires, Northampton, Amherst area, MA' },
  { name: 'Burlington', location: 'Burlington and Chittenden County, VT' },
  { name: 'Portland', location: 'Portland and southern Maine coast, ME' },
  { name: 'Providence', location: 'Providence and surrounding Rhode Island, RI' },
];

interface RunConfig {
  topic: string;
  location: string;
  model: string;
  limit: number;
}

function runAgent(config: RunConfig): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      'scripts/research-agent.ts',
      config.topic,
      `--location=${config.location}`,
      `--model=${config.model}`,
      `--limit=${config.limit}`,
    ];

    console.log(`\n▶ Launching: ${config.model} scoped to "${config.location}"`);

    const child = spawn('npx', ['tsx', ...args], {
      env: { ...process.env, XAI_API_KEY: process.env.XAI_API_KEY || (fs.existsSync('.xai-key') ? fs.readFileSync('.xai-key', 'utf8').trim() : '') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); process.stdout.write(d); });
    child.stderr.on('data', (d) => { process.stderr.write(d); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Agent failed with code ${code} for ${config.model} @ ${config.location}`));
      }
    });
  });
}

async function main() {
  const baseTopic = process.argv.find(a => a.startsWith('--base-topic='))?.split('=')[1] || 'Veal Parm in the Capital District';
  const perLocationLimit = parseInt(process.argv.find(a => a.startsWith('--per-limit='))?.split('=')[1] || '5');

  console.log(`\n=== RICH RESEARCH RUN ===`);
  console.log(`Base topic: ${baseTopic}`);
  console.log(`Models: ${NON_REASONING} + ${STRONG_DEFAULT}`);
  console.log(`Targeted locations: ${DEFAULT_TARGETS.map(t => t.name).join(', ')}\n`);

  const runs: RunConfig[] = [];

  // Use non-reasoning for broad candidate discovery in very narrow scopes
  // Use the stronger model for higher quality structured output on the same scopes
  for (const target of DEFAULT_TARGETS) {
    runs.push({
      topic: baseTopic,
      location: target.location,
      model: NON_REASONING,
      limit: perLocationLimit,
    });
    runs.push({
      topic: baseTopic,
      location: target.location,
      model: STRONG_DEFAULT,
      limit: perLocationLimit,
    });
  }

  console.log(`Total parallel research calls: ${runs.length}\n`);

  const results = await Promise.allSettled(runs.map(run => runAgent(run)));

  const successful = results.filter(r => r.status === 'fulfilled').length;
  console.log(`\n=== RICH RESEARCH COMPLETE ===`);
  console.log(`${successful}/${runs.length} targeted research calls succeeded.`);

  // Emit a lightweight Research Batch manifest (new in 2026-05)
  const batchId = `batch-${new Date().toISOString().split('T')[0]}-${baseTopic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const batchManifest = {
    id: batchId,
    name: `${baseTopic} – ${new Date().toISOString().split('T')[0]}`,
    topic: baseTopic,
    createdAt: new Date().toISOString(),
    status: 'ready-for-review',
    source: {
      type: 'manual' as const,
    },
    runs: runs.map((run, index) => ({
      id: `run-${Date.now()}-${index}`,
      batchId,
      startedAt: new Date().toISOString(),
      modelConfig: {
        models: [run.model],
        locationTargets: [run.location],
        perLocationLimit: run.limit,
      },
      summary: {
        entriesProduced: 'see individual output files',
      },
    })),
    summary: {
      totalProfiles: successful * perLocationLimit,
      locationsCovered: DEFAULT_TARGETS.map(t => t.name),
    },
  };

  const batchFile = path.join('public', 'data', 'research-batches', `${batchId}.json`);
  fs.mkdirSync(path.dirname(batchFile), { recursive: true });
  fs.writeFileSync(batchFile, JSON.stringify(batchManifest, null, 2));

  console.log(`\nRaw research artifacts are in data/research-runs/`);
  console.log(`Batch manifest written to: ${batchFile}`);
  console.log(`Use scripts/ingest-research.ts on individual outputs, or aggregate them manually for now.`);
}

main().catch(console.error);
