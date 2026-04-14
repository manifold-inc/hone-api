import { z } from "zod";

const finiteNumber = () => z.number().finite();
const finiteOptional = () => z.number().finite().optional();
const lossField = () => z.number().finite().min(-100).max(100).optional();
const scoreField = () => z.number().finite().min(-100).max(100).optional();
const rateField = () => z.number().finite().min(0).max(100).optional();
const normField = () => z.number().finite().min(0).optional();
const lrField = () => z.number().finite().min(0).max(10).optional();

export const registerRunSchema = z.object({
  id: z.string().uuid(),
  hotkey: z.string().min(1).max(256),
  role: z.enum(["validator", "miner"]),
  netuid: finiteNumber().int(),
  uid: finiteNumber().int().optional(),
  version: z.string().max(64).optional(),
  config: z.record(z.unknown()).optional(),
});

const uidScoreSchema = z.object({
  uid: finiteNumber().int().min(0).max(65535),
  gradientScore: scoreField(),
  binaryIndicator: scoreField(),
  binaryMovingAvg: scoreField(),
  syncScore: scoreField(),
  openskillMu: finiteOptional(),
  openskillSigma: finiteOptional(),
  openskillOrdinal: finiteOptional(),
  finalScore: scoreField(),
  weight: scoreField(),
});

const windowMetricsSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  globalStep: finiteNumber().int().min(0),
  block: finiteNumber().int().min(0).optional(),
  lossOwnBefore: lossField(),
  lossOwnAfter: lossField(),
  lossRandomBefore: lossField(),
  lossRandomAfter: lossField(),
  lossOwnImprovement: finiteOptional(),
  lossRandomImprovement: finiteOptional(),
  outerLr: lrField(),
  innerLr: lrField(),
  activeMiners: finiteNumber().int().min(0).optional(),
  gatherSuccessRate: rateField(),
  gatherPeers: finiteNumber().int().min(0).optional(),
  positivePeersRatio: rateField(),
  reserveUsed: finiteNumber().int().min(0).optional(),
  overlapMean: finiteOptional(),
  overlapMax: finiteOptional(),
  overlapPairsChecked: finiteNumber().int().min(0).optional(),
  overlapPairsOverThreshold: finiteNumber().int().min(0).optional(),
  overlapRatioOverThreshold: finiteOptional(),
  compressMinMedianNorm: normField(),
  compressMaxMedianNorm: normField(),
  gatherIntendedMeanFinal: finiteOptional(),
  gatherActualMeanFinal: finiteOptional(),
  timingWindowTotal: finiteOptional(),
  timingPeerUpdate: finiteOptional(),
  timingGather: finiteOptional(),
  timingEvaluation: finiteOptional(),
  timingModelUpdate: finiteOptional(),
  evaluatedUids: finiteNumber().int().min(0).optional(),
  totalNegativeEvals: finiteNumber().int().min(0).optional(),
  totalExcluded: finiteNumber().int().min(0).optional(),
});

const gradientStatsSchema = z.object({
  meanGradNorm: normField(),
  maxGradNorm: normField(),
  minGradNorm: normField(),
  medianGradNorm: normField(),
  gradNormStd: normField(),
  meanWeightNorm: normField(),
  gradToWeightRatio: finiteOptional(),
});

export const ingestWindowSchema = z.object({
  windowMetrics: windowMetricsSchema,
  uidScores: z.array(uidScoreSchema).max(512).optional(),
  gradientStats: gradientStatsSchema.optional(),
});

export const minerMetricsSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  globalStep: finiteNumber().int().min(0),
  loss: lossField(),
  windowEntryLoss: lossField(),
  tokensPerSec: finiteOptional(),
  batchTokens: finiteNumber().int().min(0).optional(),
  gradNorm: normField(),
  weightNorm: normField(),
  momentumNorm: normField(),
  gatherSuccessRate: rateField(),
  gatherPeers: finiteNumber().int().min(0).optional(),
  gpuMemoryAllocated: finiteOptional(),
  gpuMemoryCached: finiteOptional(),
  innerLr: lrField(),
  timing: z.record(z.number().finite()).optional(),
  gradientL2Norm: normField(),
  gradientTotalElements: finiteNumber().int().min(0).optional(),
  cpuUsage: rateField(),
  gpuUtilization: rateField(),
});

const syncScoreItemSchema = z.object({
  uid: finiteNumber().int().min(0).max(65535),
  l2Norm: normField(),
  avgAbsDiff: finiteOptional(),
  avgStepsBehind: finiteOptional(),
  maxStepsBehind: finiteNumber().int().min(0).optional(),
});

export const syncScoresSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  scores: z.array(syncScoreItemSchema).max(512),
});

export const slashEventSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  uid: finiteNumber().int().min(0).max(65535),
  scoreBefore: finiteNumber(),
  scoreAfter: finiteNumber(),
  reason: z.string().max(256),
});

export const inactivityEventSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  uid: finiteNumber().int().min(0).max(65535),
  scoreBefore: finiteNumber(),
  scoreAfter: finiteNumber(),
});

export const innerStepSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  innerStep: finiteNumber().int().min(0),
  globalStep: finiteNumber().int().min(0),
  loss: lossField(),
  batchSize: finiteNumber().int().min(0).optional(),
  batchTokens: finiteNumber().int().min(0).optional(),
  innerLr: lrField(),
  gradNorm: normField(),
});
