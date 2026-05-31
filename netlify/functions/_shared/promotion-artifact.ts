import type { DraftHuntEntry, DraftMap, HuntProfile } from '../../../src/types/hunt';
import type { KnowledgeEntry } from '../../../src/types';
import { slugify } from './hunt-generation';

export interface HuntPromotionArtifact {
  huntId: string;
  targetMapSlug: string;
  mapTitle?: string;
  tagline?: string;
  intent?: {
    statement?: string;
    scope?: string;
    photoPolicy?: string;
  };
  approvedEntries: KnowledgeEntry[];
}

export function inferTargetMapSlug(profile: HuntProfile, explicitSlug?: string): string {
  if (explicitSlug?.trim()) return slugify(explicitSlug);
  return slugify(profile.spec.title.replace(/^Hunt:\s*/i, ''));
}

export function buildPromotionArtifact(profile: HuntProfile, draftMap: DraftMap, targetMapSlug: string): HuntPromotionArtifact {
  return {
    huntId: profile.id,
    targetMapSlug,
    mapTitle: draftMap.title.replace(/^Hunt:\s*/i, ''),
    tagline: draftMap.tagline,
    intent: {
      statement: profile.spec.intent,
      scope: profile.spec.scope,
      photoPolicy: profile.spec.photoPolicy,
    },
    approvedEntries: draftMap.entries.map(entry => draftEntryToKnowledgeEntry(entry, draftMap.generatedAt)),
  };
}

function draftEntryToKnowledgeEntry(entry: DraftHuntEntry, generatedAt: string): KnowledgeEntry {
  return {
    id: entry.id,
    name: entry.name,
    location: entry.location,
    description: entry.summary,
    confidence: entry.confidence === 'unknown' ? 'low' : entry.confidence,
    evidence: entry.evidenceHints.map(hint => ({
      type: 'other',
      source: 'Mosaic provisional Hunt draft',
      detail: hint,
      date: generatedAt.slice(0, 10),
    })),
    tags: entry.tags,
    photos: [],
    lastVerified: generatedAt.slice(0, 10),
    notes: entry.provisionalReason,
  };
}
