import React, { useRef } from 'react';
import { RefreshCw, ShieldCheck, Upload, Zap } from 'lucide-react';

export type PayloadMode = 'text' | 'image';
export type SampleImageKey = 'voyager' | 'nautilus' | 'custom';

export interface SimulationControlsState {
  mode: PayloadMode;
  textPayload: string;
  sampleImage: SampleImageKey;
  customImageName: string | null;
  rsNsym: number;
  tmrEnabled: boolean;
  years: number;
  temperatureC: number;
  mutationsPerStrand: number;
  seed: number;
}

interface ControlSidebarProps {
  state: SimulationControlsState;
  voyagerPreviewUrl: string;
  nautilusPreviewUrl: string;
  onChange: (patch: Partial<SimulationControlsState>) => void;
  onUploadCustomImage: (file: File) => void;
  onReseedRadiation: () => void;
  onRunFullCycle: () => void;
}

const TEXT_PRESETS = [
  {
    label: 'Aeon Manifesto',
    text: 'Project Aeon: Silicon rots in decades. DNA lasts for millennia. Encoded with Reed-Solomon FEC and Triple Modular Redundancy.',
  },
  {
    label: 'Voyager Greeting',
    text: 'We step out of our solar system into the universe seeking only peace and friendship, to teach if we are called upon, to be taught if we are fortunate.',
  },
  {
    label: 'Archive Manifest',
    text: 'CAPSULE_ID=DNA-ARC-003; PROTOCOL=AEON-RS150-TMR3; MATRIX=SILICA_SPHERE; STORAGE_TEMP=-80C; HORIZON=1000_YEARS;',
  },
];

const TEMPERATURE_OPTIONS = [
  { value: -196, label: '-196 °C (Liquid Nitrogen)' },
  { value: -80, label: '-80 °C (Cryogenic Vault)' },
  { value: -20, label: '-20 °C (Deep Freeze)' },
  { value: 4, label: '+4 °C (Cold Archive)' },
  { value: 20, label: '+20 °C (Ambient Room)' },
];

const RS_PARITY_OPTIONS = [
  { value: 32, label: 'RS-32 (16 B/blk)' },
  { value: 64, label: 'RS-64 (32 B/blk)' },
  { value: 128, label: 'RS-128 (64 B/blk)' },
  { value: 150, label: 'RS-150 (75 B/blk)' },
];

export const ControlSidebar: React.FC<ControlSidebarProps> = ({
  state,
  voyagerPreviewUrl,
  nautilusPreviewUrl,
  onChange,
  onUploadCustomImage,
  onReseedRadiation,
  onRunFullCycle,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <aside
      aria-label="Archive encoding and radiation parameters"
      className="w-full shrink-0 rounded-lg border border-slate-200 bg-white lg:w-[350px]"
    >
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Archive Capsule Parameters
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Configure source data, ECC redundancy, and 1000-year decay load.
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {/* Payload Source Section */}
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
              01. Payload Source
            </span>
            <div
              role="tablist"
              aria-label="Payload type"
              className="flex items-center gap-1 rounded-md bg-slate-100 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={state.mode === 'text'}
                onClick={() => onChange({ mode: 'text' })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  state.mode === 'text'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Text
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={state.mode === 'image'}
                onClick={() => onChange({ mode: 'image' })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  state.mode === 'image'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Image
              </button>
            </div>
          </div>

          {state.mode === 'text' ? (
            <div className="space-y-2.5">
              <label
                htmlFor="aeon-text-input"
                className="block text-xs font-medium text-slate-600"
              >
                UTF-8 Digital Message ({new TextEncoder().encode(state.textPayload).length} bytes)
              </label>
              <textarea
                id="aeon-text-input"
                rows={4}
                value={state.textPayload}
                onChange={(e) => onChange({ textPayload: e.target.value })}
                placeholder="Enter text payload to encode into synthetic DNA..."
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {TEXT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onChange({ textPayload: preset.text })}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Select an archival reference plate or upload an image (quantized to 56×56 grayscale matrix).
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onChange({ sampleImage: 'voyager' })}
                  className={`group overflow-hidden rounded-md border text-left transition-colors cursor-pointer ${
                    state.sampleImage === 'voyager'
                      ? 'border-blue-600 bg-blue-50/40'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="aspect-square w-full overflow-hidden bg-slate-900">
                    <img
                      src={voyagerPreviewUrl}
                      alt="Voyager archival Earth plate"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="px-2.5 py-1.5">
                    <div className="text-xs font-medium text-slate-900 truncate">
                      Voyager Earth
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onChange({ sampleImage: 'nautilus' })}
                  className={`group overflow-hidden rounded-md border text-left transition-colors cursor-pointer ${
                    state.sampleImage === 'nautilus'
                      ? 'border-blue-600 bg-blue-50/40'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="aspect-square w-full overflow-hidden bg-slate-200">
                    <img
                      src={nautilusPreviewUrl}
                      alt="Archival nautilus cross-section plate"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="px-2.5 py-1.5">
                    <div className="text-xs font-medium text-slate-900 truncate">
                      Nautilus Plate
                    </div>
                  </div>
                </button>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadCustomImage(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="truncate">
                    {state.sampleImage === 'custom' && state.customImageName
                      ? `Loaded: ${state.customImageName}`
                      : 'Upload Custom Image'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Error Correction & Redundancy */}
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
              02. Error Correction
            </span>
            <span className="font-mono text-xs text-slate-500">
              GF(256)
            </span>
          </div>

          <div>
            <label
              htmlFor="rs-nsym-select"
              className="block text-xs font-medium text-slate-600"
            >
              Reed-Solomon Parity Budget
            </label>
            <select
              id="rs-nsym-select"
              value={state.rsNsym}
              onChange={(e) => onChange({ rsNsym: Number(e.target.value) })}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {RS_PARITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <label
                htmlFor="tmr-toggle"
                className="block text-xs font-medium text-slate-800"
              >
                Triple Modular Redundancy
              </label>
              <p className="text-xs text-slate-500">
                3× biological strand majority voting
              </p>
            </div>
            <button
              id="tmr-toggle"
              type="button"
              role="switch"
              aria-checked={state.tmrEnabled}
              onClick={() => onChange({ tmrEnabled: !state.tmrEnabled })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                state.tmrEnabled
                  ? 'border-blue-600 bg-blue-600'
                  : 'border-slate-300 bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                  state.tmrEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Radiation & Time Simulation */}
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
              03. Radiation &amp; Horizon
            </span>
            <button
              type="button"
              onClick={onReseedRadiation}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span>Reseed</span>
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="mutations-slider"
                className="font-medium text-slate-600"
              >
                Point Mutations / Strand
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {state.mutationsPerStrand.toLocaleString()} nt
              </span>
            </div>
            <input
              id="mutations-slider"
              type="range"
              min={0}
              max={state.mode === 'image' ? 1500 : 400}
              step={state.mode === 'image' ? 25 : 5}
              value={state.mutationsPerStrand}
              onChange={(e) =>
                onChange({ mutationsPerStrand: Number(e.target.value) })
              }
              className="aeon-slider mt-2 w-full"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ mutationsPerStrand: 45 })}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                1000-Yr (45 nt)
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    mutationsPerStrand: state.mode === 'image' ? 750 : 180,
                  })
                }
                className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Solar Storm ({state.mode === 'image' ? '750' : '180'} nt)
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="years-slider" className="font-medium text-slate-600">
                Archival Horizon
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {state.years.toLocaleString()} yr
              </span>
            </div>
            <input
              id="years-slider"
              type="range"
              min={100}
              max={5000}
              step={100}
              value={state.years}
              onChange={(e) => onChange({ years: Number(e.target.value) })}
              className="aeon-slider mt-2 w-full"
            />
          </div>

          <div>
            <label
              htmlFor="temp-select"
              className="block text-xs font-medium text-slate-600"
            >
              Storage Thermal Regime
            </label>
            <select
              id="temp-select"
              value={state.temperatureC}
              onChange={(e) => onChange({ temperatureC: Number(e.target.value) })}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {TEMPERATURE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Footer */}
        <div className="space-y-2 px-5 py-4 bg-slate-50/70">
          <button
            type="button"
            onClick={onRunFullCycle}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Run Encode · Mutate · Recover</span>
          </button>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            <span>Seed #{state.seed} · Deterministic GF(256) pipeline</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
