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

export type TemplateCategory =
  | 'beatsync'
  | 'vlog'
  | 'talking_head'
  | 'commercial'
  | 'travel'
  | 'intro_outro'
  | 'gaming'
  | 'slideshow';

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
  { id: 'all', label: 'Tất cả (24)' },
  { id: 'beatsync', label: 'Beat-Sync & Velocity' },
  { id: 'vlog', label: 'Vlog & Aesthetic' },
  { id: 'talking_head', label: 'Talking Head & Podcast' },
  { id: 'commercial', label: 'Bán hàng & Review' },
  { id: 'travel', label: 'Du lịch & Cinematic' },
  { id: 'intro_outro', label: 'Intro & Outro' },
  { id: 'gaming', label: 'Gaming & Anime' },
  { id: 'slideshow', label: 'Photo Dump & Lyrics' },
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
  {
    id: 'tpl_velocity_edit',
    name: 'CapCut Velocity Sync Edit (5 Slots)',
    category: 'beatsync',
    categoryLabel: 'Beat-Sync & Velocity',
    aspectRatio: '9:16',
    bpm: 135,
    desc: 'Trend giật nhịp Velocity Speed Curve + Radial RGB Flash + Whip Zoom',
    lutId: 'lut_tokyo_cyber',
    musicId: 'mus_beat_drift135',
    previewGradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    slots: [
      { id: 's1', label: 'Mở đầu slow-in', durationUs: 1_400_000, speedMode: 'curve', speedPreset: 'hero', vfxId: 'radial_zoom_fast' },
      { id: 's2', label: 'Drop #1 Velocity', durationUs: 900_000, transitionId: 'whip_zoom_blur', speedMode: 'curve', speedPreset: 'montage' },
      { id: 's3', label: 'Drop #2 Beat Split', durationUs: 900_000, transitionId: 'radial_rgb_flash', vfxId: 'beat_rgb_split' },
      { id: 's4', label: 'Drop #3 Flip 3D', durationUs: 900_000, transitionId: 'card_flip', speedMode: 'curve', speedPreset: 'bullet' },
      { id: 's5', label: 'Kết chậm ngầu', durationUs: 1_500_000, transitionId: 'flash_white', vfxId: 'subject_neon_glow' },
    ],
    texts: [
      { presetId: 'krk_neon_cyber', text: 'VELOCITY ON THE BEAT', startUs: 1_300_000, durationUs: 2_600_000, karaoke: true },
    ],
  },
  {
    id: 'tpl_capcut_intro_neon',
    name: 'CapCut Neon Glitch Intro (5s)',
    category: 'intro_outro',
    categoryLabel: 'Intro & Outro',
    aspectRatio: '16:9',
    bpm: 120,
    desc: 'Intro mở kênh YouTube / Streamer với Cyber Grid + Neon Glitch Title',
    lutId: 'lut_cinestill_800t',
    musicId: 'mus_beat_cyber120',
    previewGradient: 'linear-gradient(135deg, #0ea5e9, #a855f7)',
    slots: [
      { id: 's1', label: 'Clip highlight nền 1', durationUs: 2_200_000, vfxId: 'cyber_grid' },
      { id: 's2', label: 'Clip highlight nền 2', durationUs: 2_500_000, transitionId: 'glitch', vfxId: 'chromatic' },
    ],
    texts: [
      { presetId: 'ttl_glitch_intro', text: 'CHÀO MỪNG TỚI KÊNH CỦA TÔI', startUs: 200_000, durationUs: 3_600_000 },
      { presetId: 'lt_channel_handle', text: '@TCAPCUT.CREATOR', startUs: 1_200_000, durationUs: 3_000_000 },
    ],
  },
  {
    id: 'tpl_capcut_outro_cta',
    name: 'CapCut Ending Subscribe Outro',
    category: 'intro_outro',
    categoryLabel: 'Intro & Outro',
    aspectRatio: '16:9',
    bpm: 112,
    desc: 'End-screen chuyên nghiệp với Frosted Glass + CTA Đăng ký & Like',
    lutId: 'lut_minimal_bright',
    musicId: 'mus_tech_review',
    previewGradient: 'linear-gradient(135deg, #1e293b, #06b6d4)',
    slots: [
      { id: 's1', label: 'Cảnh hậu trường / Video kết thúc', durationUs: 5_000_000, vfxId: 'frosted_glass', kenBurnsZoom: true },
    ],
    texts: [
      { presetId: 'ttl_minimal_quote', text: 'CẢM ƠN BẠN ĐÃ XEM HẾT VIDEO', startUs: 200_000, durationUs: 4_500_000 },
      { presetId: 'soc_cta_link', text: 'LIKE · SHARE · SUBSCRIBE KÊNH NGAY ↑', startUs: 1_400_000, durationUs: 3_400_000 },
    ],
  },
  {
    id: 'tpl_photo_dump_polaroid',
    name: 'Photo Dump Polaroid 2026 (6 Ảnh)',
    category: 'slideshow',
    categoryLabel: 'Photo Dump & Lyrics',
    aspectRatio: '9:16',
    bpm: 104,
    desc: 'Khung ảnh Polaroid + Cuộn trang Page Peel + Nhạc Acoustic Morning',
    lutId: 'lut_seoul_pastel',
    musicId: 'mus_vlog_morning',
    previewGradient: 'linear-gradient(135deg, #f472b6, #fde047)',
    slots: [
      { id: 's1', label: 'Ảnh 1', durationUs: 1_150_000, vfxId: 'polaroid_frame', kenBurnsZoom: true },
      { id: 's2', label: 'Ảnh 2', durationUs: 1_150_000, transitionId: 'page_peel', vfxId: 'polaroid_frame' },
      { id: 's3', label: 'Ảnh 3', durationUs: 1_150_000, transitionId: 'card_flip', kenBurnsZoom: true },
      { id: 's4', label: 'Ảnh 4', durationUs: 1_150_000, transitionId: 'light_leak', vfxId: 'super8_grain' },
      { id: 's5', label: 'Ảnh 5', durationUs: 1_150_000, transitionId: 'mosaic_tiles' },
      { id: 's6', label: 'Ảnh 6 kết', durationUs: 1_400_000, transitionId: 'dissolve', kenBurnsZoom: true },
    ],
    texts: [
      { presetId: 'ttl_vlog_stamp', text: '2026 PHOTO DUMP RECAP ✨', startUs: 150_000, durationUs: 3_500_000 },
      { presetId: 'lt_music_credit', text: '♫ Morning Acoustic Pluck · 104 BPM', startUs: 3_800_000, durationUs: 3_000_000 },
    ],
  },
  {
    id: 'tpl_gaming_montage_rgb',
    name: 'Gaming Montage Valorant / PUBG',
    category: 'gaming',
    categoryLabel: 'Gaming & Anime',
    aspectRatio: '16:9',
    bpm: 128,
    desc: 'Highlight Clutch + Perlin Camera Shake + RGB Beat Split + Speed Cut',
    lutId: 'lut_tokyo_cyber',
    musicId: 'mus_beat_tiktok128',
    previewGradient: 'linear-gradient(135deg, #b91c1c, #0f172a)',
    slots: [
      { id: 's1', label: 'Setup pha giao tranh', durationUs: 1_800_000, speedMode: 'curve', speedPreset: 'hero' },
      { id: 's2', label: 'Highlight Kill 1', durationUs: 950_000, transitionId: 'shake_cut', vfxId: 'perlin_shake' },
      { id: 's3', label: 'Highlight Kill 2', durationUs: 950_000, transitionId: 'radial_rgb_flash', vfxId: 'beat_rgb_split' },
      { id: 's4', label: 'Clutch Finish', durationUs: 1_800_000, transitionId: 'cube_turn', vfxId: 'speed_lines' },
    ],
    texts: [
      { presetId: 'krk_comic_punch', text: 'UNSTOPPABLE ACE CLUTCH!', startUs: 1_700_000, durationUs: 2_500_000, karaoke: true },
    ],
  },
  {
    id: 'tpl_anime_amv_flash',
    name: 'Anime AMV & Speed Lines',
    category: 'gaming',
    categoryLabel: 'Gaming & Anime',
    aspectRatio: '9:16',
    bpm: 135,
    desc: 'Tia tốc độ Manga Speed Lines + Chớp Flash White + Whip Down đúng nhịp',
    lutId: 'lut_cinestill_800t',
    musicId: 'mus_beat_drift135',
    previewGradient: 'linear-gradient(135deg, #4338ca, #f43f5e)',
    slots: [
      { id: 's1', label: 'Cảnh anime 1', durationUs: 1_100_000, vfxId: 'speed_lines' },
      { id: 's2', label: 'Cảnh biến hình 2', durationUs: 1_100_000, transitionId: 'flash_white', vfxId: 'beat_pulse' },
      { id: 's3', label: 'Cảnh tung chiêu 3', durationUs: 1_100_000, transitionId: 'whip_down', vfxId: 'chromatic' },
      { id: 's4', label: 'Kết khung ngầu', durationUs: 1_500_000, transitionId: 'zoom_out', vfxId: 'cine_halation_pro' },
    ],
    texts: [
      { presetId: 'ttl_glitch_intro', text: 'LIMIT BREAK MODE', startUs: 200_000, durationUs: 2_200_000 },
    ],
  },
  {
    id: 'tpl_lyrics_music_video',
    name: 'Music Video & Aesthetic Lyrics',
    category: 'slideshow',
    categoryLabel: 'Photo Dump & Lyrics',
    aspectRatio: '9:16',
    bpm: 78,
    desc: 'Phụ đề hát Karaoke chữ mềm Liquid Glass + Rain Lens + Lo-Fi Rainy',
    lutId: 'lut_nordic_cold',
    musicId: 'mus_lofi_rainy',
    previewGradient: 'linear-gradient(135deg, #0f172a, #38bdf8)',
    slots: [
      { id: 's1', label: 'Cảnh mưa / Đêm chill 1', durationUs: 3_000_000, vfxId: 'rain_lens' },
      { id: 's2', label: 'Cảnh đèn phố 2', durationUs: 3_000_000, transitionId: 'luma_fade', vfxId: 'dreamy' },
    ],
    texts: [
      { presetId: 'krk_liquid_glass', text: 'Chiều mưa Sài Gòn nhớ một người thương', startUs: 300_000, durationUs: 5_200_000, karaoke: true },
      { presetId: 'lt_music_credit', text: 'Rainy Saigon Cafe · Lo-Fi Studio', startUs: 200_000, durationUs: 2_800_000 },
    ],
  },
  {
    id: 'tpl_podcast_clip_pro',
    name: 'Podcast & Debate Shorts Pro',
    category: 'talking_head',
    categoryLabel: 'Talking Head & Podcast',
    aspectRatio: '9:16',
    bpm: 92,
    desc: 'Phụ đề Hormozi Pop giữ chân người xem + Morph Dissolve cắt mượt jump cut',
    lutId: 'lut_apple_log',
    musicId: 'mus_tech_studio',
    previewGradient: 'linear-gradient(135deg, #312e81, #fbbf24)',
    slots: [
      { id: 's1', label: 'Câu mở Hook gây tò mò', durationUs: 2_500_000 },
      { id: 's2', label: 'Luận điểm chính (Auto Morph)', durationUs: 3_500_000, transitionId: 'morph_dissolve' },
    ],
    texts: [
      { presetId: 'ttl_hook_hook', text: 'SỰ THẬT ÍT AI DÁM NÓI!', startUs: 0, durationUs: 1_800_000 },
      { presetId: 'krk_hormozi', text: 'Đừng bao giờ bỏ qua bước quan trọng nhất này', startUs: 1_900_000, durationUs: 3_800_000, karaoke: true },
    ],
  },
  {
    id: 'tpl_fashion_lookbook',
    name: 'Fashion & Beauty Lookbook',
    category: 'vlog',
    categoryLabel: 'Vlog & Aesthetic',
    aspectRatio: '9:16',
    bpm: 90,
    desc: 'Làm mịn da Beauty + Cine Halation Pro + Màu phim dịu Seoul Pastel',
    lutId: 'lut_seoul_pastel',
    musicId: 'mus_lofi_sunset',
    previewGradient: 'linear-gradient(135deg, #fbcfe8, #818cf8)',
    slots: [
      { id: 's1', label: 'Toàn thân Outfit 1', durationUs: 2_000_000, vfxId: 'skin_beauty' },
      { id: 's2', label: 'Cận trang phục / Phụ kiện', durationUs: 1_800_000, transitionId: 'light_leak', vfxId: 'cine_halation_pro' },
      { id: 's3', label: 'Tạo dáng Outfit 2', durationUs: 2_200_000, transitionId: 'luma_fade', vfxId: 'skin_beauty' },
    ],
    texts: [
      { presetId: 'ttl_minimal_quote', text: 'AUTUMN LOOKBOOK · OOTD', startUs: 250_000, durationUs: 2_800_000 },
    ],
  },
  {
    id: 'tpl_food_review_tasty',
    name: 'Ẩm Thực & Review Quán Ngon',
    category: 'commercial',
    categoryLabel: 'Bán hàng & Review',
    aspectRatio: '9:16',
    bpm: 110,
    desc: 'Màu món ăn rực rỡ + Miniature Tilt Focus + Pin Địa điểm & Rating 5 Sao',
    lutId: 'lut_food_vibrant',
    musicId: 'mus_vlog_coastal',
    previewGradient: 'linear-gradient(135deg, #dc2626, #f59e0b)',
    slots: [
      { id: 's1', label: 'Biển hiệu & Không gian quán', durationUs: 1_800_000 },
      { id: 's2', label: 'Cận món ăn đặc trưng', durationUs: 1_800_000, transitionId: 'wipe_left', vfxId: 'miniature_tilt' },
      { id: 's3', label: 'Gắp / Cắt món hấp dẫn', durationUs: 2_000_000, transitionId: 'water_ripple' },
    ],
    texts: [
      { presetId: 'lt_location_pin', text: 'QUÁN BÍ MẬT · QUẬN 1', startUs: 150_000, durationUs: 2_500_000 },
      { presetId: 'soc_rating_5star', text: '★★★★★ NGON NHỨC NÁCH', startUs: 3_000_000, durationUs: 2_400_000 },
    ],
  },
  {
    id: 'tpl_real_estate_tour',
    name: 'Luxury Drone & Villa Tour',
    category: 'travel',
    categoryLabel: 'Du lịch & Cinematic',
    aspectRatio: '16:9',
    bpm: 100,
    desc: 'Nhạc giao hưởng Epic + LUT DJI D-Log M + Chuyển cảnh Cube Turn mượt mà',
    lutId: 'lut_dji_dlogm',
    musicId: 'mus_cine_epic',
    previewGradient: 'linear-gradient(135deg, #064e3b, #38bdf8)',
    slots: [
      { id: 's1', label: 'Flycam toàn khu', durationUs: 2_500_000, vfxId: 'god_rays' },
      { id: 's2', label: 'Cảnh kiến trúc chính', durationUs: 2_400_000, transitionId: 'cube_turn' },
      { id: 's3', label: 'Hồ bơi / Cảnh quan đêm', durationUs: 2_500_000, transitionId: 'luma_fade', vfxId: 'anamorphic_flare' },
    ],
    texts: [
      { presetId: 'ttl_cinematic_letter', text: 'SIGNATURE COLLECTION', startUs: 200_000, durationUs: 3_000_000 },
      { presetId: 'lt_camera_exif', text: '4K · 60FPS · D-LOG M', startUs: 3_800_000, durationUs: 2_500_000 },
    ],
  },
  {
    id: 'tpl_fitness_pump_135',
    name: 'Gym Transformation & Sports',
    category: 'beatsync',
    categoryLabel: 'Beat-Sync & Velocity',
    aspectRatio: '9:16',
    bpm: 135,
    desc: 'Phonk Beat 135 BPM + Impact Shake Cut + Trước/Sau lột xác ấn tượng',
    lutId: 'lut_leica_bw',
    musicId: 'mus_beat_drift135',
    previewGradient: 'linear-gradient(135deg, #18181b, #ef4444)',
    slots: [
      { id: 's1', label: 'Quá trình tập luyện', durationUs: 1_800_000, vfxId: 'cinema_flicker' },
      { id: 's2', label: 'Khoảnh khắc bứt phá', durationUs: 1_200_000, transitionId: 'shake_cut', speedMode: 'curve', speedPreset: 'jump_cut' },
      { id: 's3', label: 'Thành quả (After)', durationUs: 2_000_000, transitionId: 'radial_rgb_flash', vfxId: 'beat_pulse' },
    ],
    texts: [
      { presetId: 'soc_before_label', text: 'DAY 1  →  DAY 90', startUs: 200_000, durationUs: 2_400_000 },
      { presetId: 'krk_sweep_fill', text: 'KHÔNG BAO GIỜ BỎ CUỘC', startUs: 2_800_000, durationUs: 2_000_000, karaoke: true },
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
  musicAsset?: MediaAsset | null,
  opts?: { slotSlipUs?: Record<number, number>; textOverrides?: Record<number, string> }
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

    const requestedSlipUs = Math.max(0, opts?.slotSlipUs?.[idx] ?? 0);
    const maxSlipUs = asset.kind === 'image' ? 0 : Math.max(0, asset.durationUs - slot.durationUs);
    const clampedSlipUs = Math.min(requestedSlipUs, maxSlipUs);
    const srcDur = asset.kind === 'image' ? slot.durationUs : Math.min(Math.max(0, asset.durationUs - clampedSlipUs), slot.durationUs);

    fresh.clips[clipId] = {
      id: clipId,
      trackId: mainTrack.id,
      assetId: asset.id,
      kind: asset.kind === 'image' ? 'image' : 'video',
      name: `${slot.label}`,
      timelineStartUs: cursorUs,
      durationUs: slot.durationUs,
      sourceStartUs: clampedSlipUs,
      sourceDurationUs: srcDur,
      locked: false,
      disabled: false,
      transform: { ...createDefaultTransform(), fillMode: 'cover' },
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
    const finalText = opts?.textOverrides?.[ti]?.trim() ? opts.textOverrides[ti]!.trim() : ts.text;
    const style = buildTextStyleFromPreset(preset, finalText);
    if (ts.karaoke) {
      const rawWords = finalText.trim().split(/\s+/);
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
      name: finalText.slice(0, 24),
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
