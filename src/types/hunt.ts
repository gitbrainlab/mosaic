export type HuntConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type HuntStatus =
  | 'refined'
  | 'drafting'
  | 'ready'
  | 'iterating'
  | 'promotion_requested'
  | 'promoted'
  | 'failed';

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
  githubIssueUrl?: string;
  githubPrUrl?: string;
  error?: string;
}

export interface HuntState {
  profile: HuntProfile;
  draftMap: DraftMap;
  events: HuntEvent[];
}
