import { VoiceFilterMode } from '../types';

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(console.error);
  }
  return audioCtx;
}

// ----------------- UI SOUND EFFECTS (SYNTHESIZED) -----------------
export function playUiSound(type: 'click' | 'pop' | 'unlock' | 'kick' | 'reaction') {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'pop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'unlock') {
      // 3-note mini arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C E G C
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + i * 0.08);
        g.gain.setValueAtTime(0.15, now + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.25);
      });
    } else if (type === 'reaction') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'kick') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (err) {
    console.warn('Audio playback not permitted yet:', err);
  }
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

  // Nodes for different filter modes
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-24, ctx.currentTime);
  compressor.knee.setValueAtTime(30, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.25, ctx.currentTime);

  // Filter 1: Low shelf / Lowpass for Deep Stealth
  const deepFilter = ctx.createBiquadFilter();
  deepFilter.type = 'lowpass';
  deepFilter.frequency.setValueAtTime(1100, ctx.currentTime);
  deepFilter.Q.setValueAtTime(2.0, ctx.currentTime);

  const bassBoost = ctx.createBiquadFilter();
  bassBoost.type = 'lowshelf';
  bassBoost.frequency.setValueAtTime(250, ctx.currentTime);
  bassBoost.gain.setValueAtTime(8, ctx.currentTime);

  // Filter 2: High shelf / Peaking for Helium / Soft
  const heliumFilter = ctx.createBiquadFilter();
  heliumFilter.type = 'highpass';
  heliumFilter.frequency.setValueAtTime(350, ctx.currentTime);

  const highBoost = ctx.createBiquadFilter();
  highBoost.type = 'peaking';
  highBoost.frequency.setValueAtTime(2600, ctx.currentTime);
  highBoost.gain.setValueAtTime(10, ctx.currentTime);
  highBoost.Q.setValueAtTime(1.5, ctx.currentTime);

  // Filter 3: Telephone / Vintage Lo-Fi Radio bandpass
  const radioBandpass = ctx.createBiquadFilter();
  radioBandpass.type = 'bandpass';
  radioBandpass.frequency.setValueAtTime(1800, ctx.currentTime);
  radioBandpass.Q.setValueAtTime(1.2, ctx.currentTime);

  // Waveshaper for subtle radio overdrive
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

  // Gain nodes to switch active chain
  const naturalGain = ctx.createGain();
  const deepGain = ctx.createGain();
  const heliumGain = ctx.createGain();
  const radioGain = ctx.createGain();

  // Natural Route: input -> naturalGain -> compressor
  inputNode.connect(naturalGain);
  naturalGain.connect(compressor);

  // Deep Route: input -> deepFilter -> bassBoost -> deepGain -> compressor
  inputNode.connect(deepFilter);
  deepFilter.connect(bassBoost);
  bassBoost.connect(deepGain);
  deepGain.connect(compressor);

  // Helium Route: input -> heliumFilter -> highBoost -> heliumGain -> compressor
  inputNode.connect(heliumFilter);
  heliumFilter.connect(highBoost);
  highBoost.connect(heliumGain);
  heliumGain.connect(compressor);

  // Radio Route: input -> distortion -> radioBandpass -> radioGain -> compressor
  inputNode.connect(distortion);
  distortion.connect(radioBandpass);
  radioBandpass.connect(radioGain);
  radioGain.connect(compressor);

  // Output stage: compressor -> analyser -> destination
  compressor.connect(analyser);
  compressor.connect(destination);

  // Default mode: Natural
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
      } catch (e) {
        // ignore
      }
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
    const normalized = Math.min(1, avg / 128); // 0 to 1
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

// ----------------- LOCAL AMBIENT SOUND SYNTHESIZER -----------------
export type AmbientSoundType = 'none' | 'rain' | 'cafe' | 'lofi';

class AmbientSynthesizer {
  private activeType: AmbientSoundType = 'none';
  private masterGain: GainNode | null = null;
  private nodes: (AudioNode | number)[] = [];

  public setAmbient(type: AmbientSoundType, volumePercent = 10) {
    this.stop();
    this.activeType = type;
    if (type === 'none') return;

    try {
      const ctx = getAudioContext();
      this.masterGain = ctx.createGain();
      const vol = Math.max(0.01, Math.min(0.25, volumePercent / 100));
      this.masterGain.gain.setValueAtTime(vol, ctx.currentTime);
      this.masterGain.connect(ctx.destination);

      if (type === 'rain') {
        this.startRainSynth(ctx, this.masterGain);
      } else if (type === 'cafe') {
        this.startCafeSynth(ctx, this.masterGain);
      } else if (type === 'lofi') {
        this.startLofiDroneSynth(ctx, this.masterGain);
      }
    } catch (err) {
      console.warn('Ambient audio could not start:', err);
    }
  }

  private startRainSynth(ctx: AudioContext, output: GainNode) {
    // Generate pink noise buffer for realistic rain sound
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
    // Soft vinyl crackle and distant cafe warmth
    const bufferSize = ctx.sampleRate * 1.5;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // sparse random clicks
      if (Math.random() > 0.994) {
        data[i] = (Math.random() * 2 - 1) * 0.4;
      } else {
        data[i] = (Math.random() * 2 - 1) * 0.02;
      }
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1400, ctx.currentTime);
    bandpass.Q.setValueAtTime(0.8, ctx.currentTime);

    noiseSource.connect(bandpass);
    bandpass.connect(output);
    noiseSource.start();

    this.nodes.push(noiseSource, bandpass);
  }

  private startLofiDroneSynth(ctx: AudioContext, output: GainNode) {
    // 432 Hz and sub-harmonics for soothing drone
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(216, ctx.currentTime); // A3 root

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(324, ctx.currentTime); // E4 5th interval

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
      const vol = Math.max(0.01, Math.min(0.25, volumePercent / 100));
      this.masterGain.gain.setValueAtTime(vol, audioCtx.currentTime);
    }
  }

  public stop() {
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
  }

  public getType(): AmbientSoundType {
    return this.activeType;
  }
}

export const ambientMixer = new AmbientSynthesizer();
