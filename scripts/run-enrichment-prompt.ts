#!/usr/bin/env tsx
/**
 * Runs an enrichment prompt pack through xAI/Grok and writes a research-only
 * enrichment artifact.
 *
 * This script never edits public map data. Use promote-enrichment-artifact.ts
 * after review and validation to generate a promotion preview or apply entries.
 */
import fs from 'fs';
import path from 'path';

const API_BASE = 'https://api.x.ai/v1';

interface PromptPack {
  wave?: string;
  generatedAt?: string;
  sourceInput?: string;
  sourceBatch?: string;
  selectedCandidates?: unknown[];
  deepResearchPrompt?: string;
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

function slugify(text: string) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function cleanJsonText(text: string) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonResponse(text: string) {
  const cleaned = cleanJsonText(text);
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

function apiKey() {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  if (process.env.XAI_KEY) return process.env.XAI_KEY;
  if (fs.existsSync('.xai-key')) return fs.readFileSync('.xai-key', 'utf8').trim();
  return '';
}

function extractResponsesText(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (!Array.isArray(data?.output)) return '';

  const chunks: string[] = [];
  for (const item of data.output) {
    if (typeof item?.text === 'string') chunks.push(item.text);
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.output_text === 'string') chunks.push(content.output_text);
    }
  }

  return chunks.join('\n').trim();
}

function responseMetadata(data: any) {
  return {
    responseId: data?.id,
    responseModel: data?.model,
    usage: data?.usage,
    citations: data?.citations || data?.sources,
    serverSideToolUsage: data?.server_side_tool_usage,
    rawStatus: data?.status,
  };
}

async function callChatCompletions(prompt: string, model: string, temperature: number, maxTokens: number) {
  const key = apiKey();
  if (!key) {
    throw new Error('XAI_API_KEY/XAI_KEY is required, or provide a local .xai-key file.');
  }

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: 'You are a strict Mosaic enrichment agent. Return only valid JSON. Do not edit public map data.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`xAI API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return {
    text: data?.choices?.[0]?.message?.content || '',
    meta: responseMetadata(data),
  };
}

async function callResponsesApi(
  prompt: string,
  model: string,
  temperature: number,
  maxTokens: number,
  options: {
    webSearch: boolean;
    imageSearch: boolean;
    imageUnderstanding: boolean;
    reasoningEffort?: string;
  },
) {
  const key = apiKey();
  if (!key) {
    throw new Error('XAI_API_KEY/XAI_KEY is required, or provide a local .xai-key file.');
  }

  const tools = options.webSearch
    ? [
      {
        type: 'web_search',
        enable_image_search: options.imageSearch,
        enable_image_understanding: options.imageUnderstanding,
      },
    ]
    : undefined;

  const payload: any = {
    model,
    temperature,
    max_output_tokens: maxTokens,
    input: [
      {
        role: 'system',
        content: 'You are a strict Mosaic enrichment agent. Return only valid JSON. Do not edit public map data.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    tools,
  };

  if (options.reasoningEffort) {
    payload.reasoning = { effort: options.reasoningEffort };
  }

  const response = await fetch(`${API_BASE}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`xAI Responses API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return {
    text: extractResponsesText(data),
    meta: responseMetadata(data),
  };
}

function computeRunMetrics(result: any, selectedCount: number) {
  const passed = Array.isArray(result?.passed) ? result.passed : [];
  const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
  const open = Array.isArray(result?.openQuestions) ? result.openQuestions : [];
  const researched = Math.max(selectedCount, passed.length + rejected.length);
  const manualReviewCount = passed.filter((entry: any) =>
    Array.isArray(entry?.tags) && entry.tags.some((tag: string) => /manual|proof_only|out_of_current_bounds/.test(tag))
  ).length;
  const sourceTypeCounts = [...passed, ...rejected].reduce<Record<string, number>>((counts, item: any) => {
    for (const evidence of item?.evidence || []) {
      const type = evidence?.type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }, {});
  const failedGateCounts = rejected.reduce<Record<string, number>>((counts, item: any) => {
    for (const reason of item?.reasons || []) counts[reason] = (counts[reason] || 0) + 1;
    return counts;
  }, {});

  return {
    candidatesResearched: researched,
    passedCount: passed.length,
    rejectedCount: rejected.length,
    openCount: open.length,
    manualReviewCount,
    publicReadyPassRate: researched > 0 ? Number((passed.length / researched).toFixed(4)) : 0,
    usefulRejectRate: rejected.length > 0
      ? Number((rejected.filter((item: any) => item?.nextBestAction && item?.notes).length / rejected.length).toFixed(4))
      : 0,
    sourceTypeCounts,
    failedGateCounts,
  };
}

const promptPackPath = argValue('prompt-pack') || argValue('input');
const outDir = argValue('out-dir', 'data/enrichment-runs')!;
const model = argValue('model', process.env.XAI_RESEARCH_MODEL || 'grok-4.3')!;
const temperature = Number(argValue('temperature', '0.2'));
const maxTokens = Number(argValue('max-tokens', '12000'));
const transport = argValue('transport', 'responses')!;
const webSearch = !hasFlag('no-web-search');
const imageSearch = !hasFlag('no-image-search');
const imageUnderstanding = !hasFlag('no-image-understanding');
const reasoningEffortArg = argValue('reasoning-effort');
const reasoningEffort = reasoningEffortArg || (model.includes('multi-agent') ? 'low' : undefined);

if (!promptPackPath) {
  console.error('Usage: npx tsx scripts/run-enrichment-prompt.ts --prompt-pack=<prompt-pack.json> [--model=grok-4.3]');
  process.exit(1);
}

const promptPack = readJson<PromptPack>(promptPackPath);
const prompt = promptPack.deepResearchPrompt;

if (!prompt) {
  console.error(`${promptPackPath} does not include deepResearchPrompt.`);
  process.exit(1);
}

const generatedAt = new Date().toISOString();
if (transport === 'chat' && model.includes('multi-agent')) {
  throw new Error('grok-4.20-multi-agent requires the Responses API. Use --transport=responses.');
}

const modelResponse = transport === 'chat'
  ? await callChatCompletions(prompt, model, temperature, maxTokens)
  : await callResponsesApi(prompt, model, temperature, maxTokens, {
    webSearch,
    imageSearch,
    imageUnderstanding,
    reasoningEffort,
  });
const parsed = parseJsonResponse(modelResponse.text);
const wave = parsed.wave || promptPack.wave || slugify(path.basename(promptPackPath, '.json'));

const artifact = {
  ...parsed,
  wave,
  generatedAt: parsed.generatedAt || generatedAt,
  sourcePromptPack: promptPackPath,
  sourceInput: parsed.sourceInput || promptPack.sourceInput,
  sourceBatch: parsed.sourceBatch || promptPack.sourceBatch,
  status: 'deep_research_artifact_only',
  publicPromotionAllowed: false,
  modelConfig: {
    provider: 'xai',
    model,
    transport,
    temperature,
    maxTokens,
    webSearch,
    imageSearch,
    imageUnderstanding,
    reasoningEffort: reasoningEffort || null,
  },
  responseMeta: modelResponse.meta,
  runMetrics: {
    ...computeRunMetrics(parsed, promptPack.selectedCandidates?.length || 0),
    ...(parsed.runMetrics || {}),
  },
};

const outFile = path.join(outDir, `${wave}-${generatedAt.replace(/[:.]/g, '-')}-deep-research.json`);
writeJson(outFile, artifact);

console.log(`Wrote enrichment research artifact: ${outFile}`);
console.log(`Passed: ${artifact.runMetrics.passedCount}`);
console.log(`Rejected: ${artifact.runMetrics.rejectedCount}`);
console.log('Public map entries were not changed.');
