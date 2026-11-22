export type TransitionCategory = 'camera' | 'light' | 'geometric' | 'glitch';

export interface TransitionPreset {
  id: string;
  transIndex: number; // 1..24 in TRANSITION_FRAGMENT_SHADER
  name: string;
  category: TransitionCategory;
  categoryLabel: string;
  desc: string;
  defaultDurationUs: number;
  recommendedSfxId?: string;
}

export const TRANSITION_CATEGORIES: Array<{ id: TransitionCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả (24)' },
  { id: 'camera', label: 'Camera' },
  { id: 'light', label: 'Ánh sáng' },
  { id: 'geometric', label: 'Hình học' },
  { id: 'glitch', label: 'Glitch & VFX' },
];

export const TRANSITIONS_CATALOG: TransitionPreset[] = [
  // Camera & Motion (1..7)
  { id: 'whip_left', transIndex: 1, name: 'Whip Pan Left', category: 'camera', categoryLabel: 'Camera', desc: 'Lia máy nhanh sang trái kèm motion blur', defaultDurationUs: 380_000, recommendedSfxId: 'sfx_whip_swish' },
  { id: 'whip_right', transIndex: 2, name: 'Whip Pan Right', category: 'camera', categoryLabel: 'Camera', desc: 'Lia máy nhanh sang phải kèm motion blur', defaultDurationUs: 380_000, recommendedSfxId: 'sfx_whip_swish' },
  { id: 'whip_up', transIndex: 3, name: 'Whip Pan Up', category: 'camera', categoryLabel: 'Camera', desc: 'Hất máy lên trên chuyển cảnh mượt', defaultDurationUs: 380_000, recommendedSfxId: 'sfx_fast_whoosh' },
  { id: 'whip_down', transIndex: 4, name: 'Whip Pan Down', category: 'camera', categoryLabel: 'Camera', desc: 'Hạ máy xuống dưới chuyển cảnh nhanh', defaultDurationUs: 380_000, recommendedSfxId: 'sfx_fast_whoosh' },
  { id: 'zoom_in', transIndex: 5, name: 'Zoom In Pull', category: 'camera', categoryLabel: 'Camera', desc: 'Hút vào tâm clip sau kèm mờ tốc độ', defaultDurationUs: 450_000, recommendedSfxId: 'sfx_deep_whoosh' },
  { id: 'zoom_out', transIndex: 6, name: 'Zoom Out Push', category: 'camera', categoryLabel: 'Camera', desc: 'Thu phóng lùi mở rộng sang cảnh mới', defaultDurationUs: 450_000, recommendedSfxId: 'sfx_air_pass' },
  { id: 'spin', transIndex: 7, name: 'Spin Vortex 360°', category: 'camera', categoryLabel: 'Camera', desc: 'Xoay xoáy ốc tốc độ cao giữa 2 cảnh', defaultDurationUs: 500_000, recommendedSfxId: 'sfx_whip_swish' },

  // Light & Film (8..12)
  { id: 'dissolve', transIndex: 8, name: 'Cross Dissolve', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Hòa tan chéo điện ảnh giữa Clip A & B', defaultDurationUs: 600_000 },
  { id: 'dip_black', transIndex: 9, name: 'Dip to Black', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Chuyển qua nền đen chuyển hồi chuyên nghiệp', defaultDurationUs: 700_000 },
  { id: 'flash_white', transIndex: 10, name: 'Camera Flash White', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Chớp sáng trắng đúng nhịp beat', defaultDurationUs: 350_000, recommendedSfxId: 'sfx_camera_shutter' },
  { id: 'film_burn', transIndex: 11, name: 'Film Burn Flash', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Cháy phim analog cam rực giữa 2 clip', defaultDurationUs: 550_000, recommendedSfxId: 'sfx_air_pass' },
  { id: 'light_leak', transIndex: 12, name: 'Light Leak Sweep', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Quét tia nắng vàng sang cảnh mới', defaultDurationUs: 600_000, recommendedSfxId: 'sfx_sparkle_magic' },

  // Geometric & Mask (13..18)
  { id: 'wipe_left', transIndex: 13, name: 'Wipe Left', category: 'geometric', categoryLabel: 'Hình học', desc: 'Gạt dải mịn từ phải qua trái', defaultDurationUs: 450_000, recommendedSfxId: 'sfx_fast_whoosh' },
  { id: 'wipe_right', transIndex: 14, name: 'Wipe Right', category: 'geometric', categoryLabel: 'Hình học', desc: 'Gạt dải mịn từ trái qua phải', defaultDurationUs: 450_000, recommendedSfxId: 'sfx_fast_whoosh' },
  { id: 'iris_circle', transIndex: 15, name: 'Iris Circle Open', category: 'geometric', categoryLabel: 'Hình học', desc: 'Mở vòng tròn từ tâm khung hình', defaultDurationUs: 550_000, recommendedSfxId: 'sfx_bubble_pop' },
  { id: 'split_curtains', transIndex: 16, name: 'Split Curtains', category: 'geometric', categoryLabel: 'Hình học', desc: 'Tách màn đôi sang 2 bên mở cảnh mới', defaultDurationUs: 500_000, recommendedSfxId: 'sfx_air_pass' },
  { id: 'clock_wipe', transIndex: 17, name: 'Clock Radial Wipe', category: 'geometric', categoryLabel: 'Hình học', desc: 'Quét kim đồng hồ 360°', defaultDurationUs: 550_000, recommendedSfxId: 'sfx_clock_tick' },
  { id: 'diagonal_slash', transIndex: 18, name: 'Diagonal Slash', category: 'geometric', categoryLabel: 'Hình học', desc: 'Đường chéo sắc nét cắt chuyển cảnh', defaultDurationUs: 420_000, recommendedSfxId: 'sfx_whip_swish' },

  // Glitch & Creative (19..24)
  { id: 'glitch', transIndex: 19, name: 'Glitch Tear', category: 'glitch', categoryLabel: 'Glitch & VFX', desc: 'Nhiễu sóng TV xé hình sang clip B', defaultDurationUs: 400_000, recommendedSfxId: 'sfx_glitch_sweep' },
  { id: 'chromatic', transIndex: 20, name: 'Chromatic Whip', category: 'glitch', categoryLabel: 'Glitch & VFX', desc: 'Tách kênh màu RGB phóng giật mạnh', defaultDurationUs: 420_000, recommendedSfxId: 'sfx_glitch_sweep' },
  { id: 'pixel_morph', transIndex: 21, name: 'Pixelate Morph', category: 'glitch', categoryLabel: 'Glitch & VFX', desc: 'Vỡ hạt pixel rồi tái tạo thành cảnh B', defaultDurationUs: 500_000, recommendedSfxId: 'sfx_laser_zap' },
  { id: 'water_ripple', transIndex: 22, name: 'Water Ripple Wave', category: 'glitch', categoryLabel: 'Glitch & VFX', desc: 'Gợn sóng mặt nước lan từ tâm', defaultDurationUs: 600_000, recommendedSfxId: 'sfx_bubble_pop' },
  { id: 'swirl_blur', transIndex: 23, name: 'Swirl Blur Warp', category: 'glitch', categoryLabel: 'Glitch & VFX', desc: 'Uốn xoáy mượt mà giữa hai khung hình', defaultDurationUs: 520_000, recommendedSfxId: 'sfx_deep_whoosh' },
  { id: 'shake_cut', transIndex: 24, name: 'Impact Shake Cut', category: 'glitch', categoryLabel: 'Glitch & VFX', desc: 'Giật rung mạnh tại điểm chuyển clip', defaultDurationUs: 350_000, recommendedSfxId: 'sfx_punch_hit' },
];

export const TRANSITION_BY_ID: Record<string, TransitionPreset> = Object.fromEntries(
  TRANSITIONS_CATALOG.map((t) => [t.id, t])
);
