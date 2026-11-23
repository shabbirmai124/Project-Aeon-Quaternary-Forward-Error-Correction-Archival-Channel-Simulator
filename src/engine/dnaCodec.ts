import { rsDecode, rsEncode, type RsDecodeReport } from './reedSolomon';

export type Nucleotide = 'A' | 'C' | 'G' | 'T';

const TWO_BIT_TO_BASE: readonly Nucleotide[] = ['A', 'C', 'G', 'T'];
const BASE_TO_TWO_BIT: Record<string, number> = {
  A: 0,
  C: 1,
  G: 2,
  T: 3,
};

export function bytesToDna(bytes: Uint8Array): string {
  const chars = new Array<string>(bytes.length * 4);
  let idx = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    chars[idx++] = TWO_BIT_TO_BASE[(b >> 6) & 0x03];
    chars[idx++] = TWO_BIT_TO_BASE[(b >> 4) & 0x03];
    chars[idx++] = TWO_BIT_TO_BASE[(b >> 2) & 0x03];
    chars[idx++] = TWO_BIT_TO_BASE[b & 0x03];
  }
  return chars.join('');
}

export function dnaToBytes(dna: string): Uint8Array {
  const cleanLen = Math.floor(dna.length / 4);
  const bytes = new Uint8Array(cleanLen);
  for (let i = 0; i < cleanLen; i++) {
    const o = i * 4;
    const b0 = BASE_TO_TWO_BIT[dna[o]] ?? 0;
    const b1 = BASE_TO_TWO_BIT[dna[o + 1]] ?? 0;
    const b2 = BASE_TO_TWO_BIT[dna[o + 2]] ?? 0;
    const b3 = BASE_TO_TWO_BIT[dna[o + 3]] ?? 0;
    bytes[i] = (b0 << 6) | (b1 << 4) | (b2 << 2) | b3;
  }
  return bytes;
}

export interface SequenceMetrics {
  lengthBp: number;
  gcPercent: number;
  maxHomopolymerRun: number;
  baseCounts: Record<Nucleotide, number>;
  codingDensityBitsPerNt: number;
}

export function analyzeSequence(dna: string): SequenceMetrics {
  const counts: Record<Nucleotide, number> = { A: 0, C: 0, G: 0, T: 0 };
  let maxRun = 0;
  let currentRun = 0;
  let prev = '';

  for (let i = 0; i < dna.length; i++) {
    const ch = dna[i] as Nucleotide;
    if (ch in counts) {
      counts[ch]++;
    }
    if (ch === prev) {
      currentRun++;
    } else {
      currentRun = 1;
      prev = ch;
    }
    if (currentRun > maxRun) {
      maxRun = currentRun;
    }
  }

  const len = dna.length;
  const gcPercent = len > 0 ? ((counts.G + counts.C) / len) * 100 : 0;

  return {
    lengthBp: len,
    gcPercent,
    maxHomopolymerRun: maxRun,
    baseCounts: counts,
    codingDensityBitsPerNt: 2.0,
  };
}

// Mulberry32 deterministic PRNG
export function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DnaCapsule {
  capsuleId: string;
  originalBytes: Uint8Array;
  originalDnaRaw: string;
  protectedBytes: Uint8Array;
  encodedDna: string;
  copies: string[];
  tmrEnabled: boolean;
  rsNsym: number;
  blockCount: number;
  dataBlockSize: number;
  metrics: SequenceMetrics;
}

export function encodeDnaCapsule(
  payload: Uint8Array,
  options: { rsNsym: number; tmrEnabled: boolean; capsuleId?: string },
): DnaCapsule {
  const rsNsym = Math.max(4, Math.min(180, options.rsNsym));
  const originalDnaRaw = bytesToDna(payload);
  const rsResult = rsEncode(payload, rsNsym);
  const encodedDna = bytesToDna(rsResult.bytes);
  const copies = options.tmrEnabled
    ? [encodedDna, encodedDna, encodedDna]
    : [encodedDna];

  return {
    capsuleId: options.capsuleId ?? 'DNA-ARC-003',
    originalBytes: payload,
    originalDnaRaw,
    protectedBytes: rsResult.bytes,
    encodedDna,
    copies,
    tmrEnabled: options.tmrEnabled,
    rsNsym: rsResult.nsym,
    blockCount: rsResult.blockCount,
    dataBlockSize: rsResult.dataBlockSize,
    metrics: analyzeSequence(encodedDna),
  };
}

export interface MutationEvent {
  copyIndex: number;
  position: number;
  from: Nucleotide;
  to: Nucleotide;
}

export interface RadiationSimulationResult {
  corruptedCopies: string[];
  corruptedRawDna: string;
  totalMutationsApplied: number;
  mutationsPerCopy: number[];
  events: MutationEvent[];
}

export function simulateRadiation(
  capsule: DnaCapsule,
  mutationsPerCopyTarget: number,
  seed = 1000,
): RadiationSimulationResult {
  const rand = createPrng(seed);
  const bases: readonly Nucleotide[] = ['A', 'C', 'G', 'T'];
  const events: MutationEvent[] = [];
  const corruptedCopies: string[] = [];
  const mutationsPerCopy: number[] = [];

  for (let c = 0; c < capsule.copies.length; c++) {
    const arr = capsule.copies[c].split('');
    const len = arr.length;
    const count = Math.min(len, Math.max(0, Math.round(mutationsPerCopyTarget)));
    const mutatedPositions = new Set<number>();

    // Sample distinct loci when count <= len * 0.7
    let attempts = 0;
    while (mutatedPositions.size < count && attempts < count * 6 + 64) {
      attempts++;
      const pos = Math.floor(rand() * len);
      if (mutatedPositions.has(pos)) continue;
      mutatedPositions.add(pos);

      const original = arr[pos] as Nucleotide;
      const alternatives = bases.filter((b) => b !== original);
      const nextBase = alternatives[Math.floor(rand() * alternatives.length)];
      arr[pos] = nextBase;

      if (events.length < 300) {
        events.push({
          copyIndex: c,
          position: pos,
          from: original,
          to: nextBase,
        });
      }
    }

    mutationsPerCopy.push(mutatedPositions.size);
    corruptedCopies.push(arr.join(''));
  }

  // Also simulate equal mutation density on unprotected raw DNA for side-by-side comparison
  const rawArr = capsule.originalDnaRaw.split('');
  const rawLen = rawArr.length;
  const ratio = capsule.encodedDna.length > 0
    ? Math.min(0.6, mutationsPerCopyTarget / capsule.encodedDna.length)
    : 0;
  const rawMutCount = Math.min(rawLen, Math.round(rawLen * ratio));
  const rawPositions = new Set<number>();
  let rawAttempts = 0;
  while (rawPositions.size < rawMutCount && rawAttempts < rawMutCount * 6 + 32) {
    rawAttempts++;
    const pos = Math.floor(rand() * rawLen);
    if (rawPositions.has(pos)) continue;
    rawPositions.add(pos);
    const original = rawArr[pos] as Nucleotide;
    const alternatives = bases.filter((b) => b !== original);
    rawArr[pos] = alternatives[Math.floor(rand() * alternatives.length)];
  }

  return {
    corruptedCopies,
    corruptedRawDna: rawArr.join(''),
    totalMutationsApplied: mutationsPerCopy.reduce((a, b) => a + b, 0),
    mutationsPerCopy,
    events,
  };
}

export interface TmrVoteResult {
  votedDna: string;
  unanimousLoci: number;
  votedRepairedLoci: number;
  threeWayDisagreements: number;
}

export function voteTmrCopies(copies: string[]): TmrVoteResult {
  if (copies.length === 0) {
    return {
      votedDna: '',
      unanimousLoci: 0,
      votedRepairedLoci: 0,
      threeWayDisagreements: 0,
    };
  }
  if (copies.length < 3) {
    return {
      votedDna: copies[0],
      unanimousLoci: copies[0].length,
      votedRepairedLoci: 0,
      threeWayDisagreements: 0,
    };
  }

  const [c0, c1, c2] = copies;
  const len = Math.min(c0.length, c1.length, c2.length);
  const out = new Array<string>(len);
  let unanimousLoci = 0;
  let votedRepairedLoci = 0;
  let threeWayDisagreements = 0;

  for (let i = 0; i < len; i++) {
    const a = c0[i];
    const b = c1[i];
    const c = c2[i];

    if (a === b && b === c) {
      out[i] = a;
      unanimousLoci++;
    } else if (a === b) {
      out[i] = a;
      votedRepairedLoci++;
    } else if (a === c) {
      out[i] = a;
      votedRepairedLoci++;
    } else if (b === c) {
      out[i] = b;
      votedRepairedLoci++;
    } else {
      out[i] = a;
      threeWayDisagreements++;
    }
  }

  return {
    votedDna: out.join(''),
    unanimousLoci,
    votedRepairedLoci,
    threeWayDisagreements,
  };
}

export interface RecoveryReport {
  tmrVote: TmrVoteResult;
  rsReport: RsDecodeReport;
  recoveredBytes: Uint8Array;
  unprotectedBytes: Uint8Array;
  byteIntegrityPercent: number;
  unprotectedIntegrityPercent: number;
  exactMatch: boolean;
  differingBytes: number;
}

export function recoverDnaCapsule(
  capsule: DnaCapsule,
  simResult: RadiationSimulationResult,
): RecoveryReport {
  const tmrVote = voteTmrCopies(simResult.corruptedCopies);
  const votedBytes = dnaToBytes(tmrVote.votedDna);
  const rsReport = rsDecode(
    votedBytes,
    capsule.rsNsym,
    capsule.originalBytes.length,
  );
  const unprotectedBytes = dnaToBytes(simResult.corruptedRawDna).slice(
    0,
    capsule.originalBytes.length,
  );

  let matchingAeon = 0;
  let matchingUnprotected = 0;
  const len = capsule.originalBytes.length;

  for (let i = 0; i < len; i++) {
    if (rsReport.bytes[i] === capsule.originalBytes[i]) matchingAeon++;
    if (unprotectedBytes[i] === capsule.originalBytes[i]) matchingUnprotected++;
  }

  const byteIntegrityPercent = len > 0 ? (matchingAeon / len) * 100 : 100;
  const unprotectedIntegrityPercent =
    len > 0 ? (matchingUnprotected / len) * 100 : 100;

  return {
    tmrVote,
    rsReport,
    recoveredBytes: rsReport.bytes,
    unprotectedBytes,
    byteIntegrityPercent,
    unprotectedIntegrityPercent,
    exactMatch:
      rsReport.uncorrectableBlocks === 0 && matchingAeon === len,
    differingBytes: len - matchingAeon,
  };
}

export function formatFasta(
  capsuleId: string,
  dna: string,
  meta: {
    payloadType: string;
    gcPercent: number;
    rsNsym: number;
    tmrEnabled: boolean;
    originalBytes: number;
  },
): string {
  const header = `>${capsuleId}|PROJECT_AEON|TYPE=${meta.payloadType}|BYTES=${meta.originalBytes}|BP=${dna.length}|GC=${meta.gcPercent.toFixed(2)}%|RS_NSYM=${meta.rsNsym}|TMR=${meta.tmrEnabled ? '3X' : '1X'}`;
  const lines: string[] = [header];
  const width = 70;
  for (let i = 0; i < dna.length; i += width) {
    lines.push(dna.slice(i, i + width));
  }
  return lines.join('\n');
}
