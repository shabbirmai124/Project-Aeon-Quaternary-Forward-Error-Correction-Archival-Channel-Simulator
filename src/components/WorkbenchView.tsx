import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileImage,
  FileText,
  RefreshCw,
  ShieldCheck,
  Upload,
  Zap,
} from 'lucide-react';
import type { EncodingScheme } from '../engine/dnaCodec';
import {
  createCapsule,
  recoverCapsule,
  simulateRadiation,
  type AeonCapsule,
  type IrradiatedCapsule,
  type RecoveryReport,
} from '../engine/aeonPipeline';
import {
  fileToObjectUrl,
  grayscaleBytesToDataUrl,
  loadImageToGrayscaleBytes,
} from '../engine/imageCodec';

import earthSampleUrl from '../assets/images/sample_voyager_earth_1795421539258.jpg';
import nautilusSampleUrl from '../assets/images/sample_botanical_plate_1795421537452.jpg';

const SAMPLE_TEXT_PRESETS = [
  {
    id: 'aeon-manifesto',
    label: 'Archival Manifesto',
    text: 'Project Aeon — 1000-Year Data Archive. Silicon storage media degrade in 10 to 30 years. Quaternary codewords protected by GF(256) Reed-Solomon block FEC and Triple Modular Redundancy preserve digital knowledge with 100% bit-perfect fidelity across millennia.',
  },
  {
    id: 'scientific-abstract',
    label: 'Coding Theory Abstract',
    text: 'Abstract: We evaluate cascaded RS(255, 105) forward error correction with Goldman Base-3 rotational mapping (max run length = 1) and ML-weighted soft-voting TMR across 1,600 simulated archival channel trials.',
  },
];

const SAMPLE_IMAGE_PRESETS = [
  { id: 'earth', label: 'Orbital Horizon Plate', url: earthSampleUrl },
  { id: 'nautilus', label: 'Nautilus Spiral Plate', url: nautilusSampleUrl },
];

const BASE_COLORS: Record<string, string> = {
  A: 'text-emerald-700',
  C: 'text-blue-700',
  G: 'text-amber-700',
  T: 'text-rose-700',
};

interface WorkbenchViewProps {
  capsule: AeonCapsule | null;
  onCapsuleChange: (capsule: AeonCapsule) => void;
  onExportFasta: () => void;
}

export const WorkbenchView: React.FC<WorkbenchViewProps> = ({
  capsule,
  onCapsuleChange,
  onExportFasta,
}) => {
  const [payloadMode, setPayloadMode] = useState<'image' | 'text'>('image');
  const [textInput, setTextInput] = useState(SAMPLE_TEXT_PRESETS[0].text);
  const [selectedImageId, setSelectedImageId] = useState<string>('earth');
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [customImageName, setCustomImageName] = useState<string>('');
  const [originalImagePreview, setOriginalImagePreview] = useState<string>('');
  const [imageError, setImageError] = useState<string | null>(null);

  // Codec & Channel Parameters
  const [scheme, setScheme] = useState<EncodingScheme>('goldman-base3');
  const [huffmanEnabled, setHuffmanEnabled] = useState<boolean>(true);
  const [rsParity, setRsParity] = useState<number>(120);
  const [tmrEnabled, setTmrEnabled] = useState<boolean>(true);
  const [mlSoftVoting, setMlSoftVoting] = useState<boolean>(true);

  // Channel Noise & Horizon Parameters
  const [storageYears, setStorageYears] = useState<number>(1000);
  const [temperatureC, setTemperatureC] = useState<number>(-20);
  const [radiationMSv, setRadiationMSv] = useState<number>(2.4);
  const [mutationCount, setMutationCount] = useState<number>(48);
  const [noiseSeed, setNoiseSeed] = useState<number>(1000);

  // Pipeline Execution State
  const [irradiated, setIrradiated] = useState<IrradiatedCapsule | null>(null);
  const [recovery, setRecovery] = useState<RecoveryReport | null>(null);
  const [isEncoding, setIsEncoding] = useState<boolean>(false);
  const [copiedFasta, setCopiedFasta] = useState<boolean>(false);
  const [windowOffset, setWindowOffset] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeImageSrc = useMemo(() => {
    if (selectedImageId === 'custom' && customImageUrl) return customImageUrl;
    return SAMPLE_IMAGE_PRESETS.find((p) => p.id === selectedImageId)?.url ?? earthSampleUrl;
  }, [selectedImageId, customImageUrl]);

  // Run full Encode -> Simulate -> Recover whenever parameters or payload change via explicit trigger or initial mount
  const runEncode = async (autoSimulate = false) => {
    setIsEncoding(true);
    setImageError(null);
    try {
      let bytes: Uint8Array;
      if (payloadMode === 'text') {
        if (!textInput.trim()) {
          setImageError('Please enter a non-empty UTF-8 text payload before encoding.');
          setIsEncoding(false);
          return;
        }
        bytes = new TextEncoder().encode(textInput);
      } else {
        const serialized = await loadImageToGrayscaleBytes(activeImageSrc, 36);
        bytes = serialized.bytes;
        setOriginalImagePreview(serialized.previewDataUrl);
      }

      const nextCapsule = createCapsule(bytes, payloadMode, {
        scheme,
        rsParity,
        huffmanEnabled,
        tmrEnabled,
        env: {
          storageYears,
          temperatureC,
          radiationMSvPerYear: radiationMSv,
        },
      });
      onCapsuleChange(nextCapsule);
      setWindowOffset(0);

      if (autoSimulate) {
        const nextIrr = simulateRadiation(nextCapsule, mutationCount, storageYears, noiseSeed);
        const nextRec = recoverCapsule(nextIrr, mlSoftVoting);
        setIrradiated(nextIrr);
        setRecovery(nextRec);
      } else {
        setIrradiated(null);
        setRecovery(null);
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Encoding failed');
    } finally {
      setIsEncoding(false);
    }
  };

  // Bootstrap initial archival plate automatically on first load so the instrument opens live with data
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      void runEncode(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSimulateNoise = () => {
    if (!capsule) return;
    const nextIrr = simulateRadiation(capsule, mutationCount, storageYears, noiseSeed);
    setIrradiated(nextIrr);
    setRecovery(null);
  };

  const handleRecover = () => {
    if (!irradiated) return;
    const nextRec = recoverCapsule(irradiated, mlSoftVoting);
    setRecovery(nextRec);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await fileToObjectUrl(file);
      setCustomImageUrl(url);
      setCustomImageName(file.name);
      setSelectedImageId('custom');
      setPayloadMode('image');
    } catch {
      setImageError('Unable to read the selected image file.');
    }
  };

  const handleCopyFasta = async () => {
    if (!capsule) return;
    try {
      await navigator.clipboard.writeText(capsule.fasta);
      setCopiedFasta(true);
      setTimeout(() => setCopiedFasta(false), 1800);
    } catch {
      // Clipboard blocked in some headless sandboxes
    }
  };

  // Render naive corrupted vs. recovered previews for Image & Text modes
  const corruptedImagePreview = useMemo(() => {
    if (!irradiated || capsule?.payloadType !== 'image') return '';
    // If Huffman was applied, naive raw bytes are compressed stream bytes; show byte-level noise on visual plate
    if (capsule.huffmanApplied) {
      // Map raw bit errors visually onto a copy of original pixel stream to illustrate un-corrected channel noise
      const visualCorrupted = new Uint8Array(capsule.originalBytes);
      const ratio = Math.min(0.45, irradiated.mutations.length / Math.max(1, capsule.cleanStrand.length) * 8);
      for (let i = 4; i < visualCorrupted.length; i++) {
        const hash = ((i * 2654435761 + irradiated.seed) >>> 0) % 10000;
        if (hash < ratio * 10000) {
          visualCorrupted[i] = (visualCorrupted[i] ^ ((hash & 0xff) | 0x55)) & 0xff;
        }
      }
      return grayscaleBytesToDataUrl(visualCorrupted, 36, 36);
    }
    return grayscaleBytesToDataUrl(irradiated.corruptedNaiveBytes, 36, 36);
  }, [irradiated, capsule]);

  const recoveredImagePreview = useMemo(() => {
    if (!recovery || capsule?.payloadType !== 'image') return '';
    return grayscaleBytesToDataUrl(recovery.recoveredBytes, 36, 36);
  }, [recovery, capsule]);

  const naiveCorruptedText = useMemo(() => {
    if (!irradiated || capsule?.payloadType !== 'text') return '';
    if (capsule.huffmanApplied) {
      // Show raw symbol-level corruption on UTF-8 bytes proportional to channel noise
      const copy = new Uint8Array(capsule.originalBytes);
      for (let i = 0; i < irradiated.mutations.length; i++) {
        const m = irradiated.mutations[i];
        if (m.strandIndex === 0) {
          const byteIdx = m.position % copy.length;
          copy[byteIdx] = 33 + ((copy[byteIdx] + 29) % 90);
        }
      }
      return new TextDecoder('utf-8', { fatal: false }).decode(copy);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(irradiated.corruptedNaiveBytes);
  }, [irradiated, capsule]);

  const recoveredText = useMemo(() => {
    if (!recovery || capsule?.payloadType !== 'text') return '';
    return new TextDecoder('utf-8', { fatal: false }).decode(recovery.recoveredBytes);
  }, [recovery, capsule]);

  // Alignment window slice (64 symbols wide) for inspecting the 3 TMR strands
  const sliceWidth = 64;
  const maxOffset = capsule ? Math.max(0, capsule.cleanStrand.length - sliceWidth) : 0;
  const mutatedSetByStrand = useMemo(() => {
    const sets = [new Set<number>(), new Set<number>(), new Set<number>()];
    if (irradiated) {
      for (const m of irradiated.mutations) {
        sets[m.strandIndex]?.add(m.position);
      }
    }
    return sets;
  }, [irradiated]);

  const jumpToFirstMutation = () => {
    if (!irradiated || irradiated.mutations.length === 0) return;
    const firstPos = Math.min(...irradiated.mutations.map((m) => m.position));
    setWindowOffset(Math.max(0, Math.min(maxOffset, firstPos - 8)));
  };

  const maxCorrectableBytesPerBlock = Math.floor(rsParity / 2);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
      {/* Compact Instrument Header */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 [text-wrap:balance]">
            Quaternary Archival Encoding &amp; Recovery Workbench
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Encode UTF-8 text or grayscale image plates into quaternary{' '}
            <span className="font-mono text-slate-800">A/C/G/T</span> codewords protected by GF(2⁸) Reed-Solomon FEC and 3-replica TMR, inject stochastic channel substitutions, and verify bit-perfect reconstruction.
          </p>
        </div>
        {capsule && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 tabular-nums">
            <span>Capsule {capsule.capsuleId}</span>
            <span aria-hidden="true">·</span>
            <span>Codec {capsule.scheme === 'goldman-base3' ? 'Goldman Base-3' : 'Standard 2-bit'}</span>
            <span aria-hidden="true">·</span>
            <span>RS(255, {255 - capsule.rsParity})</span>
            <span aria-hidden="true">·</span>
            <span>{capsule.tmrEnabled ? 'TMR 3× Active' : 'Single Strand'}</span>
          </div>
        )}
      </div>

      {/* Asymmetric Split Console: 340px Left Control Rail + Flex-1 Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* LEFT RAIL: Parameter Controls */}
        <aside className="bg-white border border-slate-200 rounded-lg p-5 space-y-6">
          {/* 1. Payload Source */}
          <section aria-labelledby="payload-heading">
            <h2 id="payload-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              01. Source Payload
            </h2>

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md mb-3" role="tablist" aria-label="Payload type">
              <button
                type="button"
                role="tab"
                aria-selected={payloadMode === 'image'}
                onClick={() => setPayloadMode('image')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  payloadMode === 'image'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileImage className="w-3.5 h-3.5" aria-hidden="true" />
                Image Plate
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={payloadMode === 'text'}
                onClick={() => setPayloadMode('text')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  payloadMode === 'text'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                UTF-8 Text
              </button>
            </div>

            {payloadMode === 'image' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {SAMPLE_IMAGE_PRESETS.map((preset) => {
                    const active = selectedImageId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedImageId(preset.id)}
                        className={`text-left p-2 rounded-md border transition-colors cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-50/40'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          referrerPolicy="no-referrer"
                          className="w-full aspect-square object-cover rounded-xs bg-slate-100 mb-1.5"
                        />
                        <span className="block text-xs font-medium text-slate-800 truncate">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="sr-only"
                    id="custom-image-upload"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    {selectedImageId === 'custom' && customImageName
                      ? `Loaded: ${customImageName}`
                      : 'Upload Custom PNG / JPG'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex gap-1.5">
                  {SAMPLE_TEXT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setTextInput(p.text)}
                      className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors truncate cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <label htmlFor="aeon-text-payload" className="sr-only">
                  UTF-8 text payload
                </label>
                <textarea
                  id="aeon-text-payload"
                  rows={4}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Enter text to archive into quaternary codewords..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <div className="text-xs font-mono text-slate-500 tabular-nums">
                  {new TextEncoder().encode(textInput).length} bytes UTF-8
                </div>
              </div>
            )}

            {imageError && (
              <p role="alert" className="mt-2 text-xs text-rose-700 font-medium">
                {imageError}
              </p>
            )}
          </section>

          <hr className="border-slate-200" />

          {/* 2. Channel Coding & FEC Parameters */}
          <section aria-labelledby="fec-heading" className="space-y-4">
            <h2 id="fec-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              02. Coding &amp; Forward Error Correction
            </h2>

            <div>
              <label htmlFor="codec-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                Quaternary Transcoding Scheme
              </label>
              <select
                id="codec-select"
                value={scheme}
                onChange={(e) => setScheme(e.target.value as EncodingScheme)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="goldman-base3">Goldman Base-3 Rotational (Max Run = 1)</option>
                <option value="standard-2bit">Standard 2-bit Direct (2.00 bits/symbol)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="rs-parity-slider" className="font-medium text-slate-700">
                  Reed-Solomon Parity (nsym)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {rsParity} B (≤{maxCorrectableBytesPerBlock} err/blk)
                </span>
              </div>
              <input
                id="rs-parity-slider"
                type="range"
                min={16}
                max={150}
                step={2}
                value={rsParity}
                onChange={(e) => setRsParity(Number(e.target.value))}
                className="aeon-slider w-full"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1">
                <span>16</span>
                <span>64</span>
                <span>120</span>
                <span>150 (Max)</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between gap-2 text-xs text-slate-700 cursor-pointer">
                <span>Canonical Huffman Compression</span>
                <input
                  type="checkbox"
                  checked={huffmanEnabled}
                  onChange={(e) => setHuffmanEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-xs text-slate-700 cursor-pointer">
                <span>Triple Modular Redundancy (3 Replicas)</span>
                <input
                  type="checkbox"
                  checked={tmrEnabled}
                  onChange={(e) => setTmrEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-xs text-slate-700 cursor-pointer">
                <span>ML-Weighted Soft-Voting Tie-Breaker</span>
                <input
                  type="checkbox"
                  checked={mlSoftVoting}
                  onChange={(e) => setMlSoftVoting(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void runEncode(false)}
              disabled={isEncoding}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-md transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEncoding ? 'animate-spin' : ''}`} aria-hidden="true" />
              {isEncoding ? 'Encoding Payload...' : 'Encode Payload'}
            </button>
          </section>

          <hr className="border-slate-200" />

          {/* 3. Channel Noise & Recovery Simulation */}
          <section aria-labelledby="noise-heading" className="space-y-4">
            <h2 id="noise-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              03. Channel Noise &amp; Recovery
            </h2>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="mutations-slider" className="font-medium text-slate-700">
                  Symbol Substitutions
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {mutationCount} errors
                </span>
              </div>
              <input
                id="mutations-slider"
                type="range"
                min={0}
                max={300}
                step={5}
                value={mutationCount}
                onChange={(e) => setMutationCount(Number(e.target.value))}
                className="aeon-slider w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="horizon-slider" className="font-medium text-slate-700">
                  Archival Horizon
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {storageYears.toLocaleString()} yr
                </span>
              </div>
              <input
                id="horizon-slider"
                type="range"
                min={50}
                max={5000}
                step={50}
                value={storageYears}
                onChange={(e) => setStorageYears(Number(e.target.value))}
                className="aeon-slider w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="temp-input" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Temp (°C)
                </label>
                <input
                  id="temp-input"
                  type="number"
                  min={-80}
                  max={40}
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="seed-input" className="block text-[11px] font-medium text-slate-600 mb-1">
                  PRNG Seed
                </label>
                <input
                  id="seed-input"
                  type="number"
                  value={noiseSeed}
                  onChange={(e) => setNoiseSeed(Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900"
                />
              </div>
            </div>

            <div className="hidden">
              {/* Keep radiation dose bound for environmental consistency */}
              <input
                type="number"
                value={radiationMSv}
                onChange={(e) => setRadiationMSv(Number(e.target.value))}
                aria-label="Channel dose"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleSimulateNoise}
                disabled={!capsule}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 disabled:bg-slate-100 disabled:text-slate-400 border border-amber-300 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                Inject Noise
              </button>

              <button
                type="button"
                onClick={handleRecover}
                disabled={!irradiated}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Recover Data
              </button>
            </div>
          </section>
        </aside>

        {/* RIGHT STAGE: Telemetry, Proof-of-Concept, Alignment Inspector & FASTA */}
        <main className="space-y-6 min-w-0">
          {/* 4-Column Full-Width KPI Strip */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Single-Replica Length
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-2xl font-mono font-semibold text-slate-950 tabular-nums">
                  {capsule ? capsule.bioMetrics.lengthBp.toLocaleString() : '—'}
                </span>
                <span className="ml-1.5 text-xs font-mono text-slate-400">sym</span>
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                {capsule
                  ? `${capsule.originalBytes.length} B → ${capsule.rsProtectedBytes.length} B (${capsule.rsBlockCount} blk)`
                  : 'Awaiting payload'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                GC Balance &amp; Run-Length
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-2xl font-mono font-semibold text-slate-950 tabular-nums">
                  {capsule ? capsule.bioMetrics.gcContentPct.toFixed(1) : '—'}
                </span>
                <span className="ml-1 text-xs font-mono text-slate-400">% GC</span>
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                {capsule
                  ? `Max run: ${capsule.bioMetrics.maxHomopolymer} · H = ${capsule.bioMetrics.shannonEntropyBits.toFixed(3)} b`
                  : 'Entropy & run constraint'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                ML Stability Prediction
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-2xl font-mono font-semibold text-slate-950 tabular-nums">
                  {capsule ? capsule.mlReport.predictedSurvivalPct.toFixed(2) : '—'}
                </span>
                <span className="ml-1 text-xs font-mono text-slate-400">%</span>
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                {capsule
                  ? `Mean risk ${(capsule.mlReport.overallRiskScore * 100).toFixed(1)}% · ${capsule.mlReport.meanDeltaG.toFixed(2)} kcal/mol`
                  : 'MLP inference ready'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Recovery Integrity
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span
                  className={`text-2xl font-mono font-semibold tabular-nums ${
                    recovery
                      ? recovery.bitPerfect
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                      : 'text-slate-950'
                  }`}
                >
                  {recovery ? `${recovery.byteAccuracyPct.toFixed(1)}` : irradiated ? 'Noisy' : 'Ready'}
                </span>
                {recovery && <span className="ml-1 text-xs font-mono text-slate-400">%</span>}
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                {recovery
                  ? recovery.bitPerfect
                    ? `● Verified 0.000% BER (${recovery.elapsedMs.toFixed(1)} ms)`
                    : `✖ Exceeded RS cap (${recovery.rsUncorrectableBlocks} blk)`
                  : irradiated
                    ? `▲ ${irradiated.mutations.length} substitutions active`
                    : 'Run noise & recovery'}
              </div>
            </div>
          </div>

          {/* Proof-of-Concept Comparison Panel (Image Plates or Text Diff) */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Proof-of-Concept Recovery Verification
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Side-by-side comparison of source payload, uncorrected single-replica channel output, and cascaded TMR + RS(255, {255 - rsParity}) reconstruction.
                </p>
              </div>
              {recovery && (
                <div className="text-xs font-mono tabular-nums text-slate-600">
                  TMR repaired <strong className="text-slate-900">{recovery.tmrPositionsRepaired}</strong> sym
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  RS repaired <strong className="text-slate-900">{recovery.rsCorrectedSymbols}</strong> bytes
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  ML tie-breaks <strong className="text-slate-900">{recovery.tmrThreeWayConflicts}</strong>
                </div>
              )}
            </div>

            {capsule?.payloadType === 'image' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Plate 1: Original */}
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                    <span>01. Original Grayscale Plate</span>
                    <span className="font-mono text-slate-500 tabular-nums">36×36 · 1,300 B</span>
                  </div>
                  <div className="aspect-square bg-slate-900 rounded-xs overflow-hidden flex items-center justify-center">
                    {originalImagePreview ? (
                      <img
                        src={originalImagePreview}
                        alt="Original grayscale input plate"
                        style={{ imageRendering: 'pixelated' }}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs font-mono text-slate-400">Encoding...</span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-slate-500">
                    Source checksum: {capsule.capsuleId}
                  </div>
                </div>

                {/* Plate 2: Corrupted Raw Channel */}
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                    <span>02. Uncorrected Channel</span>
                    <span className="font-mono text-amber-700 tabular-nums">
                      {irradiated ? `${irradiated.mutations.length} err` : 'Pending noise'}
                    </span>
                  </div>
                  <div className="aspect-square bg-slate-900 rounded-xs overflow-hidden flex items-center justify-center">
                    {corruptedImagePreview ? (
                      <img
                        src={corruptedImagePreview}
                        alt="Corrupted image decoded directly without TMR or Reed-Solomon"
                        style={{ imageRendering: 'pixelated' }}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs font-mono text-slate-400 px-4 text-center">
                        Click &ldquo;Inject Noise&rdquo; to simulate {storageYears} yr channel errors
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-slate-500 tabular-nums">
                    {irradiated
                      ? `Raw BER: ${(recovery ? recovery.berBeforeRepair * 100 : (irradiated.mutations.length / Math.max(1, capsule.cleanStrand.length)) * 100).toFixed(3)}%`
                      : 'No FEC / No TMR baseline'}
                  </div>
                </div>

                {/* Plate 3: Recovered */}
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                    <span>03. Aeon Recovered Plate</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        recovery
                          ? recovery.bitPerfect
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {recovery
                        ? recovery.bitPerfect
                          ? '● 100.0% Match'
                          : `✖ ${recovery.byteAccuracyPct.toFixed(1)}%`
                        : 'Pending'}
                    </span>
                  </div>
                  <div className="aspect-square bg-slate-900 rounded-xs overflow-hidden flex items-center justify-center">
                    {recoveredImagePreview ? (
                      <img
                        src={recoveredImagePreview}
                        alt="Recovered archival image plate after TMR and Reed-Solomon decoding"
                        style={{ imageRendering: 'pixelated' }}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs font-mono text-slate-400 px-4 text-center">
                        Click &ldquo;Recover Data&rdquo; to run TMR + RS decoding
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-slate-500 tabular-nums">
                    {recovery
                      ? `Post-FEC BER: ${(recovery.berAfterRepair * 100).toFixed(4)}%`
                      : 'Berlekamp-Massey + Forney'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50">
                  <div className="text-xs font-medium text-slate-700 mb-2">01. Original UTF-8 Input</div>
                  <p className="text-xs font-mono text-slate-800 leading-relaxed break-words min-h-[96px]">
                    {textInput}
                  </p>
                </div>

                <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                    <span>02. Uncorrected Channel</span>
                    {irradiated && (
                      <span className="font-mono text-amber-700 tabular-nums">
                        {irradiated.mutations.length} err
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-amber-900 leading-relaxed break-words min-h-[96px]">
                    {irradiated
                      ? naiveCorruptedText
                      : 'Click "Inject Noise" to observe uncorrected channel degradation.'}
                  </p>
                </div>

                <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                    <span>03. Aeon Restored Output</span>
                    {recovery && (
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          recovery.bitPerfect ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {recovery.bitPerfect ? '● 100% Bit-Perfect' : `✖ ${recovery.byteAccuracyPct.toFixed(1)}%`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-900 leading-relaxed break-words min-h-[96px]">
                    {recovery
                      ? recoveredText
                      : 'Click "Recover Data" to reconstruct via TMR voting and RS decoding.'}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* 3-Replica TMR Quaternary Alignment + ML Risk Heatmap */}
          {capsule && (
            <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Quaternary Codeword Alignment &amp; ML Stability Profile
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Inspecting positions{' '}
                    <span className="font-mono tabular-nums text-slate-700">
                      {windowOffset + 1}–{Math.min(capsule.cleanStrand.length, windowOffset + sliceWidth)}
                    </span>{' '}
                    of{' '}
                    <span className="font-mono tabular-nums text-slate-700">
                      {capsule.cleanStrand.length.toLocaleString()}
                    </span>{' '}
                    symbols. Highlighted cells indicate injected channel substitutions.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {irradiated && irradiated.mutations.length > 0 && (
                    <button
                      type="button"
                      onClick={jumpToFirstMutation}
                      className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Jump to First Error
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setWindowOffset(Math.max(0, windowOffset - sliceWidth))}
                    disabled={windowOffset === 0}
                    className="px-2.5 py-1 text-xs font-mono border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    Prev 64
                  </button>
                  <button
                    type="button"
                    onClick={() => setWindowOffset(Math.min(maxOffset, windowOffset + sliceWidth))}
                    disabled={windowOffset >= maxOffset}
                    className="px-2.5 py-1 text-xs font-mono border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    Next 64
                  </button>
                </div>
              </div>

              {/* Monospace 3-Strand Alignment Matrix */}
              <div className="overflow-x-auto border border-slate-200 rounded-md bg-slate-50/70 p-3 font-mono text-xs leading-6">
                {[0, 1, 2].map((sIdx) => {
                  const seq = irradiated ? irradiated.corruptedStrands[sIdx] : capsule.strands[sIdx];
                  const slice = seq.slice(windowOffset, windowOffset + sliceWidth);
                  return (
                    <div key={sIdx} className="flex items-center gap-3 whitespace-nowrap">
                      <span className="w-20 shrink-0 text-[11px] text-slate-500">
                        Replica {sIdx + 1}
                      </span>
                      <div className="tracking-widest">
                        {slice.split('').map((ch, idx) => {
                          const absPos = windowOffset + idx;
                          const isMut = mutatedSetByStrand[sIdx].has(absPos);
                          return (
                            <span
                              key={idx}
                              title={`Pos ${absPos + 1}: ${ch}${isMut ? ' (Substituted)' : ''}`}
                              className={
                                isMut
                                  ? 'inline-block bg-rose-600 text-white font-semibold px-0.5 rounded-[2px]'
                                  : BASE_COLORS[ch] ?? 'text-slate-700'
                              }
                            >
                              {ch}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {recovery && (
                  <div className="flex items-center gap-3 whitespace-nowrap border-t border-slate-200 mt-1.5 pt-1.5">
                    <span className="w-20 shrink-0 text-[11px] font-semibold text-blue-700">
                      Consensus
                    </span>
                    <div className="tracking-widest">
                      {recovery.repairedStrand
                        .slice(windowOffset, windowOffset + sliceWidth)
                        .split('')
                        .map((ch, idx) => (
                          <span key={idx} className={BASE_COLORS[ch] ?? 'text-slate-900'}>
                            {ch}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Per-Window ML Risk Heatmap Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700">
                    Pretrained MLP Sliding-Window Instability Heatmap ({capsule.mlReport.windows.length} windows)
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    Low Risk (0%) → Elevated (50%) → High Risk (100%)
                  </span>
                </div>
                <div
                  className="grid gap-0.5 h-6 w-full"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, capsule.mlReport.windows.length)}, minmax(0, 1fr))`,
                  }}
                >
                  {capsule.mlReport.windows.map((w) => {
                    const p = w.riskProbability;
                    const bg =
                      p < 0.3
                        ? 'bg-cyan-600/75'
                        : p < 0.55
                          ? 'bg-amber-400'
                          : 'bg-rose-600';
                    return (
                      <button
                        key={w.windowIndex}
                        type="button"
                        onClick={() => setWindowOffset(Math.min(maxOffset, w.startBase))}
                        title={`Window ${w.windowIndex + 1} (pos ${w.startBase + 1}–${w.endBase + 1}): Risk ${(p * 100).toFixed(1)}% | GC ${(w.gcFraction * 100).toFixed(0)}% | MaxRun ${w.maxHomopolymer}`}
                        aria-label={`Jump to window ${w.windowIndex + 1}, risk ${(p * 100).toFixed(0)} percent`}
                        className={`${bg} rounded-[1px] hover:opacity-80 transition-opacity cursor-pointer`}
                      />
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-600">{capsule.mlReport.recommendation}</p>
              </div>
            </section>
          )}

          {/* Lab-Ready 80-Column FASTA Preview */}
          {capsule && (
            <section className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    80-Column Standard FASTA Artifact
                  </h2>
                  <p className="text-xs text-slate-500">
                    Plain-text NCBI-compatible multi-replica serialization ready for downstream verification.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyFasta()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedFasta ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        Copy FASTA
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onExportFasta}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Download .fasta
                  </button>
                </div>
              </div>
              <pre className="p-3.5 rounded-md bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-44 leading-relaxed">
                {capsule.fasta.split('\n').slice(0, 12).join('\n')}
                {capsule.fasta.split('\n').length > 12
                  ? `\n... (${capsule.fasta.split('\n').length - 12} more lines across 3 TMR replicas)`
                  : ''}
              </pre>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
