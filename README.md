<p align="center">
  <img src="assets/logo.png" width="128" height="128" alt="T-CapCut Obsidian Liquid Glass Logo" />
</p>

# T-CapCut v4.0 — Obsidian Liquid Glass Video Editor + Universal Template & AI Studio

**T-CapCut** là trình dựng phim phi tuyến (NLE) local-first dành cho macOS Apple Silicon (và Web), được phát triển từ kết quả phân tích kiến trúc `CapCut.app` kết hợp chuẩn **macOS Tahoe 2-Layer Liquid Glass HIG** (`NSGlassEffectView` cho thanh nổi/toolbar + Obsidian Matte tương phản cao cho Content/Colorist).

## Kho Nội Dung & Hệ Sinh Thái Mẫu Dùng Chung (v4.0 — 100% Offline)

- **Universal Template Hub (Dùng chung mẫu từ CapCut, After Effects, Final Cut, DaVinci)**:
  - **CapCut / JianYing Draft Bridge v2**: Đọc `.capcut`, `draft_content.json` hoặc quét trực tiếp thư mục dự án CapCut trên Mac (`extra_material_refs` transitions/VFX/speed curve/audio fade/rich text) kèm **Báo Cáo Tương Thích (`%`) & Auto-Slot Replacement**.
  - **Lottie Motion Graphics Engine**: Tích hợp `lottie-web` chạy sẵn 6 mẫu vector Lottie offline + hỗ trợ nhập file `.json`/`.lottie` từ After Effects & LottieFiles.
  - **Interop 2 chiều FCPXML 1.11 / OTIO** + **Đóng gói chia sẻ `.tcapcut-tpl`** ("Lưu Thành Mẫu").
- **48 Hiệu Ứng GPU Shader VFX (`@t-capcut/presets`) + Multi-Pass Ping-Pong FBO Stack**:
  - Bổ sung 12 Shader v4.0: *Organic Perlin Shake Pro, Face Beauty Bilateral, Whip Zoom Beat Blur, Beat RGB Prism, Curved CRT Monitor, Rain Drops On Lens, Cyber Aura Edge Halo, Deep Bokeh Tilt-Shift Pro, 35mm Halation Pro, Anime Speed Lines, Plasma Violet Heat, Liquid Glass Ripple*.
- **32 Chuyển Cảnh Dual-Texture (`[⇄]` Nút Vết Cắt Nhanh + Auto-SFX Sync)**:
  - Bổ sung 8 chuyển cảnh mới: *3D Cube Perspective Spin, 3D Card Flip, Cinema Page Peel, Luma Cloud Matte, Whip Zoom Beat Cut, Talking-Head Morph Cut, Mosaic Glass Tiles, Radial RGB Hyper Flash*.
- **30 Sticker Động (6 Lottie Vector + 18 Creator UI/Badge + 6 GPU Particles)**:
  - Hỗ trợ nhập Lottie ngoài và Gizmo Scale/Rotate trực tiếp trên khung Player.
- **15 Nhạc Nền Studio (40–48s, Intro → Verse → Build-up → Drop → Outro) & 40 Creator SFX + Smart Music Remix**:
  - Hỗ trợ **Smart Music Remix** tự co giãn khớp đúng độ dài video với đoạn Outro kết mượt + **5-Band Parametric EQ, Compressor, Noise Gate, Pitch Semitones & Live LUFS Metering**.
- **25 Mẫu Chữ, Karaoke Viral, Text Behind Subject & Font Hệ Thống macOS**:
  - **1-Click Chữ Sau Chủ Thể** kẹp tiêu đề giữa hậu cảnh và chủ thể tách bằng Apple Vision + **Song ngữ VI/EN**.
- **On-Device AI Studio v4 + T-ChatCut v3 Agentic Director**:
  - **AI Auto-Highlight Viral 9:16**, **Click-to-Segment Vật Thể** (`VNGenerateForegroundInstanceMaskRequest`), **Offline AI Voiceover Tiếng Việt (`Linh`) / English + Tự tạo Karaoke**, **Xóa Từ Thừa ("ờ, à, ừm")**, **Chống rung 2D**, **Upscale 2× Crisp**, **Tách Vocals / Nhạc Nền (AI Stems)**, và **Script-to-Timeline** qua `T-ChatCut ⌘K`.
- **Hiệu năng & Pro NLE Workflow**:
  - **Binary WebSocket WYSIWYG Frame Pipe** + tùy chọn **10-bit HEVC (`p010le`)**, **Preview Resolution Scale (`Full` / `1/2` / `1/4`)**, **Hover Live-Preview** LUT & VFX, **Vectorscope** kèm I-Line tông da, **Context Menu Copy/Paste Attributes**, **Command Palette (`⌘P`)** & **Fullscreen Preview (`⌘⇧F`)**.

## Nâng cấp kiến trúc & UI/UX Pro NLE (v2.0 → v3.0)

- **Kiến trúc macOS Tahoe Liquid Glass + Pro NLE Ergonomics**:
  - Phân tách **Layer Chrome (Liquid Glass khúc xạ thật)** & **Layer Content (Matte tương phản cao tiết kiệm GPU)**, hỗ trợ `prefers-reduced-transparency`.
  - Native Swift 6 Shell (`WKUIDelegate` `NSOpenPanel`, **0-copy local file import**, chừa vùng traffic lights `78px`, chọn cổng động, tự nhúng runtime `node` arm64).
  - **Resizable Split Panes** kéo chỉnh cỡ mọi khung & thu gọn 1 chạm.
  - **Interactive On-Canvas Gizmo (Video / Overlay / Text / Sticker)**: kéo 4 góc Scale, tay cầm Xoay (Rotate), Crop 4 cạnh, **Double-Click sửa chữ trực tiếp trên khung hình**, **Chroma Eyedropper hút màu trực tiếp**, đường gióng Snap tâm.
  - **Before / After Split Wipe (`Compare`)**: thanh chia đôi kéo tay thời gian thực ngay trên Player để đối chiếu Frame gốc ↔ LUT + Multi-FX GPU.
  - **Multi-FX GPU Stack & Sync 1-Chạm**: đảo thứ tự FX (`▲`/`▼`), `Áp Màu/LUT All` / `Áp VFX All` sang toàn bộ clip cùng loại và `Reset Màu/LUT`.
- **Timeline 120Hz Zero-ReRender & Đa Track Pro**:
  - `PlaybackClock` tách khỏi React tree → **0 React re-render** trong suốt quá trình phát 60–120fps.
  - **⚡ Beat-Cut Auto-Split**: tự động cắt clip đang chọn khớp theo toàn bộ Beat Markers trên Timeline + nút vết cắt chuyển cảnh `[⇄]` không đè chữ.
  - Hỗ trợ **Compound Clips** hoàn chỉnh (play, export, double-click breadcrumb chỉnh sửa bên trong, Ungroup tách lại).
  - Kéo thả clip dọc sang track khác, **Marquee Box & Shift+Click Multi-Select**, kéo thả trực tiếp từ Media Bin & Finder, quản lý `+ Track` / `Solo (S)` / `Mute` / `Lock`, kéo/xóa **Keyframe Diamond**, **In/Out Range (`I` / `O`)**.
- **WebGL2 Compositor + Scopes + WebAudio Live Mixer**:
  - Multi-pass Custom GLSL FBO, **Heart & Star SDF**, pre-cache uniform, dirty-frame skip.
  - **Video Scopes Live** (RGB Parade & Luma Waveform) + **WebAudio Graph Engine** nghe trực tiếp âm lượng tới `200%`, Stereo Pan, Fade In/Out, Voice Preset + cột **Stereo VU Meter**.
- **Xuất Video 100% WYSIWYG + SSE Real-Time + Ảnh Bìa PNG**:
  - Hỗ trợ Fast Path (`VideoToolbox` + `lut3d` + `chromakey` + `alphamerge` + **Karaoke tô từng chữ** + multi-track Audio Mix) VÀ **Exact WYSIWYG GPU Frame-Pipe** khớp từng pixel Preview ↔ MP4.
  - Nút **Ảnh Bìa PNG (`Export Cover`)** xuất khung hình hiện tại độ phân giải gốc tức thì, thanh tiến trình SSE real-time (`%`, `fps`, `speed`), nút Hủy xuất, xuất theo vùng In/Out, và **Mở file trong Finder**.
- **On-Device AI (Apple Speech + Vision + T-ChatCut v2)**:
  - Tầng nhận diện giọng nói: `Whisper GGML` → `Parakeet CLI` → `Apple SFSpeechRecognizer` → VAD trung thực.
  - **T-ChatCut Copilot v2 (`Cmd+K`)**: thao tác theo clip chọn hoặc toàn timeline, tùy chọn kết nối **Local Ollama** / OpenAI / Gemini + Preview Ghost Diff.
- **Bảo mật & SQLite WAL JSON-Patch**:
  - Xác thực phiên `X-TCapCut-Token`, khóa CORS localhost, stream asset theo ID/allowlist, Streaming Upload 0-OOM cho video 4K nhiều GB, và nén lịch sử Undo/Redo bằng RFC 6902 JSON Patch.

## Cài đặt & Sử dụng

### Cách 1: Cài đặt trực tiếp từ file `.dmg` (macOS Apple Silicon)
1. Tải `T-CapCut-3.0.0-arm64.dmg` từ mục **Releases** (hoặc build bằng `pnpm build:app`).
2. Mở file `.dmg`, kéo **T-CapCut.app** vào thư mục **Applications** và mở ứng dụng. *(Toàn bộ 36 Shader VFX, 24 Transition, 16 `.cube` LUT, 15 Music, 40 SFX, 24 Sticker & 12 Video Template đã nhúng sẵn 100% offline. Để xuất video cần FFmpeg trên hệ thống nếu chưa cài: `brew install ffmpeg`)*

### Cách 2: Chạy từ mã nguồn (Development)
```bash
pnpm install
pnpm test        # Chạy toàn bộ test (schema, presets, engine, mcp, cli)
pnpm dev         # Chạy Engine (:47890) + Studio UI (:5173)
pnpm build:app   # Đóng gói dist/T-CapCut.app & dist/T-CapCut-3.0.0-arm64.dmg
```

## Phím tắt Pro NLE & CapCut
- `Space`: Phát / Tạm dừng
- `J` / `K` / `L`: Shuttle tua ngược (`-1x..-4x`), Dừng, Tua nhanh (`+1x..+4x`)
- `←` / `→` (`Shift + ←/→`): Bước từng `1` hoặc `10` khung hình
- `I` / `O`: Đặt điểm In / Out Range để Loop & Export vùng chọn
- `Cmd + B`: Cắt đôi clip tại Playhead (Split)
- `Q` / `W` hoặc `[` / `]`: Ripple Trim đầu / cuối clip
- `V` / `B`: Công cụ Select / Blade
- `M`: Gắn Marker tại Playhead
- `Option + Drag`: Nhân bản clip ngay trên Timeline
- `Delete` / `Backspace`: Xóa clip đang chọn (tự khít trên Main Track)
- `Cmd + Z` / `Cmd + Shift + Z`: Undo / Redo JSON-Patch + History Drawer
- `Cmd + K`: Mở **T-ChatCut v2 Copilot**
