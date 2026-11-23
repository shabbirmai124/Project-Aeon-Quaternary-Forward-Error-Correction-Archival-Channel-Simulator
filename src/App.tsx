import React, { useCallback, useEffect, useMemo, useState } from 'react';
import capsulePhotoUrl from './assets/images/aeon_helix_capsule_1795421537925.jpg';
import synthesizerPhotoUrl from './assets/images/aeon_lab_synthesizer_1795421537246.jpg';
import nautilusUrl from './assets/images/sample_botanical_plate_1795421537452.jpg';
import voyagerUrl from './assets/images/sample_voyager_earth_1795421539258.jpg';
import {
  encodeDnaCapsule,
  formatFasta,
  recoverDnaCapsule,
  simulateRadiation,
} from './engine/dnaCodec';
import {
  createDeterministicFallbackMatrix,
  encodeImageMatrixToBytes,
  loadImageToGrayscaleMatrix,
  type GrayscaleMatrix,
} from './utils/imageCodec';
import { Header, type WorkspaceTab } from './components/Header';
import {
  ControlSidebar,
  type SimulationControlsState,
} from './components/ControlSidebar';
import { TelemetryStrip } from './components/TelemetryStrip';
import { SequenceView } from './components/SequenceView';
import { RecoveryView } from './components/RecoveryView';
import { StabilityChartView } from './components/StabilityChartView';
import { ArchitectureFastaView } from './components/ArchitectureFastaView';

const INITIAL_STATE: SimulationControlsState = {
  mode: 'text',
  textPayload:
    'Project Aeon: Silicon rots in decades. DNA lasts for millennia. Encoded with Reed-Solomon FEC and Triple Modular Redundancy.',
  sampleImage: 'voyager',
  customImageName: null,
  rsNsym: 150,
  tmrEnabled: true,
  years: 1000,
  temperatureC: -80,
  mutationsPerStrand: 45,
  seed: 2026,
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('sequence');
  const [controls, setControls] = useState<SimulationControlsState>(INITIAL_STATE);
  const [imageMatrix, setImageMatrix] = useState<GrayscaleMatrix>(() =>
    createDeterministicFallbackMatrix(56),
  );
  const [customImageDataUrl, setCustomImageDataUrl] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Load sample or custom image matrix when image mode or selection changes
  useEffect(() => {
    let cancelled = false;
    const targetUrl =
      controls.sampleImage === 'voyager'
        ? voyagerUrl
        : controls.sampleImage === 'nautilus'
          ? nautilusUrl
          : customImageDataUrl;

    if (!targetUrl) return;

    loadImageToGrayscaleMatrix(targetUrl, 56)
      .then((matrix) => {
        if (!cancelled) {
          setImageMatrix(matrix);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageMatrix(createDeterministicFallbackMatrix(56));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controls.sampleImage, customImageDataUrl]);

  const handleControlsChange = useCallback(
    (patch: Partial<SimulationControlsState>) => {
      setControls((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleUploadCustomImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomImageDataUrl(reader.result);
        setControls((prev) => ({
          ...prev,
          mode: 'image',
          sampleImage: 'custom',
          customImageName: file.name,
        }));
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const payloadBytes = useMemo(() => {
    if (controls.mode === 'text') {
      const text = controls.textPayload.length > 0 ? controls.textPayload : ' ';
      return new TextEncoder().encode(text);
    }
    return encodeImageMatrixToBytes(imageMatrix);
  }, [controls.mode, controls.textPayload, imageMatrix]);

  const capsule = useMemo(
    () =>
      encodeDnaCapsule(payloadBytes, {
        rsNsym: controls.rsNsym,
        tmrEnabled: controls.tmrEnabled,
        capsuleId: controls.mode === 'text' ? 'AEON-TXT-003' : 'AEON-IMG-003',
      }),
    [payloadBytes, controls.rsNsym, controls.tmrEnabled, controls.mode],
  );

  const simResult = useMemo(
    () => simulateRadiation(capsule, controls.mutationsPerStrand, controls.seed),
    [capsule, controls.mutationsPerStrand, controls.seed],
  );

  const recovery = useMemo(
    () => recoverDnaCapsule(capsule, simResult),
    [capsule, simResult],
  );

  const fastaText = useMemo(
    () =>
      formatFasta(capsule.capsuleId, capsule.encodedDna, {
        payloadType: controls.mode === 'text' ? 'UTF8_TEXT' : 'GRAY56_IMG',
        gcPercent: capsule.metrics.gcPercent,
        rsNsym: controls.rsNsym,
        tmrEnabled: controls.tmrEnabled,
        originalBytes: capsule.originalBytes.length,
      }),
    [capsule, controls.mode, controls.rsNsym, controls.tmrEnabled],
  );

  const handleDownloadFasta = useCallback(() => {
    const blob = new Blob([fastaText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${capsule.capsuleId.toLowerCase()}.fasta`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportNotice(`Exported ${capsule.capsuleId.toLowerCase()}.fasta (${capsule.encodedDna.length.toLocaleString()} bp)`);
    setTimeout(() => setExportNotice(null), 3200);
  }, [fastaText, capsule.capsuleId, capsule.encodedDna.length]);

  const handleReseed = useCallback(() => {
    setControls((prev) => ({
      ...prev,
      seed: ((prev.seed * 1103515245 + 12345) >>> 16) % 9000 + 1000,
    }));
  }, []);

  const handleRunFullCycle = useCallback(() => {
    handleReseed();
    setActiveTab('recovery');
  }, [handleReseed]);

  return (
    <div id="top" className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportFasta={handleDownloadFasta}
      />

      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Intro Strip */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Synthetic DNA Archival Engine · GF(256) Reed-Solomon · Triple Modular Redundancy
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              1,000-Year Biological Data Capsule Workbench
            </h1>
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-3">
            {exportNotice && (
              <span
                role="status"
                className="font-mono text-xs font-medium text-emerald-700"
              >
                ● {exportNotice}
              </span>
            )}
            <div
              role="tablist"
              aria-label="Workspace view tabs"
              className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-slate-200/70 p-1"
            >
              {(
                [
                  { id: 'sequence', label: 'Sequence & TMR' },
                  { id: 'recovery', label: 'Payload Recovery' },
                  { id: 'stability', label: '1000-Year Curve' },
                  { id: 'architecture', label: 'Pipeline & FASTA' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Asymmetric Split Console */}
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <ControlSidebar
            state={controls}
            voyagerPreviewUrl={voyagerUrl}
            nautilusPreviewUrl={nautilusUrl}
            onChange={handleControlsChange}
            onUploadCustomImage={handleUploadCustomImage}
            onReseedRadiation={handleReseed}
            onRunFullCycle={handleRunFullCycle}
          />

          <div className="min-w-0 flex-1 space-y-6 w-full">
            <TelemetryStrip
              capsule={capsule}
              simResult={simResult}
              recovery={recovery}
            />

            {activeTab === 'sequence' && (
              <SequenceView
                capsule={capsule}
                simResult={simResult}
                recovery={recovery}
                capsulePhotoUrl={capsulePhotoUrl}
                synthesizerPhotoUrl={synthesizerPhotoUrl}
              />
            )}

            {activeTab === 'recovery' && (
              <RecoveryView
                mode={controls.mode}
                originalText={controls.textPayload}
                imageMatrix={imageMatrix}
                capsule={capsule}
                recovery={recovery}
              />
            )}

            {activeTab === 'stability' && (
              <StabilityChartView
                years={controls.years}
                temperatureC={controls.temperatureC}
                strandLengthBp={capsule.metrics.lengthBp}
                rsNsym={controls.rsNsym}
                tmrEnabled={controls.tmrEnabled}
                payloadBytes={payloadBytes}
              />
            )}

            {activeTab === 'architecture' && (
              <ArchitectureFastaView
                capsule={capsule}
                fastaText={fastaText}
                onDownloadFasta={handleDownloadFasta}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs text-slate-500">
          <span>Project Aeon — 1000-Year DNA Data Archive</span>
          <span>MIT License · Md Shabbir Mia</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
