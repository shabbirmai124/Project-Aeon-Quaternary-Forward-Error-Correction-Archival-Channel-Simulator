/**
 * Project Aeon — End-to-End 8-Stage DNA Archival Pipeline, Radiation Simulator,
 * TMR Voting + Reed-Solomon Recovery, and Empirical Monte Carlo Benchmark Suite.
 */

import { rsEncodeStream, rsDecodeStream } from './reedSolomon';
import {
  bytesToDna,
  dnaToBytes,
  huffmanCompress,
  huffmanDecompress,
  analyzeDnaSequence,
  formatFasta,
  type EncodingScheme,
  type Nucleotide,
  type DnaBioMetrics,
} from './dnaCodec';
import {
  analyzeSequenceWithML,
  mlResolveThreeWayConflict,
  type EnvironmentalConditions,
  type SequenceStabilityReport,
} from './mlModel';

export interface AeonEncodeConfig {
  scheme: EncodingScheme;
  rsParity: number; // 16 .. 150
  huffmanEnabled: boolean;
  tmrEnabled: boolean;
  env: EnvironmentalConditions;
}

export interface AeonCapsule {
  capsuleId: string;
  payloadType: 'text' | 'image';
  originalBytes: Uint8Array;
  compressedBytes: Uint8Array;
  huffmanApplied: boolean;
  compressionRatio: number;
  rsProtectedBytes: Uint8Array;
  rsBlockCount: number;
  rsParity: number;
  scheme: EncodingScheme;
  tmrEnabled: boolean;
  cleanStrand: string;
  strands: [string, string, string];
  bioMetrics: DnaBioMetrics;
  mlReport: SequenceStabilityReport;
  fasta: string;
  env: EnvironmentalConditions;
}

export interface MutationRecord {
  strandIndex: number;
  position: number;
  original: Nucleotide;
  mutated: Nucleotide;
  mechanism: 'depurination' | 'deamination' | 'radiation-hit' | 'homopolymer-slip';
}

export interface IrradiatedCapsule {
  capsule: AeonCapsule;
  corruptedStrands: [string, string, string];
  mutations: MutationRecord[];
  simulatedYears: number;
  seed: number;
  corruptedNaiveBytes: Uint8Array; // Direct decode of Strand 1 without TMR or RS (for proof comparison)
}

export interface RecoveryReport {
  recoveredBytes: Uint8Array;
  repairedStrand: string;
  bitPerfect: boolean;
  byteAccuracyPct: number;
  berBeforeRepair: number;
  berAfterRepair: number;
  tmrPositionsRepaired: number;
  tmrThreeWayConflicts: number;
  mlTieBreaksWon: number;
  rsCorrectedSymbols: number;
  rsRepairedBlocks: number;
  rsUncorrectableBlocks: number;
  rsSuccess: boolean;
  huffmanSuccess: boolean;
  elapsedMs: number;
}

/**
 * Mulberry32 deterministic PRNG so every simulation run is reproducible for scientific audits.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateCapsuleId(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (let i = 0; i < Math.min(bytes.length, 512); i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `AEON-${hex.slice(0, 6)}`;
}

/**
 * Stages 1–4: Pre-processing (optional Huffman) -> Reed-Solomon FEC -> DNA Transcoding -> TMR Replication
 */
export function createCapsule(
  payloadBytes: Uint8Array,
  payloadType: 'text' | 'image',
  config: AeonEncodeConfig
): AeonCapsule {
  let stageBytes = payloadBytes;
  let huffmanApplied = false;
  let compressionRatio = 1;

  if (config.huffmanEnabled) {
    const comp = huffmanCompress(payloadBytes);
    stageBytes = comp.bytes;
    huffmanApplied = comp.compressed;
    compressionRatio = comp.ratio;
  }

  const rsRes = rsEncodeStream(stageBytes, config.rsParity);
  const cleanStrand = bytesToDna(rsRes.encoded, config.scheme);
  const strands: [string, string, string] = [cleanStrand, cleanStrand, cleanStrand];
  const bioMetrics = analyzeDnaSequence(cleanStrand, payloadBytes.length);
  const mlReport = analyzeSequenceWithML(cleanStrand, config.env);
  const capsuleId = generateCapsuleId(payloadBytes);

  const fasta = formatFasta({
    capsuleId,
    strands,
    scheme: config.scheme,
    rsParity: rsRes.parityPerBlock,
    huffmanEnabled: config.huffmanEnabled,
    payloadType,
    originalByteLength: payloadBytes.length,
    encodedPayloadLength: stageBytes.length,
  });

  return {
    capsuleId,
    payloadType,
    originalBytes: payloadBytes,
    compressedBytes: stageBytes,
    huffmanApplied,
    compressionRatio,
    rsProtectedBytes: rsRes.encoded,
    rsBlockCount: rsRes.blockCount,
    rsParity: rsRes.parityPerBlock,
    scheme: config.scheme,
    tmrEnabled: config.tmrEnabled,
    cleanStrand,
    strands,
    bioMetrics,
    mlReport,
    fasta,
    env: config.env,
  };
}

const OTHER_BASES: Record<Nucleotide, readonly [Nucleotide, Nucleotide, Nucleotide]> = {
  A: ['G', 'C', 'T'], // Transition A->G listed first (biologically most probable)
  G: ['A', 'T', 'C'],
  C: ['T', 'A', 'G'], // Cytosine deamination C->T listed first
  T: ['C', 'G', 'A'],
};

/**
 * Stage 5: Time-Travel Radiation & Chemical Degradation Simulation
 * Applies realistic transition-biased mutations (C->T deamination, A<->G depurination, cosmic ray hits)
 * distributed across the 3 TMR DNA strands (or Strand 1 only if TMR is disabled).
 */
export function simulateRadiation(
  capsule: AeonCapsule,
  totalMutations: number,
  simulatedYears: number,
  seed = 1000
): IrradiatedCapsule {
  const rng = createSeededRng(seed);
  const strandArrays = capsule.strands.map((s) => s.split('') as Nucleotide[]);
  const strandLen = capsule.cleanStrand.length;
  const mutations: MutationRecord[] = [];

  if (strandLen > 0 && totalMutations > 0) {
    const activeStrands = capsule.tmrEnabled ? 3 : 1;
    // Track mutated positions per strand to avoid silent double-hits canceling each other
    const used = [new Set<number>(), new Set<number>(), new Set<number>()];
    const maxAttempts = totalMutations * 4;
    let attempts = 0;

    while (mutations.length < totalMutations && attempts < maxAttempts) {
      attempts++;
      const sIdx = Math.floor(rng() * activeStrands);
      const pos = Math.floor(rng() * strandLen);
      if (used[sIdx].has(pos)) continue;
      used[sIdx].add(pos);

      const original = strandArrays[sIdx][pos];
      // Biophysical transition bias: 62% transition (C->T / A<->G), 38% transversion
      const r = rng();
      const choices = OTHER_BASES[original];
      const mutated = r < 0.62 ? choices[0] : r < 0.81 ? choices[1] : choices[2];

      let mechanism: MutationRecord['mechanism'] = 'radiation-hit';
      if (original === 'C' && mutated === 'T') mechanism = 'deamination';
      else if (original === 'A' || original === 'G') mechanism = 'depurination';
      else if (
        pos > 0 &&
        pos < strandLen - 1 &&
        (capsule.cleanStrand[pos - 1] === original || capsule.cleanStrand[pos + 1] === original)
      ) {
        mechanism = 'homopolymer-slip';
      }

      strandArrays[sIdx][pos] = mutated;
      mutations.push({ strandIndex: sIdx, position: pos, original, mutated, mechanism });
    }
  }

  const corruptedStrands: [string, string, string] = [
    strandArrays[0].join(''),
    strandArrays[1].join(''),
    strandArrays[2].join(''),
  ];

  // Naive direct decode of Strand 1 (no TMR, no RS) to visually demonstrate raw DNA damage
  const naiveRaw = dnaToBytes(corruptedStrands[0], capsule.scheme);
  const corruptedNaiveBytes = extractNaiveDataBlocks(
    naiveRaw,
    capsule.compressedBytes.length,
    capsule.rsParity
  );

  return {
    capsule,
    corruptedStrands,
    mutations,
    simulatedYears,
    seed,
    corruptedNaiveBytes,
  };
}

function extractNaiveDataBlocks(
  encoded: Uint8Array,
  targetLength: number,
  rsParity: number
): Uint8Array {
  const maxDataPerBlock = 255 - rsParity;
  const blockCount = Math.max(1, Math.ceil(targetLength / maxDataPerBlock));
  const out = new Uint8Array(targetLength);
  let encOffset = 0;
  let outOffset = 0;

  for (let b = 0; b < blockCount; b++) {
    const blockDataLen = Math.min(maxDataPerBlock, targetLength - outOffset);
    const slice = encoded.slice(encOffset, encOffset + blockDataLen);
    out.set(slice, outOffset);
    encOffset += blockDataLen + rsParity;
    outOffset += blockDataLen;
  }
  return out;
}

/**
 * Stages 6–7: TMR Majority + ML-Weighted Soft Voting -> Reed-Solomon Berlekamp-Massey Repair -> Huffman Decompression
 */
export function recoverCapsule(
  irradiated: IrradiatedCapsule,
  useMlSoftVoting = true
): RecoveryReport {
  const t0 = performance.now();
  const { capsule, corruptedStrands } = irradiated;
  const len = capsule.cleanStrand.length;
  const [s0, s1, s2] = corruptedStrands;

  let tmrPositionsRepaired = 0;
  let tmrThreeWayConflicts = 0;
  let mlTieBreaksWon = 0;
  let repairedStrand = s0;

  if (capsule.tmrEnabled) {
    const voted = new Array<Nucleotide>(len);
    for (let i = 0; i < len; i++) {
      const b0 = s0[i] as Nucleotide;
      const b1 = s1[i] as Nucleotide;
      const b2 = s2[i] as Nucleotide;

      if (b0 === b1 && b1 === b2) {
        voted[i] = b0;
      } else if (b0 === b1) {
        voted[i] = b0;
        tmrPositionsRepaired++;
      } else if (b0 === b2) {
        voted[i] = b0;
        tmrPositionsRepaired++;
      } else if (b1 === b2) {
        voted[i] = b1;
        tmrPositionsRepaired++;
      } else {
        // Rare 3-way collision: all 3 strands mutated at the exact same base!
        tmrThreeWayConflicts++;
        let winner: Nucleotide = b0;
        if (useMlSoftVoting) {
          const left = voted.slice(Math.max(0, i - 6), i).join('');
          const right = s0.slice(i + 1, Math.min(len, i + 7));
          winner = mlResolveThreeWayConflict([b0, b1, b2], left, right, capsule.env);
          if (winner === capsule.cleanStrand[i]) {
            mlTieBreaksWon++;
          }
        }
        voted[i] = winner;
      }
    }
    repairedStrand = voted.join('');
  }

  // Compute Bit Error Rate before RS repair
  const rawVotedBytes = dnaToBytes(repairedStrand, capsule.scheme);
  const berBeforeRepair = computeBitErrorRate(capsule.rsProtectedBytes, rawVotedBytes);

  // Reed-Solomon FEC Decode
  const rsRes = rsDecodeStream(rawVotedBytes, capsule.compressedBytes.length, capsule.rsParity);

  // Optional Huffman Decompression
  let recoveredBytes = rsRes.decoded;
  let huffmanSuccess = true;
  if (capsule.huffmanApplied || (capsule.compressedBytes[0] === 0xaf && capsule.compressedBytes.length === capsule.originalBytes.length + 5)) {
    try {
      recoveredBytes = huffmanDecompress(rsRes.decoded);
    } catch {
      huffmanSuccess = false;
      recoveredBytes = rsRes.decoded.slice(0, capsule.originalBytes.length);
    }
  }

  const berAfterRepair = computeBitErrorRate(capsule.originalBytes, recoveredBytes);
  const matchingBytes = countMatchingBytes(capsule.originalBytes, recoveredBytes);
  const byteAccuracyPct =
    capsule.originalBytes.length > 0
      ? (matchingBytes / capsule.originalBytes.length) * 100
      : 100;
  const bitPerfect =
    recoveredBytes.length === capsule.originalBytes.length &&
    matchingBytes === capsule.originalBytes.length;

  return {
    recoveredBytes,
    repairedStrand,
    bitPerfect,
    byteAccuracyPct,
    berBeforeRepair,
    berAfterRepair,
    tmrPositionsRepaired,
    tmrThreeWayConflicts,
    mlTieBreaksWon,
    rsCorrectedSymbols: rsRes.totalCorrectedSymbols,
    rsRepairedBlocks: rsRes.repairedBlocks,
    rsUncorrectableBlocks: rsRes.uncorrectableBlocks,
    rsSuccess: rsRes.success,
    huffmanSuccess,
    elapsedMs: Math.max(0.1, performance.now() - t0),
  };
}

export function computeBitErrorRate(a: Uint8Array, b: Uint8Array): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 0;
  let diffBits = 0;
  for (let i = 0; i < len; i++) {
    let xor = (a[i] ?? 0) ^ (b[i] ?? 0);
    while (xor !== 0) {
      diffBits += xor & 1;
      xor >>>= 1;
    }
  }
  return diffBits / (len * 8);
}

function countMatchingBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches;
}

/* ============================================================================
 * Empirical Monte Carlo Stress-Test Sweep (Real Encode -> Mutate -> Recover Trials)
 * ========================================================================== */

export interface StressSweepPoint {
  mutations: number;
  rawRecoveryPct: number;
  tmrOnlyRecoveryPct: number;
  aeonRsTmrRecoveryPct: number;
  aeonMlSoftRecoveryPct: number;
}

export function runEmpiricalStressSweep(
  sampleText = 'Project Aeon 1000-Year Synthetic DNA Archival Benchmark Payload — Silicon rots in decades; DNA lasts for millennia.',
  rsParity = 64
): StressSweepPoint[] {
  const payload = new TextEncoder().encode(sampleText);
  const env: EnvironmentalConditions = {
    storageYears: 1000,
    temperatureC: -20,
    radiationMSvPerYear: 2.4,
  };

  const capsuleRsTmr = createCapsule(payload, 'text', {
    scheme: 'standard-2bit',
    rsParity,
    huffmanEnabled: false,
    tmrEnabled: true,
    env,
  });

  const mutationLevels = [0, 10, 25, 45, 70, 100, 140, 190, 250];
  const points: StressSweepPoint[] = [];

  for (const muts of mutationLevels) {
    // 1. Raw (no TMR, no RS): inspect Strand 1 accuracy
    const irr = simulateRadiation(capsuleRsTmr, muts, 1000, 404 + muts);
    const rawMatches = countMatchingBytes(payload, irr.corruptedNaiveBytes);
    const rawRecoveryPct = (rawMatches / payload.length) * 100;

    // 2. TMR-only (majority vote across 3 strands, skipping RS)
    const [s0, s1, s2] = irr.corruptedStrands;
    let votedStr = '';
    for (let i = 0; i < s0.length; i++) {
      if (s0[i] === s1[i] || s0[i] === s2[i]) votedStr += s0[i];
      else if (s1[i] === s2[i]) votedStr += s1[i];
      else votedStr += s0[i];
    }
    const tmrNaiveBytes = extractNaiveDataBlocks(
      dnaToBytes(votedStr, 'standard-2bit'),
      payload.length,
      capsuleRsTmr.rsParity
    );
    const tmrOnlyRecoveryPct = (countMatchingBytes(payload, tmrNaiveBytes) / payload.length) * 100;

    // 3. Aeon Standard (TMR + RS)
    const recStd = recoverCapsule(irr, false);
    // 4. Aeon ML-Assisted (ML Soft-Vote TMR + RS)
    const recMl = recoverCapsule(irr, true);

    points.push({
      mutations: muts,
      rawRecoveryPct: Number(rawRecoveryPct.toFixed(1)),
      tmrOnlyRecoveryPct: Number(tmrOnlyRecoveryPct.toFixed(1)),
      aeonRsTmrRecoveryPct: Number(recStd.byteAccuracyPct.toFixed(1)),
      aeonMlSoftRecoveryPct: Number(recMl.byteAccuracyPct.toFixed(1)),
    });
  }

  return points;
}
