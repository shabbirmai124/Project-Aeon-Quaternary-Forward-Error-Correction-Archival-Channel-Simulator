/**
 * Project Aeon — Galois Field GF(2^8) Reed-Solomon Forward Error Correction
 * Primitive polynomial: x^8 + x^4 + x^3 + x^2 + 1 (0x11D), matching reedsolo / CCSDS.
 * Implements Berlekamp-Massey error locator, Chien search, and Forney error magnitudes.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero in GF(256)');
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

export function gfPow(a: number, power: number): number {
  if (power === 0) return 1;
  if (a === 0) return 0;
  const exp = (GF_LOG[a] * power) % 255;
  return GF_EXP[exp < 0 ? exp + 255 : exp];
}

export function gfInv(a: number): number {
  if (a === 0) throw new Error('Zero has no multiplicative inverse in GF(256)');
  return GF_EXP[255 - GF_LOG[a]];
}

function polyScale(p: Uint8Array, scalar: number): Uint8Array {
  const out = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) {
    out[i] = gfMul(p[i], scalar);
  }
  return out;
}

function polyAdd(p: Uint8Array, q: Uint8Array): Uint8Array {
  const len = Math.max(p.length, q.length);
  const out = new Uint8Array(len);
  for (let i = 0; i < p.length; i++) {
    out[i + len - p.length] = p[i];
  }
  for (let i = 0; i < q.length; i++) {
    out[i + len - q.length] ^= q[i];
  }
  return out;
}

function polyMul(p: Uint8Array, q: Uint8Array): Uint8Array {
  const out = new Uint8Array(p.length + q.length - 1);
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      out[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return out;
}

function polyEval(p: Uint8Array, x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i++) {
    y = gfMul(y, x) ^ p[i];
  }
  return y;
}

const generatorCache = new Map<number, Uint8Array>();

export function rsGeneratorPoly(nsym: number): Uint8Array {
  const cached = generatorCache.get(nsym);
  if (cached) return cached;

  let g = new Uint8Array([1]);
  for (let i = 0; i < nsym; i++) {
    g = polyMul(g, new Uint8Array([1, GF_EXP[i]]));
  }
  generatorCache.set(nsym, g);
  return g;
}

/**
 * Encodes a single message block (length <= 255 - nsym) into a codeword of length msg.length + nsym.
 */
export function rsEncodeBlock(msg: Uint8Array, nsym: number): Uint8Array {
  if (nsym < 2 || nsym > 200) {
    throw new Error(`Invalid Reed-Solomon parity count: ${nsym}`);
  }
  if (msg.length + nsym > 255) {
    throw new Error(`Block too long for GF(256): ${msg.length} + ${nsym} > 255`);
  }

  const gen = rsGeneratorPoly(nsym);
  const out = new Uint8Array(msg.length + nsym);
  out.set(msg, 0);

  for (let i = 0; i < msg.length; i++) {
    const coef = out[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        out[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  // Restore original systematic message bytes; remainder stays in parity suffix
  out.set(msg, 0);
  return out;
}

function calcSyndromes(msg: Uint8Array, nsym: number): Uint8Array {
  const synd = new Uint8Array(nsym + 1);
  synd[0] = 0;
  for (let i = 0; i < nsym; i++) {
    synd[i + 1] = polyEval(msg, GF_EXP[i]);
  }
  return synd;
}

function hasSyndromeError(synd: Uint8Array): boolean {
  for (let i = 1; i < synd.length; i++) {
    if (synd[i] !== 0) return true;
  }
  return false;
}

/**
 * Berlekamp-Massey algorithm returning error locator polynomial in descending powers (highest degree first).
 */
function findErrorLocator(synd: Uint8Array, nsym: number): Uint8Array | null {
  let errLoc = new Uint8Array([1]);
  let oldLoc = new Uint8Array([1]);

  for (let i = 0; i < nsym; i++) {
    let delta = synd[i + 1];
    for (let j = 1; j < errLoc.length; j++) {
      delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[i + 1 - j]);
    }

    // Shift oldLoc by x
    const shiftedOld = new Uint8Array(oldLoc.length + 1);
    shiftedOld.set(oldLoc, 0);
    oldLoc = shiftedOld;

    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, gfInv(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }

  // Strip leading zeros
  let firstNonZero = 0;
  while (firstNonZero < errLoc.length && errLoc[firstNonZero] === 0) {
    firstNonZero++;
  }
  const trimmed = errLoc.slice(firstNonZero);
  const errs = trimmed.length - 1;
  if (errs * 2 > nsym) {
    return null;
  }
  return trimmed;
}

/**
 * Chien search to find byte indices of corrupted symbols.
 */
function findErrorPositions(errLoc: Uint8Array, msgLen: number): number[] | null {
  const errs = errLoc.length - 1;
  const positions: number[] = [];
  for (let i = 0; i < msgLen; i++) {
    if (polyEval(errLoc, GF_EXP[i]) === 0) {
      positions.push(msgLen - 1 - i);
    }
  }
  if (positions.length !== errs) {
    return null;
  }
  return positions;
}

/**
 * Forney algorithm to compute exact byte error magnitudes and correct them in-place.
 */
function correctErrata(
  msgIn: Uint8Array,
  synd: Uint8Array,
  errPos: number[]
): Uint8Array {
  const msg = new Uint8Array(msgIn);
  const coefPos = errPos.map((p) => msg.length - 1 - p);

  // Build error locator from positions (ascending power convention for Forney)
  let errLoc = new Uint8Array([1]);
  for (const pos of coefPos) {
    errLoc = polyMul(errLoc, polyAdd(new Uint8Array([1]), new Uint8Array([GF_EXP[pos], 0])));
  }

  // Reverse syndromes (dropping leading 0) for evaluator polynomial
  const syndRev = new Uint8Array(synd.length - 1);
  for (let i = 0; i < syndRev.length; i++) {
    syndRev[i] = synd[synd.length - 1 - i];
  }

  // Omega(x) = (Synd(x) * ErrLoc(x)) mod x^(nsym)
  const product = polyMul(syndRev, errLoc);
  const errEval = product.slice(product.length - errLoc.length);

  // X_l = alpha^(coefPos[l])
  const X = coefPos.map((pos) => GF_EXP[pos]);
  const E = new Uint8Array(msg.length);

  for (let i = 0; i < X.length; i++) {
    const XiInv = gfInv(X[i]);

    // Formal derivative of errLoc evaluated at XiInv via product of (1 - X_j * XiInv) for j != i
    let errLocPrime = 1;
    for (let j = 0; j < X.length; j++) {
      if (j !== i) {
        errLocPrime = gfMul(errLocPrime, 1 ^ gfMul(XiInv, X[j]));
      }
    }
    if (errLocPrime === 0) {
      throw new Error('Reed-Solomon Forney denominator zero');
    }

    const y = polyEval(errEval, XiInv);
    const magnitude = gfDiv(y, errLocPrime);
    E[errPos[i]] = magnitude;
  }

  for (let i = 0; i < msg.length; i++) {
    msg[i] ^= E[i];
  }
  return msg;
}

export interface RsBlockDecodeResult {
  data: Uint8Array;
  correctedSymbols: number;
  correctedPositions: number[];
  uncorrectable: boolean;
}

/**
 * Decodes a single Reed-Solomon codeword of length dataLen + nsym.
 */
export function rsDecodeBlock(codeword: Uint8Array, nsym: number): RsBlockDecodeResult {
  const dataLen = codeword.length - nsym;
  if (dataLen <= 0) {
    return {
      data: new Uint8Array(0),
      correctedSymbols: 0,
      correctedPositions: [],
      uncorrectable: true,
    };
  }

  const synd = calcSyndromes(codeword, nsym);
  if (!hasSyndromeError(synd)) {
    return {
      data: codeword.slice(0, dataLen),
      correctedSymbols: 0,
      correctedPositions: [],
      uncorrectable: false,
    };
  }

  const errLoc = findErrorLocator(synd, nsym);
  if (!errLoc) {
    return {
      data: codeword.slice(0, dataLen),
      correctedSymbols: 0,
      correctedPositions: [],
      uncorrectable: true,
    };
  }

  // Reverse errLoc for Chien search (since findErrorLocator stores highest degree first)
  const errLocRev = new Uint8Array(errLoc.length);
  for (let i = 0; i < errLoc.length; i++) {
    errLocRev[i] = errLoc[errLoc.length - 1 - i];
  }

  const errPos = findErrorPositions(errLocRev, codeword.length);
  if (!errPos) {
    return {
      data: codeword.slice(0, dataLen),
      correctedSymbols: 0,
      correctedPositions: [],
      uncorrectable: true,
    };
  }

  try {
    const corrected = correctErrata(codeword, synd, errPos);
    const verifySynd = calcSyndromes(corrected, nsym);
    if (hasSyndromeError(verifySynd)) {
      return {
        data: codeword.slice(0, dataLen),
        correctedSymbols: 0,
        correctedPositions: [],
        uncorrectable: true,
      };
    }
    return {
      data: corrected.slice(0, dataLen),
      correctedSymbols: errPos.length,
      correctedPositions: errPos,
      uncorrectable: false,
    };
  } catch {
    return {
      data: codeword.slice(0, dataLen),
      correctedSymbols: 0,
      correctedPositions: [],
      uncorrectable: true,
    };
  }
}

export interface RsStreamEncodeResult {
  encoded: Uint8Array;
  blockCount: number;
  dataBytesPerBlock: number;
  parityPerBlock: number;
  totalParityBytes: number;
}

/**
 * Encodes an arbitrary byte stream into framed GF(256) Reed-Solomon blocks.
 * Each block carries up to (255 - nsym) message bytes + nsym parity bytes.
 */
export function rsEncodeStream(data: Uint8Array, nsym = 64): RsStreamEncodeResult {
  const safeNsym = Math.max(4, Math.min(150, nsym));
  const maxDataPerBlock = 255 - safeNsym;
  const blockCount = Math.max(1, Math.ceil(data.length / maxDataPerBlock));
  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  for (let b = 0; b < blockCount; b++) {
    const start = b * maxDataPerBlock;
    const end = Math.min(data.length, start + maxDataPerBlock);
    const slice = data.slice(start, end);
    const codeword = rsEncodeBlock(slice, safeNsym);
    chunks.push(codeword);
    totalLen += codeword.length;
  }

  const encoded = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    encoded.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    encoded,
    blockCount,
    dataBytesPerBlock: maxDataPerBlock,
    parityPerBlock: safeNsym,
    totalParityBytes: blockCount * safeNsym,
  };
}

export interface RsStreamDecodeResult {
  decoded: Uint8Array;
  totalBlocks: number;
  repairedBlocks: number;
  uncorrectableBlocks: number;
  totalCorrectedSymbols: number;
  success: boolean;
}

/**
 * Decodes a framed GF(256) Reed-Solomon byte stream back to its original length.
 */
export function rsDecodeStream(
  encoded: Uint8Array,
  originalLength: number,
  nsym = 64
): RsStreamDecodeResult {
  const safeNsym = Math.max(4, Math.min(150, nsym));
  const maxDataPerBlock = 255 - safeNsym;
  const blockCount = Math.max(1, Math.ceil(originalLength / maxDataPerBlock));

  const decoded = new Uint8Array(originalLength);
  let encOffset = 0;
  let decOffset = 0;
  let repairedBlocks = 0;
  let uncorrectableBlocks = 0;
  let totalCorrectedSymbols = 0;

  for (let b = 0; b < blockCount; b++) {
    const remaining = originalLength - decOffset;
    const blockDataLen = Math.min(maxDataPerBlock, remaining);
    const blockTotalLen = blockDataLen + safeNsym;

    const codeword = new Uint8Array(blockTotalLen);
    const available = Math.min(blockTotalLen, Math.max(0, encoded.length - encOffset));
    if (available > 0) {
      codeword.set(encoded.slice(encOffset, encOffset + available), 0);
    }

    const res = rsDecodeBlock(codeword, safeNsym);
    decoded.set(res.data.slice(0, blockDataLen), decOffset);

    if (res.uncorrectable) {
      uncorrectableBlocks++;
    } else if (res.correctedSymbols > 0) {
      repairedBlocks++;
      totalCorrectedSymbols += res.correctedSymbols;
    }

    encOffset += blockTotalLen;
    decOffset += blockDataLen;
  }

  return {
    decoded,
    totalBlocks: blockCount,
    repairedBlocks,
    uncorrectableBlocks,
    totalCorrectedSymbols,
    success: uncorrectableBlocks === 0,
  };
}
