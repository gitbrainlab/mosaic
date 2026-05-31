import type { DraftMap, HuntProfile, PromotionRequest } from '../../../src/types/hunt';

function repoFullName(): string {
  return process.env.MOSAIC_GITHUB_REPO || process.env.MOSAIC_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || 'gitbrainlab/mosaic';
}

function githubToken(): string {
  return process.env.MOSAIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
}

function githubRef(): string {
  return process.env.MOSAIC_GITHUB_REF || 'main';
}

function promotionWorkflow(): string {
  return process.env.MOSAIC_PROMOTION_WORKFLOW || 'hunt-promotion.yml';
}

function netlifyOrigin(): string {
  return (process.env.MOSAIC_NETLIFY_BASE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
}

export async function createPromotionIssue(profile: HuntProfile, draftMap: DraftMap, promotion: PromotionRequest): Promise<string | null> {
  const token = githubToken();
  if (!token) return null;

  const repository = repoFullName();
  const body = [
    '## Mosaic Hunt Promotion Request',
    '',
    `Hunt ID: \`${profile.id}\``,
    `Requested at: \`${promotion.requestedAt}\``,
    '',
    'This issue was created by the Netlify Hunt gateway. Public promotion must still pass GitHub Actions validation and review.',
    '',
    '### Hunt Spec',
    '```json',
    JSON.stringify(profile.spec, null, 2),
    '```',
    '',
    '### Draft Map Snapshot',
    '```json',
    JSON.stringify(draftMap, null, 2),
    '```',
  ].join('\n');

  const res = await fetch(`https://api.github.com/repos/${repository}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: `Promote Mosaic Hunt: ${profile.spec.title}`,
      body,
      labels: ['hunt-promotion'],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue creation failed ${res.status}: ${text}`);
  }

  const data = await res.json() as { html_url?: string };
  return data.html_url || null;
}

export async function dispatchPromotionWorkflow(promotion: PromotionRequest): Promise<{ workflowUrl: string }> {
  if (process.env.MOSAIC_LOCAL_HUNT_SERVICE === '1') {
    return {
      workflowUrl: `local://mosaic/hunt-promotion/${encodeURIComponent(promotion.id)}`,
    };
  }

  const token = githubToken();
  if (!token) throw new Error('MOSAIC_GITHUB_TOKEN is required to dispatch Hunt promotion workflow.');
  if (!promotion.targetMapSlug) throw new Error('targetMapSlug is required for Hunt promotion workflow dispatch.');

  const origin = netlifyOrigin();
  if (!origin) throw new Error('MOSAIC_NETLIFY_BASE_URL or URL is required so GitHub Actions can download the promotion artifact.');

  const repository = repoFullName();
  const workflow = promotionWorkflow();
  const workflowUrl = `https://github.com/${repository}/actions/workflows/${workflow}`;
  const exportUrl = `${origin}/.netlify/functions/hunt-promotion-export?promotionId=${encodeURIComponent(promotion.id)}`;
  const callbackUrl = `${origin}/.netlify/functions/hunt-promotion-callback`;

  const res = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref: githubRef(),
      inputs: {
        hunt_id: promotion.huntId,
        target_map_slug: promotion.targetMapSlug,
        promotion_artifact: `data/hunt-runtime/${promotion.id}.json`,
        approval: 'DRY_RUN',
        apply: 'false',
        promotion_source: 'netlify',
        promotion_id: promotion.id,
        netlify_export_url: exportUrl,
        netlify_callback_url: callbackUrl,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub workflow dispatch failed ${res.status}: ${text}`);
  }

  return { workflowUrl };
}
