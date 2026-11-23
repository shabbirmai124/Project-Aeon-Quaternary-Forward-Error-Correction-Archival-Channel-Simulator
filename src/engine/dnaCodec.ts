/**
 * Project Aeon — DNA Transcoding, Huffman Compression, Goldman Base-3 Homopolymer-Free Codec,
 * Biophysical Sequence Metrics, and NCBI-Compliant FASTA Exporter/Parser.
 */

export type Nucleotide = 'A' | 'C' | 'G' | 'T';
export type EncodingScheme = 'standard-2bit' | 'goldman-base3';

const BITS_TO_BASE: readonly Nucleotide[] = ['A', 'C', 'G', 'T'];
const BASE_TO_BITS: Record<string, number> = { A: 0, C: 1, G: 2, T: 3 };

/**
 * Goldman (Nature 2013) differential rotation table:
 * Given previous nucleotide, maps trit (0, 1, 2) to one of the other 3 bases.
 * Mathematically guarantees max homopolymer run length === 1 (zero adjacent identical bases).
 */
const GOLDMAN_ENCODE: Record<Nucleotide, readonly [Nucleotide, Nucleotide, Nucleotide]> = {
  A: ['C', 'G', 'T'],
  C: ['G', 'T', 'A'],
  G: ['T', 'A', 'C'],
  T: ['A', 'C', 'G'],
};

const GOLDMAN_DECODE: Record<Nucleotide, Partial<Record<Nucleotide, number>>> = {
  A: { C: 0, G: 1, T: 2 },
  C: { G: 0, T: 1, A: 2 },
  G: { T: 0, A: 1, C: 2 },
  T: { A: 0, C: 1, G: 2 },
};

/**
 * Standard 2-bit-per-base transcoding (4 nucleotides per byte).
 */
export function bytesToDnaStandard(bytes: Uint8Array): string {
  const chars = new Array<string>(bytes.length * 4);
  let idx = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    chars[idx++] = BITS_TO_BASE[(b >> 6) & 3];
    chars[idx++] = BITS_TO_BASE[(b >> 4) & 3];
    chars[idx++] = BITS_TO_BASE[(b >> 2) & 3];
    chars[idx++] = BITS_TO_BASE[b & 3];
  }
  return chars.join('');
}

export function dnaStandardToBytes(dna: string): Uint8Array {
  const byteLen = Math.floor(dna.length / 4);
  const out = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    const o = i * 4;
    const b0 = BASE_TO_BITS[dna[o]] ?? 0;
    const b1 = BASE_TO_BITS[dna[o + 1]] ?? 0;
    const b2 = BASE_TO_BITS[dna[o + 2]] ?? 0;
    const b3 = BASE_TO_BITS[dna[o + 3]] ?? 0;
    out[i] = (b0 << 6) | (b1 << 4) | (b2 << 2) | b3;
  }
  return out;
}

/**
 * Goldman Base-3 Homopolymer-Free Transcoding:
 * Each byte (0..255) is represented as 6 base-3 trits (3^6 = 729 >= 256, fixed width for
 * error isolation so a single point mutation never desynchronizes downstream bytes!).
 * Differential rotation ensures NO two adjacent bases are ever identical.
 */
export function bytesToDnaGoldman(bytes: Uint8Array): string {
  const chars = new Array<string>(bytes.length * 6);
  let prev: Nucleotide = 'A';
  let idx = 0;

  for (let i = 0; i < bytes.length; i++) {
    let val = bytes[i];
    const trits = [0, 0, 0, 0, 0, 0];
    for (let t = 5; t >= 0; t--) {
      trits[t] = val % 3;
      val = Math.floor(val / 3);
    }
    for (let t = 0; t < 6; t++) {
      const next = GOLDMAN_ENCODE[prev][trits[t]];
      chars[idx++] = next;
      prev = next;
    }
  }
  return chars.join('');
}

export function dnaGoldmanToBytes(dna: string): Uint8Array {
  const byteLen = Math.floor(dna.length / 6);
  const out = new Uint8Array(byteLen);
  let prev: Nucleotide = 'A';

  for (let i = 0; i < byteLen; i++) {
    let val = 0;
    for (let t = 0; t < 6; t++) {
      const ch = (dna[i * 6 + t] as Nucleotide) || 'C';
      const trit = GOLDMAN_DECODE[prev][ch] ?? 0;
      val = val * 3 + trit;
      prev = ch === 'A' || ch === 'C' || ch === 'G' || ch === 'T' ? ch : prev;
    }
    out[i] = val & 0xff;
  }
  return out;
}

export function bytesToDna(bytes: Uint8Array, scheme: EncodingScheme): string {
  return scheme === 'goldman-base3' ? bytesToDnaGoldman(bytes) : bytesToDnaStandard(bytes);
}

export function dnaToBytes(dna: string, scheme: EncodingScheme): Uint8Array {
  return scheme === 'goldman-base3' ? dnaGoldmanToBytes(dna) : dnaStandardToBytes(dna);
}

/* ============================================================================
 * Canonical Huffman Compression (Lossless Bitstream Compressor)
 * Header format:
 *   byte 0: magic (0xAE = compressed, 0xAF = stored raw bypass)
 *   bytes 1..4: original byte length (uint32 big-endian)
 *   if compressed:
 *     byte 5: symbol count - 1 (0..255)
 *     next (count * 2) bytes: [symbol, codeLength] pairs
 *     remaining bytes: canonical Huffman packed bitstream
 * ========================================================================== */

interface HuffNode {
  symbol: number;
  freq: number;
  left?: HuffNode;
  right?: HuffNode;
}

export interface CompressionResult {
  bytes: Uint8Array;
  compressed: boolean;
  originalSize: number;
  outputSize: number;
  ratio: number;
}

export function huffmanCompress(input: Uint8Array): CompressionResult {
  const originalSize = input.length;
  if (originalSize < 16) {
    return packRaw(input);
  }

  const freq = new Uint32Array(256);
  for (let i = 0; i < input.length; i++) {
    freq[input[i]]++;
  }

  const nodes: HuffNode[] = [];
  for (let s = 0; s < 256; s++) {
    if (freq[s] > 0) {
      nodes.push({ symbol: s, freq: freq[s] });
    }
  }

  if (nodes.length <= 1) {
    return packRaw(input);
  }

  while (nodes.length > 1) {
    nodes.sort((a, b) => a.freq - b.freq || a.symbol - b.symbol);
    const left = nodes.shift()!;
    const right = nodes.shift()!;
    nodes.push({
      symbol: Math.min(left.symbol, right.symbol),
      freq: left.freq + right.freq,
      left,
      right,
    });
  }

  const lengths = new Uint8Array(256);
  const assignLengths = (node: HuffNode, depth: number) => {
    if (!node.left && !node.right) {
      lengths[node.symbol] = Math.max(1, depth);
      return;
    }
    if (node.left) assignLengths(node.left, depth + 1);
    if (node.right) assignLengths(node.right, depth + 1);
  };
  assignLengths(nodes[0], 0);

  // Bail out gracefully if any symbol exceeds 24 bits (degenerate skewed input)
  for (let s = 0; s < 256; s++) {
    if (lengths[s] > 24) return packRaw(input);
  }

  const symbols: Array<{ symbol: number; len: number }> = [];
  for (let s = 0; s < 256; s++) {
    if (lengths[s] > 0) symbols.push({ symbol: s, len: lengths[s] });
  }
  symbols.sort((a, b) => a.len - b.len || a.symbol - b.symbol);

  // Build canonical codes
  const codeVal = new Uint32Array(256);
  let code = 0;
  let prevLen = 0;
  for (const item of symbols) {
    code <<= item.len - prevLen;
    codeVal[item.symbol] = code;
    code++;
    prevLen = item.len;
  }

  // Estimate bitstream size
  let totalBits = 0;
  for (let i = 0; i < input.length; i++) {
    totalBits += lengths[input[i]];
  }
  const bitBytesLen = Math.ceil(totalBits / 8);
  const headerLen = 6 + symbols.length * 2;
  const totalOutLen = headerLen + bitBytesLen;

  if (totalOutLen >= originalSize + 5) {
    return packRaw(input);
  }

  const out = new Uint8Array(totalOutLen);
  out[0] = 0xae;
  out[1] = (originalSize >>> 24) & 0xff;
  out[2] = (originalSize >>> 16) & 0xff;
  out[3] = (originalSize >>> 8) & 0xff;
  out[4] = originalSize & 0xff;
  out[5] = symbols.length - 1;

  let ptr = 6;
  for (const item of symbols) {
    out[ptr++] = item.symbol;
    out[ptr++] = item.len;
  }

  let bitBuf = 0;
  let bitCount = 0;
  for (let i = 0; i < input.length; i++) {
    const s = input[i];
    const len = lengths[s];
    const val = codeVal[s];
    for (let b = len - 1; b >= 0; b--) {
      bitBuf = (bitBuf << 1) | ((val >>> b) & 1);
      bitCount++;
      if (bitCount === 8) {
        out[ptr++] = bitBuf;
        bitBuf = 0;
        bitCount = 0;
      }
    }
  }
  if (bitCount > 0) {
    out[ptr++] = bitBuf << (8 - bitCount);
  }

  return {
    bytes: out,
    compressed: true,
    originalSize,
    outputSize: out.length,
    ratio: originalSize / out.length,
  };
}

function packRaw(input: Uint8Array): CompressionResult {
  const out = new Uint8Array(5 + input.length);
  out[0] = 0xaf;
  out[1] = (input.length >>> 24) & 0xff;
  out[2] = (input.length >>> 16) & 0xff;
  out[3] = (input.length >>> 8) & 0xff;
  out[4] = input.length & 0xff;
  out.set(input, 5);
  return {
    bytes: out,
    compressed: false,
    originalSize: input.length,
    outputSize: out.length,
    ratio: 1,
  };
}

export function huffmanDecompress(encoded: Uint8Array): Uint8Array {
  if (encoded.length < 5) {
    throw new Error('Corrupted Huffman header');
  }
  const magic = encoded[0];
  const originalSize =
    ((encoded[1] << 24) | (encoded[2] << 16) | (encoded[3] << 8) | encoded[4]) >>> 0;

  if (magic === 0xaf) {
    return encoded.slice(5, 5 + originalSize);
  }
  if (magic !== 0xae) {
    throw new Error(`Invalid Huffman magic byte: 0x${magic.toString(16)}`);
  }

  const symCount = encoded[5] + 1;
  const headerEnd = 6 + symCount * 2;
  if (encoded.length < headerEnd || originalSize > 5_000_000) {
    throw new Error('Corrupted Huffman symbol table');
  }

  const symbols: Array<{ symbol: number; len: number }> = [];
  for (let i = 0; i < symCount; i++) {
    symbols.push({
      symbol: encoded[6 + i * 2],
      len: encoded[6 + i * 2 + 1],
    });
  }
  symbols.sort((a, b) => a.len - b.len || a.symbol - b.symbol);

  // Build decoding trie
  interface TrieNode {
    symbol?: number;
    left?: TrieNode;
    right?: TrieNode;
  }
  const root: TrieNode = {};
  let code = 0;
  let prevLen = 0;
  for (const item of symbols) {
    code <<= item.len - prevLen;
    let node = root;
    for (let b = item.len - 1; b >= 0; b--) {
      const bit = (code >>> b) & 1;
      if (bit === 0) {
        if (!node.left) node.left = {};
        node = node.left;
      } else {
        if (!node.right) node.right = {};
        node = node.right;
      }
    }
    node.symbol = item.symbol;
    code++;
    prevLen = item.len;
  }

  const out = new Uint8Array(originalSize);
  let outIdx = 0;
  let node = root;

  for (let byteIdx = headerEnd; byteIdx < encoded.length && outIdx < originalSize; byteIdx++) {
    const byte = encoded[byteIdx];
    for (let b = 7; b >= 0 && outIdx < originalSize; b--) {
      const bit = (byte >>> b) & 1;
      node = bit === 0 ? node.left! : node.right!;
      if (!node) {
        throw new Error('Corrupted Huffman bitstream');
      }
      if (node.symbol !== undefined) {
        out[outIdx++] = node.symbol;
        node = root;
      }
    }
  }

  return out;
}

/* ============================================================================
 * Biophysical Sequence Metrics & Lab-Ready FASTA Formatting
 * ========================================================================== */

export interface DnaBioMetrics {
  lengthBp: number;
  counts: { A: number; C: number; G: number; T: number };
  gcContentPct: number;
  maxHomopolymer: number;
  homopolymerRunsGe4: number;
  shannonEntropyBits: number;
  meltingTempC: number;
  bitsPerBase: number;
  estimatedMassAttograms: number;
}

export function analyzeDnaSequence(dna: string, originalPayloadBytes: number): DnaBioMetrics {
  const counts = { A: 0, C: 0, G: 0, T: 0 };
  let maxRun = 0;
  let currentRun = 0;
  let runsGe4 = 0;
  let prev = '';

  for (let i = 0; i < dna.length; i++) {
    const ch = dna[i];
    if (ch === 'A' || ch === 'C' || ch === 'G' || ch === 'T') {
      counts[ch]++;
    }
    if (ch === prev) {
      currentRun++;
    } else {
      if (currentRun >= 4) runsGe4++;
      currentRun = 1;
      prev = ch;
    }
    if (currentRun > maxRun) maxRun = currentRun;
  }
  if (currentRun >= 4) runsGe4++;

  const len = Math.max(1, dna.length);
  const gcFrac = (counts.G + counts.C) / len;
  const gcContentPct = gcFrac * 100;

  // Shannon entropy H = -sum(p_i log2 p_i)
  let entropy = 0;
  for (const base of ['A', 'C', 'G', 'T'] as const) {
    const p = counts[base] / len;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  // Marmur-Doty long-oligo thermodynamic Tm approximation at 50mM Na+
  const meltingTempC = 64.9 + (41 * (counts.G + counts.C - 16.4)) / len;

  // Mass of double-stranded DNA: ~650 Da/bp = 1.07935e-21 g/bp = 0.00107935 attograms/bp
  // Wait: 1 attogram = 10^-18 g. So 1 bp = 1.07935e-3 attograms = 1.07935 zeptograms.
  const estimatedMassAttograms = dna.length * 0.00107935;

  const bitsPerBase = dna.length > 0 ? (originalPayloadBytes * 8) / dna.length : 0;

  return {
    lengthBp: dna.length,
    counts,
    gcContentPct,
    maxHomopolymer: maxRun,
    homopolymerRunsGe4: runsGe4,
    shannonEntropyBits: entropy,
    meltingTempC: Number.isFinite(meltingTempC) ? Math.max(20, Math.min(98, meltingTempC)) : 65,
    bitsPerBase,
    estimatedMassAttograms,
  };
}

export interface FastaExportParams {
  capsuleId: string;
  strands: [string, string, string];
  scheme: EncodingScheme;
  rsParity: number;
  huffmanEnabled: boolean;
  payloadType: 'text' | 'image';
  originalByteLength: number;
  encodedPayloadLength: number;
}

export function formatFasta(params: FastaExportParams): string {
  const lines: string[] = [];
  const wrapWidth = 80;

  params.strands.forEach((strand, idx) => {
    lines.push(
      `>AEON|${params.capsuleId}|STRAND=${idx + 1}/3|TYPE=${params.payloadType.toUpperCase()}|CODEC=${params.scheme}|RS=${params.rsParity}|HUFFMAN=${params.huffmanEnabled ? 'ON' : 'OFF'}|ORIG_BYTES=${params.originalByteLength}|ENC_BYTES=${params.encodedPayloadLength}|BP=${strand.length}`
    );
    for (let i = 0; i < strand.length; i += wrapWidth) {
      lines.push(strand.slice(i, i + wrapWidth));
    }
  });

  return lines.join('\n') + '\n';
}
