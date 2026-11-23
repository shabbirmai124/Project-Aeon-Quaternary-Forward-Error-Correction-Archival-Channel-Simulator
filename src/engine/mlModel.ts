/**
 * Project Aeon — Pretrained Machine Learning DNA Stability & Degradation Risk Model
 * Architecture: 3-Layer Multi-Layer Perceptron (8 -> 16 -> 8 -> 1, ReLU + Sigmoid)
 * Grounded in Allentoft et al. (2012) depurination kinetics & Illumina synthesis error priors.
 * Weights synchronized with /models/aeon_dna_stability_model.json and /python/ml_mutation_predictor.py.
 */

import type { Nucleotide } from './dnaCodec';

export interface TrainingEpochLog {
  epoch: number;
  loss: number;
  trainAccuracy: number;
}

export interface PretrainedModelSpec {
  modelName: string;
  version: string;
  architecture: string;
  datasetFile: string;
  trainingSamples: number;
  testSamples: number;
  trainingHistory: TrainingEpochLog[];
  validationMetrics: {
    rocAuc: number;
    accuracy: number;
    f1Score: number;
    brierScore: number;
    precision: number;
    recall: number;
  };
  confusionMatrix: {
    tp: number;
    tn: number;
    fp: number;
    fn: number;
  };
  featureNames: string[];
  featureImportances: number[];
  layers: {
    w1: number[][]; // 16 x 8
    b1: number[];   // 16
    w2: number[][]; // 8 x 16
    b2: number[];   // 8
    w3: number[];   // 8
    b3: number;
  };
}

/**
 * Nearest-neighbor SantaLucia (1998) unified stacking free energy |ΔG°37| (kcal/mol)
 */
const NN_DELTA_G: Record<string, number> = {
  AA: 1.00, TT: 1.00, AT: 0.88, TA: 0.58,
  CA: 1.45, TG: 1.45, GT: 1.44, AC: 1.44,
  CT: 1.28, AG: 1.28, GA: 1.30, TC: 1.30,
  CG: 2.17, GC: 2.24, GG: 1.84, CC: 1.84,
};

/**
 * Exact pretrained MLP weights trained on data/aeon_dna_stability_dataset.csv (1,600 trials, 80/20 split)
 * via python/train_aeon_ml.py (60 epochs mini-batch SGD, Test Accuracy 91.56%, ROC-AUC 0.9763).
 */
export const PRETRAINED_AEON_MODEL: PretrainedModelSpec = {
  modelName: 'Aeon-MLP-BioStability-v1',
  version: '1.0.0',
  architecture: 'MLP (8 -> 16 ReLU -> 8 ReLU -> 1 Sigmoid)',
  datasetFile: 'data/aeon_dna_stability_dataset.csv',
  trainingSamples: 1280,
  testSamples: 320,
  trainingHistory: [
    { epoch: 1, loss: 0.6182, trainAccuracy: 0.7141 },
    { epoch: 10, loss: 0.3305, trainAccuracy: 0.8727 },
    { epoch: 20, loss: 0.2053, trainAccuracy: 0.9219 },
    { epoch: 35, loss: 0.1666, trainAccuracy: 0.9273 },
    { epoch: 60, loss: 0.1577, trainAccuracy: 0.9313 },
  ],
  validationMetrics: {
    rocAuc: 0.9763,
    accuracy: 0.9156,
    f1Score: 0.9414,
    brierScore: 0.059,
    precision: 0.9274,
    recall: 0.9559,
  },
  confusionMatrix: {
    tp: 217,
    tn: 76,
    fp: 17,
    fn: 10,
  },
  featureNames: [
    'GC Deviation |GC - 0.50|',
    'Max Homopolymer Run',
    'Purine Density (A+G)',
    'Cytosine Motif (C/CG)',
    'Stacking Energy |ΔG°37|',
    'Storage Duration log10(yr)',
    'Storage Temperature (°C)',
    'Channel Noise Intensity (mSv/yr)',
  ],
  featureImportances: [0.1043, 0.4093, 0.0128, 0.0321, 0.0642, 0.1766, 0.1605, 0.0401],
  layers: {
    w1: [
      [-0.07315, -0.08437, -0.06341, 0.33931, -0.07306, -0.74774, 0.14863, -0.13622],
      [-0.1043, 0.12359, 0.11915, 0.56612, 0.33416, 0.06035, -0.37474, -0.49233],
      [0.01757, 0.50141, -0.07188, -0.11738, 0.17943, -0.80624, -0.24103, 0.13324],
      [0.36765, -0.21907, 0.25985, 0.10632, 0.41815, -0.58164, 0.37928, -0.72779],
      [-1.30319, -0.30127, -0.47096, 0.41794, 0.31058, -0.61488, 0.38864, -0.50974],
      [-0.12303, -0.18385, 0.08462, 0.31729, 0.31363, 0.06647, 0.26057, 0.20658],
      [-0.3595, -0.38273, -0.01858, 0.29167, 0.05533, 1.19936, -0.41711, -0.39962],
      [0.78892, 1.17286, 0.15897, 0.55094, 0.68608, 0.03825, -0.29612, -0.28843],
      [0.85767, -0.23247, -0.1997, 0.23552, -0.28761, 0.57782, 0.54689, 1.12533],
      [0.29932, -0.30872, -0.28556, -0.4042, 0.47377, -0.28602, -0.04403, 0.37284],
      [-0.35929, -0.14587, -0.91538, -0.538, -0.28352, 0.20354, 0.58953, -0.01021],
      [0.1698, 0.18305, 0.54315, 0.42701, 0.13408, -0.48204, 0.4851, 0.20135],
      [0.35684, -0.24321, 1.17145, -0.27351, 0.93742, -0.1147, -0.42084, -0.50067],
      [0.50515, 1.28024, 0.33365, 0.70285, -1.14398, 0.90548, 0.72546, 0.02355],
      [0.077, 0.51279, 0.72892, -0.3434, -0.27821, 1.00629, 0.28028, -0.00775],
      [0.23557, -0.35194, 0.0305, -0.50544, 0.4032, 0.19454, 1.32417, 0.19065],
    ],
    b1: [
      -0.01749, 0.02785, -0.17752, 0.1692, -0.03716, 0.11082, 0.48745, -0.30036,
      -0.58224, -0.0137, -0.00343, 0.01919, 0.57417, -0.40057, -0.41507, -0.23925,
    ],
    w2: [
      [0.4788, -0.44779, -0.0396, 0.06807, 0.6105, -0.50175, 0.4041, 0.37075, 0.75789, 0.21802, 0.01901, -0.08915, -0.44414, 0.40094, 0.02985, 0.803],
      [-0.21493, 0.09781, -0.54812, -0.17879, 0.08967, 0.29911, 0.47096, 0.17024, -0.22791, 0.1302, 0.18211, 0.20693, -0.36948, 0.71938, 0.10945, 0.29578],
      [0.44721, 0.20996, 0.09697, 0.75425, 0.08554, -0.11526, 0.03772, 0.49804, 0.03095, 0.18211, 0.41972, -0.19299, -0.62057, 0.09328, 0.07632, -0.21472],
      [0.30518, 0.21607, -0.35412, 0.12253, -0.07117, -0.42493, 0.15917, 0.22353, 0.04607, 0.16986, 0.17219, -0.0863, 0.09514, 0.73018, -0.1342, 0.22558],
      [0.00021, 0.7715, -0.63049, 0.18444, -0.11117, -0.03866, 0.5936, 0.38115, 1.01015, -0.22112, 0.12416, -0.10098, -0.43084, 0.64305, 0.02517, 0.14018],
      [-0.73773, 0.74405, -0.06124, 0.71403, -0.34835, 0.24779, 1.23047, -0.61503, -0.72245, -0.10007, 0.16423, 0.34708, 0.95447, -0.6966, -0.66042, -0.1697],
      [0.43578, 0.17517, -0.69069, 0.02915, 0.49266, 0.78775, 0.23979, -0.0228, -0.51134, -0.26049, 0.01591, 0.20642, 0.38034, -0.39136, -0.44067, -0.26793],
      [-0.40705, 0.19433, -0.79167, -0.19822, 0.15357, 0.50384, -0.07566, 0.79254, 0.14045, -0.34564, -0.23535, 0.57874, 0.0369, 0.90723, 1.33079, 0.06647],
    ],
    b2: [-0.01327, -0.14267, -0.0191, -0.03849, -0.27161, 0.66639, 0.22773, -0.39056],
    w3: [0.77799, 0.63899, -0.0273, 0.93547, 1.1184, -1.74563, -0.6851, 1.34052],
    b3: -0.36347,
  },
};

export interface EnvironmentalConditions {
  storageYears: number;      // 0 .. 10000
  temperatureC: number;      // -80 .. 40
  radiationMSvPerYear: number; // 0.1 .. 50
}

export interface WindowPrediction {
  windowIndex: number;
  startBase: number;
  endBase: number;
  sequence: string;
  riskProbability: number;   // 0..1
  gcFraction: number;
  maxHomopolymer: number;
  deltaG: number;
  features: number[];
}

export interface SequenceStabilityReport {
  overallRiskScore: number;        // 0..1
  predictedSurvivalPct: number;    // 0..100
  estimatedHalfLifeYears: number;
  highRiskWindowCount: number;
  meanDeltaG: number;
  windows: WindowPrediction[];
  recommendation: string;
}

function relu(x: number): number {
  return x > 0 ? x : 0;
}

function sigmoid(x: number): number {
  const clamped = Math.max(-20, Math.min(20, x));
  return 1 / (1 + Math.exp(-clamped));
}

export function extractWindowFeatures(
  windowSeq: string,
  env: EnvironmentalConditions
): { features: number[]; gcFraction: number; maxHomopolymer: number; deltaG: number } {
  const len = Math.max(1, windowSeq.length);
  let g = 0;
  let c = 0;
  let a = 0;
  let cpg = 0;
  let maxRun = 1;
  let curRun = 1;
  let totalDeltaG = 0;

  for (let i = 0; i < windowSeq.length; i++) {
    const ch = windowSeq[i];
    if (ch === 'G') g++;
    else if (ch === 'C') c++;
    else if (ch === 'A') a++;

    if (i > 0) {
      if (ch === windowSeq[i - 1]) {
        curRun++;
        if (curRun > maxRun) maxRun = curRun;
      } else {
        curRun = 1;
      }
      const dimer = windowSeq[i - 1] + ch;
      if (dimer === 'CG') cpg++;
      totalDeltaG += NN_DELTA_G[dimer] ?? 1.3;
    }
  }

  const gcFraction = (g + c) / len;
  const gcDeviation = Math.abs(gcFraction - 0.5) * 2; // 0 (ideal 50%) -> 1 (extreme 0% or 100%)
  const normHomopolymer = Math.min(1, Math.max(0, (maxRun - 1) / 5)); // 1 -> 0.0, 6+ -> 1.0
  const purineDensity = (a + g) / len;
  const deaminationMotif = Math.min(1, (c / len) * 0.6 + (cpg / Math.max(1, len - 1)) * 2.5);
  const meanDeltaG = len > 1 ? totalDeltaG / (len - 1) : 1.3;
  const normDeltaG = Math.min(1, Math.max(0, (meanDeltaG - 0.58) / (2.24 - 0.58)));

  const normYears = Math.min(1, Math.log10(Math.max(0, env.storageYears) + 1) / 4);
  const normTemp = Math.min(1, Math.max(0, (env.temperatureC + 80) / 120));
  const normRad = Math.min(1, Math.log10(Math.max(0.1, env.radiationMSvPerYear) * 10) / 3);

  return {
    features: [
      gcDeviation,
      normHomopolymer,
      purineDensity,
      deaminationMotif,
      normDeltaG,
      normYears,
      normTemp,
      normRad,
    ],
    gcFraction,
    maxHomopolymer: maxRun,
    deltaG: meanDeltaG,
  };
}

/**
 * Forward pass through the pretrained 8 -> 16 -> 8 -> 1 MLP.
 */
export function predictWindowRisk(
  features: number[],
  model: PretrainedModelSpec = PRETRAINED_AEON_MODEL
): number {
  const { w1, b1, w2, b2, w3, b3 } = model.layers;

  const h1 = new Array<number>(w1.length);
  for (let i = 0; i < w1.length; i++) {
    let sum = b1[i];
    const row = w1[i];
    for (let j = 0; j < features.length; j++) {
      sum += row[j] * features[j];
    }
    h1[i] = relu(sum);
  }

  const h2 = new Array<number>(w2.length);
  for (let i = 0; i < w2.length; i++) {
    let sum = b2[i];
    const row = w2[i];
    for (let j = 0; j < h1.length; j++) {
      sum += row[j] * h1[j];
    }
    h2[i] = relu(sum);
  }

  let logit = b3;
  for (let i = 0; i < w3.length; i++) {
    logit += w3[i] * h2[i];
  }
  return sigmoid(logit);
}

/**
 * Arrhenius depurination half-life estimate grounded in Allentoft et al. (2012)
 * (521-year half-life at 13.1°C for 30 bp bond; lyophilized encapsulation extends stability ~40x).
 */
export function estimateHalfLifeYears(temperatureC: number, gcFraction: number): number {
  const tempK = Math.max(180, temperatureC + 273.15);
  const refK = 286.25; // 13.1 °C
  const EaOverR = 15250; // ~127 kJ/mol activation energy / R
  const arrheniusFactor = Math.exp(EaOverR * (1 / tempK - 1 / refK));
  const gcStabilityFactor = 0.85 + 0.3 * (1 - Math.abs(gcFraction - 0.52));
  const baseLyophilizedYears = 521 * 40;
  return Math.min(5_000_000, Math.max(12, baseLyophilizedYears * arrheniusFactor * gcStabilityFactor));
}

export function analyzeSequenceWithML(
  dna: string,
  env: EnvironmentalConditions,
  windowSize = 24
): SequenceStabilityReport {
  if (!dna.length) {
    return {
      overallRiskScore: 0,
      predictedSurvivalPct: 100,
      estimatedHalfLifeYears: estimateHalfLifeYears(env.temperatureC, 0.5),
      highRiskWindowCount: 0,
      meanDeltaG: 1.4,
      windows: [],
      recommendation: 'Encode a payload to run ML stability inference.',
    };
  }

  const maxWindows = 80;
  const effectiveWindow = Math.max(windowSize, Math.ceil(dna.length / maxWindows));
  const windows: WindowPrediction[] = [];
  let sumRisk = 0;
  let sumDeltaG = 0;
  let sumGc = 0;
  let highRiskCount = 0;

  for (let i = 0, wIdx = 0; i < dna.length; i += effectiveWindow, wIdx++) {
    const seq = dna.slice(i, Math.min(dna.length, i + effectiveWindow));
    const { features, gcFraction, maxHomopolymer, deltaG } = extractWindowFeatures(seq, env);
    const riskProbability = predictWindowRisk(features);
    sumRisk += riskProbability;
    sumDeltaG += deltaG;
    sumGc += gcFraction;
    if (riskProbability >= 0.55) highRiskCount++;

    windows.push({
      windowIndex: wIdx,
      startBase: i,
      endBase: i + seq.length - 1,
      sequence: seq,
      riskProbability,
      gcFraction,
      maxHomopolymer,
      deltaG,
      features,
    });
  }

  const n = Math.max(1, windows.length);
  const overallRiskScore = sumRisk / n;
  const meanGc = sumGc / n;
  const estimatedHalfLifeYears = estimateHalfLifeYears(env.temperatureC, meanGc);
  const predictedSurvivalPct = Math.max(
    0,
    Math.min(100, 100 * Math.pow(0.5, env.storageYears / estimatedHalfLifeYears) * (1 - overallRiskScore * 0.12))
  );

  let recommendation = 'Optimal synthesis profile: balanced GC and low homopolymer stress.';
  if (overallRiskScore >= 0.62) {
    recommendation = 'High degradation risk: enable Goldman Base-3 codec and lower storage temperature to ≤ -20°C.';
  } else if (overallRiskScore >= 0.42) {
    recommendation = 'Moderate stress detected: keep RS parity ≥ 64 and TMR 3-strand capsule enabled.';
  }

  return {
    overallRiskScore,
    predictedSurvivalPct,
    estimatedHalfLifeYears,
    highRiskWindowCount: highRiskCount,
    meanDeltaG: sumDeltaG / n,
    windows,
    recommendation,
  };
}

/**
 * ML-Weighted Soft-Voting tie-breaker for Triple Modular Redundancy (TMR):
 * When all 3 strands disagree at position i (e.g. 'A', 'G', 'T'), scores each candidate base
 * using the pretrained MLP local context stability (homopolymer penalty + stacking ΔG + local GC balance)
 * so the biologically most stable/plausible original nucleotide wins instead of blind Strand-1 fallback.
 */
export function mlResolveThreeWayConflict(
  candidates: [Nucleotide, Nucleotide, Nucleotide],
  leftContext: string,
  rightContext: string,
  env: EnvironmentalConditions
): Nucleotide {
  let bestBase: Nucleotide = candidates[0];
  let lowestRisk = Infinity;

  for (const cand of candidates) {
    const windowSeq = `${leftContext}${cand}${rightContext}`;
    const { features } = extractWindowFeatures(windowSeq, env);
    const risk = predictWindowRisk(features);
    if (risk < lowestRisk) {
      lowestRisk = risk;
      bestBase = cand;
    }
  }
  return bestBase;
}
