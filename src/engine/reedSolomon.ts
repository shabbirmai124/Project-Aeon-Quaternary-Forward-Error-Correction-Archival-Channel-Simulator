// Galois Field GF(2^8) with primitive polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
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
  if (b === 0) throw new Error('GF division by zero');
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

export function gfPow(a: number, power: number): number {
  if (power === 0) return 1;
  if (a === 0) return 0;
  const idx = ((GF_LOG[a] * power) % 255 + 255) % 255;
  return GF_EXP[idx];
}

export function gfInv(a: number): number {
  if (a === 0) throw new Error('GF inverse of zero');
  return GF_EXP[255 - GF_LOG[a]];
}

// Polynomial helpers where index 0 is highest degree (big-endian coefficient order)
function gfPolyMul(p: Uint8Array, q: Uint8Array): Uint8Array {
  const res = new Uint8Array(p.length + q.length - 1);
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      res[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return res;
}

function gfPolyEval(poly: Uint8Array, x: number): number {
  let y = poly[0];
  for (let i = 1; i < poly.length; i++) {
    y = gfMul(y, x) ^ poly[i];
  }
  return y;
}

function gfPolyScale(p: Uint8Array, x: number): Uint8Array {
  const res = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) {
    res[i] = gfMul(p[i], x);
  }
  return res;
}

function gfPolyAdd(p: Uint8Array, q: Uint8Array): Uint8Array {
  const len = Math.max(p.length, q.length);
  const res = new Uint8Array(len);
  for (let i = 0; i < p.length; i++) {
    res[i + len - p.length] = p[i];
  }
  for (let i = 0; i < q.length; i++) {
    res[i + len - q.length] ^= q[i];
  }
  return res;
}

const generatorCache = new Map<number, Uint8Array>();

export function rsGeneratorPoly(nsym: number): Uint8Array {
  const cached = generatorCache.get(nsym);
  if (cached) return cached;
  let g: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < nsym; i++) {
    g = gfPolyMul(g, new Uint8Array([1, gfPow(2, i)]));
  }
  generatorCache.set(nsym, g);
  return g;
}

export function rsEncodeBlock(msgIn: Uint8Array, nsym: number): Uint8Array {
  if (msgIn.length + nsym > 255) {
    throw new Error(`Block too long: ${msgIn.length} + ${nsym} > 255`);
  }
  const gen = rsGeneratorPoly(nsym);
  const msgOut = new Uint8Array(msgIn.length + nsym);
  msgOut.set(msgIn, 0);

  for (let i = 0; i < msgIn.length; i++) {
    const coef = msgOut[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        msgOut[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  // Restore message bytes (remainder stays in trailing nsym bytes)
  msgOut.set(msgIn, 0);
  return msgOut;
}

export interface RsBlockDecodeResult {
  data: Uint8Array;
  correctedErrors: number;
  uncorrectable: boolean;
}

function calcSyndromes(msg: Uint8Array, nsym: number): Uint8Array {
  const synd = new Uint8Array(nsym + 1);
  // synd[0] = 0 padding, synd[i+1] = msg(2^i)
  for (let i = 0; i < nsym; i++) {
    synd[i + 1] = gfPolyEval(msg, gfPow(2, i));
  }
  return synd;
}

function findErrorLocator(synd: Uint8Array, nsym: number): Uint8Array | null {
  let errLoc: Uint8Array = new Uint8Array([1]);
  let oldLoc: Uint8Array = new Uint8Array([1]);

  for (let i = 0; i < nsym; i++) {
    const K = i + 1; // 1-indexed syndrome offset
    let delta = synd[K];
    for (let j = 1; j < errLoc.length; j++) {
      delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[K - j]);
    }

    // Shift oldLoc left (multiply by x)
    const shiftedOld = new Uint8Array(oldLoc.length + 1);
    shiftedOld.set(oldLoc, 0);
    oldLoc = shiftedOld;

    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = gfPolyScale(oldLoc, delta);
        oldLoc = gfPolyScale(errLoc, gfInv(delta));
        errLoc = newLoc;
      }
      errLoc = gfPolyAdd(errLoc, gfPolyScale(oldLoc, delta));
    }
  }

  // Strip leading zeros
  let firstNonZero = 0;
  while (firstNonZero < errLoc.length && errLoc[firstNonZero] === 0) {
    firstNonZero++;
  }
  errLoc = errLoc.slice(firstNonZero);

  const errs = errLoc.length - 1;
  if (errs * 2 > nsym) {
    return null;
  }
  return errLoc;
}

function findErrors(errLoc: Uint8Array, n: number): number[] | null {
  const errs = errLoc.length - 1;
  const errPos: number[] = [];
  for (let i = 0; i < n; i++) {
    if (gfPolyEval(errLoc, gfPow(2, 255 - i)) === 0) {
      errPos.push(n - 1 - i);
    }
  }
  if (errPos.length !== errs) {
    return null;
  }
  return errPos;
}

function correctErrata(
  msgIn: Uint8Array,
  synd: Uint8Array,
  errPos: number[],
): Uint8Array {
  const msg = new Uint8Array(msgIn);
  const n = msg.length;

  // coefPos: degree positions (n - 1 - pos)
  const coefPos = errPos.map((p) => n - 1 - p);

  // Build error locator polynomial from coefPos
  let errLoc: Uint8Array = new Uint8Array([1]);
  for (const c of coefPos) {
    errLoc = gfPolyMul(errLoc, new Uint8Array([gfPow(2, c), 1]));
  }

  // Reverse synd[1..] so highest degree is first
  const revSynd = new Uint8Array(synd.length - 1);
  for (let i = 0; i < revSynd.length; i++) {
    revSynd[i] = synd[synd.length - 1 - i];
  }

  // errEval = (revSynd * errLoc) mod x^errPos.length (keep last errPos.length coeffs)
  const prod = gfPolyMul(revSynd, errLoc);
  const errEval = prod.slice(prod.length - errPos.length);

  // X_j values
  const X = coefPos.map((c) => gfPow(2, c));

  for (let i = 0; i < X.length; i++) {
    const Xi = X[i];
    const XiInv = gfInv(Xi);

    // Formal derivative of errLoc evaluated at XiInv
    let errLocPrimeTmp = 1;
    for (let j = 0; j < X.length; j++) {
      if (j !== i) {
        errLocPrimeTmp = gfMul(errLocPrimeTmp, 1 ^ gfMul(XiInv, X[j]));
      }
    }
    if (errLocPrimeTmp === 0) {
      throw new Error('Zero denominator in Forney algorithm');
    }

    const y = gfPolyEval(errEval, XiInv);
    const magnitude = gfDiv(y, errLocPrimeTmp);
    msg[errPos[i]] ^= magnitude;
  }

  return msg;
}

export function rsDecodeBlock(msgIn: Uint8Array, nsym: number): RsBlockDecodeResult {
  const dataLen = msgIn.length - nsym;
  if (dataLen <= 0) {
    return { data: new Uint8Array(0), correctedErrors: 0, uncorrectable: true };
  }

  const synd = calcSyndromes(msgIn, nsym);
  let hasError = false;
  for (let i = 1; i < synd.length; i++) {
    if (synd[i] !== 0) {
      hasError = true;
      break;
    }
  }

  if (!hasError) {
    return {
      data: msgIn.slice(0, dataLen),
      correctedErrors: 0,
      uncorrectable: false,
    };
  }

  const errLoc = findErrorLocator(synd, nsym);
  if (!errLoc) {
    return {
      data: msgIn.slice(0, dataLen),
      correctedErrors: 0,
      uncorrectable: true,
    };
  }

  const errPos = findErrors(errLoc, msgIn.length);
  if (!errPos) {
    return {
      data: msgIn.slice(0, dataLen),
      correctedErrors: 0,
      uncorrectable: true,
    };
  }

  try {
    const repaired = correctErrata(msgIn, synd, errPos);
    const checkSynd = calcSyndromes(repaired, nsym);
    for (let i = 1; i < checkSynd.length; i++) {
      if (checkSynd[i] !== 0) {
        return {
          data: msgIn.slice(0, dataLen),
          correctedErrors: 0,
          uncorrectable: true,
        };
      }
    }
    return {
      data: repaired.slice(0, dataLen),
      correctedErrors: errPos.length,
      uncorrectable: false,
    };
  } catch {
    return {
      data: msgIn.slice(0, dataLen),
      correctedErrors: 0,
      uncorrectable: true,
    };
  }
}

export interface RsEncodedPayload {
  bytes: Uint8Array;
  blockCount: number;
  dataBlockSize: number;
  nsym: number;
  originalLength: number;
}

export function rsEncode(data: Uint8Array, nsym: number): RsEncodedPayload {
  const clampedNsym = Math.max(4, Math.min(180, nsym));
  const dataBlockSize = 255 - clampedNsym;
  if (data.length === 0) {
    const emptyBlock = rsEncodeBlock(new Uint8Array(1), clampedNsym);
    return {
      bytes: emptyBlock,
      blockCount: 1,
      dataBlockSize,
      nsym: clampedNsym,
      originalLength: 0,
    };
  }

  const blocks: Uint8Array[] = [];
  let totalLen = 0;
  for (let offset = 0; offset < data.length; offset += dataBlockSize) {
    const chunk = data.slice(offset, Math.min(offset + dataBlockSize, data.length));
    const encodedBlock = rsEncodeBlock(chunk, clampedNsym);
    blocks.push(encodedBlock);
    totalLen += encodedBlock.length;
  }

  const combined = new Uint8Array(totalLen);
  let pos = 0;
  for (const b of blocks) {
    combined.set(b, pos);
    pos += b.length;
  }

  return {
    bytes: combined,
    blockCount: blocks.length,
    dataBlockSize,
    nsym: clampedNsym,
    originalLength: data.length,
  };
}

export interface RsDecodeReport {
  bytes: Uint8Array;
  correctedErrors: number;
  uncorrectableBlocks: number;
  totalBlocks: number;
  blockResults: Array<{
    blockIndex: number;
    correctedErrors: number;
    uncorrectable: boolean;
    dataBytes: number;
  }>;
}

export function rsDecode(
  encoded: Uint8Array,
  nsym: number,
  originalLength: number,
): RsDecodeReport {
  const clampedNsym = Math.max(4, Math.min(180, nsym));
  const dataBlockSize = 255 - clampedNsym;
  const fullBlockSize = 255;

  if (originalLength === 0) {
    const res = rsDecodeBlock(encoded.slice(0, 1 + clampedNsym), clampedNsym);
    return {
      bytes: new Uint8Array(0),
      correctedErrors: res.correctedErrors,
      uncorrectableBlocks: res.uncorrectable ? 1 : 0,
      totalBlocks: 1,
      blockResults: [
        {
          blockIndex: 0,
          correctedErrors: res.correctedErrors,
          uncorrectable: res.uncorrectable,
          dataBytes: 0,
        },
      ],
    };
  }

  const out = new Uint8Array(originalLength);
  let inOffset = 0;
  let outOffset = 0;
  let correctedErrors = 0;
  let uncorrectableBlocks = 0;
  let blockIndex = 0;
  const blockResults: RsDecodeReport['blockResults'] = [];

  while (outOffset < originalLength && inOffset < encoded.length) {
    const remainingData = originalLength - outOffset;
    const expectedData = Math.min(dataBlockSize, remainingData);
    const expectedEncodedLen = expectedData + clampedNsym;
    const blockSlice = encoded.slice(
      inOffset,
      Math.min(inOffset + expectedEncodedLen, encoded.length),
    );

    const decoded = rsDecodeBlock(blockSlice, clampedNsym);
    correctedErrors += decoded.correctedErrors;
    if (decoded.uncorrectable) {
      uncorrectableBlocks += 1;
    }

    const copyLen = Math.min(decoded.data.length, remainingData);
    out.set(decoded.data.slice(0, copyLen), outOffset);

    blockResults.push({
      blockIndex,
      correctedErrors: decoded.correctedErrors,
      uncorrectable: decoded.uncorrectable,
      dataBytes: copyLen,
    });

    inOffset += Math.min(fullBlockSize, expectedEncodedLen);
    outOffset += expectedData;
    blockIndex += 1;
  }

  return {
    bytes: out,
    correctedErrors,
    uncorrectableBlocks,
    totalBlocks: blockIndex,
    blockResults,
  };
}
