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
import {
  detectorFormatName,
  toJsBarcodeFormat,
  zxingFormatFromValue,
} from "@/lib/barcode";
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

type NativeBarcode = { rawValue?: string; format?: string };
type NativeBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<NativeBarcode[]>;
};
type NativeBarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => NativeBarcodeDetector;
type TorchCapture = {
  setOptions: (options: { fillLightMode: "torch" | "off" }) => Promise<void>;
};

const NATIVE_BARCODE_FORMATS = [
  "aztec",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "qr_code",
  "upc_a",
  "upc_e",
];

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

/** Switch the camera torch using either constraint shape the browser accepts. */
async function applyTrackTorch(
  track: MediaStreamTrack,
  on: boolean
): Promise<boolean> {
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    try {
      await track.applyConstraints({ torch: on } as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
}

/** Tune the native camera/ISP rather than trying to improve a blurry frame in
 * CSS. Native scanner apps use this same class of controls: continuous focus,
 * exposure and white balance, a detail-oriented stream, native zoom and torch. */
async function optimizeCameraTrack(track: MediaStreamTrack): Promise<{
  torchOn: boolean;
  nativeZoom: boolean;
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

  if (advanced.length) {
    await track.applyConstraints({ advanced }).catch(() => undefined);
  }
  // Try the native zoom independently. Some Samsung/Chromium builds support
  // the constraint but omit it from getCapabilities(); combining it with
  // focus constraints can also cause the whole request to be rejected.
  let nativeZoom = false;
  const maxZoom = typeof capabilities?.zoom === "number" ? capabilities.zoom : 2;
  const minZoom = Number(capabilities?.minZoom ?? 1);
  const targetZoom = Math.max(minZoom, Math.min(2, maxZoom));
  try {
    await track.applyConstraints({
      advanced: [{ zoom: targetZoom } as MediaTrackConstraintSet],
    });
    nativeZoom = targetZoom >= 2;
  } catch {
    nativeZoom = false;
  }
  if ("contentHint" in track) {
    (track as MediaStreamTrack & { contentHint?: string }).contentHint = "detail";
  }

  // Torch is attempted automatically for the same low-noise, high-contrast
  // conditions a native barcode scanner creates. Some browsers accept only
  // the direct form, others only the advanced form, and some Samsung builds
  // support torch without listing it in getCapabilities(), so try both
  // unconditionally instead of trusting capability reporting.
  return { torchOn: await applyTrackTorch(track, true), nativeZoom };
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
  const [decodedValue, setDecodedValue] = useState<string | null>(null);
  const [decodedFormat, setDecodedFormat] = useState<string>("CODE128");
  const [torchOn, setTorchOn] = useState(false);
  const [zoomFallback, setZoomFallback] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const watchdogRef = useRef<number | undefined>(undefined);
  const focusTimerRef = useRef<number | undefined>(undefined);
  const nativeScanFrameRef = useRef<number | undefined>(undefined);
  const torchCaptureRef = useRef<TorchCapture | null>(null);
  const torchDesiredRef = useRef(false);
  const torchRetryRef = useRef<number[]>([]);
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
    torchCaptureRef.current = null;
    torchDesiredRef.current = false;
    torchRetryRef.current.forEach((id) => window.clearTimeout(id));
    torchRetryRef.current = [];
    setZoomFallback(false);
    if (focusTimerRef.current) {
      window.clearInterval(focusTimerRef.current);
      focusTimerRef.current = undefined;
    }
    if (nativeScanFrameRef.current !== undefined) {
      window.cancelAnimationFrame(nativeScanFrameRef.current);
      nativeScanFrameRef.current = undefined;
    }
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
  function handleDecoded(code: string, format?: string) {
    const value = code.trim();
    if (!value || doneRef.current) return;
    doneRef.current = true;
    setDecodedValue(value);
    setDecodedFormat(format || "CODE128");
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
    setDecodedValue(null);
    setDecodedFormat("CODE128");
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
          // Some Samsung Chromium builds expose the light through ImageCapture
          // rather than MediaStreamTrack torch constraints.
          const ImageCaptureCtor = (
            window as unknown as {
              ImageCapture?: new (track: MediaStreamTrack) => unknown;
            }
          ).ImageCapture;
          if (ImageCaptureCtor) {
            try {
              const imageCapture = new ImageCaptureCtor(track) as TorchCapture & {
                getPhotoCapabilities?: () => Promise<{
                  fillLightMode?: string[];
                }>;
              };
              const photoCapabilities = await imageCapture.getPhotoCapabilities?.();
              if (photoCapabilities?.fillLightMode?.includes("torch")) {
                torchCaptureRef.current = imageCapture;
                await imageCapture.setOptions({ fillLightMode: "torch" });
                setTorchOn(true);
              }
            } catch {
              torchCaptureRef.current = null;
            }
          }
          const optimized = await optimizeCameraTrack(track);
          // Never clear a torch the ImageCapture path already switched on.
          setTorchOn(optimized.torchOn || torchCaptureRef.current !== null);
          setZoomFallback(!optimized.nativeZoom);
          // Re-assert continuous centre autofocus every 250ms. The browser
          // does not expose a portable focus-point API; continuous focus is
          // the supported way to keep the scan target sharp on Android.
          focusTimerRef.current = window.setInterval(() => {
            void track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            }).catch(() => undefined);
          }, 250);
        }
        if (cancelled) {
          if (focusTimerRef.current) {
            window.clearInterval(focusTimerRef.current);
            focusTimerRef.current = undefined;
          }
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
          // Prefer the browser's native detector where available. On Android
          // Chrome this can use the platform camera/ML pipeline and tends to
          // be faster and cleaner than a JavaScript decoder. ZXing remains
          // active below as the compatibility fallback.
          const NativeDetector = (
            window as typeof window & {
              BarcodeDetector?: NativeBarcodeDetectorConstructor;
            }
          ).BarcodeDetector;
          if (NativeDetector) {
            const detector = new NativeDetector({
              formats: NATIVE_BARCODE_FORMATS,
            });
            const detectNative = async () => {
              if (cancelled || doneRef.current) return;
              try {
                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                  const results = await detector.detect(video);
                  const hit = results.find((item) => item.rawValue);
                  if (hit?.rawValue) {
                    handleDecodedRef.current(
                      hit.rawValue,
                      detectorFormatName(hit.format)
                    );
                    return;
                  }
                }
              } catch {
                // Native detection is optional; ZXing continues below.
              }
              if (!cancelled && !doneRef.current) {
                nativeScanFrameRef.current = window.requestAnimationFrame(() => {
                  void detectNative();
                });
              }
            };
            void detectNative();
          }

          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromStream(
            stream,
            video,
            (result) => {
              if (doneRef.current) return;
              const text = result?.getText?.();
              if (!text) return;
              handleDecodedRef.current(
                text,
                zxingFormatFromValue(result?.getBarcodeFormat?.())
              );
            }
          );
          if (cancelled) {
            controls.stop();
            return;
          }
          controlsRef.current = controls;

          // Re-assert the torch once the preview is actually playing. Some
          // Android builds reject torch before a video element consumes the
          // stream, so retry a few times while the scanner stays open.
          torchDesiredRef.current = true;
          [0, 400, 1000].forEach((delay) => {
            const id = window.setTimeout(() => {
              if (cancelled || doneRef.current || !torchDesiredRef.current) return;
              if (torchCaptureRef.current) return;
              void applyTrackTorch(track, true).then((ok) => {
                if (ok && torchDesiredRef.current) setTorchOn(true);
              });
            }, delay);
            torchRetryRef.current.push(id);
          });

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
    torchDesiredRef.current = next;
    let switched = false;
    if (torchCaptureRef.current) {
      try {
        await torchCaptureRef.current.setOptions({
          fillLightMode: next ? "torch" : "off",
        });
        switched = true;
      } catch {
        // Some builds report fillLightMode but reject setOptions; fall back
        // to the MediaStreamTrack torch constraint below.
      }
    }
    if (!switched) {
      switched = await applyTrackTorch(track, next);
    }
    if (switched) {
      setTorchOn(next);
    } else {
      torchDesiredRef.current = torchOn;
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
          handleDecoded(text, zxingFormatFromValue(result?.getBarcodeFormat?.()));
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
        handleDecoded(text, zxingFormatFromValue(result?.getBarcodeFormat?.()));
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
          setDecodedValue(null);
          setDecodedFormat("CODE128");
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
                      className={cn("scan-video", zoomFallback && "is-zoomed")}
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
                            {view === "success" && decodedValue && (
                              <BarcodeImage
                                value={decodedValue}
                                format={toJsBarcodeFormat(decodedFormat)}
                                height={96}
                                width={2.2}
                                margin={14}
                                background="#ffffff"
                                lineColor="#000000"
                                displayValue
                                fontSize={20}
                                textMargin={8}
                                textAlign="center"
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
