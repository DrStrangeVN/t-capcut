import {
  getClipPropertyAtTime,
  US_PER_SEC,
  type Clip,
  type Microseconds,
  type StickerState,
  type TextStyleState,
} from '@t-capcut/schema';
import { renderLottieFrameToCanvas } from './LottieCache';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function computeClipAnimation(
  localUs: Microseconds,
  durationUs: Microseconds,
  animIn: TextStyleState['animationIn'] | undefined,
  animOut: TextStyleState['animationOut'] | undefined,
  animLoop: TextStyleState['animationLoop'] | undefined,
  w: number,
  h: number
): { alpha: number; dx: number; dy: number; scale: number; rotRad: number; typeFrac: number; blurPx: number; glitchPx: number } {
  const inDurUs = Math.min(420_000, durationUs * 0.35);
  const outDurUs = Math.min(350_000, durationUs * 0.25);
  const pIn = inDurUs > 0 ? clamp01(localUs / inDurUs) : 1;
  const remUs = durationUs - localUs;
  const pOut = outDurUs > 0 && remUs < outDurUs ? clamp01(remUs / outDurUs) : 1;
  const tSec = localUs / US_PER_SEC;

  let alpha = 1;
  let dx = 0;
  let dy = 0;
  let scale = 1;
  let rotRad = 0;
  let typeFrac = 1;
  let blurPx = 0;
  let glitchPx = 0;

  if (animIn && animIn !== 'none' && pIn < 1) {
    const e = easeOutCubic(pIn);
    if (animIn === 'fade') alpha *= e;
    else if (animIn === 'pop') {
      alpha *= clamp01(pIn * 2.5);
      scale *= Math.max(0.05, easeOutBack(pIn));
    } else if (animIn === 'zoom-slam') {
      alpha *= 0.35 + 0.65 * clamp01(pIn * 3);
      scale *= 1.45 - 0.45 * easeOutCubic(pIn);
    } else if (animIn === 'slide-up') {
      alpha *= e;
      dy += (1 - e) * h * 0.06;
    } else if (animIn === 'slide-down') {
      alpha *= e;
      dy -= (1 - e) * h * 0.06;
    } else if (animIn === 'slide-left') {
      alpha *= e;
      dx += (1 - e) * w * 0.1;
    } else if (animIn === 'slide-right') {
      alpha *= e;
      dx -= (1 - e) * w * 0.1;
    } else if (animIn === 'typewriter') {
      typeFrac = pIn;
    } else if (animIn === 'blur-in') {
      alpha *= e;
      blurPx = (1 - e) * 14;
      scale *= 1.08 - 0.08 * e;
    } else if (animIn === 'glitch') {
      glitchPx = (1 - pIn) * 18 * Math.sin(pIn * 45);
      alpha *= pIn > 0.15 ? 1 : 0.4;
    }
  }

  if (animOut && animOut !== 'none' && pOut < 1) {
    const e = easeOutCubic(pOut);
    if (animOut === 'fade') alpha *= e;
    else if (animOut === 'pop' || animOut === 'zoom-out') {
      alpha *= e;
      scale *= e;
    } else if (animOut === 'slide-down') {
      alpha *= e;
      dy += (1 - e) * h * 0.05;
    }
  }

  if (animLoop && animLoop !== 'none') {
    if (animLoop === 'pulse') scale *= 1 + Math.sin(tSec * 5.2) * 0.055;
    else if (animLoop === 'float' || animLoop === 'wave') dy += Math.sin(tSec * 2.6) * h * 0.008;
    else if (animLoop === 'shake') {
      dx += Math.sin(tSec * 14) * w * 0.004;
      rotRad += Math.sin(tSec * 9.5) * 0.03;
    } else if (animLoop === 'neon-flicker') alpha *= 0.85 + 0.15 * Math.sin(tSec * 27 + Math.sin(tSec * 7));
  }

  return { alpha, dx, dy, scale, rotRad, typeFrac, blurPx, glitchPx };
}

export function drawTextOverlay2D(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  playheadUs: Microseconds,
  w: number,
  h: number,
  isSelected = false
): void {
  const t = clip.text;
  if (!t) return;
  const localUs = playheadUs - clip.timelineStartUs;
  const anim = computeClipAnimation(
    localUs,
    clip.durationUs,
    t.animationIn,
    t.animationOut,
    t.animationLoop,
    w,
    h
  );

  const x = (0.5 + getClipPropertyAtTime(clip, 'x', localUs) * 0.5) * w + anim.dx + anim.glitchPx;
  const y = (0.5 + getClipPropertyAtTime(clip, 'y', localUs) * 0.5) * h + anim.dy;
  const scaleX = getClipPropertyAtTime(clip, 'scaleX', localUs) * anim.scale;
  const scaleY = getClipPropertyAtTime(clip, 'scaleY', localUs) * anim.scale;
  const opacity = getClipPropertyAtTime(clip, 'opacity', localUs) * anim.alpha;
  const rot = (getClipPropertyAtTime(clip, 'rotation', localUs) * Math.PI) / 180 + anim.rotRad;

  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scaleX, scaleY);
  if (anim.blurPx > 0.5) {
    ctx.filter = `blur(${anim.blurPx.toFixed(1)}px)`;
  }

  const baseScale = Math.min(w, h) / 1080;
  const fontSize = Math.max(16, Math.round(t.fontSize * baseScale * 1.12));
  ctx.font = `${t.italic ? 'italic ' : ''}${t.fontWeight} ${fontSize}px ${t.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  if (t.shadowBlur > 0) {
    ctx.shadowColor = t.shadowColor || 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = t.shadowBlur * baseScale;
    ctx.shadowOffsetY = t.shadowOffsetY * baseScale;
  }

  const words = t.karaokeEnabled && t.words && t.words.length > 0 ? t.words : null;
  const preset = t.karaokePreset || 'classic-pill';
  const padX = Math.max(10, (t.backgroundPadding || 12) * baseScale * 1.2);
  const padY = Math.max(6, (t.backgroundPadding || 12) * baseScale * 0.75);
  const hasBg = Boolean(t.backgroundColor && !t.backgroundColor.endsWith(', 0)') && t.backgroundColor !== 'transparent');
  const maxContentW = w * 0.86;
  const lineH = fontSize * (t.lineHeight || 1.28);

  if (words) {
    const spaceW = ctx.measureText(' ').width * 1.15;
    // Wrap karaoke words cleanly into multi-line rows within maxContentW
    const rows: Array<Array<{ word: (typeof words)[number]; width: number }>> = [];
    let curRow: Array<{ word: (typeof words)[number]; width: number }> = [];
    let curRowW = 0;
    for (const wd of words) {
      const ww = ctx.measureText(wd.text).width;
      const nextW = curRow.length === 0 ? ww : curRowW + spaceW + ww;
      if (curRow.length > 0 && nextW > maxContentW) {
        rows.push(curRow);
        curRow = [{ word: wd, width: ww }];
        curRowW = ww;
      } else {
        curRow.push({ word: wd, width: ww });
        curRowW = nextW;
      }
    }
    if (curRow.length > 0) rows.push(curRow);

    const rowWidths = rows.map((r) => r.reduce((s, x) => s + x.width, 0) + spaceW * Math.max(0, r.length - 1));
    const maxRowW = Math.max(...rowWidths, 40);
    const boxW = maxRowW + padX * 2;
    const boxH = rows.length * lineH + padY * 2;

    if (hasBg || preset === 'liquid-glass') {
      ctx.save();
      ctx.fillStyle = preset === 'liquid-glass' ? 'rgba(15, 23, 42, 0.56)' : t.backgroundColor;
      ctx.beginPath();
      ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, Math.max(8, t.backgroundRadius * baseScale));
      ctx.fill();
      if (preset === 'liquid-glass') {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = Math.max(1.5, 2 * baseScale);
        ctx.stroke();
      }
      ctx.restore();
    }

    const startY = -((rows.length - 1) * lineH) * 0.5;
    rows.forEach((row, ri) => {
      const rw = rowWidths[ri]!;
      const ry = startY + ri * lineH;
      let cursorX = -rw * 0.5;

      row.forEach(({ word: wd, width: wordW }) => {
        const active = playheadUs >= wd.startUs && playheadUs <= wd.endUs;
        const past = playheadUs > wd.endUs;
        const cx = cursorX + wordW * 0.5;

        ctx.save();
        ctx.translate(cx, ry);

        if (active && (preset === 'classic-pill' || preset === 'word-highlight')) {
          ctx.save();
          ctx.shadowBlur = 0;
          ctx.fillStyle = t.karaokeActiveColor || '#06B6D4';
          ctx.beginPath();
          ctx.roundRect(-wordW * 0.5 - 8 * baseScale, -fontSize * 0.62, wordW + 16 * baseScale, fontSize * 1.24, 10 * baseScale);
          ctx.fill();
          ctx.restore();
        }

        if (active && (preset === 'hormozi-pop' || preset === 'pop-bounce' || preset === 'comic-punch')) {
          ctx.scale(1.16, 1.16);
        } else if (active) {
          ctx.scale(1.06, 1.06);
        }

        ctx.textAlign = 'center';
        if (t.strokeWidth > 0) {
          ctx.strokeStyle = t.strokeColor || '#000000';
          ctx.lineWidth = Math.max(2, t.strokeWidth * baseScale);
          ctx.strokeText(wd.text, 0, 0);
        }

        const useDarkOnActivePill = active && (preset === 'classic-pill' || preset === 'word-highlight');
        if (preset === 'sweep-fill') {
          ctx.fillStyle = past || active ? t.karaokeActiveColor : t.color;
        } else {
          ctx.fillStyle = useDarkOnActivePill ? '#06111D' : active ? t.karaokeActiveColor : t.color;
        }
        ctx.fillText(wd.text, 0, 0);

        if (active && preset === 'capcut-yellow') {
          ctx.fillStyle = t.karaokeActiveColor || '#FACC15';
          ctx.fillRect(-wordW * 0.5, fontSize * 0.55, wordW, Math.max(3, 4 * baseScale));
        }
        ctx.restore();
        cursorX += wordW + spaceW;
      });
    });

    if (isSelected) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(2, 2.5 * baseScale);
      ctx.setLineDash([8 * baseScale, 5 * baseScale]);
      ctx.strokeRect(-boxW * 0.5 - 6, -boxH * 0.5 - 6, boxW + 12, boxH + 12);
    }
    ctx.restore();
    return;
  }

  // Non-karaoke Titles, Lower Thirds, Social Cards with Multi-line Word Wrapping
  const fullStr = t.text;
  const drawnText = anim.typeFrac < 1 ? fullStr.slice(0, Math.max(1, Math.floor(fullStr.length * anim.typeFrac))) : fullStr;
  const wrapParagraphs = (raw: string): string[] => {
    const out: string[] = [];
    for (const para of raw.split('\n')) {
      const tokens = para.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        out.push('');
        continue;
      }
      let cur = tokens[0]!;
      for (let i = 1; i < tokens.length; i++) {
        const candidate = `${cur} ${tokens[i]}`;
        if (ctx.measureText(candidate).width <= maxContentW) {
          cur = candidate;
        } else {
          out.push(cur);
          cur = tokens[i]!;
        }
      }
      out.push(cur);
    }
    return out.length > 0 ? out : [''];
  };

  const fullLines = wrapParagraphs(fullStr);
  const drawnLines = wrapParagraphs(drawnText);
  const maxTextW = Math.max(...fullLines.map((l) => ctx.measureText(l).width), 40);
  const badgeW = t.badgeText ? ctx.measureText(t.badgeText).width * 0.72 + 24 * baseScale : 0;
  const gapW = t.badgeText ? 12 * baseScale : 0;
  const totalContentW = maxTextW + badgeW + gapW;
  const boxW = totalContentW + padX * 2;
  const boxH = fullLines.length * lineH + padY * 2;

  if (hasBg) {
    ctx.save();
    ctx.fillStyle = t.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, Math.max(8, t.backgroundRadius * baseScale));
    ctx.fill();
    ctx.restore();
  }

  const textCenterX = badgeW > 0 ? (badgeW + gapW) * 0.5 : 0;

  if (t.badgeText) {
    ctx.save();
    ctx.shadowBlur = 0;
    const bx = -totalContentW * 0.5;
    const bH = fontSize * 0.98;
    ctx.fillStyle = '#22D3EE';
    ctx.beginPath();
    ctx.roundRect(bx, -bH * 0.5, badgeW, bH, 8 * baseScale);
    ctx.fill();
    ctx.font = `800 ${Math.round(fontSize * 0.62)}px ${t.fontFamily}`;
    ctx.fillStyle = '#04121C';
    ctx.textAlign = 'center';
    ctx.fillText(t.badgeText, bx + badgeW * 0.5, 1);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  const startY = -((drawnLines.length - 1) * lineH) * 0.5;
  drawnLines.forEach((line, li) => {
    const ly = startY + li * lineH;
    if (t.strokeWidth > 0) {
      ctx.strokeStyle = t.strokeColor || '#000000';
      ctx.lineWidth = Math.max(2, t.strokeWidth * baseScale);
      ctx.strokeText(line, textCenterX, ly);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, textCenterX, ly);
  });

  if (isSelected) {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = Math.max(2, 2.5 * baseScale);
    ctx.setLineDash([8 * baseScale, 5 * baseScale]);
    ctx.strokeRect(-boxW * 0.5 - 6, -boxH * 0.5 - 6, boxW + 12, boxH + 12);
  }
  ctx.restore();
}

function drawParticleSystem(
  ctx: CanvasRenderingContext2D,
  s: StickerState,
  tSec: number,
  w: number,
  h: number
): void {
  const count = s.particleType === 'rain' ? 95 : s.particleType === 'dust' ? 60 : 52;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const r0 = hash01(i * 1.37);
    const r1 = hash01(i * 2.91);
    const r2 = hash01(i * 5.13);
    const r3 = hash01(i * 7.73);
    const color = i % 2 === 0 ? s.primaryColor : s.secondaryColor;

    if (s.particleType === 'snow') {
      const y = ((r0 + tSec * (0.14 + r2 * 0.16)) % 1.08) - 0.04;
      const x = (r1 + Math.sin(tSec * 1.4 + i) * 0.035 + 1) % 1;
      const rad = (2.5 + r3 * 6.5) * (w / 1080);
      ctx.globalAlpha = 0.4 + r2 * 0.55;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x * w, y * h, rad, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.particleType === 'rain') {
      const y = ((r0 + tSec * (1.25 + r2 * 0.55)) % 1.15) - 0.08;
      const x = ((r1 - tSec * 0.18) % 1 + 1) % 1;
      const len = (24 + r3 * 36) * (h / 1080);
      ctx.globalAlpha = 0.28 + r2 * 0.42;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, 2.2 * (w / 1080));
      ctx.beginPath();
      ctx.moveTo(x * w, y * h);
      ctx.lineTo(x * w - len * 0.18, y * h + len);
      ctx.stroke();
    } else if (s.particleType === 'dust' || s.particleType === 'bokeh') {
      const x = (r0 + Math.sin(tSec * 0.45 + i) * 0.04 + 1) % 1;
      const y = ((r1 - tSec * (0.04 + r2 * 0.05)) % 1 + 1) % 1;
      const pulse = 0.5 + 0.5 * Math.sin(tSec * (2 + r3 * 3) + i);
      const rad = (s.particleType === 'bokeh' ? 14 + r3 * 36 : 2 + r3 * 5) * (w / 1080);
      ctx.globalAlpha = (s.particleType === 'bokeh' ? 0.12 + 0.2 * pulse : 0.35 + 0.55 * pulse);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x * w, y * h, rad, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.particleType === 'confetti') {
      const y = ((r0 + tSec * (0.28 + r2 * 0.28)) % 1.1) - 0.05;
      const x = (r1 + Math.sin(tSec * 2.2 + i) * 0.04 + 1) % 1;
      const cw = (9 + r3 * 9) * (w / 1080);
      const ch = cw * 0.55;
      const colors = ['#22D3EE', '#FACC15', '#FB7185', '#34D399', '#A78BFA'];
      ctx.save();
      ctx.translate(x * w, y * h);
      ctx.rotate(tSec * (2 + r2 * 4) + i);
      ctx.scale(1, Math.cos(tSec * 5 + i));
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.fillRect(-cw * 0.5, -ch * 0.5, cw, ch);
      ctx.restore();
    } else if (s.particleType === 'hearts') {
      const y = ((r0 - tSec * (0.16 + r2 * 0.14)) % 1.1 + 1.1) % 1.1 - 0.05;
      const x = (r1 + Math.sin(tSec * 1.8 + i) * 0.04 + 1) % 1;
      const sz = (18 + r3 * 22) * (w / 1080);
      ctx.save();
      ctx.translate(x * w, y * h);
      ctx.globalAlpha = 0.72;
      ctx.font = `${Math.round(sz)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i % 2 === 0 ? '💖' : '💗', 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawStickerOverlay2D(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  playheadUs: Microseconds,
  w: number,
  h: number,
  isSelected = false
): void {
  const s = clip.sticker;
  if (!s) return;
  const localUs = playheadUs - clip.timelineStartUs;
  const tSec = localUs / US_PER_SEC;

  if (s.particleType) {
    drawParticleSystem(ctx, s, tSec, w, h);
    return;
  }

  const anim = computeClipAnimation(localUs, clip.durationUs, 'pop', 'fade', 'none', w, h);
  const x = (0.5 + getClipPropertyAtTime(clip, 'x', localUs) * 0.5) * w;
  const y = (0.5 + getClipPropertyAtTime(clip, 'y', localUs) * 0.5) * h;
  const scaleX = getClipPropertyAtTime(clip, 'scaleX', localUs) * anim.scale;
  const scaleY = getClipPropertyAtTime(clip, 'scaleY', localUs) * anim.scale;
  const rot = (getClipPropertyAtTime(clip, 'rotation', localUs) * Math.PI) / 180;
  const opacity = getClipPropertyAtTime(clip, 'opacity', localUs) * anim.alpha;
  const bs = Math.min(w, h) / 1080;

  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scaleX, scaleY);

  const label = s.label || s.name;
  let boxW = 240 * bs;
  let boxH = 84 * bs;

  if (s.lottieJson) {
    const lottieCanvas = renderLottieFrameToCanvas(s.lottieJson, tSec, s.lottieDurationSec);
    if (lottieCanvas) {
      boxW = 300 * bs;
      boxH = 300 * bs;
      ctx.drawImage(lottieCanvas, -boxW * 0.5, -boxH * 0.5, boxW, boxH);
    } else {
      ctx.fillStyle = s.primaryColor;
      ctx.beginPath();
      ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, 16 * bs);
      ctx.fill();
    }
  } else if (s.iconType === 'subscribe') {
    boxW = 330 * bs;
    boxH = 86 * bs;
    ctx.fillStyle = s.primaryColor || '#EF4444';
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, 43 * bs);
    ctx.fill();
    ctx.fillStyle = s.secondaryColor || '#FFFFFF';
    ctx.font = `800 ${Math.round(30 * bs)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bellTilt = Math.sin(tSec * 12) * 0.15;
    ctx.fillText(`🔔  ${label}`, Math.sin(bellTilt) * 2, 1);
  } else if (s.iconType === 'rec') {
    boxW = 240 * bs;
    boxH = 74 * bs;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2 * bs;
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, 14 * bs);
    ctx.fill();
    ctx.stroke();
    const blink = Math.floor(tSec * 2.5) % 2 === 0;
    ctx.fillStyle = blink ? s.primaryColor : 'rgba(239,68,68,0.3)';
    ctx.beginPath();
    ctx.arc(-boxW * 0.32, 0, 12 * bs, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.secondaryColor || '#FFFFFF';
    ctx.font = `700 ${Math.round(28 * bs)}px "SF Mono", ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, -boxW * 0.18, 1);
  } else if (s.iconType === 'countdown') {
    const remSec = Math.max(1, Math.ceil(Math.max(0.01, (clip.durationUs - localUs) / US_PER_SEC)));
    boxW = 160 * bs;
    boxH = 160 * bs;
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = 10 * bs;
    ctx.beginPath();
    ctx.arc(0, 0, 68 * bs, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ((localUs / US_PER_SEC) % 1)));
    ctx.stroke();
    ctx.fillStyle = s.secondaryColor;
    ctx.font = `900 ${Math.round(74 * bs)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(remSec), 0, 2);
  } else if (s.iconType === 'wave') {
    boxW = 300 * bs;
    boxH = 88 * bs;
    const bars = 14;
    const bw = 12 * bs;
    const gap = 8 * bs;
    const startX = -((bars * bw + (bars - 1) * gap) * 0.5);
    ctx.fillStyle = s.primaryColor;
    for (let b = 0; b < bars; b++) {
      const hBar = (18 + Math.abs(Math.sin(tSec * 9 + b * 0.85)) * 58) * bs;
      ctx.beginPath();
      ctx.roundRect(startX + b * (bw + gap), -hBar * 0.5, bw, hBar, 6 * bs);
      ctx.fill();
    }
  } else if (s.iconType === 'progress') {
    boxW = w * 0.86;
    boxH = 22 * bs;
    const p = clamp01(localUs / Math.max(1, clip.durationUs));
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -7 * bs, boxW, 14 * bs, 7 * bs);
    ctx.fill();
    ctx.fillStyle = s.primaryColor;
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -7 * bs, boxW * p, 14 * bs, 7 * bs);
    ctx.fill();
  } else if (s.iconType === 'arrow') {
    boxW = 160 * bs;
    boxH = 120 * bs;
    const nudge = Math.sin(tSec * 7) * 10 * bs;
    ctx.translate(nudge, -nudge);
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = 12 * bs;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-48 * bs, 44 * bs);
    ctx.lineTo(44 * bs, -44 * bs);
    ctx.moveTo(8 * bs, -46 * bs);
    ctx.lineTo(44 * bs, -44 * bs);
    ctx.lineTo(46 * bs, -8 * bs);
    ctx.stroke();
  } else if (s.iconType === 'circle') {
    boxW = 220 * bs;
    boxH = 160 * bs;
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = 10 * bs;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, 0, 96 * bs, 64 * bs, -0.08, 0, Math.PI * 1.92 * clamp01(localUs / 350_000 + 0.25));
    ctx.stroke();
  } else {
    // Badge / Pill / Social Like / Mic / Cursor
    ctx.font = `800 ${Math.round(32 * bs)}px -apple-system, sans-serif`;
    const tw = ctx.measureText(label).width;
    boxW = Math.max(180 * bs, tw + 68 * bs);
    boxH = 78 * bs;
    ctx.fillStyle = s.primaryColor;
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, 20 * bs);
    ctx.fill();
    ctx.fillStyle = s.secondaryColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
  }

  if (isSelected) {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.5 * bs;
    ctx.setLineDash([8 * bs, 5 * bs]);
    ctx.strokeRect(-boxW * 0.5 - 8, -boxH * 0.5 - 8, boxW + 16, boxH + 16);
  }
  ctx.restore();
}

export function renderAllOverlays2D(
  ctx: CanvasRenderingContext2D,
  flatClips: Clip[],
  playheadUs: Microseconds,
  w: number,
  h: number,
  options?: { selectedClipId?: string | null; burnSubtitles?: boolean; layerFilter?: 'all' | 'behind' | 'front'; skipClear?: boolean }
): void {
  if (!options?.skipClear) {
    ctx.clearRect(0, 0, w, h);
  }
  const filterMode = options?.layerFilter ?? 'all';

  // 1. Render Stickers & Particles (only in 'all' or 'front')
  if (filterMode !== 'behind') {
    const activeStickers = flatClips.filter(
      (c) => c.kind === 'sticker' && c.sticker && playheadUs >= c.timelineStartUs && playheadUs < c.timelineStartUs + c.durationUs
    );
    for (const sc of activeStickers) {
      drawStickerOverlay2D(ctx, sc, playheadUs, w, h, options?.selectedClipId === sc.id);
    }
  }

  // 2. Render Text, Titles, Lower-Thirds & Karaoke Word Animations
  if (options?.burnSubtitles !== false) {
    const activeTexts = flatClips.filter((c) => {
      if (c.kind !== 'text' || !c.text) return false;
      if (playheadUs < c.timelineStartUs || playheadUs >= c.timelineStartUs + c.durationUs) return false;
      const isBehind = Boolean(c.text.behindSubject);
      if (filterMode === 'behind') return isBehind;
      if (filterMode === 'front') return !isBehind;
      return true;
    });
    for (const tc of activeTexts) {
      drawTextOverlay2D(ctx, tc, playheadUs, w, h, options?.selectedClipId === tc.id);
    }
  }
}
