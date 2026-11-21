import Cocoa
import WebKit
import Darwin

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var engineProcess: Process?
    var enginePort: Int = 47890

    func applicationDidFinishLaunching(_ notification: Notification) {
        elevateFileDescriptorLimit()
        setupMainMenu()

        let args = CommandLine.arguments
        let devMode = args.contains("--dev")
        if !devMode {
            launchLocalEngine()
        }

        let targetUrlStr = devMode
            ? "http://127.0.0.1:5173"
            : "http://127.0.0.1:\(enginePort)"

        let frame = NSRect(x: 0, y: 0, width: 1480, height: 920)
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

        // Native macOS Liquid Glass / Vibrancy Backdrop
        let vibrancy = NSVisualEffectView(frame: frame)
        vibrancy.autoresizingMask = [.width, .height]
        vibrancy.blendingMode = .behindWindow
        vibrancy.material = .hudWindow
        vibrancy.state = .active
        vibrancy.wantsLayer = true

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: frame, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.uiDelegate = self

        vibrancy.addSubview(webView)
        window.contentView = vibrancy
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        loadWithRetry(urlString: targetUrlStr, attemptsRemaining: 25)
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let proc = engineProcess, proc.isRunning {
            proc.terminate()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    private func elevateFileDescriptorLimit() {
        var lim = rlimit()
        if getrlimit(RLIMIT_NOFILE, &lim) == 0 && lim.rlim_cur < 8192 {
            lim.rlim_cur = min(lim.rlim_max, 8192)
            setrlimit(RLIMIT_NOFILE, &lim)
        }
    }

    private func findNodeBinary() -> String {
        let candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
        for c in candidates where FileManager.default.isExecutableFile(atPath: c) {
            return c
        }
        return "/usr/local/bin/node"
    }

    private func launchLocalEngine() {
        let resourceDir = Bundle.main.resourcePath ?? FileManager.default.currentDirectoryPath
        let engineEntry = "\(resourceDir)/engine/dist/bin.js"
        let studioDist = "\(resourceDir)/studio-dist"

        guard FileManager.default.fileExists(atPath: engineEntry) else {
            fputs("[T-CapCut] Engine entry not found at \(engineEntry)\n", stderr)
            return
        }

        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dataDir = appSupport.appendingPathComponent("T-CapCut").path

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: findNodeBinary())
        proc.arguments = [engineEntry]
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        env["TCAPCUT_PORT"] = "\(enginePort)"
        env["TCAPCUT_DATA_DIR"] = dataDir
        env["TCAPCUT_STUDIO_DIST"] = studioDist
        env["TCAPCUT_VISION_BIN"] = "\(resourceDir)/native/bin/tcapcut-vision"
        proc.environment = env

        try? proc.run()
        engineProcess = proc
    }

    private func loadWithRetry(urlString: String, attemptsRemaining: Int) {
        guard let url = URL(string: urlString) else { return }
        var req = URLRequest(url: url)
        req.timeoutInterval = 1.0

        URLSession.shared.dataTask(with: req) { [weak self] _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode < 500 {
                DispatchQueue.main.async {
                    self?.webView.load(URLRequest(url: url))
                }
            } else if attemptsRemaining > 0 {
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) {
                    self?.loadWithRetry(urlString: urlString, attemptsRemaining: attemptsRemaining - 1)
                }
            } else {
                DispatchQueue.main.async {
                    self?.webView.loadHTMLString("<h2 style='color:white;font-family:sans-serif;padding:40px'>T-CapCut Engine failed to start on \(urlString)</h2>", baseURL: nil)
                }
            }
        }.resume()
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
