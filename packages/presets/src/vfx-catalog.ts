export type VfxCategory = 'retro' | 'light' | 'glitch' | 'camera' | 'blur' | 'stylize';

export interface VfxPreset {
  id: string;
  shaderIndex: number; // 1..36 in VFX_FRAGMENT_SHADER
  name: string;
  category: VfxCategory;
  categoryLabel: string;
  desc: string;
  defaultIntensity: number;
  defaultSpeed: number;
  defaultScale: number;
  previewGradient: string;
}

export const VFX_CATEGORIES: Array<{ id: VfxCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả (36)' },
  { id: 'retro', label: 'Retro & Film' },
  { id: 'light', label: 'Ánh sáng' },
  { id: 'glitch', label: 'Glitch & Cyber' },
  { id: 'camera', label: 'Camera' },
  { id: 'blur', label: 'Mờ & Focus' },
  { id: 'stylize', label: 'Nghệ thuật' },
];

export const VFX_CATALOG: VfxPreset[] = [
  // Retro & Film (1..6)
  { id: 'vhs', shaderIndex: 1, name: 'VHS 90s Tracking', category: 'retro', categoryLabel: 'Retro & Film', desc: 'Đường quét băng từ & nhiễu tracking cổ điển', defaultIntensity: 0.72, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #3b0764, #db2777)' },
  { id: 'super8_grain', shaderIndex: 2, name: 'Super 8mm Grain', category: 'retro', categoryLabel: 'Retro & Film', desc: 'Hạt phim 8mm hữu cơ + xước phim dọc', defaultIntensity: 0.65, defaultSpeed: 1.2, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #451a03, #b45309)' },
  { id: 'halation', shaderIndex: 3, name: 'Kodak Halation Bloom', category: 'retro', categoryLabel: 'Retro & Film', desc: 'Quầng đỏ cam quanh vùng sáng chuẩn Kodak', defaultIntensity: 0.75, defaultSpeed: 1, defaultScale: 1.2, previewGradient: 'linear-gradient(135deg, #7f1d1d, #f97316)' },
  { id: 'crt_scan', shaderIndex: 4, name: 'CRT TV Scanlines', category: 'retro', categoryLabel: 'Retro & Film', desc: 'Màn hình TV ống phóng tia cong & RGB grid', defaultIntensity: 0.68, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #0f172a, #0ea5e9)' },
  { id: 'cinema_flicker', shaderIndex: 5, name: 'Old Cinema Flicker', category: 'retro', categoryLabel: 'Retro & Film', desc: 'Nhấp nháy máy chiếu phim rạp cổ điển', defaultIntensity: 0.55, defaultSpeed: 1.4, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #27272a, #a16207)' },
  { id: 'polaroid_frame', shaderIndex: 6, name: 'Polaroid Frame Vignette', category: 'retro', categoryLabel: 'Retro & Film', desc: 'Viền ảnh chụp lấy liền + màu ấm nhẹ', defaultIntensity: 0.8, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #f5f5f4, #78716c)' },

  // Light & Lens (7..12)
  { id: 'anamorphic_flare', shaderIndex: 7, name: 'Anamorphic Lens Flare', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Tia sáng ngang điện ảnh xanh lam Sci-Fi', defaultIntensity: 0.78, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #082f49, #38bdf8)' },
  { id: 'prism_rainbow', shaderIndex: 8, name: 'Prism Rainbow Refraction', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Khúc xạ lăng kính 7 sắc quanh viền', defaultIntensity: 0.7, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #ec4899, #22d3ee)' },
  { id: 'light_leak', shaderIndex: 9, name: 'Warm Light Leak', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Ánh sáng hở phim cam vàng chuyển động', defaultIntensity: 0.72, defaultSpeed: 0.8, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #9a3412, #fbbf24)' },
  { id: 'god_rays', shaderIndex: 10, name: 'God Rays (Sunburst)', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Tia nắng xuyên sương tỏa từ góc trên', defaultIntensity: 0.65, defaultSpeed: 0.9, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #713f12, #fde047)' },
  { id: 'dreamy', shaderIndex: 11, name: 'Dreamy Pro-Mist Glow', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Kính lọc Black Pro-Mist làm mịn da & sáng mờ', defaultIntensity: 0.7, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #4c1d95, #f472b6)' },
  { id: 'film_burn', shaderIndex: 12, name: 'Analog Film Burn', category: 'light', categoryLabel: 'Ánh sáng', desc: 'Cháy sáng cuộn phim analog rực rỡ', defaultIntensity: 0.78, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #b91c1c, #facc15)' },

  // Glitch & Cyber (13..18)
  { id: 'glitch', shaderIndex: 13, name: 'Cyber RGB Split', category: 'glitch', categoryLabel: 'Glitch & Cyber', desc: 'Xé dải ngang + lệch kênh màu Cyberpunk', defaultIntensity: 0.72, defaultSpeed: 1.3, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #be185d, #06b6d4)' },
  { id: 'datamosh_block', shaderIndex: 14, name: 'Digital Datamosh Block', category: 'glitch', categoryLabel: 'Glitch & Cyber', desc: 'Vỡ khối nén video 8x8 giật theo nhịp', defaultIntensity: 0.65, defaultSpeed: 1.4, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #312e81, #22d3ee)' },
  { id: 'pixel_sort', shaderIndex: 15, name: 'Pixel Sort Drift', category: 'glitch', categoryLabel: 'Glitch & Cyber', desc: 'Kéo sợi pixel nghệ thuật theo vùng sáng', defaultIntensity: 0.7, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #1e1b4b, #a855f7)' },
  { id: 'hologram_scan', shaderIndex: 16, name: 'Hologram Scan', category: 'glitch', categoryLabel: 'Glitch & Cyber', desc: 'Ảnh ba chiều cyan Sci-Fi + đường quét', defaultIntensity: 0.75, defaultSpeed: 1.2, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #083344, #67e8f9)' },
  { id: 'neon_edge', shaderIndex: 17, name: 'Neon Sobel Edge Glow', category: 'glitch', categoryLabel: 'Glitch & Cyber', desc: 'Phát hiện viền phát sáng neon điện tử', defaultIntensity: 0.75, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #09090b, #22d3ee)' },
  { id: 'cyber_grid', shaderIndex: 18, name: 'Cyber HUD Grid', category: 'glitch', categoryLabel: 'Glitch & Cyber', desc: 'Lưới đo kỹ thuật số & viền HUD tương lai', defaultIntensity: 0.68, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #022c22, #10b981)' },

  // Camera & Motion (19..24)
  { id: 'camera_shake', shaderIndex: 19, name: 'Handheld Camera Shake', category: 'camera', categoryLabel: 'Camera', desc: 'Rung máy cầm tay tự nhiên / giật nhịp', defaultIntensity: 0.6, defaultSpeed: 1.5, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #1e293b, #64748b)' },
  { id: 'beat_pulse', shaderIndex: 20, name: 'Beat-Sync Zoom Pulse', category: 'camera', categoryLabel: 'Camera', desc: 'Nhịp zoom phóng nảy theo beat EDM/TikTok', defaultIntensity: 0.72, defaultSpeed: 1.4, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #701a75, #e879f9)' },
  { id: 'zoom_blur', shaderIndex: 21, name: 'Radial Speed Blur', category: 'camera', categoryLabel: 'Camera', desc: 'Mờ tốc độ hút tâm siêu động', defaultIntensity: 0.72, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #1d4ed8, #38bdf8)' },
  { id: 'motion_blur', shaderIndex: 22, name: 'Directional Motion Blur', category: 'camera', categoryLabel: 'Camera', desc: 'Mờ chuyển động ngang tốc độ cao', defaultIntensity: 0.68, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #334155, #cbd5e1)' },
  { id: 'fisheye', shaderIndex: 23, name: 'Fisheye Wide Lens', category: 'camera', categoryLabel: 'Camera', desc: 'Ống kính mắt cá góc siêu rộng Action Cam', defaultIntensity: 0.7, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #065f46, #34d399)' },
  { id: 'kaleidoscope', shaderIndex: 24, name: 'Kaleidoscope Mirror', category: 'camera', categoryLabel: 'Camera', desc: 'Kính vạn hoa phản chiếu đa giác Music Video', defaultIntensity: 0.75, defaultSpeed: 0.8, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #581c87, #f43f5e)' },

  // Blur & Focus (25..30)
  { id: 'gaussian_blur', shaderIndex: 25, name: 'Gaussian Soft Blur', category: 'blur', categoryLabel: 'Mờ & Focus', desc: 'Làm mờ mịn nền cho tiêu đề / intro', defaultIntensity: 0.65, defaultSpeed: 1, defaultScale: 1.2, previewGradient: 'linear-gradient(135deg, #1e293b, #94a3b8)' },
  { id: 'tilt_shift', shaderIndex: 26, name: 'Tilt-Shift Miniature', category: 'blur', categoryLabel: 'Mờ & Focus', desc: 'Nét băng giữa, mờ trên dưới hiệu ứng mô hình', defaultIntensity: 0.75, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #0369a1, #bae6fd)' },
  { id: 'radial_focus', shaderIndex: 27, name: 'Radial Focus Bokeh', category: 'blur', categoryLabel: 'Mờ & Focus', desc: 'Làm nổi bật chủ thể tâm, mờ dần viền ngoài', defaultIntensity: 0.72, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #1e1b4b, #818cf8)' },
  { id: 'pixel_mosaic', shaderIndex: 28, name: 'Pixel Mosaic Censor', category: 'blur', categoryLabel: 'Mờ & Focus', desc: 'Ô vuông pixel che mặt / biển số xe', defaultIntensity: 0.7, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #374151, #9ca3af)' },
  { id: 'frosted_glass', shaderIndex: 29, name: 'Liquid Frosted Glass', category: 'blur', categoryLabel: 'Mờ & Focus', desc: 'Kính mờ khúc xạ hạt pha lê Tahoe', defaultIntensity: 0.7, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #164e63, #a5f3fc)' },
  { id: 'chromatic', shaderIndex: 30, name: 'Chromatic Lens Edge', category: 'blur', categoryLabel: 'Mờ & Focus', desc: 'Tán sắc viền thấu kính quang học', defaultIntensity: 0.72, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #312e81, #fb7185)' },

  // Stylize & Art (31..36)
  { id: 'halftone', shaderIndex: 31, name: 'Halftone Comic Dots', category: 'stylize', categoryLabel: 'Nghệ thuật', desc: 'Chấm bi truyện tranh Pop-Art cổ điển', defaultIntensity: 0.75, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #eab308, #ef4444)' },
  { id: 'oil_paint', shaderIndex: 32, name: 'Oil Brush Painterly', category: 'stylize', categoryLabel: 'Nghệ thuật', desc: 'Làm mượt mảng màu giống tranh sơn dầu', defaultIntensity: 0.75, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #0f766e, #f59e0b)' },
  { id: 'duotone', shaderIndex: 33, name: 'Duotone Pop Poster', category: 'stylize', categoryLabel: 'Nghệ thuật', desc: 'Tách 2 tông Tím-Cyan nổi bật Spotify', defaultIntensity: 0.85, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #6d28d9, #22d3ee)' },
  { id: 'thermal', shaderIndex: 34, name: 'Thermal Heat Vision', category: 'stylize', categoryLabel: 'Nghệ thuật', desc: 'Camera tầm nhiệt hồng ngoại Predator', defaultIntensity: 0.85, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #1d4ed8, #ef4444)' },
  { id: 'night_vision', shaderIndex: 35, name: 'Night Vision Green', category: 'stylize', categoryLabel: 'Nghệ thuật', desc: 'Kính nhìn đêm xanh lục + hạt nhiễu nhẹ', defaultIntensity: 0.8, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #052e16, #22c55e)' },
  { id: 'sketch_outline', shaderIndex: 36, name: 'Sketch Pencil Outline', category: 'stylize', categoryLabel: 'Nghệ thuật', desc: 'Nét vẽ bút chì trên giấy trắng', defaultIntensity: 0.8, defaultSpeed: 1, defaultScale: 1, previewGradient: 'linear-gradient(135deg, #e5e7eb, #374151)' },
];

export const VFX_BY_ID: Record<string, VfxPreset> = Object.fromEntries(VFX_CATALOG.map((v) => [v.id, v]));
