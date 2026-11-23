import React from 'react';
import type { DnaCapsule, RadiationSimulationResult, RecoveryReport } from '../engine/dnaCodec';

interface TelemetryStripProps {
  capsule: DnaCapsule;
  simResult: RadiationSimulationResult;
  recovery: RecoveryReport;
}

export const TelemetryStrip: React.FC<TelemetryStripProps> = ({
  capsule,
  simResult,
  recovery,
}) => {
  const integrityPct = recovery.byteIntegrityPercent;
  const statusInfo = recovery.exactMatch
    ? { glyph: '●', label: 'Bit-Perfect', tone: 'text-emerald-700' }
    : integrityPct >= 85
      ? { glyph: '▲', label: 'Partial Loss', tone: 'text-amber-700' }
      : { glyph: '✖', label: 'Uncorrectable', tone: 'text-rose-700' };

  return (
    <section
      aria-label="Archive telemetry summary"
      className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4"
    >
      <div className="bg-white px-5 py-4">
        <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">
          Synthesized Strand Length
        </p>
        <div className="mt-1.5 flex items-baseline">
          <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {capsule.metrics.lengthBp.toLocaleString()}
          </span>
          <span className="ml-1.5 font-mono text-xs text-slate-500 uppercase">
            bp
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
          {capsule.tmrEnabled
            ? `3× TMR (${(capsule.metrics.lengthBp * 3).toLocaleString()} nt total)`
            : '1× Single Strand'}
        </p>
      </div>

      <div className="bg-white px-5 py-4">
        <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">
          GC Content &amp; Homopolymer
        </p>
        <div className="mt-1.5 flex items-baseline">
          <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {capsule.metrics.gcPercent.toFixed(1)}
          </span>
          <span className="ml-1 font-mono text-xs text-slate-500">% GC</span>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
          Max run: {capsule.metrics.maxHomopolymerRun} nt · 2.00 bits/nt
        </p>
      </div>

      <div className="bg-white px-5 py-4">
        <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">
          Radiation &amp; Repair Load
        </p>
        <div className="mt-1.5 flex items-baseline">
          <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {simResult.totalMutationsApplied.toLocaleString()}
          </span>
          <span className="ml-1.5 font-mono text-xs text-slate-500">
            mutations
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
          TMR voted: {recovery.tmrVote.votedRepairedLoci} · RS fixed:{' '}
          {recovery.rsReport.correctedErrors}B
        </p>
      </div>

      <div className="bg-white px-5 py-4">
        <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">
          Recovery Integrity
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {integrityPct.toFixed(2)}
            </span>
            <span className="ml-1 font-mono text-xs text-slate-500">%</span>
          </div>
          <span
            className={`font-mono text-xs font-semibold whitespace-nowrap ${statusInfo.tone}`}
          >
            {statusInfo.glyph} {statusInfo.label}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
          Unprotected baseline: {recovery.unprotectedIntegrityPercent.toFixed(1)}%
        </p>
      </div>
    </section>
  );
};
