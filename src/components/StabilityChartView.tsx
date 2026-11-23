import React, { useMemo, useState } from 'react';
import { predictDegradation } from '../engine/degradationModel';

interface StabilityChartViewProps {
  years: number;
  temperatureC: number;
  strandLengthBp: number;
  rsNsym: number;
  tmrEnabled: boolean;
}

const REGIMES = [
  { temp: -196, name: 'Liquid Nitrogen Cryo' },
  { temp: -80, name: 'Ultra-Low Cryogenic Vault' },
  { temp: -20, name: 'Deep Freeze Archive' },
  { temp: 4, name: 'Cold Room Repository' },
  { temp: 20, name: 'Ambient Silica Capsule' },
];

export const StabilityChartView: React.FC<StabilityChartViewProps> = ({
  years,
  temperatureC,
  strandLengthBp,
  rsNsym,
  tmrEnabled,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [scaleMode, setScaleMode] = useState<'horizon' | 'halflife'>('halflife');

  const basePrediction = useMemo(
    () =>
      predictDegradation({
        years,
        temperatureC,
        strandLengthBp,
        rsNsym,
        tmrEnabled,
      }),
    [years, temperatureC, strandLengthBp, rsNsym, tmrEnabled],
  );

  const chartMaxYear = useMemo(() => {
    if (scaleMode === 'horizon') {
      return Math.max(2000, years);
    }
    // Scale to show full decay separation (capped cleanly around 2x half-life or min 5,000 yr)
    return Math.max(5000, Math.min(2_500_000, Math.round(basePrediction.halfLifeYears * 1.2)));
  }, [scaleMode, years, basePrediction.halfLifeYears]);

  const prediction = useMemo(
    () =>
      predictDegradation(
        {
          years,
          temperatureC,
          strandLengthBp,
          rsNsym,
          tmrEnabled,
        },
        chartMaxYear,
      ),
    [years, temperatureC, strandLengthBp, rsNsym, tmrEnabled, chartMaxYear],
  );

  const ambientBaseline = useMemo(
    () =>
      predictDegradation(
        {
          years,
          temperatureC: 20,
          strandLengthBp,
          rsNsym,
          tmrEnabled: false,
        },
        chartMaxYear,
      ),
    [years, strandLengthBp, rsNsym, chartMaxYear],
  );

  const regimeComparison = useMemo(
    () =>
      REGIMES.map((r) => ({
        ...r,
        result: predictDegradation({
          years,
          temperatureC: r.temp,
          strandLengthBp,
          rsNsym,
          tmrEnabled,
        }),
      })),
    [years, strandLengthBp, rsNsym, tmrEnabled],
  );

  const width = 760;
  const height = 300;
  const padL = 54;
  const padR = 24;
  const padT = 20;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxYear = chartMaxYear;
  const toX = (yr: number) => padL + (yr / maxYear) * plotW;
  const toY = (pct: number) => padT + ((100 - pct) / 100) * plotH;

  const aeonPath = prediction.curve
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.year).toFixed(1)} ${toY(pt.aeonSurvivalPct).toFixed(1)}`)
    .join(' ');

  const unprotPath = prediction.curve
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.year).toFixed(1)} ${toY(pt.unprotectedSurvivalPct).toFixed(1)}`)
    .join(' ');

  const ambientPath = ambientBaseline.curve
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.year).toFixed(1)} ${toY(pt.unprotectedSurvivalPct).toFixed(1)}`)
    .join(' ');

  const activePoint =
    hoverIdx !== null && prediction.curve[hoverIdx]
      ? prediction.curve[hoverIdx]
      : prediction.curve.reduce((closest, cur) =>
          Math.abs(cur.year - years) < Math.abs(closest.year - years) ? cur : closest,
        );

  const formatYearShort = (yr: number) => {
    if (yr >= 1_000_000) return `${(yr / 1_000_000).toFixed(1)}M yr`;
    if (yr >= 10_000) return `${Math.round(yr / 1000)}k yr`;
    return `${yr.toLocaleString()} yr`;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Arrhenius &amp; Cosmic Radiation Survival Horizon
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Empirical nucleotide decay kinetics at {temperatureC} °C ({prediction.thermalRegimeLabel}) · Max correctable{' '}
              {prediction.maxCorrectableErrorsPerBlock} byte errors/block
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setScaleMode('horizon')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  scaleMode === 'horizon'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                0–2,000 yr
              </button>
              <button
                type="button"
                onClick={() => setScaleMode('halflife')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  scaleMode === 'halflife'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Full Regime Decay
              </button>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
              <span className="flex items-center gap-1.5 text-blue-700">
                <span className="inline-block h-0.5 w-4 bg-blue-600" />
                Aeon (TMR + RS)
              </span>
              <span className="flex items-center gap-1.5 text-amber-700">
                <span className="inline-block h-0.5 w-4 border-b-2 border-dashed border-amber-600" />
                Raw ({temperatureC}°C)
              </span>
              {temperatureC !== 20 && (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="inline-block h-0.5 w-4 border-b border-dotted border-slate-400" />
                  Raw (+20°C)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Summary KPI row above chart */}
        <div className="mt-4 grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-slate-500">Predicted Half-Life (50% intact bases)</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {prediction.halfLifeYears >= 1_000_000
                ? `${(prediction.halfLifeYears / 1_000_000).toFixed(2)}M yr`
                : `${Math.round(prediction.halfLifeYears).toLocaleString()} yr`}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Safe 99.9% Recovery Horizon</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {prediction.predictedMaxSafeYears >= 1_000_000
                ? '> 1,000,000 yr'
                : `${prediction.predictedMaxSafeYears.toLocaleString()} yr`}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">
              At Year {activePoint.year.toLocaleString()}
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-blue-700 tabular-nums">
              {activePoint.aeonSurvivalPct.toFixed(2)}% Aeon ·{' '}
              <span className="text-amber-700">
                {activePoint.unprotectedSurvivalPct.toFixed(1)}% Raw
              </span>
            </div>
          </div>
        </div>

        {/* Interactive SVG Chart */}
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full min-w-[540px] cursor-crosshair select-none"
            role="img"
            aria-label="DNA survival percentage over archival years"
            onMouseLeave={() => setHoverIdx(null)}
          >
            {/* Horizontal grid lines */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = toY(pct);
              return (
                <g key={pct}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[10px]"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* Target year vertical marker */}
            <line
              x1={toX(Math.min(maxYear, years))}
              x2={toX(Math.min(maxYear, years))}
              y1={padT}
              y2={height - padB}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            {/* Curves */}
            {temperatureC !== 20 && (
              <path
                d={ambientPath}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="2 3"
              />
            )}
            <path
              d={unprotPath}
              fill="none"
              stroke="#d97706"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            <path
              d={aeonPath}
              fill="none"
              stroke="#2563eb"
              strokeWidth={2.5}
            />

            {/* Active hover crosshair */}
            <line
              x1={toX(activePoint.year)}
              x2={toX(activePoint.year)}
              y1={padT}
              y2={height - padB}
              stroke="#2563eb"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
            <circle
              cx={toX(activePoint.year)}
              cy={toY(activePoint.aeonSurvivalPct)}
              r={4.5}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <circle
              cx={toX(activePoint.year)}
              cy={toY(activePoint.unprotectedSurvivalPct)}
              r={4}
              fill="#d97706"
              stroke="#ffffff"
              strokeWidth={1.5}
            />

            {/* X-axis labels */}
            {prediction.curve
              .filter((_, i) => i % 4 === 0)
              .map((pt) => (
                <text
                  key={pt.year}
                  x={toX(pt.year)}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-slate-500 font-mono text-[10px]"
                >
                  {formatYearShort(pt.year)}
                </text>
              ))}

            {/* Invisible interactive hover bands */}
            {prediction.curve.map((pt, idx) => {
              const bandW = plotW / prediction.curve.length;
              return (
                <rect
                  key={pt.year}
                  x={toX(pt.year) - bandW / 2}
                  y={padT}
                  width={bandW}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(idx)}
                />
              );
            })}
          </svg>
        </div>
      </section>

      {/* Thermal Regime Comparison Matrix */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-semibold text-slate-900">
            Storage Temperature Regime Comparison ({years.toLocaleString()}-Year Horizon)
          </h3>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Storage Regime</th>
                <th className="py-2 px-3 font-medium">Temp</th>
                <th className="py-2 px-3 font-medium">Base Half-Life</th>
                <th className="py-2 px-3 font-medium">Raw Integrity</th>
                <th className="py-2 px-3 font-medium">Aeon Survival</th>
                <th className="py-2 pl-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {regimeComparison.map((row) => {
                const isSelected = row.temp === temperatureC;
                return (
                  <tr
                    key={row.temp}
                    className={isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'}
                  >
                    <td className="py-2.5 pr-4 font-sans font-medium text-slate-900">
                      {row.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{row.temp} °C</td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {row.result.halfLifeYears >= 1_000_000
                        ? `${(row.result.halfLifeYears / 1_000_000).toFixed(2)}M yr`
                        : `${Math.round(row.result.halfLifeYears).toLocaleString()} yr`}
                    </td>
                    <td className="py-2.5 px-3 text-amber-700">
                      {row.result.unprotectedSurvivalPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-blue-700">
                      {row.result.aeonSurvivalPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 pl-3">
                      {row.result.aeonSurvivalPct >= 99.9 ? (
                        <span className="text-emerald-700">● Nominal</span>
                      ) : row.result.aeonSurvivalPct >= 80 ? (
                        <span className="text-amber-700">▲ Degrading</span>
                      ) : (
                        <span className="text-rose-700">✖ Critical</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
