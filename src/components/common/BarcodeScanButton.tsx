import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  CheckCircle2,
  ImageUp,
  Loader2,
  ScanBarcode,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { playScanBeep, primeScanAudio } from "@/lib/sounds";
import { SAMPLE_BARCODE } from "@/lib/barcode";
import BarcodeImage from "@/components/common/BarcodeImage";
import "./barcode-scan.css";

type Props = {
  /** Receives the decoded barcode. */
  onScan: (code: string) => void;
  /** Accessible name, defaults to "Scan barcode". */
  label?: string;
  className?: string;
};

type Status = "starting" | "scanning" | "fallback";
type View = "camera" | "success";

/** How long the green success state holds before the code is applied. */
const SUCCESS_HOLD_MS = 1200;

function cameraMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was blocked. Allow camera access and try again, or upload a barcode photo.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Upload a barcode photo or use your handheld scanner.";
  }
  return "The camera could not be started. Upload a barcode photo or use your handheld scanner.";
}

/**
 * Barcode scanner: live camera -> animated target -> decoded success ->
 * automatic apply.
 *
 * Camera decoding uses ZXing (same engine as image upload). The success
 * animation is only reached after a real decode; the decorative frame
 * barcode is a vector illustration, never a camera crop. Once the success
 * state has been shown, the code is sent to `onScan` and the dialog closes,
 * so scanning a shelf item is a single uninterrupted action.
 */
export default function BarcodeScanButton({
  onScan,
  label = "Scan barcode",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("starting");
  const [note, setNote] = useState("Starting camera…");
  const [view, setView] = useState<View>("camera");

  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const watchdogRef = useRef<number | undefined>(undefined);
  const successTimerRef = useRef<number | undefined>(undefined);
  const doneRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = undefined;
    }
  }

  function clearSuccessTimer() {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = undefined;
    }
  }

  /** Real decode only: beep instantly, green success, then apply the code. */
  function handleDecoded(code: string) {
    const value = code.trim();
    if (!value || doneRef.current) return;
    doneRef.current = true;
    // Fire the confirmation tone before any teardown work so it is immediate.
    playScanBeep();
    stopCamera();
    setView("success");
    setNote("Barcode Scanned Successfully");
    successTimerRef.current = window.setTimeout(() => {
      successTimerRef.current = undefined;
      onScanRef.current(value);
      setOpen(false);
    }, SUCCESS_HOLD_MS);
  }

  const handleDecodedRef = useRef(handleDecoded);
  handleDecodedRef.current = handleDecoded;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    doneRef.current = false;
    setView("camera");
    setStatus("starting");
    setNote("Starting camera…");

    const fallback = (message: string) => {
      if (cancelled) return;
      stopCamera();
      setStatus("fallback");
      setNote(message);
    };

    const start = async () => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        fallback(
          "Camera access requires HTTPS or localhost. Upload a barcode photo, or keep using your handheld scanner."
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        fallback(
          "Camera access is unavailable in this browser. Upload a barcode photo or keep using your handheld scanner."
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          return;
        }
        const video = videoRef.current;
        if (!video) {
          fallback(
            "The camera preview could not be created. Upload a barcode photo."
          );
          return;
        }

        setStatus("scanning");
        setNote("Align the barcode inside the frame.");

        try {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromStream(
            stream,
            video,
            (result) => {
              if (doneRef.current) return;
              const text = result?.getText?.();
              if (!text) return;
              handleDecodedRef.current(text);
            }
          );
          if (cancelled) {
            controls.stop();
            return;
          }
          controlsRef.current = controls;

          watchdogRef.current = window.setTimeout(() => {
            if (!cancelled && !doneRef.current) {
              setNote(
                "Still scanning… move closer, steady the phone, or upload a barcode photo."
              );
            }
          }, 12000);
        } catch {
          fallback(
            "The camera reader could not start. Upload a barcode photo, or keep using your handheld scanner."
          );
        }
      } catch (err) {
        fallback(cameraMessage(err));
      }
    };

    void start();

    return () => {
      cancelled = true;
      clearSuccessTimer();
      stopCamera();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const decodeImage = async (file: File | null | undefined) => {
    if (!file) return;
    setNote("Reading the barcode from that image…");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const url = URL.createObjectURL(file);
      try {
        const result = await reader.decodeFromImageUrl(url);
        const text = result?.getText?.()?.trim();
        if (text) {
          handleDecoded(text);
          return;
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      // Fall through to the message below.
    }
    setNote(
      "No barcode was found in that image. Try a sharper photo or a different shot."
    );
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setNote("The camera is still starting — wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNote(
        "This browser could not read the camera frame. Upload a barcode photo instead."
      );
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setNote("Reading the captured frame…");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = new BrowserMultiFormatReader().decodeFromCanvas(canvas);
      const text = result?.getText?.()?.trim();
      if (text) {
        handleDecoded(text);
        return;
      }
    } catch {
      // Fall through to the retry message.
    }
    setNote(
      "No barcode read from that frame. Move closer, avoid glare, and capture again — or upload a photo."
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          primeScanAudio();
          setView("camera");
          setStatus("starting");
          setNote("Starting camera…");
          setOpen(true);
        }}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink transition hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
          className
        )}
      >
        <ScanBarcode className="h-6 w-6 opacity-[0.85]" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/55 p-3 animate-fade-in sm:p-4"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className="scan-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="scan-dialog-head">
                <div>
                  <div className="scan-dialog-kicker">Barcode</div>
                  <h2 className="scan-dialog-title">Scan a code</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="scan-icon-btn"
                  aria-label="Close scanner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="scan-dialog-body">
                {status !== "fallback" && (
                  <div className="scan-stage">
                    <video
                      ref={videoRef}
                      className="h-full w-full object-contain"
                      playsInline
                      muted
                      autoPlay
                    />
                    {status === "starting" && (
                      <div className="absolute inset-0 grid place-items-center bg-ink/40 text-paper">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                    <div className="absolute inset-0 grid place-items-center">
                      <div
                        className={cn(
                          "scan-frame",
                          view === "success" && "is-success"
                        )}
                      >
                        <div className="scan-area">
                          <div
                            className={cn(
                              "scan-barcode",
                              view === "camera" && "is-scanning"
                            )}
                          >
                            <BarcodeImage
                              value={SAMPLE_BARCODE}
                              format="EAN_13"
                              height={70}
                              width={2}
                              margin={10}
                              background={
                                view === "success" ? "#ffffff" : "transparent"
                              }
                              lineColor={
                                view === "success" ? "#000000" : "#ffffff"
                              }
                              className="h-full w-full"
                            />
                            {view === "camera" && status === "scanning" && (
                              <span className="scan-laser" aria-hidden="true" />
                            )}
                          </div>
                        </div>

                        <div className="scan-brackets" aria-hidden="true">
                          <span className="tl" />
                          <span className="tr" />
                          <span className="bl" />
                          <span className="br" />
                        </div>

                        {view === "success" && (
                          <>
                            <span
                              className="scan-success-pulse"
                              aria-hidden="true"
                            />
                            <span
                              className="scan-tick"
                              role="img"
                              aria-label="Barcode scanned successfully"
                            >
                              <svg viewBox="0 0 64 64" aria-hidden="true">
                                <circle
                                  className="scan-tick-bg"
                                  cx="32"
                                  cy="32"
                                  r="30"
                                />
                                <circle
                                  className="scan-tick-circle"
                                  cx="32"
                                  cy="32"
                                  r="23"
                                />
                                <path
                                  className="scan-tick-check"
                                  d="M20 33l8 8 16-17"
                                />
                              </svg>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    "scan-instruction",
                    view === "success" && "is-success"
                  )}
                  aria-live="polite"
                >
                  {view === "success" && (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {view === "success" ? "Barcode Scanned Successfully" : note}
                </div>

                <div
                  className={cn(
                    "scan-action-grid",
                    status === "scanning" ? "is-pair" : "is-single",
                    view === "success" && "is-idle"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => uploadRef.current?.click()}
                    disabled={view === "success"}
                    className="scan-btn scan-btn-secondary"
                  >
                    <ImageUp className="h-4 w-4" aria-hidden="true" />
                    Upload image
                  </button>
                  {status === "scanning" && view === "camera" && (
                    <button
                      type="button"
                      onClick={() => void captureFrame()}
                      className="scan-btn scan-btn-primary"
                    >
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      Capture frame
                    </button>
                  )}
                </div>
                <p className="scan-hint">
                  {view === "success"
                    ? "Applying barcode…"
                    : "Works without a camera or HTTPS."}
                </p>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void decodeImage(file);
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
