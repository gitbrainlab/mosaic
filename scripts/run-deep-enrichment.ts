#!/usr/bin/env tsx
/**
 * Execute a Mosaic deep-enrichment prompt pack with a research model.
 *
 * This is the model-backed step between `enrich-candidates.ts` and
 * `verify-enrichment-sources.ts`. It reads a prompt pack, calls xAI/Grok using
 * the strict embedded prompt, writes the model's passed/rejected artifact, and
 * leaves public map data untouched.
 *
 * Usage:
 *   npx tsx scripts/run-deep-enrichment.ts \
 *     --input=data/enrichment-runs/ice-cream-quality-recovery-wave-1-...-prompt-pack.json \
 *     --model=grok-4.3
 *
 *   npx tsx scripts/run-deep-enrichment.ts --input=... --dry-run
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

interface PromptPack {
  wave?: string;
  generatedAt?: string;
  status?: string;
  selectedCount?: number;
  selectedCandidates?: Array<{ id?: string; name: string }>;
  deepResearchPrompt?: string;
}

interface EnrichmentResult {
  wave?: string;
  generatedAt?: string;
  passed?: any[];
  rejected?: any[];
  openQuestions?: string[];
}

const API_BASE = process.env.XAI_API_BASE || 'https://api.x.ai/v1';

function argValue(name: string, fallback?: string) {
  const arg = process.argv.find(item => item.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function slugify(text: string) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function apiKey() {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  if (process.env.XAI_KEY) return process.env.XAI_KEY;
  if (fs.existsSync('.xai-key')) return fs.readFileSync('.xai-key', 'utf8').trim();
  return '';
}

function cleanJsonText(raw: string) {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseModelJson(raw: string): EnrichmentResult {
  const cleaned = cleanJsonText(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Model response did not contain parseable JSON.');
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasStreetAddress(value: unknown) {
  return typeof value === 'string' &&
    /\d/.test(value) &&
    !/(multiple|area|unknown|city center|downtown|various|nearby|tbd)/i.test(value);
}

function hasHttpUrl(value: unknown) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function qualityIssues(result: EnrichmentResult) {
  const issues: string[] = [];

  if (!Array.isArray(result.passed)) issues.push('passed must be an array');
  if (!Array.isArray(result.rejected)) issues.push('rejected must be an array');

  for (const entry of result.passed || []) {
    const label = entry?.name || entry?.id || 'unknown entry';
    const location = entry?.location || {};
    const photos = Array.isArray(entry?.photos) ? entry.photos : [];
    const photoEvidence = Array.isArray(entry?.photoEvidence) ? entry.photoEvidence : [];
    const verifiedPhotoEvidence = photoEvidence.filter((photo: any) => photo?.verified && hasHttpUrl(photo?.url));
    const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
    const sources = Array.isArray(entry?.sources) ? entry.sources : [];

    if (!entry?.id) issues.push(`${label}: missing id`);
    if (!entry?.name) issues.push(`${label}: missing name`);
    if (!hasStreetAddress(location.address)) issues.push(`${label}: missing exact street address`);
    if (!isFiniteNumber(location.lat) || !isFiniteNumber(location.lng)) issues.push(`${label}: missing numeric address-level coordinates`);
    if (!['high', 'medium', 'low'].includes(entry?.confidence)) issues.push(`${label}: invalid confidence`);
    if (evidence.length === 0) issues.push(`${label}: missing evidence`);
    if (!evidence.some((item: any) => hasHttpUrl(item?.url)) && !sources.some(hasHttpUrl)) {
      issues.push(`${label}: missing source/evidence URL`);
    }
    if (photos.length < 2) issues.push(`${label}: needs at least two product photos`);
    if (verifiedPhotoEvidence.length < 2) issues.push(`${label}: needs at least two verified photoEvidence URLs`);
  }

  return issues;
}

function resultStatus(result: EnrichmentResult, issues: string[]) {
  if (issues.length > 0) return 'model_result_needs_review';
  if ((result.passed?.length || 0) === 0) return 'model_result_no_passes';
  return 'model_result_ready_for_verification';
}

async function callModel(prompt: string, model: string, maxTokens: number, temperature: number) {
  const key = apiKey();
  if (!key) {
    throw new Error('XAI_API_KEY/XAI_KEY is not set and .xai-key was not found. Use --dry-run to validate the prompt pack without calling the model.');
  }

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: 'You are a strict research execution agent. Return only valid JSON matching the user prompt. Do not include markdown.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`xAI API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('xAI response did not include choices[0].message.content.');
  return content as string;
}

const inputPath = argValue('input');
const outDir = argValue('out-dir', 'data/enrichment-runs')!;
const model = argValue('model', process.env.XAI_RESEARCH_MODEL || 'grok-4.3')!;
const maxTokens = Number(argValue('max-tokens', '12000'));
const temperature = Number(argValue('temperature', '0.2'));
const dryRun = hasFlag('dry-run');
const runVerifier = hasFlag('verify');
const verifierLimit = argValue('verify-limit', '10')!;
const verifierMaxUrls = argValue('verify-max-urls', '4')!;

if (!inputPath) {
  console.error('Usage: npx tsx scripts/run-deep-enrichment.ts --input=<prompt-pack.json> [--model=grok-4.3] [--dry-run] [--verify]');
  process.exit(1);
}

const promptPack = readJson<PromptPack>(inputPath);
if (!promptPack.deepResearchPrompt) {
  console.error('Input prompt pack must include deepResearchPrompt.');
  process.exit(1);
}

const generatedAt = new Date().toISOString();
const runId = `${slugify(promptPack.wave || path.basename(inputPath, '.json'))}-${generatedAt.replace(/[:.]/g, '-')}`;
fs.mkdirSync(outDir, { recursive: true });

if (dryRun) {
  const outFile = path.join(outDir, `${runId}-dry-run.json`);
  const artifact = {
    wave: promptPack.wave,
    generatedAt,
    sourcePromptPack: inputPath,
    status: 'dry_run_only',
    publicPromotionAllowed: false,
    model,
    selectedCount: promptPack.selectedCount ?? promptPack.selectedCandidates?.length ?? null,
    promptCharacters: promptPack.deepResearchPrompt.length,
    promptPreview: promptPack.deepResearchPrompt.slice(0, 1200),
    nextCommand: `npx tsx scripts/run-deep-enrichment.ts --input=${inputPath} --model=${model} --verify`,
  };
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote dry-run artifact: ${outFile}`);
  process.exit(0);
}

console.log(`Running deep enrichment for ${promptPack.wave || inputPath}`);
console.log(`Model: ${model}`);
const rawModelResponse = await callModel(promptPack.deepResearchPrompt, model, maxTokens, temperature);
const parsed = parseModelJson(rawModelResponse);
const issues = qualityIssues(parsed);

const outFile = path.join(outDir, `${runId}-model-result.json`);
const artifact = {
  wave: parsed.wave || promptPack.wave,
  generatedAt,
  sourcePromptPack: inputPath,
  status: resultStatus(parsed, issues),
  publicPromotionAllowed: false,
  model,
  selectedCount: promptPack.selectedCount ?? promptPack.selectedCandidates?.length ?? null,
  passedCount: parsed.passed?.length || 0,
  rejectedCount: parsed.rejected?.length || 0,
  qualityIssues: issues,
  passed: parsed.passed || [],
  rejected: parsed.rejected || [],
  openQuestions: parsed.openQuestions || [],
  rawModelResponse,
  nextSteps: [
    'Run scripts/verify-enrichment-sources.ts against this artifact.',
    'Review verifier output and qualityIssues before any public map promotion.',
    'Do not edit public/data/maps/*/entries.json until exact address, current evidence, and real product photos are confirmed.',
  ],
};

fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Wrote model result artifact: ${outFile}`);
console.log(`Passed: ${artifact.passedCount}`);
console.log(`Rejected: ${artifact.rejectedCount}`);
console.log(`Quality issues: ${issues.length}`);

if (runVerifier) {
  console.log('Running Playwright source verifier against model result...');
  const verification = spawnSync('npx', [
    'tsx',
    'scripts/verify-enrichment-sources.ts',
    `--input=${outFile}`,
    `--limit=${verifierLimit}`,
    `--max-urls=${verifierMaxUrls}`,
  ], {
    stdio: 'inherit',
    env: process.env,
  });

  if (verification.status !== 0) {
    process.exitCode = verification.status || 1;
  }
}
