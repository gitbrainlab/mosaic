#!/usr/bin/env tsx
/**
 * Batch Research Runner for Mosaic
 *
 * Takes a wave config (JSON) and launches many targeted, localized research calls
 * using the enhanced prompts (strong X historical data + strict product photos).
 *
 * Usage:
 *   npx tsx scripts/run-batch-research.ts batches/ice-cream-northeast-wave-2.json --max-parallel=4
 *
 * This is the main tool for scaling to 100+ high-quality micro-batches across states.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface Target {
  name: string;
  location: string;
}

interface WaveConfig {
  wave: string;
  baseTopic: string;
  perLocationLimit: number;
  models: string[];
  targets: Target[];
}

const args = process.argv.slice(2);
const configPath = args[0];
const maxParallelArg = args.find(a => a.startsWith('--max-parallel='))?.split('=')[1];
const MAX_PARALLEL = parseInt(maxParallelArg || '3'); // Be respectful to API

if (!configPath) {
  console.error('Usage: npx tsx scripts/run-batch-research.ts <wave-config.json> [--max-parallel=4]');
  process.exit(1);
}

const config: WaveConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log(`\n=== MOSAIC BATCH RESEARCH RUNNER ===`);
console.log(`Wave: ${config.wave}`);
console.log(`Base Topic: ${config.baseTopic}`);
console.log(`Targets: ${config.targets.length}`);
console.log(`Models per target: ${config.models.join(', ')}`);
console.log(`Max parallel: ${MAX_PARALLEL}\n`);

const runs: any[] = [];

for (const target of config.targets) {
  for (const model of config.models) {
    runs.push({
      topic: config.baseTopic,
      location: target.location,
      model,
      limit: config.perLocationLimit,
      label: `${target.name} @ ${model}`,
    });
  }
}

console.log(`Total research calls to launch: ${runs.length}\n`);

let active = 0;
let completed = 0;
let failed = 0;
const results: any[] = [];

function runOne(run: any): Promise<void> {
  return new Promise((resolve) => {
    active++;
    console.log(`▶ [${completed + failed + 1}/${runs.length}] Starting: ${run.label}`);

    const args = [
      'scripts/research-agent.ts',
      run.topic,
      `--location=${run.location}`,
      `--model=${run.model}`,
      `--limit=${run.limit}`,
    ];

    const child = spawn('npx', ['tsx', ...args], {
      env: {
        ...process.env,
        XAI_API_KEY: process.env.XAI_API_KEY || process.env.XAI_KEY || (fs.existsSync('.xai-key') ? fs.readFileSync('.xai-key', 'utf8').trim() : ''),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => process.stderr.write(d));

    child.on('close', (code) => {
      active--;
      completed++;

      if (code === 0) {
        console.log(`  ✓ Done: ${run.label}`);
        results.push({ ...run, success: true });
      } else {
        failed++;
        console.error(`  ✗ Failed: ${run.label}`);
        results.push({ ...run, success: false });
      }

      resolve();
    });
  });
}

async function main() {
  let nextIndex = 0;
  const workerCount = Math.min(MAX_PARALLEL, runs.length);

  async function worker() {
    while (nextIndex < runs.length) {
      const run = runs[nextIndex++];
      await runOne(run);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  console.log(`\n=== BATCH WAVE COMPLETE ===`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review outputs in data/research-runs/`);
  console.log(`  2. Run ingest on good ones`);
  console.log(`  3. Run validate-map-coordinates.ts (hard gate)`);
  console.log(`  4. Use prepare-photos.ts for sourcing tasks`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(console.error);
