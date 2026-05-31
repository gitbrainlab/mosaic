/**
 * Research Batch / Enrichment Run Types
 *
 * Lightweight, file-based model for tracking groups of research work.
 * Designed to be stored as JSON in the repo and readable by the static frontend.
 */

export type BatchStatus =
  | 'proposed'          // Scout created it, waiting for enrichment
  | 'enriching'         // Currently running research jobs
  | 'ready-for-review'  // Enrichment complete, needs human eyes
  | 'in-refinement'     // Curator is giving feedback / requesting re-runs
  | 'approved'          // Ready to be merged into a map
  | 'published';        // Already merged into live map data

export interface EnrichmentRun {
  id: string;
  batchId: string;
  startedAt: string;
  completedAt?: string;
  modelConfig: {
    models: string[];
    locationTargets: string[];
    perLocationLimit: number;
  };
  summary: {
    totalCandidates: number;
    entriesProduced: number;
    photosWithBriefs: number;
    averageConfidence: 'high' | 'medium' | 'low' | 'mixed';
  };
  outputFile: string;           // Path to the research JSON (e.g. data/research-runs/xxx.json)
  githubRunUrl?: string;        // Link to the Actions run
}

export interface ResearchBatch {
  id: string;                   // e.g. "batch-2026-05-28-ice-cream-capital"
  name: string;
  topic: string;
  createdAt: string;
  status: BatchStatus;

  // Source of the batch
  source: {
    type: 'github-issue' | 'scheduled-scout' | 'manual' | 'curator-batch';
    reference?: string;         // Issue number or URL
  };

  // The actual research work done
  runs: EnrichmentRun[];

  // High-level summary for UI
  summary: {
    totalProfiles: number;
    profilesWithPhotos: number;
    locationsCovered: string[];
    lastEnrichedAt?: string;
  };

  // Links for humans
  githubIssueUrl?: string;
  notes?: string;

  // GitHub-native Hunt pipeline metadata. These fields are static artifacts
  // produced by Actions and read by Studio; they never require a browser token.
  reviewState?: 'queued' | 'researching' | 'needs verification' | 'needs photo review' | 'promotion preview' | 'approved' | 'rejected/refinement requested';
  workflowStates?: Array<{
    state: string;
    complete: boolean;
  }>;
  artifacts?: Array<{
    label: string;
    path: string;
    kind: string;
  }>;
  promotion?: {
    approvalRequired: boolean;
    workflow: string;
    publicDataBlockedUntilApproved: boolean;
  };
  qualityGates?: string[];
}
