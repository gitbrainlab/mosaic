export type HuntConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type HuntStatus =
  | 'queued'
  | 'running'
  | 'refined'
  | 'drafting'
  | 'ready'
  | 'iterating'
  | 'promotion_queued'
  | 'promotion_dispatched'
  | 'promotion_requested'
  | 'promoted'
  | 'failed';

export type HuntJobKind = 'create' | 'iterate' | 'promote';
export type HuntJobEventName = 'hunt.create' | 'hunt.iterate' | 'hunt.promote';
export type HuntJobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'promotion_dispatched';

export type DraftPhotoStatus = 'verified' | 'pending' | 'needs_sourcing' | 'suppressed';

export interface HuntCoordinateBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface HuntSpec {
  id: string;
  title: string;
  topic: string;
  intent: string;
  scope: string;
  geography: {
    label: string;
    coordinateBounds?: HuntCoordinateBounds;
  };
  mustHaveConstraints: string[];
  exclusions: string[];
  photoPolicy: string;
  desiredScale: {
    initialEntries: number;
    targetEntries: number;
  };
  qualityTargets: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DraftHuntEntry {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    region?: string;
    country: string;
    lat: number;
    lng: number;
  };
  summary: string;
  confidence: HuntConfidence;
  evidenceHints: string[];
  tags: string[];
  photoStatus: DraftPhotoStatus;
  provisionalReason: string;
}

export interface DraftSuppressedCandidate {
  name: string;
  reason: string;
}

export interface DraftMap {
  id: string;
  huntId: string;
  title: string;
  tagline: string;
  narrative: string;
  generatedAt: string;
  iteration: number;
  entries: DraftHuntEntry[];
  suppressedCandidates: DraftSuppressedCandidate[];
}

export interface HuntEvent {
  id: string;
  huntId: string;
  type: string;
  stage: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  createdAt: string;
}

export interface HuntProfile {
  id: string;
  spec: HuntSpec;
  status: HuntStatus;
  visibility: 'public';
  iterationCount: number;
  maxIterations: number;
  createdAt: string;
  updatedAt: string;
  ownerGithubLogin?: string;
  promotion?: PromotionRequest;
}

export interface PromotionRequest {
  id: string;
  huntId: string;
  status: 'queued' | 'issue_created' | 'workflow_dispatched' | 'pr_opened' | 'failed';
  requestedAt: string;
  targetMapSlug?: string;
  promotionArtifactKey?: string;
  workflowUrl?: string;
  workflowRunUrl?: string;
  githubIssueUrl?: string;
  githubPrUrl?: string;
  error?: string;
}

export interface HuntJob {
  jobId: string;
  huntId: string;
  kind: HuntJobKind;
  eventName: HuntJobEventName;
  status: HuntJobStatus;
  attemptCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  targetMapSlug?: string;
  promotionId?: string;
  workflowUrl?: string;
  workflowRunUrl?: string;
}

export interface HuntState {
  profile: HuntProfile;
  draftMap: DraftMap | null;
  events: HuntEvent[];
  jobs?: HuntJob[];
}
