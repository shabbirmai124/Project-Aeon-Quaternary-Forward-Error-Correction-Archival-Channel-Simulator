import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
  PRETRAINED_AEON_MODEL,
  estimateHalfLifeYears,
  extractWindowFeatures,
  predictWindowRisk,
} from '../engine/mlModel';

interface CsvRow {
  trial_id: string;
  sequence_window: string;
  codec: string;
  gc_content: string;
  max_homopolymer: string;
  storage_years: string;
  temperature_c: string;
  rs_parity: string;
  degradation_risk_prob: string;
  degradation_risk_label: string;
  recovered_accuracy_pct: string;
}

const SAMPLE_SEQUENCES = [
  {
    label: 'Goldman Balanced (Low Risk)',
    seq: 'ACGTACGTGCATGCATACGTACGTGCATGCAT',
    years: 1000,
    temp: -20,
    dose: 2.0,
  },
  {
    label: 'Severe Homopolymer (High Risk)',
    seq: 'AAAAAAAAAAAAAAAATTTTTTTTTTTTTTTT',
    years: 2500,
    temp: 25,
    dose: 18.0,
  },
  {
    label: 'GC-Skewed Archive',
    seq: 'GCGCGCGGGGCCCCGCGCGGGGCCCCGCGCGC',
    years: 1500,
    temp: 10,
    dose: 6.5,
  },
];

export const MlLabView: React.FC = () => {
  const model = PRETRAINED_AEON_MODEL;

  // Interactive Inference Controls
  const [seqInput, setSeqInput] = useState(SAMPLE_SEQUENCES[0].seq);
  const [years, setYears] = useState(SAMPLE_SEQUENCES[0].years);
  const [tempC, setTempC] = useState(SAMPLE_SEQUENCES[0].temp);
  const [doseMSv, setDoseMSv] = useState(SAMPLE_SEQUENCES[0].dose);

  // Real CSV Dataset Preview State
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [codecFilter, setCodecFilter] = useState<'all' | 'goldman-base3' | 'standard-2bit'>('all');
  const [csvStatus, setCsvStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    fetch('/data/aeon_dna_stability_dataset.csv')
      .then((res) => {
        if (!res.ok) throw new Error('Dataset fetch failed');
        return res.text();
      })
      .then((text) => {
        if (!active) return;
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',');
        const parsed: CsvRow[] = lines.slice(1, 201).map((line) => {
          const vals = line.split(',');
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => {
            obj[h.trim()] = vals[i]?.trim() ?? '';
          });
          return obj as unknown as CsvRow;
        });
        setCsvRows(parsed);
        setCsvStatus('ready');
      })
      .catch(() => {
        if (active) setCsvStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const cleanedSeq = useMemo(
    () => seqInput.toUpperCase().replace(/[^ACGT]/g, ''),
    [seqInput]
  );

  const livePrediction = useMemo(() => {
    const seq = cleanedSeq.length >= 4 ? cleanedSeq : 'ACGTACGT';
    const { features, gcFraction, maxHomopolymer, deltaG } = extractWindowFeatures(seq, {
      storageYears: years,
      temperatureC: tempC,
      radiationMSvPerYear: doseMSv,
    });
    const riskProb = predictWindowRisk(features, model);
    const halfLife = estimateHalfLifeYears(tempC, gcFraction);
    const predictedRecoveryAcc =
      riskProb < 0.45
        ? 100.0
        : riskProb < 0.72
          ? Math.max(91.5, 100 - (riskProb - 0.45) * 28)
          : Math.max(58.0, 91.5 - (riskProb - 0.72) * 110);

    return {
      riskProb,
      classification: riskProb >= 0.5 ? 'Elevated Degradation Risk' : 'Nominal Stability',
      gcFraction,
      maxHomopolymer,
      deltaG,
      halfLife,
      predictedRecoveryAcc,
      features,
    };
  }, [cleanedSeq, years, tempC, doseMSv, model]);

  const filteredCsvRows = useMemo(() => {
    const subset =
      codecFilter === 'all'
        ? csvRows
        : csvRows.filter((r) => r.codec === codecFilter);
    return subset.slice(0, 12);
  }, [csvRows, codecFilter]);

  const { tp, tn, fp, fn } = model.confusionMatrix;
  const totalTest = tp + tn + fp + fn;

  // SVG Training Loss / Accuracy Convergence Plot dimensions
  const chartW = 520;
  const chartH = 200;
  const pad = { top: 18, right: 20, bottom: 30, left: 42 };
  const innerW = chartW - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;

  const lossPath = model.trainingHistory
    .map((pt, idx) => {
      const x = pad.left + ((pt.epoch - 1) / 59) * innerW;
      const y = pad.top + (1 - Math.min(1, pt.loss)) * innerH;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const accPath = model.trainingHistory
    .map((pt, idx) => {
      const x = pad.left + ((pt.epoch - 1) / 59) * innerW;
      const y = pad.top + (1 - pt.trainAccuracy) * innerH;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 [text-wrap:balance]">
            Supervised ML Channel Stability &amp; Accuracy Predictor
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Trained on the 1,600-trial CSV benchmark dataset (<span className="font-mono text-slate-800">80/20</span> split) via mini-batch backpropagation in Python. Executes identical weights in-browser for real-time codeword risk scoring and soft-voting TMR tie-breaking.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/data/aeon_dna_stability_dataset.csv"
            download="aeon_dna_stability_dataset.csv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download CSV (1,600 rows)
          </a>
          <a
            href="/models/aeon_dna_stability_model.json"
            download="aeon_dna_stability_model.json"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Model Weights
          </a>
        </div>
      </div>

      {/* Model Evaluation KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Held-Out Accuracy', val: (model.validationMetrics.accuracy * 100).toFixed(2), unit: '%', sub: `${tp + tn}/${totalTest} test trials` },
          { label: 'ROC-AUC', val: model.validationMetrics.rocAuc.toFixed(4), unit: 'auc', sub: 'Discrimination' },
          { label: 'F1-Score', val: model.validationMetrics.f1Score.toFixed(4), unit: 'f1', sub: 'Harmonic mean' },
          { label: 'Precision', val: (model.validationMetrics.precision * 100).toFixed(2), unit: '%', sub: `FP = ${fp}` },
          { label: 'Recall', val: (model.validationMetrics.recall * 100).toFixed(2), unit: '%', sub: `FN = ${fn}` },
          { label: 'Brier Score', val: model.validationMetrics.brierScore.toFixed(4), unit: 'mse', sub: 'Calibration error' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 truncate">
              {kpi.label}
            </div>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-2xl font-mono font-semibold text-slate-950 tabular-nums">
                {kpi.val}
              </span>
              <span className="ml-1 text-[11px] font-mono text-slate-400">{kpi.unit}</span>
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 tabular-nums">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Live Inference Sandbox + Model Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 cols: Live Sequence Scorer */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Live Codeword Risk &amp; Recovery Predictor
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Forward pass through <span className="font-mono">{model.architecture}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_SEQUENCES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setSeqInput(s.seq);
                    setYears(s.years);
                    setTempC(s.temp);
                    setDoseMSv(s.dose);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="ml-seq-input" className="block text-xs font-medium text-slate-700 mb-1">
                Quaternary Sequence Window (A, C, G, T)
              </label>
              <textarea
                id="ml-seq-input"
                rows={2}
                value={seqInput}
                onChange={(e) => setSeqInput(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono uppercase tracking-wider text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="ml-years" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Horizon (yr)
                </label>
                <input
                  id="ml-years"
                  type="number"
                  min={1}
                  max={10000}
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="ml-temp" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Temp (°C)
                </label>
                <input
                  id="ml-temp"
                  type="number"
                  min={-80}
                  max={45}
                  value={tempC}
                  onChange={(e) => setTempC(Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="ml-dose" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Noise (mSv/yr)
                </label>
                <input
                  id="ml-dose"
                  type="number"
                  step={0.5}
                  min={0.1}
                  max={50}
                  value={doseMSv}
                  onChange={(e) => setDoseMSv(Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Prediction Result Summary */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Predicted Instability Probability</span>
              <span
                className={`text-xl font-mono font-bold tabular-nums ${
                  livePrediction.riskProb >= 0.5 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {(livePrediction.riskProb * 100).toFixed(2)}%
              </span>
            </div>

            <div className="w-full h-2.5 bg-slate-100 rounded-xs overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  livePrediction.riskProb >= 0.5 ? 'bg-rose-600' : 'bg-cyan-600'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, livePrediction.riskProb * 100))}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums pt-1">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-[11px] text-slate-500 font-sans">Class Verdict</div>
                <div
                  className={`mt-0.5 font-semibold ${
                    livePrediction.riskProb >= 0.5 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {livePrediction.riskProb >= 0.5 ? '▲ High Risk' : '● Stable'}
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-[11px] text-slate-500 font-sans">Est. RS+TMR Accuracy</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {livePrediction.predictedRecoveryAcc.toFixed(2)}%
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-[11px] text-slate-500 font-sans">Max Run / GC%</div>
                <div className="mt-0.5 text-slate-900">
                  {livePrediction.maxHomopolymer} nt · {(livePrediction.gcFraction * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-[11px] text-slate-500 font-sans">Arrhenius Half-Life</div>
                <div className="mt-0.5 text-slate-900">
                  {livePrediction.halfLife >= 10000
                    ? `${(livePrediction.halfLife / 1000).toFixed(0)}k yr`
                    : `${livePrediction.halfLife.toFixed(0)} yr`}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right 7 cols: Convergence Curve, Confusion Matrix & Feature Importances */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-6">
          {/* Training Convergence SVG */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-base font-semibold text-slate-950">
                Training Convergence (60 Epochs · 1,280 Train / 320 Test)
              </h2>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-blue-700">── Train Accuracy</span>
                <span className="text-amber-600">- - Binary Cross-Entropy Loss</span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              role="img"
              aria-label="MLP training accuracy and cross-entropy loss convergence over 60 epochs"
              className="w-full h-auto border border-slate-100 rounded bg-slate-50/40"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((v) => {
                const y = pad.top + (1 - v) * innerH;
                return (
                  <g key={v}>
                    <line
                      x1={pad.left}
                      y1={y}
                      x2={chartW - pad.right}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x={pad.left - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono"
                    >
                      {v.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              <path d={accPath} fill="none" stroke="#2563eb" strokeWidth="2.5" />
              <path d={lossPath} fill="none" stroke="#d97706" strokeWidth="2" strokeDasharray="5 4" />

              {model.trainingHistory.map((pt) => {
                const x = pad.left + ((pt.epoch - 1) / 59) * innerW;
                const yAcc = pad.top + (1 - pt.trainAccuracy) * innerH;
                const yLoss = pad.top + (1 - Math.min(1, pt.loss)) * innerH;
                return (
                  <g key={pt.epoch}>
                    <circle cx={x} cy={yAcc} r="3.5" fill="#2563eb" />
                    <circle cx={x} cy={yLoss} r="3" fill="#d97706" />
                    <text
                      x={x}
                      y={chartH - 10}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      Ep {pt.epoch}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bottom Grid: Confusion Matrix + Permutation Feature Importance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-200">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Held-Out Test Confusion Matrix (n = {totalTest})
              </h3>
              <div className="grid grid-cols-2 gap-2 text-center font-mono">
                <div className="p-3 rounded border border-emerald-200 bg-emerald-50/60">
                  <div className="text-[11px] text-emerald-800 font-sans">True Positive</div>
                  <div className="text-xl font-bold text-emerald-950 tabular-nums mt-0.5">{tp}</div>
                  <div className="text-[10px] text-emerald-700">Correct High-Risk</div>
                </div>
                <div className="p-3 rounded border border-rose-200 bg-rose-50/50">
                  <div className="text-[11px] text-rose-800 font-sans">False Positive</div>
                  <div className="text-xl font-bold text-rose-950 tabular-nums mt-0.5">{fp}</div>
                  <div className="text-[10px] text-rose-700">Conservative Alert</div>
                </div>
                <div className="p-3 rounded border border-amber-200 bg-amber-50/50">
                  <div className="text-[11px] text-amber-800 font-sans">False Negative</div>
                  <div className="text-xl font-bold text-amber-950 tabular-nums mt-0.5">{fn}</div>
                  <div className="text-[10px] text-amber-700">Missed Risk</div>
                </div>
                <div className="p-3 rounded border border-blue-200 bg-blue-50/60">
                  <div className="text-[11px] text-blue-800 font-sans">True Negative</div>
                  <div className="text-xl font-bold text-blue-950 tabular-nums mt-0.5">{tn}</div>
                  <div className="text-[10px] text-blue-700">Correct Stable</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Permutation Feature Importance
              </h3>
              <div className="space-y-2">
                {model.featureNames.map((name, idx) => {
                  const imp = model.featureImportances[idx] ?? 0;
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="text-slate-700 truncate pr-2">{name}</span>
                        <span className="font-mono text-slate-900 tabular-nums">
                          {(imp * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-xs overflow-hidden">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${Math.min(100, imp * 220)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Real CSV Dataset Table Explorer */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Training Dataset Preview (data/aeon_dna_stability_dataset.csv)
            </h2>
            <p className="text-xs text-slate-500">
              Showing representative benchmark trials from the 1,600-row labeled CSV used to train Aeon-MLP-BioStability-v1.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                { id: 'all', label: 'All Codecs' },
                { id: 'goldman-base3', label: 'Goldman Base-3' },
                { id: 'standard-2bit', label: 'Standard 2-bit' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setCodecFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  codecFilter === f.id
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {csvStatus === 'loading' ? (
          <p className="text-xs font-mono text-slate-500 py-6">Loading CSV dataset...</p>
        ) : csvStatus === 'error' ? (
          <p className="text-xs font-mono text-rose-700 py-6">Could not load CSV dataset preview.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Trial ID</th>
                  <th className="py-2.5 pr-4 font-semibold">Codec</th>
                  <th className="py-2.5 pr-4 font-semibold">GC%</th>
                  <th className="py-2.5 pr-4 font-semibold">Max Run</th>
                  <th className="py-2.5 pr-4 font-semibold">Horizon</th>
                  <th className="py-2.5 pr-4 font-semibold">Temp</th>
                  <th className="py-2.5 pr-4 font-semibold">RS Parity</th>
                  <th className="py-2.5 pr-4 font-semibold">Risk Prob</th>
                  <th className="py-2.5 font-semibold">Recovered Acc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {filteredCsvRows.map((row) => (
                  <tr key={row.trial_id} className="hover:bg-slate-50/80">
                    <td className="py-2 pr-4 text-slate-900 font-medium">{row.trial_id}</td>
                    <td className="py-2 pr-4 font-sans text-slate-700">
                      {row.codec === 'goldman-base3' ? 'Goldman Base-3' : 'Standard 2-bit'}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {(Number(row.gc_content) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{row.max_homopolymer}</td>
                    <td className="py-2 pr-4 text-slate-700">{Number(row.storage_years).toLocaleString()} yr</td>
                    <td className="py-2 pr-4 text-slate-700">{row.temperature_c}°C</td>
                    <td className="py-2 pr-4 text-slate-700">RS={row.rs_parity}</td>
                    <td
                      className={`py-2 pr-4 font-semibold ${
                        Number(row.degradation_risk_label) === 1 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {(Number(row.degradation_risk_prob) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 text-slate-900 font-semibold">
                      {Number(row.recovered_accuracy_pct).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
