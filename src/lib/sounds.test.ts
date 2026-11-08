// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

function installAudioMock() {
  const osc = {
    type: "",
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  class FakeAudioContext {
    state: AudioContextState = "suspended";
    currentTime = 1;
    destination = {} as AudioDestinationNode;
    resume = vi.fn(async () => undefined);
    createOscillator = () => osc;
    createGain = () => gain;
  }

  const instances: FakeAudioContext[] = [];
  class TrackedAudioContext extends FakeAudioContext {
    constructor() {
      super();
      instances.push(this);
    }
  }

  (window as unknown as { AudioContext: unknown }).AudioContext =
    TrackedAudioContext;

  return {
    get ctx() {
      return instances[instances.length - 1];
    },
    osc,
    gain,
  };
}

/** Fresh module per test so the cached AudioContext does not leak. */
async function loadSounds() {
  vi.resetModules();
  return import("./sounds");
}

afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("scanner beep", () => {
  it("plays one short 2.9 kHz confirmation tone immediately", async () => {
    const { osc, gain } = installAudioMock();
    const { playScanBeep } = await loadSounds();
    playScanBeep();

    expect(osc.type).toBe("square");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(2900, 1);
    expect(osc.frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();
    // Full level from the first frame: no attack silence before the beep.
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.16, 1);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.stop).toHaveBeenCalledTimes(1);

    // Simulate the oscillator finishing: nodes are released.
    osc.onended?.();
    expect(osc.disconnect).toHaveBeenCalled();
    expect(gain.disconnect).toHaveBeenCalled();
  });

  it("is a safe no-op when Web Audio is unavailable", async () => {
    const { playScanBeep, primeScanAudio } = await loadSounds();
    expect(() => playScanBeep()).not.toThrow();
    expect(() => primeScanAudio()).not.toThrow();
  });

  it("resumes a suspended context when primed", async () => {
    const audio = installAudioMock();
    const { primeScanAudio } = await loadSounds();
    primeScanAudio();
    expect(audio.ctx.resume).toHaveBeenCalled();
  });
});
