import { z } from "zod";

const finiteNumber = () => z.number().finite();
const finiteNullish = () => z.number().finite().nullish();
const lossField = () => z.number().finite().min(-100).max(100).nullish();
const scoreField = () => z.number().finite().min(-100).max(100).nullish();
const rateField = () => z.number().finite().min(0).max(100).nullish();
const normField = () => z.number().finite().min(0).nullish();
const lrField = () => z.number().finite().min(0).max(10).nullish();

export const registerRunSchema = z.object({
  id: z.string().uuid(),
  hotkey: z.string().min(1).max(256),
  role: z.enum(["validator", "miner"]),
  netuid: finiteNumber().int(),
  uid: finiteNumber().int().nullish(),
  version: z.string().max(64).nullish(),
  config: z.record(z.unknown()).nullish(),
});

const uidScoreSchema = z.object({
  uid: finiteNumber().int().min(0).max(65535),
  gradientScore: scoreField(),
  binaryIndicator: scoreField(),
  binaryMovingAvg: scoreField(),
  syncScore: scoreField(),
  openskillMu: finiteNullish(),
  openskillSigma: finiteNullish(),
  openskillOrdinal: finiteNullish(),
  finalScore: scoreField(),
  weight: scoreField(),
  lossOwnBefore: lossField(),
  lossOwnAfter: lossField(),
  lossRandomBefore: lossField(),
  lossRandomAfter: lossField(),
  improvementOwn: finiteNullish(),
  improvementRandom: finiteNullish(),
  evalStatus: z.enum(["evaluated", "skipped", "invalid", "excluded"]).nullish(),
  evalSkipReason: z.string().max(256).nullish(),
  consecutiveNegatives: finiteNumber().int().min(0).nullish(),
  negativeFrequency: rateField(),
  bmaThresholdApplied: z.boolean().nullish(),
});

const windowMetricsSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  globalStep: finiteNumber().int().min(0),
  block: finiteNumber().int().min(0).nullish(),
  lossOwnBefore: lossField(),
  lossOwnAfter: lossField(),
  lossRandomBefore: lossField(),
  lossRandomAfter: lossField(),
  lossOwnImprovement: finiteNullish(),
  lossRandomImprovement: finiteNullish(),
  outerLr: lrField(),
  innerLr: lrField(),
  activeMiners: finiteNumber().int().min(0).nullish(),
  gatherSuccessRate: rateField(),
  gatherPeers: finiteNumber().int().min(0).nullish(),
  positivePeersRatio: rateField(),
  reserveUsed: finiteNumber().int().min(0).nullish(),
  overlapMean: finiteNullish(),
  overlapMax: finiteNullish(),
  overlapPairsChecked: finiteNumber().int().min(0).nullish(),
  overlapPairsOverThreshold: finiteNumber().int().min(0).nullish(),
  overlapRatioOverThreshold: finiteNullish(),
  compressMinMedianNorm: normField(),
  compressMaxMedianNorm: normField(),
  gatherIntendedMeanFinal: finiteNullish(),
  gatherActualMeanFinal: finiteNullish(),
  timingWindowTotal: finiteNullish(),
  timingPeerUpdate: finiteNullish(),
  timingGather: finiteNullish(),
  timingEvaluation: finiteNullish(),
  timingModelUpdate: finiteNullish(),
  evaluatedUids: finiteNumber().int().min(0).nullish(),
  totalNegativeEvals: finiteNumber().int().min(0).nullish(),
  totalExcluded: finiteNumber().int().min(0).nullish(),
});

const gradientStatsSchema = z.object({
  meanGradNorm: normField(),
  maxGradNorm: normField(),
  minGradNorm: normField(),
  medianGradNorm: normField(),
  gradNormStd: normField(),
  meanWeightNorm: normField(),
  gradToWeightRatio: finiteNullish(),
});

export const ingestWindowSchema = z.object({
  windowMetrics: windowMetricsSchema,
  uidScores: z.array(uidScoreSchema).max(512).nullish(),
  gradientStats: gradientStatsSchema.nullish(),
});

export const minerMetricsSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  globalStep: finiteNumber().int().min(0),
  loss: lossField(),
  windowEntryLoss: lossField(),
  tokensPerSec: finiteNullish(),
  batchTokens: finiteNumber().int().min(0).nullish(),
  gradNorm: normField(),
  weightNorm: normField(),
  momentumNorm: normField(),
  gatherSuccessRate: rateField(),
  gatherPeers: finiteNumber().int().min(0).nullish(),
  gpuMemoryAllocated: finiteNullish(),
  gpuMemoryCached: finiteNullish(),
  innerLr: lrField(),
  timing: z.record(z.number().finite()).nullish(),
  gradientL2Norm: normField(),
  gradientTotalElements: finiteNumber().int().min(0).nullish(),
  cpuUsage: rateField(),
  gpuUtilization: rateField(),
  outerStepApplied: z.boolean().nullish(),
  compressedSizeMb: finiteNullish(),
  uploadSizeMb: finiteNullish(),
  offloadTime: finiteNullish(),
  restoreTime: finiteNullish(),
  skippedPeers: finiteNumber().int().min(0).nullish(),
  gatherPeerList: z.array(finiteNumber().int().min(0).max(65535)).max(512).nullish(),
});

const syncScoreItemSchema = z.object({
  uid: finiteNumber().int().min(0).max(65535),
  l2Norm: normField(),
  avgAbsDiff: finiteNullish(),
  avgStepsBehind: finiteNullish(),
  maxStepsBehind: finiteNumber().int().min(0).nullish(),
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

const gatherStatusItemSchema = z.object({
  uid: finiteNumber().int().min(0).max(65535),
  status: z.enum(["success", "skipped", "timeout", "failed", "excluded"]),
  reason: z.string().max(256).nullish(),
});

export const gatherStatusSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  results: z.array(gatherStatusItemSchema).max(512),
});

export const innerStepSchema = z.object({
  runId: z.string().uuid(),
  window: finiteNumber().int().min(0),
  innerStep: finiteNumber().int().min(0),
  globalStep: finiteNumber().int().min(0),
  loss: lossField(),
  batchSize: finiteNumber().int().min(0).nullish(),
  batchTokens: finiteNumber().int().min(0).nullish(),
  innerLr: lrField(),
  gradNorm: normField(),
});
