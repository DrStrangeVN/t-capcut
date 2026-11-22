import Cocoa
import WebKit
import Darwin
import Security

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var engineProcess: Process?
    var enginePort: Int = 47890
    var sessionToken: String = ""
    private var stdoutBuffer = Data()
    private var pageLoaded = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        elevateFileDescriptorLimit()
        setupMainMenu()
        sessionToken = generateRandomHexToken(byteCount: 24)

        let args = CommandLine.arguments
        let devMode = args.contains("--dev")

        let frame = NSRect(x: 0, y: 0, width: 1500, height: 940)
        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "T-CapCut"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.minSize = NSSize(width: 1120, height: 720)
        window.center()

        let backdropView: NSView
        if #available(macOS 26.0, *) {
            #if compiler(>=6.2)
            let glass = NSGlassEffectView(frame: frame)
            glass.autoresizingMask = [.width, .height]
            glass.cornerRadius = 16
            backdropView = glass
            #else
            backdropView = makeLegacyVibrancyView(frame: frame)
            #endif
        } else {
            backdropView = makeLegacyVibrancyView(frame: frame)
        }

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []

        let contentController = config.userContentController
        contentController.add(self, name: "tcapcutNative")

        let bootstrapJs = """
        window.__TCAPCUT_NATIVE__ = { platform: 'macos', titlebarInsetLeft: 78 };
        window.__TCAPCUT_TOKEN__ = \(jsonLiteral(sessionToken));
        window.__tcapcutPickResolvers = {};
        window.tcapcutNative = {
          pickLocalFiles: function() {
            return new Promise(function(resolve) {
              var cid = 'pick_' + Date.now() + '_' + Math.random();
              window.__tcapcutPickResolvers[cid] = resolve;
              window.webkit.messageHandlers.tcapcutNative.postMessage({ action: 'pickLocalFiles', callbackId: cid });
            });
          },
          revealInFinder: function(path) {
            window.webkit.messageHandlers.tcapcutNative.postMessage({ action: 'revealInFinder', path: path });
          }
        };
        """
        contentController.addUserScript(WKUserScript(source: bootstrapJs, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView = WKWebView(frame: frame, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.uiDelegate = self

        backdropView.addSubview(webView)
        window.contentView = backdropView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        if devMode {
            loadUrl("http://127.0.0.1:5173")
        } else {
            launchLocalEngine()
        }
    }

    private func makeLegacyVibrancyView(frame: NSRect) -> NSView {
        let vibrancy = NSVisualEffectView(frame: frame)
        vibrancy.autoresizingMask = [.width, .height]
        vibrancy.blendingMode = .behindWindow
        vibrancy.material = .hudWindow
        vibrancy.state = .active
        vibrancy.wantsLayer = true
        return vibrancy
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let proc = engineProcess, proc.isRunning {
            proc.terminate()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    // MARK: - WKUIDelegate (Native NSOpenPanel & JS Dialogs)

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "T-CapCut"
        alert.informativeText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "T-CapCut"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Hủy")
        alert.beginSheetModal(for: window) { resp in completionHandler(resp == .alertFirstButtonReturn) }
    }

    // MARK: - WKScriptMessageHandler (Zero-Copy Local File Import + Finder Reveal)

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if action == "pickLocalFiles", let callbackId = body["callbackId"] as? String {
            let panel = NSOpenPanel()
            panel.canChooseFiles = true
            panel.allowsMultipleSelection = true
            panel.beginSheetModal(for: window) { [weak self] resp in
                let paths = resp == .OK ? panel.urls.map(\.path) : []
                let pathsJson = self?.jsonArrayLiteral(paths) ?? "[]"
                let js = "if(window.__tcapcutPickResolvers[\(self?.jsonLiteral(callbackId) ?? "''")]){window.__tcapcutPickResolvers[\(self?.jsonLiteral(callbackId) ?? "''")](\(pathsJson));delete window.__tcapcutPickResolvers[\(self?.jsonLiteral(callbackId) ?? "''")];}"
                DispatchQueue.main.async {
                    self?.webView.evaluateJavaScript(js, completionHandler: nil)
                }
            }
        } else if action == "revealInFinder", let path = body["path"] as? String {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
        }
    }

    // MARK: - Helpers

    private func jsonLiteral(_ value: String) -> String {
        guard let data = try? JSONEncoder().encode(value), let str = String(data: data, encoding: .utf8) else {
            return "\"\""
        }
        return str
    }

    private func jsonArrayLiteral(_ values: [String]) -> String {
        guard let data = try? JSONEncoder().encode(values), let str = String(data: data, encoding: .utf8) else {
            return "[]"
        }
        return str
    }

    private func generateRandomHexToken(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        _ = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private func elevateFileDescriptorLimit() {
        var lim = rlimit()
        if getrlimit(RLIMIT_NOFILE, &lim) == 0 && lim.rlim_cur < 8192 {
            lim.rlim_cur = min(lim.rlim_max, 8192)
            setrlimit(RLIMIT_NOFILE, &lim)
        }
    }

    private func findBinary(_ name: String) -> String {
        let resourceDir = Bundle.main.resourcePath ?? FileManager.default.currentDirectoryPath
        let candidates = [
            "\(resourceDir)/bin/\(name)",
            "/opt/homebrew/bin/\(name)",
            "/usr/local/bin/\(name)",
            "/usr/bin/\(name)"
        ]
        for c in candidates where FileManager.default.isExecutableFile(atPath: c) {
            return c
        }
        return "/usr/local/bin/\(name)"
    }

    private func launchLocalEngine() {
        let resourceDir = Bundle.main.resourcePath ?? FileManager.default.currentDirectoryPath
        let engineEntry = "\(resourceDir)/engine/dist/bin.js"
        let studioDist = "\(resourceDir)/studio-dist"

        guard FileManager.default.fileExists(atPath: engineEntry) else {
            webView.loadHTMLString("<h2 style='color:white;font-family:sans-serif;padding:40px'>Engine not found at \(engineEntry)</h2>", baseURL: nil)
            return
        }

        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dataDir = appSupport.appendingPathComponent("T-CapCut").path

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: findBinary("node"))
        proc.arguments = [engineEntry]

        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "\(resourceDir)/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        env["TCAPCUT_PORT"] = "0"
        env["TCAPCUT_SESSION_TOKEN"] = sessionToken
        env["TCAPCUT_DATA_DIR"] = dataDir
        env["TCAPCUT_STUDIO_DIST"] = studioDist
        env["TCAPCUT_PRESETS_ASSETS"] = "\(resourceDir)/presets-assets"
        env["TCAPCUT_VISION_BIN"] = "\(resourceDir)/native/bin/tcapcut-vision"
        proc.environment = env

        let outPipe = Pipe()
        proc.standardOutput = outPipe
        outPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty, let self = self else { return }
            self.stdoutBuffer.append(chunk)
            guard let text = String(data: self.stdoutBuffer, encoding: .utf8) else { return }
            for line in text.components(separatedBy: .newlines) where line.hasPrefix("TCAPCUT_READY:") {
                let jsonStr = String(line.dropFirst("TCAPCUT_READY:".count))
                if let jsonData = jsonStr.data(using: .utf8),
                   let obj = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                   let port = obj["port"] as? Int {
                    self.enginePort = port
                    if !self.pageLoaded {
                        self.pageLoaded = true
                        DispatchQueue.main.async {
                            self.loadUrl("http://127.0.0.1:\(port)")
                        }
                    }
                }
            }
        }

        do {
            try proc.run()
            engineProcess = proc
        } catch {
            webView.loadHTMLString("<h2 style='color:white;font-family:sans-serif;padding:40px'>Failed to start Engine: \(error.localizedDescription)</h2>", baseURL: nil)
        }
    }

    private func loadUrl(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        webView.load(URLRequest(url: url))
    }

    private func setupMainMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit T-CapCut", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        NSApp.mainMenu = mainMenu
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
