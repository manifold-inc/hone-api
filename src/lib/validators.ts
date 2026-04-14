import { z } from "zod";

export const registerRunSchema = z.object({
  id: z.string(),
  hotkey: z.string(),
  role: z.enum(["validator", "miner"]),
  netuid: z.number().int(),
  uid: z.number().int().optional(),
  version: z.string().optional(),
  config: z.any().optional(),
});

const uidScoreSchema = z.object({
  uid: z.number().int(),
  gradientScore: z.number().optional(),
  binaryIndicator: z.number().optional(),
  binaryMovingAvg: z.number().optional(),
  syncScore: z.number().optional(),
  openskillMu: z.number().optional(),
  openskillSigma: z.number().optional(),
  openskillOrdinal: z.number().optional(),
  finalScore: z.number().optional(),
  weight: z.number().optional(),
});

const windowMetricsSchema = z.object({
  runId: z.string(),
  window: z.number().int(),
  globalStep: z.number().int(),
  block: z.number().int().optional(),
  lossOwnBefore: z.number().optional(),
  lossOwnAfter: z.number().optional(),
  lossRandomBefore: z.number().optional(),
  lossRandomAfter: z.number().optional(),
  lossOwnImprovement: z.number().optional(),
  lossRandomImprovement: z.number().optional(),
  outerLr: z.number().optional(),
  innerLr: z.number().optional(),
  activeMiners: z.number().int().optional(),
  gatherSuccessRate: z.number().optional(),
  gatherPeers: z.number().int().optional(),
  positivePeersRatio: z.number().optional(),
  reserveUsed: z.number().int().optional(),
  overlapMean: z.number().optional(),
  overlapMax: z.number().optional(),
  overlapPairsChecked: z.number().int().optional(),
  overlapPairsOverThreshold: z.number().int().optional(),
  overlapRatioOverThreshold: z.number().optional(),
  compressMinMedianNorm: z.number().optional(),
  compressMaxMedianNorm: z.number().optional(),
  gatherIntendedMeanFinal: z.number().optional(),
  gatherActualMeanFinal: z.number().optional(),
  timingWindowTotal: z.number().optional(),
  timingPeerUpdate: z.number().optional(),
  timingGather: z.number().optional(),
  timingEvaluation: z.number().optional(),
  timingModelUpdate: z.number().optional(),
  evaluatedUids: z.number().int().optional(),
  totalNegativeEvals: z.number().int().optional(),
  totalExcluded: z.number().int().optional(),
});

const gradientStatsSchema = z.object({
  meanGradNorm: z.number().optional(),
  maxGradNorm: z.number().optional(),
  minGradNorm: z.number().optional(),
  medianGradNorm: z.number().optional(),
  gradNormStd: z.number().optional(),
  meanWeightNorm: z.number().optional(),
  gradToWeightRatio: z.number().optional(),
});

export const ingestWindowSchema = z.object({
  windowMetrics: windowMetricsSchema,
  uidScores: z.array(uidScoreSchema).optional(),
  gradientStats: gradientStatsSchema.optional(),
});

export const minerMetricsSchema = z.object({
  runId: z.string(),
  window: z.number().int(),
  globalStep: z.number().int(),
  loss: z.number().optional(),
  windowEntryLoss: z.number().optional(),
  tokensPerSec: z.number().optional(),
  batchTokens: z.number().int().optional(),
  gradNorm: z.number().optional(),
  weightNorm: z.number().optional(),
  momentumNorm: z.number().optional(),
  gatherSuccessRate: z.number().optional(),
  gatherPeers: z.number().int().optional(),
  gpuMemoryAllocated: z.number().optional(),
  gpuMemoryCached: z.number().optional(),
  innerLr: z.number().optional(),
  timing: z.any().optional(),
  gradientL2Norm: z.number().optional(),
  gradientTotalElements: z.number().int().optional(),
  cpuUsage: z.number().optional(),
  gpuUtilization: z.number().optional(),
});

const syncScoreItemSchema = z.object({
  uid: z.number().int(),
  l2Norm: z.number().optional(),
  avgAbsDiff: z.number().optional(),
  avgStepsBehind: z.number().optional(),
  maxStepsBehind: z.number().int().optional(),
});

export const syncScoresSchema = z.object({
  runId: z.string(),
  window: z.number().int(),
  scores: z.array(syncScoreItemSchema),
});

export const slashEventSchema = z.object({
  runId: z.string(),
  window: z.number().int(),
  uid: z.number().int(),
  scoreBefore: z.number(),
  scoreAfter: z.number(),
  reason: z.string().max(256),
});

export const inactivityEventSchema = z.object({
  runId: z.string(),
  window: z.number().int(),
  uid: z.number().int(),
  scoreBefore: z.number(),
  scoreAfter: z.number(),
});
