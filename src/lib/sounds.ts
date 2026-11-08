/**
 * Short supermarket-style scanner confirmation beep.
 *
 * Synthesised with the Web Audio API so there is no asset to download and it
 * works offline. The AudioContext is created/resumed on the scanner button
 * click (a user gesture), which is required by mobile browsers; the beep then
 * plays when a code is actually accepted.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Call from a click handler so the context is unlocked before a scan. */
export function primeScanAudio(): void {
  const audio = getCtx();
  if (audio && audio.state === "suspended") {
    void audio.resume().catch(() => undefined);
  }
}

/** Play the confirmation beep for an accepted barcode. */
export function playScanBeep(): void {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") {
    void audio.resume().catch(() => undefined);
  }

  try {
    // Schedule at the current time so the beep is as close to the decode
    // as the audio clock allows (no leading silence).
    const start = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    // Supermarket checkout beep: a steady ~2.9 kHz square tone with a very
    // fast attack and a clean 100 ms decay. This is the sharp "beep" most
    // POS scanners emit, rather than a musical chirp.
    osc.type = "square";
    osc.frequency.setValueAtTime(2900, start);
    gain.gain.setValueAtTime(0.16, start);
    gain.gain.setValueAtTime(0.16, start + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.105);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    // Audio is a nicety — never block the scan result.
  }
}
