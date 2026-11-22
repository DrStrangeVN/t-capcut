import {
  ASPECT_RATIO_DIMENSIONS,
  US_PER_SEC,
  createDefaultAudioState,
  createDefaultChromaKey,
  createDefaultColorGrade,
  createDefaultMask,
  createDefaultSpeed,
  createDefaultTransform,
  createEmptyProject,
  type AspectRatioPreset,
  type Clip,
  type MediaAsset,
  type Project,
} from '@t-capcut/schema';
import { TEXT_CATALOG, buildTextStyleFromPreset } from './text-catalog.js';
import { TRANSITION_BY_ID } from './transitions-catalog.js';
import { VFX_BY_ID } from './vfx-catalog.js';

export type TemplateCategory = 'beatsync' | 'vlog' | 'talking_head' | 'commercial' | 'travel';

export interface TemplateSlotSpec {
  id: string;
  label: string;
  durationUs: number;
  speedMode?: 'uniform' | 'curve';
  speedRate?: number;
  speedPreset?: 'montage' | 'hero' | 'bullet' | 'jump_cut';
  transitionId?: string;
  vfxId?: string;
  kenBurnsZoom?: boolean;
}

export interface TemplateTextSpec {
  presetId: string;
  text: string;
  startUs: number;
  durationUs: number;
  karaoke?: boolean;
}

export interface VideoTemplatePreset {
  id: string;
  name: string;
  category: TemplateCategory;
  categoryLabel: string;
  aspectRatio: Exclude<AspectRatioPreset, 'custom'>;
  bpm: number;
  desc: string;
  lutId: string;
  musicId: string;
  previewGradient: string;
  slots: TemplateSlotSpec[];
  texts: TemplateTextSpec[];
}

export const TEMPLATE_CATEGORIES: Array<{ id: TemplateCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả (12)' },
  { id: 'beatsync', label: 'Beat-Sync' },
  { id: 'vlog', label: 'Vlog & Đời sống' },
  { id: 'talking_head', label: 'Talking Head' },
  { id: 'commercial', label: 'Bán hàng & Review' },
  { id: 'travel', label: 'Du lịch & Kể chuyện' },
];

export const VIDEO_TEMPLATES_CATALOG: VideoTemplatePreset[] = [
  {
    id: 'tpl_tiktok_beatsync',
    name: 'TikTok Beat-Sync Flash (6 Slots)',
    category: 'beatsync',
    categoryLabel: 'Beat-Sync',
    aspectRatio: '9:16',
    bpm: 128,
    desc: '6 cảnh cắt đúng phách 128 BPM + Zoom Pulse + Flash White + Speed Montage',
    lutId: 'lut_tokyo_cyber',
    musicId: 'mus_beat_tiktok128',
    previewGradient: 'linear-gradient(135deg, #be185d, #06b6d4)',
    slots: [
      { id: 's1', label: 'Cảnh mở đầu bắt mắt', durationUs: 1_400_000, vfxId: 'beat_pulse' },
      { id: 's2', label: 'Góc cận động 1', durationUs: 940_000, transitionId: 'flash_white', speedMode: 'curve', speedPreset: 'montage' },
      { id: 's3', label: 'Góc chuyển động 2', durationUs: 940_000, transitionId: 'whip_left' },
      { id: 's4', label: 'Cao trào giữa nhịp', durationUs: 940_000, transitionId: 'zoom_in', vfxId: 'chromatic' },
      { id: 's5', label: 'Biến hình nhanh', durationUs: 940_000, transitionId: 'glitch' },
      { id: 's6', label: 'Kết thúc bùng nổ', durationUs: 1_500_000, transitionId: 'spin' },
    ],
    texts: [
      { presetId: 'ttl_hook_hook', text: 'CHUẨN BỊ ĐẾM NHỊP!', startUs: 0, durationUs: 1_300_000 },
      { presetId: 'krk_hormozi', text: 'BÙNG NỔ TREND TIKTOK 2026', startUs: 1_450_000, durationUs: 2_500_000, karaoke: true },
    ],
  },
  {
    id: 'tpl_daily_vlog',
    name: 'Daily Aesthetic Vlog',
    category: 'vlog',
    categoryLabel: 'Vlog & Đời sống',
    aspectRatio: '9:16',
    bpm: 84,
    desc: 'Màu phim Fuji Eterna + Super 8mm + Nhạc Lo-Fi Chill + Date Stamp',
    lutId: 'lut_fuji_eterna',
    musicId: 'mus_lofi_midnight',
    previewGradient: 'linear-gradient(135deg, #065f46, #fcd34d)',
    slots: [
      { id: 's1', label: 'Toàn cảnh buổi sáng', durationUs: 2_000_000, vfxId: 'super8_grain' },
      { id: 's2', label: 'Pha cà phê / Chuẩn bị', durationUs: 2_000_000, transitionId: 'dissolve', vfxId: 'halation' },
      { id: 's3', label: 'Khoảnh khắc đường phố', durationUs: 2_000_000, transitionId: 'light_leak' },
      { id: 's4', label: 'Kết thúc nhẹ nhàng', durationUs: 2_200_000, transitionId: 'dissolve' },
    ],
    texts: [
      { presetId: 'ttl_vlog_stamp', text: 'SAIGON · A SLOW MORNING', startUs: 200_000, durationUs: 2_500_000 },
      { presetId: 'krk_liquid_glass', text: 'Một ngày bình yên bên ly cà phê sáng', startUs: 3_000_000, durationUs: 3_000_000, karaoke: true },
    ],
  },
  {
    id: 'tpl_hormozi_viral',
    name: 'Hormozi Talking Head Viral',
    category: 'talking_head',
    categoryLabel: 'Talking Head',
    aspectRatio: '9:16',
    bpm: 112,
    desc: 'Chuyên gia nói trước ống kính + Karaoke vàng nổi + Lower Third',
    lutId: 'lut_skin_glow',
    musicId: 'mus_tech_studio',
    previewGradient: 'linear-gradient(135deg, #78350f, #facc15)',
    slots: [
      { id: 's1', label: 'Video người nói chính (Talking Head)', durationUs: 6_000_000 },
    ],
    texts: [
      { presetId: 'krk_hormozi', text: '3 BÍ QUYẾT TĂNG TƯƠNG TÁC NGAY LẬP TỨC', startUs: 0, durationUs: 3_000_000, karaoke: true },
      { presetId: 'lt_glass_speaker', text: 'T-CapCut Creator Lab', startUs: 1_000_000, durationUs: 3_500_000 },
    ],
  },
  {
    id: 'tpl_product_showcase',
    name: 'Product Showcase 3-Step',
    category: 'commercial',
    categoryLabel: 'Bán hàng & Review',
    aspectRatio: '9:16',
    bpm: 122,
    desc: '3 góc cận sản phẩm + Whip Pan + Price Badge -50% + Nhạc Pop',
    lutId: 'lut_minimal_bright',
    musicId: 'mus_pop_flash',
    previewGradient: 'linear-gradient(135deg, #ea580c, #facc15)',
    slots: [
      { id: 's1', label: 'Tổng thể sản phẩm', durationUs: 1_800_000 },
      { id: 's2', label: 'Cận chất liệu / Chi tiết', durationUs: 1_800_000, transitionId: 'whip_right' },
      { id: 's3', label: 'Sử dụng thực tế', durationUs: 2_000_000, transitionId: 'zoom_in' },
    ],
    texts: [
      { presetId: 'soc_price_sale', text: 'GIẢM 50% · HÔM NAY', startUs: 200_000, durationUs: 2_200_000 },
      { presetId: 'soc_cta_link', text: 'ĐẶT NGAY TRONG GIỎ HÀNG ↓', startUs: 3_200_000, durationUs: 2_200_000 },
    ],
  },
  {
    id: 'tpl_before_after',
    name: 'Before / After Magic Wipe',
    category: 'commercial',
    categoryLabel: 'Bán hàng & Review',
    aspectRatio: '9:16',
    bpm: 120,
    desc: 'So sánh trước & sau biến hình với Iris Wipe + Nhãn BEFORE/AFTER',
    lutId: 'lut_seoul_pastel',
    musicId: 'mus_beat_cyber120',
    previewGradient: 'linear-gradient(135deg, #4f46e5, #22d3ee)',
    slots: [
      { id: 's1', label: 'Cảnh BEFORE (Gốc)', durationUs: 2_500_000 },
      { id: 's2', label: 'Cảnh AFTER (Thành phẩm)', durationUs: 3_000_000, transitionId: 'diagonal_slash', vfxId: 'dreamy' },
    ],
    texts: [
      { presetId: 'soc_before_label', text: 'TRƯỚC  →  SAU', startUs: 200_000, durationUs: 4_500_000 },
    ],
  },
  {
    id: 'tpl_travel_cinema',
    name: 'Travel Cinematic Montage',
    category: 'travel',
    categoryLabel: 'Du lịch & Kể chuyện',
    aspectRatio: '2.35:1',
    bpm: 72,
    desc: 'Khung điện ảnh 2.35:1 + LUT Kodak 2383 + Light Leak + Speed Hero',
    lutId: 'lut_kodak_2383',
    musicId: 'mus_cine_horizon',
    previewGradient: 'linear-gradient(135deg, #164e63, #f59e0b)',
    slots: [
      { id: 's1', label: 'Flycam / Toàn cảnh mở đầu', durationUs: 2_400_000, vfxId: 'anamorphic_flare' },
      { id: 's2', label: 'Chủ thể bước đi (Hero Ramp)', durationUs: 2_200_000, transitionId: 'light_leak', speedMode: 'curve', speedPreset: 'hero' },
      { id: 's3', label: 'Cảnh thiên nhiên / Biển núi', durationUs: 2_200_000, transitionId: 'dissolve' },
      { id: 's4', label: 'Hoàng hôn kết phim', durationUs: 2_500_000, transitionId: 'film_burn' },
    ],
    texts: [
      { presetId: 'ttl_cinematic_letter', text: 'ENDLESS HORIZONS', startUs: 300_000, durationUs: 2_600_000 },
      { presetId: 'lt_location_pin', text: 'VIỆT NAM · 2026', startUs: 3_500_000, durationUs: 2_500_000 },
    ],
  },
  {
    id: 'tpl_youtube_tech',
    name: 'YouTube Tech Review Kit',
    category: 'commercial',
    categoryLabel: 'Bán hàng & Review',
    aspectRatio: '16:9',
    bpm: 112,
    desc: 'Intro công nghệ + Chapter Divider + 5-Star Card + Nhạc Review sạch',
    lutId: 'lut_minimal_bright',
    musicId: 'mus_tech_review',
    previewGradient: 'linear-gradient(135deg, #0f172a, #38bdf8)',
    slots: [
      { id: 's1', label: 'B-Roll Mở hộp', durationUs: 2_200_000 },
      { id: 's2', label: 'Trải nghiệm thực tế', durationUs: 2_400_000, transitionId: 'wipe_left' },
      { id: 's3', label: 'So sánh hiệu năng', durationUs: 2_200_000, transitionId: 'whip_left' },
      { id: 's4', label: 'Tổng kết đánh giá', durationUs: 2_200_000, transitionId: 'dissolve' },
    ],
    texts: [
      { presetId: 'ttl_chapter_01', text: '01 / ĐÁNH GIÁ CHI TIẾT', startUs: 100_000, durationUs: 2_000_000 },
      { presetId: 'soc_rating_5star', text: '★★★★★ 4.9 / 5 ĐÁNG TIỀN', startUs: 5_000_000, durationUs: 3_000_000 },
    ],
  },
  {
    id: 'tpl_podcast_clip',
    name: 'Podcast Highlight 9:16',
    category: 'talking_head',
    categoryLabel: 'Talking Head',
    aspectRatio: '9:16',
    bpm: 92,
    desc: 'Khung 9:16 + Phụ đề Liquid Glass + Thẻ khách mời + Auto-Ducking',
    lutId: 'lut_teal_orange',
    musicId: 'mus_tech_studio',
    previewGradient: 'linear-gradient(135deg, #1e1b4b, #22d3ee)',
    slots: [
      { id: 's1', label: 'Đoạn hội thoại Podcast', durationUs: 6_000_000 },
    ],
    texts: [
      { presetId: 'lt_glass_speaker', text: 'Khách mời · Host Podcast', startUs: 200_000, durationUs: 3_000_000 },
      { presetId: 'krk_minimal_podcast', text: 'Chia sẻ góc nhìn thực tế nhất', startUs: 800_000, durationUs: 4_000_000, karaoke: true },
    ],
  },
  {
    id: 'tpl_food_slowmo',
    name: 'Food & Coffee Slow-Mo',
    category: 'vlog',
    categoryLabel: 'Vlog & Đời sống',
    aspectRatio: '9:16',
    bpm: 96,
    desc: 'Speed Curve Bullet làm chậm giọt cà phê + LUT Food Vibrant + Pro-Mist',
    lutId: 'lut_food_vibrant',
    musicId: 'mus_vlog_coffee',
    previewGradient: 'linear-gradient(135deg, #991b1b, #22c55e)',
    slots: [
      { id: 's1', label: 'Rót cà phê / Món ăn nóng', durationUs: 2_000_000, vfxId: 'dreamy', speedMode: 'curve', speedPreset: 'bullet' },
      { id: 's2', label: 'Cận cảnh thưởng thức 1', durationUs: 2_000_000, transitionId: 'water_ripple' },
      { id: 's3', label: 'Cận cảnh thưởng thức 2', durationUs: 2_000_000, transitionId: 'dissolve' },
    ],
    texts: [
      { presetId: 'lt_location_pin', text: 'QUÁN NGON SÀI GÒN', startUs: 300_000, durationUs: 2_800_000 },
    ],
  },
  {
    id: 'tpl_real_estate',
    name: 'Interior & Bất Động Sản',
    category: 'travel',
    categoryLabel: 'Du lịch & Kể chuyện',
    aspectRatio: '16:9',
    bpm: 104,
    desc: 'Chuyển cảnh Cross Dissolve sang trọng + LUT Golden Hour + Nhạc Acoustic',
    lutId: 'lut_golden_hour',
    musicId: 'mus_vlog_morning',
    previewGradient: 'linear-gradient(135deg, #78350f, #fbbf24)',
    slots: [
      { id: 's1', label: 'Phòng khách chính', durationUs: 2_200_000 },
      { id: 's2', label: 'Bếp & Nội thất', durationUs: 2_200_000, transitionId: 'dissolve' },
      { id: 's3', label: 'Ban công view đẹp', durationUs: 2_200_000, transitionId: 'iris_circle' },
    ],
    texts: [
      { presetId: 'lt_location_pin', text: 'PENTHOUSE VIEW SÔNG', startUs: 200_000, durationUs: 3_000_000 },
    ],
  },
  {
    id: 'tpl_flash_sale_1_1',
    name: 'Flash Sale Vuông 1:1',
    category: 'commercial',
    categoryLabel: 'Bán hàng & Review',
    aspectRatio: '1:1',
    bpm: 135,
    desc: 'Tỉ lệ 1:1 chạy Ads Facebook/IG + Glitch Cut + Bass Drop',
    lutId: 'lut_cinestill_800t',
    musicId: 'mus_beat_drift135',
    previewGradient: 'linear-gradient(135deg, #991b1b, #38bdf8)',
    slots: [
      { id: 's1', label: 'Cảnh 1 - Sản phẩm', durationUs: 1_500_000, vfxId: 'glitch' },
      { id: 's2', label: 'Cảnh 2 - Ưu đãi', durationUs: 1_500_000, transitionId: 'shake_cut' },
      { id: 's3', label: 'Cảnh 3 - Chốt đơn', durationUs: 1_800_000, transitionId: 'flash_white' },
    ],
    texts: [
      { presetId: 'soc_price_sale', text: 'FLASH SALE 50% NGAY', startUs: 200_000, durationUs: 4_000_000 },
    ],
  },
  {
    id: 'tpl_photo_memories',
    name: 'Slideshow Kỷ Niệm (Ken Burns)',
    category: 'travel',
    categoryLabel: 'Du lịch & Kể chuyện',
    aspectRatio: '16:9',
    bpm: 76,
    desc: 'Tự động tạo Keyframe Zoom Ken Burns + Film Burn + Piano sâu lắng',
    lutId: 'lut_dark_forest',
    musicId: 'mus_cine_piano',
    previewGradient: 'linear-gradient(135deg, #052e16, #a3e635)',
    slots: [
      { id: 's1', label: 'Ảnh / Clip kỷ niệm 1', durationUs: 2_500_000, kenBurnsZoom: true },
      { id: 's2', label: 'Ảnh / Clip kỷ niệm 2', durationUs: 2_500_000, kenBurnsZoom: true, transitionId: 'film_burn' },
      { id: 's3', label: 'Ảnh / Clip kỷ niệm 3', durationUs: 2_500_000, kenBurnsZoom: true, transitionId: 'dissolve' },
      { id: 's4', label: 'Ảnh / Clip kỷ niệm 4', durationUs: 2_500_000, kenBurnsZoom: true, transitionId: 'light_leak' },
    ],
    texts: [
      { presetId: 'krk_doc_serif', text: 'Những khoảnh khắc không thể nào quên', startUs: 500_000, durationUs: 4_500_000, karaoke: true },
    ],
  },
];

export const TEMPLATE_BY_ID: Record<string, VideoTemplatePreset> = Object.fromEntries(
  VIDEO_TEMPLATES_CATALOG.map((t) => [t.id, t])
);

/**
 * Instantiate a complete ready-to-edit Project timeline from a VideoTemplatePreset + matched slot MediaAssets + optional music MediaAsset.
 */
export function applyVideoTemplateToProject(
  baseProject: Project,
  template: VideoTemplatePreset,
  slotAssets: Array<MediaAsset | null>,
  musicAsset?: MediaAsset | null
): Project {
  const next = JSON.parse(JSON.stringify(baseProject)) as Project;
  const fresh = createEmptyProject(baseProject.id, `${template.name}`);
  fresh.assets = { ...next.assets };
  fresh.luts = { ...(next.luts ?? {}) };

  const dims = ASPECT_RATIO_DIMENSIONS[template.aspectRatio];
  fresh.settings.aspectRatio = template.aspectRatio;
  fresh.settings.width = dims.width;
  fresh.settings.height = dims.height;

  const mainTrack = fresh.tracks.find((t) => t.isMain) ?? fresh.tracks[0];
  const textTrack = fresh.tracks.find((t) => t.type === 'text') ?? fresh.tracks[0];
  const audioTrack = fresh.tracks.find((t) => t.type === 'audio') ?? fresh.tracks[0];

  const validFallbacks = slotAssets.filter((a): a is MediaAsset => Boolean(a));
  let cursorUs = 0;

  template.slots.forEach((slot, idx) => {
    const asset = slotAssets[idx] ?? validFallbacks[idx % Math.max(1, validFallbacks.length)];
    if (!asset) return;
    fresh.assets[asset.id] = asset;

    const clipId = `tpl_v_${idx}_${Date.now()}`;
    const vfx = slot.vfxId ? VFX_BY_ID[slot.vfxId] : undefined;
    const trans = slot.transitionId ? TRANSITION_BY_ID[slot.transitionId] : undefined;

    const cg = createDefaultColorGrade();
    cg.lutId = template.lutId;
    cg.lutName = template.lutId;
    cg.lutIntensity = 0.85;

    const speed = createDefaultSpeed();
    if (slot.speedMode === 'curve') {
      speed.mode = 'curve';
      speed.presetName = slot.speedPreset ?? 'montage';
      speed.curvePoints = [
        { position: 0, speed: 0.7 },
        { position: 0.4, speed: 2.5 },
        { position: 1, speed: 0.8 },
      ];
    } else if (slot.speedRate) {
      speed.rate = slot.speedRate;
    }

    const keyframes: Clip['keyframes'] = slot.kenBurnsZoom
      ? {
          scaleX: [
            { id: `kb1_${idx}`, timeUs: 0, value: 1.0, easing: [0.42, 0, 0.58, 1] },
            { id: `kb2_${idx}`, timeUs: slot.durationUs, value: 1.18, easing: [0.42, 0, 0.58, 1] },
          ],
          scaleY: [
            { id: `kb3_${idx}`, timeUs: 0, value: 1.0, easing: [0.42, 0, 0.58, 1] },
            { id: `kb4_${idx}`, timeUs: slot.durationUs, value: 1.18, easing: [0.42, 0, 0.58, 1] },
          ],
        }
      : {};

    const srcDur = asset.kind === 'image' ? slot.durationUs : Math.min(asset.durationUs, slot.durationUs);

    fresh.clips[clipId] = {
      id: clipId,
      trackId: mainTrack.id,
      assetId: asset.id,
      kind: asset.kind === 'image' ? 'image' : 'video',
      name: `${slot.label}`,
      timelineStartUs: cursorUs,
      durationUs: slot.durationUs,
      sourceStartUs: 0,
      sourceDurationUs: srcDur,
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: cg,
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed,
      audio: createDefaultAudioState(),
      keyframes,
      transitionIn: trans
        ? { id: `tr_${idx}`, name: trans.name, type: trans.id, durationUs: trans.defaultDurationUs }
        : null,
      effects: vfx
        ? [
            {
              id: `fx_${idx}`,
              name: vfx.name,
              shaderId: vfx.id,
              intensity: vfx.defaultIntensity,
              speed: vfx.defaultSpeed,
              scale: vfx.defaultScale,
              enabled: true,
            },
          ]
        : [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };

    cursorUs += slot.durationUs;
  });

  // Add Template Text / Karaoke Overlays
  template.texts.forEach((ts, ti) => {
    const preset = TEXT_CATALOG.find((p) => p.id === ts.presetId) ?? TEXT_CATALOG[0];
    const style = buildTextStyleFromPreset(preset, ts.text);
    if (ts.karaoke) {
      const rawWords = ts.text.trim().split(/\s+/);
      const step = Math.floor(ts.durationUs / Math.max(1, rawWords.length));
      style.karaokeEnabled = true;
      style.words = rawWords.map((w, wi) => ({
        text: w,
        startUs: ts.startUs + wi * step,
        endUs: wi === rawWords.length - 1 ? ts.startUs + ts.durationUs : ts.startUs + (wi + 1) * step,
      }));
    }
    const id = `tpl_txt_${ti}_${Date.now()}`;
    fresh.clips[id] = {
      id,
      trackId: textTrack.id,
      assetId: null,
      kind: 'text',
      name: ts.text.slice(0, 24),
      timelineStartUs: ts.startUs,
      durationUs: ts.durationUs,
      sourceStartUs: 0,
      sourceDurationUs: ts.durationUs,
      locked: false,
      disabled: false,
      transform: { ...createDefaultTransform(), y: preset.defaultY },
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: createDefaultAudioState(),
      keyframes: {},
      text: style,
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
  });

  // Add Template Background Music + Beat Markers
  if (musicAsset) {
    fresh.assets[musicAsset.id] = musicAsset;
    const totalTimelineUs = Math.max(cursorUs, 4 * US_PER_SEC);
    const musClipId = `tpl_mus_${Date.now()}`;
    fresh.clips[musClipId] = {
      id: musClipId,
      trackId: audioTrack.id,
      assetId: musicAsset.id,
      kind: 'audio',
      name: musicAsset.name,
      timelineStartUs: 0,
      durationUs: Math.min(totalTimelineUs, musicAsset.durationUs),
      sourceStartUs: 0,
      sourceDurationUs: Math.min(totalTimelineUs, musicAsset.durationUs),
      locked: false,
      disabled: false,
      transform: createDefaultTransform(),
      colorGrade: createDefaultColorGrade(),
      chromaKey: createDefaultChromaKey(),
      mask: createDefaultMask(),
      speed: createDefaultSpeed(),
      audio: { ...createDefaultAudioState(), volume: 0.72, fadeOutUs: 800_000, autoDucking: true },
      keyframes: {},
      effects: [],
      aiMattingEnabled: false,
      autoReframeEnabled: false,
    };
    (musicAsset.beatsUs ?? []).slice(0, 40).forEach((bUs, bi) => {
      if (bUs <= totalTimelineUs) {
        fresh.markers.push({ id: `tmk_${bi}`, timeUs: bUs, label: `Beat ${bi + 1}`, color: '#FFD60A', kind: 'beat' });
      }
    });
  }

  return fresh;
}
