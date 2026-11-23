import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { DnaCapsule } from '../engine/dnaCodec';

interface ArchitectureFastaViewProps {
  capsule: DnaCapsule;
  fastaText: string;
  onDownloadFasta: () => void;
}

const PIPELINE_STAGES = [
  {
    step: '01',
    title: 'Binary Stream Pre-processing',
    detail:
      'Normalizes UTF-8 text or 56×56 grayscale image luminance matrices into a contiguous Uint8Array byte stream with magic header framing.',
  },
  {
    step: '02',
    title: 'GF(256) Reed-Solomon FEC',
    detail:
      'Splits payload into 255-byte Galois Field blocks (primitive poly 0x11d) and appends configurable parity symbols (up to RS-150, tolerating 75 byte errors per block).',
  },
  {
    step: '03',
    title: '2-Bit Binary-to-DNA Mapping',
    detail:
      'Transcodes each byte into 4 synthetic nucleotides (00→A, 01→C, 10→G, 11→T) achieving 2.00 bits/nt information density.',
  },
  {
    step: '04',
    title: 'Triple Modular Redundancy (TMR)',
    detail:
      'Replicates the synthesized oligonucleotide strand across three independent physical copies (Copy A, B, C) for consensus error suppression.',
  },
  {
    step: '05',
    title: '1000-Year Radiation Simulation',
    detail:
      'Injects stochastic point substitutions across all copies using a deterministic Mulberry32 PRNG calibrated to thermal & cosmic decay.',
  },
  {
    step: '06',
    title: 'Voting, Berlekamp-Massey & FASTA',
    detail:
      'Per-locus majority voting resolves isolated strand errors before Chien search + Forney error correction restores 100% of original bytes.',
  },
];

export const ArchitectureFastaView: React.FC<ArchitectureFastaViewProps> = ({
  capsule,
  fastaText,
  onDownloadFasta,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fastaText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Architecture Pipeline */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">
            End-to-End Archival Storage Pipeline
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Six-stage deterministic biological encoding, mutation simulation, and algebraic error recovery flow.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PIPELINE_STAGES.map((stage) => (
            <div
              key={stage.step}
              className="rounded-md border border-slate-200 bg-slate-50 p-4"
            >
              <div className="font-mono text-xs font-semibold text-blue-700">
                Stage {stage.step}
              </div>
              <h4 className="mt-1 text-sm font-semibold text-slate-900">
                {stage.title}
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {stage.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Lab-Ready FASTA Preview */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              NCBI-Compatible Lab Synthesis FASTA
            </h3>
            <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
              {capsule.capsuleId} · {capsule.encodedDna.length.toLocaleString()} bp · 70-nt line wrap
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy FASTA</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onDownloadFasta}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Download .fasta</span>
            </button>
          </div>
        </div>

        <pre
          data-testid="fasta-preview"
          className="mt-4 max-h-80 overflow-y-auto rounded-md border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100"
        >
          {fastaText}
        </pre>
      </section>
    </div>
  );
};
