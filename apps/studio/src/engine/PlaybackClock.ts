import { US_PER_SEC, type Microseconds } from '@t-capcut/schema';

export type ClockListener = (timeUs: Microseconds, playing: boolean, shuttleRate: number) => void;

/**
 * Zero-ReRender 120Hz Imperative Playback Clock outside React tree.
 * Canvases & HUD refs subscribe directly to avoid React reconciliation overhead during playback.
 */
class ImperativePlaybackClock {
  private timeUs: Microseconds = 0;
  private playing = false;
  private shuttleRate = 1;
  private listeners = new Set<ClockListener>();

  getTimeUs(): Microseconds {
    return this.timeUs;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getShuttleRate(): number {
    return this.shuttleRate;
  }

  setTimeUs(us: Microseconds): void {
    this.timeUs = Math.max(0, Math.round(us));
    this.notify();
  }

  setPlaying(nextPlaying: boolean, rate = 1): void {
    this.playing = nextPlaying;
    this.shuttleRate = nextPlaying ? rate : 1;
    this.notify();
  }

  shuttle(key: 'j' | 'k' | 'l'): void {
    if (key === 'k') {
      this.setPlaying(false, 1);
      return;
    }
    if (key === 'l') {
      if (!this.playing || this.shuttleRate < 0) {
        this.setPlaying(true, 1);
      } else {
        const next = this.shuttleRate === 1 ? 2 : this.shuttleRate === 2 ? 4 : 1;
        this.setPlaying(true, next);
      }
      return;
    }
    // key === 'j'
    if (!this.playing || this.shuttleRate > 0) {
      this.setPlaying(true, -1);
    } else {
      const next = this.shuttleRate === -1 ? -2 : this.shuttleRate === -2 ? -4 : -1;
      this.setPlaying(true, next);
    }
  }

  stepFrames(deltaFrames: number, fps = 30): void {
    const stepUs = Math.round((US_PER_SEC / Math.max(1, fps)) * deltaFrames);
    this.playing = false;
    this.shuttleRate = 1;
    this.setTimeUs(Math.max(0, this.timeUs + stepUs));
  }

  subscribe(fn: ClockListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn(this.timeUs, this.playing, this.shuttleRate);
    }
  }
}

export const playbackClock = new ImperativePlaybackClock();
