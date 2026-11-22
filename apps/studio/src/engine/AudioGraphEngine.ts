import type { Clip } from '@t-capcut/schema';

interface ClipAudioNodes {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
  filter: BiquadFilterNode;
}

/**
 * Live WebAudio Mixing Engine:
 * Supports >100% Gain (0..2.0), Stereo Panning, Voice EQ Presets, Auto-Ducking, and live Stereo dBFS Metering.
 */
export class AudioGraphEngine {
  private ctx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
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
      const splitter = this.ctx.createChannelSplitter(2);
      this.analyserL = this.ctx.createAnalyser();
      this.analyserR = this.ctx.createAnalyser();
      this.analyserL.fftSize = 256;
      this.analyserR.fftSize = 256;

      this.masterGain.connect(this.ctx.destination);
      this.masterGain.connect(splitter);
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
        const filter = this.ctx.createBiquadFilter();
        const panner = this.ctx.createStereoPanner();
        const gain = this.ctx.createGain();
        source.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain);
        nodes = { source, gain, panner, filter };
        this.nodeCache.set(el, nodes);
      } catch {
        // Element may already be detached or CORS blocked
        el.muted = !audible;
        el.volume = audible ? Math.min(1, Math.max(0, clip.audio.volume * trackVolume)) : 0;
        return;
      }
    }

    // With MediaElementAudioSourceNode, HTML element output is routed cleanly through WebAudio nodes
    el.muted = false;
    el.volume = 1;

    let effVol = audible ? Math.max(0, Math.min(2.2, clip.audio.volume * trackVolume)) : 0;
    if (audible && clip.audio.fadeInUs > 0 && localUs < clip.audio.fadeInUs) {
      effVol *= localUs / clip.audio.fadeInUs;
    }
    if (audible && clip.audio.fadeOutUs > 0 && localUs > clip.durationUs - clip.audio.fadeOutUs) {
      effVol *= Math.max(0, (clip.durationUs - localUs) / clip.audio.fadeOutUs);
    }
    if (duckedByVoice && clip.audio.autoDucking) {
      effVol *= 0.25;
    }

    nodes.gain.gain.setTargetAtTime(effVol, this.ctx.currentTime, 0.015);
    nodes.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, clip.audio.pan || 0)), this.ctx.currentTime, 0.015);

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

  getStereoLevels(): { leftNorm: number; rightNorm: number; leftDb: number; rightDb: number } {
    if (!this.analyserL || !this.analyserR) {
      return { leftNorm: 0, rightNorm: 0, leftDb: -60, rightDb: -60 };
    }
    this.analyserL.getFloatTimeDomainData(this.floatBufL);
    this.analyserR.getFloatTimeDomainData(this.floatBufR);
    let maxL = 0;
    let maxR = 0;
    for (let i = 0; i < this.floatBufL.length; i++) {
      const aL = Math.abs(this.floatBufL[i]);
      const aR = Math.abs(this.floatBufR[i]);
      if (aL > maxL) maxL = aL;
      if (aR > maxR) maxR = aR;
    }
    const dbL = maxL > 1e-4 ? Math.max(-60, Math.round(20 * Math.log10(maxL))) : -60;
    const dbR = maxR > 1e-4 ? Math.max(-60, Math.round(20 * Math.log10(maxR))) : -60;
    return {
      leftNorm: Math.min(1, (dbL + 60) / 60),
      rightNorm: Math.min(1, (dbR + 60) / 60),
      leftDb: dbL,
      rightDb: dbR,
    };
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
