"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "starting" | "running" | "error";

/**
 * Camera barcode reader.
 *
 * ZXing on every platform rather than the native BarcodeDetector where it
 * exists: iOS Safari has no BarcodeDetector at all, and one code path that
 * works everywhere beats a fast path plus a fallback that only one of us can
 * ever test. It's imported dynamically, so the library only reaches people who
 * open the scanner.
 */
export function BarcodeScanner({
  onDetected,
}: {
  onDetected: (barcode: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so a re-rendered callback doesn't tear down and restart the
  // camera. Synced in an effect rather than during render, which React forbids.
  const detected = useRef(onDetected);
  useEffect(() => {
    detected.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "This browser won't give a page camera access. On iOS that usually means Safari, and it needs an https:// address.",
        );
        setPhase("error");
        return;
      }

      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([import("@zxing/browser"), import("@zxing/library")]);

        // Grocery formats only. Left open, ZXing spends its time looking for
        // QR and Data Matrix codes that a tin of beans will never carry.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        if (cancelled || !video.current) return;

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current,
          (result) => {
            if (result) detected.current(result.getText());
          },
        );

        stop = () => controls.stop();
        if (cancelled) stop();
        else setPhase("running");
      } catch (cause) {
        if (cancelled) return;
        const name = (cause as { name?: string }).name;
        setError(
          name === "NotAllowedError"
            ? "Camera access was refused. Allow it for this site and try again."
            : name === "NotFoundError"
              ? "No camera on this device."
              : "Couldn't start the camera.",
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (phase === "error") {
    return (
      <p
        role="alert"
        className="rounded-[20px] bg-[oklch(0.96_0.03_40)] p-5 text-sm font-bold text-destructive"
      >
        {error}
      </p>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-ink">
      <video
        ref={video}
        playsInline
        muted
        className="aspect-[4/3] w-full object-cover"
      />
      {/* A window to aim through. Nothing is cropped to it - ZXing reads the
          whole frame - but people hold a packet steadier against a target, and
          a moving line says the camera is awake and looking. Without it a
          stopped video stream and a working one are the same picture. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-24 w-4/5 overflow-hidden rounded-[14px] border-2 border-white/80">
          <div className="scan-line absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
        </div>
      </div>
      {phase === "starting" && (
        <p className="absolute inset-x-0 bottom-3 text-center text-sm font-bold text-white">
          Starting camera…
        </p>
      )}
    </div>
  );
}
