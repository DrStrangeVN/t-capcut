<p align="center">
  <img src="assets/logo.png" width="128" height="128" alt="T-CapCut Obsidian Liquid Glass Logo" />
</p>

# T-CapCut — Obsidian Liquid Glass Video Editor

**T-CapCut** là trình dựng phim phi tuyến (NLE) local-first dành cho macOS Apple Silicon (và Web), được thiết kế từ kết quả phân tích kiến trúc thực tế của `CapCut.app` kết hợp ngôn ngữ giao diện **Obsidian Liquid Glass** và hệ sinh thái mã nguồn mở (`OpenCut`, `OpenChatCut`, `LosslessCut`, `pyJianYingDraft`, `WebGL2`).

## Tính năng nổi bật

- **Obsidian Liquid Glass UI (120Hz)**: Vỏ native Swift 6 (`NSVisualEffectView` + `WKWebView`), hiệu ứng kính 4 lớp bắt sáng theo con trỏ chuột, thanh điều khiển nổi, **Ambient Video Glow**, **Colorist Focus Mode**.
- **WebGL2 GPU Multi-Layer Compositor**: 12 Blend Modes, Color Grading (Exposure/Contrast/Vibrance/Temp/Tint/Sharpness/Vignette), Lift/Gamma/Gain Color Wheels, **RGB Curves**, **8-Channel Selective HSL**, **3D `.cube` LUT**, **Chroma Key**, **Geometric Masking**, 8 Shader VFX/Transitions, và **Custom GLSL Shader Plugin Editor**.
- **Virtualized 120Hz Canvas Timeline**: Magnetic Main Track, Split (`Cmd+B`), Ripple Trim (`Q`/`W`), Blade (`B`), **Freeze Frame**, **Compound Clips**, filmstrip thumbnails, mipmap audio waveforms, Keyframe Cubic Bezier, Beat/Scene Markers (`M`).
- **Engine SQLite WAL + Hardware VideoToolbox**: Lưu trữ crash-proof với Undo/Redo phân nhánh, Proxy VideoToolbox, **Segment Pre-Render Cache**, **Smart Lossless Hybrid Stream-Copy Export**, **Hardware VideoToolbox Export + `-14 LUFS` + Sidechain Auto-Ducking + Voice Presets**, **Batch Render Queue**.
- **On-Device AI (Apple Vision + Whisper)**: Tách nền người offline (`VNGeneratePersonSegmentationRequest`), Auto-Reframe 9:16 bám mặt (`VNDetectFaceRectanglesRequest`), dò khoảng lặng (`silencedetect`), dò cảnh (`scdet`), bắt beat âm thanh, **Text-Based RoughCut**, và **T-ChatCut Copilot (`Cmd+K`)** kèm **MCP Server (`tcapcut-mcp`)**.
- **Interop 2 chiều**: Đọc/ghi **CapCut `draft_content.json`**, xuất **FCPXML 1.11** (Final Cut Pro), **OpenTimelineIO (`.otio`)** (DaVinci Resolve), **ASS Karaoke / SRT / VTT**.

## Cài đặt & Sử dụng

### Cách 1: Cài đặt trực tiếp từ file `.dmg` (macOS Apple Silicon)
1. Tải `T-CapCut-1.0.0-arm64.dmg` từ mục **Releases** (hoặc build bằng `pnpm build:app`).
2. Mở file `.dmg`, kéo **T-CapCut.app** vào thư mục **Applications** và mở ứng dụng.

### Cách 2: Chạy từ mã nguồn (Development)
```bash
pnpm install
pnpm test        # Chạy toàn bộ test (schema, engine, mcp, cli)
pnpm dev         # Chạy Engine (:47890) + Studio UI (:5173)
pnpm build:app   # Đóng gói dist/T-CapCut.app & dist/T-CapCut-1.0.0-arm64.dmg
```

## Phím tắt chuẩn CapCut
- `Space`: Phát / Tạm dừng
- `Cmd + B`: Cắt đôi clip tại Playhead (Split)
- `Q` / `W`: Ripple Trim đầu / cuối clip
- `V` / `B`: Công cụ Select / Blade
- `M`: Gắn Marker tại Playhead
- `Delete` / `Backspace`: Xóa clip (tự khít trên Main Track)
- `Cmd + Z` / `Cmd + Shift + Z`: Undo / Redo phân nhánh SQLite WAL
- `Cmd + K`: Mở **T-ChatCut Copilot**
