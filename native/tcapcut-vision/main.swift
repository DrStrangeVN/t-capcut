import Foundation
import AVFoundation
import Vision
import CoreImage
import CoreGraphics
import CoreText
import ImageIO
import Metal
import Speech
import UniformTypeIdentifiers

struct FaceTrackPoint: Codable {
    let timeUs: Int64
    let centerX: Double
    let centerY: Double
    let width: Double
    let height: Double
    let confidence: Float
}

struct FaceTrackReport: Codable {
    let width: Int
    let height: Int
    let durationUs: Int64
    let points: [FaceTrackPoint]
}

struct BenchmarkReport: Codable {
    let metalDevice: String
    let supportsAppleFamily: Bool
    let visionPersonSegmentation: Bool
    let visionFaceDetection: Bool
    let speechRecognitionAvailable: Bool
}

struct SpeechWord: Codable {
    let text: String
    let startUs: Int64
    let endUs: Int64
    let confidence: Float
}

struct SpeechSegment: Codable {
    let id: String
    let startUs: Int64
    let endUs: Int64
    let text: String
    let words: [SpeechWord]
}

struct SpeechReport: Codable {
    let engine: String
    let locale: String
    let segments: [SpeechSegment]
}

func printJson<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted]
    if let data = try? encoder.encode(value), let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func runBenchmark() {
    let device = MTLCreateSystemDefaultDevice()
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    let report = BenchmarkReport(
        metalDevice: device?.name ?? "Unavailable",
        supportsAppleFamily: device?.supportsFamily(.apple7) ?? false,
        visionPersonSegmentation: true,
        visionFaceDetection: true,
        speechRecognitionAvailable: recognizer?.isAvailable ?? false
    )
    printJson(report)
}

func runFaceTrack(inputPath: String, outputPath: String, sampleIntervalSec: Double = 0.25) throws {
    let url = URL(fileURLWithPath: inputPath)
    let asset = AVURLAsset(url: url)
    let sem = DispatchSemaphore(value: 0)
    var videoTrack: AVAssetTrack?
    var durationSec: Double = 0

    Task {
        let tracks = try? await asset.loadTracks(withMediaType: .video)
        videoTrack = tracks?.first
        let dur = try? await asset.load(.duration)
        durationSec = dur?.seconds ?? 0
        sem.signal()
    }
    sem.wait()

    guard let track = videoTrack else {
        throw NSError(domain: "tcapcut-vision", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video track found"])
    }

    var naturalSize = CGSize(width: 1920, height: 1080)
    let sem2 = DispatchSemaphore(value: 0)
    Task {
        if let sz = try? await track.load(.naturalSize) {
            naturalSize = sz
        }
        sem2.signal()
    }
    sem2.wait()

    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.05, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)
    generator.maximumSize = CGSize(width: 640, height: 640)

    var points: [FaceTrackPoint] = []
    let faceRequest = VNDetectFaceRectanglesRequest()

    var t: Double = 0
    while t <= durationSec {
        let cmTime = CMTime(seconds: t, preferredTimescale: 600)
        if let cgImg = try? generator.copyCGImage(at: cmTime, actualTime: nil) {
            let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
            try? handler.perform([faceRequest])
            if let best = faceRequest.results?.max(by: { ($0.boundingBox.width * $0.boundingBox.height) < ($1.boundingBox.width * $1.boundingBox.height) }) {
                let box = best.boundingBox
                // Vision boundingBox origin is bottom-left; convert Y to top-left normalized [0..1]
                points.append(FaceTrackPoint(
                    timeUs: Int64(t * 1_000_000.0),
                    centerX: Double(box.midX),
                    centerY: Double(1.0 - box.midY),
                    width: Double(box.width),
                    height: Double(box.height),
                    confidence: best.confidence
                ))
            }
        }
        t += sampleIntervalSec
    }

    let report = FaceTrackReport(
        width: Int(naturalSize.width),
        height: Int(naturalSize.height),
        durationUs: Int64(durationSec * 1_000_000.0),
        points: points
    )

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted]
    let data = try encoder.encode(report)
    try data.write(to: URL(fileURLWithPath: outputPath))
    print("{\"ok\":true,\"points\":\(points.count)}")
}

func runPersonMatting(inputPath: String, outputPath: String, quality: String = "balanced") throws {
    let url = URL(fileURLWithPath: inputPath)
    let asset = AVURLAsset(url: url)

    let sem = DispatchSemaphore(value: 0)
    var videoTrack: AVAssetTrack?
    var naturalSize = CGSize(width: 1280, height: 720)
    var nominalFps: Float = 30.0
    var preferredTransform = CGAffineTransform.identity

    Task {
        let tracks = try? await asset.loadTracks(withMediaType: .video)
        videoTrack = tracks?.first
        if let vt = videoTrack {
            naturalSize = (try? await vt.load(.naturalSize)) ?? naturalSize
            nominalFps = (try? await vt.load(.nominalFrameRate)) ?? 30.0
            preferredTransform = (try? await vt.load(.preferredTransform)) ?? .identity
        }
        sem.signal()
    }
    sem.wait()

    guard let track = videoTrack else {
        throw NSError(domain: "tcapcut-vision", code: 2, userInfo: [NSLocalizedDescriptionKey: "No video track found"])
    }

    let width = max(2, Int(abs(naturalSize.width)) & ~1)
    let height = max(2, Int(abs(naturalSize.height)) & ~1)

    let reader = try AVAssetReader(asset: asset)
    let readerSettings: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: readerSettings)
    readerOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(readerOutput) else {
        throw NSError(domain: "tcapcut-vision", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot add reader output"])
    }
    reader.add(readerOutput)

    let outUrl = URL(fileURLWithPath: outputPath)
    if FileManager.default.fileExists(atPath: outputPath) {
        try FileManager.default.removeItem(at: outUrl)
    }

    let writer = try AVAssetWriter(outputURL: outUrl, fileType: .mp4)
    let writerSettings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 4_000_000,
            AVVideoExpectedSourceFrameRateKey: nominalFps
        ]
    ]
    let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: writerSettings)
    writerInput.expectsMediaDataInRealTime = false
    writerInput.transform = preferredTransform

    let adaptorAttrs: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: writerInput, sourcePixelBufferAttributes: adaptorAttrs)

    guard writer.canAdd(writerInput) else {
        throw NSError(domain: "tcapcut-vision", code: 4, userInfo: [NSLocalizedDescriptionKey: "Cannot add writer input"])
    }
    writer.add(writerInput)

    guard reader.startReading() else {
        throw NSError(domain: "tcapcut-vision", code: 5, userInfo: [NSLocalizedDescriptionKey: "Reader failed to start"])
    }
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    let segRequest = VNGeneratePersonSegmentationRequest()
    segRequest.qualityLevel = quality == "accurate" ? .accurate : .balanced
    segRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8

    let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    var frameCount = 0

    while reader.status == .reading {
        guard let sampleBuffer = readerOutput.copyNextSampleBuffer() else { break }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        try handler.perform([segRequest])

        while !writerInput.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.002)
        }

        if let maskBuffer = segRequest.results?.first?.pixelBuffer {
            let maskCI = CIImage(cvPixelBuffer: maskBuffer)
            let scaleX = CGFloat(width) / maskCI.extent.width
            let scaleY = CGFloat(height) / maskCI.extent.height
            let scaledMask = maskCI.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

            var outBuffer: CVPixelBuffer?
            if let pool = adaptor.pixelBufferPool {
                CVPixelBufferPoolCreatePixelBuffer(nil, pool, &outBuffer)
            }
            if let dst = outBuffer {
                ciContext.render(scaledMask, to: dst)
                adaptor.append(dst, withPresentationTime: pts)
                frameCount += 1
            }
        }
    }

    writerInput.markAsFinished()
    let finishSem = DispatchSemaphore(value: 0)
    writer.finishWriting {
        finishSem.signal()
    }
    finishSem.wait()

    print("{\"ok\":true,\"frames\":\(frameCount),\"output\":\"\(outputPath)\"}")
}

struct TextOverlaySpec: Codable {
    let text: String
    let width: Int
    let height: Int
    let fontSize: CGFloat
    let colorHex: String
    let strokeHex: String
    let strokeWidth: CGFloat
    let activeWordIndex: Int?
    let activeColorHex: String?
}

func cgColorFromHex(_ hex: String) -> CGColor {
    let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: clean).scanHexInt64(&int)
    let r, g, b, a: CGFloat
    if clean.count == 8 {
        r = CGFloat((int >> 24) & 0xFF) / 255.0
        g = CGFloat((int >> 16) & 0xFF) / 255.0
        b = CGFloat((int >> 8) & 0xFF) / 255.0
        a = CGFloat(int & 0xFF) / 255.0
    } else if clean.count == 6 {
        r = CGFloat((int >> 16) & 0xFF) / 255.0
        g = CGFloat((int >> 8) & 0xFF) / 255.0
        b = CGFloat(int & 0xFF) / 255.0
        a = 1.0
    } else {
        r = 1; g = 1; b = 1; a = 1
    }
    return CGColor(colorSpace: CGColorSpaceCreateDeviceRGB(), components: [r, g, b, a])!
}

func runRenderTextPng(specPath: String, outputPngPath: String) throws {
    let data = try Data(contentsOf: URL(fileURLWithPath: specPath))
    let spec = try JSONDecoder().decode(TextOverlaySpec.self, from: data)
    let w = max(64, spec.width)
    let h = max(64, spec.height)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
        data: nil,
        width: w,
        height: h,
        bitsPerComponent: 8,
        bytesPerRow: w * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        throw NSError(domain: "tcapcut-vision", code: 6, userInfo: [NSLocalizedDescriptionKey: "Failed to create CGContext"])
    }
    ctx.clear(CGRect(x: 0, y: 0, width: w, height: h))

    let font = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, max(16, spec.fontSize), nil)
    let baseColor = cgColorFromHex(spec.colorHex)
    let activeColor = cgColorFromHex(spec.activeColorHex ?? "#FFD60A")
    let strokeColor = cgColorFromHex(spec.strokeHex)

    let attr = NSMutableAttributedString(string: spec.text, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): baseColor,
        NSAttributedString.Key(kCTStrokeColorAttributeName as String): strokeColor,
        NSAttributedString.Key(kCTStrokeWidthAttributeName as String): -abs(spec.strokeWidth)
    ])

    if let idx = spec.activeWordIndex {
        let words = spec.text.split(separator: " ", omittingEmptySubsequences: false)
        var offset = 0
        for (wi, word) in words.enumerated() {
            let len = word.count
            if wi == idx && offset + len <= spec.text.count {
                attr.addAttribute(
                    NSAttributedString.Key(kCTForegroundColorAttributeName as String),
                    value: activeColor,
                    range: NSRange(location: offset, length: len)
                )
            }
            offset += len + 1
        }
    }

    let line = CTLineCreateWithAttributedString(attr)
    let bounds = CTLineGetBoundsWithOptions(line, .useOpticalBounds)
    let drawX = max(12.0, (CGFloat(w) - bounds.width) * 0.5)
    let drawY = max(12.0, (CGFloat(h) - bounds.height) * 0.5 - bounds.minY)

    // Subtle dark glass pill behind text
    let pillRect = CGRect(
        x: drawX - 24,
        y: drawY + bounds.minY - 12,
        width: bounds.width + 48,
        height: bounds.height + 24
    )
    let pillPath = CGPath(roundedRect: pillRect, cornerWidth: 16, cornerHeight: 16, transform: nil)
    ctx.setFillColor(CGColor(red: 0.04, green: 0.06, blue: 0.1, alpha: 0.58))
    ctx.addPath(pillPath)
    ctx.fillPath()

    ctx.textPosition = CGPoint(x: drawX, y: drawY)
    CTLineDraw(line, ctx)

    guard let image = ctx.makeImage(),
          let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outputPngPath) as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        throw NSError(domain: "tcapcut-vision", code: 7, userInfo: [NSLocalizedDescriptionKey: "Failed to encode PNG"])
    }
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
    print("{\"ok\":true,\"output\":\"\(outputPngPath)\"}")
}

func runTranscribeSpeech(inputPath: String, localeId: String, outputJsonPath: String) throws {
    guard Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") != nil else {
        throw NSError(domain: "tcapcut-vision", code: 9, userInfo: [NSLocalizedDescriptionKey: "NSSpeechRecognitionUsageDescription missing from binary Info.plist"])
    }
    let status = SFSpeechRecognizer.authorizationStatus()
    if status == .notDetermined {
        let authSem = DispatchSemaphore(value: 0)
        var granted = false
        SFSpeechRecognizer.requestAuthorization { s in
            granted = (s == .authorized)
            authSem.signal()
        }
        _ = authSem.wait(timeout: .now() + 8)
        if !granted {
            throw NSError(domain: "tcapcut-vision", code: 10, userInfo: [NSLocalizedDescriptionKey: "Speech recognition authorization denied"])
        }
    } else if status != .authorized {
        throw NSError(domain: "tcapcut-vision", code: 11, userInfo: [NSLocalizedDescriptionKey: "Speech recognition not authorized (status=\(status.rawValue))"])
    }

    let locale = localeId == "vi" ? "vi-VN" : (localeId == "en" ? "en-US" : localeId)
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.isAvailable else {
        throw NSError(domain: "tcapcut-vision", code: 12, userInfo: [NSLocalizedDescriptionKey: "SFSpeechRecognizer unavailable for locale \(locale)"])
    }

    let req = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: inputPath))
    req.shouldReportPartialResults = false
    if recognizer.supportsOnDeviceRecognition {
        req.requiresOnDeviceRecognition = true
    }

    let recSem = DispatchSemaphore(value: 0)
    var finalText = ""
    var words: [SpeechWord] = []
    var recError: Error?

    let task = recognizer.recognitionTask(with: req) { result, error in
        if let err = error {
            recError = err
            recSem.signal()
            return
        }
        if let res = result, res.isFinal {
            finalText = res.bestTranscription.formattedString
            words = res.bestTranscription.segments.map { seg in
                let startUs = Int64(seg.timestamp * 1_000_000.0)
                let durUs = max(50_000, Int64(seg.duration * 1_000_000.0))
                return SpeechWord(
                    text: seg.substring,
                    startUs: startUs,
                    endUs: startUs + durUs,
                    confidence: seg.confidence
                )
            }
            recSem.signal()
        }
    }

    let waitRes = recSem.wait(timeout: .now() + 60)
    if waitRes == .timedOut {
        task.cancel()
        throw NSError(domain: "tcapcut-vision", code: 13, userInfo: [NSLocalizedDescriptionKey: "Speech recognition timed out"])
    }
    if let err = recError, words.isEmpty {
        throw err
    }

    // Group words into natural caption chunks (max 7 words or >600ms pause)
    var segments: [SpeechSegment] = []
    var chunk: [SpeechWord] = []
    for (idx, w) in words.enumerated() {
        if let prev = chunk.last, (chunk.count >= 7 || (w.startUs - prev.endUs) > 650_000) {
            segments.append(SpeechSegment(
                id: "seg_sf_\(segments.count)",
                startUs: chunk.first!.startUs,
                endUs: chunk.last!.endUs,
                text: chunk.map(\.text).joined(separator: " "),
                words: chunk
            ))
            chunk = []
        }
        chunk.append(w)
        if idx == words.count - 1 && !chunk.isEmpty {
            segments.append(SpeechSegment(
                id: "seg_sf_\(segments.count)",
                startUs: chunk.first!.startUs,
                endUs: chunk.last!.endUs,
                text: chunk.map(\.text).joined(separator: " "),
                words: chunk
            ))
        }
    }
    if segments.isEmpty && !finalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        segments.append(SpeechSegment(
            id: "seg_sf_0",
            startUs: 0,
            endUs: 3_000_000,
            text: finalText,
            words: []
        ))
    }

    let report = SpeechReport(engine: "apple-speech", locale: locale, segments: segments)
    let data = try JSONEncoder().encode(report)
    try data.write(to: URL(fileURLWithPath: outputJsonPath))
    print("{\"ok\":true,\"segments\":\(segments.count)}")
}

let args = CommandLine.arguments
if args.count < 2 {
    fputs("Usage: tcapcut-vision <benchmark|face-track|person-matting> ...\n", stderr)
    exit(1)
}

do {
    switch args[1] {
    case "benchmark":
        runBenchmark()
    case "face-track":
        guard args.count >= 4 else {
            fputs("Usage: tcapcut-vision face-track <input> <output.json>\n", stderr)
            exit(1)
        }
        try runFaceTrack(inputPath: args[2], outputPath: args[3])
    case "person-matting":
        guard args.count >= 4 else {
            fputs("Usage: tcapcut-vision person-matting <input> <output_mask.mp4> [balanced|accurate]\n", stderr)
            exit(1)
        }
        let q = args.count >= 5 ? args[4] : "balanced"
        try runPersonMatting(inputPath: args[2], outputPath: args[3], quality: q)
    case "render-text-png":
        guard args.count >= 4 else {
            fputs("Usage: tcapcut-vision render-text-png <spec.json> <output.png>\n", stderr)
            exit(1)
        }
        try runRenderTextPng(specPath: args[2], outputPngPath: args[3])
    case "transcribe-speech":
        guard args.count >= 5 else {
            fputs("Usage: tcapcut-vision transcribe-speech <input> <locale> <output.json>\n", stderr)
            exit(1)
        }
        try runTranscribeSpeech(inputPath: args[2], localeId: args[3], outputJsonPath: args[4])
    default:
        fputs("Unknown command: \(args[1])\n", stderr)
        exit(1)
    }
} catch {
    fputs("Error: \(error.localizedDescription)\n", stderr)
    exit(2)
}
