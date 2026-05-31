#!/usr/bin/env tsx
/**
 * Runs the same enrichment prompt pack against multiple Grok models and writes
 * a comparable benchmark artifact. This script never applies public entries.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface BatchConfig {
  models?: string[];
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function timestampForFile(iso: string) {
  return iso.replace(/[:.]/g, '-');
}

function runCommand(command: string, args: string[]): CommandResult {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    durationMs: Date.now() - started,
  };
}

function outputText(result: CommandResult) {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function firstMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[1]?.trim();
}

function parseModels(promptPackPath: string | undefined, batchPath: string, modelArg?: string) {
  if (modelArg) {
    return modelArg.split(',').map(model => model.trim()).filter(Boolean);
  }

  if (promptPackPath && fs.existsSync(promptPackPath)) {
    const promptPack = readJson<any>(promptPackPath);
    if (promptPack.sourceBatch && fs.existsSync(promptPack.sourceBatch)) {
      const batch = readJson<BatchConfig>(promptPack.sourceBatch);
      if (batch.models?.length) return batch.models;
    }
  }

  if (fs.existsSync(batchPath)) {
    const batch = readJson<BatchConfig>(batchPath);
    if (batch.models?.length) return batch.models;
  }

  return ['grok-4.3', 'grok-4.20-0309-non-reasoning'];
}

function ensurePromptPack(options: {
  promptPackPath?: string;
  inputPath: string;
  batchPath: string;
  limit: string;
  offset: string;
  outDir: string;
  excludeMap?: string;
  target?: string;
  targetIndex?: string;
}) {
  if (options.promptPackPath) return options.promptPackPath;

  const args = [
    'run',
    'enrichment:prompt',
    '--',
    `--input=${options.inputPath}`,
    `--batch=${options.batchPath}`,
    `--limit=${options.limit}`,
    `--offset=${options.offset}`,
    `--out-dir=${options.outDir}`,
  ];
  if (options.excludeMap) args.push(`--exclude-map=${options.excludeMap}`);
  if (options.target) args.push(`--target=${options.target}`);
  if (options.targetIndex) args.push(`--target-index=${options.targetIndex}`);

  const result = runCommand('npm', args);
  const text = outputText(result);
  const promptPackPath = firstMatch(text, /Created enrichment prompt pack: (.+)/);

  if (result.status !== 0 || !promptPackPath) {
    throw new Error(`Failed to create prompt pack.\n${text}`);
  }

  return promptPackPath;
}

function artifactQualityMetrics(artifact: any) {
  const passed = Array.isArray(artifact?.passed) ? artifact.passed : [];
  const rejected = Array.isArray(artifact?.rejected) ? artifact.rejected : [];
  const passedWithTwoPhotos = passed.filter((entry: any) => (entry?.photos || []).length >= 2).length;
  const passedWithTwoVerifiedPhotoEvidence = passed.filter((entry: any) =>
    (entry?.photoEvidence || []).filter((photo: any) => photo?.verified).length >= 2
  ).length;
  const passedWithCoordinates = passed.filter((entry: any) =>
    Number.isFinite(entry?.location?.lat) && Number.isFinite(entry?.location?.lng)
  ).length;
  const rejectedWithAction = rejected.filter((entry: any) => entry?.notes && entry?.nextBestAction).length;

  return {
    passedWithTwoPhotos,
    passedWithTwoVerifiedPhotoEvidence,
    passedWithCoordinates,
    rejectedWithAction,
    allPassedHaveTwoVerifiedPhotos: passed.length === passedWithTwoVerifiedPhotoEvidence,
    allPassedHaveCoordinates: passed.length === passedWithCoordinates,
  };
}

function benchmarkScore(result: any) {
  const accepted = result.promotionPreview?.summary?.acceptedCount || 0;
  const rejected = result.promotionPreview?.summary?.rejectedCount || 0;
  const validJson = result.validJson ? 1 : 0;
  const photoReady = result.artifactQuality?.passedWithTwoVerifiedPhotoEvidence || 0;
  const usefulRejects = result.artifactQuality?.rejectedWithAction || 0;

  return accepted * 10 + photoReady * 3 + usefulRejects + validJson - rejected;
}

function usageCostUsd(usage: any) {
  const ticks = usage?.cost_in_usd_ticks;
  return typeof ticks === 'number' ? Number((ticks / 1_000_000_000).toFixed(6)) : null;
}

function attachCostMetrics(result: any) {
  const usage = result.responseMeta?.usage;
  const costUsd = usageCostUsd(usage);
  const accepted = result.promotionSummary?.acceptedCount || 0;
  const updates = result.promotionSummary?.updateCandidateCount || 0;
  const passed = result.runMetrics?.passedCount || 0;
  const researched = result.runMetrics?.candidatesResearched || 0;
  const usefulOutcomes = accepted + updates;

  result.costMetrics = {
    estimatedUsd: costUsd,
    inputTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? null,
    outputTokens: usage?.output_tokens ?? usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ??
      usage?.completion_tokens_details?.reasoning_tokens ??
      null,
    webSearchCalls: usage?.server_side_tool_usage_details?.web_search_calls ?? null,
    costPerResearchedCandidateUsd: costUsd !== null && researched > 0
      ? Number((costUsd / researched).toFixed(6))
      : null,
    costPerPassedCandidateUsd: costUsd !== null && passed > 0
      ? Number((costUsd / passed).toFixed(6))
      : null,
    costPerAcceptedOrUpdateUsd: costUsd !== null && usefulOutcomes > 0
      ? Number((costUsd / usefulOutcomes).toFixed(6))
      : null,
  };
}

function reasoningEffortForModel(model: string, requested?: string) {
  if (model.includes('non-reasoning')) return undefined;
  if (model.includes('multi-agent')) return requested || 'low';
  if (requested && /grok-4\.3/i.test(model)) return requested;
  return undefined;
}

const inputPath = argValue('input', 'public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json')!;
const batchPath = argValue('batch', 'batches/ice-cream-quality-recovery-wave-1.json')!;
const promptPackArg = argValue('prompt-pack');
const outDir = argValue('out-dir', 'data/enrichment-runs')!;
const limit = argValue('limit', '3')!;
const offset = argValue('offset', '0')!;
const mapSlug = argValue('map', 'ice-cream-capital-district')!;
const temperature = argValue('temperature', '0.2')!;
const maxTokens = argValue('max-tokens', '12000')!;
const transport = argValue('transport', 'responses')!;
const reasoningEffort = argValue('reasoning-effort');
const skipPromotionPreview = hasFlag('skip-promotion-preview');
const allowExistingMapCandidates = hasFlag('allow-existing-map-candidates');
const noWebSearch = hasFlag('no-web-search');
const noImageSearch = hasFlag('no-image-search');
const noImageUnderstanding = hasFlag('no-image-understanding');
const modelArg = argValue('models') || argValue('model');
const target = argValue('target');
const targetIndex = argValue('target-index');

const generatedAt = new Date().toISOString();
const promptPackPath = ensurePromptPack({
  promptPackPath: promptPackArg,
  inputPath,
  batchPath,
  limit,
  offset,
  outDir,
  excludeMap: allowExistingMapCandidates ? undefined : mapSlug,
  target,
  targetIndex,
});
const models = parseModels(promptPackPath, batchPath, modelArg);

const benchmark: any = {
  generatedAt,
  status: 'benchmark_artifact_only',
  publicPromotionAllowed: false,
  inputPath,
  batchPath,
  promptPackPath,
  targetMap: mapSlug,
  models,
  settings: {
    limit: Number(limit),
    offset: Number(offset),
    temperature: Number(temperature),
    maxTokens: Number(maxTokens),
    transport,
    reasoningEffort: reasoningEffort || null,
    skipPromotionPreview,
    allowExistingMapCandidates,
    noWebSearch,
    noImageSearch,
    noImageUnderstanding,
  },
  results: [],
  summary: {},
  promptFeedback: {
    benchmarkUse: 'Compare models on the same prompt pack before changing the prompt or scaling candidate count.',
    strongestSignals: [
      'valid JSON without repair',
      'dry-run promotion accepted count',
      'all passed candidates have coordinates and two verified product-photo evidence records',
      'rejected candidates include notes and a concrete nextBestAction',
    ],
    knownLimitations: [
      'A small batch estimates model behavior, not final map yield.',
      'Dry-run promotion validates structure and gates, but human review is still needed for photo attribution and public display rights.',
      'Models may cite pages that later block automated verification.',
    ],
  },
};

for (const model of models) {
  const startedAt = new Date().toISOString();
  const researchArgs = [
    'run',
    'enrichment:run',
    '--',
    `--prompt-pack=${promptPackPath}`,
    `--model=${model}`,
    `--temperature=${temperature}`,
    `--max-tokens=${maxTokens}`,
    `--transport=${transport}`,
    `--out-dir=${outDir}`,
  ];
  const modelReasoningEffort = reasoningEffortForModel(model, reasoningEffort);
  if (modelReasoningEffort) researchArgs.push(`--reasoning-effort=${modelReasoningEffort}`);
  if (noWebSearch) researchArgs.push('--no-web-search');
  if (noImageSearch) researchArgs.push('--no-image-search');
  if (noImageUnderstanding) researchArgs.push('--no-image-understanding');

  const research = runCommand('npm', researchArgs);
  const researchText = outputText(research);
  const researchArtifactPath = firstMatch(researchText, /Wrote enrichment research artifact: (.+)/);

  const result: any = {
    model,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: research.durationMs,
    status: research.status === 0 ? 'completed' : 'failed',
    commandStatus: research.status,
    researchArtifactPath,
    validJson: false,
  };

  if (research.status !== 0 || !researchArtifactPath) {
    result.error = researchText.slice(0, 8000);
    benchmark.results.push(result);
    continue;
  }

  try {
    const artifact = readJson<any>(researchArtifactPath);
    result.validJson = true;
    result.runMetrics = artifact.runMetrics;
    result.responseMeta = artifact.responseMeta;
    result.artifactQuality = artifactQualityMetrics(artifact);
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
    benchmark.results.push(result);
    continue;
  }

  if (!skipPromotionPreview) {
    const promote = runCommand('npm', [
      'run',
      'enrichment:promote',
      '--',
      `--input=${researchArtifactPath}`,
      `--map=${mapSlug}`,
      `--out-dir=${outDir}`,
    ]);
    const promoteText = outputText(promote);
    const previewPath = firstMatch(promoteText, /Wrote promotion preview: (.+)/);
    result.promotionDurationMs = promote.durationMs;
    result.promotionPreviewPath = previewPath;

    if (promote.status === 0 && previewPath) {
      const preview = readJson<any>(previewPath);
      result.promotionPreview = preview;
      result.promotionSummary = preview.summary;
      result.accepted = preview.accepted;
      result.updateCandidates = preview.updateCandidates || [];
      result.rejected = preview.rejected;
    } else {
      result.promotionError = promoteText.slice(0, 8000);
    }
  }

  attachCostMetrics(result);
  result.benchmarkScore = benchmarkScore(result);
  benchmark.results.push(result);
}

const completed = benchmark.results.filter((result: any) => result.status === 'completed');
const failed = benchmark.results.filter((result: any) => result.status !== 'completed');
const ranked = [...completed].sort((a: any, b: any) => (b.benchmarkScore || 0) - (a.benchmarkScore || 0));

benchmark.summary = {
  completedCount: completed.length,
  failedCount: failed.length,
  bestModelByBenchmarkScore: ranked[0]?.model || null,
  estimatedTotalUsd: Number(completed.reduce((sum: number, result: any) =>
    sum + (result.costMetrics?.estimatedUsd || 0), 0).toFixed(6)),
  ranking: ranked.map((result: any) => ({
    model: result.model,
    benchmarkScore: result.benchmarkScore,
    durationMs: result.durationMs,
    passedCount: result.runMetrics?.passedCount,
    rejectedCount: result.runMetrics?.rejectedCount,
    promotionAcceptedCount: result.promotionSummary?.acceptedCount,
    promotionUpdateCandidateCount: result.promotionSummary?.updateCandidateCount,
    promotionRejectedCount: result.promotionSummary?.rejectedCount,
    estimatedUsd: result.costMetrics?.estimatedUsd,
    costPerResearchedCandidateUsd: result.costMetrics?.costPerResearchedCandidateUsd,
    costPerAcceptedOrUpdateUsd: result.costMetrics?.costPerAcceptedOrUpdateUsd,
  })),
};

const outFile = path.join(outDir, `enrichment-model-benchmark-${timestampForFile(generatedAt)}.json`);
writeJson(outFile, benchmark);

console.log(`Wrote enrichment model benchmark: ${outFile}`);
console.log(`Completed: ${benchmark.summary.completedCount}`);
console.log(`Failed: ${benchmark.summary.failedCount}`);
console.log(`Best model: ${benchmark.summary.bestModelByBenchmarkScore || 'n/a'}`);
console.log('Dry run only. Public map entries were not changed.');
