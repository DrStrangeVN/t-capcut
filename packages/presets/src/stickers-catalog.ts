import type { StickerState } from '@t-capcut/schema';

export type StickerCategory = 'creator' | 'badge' | 'particle' | 'lottie';

export interface StickerPreset extends StickerState {
  id: string;
  desc: string;
  defaultDurationUs: number;
  previewEmoji: string;
}

export const STICKER_CATEGORIES: Array<{ id: StickerCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả (30)' },
  { id: 'lottie', label: 'Lottie Vector (6)' },
  { id: 'creator', label: 'Creator UI (10)' },
  { id: 'badge', label: 'Nhãn & Tem (8)' },
  { id: 'particle', label: 'Hạt Bay GPU (6)' },
];

function makeVectorLottie(opts: {
  name: string;
  color: [number, number, number, number];
  accent: [number, number, number, number];
  shape: 'pulse_ring' | 'star_burst' | 'rec_dot' | 'swipe_arrow' | 'flame_pop' | 'glass_pill';
}): string {
  const ease = { i: { x: [0.22], y: [1] }, o: { x: [0.36], y: [0] } };
  const shapeLayers: unknown[] = [];

  if (opts.shape === 'pulse_ring' || opts.shape === 'glass_pill') {
    shapeLayers.push({
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'Ring',
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [100], ...ease }, { t: 45, s: [0] }, { t: 60, s: [100] }] },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 200, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [60, 60, 100], ...ease }, { t: 45, s: [145, 145, 100] }, { t: 60, s: [60, 60, 100] }] },
      },
      shapes: [
        {
          ty: 'gr',
          it: [
            opts.shape === 'glass_pill'
              ? { ty: 'rc', d: 1, s: { a: 0, k: [260, 88] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 24 } }
              : { ty: 'el', d: 1, s: { a: 0, k: [180, 180] }, p: { a: 0, k: [0, 0] } },
            { ty: 'st', c: { a: 0, k: opts.color }, o: { a: 0, k: 100 }, w: { a: 0, k: 12 }, lc: 2, lj: 2 },
            { ty: 'fl', c: { a: 0, k: opts.accent }, o: { a: 0, k: 25 } },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    });
  } else if (opts.shape === 'star_burst' || opts.shape === 'flame_pop') {
    shapeLayers.push({
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'Star',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 60, s: [360] }] },
        p: { a: 0, k: [200, 200, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [75, 75, 100], ...ease }, { t: 30, s: [120, 120, 100], ...ease }, { t: 60, s: [75, 75, 100] }] },
      },
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'sr', sy: 1, d: 1, pt: { a: 0, k: opts.shape === 'star_burst' ? 6 : 8 }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 }, ir: { a: 0, k: 48 }, is: { a: 0, k: 0 }, or: { a: 0, k: 108 }, os: { a: 0, k: 0 } },
            { ty: 'fl', c: { a: 0, k: opts.color }, o: { a: 0, k: 92 } },
            { ty: 'st', c: { a: 0, k: opts.accent }, o: { a: 0, k: 100 }, w: { a: 0, k: 6 } },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    });
  } else {
    shapeLayers.push({
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'BadgeCore',
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [100] }, { t: 30, s: [35] }, { t: 60, s: [100] }] },
        r: { a: 0, k: 0 },
        p: { a: 1, k: [{ t: 0, s: [200, 225, 0], ...ease }, { t: 30, s: [200, 170, 0], ...ease }, { t: 60, s: [200, 225, 0] }] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'el', d: 1, s: { a: 0, k: [120, 120] }, p: { a: 0, k: [0, 0] } },
            { ty: 'fl', c: { a: 0, k: opts.color }, o: { a: 0, k: 95 } },
            { ty: 'st', c: { a: 0, k: opts.accent }, o: { a: 0, k: 100 }, w: { a: 0, k: 8 } },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    });
  }

  return JSON.stringify({
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 60,
    w: 400,
    h: 400,
    nm: opts.name,
    ddd: 0,
    assets: [],
    layers: shapeLayers,
  });
}

export const STICKERS_CATALOG: StickerPreset[] = [
  // Creator UI (10)
  { id: 'stk_subscribe', presetId: 'stk_subscribe', category: 'creator', name: 'Subscribe + Bell', label: 'ĐĂNG KÝ KÊNH', desc: 'Nút Subscribe đỏ kèm chuông thông báo rung', primaryColor: '#EF4444', secondaryColor: '#FFFFFF', iconType: 'subscribe', defaultDurationUs: 3_000_000, previewEmoji: '🔔' },
  { id: 'stk_like_thumb', presetId: 'stk_like_thumb', category: 'creator', name: 'Like Thumbs Up', label: 'THẢ TIM / LIKE', desc: 'Biểu tượng Like nảy bật sáng rực', primaryColor: '#3B82F6', secondaryColor: '#FACC15', iconType: 'like', defaultDurationUs: 2_500_000, previewEmoji: '👍' },
  { id: 'stk_rec_cam', presetId: 'stk_rec_cam', category: 'creator', name: 'REC ● Camera HUD', label: 'REC ● 4K', desc: 'Khung ngắm máy quay + chấm đỏ nhấp nháy', primaryColor: '#EF4444', secondaryColor: '#F8FAFC', iconType: 'rec', defaultDurationUs: 5_000_000, previewEmoji: '🎥' },
  { id: 'stk_countdown', presetId: 'stk_countdown', category: 'creator', name: 'Countdown 3-2-1', label: '3 · 2 · 1', desc: 'Đồng hồ đếm ngược 3 giây mở màn', primaryColor: '#22D3EE', secondaryColor: '#FFFFFF', iconType: 'countdown', defaultDurationUs: 3_000_000, previewEmoji: '⏱️' },
  { id: 'stk_arrow_cyan', presetId: 'stk_arrow_cyan', category: 'creator', name: 'Mũi Tên Chỉ Neon', label: 'CHÚ Ý', desc: 'Mũi tên cyan chuyển động chỉ vào vật thể', primaryColor: '#22D3EE', secondaryColor: '#0EA5E9', iconType: 'arrow', defaultDurationUs: 2_500_000, previewEmoji: '↗️' },
  { id: 'stk_circle_hl', presetId: 'stk_circle_hl', category: 'creator', name: 'Vòng Khoanh Đỏ', label: 'HIGHLIGHT', desc: 'Khoanh tròn vẽ tay nổi bật chi tiết', primaryColor: '#FB7185', secondaryColor: '#FFFFFF', iconType: 'circle', defaultDurationUs: 2_500_000, previewEmoji: '⭕' },
  { id: 'stk_waveform_hud', presetId: 'stk_waveform_hud', category: 'creator', name: 'Sóng Nhạc HUD', label: 'AUDIO WAVE', desc: 'Thanh equalizer nhảy theo nhịp', primaryColor: '#34D399', secondaryColor: '#22D3EE', iconType: 'wave', defaultDurationUs: 5_000_000, previewEmoji: '🎵' },
  { id: 'stk_progress_bar', presetId: 'stk_progress_bar', category: 'creator', name: 'Thanh Tiến Trình Clip', label: 'PROGRESS', desc: 'Thanh chạy tiến độ theo thời lượng clip', primaryColor: '#FACC15', secondaryColor: '#FFFFFF', iconType: 'progress', defaultDurationUs: 5_000_000, previewEmoji: '▬' },
  { id: 'stk_mic_live', presetId: 'stk_mic_live', category: 'creator', name: 'Podcast Mic Live', label: 'ON AIR', desc: 'Biểu tượng thu âm Podcast phát sáng', primaryColor: '#A78BFA', secondaryColor: '#F472B6', iconType: 'mic', defaultDurationUs: 4_000_000, previewEmoji: '🎙️' },
  { id: 'stk_cursor_click', presetId: 'stk_cursor_click', category: 'creator', name: 'Chuột Click Ripple', label: 'CLICK!', desc: 'Con trỏ chuột kèm vòng sóng chạm màn hình', primaryColor: '#FFFFFF', secondaryColor: '#22D3EE', iconType: 'cursor', defaultDurationUs: 2_000_000, previewEmoji: '🖱️' },

  // Badges (8)
  { id: 'stk_new', presetId: 'stk_new', category: 'badge', name: 'Tem NEW!', label: 'NEW', desc: 'Huy hiệu NEW góc bo tròn rực rỡ', primaryColor: '#22D3EE', secondaryColor: '#03121A', iconType: 'badge', defaultDurationUs: 3_000_000, previewEmoji: '✨' },
  { id: 'stk_hot', presetId: 'stk_hot', category: 'badge', name: 'Tem HOT TREND', label: '🔥 HOT', desc: 'Nhãn xu hướng đỏ cam bắt mắt', primaryColor: '#F97316', secondaryColor: '#FFFFFF', iconType: 'badge', defaultDurationUs: 3_000_000, previewEmoji: '🔥' },
  { id: 'stk_sale50', presetId: 'stk_sale50', category: 'badge', name: 'Nhãn SALE -50%', label: '-50% OFF', desc: 'Nhãn khuyến mãi bán hàng nổi bật', primaryColor: '#E11D48', secondaryColor: '#FFFFFF', iconType: 'badge', defaultDurationUs: 3_000_000, previewEmoji: '🏷️' },
  { id: 'stk_top1', presetId: 'stk_top1', category: 'badge', name: 'Huy Chương TOP 1', label: '★ TOP 1', desc: 'Huy hiệu vàng ranking sản phẩm', primaryColor: '#EAB308', secondaryColor: '#0F172A', iconType: 'badge', defaultDurationUs: 3_000_000, previewEmoji: '🏆' },
  { id: 'stk_verified', presetId: 'stk_verified', category: 'badge', name: 'Tích Xanh Verified', label: '✓ VERIFIED', desc: 'Nhãn xác thực chính hãng', primaryColor: '#0EA5E9', secondaryColor: '#FFFFFF', iconType: 'badge', defaultDurationUs: 3_000_000, previewEmoji: '☑️' },
  { id: 'stk_vip_pro', presetId: 'stk_vip_pro', category: 'badge', name: 'Nhãn PREMIUM', label: '✦ PRO CUT', desc: 'Huy hiệu tím indigo sang trọng', primaryColor: '#6366F1', secondaryColor: '#FFFFFF', iconType: 'badge', defaultDurationUs: 3_000_000, previewEmoji: '💎' },
  { id: 'stk_pin_map', presetId: 'stk_pin_map', category: 'badge', name: 'Location Pin Tag', label: 'CHECK-IN', desc: 'Thẻ địa điểm check-in du lịch', primaryColor: '#10B981', secondaryColor: '#FFFFFF', iconType: 'badge', defaultDurationUs: 3_000_000, previewEmoji: '📍' },
  { id: 'stk_cap_4k', presetId: 'stk_cap_4k', category: 'badge', name: 'Tem 4K ULTRA HD', label: '4K HDR', desc: 'Tem chất lượng hình ảnh rạp', primaryColor: '#334155', secondaryColor: '#67E8F9', iconType: 'badge', defaultDurationUs: 4_000_000, previewEmoji: '🎞️' },

  // Animated Particle Overlays (6)
  { id: 'ptc_snow', presetId: 'ptc_snow', category: 'particle', name: 'Tuyết Rơi Mùa Đông', desc: 'Hạt tuyết trắng rơi nhẹ có độ sâu trường ảnh', primaryColor: '#FFFFFF', secondaryColor: '#BAE6FD', particleType: 'snow', defaultDurationUs: 6_000_000, previewEmoji: '❄️' },
  { id: 'ptc_rain', presetId: 'ptc_rain', category: 'particle', name: 'Mưa Điện Ảnh', desc: 'Vệt mưa xiên tốc độ cao phong cách buồn/Noir', primaryColor: '#93C5FD', secondaryColor: '#E0F2FE', particleType: 'rain', defaultDurationUs: 6_000_000, previewEmoji: '🌧️' },
  { id: 'ptc_golden_dust', presetId: 'ptc_golden_dust', category: 'particle', name: 'Bụi Vàng Lấp Lánh', desc: 'Hạt bụi nắng vàng bay lơ lửng ấm áp', primaryColor: '#FDE047', secondaryColor: '#F59E0B', particleType: 'dust', defaultDurationUs: 6_000_000, previewEmoji: '✨' },
  { id: 'ptc_hearts', presetId: 'ptc_hearts', category: 'particle', name: 'Tim Hồng Bay Lên', desc: 'Trái tim hồng bay nổi mượt cho video tình cảm', primaryColor: '#FB7185', secondaryColor: '#F472B6', particleType: 'hearts', defaultDurationUs: 5_000_000, previewEmoji: '💖' },
  { id: 'ptc_confetti', presetId: 'ptc_confetti', category: 'particle', name: 'Pháo Giấy Chúc Mừng', desc: 'Confetti đa sắc rơi xoay chuyển động', primaryColor: '#22D3EE', secondaryColor: '#FACC15', particleType: 'confetti', defaultDurationUs: 4_000_000, previewEmoji: '🎉' },
  { id: 'ptc_bokeh', presetId: 'ptc_bokeh', category: 'particle', name: 'Bokeh Đêm Lấp Lánh', desc: 'Vòng tròn ánh sáng mờ lung linh lãng mạn', primaryColor: '#38BDF8', secondaryColor: '#C084FC', particleType: 'bokeh', defaultDurationUs: 6_000_000, previewEmoji: '🔵' },

  // Lottie Vector Motion Templates (6 — After Effects / LottieFiles Engine)
  { id: 'lt_pulse_ring', presetId: 'lt_pulse_ring', category: 'lottie', name: 'Lottie Cyber Tap Ring', label: 'TAP RING', desc: 'Vòng sóng vector Lottie lan tỏa nhấn điểm chạm', primaryColor: '#22D3EE', secondaryColor: '#6366F1', iconType: 'lottie', lottieJson: makeVectorLottie({ name: 'CyberTapRing', color: [0.13, 0.83, 0.93, 1], accent: [0.39, 0.4, 0.95, 1], shape: 'pulse_ring' }), lottieDurationSec: 2, defaultDurationUs: 3_000_000, previewEmoji: '💠' },
  { id: 'lt_star_burst', presetId: 'lt_star_burst', category: 'lottie', name: 'Lottie Starburst 6-Wing', label: 'SPARKLE', desc: 'Ngôi sao 6 cánh xoay co giãn vector Lottie', primaryColor: '#FACC15', secondaryColor: '#FFFFFF', iconType: 'lottie', lottieJson: makeVectorLottie({ name: 'StarBurst', color: [0.98, 0.8, 0.08, 1], accent: [1, 1, 1, 1], shape: 'star_burst' }), lottieDurationSec: 2, defaultDurationUs: 3_000_000, previewEmoji: '🌟' },
  { id: 'lt_glass_pill', presetId: 'lt_glass_pill', category: 'lottie', name: 'Lottie Liquid Glass Box', label: 'GLASS CARD', desc: 'Khung thẻ bo tròn pha lê bật nảy After Effects', primaryColor: '#67E8F9', secondaryColor: '#0EA5E9', iconType: 'lottie', lottieJson: makeVectorLottie({ name: 'GlassBox', color: [0.4, 0.91, 0.98, 1], accent: [0.05, 0.65, 0.91, 1], shape: 'glass_pill' }), lottieDurationSec: 2, defaultDurationUs: 3_500_000, previewEmoji: '🪟' },
  { id: 'lt_flame_pop', presetId: 'lt_flame_pop', category: 'lottie', name: 'Lottie Viral Nova Burst', label: 'VIRAL', desc: 'Bùng nổ tia 8 cánh cho cảnh cao trào', primaryColor: '#FB7185', secondaryColor: '#FDE047', iconType: 'lottie', lottieJson: makeVectorLottie({ name: 'ViralBurst', color: [0.98, 0.44, 0.52, 1], accent: [0.99, 0.88, 0.28, 1], shape: 'flame_pop' }), lottieDurationSec: 2, defaultDurationUs: 2_500_000, previewEmoji: '💥' },
  { id: 'lt_rec_pulse', presetId: 'lt_rec_pulse', category: 'lottie', name: 'Lottie Studio ON AIR Beacon', label: 'ON AIR', desc: 'Đèn nhấp nháy vector thu âm Live', primaryColor: '#EF4444', secondaryColor: '#FCA5A5', iconType: 'lottie', lottieJson: makeVectorLottie({ name: 'OnAir', color: [0.94, 0.27, 0.27, 1], accent: [0.99, 0.65, 0.65, 1], shape: 'rec_dot' }), lottieDurationSec: 2, defaultDurationUs: 4_000_000, previewEmoji: '🔴' },
  { id: 'lt_swipe_beacon', presetId: 'lt_swipe_beacon', category: 'lottie', name: 'Lottie Floating Beacon CTA', label: 'SWIPE UP', desc: 'Vòng nổi kêu gọi hành động lơ lửng', primaryColor: '#34D399', secondaryColor: '#FFFFFF', iconType: 'lottie', lottieJson: makeVectorLottie({ name: 'SwipeUp', color: [0.2, 0.83, 0.6, 1], accent: [1, 1, 1, 1], shape: 'swipe_arrow' }), lottieDurationSec: 2, defaultDurationUs: 3_000_000, previewEmoji: '⬆️' },
];
