import { VoiceFilterMode } from '../types';

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Global user gesture unlocker for Mobile & Desktop browsers
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

// ----------------- UI SOUND EFFECTS (SYNTHESIZED) -----------------
export function playUiSound(type: 'click' | 'pop' | 'unlock' | 'kick' | 'reaction' | 'chime') {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'click') {
      // Crisp snappy neo-brutalist click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.035);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === 'pop') {
      // Bubbly pop for pills & buttons
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.07);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'unlock') {
      // Harmonic 4-note celebration arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + i * 0.07);
        g.gain.setValueAtTime(0.16, now + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.28);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + i * 0.07);
        o.stop(now + i * 0.07 + 0.28);
      });
    } else if (type === 'chime') {
      // Pleasant dual tone chime
      [880, 1318.5].forEach((freq) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now);
        o.stop(now + 0.35);
      });
    } else if (type === 'reaction') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(1300, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'kick') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.22);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  } catch {
    // Graceful silent fallback
  }
}

// ----------------- SOUNDBOARD DJ EFFECTS -----------------
export function playDjSound(type: 'airhorn' | 'applause' | 'laugh' | 'drumroll' | 'crickets' | 'tadaa') {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    if (type === 'airhorn') {
      const blasts = [0, 0.15, 0.3];
      blasts.forEach((offset) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';

        osc1.frequency.setValueAtTime(587.33, now + offset);
        osc1.frequency.exponentialRampToValueAtTime(560, now + offset + 0.13);

        osc2.frequency.setValueAtTime(440, now + offset);
        osc2.frequency.exponentialRampToValueAtTime(420, now + offset + 0.13);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2800, now + offset);

        gain.gain.setValueAtTime(0.2, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now + offset);
        osc2.start(now + offset);
        osc1.stop(now + offset + 0.13);
        osc2.stop(now + offset + 0.13);
      });
    } else if (type === 'applause') {
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (Math.random() > 0.985 ? 0.8 : 0.12);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(0.8, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 2.0);
    } else if (type === 'laugh') {
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = now + i * 0.13;
        const baseFreq = 420 - i * 15;
        osc.frequency.setValueAtTime(baseFreq, start);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, start + 0.11);

        gain.gain.setValueAtTime(0.16, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.11);
      }
    } else if (type === 'drumroll') {
      for (let i = 0; i < 16; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.055;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160 + (i % 2) * 20, start);
        gain.gain.setValueAtTime(0.08 + (i / 16) * 0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.045);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.045);
      }
      const crashStart = now + 0.95;
      const bufferSize = ctx.sampleRate * 1.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const crash = ctx.createBufferSource();
      crash.buffer = noiseBuffer;
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(4000, crashStart);
      const crashGain = ctx.createGain();
      crashGain.gain.setValueAtTime(0.2, crashStart);
      crashGain.gain.exponentialRampToValueAtTime(0.001, crashStart + 1.2);

      crash.connect(highpass);
      highpass.connect(crashGain);
      crashGain.connect(ctx.destination);
      crash.start(crashStart);
      crash.stop(crashStart + 1.2);
    } else if (type === 'crickets') {
      [0, 0.08, 0.4, 0.48].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(4500, now + offset);
        gain.gain.setValueAtTime(0.09, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.06);
      });
    } else if (type === 'tadaa') {
      const fanfare = [
        { f: 523.25, d: 0.12 },
        { f: 659.25, d: 0.12 },
        { f: 783.99, d: 0.12 },
        { f: 1046.5, d: 0.55 },
      ];
      let t = now;
      fanfare.forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.f, t);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + n.d);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + n.d);
        t += n.d * 0.75;
      });
    }
  } catch {}
}

export function createSilentAudioStream(): MediaStream {
  const ctx = getAudioContext();
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  osc.connect(gain);
  gain.connect(dest);
  osc.start();
  return dest.stream;
}

// ----------------- VOICE FILTER ENGINE -----------------
export interface VoiceFilterPipeline {
  inputNode: MediaStreamAudioSourceNode;
  outputStream: MediaStream;
  destination: MediaStreamAudioDestinationNode;
  analyser: AnalyserNode;
  setMode: (mode: VoiceFilterMode) => void;
  cleanup: () => void;
}

export function createVoiceFilterPipeline(rawStream: MediaStream): VoiceFilterPipeline {
  const ctx = getAudioContext();
  const inputNode = ctx.createMediaStreamSource(rawStream);
  const destination = ctx.createMediaStreamDestination();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;

  // Compressor
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-24, ctx.currentTime);
  compressor.knee.setValueAtTime(30, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.25, ctx.currentTime);

  // Deep Stealth
  const deepFilter = ctx.createBiquadFilter();
  deepFilter.type = 'lowpass';
  deepFilter.frequency.setValueAtTime(1100, ctx.currentTime);
  deepFilter.Q.setValueAtTime(2.0, ctx.currentTime);

  const bassBoost = ctx.createBiquadFilter();
  bassBoost.type = 'lowshelf';
  bassBoost.frequency.setValueAtTime(250, ctx.currentTime);
  bassBoost.gain.setValueAtTime(8, ctx.currentTime);

  // Helium
  const heliumFilter = ctx.createBiquadFilter();
  heliumFilter.type = 'highpass';
  heliumFilter.frequency.setValueAtTime(350, ctx.currentTime);

  const highBoost = ctx.createBiquadFilter();
  highBoost.type = 'peaking';
  highBoost.frequency.setValueAtTime(2600, ctx.currentTime);
  highBoost.gain.setValueAtTime(10, ctx.currentTime);
  highBoost.Q.setValueAtTime(1.5, ctx.currentTime);

  // Radio Bandpass
  const radioBandpass = ctx.createBiquadFilter();
  radioBandpass.type = 'bandpass';
  radioBandpass.frequency.setValueAtTime(1800, ctx.currentTime);
  radioBandpass.Q.setValueAtTime(1.2, ctx.currentTime);

  // Distortion waveshaper
  const distortion = ctx.createWaveShaper();
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  const k = 15;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  distortion.curve = curve;
  distortion.oversample = '4x';

  const naturalGain = ctx.createGain();
  const deepGain = ctx.createGain();
  const heliumGain = ctx.createGain();
  const radioGain = ctx.createGain();

  inputNode.connect(naturalGain);
  naturalGain.connect(compressor);

  inputNode.connect(deepFilter);
  deepFilter.connect(bassBoost);
  bassBoost.connect(deepGain);
  deepGain.connect(compressor);

  inputNode.connect(heliumFilter);
  heliumFilter.connect(highBoost);
  highBoost.connect(heliumGain);
  heliumGain.connect(compressor);

  inputNode.connect(distortion);
  distortion.connect(radioBandpass);
  radioBandpass.connect(radioGain);
  radioGain.connect(compressor);

  compressor.connect(analyser);
  compressor.connect(destination);

  function setMode(mode: VoiceFilterMode) {
    const now = ctx.currentTime;
    naturalGain.gain.setValueAtTime(mode === 'natural' ? 1 : 0, now);
    deepGain.gain.setValueAtTime(mode === 'deep' ? 1.4 : 0, now);
    heliumGain.gain.setValueAtTime(mode === 'helium' ? 1.3 : 0, now);
    radioGain.gain.setValueAtTime(mode === 'radio' ? 0.9 : 0, now);
  }

  setMode('natural');

  return {
    inputNode,
    destination,
    outputStream: destination.stream,
    analyser,
    setMode,
    cleanup: () => {
      try {
        inputNode.disconnect();
        naturalGain.disconnect();
        deepGain.disconnect();
        heliumGain.disconnect();
        radioGain.disconnect();
        compressor.disconnect();
        analyser.disconnect();
      } catch {}
    },
  };
}

// ----------------- SPEAKING LEVEL ANALYSER -----------------
export function createVolumeMeter(stream: MediaStream, onVolume: (level: number, isSpeaking: boolean) => void) {
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let animationId: number;

  const check = () => {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const avg = sum / bufferLength;
    const normalized = Math.min(1, avg / 128);
    const isSpeaking = normalized > 0.12;

    onVolume(normalized, isSpeaking);
    animationId = requestAnimationFrame(check);
  };

  animationId = requestAnimationFrame(check);

  return () => {
    cancelAnimationFrame(animationId);
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {}
  };
}

// ----------------- GLOBAL BACKGROUND AMBIENT & LO-FI SYNTHESIZER -----------------
export type AmbientSoundType = 'none' | 'lofi_beats' | 'rain' | 'cafe' | 'lofi';

class AmbientSynthesizer {
  private activeType: AmbientSoundType = 'none';
  private masterGain: GainNode | null = null;
  private nodes: (AudioNode | number)[] = [];
  private loopTimer: any = null;

  public setAmbient(type: AmbientSoundType, volumePercent = 14) {
    this.stop();
    this.activeType = type;
    if (type === 'none') {
      this.notifyState();
      return;
    }

    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      this.masterGain = ctx.createGain();
      const vol = Math.max(0.01, Math.min(0.3, volumePercent / 100));
      this.masterGain.gain.setValueAtTime(vol, ctx.currentTime);
      this.masterGain.connect(ctx.destination);

      if (type === 'lofi_beats') {
        this.startLofiBeatsProgression(ctx, this.masterGain);
      } else if (type === 'rain') {
        this.startRainSynth(ctx, this.masterGain);
      } else if (type === 'cafe') {
        this.startCafeSynth(ctx, this.masterGain);
      } else if (type === 'lofi') {
        this.startLofiDroneSynth(ctx, this.masterGain);
      }

      this.notifyState();
    } catch (err) {
      console.warn('Ambient audio could not start:', err);
    }
  }

  // Generative Lo-Fi Jazzy Chord Progression
  private startLofiBeatsProgression(ctx: AudioContext, output: GainNode) {
    // Add soft vinyl texture first
    this.startCafeCrackleBed(ctx, output);

    // Warm Rhodes style chords (Fmaj7 -> Em7 -> Dm7 -> Cmaj7)
    const chordProgressions = [
      [349.23, 440.00, 523.25, 659.25], // Fmaj7
      [329.63, 392.00, 493.88, 587.33], // Em7
      [293.66, 349.23, 440.00, 523.25], // Dm7
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
    ];

    let chordIndex = 0;
    const playNextChord = () => {
      if (this.activeType !== 'lofi_beats' || !this.masterGain) return;
      const now = ctx.currentTime;
      const chord = chordProgressions[chordIndex % chordProgressions.length];
      chordIndex++;

      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(950, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(output);

        osc.start(now);
        osc.stop(now + 3.8);
        this.nodes.push(osc, filter, gain);
      });

      this.loopTimer = setTimeout(playNextChord, 3800);
    };

    playNextChord();
  }

  private startCafeCrackleBed(ctx: AudioContext, output: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      if (Math.random() > 0.996) {
        data[i] = (Math.random() * 2 - 1) * 0.25;
      } else {
        data[i] = (Math.random() * 2 - 1) * 0.015;
      }
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, ctx.currentTime);
    filter.Q.setValueAtTime(0.8, ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(output);
    noiseSource.start();
    this.nodes.push(noiseSource, filter);
  }

  private startRainSynth(ctx: AudioContext, output: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const outputData = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      outputData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(850, ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(output);
    whiteNoise.start();

    this.nodes.push(whiteNoise, filter);
  }

  private startCafeSynth(ctx: AudioContext, output: GainNode) {
    this.startCafeCrackleBed(ctx, output);
  }

  private startLofiDroneSynth(ctx: AudioContext, output: GainNode) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(216, ctx.currentTime); // A3

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(324, ctx.currentTime); // E4

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, ctx.currentTime);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);

    osc1.connect(gain1);
    osc2.connect(gain1);
    gain1.connect(filter);
    filter.connect(output);

    osc1.start();
    osc2.start();

    this.nodes.push(osc1, osc2, filter, gain1);
  }

  public setVolume(volumePercent: number) {
    if (this.masterGain && audioCtx) {
      const vol = Math.max(0.01, Math.min(0.3, volumePercent / 100));
      this.masterGain.gain.setValueAtTime(vol, audioCtx.currentTime);
    }
  }

  public stop() {
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.nodes.forEach((node) => {
      if (typeof node === 'object' && 'stop' in node && typeof (node as any).stop === 'function') {
        try {
          (node as any).stop();
        } catch {}
      }
      if (typeof node === 'object' && 'disconnect' in node) {
        try {
          node.disconnect();
        } catch {}
      }
    });
    this.nodes = [];
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {}
      this.masterGain = null;
    }
    this.activeType = 'none';
    this.notifyState();
  }

  public getType(): AmbientSoundType {
    return this.activeType;
  }

  private notifyState() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('friendsclub-ambient-change', {
          detail: { type: this.activeType },
        })
      );
    }
  }
}

export const ambientMixer = new AmbientSynthesizer();
