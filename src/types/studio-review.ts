export type StudioReviewActionStatus = 'submitted' | 'failed';
export type StudioReviewActionMode = 'live' | 'batch';

export type StudioReviewActionType =
  | 'approve'
  | 'reject'
  | 'request_refinement'
  | 'flag_photo_issue'
  | 'flag_evidence_issue'
  | 'enrich_photos'
  | 'enrich_evidence'
  | 'verify_location'
  | 'refine_profile';

export interface StudioReviewActionPayload {
  mapSlug: string;
  entryId: string;
  actionType: StudioReviewActionType;
  actionMode?: StudioReviewActionMode;
  action: string;
  reason?: string;
  targetState: string;
  createdAt: string;
  source: string;
  note?: string;
  jobId?: string;
  guidanceUpdate?: string;
  refinementMode?: 'live' | 'fallback';
}

export interface StudioReviewActionRecord extends StudioReviewActionPayload {
  id: string;
  status: StudioReviewActionStatus;
  submittedAt: string;
  submittedBy?: string;
}

export type StudioEnrichmentJobKind =
  | 'enrich_photos'
  | 'enrich_evidence'
  | 'verify_location'
  | 'refine_profile';

export type StudioEnrichmentJobStatus = 'queued' | 'running' | 'ready' | 'failed';

export interface StudioEnrichmentCandidate {
  url?: string;
  sourceUrl?: string;
  caption: string;
  credit?: string;
  confidence: 'high' | 'medium' | 'low';
  locationTie: string;
  reviewNote: string;
}

export interface StudioEnrichmentResult {
  summary: string;
  candidates: StudioEnrichmentCandidate[];
  evidenceNotes: string[];
  rejectionNotes: string[];
  generatedAt: string;
  mode: 'live' | 'fallback';
}

export interface StudioEnrichmentJob {
  jobId: string;
  mapSlug: string;
  mapTitle?: string;
  entryId: string;
  entryName?: string;
  kind: StudioEnrichmentJobKind;
  status: StudioEnrichmentJobStatus;
  attemptCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  result?: StudioEnrichmentResult;
}

export interface StudioEnrichmentRequest {
  actionType: StudioEnrichmentJobKind;
  mapSlug: string;
  mapTitle?: string;
  entryId: string;
  entryName?: string;
  entry?: unknown;
  issues?: string[];
  note?: string;
}
