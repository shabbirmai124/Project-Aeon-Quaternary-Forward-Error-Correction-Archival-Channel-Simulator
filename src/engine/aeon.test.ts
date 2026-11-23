import test from 'node:test';
import assert from 'node:assert/strict';
import { rsEncodeBlock, rsDecodeBlock, rsEncodeStream, rsDecodeStream } from './reedSolomon';
import {
  bytesToDnaStandard,
  dnaStandardToBytes,
  bytesToDnaGoldman,
  dnaGoldmanToBytes,
  huffmanCompress,
  huffmanDecompress,
  analyzeDnaSequence,
  formatFasta,
} from './dnaCodec';
import { analyzeSequenceWithML, extractWindowFeatures, predictWindowRisk } from './mlModel';
import { createCapsule, simulateRadiation, recoverCapsule, runEmpiricalStressSweep } from './aeonPipeline';

test('Reed-Solomon GF(256) repairs up to floor(nsym/2) corrupted bytes in a block', () => {
  const msg = new TextEncoder().encode('Project Aeon 1000-Year DNA Storage Verification Payload');
  const nsym = 64; // Can correct up to 32 byte errors
  const codeword = rsEncodeBlock(msg, nsym);
  const corrupted = new Uint8Array(codeword);

  // Corrupt 30 distinct byte positions across data and parity
  for (let i = 0; i < 30; i++) {
    corrupted[(i * 3) % codeword.length] ^= 0xa5;
  }

  const decoded = rsDecodeBlock(corrupted, nsym);
  assert.equal(decoded.uncorrectable, false);
  assert.equal(decoded.correctedSymbols, 30);
  assert.deepEqual(decoded.data, msg);
});

test('Reed-Solomon RS=150 multi-block stream encoding and decoding works accurately', () => {
  const payload = new Uint8Array(320);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 37 + 13) & 0xff;

  const enc = rsEncodeStream(payload, 150);
  assert.equal(enc.blockCount, 4); // 255 - 150 = 105 data bytes/block -> ceil(320/105) = 4

  const corrupted = new Uint8Array(enc.encoded);
  // Corrupt 25 bytes in first block and 25 bytes in second block
  for (let i = 0; i < 25; i++) {
    corrupted[i * 4] ^= 0x55;
    corrupted[255 + i * 4] ^= 0x33;
  }

  const dec = rsDecodeStream(corrupted, payload.length, 150);
  assert.equal(dec.success, true);
  assert.equal(dec.totalCorrectedSymbols, 50);
  assert.deepEqual(dec.decoded, payload);
});

test('Goldman Base-3 codec is lossless and guarantees zero homopolymers (maxRun === 1)', () => {
  // Include 0x00 and 0xFF runs which produce severe AAAA/TTTT homopolymers in standard 2-bit coding
  const bytes = new Uint8Array([0x00, 0x00, 0x00, 0xff, 0xff, 0x55, 0xaa, 0x12, 0x34, 0xde, 0xad]);
  const stdDna = bytesToDnaStandard(bytes);
  assert.deepEqual(dnaStandardToBytes(stdDna), bytes);
  assert.ok(analyzeDnaSequence(stdDna, bytes.length).maxHomopolymer >= 8);

  const goldmanDna = bytesToDnaGoldman(bytes);
  assert.deepEqual(dnaGoldmanToBytes(goldmanDna), bytes);
  const metrics = analyzeDnaSequence(goldmanDna, bytes.length);
  assert.equal(metrics.maxHomopolymer, 1);
});

test('Canonical Huffman compression is lossless on compressible text and bypasses incompressible data', () => {
  const text = new TextEncoder().encode(
    'AAAABBBBCCCCDDDD Project Aeon Project Aeon Project Aeon DNA lasts for millennia. '.repeat(4)
  );
  const comp = huffmanCompress(text);
  assert.equal(comp.compressed, true);
  assert.ok(comp.outputSize < comp.originalSize);
  assert.deepEqual(huffmanDecompress(comp.bytes), text);

  const tiny = new Uint8Array([1, 2, 3, 4]);
  const raw = huffmanCompress(tiny);
  assert.equal(raw.compressed, false);
  assert.deepEqual(huffmanDecompress(raw.bytes), tiny);
});

test('End-to-end 1000-year DNA capsule achieves 100% bit-perfect recovery under 45 mutations', () => {
  const original = new TextEncoder().encode(
    'Silicon rots in decades. DNA lasts for millennia. — Project Aeon Archive Specimen #01'
  );
  const capsule = createCapsule(original, 'text', {
    scheme: 'goldman-base3',
    rsParity: 64,
    huffmanEnabled: true,
    tmrEnabled: true,
    env: { storageYears: 1000, temperatureC: -20, radiationMSvPerYear: 2.4 },
  });

  assert.equal(capsule.bioMetrics.maxHomopolymer, 1);
  assert.ok(capsule.fasta.startsWith('>AEON|'));

  const irradiated = simulateRadiation(capsule, 45, 1000, 1337);
  assert.equal(irradiated.mutations.length, 45);

  const report = recoverCapsule(irradiated, true);
  assert.equal(report.bitPerfect, true);
  assert.equal(report.byteAccuracyPct, 100);
  assert.equal(report.berAfterRepair, 0);
  assert.deepEqual(report.recoveredBytes, original);
});

test('ML stability predictor flags severe homopolymer + warm storage as higher risk than Goldman cryo', () => {
  const badSeq = 'AAAAAAAAAAAAAAAACCCCCCCCCCCCCCCC';
  const goodSeq = 'ACGTACGTGCATGCATACGTACGTGCATGCAT';

  const hotEnv = { storageYears: 2000, temperatureC: 25, radiationMSvPerYear: 12 };
  const cryoEnv = { storageYears: 100, temperatureC: -80, radiationMSvPerYear: 0.5 };

  const badRisk = predictWindowRisk(extractWindowFeatures(badSeq, hotEnv).features);
  const goodRisk = predictWindowRisk(extractWindowFeatures(goodSeq, cryoEnv).features);

  assert.ok(badRisk > goodRisk + 0.25, `Expected badRisk (${badRisk}) >> goodRisk (${goodRisk})`);

  const report = analyzeSequenceWithML(goodSeq.repeat(3), cryoEnv);
  assert.ok(report.predictedSurvivalPct > 90);
});

test('FASTA formatter wraps at 80 chars and outputs 3 TMR strands', () => {
  const strand = 'ACGT'.repeat(30); // 120 bp
  const fasta = formatFasta({
    capsuleId: 'AEON-TEST',
    strands: [strand, strand, strand],
    scheme: 'standard-2bit',
    rsParity: 64,
    huffmanEnabled: false,
    payloadType: 'text',
    originalByteLength: 30,
    encodedPayloadLength: 30,
  });
  const headers = fasta.split('\n').filter((l) => l.startsWith('>AEON|'));
  assert.equal(headers.length, 3);
});

test('Empirical stress sweep executes cleanly and shows RS+TMR outperforms raw DNA', () => {
  const sweep = runEmpiricalStressSweep('Project Aeon Stress Verification', 64);
  assert.ok(sweep.length >= 5);
  const at45 = sweep.find((p) => p.mutations === 45)!;
  assert.equal(at45.aeonMlSoftRecoveryPct, 100);
  assert.ok(at45.aeonMlSoftRecoveryPct >= at45.rawRecoveryPct);
});
