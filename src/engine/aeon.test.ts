import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gfDiv,
  gfInv,
  gfMul,
  rsDecode,
  rsDecodeBlock,
  rsEncode,
  rsEncodeBlock,
} from './reedSolomon';
import {
  analyzeSequence,
  bytesToDna,
  dnaToBytes,
  encodeDnaCapsule,
  formatFasta,
  recoverDnaCapsule,
  simulateRadiation,
  voteTmrCopies,
} from './dnaCodec';
import { predictDegradation } from './degradationModel';

test('GF(256) multiplication, division, and multiplicative inverse hold', () => {
  for (let a = 1; a < 256; a += 13) {
    const inv = gfInv(a);
    assert.equal(gfMul(a, inv), 1);
    assert.equal(gfDiv(gfMul(a, 0x53), 0x53), a);
  }
});

test('Reed-Solomon RS block recovers up to floor(nsym/2) byte errors', () => {
  const payload = new TextEncoder().encode(
    'Project Aeon: Silicon rots in decades. DNA lasts for millennia.',
  );
  const nsym = 64; // corrects up to 32 byte errors
  const encoded = rsEncodeBlock(payload, nsym);
  const corrupted = new Uint8Array(encoded);

  // Inject 30 distributed byte errors (including parity bytes)
  for (let i = 0; i < 30; i++) {
    const pos = (i * 4) % corrupted.length;
    corrupted[pos] ^= (i + 17) & 0xff || 1;
  }

  const decoded = rsDecodeBlock(corrupted, nsym);
  assert.equal(decoded.uncorrectable, false);
  assert.equal(decoded.correctedErrors, 30);
  assert.deepEqual(decoded.data, payload);
});

test('Reed-Solomon RS=150 multi-block encoding recovers heavy multi-byte corruption', () => {
  const data = new Uint8Array(320);
  for (let i = 0; i < data.length; i++) {
    data[i] = (i * 37 + 11) & 0xff;
  }

  const encoded = rsEncode(data, 150); // dataBlockSize = 105, max errors = 75 per block
  assert.equal(encoded.blockCount, 4);

  const corrupted = new Uint8Array(encoded.bytes);
  // Corrupt 50 bytes in block 0
  for (let i = 0; i < 50; i++) {
    corrupted[i * 3] ^= 0xa5;
  }

  const report = rsDecode(corrupted, 150, data.length);
  assert.equal(report.uncorrectableBlocks, 0);
  assert.equal(report.correctedErrors, 50);
  assert.deepEqual(report.bytes, data);
});

test('Binary-to-DNA and DNA-to-Binary roundtrip is bit-perfect', () => {
  const input = new TextEncoder().encode('ATCG-Aeon-2026-Binary-DNA!');
  const dna = bytesToDna(input);
  assert.equal(dna.length, input.length * 4);
  assert.match(dna, /^[ACGT]+$/);
  const restored = dnaToBytes(dna);
  assert.deepEqual(restored, input);
});

test('TMR majority voting repairs single-strand mutations across 3 copies', () => {
  const base = 'ACGTACGTACGTACGT';
  const c0 = 'TCGTACGTACGTACGT'; // mutated idx 0
  const c1 = 'ACGTCCGTACGTACGT'; // mutated idx 4
  const c2 = 'ACGTACGTACGTACGA'; // mutated idx 15

  const voted = voteTmrCopies([c0, c1, c2]);
  assert.equal(voted.votedDna, base);
  assert.equal(voted.votedRepairedLoci, 3);
  assert.equal(voted.threeWayDisagreements, 0);
});

test('Full Aeon pipeline recovers 100% of text after 120 simulated radiation mutations', () => {
  const message =
    'Voyager Golden Record Archive: Project Aeon 1000-Year DNA Storage Protocol.';
  const payload = new TextEncoder().encode(message);
  const capsule = encodeDnaCapsule(payload, {
    rsNsym: 150,
    tmrEnabled: true,
    capsuleId: 'TEST-ARC-01',
  });

  const sim = simulateRadiation(capsule, 120, 42);
  assert.equal(sim.totalMutationsApplied, 360);

  const report = recoverDnaCapsule(capsule, sim);
  assert.equal(report.exactMatch, true);
  assert.equal(report.byteIntegrityPercent, 100);
  assert.equal(new TextDecoder().decode(report.recoveredBytes), message);

  const metrics = analyzeSequence(capsule.encodedDna);
  assert.equal(metrics.codingDensityBitsPerNt, 2.0);
  assert.ok(metrics.gcPercent > 0 && metrics.gcPercent < 100);

  const fasta = formatFasta(capsule.capsuleId, capsule.encodedDna, {
    payloadType: 'TEXT',
    gcPercent: metrics.gcPercent,
    rsNsym: 150,
    tmrEnabled: true,
    originalBytes: payload.length,
  });
  assert.ok(fasta.startsWith('>TEST-ARC-01|PROJECT_AEON|'));
});

test('Degradation prediction model predicts higher survival at -80C than +20C', () => {
  const cryo = predictDegradation({
    years: 1000,
    temperatureC: -80,
    strandLengthBp: 2000,
    rsNsym: 150,
    tmrEnabled: true,
  });

  const ambient = predictDegradation({
    years: 1000,
    temperatureC: 20,
    strandLengthBp: 2000,
    rsNsym: 150,
    tmrEnabled: true,
  });

  assert.ok(cryo.halfLifeYears > ambient.halfLifeYears);
  assert.ok(cryo.aeonSurvivalPct >= ambient.aeonSurvivalPct);
  assert.equal(cryo.curve.length, 21);
});
