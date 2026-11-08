import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  CheckCircle2,
  ImageUp,
  Loader2,
  Flashlight,
  FlashlightOff,
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
      return "Access was blocked. Allow access or upload a barcode photo.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No scanning device was found. Upload a barcode photo or use your handheld scanner.";
  }
  return "Scanning could not be started. Upload a barcode photo or use your handheld scanner.";
}

type ScanCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: number;
  minZoom?: number;
  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];
};

/** Tune the native camera/ISP rather than trying to improve a blurry frame in
 * CSS. Native scanner apps use this same class of controls: continuous focus,
 * exposure and white balance, a detail-oriented stream, native zoom and torch. */
async function optimizeCameraTrack(track: MediaStreamTrack): Promise<{
  torchOn: boolean;
  zoom: number | null;
}> {
  const capabilities = track.getCapabilities?.() as ScanCapabilities | undefined;
  const supported = (key: keyof ScanCapabilities, value: string) =>
    Array.isArray(capabilities?.[key]) &&
    (capabilities?.[key] as string[]).includes(value);
  const advanced: MediaTrackConstraintSet[] = [];

  if (supported("focusMode", "continuous")) {
    advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
  }
  if (supported("exposureMode", "continuous")) {
    advanced.push({ exposureMode: "continuous" } as MediaTrackConstraintSet);
  }
  if (supported("whiteBalanceMode", "continuous")) {
    advanced.push({ whiteBalanceMode: "continuous" } as MediaTrackConstraintSet);
  }

  let zoom: number | null = null;
  if (typeof capabilities?.zoom === "number") {
    const min = Number(capabilities.minZoom ?? 1);
    zoom = Math.max(min, Math.min(2, capabilities.zoom));
    advanced.push({ zoom } as MediaTrackConstraintSet);
  }

  if (advanced.length) {
    await track.applyConstraints({ advanced }).catch(() => undefined);
  }
  if ("contentHint" in track) {
    (track as MediaStreamTrack & { contentHint?: string }).contentHint = "detail";
  }

  // Torch is attempted automatically for the same low-noise, high-contrast
  // conditions a native barcode scanner creates. Some browsers accept only
  // the direct form, others only the advanced form.
  if (capabilities?.torch === true || "torch" in (capabilities ?? {})) {
    try {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      return { torchOn: true, zoom };
    } catch {
      try {
        await track.applyConstraints({ torch: true } as MediaTrackConstraints);
        return { torchOn: true, zoom };
      } catch {
        // Continue with focus/exposure/white balance if torch is unavailable.
      }
    }
  }
  return { torchOn: false, zoom };
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
  const [note, setNote] = useState("Starting scanner…");
  const [view, setView] = useState<View>("camera");
  const [torchOn, setTorchOn] = useState(false);
  const [nativeZoom, setNativeZoom] = useState<number | null>(null);

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
    setTorchOn(false);
    setNativeZoom(null);
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
    setNote("Starting scanner…");

    const fallback = (message: string) => {
      if (cancelled) return;
      stopCamera();
      setStatus("fallback");
      setNote(message);
    };

    const start = async () => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        fallback(
          "Scanning is unavailable here. Upload a barcode photo or use your handheld scanner."
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        fallback(
          "Scanning is unavailable here. Upload a barcode photo or use your handheld scanner."
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { exact: "environment" },
              width: { min: 1280, ideal: 1920 },
              height: { min: 720, ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
            },
            audio: false,
          });
        } catch (err) {
          if (
            err instanceof DOMException &&
            !["OverconstrainedError", "NotFoundError"].includes(err.name)
          ) {
            throw err;
          }
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          });
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks?.()[0];
        if (track) {
          const optimized = await optimizeCameraTrack(track);
          setTorchOn(optimized.torchOn);
          setNativeZoom(
            optimized.zoom !== null && optimized.zoom >= 2
              ? optimized.zoom
              : null
          );
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          return;
        }
        const video = videoRef.current;
        if (!video) {
          fallback(
            "The scanner preview could not be created. Upload a barcode photo."
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
            "The scanner could not start. Upload a barcode photo or use your handheld scanner."
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

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) {
      setNote("The scanner is still starting — try the light again in a moment.");
      return;
    }
    const next = !torchOn;
    try {
      try {
        await track.applyConstraints({
          advanced: [{ torch: next } as MediaTrackConstraintSet],
        });
      } catch {
        // A few Chromium camera implementations expose torch as a direct
        // constraint but reject the advanced form.
        await track.applyConstraints({ torch: next } as MediaTrackConstraints);
      }
      setTorchOn(next);
    } catch {
      setNote("This camera could not switch its light.");
    }
  };

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
      setNote("The scanner is still starting — wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNote(
        "This browser could not read the frame. Upload a barcode photo instead."
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
          setNote("Starting scanner…");
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
                      className={cn("scan-video", nativeZoom === null && "is-zoomed")}
                      playsInline
                      muted
                      autoPlay
                    />
                    {status === "scanning" && view === "camera" && (
                      <button
                        type="button"
                        className={cn(
                          "scan-flash-btn",
                          torchOn && "is-on"
                        )}
                        onClick={() => void toggleTorch()}
                        aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
                        aria-pressed={torchOn}
                        title={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
                      >
                        {torchOn ? (
                          <FlashlightOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Flashlight className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    )}
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
                            {view === "success" && (
                              <BarcodeImage
                                value={SAMPLE_BARCODE}
                                format="EAN_13"
                                height={70}
                                width={2}
                                margin={10}
                                background="#ffffff"
                                lineColor="#000000"
                                className="h-full w-full"
                              />
                            )}
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
