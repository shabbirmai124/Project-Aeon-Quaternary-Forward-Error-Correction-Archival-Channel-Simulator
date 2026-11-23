import React, { useEffect, useRef } from 'react';
import type { DnaCapsule, RecoveryReport } from '../engine/dnaCodec';
import {
  decodeBytesToImageMatrix,
  renderGrayscaleMatrixToCanvas,
  type GrayscaleMatrix,
} from '../utils/imageCodec';
import type { PayloadMode } from './ControlSidebar';

interface RecoveryViewProps {
  mode: PayloadMode;
  originalText: string;
  imageMatrix: GrayscaleMatrix | null;
  capsule: DnaCapsule;
  recovery: RecoveryReport;
}

export const RecoveryView: React.FC<RecoveryViewProps> = ({
  mode,
  originalText,
  imageMatrix,
  capsule,
  recovery,
}) => {
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rawDamagedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const restoredCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (mode !== 'image' || !imageMatrix) return;

    renderGrayscaleMatrixToCanvas(origCanvasRef.current, imageMatrix);

    const unprotectedMatrix = decodeBytesToImageMatrix(
      recovery.unprotectedBytes,
      imageMatrix.width,
      imageMatrix.height,
    );
    renderGrayscaleMatrixToCanvas(rawDamagedCanvasRef.current, unprotectedMatrix);

    const restoredMatrix = decodeBytesToImageMatrix(
      recovery.recoveredBytes,
      imageMatrix.width,
      imageMatrix.height,
    );
    renderGrayscaleMatrixToCanvas(restoredCanvasRef.current, restoredMatrix);
  }, [mode, imageMatrix, recovery]);

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const unprotectedText = decoder.decode(recovery.unprotectedBytes);
  const restoredText = decoder.decode(recovery.recoveredBytes);

  return (
    <div className="space-y-6">
      {/* Side-by-Side Comparison */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              End-to-End Archive Recovery Comparison
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Comparing source payload against unprotected DNA and Project Aeon (TMR + Reed-Solomon) output.
            </p>
          </div>
          <div className="font-mono text-xs tabular-nums">
            {recovery.exactMatch ? (
              <span className="font-semibold text-emerald-700">
                ● 100.00% Bit-Perfect Match (0 differing bytes)
              </span>
            ) : (
              <span className="font-semibold text-rose-700">
                ✖ {recovery.differingBytes} unrecovered bytes ({recovery.byteIntegrityPercent.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>

        {mode === 'text' ? (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  01. Original Payload
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {capsule.originalBytes.length} B
                </span>
              </div>
              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-800">
                {originalText}
              </pre>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  02. Unprotected DNA
                </span>
                <span className="font-mono text-amber-700 tabular-nums">
                  {recovery.unprotectedIntegrityPercent.toFixed(1)}% intact
                </span>
              </div>
              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-700">
                {unprotectedText}
              </pre>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  03. Aeon Restored
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    recovery.exactMatch ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {recovery.byteIntegrityPercent.toFixed(1)}% intact
                </span>
              </div>
              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-900">
                {restoredText}
              </pre>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  01. Original Grayscale Plate
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {imageMatrix?.width ?? 56}×{imageMatrix?.height ?? 56}
                </span>
              </div>
              <div className="mt-3 flex aspect-square items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-900">
                <canvas
                  ref={origCanvasRef}
                  data-testid="original-image-canvas"
                  className="h-full w-full object-contain [image-rendering:pixelated]"
                />
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  02. Unprotected DNA
                </span>
                <span className="font-mono text-amber-700 tabular-nums">
                  {recovery.unprotectedIntegrityPercent.toFixed(1)}% intact
                </span>
              </div>
              <div className="mt-3 flex aspect-square items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-900">
                <canvas
                  ref={rawDamagedCanvasRef}
                  data-testid="unprotected-image-canvas"
                  className="h-full w-full object-contain [image-rendering:pixelated]"
                />
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  03. Aeon Restored
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    recovery.exactMatch ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {recovery.byteIntegrityPercent.toFixed(1)}% intact
                </span>
              </div>
              <div className="mt-3 flex aspect-square items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-900">
                <canvas
                  ref={restoredCanvasRef}
                  data-testid="restored-image-canvas"
                  className="h-full w-full object-contain [image-rendering:pixelated]"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Reed-Solomon Block Diagnostics Table */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Reed-Solomon Block Repair Diagnostics
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              RS(255, {capsule.dataBlockSize}) over GF(256) · Tolerance up to{' '}
              {Math.floor(capsule.rsNsym / 2)} byte errors per block.
            </p>
          </div>
          <div className="font-mono text-xs text-slate-600 tabular-nums">
            Blocks: {recovery.rsReport.totalBlocks} · Repaired:{' '}
            {recovery.rsReport.correctedErrors} bytes · Uncorrectable:{' '}
            {recovery.rsReport.uncorrectableBlocks}
          </div>
        </div>

        <div className="mt-4 max-h-72 overflow-y-auto">
          <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Block ID</th>
                <th className="py-2 px-3 font-medium">Payload Bytes</th>
                <th className="py-2 px-3 font-medium">Parity Symbols</th>
                <th className="py-2 px-3 font-medium">Byte Errors Repaired</th>
                <th className="py-2 pl-3 font-medium">Decoder State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recovery.rsReport.blockResults.map((blk) => (
                <tr key={blk.blockIndex} className="hover:bg-slate-50">
                  <td className="py-2 pr-4 text-slate-800">
                    BLK-{String(blk.blockIndex + 1).padStart(3, '0')}
                  </td>
                  <td className="py-2 px-3 text-slate-700">{blk.dataBytes} B</td>
                  <td className="py-2 px-3 text-slate-700">{capsule.rsNsym} B</td>
                  <td className="py-2 px-3 text-slate-900 font-semibold">
                    {blk.correctedErrors}
                  </td>
                  <td className="py-2 pl-3">
                    {blk.uncorrectable ? (
                      <span className="text-rose-700">✖ Exceeded ECC Limit</span>
                    ) : blk.correctedErrors > 0 ? (
                      <span className="text-blue-700">● Repaired</span>
                    ) : (
                      <span className="text-emerald-700">● Clean</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
