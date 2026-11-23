import { baseDecayRatePerYear } from './degradationModel';
import {
  createPrng,
  encodeDnaCapsule,
  recoverDnaCapsule,
  simulateRadiation,
} from './dnaCodec';

export interface MlTrainingSample {
  years: number;
  temperatureC: number;
  rsNsym: number;
  tmrEnabled: boolean;
  measuredByteErrorsPerBlock: number;
  recoveredBitPerfect: number; // 1 or 0
}

export interface MlModelMetrics {
  sampleCount: number;
  trainCount: number;
  testCount: number;
  epochs: number;
  lossHistory: Array<{ epoch: number; bceLoss: number; mseLoss: number }>;
  trainAccuracyPct: number;
  testAccuracyPct: number;
  rSquaredErrors: number;
  featureWeights: Array<{
    feature: string;
    classifierWeight: number;
    errorRegressorWeight: number;
  }>;
}

export interface TrainedDegradationModel {
  // Logistic classifier weights for P(100% Bit-Perfect Recovery)
  clsWeights: number[];
  clsBias: number;
  // Linear regressor weights for expected post-TMR byte errors per 255B block
  regWeights: number[];
  regBias: number;
  metrics: MlModelMetrics;
}

export interface ProofBenchmarkRow {
  label: string;
  years: number;
  temperatureC: number;
  trials: number;
  bitPerfectTrials: number;
  successRatePct: number;
  avgMutationsPerStrand: number;
  avgRsBytesRepaired: number;
  mlPredictedRecoveryPct: number;
}

function sigmoid(z: number): number {
  const clamped = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-clamped));
}

function extractFeatures(
  years: number,
  temperatureC: number,
  rsNsym: number,
  tmrEnabled: boolean,
): number[] {
  // Scaled physical features aligned to domain ranges
  const yearsScaled = years / 1000; // 0.1 for 100 yr, 1.0 for 1000 yr
  const tempScaled = (temperatureC + 80) / 100; // 0 at -80C, 1.0 at +20C
  const rsScaled = rsNsym / 150; // 1.0 at RS-150
  const tmrFlag = tmrEnabled ? 1 : 0;
  const thermalStress =
    Math.log10(Math.max(1e-8, baseDecayRatePerYear(temperatureC) * Math.max(1, years))) + 4;

  return [yearsScaled, tempScaled, rsScaled, tmrFlag, thermalStress];
}

export function generateTrainingDataset(seed = 2026): MlTrainingSample[] {
  const rand = createPrng(seed);
  const yearsGrid = [100, 250, 500, 1000, 2000, 4000];
  const tempsGrid = [-196, -80, -20, 4, 20];
  const rsGrid = [32, 64, 128, 150];
  const tmrGrid = [true, false];

  const samples: MlTrainingSample[] = [];

  for (const years of yearsGrid) {
    for (const temperatureC of tempsGrid) {
      for (const rsNsym of rsGrid) {
        for (const tmrEnabled of tmrGrid) {
          const rate = baseDecayRatePerYear(temperatureC);
          const pBase = 1 - Math.exp(-rate * years);
          const pAfterTmr = tmrEnabled
            ? Math.min(1, 3 * pBase * pBase - 2 * pBase * pBase * pBase)
            : pBase;
          const pByte = 1 - Math.pow(1 - pAfterTmr, 4);

          // Sample a 255-byte block realization with stochastic jitter
          const expectedErrs = 255 * pByte;
          const jitter = (rand() - 0.5) * 2 * Math.sqrt(Math.max(0.25, expectedErrs));
          const measuredByteErrors = Math.max(
            0,
            Math.min(255, Math.round(expectedErrs + jitter)),
          );
          const maxCorrectable = Math.floor(rsNsym / 2);

          samples.push({
            years,
            temperatureC,
            rsNsym,
            tmrEnabled,
            measuredByteErrorsPerBlock: measuredByteErrors,
            recoveredBitPerfect: measuredByteErrors <= maxCorrectable ? 1 : 0,
          });
        }
      }
    }
  }

  // Deterministic Fisher-Yates shuffle for train/test split
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = samples[i];
    samples[i] = samples[j];
    samples[j] = tmp;
  }

  return samples;
}

export function trainDegradationMlModel(
  epochs = 140,
  seed = 2026,
): TrainedDegradationModel {
  const dataset = generateTrainingDataset(seed);
  const splitIdx = Math.floor(dataset.length * 0.8);
  const trainSet = dataset.slice(0, splitIdx);
  const testSet = dataset.slice(splitIdx);

  const featureNames = [
    'Archival Duration (×1000 yr)',
    'Storage Temp ((T+80)/100 °C)',
    'RS Parity Capacity (nsym/150)',
    'Triple Modular Redundancy (3×)',
    'Log Arrhenius Stress Index',
  ];

  const numFeatures = featureNames.length;
  const clsWeights = new Array<number>(numFeatures).fill(0);
  let clsBias = 0;

  const regWeights = new Array<number>(numFeatures).fill(0);
  let regBias = 0;

  const clsLr = 0.28;
  const regLr = 0.04;
  const l2 = 0.002;
  const lossHistory: MlModelMetrics['lossHistory'] = [];

  const trainFeatures = trainSet.map((s) =>
    extractFeatures(s.years, s.temperatureC, s.rsNsym, s.tmrEnabled),
  );

  for (let ep = 1; ep <= epochs; ep++) {
    const gradClsW = new Array<number>(numFeatures).fill(0);
    let gradClsB = 0;
    const gradRegW = new Array<number>(numFeatures).fill(0);
    let gradRegB = 0;

    let bceLoss = 0;
    let mseLoss = 0;

    for (let i = 0; i < trainSet.length; i++) {
      const x = trainFeatures[i];
      const yCls = trainSet[i].recoveredBitPerfect;
      const yReg = trainSet[i].measuredByteErrorsPerBlock / 255;

      // Logistic forward pass
      let z = clsBias;
      let yHatReg = regBias;
      for (let f = 0; f < numFeatures; f++) {
        z += clsWeights[f] * x[f];
        yHatReg += regWeights[f] * x[f];
      }
      const pHat = sigmoid(z);
      const eps = 1e-7;
      bceLoss += -(
        yCls * Math.log(pHat + eps) +
        (1 - yCls) * Math.log(1 - pHat + eps)
      );

      const errCls = pHat - yCls;
      for (let f = 0; f < numFeatures; f++) {
        gradClsW[f] += errCls * x[f];
      }
      gradClsB += errCls;

      // Linear regressor forward pass
      const errReg = yHatReg - yReg;
      mseLoss += errReg * errReg;
      for (let f = 0; f < numFeatures; f++) {
        gradRegW[f] += errReg * x[f];
      }
      gradRegB += errReg;
    }

    const n = trainSet.length;
    for (let f = 0; f < numFeatures; f++) {
      clsWeights[f] -= clsLr * (gradClsW[f] / n + l2 * clsWeights[f]);
      regWeights[f] -= regLr * (gradRegW[f] / n + l2 * regWeights[f]);
    }
    clsBias -= clsLr * (gradClsB / n);
    regBias -= regLr * (gradRegB / n);

    if (ep === 1 || ep % 10 === 0 || ep === epochs) {
      lossHistory.push({
        epoch: ep,
        bceLoss: bceLoss / n,
        mseLoss: mseLoss / n,
      });
    }
  }

  const evalAccuracy = (rows: MlTrainingSample[]) => {
    let correct = 0;
    for (const row of rows) {
      const x = extractFeatures(
        row.years,
        row.temperatureC,
        row.rsNsym,
        row.tmrEnabled,
      );
      let z = clsBias;
      for (let f = 0; f < numFeatures; f++) z += clsWeights[f] * x[f];
      const pred = sigmoid(z) >= 0.5 ? 1 : 0;
      if (pred === row.recoveredBitPerfect) correct++;
    }
    return (correct / Math.max(1, rows.length)) * 100;
  };

  // Compute R^2 on held-out test set for byte error regressor
  const meanTestY =
    testSet.reduce((acc, r) => acc + r.measuredByteErrorsPerBlock / 255, 0) /
    Math.max(1, testSet.length);
  let ssRes = 0;
  let ssTot = 0;
  for (const row of testSet) {
    const x = extractFeatures(
      row.years,
      row.temperatureC,
      row.rsNsym,
      row.tmrEnabled,
    );
    let yHat = regBias;
    for (let f = 0; f < numFeatures; f++) yHat += regWeights[f] * x[f];
    const yTrue = row.measuredByteErrorsPerBlock / 255;
    ssRes += (yTrue - yHat) ** 2;
    ssTot += (yTrue - meanTestY) ** 2;
  }
  const rSquaredErrors = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;

  return {
    clsWeights,
    clsBias,
    regWeights,
    regBias,
    metrics: {
      sampleCount: dataset.length,
      trainCount: trainSet.length,
      testCount: testSet.length,
      epochs,
      lossHistory,
      trainAccuracyPct: evalAccuracy(trainSet),
      testAccuracyPct: evalAccuracy(testSet),
      rSquaredErrors,
      featureWeights: featureNames.map((feature, idx) => ({
        feature,
        classifierWeight: clsWeights[idx],
        errorRegressorWeight: regWeights[idx],
      })),
    },
  };
}

export function predictRecoveryWithMl(
  model: TrainedDegradationModel,
  params: {
    years: number;
    temperatureC: number;
    rsNsym: number;
    tmrEnabled: boolean;
  },
): { recoveryProbabilityPct: number; predictedBlockErrors: number } {
  const x = extractFeatures(
    params.years,
    params.temperatureC,
    params.rsNsym,
    params.tmrEnabled,
  );
  let z = model.clsBias;
  let errFrac = model.regBias;
  for (let f = 0; f < x.length; f++) {
    z += model.clsWeights[f] * x[f];
    errFrac += model.regWeights[f] * x[f];
  }
  return {
    recoveryProbabilityPct: sigmoid(z) * 100,
    predictedBlockErrors: Math.max(0, Math.min(255, errFrac * 255)),
  };
}

export function runHundredYearProofBenchmark(
  model: TrainedDegradationModel,
  samplePayload: Uint8Array,
  rsNsym = 150,
  tmrEnabled = true,
  trialsPerRegime = 30,
): ProofBenchmarkRow[] {
  const capsule = encodeDnaCapsule(samplePayload, {
    rsNsym,
    tmrEnabled,
    capsuleId: 'PROOF-100YR',
  });

  const scenarios = [
    { label: '100 Years · Cryogenic (-80 °C)', years: 100, temperatureC: -80 },
    { label: '100 Years · Cold Archive (+4 °C)', years: 100, temperatureC: 4 },
    { label: '100 Years · Ambient Room (+20 °C)', years: 100, temperatureC: 20 },
    { label: '1,000 Years · Cryogenic (-80 °C)', years: 1000, temperatureC: -80 },
  ];

  return scenarios.map((sc, sIdx) => {
    const rate = baseDecayRatePerYear(sc.temperatureC);
    const pBase = 1 - Math.exp(-rate * sc.years);
    const expectedMutPerStrand = Math.max(
      // Even at ultra-low -80C 100-yr rate, inject minimum cosmic floor sample (e.g. >= 1-3 nt)
      sc.years >= 100 ? 1 : 0,
      Math.round(capsule.encodedDna.length * pBase),
    );

    let bitPerfectTrials = 0;
    let totalRepaired = 0;

    for (let t = 0; t < trialsPerRegime; t++) {
      const sim = simulateRadiation(
        capsule,
        expectedMutPerStrand,
        10000 + sIdx * 500 + t,
      );
      const rec = recoverDnaCapsule(capsule, sim);
      if (rec.exactMatch) bitPerfectTrials++;
      totalRepaired += rec.rsReport.correctedErrors;
    }

    const mlPred = predictRecoveryWithMl(model, {
      years: sc.years,
      temperatureC: sc.temperatureC,
      rsNsym,
      tmrEnabled,
    });

    return {
      label: sc.label,
      years: sc.years,
      temperatureC: sc.temperatureC,
      trials: trialsPerRegime,
      bitPerfectTrials,
      successRatePct: (bitPerfectTrials / trialsPerRegime) * 100,
      avgMutationsPerStrand: expectedMutPerStrand,
      avgRsBytesRepaired: totalRepaired / trialsPerRegime,
      mlPredictedRecoveryPct: mlPred.recoveryProbabilityPct,
    };
  });
}
