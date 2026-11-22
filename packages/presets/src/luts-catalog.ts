export type LutCategory = 'cinema' | 'log' | 'vlog' | 'moody';

export interface BuiltinLutPreset {
  id: string;
  title: string;
  category: LutCategory;
  categoryLabel: string;
  desc: string;
  defaultIntensity: number;
  previewGradient: string;
  filename: string;
}

export const LUT_CATEGORIES: Array<{ id: LutCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả (16)' },
  { id: 'cinema', label: 'Điện ảnh' },
  { id: 'log', label: 'Camera Log' },
  { id: 'vlog', label: 'Vlog & Beauty' },
  { id: 'moody', label: 'Moody & Neon' },
];

export const LUTS_CATALOG: BuiltinLutPreset[] = [
  // Cinema (4)
  { id: 'lut_kodak_2383', title: 'Kodak 2383 Warm', category: 'cinema', categoryLabel: 'Điện ảnh', desc: 'Tương phản film rạp, highlight kem ấm & shadow xanh sâu', defaultIntensity: 0.85, previewGradient: 'linear-gradient(135deg, #164e63, #f59e0b)', filename: 'lut_kodak_2383.cube' },
  { id: 'lut_fuji_eterna', title: 'Fuji Eterna 250D', category: 'cinema', categoryLabel: 'Điện ảnh', desc: 'Màu phim Nhật dịu nhẹ, chuyển da tự nhiên', defaultIntensity: 0.85, previewGradient: 'linear-gradient(135deg, #065f46, #fcd34d)', filename: 'lut_fuji_eterna.cube' },
  { id: 'lut_cinestill_800t', title: 'CineStill 800T Night', category: 'cinema', categoryLabel: 'Điện ảnh', desc: 'Chuyên quay đêm Tungsten xanh lạnh & đèn neon ấm', defaultIntensity: 0.85, previewGradient: 'linear-gradient(135deg, #0f172a, #ef4444)', filename: 'lut_cinestill_800t.cube' },
  { id: 'lut_teal_orange', title: 'Teal & Orange Pro', category: 'cinema', categoryLabel: 'Điện ảnh', desc: 'Tách cam da người nổi bật trên nền xanh ngọc', defaultIntensity: 0.8, previewGradient: 'linear-gradient(135deg, #0e7490, #f97316)', filename: 'lut_teal_orange.cube' },

  // Camera Log (3)
  { id: 'lut_apple_log', title: 'Apple Log → Rec.709', category: 'log', categoryLabel: 'Camera Log', desc: 'Chuyển không gian màu phẳng iPhone Pro Apple Log về chuẩn', defaultIntensity: 1.0, previewGradient: 'linear-gradient(135deg, #334155, #38bdf8)', filename: 'lut_apple_log.cube' },
  { id: 'lut_sony_slog3', title: 'Sony S-Log3 → Rec.709', category: 'log', categoryLabel: 'Camera Log', desc: 'Khôi phục dải động chuẩn máy quay Sony Alpha / FX', defaultIntensity: 1.0, previewGradient: 'linear-gradient(135deg, #1e293b, #fbbf24)', filename: 'lut_sony_slog3.cube' },
  { id: 'lut_dji_dlogm', title: 'DJI D-Log M → Rec.709', category: 'log', categoryLabel: 'Camera Log', desc: 'Chuẩn màu cho DJI Pocket 3 / Mavic / Action', defaultIntensity: 1.0, previewGradient: 'linear-gradient(135deg, #14532d, #60a5fa)', filename: 'lut_dji_dlogm.cube' },

  // Vlog & Lifestyle (5)
  { id: 'lut_seoul_pastel', title: 'Seoul Pastel Clean', category: 'vlog', categoryLabel: 'Vlog & Beauty', desc: 'Trong trẻo sáng da Hàn Quốc cho Daily Vlog', defaultIntensity: 0.78, previewGradient: 'linear-gradient(135deg, #fbcfe8, #bae6fd)', filename: 'lut_seoul_pastel.cube' },
  { id: 'lut_golden_hour', title: 'Golden Hour Sunset', category: 'vlog', categoryLabel: 'Vlog & Beauty', desc: 'Nhuộm nắng chiều vàng mật ngọt ngào', defaultIntensity: 0.8, previewGradient: 'linear-gradient(135deg, #78350f, #fbbf24)', filename: 'lut_golden_hour.cube' },
  { id: 'lut_food_vibrant', title: 'Food & Coffee Vibrant', category: 'vlog', categoryLabel: 'Vlog & Beauty', desc: 'Tăng đỏ cam & xanh lá giúp món ăn bắt mắt', defaultIntensity: 0.8, previewGradient: 'linear-gradient(135deg, #991b1b, #22c55e)', filename: 'lut_food_vibrant.cube' },
  { id: 'lut_skin_glow', title: 'Natural Skin Glow', category: 'vlog', categoryLabel: 'Vlog & Beauty', desc: 'Sáng mịn tông da hồng hào cho Talking Head', defaultIntensity: 0.75, previewGradient: 'linear-gradient(135deg, #fecdd3, #fde68a)', filename: 'lut_skin_glow.cube' },
  { id: 'lut_minimal_bright', title: 'Minimal Bright Studio', category: 'vlog', categoryLabel: 'Vlog & Beauty', desc: 'Sạch sẽ, trắng trung tính cho Tech Review', defaultIntensity: 0.8, previewGradient: 'linear-gradient(135deg, #cbd5e1, #38bdf8)', filename: 'lut_minimal_bright.cube' },

  // Moody & Creative (4)
  { id: 'lut_tokyo_cyber', title: 'Tokyo Cyber Neon', category: 'moody', categoryLabel: 'Moody & Neon', desc: 'Tím magenta & xanh cyan đậm chất phố đêm Tokyo', defaultIntensity: 0.85, previewGradient: 'linear-gradient(135deg, #701a75, #06b6d4)', filename: 'lut_tokyo_cyber.cube' },
  { id: 'lut_nordic_cold', title: 'Nordic Cold Blue', category: 'moody', categoryLabel: 'Moody & Neon', desc: 'Xám xanh Bắc Âu tĩnh lặng, sang trọng', defaultIntensity: 0.82, previewGradient: 'linear-gradient(135deg, #0f172a, #7dd3fc)', filename: 'lut_nordic_cold.cube' },
  { id: 'lut_dark_forest', title: 'Dark Forest Moody', category: 'moody', categoryLabel: 'Moody & Neon', desc: 'Xanh rêu trầm & shadow tối sâu cho cảnh thiên nhiên', defaultIntensity: 0.82, previewGradient: 'linear-gradient(135deg, #052e16, #3f6212)', filename: 'lut_dark_forest.cube' },
  { id: 'lut_leica_bw', title: 'Leica Monochrom B&W', category: 'moody', categoryLabel: 'Moody & Neon', desc: 'Đen trắng độ tương phản cao chuẩn ống kính Leica', defaultIntensity: 1.0, previewGradient: 'linear-gradient(135deg, #09090b, #e4e4e7)', filename: 'lut_leica_bw.cube' },
];

export const LUT_BY_ID: Record<string, BuiltinLutPreset> = Object.fromEntries(LUTS_CATALOG.map((l) => [l.id, l]));
