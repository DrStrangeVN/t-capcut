import { US_PER_SEC } from '@t-capcut/schema';

export type AudioPresetKind = 'music' | 'sfx';
export type MusicMood = 'lofi' | 'beatsync' | 'vlog' | 'cinematic' | 'corporate' | 'pop';
export type SfxCategory = 'transitions' | 'ui' | 'impacts' | 'vlog' | 'ambience';

export interface AudioPreset {
  id: string;
  kind: AudioPresetKind;
  category: MusicMood | SfxCategory;
  categoryLabel: string;
  name: string;
  desc: string;
  bpm: number;
  durationSec: number;
  filename: string;
  beatsUs: number[];
  structure?: {
    introEndUs: number;
    dropUs: number;
    outroStartUs: number;
  };
}

function buildBeatGrid(bpm: number, durationSec: number): number[] {
  if (bpm <= 0) return [];
  const stepUs = Math.round((60 / bpm) * US_PER_SEC);
  const totalUs = Math.round(durationSec * US_PER_SEC);
  const beats: number[] = [];
  for (let t = 0; t < totalUs; t += stepUs) {
    beats.push(t);
  }
  return beats;
}

export const AUDIO_MUSIC_CATEGORIES: Array<{ id: MusicMood | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả Nhạc (15)' },
  { id: 'lofi', label: 'Lo-Fi Chill' },
  { id: 'beatsync', label: 'Beat-Sync' },
  { id: 'vlog', label: 'Vlog Acoustic' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'corporate', label: 'Tech / Review' },
  { id: 'pop', label: 'Upbeat Pop' },
];

export const AUDIO_SFX_CATEGORIES: Array<{ id: SfxCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả SFX (40)' },
  { id: 'transitions', label: 'Whoosh & Chuyển cảnh' },
  { id: 'ui', label: 'Pop & UI' },
  { id: 'impacts', label: 'Bass & Impact' },
  { id: 'vlog', label: 'Vlog & Reaction' },
  { id: 'ambience', label: 'Nền Môi Trường' },
];

const RAW_MUSIC: Array<Omit<AudioPreset, 'kind' | 'beatsUs'>> = [
  // Lo-Fi Chill (3)
  { id: 'mus_lofi_midnight', category: 'lofi', categoryLabel: 'Lo-Fi Chill', name: 'Midnight Study Rhodes', desc: 'Hợp âm Rhodes ấm + vinyl crackle + Reverb Studio 84 BPM', bpm: 84, durationSec: 44, filename: 'mus_lofi_midnight.m4a' },
  { id: 'mus_lofi_rainy', category: 'lofi', categoryLabel: 'Lo-Fi Chill', name: 'Rainy Saigon Cafe', desc: 'Lo-Fi piano thư giãn cấu trúc Intro-Verse-Outro 78 BPM', bpm: 78, durationSec: 46, filename: 'mus_lofi_rainy.m4a' },
  { id: 'mus_lofi_sunset', category: 'lofi', categoryLabel: 'Lo-Fi Chill', name: 'Golden Sunset Tape', desc: 'Âm hưởng tape analog êm dịu + stereo chorus 90 BPM', bpm: 90, durationSec: 42, filename: 'mus_lofi_sunset.m4a' },

  // Beat-Sync / EDM / Phonk (3)
  { id: 'mus_beat_tiktok128', category: 'beatsync', categoryLabel: 'Beat-Sync', name: 'Neon TikTok Pulse 128', desc: 'Kick trống sidechain + Build-up & Drop bùng nổ 128 BPM', bpm: 128, durationSec: 40, filename: 'mus_beat_tiktok128.m4a' },
  { id: 'mus_beat_drift135', category: 'beatsync', categoryLabel: 'Beat-Sync', name: 'Night Drift Cowbell 135', desc: 'Nhịp bass phonk + 808 glide + Drop gắt 135 BPM', bpm: 135, durationSec: 40, filename: 'mus_beat_drift135.m4a' },
  { id: 'mus_beat_cyber120', category: 'beatsync', categoryLabel: 'Beat-Sync', name: 'Cyber Future Bass 120', desc: 'Synth arp + SuperSaw Drop rõ từng phách 120 BPM', bpm: 120, durationSec: 42, filename: 'mus_beat_cyber120.m4a' },

  // Vlog Acoustic (3)
  { id: 'mus_vlog_morning', category: 'vlog', categoryLabel: 'Vlog Acoustic', name: 'Morning Acoustic Pluck', desc: 'Gảy đàn dây tươi sáng, điệp khúc rộn ràng 104 BPM', bpm: 104, durationSec: 44, filename: 'mus_vlog_morning.m4a' },
  { id: 'mus_vlog_coastal', category: 'vlog', categoryLabel: 'Vlog Acoustic', name: 'Coastal Breeze Indie', desc: 'Giai điệu du lịch thoáng đãng có Outro mượt 110 BPM', bpm: 110, durationSec: 44, filename: 'mus_vlog_coastal.m4a' },
  { id: 'mus_vlog_coffee', category: 'vlog', categoryLabel: 'Vlog Acoustic', name: 'Slow Coffee Strings', desc: 'Hợp âm mộc mạc + đàn dây ấm cho Food & Coffee 96 BPM', bpm: 96, durationSec: 45, filename: 'mus_vlog_coffee.m4a' },

  // Cinematic (3)
  { id: 'mus_cine_horizon', category: 'cinematic', categoryLabel: 'Cinematic', name: 'Endless Horizon Pad', desc: 'Pad giao hưởng sâu rộng + Sub Taiko cho Drone 72 BPM', bpm: 72, durationSec: 48, filename: 'mus_cine_horizon.m4a' },
  { id: 'mus_cine_piano', category: 'cinematic', categoryLabel: 'Cinematic', name: 'Memories Solo Piano', desc: 'Grand Piano cảm xúc kèm hồi âm Hall cho Kể chuyện 76 BPM', bpm: 76, durationSec: 46, filename: 'mus_cine_piano.m4a' },
  { id: 'mus_cine_epic', category: 'cinematic', categoryLabel: 'Cinematic', name: 'Titan Riser Pulse', desc: 'Nhịp trầm hùng ép cao trào + Braam Trailer 100 BPM', bpm: 100, durationSec: 44, filename: 'mus_cine_epic.m4a' },

  // Corporate Tech (2)
  { id: 'mus_tech_review', category: 'corporate', categoryLabel: 'Tech / Review', name: 'Clean Tech Minimal', desc: 'Nhạc nền hiện đại cho Review sản phẩm/công nghệ 112 BPM', bpm: 112, durationSec: 42, filename: 'mus_tech_review.m4a' },
  { id: 'mus_tech_studio', category: 'corporate', categoryLabel: 'Tech / Review', name: 'Podcast Talk Bed', desc: 'Nhịp nền tinh tế không lấn giọng nói 92 BPM', bpm: 92, durationSec: 45, filename: 'mus_tech_studio.m4a' },

  // Pop / Promo (15 total)
  { id: 'mus_pop_flash', category: 'pop', categoryLabel: 'Upbeat Pop', name: 'Flash Sale Groove', desc: 'Nhạc sôi động quảng cáo sản phẩm & Shorts 122 BPM', bpm: 122, durationSec: 40, filename: 'mus_pop_flash.m4a' },
];

const RAW_SFX: Array<Omit<AudioPreset, 'kind' | 'bpm' | 'beatsUs'>> = [
  // Transitions (8)
  { id: 'sfx_fast_whoosh', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Fast Whoosh', desc: 'Tiếng gió lướt nhanh', durationSec: 0.7, filename: 'sfx_fast_whoosh.m4a' },
  { id: 'sfx_deep_whoosh', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Deep Cinema Whoosh', desc: 'Chuyển cảnh trầm điện ảnh', durationSec: 1.2, filename: 'sfx_deep_whoosh.m4a' },
  { id: 'sfx_whip_swish', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Whip Pan Swish', desc: 'Lia máy gấp dứt khoát', durationSec: 0.5, filename: 'sfx_whip_swish.m4a' },
  { id: 'sfx_cinema_riser', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Tension Riser', desc: 'Tăng áp lực trước điểm bùng nổ', durationSec: 2.5, filename: 'sfx_cinema_riser.m4a' },
  { id: 'sfx_reverse_cymbal', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Reverse Shimmer', desc: 'Hút ngược ánh kim vào câu chốt', durationSec: 1.8, filename: 'sfx_reverse_cymbal.m4a' },
  { id: 'sfx_air_pass', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Soft Air Pass', desc: 'Lướt khí nhẹ giữa 2 đoạn Vlog', durationSec: 0.9, filename: 'sfx_air_pass.m4a' },
  { id: 'sfx_tape_stop', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Vinyl Tape Stop', desc: 'Tua chậm dừng băng đĩa bất ngờ', durationSec: 1.1, filename: 'sfx_tape_stop.m4a' },
  { id: 'sfx_glitch_sweep', category: 'transitions', categoryLabel: 'Chuyển cảnh', name: 'Digital Glitch Sweep', desc: 'Rè điện tử chuyển cảnh công nghệ', durationSec: 0.65, filename: 'sfx_glitch_sweep.m4a' },

  // UI & Pop (8)
  { id: 'sfx_bubble_pop', category: 'ui', categoryLabel: 'Pop & UI', name: 'Bubble Pop', desc: 'Tiếng pop hiện chữ / sticker kinh điển', durationSec: 0.35, filename: 'sfx_bubble_pop.m4a' },
  { id: 'sfx_crisp_click', category: 'ui', categoryLabel: 'Pop & UI', name: 'Crisp Mouse Click', desc: 'Click chuột sắc nét', durationSec: 0.25, filename: 'sfx_crisp_click.m4a' },
  { id: 'sfx_bell_ding', category: 'ui', categoryLabel: 'Pop & UI', name: 'Idea Bell Ding', desc: 'Chuông sáng kiến / đáp án đúng', durationSec: 1.4, filename: 'sfx_bell_ding.m4a' },
  { id: 'sfx_notif_chime', category: 'ui', categoryLabel: 'Pop & UI', name: 'Glass Chime', desc: 'Âm thông báo pha lê tinh tế', durationSec: 1.0, filename: 'sfx_notif_chime.m4a' },
  { id: 'sfx_camera_shutter', category: 'ui', categoryLabel: 'Pop & UI', name: 'DSLR Camera Shutter', desc: 'Tiếng bấm máy ảnh chụp màn hình', durationSec: 0.45, filename: 'sfx_camera_shutter.m4a' },
  { id: 'sfx_keyboard_type', category: 'ui', categoryLabel: 'Pop & UI', name: 'Mechanical Typewriter', desc: 'Gõ phím khớp hiệu ứng Typewriter', durationSec: 1.6, filename: 'sfx_keyboard_type.m4a' },
  { id: 'sfx_page_flip', category: 'ui', categoryLabel: 'Pop & UI', name: 'Paper Page Flip', desc: 'Lật trang giấy tài liệu', durationSec: 0.55, filename: 'sfx_page_flip.m4a' },
  { id: 'sfx_cash_ding', category: 'ui', categoryLabel: 'Pop & UI', name: 'Cha-Ching Coin', desc: 'Tiếng tiền vàng cho video sale/tài chính', durationSec: 1.1, filename: 'sfx_cash_ding.m4a' },

  // Impacts & Bass (8)
  { id: 'sfx_sub_boom', category: 'impacts', categoryLabel: 'Bass & Impact', name: 'Cinema Sub Boom', desc: 'Tiếng trống trầm rạp chiếu phim', durationSec: 1.8, filename: 'sfx_sub_boom.m4a' },
  { id: 'sfx_bass_drop', category: 'impacts', categoryLabel: 'Bass & Impact', name: '808 Bass Drop', desc: 'Sập bass kéo dài 808', durationSec: 1.6, filename: 'sfx_bass_drop.m4a' },
  { id: 'sfx_punch_hit', category: 'impacts', categoryLabel: 'Bass & Impact', name: 'Impact Punch Hit', desc: 'Va chạm mạnh đúng khung cắt', durationSec: 0.5, filename: 'sfx_punch_hit.m4a' },
  { id: 'sfx_door_slam', category: 'impacts', categoryLabel: 'Bass & Impact', name: 'Heavy Thud Slam', desc: 'Tiếng dậm nặng dứt khoát', durationSec: 0.7, filename: 'sfx_door_slam.m4a' },
  { id: 'sfx_metal_clang', category: 'impacts', categoryLabel: 'Bass & Impact', name: 'Metal Sword Clang', desc: 'Va chạm kim loại sắc lạnh', durationSec: 1.3, filename: 'sfx_metal_clang.m4a' },
  { id: 'sfx_thunder_rumble', category: 'impacts', categoryLabel: 'Bass & Impact', name: 'Distant Thunder', desc: 'Sấm rền nền kịch tính', durationSec: 2.6, filename: 'sfx_thunder_rumble.m4a' },
  { id: 'sfx_laser_zap', category: 'impacts', categoryLabel: 'Bass & Impact', name: 'Sci-Fi Laser Zap', desc: 'Tia la-de chuyển cảnh tương lai', durationSec: 0.55, filename: 'sfx_laser_zap.m4a' },
  { id: 'sfx_power_down', category: 'impacts', categoryLabel: 'Bass & Impact', name: 'System Power Down', desc: 'Tắt nguồn hạ pitch đột ngột', durationSec: 1.1, filename: 'sfx_power_down.m4a' },

  // Vlog & Reaction (8)
  { id: 'sfx_record_scratch', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Record Scratch Freeze', desc: 'Cào đĩa than dùng với Freeze Frame hài hước', durationSec: 0.65, filename: 'sfx_record_scratch.m4a' },
  { id: 'sfx_applause_burst', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Studio Applause', desc: 'Tràng pháo tay cổ vũ', durationSec: 2.4, filename: 'sfx_applause_burst.m4a' },
  { id: 'sfx_sparkle_magic', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Fairy Sparkle Magic', desc: 'Âm thanh lấp lánh biến hình', durationSec: 1.5, filename: 'sfx_sparkle_magic.m4a' },
  { id: 'sfx_cartoon_boing', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Comic Spring Boing', desc: 'Lò xo bật nảy vui nhộn', durationSec: 0.75, filename: 'sfx_cartoon_boing.m4a' },
  { id: 'sfx_clock_tick', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Stopwatch Ticking', desc: 'Tiếng tích tắc đếm giờ hồi hộp', durationSec: 2.0, filename: 'sfx_clock_tick.m4a' },
  { id: 'sfx_heartbeat', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Tense Heartbeat', desc: 'Nhịp tim đập kịch tính', durationSec: 2.0, filename: 'sfx_heartbeat.m4a' },
  { id: 'sfx_error_buzzer', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Quiz Error Buzzer', desc: 'Tiếng báo sai / troll hài', durationSec: 0.65, filename: 'sfx_error_buzzer.m4a' },
  { id: 'sfx_victory_fanfare', category: 'vlog', categoryLabel: 'Vlog & Reaction', name: 'Level Up Fanfare', desc: 'Hòa âm tăng hạng / hoàn thành', durationSec: 1.5, filename: 'sfx_victory_fanfare.m4a' },

  // Ambience Loops (8)
  { id: 'sfx_amb_rain', category: 'ambience', categoryLabel: 'Môi trường', name: 'Soft Night Rain', desc: 'Tiếng mưa rơi êm dịu', durationSec: 4.0, filename: 'sfx_amb_rain.m4a' },
  { id: 'sfx_amb_cafe', category: 'ambience', categoryLabel: 'Môi trường', name: 'Warm Room Ambience', desc: 'Không gian phòng ấm cho Vlog', durationSec: 4.0, filename: 'sfx_amb_cafe.m4a' },
  { id: 'sfx_amb_vinyl', category: 'ambience', categoryLabel: 'Môi trường', name: 'Vintage Vinyl Crackle', desc: 'Tiếng nổ lách tách đĩa than cũ', durationSec: 4.0, filename: 'sfx_amb_vinyl.m4a' },
  { id: 'sfx_amb_ocean', category: 'ambience', categoryLabel: 'Môi trường', name: 'Ocean Waves Shore', desc: 'Sóng biển vỗ rì rào theo chu kỳ', durationSec: 4.0, filename: 'sfx_amb_ocean.m4a' },
  { id: 'sfx_amb_forest', category: 'ambience', categoryLabel: 'Môi trường', name: 'Morning Forest Chirps', desc: 'Tiếng chim hót rừng ban mai', durationSec: 4.0, filename: 'sfx_amb_forest.m4a' },
  { id: 'sfx_amb_city', category: 'ambience', categoryLabel: 'Môi trường', name: 'Night City Hum', desc: 'Âm nền thành phố về đêm', durationSec: 4.0, filename: 'sfx_amb_city.m4a' },
  { id: 'sfx_amb_fire', category: 'ambience', categoryLabel: 'Môi trường', name: 'Campfire Crackling', desc: 'Tiếng lửa trại tí tách', durationSec: 4.0, filename: 'sfx_amb_fire.m4a' },
  { id: 'sfx_amb_wind', category: 'ambience', categoryLabel: 'Môi trường', name: 'Mountain Wind Breeze', desc: 'Gió thổi đỉnh núi thoáng đạt', durationSec: 4.0, filename: 'sfx_amb_wind.m4a' },
];

export const AUDIO_MUSIC_CATALOG: AudioPreset[] = RAW_MUSIC.map((m) => ({
  ...m,
  kind: 'music',
  beatsUs: buildBeatGrid(m.bpm, m.durationSec),
  structure: {
    introEndUs: Math.round(m.durationSec * 0.18 * US_PER_SEC),
    dropUs: Math.round(m.durationSec * 0.42 * US_PER_SEC),
    outroStartUs: Math.round(m.durationSec * 0.84 * US_PER_SEC),
  },
}));

export const AUDIO_SFX_CATALOG: AudioPreset[] = RAW_SFX.map((s) => ({
  ...s,
  kind: 'sfx',
  bpm: 0,
  beatsUs: [],
}));

export const ALL_AUDIO_CATALOG: AudioPreset[] = [...AUDIO_MUSIC_CATALOG, ...AUDIO_SFX_CATALOG];
export const AUDIO_BY_ID: Record<string, AudioPreset> = Object.fromEntries(ALL_AUDIO_CATALOG.map((a) => [a.id, a]));
