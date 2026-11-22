import { getClipPropertyAtTime, type Clip } from '@t-capcut/schema';

interface ClipAudioNodes {
  source: MediaElementAudioSourceNode;
  eqBands: BiquadFilterNode[];
  filter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  panner: StereoPannerNode;
  gain: GainNode;
}

const EQ_FREQS = [80, 250, 1000, 4000, 12000];

/**
 * Live Studio WebAudio Mixing Engine:
 * 5-Band Parametric EQ, Compressor/Limiter, Master Limiter, >100% Gain + Keyframe Envelope,
 * Stereo Panning, Auto-Ducking, and live Stereo dBFS + LUFS Metering.
 */
export class AudioGraphEngine {
  private ctx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private nodeCache = new WeakMap<HTMLMediaElement, ClipAudioNodes>();
  private floatBufL = new Float32Array(256);
  private floatBufR = new Float32Array(256);

  ensureReady(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterLimiter = this.ctx.createDynamicsCompressor();
      this.masterLimiter.threshold.value = -2;
      this.masterLimiter.knee.value = 4;
      this.masterLimiter.ratio.value = 12;
      this.masterLimiter.attack.value = 0.002;
      this.masterLimiter.release.value = 0.08;

      const splitter = this.ctx.createChannelSplitter(2);
      this.analyserL = this.ctx.createAnalyser();
      this.analyserR = this.ctx.createAnalyser();
      this.analyserL.fftSize = 256;
      this.analyserR.fftSize = 256;

      this.masterGain.connect(this.masterLimiter);
      this.masterLimiter.connect(this.ctx.destination);
      this.masterLimiter.connect(splitter);
      splitter.connect(this.analyserL, 0);
      splitter.connect(this.analyserR, 1);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return true;
  }

  attachAndSyncClip(
    el: HTMLMediaElement,
    clip: Clip,
    localUs: number,
    audible: boolean,
    trackVolume: number,
    duckedByVoice: boolean
  ): void {
    if (!this.ctx || !this.masterGain) {
      el.muted = !audible;
      el.volume = audible ? Math.min(1, Math.max(0, clip.audio.volume * trackVolume)) : 0;
      return;
    }

    let nodes = this.nodeCache.get(el);
    if (!nodes) {
      try {
        const source = this.ctx.createMediaElementSource(el);
        const eqBands = EQ_FREQS.map((freq, idx) => {
          const b = this.ctx!.createBiquadFilter();
          b.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
          b.frequency.value = freq;
          b.Q.value = 1.2;
          b.gain.value = 0;
          return b;
        });
        const filter = this.ctx.createBiquadFilter();
        const compressor = this.ctx.createDynamicsCompressor();
        const panner = this.ctx.createStereoPanner();
        const gain = this.ctx.createGain();

        let prev: AudioNode = source;
        for (const band of eqBands) {
          prev.connect(band);
          prev = band;
        }
        prev.connect(filter);
        filter.connect(compressor);
        compressor.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain);

        nodes = { source, eqBands, filter, compressor, panner, gain };
        this.nodeCache.set(el, nodes);
      } catch {
        el.muted = !audible;
        el.volume = audible ? Math.min(1, Math.max(0, clip.audio.volume * trackVolume)) : 0;
        return;
      }
    }

    el.muted = false;
    el.volume = 1;

    // Semitone Pitch Preview support when preservesPitch is toggled off cleanly
    if (clip.audio.pitchSemitones && Math.abs(clip.audio.pitchSemitones) > 0.1) {
      (el as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = false;
    } else {
      (el as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;
    }

    const baseVol = getClipPropertyAtTime(clip, 'volume', localUs);
    let effVol = audible ? Math.max(0, Math.min(2.2, baseVol * trackVolume)) : 0;
    if (audible && clip.audio.fadeInUs > 0 && localUs < clip.audio.fadeInUs) {
      effVol *= localUs / clip.audio.fadeInUs;
    }
    if (audible && clip.audio.fadeOutUs > 0 && localUs > clip.durationUs - clip.audio.fadeOutUs) {
      effVol *= Math.max(0, (clip.durationUs - localUs) / clip.audio.fadeOutUs);
    }
    if (duckedByVoice && clip.audio.autoDucking) {
      effVol *= 0.25;
    }

    const now = this.ctx.currentTime;
    nodes.gain.gain.setTargetAtTime(effVol, now, 0.015);
    nodes.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, clip.audio.pan || 0)), now, 0.015);

    const bands = clip.audio.eqBands ?? [0, 0, 0, 0, 0];
    nodes.eqBands.forEach((b, i) => {
      b.gain.setTargetAtTime(bands[i] ?? 0, now, 0.02);
    });

    if (clip.audio.compressorEnabled) {
      nodes.compressor.threshold.setTargetAtTime(-18, now, 0.02);
      nodes.compressor.ratio.setTargetAtTime(3.5, now, 0.02);
    } else {
      nodes.compressor.threshold.setTargetAtTime(0, now, 0.02);
      nodes.compressor.ratio.setTargetAtTime(1, now, 0.02);
    }

    const vp = clip.audio.voicePreset;
    if (vp === 'podcast') {
      nodes.filter.type = 'lowshelf';
      nodes.filter.frequency.value = 180;
      nodes.filter.gain.value = 5;
    } else if (vp === 'megaphone') {
      nodes.filter.type = 'bandpass';
      nodes.filter.frequency.value = 1400;
      nodes.filter.Q.value = 1.6;
    } else if (vp === 'deep') {
      nodes.filter.type = 'lowpass';
      nodes.filter.frequency.value = 900;
    } else if (vp === 'chipmunk' || vp === 'robot') {
      nodes.filter.type = 'highpass';
      nodes.filter.frequency.value = 520;
    } else {
      nodes.filter.type = 'allpass';
      nodes.filter.frequency.value = 1000;
    }
  }

  getStereoLevels(): { leftNorm: number; rightNorm: number; leftDb: number; rightDb: number; lufs: number } {
    if (!this.analyserL || !this.analyserR) {
      return { leftNorm: 0, rightNorm: 0, leftDb: -60, rightDb: -60, lufs: -60 };
    }
    this.analyserL.getFloatTimeDomainData(this.floatBufL);
    this.analyserR.getFloatTimeDomainData(this.floatBufR);
    let maxL = 0;
    let maxR = 0;
    let sqSum = 0;
    for (let i = 0; i < this.floatBufL.length; i++) {
      const sL = this.floatBufL[i];
      const sR = this.floatBufR[i];
      const aL = Math.abs(sL);
      const aR = Math.abs(sR);
      if (aL > maxL) maxL = aL;
      if (aR > maxR) maxR = aR;
      sqSum += sL * sL + sR * sR;
    }
    const rms = Math.sqrt(sqSum / Math.max(1, this.floatBufL.length * 2));
    const dbL = maxL > 1e-4 ? Math.max(-60, Math.round(20 * Math.log10(maxL))) : -60;
    const dbR = maxR > 1e-4 ? Math.max(-60, Math.round(20 * Math.log10(maxR))) : -60;
    const lufs = rms > 1e-4 ? Math.max(-60, Number((20 * Math.log10(rms) - 0.7).toFixed(1))) : -60;
    return {
      leftNorm: Math.min(1, (dbL + 60) / 60),
      rightNorm: Math.min(1, (dbR + 60) / 60),
      leftDb: dbL,
      rightDb: dbR,
      lufs,
    };
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
