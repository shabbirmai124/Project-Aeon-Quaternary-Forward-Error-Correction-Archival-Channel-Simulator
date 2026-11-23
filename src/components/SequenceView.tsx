import React, { useMemo, useState } from 'react';
import type {
  DnaCapsule,
  Nucleotide,
  RadiationSimulationResult,
  RecoveryReport,
} from '../engine/dnaCodec';

interface SequenceViewProps {
  capsule: DnaCapsule;
  simResult: RadiationSimulationResult;
  recovery: RecoveryReport;
  capsulePhotoUrl: string;
  synthesizerPhotoUrl: string;
}

const BASE_STYLES: Record<
  Nucleotide,
  { bg: string; text: string; name: string; bits: string }
> = {
  A: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    name: 'Adenine',
    bits: '00',
  },
  C: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    name: 'Cytosine',
    bits: '01',
  },
  G: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    name: 'Guanine',
    bits: '10',
  },
  T: {
    bg: 'bg-rose-50 border-rose-200',
    text: 'text-rose-800',
    name: 'Thymine',
    bits: '11',
  },
};

export const SequenceView: React.FC<SequenceViewProps> = ({
  capsule,
  simResult,
  recovery,
  capsulePhotoUrl,
  synthesizerPhotoUrl,
}) => {
  const [hoveredLocus, setHoveredLocus] = useState<number | null>(null);
  const [capsuleImgError, setCapsuleImgError] = useState(false);
  const [synthImgError, setSynthImgError] = useState(false);

  const previewLimit = 360;
  const previewSeq = capsule.encodedDna.slice(0, previewLimit);

  // Build mutated locus index lookup for Copy A, B, C
  const mutatedLociSample = useMemo(() => {
    const diffs: Array<{
      pos: number;
      expected: string;
      c0: string;
      c1: string;
      c2: string;
      voted: string;
    }> = [];
    const len = capsule.encodedDna.length;
    const c0 = simResult.corruptedCopies[0] ?? '';
    const c1 = simResult.corruptedCopies[1] ?? c0;
    const c2 = simResult.corruptedCopies[2] ?? c0;
    const voted = recovery.tmrVote.votedDna;

    for (let i = 0; i < len && diffs.length < 48; i++) {
      const exp = capsule.encodedDna[i];
      if (c0[i] !== exp || c1[i] !== exp || c2[i] !== exp) {
        diffs.push({
          pos: i,
          expected: exp,
          c0: c0[i],
          c1: c1[i],
          c2: c2[i],
          voted: voted[i],
        });
      }
    }
    return diffs;
  }, [capsule.encodedDna, simResult.corruptedCopies, recovery.tmrVote.votedDna]);

  const totalBases = Math.max(1, capsule.metrics.lengthBp);
  const inspectedIndex = hoveredLocus ?? 0;
  const inspectedBase = (capsule.encodedDna[inspectedIndex] ?? 'A') as Nucleotide;
  const inspectedInfo = BASE_STYLES[inspectedBase];

  return (
    <div className="space-y-6">
      {/* Nucleotide Map Panel */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Synthesized Nucleotide Sequence Map
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Showing first {Math.min(previewLimit, capsule.encodedDna.length)} of{' '}
              {capsule.encodedDna.length.toLocaleString()} bp · 2-bit encoding (00=A, 01=C, 10=G, 11=T)
            </p>
          </div>
          <div className="font-mono text-xs text-slate-600 tabular-nums">
            Locus #{inspectedIndex} · Byte {Math.floor(inspectedIndex / 4)} ·{' '}
            <span className="font-semibold text-slate-900">
              {inspectedBase} ({inspectedInfo.name}, {inspectedInfo.bits})
            </span>
          </div>
        </div>

        {/* Base Composition Strip */}
        <div className="mt-4 space-y-2">
          <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
            {(['A', 'C', 'G', 'T'] as const).map((b) => {
              const pct = (capsule.metrics.baseCounts[b] / totalBases) * 100;
              const barColor =
                b === 'A'
                  ? 'bg-emerald-500'
                  : b === 'C'
                    ? 'bg-blue-600'
                    : b === 'G'
                      ? 'bg-amber-500'
                      : 'bg-rose-500';
              return (
                <div
                  key={b}
                  style={{ width: `${pct}%` }}
                  className={barColor}
                  title={`${b}: ${pct.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-slate-600 tabular-nums">
            {(['A', 'C', 'G', 'T'] as const).map((b) => {
              const count = capsule.metrics.baseCounts[b];
              const pct = (count / totalBases) * 100;
              return (
                <span key={b}>
                  <strong className="text-slate-900">{b}</strong>:{' '}
                  {count.toLocaleString()} ({pct.toFixed(1)}%)
                </span>
              );
            })}
          </div>
        </div>

        {/* Base Matrix */}
        <div
          className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(22px,1fr))] gap-1"
          role="region"
          aria-label="DNA sequence base matrix"
        >
          {previewSeq.split('').map((ch, idx) => {
            const base = ch as Nucleotide;
            const st = BASE_STYLES[base] ?? BASE_STYLES.A;
            const isHovered = hoveredLocus === idx;
            return (
              <button
                key={idx}
                type="button"
                onMouseEnter={() => setHoveredLocus(idx)}
                onFocus={() => setHoveredLocus(idx)}
                aria-label={`Locus ${idx}, base ${base}`}
                className={`flex h-6 items-center justify-center rounded-[3px] border font-mono text-[11px] font-semibold transition-transform cursor-crosshair ${
                  st.bg
                } ${st.text} ${isHovered ? 'ring-2 ring-blue-600 scale-110 z-10' : ''}`}
              >
                {base}
              </button>
            );
          })}
        </div>
      </section>

      {/* TMR Majority Voting Alignment Table */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Triple Modular Redundancy (TMR) Locus Alignment
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Inspecting mutated nucleotide positions across biological copies A, B, and C against majority-voted consensus.
            </p>
          </div>
          <div className="font-mono text-xs text-slate-600 tabular-nums">
            Unanimous: {recovery.tmrVote.unanimousLoci.toLocaleString()} · Vote-repaired:{' '}
            {recovery.tmrVote.votedRepairedLoci.toLocaleString()} · 3-way split:{' '}
            {recovery.tmrVote.threeWayDisagreements}
          </div>
        </div>

        {mutatedLociSample.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Zero mutations detected at current radiation intensity. Increase the Point Mutations slider to observe TMR consensus repair.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Locus</th>
                  <th className="py-2 px-3 font-medium">Ref</th>
                  <th className="py-2 px-3 font-medium">Copy A</th>
                  {capsule.tmrEnabled && (
                    <>
                      <th className="py-2 px-3 font-medium">Copy B</th>
                      <th className="py-2 px-3 font-medium">Copy C</th>
                    </>
                  )}
                  <th className="py-2 px-3 font-medium">Voted</th>
                  <th className="py-2 pl-3 font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mutatedLociSample.slice(0, 12).map((row) => {
                  const voteMatched = row.voted === row.expected;
                  return (
                    <tr key={row.pos} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-700">#{row.pos}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {row.expected}
                      </td>
                      <td
                        className={`py-2 px-3 ${
                          row.c0 !== row.expected
                            ? 'font-semibold text-rose-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {row.c0}
                      </td>
                      {capsule.tmrEnabled && (
                        <>
                          <td
                            className={`py-2 px-3 ${
                              row.c1 !== row.expected
                                ? 'font-semibold text-rose-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {row.c1}
                          </td>
                          <td
                            className={`py-2 px-3 ${
                              row.c2 !== row.expected
                                ? 'font-semibold text-rose-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {row.c2}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {row.voted}
                      </td>
                      <td className="py-2 pl-3">
                        {voteMatched ? (
                          <span className="text-emerald-700">● Repaired by TMR</span>
                        ) : (
                          <span className="text-amber-700">▲ Delegated to RS</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Physical Capsule & Synthesizer Reference */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
            {capsuleImgError ? (
              <div className="flex h-full items-center justify-center bg-slate-100 text-xs text-slate-500">
                Hermetic Quartz DNA Capsule Reference
              </div>
            ) : (
              <img
                src={capsulePhotoUrl}
                alt="Lyophilized synthetic DNA archive glass capsule at -80°C"
                referrerPolicy="no-referrer"
                onError={() => setCapsuleImgError(true)}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">
              Hermetic Storage · -80 °C Cryogenic
            </div>
            <h4 className="mt-1 text-sm font-semibold text-slate-900">
              Lyophilized Silica-Encapsulated DNA Ampoule
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Physical storage isolates synthesized oligonucleotide pools from moisture and oxygen, suppressing hydrolytic depurination across centuries.
            </p>
          </div>
        </article>

        <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
            {synthImgError ? (
              <div className="flex h-full items-center justify-center bg-slate-100 text-xs text-slate-500">
                Microfluidic DNA Synthesizer Stage
              </div>
            ) : (
              <img
                src={synthesizerPhotoUrl}
                alt="Microfluidic optical DNA synthesis stage on laboratory bench"
                referrerPolicy="no-referrer"
                onError={() => setSynthImgError(true)}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">
              Phosphoramidite Array · Optical Verification
            </div>
            <h4 className="mt-1 text-sm font-semibold text-slate-900">
              Microfluidic Oligo Synthesis &amp; Sequencing Pipeline
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              FASTA-exported strands map directly to oligo pool synthesis plates and high-throughput sequencing readouts.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
};
