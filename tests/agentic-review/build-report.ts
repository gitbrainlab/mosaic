import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import {
  panelChairPrompt,
  reviewArtifactsRoot,
  reviewFeedbackSchemaPath,
  reviewGuidancePath,
  reviewJourneys,
  reviewPanelExperts,
} from './config';

interface StepRecord {
  kind: string;
  name?: string;
  selector?: string;
  note?: string;
  passed: boolean;
  details?: string;
  path?: string;
}

interface JourneyResult {
  journeyId: string;
  title: string;
  persona: string;
  priority: string;
  project: string;
  projectKind: string;
  baseURL: string;
  routeHint: string;
  startedAt: string;
  endedAt: string;
  finalURL: string;
  viewport: unknown;
  colorScheme: unknown;
  expectations: string[];
  inspiration: string[];
  panelQuestions: string[];
  steps: StepRecord[];
}

const runId = process.env.MOSAIC_REVIEW_RUN_ID || 'latest';
const runRoot = resolve(join(reviewArtifactsRoot, runId));
const knownJourneyIds = new Set(reviewJourneys.map(journey => journey.id));

mkdirSync(runRoot, { recursive: true });

const results = readJourneyResults();
const guidance = readOptional(reviewGuidancePath, 'No guidance file found.');

const summary = {
  generatedAt: new Date().toISOString(),
  runId,
  runRoot: relative(runRoot),
  totalResults: results.length,
  projects: Array.from(new Set(results.map(result => result.project))).sort(),
  journeys: reviewJourneys.map(journey => ({
    id: journey.id,
    title: journey.title,
    priority: journey.priority,
    persona: journey.persona,
  })),
  results,
};

const jsonPath = join(runRoot, 'agentic-review-report.json');
const markdownPath = join(runRoot, 'agentic-review-report.md');
const promptPackPath = join(runRoot, 'agent-panel-prompt-pack.md');

writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(markdownPath, renderReportMarkdown(results));
writeFileSync(promptPackPath, renderPromptPack(results, guidance));

console.log(`Agentic review report: ${relative(markdownPath)}`);
console.log(`Panel prompt pack: ${relative(promptPackPath)}`);
console.log(`Machine-readable report: ${relative(jsonPath)}`);

function readJourneyResults(): JourneyResult[] {
  if (!existsSync(runRoot)) return [];

  const projectDirs = readdirSync(runRoot, { withFileTypes: true }).filter(entry => entry.isDirectory());
  const results: JourneyResult[] = [];

  for (const projectDir of projectDirs) {
    const dir = join(runRoot, projectDir.name);
    const files = readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isFile());

    for (const file of files) {
      const journeyId = basename(file.name, '.json');
      if (!knownJourneyIds.has(journeyId)) continue;

      const raw = readFileSync(join(dir, file.name), 'utf8');
      results.push(JSON.parse(raw) as JourneyResult);
    }
  }

  return results.sort((a, b) => `${a.project}:${a.journeyId}`.localeCompare(`${b.project}:${b.journeyId}`));
}

function renderReportMarkdown(results: JourneyResult[]) {
  const lines: string[] = [];
  lines.push('# Mosaic Agentic Review Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Run id: ${runId}`);
  lines.push(`Artifacts: ${relative(runRoot)}`);
  lines.push('');
  lines.push('## How To Read This');
  lines.push('');
  lines.push('This report is the digest layer between Playwright and a panel of review agents. The journey config defines what the browser did, the screenshots/DOM snapshots show what happened, and the panel prompt pack asks experts for implementation guidance.');
  lines.push('');

  if (results.length === 0) {
    lines.push('No journey results were found yet. Run `npm run test:agentic` first, or point the harness at production with `npm run test:agentic:live`.');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  lines.push('## Coverage');
  lines.push('');
  lines.push(`Projects: ${Array.from(new Set(results.map(result => result.project))).sort().join(', ')}`);
  lines.push(`Journeys: ${Array.from(new Set(results.map(result => result.journeyId))).sort().join(', ')}`);
  lines.push('');

  for (const result of results) {
    const checks = result.steps.filter(step => step.kind.startsWith('check'));
    const failedChecks = checks.filter(step => !step.passed);
    const screenshots = result.steps.filter(step => step.kind === 'screenshot' && step.path);
    const snapshots = result.steps.filter(step => step.kind === 'snapshot' && step.path);

    lines.push(`## ${result.project} / ${result.title}`);
    lines.push('');
    lines.push(`- Journey: \`${result.journeyId}\` (${result.priority}, ${result.persona})`);
    lines.push(`- Base URL: ${result.baseURL}`);
    lines.push(`- Final URL: ${result.finalURL}`);
    lines.push(`- Checks: ${checks.length - failedChecks.length}/${checks.length} passing`);
    if (failedChecks.length > 0) {
      lines.push(`- Soft check failures: ${failedChecks.map(step => step.selector || step.note || step.kind).join('; ')}`);
    }
    lines.push('');
    lines.push('Expectations:');
    for (const expectation of result.expectations) lines.push(`- ${expectation}`);
    lines.push('');
    lines.push('Screenshots:');
    for (const screenshot of screenshots) lines.push(`- ${screenshot.name}: ${screenshot.path}`);
    if (screenshots.length === 0) lines.push('- None captured.');
    lines.push('');
    lines.push('DOM snapshots:');
    for (const snapshot of snapshots) lines.push(`- ${snapshot.name}: ${snapshot.path}`);
    if (snapshots.length === 0) lines.push('- None captured.');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderPromptPack(results: JourneyResult[], guidance: string) {
  const evidenceIndex = results.map(result => {
    const screenshots = result.steps.filter(step => step.kind === 'screenshot' && step.path).map(step => step.path);
    const snapshots = result.steps.filter(step => step.kind === 'snapshot' && step.path).map(step => step.path);
    return {
      project: result.project,
      journeyId: result.journeyId,
      title: result.title,
      finalURL: result.finalURL,
      screenshots,
      snapshots,
      failedSoftChecks: result.steps.filter(step => step.kind.startsWith('check') && !step.passed),
    };
  });

  const lines: string[] = [];
  lines.push('# Mosaic Agent Panel Prompt Pack');
  lines.push('');
  lines.push('Use this prompt pack with multiple review agents. Each agent should pick exactly one expert lens, inspect the evidence for all journeys, and return JSON matching the feedback schema.');
  lines.push('');
  lines.push(`Feedback schema: ${reviewFeedbackSchemaPath}`);
  lines.push('');
  lines.push('## Shared Chair Prompt');
  lines.push('');
  lines.push(panelChairPrompt);
  lines.push('');
  lines.push('## Shared Guidance');
  lines.push('');
  lines.push(guidance.trim());
  lines.push('');
  lines.push('## Evidence Index');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(evidenceIndex, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Expert Prompts');
  lines.push('');

  for (const expert of reviewPanelExperts) {
    lines.push(`### ${expert.title}`);
    lines.push('');
    lines.push(`${panelChairPrompt}`);
    lines.push('');
    lines.push(`You are serving as: ${expert.title}.`);
    lines.push('');
    lines.push(`Review lens: ${expert.lens}`);
    lines.push('');
    lines.push(expert.prompt);
    lines.push('');
    lines.push('Focus especially on:');
    for (const focus of expert.feedbackFocus) lines.push(`- ${focus}`);
    lines.push('');
    lines.push('Return only JSON matching `tests/agentic-review/panel-feedback.schema.json`. Findings should cite a journey id, project/viewport, and screenshot or DOM snapshot path whenever possible.');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function readOptional(path: string, fallback: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : fallback;
}

function relative(path: string) {
  return path.replace(`${process.cwd()}/`, '');
}
