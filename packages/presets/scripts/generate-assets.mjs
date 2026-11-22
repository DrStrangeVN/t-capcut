import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../assets');
const LUTS_DIR = path.join(ASSETS_DIR, 'luts');
const AUDIO_DIR = path.join(ASSETS_DIR, 'audio');
const FORCE = process.argv.includes('--force');

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function sCurve(x, strength) {
  const centered = x - 0.5;
  const curved = 0.5 + (Math.tanh(centered * strength) / Math.tanh(0.5 * strength)) * 0.5;
  return clamp01(curved);
}

function adjustSaturation(r, g, b, sat) {
  const l = luma(r, g, b);
  return [clamp01(l + (r - l) * sat), clamp01(l + (g - l) * sat), clamp01(l + (b - l) * sat)];
}

function splitTone(r, g, b, shTint, hiTint, balance = 0.5) {
  const l = luma(r, g, b);
  const shMask = Math.pow(clamp01(1 - l / Math.max(0.15, balance)), 1.6);
  const hiMask = Math.pow(clamp01((l - balance * 0.6) / (1 - balance * 0.6)), 1.6);
  return [
    clamp01(r + shTint[0] * shMask + hiTint[0] * hiMask),
    clamp01(g + shTint[1] * shMask + hiTint[1] * hiMask),
    clamp01(b + shTint[2] * shMask + hiTint[2] * hiMask),
  ];
}

function logDecode(x, lift = 0.09, gamma = 0.45, contrast = 3.2) {
  const lin = Math.pow(clamp01((x - lift) / (1 - lift * 0.7)), 1 / Math.max(0.25, gamma + 0.55));
  return sCurve(lin, contrast);
}

const LUT_TRANSFORMS = {
  lut_kodak_2383: (r, g, b) => {
    [r, g, b] = [sCurve(r, 3.1), sCurve(g, 3.1), sCurve(b, 3.1)];
    [r, g, b] = adjustSaturation(r, g, b, 1.12);
    return splitTone(r, g, b, [-0.04, 0.015, 0.06], [0.06, 0.025, -0.04], 0.52);
  },
  lut_fuji_eterna: (r, g, b) => {
    [r, g, b] = [mix(0.03, 0.96, sCurve(r, 2.1)), mix(0.035, 0.96, sCurve(g, 2.2)), mix(0.03, 0.95, sCurve(b, 2.1))];
    [r, g, b] = adjustSaturation(r, g, b, 0.9);
    return splitTone(r, g, b, [-0.02, 0.03, 0.025], [0.035, 0.02, -0.015], 0.5);
  },
  lut_cinestill_800t: (r, g, b) => {
    [r, g, b] = [sCurve(r, 2.9), sCurve(g, 2.8), sCurve(b, 2.8)];
    [r, g, b] = adjustSaturation(r, g, b, 1.08);
    return splitTone(r, g, b, [-0.08, 0.01, 0.11], [0.09, 0.015, -0.05], 0.55);
  },
  lut_teal_orange: (r, g, b) => {
    [r, g, b] = [sCurve(r, 2.7), sCurve(g, 2.6), sCurve(b, 2.7)];
    [r, g, b] = adjustSaturation(r, g, b, 1.16);
    return splitTone(r, g, b, [-0.08, 0.045, 0.085], [0.1, 0.03, -0.075], 0.5);
  },
  lut_apple_log: (r, g, b) => {
    [r, g, b] = [logDecode(r, 0.085, 0.45, 2.9), logDecode(g, 0.085, 0.45, 2.9), logDecode(b, 0.085, 0.45, 2.9)];
    return adjustSaturation(r, g, b, 1.32);
  },
  lut_sony_slog3: (r, g, b) => {
    [r, g, b] = [logDecode(r, 0.095, 0.42, 3.2), logDecode(g, 0.095, 0.42, 3.2), logDecode(b, 0.095, 0.42, 3.2)];
    [r, g, b] = adjustSaturation(r, g, b, 1.38);
    return splitTone(r, g, b, [-0.01, 0.0, 0.02], [0.02, 0.01, -0.01], 0.5);
  },
  lut_dji_dlogm: (r, g, b) => {
    [r, g, b] = [logDecode(r, 0.06, 0.48, 2.7), logDecode(g, 0.06, 0.48, 2.7), logDecode(b, 0.06, 0.48, 2.7)];
    return adjustSaturation(r, g, b, 1.26);
  },
  lut_seoul_pastel: (r, g, b) => {
    [r, g, b] = [Math.pow(r, 0.88), Math.pow(g, 0.89), Math.pow(b, 0.88)];
    [r, g, b] = [mix(0.05, 0.99, r), mix(0.045, 0.99, g), mix(0.06, 0.99, b)];
    [r, g, b] = adjustSaturation(r, g, b, 0.92);
    return splitTone(r, g, b, [0.02, 0.01, 0.04], [0.04, 0.015, 0.03], 0.55);
  },
  lut_golden_hour: (r, g, b) => {
    [r, g, b] = [sCurve(r, 2.3), sCurve(g, 2.3), sCurve(b, 2.2)];
    [r, g, b] = adjustSaturation(r, g, b, 1.15);
    return splitTone(r, g, b, [0.04, 0.01, -0.03], [0.12, 0.06, -0.08], 0.45);
  },
  lut_food_vibrant: (r, g, b) => {
    [r, g, b] = [sCurve(r, 2.6), sCurve(g, 2.6), sCurve(b, 2.5)];
    [r, g, b] = adjustSaturation(r, g, b, 1.28);
    return [clamp01(r * 1.04 + 0.01), clamp01(g * 1.02), clamp01(b * 0.96)];
  },
  lut_skin_glow: (r, g, b) => {
    [r, g, b] = [Math.pow(r, 0.9), Math.pow(g, 0.92), Math.pow(b, 0.93)];
    [r, g, b] = adjustSaturation(r, g, b, 1.04);
    return splitTone(r, g, b, [0.015, 0.0, 0.01], [0.05, 0.025, 0.015], 0.5);
  },
  lut_minimal_bright: (r, g, b) => {
    [r, g, b] = [Math.pow(sCurve(r, 2.1), 0.92), Math.pow(sCurve(g, 2.1), 0.92), Math.pow(sCurve(b, 2.1), 0.92)];
    [r, g, b] = adjustSaturation(r, g, b, 0.96);
    return [clamp01(mix(0.02, 1.0, r)), clamp01(mix(0.025, 1.0, g)), clamp01(mix(0.03, 1.0, b))];
  },
  lut_tokyo_cyber: (r, g, b) => {
    [r, g, b] = [sCurve(r, 3.0), sCurve(g, 2.9), sCurve(b, 3.0)];
    [r, g, b] = adjustSaturation(r, g, b, 1.22);
    return splitTone(r, g, b, [-0.06, 0.03, 0.11], [0.11, -0.04, 0.09], 0.5);
  },
  lut_nordic_cold: (r, g, b) => {
    [r, g, b] = [sCurve(r, 2.5), sCurve(g, 2.5), sCurve(b, 2.5)];
    [r, g, b] = adjustSaturation(r, g, b, 0.72);
    return splitTone(r, g, b, [-0.04, 0.01, 0.07], [-0.02, 0.02, 0.06], 0.5);
  },
  lut_dark_forest: (r, g, b) => {
    [r, g, b] = [sCurve(Math.pow(r, 1.08), 3.0), sCurve(Math.pow(g, 1.04), 3.0), sCurve(Math.pow(b, 1.12), 3.0)];
    [r, g, b] = adjustSaturation(r, g, b, 0.85);
    return splitTone(r, g, b, [-0.03, 0.045, -0.01], [0.02, 0.025, -0.02], 0.55);
  },
  lut_leica_bw: (r, g, b) => {
    const gray = sCurve(0.28 * r + 0.62 * g + 0.1 * b, 3.4);
    return [gray, gray, gray];
  },
};

async function generateLuts() {
  await fs.mkdir(LUTS_DIR, { recursive: true });
  const size = 17;
  let generated = 0;

  for (const [id, fn] of Object.entries(LUT_TRANSFORMS)) {
    const outPath = path.join(LUTS_DIR, `${id}.cube`);
    if (!FORCE) {
      try {
        const st = await fs.stat(outPath);
        if (st.size > 1024) continue;
      } catch {
        // generate below
      }
    }

    const lines = [
      `TITLE "${id}"`,
      `LUT_3D_SIZE ${size}`,
      'DOMAIN_MIN 0.0 0.0 0.0',
      'DOMAIN_MAX 1.0 1.0 1.0',
      '',
    ];

    for (let bi = 0; bi < size; bi++) {
      const b = bi / (size - 1);
      for (let gi = 0; gi < size; gi++) {
        const g = gi / (size - 1);
        for (let ri = 0; ri < size; ri++) {
          const r = ri / (size - 1);
          const [or, og, ob] = fn(r, g, b);
          lines.push(`${clamp01(or).toFixed(6)} ${clamp01(og).toFixed(6)} ${clamp01(ob).toFixed(6)}`);
        }
      }
    }

    await fs.writeFile(outPath, `${lines.join('\n')}\n`, 'utf-8');
    generated += 1;
  }

  console.log(`[assets] LUTs ready (${generated} newly generated, ${Object.keys(LUT_TRANSFORMS).length} total)`);
}

// Deterministic PRNG for noise & textures
function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

const SR = 44100;

function writeWavBuffer(left, right) {
  const len = left.length;
  const buf = Buffer.alloc(44 + len * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + len * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(len * 4, 40);

  let peak = 0.0001;
  for (let i = 0; i < len; i++) {
    const al = Math.abs(left[i]);
    const ar = Math.abs(right[i]);
    if (al > peak) peak = al;
    if (ar > peak) peak = ar;
  }
  const scale = peak > 0.9 ? 0.9 / peak : 1.0;

  for (let i = 0; i < len; i++) {
    const l = Math.max(-1, Math.min(1, left[i] * scale));
    const r = Math.max(-1, Math.min(1, right[i] * scale));
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  return buf;
}

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const MUSIC_SPECS = [
  { id: 'mus_lofi_midnight', bpm: 84, dur: 20, style: 'lofi', chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64]] },
  { id: 'mus_lofi_rainy', bpm: 78, dur: 20, style: 'lofi', chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 65], [55, 59, 62, 65]] },
  { id: 'mus_lofi_sunset', bpm: 90, dur: 20, style: 'lofi', chords: [[58, 62, 65, 69], [55, 58, 62, 65], [53, 57, 60, 64], [56, 60, 63, 67]] },
  { id: 'mus_beat_tiktok128', bpm: 128, dur: 16, style: 'edm', chords: [[45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62], [40, 52, 55, 60]] },
  { id: 'mus_beat_drift135', bpm: 135, dur: 16, style: 'phonk', chords: [[40, 52, 55, 59], [40, 52, 56, 60], [38, 50, 53, 57], [41, 53, 56, 60]] },
  { id: 'mus_beat_cyber120', bpm: 120, dur: 16, style: 'edm', chords: [[48, 60, 63, 67], [44, 56, 60, 63], [46, 58, 62, 65], [43, 55, 58, 62]] },
  { id: 'mus_vlog_morning', bpm: 104, dur: 18, style: 'acoustic', chords: [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]] },
  { id: 'mus_vlog_coastal', bpm: 110, dur: 18, style: 'acoustic', chords: [[62, 66, 69, 74], [57, 61, 64, 69], [59, 62, 66, 71], [55, 59, 62, 67]] },
  { id: 'mus_vlog_coffee', bpm: 96, dur: 18, style: 'acoustic', chords: [[65, 69, 72, 76], [60, 64, 67, 72], [62, 65, 69, 72], [58, 62, 65, 69]] },
  { id: 'mus_cine_horizon', bpm: 72, dur: 20, style: 'cinematic', chords: [[48, 55, 60, 67], [44, 51, 56, 63], [46, 53, 58, 65], [43, 50, 55, 62]] },
  { id: 'mus_cine_piano', bpm: 76, dur: 20, style: 'piano', chords: [[57, 64, 69, 72], [53, 60, 65, 69], [48, 55, 60, 64], [55, 62, 67, 71]] },
  { id: 'mus_cine_epic', bpm: 100, dur: 18, style: 'cinematic', chords: [[45, 52, 57, 64], [41, 48, 53, 60], [43, 50, 55, 62], [40, 47, 52, 59]] },
  { id: 'mus_tech_review', bpm: 112, dur: 18, style: 'tech', chords: [[57, 60, 64, 69], [53, 57, 60, 65], [60, 64, 67, 72], [55, 59, 62, 67]] },
  { id: 'mus_tech_studio', bpm: 92, dur: 20, style: 'tech', chords: [[60, 64, 67, 71], [57, 60, 64, 67], [55, 59, 62, 67], [53, 57, 60, 64]] },
  { id: 'mus_pop_flash', bpm: 122, dur: 16, style: 'edm', chords: [[55, 59, 62, 67], [53, 57, 60, 65], [60, 64, 67, 72], [57, 60, 64, 69]] },
];

function synthesizeMusic(spec, seed) {
  const n = Math.round(spec.dur * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rng = makeRng(seed);
  const beatDur = 60 / spec.bpm;

  let lpNoise = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const beatPos = t / beatDur;
    const beatIdx = Math.floor(beatPos);
    const beatFrac = beatPos - beatIdx;
    const bt = beatFrac * beatDur;
    const barIdx = Math.floor(beatIdx / 4);
    const chord = spec.chords[barIdx % spec.chords.length];
    const barFrac = (beatPos % 4) / 4;

    const rawNoise = rng();
    lpNoise = lpNoise * 0.8 + rawNoise * 0.2;

    // 1. Warm Chord Pad / Rhodes
    let padL = 0;
    let padR = 0;
    const padEnv = smoothstep(0.0, 0.08, barFrac) * (1 - smoothstep(0.92, 1.0, barFrac) * 0.25);
    for (let c = 0; c < chord.length; c++) {
      const f = midiToFreq(chord[c]);
      const vibrato = 1 + 0.002 * Math.sin(2 * Math.PI * 3.5 * t + c);
      const tone = Math.sin(2 * Math.PI * f * vibrato * t) * 0.65 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12;
      const pan = (c - 1.5) * 0.22;
      padL += tone * (0.5 - pan * 0.4);
      padR += tone * (0.5 + pan * 0.4);
    }
    const padGain = spec.style === 'cinematic' ? 0.28 : 0.19;
    let sL = padL * padEnv * padGain;
    let sR = padR * padEnv * padGain;

    // 2. Pluck / Arp melody locked to 1/2 beat
    const eighthPos = beatPos * 2;
    const eighthIdx = Math.floor(eighthPos);
    const eighthTime = (eighthPos - eighthIdx) * (beatDur * 0.5);
    if (spec.style !== 'cinematic') {
      const note = chord[(eighthIdx * 2 + (barIdx % 2)) % chord.length] + 12;
      const pf = midiToFreq(note);
      const decay = spec.style === 'acoustic' || spec.style === 'piano' ? 6.5 : 10;
      const pluckEnv = Math.exp(-eighthTime * decay) * smoothstep(0, 0.004, eighthTime);
      const harmonic = spec.style === 'phonk' ? Math.tanh(Math.sin(2 * Math.PI * pf * t) * 2.2) * 0.4 : Math.sin(2 * Math.PI * pf * t) + 0.3 * Math.sin(4 * Math.PI * pf * t);
      const amp = spec.style === 'lofi' ? 0.09 : 0.14;
      sL += harmonic * pluckEnv * amp * (eighthIdx % 2 === 0 ? 1.0 : 0.7);
      sR += harmonic * pluckEnv * amp * (eighthIdx % 2 === 1 ? 1.0 : 0.7);
    }

    // 3. Kick Drum on beats (exact sync for Beat-Sync markers!)
    const isKickBeat =
      spec.style === 'edm' || spec.style === 'phonk' || spec.style === 'tech'
        ? true
        : beatIdx % 2 === 0 || (beatIdx % 4 === 3 && spec.style === 'lofi');
    if (isKickBeat && bt < 0.24) {
      const kFreq = 48 + 110 * Math.exp(-bt * 36);
      const kEnv = Math.exp(-bt * 14);
      const kickAmp = spec.style === 'edm' || spec.style === 'phonk' ? 0.52 : spec.style === 'cinematic' ? 0.28 : 0.34;
      const kick = Math.sin(2 * Math.PI * kFreq * bt) * kEnv * kickAmp;
      sL += kick;
      sR += kick;
    }

    // 4. Snare / Clap on beats 1 and 3
    if (beatIdx % 2 === 1 && bt < 0.16 && spec.style !== 'piano' && spec.style !== 'cinematic') {
      const snEnv = Math.exp(-bt * 24);
      const snare = (rawNoise * 0.65 + Math.sin(2 * Math.PI * 190 * bt) * 0.35) * snEnv * (spec.style === 'lofi' ? 0.12 : 0.22);
      sL += snare;
      sR += snare;
    }

    // 5. Hi-Hat on eighth notes + vinyl texture for lo-fi
    if ((spec.style === 'edm' || spec.style === 'phonk' || spec.style === 'lofi' || spec.style === 'tech') && eighthTime < 0.05) {
      const hh = (rawNoise - lpNoise) * Math.exp(-eighthTime * 65) * 0.09;
      sL += hh;
      sR += hh * 0.85;
    }
    if (spec.style === 'lofi') {
      const crackle = Math.abs(rawNoise) > 0.985 ? rawNoise * 0.06 : 0;
      sL += crackle + lpNoise * 0.015;
      sR += crackle * 0.7 + lpNoise * 0.015;
    }

    // Smooth edge fades for loopability
    const edgeFade = smoothstep(0, 0.06, t) * smoothstep(spec.dur, spec.dur - 0.12, t);
    left[i] = Math.tanh(sL * edgeFade * 1.15);
    right[i] = Math.tanh(sR * edgeFade * 1.15);
  }
  return { left, right };
}

const SFX_LIST = [
  ['sfx_fast_whoosh', 0.7],
  ['sfx_deep_whoosh', 1.2],
  ['sfx_whip_swish', 0.5],
  ['sfx_cinema_riser', 2.5],
  ['sfx_reverse_cymbal', 1.8],
  ['sfx_air_pass', 0.9],
  ['sfx_tape_stop', 1.1],
  ['sfx_glitch_sweep', 0.65],
  ['sfx_bubble_pop', 0.35],
  ['sfx_crisp_click', 0.25],
  ['sfx_bell_ding', 1.4],
  ['sfx_notif_chime', 1.0],
  ['sfx_camera_shutter', 0.45],
  ['sfx_keyboard_type', 1.6],
  ['sfx_page_flip', 0.55],
  ['sfx_cash_ding', 1.1],
  ['sfx_sub_boom', 1.8],
  ['sfx_bass_drop', 1.6],
  ['sfx_punch_hit', 0.5],
  ['sfx_door_slam', 0.7],
  ['sfx_metal_clang', 1.3],
  ['sfx_thunder_rumble', 2.6],
  ['sfx_laser_zap', 0.55],
  ['sfx_power_down', 1.1],
  ['sfx_record_scratch', 0.65],
  ['sfx_applause_burst', 2.4],
  ['sfx_sparkle_magic', 1.5],
  ['sfx_cartoon_boing', 0.75],
  ['sfx_clock_tick', 2.0],
  ['sfx_heartbeat', 2.0],
  ['sfx_error_buzzer', 0.65],
  ['sfx_victory_fanfare', 1.5],
  ['sfx_amb_rain', 4.0],
  ['sfx_amb_cafe', 4.0],
  ['sfx_amb_vinyl', 4.0],
  ['sfx_amb_ocean', 4.0],
  ['sfx_amb_forest', 4.0],
  ['sfx_amb_city', 4.0],
  ['sfx_amb_fire', 4.0],
  ['sfx_amb_wind', 4.0],
];

function synthesizeSfx(id, dur, seed) {
  const n = Math.round(dur * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rng = makeRng(seed);

  let b0 = 0;
  let b1 = 0;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / dur;
    const wn = rng();
    b0 = b0 * 0.85 + wn * 0.15;
    b1 = b1 * 0.96 + wn * 0.04;
    const hp = wn - b0;

    let sampleL = 0;
    let sampleR = 0;

    if (id.includes('whoosh') || id === 'sfx_whip_swish' || id === 'sfx_air_pass') {
      const peakPos = id === 'sfx_whip_swish' ? 0.38 : 0.5;
      const env = Math.exp(-Math.pow((p - peakPos) / 0.24, 2));
      const f = id === 'sfx_deep_whoosh' ? 140 + 480 * Math.sin(p * Math.PI) : 300 + 1800 * Math.sin(p * Math.PI);
      phase += (2 * Math.PI * f) / SR;
      const wind = (b0 * 0.65 + hp * 0.35 + Math.sin(phase) * 0.2) * env;
      sampleL = wind * (1 - p * 0.3);
      sampleR = wind * (0.7 + p * 0.3);
    } else if (id === 'sfx_cinema_riser' || id === 'sfx_reverse_cymbal') {
      const env = Math.pow(p, 2.2) * (1 - smoothstep(0.95, 1.0, p));
      const f = id === 'sfx_cinema_riser' ? 90 * Math.pow(10, p) : 1200 + 3800 * p;
      phase += (2 * Math.PI * f) / SR;
      const shimmer = id === 'sfx_reverse_cymbal' ? (hp * 0.7 + Math.sin(phase) * 0.25) : (Math.sin(phase) * 0.55 + Math.sin(phase * 1.5) * 0.3 + b0 * 0.25);
      sampleL = shimmer * env;
      sampleR = shimmer * env * 0.95;
    } else if (id === 'sfx_tape_stop' || id === 'sfx_power_down') {
      const env = (1 - p) * smoothstep(0, 0.02, t);
      const f = (id === 'sfx_tape_stop' ? 420 : 620) * Math.pow(1 - p * 0.92, 1.4);
      phase += (2 * Math.PI * f) / SR;
      sampleL = sampleR = (Math.sin(phase) + 0.35 * Math.sin(phase * 2)) * env * 0.7;
    } else if (id === 'sfx_glitch_sweep' || id === 'sfx_record_scratch') {
      const stepFreq = 120 + Math.abs(Math.floor(Math.sin(t * 95) * 14)) * 180;
      phase += (2 * Math.PI * stepFreq) / SR;
      const env = smoothstep(0, 0.02, p) * (1 - smoothstep(0.85, 1.0, p));
      sampleL = Math.tanh(Math.sin(phase) * 2.5 + wn * 0.25) * env * 0.65;
      sampleR = Math.tanh(Math.sin(phase * 1.03) * 2.5 + hp * 0.25) * env * 0.65;
    } else if (id === 'sfx_bubble_pop') {
      const f = 320 + 620 * Math.exp(-t * 28);
      phase += (2 * Math.PI * f) / SR;
      sampleL = sampleR = Math.sin(phase) * Math.exp(-t * 18) * 0.85;
    } else if (id === 'sfx_crisp_click' || id === 'sfx_camera_shutter' || id === 'sfx_page_flip') {
      const click1 = t < 0.03 ? hp * Math.exp(-t * 180) : 0;
      const click2 = id === 'sfx_camera_shutter' && t > 0.08 ? hp * Math.exp(-(t - 0.08) * 160) * 0.8 : 0;
      sampleL = sampleR = (click1 + click2 + Math.sin(2 * Math.PI * 950 * t) * Math.exp(-t * 90) * 0.3) * 0.9;
    } else if (id === 'sfx_bell_ding' || id === 'sfx_notif_chime' || id === 'sfx_cash_ding') {
      const f = id === 'sfx_cash_ding' && t > 0.14 ? 2637 : id === 'sfx_notif_chime' ? 1174 : 1567;
      const dt = id === 'sfx_cash_ding' && t > 0.14 ? t - 0.14 : t;
      const bell = Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(2 * Math.PI * f * 2 * t) + 0.2 * Math.sin(2 * Math.PI * f * 3.01 * t);
      sampleL = sampleR = bell * Math.exp(-dt * 4.2) * 0.55;
    } else if (id === 'sfx_keyboard_type') {
      const slot = Math.floor(t / 0.11);
      const local = t - slot * 0.11;
      const burst = local < 0.025 && slot % 3 !== 2 ? hp * Math.exp(-local * 140) : 0;
      sampleL = sampleR = burst * 0.9;
    } else if (id === 'sfx_sub_boom' || id === 'sfx_bass_drop' || id === 'sfx_punch_hit' || id === 'sfx_door_slam') {
      const startF = id === 'sfx_punch_hit' ? 180 : 125;
      const f = 36 + startF * Math.exp(-t * (id === 'sfx_bass_drop' ? 3.5 : 18));
      phase += (2 * Math.PI * f) / SR;
      const body = Math.sin(phase) * Math.exp(-t * (id === 'sfx_punch_hit' ? 12 : 2.2));
      const snap = (id === 'sfx_punch_hit' || id === 'sfx_door_slam') ? b0 * Math.exp(-t * 32) * 0.55 : 0;
      sampleL = sampleR = Math.tanh((body + snap) * 1.3);
    } else if (id === 'sfx_metal_clang') {
      const clang = Math.sin(2 * Math.PI * 520 * t) + 0.7 * Math.sin(2 * Math.PI * 1190 * t) + 0.5 * Math.sin(2 * Math.PI * 2130 * t);
      sampleL = sampleR = Math.tanh(clang * Math.exp(-t * 3.8)) * 0.7;
    } else if (id === 'sfx_thunder_rumble') {
      const crack = t < 0.12 ? wn * Math.exp(-t * 25) * 0.5 : 0;
      const rumble = b1 * 2.8 * Math.exp(-Math.max(0, t - 0.1) * 1.1) * (0.7 + 0.3 * Math.sin(t * 7));
      sampleL = (crack + rumble) * 0.95;
      sampleR = (crack + rumble * 0.92) * 0.95;
    } else if (id === 'sfx_laser_zap') {
      const f = 2200 * Math.exp(-t * 8.5) + 120;
      phase += (2 * Math.PI * f) / SR;
      sampleL = sampleR = Math.tanh(Math.sin(phase) * 1.8) * Math.exp(-t * 5.5) * 0.75;
    } else if (id === 'sfx_sparkle_magic') {
      const notes = [1046, 1318, 1567, 2093, 2637];
      const idx = Math.min(notes.length - 1, Math.floor(p * notes.length));
      const local = t - (idx / notes.length) * dur;
      sampleL = Math.sin(2 * Math.PI * notes[idx] * t) * Math.exp(-local * 5) * 0.5;
      sampleR = Math.sin(2 * Math.PI * notes[idx] * 1.003 * t) * Math.exp(-local * 5) * 0.5;
    } else if (id === 'sfx_cartoon_boing') {
      const f = 260 + 280 * Math.abs(Math.sin(2 * Math.PI * 5.5 * t));
      phase += (2 * Math.PI * f) / SR;
      sampleL = sampleR = Math.sin(phase) * Math.exp(-t * 3.5) * 0.8;
    } else if (id === 'sfx_clock_tick' || id === 'sfx_heartbeat') {
      const beat = t % 0.5;
      if (id === 'sfx_clock_tick') {
        sampleL = sampleR = beat < 0.02 ? hp * Math.exp(-beat * 180) * 0.85 : 0;
      } else {
        const lub = beat < 0.14 ? Math.sin(2 * Math.PI * 52 * beat) * Math.exp(-beat * 26) : 0;
        const dubT = beat - 0.16;
        const dub = dubT > 0 && dubT < 0.14 ? Math.sin(2 * Math.PI * 44 * dubT) * Math.exp(-dubT * 28) * 0.75 : 0;
        sampleL = sampleR = (lub + dub) * 0.95;
      }
    } else if (id === 'sfx_error_buzzer') {
      sampleL = sampleR = Math.tanh((Math.sin(2 * Math.PI * 155 * t) + Math.sin(2 * Math.PI * 165 * t)) * 2.0) * 0.55;
    } else if (id === 'sfx_victory_fanfare') {
      const chord = [523.25, 659.25, 783.99, 1046.5];
      let val = 0;
      for (let c = 0; c < chord.length; c++) {
        if (t >= c * 0.12) val += Math.sin(2 * Math.PI * chord[c] * t) * Math.exp(-(t - c * 0.12) * 2.5) * 0.28;
      }
      sampleL = sampleR = val;
    } else if (id === 'sfx_applause_burst') {
      const burst = hp * (0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * t)) * Math.sin(p * Math.PI);
      sampleL = burst * 0.75;
      sampleR = burst * 0.65;
    } else {
      // Ambience loops
      if (id === 'sfx_amb_rain') {
        sampleL = (b0 * 0.55 + hp * 0.35) * 0.55;
        sampleR = (b0 * 0.5 + hp * 0.4) * 0.55;
      } else if (id === 'sfx_amb_ocean') {
        const wave = 0.25 + 0.75 * Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * t / dur), 1.4);
        sampleL = sampleR = (b0 * 0.75 + hp * 0.15) * wave * 0.65;
      } else if (id === 'sfx_amb_vinyl' || id === 'sfx_amb_fire') {
        const pop = Math.abs(wn) > 0.975 ? wn * 0.45 : 0;
        sampleL = b1 * 0.4 + pop * 0.7;
        sampleR = b1 * 0.4 + pop * 0.5;
      } else if (id === 'sfx_amb_forest') {
        const chirpSlot = t % 1.1;
        const chirp = chirpSlot < 0.12 ? Math.sin(2 * Math.PI * (2400 + 800 * Math.sin(chirpSlot * 45)) * chirpSlot) * Math.exp(-chirpSlot * 24) * 0.35 : 0;
        sampleL = b1 * 0.25 + chirp;
        sampleR = b1 * 0.25 + chirp * 0.6;
      } else {
        sampleL = b1 * 0.5 + b0 * 0.12;
        sampleR = b1 * 0.48 + b0 * 0.12;
      }
    }

    const fade = smoothstep(0, 0.012, t) * smoothstep(dur, dur - 0.04, t);
    left[i] = Math.max(-1, Math.min(1, sampleL * fade));
    right[i] = Math.max(-1, Math.min(1, sampleR * fade));
  }
  return { left, right };
}

async function encodeAudioItem(id, wavBuf, outPath) {
  const tmpWav = `${outPath}.tmp.wav`;
  await fs.writeFile(tmpWav, wavBuf);
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', tmpWav,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      outPath,
    ]);
  } finally {
    await fs.rm(tmpWav, { force: true });
  }
}

async function generateAudio() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  const tasks = [];

  MUSIC_SPECS.forEach((spec, idx) => {
    tasks.push(async () => {
      const outPath = path.join(AUDIO_DIR, `${spec.id}.m4a`);
      if (!FORCE) {
        try {
          const st = await fs.stat(outPath);
          if (st.size > 4096) return false;
        } catch {
          // generate
        }
      }
      const { left, right } = synthesizeMusic(spec, 1000 + idx * 97);
      await encodeAudioItem(spec.id, writeWavBuffer(left, right), outPath);
      return true;
    });
  });

  SFX_LIST.forEach(([id, dur], idx) => {
    tasks.push(async () => {
      const outPath = path.join(AUDIO_DIR, `${id}.m4a`);
      if (!FORCE) {
        try {
          const st = await fs.stat(outPath);
          if (st.size > 1024) return false;
        } catch {
          // generate
        }
      }
      const { left, right } = synthesizeSfx(id, dur, 5000 + idx * 131);
      await encodeAudioItem(id, writeWavBuffer(left, right), outPath);
      return true;
    });
  });

  let created = 0;
  const BATCH = 8;
  for (let i = 0; i < tasks.length; i += BATCH) {
    const res = await Promise.all(tasks.slice(i, i + BATCH).map((fn) => fn()));
    created += res.filter(Boolean).length;
  }

  console.log(`[assets] Audio ready (${created} newly generated, ${tasks.length} total: ${MUSIC_SPECS.length} music + ${SFX_LIST.length} sfx)`);
}

await generateLuts();
await generateAudio();
