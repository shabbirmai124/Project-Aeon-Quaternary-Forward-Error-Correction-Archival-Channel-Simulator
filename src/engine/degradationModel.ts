export interface StabilityEnvironment {
  years: number;
  temperatureC: number;
  strandLengthBp: number;
  rsNsym: number;
  tmrEnabled: boolean;
}

export interface StabilityCurvePoint {
  year: number;
  unprotectedSurvivalPct: number;
  aeonSurvivalPct: number;
  expectedBaseErrorRate: number;
  expectedByteErrorsPerBlock: number;
}

export interface DegradationPrediction {
  halfLifeYears: number;
  expectedMutationsAtTargetYear: number;
  expectedBaseErrorRatePct: number;
  unprotectedSurvivalPct: number;
  aeonSurvivalPct: number;
  maxCorrectableErrorsPerBlock: number;
  predictedMaxSafeYears: number;
  thermalRegimeLabel: string;
  curve: StabilityCurvePoint[];
}

// Arrhenius-scaled depurination + background cosmic radiation rate per base per year
// Reference: Allentoft et al. (2012) DNA decay kinetics + Grass et al. (2015) encapsulated silica storage
export function baseDecayRatePerYear(temperatureC: number): number {
  const kelvin = temperatureC + 273.15;
  const refKelvin = 293.15; // 20 C baseline
  // Activation energy ~127 kJ/mol for depurination in encapsulated state
  const eaOverR = 15275;
  const thermalFactor = Math.exp(-eaOverR * (1 / kelvin - 1 / refKelvin));
  // Baseline ambient encapsulated depurination rate ~ 1.8e-4 / bp / year at 20 C
  // Plus cryogenic floor from cosmic/background ionizing radiation (~3.5e-7 / bp / year)
  const thermalRate = 1.8e-4 * thermalFactor;
  const radiationFloor = 3.5e-7;
  return thermalRate + radiationFloor;
}

// Binomial tail approximation for block survival under byte error probability pByte
function binomialSurvivalProbability(
  blockLen: number,
  maxCorrectable: number,
  pByte: number,
): number {
  if (pByte <= 0) return 1;
  if (pByte >= 1) return 0;

  const mean = blockLen * pByte;
  const variance = blockLen * pByte * (1 - pByte);
  if (variance < 1e-12) {
    return mean <= maxCorrectable ? 1 : 0;
  }
  const std = Math.sqrt(variance);
  // Continuity-corrected normal CDF approximation P(X <= maxCorrectable)
  const z = (maxCorrectable + 0.5 - mean) / std;
  return normalCdf(z);
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 erf approximation
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export function predictDegradation(
  env: StabilityEnvironment,
  chartMaxYears?: number,
): DegradationPrediction {
  const rate = baseDecayRatePerYear(env.temperatureC);
  const halfLifeYears = Math.LN2 / rate;
  const maxCorrectable = Math.floor(env.rsNsym / 2);
  const blockLen = Math.min(255, Math.max(16, 255));

  const computeAtYear = (year: number): StabilityCurvePoint => {
    // Probability a single base mutates after t years
    const pBase = 1 - Math.exp(-rate * year);
    // With TMR (3 copies), majority vote fails at a locus if >= 2 copies mutate to the same/wrong state
    // Effective locus error rate with 3x TMR: ~ 3*p^2 - 2*p^3 (conservative: 3*p^2)
    const pBaseAfterTmr = env.tmrEnabled
      ? Math.min(1, 3 * pBase * pBase - 2 * pBase * pBase * pBase)
      : pBase;

    // 4 bases per byte -> byte error if any of 4 bases is wrong
    const pByteUnprotected = 1 - Math.pow(1 - pBase, 4);
    const pByteProtected = 1 - Math.pow(1 - pBaseAfterTmr, 4);

    // Unprotected archival integrity (fraction of bytes intact)
    const unprotectedSurvivalPct = Math.max(0, (1 - pByteUnprotected) * 100);

    // Aeon block recovery probability (Reed-Solomon corrects up to floor(nsym/2) byte errors per 255B block)
    const blockSuccessProb = binomialSurvivalProbability(
      blockLen,
      maxCorrectable,
      pByteProtected,
    );

    return {
      year,
      unprotectedSurvivalPct,
      aeonSurvivalPct: Math.max(0, Math.min(100, blockSuccessProb * 100)),
      expectedBaseErrorRate: pBase,
      expectedByteErrorsPerBlock: blockLen * pByteProtected,
    };
  };

  const maxChartYear = chartMaxYears ?? Math.max(2000, env.years);
  const steps = 20;
  const curve: StabilityCurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const yr = Math.round((maxChartYear / steps) * i);
    curve.push(computeAtYear(yr));
  }

  const target = computeAtYear(env.years);

  // Binary search for max safe years (>= 99.9% Aeon survival)
  let lo = 0;
  let hi = 2_000_000;
  for (let iter = 0; iter < 32; iter++) {
    const mid = (lo + hi) / 2;
    if (computeAtYear(mid).aeonSurvivalPct >= 99.9) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  let thermalRegimeLabel = 'Ambient Archival';
  if (env.temperatureC <= -150) thermalRegimeLabel = 'Liquid Nitrogen Cryo';
  else if (env.temperatureC <= -60) thermalRegimeLabel = 'Ultra-Low Cryogenic';
  else if (env.temperatureC <= -10) thermalRegimeLabel = 'Deep Freeze Vault';
  else if (env.temperatureC <= 10) thermalRegimeLabel = 'Cold Room Archive';

  return {
    halfLifeYears,
    expectedMutationsAtTargetYear: Math.round(
      env.strandLengthBp * target.expectedBaseErrorRate,
    ),
    expectedBaseErrorRatePct: target.expectedBaseErrorRate * 100,
    unprotectedSurvivalPct: target.unprotectedSurvivalPct,
    aeonSurvivalPct: target.aeonSurvivalPct,
    maxCorrectableErrorsPerBlock: maxCorrectable,
    predictedMaxSafeYears: Math.round(lo),
    thermalRegimeLabel,
    curve,
  };
}
