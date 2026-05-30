import type { DraftMap, HuntProfile, PromotionRequest } from '../../../src/types/hunt';

function repoFullName(): string {
  return process.env.MOSAIC_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || 'gitbrainlab/mosaic';
}

function githubToken(): string {
  return process.env.MOSAIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
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
